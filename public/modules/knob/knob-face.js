// Knob face visuals: five stacked image layers (Image1…Image5),
// each with optional Bias-driven rotation + readout overlay.
// Right-click the face → Module Settings.
//
// Stack (back → front): image1 → image2 → image3 → image4 → image5 → label / readout
//
// Formats: PNG, JPEG, WebP, GIF, SVG (APNG when the browser animates image/png).

const nodeGraphKnobFaceAcceptedTypes = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

/** Layer count / keys (image1 = back, image5 = front). */
const nodeGraphKnobFaceLayerCount = 5;
const nodeGraphKnobFaceLayerIds = Object.freeze(
  Array.from({ length: nodeGraphKnobFaceLayerCount }, (_, i) => `image${i + 1}`),
);

function nodeGraphKnobFaceEmptyLayer() {
  return { dataUrl: "", fileName: "", rotate: false };
}

const nodeGraphKnobFaceDefaults = Object.freeze({
  layers: Object.freeze(
    nodeGraphKnobFaceLayerIds.map(() => Object.freeze(nodeGraphKnobFaceEmptyLayer())),
  ),
  rotationDegrees: 270,
  rotationOffsetDegrees: -135,
  showReadout: true,
  showLabel: true,
});

function normalizeNodeGraphKnobFaceLayer(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    dataUrl: normalizeNodeGraphKnobFaceDataUrl(raw.dataUrl || raw.src || ""),
    fileName: String(raw.fileName || raw.name || "").trim().slice(0, 96),
    rotate: Boolean(raw.rotate ?? raw.rotateLikeKnob),
  };
}

/**
 * Normalize face data. Migrates legacy top/mid/bottom (+ global rotateLikeKnob)
 * into five per-layer slots (image1…image5).
 */
function normalizeNodeGraphKnobFace(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  const rotationDegrees = Number(raw.rotationDegrees);
  const rotationOffsetDegrees = Number(raw.rotationOffsetDegrees);

  const layers = nodeGraphKnobFaceLayerIds.map(() => nodeGraphKnobFaceEmptyLayer());

  if (Array.isArray(raw.layers) && raw.layers.length) {
    for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
      layers[i] = normalizeNodeGraphKnobFaceLayer(raw.layers[i]);
    }
  } else if (raw.image1 || raw.image2 || raw.image3 || raw.image4 || raw.image5) {
    for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
      const key = `image${i + 1}`;
      layers[i] = normalizeNodeGraphKnobFaceLayer(raw[key]);
    }
  } else {
    // Legacy: bottom (back) / mid / top (+ optional single-image → mid).
    const legacyUrl = normalizeNodeGraphKnobFaceDataUrl(raw.dataUrl || raw.src || "");
    const legacyName = String(raw.fileName || raw.name || "").trim().slice(0, 96);
    const midSource = raw.mid && typeof raw.mid === "object"
      ? raw.mid
      : (legacyUrl ? { dataUrl: legacyUrl, fileName: legacyName } : {});
    const globalRotate = Boolean(raw.rotateLikeKnob ?? raw.rotate);
    layers[0] = normalizeNodeGraphKnobFaceLayer(raw.bottom);
    layers[1] = {
      ...normalizeNodeGraphKnobFaceLayer(midSource),
      rotate: Boolean(
        (midSource && typeof midSource === "object" && (midSource.rotate ?? midSource.rotateLikeKnob))
        ?? globalRotate,
      ),
    };
    layers[2] = normalizeNodeGraphKnobFaceLayer(raw.top);
    // image4 / image5 stay empty under legacy migration
  }

  return {
    layers,
    // Named accessors for code that still uses face.imageN
    image1: layers[0],
    image2: layers[1],
    image3: layers[2],
    image4: layers[3],
    image5: layers[4],
    rotationDegrees: Number.isFinite(rotationDegrees)
      ? Math.max(0, Math.min(1440, rotationDegrees))
      : nodeGraphKnobFaceDefaults.rotationDegrees,
    rotationOffsetDegrees: Number.isFinite(rotationOffsetDegrees)
      ? Math.max(-720, Math.min(720, rotationOffsetDegrees))
      : nodeGraphKnobFaceDefaults.rotationOffsetDegrees,
    showReadout: raw.showReadout !== false && raw.showReadout !== "false",
    showLabel: raw.showLabel !== false && raw.showLabel !== "false",
  };
}

function nodeGraphKnobFaceHasAnyImage(face) {
  const f = normalizeNodeGraphKnobFace(face);
  return f.layers.some((layer) => Boolean(layer.dataUrl));
}

function nodeGraphKnobFaceIsNonDefault(face) {
  const f = normalizeNodeGraphKnobFace(face);
  const defaults = nodeGraphKnobFaceDefaults;
  if (nodeGraphKnobFaceHasAnyImage(f)) {
    return true;
  }
  if (f.layers.some((layer) => layer.rotate)) {
    return true;
  }
  return !f.showReadout
    || !f.showLabel
    || f.rotationDegrees !== defaults.rotationDegrees
    || f.rotationOffsetDegrees !== defaults.rotationOffsetDegrees;
}

/**
 * Accept raster base64 data URLs and SVG data URLs in all common forms.
 */
function normalizeNodeGraphKnobFaceDataUrl(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("data:image/")) {
    return "";
  }
  if (text.length > 3_000_000) {
    return "";
  }
  const comma = text.indexOf(",");
  if (comma < 0) {
    return "";
  }
  const header = text.slice(0, comma).toLowerCase();
  if (!/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)(?:;[\w.=+-]+)*$/i.test(header)) {
    return "";
  }
  const payload = text.slice(comma + 1);
  if (!payload) {
    return "";
  }
  const isSvg = /image\/svg\+xml/i.test(header);
  const isBase64 = /;base64/i.test(header);
  if (!isSvg && !isBase64) {
    return "";
  }
  return text;
}

