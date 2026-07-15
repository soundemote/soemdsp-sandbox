// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphSoftClipperSample(input, center = 0, width = 2) {
  const safeWidth = Math.max(0.000001, Math.abs(Number(width) || 2));
  const safeCenter = Number(center) || 0;
  const scaleX = 2 / safeWidth;
  const shiftX = -1 - (scaleX * (safeCenter - 0.5 * safeWidth));
  const scaleY = 1 / scaleX;
  const shiftY = -shiftX * scaleY;
  return shiftY + scaleY * Math.tanh(scaleX * (Number(input) || 0) + shiftX);
}


// Registers the offline/render-time dispatch handler for softClipper into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.softClipper = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const softClipperCenter = readNodeGraphLiveEffectiveParam(runtime, node, "center", 0, frame, frames, frameValues);
  const softClipperWidth = readNodeGraphLiveEffectiveParam(runtime, node, "width", 2, frame, frames, frameValues);
  const softClipperMono = mixInput(nodeId);
  return {
    Out: nodeGraphSoftClipperSample(softClipperMono, softClipperCenter, softClipperWidth),
    Left: nodeGraphSoftClipperSample(mixInput(nodeId, "Left") + softClipperMono, softClipperCenter, softClipperWidth),
    Right: nodeGraphSoftClipperSample(mixInput(nodeId, "Right") + softClipperMono, softClipperCenter, softClipperWidth),
  };
};
