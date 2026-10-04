// GPU-shaped sample-accurate mod control packets (CPU proving ground).
// Sources publish a compact recipe+state once per quantum; consumers evaluate
// f(i) per sample (or bake a length-N strip once per block).

const ADDITIVE_MOD_CONTROL_VERSION = 1;

function additiveModControlClamp01(v) {
  const n = Number(v);
  if (!(n === n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Shallow-clone envelope/pluck runtime state for per-index eval / bake. */
function additiveModControlCloneState(state) {
  if (!state || typeof state !== "object") return {};
  const out = { ...state };
  if (state.latchedParams && typeof state.latchedParams === "object") {
    out.latchedParams = { ...state.latchedParams };
  }
  return out;
}

/**
 * Build a control packet. `state` is mutable across quanta (owned by publisher).
 * @returns {object}
 */
function additiveModControlCreate(kind, fields = {}) {
  const k = String(kind || "scalar");
  const sampleRate = Math.max(1, nodeGraphFiniteNumber(fields.sampleRate, 44100));
  const base = {
    kind: k,
    version: ADDITIVE_MOD_CONTROL_VERSION,
    sampleRate,
  };
  if (k === "adsr") {
    return {
      ...base,
      gate: nodeGraphFiniteNumber(fields.gate),
      params: {
        delay: Math.max(0, nodeGraphFiniteNumber(fields.delay)),
        attack: Math.max(0, nodeGraphFiniteNumber(fields.attack)),
        decay: Math.max(0, nodeGraphFiniteNumber(fields.decay)),
        sustain: Math.max(0, Math.min(1, nodeGraphFiniteNumber(fields.sustain))),
        release: Math.max(0, nodeGraphFiniteNumber(fields.release)),
        attackShape: nodeGraphFiniteNumber(fields.attackShape),
        releaseShape: nodeGraphFiniteNumber(fields.releaseShape),
        level: nodeGraphFiniteNumber(fields.level, 1),
        loop: nodeGraphFiniteNumber(fields.loop),
        updateOnTrigger: nodeGraphFiniteNumber(fields.updateOnTrigger),
      },
      state: fields.state && typeof fields.state === "object"
        ? fields.state
        : (typeof createNodeGraphExpAdsrState === "function"
          ? createNodeGraphExpAdsrState()
          : { lastGate: 0, out: 0, secondsPassed: 0, state: "off", latchedParams: null }),
    };
  }
  if (k === "robin") {
    return {
      ...base,
      frequency: nodeGraphFiniteNumber(fields.frequency),
      amplitude: nodeGraphFiniteNumber(fields.amplitude, 1),
      phase: nodeGraphFiniteNumber(fields.phase), // cycles at block start
      bipolar: Number(fields.bipolar) >= 0.5,
    };
  }
  // scalar — already 0…1 (or set mapToUnipolar)
  return {
    ...base,
    kind: "scalar",
    value: nodeGraphFiniteNumber(fields.value),
    mapToUnipolar: fields.mapToUnipolar !== false,
  };
}

function additiveModControlStepAdsr(control) {
  const state = control.state;
  const gate = nodeGraphFiniteNumber(control.gate);
  const live = control.params || {};
  const params = typeof nodeGraphExpAdsrParamsForSample === "function"
    ? nodeGraphExpAdsrParamsForSample(state, gate, live, live.updateOnTrigger)
    : live;
  if (typeof nodeGraphExpAdsrCore !== "function") return 0;
  return nodeGraphExpAdsrCore(state, gate, params, control.sampleRate);
}


function additiveModControlRobinAt(control, sampleIndex) {
  const sr = Math.max(1, nodeGraphFiniteNumber(control.sampleRate, 44100));
  const f = nodeGraphFiniteNumber(control.frequency);
  const amp = nodeGraphFiniteNumber(control.amplitude);
  const phase0 = nodeGraphFiniteNumber(control.phase);
  const i = Math.max(0, sampleIndex | 0);
  const x = Math.sin((phase0 + (f * i) / sr) * Math.PI * 2) * amp;
  if (control.bipolar) return additiveModControlClamp01(0.5 + 0.5 * x);
  return additiveModControlClamp01(Math.abs(x));
}

/**
 * Evaluate control at sample index within the block (0 … blockFrames-1).
 * For adsr: clones block-start state and advances 0..index (O(index)).
 * Prefer additiveModControlBakeStrip for full-block consumers.
 */
function additiveModControlValueAt(control, sampleIndex, blockFrames = 128) {
  if (!control || typeof control !== "object") return 0;
  const kind = String(control.kind || "");
  const i = Math.max(0, sampleIndex | 0);
  if (kind === "scalar") {
    const v = nodeGraphFiniteNumber(control.value);
    return control.mapToUnipolar === false ? v : additiveModControlClamp01(v);
  }
  if (kind === "robin") {
    return additiveModControlRobinAt(control, i);
  }
  if (kind === "adsr") {
    const work = {
      ...control,
      state: additiveModControlCloneState(control.state),
    };
    let out = 0;
    for (let s = 0; s <= i; s += 1) out = additiveModControlStepAdsr(work);
    return additiveModControlClamp01(out);
  }
  return 0;
}

/**
 * Bake N samples and advance publisher state to end-of-block (adsr).
 * Returns Float32Array length N in ~0…1. Mutates control.state for continuity.
 */
function additiveModControlBakeStrip(control, blockFrames = 128) {
  const N = Math.max(1, blockFrames | 0);
  const strip = new Float32Array(N);
  if (!control || typeof control !== "object") return strip;
  const kind = String(control.kind || "");
  if (kind === "scalar") {
    const v = control.mapToUnipolar === false
      ? (nodeGraphFiniteNumber(control.value))
      : additiveModControlClamp01(control.value);
    strip.fill(v);
    return strip;
  }
  if (kind === "robin") {
    for (let i = 0; i < N; i += 1) strip[i] = additiveModControlRobinAt(control, i);
    // Advance phase for next quantum continuity.
    const sr = Math.max(1, nodeGraphFiniteNumber(control.sampleRate, 44100));
    const f = nodeGraphFiniteNumber(control.frequency);
    control.phase = (nodeGraphFiniteNumber(control.phase)) + (f * N) / sr;
    control.phase -= Math.floor(control.phase);
    return strip;
  }
  if (kind === "adsr") {
    for (let i = 0; i < N; i += 1) {
      strip[i] = additiveModControlClamp01(additiveModControlStepAdsr(control));
    }
    return strip;
  }
  return strip;
}

/**
 * True if this mod source node type publishes sample-accurate control packets.
 */
function additiveModControlIsPacketSourceType(type) {
  const t = String(type || "");
  return (
    t === "curveEnvelopeMod"
    || t === "additiveCurveEnvelope"
    || t === "additiveSinMod"
    || t === "additiveKnob"
  );
}
