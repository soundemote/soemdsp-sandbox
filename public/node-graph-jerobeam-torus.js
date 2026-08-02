function createNodeGraphTorusState() {
  return {
    phase: 0,
    wanderPhase: 0,
    xPhase: 0,
    yPhase: 0,
    zPhase: 0,
    darkAnglePhase: 0,
    resetWasHigh: false,
  };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function nodeGraphTorusWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphTorusTrisaw(phase, warp) {
  return nodeGraphTrisaw(phase, warp);
}

function nodeGraphTorusSign(v) {
  return (v > 0 ? 1 : 0) - (v < 0 ? 1 : 0);
}

function nodeGraphTorusRotate(inX, inY, inZ, rotX, rotY, rotZ) {
  const sinX = Math.sin(rotX * Math.PI * 2);
  const cosX = Math.cos(rotX * Math.PI * 2);
  const help11 = inX * cosX - inY * sinX;
  const help12 = inX * sinX + inY * cosX;
  const sinY = Math.sin(rotY * Math.PI * 2);
  const cosY = Math.cos(rotY * Math.PI * 2);
  const help21 = help11 * cosY - inZ * sinY;
  const help22 = help11 * sinY + inZ * cosY;
  const sinZ = Math.sin(rotZ * Math.PI * 2);
  const cosZ = Math.cos(rotZ * Math.PI * 2);
  const help31 = help21 * cosZ - help12 * sinZ;
  const help32 = help21 * sinZ + help12 * cosZ;
  return { x: help31, y: help32, z: help22 };
}

function nodeGraphTorusRender(inX, inY, inZ, zaspx, zaspy, zdepth) {
  const formula001 = zdepth * (inZ / 2 + 0.5);
  const half = 0.5 * zaspx * zdepth;
  return {
    l: inX - formula001 * (inX - zaspx) - half,
    r: inY - formula001 * (inY + zaspy) + half,
  };
}

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamTorus.{h,cpp}
// (Jerobeam Fenderson's "Torus" Gen~ patch). Mirrors
// native_modules/jerobeam_torus exactly, including the reference's
// fixed-1Hz baseline ramp on the X/Y/Z rotator and dark-angle phasors (they
// have no exposed frequency setter, only a phase offset). Offline/JS path
// only, the realtime worklet prefers native WASM.
function nodeGraphTorusSample(options = {}) {
  const state = options.state || createNodeGraphTorusState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
    state.wanderPhase = 0;
    state.xPhase = 0;
    state.yPhase = 0;
    state.zPhase = 0;
    state.darkAnglePhase = 0;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const density = Number(options.density) || 0;
  const quantizeDensity = Number(options.quantizeDensity) >= 0.5;
  const subdensity = Number(options.subdensity) || 0;
  const quantizeSubDensity = Number(options.quantizeSubDensity) >= 0.5;
  const sharp = Number(options.sharp) || 0;
  const size = Number(options.size) || 0;
  const length = Number(options.length) || 0;
  const balance = Number(options.balance) || 0;
  const wander = Number(options.wander) || 0;
  const darkAngle = Number(options.darkAngle) || 0;
  const darkIntensity = Number(options.darkIntensity) || 0;
  const rotX = Number(options.rotX) || 0;
  const rotY = Number(options.rotY) || 0;
  const rotZ = Number(options.rotZ) || 0;
  const zAngleX = Number(options.zAngleX) || 0;
  const zAngleY = Number(options.zAngleY) || 0;
  const zDepth = Number(options.zDepth) || 0;

  const dense = quantizeDensity ? Math.floor(density) : density;
  const pow2Dense = dense * dense;
  const sdens = quantizeSubDensity
    ? Math.floor(pow2Dense * subdensity) * Math.PI * 2
    : pow2Dense * subdensity * Math.PI * 2;
  const div = size === 0 ? 1 : (1 / size);
  const volCorrect = 1 / (1 + size + size * div);
  const zdepthZ2 = zDepth / 2;
  const dank = Math.trunc(darkIntensity) * 2 + 1;
  const wanderFreq = dense === 0 ? 0 : (wander / dense);

  const dangle = nodeGraphTorusWrap01(state.darkAnglePhase + darkAngle) + 0.5;
  const rotXValue = -Math.PI * 2 * (nodeGraphTorusWrap01(state.xPhase + rotX) + 1);
  const rotYValue = Math.PI * 2 * nodeGraphTorusWrap01(state.yPhase + rotY) - Math.PI / 2;
  const rotZValue = Math.PI / 2 - Math.PI * 2 * nodeGraphTorusWrap01(state.zPhase + rotZ);

  const triphase = nodeGraphTorusTrisaw(state.phase, sharp);
  const phasRaw = triphase * length - rotXValue / (Math.PI * 2);
  const phas = phasRaw - Math.floor(phasRaw);

  const blend = Math.sin(rotYValue);
  const normPhas = phas * (1 - 0.5 * Math.abs(blend));
  const phasBipolar = phas * 2 - 1;
  const dankedPos = 0.5 * clampNodeSliderValue(blend, 0, 1) * (Math.pow(phasBipolar, dank) + 1) / 2;
  const phasPlusHalf = phas + 0.5;
  const phasPlusHalfWrapped = phasPlusHalf - Math.floor(phasPlusHalf);
  const dankedNeg = 0.5 * clampNodeSliderValue(-blend, 0, 1) * (0.5 * Math.pow(phasPlusHalfWrapped * 2 - 1, dank) + (nodeGraphTorusSign(phasBipolar) + 1) / 2);
  const phasor = normPhas + dankedPos + dankedNeg + 0.25 + rotXValue / (Math.PI * 2) + dangle;

  const sp0sin = Math.sin(phasor * Math.PI * 2);
  const sp0cos = Math.cos(phasor * Math.PI * 2);
  const spiral0X = sp0sin;
  const spiral0Y = sp0cos;
  const spiral0Z = 0;

  const sp1sin = Math.sin(dense * phasor * Math.PI * 2);
  const sp1cos = Math.cos(dense * phasor * Math.PI * 2);
  const formula001 = (1 - balance) / div;
  const formula002 = formula001 * sp1sin;
  const spiral1X = formula002 * sp0sin;
  const spiral1Y = formula002 * sp0cos;
  const spiral1Z = formula001 * sp1cos;

  const sp2sin = Math.sin(sdens * (phasor + state.wanderPhase) * Math.PI * 2);
  const sp2cos = Math.cos(sdens * (phasor + state.wanderPhase) * Math.PI * 2);
  const balZDivXDiv = balance / (div * div);
  const spiral2X = balZDivXDiv * (sp2cos * sp0cos + sp2sin * sp1sin * sp0sin);
  const spiral2Y = balZDivXDiv * (sp2cos * -sp0sin + sp2sin * sp1sin * sp0cos);
  const spiral2Z = balZDivXDiv * sp2sin * sp1cos;

  const formula003 = volCorrect + zdepthZ2 - volCorrect * zdepthZ2;
  let waveX = (spiral0X + spiral1X + spiral2X) * formula003;
  let waveY = (spiral0Y + spiral1Y + spiral2Y) * formula003;
  let waveZ = (spiral0Z + spiral1Z + spiral2Z) * formula003;

  const rotated = nodeGraphTorusRotate(waveX, waveY, waveZ, rotXValue, rotYValue, rotZValue);
  waveX = rotated.x;
  waveY = rotated.y;
  waveZ = rotated.z;

  const rendered = nodeGraphTorusRender(waveX, waveY, waveZ, zAngleX, zAngleY, zDepth);

  state.phase = nodeGraphTorusWrap01(state.phase + frequency / sampleRateValue);
  state.wanderPhase = nodeGraphTorusWrap01(state.wanderPhase + wanderFreq / sampleRateValue);
  state.xPhase = nodeGraphTorusWrap01(state.xPhase + 1 / sampleRateValue);
  state.yPhase = nodeGraphTorusWrap01(state.yPhase + 1 / sampleRateValue);
  state.zPhase = nodeGraphTorusWrap01(state.zPhase + 1 / sampleRateValue);
  state.darkAnglePhase = nodeGraphTorusWrap01(state.darkAnglePhase + 1 / sampleRateValue);

  return { x: rendered.l, y: rendered.r };
}
