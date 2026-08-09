function createNodeGraphNyquistShannonState() {
  return {
    phase: 0,
    rotatorPhase: 0,
    lastFphas: 0,
    hasLastFphas: false,
    toneSmoothCurrent: 0,
    toneSmoothInit: false,
    cachedFreqA: NaN,
    cachedFreqToPitch: 0,
    hasCachedFreqToPitch: false,
    resetWasHigh: false,
  };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local names keep port call-sites stable.
function nodeGraphNyquistShannonWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphNyquistShannonTrisaw(phase, warp) {
  return nodeGraphTrisaw(phase, warp);
}

function nodeGraphNyquistShannonFreqToPitch(freq) {
  return 12 * Math.log2(freq / 440) + 69;
}

function nodeGraphNyquistShannonFreqToPitchCached(state, userFreqA) {
  const absFreq = Math.abs(userFreqA);
  if (state.hasCachedFreqToPitch && state.cachedFreqA === absFreq) {
    return state.cachedFreqToPitch;
  }
  const value = nodeGraphNyquistShannonFreqToPitch(absFreq) - 48;
  state.cachedFreqA = absFreq;
  state.cachedFreqToPitch = value;
  state.hasCachedFreqToPitch = true;
  return value;
}

// Offline/JS path mirrors native_modules/jerobeam_nyquist_shannon:
// turns-domain sin (via Math.sin(2π·t) — no giant table), Rate floor, skip
// log2/smoother when the active tone mode does not need them.
// Realtime worklet prefers native WASM (same math).
function nodeGraphNyquistShannonSample(options = {}) {
  const state = options.state || createNodeGraphNyquistShannonState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
    state.rotatorPhase = 0;
    state.hasLastFphas = false;
    state.toneSmoothInit = false;
    state.hasCachedFreqToPitch = false;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequencyA = Number(options.frequencyA) || 0;
  const midiNoteRaw = Number(options.midiNoteRaw) || 0;
  const rateRaw = Number(options.rate) || 0;
  const sampleDots = Number(options.sampleDots) || 0;
  const phaseOffset = Number(options.phaseOffset) || 0;
  const frequencyB = Number(options.frequencyB) || 0;
  const subPhase = Number(options.subPhase) || 0;
  const subPhaseRotationSpeed = Number(options.subPhaseRotationSpeed) || 0;
  const tone = Number(options.tone) || 0;
  const toneSmoothTime = Number(options.toneSmoothTime) || 0;
  const artifact = Number(options.artifact) || 0;
  const enableToneModPitch = Number(options.enableToneModPitch) || 0;
  const enableToneModFreq = Number(options.enableToneModFreq) || 0;
  const enableToneModNote = Number(options.enableToneModNote) || 0;

  const userFreqA = frequencyA;
  const pitch = frequencyB;
  const phasorFreq = userFreqA * pitch;
  const sr = rateRaw < 1e-9 ? 1e-9 : rateRaw;
  const blend = 1 / (1 - sampleDots + 0.001);
  const tri = clampNodeSliderValue(1 - artifact, 0.001, 0.999);

  const toneMode =
    (enableToneModNote >= 0.5 ? 1 : 0)
    + (enableToneModPitch >= 0.5 ? 2 : 0)
    + (enableToneModFreq >= 0.5 ? 4 : 0);

  const mainPhas = nodeGraphNyquistShannonWrap01(state.phase + phaseOffset);
  const fphas = nodeGraphNyquistShannonTrisaw(mainPhas, tri);

  const fphasSr = fphas * sr;
  const stairIndex = Math.floor(fphasSr);
  const stair = stairIndex / sr;
  const fmodFphasSr = fphasSr - stairIndex;
  const phas = clampNodeSliderValue(blend * fmodFphasSr, 0, 1) / sr + stair;

  const waveX = phas * 2 - 1;

  let actualTone = tone;
  if (toneMode !== 0) {
    const needsSmooth = (toneMode & 3) !== 0;
    const needsFreqPitch = (toneMode & 4) !== 0;
    let smoothPart = 0;
    if (needsSmooth) {
      const smoothSamples = toneSmoothTime > 0 ? toneSmoothTime * sampleRateValue : 1;
      const smoothStep = smoothSamples > 0 ? (1 / smoothSamples) : 1;
      const midiNote = midiNoteRaw - 48;
      let target = 0;
      switch (toneMode & 3) {
        case 1: target = midiNote; break;
        case 2: target = pitch - 1; break;
        case 3: target = (pitch - 1) + midiNote; break;
        default: break;
      }
      if (toneMode === 5) target = midiNote * 0.5;
      else if (toneMode === 7) target = (pitch - 1) + midiNote * 0.5;

      if (!state.toneSmoothInit) {
        state.toneSmoothCurrent = target;
        state.toneSmoothInit = true;
      } else if (state.toneSmoothCurrent < target) {
        state.toneSmoothCurrent = target - state.toneSmoothCurrent > smoothStep
          ? state.toneSmoothCurrent + smoothStep
          : target;
      } else if (state.toneSmoothCurrent > target) {
        state.toneSmoothCurrent = state.toneSmoothCurrent - target > smoothStep
          ? state.toneSmoothCurrent - smoothStep
          : target;
      }
      smoothPart = state.toneSmoothCurrent;
    }
    let freqPart = 0;
    if (needsFreqPitch) {
      const ftp = nodeGraphNyquistShannonFreqToPitchCached(state, userFreqA);
      freqPart = (toneMode === 5 || toneMode === 7) ? ftp * 0.5 : ftp;
    }
    actualTone = tone + smoothPart + freqPart;
  }

  const rotTurns = nodeGraphNyquistShannonWrap01(state.rotatorPhase - subPhase);
  const tau = Math.PI * 2;

  const wasFirstSample = !state.hasLastFphas;
  const changed = wasFirstSample
    ? 0
    : (state.lastFphas > fphas ? 1 : (state.lastFphas < fphas ? -1 : 0));
  state.lastFphas = fphas;
  state.hasLastFphas = true;

  let waveY;
  if (changed === 1) {
    waveY = Math.sin((actualTone * phas + rotTurns) * tau);
  } else {
    // -cos(2π · sr·phas/2) · sin(2π · (phas·(sr/2 − tone) − rot))
    const halfSrPhas = 0.5 * sr * phas;
    const toneTurns = phas * (0.5 * sr - actualTone) - rotTurns;
    waveY = -Math.cos(halfSrPhas * tau) * Math.sin(toneTurns * tau);
  }

  state.phase = nodeGraphNyquistShannonWrap01(state.phase + phasorFreq / sampleRateValue);
  state.rotatorPhase = nodeGraphNyquistShannonWrap01(state.rotatorPhase + (-subPhaseRotationSpeed) / sampleRateValue);

  return { x: waveX, y: waveY };
}
