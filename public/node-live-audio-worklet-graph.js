// Extracted from node-live-audio-worklet-core.js (Phase D — graph math).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.normalizeGraphNumber = function normalizeGraphNumber(value, fallback = 0, min = 0, max = 1) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(min, Math.min(max, number))
      : fallback;
};

NodeLiveAudioProcessor.prototype.normalizeGraphShape = function normalizeGraphShape(value) {
    const shape = String(value || "").trim().toLowerCase();
    if (shape === "logarithmic") {
      return "log";
    }
    if (shape === "smooth" || shape === "smoothstep") {
      return "smoothstep";
    }
    if (
      shape === "linear" ||
      shape === "exponential" ||
      shape === "rational" ||
      shape === "log" ||
      shape === "hold"
    ) {
      return shape;
    }
    return "rational";
};

NodeLiveAudioProcessor.prototype.normalizeGraphNode = function normalizeGraphNode(value = {}, index = 0) {
    const source = value && typeof value === "object" ? value : {};
    const fallback = index <= 0
      ? { c: 0, shape: "linear", x: 0, y: 0 }
      : { c: 0, shape: "rational", x: 1, y: 1 };
    return {
      c: this.normalizeGraphNumber(source.c, fallback.c, -1, 1),
      shape: this.normalizeGraphShape(source.shape ?? fallback.shape),
      x: this.normalizeGraphNumber(source.x, fallback.x),
      y: this.normalizeGraphNumber(source.y, fallback.y),
    };
};

NodeLiveAudioProcessor.prototype.normalizeGraph = function normalizeGraph(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const inputNodes = Array.isArray(source.nodes) && source.nodes.length >= 2
      ? source.nodes
      : [{ c: 0, shape: "linear", x: 0, y: 0 }, { c: 0, shape: "rational", x: 1, y: 1 }];
    const nodes = inputNodes
      .slice(0, 32)
      .map((node, index) => this.normalizeGraphNode(node, index))
      .sort((left, right) => left.x - right.x);
    if (nodes.length < 2) {
      nodes.push(
        this.normalizeGraphNode({ c: 0, shape: "linear", x: 0, y: 0 }, 0),
        this.normalizeGraphNode({ c: 0, shape: "rational", x: 1, y: 1 }, 1),
      );
    }
    return { nodes };
};

NodeLiveAudioProcessor.prototype.graphEndpointYLockEnabledForNode = function graphEndpointYLockEnabledForNode(node) {
    return (node?.type === "smoothGraph" || node?.type === "stepGraph") &&
      Number(node?.params?.lockEndpointY) >= 0.5;
};

NodeLiveAudioProcessor.prototype.graphWithLockedEndpointY = function graphWithLockedEndpointY(graphValue) {
    const graph = this.normalizeGraph(graphValue);
    if (graph.nodes.length < 2) {
      return graph;
    }
    const lastIndex = graph.nodes.length - 1;
    const anchorY = this.normalizeGraphNumber(graph.nodes[0]?.y, 0);
    const nodes = graph.nodes.map((node, index) => (
      index === 0 || index === lastIndex
        ? this.normalizeGraphNode({ ...node, y: anchorY }, index)
        : node
    ));
    return this.normalizeGraph({ ...graph, nodes });
};

NodeLiveAudioProcessor.prototype.graphForNode = function graphForNode(node) {
    return this.graphEndpointYLockEnabledForNode(node)
      ? this.graphWithLockedEndpointY(node?.graph)
      : this.normalizeGraph(node?.graph);
};

NodeLiveAudioProcessor.prototype.graphHardStepShape = function graphHardStepShape(position, contourSign) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    if (contourSign >= 0) {
      return p <= 0 ? 0 : 1;
    }
    return p >= 1 ? 1 : 0;
};

NodeLiveAudioProcessor.prototype.graphBlendContourTowardHardStep = function graphBlendContourTowardHardStep(position, contour, continuousValue) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(contour, 0, -1, 1);
    const a = Math.abs(c);
    if (a < 1e-9) {
      return continuousValue;
    }
    if (a >= 1 - 1e-12) {
      return this.graphHardStepShape(p, c);
    }
    const hard = this.graphHardStepShape(p, c);
    const cont = Number.isFinite(continuousValue) ? continuousValue : p;
    return cont * (1 - a) + hard * a;
};

