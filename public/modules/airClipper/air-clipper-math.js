// AirClipper — Airwindows Density3 (MIT) as pure JS.
// https://github.com/airwindows/airwindows/blob/master/plugins/WinVST/Density3/Density3Proc.cpp
//
// A Density (0..1 → internal 0..5), B Highpass (0..1), C Output (0..1), D Wet (0..1).
// Stereo L/R + mono; mono sums into L/R before processing (Gain / Soft Clipper contract).

const NODE_GRAPH_AIR_CLIPPER_PI_2 = Math.PI * 0.5;

function createNodeGraphAirClipperChannelState() {
  return { iir: 0 };
}

function createNodeGraphAirClipperState() {
  return {
    left: createNodeGraphAirClipperChannelState(),
    mono: createNodeGraphAirClipperChannelState(),
    right: createNodeGraphAirClipperChannelState(),
  };
}

/**
 * One Density3 channel sample. Mutates state.iir (highpass memory).
 * @param {{ iir: number }} state
 * @param {number} input
 * @param {number} densityA 0..1 (Airwindows A)
 * @param {number} highpassB 0..1 (Airwindows B)
 * @param {number} outputC 0..1 (Airwindows C)
 * @param {number} wetD 0..1 (Airwindows D)
 * @param {number} sampleRate
 */
function nodeGraphAirClipperSample(
  state,
  input,
  densityA = 0,
  highpassB = 0,
  outputC = 1,
  wetD = 1,
  sampleRate = 44100,
) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const overallscale = rate / 44100;
  const density = (Number(densityA) || 0) * 5;
  let iirAmount = Math.pow(Math.max(0, Math.min(1, Number(highpassB) || 0)), 3) / overallscale;
  if (!Number.isFinite(iirAmount) || iirAmount < 0) {
    iirAmount = 0;
  }
  const output = Number(outputC);
  const wet = Number(wetD);
  const safeOutput = Number.isFinite(output) ? output : 1;
  const safeWet = Number.isFinite(wet) ? wet : 1;

  let inputSample = Number(input) || 0;
  if (!Number.isFinite(inputSample)) {
    inputSample = 0;
  }
  if (Math.abs(inputSample) < 1.18e-23) {
    inputSample = 0;
  }
  const drySample = inputSample;

  if (iirAmount === 0) {
    state.iir = 0;
  }
  state.iir = (state.iir * (1 - iirAmount)) + (inputSample * iirAmount);
  if (!Number.isFinite(state.iir)) {
    state.iir = 0;
  }
  inputSample -= state.iir;

  let altered = inputSample;
  if (density > 1) {
    // Density > 1: Taylor sin soft-saturation toward ±π/2.
    altered = Math.max(
      Math.min(inputSample * density * NODE_GRAPH_AIR_CLIPPER_PI_2, NODE_GRAPH_AIR_CLIPPER_PI_2),
      -NODE_GRAPH_AIR_CLIPPER_PI_2,
    );
    let X = altered * altered;
    let temp = altered * X;
    altered -= temp / 6;
    temp *= X;
    altered += temp / 120;
    temp *= X;
    altered -= temp / 5040;
    temp *= X;
    altered += temp / 362880;
    temp *= X;
    altered -= temp / 39916800;
  }
  if (density < 1) {
    // Density < 1: odd-power Taylor (soft expand / anti-density).
    altered = Math.max(Math.min(inputSample, 1), -1);
    const polarity = altered;
    let X = inputSample * altered;
    let temp = X;
    altered = temp / 2;
    temp *= X;
    altered -= temp / 24;
    temp *= X;
    altered += temp / 720;
    temp *= X;
    altered -= temp / 40320;
    temp *= X;
    altered += temp / 3628800;
    altered *= polarity < 0 ? -1 : 1;
  }
  if (density > 2) {
    inputSample = altered;
  } else {
    const blend = Math.abs(density - 1);
    inputSample = (inputSample * (1 - blend)) + (altered * blend);
  }

  return (drySample * (1 - safeWet)) + (inputSample * safeOutput * safeWet);
}

/**
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphAirClipperFrame(
  state,
  mono,
  left,
  right,
  densityA,
  highpassB,
  outputC,
  wetD,
  sampleRate,
) {
  const m = Number(mono) || 0;
  return {
    Out: nodeGraphAirClipperSample(state.mono, m, densityA, highpassB, outputC, wetD, sampleRate),
    Left: nodeGraphAirClipperSample(
      state.left,
      (Number(left) || 0) + m,
      densityA,
      highpassB,
      outputC,
      wetD,
      sampleRate,
    ),
    Right: nodeGraphAirClipperSample(
      state.right,
      (Number(right) || 0) + m,
      densityA,
      highpassB,
      outputC,
      wetD,
      sampleRate,
    ),
  };
}
