function createNodeGraphNyquistShannonState() {
  return {
    phase: 0,
    rotatorPhase: 0,
    lastFphas: 0,
    hasLastFphas: false,
    toneSmoothCurrent: 0,
    toneSmoothInit: false,
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

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamNyquistShannon.{h,cpp}
// (Jerobeam Fenderson's "Nyquist-Shannon" Gen~ patch). Mirrors
// native_modules/jerobeam_nyquist_shannon exactly, though this JS fallback
// uses exact Math.log2 where the native WASM path uses a fast bit-trick
// approximation (no libm under -nostdlib) -- expect close but not
// bit-identical agreement for the tone-mode-4+ paths that use it.
// Offline/JS path only, the realtime worklet prefers native WASM.
function nodeGraphNyquistShannonSample(options = {}) {
  const state = options.state || createNodeGraphNyquistShannonState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
    state.rotatorPhase = 0;
    state.hasLastFphas = false;
    state.toneSmoothInit = false;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequencyA = Number(options.frequencyA) || 0;
  const midiNoteRaw = Number(options.midiNoteRaw) || 0;
  const rate = Number(options.rate) || 0;
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
  const midiNote = midiNoteRaw - 48;
  const sr = rate;
  const blend = 1 / (1 - sampleDots + 0.001);
  const tri = clampNodeSliderValue(1 - artifact, 0.001, 0.999);
  const freqToPitch = nodeGraphNyquistShannonFreqToPitch(Math.abs(userFreqA)) - 48;

  const toneMode = (enableToneModNote >= 0.5 ? 1 : 0) + (enableToneModPitch >= 0.5 ? 2 : 0) + (enableToneModFreq >= 0.5 ? 4 : 0);

  const mainPhas = nodeGraphNyquistShannonWrap01(state.phase + phaseOffset);
  const fphas = nodeGraphNyquistShannonTrisaw(mainPhas, tri);

  const stair = Math.floor(fphas * sr) / sr;
  const fmodFphasSr = (fphas * sr) - Math.floor(fphas * sr);
  const phas = clampNodeSliderValue(blend * fmodFphasSr, 0, 1) / sr + stair;

  const waveX = phas * 2 - 1;
  let waveY = 0;

  const smoothSamples = toneSmoothTime > 0 ? toneSmoothTime * sampleRateValue : 1;
  const smoothStep = smoothSamples > 0 ? (1 / smoothSamples) : 1;

  const runSmoother = (target) => {
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
    return state.toneSmoothCurrent;
  };

  let actualTone;
  switch (toneMode) {
    case 0: actualTone = tone; break;
    case 1: actualTone = tone + runSmoother(midiNote); break;
    case 2: actualTone = tone + runSmoother(pitch - 1); break;
    case 3: actualTone = tone + runSmoother((pitch - 1) + midiNote); break;
    case 4: actualTone = tone + freqToPitch; break;
    case 5: actualTone = tone + runSmoother(midiNote * 0.5) + freqToPitch * 0.5; break;
    case 6: actualTone = tone + runSmoother(pitch - 1) + freqToPitch; break;
    default: actualTone = tone + runSmoother((pitch - 1) + midiNote * 0.5) + freqToPitch * 0.5; break;
  }

  const psXPi = nodeGraphNyquistShannonWrap01(state.rotatorPhase - subPhase) * Math.PI * 2;

  const wasFirstSample = !state.hasLastFphas;
  const changed = wasFirstSample ? 0 : (state.lastFphas > fphas ? 1 : (state.lastFphas < fphas ? -1 : 0));
  state.lastFphas = fphas;
  state.hasLastFphas = true;

  if (changed === 1) {
    waveY = Math.sin(actualTone * Math.PI * 2 * phas + psXPi);
  } else {
    waveY = -Math.sin(sr * Math.PI * phas + Math.PI / 2) * Math.sin(phas * (sr / 2 - actualTone) * Math.PI * 2 - psXPi);
  }

  state.phase = nodeGraphNyquistShannonWrap01(state.phase + phasorFreq / sampleRateValue);
  state.rotatorPhase = nodeGraphNyquistShannonWrap01(state.rotatorPhase + (-subPhaseRotationSpeed) / sampleRateValue);

  return { x: waveX, y: waveY };
}
