// Spectrum FFT + display buffer helpers peeled from module-scopes.js (Phase D).
// Load after module-scopes.js. Extract-only.

const nodeGraphSpectrumFftSize = 1024;
const nodeGraphSpectrumBarCount = 160;

function nodeGraphSpectrumHannWindow(size) {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

const nodeGraphSpectrumHannWindowCache = nodeGraphSpectrumHannWindow(nodeGraphSpectrumFftSize);

// Iterative in-place radix-2 Cooley-Tukey FFT. `real`/`imag` must be
// same-length power-of-two Float64Arrays; results are written back in place.
function nodeGraphSpectrumFftInPlace(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tempReal = real[i];
      real[i] = real[j];
      real[j] = tempReal;
      const tempImag = imag[i];
      imag[i] = imag[j];
      imag[j] = tempImag;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < halfLen; k += 1) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const evenIndex = start + k;
        const oddIndex = start + k + halfLen;
        const oddR = real[oddIndex] * wr - imag[oddIndex] * wi;
        const oddI = real[oddIndex] * wi + imag[oddIndex] * wr;
        real[oddIndex] = real[evenIndex] - oddR;
        imag[oddIndex] = imag[evenIndex] - oddI;
        real[evenIndex] += oddR;
        imag[evenIndex] += oddI;
      }
    }
  }
}

// Builds a bar-height buffer (values 0..1, tagged nodeGraphScopeSpectrum) from
// the same raw time-domain sample buffer the waveform trace renderer reads,
// so switching a node's display mode to "Spectrum" needs no separate capture
// path. Magnitude is mapped from a -100..0 dB window, matching typical scope
// analyzer floor/ceiling defaults.
function nodeGraphModuleScopeSpectrumBuffer(capturedBuffer) {
  const size = nodeGraphSpectrumFftSize;
  if (!capturedBuffer?.length) {
    return capturedBuffer;
  }
  const available = Math.min(capturedBuffer.length, size);
  const offset = capturedBuffer.length - available;
  const windowOffset = size - available;
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  for (let i = 0; i < available; i += 1) {
    real[windowOffset + i] = (Number(capturedBuffer[offset + i]) || 0) *
      nodeGraphSpectrumHannWindowCache[windowOffset + i];
  }
  nodeGraphSpectrumFftInPlace(real, imag);
  const bins = size / 2;
  const minDb = -100;
  const maxDb = 0;
  const magnitudes = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / (size / 2);
    const db = 20 * Math.log10(Math.max(magnitude, 1e-9));
    magnitudes[i] = clampNodeSliderValue((db - minDb) / (maxDb - minDb), 0, 1);
  }
  // Bar geometry is one solid-color rectangle per array entry, so at typical
  // scope widths (100-700px) 512 raw FFT bins rasterize as far-sub-pixel
  // slivers -- effectively invisible even though the draw call is correct.
  // Max-pool down to a fixed, always-visible bar count instead.
  const barCount = Math.min(bins, nodeGraphSpectrumBarCount);
  const spectrum = new Float32Array(barCount);
  const bandSize = bins / barCount;
  for (let i = 0; i < barCount; i += 1) {
    const start = Math.floor(i * bandSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bandSize));
    let peak = 0;
    for (let bin = start; bin < end && bin < bins; bin += 1) {
      if (magnitudes[bin] > peak) {
        peak = magnitudes[bin];
      }
    }
    spectrum[i] = peak;
  }
  spectrum.nodeGraphScopeSpectrum = true;
  return spectrum;
}