NodeLiveAudioProcessor.prototype.graphRationalCurve = function graphRationalCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(contour, 0, -1, 1);
    let continuous = p;
    if (Math.abs(c) >= 0.000001) {
      const cSafe = Math.max(-0.999999, Math.min(0.999999, c));
      continuous = cSafe < 0
        ? (p * (1 + cSafe)) / (1 + cSafe * p)
        : p / (1 - cSafe + cSafe * p);
    }
    return this.graphBlendContourTowardHardStep(p, c, continuous);
};

NodeLiveAudioProcessor.prototype.graphExponentialCurve = function graphExponentialCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const t = this.normalizeGraphNumber(contour, 0, -1, 1);
    let continuous = p;
    if (Math.abs(t) >= 0.000001) {
      const a = Math.min(0.999999, Math.abs(t));
      const mag = 1.2 + 6.8 * (a / (1 - a * 0.85));
      const k = t < 0 ? -mag : mag;
      if (Math.abs(k) >= 0.05) {
        const denom = Math.exp(k) - 1;
        if (Math.abs(denom) >= 1e-9) {
          continuous = (Math.exp(k * p) - 1) / denom;
        }
      }
    }
    return this.graphBlendContourTowardHardStep(p, t, continuous);
};

NodeLiveAudioProcessor.prototype.graphLogarithmicCurve = function graphLogarithmicCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const t = this.normalizeGraphNumber(contour, 0, -1, 1);
    let continuous = p;
    if (Math.abs(t) >= 0.000001) {
      const a = Math.min(0.999999, Math.abs(t));
      const b = Math.exp(1.2 + 5.5 * (a / (1 - a * 0.85)));
      if (Number.isFinite(b) && b > 1.000001) {
        const denom = Math.log(b);
        if (Number.isFinite(denom) && Math.abs(denom) >= 1e-9) {
          continuous = t < 0
            ? 1 - Math.log(1 + (1 - p) * (b - 1)) / denom
            : Math.log(1 + p * (b - 1)) / denom;
        }
      }
    }
    return this.graphBlendContourTowardHardStep(p, t, continuous);
};

NodeLiveAudioProcessor.prototype.graphSmoothCurve = function graphSmoothCurve(position) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    return p * p * (3 - 2 * p);
};

NodeLiveAudioProcessor.prototype.normalizeSmoothGraphSmoothingMode = function normalizeSmoothGraphSmoothingMode(value) {
    if (value === "segment") {
      return "segment";
    }
    const modes = ["linear", "catmull", "quadratic", "cubic"];
    const raw = String(value ?? "").trim().toLowerCase();
    // Old Curve labels that all used the same guide-tension path.
    if (raw === "smooth" || raw === "bezier" || raw === "catmullrom" || raw === "catmull") {
      return "catmull";
    }
    if (modes.includes(raw)) {
      return raw;
    }
    if (Number.isFinite(Number(value))) {
      const n = Math.round(Number(value));
      if (n === 4) {
        return "cubic";
      }
      if (n === 5) {
        return "catmull";
      }
      return modes[Math.max(0, Math.min(modes.length - 1, n))];
    }
    return "catmull";
};

NodeLiveAudioProcessor.prototype.graphModeCurve = function graphModeCurve(position, mode, index = 0) {
    const normalizedMode = this.normalizeSmoothGraphSmoothingMode(mode);
    if (normalizedMode === "linear") {
      return this.normalizeGraphNumber(position, 0, 0, 1);
    }
    return this.graphSmoothCurve(position);
};

NodeLiveAudioProcessor.prototype.graphBezierPointAt = function graphBezierPointAt(controls, position = 0) {
    const t = this.normalizeGraphNumber(position, 0, 0, 1);
    let points = controls.map((node) => ({
      x: this.normalizeGraphNumber(node.x, 0),
      y: this.normalizeGraphNumber(node.y, 0),
    }));
    if (!points.length) {
      return { x: 0, y: 0 };
    }
    while (points.length > 1) {
      points = points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        return {
          x: point.x + (next.x - point.x) * t,
          y: point.y + (next.y - point.y) * t,
        };
      });
    }
    return points[0];
};

