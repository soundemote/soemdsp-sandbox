// Spectrogram display — permanent-pixel waterfall (classic).
//
// Design (opposite of “recompute the whole ring”):
//   • Paint columns onto a face-sized bitmap and never rewrite old pixels
//     when settings change (new settings apply to new ink only).
//   • Scroll rate is wall-clock: full face width = History (s) of audio.
//     hop → pixel advance = (hopSize/sampleRate) * (faceW/historySeconds).
//   • Sub-pixel hops accumulate (max-pool into the pending column).
//   • Large hops can advance multiple pixels in one step.
//
// This keeps motion tied to real time without needing a huge hop ring, and
// avoids the “zoom/stretch as we fill” effect.

const spectrogramHistory = new Map();
const spectrogramLutRgbCache = new Map();

// Face width = this many seconds of audio (longer → slower scroll). Cheap: only
// changes the pixel-advance rate, not a huge hop ring.
const SPECTROGRAM_MAX_HISTORY_SECONDS = 30;
// 0 is not valid (used to coerce to 0.05 while UI showed 0).
const SPECTROGRAM_MIN_HISTORY_SECONDS = 0.1;
// (Transport bin count is half-FFT length from the worklet — not a fixed 256.)

function spectrogramDefaultGradientStops() {
  if (typeof SPECTROGRAM_DEFAULT_GRADIENT_STOPS !== "undefined") {
    return SPECTROGRAM_DEFAULT_GRADIENT_STOPS.map((s) => ({ ...s }));
  }
  return [
    { t: 0, color: "#000000" },
    { t: 0.25, color: "#000080" },
    { t: 0.5, color: "#00c0ff" },
    { t: 0.75, color: "#ffff00" },
    { t: 1, color: "#ffffff" },
  ];
}

function spectrogramSettingsForNode(node) {
  if (typeof normalizeNodeGraphSpectrogramSettings === "function") {
    return normalizeNodeGraphSpectrogramSettings(
      node?.traceDisplaySettings || node?.spectrogramDisplaySettings,
      node,
    );
  }
  const source = node?.traceDisplaySettings || {};
  return {
    historySeconds: Math.max(
      SPECTROGRAM_MIN_HISTORY_SECONDS,
      Math.min(SPECTROGRAM_MAX_HISTORY_SECONDS, Number(source.historySeconds) || 2),
    ),
    fftSize: Math.max(128, Math.min(16384, Math.round(Number(source.fftSize) || 1024))),
    freqScale: Math.max(0, Math.min(2, Math.round(Number(source.freqScale) || 0))),
    window: Math.max(0, Math.min(4, Math.round(Number(source.window) || 1))),
    overlap: Math.max(0, Math.min(5, Math.round(Number(source.overlap) || 2))),
    gradientStops: Array.isArray(source.gradientStops) ? source.gradientStops : spectrogramDefaultGradientStops(),
  };
}

function spectrogramLutRgbForStops(stops) {
  const key = JSON.stringify(stops);
  let rgb = spectrogramLutRgbCache.get(key);
  if (rgb) return rgb;

  let lut;
  if (typeof spectrogramBuildGradientLut === "function") {
    lut = spectrogramBuildGradientLut(stops);
  } else {
    lut = new Array(256);
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      let r;
      let g;
      let b;
      if (t < 0.25) {
        const s = t / 0.25;
        r = 0; g = 0; b = Math.floor(64 + 128 * s);
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        r = 0; g = Math.floor(128 + 127 * s); b = 192 + Math.floor(63 * (1 - s));
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        r = Math.floor(255 * s); g = 255; b = Math.floor(63 * (1 - s));
      } else {
        const s = (t - 0.75) / 0.25;
        r = 255; g = 255 - Math.floor(128 * s); b = Math.floor(255 * s * 0.5);
      }
      lut[i] = `rgb(${r},${g},${b})`;
    }
  }

  rgb = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const s = String(lut[i] || "").trim();
    let r = 255;
    let g = 255;
    let b = 255;
    const hex = s.match(/^#([0-9a-f]{6})$/i);
    const rgbm = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (hex) {
      r = parseInt(hex[1].slice(0, 2), 16);
      g = parseInt(hex[1].slice(2, 4), 16);
      b = parseInt(hex[1].slice(4, 6), 16);
    } else if (rgbm) {
      r = Number(rgbm[1]) & 255;
      g = Number(rgbm[2]) & 255;
      b = Number(rgbm[3]) & 255;
    }
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  if (spectrogramLutRgbCache.size > 32) spectrogramLutRgbCache.clear();
  spectrogramLutRgbCache.set(key, rgb);
  return rgb;
}

