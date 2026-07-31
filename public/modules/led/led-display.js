// Bespoke display renderer for the LED module (displayType "ledLamp").
//
// Unlike every other renderer in nodeGraphModuleScopeCustomRenderers this one
// paints no pixels: it writes CSS custom properties onto the LED's own face
// element and lets the compositor draw it. That is deliberate. The lamp is a
// flat lit surface, not a trace, and the shape controls (rounding + squircle)
// are CSS `border-radius` / `corner-shape` -- expressing them in the shared
// WebGL scope canvas would mean re-implementing corner geometry and clipping
// the glow against it by hand.
//
// The light level comes from the same analyzer buffer the 0D Burn dot
// renderer reads (nodeGraphScopeLightTarget), so LED responds to a patched
// signal exactly as it did before it grew its own renderer.

// Default face inset in styles.css, in px. Same role as the waveform panel's:
// read before the first apply so the very first frame does not under-measure.
const nodeGraphLedFaceDefaultInsetPx = 0;

function nodeGraphLedFaceShapeSignature(settings, level, width, height) {
  return [
    settings.hue,
    settings.brightness,
    settings.blur,
    settings.rounding,
    settings.cornerShape,
    Math.round(level * 512),
    Math.round(width),
    Math.round(height),
  ].join("|");
}

function applyNodeGraphLedFaceAppearance(face, settings, level) {
  // offsetWidth/offsetHeight, NOT getBoundingClientRect: the workspace is
  // inside a zoom transform, so the client rect is in scaled pixels while
  // border-radius is not. Sizing the radius from the rect made the lamp
  // under-round at anything other than 100% zoom.
  const width = face.offsetWidth;
  const height = face.offsetHeight;
  if (!(width > 0) || !(height > 0)) {
    return;
  }
  const signature = nodeGraphLedFaceShapeSignature(settings, level, width, height);
  if (face.dataset.ledAppearance === signature) {
    return;
  }
  face.dataset.ledAppearance = signature;

  // Largest meaningful radius is half the face's shorter side: at 100% a
  // square LED is a circle and a tall one is a capsule. Pixel-quantized so the
  // edge stays crisp instead of shimmering as the module is resized.
  const maxRadius = Math.max(0, Math.min(width, height) / 2);
  const radius = Math.round((settings.rounding / 100) * maxRadius);
  const shape = settings.cornerShape === "squircle" ? "squircle" : "round";

  const [r, g, b] = nodeGraphLedEmittedRgb(settings.hue, level, settings.brightness);
  // Blur is a glow that spreads outward from the lit face, scaled to the
  // module's own size so a big LED glows proportionally rather than wearing
  // the same few pixels of halo a 1gu tile does. It fades with the level, so
  // an unlit lamp casts no light at all.
  const glowPx = Math.round(settings.blur * Math.min(width, height) * 0.9);
  const glowAlpha = (Math.max(0, Math.min(1, level)) * 0.85).toFixed(3);

  // Written on the SHELL, not the face: the module's own plate is what would
  // otherwise show as a square backdrop behind a rounded lamp. Both elements
  // read the same properties, so the shell's outline and the lit face always
  // describe the same shape. (Custom properties inherit, so setting them here
  // reaches the face too.)
  const shell = face.closest(".dsp-node") || face;
  shell.style.setProperty("--node-led-face-color", `rgb(${r}, ${g}, ${b})`);
  shell.style.setProperty("--node-led-face-radius", `${radius}px`);
  shell.style.setProperty("--node-led-face-corner-shape", shape);
  shell.style.setProperty(
    "--node-led-face-glow",
    glowPx > 0 && Number(glowAlpha) > 0
      ? `0 0 ${glowPx}px ${Math.round(glowPx * 0.35)}px rgba(${r}, ${g}, ${b}, ${glowAlpha})`
      : "none",
  );
  // Room-light: modest live strength (dimmer bloom stays practical).
  if (face?.dataset) {
    const br = Math.max(0, Math.min(1, Number(settings.brightness) || 1));
    const str = Math.max(0, Math.min(1, Math.max(0, Math.min(1, level)) * (0.4 + 0.45 * br)));
    face.dataset.lightStrength = str.toFixed(3);
  }
}

function drawNodeGraphLedLampItem(renderer, item, pixelRatio) {
  const face = item?.screenElement || item?.slot?.scopeElement;
  const buffer = item?.buffer;
  if (!face || !buffer) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  clearNodeGraphModuleScopeLocalFallback(item.slot);
  const node = nodeGraphModuleScopeNodeForSlot(item.slot);
  const settings = normalizeNodeGraphLedLayout(node?.led);
  const level = clampNodeSliderValue(Number(buffer.nodeGraphScopeLightTarget) || 0, 0, 1);
  applyNodeGraphLedFaceAppearance(face, settings, level);
}

nodeGraphModuleScopeCustomRenderers.ledLamp = drawNodeGraphLedLampItem;
