// Value Slider face visuals: five stacked image layers (Image1…Image5),
// each with optional Bias-driven rotation + readout overlay.
// Right-click the face → Module Settings.
//
// Stack (back → front): image1 → image2 → image3 → image4 → image5 → label / readout
//
// Formats: PNG, JPEG, WebP, GIF, SVG (APNG when the browser animates image/png).

const nodeGraphValueSliderFaceAcceptedTypes = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

/** Layer count / keys (image1 = back, image5 = front). */
const nodeGraphValueSliderFaceLayerCount = 5;
const nodeGraphValueSliderFaceLayerIds = Object.freeze(
  Array.from({ length: nodeGraphValueSliderFaceLayerCount }, (_, i) => `image${i + 1}`),
);

function nodeGraphValueSliderFaceEmptyLayer() {
  return { dataUrl: "", fileName: "", rotate: false };
}

const nodeGraphValueSliderFaceDefaults = Object.freeze({
  layers: Object.freeze(
    nodeGraphValueSliderFaceLayerIds.map(() => Object.freeze(nodeGraphValueSliderFaceEmptyLayer())),
  ),
  rotationDegrees: 270,
  rotationOffsetDegrees: -135,
  showReadout: true,
  showLabel: true,
});

function normalizeNodeGraphValueSliderFaceLayer(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    dataUrl: normalizeNodeGraphValueSliderFaceDataUrl(raw.dataUrl || raw.src || ""),
    fileName: String(raw.fileName || raw.name || "").trim().slice(0, 96),
    rotate: Boolean(raw.rotate ?? raw.rotateLikeKnob),
  };
}

/**
 * Normalize face data. Migrates legacy top/mid/bottom (+ global rotateLikeKnob)
 * into five per-layer slots (image1…image5).
 */
function normalizeNodeGraphValueSliderFace(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  const rotationDegrees = Number(raw.rotationDegrees);
  const rotationOffsetDegrees = Number(raw.rotationOffsetDegrees);

  const layers = nodeGraphValueSliderFaceLayerIds.map(() => nodeGraphValueSliderFaceEmptyLayer());

  if (Array.isArray(raw.layers) && raw.layers.length) {
    for (let i = 0; i < nodeGraphValueSliderFaceLayerCount; i += 1) {
      layers[i] = normalizeNodeGraphValueSliderFaceLayer(raw.layers[i]);
    }
  } else if (raw.image1 || raw.image2 || raw.image3 || raw.image4 || raw.image5) {
    for (let i = 0; i < nodeGraphValueSliderFaceLayerCount; i += 1) {
      const key = `image${i + 1}`;
      layers[i] = normalizeNodeGraphValueSliderFaceLayer(raw[key]);
    }
  } else {
    // Legacy: bottom (back) / mid / top (+ optional single-image → mid).
    const legacyUrl = normalizeNodeGraphValueSliderFaceDataUrl(raw.dataUrl || raw.src || "");
    const legacyName = String(raw.fileName || raw.name || "").trim().slice(0, 96);
    const midSource = raw.mid && typeof raw.mid === "object"
      ? raw.mid
      : (legacyUrl ? { dataUrl: legacyUrl, fileName: legacyName } : {});
    const globalRotate = Boolean(raw.rotateLikeKnob ?? raw.rotate);
    layers[0] = normalizeNodeGraphValueSliderFaceLayer(raw.bottom);
    layers[1] = {
      ...normalizeNodeGraphValueSliderFaceLayer(midSource),
      rotate: Boolean(
        (midSource && typeof midSource === "object" && (midSource.rotate ?? midSource.rotateLikeKnob))
        ?? globalRotate,
      ),
    };
    layers[2] = normalizeNodeGraphValueSliderFaceLayer(raw.top);
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
      : nodeGraphValueSliderFaceDefaults.rotationDegrees,
    rotationOffsetDegrees: Number.isFinite(rotationOffsetDegrees)
      ? Math.max(-720, Math.min(720, rotationOffsetDegrees))
      : nodeGraphValueSliderFaceDefaults.rotationOffsetDegrees,
    showReadout: raw.showReadout !== false && raw.showReadout !== "false",
    showLabel: raw.showLabel !== false && raw.showLabel !== "false",
  };
}

function nodeGraphValueSliderFaceHasAnyImage(face) {
  const f = normalizeNodeGraphValueSliderFace(face);
  return f.layers.some((layer) => Boolean(layer.dataUrl));
}

