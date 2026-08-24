// Snowflake — RS-MET-style fractal pattern synthesis (L-system + turtle → X/Y).
// JS reference + offline/render path + worklet fallback.
// Live worklet prefers native_modules/snowflake (C++/WASM) when loaded.
//
// Mental model (matches rosic::Snowflake / TurtleSource intent):
//   1) Expand an L-system axiom with production rules for N iterations.
//   2) Interpret the string as turtle graphics → polyline vertices.
//   3) Frequency advances a phase that walks the polyline by arc length.
//   4) Linearly interpolate between vertices → continuous stereo X/Y.
//
// Pattern index 0…6; Angle is degrees per +/− turn (pattern defaults used
// only as suggested catalog values — the Angle knob always wins at sample time).

const NODE_GRAPH_SNOWFLAKE_PATTERNS = Object.freeze([
  {
    name: "Koch Curve",
    axiom: "F",
    rules: Object.freeze({ F: "F+F--F+F" }),
    defaultAngle: 60,
  },
  {
    name: "Koch Snowflake",
    axiom: "F--F--F",
    rules: Object.freeze({ F: "F+F--F+F" }),
    defaultAngle: 60,
  },
  {
    name: "Quadratic Koch",
    axiom: "F",
    rules: Object.freeze({ F: "F+F-F-FF+F+F-F" }),
    defaultAngle: 90,
  },
  {
    name: "Sierpinski",
    axiom: "A",
    rules: Object.freeze({ A: "B-A-B", B: "A+B+A" }),
    defaultAngle: 60,
  },
  {
    name: "Dragon",
    axiom: "FX",
    rules: Object.freeze({ X: "X+YF+", Y: "-FX-Y" }),
    defaultAngle: 90,
  },
  {
    name: "Gosper",
    axiom: "A",
    rules: Object.freeze({ A: "A-B--B+A++AA+B-", B: "+A-BB--B-A++A+B" }),
    defaultAngle: 60,
  },
  {
    name: "Tree",
    axiom: "F",
    rules: Object.freeze({ F: "FF+[+F-F-F]-[-F+F+F]" }),
    defaultAngle: 22.5,
  },
]);

const NODE_GRAPH_SNOWFLAKE_DRAW_CHARS = "FGAB";
// String/point ceilings: L-systems grow exponentially; these are sized so each
// catalog pattern can take at least one more rewrite past the old 48k/8k walls.
const NODE_GRAPH_SNOWFLAKE_MAX_STRING = 200000;
const NODE_GRAPH_SNOWFLAKE_MAX_ITER = 100;
const NODE_GRAPH_SNOWFLAKE_MAX_POINTS = 32768;

function createNodeGraphSnowflakeState() {
  return {
    phase: 0,
    cacheKey: "",
    points: null,
    totalLength: 0,
  };
}

function nodeGraphSnowflakeWrap01(value) {
  if (typeof nodeGraphWrap01 === "function") {
    return nodeGraphWrap01(value);
  }
  const p = Number(value) || 0;
  return p - Math.floor(p);
}

function nodeGraphSnowflakeExpand(axiom, rules, iterations) {
  let current = String(axiom || "F");
  const iters = Math.max(0, Math.min(NODE_GRAPH_SNOWFLAKE_MAX_ITER, Math.round(Number(iterations) || 0)));
  const ruleMap = rules || {};
  for (let i = 0; i < iters; i += 1) {
    let next = "";
    for (let c = 0; c < current.length; c += 1) {
      const ch = current[c];
      next += ruleMap[ch] != null ? ruleMap[ch] : ch;
      if (next.length > NODE_GRAPH_SNOWFLAKE_MAX_STRING) {
        return next.slice(0, NODE_GRAPH_SNOWFLAKE_MAX_STRING);
      }
    }
    current = next;
  }
  return current;
}

/**
 * Turtle-interpret an L-system string into arc-length-parameterized points.
 * Each point is { x, y, s } where s is cumulative path length from the start.
 */
