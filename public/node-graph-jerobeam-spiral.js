function createJerobeamSpiralState() {
  return {
    morph: 0,
    phase: 0,
    position: 0,
    rotX: 0,
    rotY: 0,
    zHistory: 0,
  };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function spiralWrap01(value) {
  return nodeGraphWrap01(value);
}

function spiralFmod(value, divisor) {
  return value - Math.trunc(value / divisor) * divisor;
}

function spiralTrisaw(phase, sharp) {
  return nodeGraphTrisaw(phase, sharp);
}

function spiralNextPhasor(state, key, frequency, offset, sampleRate, bipolar = false) {
  const base = Number(state[key]) || 0;
  const current = spiralWrap01(base + offset);
  state[key] = spiralWrap01(base + frequency / sampleRate);
  return bipolar ? current * 2 - 1 : current;
}

function spiralRotate(inX, inY, inZ, rotX, rotY) {
  const cosRotX = Math.cos(rotX);
  const sinRotX = Math.sin(rotX);
  const cosRotY = Math.cos(rotY);
  const sinRotY = Math.sin(rotY);
  const help11 = inX * cosRotX - inY * sinRotX;
  const help12 = inX * sinRotX + inY * cosRotX;
  const help21 = help11 * cosRotY - inZ * sinRotY;
  const help22 = help11 * sinRotY + inZ * cosRotY;
  return { x: help12, y: help21, z: help22 };
}

function spiralShape(lophas, phasor, dense, div, morph) {
  const clampMorph01 = clampNodeSliderValue(morph, 0, 1);
  const clampMorph02 = clampNodeSliderValue(morph, 0, 2);
  const formula001 = nodeGraphPiOver2 * (lophas - 0.5) * clampMorph02 + nodeGraphPiOver4;
  let loSin = Math.sin(formula001);
  let loCos = Math.cos(formula001);
  const loX = 0;
  const formula002 = Math.pow(clampMorph01, 2);
  const oneZDiv = 1 / div;
  const loY = formula002 * (1 - oneZDiv * loSin);
  const loZ = formula002 * (1 - oneZDiv * loCos);

  const formula003 = Math.PI / (2 + 6 * (1 - clampMorph01)) * (lophas - 0.5) * clampMorph02 + nodeGraphPiOver4;
  loSin = Math.sin(formula003);
  loCos = Math.cos(formula003);

  const tauPhasor = nodeGraphTau * phasor;
  const sp0Sin = Math.sin(tauPhasor);
  const sp0Cos = Math.cos(tauPhasor);
  const spiral0X = sp0Sin;
  const spiral0Y = sp0Cos * loSin;
  const spiral0Z = sp0Cos * loCos;

  let sp1Sin = Math.sin(dense * tauPhasor - nodeGraphPiOver2);
  const sp1Cos = Math.cos(dense * tauPhasor - nodeGraphPiOver2);
  sp1Sin *= -1;
  const sp1SinTimesSp0Sin = sp1Sin * sp0Sin;
  const spiral1X = div * sp1SinTimesSp0Sin;
  const spiral1Y = div * ((sp1Sin * sp0Cos) * loSin + sp1Cos * loCos);
  const spiral1Z = div * (sp1Cos * -loSin + (sp1Sin * sp0Cos) * loCos);

  let sp2Cos = Math.sin(dense * dense * nodeGraphTau * phasor);
  const sp2Sin = Math.cos(dense * dense * nodeGraphTau * phasor);
  sp2Cos *= -1;
  const divSquared = div * div;
  const spiral2X = divSquared * (sp2Cos * sp0Cos + sp2Sin * sp1SinTimesSp0Sin);
  const spiral2Y = divSquared * ((sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loSin + (sp2Sin * sp1Cos) * loCos);
  const spiral2Z = divSquared * ((sp2Sin * sp1Cos) * -loSin + (sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loCos);

  let waveX = loX + spiral0X + spiral1X + spiral2X;
  let waveY = loY + spiral0Y + spiral1Y + spiral2Y;
  let waveZ = loZ + spiral0Z + spiral1Z + spiral2Z;
  let x = Math.exp(morph * Math.log(div));
  waveX *= x;
  waveY *= x;
  waveZ *= x;

  let y = 0;
  const formula004 = Math.exp(morph * Math.log(dense)) / 4;
  if (formula004 < 1) {
    y = Math.pow(1 - formula004, 2);
  }
  x = x * Math.sin(nodeGraphPiOver4) * y;
  waveX -= x;
  waveY += x;

  return spiralRotate(waveX, waveY, waveZ, 0, 0);
}

function spiralRender(inX, inY, inZ, zDepth) {
  const formula = zDepth * 1.25 * (inZ / 2 + 0.5);
  const multiplier = 1 + zDepth;
  return {
    left: (inX - formula * inX) * multiplier,
    right: (inY - formula * inY) * multiplier,
  };
}

function jerobeamSpiralSample(options) {
  const {
    density,
    frequency,
    morph,
    morphSpeed,
    position,
    positionSpeed,
    rotX,
    rotXSpeed,
    rotY,
    rotYSpeed,
    sampleRate,
    sharp,
    sharpCurve,
    sharpCurveMult,
    size,
    state,
    zAmount,
    zDepth,
  } = options;
  const dense = Math.max(Math.abs(density), 1e-6);
  const div = Math.max(size, 0.1);
  const logDense = Math.log(dense);
  const zDarkness = Math.pow(Math.pow(zAmount, 2) * 5 + 1, state.zHistory || 0);
  const mainPhasor = spiralNextPhasor(state, "phase", frequency * zDarkness, 0, sampleRate);
  const fphasEnds = spiralTrisaw(mainPhasor, sharp);
  const fphasMids = sharpCurveMult * (Math.asin((Math.asin(fphasEnds * 2 - 1) / Math.PI + 0.5) * 2 - 1) / Math.PI + 0.5);
  const lophas = sharpCurve * fphasMids + (1 - sharpCurve) * fphasEnds;
  const morphPhasor = spiralNextPhasor(state, "morph", morphSpeed, morph, sampleRate, true) + 0.5;
  let morph2 = morphPhasor + 1;
  if (morph2 > 1.5) {
    morph2 -= 2;
  }
  const fmodLophas = spiralFmod(lophas - 0.5, 1);
  let phas = spiralFmod(fmodLophas * Math.exp(morphPhasor * logDense) / 4 + 0.375, 1);
  const phas2 = spiralFmod(fmodLophas * Math.exp(morph2 * logDense) / 4 + 0.375, 1);
  phas += spiralNextPhasor(state, "position", positionSpeed, position, sampleRate);
  const wave1 = spiralShape(lophas, phas, dense, div, morphPhasor);
  const wave2 = spiralShape(lophas, phas2, dense, div, morph2);
  const switchAmount = Math.sin(Math.PI * morphPhasor) / 2 + 0.5;
  let waveX = wave1.x * switchAmount + wave2.x * (1 - switchAmount);
  let waveY = wave1.y * switchAmount + wave2.y * (1 - switchAmount);
  let waveZ = wave1.z * switchAmount + wave2.z * (1 - switchAmount);
  let volumeCorrection = 1 / (1 + div + div * div);
  const halfZDepth = zDepth / 2;
  volumeCorrection = volumeCorrection + halfZDepth - volumeCorrection * halfZDepth;
  waveX *= volumeCorrection;
  waveY *= volumeCorrection;
  waveZ *= volumeCorrection;
  waveY += 0.25;
  waveZ += 0.36;
  const rotated = spiralRotate(
    waveX,
    waveY,
    waveZ,
    -nodeGraphTau * spiralNextPhasor(state, "rotX", rotXSpeed, rotX, sampleRate),
    nodeGraphTau * spiralNextPhasor(state, "rotY", rotYSpeed, rotY, sampleRate) - nodeGraphPiOver2,
  );
  const stereo = spiralRender(rotated.x, rotated.y, rotated.z, zDepth);
  state.zHistory = rotated.z;
  return { ...stereo, x: rotated.x, y: rotated.y, z: rotated.z };
}