function nodeGraphValueSliderFaceIsNonDefault(face) {
  const f = normalizeNodeGraphValueSliderFace(face);
  const defaults = nodeGraphValueSliderFaceDefaults;
  if (nodeGraphValueSliderFaceHasAnyImage(f)) {
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
function normalizeNodeGraphValueSliderFaceDataUrl(value) {
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

function nodeGraphValueSliderFaceLog(level, msg, detail) {
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
      `[valueSliderFace] ${line}`,
    );
  } catch (_) { /* ignore */ }
}

function nodeGraphValueSliderFaceForNode(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return normalizeNodeGraphValueSliderFace(patchNode?.valueSliderFace);
}

function nodeGraphValueSliderFaceUnitFromParams(patchNode) {
  const slider = typeof document !== "undefined"
    ? document.getElementById(`node-${patchNode?.id}-offset`)
    : null;
  let value = Number(slider?.dataset?.unboundedValue);
  if (!Number.isFinite(value)) {
    value = Number(slider?.value);
  }
  if (!Number.isFinite(value)) {
    value = Number(patchNode?.params?.offset);
  }
  if (!Number.isFinite(value)) {
    value = 0;
  }
  const lo = Number.isFinite(Number(slider?.min)) ? Number(slider.min) : -1;
  const hi = Number.isFinite(Number(slider?.max)) ? Number(slider.max) : 1;
  if (hi === lo) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

/** Degrees for Bias unit 0…1 (shared span/offset; applied only to layers with rotate). */
function nodeGraphValueSliderFaceRotationDeg(face, unit01) {
  const u = Math.max(0, Math.min(1, Number(unit01) || 0));
  return Number(face.rotationOffsetDegrees) + u * Number(face.rotationDegrees);
}

function nodeGraphValueSliderFaceLayerIndex(layerId) {
  const id = String(layerId || "").trim().toLowerCase();
  const byName = nodeGraphValueSliderFaceLayerIds.indexOf(id);
  if (byName >= 0) {
    return byName;
  }
  // Legacy names
  if (id === "bottom" || id === "low") return 0;
  if (id === "mid" || id === "middle") return 1;
  if (id === "top") return 2;
  const n = Number(id);
  if (Number.isFinite(n) && n >= 1 && n <= nodeGraphValueSliderFaceLayerCount) {
    return n - 1;
  }
  return 0;
}

function nodeGraphValueSliderFaceNormalizeLayerId(layerId) {
  const index = nodeGraphValueSliderFaceLayerIndex(layerId);
  return nodeGraphValueSliderFaceLayerIds[index] || "image1";
}

function nodeGraphValueSliderFaceMakeLayerImg(layerId) {
  const img = document.createElement("img");
  img.className = `node-value-slider-face-image node-value-slider-face-image-${layerId} is-empty`;
  img.dataset.valueSliderFaceImage = layerId;
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
function attachNodeGraphValueSliderFaceDrag(face) {
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
 * Build the LayoutB face DOM (called from factories).
 * Stack: image1 (back) … image5 (front) → text.
 */
function createNodeGraphValueSliderFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-value-slider-face";
  face.dataset.node = node;
  face.dataset.nodeType = type || "valueSlider";
  face.dataset.sliderTarget = `node-${node}-offset`;
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} value display`);

  for (let i = 0; i < nodeGraphValueSliderFaceLayerCount; i += 1) {
    const layerId = nodeGraphValueSliderFaceLayerIds[i];
    const wrap = document.createElement("div");
    wrap.className = `node-value-slider-face-layer node-value-slider-face-${layerId} is-empty`;
    wrap.dataset.valueSliderFaceLayer = layerId;
    wrap.style.zIndex = String(i);
    wrap.append(nodeGraphValueSliderFaceMakeLayerImg(layerId));
    face.append(wrap);
  }

  const label = document.createElement("div");
  label.className = "node-value-slider-face-label";
  label.dataset.valueSliderFaceLabel = "true";
  label.textContent = nodeGraphNodeLabels?.[type || "valueSlider"] || "Value";

  const readout = document.createElement("div");
  readout.className = "node-value-slider-face-readout";
  readout.dataset.valueSliderFaceReadout = "true";
  readout.textContent = "0";

  face.append(label, readout);
  attachNodeGraphValueSliderFaceDrag(face);
  renderNodeGraphValueSliderFace(face, node);
  return face;
}

function nodeGraphValueSliderFaceApplyLayerImage(img, layer, nodeId, layerId) {
  if (!img) {
    return;
  }
  const wrap = img.closest?.(".node-value-slider-face-layer")
    || img.parentElement;
  if (layer?.dataUrl) {
    if (img.getAttribute("src") !== layer.dataUrl) {
      img.onerror = () => {
        // Failed decode → hide so the browser broken-image frame never paints.
        img.removeAttribute("src");
        img.hidden = true;
        img.classList.add("is-empty");
        wrap?.classList?.add("is-empty");
        nodeGraphValueSliderFaceLog("FAIL", `face ${layerId} <img> failed to decode`, {
          nodeId,
          fileName: layer.fileName,
          header: layer.dataUrl.slice(0, Math.min(64, layer.dataUrl.indexOf(",") + 1 || 64)),
        });
      };
      img.onload = () => {
        img.hidden = false;
        img.classList.remove("is-empty");
        wrap?.classList?.remove("is-empty");
        nodeGraphValueSliderFaceLog("INFO", `face ${layerId} <img> decoded`, {
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

function nodeGraphValueSliderFaceApplyLayerTransforms(face, faceData, unit01) {
  const deg = nodeGraphValueSliderFaceRotationDeg(faceData, unit01);
  for (let i = 0; i < nodeGraphValueSliderFaceLayerCount; i += 1) {
    const layerId = nodeGraphValueSliderFaceLayerIds[i];
    const wrap = face.querySelector(`[data-value-slider-face-layer="${layerId}"]`);
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

function renderNodeGraphValueSliderFace(faceOrNodeId, nodeIdOpt) {
  const face = faceOrNodeId instanceof Element
    ? faceOrNodeId
    : document.querySelector(`.node-value-slider-face[data-node="${faceOrNodeId}"]`);
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
  const faceData = nodeGraphValueSliderFaceForNode(patchNode || { valueSliderFace: null });
  const label = face.querySelector("[data-value-slider-face-label]");
  const readout = face.querySelector("[data-value-slider-face-readout]");

  const hasAny = nodeGraphValueSliderFaceHasAnyImage(faceData);
  const anyRotate = faceData.layers.some((layer) => layer.rotate && layer.dataUrl);
  face.classList.toggle("has-image", hasAny);
  face.classList.toggle("rotate-knob", anyRotate);
  face.classList.toggle("show-readout", Boolean(faceData.showReadout));
  face.dataset.hasImage = hasAny ? "true" : "false";
  face.dataset.showReadout = faceData.showReadout ? "true" : "false";
  // Class + frame hide: kill white module outline when face art is present.
  // Must run after the face is mounted under .dsp-node (see module-rendering re-render).
  const moduleEl = face.closest?.(".dsp-node");
  if (moduleEl) {
    moduleEl.classList.toggle("value-slider-face-has-image", hasAny);
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

  for (let i = 0; i < nodeGraphValueSliderFaceLayerCount; i += 1) {
    const layerId = nodeGraphValueSliderFaceLayerIds[i];
    const img = face.querySelector(`[data-value-slider-face-image="${layerId}"]`);
    const layer = faceData.layers[i];
    nodeGraphValueSliderFaceApplyLayerImage(img, layer, nodeId, layerId);
    face.classList.toggle(`has-${layerId}`, Boolean(layer?.dataUrl));
  }

  if (label) {
    label.hidden = !faceData.showLabel || hasAny;
    if (!hasAny) {
      const alias = typeof normalizeNodeGraphPatchNodeAlias === "function"
        ? normalizeNodeGraphPatchNodeAlias(patchNode?.alias)
        : String(patchNode?.alias || "").trim();
      label.textContent = alias
        || (nodeGraphNodeLabels?.valueSlider || "Value Slider");
    }
  }
  if (readout) {
    const show = Boolean(faceData.showReadout);
    readout.hidden = !show;
    readout.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show) {
      readout.textContent = "";
    } else {
      const slider = document.getElementById(`node-${nodeId}-offset`);
      if (slider && typeof syncNodeGraphValueSliderFaceFromSlider === "function") {
        const displayValue = Number.isFinite(Number(slider.dataset.unboundedValue))
          ? Number(slider.dataset.unboundedValue)
          : Number(slider.value);
        readout.textContent = typeof formatNodeSliderNumber === "function"
          ? formatNodeSliderNumber(displayValue, {
            kind: slider.dataset.kind,
            maxDigits: slider.dataset.maxDigits,
            reserveSignSpace: true,
            showSign: typeof nodeSliderShouldShowSign === "function"
              ? nodeSliderShouldShowSign(slider)
              : true,
          }).trim()
          : String(Number.isFinite(displayValue) ? displayValue : 0);
      }
    }
  }

  const unit = nodeGraphValueSliderFaceUnitFromParams(patchNode || { id: nodeId });
  nodeGraphValueSliderFaceApplyLayerTransforms(face, faceData, unit);
}

function refreshNodeGraphValueSliderFaces() {
  for (const face of document.querySelectorAll(".node-value-slider-face")) {
    renderNodeGraphValueSliderFace(face);
  }
}

/** Live Bias drag: update readout + rotating layer angles. */
function syncNodeGraphValueSliderFaceFromSlider(slider) {
  if (!slider || slider.dataset.param !== "offset") {
    return;
  }
  const module = slider.closest?.(".dsp-node");
  if (!module || module.dataset.nodeType !== "valueSlider") {
    return;
  }
  const face = module.querySelector(".node-value-slider-face");
  if (!face) {
    return;
  }
  const readout = face.querySelector("[data-value-slider-face-readout]");
  const displayValue = Number.isFinite(Number(slider.dataset.unboundedValue))
    ? Number(slider.dataset.unboundedValue)
    : Number(slider.value);
  if (readout && !readout.hidden) {
    readout.textContent = typeof formatNodeSliderNumber === "function"
      ? formatNodeSliderNumber(displayValue, {
        kind: slider.dataset.kind,
        maxDigits: slider.dataset.maxDigits,
        reserveSignSpace: true,
        showSign: typeof nodeSliderShouldShowSign === "function"
          ? nodeSliderShouldShowSign(slider)
          : true,
      }).trim()
      : String(displayValue);
  }
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(module.dataset.node)
    : null;
  const faceData = nodeGraphValueSliderFaceForNode(patchNode);
  const min = Number(slider.min);
  const max = Number(slider.max);
  let u = 0.5;
  if (Number.isFinite(min) && Number.isFinite(max) && max !== min) {
    u = (displayValue - min) / (max - min);
  }
  u = Math.max(0, Math.min(1, u));
  nodeGraphValueSliderFaceApplyLayerTransforms(face, faceData, u);
}

function nodeGraphValueSliderFacePatchTarget(nodeId) {
  const id = String(nodeId || nodeGraphModuleActionTargetNodeId?.() || "").trim();
  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : null;
  const targetNode = patch?.nodes?.find((node) => node.id === id) || null;
  return { id, patch, targetNode };
}

/** Persist shape: layers[] + shared rotation/readout flags (no legacy mid/top keys). */
function nodeGraphValueSliderFaceToPatch(face) {
  const f = normalizeNodeGraphValueSliderFace(face);
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

function commitNodeGraphValueSliderFace(nextFace, { record = true, status = "value slider face updated" } = {}) {
  const { id, patch, targetNode } = nodeGraphValueSliderFacePatchTarget();
  if (!patch || !targetNode || targetNode.type !== "valueSlider") {
    return false;
  }
  targetNode.valueSliderFace = nodeGraphValueSliderFaceToPatch(nextFace);
  if (typeof commitNodeGraphPatch === "function") {
    // softDom: do not rebuild module DOM / live plan (image layers flash otherwise).
    commitNodeGraphPatch(patch, { record, status, softDom: true, markPending: false });
  }
  renderNodeGraphValueSliderFace(id || targetNode.id);
  // Soft-sync settings controls only — full menu rebuild was glitching the face.
  const live = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(id || targetNode.id)
    : targetNode;
  if (typeof syncNodeGraphValueSliderFaceControls === "function") {
    syncNodeGraphValueSliderFaceControls(live);
  }
  return true;
}

function pickNodeGraphValueSliderFaceImage(layerId = "image1") {
  const nodeId = String(nodeGraphModuleActionTargetNodeId?.() || "").trim();
  const sourceNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const layer = nodeGraphValueSliderFaceNormalizeLayerId(layerId);
  let input = document.getElementById("nodeValueSliderFaceFileInput");
  if (!input) {
    input = document.createElement("input");
    input.type = "file";
    input.id = "nodeValueSliderFaceFileInput";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";
    input.hidden = true;
    input.addEventListener("change", handleNodeGraphValueSliderFaceFileInputChange);
    document.body.append(input);
  }
  input.value = "";
  input.dataset.targetNode = nodeId;
  input.dataset.layer = layer;
  input.click();
}

function nodeGraphValueSliderFaceFileLooksSupported(file) {
  if (!file) {
    return false;
  }
  if (file.type && nodeGraphValueSliderFaceAcceptedTypes.includes(file.type)) {
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
function nodeGraphValueSliderFaceMaybeStripSilverEdge(dataUrl) {
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
        nodeGraphValueSliderFaceLog("INFO", "stripped 1px silver-ish image edge (#C0C0C0 family)", {
          from: `${w}x${h}`,
          to: `${cw}x${ch}`,
          silverRatio: opaque ? (silverish / opaque).toFixed(2) : "0",
        });
        resolve(normalizeNodeGraphValueSliderFaceDataUrl(stripped) || dataUrl);
      } catch (error) {
        nodeGraphValueSliderFaceLog("WARN", "silver-edge strip failed", String(error?.message || error));
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function handleNodeGraphValueSliderFaceFileInputChange(event) {
  const input = event.currentTarget;
  const targetNodeId = input.dataset.targetNode || nodeGraphModuleActionTargetNodeId?.();
  const layer = nodeGraphValueSliderFaceNormalizeLayerId(input.dataset.layer || "image1");
  const layerIndex = nodeGraphValueSliderFaceLayerIndex(layer);
  const sourceNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(targetNodeId) : null;
  const file = input.files?.[0];
  nodeGraphValueSliderFaceLog("INFO", "face file pick", {
    nodeId: targetNodeId,
    layer,
    hasNode: Boolean(sourceNode),
    type: sourceNode?.type,
    fileName: file?.name || null,
    fileType: file?.type || "(empty)",
    fileSize: file?.size ?? null,
  });
  if (!sourceNode || sourceNode.type !== "valueSlider" || !file) {
    nodeGraphValueSliderFaceLog("WARN", "face file pick aborted — need valueSlider node + file");
    return;
  }
  if (!nodeGraphValueSliderFaceFileLooksSupported(file)) {
    nodeGraphValueSliderFaceLog("FAIL", "unsupported face image type", {
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
    nodeGraphValueSliderFaceLog("FAIL", "FileReader error loading face image", {
      fileName: file.name,
      layer,
      error: String(reader.error || "unknown"),
    });
  };
  reader.onload = () => {
    const raw = String(reader.result || "");
    const header = raw.slice(0, Math.min(80, raw.indexOf(",") >= 0 ? raw.indexOf(",") : 80));
    const dataUrl = normalizeNodeGraphValueSliderFaceDataUrl(raw);
    if (!dataUrl) {
      nodeGraphValueSliderFaceLog("FAIL", "face data URL rejected by normalizer", {
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
    nodeGraphValueSliderFaceLog("INFO", "face data URL accepted", {
      fileName: file.name,
      layer,
      header: dataUrl.slice(0, dataUrl.indexOf(",") + 1),
      length: dataUrl.length,
    });
    nodeGraphValueSliderFaceMaybeStripSilverEdge(dataUrl).then((finalUrl) => {
      const prev = nodeGraphValueSliderFaceForNode(sourceNode);
      const nextLayers = prev.layers.map((entry, index) => (
        index === layerIndex
          ? {
            dataUrl: finalUrl,
            fileName: file.name || `${layer}-image`,
            rotate: Boolean(entry.rotate),
          }
          : { ...entry }
      ));
      const ok = commitNodeGraphValueSliderFace({
        ...prev,
        layers: nextLayers,
      }, {
        status: `value slider ${layer} image loaded`,
      });
      const after = typeof nodeGraphPatchNode === "function"
        ? nodeGraphValueSliderFaceForNode(nodeGraphPatchNode(targetNodeId))
        : null;
      nodeGraphValueSliderFaceLog(ok && after?.layers?.[layerIndex]?.dataUrl ? "INFO" : "FAIL", "face commit result", {
        commitOk: ok,
        layer,
        hasDataUrlAfterValidate: Boolean(after?.layers?.[layerIndex]?.dataUrl),
        fileNameAfter: after?.layers?.[layerIndex]?.fileName || "",
      });
    });
  };
  reader.readAsDataURL(file);
}

function clearNodeGraphValueSliderFaceImage(layerId = "image1") {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const layer = nodeGraphValueSliderFaceNormalizeLayerId(layerId);
  const layerIndex = nodeGraphValueSliderFaceLayerIndex(layer);
  const prev = nodeGraphValueSliderFaceForNode(sourceNode);
  const nextLayers = prev.layers.map((entry, index) => (
    index === layerIndex
      ? { dataUrl: "", fileName: "", rotate: Boolean(entry.rotate) }
      : { ...entry }
  ));
  commitNodeGraphValueSliderFace({
    ...prev,
    layers: nextLayers,
  }, { status: `value slider ${layer} image cleared` });
}

function setNodeGraphValueSliderFaceLayerRotateFromContext(layerId, { record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const layer = nodeGraphValueSliderFaceNormalizeLayerId(layerId);
  const layerIndex = nodeGraphValueSliderFaceLayerIndex(layer);
  const input = document.getElementById(`nodeSceneValueSliderFaceRotate${layerIndex + 1}`);
  const prev = nodeGraphValueSliderFaceForNode(sourceNode);
  const nextLayers = prev.layers.map((entry, index) => (
    index === layerIndex
      ? { ...entry, rotate: Boolean(input?.checked) }
      : { ...entry }
  ));
  commitNodeGraphValueSliderFace({
    ...prev,
    layers: nextLayers,
  }, { record, status: `value slider ${layer} rotate updated` });
}

/** @deprecated global rotate — kept so old bindings no-op safely */
function setNodeGraphValueSliderFaceRotateFromContext({ record = true } = {}) {
  setNodeGraphValueSliderFaceLayerRotateFromContext("image2", { record });
}

function setNodeGraphValueSliderFaceRotationDegreesFromContext({ record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const input = document.getElementById("nodeSceneValueSliderFaceRotationDegrees");
  const prev = nodeGraphValueSliderFaceForNode(sourceNode);
  commitNodeGraphValueSliderFace({
    ...prev,
    rotationDegrees: Number(input?.value),
  }, { record, status: "value slider rotation span updated" });
}

function setNodeGraphValueSliderFaceRotationOffsetFromContext({ record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const input = document.getElementById("nodeSceneValueSliderFaceRotationOffset");
  const prev = nodeGraphValueSliderFaceForNode(sourceNode);
  commitNodeGraphValueSliderFace({
    ...prev,
    rotationOffsetDegrees: Number(input?.value),
  }, { record, status: "value slider rotation offset updated" });
}

function setNodeGraphValueSliderFaceShowReadoutFromContext({ record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const input = document.getElementById("nodeSceneValueSliderFaceShowReadout");
  const prev = nodeGraphValueSliderFaceForNode(sourceNode);
  commitNodeGraphValueSliderFace({
    ...prev,
    showReadout: Boolean(input?.checked),
  }, { record, status: "value slider readout visibility updated" });
}

function syncNodeGraphValueSliderFaceControls(targetNode) {
  const controls = document.getElementById("nodeSceneValueSliderFaceControls");
  if (!controls) {
    return;
  }
  const isTarget = targetNode?.type === "valueSlider";
  controls.hidden = !isTarget;
  if (!isTarget) {
    return;
  }
  const face = nodeGraphValueSliderFaceForNode(targetNode);
  for (let i = 0; i < nodeGraphValueSliderFaceLayerCount; i += 1) {
    const n = i + 1;
    const layer = face.layers[i];
    const fileEl = document.getElementById(`nodeSceneValueSliderFaceFileName${n}`);
    if (fileEl) {
      fileEl.textContent = layer.dataUrl
        ? (layer.fileName || `image${n} loaded`)
        : "—";
      fileEl.title = layer.dataUrl ? (layer.fileName || `image${n}`) : "no image";
    }
    const clearBtn = document.getElementById(`nodeSceneValueSliderFaceClear${n}`);
    if (clearBtn) {
      clearBtn.disabled = !layer.dataUrl;
    }
    const rotate = document.getElementById(`nodeSceneValueSliderFaceRotate${n}`);
    if (rotate && document.activeElement !== rotate) {
      rotate.checked = Boolean(layer.rotate);
      rotate.disabled = false;
    }
  }
  const degrees = document.getElementById("nodeSceneValueSliderFaceRotationDegrees");
  const offset = document.getElementById("nodeSceneValueSliderFaceRotationOffset");
  const showReadout = document.getElementById("nodeSceneValueSliderFaceShowReadout");
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
 * Right-click on Value Slider face → Module Settings (face section visible).
 */
function openNodeValueSliderFaceContextMenu(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return false;
  }
  const face = target.closest?.(".node-value-slider-face");
  if (!face) {
    return false;
  }
  const nodeEl = face.closest?.(".dsp-node");
  const nodeId = String(nodeEl?.dataset?.node || face.dataset?.node || "").trim();
  const patchNode = nodeId && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  if (!patchNode || patchNode.type !== "valueSlider") {
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