function spectrogramHopMeta(settings, node) {
  const fftMeta = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get(nodeGraphDataBusKey(String(node?.id || ""), "FftSize"))
    : null;
  let hopSize = 0;
  let sampleRate = 0;
  let fftSize = 1024;
  let hopSerial = 0;
  if (fftMeta instanceof Float32Array && fftMeta.length >= 5) {
    fftSize = Math.max(128, Math.min(16384, Number(fftMeta[0]) || 1024));
    hopSize = Math.max(1, Number(fftMeta[3]) || 0);
    sampleRate = Math.max(1, Number(fftMeta[4]) || 0);
    hopSerial = fftMeta.length >= 6 ? (Number(fftMeta[5]) || 0) : 0;
  }
  if (!(hopSize > 0) || !(sampleRate > 0)) {
    if (typeof nodeGraphSpectrogramFftSizeFromNode === "function") {
      fftSize = nodeGraphSpectrogramFftSizeFromNode(node);
    } else if (typeof nodeGraphSpectrogramSnapFftSize === "function") {
      fftSize = nodeGraphSpectrogramSnapFftSize(settings?.fftSize ?? node?.params?.fftSize);
    } else {
      fftSize = Math.max(128, Math.min(16384, Math.round(Number(settings?.fftSize) || 1024)));
    }
    hopSize = Math.max(1, Math.floor(fftSize / 4));
    sampleRate = Math.max(
      1,
      Number(nodeGraphModuleScopeState?.sampleRate) || Number(nodeGraphMvp?.sampleRate) || 44100,
    );
  }
  hopSize = Math.max(1, hopSize);
  const batchColumns = (fftMeta instanceof Float32Array && fftMeta.length >= 7)
    ? Math.max(0, Math.round(Number(fftMeta[6]) || 0))
    : 0;
  const historyFlag = (fftMeta instanceof Float32Array && fftMeta.length >= 8)
    ? Math.round(Number(fftMeta[7]) || 0)
    : 0;
  return { hopSize, sampleRate, fftSize, hopSerial, batchColumns, historyFlag };
}

function spectrogramHzToMel(hz) {
  return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
}
function spectrogramMelToHz(mel) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}
function spectrogramHzToBark(hz) {
  return 6 * Math.asinh(Math.max(0, hz) / 600);
}
function spectrogramBarkToHz(bark) {
  return 600 * Math.sinh(bark / 6);
}

function spectrogramRowTToHz(t, freqScaleIdx, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = sr / 2;
  const minFreq = 20;
  const scale = Math.max(0, Math.min(2, Math.round(Number(freqScaleIdx) || 0)));
  const u = Math.max(0, Math.min(1, 1 - t));
  if (scale === 1) {
    const melMin = spectrogramHzToMel(minFreq);
    const melMax = spectrogramHzToMel(nyquist);
    return spectrogramMelToHz(melMin + u * (melMax - melMin));
  }
  if (scale === 2) {
    const barkMin = spectrogramHzToBark(minFreq);
    const barkMax = spectrogramHzToBark(nyquist);
    return spectrogramBarkToHz(barkMin + u * (barkMax - barkMin));
  }
  return minFreq + u * (nyquist - minFreq);
}

function spectrogramHzToLinearBin(hz, linearBins, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = sr / 2;
  const minFreq = 20;
  const lb = Math.max(1, linearBins | 0);
  const t = (hz - minFreq) / Math.max(1e-9, nyquist - minFreq);
  return Math.max(0, Math.min(lb - 1, t * (lb - 1)));
}

/**
 * Map one LINEAR spectrum column → face-height magnitudes (peak-normalized).
 * Bilinear blend between FFT bins for smooth freq-scale remap.
 */
