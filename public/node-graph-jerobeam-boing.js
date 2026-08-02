function createNodeGraphBoingState() {
  return { phase: 0, zHistory: 0, resetWasHigh: false };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function nodeGraphBoingWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphBoingTrisaw(phase, warp) {
  return nodeGraphTrisaw(phase, warp);
}

function nodeGraphBoingSphere(fphas, dens, shape) {
  const formula001 = dens * Math.PI * 2 * fphas - 3 * dens;
  const sin001 = Math.sin(formula001 * Math.PI * 2);
  const cos001 = Math.cos(formula001 * Math.PI * 2);
  const formula002 = shape + (1 - shape) * Math.sin(Math.PI * (fphas + 1));
  return {
    x: -Math.cos(Math.PI * fphas),
    y: sin001 * formula002,
    z: cos001 * formula002,
  };
}

function nodeGraphBoingRotate(inX, inY, inZ, rotX, rotY) {
  const sinX = Math.sin(rotX * Math.PI * 2);
  const cosX = Math.cos(rotX * Math.PI * 2);
  const help11 = inX * cosX - inY * sinX;
  const help12 = inX * sinX + inY * cosX;
  const sinY = Math.sin(rotY * Math.PI * 2);
  const cosY = Math.cos(rotY * Math.PI * 2);
  const help21 = help11 * cosY - inZ * sinY;
  const help22 = help11 * sinY + inZ * cosY;
  return { x: help21, y: help12, z: help22 };
}

function nodeGraphBoingFunc(inX, inY, inZ, boing, strength) {
  const formula001 = 1 - Math.pow(boing, 2) * strength;
  return {
    x: inX * formula001,
    y: inY * formula001 * (1 - Math.pow(1 - boing, 4) * strength) + (Math.pow(boing, 0.8) * 2 - 1) * strength,
    z: inZ,
  };
}

function nodeGraphBoingRender(inX, inY, inZ, zdepth) {
  const zd = Math.pow(zdepth, 2) + 1;
  const exponent = -inZ - zd * 0.2;
  const factor = Math.pow(zd, exponent);
  return { l: inX * factor, r: inY * factor };
}

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamBoing.{h,cpp}
// (Jerobeam Fenderson's "Boing" Gen~ patch). Mirrors
// native_modules/jerobeam_boing, though this JS fallback uses exact
// Math.pow/Math.asin where the native WASM path uses a fast approximate
// pow (no libm under -nostdlib) -- expect close but not bit-identical
// agreement between the two paths for this module. Offline/JS path only,
// the realtime worklet prefers native WASM.
function nodeGraphBoingSample(options = {}) {
  const state = options.state || createNodeGraphBoingState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
    state.zHistory = 0;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const density = Number(options.density) || 0;
  const sharpness = Number(options.sharpness) || 0;
  const rotX = Number(options.rotX) || 0;
  const rotY = Number(options.rotY) || 0;
  const zDepth = Number(options.zDepth) || 0;
  const zAmount = Number(options.zAmount) || 0;
  const ends = Number(options.ends) || 0;
  const boing = Number(options.boing) || 0;
  const boingStrength = Number(options.boingStrength) || 0;
  const dir = Number(options.dir) || 0;
  const shape = Number(options.shape) || 0;
  const volume = Number(options.volume) || 0;
  const prejump = Number(options.volumePreJump) >= 0.5;

  const tri = sharpness * 0.5 + 0.5;
  const rotXTurns = (rotX + 90) / 360;
  const rotYTurns = rotY / 360;

  const zDarkness = Math.pow(zAmount * zAmount * 5 + 1, state.zHistory) + Math.pow(zAmount, 1.5) * 0.22;

  const fphasEnds = nodeGraphBoingTrisaw(state.phase, tri);
  const fphasMids = Math.asin((Math.asin(fphasEnds * 2 - 1) / Math.PI + 0.5) * 2 - 1) / Math.PI + 0.5;
  const fphas = ends * fphasMids + (1 - ends) * fphasEnds;

  let wave = nodeGraphBoingSphere(fphas, density, shape);
  wave = nodeGraphBoingRotate(wave.x, wave.y, wave.z, rotXTurns, rotYTurns);
  wave = nodeGraphBoingRotate(wave.x, wave.y, wave.z, -dir, 0);

  if (prejump) {
    wave.x *= volume;
    wave.y *= volume;
  }

  wave = nodeGraphBoingFunc(wave.x, wave.y, wave.z, boing, boingStrength);

  wave.y *= 1 - boingStrength * (0.5 + volume / 2) * (-Math.cos(dir * 8 * Math.PI) / 2 + 0.5) * Math.abs(Math.pow(wave.x * 0.75, 2)) * Math.pow(1 - boing, 5);

  wave = nodeGraphBoingRotate(wave.x, wave.y, wave.z, dir, 0);

  let { l: outL, r: outR } = nodeGraphBoingRender(wave.x, wave.y, wave.z, zDepth);

  if (!prejump) {
    outL *= volume;
    outR *= volume;
  }

  state.zHistory = wave.z;
  state.phase = nodeGraphBoingWrap01(state.phase + (frequency * zDarkness) / sampleRateValue);

  return { x: outL, y: outR };
}
