// Speaker Protector 2.0 — stereo-linked VCA only. Never clips or knees.
// High load (raw |peak| ≥ 1 or 1 kHz HP ≥ +6 dB) → fast slew gain to 0
// → hold 0.333 s → slow slew back to 1.
// While |peak| > 1, gain is also capped at 1/peak so the waveform is scaled,
// not flattened. Shared by the patch module and the always-on Output bus.

var NODE_GRAPH_SPEAKER_PROTECTOR2_HP_HZ = 1000;
var NODE_GRAPH_SPEAKER_PROTECTOR2_THRESHOLD = 10 ** (6 / 20);
var NODE_GRAPH_SPEAKER_PROTECTOR2_DROP_SECONDS = 0.008;
var NODE_GRAPH_SPEAKER_PROTECTOR2_HOLD_SECONDS = 0.333;
var NODE_GRAPH_SPEAKER_PROTECTOR2_RISE_SECONDS = 0.75;
var NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_IDLE = "idle";
var NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_DROP = "drop";
var NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_HOLD = "hold";
var NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_RISE = "rise";

function nodeGraphSpeakerProtector2HpCoeffs(sampleRate, frequencyHz) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const frequencyValue = Math.max(0, Number(frequencyHz) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 0.5 * (1 + a1);
  return { a1, b0, b1: -b0 };
}

function createNodeGraphSpeakerProtector2State(sampleRate = 44100) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const hp = nodeGraphSpeakerProtector2HpCoeffs(rate, NODE_GRAPH_SPEAKER_PROTECTOR2_HP_HZ);
  return {
    mode: NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_IDLE,
    gain: 1,
    holdSamples: 0,
    hpIn: 0,
    hpOut: 0,
    hpA1: hp.a1,
    hpB0: hp.b0,
    hpB1: hp.b1,
    sampleRate: rate,
  };
}

function nodeGraphSpeakerProtector2Prepare(state, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  if (!state) {
    return createNodeGraphSpeakerProtector2State(rate);
  }
  if (state.sampleRate !== rate) {
    const hp = nodeGraphSpeakerProtector2HpCoeffs(rate, NODE_GRAPH_SPEAKER_PROTECTOR2_HP_HZ);
    state.sampleRate = rate;
    state.hpA1 = hp.a1;
    state.hpB0 = hp.b0;
    state.hpB1 = hp.b1;
  }
  return state;
}

function nodeGraphSpeakerProtector2SlewToward(gain, target, seconds, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const time = Math.max(0, Number(seconds) || 0);
  if (time <= 0) {
    return target;
  }
  const maxStep = 1 / Math.max(1, time * rate);
  const delta = target - gain;
  if (Math.abs(delta) <= maxStep) {
    return target;
  }
  return gain + (delta < 0 ? -maxStep : maxStep);
}

/**
 * @returns {{ left: number, right: number, Out: number, gain: number, engaged: boolean, muted: boolean, mode: string, danger: boolean }}
 */
function nodeGraphSpeakerProtector2Protect(state, left, right, sampleRate, options = {}) {
  const st = nodeGraphSpeakerProtector2Prepare(state, sampleRate);
  const rate = st.sampleRate;
  const dropTime = Number(options.dropSeconds);
  const holdTime = Number(options.holdSeconds);
  const riseTime = Number(options.riseSeconds);
  const dropSeconds = Number.isFinite(dropTime) && dropTime >= 0
    ? dropTime
    : NODE_GRAPH_SPEAKER_PROTECTOR2_DROP_SECONDS;
  const holdSeconds = Number.isFinite(holdTime) && holdTime >= 0
    ? holdTime
    : NODE_GRAPH_SPEAKER_PROTECTOR2_HOLD_SECONDS;
  const riseSeconds = Number.isFinite(riseTime) && riseTime >= 0
    ? riseTime
    : NODE_GRAPH_SPEAKER_PROTECTOR2_RISE_SECONDS;

  const lIn = Number(left);
  const rIn = Number(right);
  const l = Number.isFinite(lIn) ? lIn : 0;
  const r = Number.isFinite(rIn) ? rIn : 0;
  const peak = Math.max(Math.abs(l), Math.abs(r));
  const mono = (l + r) * 0.5;
  st.hpOut = st.hpB0 * mono + st.hpB1 * st.hpIn + st.hpA1 * st.hpOut;
  st.hpIn = mono;
  const hpDanger = Math.abs(st.hpOut) >= NODE_GRAPH_SPEAKER_PROTECTOR2_THRESHOLD;
  const peakDanger = peak >= 1;
  const danger = hpDanger || peakDanger || !Number.isFinite(lIn) || !Number.isFinite(rIn);
  if (danger) {
    st.mode = NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_DROP;
    st.holdSamples = Math.max(1, Math.round(holdSeconds * rate));
  }

  if (st.mode === NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_DROP) {
    st.gain = nodeGraphSpeakerProtector2SlewToward(st.gain, 0, dropSeconds, rate);
    if (st.gain <= 1e-4) {
      st.gain = 0;
      st.mode = NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_HOLD;
    }
  } else if (st.mode === NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_HOLD) {
    st.gain = 0;
    st.holdSamples -= 1;
    if (st.holdSamples <= 0) {
      st.mode = NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_RISE;
    }
  } else if (st.mode === NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_RISE) {
    st.gain = nodeGraphSpeakerProtector2SlewToward(st.gain, 1, riseSeconds, rate);
    if (st.gain >= 1 - 1e-4) {
      st.gain = 1;
      st.mode = NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_IDLE;
    }
  } else {
    st.gain = 1;
    st.mode = NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_IDLE;
  }

  let g = st.gain;
  if (peak > 1) {
    const ceiling = 1 / peak;
    if (ceiling < g) {
      g = ceiling;
    }
  }
  const outL = l * g;
  const outR = r * g;
  const engaged = st.mode !== NODE_GRAPH_SPEAKER_PROTECTOR2_MODE_IDLE;
  return {
    left: outL,
    right: outR,
    Out: (outL + outR) * 0.5,
    gain: g,
    engaged,
    muted: g <= 1e-4,
    mode: st.mode,
    danger,
  };
}

function nodeGraphSpeakerProtector2Frame(state, mono, left, right, sampleRate, options) {
  const m = Number(mono) || 0;
  return nodeGraphSpeakerProtector2Protect(
    state,
    (Number(left) || 0) + m,
    (Number(right) || 0) + m,
    sampleRate,
    options,
  );
}
