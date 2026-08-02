function createNodeGraphKeplerBouwkampState() {
  return { phase: 0, resetWasHigh: false };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function nodeGraphKeplerBouwkampWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphKeplerBouwkampWrapMod(v, modulus) {
  const r = v - Math.floor(v / modulus) * modulus;
  return r < 0 ? r + modulus : r;
}

// trisaw(phase, warp): phase used exactly as passed, no extra wrap-domain
// conversion -- matches triangle(osc_phase, tri) in the reference being
// called directly on the radian-domain osc_phase.
function nodeGraphKeplerBouwkampTrisaw(phase, warp) {
  return nodeGraphTrisaw(phase, warp);
}

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamKeplerBouwkamp.{h,cpp}
// (Jerobeam Fenderson's "Kepler-Bouwkamp" Gen~ patch). Mirrors
// native_modules/jerobeam_kepler_bouwkamp exactly, including the reference's
// own 0..2*pi phasor domain being fed directly into a 0..1-phase trisaw
// helper. Offline/JS path only, the realtime worklet prefers native WASM.
function nodeGraphKeplerBouwkampSample(options = {}) {
  const state = options.state || createNodeGraphKeplerBouwkampState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const start = Number(options.start) || 0;
  const length = Number(options.length) || 0;
  const circles = Number(options.circles) || 0;
  const zoom = Number(options.zoom) || 0;
  const rotation = Number(options.rotation) || 0;
  const tri = Number(options.tri) || 0;

  const firstPolygon = Math.trunc(clampNodeSliderValue(Math.trunc(start), 3, 20));
  const n = Math.trunc(clampNodeSliderValue(Math.trunc(length), 1, 20));
  const circleblend = clampNodeSliderValue(circles, 0.0001, 0.9999);

  let waveX = 0;
  let waveY = 0;

  const fphas = nodeGraphKeplerBouwkampTrisaw(state.phase, tri);
  const phasXN = fphas * n;
  const stepPhas = phasXN - Math.floor(phasXN);
  const polygonNumber = phasXN - stepPhas + firstPolygon;

  let polygonPhas = clampNodeSliderValue((stepPhas - circleblend) / (1 - circleblend), 0, 1);
  let circlePhas = clampNodeSliderValue(stepPhas / circleblend, 0, 1);
  if (stepPhas > circleblend) {
    circlePhas = 0;
  }

  const radIn = Math.cos(Math.PI / polygonNumber);
  let radInPrev = 1;
  if (polygonNumber > firstPolygon) {
    const iStart = Math.trunc(polygonNumber);
    for (let i = iStart; i > firstPolygon && (iStart - i) < 64; i--) {
      radInPrev *= Math.cos(Math.PI / (i - 1));
    }
  }

  let radInNext = 1;
  {
    const iStart = Math.trunc(polygonNumber);
    const iEnd = firstPolygon + n - 1;
    for (let i = iStart; i < iEnd && (i - iStart) < 64; i++) {
      radInNext *= Math.cos(Math.PI / (i + 1));
    }
  }

  let first = 0;
  const f001 = 0.5 / polygonNumber;
  if (polygonNumber === firstPolygon) {
    first = 1;
  } else if (circlePhas > 1 - f001) {
    circlePhas = nodeGraphKeplerBouwkampTrisaw((circlePhas - (1 - f001)) * 1 / f001, 0.5 + 0.5 * circleblend) * f001 + 1 - f001;
  }

  if (circlePhas !== 0) {
    const f003 = radIn + zoom * (1 - radIn);
    const arg = circlePhas + (first === 0 ? 1 : 0) * (1 - zoom) * 0.5 / (polygonNumber - 1) - zoom * first * f001;
    const f002Sin = Math.sin(arg * Math.PI * 2);
    const f002Cos = Math.cos(arg * Math.PI * 2);
    waveX = -f002Sin * f003;
    waveY = f002Cos * f003;
  }
  if (polygonPhas !== 0) {
    const shifted = polygonPhas + 1 - (1 - zoom) * 0.5 / polygonNumber;
    polygonPhas = shifted - Math.floor(shifted);
    const linePhasRaw = polygonPhas * polygonNumber;
    let linePhas = linePhasRaw - Math.floor(linePhasRaw);
    const lineNumber = Math.floor(linePhasRaw) + (polygonPhas !== 0 ? 1 : 0);

    if (polygonNumber !== (firstPolygon + n - 1)
        && lineNumber === polygonNumber
        && linePhas > 0.5 * zoom && linePhas < 0.5 + 0.5 * zoom) {
      linePhas = nodeGraphKeplerBouwkampTrisaw((linePhas - 0.5 * zoom) * 2, 1 - circleblend) / 2 + 0.5 * zoom;
    }

    const line = (linePhas * 2 - 1) * Math.sin(Math.PI / polygonNumber);

    const arg = lineNumber / polygonNumber;
    const f1Sin = Math.sin(arg * Math.PI * 2);
    const f1Cos = Math.cos(arg * Math.PI * 2);
    waveX = line * f1Cos + radIn * f1Sin;
    waveY = radIn * f1Cos - line * f1Sin;
  }

  const scale = zoom * radInPrev + (1 - zoom) * radInNext;
  waveX *= scale;
  waveY *= scale;

  const rotArg = rotation * (polygonNumber - firstPolygon);
  const rotSin = Math.sin(rotArg * Math.PI * 2);
  const rotCos = Math.cos(rotArg * Math.PI * 2);

  const x = waveX * rotCos + waveY * rotSin;
  const y = waveY * rotCos - waveX * rotSin;

  const phaseInc = Math.PI * 2 * frequency / sampleRateValue;
  state.phase = nodeGraphKeplerBouwkampWrapMod(state.phase + phaseInc, Math.PI * 2);

  return { x, y };
}
