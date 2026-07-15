function createNodeGraphHighpassState() {
  return {
    inputBuffer: 0,
    outputBuffer: 0,
  };
}

function createNodeGraphPassiveFilterState() {
  return {
    highpass: createNodeGraphHighpassState(),
    lowpass: createNodeGraphLowpassState(),
  };
}

function createNodeGraphLadderFilterState() {
  return {
    y: [0, 0, 0, 0, 0],
  };
}

// Bundles three independent per-channel filter states (mono/left/right) so a
// stereo signal gets genuinely independent filter histories per channel
// instead of one shared (mono-summed) instance. createFn is one of this
// file's existing createNodeGraphXState functions.
// JS mirror of pi_spigot_noise.cpp's applySmoothing -- see that file for
// why a 4-stage one-pole cascade with an exponential g curve.
// JS mirror of pi_spigot_noise.cpp's applyColor -- used only when the
// fallback BBP cache is active (wasm not yet loaded or failed).
// Unlike node-live-audio-worklet-core.js, this evaluator runs on the main
// thread (module groups / offline render), which does have fetch -- so
// rather than duplicate the 333,333-sample pi-digit dataset in JS, it
// just loads the same pi_spigot_noise.wasm the worklet uses and calls
// its exports directly. See pi_spigot_noise.cpp for what that dataset is
// and why it replaced computing every sample live.
const nodeGraphPiSpigotNoiseWasm = { promise: null, exports: null, failed: false };

// Pure-JS mirror of pi_spigot_noise.cpp's BBP digit extraction -- used
// only as a fallback while the wasm dataset above is still loading (or if
// it fails to load). See the .cpp file for the math writeup and the
// cost/precision reasoning behind these constants.
const nodeGraphBadValueExplosionLimit = 999999999;
const nodeGraphBadValueDenormalLimit = 1.1754943508222875e-38;

function nodeGraphSafeFilterNumber(value, runtime, nodeId, state, source) {
  const number = Number(value);
  const reason = nodeGraphBadValueReason(number);
  if (!reason) {
    return number;
  }
  if (state) {
    state.inputBuffer = 0;
    state.outputBuffer = 0;
  }
  nodeGraphMarkRuntimeBadNumber(runtime, nodeId, `${source} ${reason}`);
  return 0;
}


// Resonant self-oscillating filter: a feedback-modulated phasor through two
// cascaded one-pole stages. Mirrors native_modules/flower_child_filter
// exactly -- see that file's header comment for the approximation note on
// the two proprietary node-based-function shaping curves.
function createNodeGraphFlowerChildFilterState() {
  return {
    phase: 0, phaseOffset: 0, stage1: 0, stage2: 0, selfMod: 0,
    rev3Feedback: 0, rev3Lpf1Y1: 0, rev3Lpf2Y1: 0,
    dsPhase: 0, dsHeld: 0,
  };
}

// Generic N-node soemdsp::utility::Graph evaluator (shape 1=RATIONAL,
// 2=EXPONENTIAL, else linear).
// Exact soemdsp::curve::Rational::get(p), p already normalized to [0,1].
// Exact soemdsp::utility::Graph::getValue for the 3-node shape this filter
// uses -- see native_modules/flower_child_filter/flower_child_filter.cpp's
// header comment for the full derivation.
// Shared helpers for the RSMET/Yellowjacket/SuperLove/ChaoticPhaseLocking/
// Resonator/Human filter family below -- mirrors each native module's C++
// exactly (same math, JS built-ins standing in for the freestanding
// polynomial approximations, which is fine offline where Math.sin/cos/tan
// are already available).

// --- RSMET Filter ---

function createNodeGraphRsmetFilterState() {
  return { y: [0, 0, 0, 0, 0] };
}

// --- Yellowjacket Filter ---

function createNodeGraphYellowjacketFilterState() {
  return { phase: 0, filterY1: 0, oscSelfMod: 0, lastOutValue: 0 };
}

// --- SuperLove Filter ---

function createNodeGraphSuperloveFilterState() {
  return { feedbackSignal: 0, filterY: [0,0,0,0,0], dcY: [0,0,0,0,0] };
}

// --- Chaotic Phase Locking Filter ---

function createNodeGraphChaoticPhaseLockingFilterState() {
  return { feedbackSignal: 0, filterY: [0,0,0,0,0], dcY: [0,0,0,0,0] };
}

// --- Resonator Filter ---

function createNodeGraphResonatorFilterState() {
  return {
    phase1: 0, phase2: 0, filterY: [0,0,0,0,0], dcY: [0,0,0,0,0],
    osc1Value: 0, osc2Value: 0, osc1SelfMod: 0, osc2SelfMod: 0, sawFeedback: 0,
  };
}

// --- Human Filter ---

function createNodeGraphHumanFilterState() {
  return {
    phase1: 0, phase2: 0, osc1Value: 0, osc2Value: 0, lastOutValue: 0,
    osc1ModSelf: 0, osc2ModSelf: 0, fbZ1: 0, fbZ2: 0, dcY: [0,0,0,0,0],
  };
}

// --- Pulse Explosion ---
// See native_modules/pulse_explosion/pulse_explosion.cpp's header comment
// for the full derivation of the density shape and rejection sampling.

const kNodeGraphPulseExplosionMaxPulses = 128;
const kNodeGraphPulseExplosionMaxRejectionAttempts = 200;

// Deterministic 32-bit mulberry32 PRNG, mirrors the xorshift32 used in the
// native module closely enough for display purposes: same seed always
// produces the same [0,1) sequence.
// Folds an arbitrary numeric seed into a 32-bit mix (murmur3-style
// finalizer over the seed's raw f64 bits), matching the native module's
// seedHash so the same seed value looks "the same" conceptually across
// both implementations (the two RNGs still differ, only the seed-vs-seed
// determinism guarantee is what's shared).
// Pure schedule computation shared by playback (nodeGraphPulseExplosionSample
// below) and the node's curve/pulse-position display, so the display always
// shows exactly what a trigger with the same seed will actually play.
function createNodeGraphTb303FilterState() {
  return { y: [0, 0, 0, 0], hpX: 0, hpY: 0 };
}