function nodeGraphModuleScopeDisplayBuffer(slot, capturedBuffer = null) {
  let buffer = null;
  const renderer = nodeGraphModuleDisplayRendererForSlot(slot);
  if (renderer === "scope2dTrace") {
    const settings = nodeGraphScope2dTraceSettingsForNode(nodeGraphModuleScopeNodeForSlot(slot));
    const source = nodeGraphModuleScopeSlotUsesWiredInputs(slot)
      ? null
      : nodeGraphModuleDisplaySourceForSlot(slot);
    buffer = nodeGraphModuleScopeCapturedScope2dBuffer(slot, {
      historySeconds: settings.historySeconds,
      ...(source ? { xPort: source.x, yPort: source.y } : {}),
    }) || capturedBuffer;
  } else if (renderer === "scope2d" || renderer === "phosphorLight") {
    const source = nodeGraphModuleScopeSlotUsesWiredInputs(slot)
      ? null
      : nodeGraphModuleDisplaySourceForSlot(slot);
    buffer = nodeGraphModuleScopeCapturedScope2dBuffer(slot, source
      ? { xPort: source.x, yPort: source.y }
      : {}) || capturedBuffer;
  } else if (slot?.type === "valueOscilloscope") {
    buffer = capturedBuffer;
  } else if (
    slot?.type === "numberReadout"
    || slot?.type === "valueLcd"
    || renderer === "numberReadout"
  ) {
    // Value LCD / Value LED must only ever show real captured input — never an
    // offline model guess. No fallback chain here on purpose.
    buffer = capturedBuffer;
  } else if (renderer === "vectorDot" || renderer === "pulseDot") {
    buffer = capturedBuffer;
  } else if (slot?.type === "clock") {
    buffer = capturedBuffer;
  } else if (renderer === "transportBpm") {
    buffer = nodeGraphModuleScopeTransportBpmBuffer(slot);
  } else if (renderer === "phoneToneFace" || slot?.type === "phoneTone") {
    buffer = { length: 1 };
  } else if (renderer === "harmonicSeriesFace" || slot?.type === "harmonicSeries") {
    buffer = { length: 1 };
  } else if (
    renderer === "imageBurnFace"
    || renderer === "rgbPictureFace"
    || slot?.type === "imageBurn"
    || slot?.type === "rgbPicture"
  ) {
    // Always enter the typed draw path (Picture / Image Burn paint their own
    // face). Prefer real In capture for energy when present.
    buffer = capturedBuffer && capturedBuffer.length ? capturedBuffer : { length: 1 };
  } else if (
    renderer === "vectorRgbFace"
    || renderer === "rasterRgbFace"
    || renderer === "gradientVectorscopeFace"
    || renderer === "traceXyz"
    || slot?.type === "vectorRgb"
    || slot?.type === "rasterRgb"
    || slot?.type === "gradientVectorscope"
    || slot?.type === "traceXyz"
    || slot?.type === "traceRgb"
  ) {
    buffer = { length: 1 };
  } else if (renderer === "dot") {
    buffer = nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer);
  } else if (slot?.type === "lineBurnOscilloscope") {
    buffer = prepareNodeGraphTraceDisplayBuffer(
      capturedBuffer,
      nodeGraphLineBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(slot)),
    );
  } else if (renderer === "trace") {
    buffer = prepareNodeGraphTraceDisplayBuffer(
      capturedBuffer,
      nodeGraphTraceDisplaySettingsForSlot(slot),
    );
  } else if (renderer === "spectrum") {
    buffer = nodeGraphModuleScopeSpectrumBuffer(capturedBuffer);
  } else {
    buffer = nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer) ||
      nodeGraphModuleScopeOfflineGainAnalyzerBuffer(slot) ||
      capturedBuffer;
  }
  return buffer;
}

const nodeGraphTraceDisplaySettingsWindowSize = Object.freeze({
  height: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.height
    : 620,
  maxWidth: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.maxWidth
    : 980,
  minHeight: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.minHeight
    : (typeof nodeGraphUnifiedWindowMinSize !== "undefined"
      ? nodeGraphUnifiedWindowMinSize.minHeight
      : 120),
  minWidth: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.minWidth
    : (typeof nodeGraphUnifiedWindowMinSize !== "undefined"
      ? nodeGraphUnifiedWindowMinSize.minWidth
      : 24),
  width: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.width
    : 380,
});

const nodeGraphTraceDisplaySettingFields = Object.freeze([
  ["zoomSeconds", "History (s)"],
  ["historySeconds", "History (s)"],
  ["historyHz", "History (Hz)"],
  ["historyCycles", "History (c)"],
  ["fade", "Fade"],
  ["scale", "Scale"],
  ["sweepSeconds", "Sweep (s)"],
  ["sweepHz", "Sweep (Hz)"],
  ["sweepCycles", "Sweep (c)"],
  ["fftSize", "FFT size"],
  ["minFreq", "Min freq (Hz)"],
  ["maxFreq", "Max freq (Hz)"],
  ["bins", "Bins"],
  ["ghost", "Ghost"],
  ["trail", "Trail"],
  ["burn", "Burn"],
  ["burnAmount", "Burn \u2A2F"],
  ["residual", "Residual"],
  ["ghostBrightness", "Ghost Bright"],
  ["pixelDensity", "Pixel density"],
  ["dotBudget", "Dot Budget"],
  ["padding", "Amp"],
  ["cycles", "Cycles"],
  ["decimals", "Decimals"],
  ["hue", "Hue"],
  ["rounding", "Rounding"],
  ["innerRadius", "Inner radius"],
  ["rotationDegrees", "Span °"],
  ["dialSize", "Knob size"],
  ["labelSize", "Label size"],
  ["valueSize", "Value size"],

  ["dot1Size", "Size"],
  ["puckSize", "Puck size"],
  ["lineThickness", "Blur"],
  ["lineBlur", "Line blur"],
  ["dot1Brightness", "Bright"],
  ["secondarySize", "Secondary size"],
  ["secondaryLineThickness", "Secondary blur"],
  ["secondaryBrightness", "Secondary light"],
  ["lineLength", "Line length"],
  ["capSize", "Cap size"],
  ["capLength", "Cap length"],
]);

/**
 * Shared phosphor Display Settings order (app-wide, including Lorenz).
 * Faces pick a subset; builders keep this relative order.
 * Shared stack: Scale → Sweep → Brightness → Hue → Size → Blur → Bright
 * → Ghost → Trail → Burn → Burn ⨉ → Dot Budget → Pixel density.
 * Skip / Sync sit above (toggles).
 */
const nodeGraphPhosphorDisplayFieldOrder = Object.freeze([
  "scale",
  "sweepSeconds",
  "backgroundBrightness",
  "backgroundHue",
  "dot1Size",
  "lineThickness",
  "dot1Brightness",
  "ghost",
  "trail",
  "burn",
  "burnAmount",
  "dotBudget",
  "pixelDensity",
]);

