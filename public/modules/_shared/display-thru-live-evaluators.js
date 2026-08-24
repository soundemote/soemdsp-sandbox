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

  const stereoThru = (tagL, tagR) => ({ runtime, nodeId, mixInput }) => ({
    Left: nodeGraphSafeFilterNumber(mixInput(nodeId, "Left"), runtime, nodeId, null, tagL),
    Right: nodeGraphSafeFilterNumber(mixInput(nodeId, "Right"), runtime, nodeId, null, tagR),
  });

  // Mono / primary In → Thru
  nodeGraphLiveModuleEvaluators.traceDisplay = thruFrom("In", "traceDisplay in");
  nodeGraphLiveModuleEvaluators.traceDisplayStereo = stereoThru(
    "traceDisplayStereo left",
    "traceDisplayStereo right",
  );
  nodeGraphLiveModuleEvaluators.traceDisplayXyz = ({ runtime, nodeId, mixInput }) => ({
    X: nodeGraphSafeFilterNumber(mixInput(nodeId, "X"), runtime, nodeId, null, "traceDisplayXyz X"),
    Y: nodeGraphSafeFilterNumber(mixInput(nodeId, "Y"), runtime, nodeId, null, "traceDisplayXyz Y"),
    Z: nodeGraphSafeFilterNumber(mixInput(nodeId, "Z"), runtime, nodeId, null, "traceDisplayXyz Z"),
  });
  nodeGraphLiveModuleEvaluators.vectorDot = thruFrom("In", "vectorDot in");
  nodeGraphLiveModuleEvaluators.lcdDot = thruFrom("In", "lcdDot in");
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
  nodeGraphLiveModuleEvaluators.gradientVectorscope = xyThru("gradientVectorscope X", "gradientVectorscope Y");
  nodeGraphLiveModuleEvaluators.traceXyz = ({ runtime, nodeId, mixInput }) => ({
    X: nodeGraphSafeFilterNumber(mixInput(nodeId, "X"), runtime, nodeId, null, "traceXyz X"),
    Y: nodeGraphSafeFilterNumber(mixInput(nodeId, "Y"), runtime, nodeId, null, "traceXyz Y"),
    Z: nodeGraphSafeFilterNumber(mixInput(nodeId, "Z"), runtime, nodeId, null, "traceXyz Z"),
  });
  nodeGraphLiveModuleEvaluators.vectorRgb = ({ runtime, nodeId, mixInput }) => ({
    X: nodeGraphSafeFilterNumber(mixInput(nodeId, "X"), runtime, nodeId, null, "vectorRgb X"),
    Y: nodeGraphSafeFilterNumber(mixInput(nodeId, "Y"), runtime, nodeId, null, "vectorRgb Y"),
    R: nodeGraphSafeFilterNumber(mixInput(nodeId, "R"), runtime, nodeId, null, "vectorRgb R"),
    G: nodeGraphSafeFilterNumber(mixInput(nodeId, "G"), runtime, nodeId, null, "vectorRgb G"),
    B: nodeGraphSafeFilterNumber(mixInput(nodeId, "B"), runtime, nodeId, null, "vectorRgb B"),
    Blank: nodeGraphSafeFilterNumber(mixInput(nodeId, "Blank"), runtime, nodeId, null, "vectorRgb Blank"),
  });
})();
