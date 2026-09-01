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
  const sampleRate = Math.max(1, Number(fields.sampleRate) || 44100);
  const base = {
    kind: k,
    version: ADDITIVE_MOD_CONTROL_VERSION,
    sampleRate,
  };
  if (k === "adsr") {
    return {
      ...base,
      gate: Number(fields.gate) || 0,
      params: {
        delay: Math.max(0, Number(fields.delay) || 0),
        attack: Math.max(0, Number(fields.attack) || 0),
        decay: Math.max(0, Number(fields.decay) || 0),
        sustain: Math.max(0, Math.min(1, Number(fields.sustain) || 0)),
        release: Math.max(0, Number(fields.release) || 0),
        attackShape: Math.max(1e-9, Number(fields.attackShape) || 0.3),
        releaseShape: Math.max(1e-9, Number(fields.releaseShape) || 1e-4),
        level: Number(fields.level) || 1,
        loop: Number(fields.loop) || 0,
        updateOnTrigger: Number(fields.updateOnTrigger) || 0,
      },
      state: fields.state && typeof fields.state === "object"
        ? fields.state
        : (typeof createNodeGraphExpAdsrState === "function"
          ? createNodeGraphExpAdsrState()
          : { lastGate: 0, out: 0, secondsPassed: 0, state: "off", latchedParams: null }),
    };
  }
  if (k === "pluck") {
    // Param keys match gold pluckEnvelope / nodeGraphPluckEnvelopeSample.
    return {
      ...base,
      trigger: Number(fields.trigger) || 0,
      release: Number(fields.release) || 0,
      params: {
        delayTime: Math.max(0, Number(fields.delayTime) || 0),
        // Allow 0 attack (instant peak) — do not coalesce 0 → default.
        attackFeedback: Math.max(
          0,
          Number.isFinite(Number(fields.attackFeedback))
            ? Number(fields.attackFeedback)
            : 0.002,
        ),
        decay: Math.max(
          0.1,
          Math.min(
            1,
            Number.isFinite(Number(fields.decay)) ? Number(fields.decay) : 0.35,
          ),
        ),
        decayModStart: Number.isFinite(Number(fields.decayModStart))
          ? Number(fields.decayModStart)
          : 0.08,
        decayModEnd: Number.isFinite(Number(fields.decayModEnd))
          ? Number(fields.decayModEnd)
          : 0.55,
        endingDecay: Number.isFinite(Number(fields.endingDecay))
          ? Number(fields.endingDecay)
          : 0.8,
        decayModCurve: Number.isFinite(Number(fields.decayModCurve))
          ? Number(fields.decayModCurve)
          : 0,
        decayModFrequency: Number.isFinite(Number(fields.decayModFrequency))
          ? Number(fields.decayModFrequency)
          : 1.5,
        releaseFeedback: Number.isFinite(Number(fields.releaseFeedback))
          ? Number(fields.releaseFeedback)
          : 0.35,
        autoReleaseTime: Math.max(
          0,
          Number.isFinite(Number(fields.autoReleaseTime))
            ? Number(fields.autoReleaseTime)
            : 0.08,
        ),
        velocity: Number.isFinite(Number(fields.velocity))
          ? Number(fields.velocity)
          : 1,
        velocitySensitivity: Number.isFinite(Number(fields.velocitySensitivity))
          ? Number(fields.velocitySensitivity)
          : 0,
        level: Number.isFinite(Number(fields.level)) ? Number(fields.level) : 1,
      },
      state: fields.state && typeof fields.state === "object"
        ? fields.state
        : (typeof createNodeGraphPluckEnvelopeState === "function"
          ? createNodeGraphPluckEnvelopeState()
          : {
            autoReleasePhasor: 0,
            currentValue: 0,
            decayIncrement: 0,
            lastRelease: 0,
            lastTrigger: 0,
            phasor: 0,
            releaseIncrement: 0,
            secondsPassed: 0,
            state: "off",
          }),
    };
  }
  if (k === "robin") {
    return {
      ...base,
      frequency: Number(fields.frequency) || 0,
      amplitude: Number(fields.amplitude) || 1,
      phase: Number(fields.phase) || 0, // cycles at block start
      bipolar: Number(fields.bipolar) >= 0.5,
    };
  }
  // scalar — already 0…1 (or set mapToUnipolar)
  return {
    ...base,
    kind: "scalar",
    value: Number(fields.value) || 0,
    mapToUnipolar: fields.mapToUnipolar !== false,
  };
}