function nodeGraphSnowflakeBuildPath(commands, angleDeg) {
  const angleRad = ((Number(angleDeg) || 60) * Math.PI) / 180;
  const step = 1;
  let x = 0;
  let y = 0;
  let heading = 0;
  const stack = [];
  const points = [{ x: 0, y: 0, s: 0 }];
  let total = 0;
  const text = String(commands || "");

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (NODE_GRAPH_SNOWFLAKE_DRAW_CHARS.indexOf(ch) >= 0) {
      const nx = x + Math.cos(heading) * step;
      const ny = y + Math.sin(heading) * step;
      const dx = nx - x;
      const dy = ny - y;
      total += Math.sqrt(dx * dx + dy * dy);
      x = nx;
      y = ny;
      if (points.length < NODE_GRAPH_SNOWFLAKE_MAX_POINTS) {
        points.push({ x, y, s: total });
      }
    } else if (ch === "f") {
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      // pen-up move: do not add a drawn segment
    } else if (ch === "+") {
      heading += angleRad;
    } else if (ch === "-") {
      heading -= angleRad;
    } else if (ch === "[") {
      stack.push({ x, y, heading });
    } else if (ch === "]") {
      const popped = stack.pop();
      if (popped) {
        x = popped.x;
        y = popped.y;
        heading = popped.heading;
        // Re-seed polyline at branch base so jumps don't stretch the path.
        if (points.length < NODE_GRAPH_SNOWFLAKE_MAX_POINTS) {
          points.push({ x, y, s: total });
        }
      }
    }
  }

  if (points.length < 2 || total <= 1e-12) {
    return {
      points: [
        { x: -0.5, y: 0, s: 0 },
        { x: 0.5, y: 0, s: 1 },
      ],
      totalLength: 1,
    };
  }

  // Normalize to roughly fit [-1, 1] and center at origin.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const scale = 1.8 / span;
  for (let i = 0; i < points.length; i += 1) {
    points[i].x = (points[i].x - cx) * scale;
    points[i].y = (points[i].y - cy) * scale;
  }
  // Recompute arc lengths after scale (uniform scale → scale lengths).
  let s = 0;
  points[0].s = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    s += Math.sqrt(dx * dx + dy * dy);
    points[i].s = s;
  }

  return { points, totalLength: Math.max(s, 1e-9) };
}

function nodeGraphSnowflakeEnsurePath(state, patternIndex, iterations, angleDeg) {
  const idx = Math.max(0, Math.min(NODE_GRAPH_SNOWFLAKE_PATTERNS.length - 1, Math.round(Number(patternIndex) || 0)));
  const iters = Math.max(0, Math.min(NODE_GRAPH_SNOWFLAKE_MAX_ITER, Math.round(Number(iterations) || 0)));
  const angle = Number.isFinite(Number(angleDeg)) ? Number(angleDeg) : 60;
  const key = `${idx}|${iters}|${angle.toFixed(4)}`;
  if (state.cacheKey === key && state.points && state.points.length >= 2) {
    return state;
  }
  const pattern = NODE_GRAPH_SNOWFLAKE_PATTERNS[idx];
  const commands = nodeGraphSnowflakeExpand(pattern.axiom, pattern.rules, iters);
  const built = nodeGraphSnowflakeBuildPath(commands, angle);
  state.cacheKey = key;
  state.points = built.points;
  state.totalLength = built.totalLength;
  return state;
}

/**
 * Sample the polyline at arc-length fraction u ∈ [0, 1).
 * Uses a small sliding index on state for O(1) amortized lookup.
 */
