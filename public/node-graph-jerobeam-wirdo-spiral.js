function createNodeGraphWirdoSpiralState() {
  return { phase: 0, splashPhase: 0, resetWasHigh: false };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function nodeGraphWirdoSpiralWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphWirdoSpiralTrisaw(phase, warp) {
  return nodeGraphTrisaw(phase, warp);
}

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamWirdoSpiral.{h,cpp}
// (Jerobeam Fenderson's "WirdoSpiral" Gen~ patch). Mirrors
// native_modules/jerobeam_wirdo_spiral exactly; offline/JS path only, the
// realtime worklet prefers native WASM.
function nodeGraphWirdoSpiralSample(options = {}) {
  const state = options.state || createNodeGraphWirdoSpiralState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
    state.splashPhase = 0;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const sharp = clampNodeSliderValue(Number(options.sharp) || 0, 0, 1);
  const cross = Number(options.cross) || 0;
  const density = Number(options.density) || 0;
  const length = Number(options.length) || 0;
  const rotate = Number(options.rotate) || 0;
  const splashDepth = Number(options.splashDepth) || 0;
  const splashDensity = Number(options.splashDensity) || 0;
  const cut = Number(options.cut) || 0;
  const scrap = Number(options.scrap) || 0;
  const ringCut = Number(options.ringCut) || 0;
  const splashSpeed = Number(options.splashSpeed) || 0;
  const syncCut = Number(options.syncCut) || 0;

  const dens = density * Math.PI * 2;
  const safeScrap = clampNodeSliderValue(scrap, 0.0001, 1);
  const safeCut = Math.trunc(cut + 0.5);

  let phas = state.phase;
  if (safeCut < 1000 && safeCut > 0) {
    phas = Math.trunc(phas * safeCut) / safeCut;
  }

  const crossRot = (phas > sharp ? 1 : 0) * cross * Math.PI * 2 - cross * Math.PI;
  let crossPhas = nodeGraphWirdoSpiralTrisaw(phas, sharp);
  if (syncCut < 1) {
    const denom = clampNodeSliderValue(Math.abs(dens) * syncCut, 1, 1000);
    crossPhas = Math.trunc(crossPhas * denom) / denom;
  }
  const crossbow = crossPhas * length - clampNodeSliderValue(length - 1, 0, 1);

  const crossX = crossbow * Math.cos(crossRot);
  const crossY = crossbow * Math.sin(crossRot);

  const spirot = crossbow * dens;
  const spirotX = crossX * Math.cos(spirot) + crossY * Math.sin(spirot);
  const spirotY = crossY * Math.cos(spirot) - crossX * Math.sin(spirot);

  let splash = Math.sin(nodeGraphWirdoSpiralTrisaw(phas * splashDensity + state.splashPhase, 1) * Math.PI * 2 * safeScrap);
  if (safeScrap < 0.25) {
    const denom = Math.sin(safeScrap * Math.PI * 2);
    splash = denom !== 0 ? splash / denom : 0;
  }
  if (safeScrap < 0.5) {
    splash = splash * 2 - 1;
  } else if (safeScrap < 0.75) {
    const s2 = Math.sin(safeScrap * Math.PI * 2);
    splash = splash * (2 + s2) - (s2 + 1) * (1 + s2);
  }
  if (ringCut < 10 && ringCut > 0) {
    splash = Math.trunc(splash * ringCut) / ringCut;
  }

  const x = spirotX;
  const y = spirotY * Math.cos(rotate * Math.PI * 0.5) + splash * splashDepth;

  state.phase = nodeGraphWirdoSpiralWrap01(state.phase + frequency / sampleRateValue);
  state.splashPhase = nodeGraphWirdoSpiralWrap01(state.splashPhase + splashSpeed / sampleRateValue);

  return { x, y };
}
