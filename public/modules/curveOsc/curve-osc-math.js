// Curve Osc — pure math (main thread + AudioWorklet).
//
// Mental model (2D → 1D):
//   1) Phase θ advances like any oscillator (0…1 cycle).
//   2) A parametric curve produces a point (X, Y) on the plane.
//   3) Project picks ONE number from that point for mono Out:
//        Y / X / Radius / Angle / Dot(direction)
//   X and Y are also emitted so a 2D scope shows the shape while Out is 1D audio.

function createNodeGraphCurveOscState() {
  return { phase: 0 };
}

function nodeGraphCurveOscWrap01(phase) {
  if (typeof nodeGraphWrap01 === "function") {
    return nodeGraphWrap01(phase);
  }
  const p = Number(phase) || 0;
  return p - Math.floor(p);
}

/**
 * Parametric curve families → { x, y } roughly in a usable bipolar range.
 * θ is phase in cycles [0,1). shape 0…n.
 */
function nodeGraphCurveOscPoint(shapeIndex, theta01, a, b, morph) {
  const shape = Math.max(0, Math.min(6, Math.round(Number(shapeIndex) || 0)));
  const t = nodeGraphCurveOscWrap01(theta01) * Math.PI * 2;
  const aa = Number(a);
  const bb = Number(b);
  const m = Math.max(0, Math.min(1, Number(morph) || 0));
  // Sensible defaults if params missing
  const A = Number.isFinite(aa) ? aa : 1;
  const B = Number.isFinite(bb) ? bb : 1;

  let x = 0;
  let y = 0;

  switch (shape) {
    case 0: {
      // Lissajous — frequency ratio A:B, morph = phase offset
      const n1 = 1 + Math.round(Math.abs(A) * 4);
      const n2 = 1 + Math.round(Math.abs(B) * 4);
      const delta = m * Math.PI;
      x = Math.sin(n1 * t);
      y = Math.sin(n2 * t + delta);
      break;
    }
    case 1: {
      // Rose (rhodonea): r = cos(kθ)
      const k = 2 + Math.round(Math.abs(A) * 6) + B * 0.01;
      const r = Math.cos(k * t) * (0.55 + m * 0.45);
      x = r * Math.cos(t);
      y = r * Math.sin(t);
      break;
    }
    case 2: {
      // Hypotrochoid (spiro): rolling circle
      const R = 1.1;
      const rr = 0.25 + Math.abs(A) * 0.55;
      const d = 0.2 + Math.abs(B) * 0.7 + m * 0.25;
      const den = Math.max(1e-6, rr);
      x = (R - rr) * Math.cos(t) + d * Math.cos(((R - rr) / den) * t);
      y = (R - rr) * Math.sin(t) - d * Math.sin(((R - rr) / den) * t);
      // Normalize roughly
      const s = 1 / (Math.abs(R - rr) + Math.abs(d) + 0.25);
      x *= s;
      y *= s;
      break;
    }
    case 3: {
      // Temple Fay butterfly
      const e = Math.exp(Math.cos(t));
      const s2 = 2 * Math.cos(4 * t);
      const s5 = Math.sin(t / (12 + A * 8 + 1e-6));
      const r = e - s2 - Math.pow(Math.abs(s5), 5) * (0.5 + B * 0.5);
      const sc = 0.18 * (0.85 + m * 0.3);
      x = Math.sin(t) * r * sc;
      y = Math.cos(t) * r * sc;
      break;
    }
    case 4: {
      // Superformula (Gielis) — simplified polar
      const n1 = 0.3 + Math.abs(A) * 2.5;
      const n2 = 0.3 + Math.abs(B) * 2.5;
      const n3 = n2;
      const mFreq = 3 + Math.round(m * 9);
      const t4 = t;
      const c = Math.cos((mFreq * t4) / 4);
      const s = Math.sin((mFreq * t4) / 4);
      const ap = Math.pow(Math.abs(c), n2);
      const bp = Math.pow(Math.abs(s), n3);
      const r0 = Math.pow(ap + bp, -1 / Math.max(0.05, n1));
      const r = Math.max(0, Math.min(2.5, r0)) * 0.55;
      x = r * Math.cos(t4);
      y = r * Math.sin(t4);
      break;
    }
    case 5: {
      // Harmonograph-ish: sum of two elliptical motions
      const f1 = 1;
      const f2 = 1 + Math.round(Math.abs(A) * 5);
      const f3 = 1 + Math.round(Math.abs(B) * 4);
      const d1 = 0.15 + m * 0.35;
      // Undamped for continuous tone; morph sets relative amplitude of 2nd system
      x = Math.sin(f1 * t) + d1 * Math.sin(f2 * t + 0.3);
      y = Math.sin(f3 * t + 1.1) + d1 * Math.cos(f2 * t * 0.97);
      x *= 0.55;
      y *= 0.55;
      break;
    }
    case 6:
    default: {
      // Clairaut-style / cubic parametric novelty: x = t'³ − t', y = t'² morph
      const u = Math.sin(t); // keep bounded
      const v = Math.cos(t * (1 + A));
      x = u * u * u - u * (0.5 + B * 0.5);
      y = v * v * (0.6 + m * 0.4) - 0.35;
      break;
    }
  }

  // Soft clamp so pathological params don't explode the bus
  const lim = 1.5;
  x = Math.max(-lim, Math.min(lim, x));
  y = Math.max(-lim, Math.min(lim, y));
  return { x, y };
}

