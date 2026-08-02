function createNodeGraphRadarState() {
  return {
    phase: 0,
    rotatorPhase: 0,
    resetWasHigh: false,
  };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function nodeGraphRadarWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphRadarTrisaw(phase, warp) {
  return nodeGraphTrisaw(phase, warp);
}

function nodeGraphRadarSign(v) {
  return (v > 0 ? 1 : 0) - (v < 0 ? 1 : 0);
}

function nodeGraphRadarUpdateXY(x, y) {
  const x_ = Math.sin(x * (Math.PI / 4 + (1 - Math.abs(y)) * (Math.PI / 4)));
  const y_ = y * Math.cos(x * (Math.PI / 4));
  const r = (nodeGraphRadarSign(y_) + (y_ === 0 ? 1 : 0)) * Math.sqrt(x_ * x_ + y_ * y_);
  const ph = y_ !== 0 ? Math.atan(x_ / y_) : (Math.PI / 2) * nodeGraphRadarSign(x_);
  return { ph, r };
}

function nodeGraphRadarRender(options) {
  const {
    inPhas, tri1, pow1, pow1Up, pow1Down, phaseInv, dens, frontring, tunnelInv, length,
    spiralReturn, tri2, pow2, rot, lap, ration, pow2Bend, ringcut, ph, r, size, x, y, ratio,
  } = options;

  let phas = nodeGraphRadarTrisaw(inPhas, tri1);
  if (phaseInv) phas = 1 - nodeGraphRadarTrisaw(inPhas, tri1);

  if ((pow1Up && inPhas < tri1) || (pow1Down && inPhas >= tri1)) {
    phas = Math.pow(phas, pow1);
  }

  phas = phas * (dens + frontring / ((tunnelInv ? 1 : 0) + (tunnelInv ? 0 : 1) * length)) / dens;

  let sphas = phas;
  if (inPhas > tri1 && spiralReturn) sphas = 2 - phas;

  const sinPhas = clampNodeSliderValue(Math.pow(nodeGraphRadarTrisaw(sphas * length * dens, tri2), pow2), -1e100, 1e100);

  const f002Arg = (sinPhas - (tunnelInv ? 1 : 0) * frontring - rot / lap - (tunnelInv ? 0 : 1) * length * dens) * lap;
  const f002Sin = Math.sin(f002Arg * Math.PI * 2);
  const f002Cos = Math.cos(f002Arg * Math.PI * 2);
  const lilsin = f002Cos * ration;
  const lilcos = f002Sin * ration;

  phas *= length;
  phas = (pow2Bend ? 0 : 1) * (Math.floor(phas * dens) / dens + sinPhas / dens) + (pow2Bend ? 1 : 0) * phas;

  if (ringcut) {
    phas = (Math.floor(phas * dens + (tunnelInv ? 1 : 0) * (1 - frontring)) + rot - (tunnelInv ? 1 : 0) * (1 - frontring)) / dens;
  }

  if (!tunnelInv) {
    phas = 1 - phas - (1 - length) + frontring / dens;
  }

  phas = clampNodeSliderValue(phas - frontring / dens, 0, 1);

  const phSinNeg = Math.sin(-ph * Math.PI * 2);
  const phCosNeg = Math.cos(-ph * Math.PI * 2);
  const lilsin1 = lilsin * phSinNeg + lilcos * phCosNeg;
  const lilcos1 = lilcos * phSinNeg - lilsin * phCosNeg;

  const f003Sin = Math.sin(phas * Math.abs(r) * Math.PI * 2);
  const f003Cos = Math.cos(phas * Math.abs(r) * Math.PI * 2);
  const bigsin = f003Cos;
  const bigcos = -f003Sin;

  const lilX = lilsin1 * bigsin;
  const lilY = lilcos1;
  const lilZ = lilsin1 * bigcos * nodeGraphRadarSign(r);

  let bigX = 0;
  let bigY = 0;
  let bigZ = -Math.PI * 2 * phas;
  if (r !== 0) {
    bigZ = bigcos / Math.abs(r);
    bigX = (bigsin - 1) / r;
  }

  const waveX1 = bigX + lilX;
  const waveY1 = bigY + lilY;
  const waveZ2raw = bigZ + lilZ;

  const phSin = Math.sin(ph * Math.PI * 2);
  const phCos = Math.cos(ph * Math.PI * 2);
  let waveX = waveX1 * phSin + waveY1 * phCos;
  let waveY2 = waveY1 * phSin - waveX1 * phCos;
  let waveZ2 = waveZ2raw;

  const syz = 2 * (size + 0.33) * (Math.abs(x) * (1 - y) + 0.5);
  waveX = size * waveX + (1 - size) * (waveX + x * (1 - ratio) + x * ratio) * syz;
  waveY2 = size * waveY2 + (1 - size) * (waveY2 - y) * syz;
  waveZ2 = size * waveZ2 + (1 - size) * waveZ2 * syz;

  const sizArg = (1 - size) * (Math.PI / 2);
  const sizSin = Math.sin(sizArg * Math.PI * 2);
  const sizCos = Math.cos(sizArg * Math.PI * 2);
  const waveY = waveY2 * sizCos + waveZ2 * sizSin;
  const waveZ = waveZ2 * sizCos - waveY2 * sizSin;

  return { x: waveX, y: waveY, z: waveZ };
}

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamRadar.{h,cpp}
// (Jerobeam Fenderson's "Radar" Gen~ patch). Mirrors
// native_modules/jerobeam_radar exactly, including the reference's
// fixed-1Hz baseline ramp on the rotator phasor (it has no exposed
// frequency setter, only a phase offset -- same quirk as Torus). This JS
// fallback uses exact Math.atan/Math.pow where the native WASM path uses
// fast bit-trick / minimax-polynomial approximations (no libm under
// -nostdlib) -- expect close but not bit-identical agreement. Offline/JS
// path only, the realtime worklet prefers native WASM.
function nodeGraphRadarSample(options = {}) {
  const state = options.state || createNodeGraphRadarState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
    state.rotatorPhase = 0;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const phaseOffset = Number(options.phaseOffset) || 0;
  const density = Number(options.density) || 0;
  const sharp = Number(options.sharp) || 0;
  const fade = Number(options.fade) || 0;
  const rotation = Number(options.rotation) || 0;
  const direction = Number(options.direction) || 0;
  const shade = Number(options.shade) || 0;
  const lap = Number(options.lap) || 0;
  const ringcut = Number(options.ringcut) >= 0.5;
  const pow1Up = Number(options.pow1Up) >= 0.5;
  const pow1Down = Number(options.pow1Down) >= 0.5;
  const pow2Bend = Number(options.pow2Bend) >= 0.5;
  const phaseInv = Number(options.phaseInv) >= 0.5;
  const tunnelInv = Number(options.tunnelInv) >= 0.5;
  const spiralReturn = Number(options.spiralReturn) >= 0.5;
  const length = Number(options.length) || 0;
  const ratio = Number(options.ratio) || 0;
  const frontring = Number(options.frontring) || 0;
  const zoom = Number(options.zoom) || 0;
  const zDepth = Number(options.zDepth) || 0;
  const inner = Number(options.inner) || 0;
  const x = Number(options.x) || 0;
  const y = Number(options.y) || 0;

  const tri1 = sharp * 0.5 + 0.5;
  const pow1 = fade;
  const tri2 = direction;
  const pow2 = clampNodeSliderValue(shade, -80, 80);
  const safeLap = Math.max(1e-6, lap + 1);
  const ration = ratio + 0.1;
  let dens = (ringcut ? Math.floor(density) : density) + 1e-6;
  dens = Math.min(dens, 1e6);
  const size = zoom;
  const xz = 1 - zoom;
  const yFixForZoom = xz + (xz - Math.pow(xz, 6));

  const rx = -x;
  const ry = y;
  const { ph, r } = nodeGraphRadarUpdateXY(rx, ry);

  const inPhas = nodeGraphRadarWrap01(state.phase + phaseOffset);
  const rot = nodeGraphRadarWrap01(state.rotatorPhase + rotation);

  const wave = nodeGraphRadarRender({
    inPhas, tri1, pow1, pow1Up, pow1Down, phaseInv, dens, frontring, tunnelInv, length,
    spiralReturn, tri2, pow2, rot, lap: safeLap, ration, pow2Bend, ringcut, ph, r, size,
    x: rx, y: ry, ratio,
  });

  const depth = (1 - zDepth) * (1 - Math.abs(wave.z) / (Math.PI * 2)) + zDepth * Math.pow(zDepth * 9 + 1, wave.z);
  const f001 = (depth * (1 - inner) + inner) / ((1 - size) + size * ration);
  const outX = wave.x * f001;
  const outY = wave.y * f001 + yFixForZoom;

  state.phase = nodeGraphRadarWrap01(state.phase + frequency / sampleRateValue);
  state.rotatorPhase = nodeGraphRadarWrap01(state.rotatorPhase + 1 / sampleRateValue);

  return { x: outX, y: outY };
}
