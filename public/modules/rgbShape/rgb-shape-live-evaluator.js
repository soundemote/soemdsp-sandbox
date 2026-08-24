// Main-thread fallback: same outline X/Y as the worklet (engine-off preview).
nodeGraphLiveModuleEvaluators.rgbShape = ({ runtime, nodeId, mixInput, readParam }) => {
  const read = (key, fallback) => {
    if (typeof readParam === "function") {
      const n = Number(readParam(key, fallback));
      if (Number.isFinite(n)) {
        return n;
      }
    }
    if (typeof nodeGraphReadNodeNumber === "function") {
      const n = Number(nodeGraphReadNodeNumber(nodeId, key));
      if (Number.isFinite(n)) {
        return n;
      }
    }
    return fallback;
  };
  const phase = ((read("phase", 0) % 1) + 1) % 1;
  const shape = read("shape", 0);
  const shapeParam = read("shapeParam", 0.5);
  const size = Math.max(0, read("size", 1));
  const width = Math.max(0, read("width", 1));
  const height = Math.max(0, read("height", 1));
  const amp = read("amplitude", 1);
  let point = { x: Math.cos(phase * Math.PI * 2), y: Math.sin(phase * Math.PI * 2) };
  if (typeof RgbShapeMath !== "undefined" && typeof RgbShapeMath.outlinePoint === "function") {
    point = RgbShapeMath.outlinePoint(shape, shapeParam, phase);
  }
  const xOut = (Number(point.x) || 0) * size * width * amp;
  const yOut = (Number(point.y) || 0) * size * height * amp;
  // Touch mix inputs so the graph stays hot when wired.
  if (typeof mixInput === "function") {
    mixInput(nodeId, "Reset");
    mixInput(nodeId, "0.1V/Oct");
    mixInput(nodeId, "Increment");
    mixInput(nodeId, "f");
  }
  return {
    X: xOut,
    Y: yOut,
    rgba: 0,
  };
};