function spectrogramSpectrumToColumnMags(out, spectrum, spectrumBins, faceH, freqScaleIdx, sampleRate) {
  const h = Math.max(1, faceH | 0);
  if (!out || out.length < h) return;
  out.fill(0);
  if (!(spectrumBins > 0) || !spectrum) return;

  const rowDenom = Math.max(1, h - 1);
  let peak = 1e-12;
  for (let y = 0; y < h; y += 1) {
    const t = y / rowDenom;
    const hz = spectrogramRowTToHz(t, freqScaleIdx, sampleRate);
    const binF = spectrogramHzToLinearBin(hz, spectrumBins, sampleRate);
    const b0 = Math.max(0, Math.min(spectrumBins - 1, Math.floor(binF)));
    const b1 = Math.min(spectrumBins - 1, b0 + 1);
    const bf = binF - b0;
    const v = (Number(spectrum[b0]) || 0) * (1 - bf) + (Number(spectrum[b1]) || 0) * bf;
    out[y] = v;
    if (v > peak) peak = v;
  }
  const inv = 1 / peak;
  for (let y = 0; y < h; y += 1) out[y] *= inv;
}

function spectrogramCreateState(faceW, faceH) {
  const w = Math.max(1, faceW | 0);
  const h = Math.max(1, faceH | 0);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: false, alpha: false });
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "low";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
  }
  return {
    faceW: w,
    faceH: h,
    canvas,
    ctx,
    // Audio-seconds not yet converted to face pixels (resize-safe; not in px).
    scrollDebtSec: 0,
    // Max-pool of spectra waiting for the next integer pixel.
    pendingMags: new Float32Array(h),
    pendingValid: false,
    lastHop: -1,
    lastHistorySerial: -1,
    // View settings frozen into already-painted pixels; only new ink uses new settings.
    paintFreqScale: 0,
    paintSampleRate: 44100,
    historySeconds: 2,
  };
}

/**
 * Resize face bitmap without wiping history or changing wall-clock scroll rate.
 * Stretch existing ink to the new face so full width still means History (s).
 * scrollDebtSec stays in seconds (independent of face pixel size).
 */
function spectrogramResizePreserve(st, faceW, faceH) {
  const w = Math.max(1, faceW | 0);
  const h = Math.max(1, faceH | 0);
  const oldW = Math.max(1, st.faceW | 0);
  const oldH = Math.max(1, st.faceH | 0);
  if (w === oldW && h === oldH) {
    return st;
  }

  const next = spectrogramCreateState(w, h);
  // Time debt is not in pixels — keep as-is across resize.
  next.scrollDebtSec = Math.max(0, Number(st.scrollDebtSec) || Number(st.scrollDebt) || 0);
  next.lastHop = st.lastHop;
  next.lastHistorySerial = st.lastHistorySerial;
  next.paintFreqScale = st.paintFreqScale;
  next.paintSampleRate = st.paintSampleRate;
  next.historySeconds = st.historySeconds;
  next.pendingValid = Boolean(st.pendingValid);
  if (st.pendingValid && st.pendingMags?.length) {
    for (let y = 0; y < h; y += 1) {
      const srcY = Math.min(oldH - 1, Math.floor((y * oldH) / h));
      next.pendingMags[y] = st.pendingMags[srcY] || 0;
    }
  }

  const nctx = next.ctx;
  if (nctx && st.canvas) {
    // Stretch full face → full face so painted time scale still matches History (s).
    nctx.imageSmoothingEnabled = false;
    nctx.drawImage(st.canvas, 0, 0, oldW, oldH, 0, 0, w, h);
  }
  return next;
}

function spectrogramEnsureState(nodeId, faceW, faceH, historySeconds) {
  let st = spectrogramHistory.get(String(nodeId || ""));
  const w = Math.max(1, faceW | 0);
  const h = Math.max(1, faceH | 0);
  const hist = Math.max(
    SPECTROGRAM_MIN_HISTORY_SECONDS,
    Math.min(SPECTROGRAM_MAX_HISTORY_SECONDS, Number(historySeconds) || 2),
  );
  const key = String(nodeId || "");
  if (!st) {
    st = spectrogramCreateState(w, h);
    spectrogramHistory.set(key, st);
  } else if (st.faceW !== w || st.faceH !== h) {
    st = spectrogramResizePreserve(st, w, h);
    spectrogramHistory.set(key, st);
  }
  // History (s) only changes scroll rate for new ink — never wipes the bitmap.
  st.historySeconds = hist;
  return st;
}

