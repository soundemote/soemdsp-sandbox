// Shared dry thrus for signal-path display modules that only observe audio.
// Mono faces: Thru (→). XY faces: X/Y passthrough. Face still reads visual buffers.

(function registerDisplayThruLiveEvaluators() {
  if (typeof nodeGraphLiveModuleEvaluators !== "object" || !nodeGraphLiveModuleEvaluators) {
    return;
  }

  const thruFrom = (port, tag) => ({ runtime, nodeId, mixInput }) => {
    const raw = nodeGraphSafeFilterNumber(
      mixInput(nodeId, port),
      runtime,
      nodeId,
      null,
      tag,
    );
    return { Thru: raw };
  };

  const xyThru = (tagX, tagY) => ({ runtime, nodeId, mixInput }) => ({
    X: nodeGraphSafeFilterNumber(mixInput(nodeId, "X"), runtime, nodeId, null, tagX),
    Y: nodeGraphSafeFilterNumber(mixInput(nodeId, "Y"), runtime, nodeId, null, tagY),
  });

  // Mono / primary In → Thru
  nodeGraphLiveModuleEvaluators.traceDisplay = thruFrom("In", "traceDisplay in");
  nodeGraphLiveModuleEvaluators.dotOscilloscope = thruFrom("In", "dotOscilloscope in");
  nodeGraphLiveModuleEvaluators.valueOscilloscope = thruFrom("In", "valueOscilloscope in");
  nodeGraphLiveModuleEvaluators.lineBurnOscilloscope = thruFrom("In", "lineBurnOscilloscope in");
  nodeGraphLiveModuleEvaluators.matrixDisplay = thruFrom("In", "matrixDisplay in");
  nodeGraphLiveModuleEvaluators.numberReadout = thruFrom("In", "numberReadout in");
  nodeGraphLiveModuleEvaluators.customDisplay = thruFrom("In1", "customDisplay in");
  nodeGraphLiveModuleEvaluators.videoscope = thruFrom("A", "videoscope A");
  // XY displays: dry X/Y thrus (same port names as inputs)
  nodeGraphLiveModuleEvaluators.asciiscope = xyThru("asciiscope X", "asciiscope Y");
  nodeGraphLiveModuleEvaluators.scope2d = xyThru("scope2d X", "scope2d Y");
  nodeGraphLiveModuleEvaluators.phosphorLight = xyThru("phosphorLight X", "phosphorLight Y");
  nodeGraphLiveModuleEvaluators.scope2dTrace = xyThru("scope2dTrace X", "scope2dTrace Y");
  nodeGraphLiveModuleEvaluators.visualOscilloscope = xyThru("visualOscilloscope X", "visualOscilloscope Y");
})();
