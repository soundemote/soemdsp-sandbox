// Thump Envelope — face PreviewCurve helpers (native thump_envelope.cpp owns audio).
// Sustain base is always 1.0; Decay Body MOD fully owns sustain.
// Gate height at rise = velocity (old Amplitude→feedback role): softer Gate
// → lower env → less-high pluck + less into Range. Feedback amp hardcoded.
// Amplitude knob is final output trim only.
// Feedback always live; UpdateOnTrigger latches knob depths/times only.

const THUMP_BASE_DECAY = 1.5052382613562978;
const THUMP_BASE_SUSTAIN = 1;
// patches/pluck envelope 2.json — amplitude into feedback before Range.
const THUMP_FB_AMPLITUDE = 0.980691228326368;
const THUMP_RANGE_OUT = -0.14962892525665872;
const THUMP_DEFAULT_FALL = 0.8062943900342834;
const THUMP_ATTACK_SHAPE = 0.30276154850217574;
const THUMP_FB_DELAY = 128;

function createNodeGraphThumpEnvelopeState() {
  const adsr =
    typeof createNodeGraphExpAdsrState === "function"
      ? createNodeGraphExpAdsrState()
      : null;
  return {
    adsr,
    fbDelay: new Float64Array(THUMP_FB_DELAY),
    fbIdx: 0,
    lastGate: 0,
    gateVel: 1,
    latchSnapDepth: 1,
    latchBodyDepth: 10,
    latchAttack: 0,
    latchRelease: 12.824772066678985,
    latchFall: THUMP_DEFAULT_FALL,
    latchLoop: 0,
    latchLevel: THUMP_FB_AMPLITUDE,
    hasLatch: false,
  };
}

function nodeGraphThumpFoldParam(base, mod, minV, maxV) {
  const range = maxV - minV;
  let domainAdd = 0;
  let unitAdd = 0;
  if (mod > 1 || mod < -1) domainAdd = mod;
  else unitAdd = mod;
  let result = base + domainAdd;
  if (range > 0 && unitAdd !== 0) {
    const baseUnit = (base - minV) / range;
    result = minV + (baseUnit + unitAdd) * range + domainAdd;
  }
  return Math.max(minV, Math.min(maxV, result));
}

function nodeGraphThumpUiToSnapDepth(decaySnap) {
  let snapUi = Number(decaySnap);
  if (!Number.isFinite(snapUi)) snapUi = 0;
  snapUi = Math.max(0, Math.min(1, snapUi));
  return 1 - snapUi;
}

function nodeGraphThumpUiToBodyDepth(decayBody) {
  let bodyRaw = Number(decayBody);
  if (!Number.isFinite(bodyRaw)) bodyRaw = 0;
  const bodyUi = bodyRaw > 1
    ? 1 - Math.max(0, Math.min(10, bodyRaw)) / 10
    : Math.max(0, Math.min(1, bodyRaw));
  return (1 - bodyUi) * 10;
}

