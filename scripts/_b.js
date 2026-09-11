// Bespoke display renderer for the transport module (displayType
// "transportBpm"). Unlike numberReadout (which shows whatever's wired into
// its own "In" port) this reads the patch-wide tempo directly off
// nodeGraphPatchTimingValue("tempoBpm") -- already synchronously available on
// the main thread, so no worklet -> main-thread data relay is needed at all.
//
// Phosphor/LCD look: digits use DSEG7 Classic from keshikan/DSEG
// (https://github.com/keshikan/DSEG, SIL OFL 1.1 - public/fonts/DSEG7-Classic).
// Classic cut draws faint unlit ghost segments behind lit ones (LCD/LED plate,
// not plain bold). DSEG has no proper letter glyphs for "BPM", so the unit is
// monospace below the digits - standard digital-clock layout.
//
// Gate lamp: small LED on the face that follows Gate 0-1 (captured buffer when
// available, otherwise the same Numer/Denom/Sync math as the DSP).

let nodeGraphTransportBpmFontReady = false;
document.fonts.load('700 40px "DSEG7 Classic"').then(() => {
  nodeGraphTransportBpmFontReady = document.fonts.check('700 40px "DSEG7 Classic"');
}).catch(() => {
  // Falls back to the monospace stack below if the font fails to load.
});

function nodeGraphTransportGateLevel01(nodeId, node) {
  const buffers = typeof nodeGraphModuleScopeState !== "undefined"
    ? nodeGraphModuleScopeState?.buffers
    : null;
  if (buffers && typeof buffers.get === "function") {
    const gateBuf = buffers.get(`${nodeId}:Gate 0-1`)
      || buffers.get(`${nodeId}:Gate Uni`)
      || buffers.get(`${nodeId}:0..1`)
      || buffers.get(nodeId);
    if (gateBuf && gateBuf.length && typeof nodeGraphOscilloscopeLatestSample === "function") {
      return Math.max(0, Math.min(1, Number(nodeGraphOscilloscopeLatestSample(gateBuf, 0)) || 0));
    }
  }

  // Fallback: compute from params + audio clock (matches transport-math.js).
  if (typeof nodeGraphTransportCore !== "function") {
    return 0;
  }
  const params = node?.params || {};
  const bpm = Math.max(
    1,
    Number(params.bpm)
      || (typeof nodeGraphPatchTimingValue === "function"
        ? Number(nodeGraphPatchTimingValue("tempoBpm"))
        : 120)
      || 120,
  );
  const sampleRate = Math.max(
    1,
    Number(typeof nodeGraphModuleScopeState !== "undefined"
      ? nodeGraphModuleScopeState?.sampleRate
      : 0)
      || Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.sampleRate : 0)
      || 44100,
  );
  const ctx = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.context : null;
  const currentTime = Number(ctx?.currentTime);
  const absoluteFrame = Number.isFinite(currentTime) && currentTime >= 0
    ? Math.floor(currentTime * sampleRate)
    : 0;
  const out = nodeGraphTransportCore(
    {
      amplitude: Number(params.amplitude) || 1,
      timeNumerator: params.timeNumerator != null ? Number(params.timeNumerator) : 1,
      timeDenominator: params.timeDenominator != null ? Number(params.timeDenominator) : 4,
      timingMode: params.timingMode != null ? Number(params.timingMode) : 0,
      pulseWidth: params.pulseWidth != null ? Number(params.pulseWidth) : 0.5,
    },
    absoluteFrame,
    sampleRate,
    bpm,
  );
  return Math.max(0, Math.min(1, Number(out["Gate 0-1"]) || 0));
}

function drawNodeGraphTransportBpmItem(renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(item.slot)

}