function nodeGraphKnobFaceLog(level, msg, detail) {
  const line = detail != null
    ? `${msg} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    : msg;
  try {
    if (window.SE && typeof window.SE[level] === "function") {
      window.SE[level](line);
      return;
    }
  } catch (_) { /* ignore */ }
  try {
    // eslint-disable-next-line no-console
    console[level === "FAIL" || level === "ERROR" ? "error" : level === "WARN" ? "warn" : "info"](
      `[knobFace] ${line}`,
    );
  } catch (_) { /* ignore */ }
}

function nodeGraphKnobFaceForNode(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return normalizeNodeGraphKnobFace(patchNode?.knobFace);
}

/** Fixed decimal places for the face readout (Display Settings → Num decimals). */
function nodeGraphKnobFaceReadoutDecimals(patchNode) {
  if (typeof nodeGraphKnobFaceDisplaySettingsForNode === "function") {
    const settings = nodeGraphKnobFaceDisplaySettingsForNode(patchNode);
    const n = Math.round(Number(settings?.decimals));
    if (Number.isFinite(n)) {
      return Math.max(0, Math.min(8, n));
    }
  }
  const raw = Number(
    patchNode?.traceDisplaySettings?.decimals
    ?? patchNode?.knobFace?.decimals,
  );
  if (Number.isFinite(raw)) {
    return Math.max(0, Math.min(8, Math.round(raw)));
  }
  return 2;
}

/** Format live Bias for the face plate using Display Settings decimals. */
function nodeGraphKnobFaceFormatReadout(value, patchNode, slider = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  const places = nodeGraphKnobFaceReadoutDecimals(patchNode);
  const showSign = typeof nodeSliderShouldShowSign === "function" && slider
    ? nodeSliderShouldShowSign(slider)
    : true;
  const absText = number.toFixed(places);
  if (showSign && number >= 0) {
    return `+${absText}`;
  }
  if (number >= 0) {
    return ` ${absText}`;
  }
  return absText;
}

/**
 * Size readout to fill most of the face: start from height budget, then
 * binary-search down only if the string overflows width (no clip).
 * Previous maxW*0.42 start made values tiny for no good reason.
 */
function nodeGraphKnobFaceFitReadout(readout, face = null) {
  if (!readout || readout.hidden || readout.getAttribute("aria-hidden") === "true") {
    return;
  }
  const style = readout.style;
  if (!style) {
    return;
  }
  // Clear prior inline size so we measure against host geometry, not last frame.
  style.fontSize = "";
  style.transform = "";
  style.letterSpacing = "";
  style.lineHeight = "1";

  const host = face || readout.closest?.(".node-knob-face") || readout.parentElement;
  if (!host) {
    return;
  }
  const hostW = host.clientWidth || 0;
  const hostH = host.clientHeight || 0;
  if (hostW < 4 || hostH < 4) {
    return;
  }

  const hasImage = host.classList?.contains("has-image");
  const label = !hasImage ? host.querySelector?.("[data-knob-face-label]") : null;
  const labelVisible = Boolean(label && !label.hidden && label.offsetParent !== null);
  const labelH = labelVisible ? (label.offsetHeight || 0) : 0;
  // Tight side pad — fill the plate; only pull in enough to avoid edge kiss.
  const padX = hasImage ? Math.max(2, hostW * 0.04) : Math.max(2, hostW * 0.03);
  const padY = hasImage ? Math.max(2, hostH * 0.04) : Math.max(1, hostH * 0.02);
  // Prefer host geometry (not readout.clientHeight — that was already tiny from prior fit).
  const maxW = Math.max(12, hostW - padX * 2);
  const maxH = Math.max(
    12,
    hasImage
      ? hostH - padY * 2
      : hostH - labelH - padY * 2,
  );

  // Prefer filling height; soft width cap only for absurdly wide modules.
  const hi = Math.min(maxH * 0.94, maxW * 1.15, 96);
  const lo = 8;
  if (!(hi >= lo)) {
    return;
  }

  const fits = (px) => {
    style.fontSize = `${px.toFixed(2)}px`;
    // scrollWidth/Height include overflow past the content box.
    return readout.scrollWidth <= maxW + 1 && readout.scrollHeight <= maxH + 1;
  };

  // Binary search largest size that still fits (fills the face when space allows).
  let best = lo;
  let low = lo;
  let high = hi;
  if (fits(hi)) {
    best = hi;
  } else {
    for (let i = 0; i < 14; i += 1) {
      const mid = (low + high) * 0.5;
      if (fits(mid)) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }
    style.fontSize = `${best.toFixed(2)}px`;
  }

  // Very long strings only: nudge tracking after we already took the largest fit size.
  if (readout.scrollWidth > maxW + 1) {
    style.letterSpacing = "-0.03em";
  }
}

function attachNodeGraphKnobFaceReadoutFit(face) {
  if (!face || face._knobReadoutFitBound) {
    return;
  }
  face._knobReadoutFitBound = true;
  const run = () => {
    const readout = face.querySelector?.("[data-knob-face-readout]");
    if (readout) {
      nodeGraphKnobFaceFitReadout(readout, face);
    }
  };
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      if (face._knobReadoutFitRaf) {
        cancelAnimationFrame(face._knobReadoutFitRaf);
      }
      face._knobReadoutFitRaf = requestAnimationFrame(run);
    });
    ro.observe(face);
    face._knobReadoutFitRo = ro;
  }
  // First layout pass after insert.
  requestAnimationFrame(run);
}

/**
 * Latest live Bias sample from scope capture (final worklet output:
 * signal In + effective slider). This is what a DISPLAY must show — not
 * the static param meta alone.
 */
function nodeGraphKnobFaceLatestScopeSample(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id || typeof nodeGraphModuleScopeState === "undefined") {
    return null;
  }
  const buffers = nodeGraphModuleScopeState?.buffers;
  if (!buffers?.get) {
    return null;
  }
  for (const key of [`${id}:Bias`, `${id}:Out`, id]) {
    const buffer = buffers.get(key);
    if (!buffer?.length) {
      continue;
    }
    const sample = Number(buffer[buffer.length - 1]);
    if (Number.isFinite(sample)) {
      return sample;
    }
  }
  return null;
}

/** Source node latest sample (signal port) for main-thread modulation preview. */
function nodeGraphKnobFaceSourceSample(sourceNode, sourcePort) {
  const id = String(sourceNode || "").trim();
  const port = String(sourcePort || "").trim();
  if (!id) {
    return null;
  }
  if (typeof nodeGraphModuleScopeState !== "undefined") {
    const buffers = nodeGraphModuleScopeState?.buffers;
    if (buffers?.get) {
      for (const key of port ? [`${id}:${port}`, id] : [id]) {
        const buffer = buffers.get(key);
        if (buffer?.length) {
          const sample = Number(buffer[buffer.length - 1]);
          if (Number.isFinite(sample)) {
            return sample;
          }
        }
      }
    }
  }
  // Parameter-port sources (other sliders / knobs).
  if (port && typeof nodeGraphParameterOutputPort === "function") {
    const type = typeof nodeGraphPatchNodeType === "function"
      ? nodeGraphPatchNodeType(id)
      : null;
    if (type && nodeGraphParameterOutputPort(type, port)) {
      if (typeof nodeGraphReadNodeNumber === "function") {
        const n = nodeGraphReadNodeNumber(id, port);
        if (Number.isFinite(n)) {
          return n;
        }
      }
      if (typeof nodeGraphReadPatchParameterValue === "function") {
        const n = nodeGraphReadPatchParameterValue(id, port);
        if (Number.isFinite(n)) {
          return n;
        }
      }
    }
  }
  return null;
}

/**
 * Final displayed Bias: scope Bias first, else In + effective slider.
 * Parameter meta (slider text) is NOT the display — this is.
 */
function nodeGraphKnobFaceLiveOffset(nodeId) {
  const id = String(nodeId || "").trim();
  const scoped = nodeGraphKnobFaceLatestScopeSample(id);
  if (scoped != null) {
    return scoped;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!patchNode) {
    return 0;
  }
  const metadata = typeof nodeGraphReadPatchParameterMetadata === "function"
    ? nodeGraphReadPatchParameterMetadata(patchNode, "offset")
    : {};
  let base = typeof nodeGraphReadNodeNumber === "function"
    ? nodeGraphReadNodeNumber(id, "offset")
    : Number(patchNode.params?.offset);
  if (!Number.isFinite(base)) {
    base = 0;
  }
  // Param-row unit CV (optional) on top of the manual slider.
  const modulations = Array.isArray(nodeGraphMvp?.patch?.modulations)
    ? nodeGraphMvp.patch.modulations
    : [];
  let contribution = 0;
  let hasMod = false;
  for (const modulation of modulations) {
    if (modulation.destinationNode !== id || modulation.destinationParam !== "offset") {
      continue;
    }
    const src = nodeGraphKnobFaceSourceSample(
      modulation.sourceNode,
      modulation.sourcePort,
    );
    if (src == null || !Number.isFinite(src)) {
      continue;
    }
    hasMod = true;
    if (typeof normalizeNodeGraphParameterModulationInput === "function"
      && typeof nodeGraphApplyParameterModulation === "function") {
      // Accumulate normalized contribution then denormalize once below.
      contribution += normalizeNodeGraphParameterModulationInput(src, metadata);
    } else {
      contribution += src;
    }
  }
  let slider = base;
  if (hasMod) {
    if (typeof nodeGraphParameterValueToNormalizedSignal === "function"
      && typeof nodeGraphNormalizedSignalToParameterValue === "function") {
      const baseSignal = nodeGraphParameterValueToNormalizedSignal(base, metadata);
      const nextSignal = typeof nodeGraphNormalizedParameterSignalBounds === "function"
        ? nodeGraphNormalizedParameterSignalBounds(baseSignal + contribution, metadata)
        : Math.max(0, Math.min(1, baseSignal + contribution));
      slider = nodeGraphNormalizedSignalToParameterValue(nextSignal, metadata);
    } else {
      slider = base + contribution;
    }
  }
  // Dedicated signal In: domain add (same as worklet/live evaluator).
  let inputSum = 0;
  const connections = Array.isArray(nodeGraphMvp?.patch?.connections)
    ? nodeGraphMvp.patch.connections
    : [];
  for (const connection of connections) {
    if (connection.destinationNode !== id || connection.destinationPort !== "In") {
      continue;
    }
    const src = nodeGraphKnobFaceSourceSample(
      connection.sourceNode,
      connection.sourcePort,
    );
    if (src != null && Number.isFinite(src)) {
      inputSum += src;
    }
  }
  return inputSum + slider;
}

function nodeGraphKnobFaceUnitFromValue(value, patchNode) {
  const slider = typeof document !== "undefined"
    ? document.getElementById(`node-${patchNode?.id}-offset`)
    : null;
  const lo = Number.isFinite(Number(slider?.min))
    ? Number(slider.min)
    : (Number.isFinite(Number(patchNode?.paramMeta?.offset?.min))
      ? Number(patchNode.paramMeta.offset.min)
      : -1);
  const hi = Number.isFinite(Number(slider?.max))
    ? Number(slider.max)
    : (Number.isFinite(Number(patchNode?.paramMeta?.offset?.max))
      ? Number(patchNode.paramMeta.offset.max)
      : 1);
  if (hi === lo) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (Number(value) - lo) / (hi - lo)));
}

function nodeGraphKnobFaceUnitFromParams(patchNode) {
  const live = nodeGraphKnobFaceLiveOffset(patchNode?.id);
  return nodeGraphKnobFaceUnitFromValue(live, patchNode);
}

/**
 * Paint face from live Bias (scope / modulation). Call every display frame.
 */
function paintNodeGraphKnobFaceLive(face, nodeId, buffer = null) {
  if (!face || !nodeId) {
    return;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const faceData = nodeGraphKnobFaceForNode(patchNode || { knobFace: null });

  let value = null;
  if (buffer?.length) {
    const sample = Number(buffer[buffer.length - 1]);
    if (Number.isFinite(sample)) {
      value = sample;
    }
  }
  if (value == null) {
    value = nodeGraphKnobFaceLiveOffset(nodeId);
  }
  if (!Number.isFinite(value)) {
    value = 0;
  }

  const readout = face.querySelector("[data-knob-face-readout]");
  if (readout && faceData.showReadout) {
    const slider = document.getElementById(`node-${nodeId}-offset`);
    readout.hidden = false;
    readout.setAttribute("aria-hidden", "false");
    readout.textContent = nodeGraphKnobFaceFormatReadout(value, patchNode, slider);
    nodeGraphKnobFaceFitReadout(readout, face);
  }

  const unit = nodeGraphKnobFaceUnitFromValue(value, patchNode || { id: nodeId });
  nodeGraphKnobFaceApplyLayerTransforms(face, faceData, unit);
  face.dataset.liveValue = String(value);
  // Dimmer: cutout only with loaded face art (text/stroke stay under the veil).
  nodeGraphKnobFaceSyncLightSource(face, nodeGraphKnobFaceHasAnyImage(faceData));
}

/** Degrees for Bias unit 0…1 (shared span/offset; applied only to layers with rotate). */
function nodeGraphKnobFaceRotationDeg(face, unit01) {
  const u = Math.max(0, Math.min(1, Number(unit01) || 0));
  return Number(face.rotationOffsetDegrees) + u * Number(face.rotationDegrees);
}

function nodeGraphKnobFaceLayerIndex(layerId) {
  const id = String(layerId || "").trim().toLowerCase();
  const byName = nodeGraphKnobFaceLayerIds.indexOf(id);
  if (byName >= 0) {
    return byName;
  }
  // Legacy names
  if (id === "bottom" || id === "low") return 0;
  if (id === "mid" || id === "middle") return 1;
  if (id === "top") return 2;
  const n = Number(id);
  if (Number.isFinite(n) && n >= 1 && n <= nodeGraphKnobFaceLayerCount) {
    return n - 1;
  }
  return 0;
}

function nodeGraphKnobFaceNormalizeLayerId(layerId) {
  const index = nodeGraphKnobFaceLayerIndex(layerId);
  return nodeGraphKnobFaceLayerIds[index] || "image1";
}

function nodeGraphKnobFaceMakeLayerImg(layerId) {
  const img = document.createElement("img");
  img.className = `node-knob-face-image node-knob-face-image-${layerId} is-empty`;
  img.dataset.knobFaceImage = layerId;
  img.alt = "";
  img.draggable = false;
  img.hidden = true;
  // Never assign src="" — browsers treat that as a resource load + broken icon.
  return img;
}

/**
 * Face is a full drag surface for Bias (offset), same path/modifiers as
 * `.node-slider-readout` (beginNodeSliderDrag / nodeSliderFineTuneScale / etc.).
 */
function attachNodeGraphKnobFaceDrag(face) {
  if (!face || face.dataset.sliderDragBound === "true") {
    return;
  }
  face.dataset.sliderDragBound = "true";
  if (typeof beginNodeSliderDrag === "function") {
    face.addEventListener("pointerdown", beginNodeSliderDrag);
    face.addEventListener("mousedown", beginNodeSliderDrag);
  }
  if (typeof endNodeSliderDrag === "function") {
    face.addEventListener("lostpointercapture", endNodeSliderDrag);
  }
  if (typeof stepNodeSliderFromKeyboard === "function") {
    face.addEventListener("keydown", stepNodeSliderFromKeyboard);
  }
  face.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}

/**
 * Room dimmer cutout only when face art is loaded.
 * Empty plate (label / readout / stroke) stays under the veil — not a light source.
 * With images, the face punches a hole so the graphic reads as a lit screen.
 */
function nodeGraphKnobFaceSyncLightSource(face, hasImage = null) {
  if (!face) {
    return false;
  }
  const lit = hasImage == null
    ? Boolean(face.classList?.contains("has-image") || face.dataset?.hasImage === "true")
    : Boolean(hasImage);
  face.classList.toggle("node-light-source", lit);
  if (face.dataset) {
    if (lit) {
      face.dataset.lightSource = "screen";
      face.dataset.lightStrength = "1";
    } else {
      delete face.dataset.lightSource;
      face.dataset.lightStrength = "0";
    }
  }
  if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
    nodeGraphModuleScopeMarkScreenLit(face, lit ? 1 : 0);
  } else if (typeof setNodeGraphLightStrength === "function") {
    setNodeGraphLightStrength(face, lit ? 1 : 0);
  }
  return lit;
}

/**
 * Build the LayoutB face DOM (called from factories).
 * Stack: image1 (back) … image5 (front) → text.
 */
function createNodeGraphKnobFace(node, type) {
  const face = document.createElement("div");
  // Scope slot for live Bias paint. Dimmer cutout only after face art loads
  // (see nodeGraphKnobFaceSyncLightSource) — not a permanent light source.
  face.className = "node-knob-face node-module-scope-window";
  face.dataset.node = node;
  face.dataset.nodeType = type || "knob";
  face.dataset.sliderTarget = `node-${node}-offset`;
  face.dataset.lightStrength = "0";
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} knob`);

  for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
    const layerId = nodeGraphKnobFaceLayerIds[i];
    const wrap = document.createElement("div");
    wrap.className = `node-knob-face-layer node-knob-face-${layerId} is-empty`;
    wrap.dataset.knobFaceLayer = layerId;
    wrap.style.zIndex = String(i);
    wrap.append(nodeGraphKnobFaceMakeLayerImg(layerId));
    face.append(wrap);
  }

  const label = document.createElement("div");
  label.className = "node-knob-face-label";
  label.dataset.knobFaceLabel = "true";
  label.textContent = nodeGraphNodeLabels?.[type || "knob"] || "Knob";

  const readout = document.createElement("div");
  readout.className = "node-knob-face-readout";
  readout.dataset.knobFaceReadout = "true";
  readout.textContent = "0";

  face.append(label, readout);
  attachNodeGraphKnobFaceDrag(face);
  attachNodeGraphKnobFaceReadoutFit(face);
  renderNodeGraphKnobFace(face, node);
  return face;
}