function nodeGraphThumpEnvelopeSample(state, gate, params, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  if (!state.adsr && typeof createNodeGraphExpAdsrState === "function") {
    state.adsr = createNodeGraphExpAdsrState();
  }
  if (!state.fbDelay || state.fbDelay.length !== THUMP_FB_DELAY) {
    state.fbDelay = new Float64Array(THUMP_FB_DELAY);
    state.fbIdx = 0;
  }

  const safeGate = Number(gate) || 0;
  const latchMode = (Number(params?.updateOnTrigger) || 0) >= 0.5;
  const rising = !(Number(state.lastGate) > 0) && safeGate > 0;

  let snapDepth = nodeGraphThumpUiToSnapDepth(params?.decaySnap);
  let bodyDepth = nodeGraphThumpUiToBodyDepth(params?.decayBody);
  let fall = Number(params?.fallCurve);
  if (!Number.isFinite(fall)) fall = THUMP_DEFAULT_FALL;
  fall = Math.max(-1, Math.min(1, fall));
  let atk = Math.max(0, Number(params?.attack) || 0);
  let rel = Math.max(0, Number(params?.release) || 12.824772066678985);
  // Amplitude = final output trim. Gate height is velocity (old Amplitude→fb).
  let outAmp = Number.isFinite(Number(params?.amplitude))
    ? Number(params.amplitude)
    : THUMP_FB_AMPLITUDE;
  let looping = Number(params?.loop) || 0;

  if (rising) {
    state.gateVel = Math.max(0, Math.min(1, safeGate));
  }

  if (latchMode) {
    if (rising || !state.hasLatch) {
      state.latchSnapDepth = snapDepth;
      state.latchBodyDepth = bodyDepth;
      state.latchAttack = atk;
      state.latchRelease = rel;
      state.latchFall = fall;
      state.latchLoop = looping;
      state.latchLevel = outAmp;
      state.hasLatch = true;
    }
    snapDepth = state.latchSnapDepth;
    bodyDepth = state.latchBodyDepth;
    atk = state.latchAttack;
    rel = state.latchRelease;
    fall = state.latchFall;
    looping = state.latchLoop;
    outAmp = state.latchLevel;
  } else {
    state.hasLatch = false;
  }
  state.lastGate = safeGate;

  const delayed = Number(state.fbDelay[state.fbIdx]) || 0;
  const rangeOut = delayed * THUMP_RANGE_OUT;
  const effDecay = nodeGraphThumpFoldParam(
    THUMP_BASE_DECAY,
    rangeOut * snapDepth,
    0,
    10,
  );
  // Sustain base permanently 1.0 — Body MOD has full control.
  const effSustain = nodeGraphThumpFoldParam(
    THUMP_BASE_SUSTAIN,
    rangeOut * bodyDepth,
    0,
    1,
  );

  const vel = Number.isFinite(state.gateVel) ? state.gateVel : 1;
  let env = 0;
  if (state.adsr && typeof nodeGraphExpAdsrSample === "function") {
    env = nodeGraphExpAdsrSample(
      state.adsr,
      gate,
      {
        delay: 0,
        attack: atk,
        attackShape: THUMP_ATTACK_SHAPE,
        decay: effDecay,
        sustain: effSustain,
        release: rel,
        releaseShape: fall,
        loop: looping,
        // Gate velocity = env level (soft Gate → less-high pluck + less fb).
        level: vel,
        updateOnTrigger: 0, // feedback always live-retargets
      },
      sampleRate,
    );
  }
  const envSafe = Number.isFinite(env) ? env : 0;

  // Hardcoded fb amp × velocity-scaled env, then Range(0…1 → 0…−0.149629).
  state.fbDelay[state.fbIdx] = Math.max(
    0,
    Math.min(1, envSafe * THUMP_FB_AMPLITUDE),
  );
  state.fbIdx = (state.fbIdx + 1) % THUMP_FB_DELAY;
  return envSafe * outAmp;
}

function nodeGraphThumpEnvelopePreviewCurve(params = {}, points = 160) {
  const attack = Math.max(0, Number(params.attack) || 0);
  const release = Math.max(0, Number(params.release) || 12.824772066678985);
  const decaySnap = Math.max(0, Math.min(1, Number(params.decaySnap) ?? 0));
  const decayBody = Math.max(0, Math.min(1, Number(params.decayBody) ?? 0));
  const fallCurve = Math.max(-1, Math.min(1, Number(params.fallCurve) ?? THUMP_DEFAULT_FALL));
  const amplitude = Math.max(0, Number(params.amplitude) ?? THUMP_FB_AMPLITUDE);
  const sr = 2000;
  const state = createNodeGraphThumpEnvelopeState();
  const n = Math.max(48, Math.round(Number(points) || 160));
  // Face window: short Gate through attack settle, then enough Release to show fall.
  // Cap the simulated Release so a 12s patch default still draws a visible tail.
  const gateHoldSec = attack > 0 ? Math.max(0.05, attack + 0.08) : 0.05;
  const releaseDraw = Math.min(Math.max(0.2, release), 1.35);
  const totalSec = Math.max(0.4, gateHoldSec + releaseDraw);
  const totalSamples = Math.max(n, Math.ceil(totalSec * sr));
  const gateHigh = Math.max(1, Math.floor(gateHoldSec * sr));
  const step = Math.max(1, Math.floor(totalSamples / n));
  const out = [];
  for (let i = 0; i < totalSamples; i += 1) {
    const y = nodeGraphThumpEnvelopeSample(
      state,
      i < gateHigh ? 1 : 0,
      {
        attack,
        release: releaseDraw,
        decaySnap,
        decayBody,
        fallCurve,
        loop: 0,
        updateOnTrigger: 0,
        // Shape only — face scales with ampView.
        amplitude: 1,
      },
      sr,
    );
    if (i % step === 0 || i === totalSamples - 1) {
      out.push({
        t: i / Math.max(1, totalSamples - 1),
        y: Math.max(0, Math.min(1, Number(y) || 0)),
      });
    }
  }
  return {
    points: out,
    total: totalSec,
    guideT: Math.min(0.95, gateHoldSec / Math.max(1e-9, totalSec)),
    ampView: Math.min(1, amplitude),
  };
}