function nodeGraphSnowflakePointAt(state, u01) {
  const points = state.points;
  const total = state.totalLength;
  if (!points || points.length < 2 || total <= 0) {
    return { x: 0, y: 0 };
  }
  const target = nodeGraphSnowflakeWrap01(u01) * total;
  let i = Math.max(0, Math.min(points.length - 2, state.segIndex | 0));
  // Walk forward / backward to the segment containing target.
  if (points[i].s > target) {
    while (i > 0 && points[i].s > target) i -= 1;
  } else {
    while (i < points.length - 2 && points[i + 1].s < target) i += 1;
  }
  state.segIndex = i;
  const a = points[i];
  const b = points[Math.min(i + 1, points.length - 1)];
  const segLen = Math.max(1e-12, b.s - a.s);
  const t = Math.max(0, Math.min(1, (target - a.s) / segLen));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * Direction −1…1 → path index via basic trisaw:
 *   −1 reverse saw (1x reverse), 0 bidirectional triangle, +1 forward saw.
 * Legacy `reverse` (0/1) migrates: off → forward (1), on → bidirectional (0).
 */
function nodeGraphSnowflakeResolveDirection(options = {}) {
  if (options.direction != null && Number.isFinite(Number(options.direction))) {
    const d = Number(options.direction);
    return d < -1 ? -1 : d > 1 ? 1 : d;
  }
  // Legacy reverse checkbox: 0 = forward loop, 1 = ping-pong.
  if (options.reverse != null && Number.isFinite(Number(options.reverse))) {
    return Number(options.reverse) > 0.5 ? 0 : 1;
  }
  return 0;
}

function nodeGraphSnowflakeSample(state, options = {}) {
  const st = state || createNodeGraphSnowflakeState();
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  const frequencyHz = Math.max(0, Number(options.frequencyHz) || 0);
  const pattern = options.pattern;
  const iterations = options.iterations;
  const angle = options.angle;
  // Size removed — Amplitude / level scales the figure only.
  const level = Number.isFinite(Number(options.level)) ? Number(options.level) : 1;
  const direction = nodeGraphSnowflakeResolveDirection(options);
  const spin = Number(options.spin) || 0;
  const phaseOffset = Number.isFinite(Number(options.phase))
    ? nodeGraphSnowflakeWrap01(Number(options.phase))
    : 0;

  if (options.reset > 0.5) {
    st.phase = 0;
    st.segIndex = 0;
  }

  nodeGraphSnowflakeEnsurePath(st, pattern, iterations, angle);

  const phase = nodeGraphSnowflakeWrap01(st.phase + phaseOffset);
  st.phase = nodeGraphSnowflakeWrap01(st.phase + frequencyHz / sampleRate);

  // Direction morphs path walk with a basic trisaw (warp 0 reverse … 0.5 tri … 1 forward).
  const warp = (direction + 1) * 0.5;
  const u = typeof nodeGraphTrisaw === "function"
    ? nodeGraphTrisaw(phase, warp)
    : (() => {
      // Inline trisaw if stdlib not loaded (offline safety).
      const w = Math.max(0.001, Math.min(0.999, warp));
      const p = phase;
      return p < w ? p / w : (1 - p) / (1 - w);
    })();

  const point = nodeGraphSnowflakePointAt(st, u);
  let x = point.x;
  let y = point.y;

  if (spin !== 0) {
    // Spin is cycles/sec; integrate with same sample clock via optional state field.
    if (!Number.isFinite(st.spinPhase)) st.spinPhase = 0;
    const spinPhase = nodeGraphSnowflakeWrap01(st.spinPhase);
    st.spinPhase = nodeGraphSnowflakeWrap01(st.spinPhase + spin / sampleRate);
    const ang = spinPhase * Math.PI * 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    x = rx;
    y = ry;
  }

  const amp = level;
  return {
    X: x * amp,
    Y: y * amp,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.createNodeGraphSnowflakeState = createNodeGraphSnowflakeState;
  globalThis.nodeGraphSnowflakeSample = nodeGraphSnowflakeSample;
  globalThis.NODE_GRAPH_SNOWFLAKE_PATTERNS = NODE_GRAPH_SNOWFLAKE_PATTERNS;
}