/**
 * 2D point → 1D sample.
 * project: 0=Y 1=X 2=Radius 3=Angle 4=Dot
 * projectAngle: 0…1 → direction for Dot (cycles)
 */
function nodeGraphCurveOscProject(x, y, projectMode, projectAngle01) {
  const mode = Math.max(0, Math.min(4, Math.round(Number(projectMode) || 0)));
  switch (mode) {
    case 1:
      return x;
    case 2: {
      // Radius in [0, √2…] → map toward bipolar with soft curve
      const r = Math.sqrt(x * x + y * y);
      return Math.tanh(r);
    }
    case 3:
      // Angle / π ∈ [-1, 1]
      return Math.atan2(y, x) / Math.PI;
    case 4: {
      const ang = nodeGraphCurveOscWrap01(projectAngle01) * Math.PI * 2;
      return x * Math.cos(ang) + y * Math.sin(ang);
    }
    case 0:
    default:
      return y;
  }
}

function nodeGraphCurveOscillatorSample(state, options = {}) {
  const st = state || createNodeGraphCurveOscState();
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  const frequencyHz = Math.max(0, Number(options.frequencyHz) || 0);
  const phaseOffset = nodeGraphCurveOscWrap01(options.phase || 0);
  const level = Number(options.level);
  const amp = Number.isFinite(level) ? level : 1;

  const phase = nodeGraphCurveOscWrap01(st.phase);
  st.phase = nodeGraphCurveOscWrap01(st.phase + frequencyHz / sampleRate);
  const theta = nodeGraphCurveOscWrap01(phase + phaseOffset);

  const point = nodeGraphCurveOscPoint(
    options.curve,
    theta,
    options.a,
    options.b,
    options.morph,
  );
  const mono = nodeGraphCurveOscProject(
    point.x,
    point.y,
    options.project,
    options.projectAngle,
  );

  return {
    Out: mono * amp,
    X: point.x * amp,
    Y: point.y * amp,
    phase: theta,
  };
}

// Worklet global (no export)
if (typeof globalThis !== "undefined") {
  globalThis.createNodeGraphCurveOscState = createNodeGraphCurveOscState;
  globalThis.nodeGraphCurveOscillatorSample = nodeGraphCurveOscillatorSample;
  globalThis.nodeGraphCurveOscPoint = nodeGraphCurveOscPoint;
  globalThis.nodeGraphCurveOscProject = nodeGraphCurveOscProject;
}