function additiveModControlStepAdsr(control) {
  const state = control.state;
  const gate = Number(control.gate) || 0;
  const live = control.params || {};
  const params = typeof nodeGraphExpAdsrParamsForSample === "function"
    ? nodeGraphExpAdsrParamsForSample(state, gate, live, live.updateOnTrigger)
    : live;
  if (typeof nodeGraphExpAdsrCore !== "function") return 0;
  return nodeGraphExpAdsrCore(state, gate, params, control.sampleRate);
}

function additiveModControlStepPluck(control) {
  const state = control.state;
  const trigger = Number(control.trigger) || 0;
  const release = Number(control.release) || 0;
  const params = control.params || {};
  if (typeof nodeGraphPluckEnvelopeSample === "function") {
    return nodeGraphPluckEnvelopeSample(state, trigger, release, params, control.sampleRate);
  }
  return 0;
}

function additiveModControlRobinAt(control, sampleIndex) {
  const sr = Math.max(1, Number(control.sampleRate) || 44100);
  const f = Number(control.frequency) || 0;
  const amp = Number(control.amplitude) || 0;
  const phase0 = Number(control.phase) || 0;
  const i = Math.max(0, sampleIndex | 0);
  const x = Math.sin((phase0 + (f * i) / sr) * Math.PI * 2) * amp;
  if (control.bipolar) return additiveModControlClamp01(0.5 + 0.5 * x);
  return additiveModControlClamp01(Math.abs(x));
}

/**
 * Evaluate control at sample index within the block (0 … blockFrames-1).
 * For adsr/pluck: clones block-start state and advances 0..index (O(index)).
 * Prefer additiveModControlBakeStrip for full-block consumers.
 */
function additiveModControlValueAt(control, sampleIndex, blockFrames = 128) {
  if (!control || typeof control !== "object") return 0;
  const kind = String(control.kind || "");
  const i = Math.max(0, sampleIndex | 0);
  if (kind === "scalar") {
    const v = Number(control.value) || 0;
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
  if (kind === "pluck") {
    const work = {
      ...control,
      state: additiveModControlCloneState(control.state),
    };
    let out = 0;
    for (let s = 0; s <= i; s += 1) out = additiveModControlStepPluck(work);
    return additiveModControlClamp01(out);
  }
  return 0;
}

/**
 * Bake N samples and advance publisher state to end-of-block (adsr/pluck).
 * Returns Float32Array length N in ~0…1. Mutates control.state for continuity.
 */
function additiveModControlBakeStrip(control, blockFrames = 128) {
  const N = Math.max(1, blockFrames | 0);
  const strip = new Float32Array(N);
  if (!control || typeof control !== "object") return strip;
  const kind = String(control.kind || "");
  if (kind === "scalar") {
    const v = control.mapToUnipolar === false
      ? (Number(control.value) || 0)
      : additiveModControlClamp01(control.value);
    strip.fill(v);
    return strip;
  }
  if (kind === "robin") {
    for (let i = 0; i < N; i += 1) strip[i] = additiveModControlRobinAt(control, i);
    // Advance phase for next quantum continuity.
    const sr = Math.max(1, Number(control.sampleRate) || 44100);
    const f = Number(control.frequency) || 0;
    control.phase = (Number(control.phase) || 0) + (f * N) / sr;
    control.phase -= Math.floor(control.phase);
    return strip;
  }
  if (kind === "adsr") {
    for (let i = 0; i < N; i += 1) {
      strip[i] = additiveModControlClamp01(additiveModControlStepAdsr(control));
    }
    return strip;
  }
  if (kind === "pluck") {
    for (let i = 0; i < N; i += 1) {
      strip[i] = additiveModControlClamp01(additiveModControlStepPluck(control));
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
    || t === "pluckEnvelopeMod"
    || t === "additiveCurveEnvelope"
    || t === "additivePluckEnvelope"
    || t === "additiveSinMod"
    || t === "additiveKnob"
    // Gold pluck on efficient allowlist can also publish Additive packets.
    || t === "pluckEnvelope"
  );
}
