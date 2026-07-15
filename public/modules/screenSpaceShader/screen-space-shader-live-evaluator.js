// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphScreenSpaceShaderSample(node, readInput, runtime, nodeId, sampleRate) {
  const script = normalizeNodeGraphScreenSpaceShader(node?.screenSpaceShader);
  const value = {};
  for (const input of script.visualInputs || []) {
    if (input.mode === "raw") {
      continue;
    }
    const raw = readInput(input.port);
    const signed = input.mode === "signed";
    const target = signed
      ? nodeGraphVisualControlSigned(raw, runtime, nodeId, `screen space shader ${input.port}`)
      : nodeGraphVisualControlIntensity(raw, runtime, nodeId, `screen space shader ${input.port}`);
    value[input.key] = nodeGraphSmoothVisualControl(
      runtime,
      input.key,
      target,
      sampleRate,
      signed ? 0.045 : 0.025,
      signed ? -1 : 0,
      1,
    );
  }
  return value;
}


// Registers the offline/render-time dispatch handler for screenSpaceShader
// into nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.screenSpaceShader = ({ runtime, node, nodeId, mixInput, sampleRate }) => nodeGraphScreenSpaceShaderSample(
  node,
  (port) => mixInput(nodeId, port),
  runtime,
  nodeId,
  sampleRate,
);
