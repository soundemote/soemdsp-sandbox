// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphExpAdsrCalcCoef(rate, targetRatio) {
  const safeRate = Math.max(0, Number(rate) || 0);
  const safeRatio = Math.max(0.000000001, Number(targetRatio) || 0.000000001);
  return safeRate <= 0 ? 0 : Math.exp(-Math.log((1 + safeRatio) / safeRatio) / safeRate);
}

function nodeGraphExpAdsrTriggerAttack(state, delay, attack, sampleRate) {
  const period = 1 / Math.max(1, sampleRate);
  if (delay < period) {
    if (attack <= period) {
      state.state = "decay";
      state.out = 1;
    } else {
      state.state = "attack";
    }
    return;
  }
  if (state.out <= 0.000001) {
    state.out = 0;
    state.secondsPassed = 0;
  }
  state.state = "delay";
}


function createNodeGraphExpAdsrState() {
  return {
    lastGate: 0,
    out: 0,
    secondsPassed: 0,
    state: "off",
  };
}

function nodeGraphExpAdsrSample(state, gate, params, sampleRate, runtime = null, nodeId = "") {
  const safeGate = nodeGraphSafeFilterNumber(gate, runtime, nodeId, null, "exp adsr gate");
  const delay = Math.max(0, nodeGraphSafeFilterNumber(params.delay, runtime, nodeId, null, "exp adsr delay"));
  const attack = Math.max(0, nodeGraphSafeFilterNumber(params.attack, runtime, nodeId, null, "exp adsr attack"));
  const decay = Math.max(0, nodeGraphSafeFilterNumber(params.decay, runtime, nodeId, null, "exp adsr decay"));
  const sustain = clampNodeSliderValue(
    nodeGraphSafeFilterNumber(params.sustain, runtime, nodeId, null, "exp adsr sustain"),
    0,
    1,
  );
  const release = Math.max(0, nodeGraphSafeFilterNumber(params.release, runtime, nodeId, null, "exp adsr release"));
  const attackShape = Math.max(0.000000001, nodeGraphSafeFilterNumber(params.attackShape, runtime, nodeId, null, "exp adsr attack shape"));
  const releaseShape = Math.max(0.000000001, nodeGraphSafeFilterNumber(params.releaseShape, runtime, nodeId, null, "exp adsr release shape"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "exp adsr level");
  const looping = nodeGraphSafeFilterNumber(params.loop, runtime, nodeId, null, "exp adsr loop") >= 0.5;
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const period = 1 / rate;

  if (state.lastGate <= 0 && safeGate > 0) {
    nodeGraphExpAdsrTriggerAttack(state, delay, attack, rate);
  } else if (state.lastGate > 0 && safeGate <= 0) {
    state.state = "release";
  }
  state.lastGate = safeGate;

  const attackCoef = nodeGraphExpAdsrCalcCoef(attack * rate, attackShape);
  const decayCoef = nodeGraphExpAdsrCalcCoef(decay * rate, releaseShape);
  const releaseCoef = nodeGraphExpAdsrCalcCoef(release * rate, releaseShape);
  const attackBase = (1 + attackShape) * (1 - attackCoef);
  const decayBase = (sustain - releaseShape) * (1 - decayCoef);
  const releaseBase = -releaseShape * (1 - releaseCoef);

  switch (state.state) {
    case "delay":
      state.secondsPassed += period;
      if (state.secondsPassed >= delay) {
        state.state = attack <= period ? "decay" : "attack";
        state.secondsPassed = 0;
        if (attack <= period) {
          state.out = 1;
        }
      }
      break;
    case "attack":
      state.out = attackBase + state.out * attackCoef;
      if (state.out >= 1) {
        state.out = 1;
        state.state = "decay";
      }
      break;
    case "decay":
      state.out = decayBase + state.out * decayCoef;
      if (state.out <= sustain) {
        state.out = sustain;
        state.state = "sustain";
      }
      break;
    case "sustain":
      state.out = sustain;
      if (looping) {
        nodeGraphExpAdsrTriggerAttack(state, delay, attack, rate);
      }
      break;
    case "release":
      state.out = releaseBase + state.out * releaseCoef;
      if (state.out <= 0) {
        state.out = 0;
        state.state = "off";
      }
      break;
    case "off":
    default:
      state.out = 0;
      break;
  }

  return nodeGraphSafeFilterNumber(state.out * level, runtime, nodeId, null, "exp adsr output");
}


// Registers the offline/render-time dispatch handler for expAdsr into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.expAdsr = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.expAdsrStates.get(nodeId) || createNodeGraphExpAdsrState();
  runtime.expAdsrStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphExpAdsrSample(
    state,
    mixInput(nodeId, "Gate"),
    {
      attack: read("attack", 0.08),
      attackShape: read("attackShape", 0.3),
      decay: read("decay", 0.22),
      delay: read("delay", 0),
      level: read("level", 1),
      loop: read("loop", 0),
      release: read("release", 0.45),
      releaseShape: read("releaseShape", 0.0001),
      sustain: read("sustain", 0.55),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