NodeLiveAudioProcessor.prototype.graphGuideBezierControls = function graphGuideBezierControls(nodes, tension = 1) {
    const count = nodes.length;
    if (count < 2) {
      return nodes.map((node) => ({ x: node.x, y: node.y }));
    }
    const u = this.normalizeGraphNumber(tension, 1, 0, 1);
    if (u <= 1e-6) {
      return [
        { x: nodes[0].x, y: nodes[0].y },
        { x: nodes[count - 1].x, y: nodes[count - 1].y },
      ];
    }
    const pull = 0.08 + 1.42 * (u ** 0.6);
    const first = nodes[0];
    const last = nodes[count - 1];
    return nodes.map((node, index) => {
      if (index === 0 || index === count - 1) {
        return { x: node.x, y: node.y };
      }
      const s = index / (count - 1);
      const chordX = first.x + (last.x - first.x) * s;
      const chordY = first.y + (last.y - first.y) * s;
      return {
        x: chordX + (node.x - chordX) * pull,
        y: chordY + (node.y - chordY) * pull,
      };
    });
};

NodeLiveAudioProcessor.prototype.graphGuideBezierValueAt = function graphGuideBezierValueAt(graph, xValue, tension = 1) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (nodes.length < 2) {
      return nodes[0]?.y ?? 0;
    }
    if (x <= nodes[0].x) {
      return nodes[0].y;
    }
    const last = nodes[nodes.length - 1];
    if (x >= last.x) {
      return last.y;
    }
    const controls = this.graphGuideBezierControls(nodes, tension);
    const samples = 96;
    let prev = this.graphBezierPointAt(controls, 0);
    for (let index = 1; index <= samples; index += 1) {
      const point = this.graphBezierPointAt(controls, index / samples);
      const minX = Math.min(prev.x, point.x);
      const maxX = Math.max(prev.x, point.x);
      if (x >= minX && x <= maxX) {
        const dx = point.x - prev.x;
        const a = Math.abs(dx) < 1e-12 ? 0 : (x - prev.x) / dx;
        return this.safeFilterNumber(prev.y + (point.y - prev.y) * a, null);
      }
      prev = point;
    }
    let bestY = nodes[0].y;
    let bestDist = Infinity;
    for (let index = 0; index <= samples; index += 1) {
      const point = this.graphBezierPointAt(controls, index / samples);
      const dist = Math.abs(point.x - x);
      if (dist < bestDist) {
        bestDist = dist;
        bestY = point.y;
      }
    }
    return this.safeFilterNumber(bestY, null);
};

NodeLiveAudioProcessor.prototype.graphBezierValueAt = function graphBezierValueAt(graph, xValue, tension = 1) {
    return this.graphGuideBezierValueAt(graph, xValue, tension);
};

NodeLiveAudioProcessor.prototype.graphPolylineValueAt = function graphPolylineValueAt(graph, xValue) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (!nodes.length) {
      return 0;
    }
    if (nodes.length < 2 || x <= nodes[0].x) {
      return nodes[0].y;
    }
    if (x >= nodes[nodes.length - 1].x) {
      return nodes[nodes.length - 1].y;
    }
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x <= nodes[index + 1].x) {
        const left = nodes[index];
        const right = nodes[index + 1];
        const dx = right.x - left.x;
        if (Math.abs(dx) < 0.000001) {
          return 0.5 * (left.y + right.y);
        }
        const t = (x - left.x) / dx;
        return left.y + (right.y - left.y) * t;
      }
    }
    return nodes[nodes.length - 1].y;
};

NodeLiveAudioProcessor.prototype.graphHermiteY = function graphHermiteY(y1, y2, m1, m2, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y1
      + (t3 - 2 * t2 + t) * m1
      + (-2 * t3 + 3 * t2) * y2
      + (t3 - t2) * m2;
};

NodeLiveAudioProcessor.prototype.graphInterpolationWindowStart = function graphInterpolationWindowStart(nodes, x, degree) {
    const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
    let segmentIndex = 0;
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x <= nodes[index + 1].x) {
        segmentIndex = index;
        break;
      }
      segmentIndex = index;
    }
    const start = segmentIndex - Math.max(0, Math.floor((targetCount - 2) * 0.5));
    return Math.max(0, Math.min(nodes.length - targetCount, start));
};

