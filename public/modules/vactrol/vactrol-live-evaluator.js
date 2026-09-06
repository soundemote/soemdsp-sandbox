// Vactrol — offline/render optical-lag envelope (roll-your-own).

function nodeGraphVactrolEnvelopeCoefficient(seconds, sampleRate) {
  const time = Number(seconds);
  if (!Number.isFinite(time) || time <= 0) {
    return 1;
  }
  const samples = Math.max(1, time * Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100));
  return 1 - Math.exp(-1 / samples);
}

function createNodeGraphVactrolEnvelopeState() {
  return {
    out: 0,
    raw: 0,
  };
}

function nodeGraphVactrolEnvelopeSample(state, light, params, sampleRate, runtime = null, nodeId = "") {
  const safeLight = nodeGraphSafeFilterNumber(light, runtime, nodeId, null, "vactrol light");
  const attack = Math.max(0, nodeGraphSafeFilterNumber(params.attack, runtime, nodeId, null, "vactrol attack"));
  const release = Math.max(0, nodeGraphSafeFilterNumber(params.release, runtime, nodeId, null, "vactrol release"));
  const curve = Math.max(0.001, nodeGraphSafeFilterNumber(params.curve, runtime, nodeId, null, "vactrol curve"));
  const sensitivity = Math.max(0, nodeGraphSafeFilterNumber(params.sensitivity, runtime, nodeId, null, "vactrol sensitivity"));
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const target = clampNodeSliderValue(safeLight * sensitivity, 0, 1);
  const coefficient = target > state.raw
    ? nodeGraphVactrolEnvelopeCoefficient(attack, rate)
    : nodeGraphVactrolEnvelopeCoefficient(release, rate);
  state.raw += (target - state.raw) * coefficient;
  const shaped = Math.pow(clampNodeSliderValue(state.raw, 0, 1), curve);
  state.out = clampNodeSliderValue(shaped, 0, 1);
  return nodeGraphSafeFilterNumber(state.out, runtime, nodeId, null, "vactrol output");
}

if (typeof nodeGraphLiveModuleEvaluators !== "undefined" && nodeGraphLiveModuleEvaluators) {
  nodeGraphLiveModuleEvaluators.vactrol = ({
    runtime,
    node,
    nodeId,
    frame,
    frames,
    frameValues,
    mixInput,
    sampleRate,
  }) => {
    if (!runtime.vactrolEnvelopeStates) {
      runtime.vactrolEnvelopeStates = new Map();
    }
    const state = runtime.vactrolEnvelopeStates.get(nodeId) || createNodeGraphVactrolEnvelopeState();
    runtime.vactrolEnvelopeStates.set(nodeId, state);
    const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
    const out = nodeGraphVactrolEnvelopeSample(
      state,
      mixInput(nodeId, "Light"),
      {
        attack: read("attack", 0),
        curve: read("curve", 1),
        release: read("release", 0.1),
        sensitivity: read("sensitivity", 1),
      },
      sampleRate,
      runtime,
      nodeId,
    );
    const level = read("amplitude", 1);
    return out * (Number.isFinite(level) ? level : 1);
  };
}