// X/Y as a fraction of a whole note. Both are free metaparameters -- never
// clamped or rejected here, only floored for this one computation:
// - Negative numerator or denominator behaves like 0.
// - A numerator of 0 (or negative) always means "no time", for any
//   denominator including 0 -- this also sidesteps 0/0 producing NaN.
// - A non-zero numerator over a 0 (or negative) denominator falls back to
//   a denominator of 1, i.e. "X/0" reads as "X whole notes", rather than
//   dividing by zero.
// DspBinding for Sabrina Reverb (offline/preview evaluator path): resolves
// clamped native params, checks whether they've actually changed since the
// last apply (paramKey dirty check), and only then syncs them into native
// DSP memory via soemdsp_sabrina_reverb_set_params. Pure extraction of the
// duplicate block previously inline in nodeGraphSabrinaReverbSample -- same
// clamps, same key construction, same condition, same call args. Mirrors
// applySabrinaDspBindingIfDirty in node-live-audio-worklet-core.js (a plain
// function here since this evaluator module isn't class-based).
const nodeGraphPluckEnvelopeMinValue = 1e-8;
const nodeGraphPluckEnvelopeMaxFeedback = 1 - 1e-6;

// Registry of per-module-type dispatch handlers extracted into their own
// files (e.g. native_modules/logistic_map/logistic_map-live-evaluator.js),
// each self-registering on load. Checked ahead of the big if/else-if chain
// below so a migrated module type never requires editing this file again.
const nodeGraphLiveModuleEvaluators = {};

function evaluateNodeGraphPlanFrame(runtime, sampleRate, frame, frames) {
  const frameValues = new Map();
  const mixInput = (nodeId, port = "In") => (runtime.inputConnections.get(`${nodeId}.${port}`) || []).reduce(
    (sum, connection) => sum + readNodeGraphRuntimePortOutput(
      runtime,
      frameValues,
      connection.sourceNode,
      connection.sourcePort,
      frame,
      frames,
    ),
    0,
  );
  const hasInput = (nodeId, port) => runtime.inputConnections.has(`${nodeId}.${port}`);

  const graphSampleX = (node, nodeId) => {
    const mode = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues));
    if (mode <= 0) {
      return mixInput(nodeId);
    }
    const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
    const absoluteFrame = Number.isFinite(runtime.absoluteFrame) ? runtime.absoluteFrame : frame;
    const rate = Math.max(0, readNodeGraphLiveEffectiveParam(runtime, node, "rate", 1, frame, frames, frameValues));
    const phase = readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues);
    const state = runtime.graphLfoStates.get(nodeId) || createNodeGraphGraphLfoState();
    runtime.graphLfoStates.set(nodeId, state);
    const resetValue = 0;
    if (state.lastReset <= 0 && resetValue > 0) {
      state.resetFrame = absoluteFrame;
    }
    state.lastReset = resetValue;
    const resetFrame = Number.isFinite(state.resetFrame) ? state.resetFrame : 0;
    return wrapNodeSliderValue(((absoluteFrame - resetFrame) / safeRate) * rate + phase, 0, 1);
  };
  const graphOutputValue = (node, nodeId) => {
    const normalizedValue = nodeGraphGraphValueAt(
      nodeGraphGraphForNode(node),
      graphSampleX(node, nodeId),
      nodeGraphGraphSmoothingModeForNode(node),
    );
    const outputMin = readNodeGraphLiveEffectiveParam(runtime, node, "outputMin", 0, frame, frames, frameValues);
    const outputMax = readNodeGraphLiveEffectiveParam(runtime, node, "outputMax", 1, frame, frames, frameValues);
    return outputMin + normalizedValue * (outputMax - outputMin);
  };
  const graphInputValue = (nodeId, graphInput, x, fallback) => {
    const connection = (runtime.graphInputConnections?.get(nodeGraphGraphInputKey(nodeId, graphInput)) || [])[0];
    const source = connection ? runtime.nodes.get(connection.sourceNode) : null;
    if (!source || !nodeGraphModuleIsGraphType(source.type)) {
      return fallback;
    }
    return nodeGraphGraphValueAt(
      nodeGraphGraphForNode(source),
      clampNodeSliderValue(Number(x) || 0, 0, 1),
      nodeGraphGraphSmoothingModeForNode(source),
    );
  };

  for (const nodeId of runtime.order || []) {
    const node = runtime.nodes.get(nodeId);
    let value = 0;

    const liveModuleEvaluator = node?.type ? nodeGraphLiveModuleEvaluators[node.type] : null;
    if (liveModuleEvaluator) {
      value = liveModuleEvaluator({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate, graphInputValue, graphOutputValue });
    }

    frameValues.set(nodeId, value);
    runtime.nodeOutputs?.set(nodeId, value);
  }

  const outputNode = runtime.nodes.get(runtime.outputNode || "output");
  const outputVolume = outputNode
    ? readNodeGraphLiveEffectiveParam(
      runtime,
      outputNode,
      "volume",
      0.1,
      frame,
      frames,
      frameValues,
    )
    : 1;

  const outputMono = mixInput(runtime.outputNode || "output", "Mono");
  return {
    frameValues,
    left: (outputMono + mixInput(runtime.outputNode || "output", "Left")) * outputVolume,
    right: (outputMono + mixInput(runtime.outputNode || "output", "Right")) * outputVolume,
  };
}