NodeLiveAudioProcessor.prototype.graphLagrangeValueAt = function graphLagrangeValueAt(graph, xValue, degree = 3) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (nodes.length < 2) {
      return nodes[0]?.y ?? 0;
    }
    for (const node of nodes) {
      if (Math.abs(x - node.x) < 0.000001) {
        return node.y;
      }
    }
    const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
    const start = this.graphInterpolationWindowStart(nodes, x, degree);
    const windowNodes = nodes.slice(start, start + targetCount);
    let value = 0;
    for (let index = 0; index < windowNodes.length; index += 1) {
      const point = windowNodes[index];
      let basis = 1;
      for (let otherIndex = 0; otherIndex < windowNodes.length; otherIndex += 1) {
        if (otherIndex === index) {
          continue;
        }
        const other = windowNodes[otherIndex];
        const denominator = point.x - other.x;
        if (Math.abs(denominator) < 0.000001) {
          continue;
        }
        basis *= (x - other.x) / denominator;
      }
      value += point.y * basis;
    }
    return value;
};

NodeLiveAudioProcessor.prototype.graphCardinalValueAt = function graphCardinalValueAt(graph, xValue, tension = 1) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (nodes.length < 2) {
      return nodes[0]?.y ?? 0;
    }
    for (const node of nodes) {
      if (Math.abs(x - node.x) < 0.000001) {
        return node.y;
      }
    }
    if (x <= nodes[0].x) {
      return nodes[0].y;
    }
    if (x >= nodes[nodes.length - 1].x) {
      return nodes[nodes.length - 1].y;
    }
    const u = this.normalizeGraphNumber(tension, 1, 0, 1);
    if (u <= 1e-6) {
      return this.graphPolylineValueAt(graph, x);
    }
    const s = 0.5 * (0.12 + 1.55 * (u ** 0.55));
    const yAt = (i) => {
      if (i < 0) {
        return 2 * nodes[0].y - nodes[1].y;
      }
      if (i >= nodes.length) {
        return 2 * nodes[nodes.length - 1].y - nodes[nodes.length - 2].y;
      }
      return nodes[i].y;
    };
    const xAt = (i) => {
      if (i < 0) {
        return 2 * nodes[0].x - nodes[1].x;
      }
      if (i >= nodes.length) {
        return 2 * nodes[nodes.length - 1].x - nodes[nodes.length - 2].x;
      }
      return nodes[i].x;
    };
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x > nodes[index + 1].x) {
        continue;
      }
      const x1 = nodes[index].x;
      const x2 = nodes[index + 1].x;
      const y1 = nodes[index].y;
      const y2 = nodes[index + 1].y;
      const dx = x2 - x1;
      if (Math.abs(dx) < 0.000001) {
        return 0.5 * (y1 + y2);
      }
      const t = (x - x1) / dx;
      const dxIn = xAt(index + 1) - xAt(index - 1);
      const dxOut = xAt(index + 2) - xAt(index);
      const m1 = Math.abs(dxIn) < 1e-9 ? 0 : s * (yAt(index + 1) - yAt(index - 1)) / dxIn * dx;
      const m2 = Math.abs(dxOut) < 1e-9 ? 0 : s * (yAt(index + 2) - yAt(index)) / dxOut * dx;
      return this.safeFilterNumber(this.graphHermiteY(y1, y2, m1, m2, t), null);
    }
    return nodes[nodes.length - 1].y;
};

NodeLiveAudioProcessor.prototype.graphCatmullRomValueAt = function graphCatmullRomValueAt(graph, xValue, tension = 1) {
    return this.graphCardinalValueAt(graph, xValue, tension);
};

NodeLiveAudioProcessor.prototype.graphSmoothingModeForNode = function graphSmoothingModeForNode(node) {
    // Step Graph: per-segment evaluation path.
    if (node?.type === "stepGraph") {
      return "segment";
    }
    // Smooth Graph: one global smoothing algorithm through the dots.
    return this.normalizeSmoothGraphSmoothingMode(node?.params?.smoothingMode);
};