/** Max-pool pending column with new mags. */
function spectrogramPoolPending(st, mags) {
  const h = st.faceH;
  if (!st.pendingValid) {
    st.pendingMags.set(mags.subarray(0, h));
    st.pendingValid = true;
    return;
  }
  for (let y = 0; y < h; y += 1) {
    const a = st.pendingMags[y] || 0;
    const b = mags[y] || 0;
    st.pendingMags[y] = a > b ? a : b;
  }
}

/** Scroll permanent bitmap left by n pixels and paint n right columns from pending mags. */
function spectrogramScrollPaintPixels(st, nPixels, lutRgb, minThresh, threshRange, brightness) {
  const n = Math.max(0, Math.floor(nPixels));
  const sctx = st.ctx;
  const w = st.faceW;
  const h = st.faceH;
  if (!sctx || n < 1 || w < 1 || h < 1 || !st.pendingValid) return;

  sctx.imageSmoothingEnabled = false;
  if ("imageSmoothingQuality" in sctx) sctx.imageSmoothingQuality = "low";
  const invRange = 1 / Math.max(1e-9, threshRange);

  // Integer scroll of permanent ink (nearest-neighbor only).
  if (n >= w) {
    sctx.fillStyle = "#000000";
    sctx.fillRect(0, 0, w, h);
  } else {
    sctx.globalCompositeOperation = "copy";
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(st.canvas, -n, 0);
    sctx.globalCompositeOperation = "source-over";
  }

  // Paint n identical right columns (large hop covering many pixels).
  for (let p = 0; p < n; p += 1) {
    const x = w - n + p;
    if (x < 0 || x >= w) continue;
    for (let y = 0; y < h; y += 1) {
      let t = ((Number(st.pendingMags[y]) || 0) - minThresh) * invRange * brightness;
      if (!Number.isFinite(t) || t < 0) t = 0;
      if (t > 1) t = 1;
      const li = Math.min(255, Math.max(0, Math.floor(t * 255 + 1e-6)));
      const idx = li * 3;
      sctx.fillStyle = `rgb(${lutRgb[idx]},${lutRgb[idx + 1]},${lutRgb[idx + 2]})`;
      sctx.fillRect(x, y, 1, 1);
    }
  }
  st.pendingValid = false;
  st.pendingMags.fill(0);
}

/**
 * Ingest one STFT hop worth of audio time.
 * Wall-clock mapping (resize-safe): full face width = historySeconds of audio.
 *   secondsPerPixel = historySeconds / faceW
 *   scrollDebtSec accumulates hop duration; emit floor(debt / secPerPx) pixels.
 * Debt is in seconds so resizing the module does not change scroll rate.
 */
function spectrogramIngestHop(
  st,
  spectrum,
  spectrumBins,
  hopSize,
  sampleRate,
  freqScaleIdx,
  lutRgb,
  minThresh,
  threshRange,
  brightness,
) {
  const h = st.faceH;
  const w = st.faceW;
  const hist = Math.max(
    SPECTROGRAM_MIN_HISTORY_SECONDS,
    Number(st.historySeconds) || 2,
  );
  const hopSec = Math.max(1, hopSize) / Math.max(1, sampleRate);
  // Seconds of audio represented by one face pixel.
  // Smaller history → fewer seconds per pixel → faster scroll (same hop covers more px).
  const secPerPx = hist / Math.max(1, w);

  // Map spectrum with CURRENT paint settings (frozen into this ink).
  if (!st.columnScratch || st.columnScratch.length < h) {
    st.columnScratch = new Float32Array(h);
  }
  spectrogramSpectrumToColumnMags(
    st.columnScratch,
    spectrum,
    spectrumBins,
    h,
    freqScaleIdx,
    sampleRate,
  );
  spectrogramPoolPending(st, st.columnScratch);

  st.scrollDebtSec = Math.max(0, Number(st.scrollDebtSec) || 0) + hopSec;
  // Emit whole pixels; keep leftover audio-seconds for the next hop.
  let whole = Math.floor(st.scrollDebtSec / Math.max(1e-12, secPerPx));
  if (whole >= 1) {
    whole = Math.min(w, whole);
    spectrogramScrollPaintPixels(st, whole, lutRgb, minThresh, threshRange, brightness);
    st.scrollDebtSec -= whole * secPerPx;
    if (st.scrollDebtSec < 0) st.scrollDebtSec = 0;
  }
}

