// Bespoke display renderer for the transport module (displayType
// "transportBpm"). Unlike numberReadout (which shows whatever's wired into
// its own "In" port) this reads the patch-wide tempo directly off
// nodeGraphPatchTimingValue("tempoBpm") -- already synchronously available on
// the main thread, so no worklet -> main-thread data relay is needed at all.
//
// Phosphor/LCD look: digits use DSEG7 Classic from keshikan/DSEG
// (https://github.com/keshikan/DSEG, SIL OFL 1.1 — public/fonts/DSEG7-Classic).
// Classic cut draws faint unlit ghost segments behind lit ones (LCD/LED plate,
// not plain bold). DSEG has no proper letter glyphs for "BPM", so the unit is
// monospace below the digits — standard digital-clock layout.

// The font itself is registered via CSS (@font-face "DSEG7 Classic" in
// public/styles.css) so any DOM text can use it too -- here we just need to
// know when it's actually usable for canvas text, since canvas.fillText
// silently falls back to the next family in the stack until the font finishes
// loading, and we want to redraw once it lands instead of being stuck with
// the fallback forever.
let nodeGraphTransportBpmFontReady = false;
document.fonts.load('700 40px "DSEG7 Classic"').then(() => {
  nodeGraphTransportBpmFontReady = document.fonts.check('700 40px "DSEG7 Classic"');
}).catch(() => {
  // Falls back to the monospace stack below if the font fails to load.
});

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

  const bpm = nodeGraphPatchTimingValue("tempoBpm");
  const digits = String(bpm);
  if (
    canvas._nodeGraphTransportBpmDigits === digits
    && canvas._nodeGraphTransportBpmFontReady === nodeGraphTransportBpmFontReady
    && canvas._nodeGraphTransportBpmWidth === canvas.width
    && canvas._nodeGraphTransportBpmHeight === canvas.height
  ) {
    return;
  }
  canvas._nodeGraphTransportBpmDigits = digits;
  canvas._nodeGraphTransportBpmFontReady = nodeGraphTransportBpmFontReady;
  canvas._nodeGraphTransportBpmWidth = canvas.width;
  canvas._nodeGraphTransportBpmHeight = canvas.height;

  ctx.save();
  ctx.fillStyle = "#020a06";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const digitFontFamily = nodeGraphTransportBpmFontReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  const labelHeight = canvas.height * 0.22;
  const digitAreaHeight = canvas.height - labelHeight;
  const charCount = Math.max(1, digits.length);
  const digitFontSize = Math.max(1, Math.min(digitAreaHeight * 0.82, (canvas.width / charCount) * 1.55));

  ctx.font = `${digitFontSize}px ${digitFontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(120, 255, 170, 0.92)";
  ctx.fillText(digits, canvas.width * 0.5, digitAreaHeight * 0.5, canvas.width);

  const labelFontSize = Math.max(1, Math.min(labelHeight * 0.7, canvas.width * 0.14));
  ctx.font = `${labelFontSize}px "Consolas", "Courier New", monospace`;
  ctx.fillStyle = "rgba(120, 255, 170, 0.55)";
  ctx.fillText("BPM", canvas.width * 0.5, digitAreaHeight + labelHeight * 0.5, canvas.width);
  ctx.restore();
}

nodeGraphModuleScopeCustomRenderers.transportBpm = drawNodeGraphTransportBpmItem;
