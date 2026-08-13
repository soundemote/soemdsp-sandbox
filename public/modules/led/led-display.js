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

function nodeGraphLedFaceShapeSignature(settings, level, cellW, cellH, lampW, lampH) {
  const stopsSig = Array.isArray(settings.gradientStops)
    ? settings.gradientStops.map((s) => `${s.t}:${s.color}`).join(",")
    : "";
  return [
    stopsSig,
    settings.brightness,
    settings.blur,
    settings.rounding,
    settings.cornerShape,
    settings.fillPercent,
    settings.bottomImage?.dataUrl?.length || 0,
    settings.bottomImage?.fileName || "",
    settings.topImage?.dataUrl?.length || 0,
    settings.topImage?.fileName || "",
    Math.round(level * 512),
    Math.round(cellW),
    Math.round(cellH),
    Math.round(lampW),
    Math.round(lampH),
  ].join("|");
}

function nodeGraphLedApplyImageLayer(img, layer) {
  if (!img) {
    return;
  }
  const dataUrl = String(layer?.dataUrl || "").trim();
  if (!dataUrl) {
    img.removeAttribute("src");
    img.hidden = true;
    img.alt = "";
    return;
  }
  if (img.getAttribute("src") !== dataUrl) {
    img.src = dataUrl;
  }
  img.hidden = false;
  img.alt = String(layer?.fileName || "").trim() || "LED decoration";
}

function applyNodeGraphLedFaceAppearance(face, settings, level) {
  if (!face) {
    return;
  }
  const root = face.classList?.contains("node-led-face")
    ? face
    : face.closest?.(".node-led-face") || face;
  const lamp = root.querySelector?.(".node-led-lamp") || root;
  // offsetWidth/offsetHeight, NOT getBoundingClientRect: the workspace is
  // inside a zoom transform, so the client rect is in scaled pixels while
  // border-radius is not.
  const cellW = root.offsetWidth;
  const cellH = root.offsetHeight;
  if (!(cellW > 0) || !(cellH > 0)) {
    return;
  }
  const drive = Math.max(0, Math.min(1, Number(level) || 0));
  // fillPercent: 0 = inscribed square (no stretched rectangle), 100 = full cell.
  const fill = Math.max(0, Math.min(100, Number(settings.fillPercent) || 0)) / 100;
  const minSide = Math.min(cellW, cellH);
  const lampW = Math.max(1, Math.round(minSide + (cellW - minSide) * fill));
  const lampH = Math.max(1, Math.round(minSide + (cellH - minSide) * fill));

  const signature = nodeGraphLedFaceShapeSignature(settings, drive, cellW, cellH, lampW, lampH);
  if (root.dataset.ledAppearance === signature) {
    return;
  }
  root.dataset.ledAppearance = signature;
  root.dataset.ledLevel = String(drive);
  lamp.dataset.ledLevel = String(drive);

  // Largest meaningful radius is half the lamp's shorter side: at 100% a
  // pill LED is a circle / capsule. Pixel-quantized so the edge stays crisp.
  const maxRadius = Math.max(0, Math.min(lampW, lampH) / 2);
  const radius = Math.round((Number(settings.rounding) || 0) / 100 * maxRadius);
  // "square" in the model is the pill/round corner style (same as Music Player
  // waveform); "squircle" uses CSS corner-shape: squircle when supported.
  const shape = settings.cornerShape === "squircle" ? "squircle" : "round";

  const [r, g, b] = nodeGraphLedEmittedRgb(settings, drive);
  // Blur is a glow that spreads outward from the lit face, scaled to the
  // module's own size so a big LED glows proportionally rather than wearing
  // the same few pixels of halo a 1gu tile does. It fades with the level, so
  // an unlit lamp casts no light at all.
  const glowPx = Math.round((Number(settings.blur) || 0) * Math.min(lampW, lampH) * 0.9);
  const glowAlpha = (drive * 0.85).toFixed(3);
  const glow = glowPx > 0 && Number(glowAlpha) > 0
    ? `0 0 ${glowPx}px ${Math.round(glowPx * 0.35)}px rgba(${r}, ${g}, ${b}, ${glowAlpha})`
    : "none";
  const color = `rgb(${r}, ${g}, ${b})`;

  // Size / center the lamp plate within the cell.
  lamp.style.width = `${lampW}px`;
  lamp.style.height = `${lampH}px`;
  lamp.style.setProperty("--node-led-face-color", color);
  lamp.style.setProperty("--node-led-face-radius", `${radius}px`);
  lamp.style.setProperty("--node-led-face-corner-shape", shape);
  lamp.style.setProperty("--node-led-face-glow", glow);
  lamp.style.borderRadius = `${radius}px`;
  lamp.style.cornerShape = shape;
  lamp.style.boxShadow = glow;
  lamp.style.background = color;

  // Decorative image layers (full cell).
  nodeGraphLedApplyImageLayer(
    root.querySelector?.('[data-led-image="bottom"]'),
    settings.bottomImage,
  );
  nodeGraphLedApplyImageLayer(
    root.querySelector?.('[data-led-image="top"]'),
    settings.topImage,
  );

  // Room-light: on → full hole (1), off → 0. Dim amount is only the room gain.
  // Set on lamp AND face so a wiped child strength does not veil a lit lamp.
  const punch = drive > 0.001 ? "1" : "0";
  if (lamp.dataset) {
    lamp.dataset.lightSource = "screen";
    lamp.dataset.lightStrength = punch;
  }
  if (root?.dataset) {
    root.dataset.lightSource = "screen";
    root.dataset.lightStrength = punch;
  }
  if (typeof setNodeGraphLightStrength === "function") {
    setNodeGraphLightStrength(lamp, drive > 0.001 ? 1 : 0);
    if (root && root !== lamp) {
      setNodeGraphLightStrength(root, drive > 0.001 ? 1 : 0);
    }
  }
}