function nodeGraphKnobFaceApplyLayerImage(img, layer, nodeId, layerId) {
  if (!img) {
    return;
  }
  const wrap = img.closest?.(".node-knob-face-layer")
    || img.parentElement;
  if (layer?.dataUrl) {
    if (img.getAttribute("src") !== layer.dataUrl) {
      img.onerror = () => {
        // Failed decode → hide so the browser broken-image frame never paints.
        img.removeAttribute("src");
        img.hidden = true;
        img.classList.add("is-empty");
        wrap?.classList?.add("is-empty");
        nodeGraphKnobFaceLog("FAIL", `face ${layerId} <img> failed to decode`, {
          nodeId,
          fileName: layer.fileName,
          header: layer.dataUrl.slice(0, Math.min(64, layer.dataUrl.indexOf(",") + 1 || 64)),
        });
      };
      img.onload = () => {
        img.hidden = false;
        img.classList.remove("is-empty");
        wrap?.classList?.remove("is-empty");
        nodeGraphKnobFaceLog("INFO", `face ${layerId} <img> decoded`, {
          nodeId,
          fileName: layer.fileName,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      };
      img.src = layer.dataUrl;
    }
    img.hidden = false;
    img.classList.remove("is-empty");
    wrap?.classList?.remove("is-empty");
    img.alt = "";
  } else {
    // Never leave a visible <img> without a valid src — UA paints a silver
    // broken-image box (#C0C0C0) that survives zoom and looks like a stroke.
    img.removeAttribute("src");
    img.removeAttribute("srcset");
    img.hidden = true;
    img.classList.add("is-empty");
    wrap?.classList?.add("is-empty");
    img.alt = "";
    img.onload = null;
    img.onerror = null;
  }
}

function nodeGraphKnobFaceApplyLayerTransforms(face, faceData, unit01) {
  const deg = nodeGraphKnobFaceRotationDeg(faceData, unit01);
  for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
    const layerId = nodeGraphKnobFaceLayerIds[i];
    const wrap = face.querySelector(`[data-knob-face-layer="${layerId}"]`);
    if (!wrap) {
      continue;
    }
    const layer = faceData.layers[i];
    const hasArt = Boolean(layer?.dataUrl);
    wrap.classList.toggle("is-empty", !hasArt);
    const shouldRotate = Boolean(layer?.rotate && hasArt);
    const next = shouldRotate ? `rotate(${deg}deg)` : "";
    if (wrap.style.transform !== next) {
      wrap.style.transform = next;
    }
    wrap.classList.toggle("is-rotating", shouldRotate);
  }
}

function renderNodeGraphKnobFace(faceOrNodeId, nodeIdOpt) {
  const face = faceOrNodeId instanceof Element
    ? faceOrNodeId
    : document.querySelector(`.node-knob-face[data-node="${faceOrNodeId}"]`);
  const nodeId = String(
    nodeIdOpt
      || face?.dataset?.node
      || faceOrNodeId
      || "",
  ).trim();
  if (!face || !nodeId) {
    return;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const faceData = nodeGraphKnobFaceForNode(patchNode || { knobFace: null });
  const label = face.querySelector("[data-knob-face-label]");
  const readout = face.querySelector("[data-knob-face-readout]");

  const hasAny = nodeGraphKnobFaceHasAnyImage(faceData);
  const anyRotate = faceData.layers.some((layer) => layer.rotate && layer.dataUrl);
  face.classList.toggle("has-image", hasAny);
  face.classList.toggle("rotate-knob", anyRotate);
  face.classList.toggle("show-readout", Boolean(faceData.showReadout));
  face.dataset.hasImage = hasAny ? "true" : "false";
  face.dataset.showReadout = faceData.showReadout ? "true" : "false";
  // Room dimmer: image → light cutout; empty plate (readout/stroke) under veil.
  nodeGraphKnobFaceSyncLightSource(face, hasAny);
  // Class + frame hide: kill white module outline when face art is present.
  // Must run after the face is mounted under .dsp-node (see module-rendering re-render).
  const moduleEl = face.closest?.(".dsp-node");
  if (moduleEl) {
    moduleEl.classList.toggle("knob-face-has-image", hasAny);
    moduleEl.dataset.hideModuleFrame = hasAny ? "1" : "0";
    if (hasAny) {
      if (typeof nodeGraphModuleFrameHide === "function") {
        nodeGraphModuleFrameHide(moduleEl);
      }
      // Belt-and-suspenders: zero stroke vars even if an SVG reappears.
      moduleEl.style.setProperty("--node-module-stroke", "transparent");
      moduleEl.style.setProperty("--node-module-selected-stroke", "transparent");
      moduleEl.style.setProperty("--node-module-drag-stroke", "transparent");
    } else {
      // No face art: restore module outline stroke vars + rebuild SVG path.
      moduleEl.dataset.hideModuleFrame = "0";
      if (typeof nodeGraphModuleFrameRestoreStrokeVars === "function") {
        nodeGraphModuleFrameRestoreStrokeVars(moduleEl);
      } else {
        moduleEl.style.removeProperty("--node-module-stroke");
        moduleEl.style.removeProperty("--node-module-selected-stroke");
        moduleEl.style.removeProperty("--node-module-drag-stroke");
      }
      // Ensure frame exists even if a prior hide removed the SVG node.
      delete moduleEl.dataset.moduleFrameFp;
      if (typeof updateNodeGraphModuleFrame === "function") {
        updateNodeGraphModuleFrame(moduleEl);
      } else if (typeof scheduleNodeGraphModuleFramesUpdate === "function") {
        scheduleNodeGraphModuleFramesUpdate({ nodeElement: moduleEl, force: true });
      }
    }
  }

  for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
    const layerId = nodeGraphKnobFaceLayerIds[i];
    const img = face.querySelector(`[data-knob-face-image="${layerId}"]`);
    const layer = faceData.layers[i];
    nodeGraphKnobFaceApplyLayerImage(img, layer, nodeId, layerId);
    face.classList.toggle(`has-${layerId}`, Boolean(layer?.dataUrl));
  }

  if (label) {
    label.hidden = !faceData.showLabel || hasAny;
    if (!hasAny) {
      const alias = typeof normalizeNodeGraphPatchNodeAlias === "function"
        ? normalizeNodeGraphPatchNodeAlias(patchNode?.alias)
        : String(patchNode?.alias || "").trim();
      label.textContent = alias
        || (nodeGraphNodeLabels?.knob || "Knob");
    }
  }
  // Display paints final live Bias (scope / modulation), not only param meta.
  if (typeof paintNodeGraphKnobFaceLive === "function") {
    paintNodeGraphKnobFaceLive(face, nodeId, null);
  } else {
    const unit = nodeGraphKnobFaceUnitFromParams(patchNode || { id: nodeId });
    nodeGraphKnobFaceApplyLayerTransforms(face, faceData, unit);
  }
  if (readout && !faceData.showReadout) {
    readout.hidden = true;
    readout.setAttribute("aria-hidden", "true");
    readout.textContent = "";
  }
}

function refreshNodeGraphKnobFaces() {
  for (const face of document.querySelectorAll(".node-knob-face")) {
    renderNodeGraphKnobFace(face);
  }
}

/** Live Bias drag: update readout + rotating layer angles. */
function syncNodeGraphKnobFaceFromSlider(slider) {
  if (!slider || slider.dataset.param !== "offset") {
    return;
  }
  const module = slider.closest?.(".dsp-node");
  if (!module || module.dataset.nodeType !== "knob") {
    return;
  }
  const face = module.querySelector(".node-knob-face");
  if (!face) {
    return;
  }
  const readout = face.querySelector("[data-knob-face-readout]");
  const displayValue = Number.isFinite(Number(slider.dataset.unboundedValue))
    ? Number(slider.dataset.unboundedValue)
    : Number(slider.value);
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(module.dataset.node)
    : null;
  if (readout && !readout.hidden) {
    readout.textContent = nodeGraphKnobFaceFormatReadout(displayValue, patchNode, slider);
    nodeGraphKnobFaceFitReadout(readout, face);
  }
  const faceData = nodeGraphKnobFaceForNode(patchNode);
  const min = Number(slider.min);
  const max = Number(slider.max);
  let u = 0.5;
  if (Number.isFinite(min) && Number.isFinite(max) && max !== min) {
    u = (displayValue - min) / (max - min);
  }
  u = Math.max(0, Math.min(1, u));
  nodeGraphKnobFaceApplyLayerTransforms(face, faceData, u);
}

function nodeGraphKnobFacePatchTarget(nodeId) {
  const id = String(nodeId || nodeGraphModuleActionTargetNodeId?.() || "").trim();
  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : null;
  const targetNode = patch?.nodes?.find((node) => node.id === id) || null;
  return { id, patch, targetNode };
}

/** Persist shape: layers[] + shared rotation/readout flags (no legacy mid/top keys). */
function nodeGraphKnobFaceToPatch(face) {
  const f = normalizeNodeGraphKnobFace(face);
  return {
    layers: f.layers.map((layer) => ({
      dataUrl: layer.dataUrl,
      fileName: layer.fileName,
      rotate: Boolean(layer.rotate),
    })),
    rotationDegrees: f.rotationDegrees,
    rotationOffsetDegrees: f.rotationOffsetDegrees,
    showReadout: f.showReadout,
    showLabel: f.showLabel,
  };
}

function commitNodeGraphKnobFace(nextFace, { record = true, status = "value slider face updated" } = {}) {
  const { id, patch, targetNode } = nodeGraphKnobFacePatchTarget();
  if (!patch || !targetNode || targetNode.type !== "knob") {
    return false;
  }
  targetNode.knobFace = nodeGraphKnobFaceToPatch(nextFace);
  if (typeof commitNodeGraphPatch === "function") {
    // softDom: do not rebuild module DOM / live plan (image layers flash otherwise).
    commitNodeGraphPatch(patch, { record, status, softDom: true, markPending: false });
  }
  renderNodeGraphKnobFace(id || targetNode.id);
  // Soft-sync settings controls only — full menu rebuild was glitching the face.
  const live = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(id || targetNode.id)
    : targetNode;
  if (typeof syncNodeGraphKnobFaceControls === "function") {
    syncNodeGraphKnobFaceControls(live);
  }
  return true;
}

function pickNodeGraphKnobFaceImage(layerId = "image1") {
  const nodeId = String(nodeGraphModuleActionTargetNodeId?.() || "").trim();
  const sourceNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const layer = nodeGraphKnobFaceNormalizeLayerId(layerId);
  let input = document.getElementById("nodeKnobFaceFileInput");
  if (!input) {
    input = document.createElement("input");
    input.type = "file";
    input.id = "nodeKnobFaceFileInput";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";
    input.hidden = true;
    input.addEventListener("change", handleNodeGraphKnobFaceFileInputChange);
    document.body.append(input);
  }
  input.value = "";
  input.dataset.targetNode = nodeId;
  input.dataset.layer = layer;
  input.click();
}

function nodeGraphKnobFaceFileLooksSupported(file) {
  if (!file) {
    return false;
  }
  if (file.type && nodeGraphKnobFaceAcceptedTypes.includes(file.type)) {
    return true;
  }
  const name = String(file.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

/**
 * #C0C0C0 (silver) is a common 1px file-edge border on exported knob PNGs and is
 * NOT used anywhere in our UI theme. If the outer ring is a near-uniform silver
 * (or solid mid-gray) border, crop 1px so it does not read as module chrome.
 * Returns the original data URL when the edge does not look like a border.
 */
function nodeGraphKnobFaceMaybeStripSilverEdge(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || /image\/svg\+xml/i.test(dataUrl.slice(0, 32))) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth | 0;
        const h = img.naturalHeight | 0;
        if (w < 8 || h < 8) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);
        const px = (x, y) => {
          const i = (y * w + x) * 4;
          return [data[i], data[i + 1], data[i + 2], data[i + 3]];
        };
        // Sample outer ring (every few pixels). Look for near-#C0C0C0 / neutral gray.
        let samples = 0;
        let silverish = 0;
        let opaque = 0;
        const consider = (x, y) => {
          const [r, g, b, a] = px(x, y);
          samples += 1;
          if (a < 16) {
            return;
          }
          opaque += 1;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const neutral = max - min <= 18;
          const nearSilver = r >= 160 && r <= 220 && g >= 160 && g <= 220 && b >= 160 && b <= 220;
          if (neutral && nearSilver) {
            silverish += 1;
          }
        };
        const stepX = Math.max(1, Math.floor(w / 64));
        const stepY = Math.max(1, Math.floor(h / 64));
        for (let x = 0; x < w; x += stepX) {
          consider(x, 0);
          consider(x, h - 1);
        }
        for (let y = 0; y < h; y += stepY) {
          consider(0, y);
          consider(w - 1, y);
        }
        // Require a solid-ish outer rim of silver-gray (not transparent, not busy art).
        if (opaque < samples * 0.55 || silverish < opaque * 0.62) {
          resolve(dataUrl);
          return;
        }
        // Crop 1px inset.
        const cw = w - 2;
        const ch = h - 2;
        const out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        const octx = out.getContext("2d");
        if (!octx) {
          resolve(dataUrl);
          return;
        }
        octx.drawImage(canvas, 1, 1, cw, ch, 0, 0, cw, ch);
        const stripped = out.toDataURL("image/png");
        nodeGraphKnobFaceLog("INFO", "stripped 1px silver-ish image edge (#C0C0C0 family)", {
          from: `${w}x${h}`,
          to: `${cw}x${ch}`,
          silverRatio: opaque ? (silverish / opaque).toFixed(2) : "0",
        });
        resolve(normalizeNodeGraphKnobFaceDataUrl(stripped) || dataUrl);
      } catch (error) {
        nodeGraphKnobFaceLog("WARN", "silver-edge strip failed", String(error?.message || error));
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function handleNodeGraphKnobFaceFileInputChange(event) {
  const input = event.currentTarget;
  const targetNodeId = input.dataset.targetNode || nodeGraphModuleActionTargetNodeId?.();
  const layer = nodeGraphKnobFaceNormalizeLayerId(input.dataset.layer || "image1");
  const layerIndex = nodeGraphKnobFaceLayerIndex(layer);
  const sourceNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(targetNodeId) : null;
  const file = input.files?.[0];
  nodeGraphKnobFaceLog("INFO", "face file pick", {
    nodeId: targetNodeId,
    layer,
    hasNode: Boolean(sourceNode),
    type: sourceNode?.type,
    fileName: file?.name || null,
    fileType: file?.type || "(empty)",
    fileSize: file?.size ?? null,
  });
  if (!sourceNode || sourceNode.type !== "knob" || !file) {
    nodeGraphKnobFaceLog("WARN", "face file pick aborted — need knob node + file");
    return;
  }
  if (!nodeGraphKnobFaceFileLooksSupported(file)) {
    nodeGraphKnobFaceLog("FAIL", "unsupported face image type", {
      fileType: file.type,
      fileName: file.name,
      layer,
    });
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Image type not supported (use PNG, JPEG, WebP, GIF, or SVG).");
    }
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => {
    nodeGraphKnobFaceLog("FAIL", "FileReader error loading face image", {
      fileName: file.name,
      layer,
      error: String(reader.error || "unknown"),
    });
  };
  reader.onload = () => {
    const raw = String(reader.result || "");
    const header = raw.slice(0, Math.min(80, raw.indexOf(",") >= 0 ? raw.indexOf(",") : 80));
    const dataUrl = normalizeNodeGraphKnobFaceDataUrl(raw);
    if (!dataUrl) {
      nodeGraphKnobFaceLog("FAIL", "face data URL rejected by normalizer", {
        fileName: file.name,
        layer,
        fileType: file.type,
        resultLength: raw.length,
        header,
      });
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp("Image is too large or invalid (check debug log).");
      }
      return;
    }
    nodeGraphKnobFaceLog("INFO", "face data URL accepted", {
      fileName: file.name,
      layer,
      header: dataUrl.slice(0, dataUrl.indexOf(",") + 1),
      length: dataUrl.length,
    });
    nodeGraphKnobFaceMaybeStripSilverEdge(dataUrl).then((finalUrl) => {
      const prev = nodeGraphKnobFaceForNode(sourceNode);
      const nextLayers = prev.layers.map((entry, index) => (
        index === layerIndex
          ? {
            dataUrl: finalUrl,
            fileName: file.name || `${layer}-image`,
            rotate: Boolean(entry.rotate),
          }
          : { ...entry }
      ));
      const ok = commitNodeGraphKnobFace({
        ...prev,
        layers: nextLayers,
      }, {
        status: `value slider ${layer} image loaded`,
      });
      const after = typeof nodeGraphPatchNode === "function"
        ? nodeGraphKnobFaceForNode(nodeGraphPatchNode(targetNodeId))
        : null;
      nodeGraphKnobFaceLog(ok && after?.layers?.[layerIndex]?.dataUrl ? "INFO" : "FAIL", "face commit result", {
        commitOk: ok,
        layer,
        hasDataUrlAfterValidate: Boolean(after?.layers?.[layerIndex]?.dataUrl),
        fileNameAfter: after?.layers?.[layerIndex]?.fileName || "",
      });
    });
  };
  reader.readAsDataURL(file);
}

function clearNodeGraphKnobFaceImage(layerId = "image1") {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const layer = nodeGraphKnobFaceNormalizeLayerId(layerId);
  const layerIndex = nodeGraphKnobFaceLayerIndex(layer);
  const prev = nodeGraphKnobFaceForNode(sourceNode);
  const nextLayers = prev.layers.map((entry, index) => (
    index === layerIndex
      ? { dataUrl: "", fileName: "", rotate: Boolean(entry.rotate) }
      : { ...entry }
  ));
  commitNodeGraphKnobFace({
    ...prev,
    layers: nextLayers,
  }, { status: `value slider ${layer} image cleared` });
}

function setNodeGraphKnobFaceLayerRotateFromContext(layerId, { record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const layer = nodeGraphKnobFaceNormalizeLayerId(layerId);
  const layerIndex = nodeGraphKnobFaceLayerIndex(layer);
  const input = document.getElementById(`nodeSceneKnobFaceRotate${layerIndex + 1}`);
  const prev = nodeGraphKnobFaceForNode(sourceNode);
  const nextLayers = prev.layers.map((entry, index) => (
    index === layerIndex
      ? { ...entry, rotate: Boolean(input?.checked) }
      : { ...entry }
  ));
  commitNodeGraphKnobFace({
    ...prev,
    layers: nextLayers,
  }, { record, status: `value slider ${layer} rotate updated` });
}

/** @deprecated global rotate — kept so old bindings no-op safely */
function setNodeGraphKnobFaceRotateFromContext({ record = true } = {}) {
  setNodeGraphKnobFaceLayerRotateFromContext("image2", { record });
}

function setNodeGraphKnobFaceRotationDegreesFromContext({ record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const input = document.getElementById("nodeSceneKnobFaceRotationDegrees");
  const prev = nodeGraphKnobFaceForNode(sourceNode);
  commitNodeGraphKnobFace({
    ...prev,
    rotationDegrees: Number(input?.value),
  }, { record, status: "value slider rotation span updated" });
}

function setNodeGraphKnobFaceRotationOffsetFromContext({ record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const input = document.getElementById("nodeSceneKnobFaceRotationOffset");
  const prev = nodeGraphKnobFaceForNode(sourceNode);
  commitNodeGraphKnobFace({
    ...prev,
    rotationOffsetDegrees: Number(input?.value),
  }, { record, status: "value slider rotation offset updated" });
}

function setNodeGraphKnobFaceShowReadoutFromContext({ record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const input = document.getElementById("nodeSceneKnobFaceShowReadout");
  const prev = nodeGraphKnobFaceForNode(sourceNode);
  commitNodeGraphKnobFace({
    ...prev,
    showReadout: Boolean(input?.checked),
  }, { record, status: "value slider readout visibility updated" });
}

function syncNodeGraphKnobFaceControls(targetNode) {
  const controls = document.getElementById("nodeSceneKnobFaceControls");
  if (!controls) {
    return;
  }
  const isTarget = targetNode?.type === "knob";
  controls.hidden = !isTarget;
  if (!isTarget) {
    return;
  }
  const face = nodeGraphKnobFaceForNode(targetNode);
  for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
    const n = i + 1;
    const layer = face.layers[i];
    const fileEl = document.getElementById(`nodeSceneKnobFaceFileName${n}`);
    if (fileEl) {
      fileEl.textContent = layer.dataUrl
        ? (layer.fileName || `image${n} loaded`)
        : "—";
      fileEl.title = layer.dataUrl ? (layer.fileName || `image${n}`) : "no image";
    }
    const clearBtn = document.getElementById(`nodeSceneKnobFaceClear${n}`);
    if (clearBtn) {
      clearBtn.disabled = !layer.dataUrl;
    }
    const rotate = document.getElementById(`nodeSceneKnobFaceRotate${n}`);
    if (rotate && document.activeElement !== rotate) {
      rotate.checked = Boolean(layer.rotate);
      rotate.disabled = false;
    }
  }
  const degrees = document.getElementById("nodeSceneKnobFaceRotationDegrees");
  const offset = document.getElementById("nodeSceneKnobFaceRotationOffset");
  const showReadout = document.getElementById("nodeSceneKnobFaceShowReadout");
  if (degrees && document.activeElement !== degrees) {
    degrees.value = String(face.rotationDegrees);
    degrees.disabled = false;
  }
  if (offset && document.activeElement !== offset) {
    offset.value = String(face.rotationOffsetDegrees);
    offset.disabled = false;
  }
  if (showReadout && document.activeElement !== showReadout) {
    showReadout.checked = face.showReadout;
  }
}

/**
 * Right-click on Knob face → Module Settings (face section visible).
 */
function openNodeKnobFaceContextMenu(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return false;
  }
  const face = target.closest?.(".node-knob-face");
  if (!face) {
    return false;
  }
  const nodeEl = face.closest?.(".dsp-node");
  const nodeId = String(nodeEl?.dataset?.node || face.dataset?.node || "").trim();
  const patchNode = nodeId && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  if (!patchNode || patchNode.type !== "knob") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (typeof setNodeGraphSelection === "function") {
    setNodeGraphSelection({ type: "node", id: nodeId });
  }
  if (nodeGraphMvp) {
    nodeGraphMvp.sceneContextTargetNode = nodeId;
    nodeGraphMvp.lastModuleActionTargetNode = nodeId;
  }
  return typeof openNodeGraphModuleSettingsFromContextEvent === "function"
    ? openNodeGraphModuleSettingsFromContextEvent(event, nodeEl)
    : false;
}
