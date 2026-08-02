function createNodeGraphMushroomState() {
  return { phase: 0, capRotRamp: 0, clusterRotRamp: 0, resetWasHigh: false };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function nodeGraphMushroomWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphMushroomTrisaw(phase, warp) {
  return nodeGraphTrisaw(phase, warp);
}

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamMushroom.{h,cpp}
// (Jerobeam Fenderson's "Mushroom" Gen~ patch). Mirrors
// native_modules/jerobeam_mushroom exactly. Offline/JS path only, the
// realtime worklet prefers native WASM.
function nodeGraphMushroomSample(options = {}) {
  const state = options.state || createNodeGraphMushroomState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
    state.capRotRamp = 0;
    state.clusterRotRamp = 0;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const phaseOffset = Number(options.phaseOffset) || 0;
  const numMushroomsRaw = Number(options.numMushrooms) || 0;
  const grow = Number(options.grow) || 0;
  const density = Number(options.density) || 0;
  const capRotation = Number(options.capRotation) || 0;
  const stemRotationSpeed = Number(options.stemRotationSpeed) || 0;
  const head = Number(options.head) || 0;
  const spread = Number(options.spread) || 0;
  const wobble = Number(options.wobble) || 0;
  const clusterRotation = Number(options.clusterRotation) || 0;
  const clusterRotationSpeed = Number(options.clusterRotationSpeed) || 0;
  const sharp = Number(options.sharp) || 0;
  const width = Number(options.width) || 0;
  const stem = Number(options.stem) || 0;
  const apart = Number(options.apart) || 0;
  const capStemTransition = Number(options.capStemTransition) || 0;

  const nom = clampNodeSliderValue(numMushroomsRaw, -5, 5) || 1;
  const nomTrunc = nom === 0 ? 1 : Math.trunc(nom);
  const phasorFreq = nomTrunc < 0 ? (frequency / nomTrunc * 0.5) : (frequency * 0.5);
  const safeSharp = sharp * 0.5 + 0.5;
  const safeSpread = spread * 4;

  const phas = nodeGraphMushroomWrap01(state.phase + phaseOffset * 0.5);
  const caprot = nodeGraphMushroomWrap01(state.capRotRamp + capRotation);
  const stemrot = nodeGraphMushroomWrap01(state.clusterRotRamp + clusterRotation);

  const phasXNomX2 = phas * nomTrunc * 2;
  const ph = nodeGraphMushroomTrisaw(phasXNomX2, safeSharp) * grow;
  const stair = Math.floor(phasXNomX2) / nomTrunc;
  const phuk = nodeGraphMushroomWrap01(ph * wobble + stair);

  const formulaSin = Math.sin((ph - caprot) * density * Math.PI * 2);
  const formulaCos = Math.cos((ph - caprot) * density * Math.PI * 2);

  let shroomX = formulaSin * width;
  let shroomY = -formulaCos * width;

  const sinPhTau = Math.sin(ph * Math.PI * 2);
  const shroomHeadX = shroomX * sinPhTau * 0.5;
  const densClamped = clampNodeSliderValue(density, 0, 10);
  const shroomHeadY = shroomY * 0.1 * sinPhTau * densClamped / 10;

  const shroomStemX = shroomX * -0.4 * stem;
  const shroomStemY = shroomY * -0.1 * stem;

  if (ph > head) {
    shroomX = shroomHeadX;
    shroomY = shroomHeadY;
  } else if (ph > (1 - capStemTransition) * head) {
    const oneMTransXHead = (1 - capStemTransition) * head;
    const formula2 = (ph - oneMTransXHead) / (head - oneMTransXHead);
    shroomX = shroomHeadX * formula2 + shroomStemX * (1 - formula2);
    shroomY = shroomHeadY * formula2 + shroomStemY * (1 - formula2);
  } else {
    shroomX = shroomStemX;
    shroomY = shroomStemY;
  }

  shroomX += ph * Math.cos((phuk + stemrot - 0.25) * Math.PI * 2) * 0.5 * safeSpread;
  shroomY += ph * 2 - 1;

  const dual = ((phas >= 0.5 ? 1 : 0) * 2 - 1) * apart;
  shroomX += shroomX + dual;

  if (nomTrunc > 0) {
    shroomX = -shroomX;
  }

  state.phase = nodeGraphMushroomWrap01(state.phase + phasorFreq / sampleRateValue);
  state.capRotRamp = nodeGraphMushroomWrap01(state.capRotRamp + stemRotationSpeed / sampleRateValue);
  state.clusterRotRamp = nodeGraphMushroomWrap01(state.clusterRotRamp + clusterRotationSpeed / sampleRateValue);

  return { x: shroomX, y: shroomY };
}