function spectrogramPresent(ctx, st, faceW, faceH, bg) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, faceW, faceH);
  if (!st?.canvas || faceW < 1 || faceH < 1) return;
  // 1:1 permanent bitmap (same size as face). TEMP: no smoothing anywhere.
  ctx.imageSmoothingEnabled = false;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "low";
  ctx.drawImage(st.canvas, 0, 0, faceW, faceH);
}

function drawNodeGraphSpectrogramItem(renderer, item, pixelRatio) {
  const nodeId = String(item?.slot?.nodeId || "");
  if (!nodeId) return;

  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !screenElement) return;

  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio, 1)) return;
  canvas.style.mixBlendMode = "normal";
  canvas.classList.add("node-spectrogram-canvas");
  // TEMP vanilla: force nearest-neighbor CSS scaling (was "auto" = browser blur).
  canvas.style.imageRendering = "pixelated";
  canvas.style.setProperty("image-rendering", "pixelated");

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "low";

  const faceW = canvas.width | 0;
  const faceH = canvas.height | 0;
  if (faceW < 1 || faceH < 1) return;

  const node = nodeGraphPatchNode(nodeId);
  const settings = spectrogramSettingsForNode(node);
  const brightness = Math.max(0.1, Math.min(2, Number(node?.params?.brightness) || 1));
  const minThresh = Math.max(0, Number(node?.params?.minThreshold) || 0);
  const maxThresh = Math.max(minThresh + 0.001, Number(node?.params?.maxThreshold) || 1);
  const threshRange = maxThresh - minThresh;
  const freqScaleIdx = Math.max(0, Math.min(2, Math.round(Number(settings.freqScale) || 0)));
  const lutRgb = spectrogramLutRgbForStops(settings.gradientStops);
  const historySeconds = Math.max(
    SPECTROGRAM_MIN_HISTORY_SECONDS,
    Math.min(SPECTROGRAM_MAX_HISTORY_SECONDS, Number(settings.historySeconds) || 2),
  );

  const plateBg = "#000000";
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(screenElement, plateBg);
  }

  const spectrum = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "Spectrum"))
    : null;
  const spectrumBatch = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "SpectrumBatch"))
    : null;
  const spectrumBins = (spectrum instanceof Float32Array) ? spectrum.length : 0;

  const { hopSize, sampleRate, hopSerial, batchColumns } = spectrogramHopMeta(settings, node);
  const st = spectrogramEnsureState(nodeId, faceW, faceH, historySeconds);

  // Ink uses settings at paint time; already-drawn pixels stay as-is.
  st.paintFreqScale = freqScaleIdx;
  st.paintSampleRate = sampleRate;

  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();

  // Live hops only — permanent ink. (History rebuild / full recolor dropped.)
  if (!frozen && hopSerial > 0 && hopSerial !== st.lastHop) {
    const bins = spectrumBins > 0
      ? spectrumBins
      : (spectrumBatch instanceof Float32Array && batchColumns > 0
        ? Math.floor(spectrumBatch.length / batchColumns)
        : 0);

    if (
      spectrumBatch instanceof Float32Array
      && batchColumns > 0
      && bins > 0
      && spectrumBatch.length >= batchColumns * bins
    ) {
      for (let c = 0; c < batchColumns; c += 1) {
        const col = spectrumBatch.subarray(c * bins, (c + 1) * bins);
        spectrogramIngestHop(
          st,
          col,
          bins,
          hopSize,
          sampleRate,
          freqScaleIdx,
          lutRgb,
          minThresh,
          threshRange,
          brightness,
        );
      }
      st.lastHop = hopSerial;
    } else if (spectrumBins > 0 && spectrum) {
      spectrogramIngestHop(
        st,
        spectrum,
        spectrumBins,
        hopSize,
        sampleRate,
        freqScaleIdx,
        lutRgb,
        minThresh,
        threshRange,
        brightness,
      );
      st.lastHop = hopSerial;
    }
  }

  spectrogramPresent(ctx, st, faceW, faceH, plateBg);
}

nodeGraphModuleScopeCustomRenderers.spectrogramBurn = drawNodeGraphSpectrogramItem;