NodeLiveAudioProcessor.prototype.graphSegmentShapeFromParam = function graphSegmentShapeFromParam(value) {
    const shapes = ["linear", "rational", "exponential", "log", "smoothstep", "hold"];
    if (Number.isFinite(Number(value)) && String(value).trim() !== "") {
      return shapes[Math.max(0, Math.min(shapes.length - 1, Math.round(Number(value))))];
    }
    return this.normalizeGraphShape(value);
};

NodeLiveAudioProcessor.prototype.graphSegmentOptionsForNode = function graphSegmentOptionsForNode(node) {
    if (node?.type !== "stepGraph") {
      return {};
    }
    const params = node?.params || {};
    return {
      curveOffset: this.normalizeGraphNumber(params.curveOffset, 0, -1, 1),
      segmentShape: this.graphSegmentShapeFromParam(
        params.segmentShape != null && params.segmentShape !== ""
          ? params.segmentShape
          : "linear",
      ),
    };
};

NodeLiveAudioProcessor.prototype.graphSegmentValue = function graphSegmentValue(graph, x, index, smoothingMode = "segment", segmentOptions = {}) {
    const left = graph.nodes[index];
    const right = graph.nodes[index + 1];
    const dx = right.x - left.x;
    if (Math.abs(dx) < 0.000001) {
      return 0.5 * (left.y + right.y);
    }
    const p = this.normalizeGraphNumber((x - left.x) / dx, 0, 0, 1);
    if (smoothingMode !== "segment") {
      const shaped = this.graphModeCurve(p, smoothingMode, index);
      return left.y + (right.y - left.y) * shaped;
    }
    const offset = this.normalizeGraphNumber(segmentOptions.curveOffset, 0, -1, 1);
    // Per-node c + global offset; ±1 = hard step for rational / exp / log.
    const contour = this.normalizeGraphNumber((Number(right.c) || 0) + offset, 0, -1, 1);
    const shape = segmentOptions.segmentShape != null && segmentOptions.segmentShape !== ""
      ? this.normalizeGraphShape(segmentOptions.segmentShape)
      : this.normalizeGraphShape(right.shape || "rational");
    let shaped = p;
    if (shape === "exponential") {
      shaped = this.graphExponentialCurve(p, contour);
    } else if (shape === "log" || shape === "logarithmic") {
      shaped = this.graphLogarithmicCurve(p, contour);
    } else if (shape === "hold") {
      shaped = p >= 1 ? 1 : 0;
    } else if (shape === "smoothstep" || shape === "smooth") {
      shaped = this.graphSmoothCurve(p);
    } else if (shape === "linear") {
      shaped = p;
    } else {
      shaped = this.graphRationalCurve(p, contour);
    }
    return left.y + (right.y - left.y) * shaped;
};

NodeLiveAudioProcessor.prototype.graphValueAt = function graphValueAt(graphValue, xValue, smoothingMode = "segment", tension = 1, segmentOptions = {}) {
    const graph = this.normalizeGraph(graphValue);
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    if (!graph.nodes.length) {
      return 0;
    }
    const normalizedMode = this.normalizeSmoothGraphSmoothingMode(smoothingMode);
    // Catmull = guide-tension curve (old smooth/bezier aliases map here).
    if (normalizedMode === "catmull") {
      return this.graphGuideBezierValueAt(graph, x, tension);
    }
    if (x < graph.nodes[0].x) {
      return graph.nodes[0].y;
    }
    if (x > graph.nodes[graph.nodes.length - 1].x) {
      return graph.nodes[graph.nodes.length - 1].y;
    }
    if (normalizedMode === "quadratic") {
      return this.safeFilterNumber(this.graphLagrangeValueAt(graph, x, 2), null);
    }
    if (normalizedMode === "cubic") {
      return this.safeFilterNumber(this.graphLagrangeValueAt(graph, x, 3), null);
    }
    for (let index = 0; index < graph.nodes.length - 1; index += 1) {
      if (x <= graph.nodes[index + 1].x) {
        return this.safeFilterNumber(
          this.graphSegmentValue(graph, x, index, smoothingMode, segmentOptions),
          null,
        );
      }
    }
    return graph.nodes[graph.nodes.length - 1].y;
};