/**
 * Push current patch LED settings onto a node face immediately.
 * Cosmetic only (radius / corner shape / gradient / blur / fill / images) —
 * does NOT require the audio engine or an analyzer buffer. Safe offline.
 */
function refreshNodeGraphLedFaceForNode(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  const article = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(id)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(id)}"]`);
  const face = article?.querySelector?.(".node-led-face");
  if (!face) {
    return false;
  }
  const settings = typeof normalizeNodeGraphLedLayout === "function"
    ? normalizeNodeGraphLedLayout(nodeGraphPatchNode(id)?.led)
    : nodeGraphPatchNode(id)?.led;
  if (!settings) {
    return false;
  }
  delete face.dataset.ledAppearance;
  // Engine off → no live drive; keep last level if any, else unlit (0).
  const level = Number(face.dataset.ledLevel);
  applyNodeGraphLedFaceAppearance(face, settings, Number.isFinite(level) ? level : 0);
  // Layout may still be settling after a patch rebuild (offsetWidth 0).
  return face.offsetWidth > 0 && face.offsetHeight > 0;
}

/** Schedule immediate + post-layout refreshes so engine-off edits always stick. */
function scheduleNodeGraphLedFaceRefresh(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id || typeof refreshNodeGraphLedFaceForNode !== "function") {
    return;
  }
  refreshNodeGraphLedFaceForNode(id);
  requestAnimationFrame(() => {
    refreshNodeGraphLedFaceForNode(id);
    requestAnimationFrame(() => refreshNodeGraphLedFaceForNode(id));
  });
}

function drawNodeGraphLedLampItem(renderer, item, pixelRatio) {
  // Prefer the stack root so fill% sizes against the full cell.
  const lampOrFace = item?.screenElement || item?.slot?.scopeElement;
  const face = lampOrFace?.closest?.(".node-led-face") || lampOrFace;
  if (!face) {
    return;
  }
  const buffer = item?.buffer;
  if (buffer) {
    renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  }
  clearNodeGraphModuleScopeLocalFallback(item.slot);
  const node = nodeGraphModuleScopeNodeForSlot(item.slot);
  const settings = normalizeNodeGraphLedLayout(node?.led);
  let level = 0;
  if (buffer?.length) {
    level = Number(buffer.nodeGraphScopeLightTarget);
    if (!Number.isFinite(level)) {
      // Live rings often omit lightTarget metadata — use peak |sample|.
      let peak = 0;
      const n = Math.min(buffer.length, 64);
      for (let i = Math.max(0, buffer.length - n); i < buffer.length; i += 1) {
        const s = Math.abs(Number(buffer[i]) || 0);
        if (s > peak) peak = s;
      }
      level = peak;
      buffer.nodeGraphScopeLightTarget = peak;
    }
    level = clampNodeSliderValue(level, 0, 1);
  } else {
    level = Number(face.dataset.ledLevel) || 0;
  }
  applyNodeGraphLedFaceAppearance(face, settings, level);
}

nodeGraphModuleScopeCustomRenderers.ledLamp = drawNodeGraphLedLampItem;
