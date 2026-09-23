// Knob face = dial renderer (arc + label + value).
// Colors / readout options live in per-node Display Settings.
// Drag still drives Bias via the offset slider.
//
// Image-layer APIs remain for Module Settings / patches; the live
// face no longer paints stacked images unless art is loaded.

const nodeGraphKnobFaceAcceptedTypes = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

/** Layer count / keys (image1 = back, image6 = front). Max 6 for now. */
const NODE_GRAPH_KNOB_FACE_LABEL_TEXT_MAX = 48;

function nodeGraphKnobFaceNormalizeLabelText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, NODE_GRAPH_KNOB_FACE_LABEL_TEXT_MAX);
}

function nodeGraphKnobDisplayNameForNode(node) {
  const settings = nodeGraphControllerFaceSettingsForNode(node);
  return nodeGraphKnobFaceNormalizeLabelText(settings?.labelText);
}

function nodeGraphKnobTitleForNode(node) {
  return typeof normalizeNodeGraphPatchNodeAlias === "function"
    ? normalizeNodeGraphPatchNodeAlias(node?.alias)
    : String(node?.alias || "").trim();
}

function nodeGraphKnobPortalNameForNode(node) {
  const portal = String(node?.pluginName || "").trim();
  if (portal) {
    return portal;
  }
  const display = nodeGraphKnobDisplayNameForNode(node);
  if (display) {
    return display;
  }
  return nodeGraphKnobTitleForNode(node) || "";
}

function nodeGraphKnobFaceLabelTextForNode(node) {
  if (node?.type === "pluginSlider" && typeof nodeGraphSliderFaceDisplaySettingsForNode === "function") {
    const sliderText = nodeGraphKnobFaceNormalizeLabelText(
      nodeGraphSliderFaceDisplaySettingsForNode(node)?.labelText,
    );
    if (sliderText) {
      return sliderText;
    }
    return nodeGraphKnobTitleForNode(node) || String(nodeGraphNodeLabels?.pluginSlider || "Slider");
  }
  const text = nodeGraphKnobDisplayNameForNode(node);
  if (text) {
    return text;
  }
  return nodeGraphKnobTitleForNode(node) || String(nodeGraphNodeLabels?.knob || "Knob");
}

function nodeGraphNextFreeKnobPortalIndex(used) {
  for (let i = 0; i < 32; i += 1) {
    if (!used.has(i)) {
      return i;
    }
  }
  return null;
}

/** Unique 0–31 pluginId on every Knob. First claim wins; clashes/empty take next free. */
function nodeGraphAssignKnobPortalIndexes(patch) {
  const nodes = patch?.nodes;
  if (!Array.isArray(nodes)) {
    return false;
  }
  const used = new Set();
  let changed = false;
  for (const node of nodes) {
    if (!node || (node.type !== "knob" && node.type !== "pluginSlider")) {
      continue;
    }
    const raw = node.pluginId;
    const has = raw === 0 || (raw != null && raw !== "");
    let id = has ? Math.round(Number(raw)) : NaN;
    if (!Number.isFinite(id) || id < 0 || id > 31 || used.has(id)) {
      id = nodeGraphNextFreeKnobPortalIndex(used);
    }
    if (id == null) {
      if (Object.hasOwn(node, "pluginId")) {
        delete node.pluginId;
        changed = true;
      }
      continue;
    }
    if (node.pluginId !== id) {
      node.pluginId = id;
      changed = true;
    }
    used.add(id);
  }
  return changed;
}

function nodeGraphKnobFaceApplyLabelTextToDom(nodeId, text) {
  const shown = nodeGraphKnobFaceNormalizeLabelText(text) || String(nodeGraphNodeLabels?.knob || "Knob");
  const face = document.querySelector(`.node-knob-face[data-node="${CSS.escape(String(nodeId || ""))}"]`);
  const label = face?.querySelector?.("[data-knob-face-label]");
  if (label && label.dataset.editing !== "true") {
    label.textContent = shown;
  }
  const settingsInput = document.getElementById("nodeSceneKnobTextInput");
  if (settingsInput && document.activeElement !== settingsInput) {
    const targetId = typeof nodeGraphModuleActionTargetNodeId === "function"
      ? nodeGraphModuleActionTargetNodeId()
      : "";
    if (String(targetId) === String(nodeId || "")) {
      settingsInput.value = shown;
    }
  }
}

function nodeGraphControllerFaceSettingsForNode(node) {
  if (node?.type === "pluginSlider" && typeof nodeGraphSliderFaceDisplaySettingsForNode === "function") {
    return nodeGraphSliderFaceDisplaySettingsForNode(node);
  }
  return typeof nodeGraphKnobFaceDisplaySettingsForNode === "function"
    ? nodeGraphKnobFaceDisplaySettingsForNode(node)
    : {};
}

function nodeGraphControllerFaceNormalizeSettings(node, settings) {
  if (node?.type === "pluginSlider" && typeof normalizeNodeGraphSliderFaceDisplaySettings === "function") {
    return normalizeNodeGraphSliderFaceDisplaySettings(settings);
  }
  return typeof normalizeNodeGraphKnobFaceDisplaySettings === "function"
    ? normalizeNodeGraphKnobFaceDisplaySettings(settings)
    : settings;
}

function nodeGraphKnobFaceWriteLabelText(nodeId, rawText, { record = true } = {}) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return;
  }
  const stored = nodeGraphKnobFaceNormalizeLabelText(rawText);
  if (!record) {
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
    if (!live) {
      return;
    }
    const current = nodeGraphControllerFaceSettingsForNode(live);
    live.traceDisplaySettings = nodeGraphControllerFaceNormalizeSettings(live, { ...current, labelText: stored });
    if (nodeGraphMvp) {
      nodeGraphMvp.patchDirtyState = "edited";
    }
    nodeGraphKnobFaceApplyLabelTextToDom(id, stored);
    return;
  }
  if (typeof cloneNodeGraphPatch !== "function" || typeof commitNodeGraphPatch !== "function") {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const target = patch.nodes.find((node) => node.id === id);
  if (!target) {
    return;
  }
  const current = nodeGraphControllerFaceSettingsForNode(target);
  const next = nodeGraphControllerFaceNormalizeSettings(target, { ...current, labelText: stored });
  if (nodeGraphKnobFaceNormalizeLabelText(current.labelText) === next.labelText) {
    nodeGraphKnobFaceApplyLabelTextToDom(id, next.labelText);
    return;
  }
  target.traceDisplaySettings = next;
  commitNodeGraphPatch(patch, { status: target.type === "pluginSlider" ? "slider text changed" : "knob text changed" });
}

function beginNodeGraphKnobFaceLabelEdit(label, nodeId) {
  if (!label || label.dataset.editing === "true") {
    return;
  }
  label.dataset.editing = "true";
  label.contentEditable = "true";
  label.spellcheck = false;
  label.focus({ preventScroll: true });
  const selection = window.getSelection?.();
  if (selection && document.createRange) {
    const range = document.createRange();
    range.selectNodeContents(label);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  const finish = (commit) => {
    if (label.dataset.editing !== "true") {
      return;
    }
    label.dataset.editing = "false";
    label.contentEditable = "false";
    const next = commit ? label.textContent : nodeGraphKnobFaceLabelTextForNode(
      typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null,
    );
    nodeGraphKnobFaceWriteLabelText(nodeId, next, { record: true });
  };
  const onKey = (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      label.removeEventListener("keydown", onKey);
      label.removeEventListener("blur", onBlur);
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      label.removeEventListener("keydown", onKey);
      label.removeEventListener("blur", onBlur);
      finish(false);
    }
  };
  const onBlur = () => {
    label.removeEventListener("keydown", onKey);
    label.removeEventListener("blur", onBlur);
    finish(true);
  };
  label.addEventListener("keydown", onKey);
  label.addEventListener("blur", onBlur);
}

function attachNodeGraphKnobFaceLabelEdit(label, nodeId) {
  if (!label || label.dataset.labelEditBound === "true") {
    return;
  }
  label.dataset.labelEditBound = "true";
  label.title = "Click to edit knob text (separate from module title)";
  const stopDrag = (event) => {
    event.stopPropagation();
  };
  label.addEventListener("pointerdown", stopDrag);
  label.addEventListener("mousedown", stopDrag);
  label.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    beginNodeGraphKnobFaceLabelEdit(label, nodeId);
  });
}

const nodeGraphKnobFaceLayerCount = 6;
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
  // Centered span (degrees). Start is always −span/2 — no separate offset.
  rotationDegrees: 270,
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
 * into per-layer slots (image1…image6).
 */
function normalizeNodeGraphKnobFace(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  const rotationDegrees = Number(raw.rotationDegrees);

  const layers = nodeGraphKnobFaceLayerIds.map(() => nodeGraphKnobFaceEmptyLayer());

  if (Array.isArray(raw.layers) && raw.layers.length) {
    for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
      layers[i] = normalizeNodeGraphKnobFaceLayer(raw.layers[i]);
    }
  } else if (raw.image1 || raw.image2 || raw.image3 || raw.image4 || raw.image5 || raw.image6) {
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
    // image4…image6 stay empty under legacy migration
  }

  return {
    layers,
    // Named accessors for code that still uses face.imageN
    image1: layers[0],
    image2: layers[1],
    image3: layers[2],
    image4: layers[3],
    image5: layers[4],
    image6: layers[5],
    rotationDegrees: Number.isFinite(rotationDegrees)
      ? Math.max(0, Math.min(1440, rotationDegrees))
      : nodeGraphKnobFaceDefaults.rotationDegrees,
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
  return f.rotationDegrees !== defaults.rotationDegrees;
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

function nodeGraphControllerFaceReadoutSettings(patchNode) {
  const type = String(patchNode?.type || "");
  if (type === "pluginSlider" && typeof nodeGraphSliderFaceDisplaySettingsForNode === "function") {
    return nodeGraphSliderFaceDisplaySettingsForNode(patchNode);
  }
  if (typeof nodeGraphKnobFaceDisplaySettingsForNode === "function") {
    return nodeGraphKnobFaceDisplaySettingsForNode(patchNode);
  }
  return patchNode?.traceDisplaySettings && typeof patchNode.traceDisplaySettings === "object"
    ? patchNode.traceDisplaySettings
    : {};
}

/** Fixed decimal places for the face readout (Display Settings → Num decimals). */
function nodeGraphKnobFaceReadoutDecimals(patchNode) {
  const settings = nodeGraphControllerFaceReadoutSettings(patchNode);
  const n = Math.round(Number(settings?.decimals));
  if (Number.isFinite(n)) {
    return Math.max(0, Math.min(8, n));
  }
  return 2;
}

/** Total digit budget for the face number (Display Settings → Max digits). */
function nodeGraphKnobFaceReadoutMaxDigits(patchNode) {
  const settings = nodeGraphControllerFaceReadoutSettings(patchNode);
  const n = Math.round(Number(settings?.maxDigits));
  if (Number.isFinite(n)) {
    return Math.max(0, Math.min(12, n));
  }
  return nodeGraphKnobFaceReadoutDecimals(patchNode);
}

/** Format live Bias for the face plate. Max digits is the accuracy ceiling. */
function nodeGraphKnobFaceFormatReadout(value, patchNode, slider = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  const decimals = nodeGraphKnobFaceReadoutDecimals(patchNode);
  const maxDigits = nodeGraphKnobFaceReadoutMaxDigits(patchNode);
  const showSign = typeof nodeSliderShouldShowSign === "function" && slider
    ? nodeSliderShouldShowSign(slider)
    : true;
  const abs = Math.abs(number);
  let absText;
  if (typeof limit_decimals === "function") {
    const plain = typeof nodeGraphNumberReadoutPlainDecimalSource === "function"
      ? nodeGraphNumberReadoutPlainDecimalSource(abs)
      : String(abs);
    const minPlaces = Math.min(decimals, maxDigits);
    const maxPlaces = Math.max(decimals, maxDigits);
    const wholeDigits = String(Math.trunc(abs)).length;
    const budget = Math.max(maxDigits, minPlaces + wholeDigits);
    absText = limit_decimals(plain, budget, minPlaces, maxPlaces, false, false) || abs.toFixed(minPlaces);
  } else {
    absText = abs.toFixed(Math.min(decimals, maxDigits));
  }
  if (showSign && number >= 0) {
    return `+${absText}`;
  }
  if (number >= 0) {
    return ` ${absText}`;
  }
  return `-${absText}`;
}

/**
 * Dial cell min side in px (unscaled). Kept for geometry probes only —
 * do not publish this onto the shared face root (module + layout-canvas
 * reparent the same DOM; absolute px leaks canvas size onto the plate).
 */
function nodeGraphKnobFaceDialCellPx(face) {
  if (!face) {
    return 0;
  }
  const dial = face.querySelector?.("[data-knob-face-dial], .node-macro-knob-dial") || face;
  return Math.min(dial.clientWidth || 0, dial.clientHeight || 0);
}

/** @deprecated Prefer nodeGraphKnobFaceDialCellPx; kept for older call sites. */
function nodeGraphKnobFaceSquarePx(face) {
  if (!face) {
    return 0;
  }
  const raw = face.style?.getPropertyValue?.("--knob-dial-size")
    || getComputedStyle(face).getPropertyValue("--knob-dial-size");
  const dialScale = Math.max(0, Math.min(1, Number.parseFloat(raw) || 1));
  return nodeGraphKnobFaceDialCellPx(face) * dialScale;
}

/**
 * Clear canvas/module-shared size px vars + legacy inline fontSize.
 * Label/value scale via CSS container queries (cqmin) on the face/dial so
 * layout-canvas tile size cannot stick on the module plate.
 */
function nodeGraphKnobFaceSyncCellVar(face) {
  if (!face) {
    return;
  }
  if (face.style) {
    face.style.removeProperty("--knob-cell");
    face.style.removeProperty("--knob-face-min");
  }
  const readout = face.querySelector?.("[data-knob-face-readout]");
  if (readout?.style) {
    readout.style.fontSize = "";
    readout.style.lineHeight = "";
  }
  const label = face.querySelector?.("[data-knob-face-label]");
  if (label?.style) {
    label.style.fontSize = "";
    label.style.lineHeight = "";
  }
}

/** Value/label sizes are CSS: size × dialSize × 100cqmin (face/dial container). */
function nodeGraphKnobFaceFitReadout(_readout, face = null) {
  const host = face || _readout?.closest?.(".node-knob-face");
  nodeGraphKnobFaceSyncCellVar(host);
}

function nodeGraphKnobFaceFitLabel(_label, face = null) {
  const host = face || _label?.closest?.(".node-knob-face");
  nodeGraphKnobFaceSyncCellVar(host);
}

function attachNodeGraphKnobFaceReadoutFit(face) {
  if (!face || face._knobReadoutFitBound) {
    return;
  }
  face._knobReadoutFitBound = true;
  const run = () => {
    nodeGraphKnobFaceSyncCellVar(face);
  };
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      if (face._knobReadoutFitRaf) {
        cancelAnimationFrame(face._knobReadoutFitRaf);
      }
      face._knobReadoutFitRaf = requestAnimationFrame(run);
    });
    ro.observe(face);
    const dial = face.querySelector?.("[data-knob-face-dial], .node-macro-knob-dial");
    if (dial) {
      ro.observe(dial);
    }
    face._knobReadoutFitRo = ro;
  }
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
    // Phase F: MOD is bipolar unit [−1, 1]; sum then apply once.
    if (typeof normalizeNodeGraphParameterModulationInput === "function") {
      contribution += normalizeNodeGraphParameterModulationInput(src, metadata);
    } else if (typeof nodeGraphParamNormalizeModInput === "function") {
      contribution += nodeGraphParamNormalizeModInput(src, metadata);
    } else {
      contribution += src;
    }
  }
  let slider = base;
  if (hasMod) {
    if (typeof nodeGraphParamApplyMod === "function") {
      slider = nodeGraphParamApplyMod(base, contribution, metadata);
    } else if (typeof nodeGraphApplyParameterModulation === "function") {
      slider = nodeGraphApplyParameterModulation(base, contribution, metadata);
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

/** Bias domain from Bias parameter min/max (Parameter Settings). */
function nodeGraphKnobFaceBiasRange(patchNode) {
  if (typeof nodeGraphDspKnobOffsetDomain === "function") {
    return nodeGraphDspKnobOffsetDomain(patchNode);
  }
  let meta = null;
  if (typeof nodeGraphReadPatchParameterMetadata === "function" && patchNode) {
    meta = nodeGraphReadPatchParameterMetadata(patchNode, "offset");
  }
  if (!meta || typeof meta !== "object") {
    meta = patchNode?.paramMeta?.offset && typeof patchNode.paramMeta.offset === "object"
      ? patchNode.paramMeta.offset
      : {};
  }
  const lo = Number(meta.min);
  const hi = Number(meta.max);
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    const bipolar = meta.bipolar === true || (lo < 0 && hi > 0);
    return { bipolar, max: hi >= lo ? hi : lo, min: hi >= lo ? lo : hi };
  }
  return { bipolar: false, max: 1, min: 0 };
}

function nodeGraphKnobFaceOffsetMetadata(patchNode) {
  if (typeof nodeGraphReadPatchParameterMetadata === "function" && patchNode) {
    const meta = nodeGraphReadPatchParameterMetadata(patchNode, "offset");
    if (meta && typeof meta === "object") return meta;
  }
  const raw = patchNode?.paramMeta?.offset;
  return raw && typeof raw === "object" ? raw : {};
}

function nodeGraphKnobFaceUnitFromValue(value, patchNode) {
  const meta = nodeGraphKnobFaceOffsetMetadata(patchNode);
  if (typeof nodeGraphParamControlPosition === "function") {
    return nodeGraphParamControlPosition(value, meta);
  }
  const range = nodeGraphKnobFaceBiasRange(patchNode);
  const lo = range.min;
  const hi = range.max;
  if (!(hi > lo)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (Number(value) - lo) / (hi - lo)));
}

/** Keep Bias slider + face ARIA matched to Bias Parameter Settings min/max. */
function nodeGraphKnobFaceSyncOffsetDomain(patchNode) {
  if (!patchNode?.id) {
    return null;
  }
  const range = nodeGraphKnobFaceBiasRange(patchNode);
  const slider = typeof document !== "undefined"
    ? document.getElementById(`node-${patchNode.id}-offset`)
    : null;
  if (slider) {
    // Interactive thumb range only. Do NOT rewrite dataset.paramMin/paramMax —
    // those are Parameter Settings SSOT; stomping them from paramMeta every
    // paint raced metadata apply and snapped max back (e.g. 150 → 130).
    slider.min = String(range.min);
    slider.max = String(range.max);
    if (slider.dataset) {
      slider.dataset.min = String(range.min);
      slider.dataset.max = String(range.max);
      slider.dataset.bipolar = range.bipolar ? "true" : "false";
    }
  }
  // Do not write Bias min/max / paramMin / paramMax here — Parameter Settings owns them.
  const face = typeof document !== "undefined"
    ? document.querySelector(`.node-knob-face[data-node="${CSS.escape(String(patchNode.id))}"]`)
    : null;
  if (face) {
    face.setAttribute("aria-valuemin", String(range.min));
    face.setAttribute("aria-valuemax", String(range.max));
  }
  return range;
}

function nodeGraphKnobFaceUnitFromParams(patchNode) {
  const live = nodeGraphKnobFaceLiveOffset(patchNode?.id);
  return nodeGraphKnobFaceUnitFromValue(live, patchNode);
}

/** Apply per-node macro dial colors + arc geometry onto the face (local CSS vars only). */
function nodeGraphKnobFaceApplyMacroStyle(face, settings) {
  if (!face) {
    return;
  }
  const s = settings && typeof settings === "object"
    ? settings
    : (typeof normalizeNodeGraphKnobFaceDisplaySettings === "function"
      ? normalizeNodeGraphKnobFaceDisplaySettings()
      : {});
  const bg = s.background || "#000000";
  const fill = s.arcFill || "#f1b84b";
  const track = s.arcTrack || "#3a3428";
  face.style.setProperty("--macro-arc-fill", fill);
  face.style.setProperty("--macro-arc-track", track);
  face.style.setProperty("--knob-module-bg", bg);
  face.style.background = bg;

  // Span = total arc sweep, centered (symmetric left/right). Gap sits opposite center.
  // start = −span/2 so span 270° → −135°…+135° (classic pot gap at bottom).
  const span = Number.isFinite(Number(s.rotationDegrees))
    ? Math.max(0, Math.min(1440, Number(s.rotationDegrees)))
    : 270;
  const start = -span * 0.5;
  face.style.setProperty("--macro-arc-start-deg", `${start}deg`);
  face.style.setProperty("--macro-arc-span-deg", `${span}deg`);

  // Dial Size 0…1: only the arc widget (1 = fill available dial cell).
  const dialSize = Number.isFinite(Number(s.dialSize))
    ? Math.max(0, Math.min(1, Number(s.dialSize)))
    : 1;
  face.style.setProperty("--knob-dial-size", String(dialSize));

  const labelSize = Number.isFinite(Number(s.labelSize))
    ? Math.max(0, Math.min(1, Number(s.labelSize)))
    : 0.45;
  const valueSize = Number.isFinite(Number(s.valueSize))
    ? Math.max(0, Math.min(1, Number(s.valueSize)))
    : 0.45;
  face.style.setProperty("--knob-label-size", String(labelSize));
  face.style.setProperty("--knob-value-size", String(valueSize));
  nodeGraphKnobFaceSyncCellVar(face);

  const labelPos = typeof normalizeNodeGraphKnobFaceTextPosition === "function"
    ? normalizeNodeGraphKnobFaceTextPosition(s.labelPosition, "above")
    : (s.labelPosition || "above");
  const valuePos = typeof normalizeNodeGraphKnobFaceTextPosition === "function"
    ? normalizeNodeGraphKnobFaceTextPosition(s.valuePosition, "mid")
    : (s.valuePosition || "mid");
  face.dataset.knobLabelPosition = labelPos;
  face.dataset.knobValuePosition = valuePos;

  // Inner radius 0…1 → hole size; thickness fraction of radius = 1 − inner.
  const inner = Number.isFinite(Number(s.innerRadius))
    ? Math.max(0, Math.min(0.95, Number(s.innerRadius)))
    : 0.7;
  const thicknessFrac = Math.max(0.04, 1 - inner);
  face.style.setProperty("--macro-knob-arc-thickness-percent", String(thicknessFrac));
}

/**
 * Paint face from live Bias (scope / modulation). Call every display frame.
 * Macro dial arc uses unit 0…1 via --macro-value (same as bank macros).
 * When any image layer is loaded, hide macro chrome and show layers only.
 */
function paintNodeGraphKnobFaceLive(face, nodeId, buffer = null) {
  if (face?.classList?.contains("is-slider-look") && typeof paintNodeGraphSliderFaceLive === "function") {
    paintNodeGraphSliderFaceLive(face, nodeId, buffer);
    return;
  }
  if (face?.dataset?.knobFaceEditing === "true") {
    return;
  }
  if (!face || !nodeId) {
    return;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (patchNode && typeof nodeGraphKnobFaceSyncOffsetDomain === "function") {
    nodeGraphKnobFaceSyncOffsetDomain(patchNode);
  }
  const faceData = nodeGraphKnobFaceForNode(patchNode || { knobFace: null });
  const hasImage = nodeGraphKnobFaceHasAnyImage(faceData);
  const display = typeof nodeGraphKnobFaceDisplaySettingsForNode === "function"
    ? nodeGraphKnobFaceDisplaySettingsForNode(patchNode)
    : null;

  const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
    ? nodeGraphDspControllerDisplayIsMouse(patchNode)
    : true;
  let value = null;
  const offsetSlider = document.getElementById(`node-${nodeId}-offset`);
  if (wantsMouse) {
    // Arc follows the stored Bias the finger wrote, not the scope sample.
    const domain = Number(offsetSlider?.dataset?.domainValue);
    if (Number.isFinite(domain)) {
      value = domain;
    } else {
      const base = typeof nodeGraphReadNodeNumber === "function"
        ? nodeGraphReadNodeNumber(nodeId, "offset")
        : Number(patchNode?.params?.offset);
      value = Number.isFinite(base) ? base : 0;
    }
  } else {
    // Display = Smoothed: prefer live Bias (scope / published out), not mouse target.
    value = nodeGraphKnobFaceLiveOffset(nodeId);
    if (!Number.isFinite(value) && buffer?.length) {
      const sample = Number(buffer[buffer.length - 1]);
      if (Number.isFinite(sample)) {
        value = sample;
      }
    }
  }
  if (!Number.isFinite(value)) {
    value = 0;
  }

  const unit = nodeGraphKnobFaceUnitFromValue(value, patchNode || { id: nodeId });
  face.style.setProperty("--macro-value", String(unit));
  face.dataset.liveValue = String(value);
  face.setAttribute("aria-valuenow", String(value));
  face.classList.toggle("has-image", hasImage);
  face.dataset.hasImage = hasImage ? "true" : "false";

  const dial = face.querySelector("[data-knob-face-dial], .node-macro-knob-dial");
  if (dial) {
    dial.hidden = hasImage;
    dial.style.display = hasImage ? "none" : "";
  }

  if (hasImage) {
    // Image mode: layers only — hide shared macro title/dial/value chrome.
    nodeGraphKnobFaceApplyLayerTransforms(face, faceData, unit);
    const label = face.querySelector("[data-knob-face-label]");
    if (label) {
      label.hidden = true;
      label.style.display = "none";
    }
    const readout = face.querySelector("[data-knob-face-readout]");
    if (readout) {
      readout.hidden = true;
      readout.style.display = "none";
      readout.setAttribute("aria-hidden", "true");
    }
    nodeGraphKnobFaceSyncLightSource(face, true);
    return;
  }

  nodeGraphKnobFaceApplyMacroStyle(face, display);
  const showLabel = face.dataset.knobLabelPosition !== "off";
  const showReadout = face.dataset.knobValuePosition !== "off";

  const label = face.querySelector("[data-knob-face-label]");
  if (label) {
    if (label.dataset.editing !== "true") {
      label.textContent = nodeGraphKnobFaceLabelTextForNode(patchNode);
    }
    label.hidden = !showLabel;
    label.style.display = showLabel ? "" : "none";
    if (showLabel && typeof nodeGraphKnobFaceFitLabel === "function") {
      nodeGraphKnobFaceFitLabel(label, face);
    }
  }

  const readout = face.querySelector("[data-knob-face-readout]");
  if (readout) {
    if (showReadout) {
      const slider = document.getElementById(`node-${nodeId}-offset`);
      readout.hidden = false;
      readout.style.display = "";
      readout.setAttribute("aria-hidden", "false");
      readout.textContent = nodeGraphKnobFaceFormatReadout(value, patchNode, slider);
      if (typeof nodeGraphKnobFaceFitReadout === "function") {
        nodeGraphKnobFaceFitReadout(readout, face);
      }
    } else {
      readout.hidden = true;
      readout.style.display = "none";
      readout.setAttribute("aria-hidden", "true");
    }
  }

  nodeGraphKnobFaceSyncLightSource(face, true);
}

/** Degrees for Bias unit 0…1 along centered span (applied only to layers with rotate). */
function nodeGraphKnobFaceRotationDeg(face, unit01) {
  const u = Math.max(0, Math.min(1, nodeGraphFiniteNumber(unit01)));
  const span = Number.isFinite(Number(face?.rotationDegrees))
    ? Math.max(0, Math.min(1440, Number(face.rotationDegrees)))
    : 270;
  // Centered: u=0 → −span/2, u=1 → +span/2 (same as arc start…start+span).
  return -span * 0.5 + u * span;
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
 * Canvas-safe Bias type-in: overlay an input on the face readout (or dial).
 * Does not use the module body Bias/offset readout (missing on layout canvas).
 * Writes through the hidden offset slider → same DSP path as the Bias slider.
 */
function beginNodeGraphKnobFaceValueEdit(face, event = null) {
  if (!face || face.dataset.knobFaceEditing === "true") {
    return false;
  }
  const nodeId = String(face.dataset.node || "").trim();
  if (!nodeId) {
    return false;
  }
  const slider = document.getElementById(`node-${nodeId}-offset`);
  if (!slider) {
    return false;
  }
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  const readout = face.querySelector("[data-knob-face-readout]");
  const dial = face.querySelector("[data-knob-face-dial], .node-macro-knob-dial") || face;
  const host = readout || dial;
  if (!host) {
    return false;
  }

  face.dataset.knobFaceEditing = "true";
  const priorHidden = readout ? readout.hidden : false;
  if (readout) {
    readout.hidden = true;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "node-knob-face-value-input";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  const domainRaw = Number(slider.dataset?.domainValue);
  const editValue = Number.isFinite(domainRaw) ? domainRaw : Number(slider.value);
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  input.value = typeof nodeGraphKnobFaceFormatReadout === "function"
    ? nodeGraphKnobFaceFormatReadout(editValue, patchNode, slider)
    : String(editValue);
  input.setAttribute("aria-label", `${nodeGraphNodeDisplayName?.(nodeId) || "Knob"} Bias`);
  input.dataset.node = nodeId;
  input.dataset.sliderTarget = slider.id;

  const stop = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  for (const name of ["pointerdown", "mousedown", "click", "dblclick", "pointerup", "mouseup"]) {
    input.addEventListener(name, stop);
  }

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    face.dataset.knobFaceEditing = "false";
    document.removeEventListener("pointerdown", closeOutside, true);
    if (commit) {
      if (typeof updateNodeSliderCurrentValue === "function") {
        updateNodeSliderCurrentValue(slider, input.value);
      }
    }
    input.remove();
    if (readout) {
      readout.hidden = priorHidden;
      if (typeof paintNodeGraphKnobFaceLive === "function") {
        paintNodeGraphKnobFaceLive(face, nodeId, null);
      } else if (typeof syncNodeGraphKnobFaceFromSlider === "function") {
        syncNodeGraphKnobFaceFromSlider(slider);
      }
    }
  };

  const closeOutside = (ev) => {
    if (!document.contains(input) || finished) {
      document.removeEventListener("pointerdown", closeOutside, true);
      return;
    }
    if (ev.target === input || input.contains?.(ev.target)) {
      return;
    }
    finish(true);
  };

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      ev.stopPropagation();
      finish(true);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener("blur", () => {
    if (!finished) finish(true);
  });

  // Overlay on dial so canvas tiles and module plates share one path.
  const wrap = dial;
  wrap.style.position = wrap.style.position || "relative";
  input.style.position = "absolute";
  input.style.left = "50%";
  input.style.top = "50%";
  input.style.transform = "translate(-50%, -50%)";
  input.style.zIndex = "20";
  wrap.append(input);
  document.addEventListener("pointerdown", closeOutside, true);
  input.focus();
  input.select();
  return true;
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
    if (event.altKey) {
      return;
    }
    if (typeof beginNodeGraphKnobFaceValueEdit === "function") {
      beginNodeGraphKnobFaceValueEdit(face, event);
    }
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
 * Shared macro layout: title above dial · value centered in the circle.
 * Image layers stay in the tree; when any art is loaded, macro dial hides.
 */
function createNodeGraphKnobFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-knob-face node-module-scope-window node-knob-module-macro node-macro-knob";
  face.dataset.node = node;
  face.dataset.nodeType = type || "knob";
  face.dataset.knobLabelPosition = "above";
  face.dataset.knobValuePosition = "mid";
  face.dataset.sliderTarget = `node-${node}-offset`;
  face.dataset.lightStrength = "1";
  face.dataset.lightSource = "screen";
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} knob`);
  face.setAttribute("aria-valuemin", "-1");
  face.setAttribute("aria-valuemax", "1");
  face.setAttribute("aria-valuenow", "0");

  // Image layers (back → front); hidden until art is loaded.
  for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
    const layerId = nodeGraphKnobFaceLayerIds[i];
    const wrap = document.createElement("div");
    wrap.className = `node-knob-face-layer node-knob-face-${layerId} is-empty`;
    wrap.dataset.knobFaceLayer = layerId;
    wrap.style.zIndex = String(i);
    wrap.append(nodeGraphKnobFaceMakeLayerImg(layerId));
    face.append(wrap);
  }

  const label = document.createElement("span");
  label.className = "node-macro-knob-label";
  label.dataset.knobFaceLabel = "true";
  label.dataset.macroKnobLabel = "true";
  label.textContent = nodeGraphKnobFaceLabelTextForNode(
    typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null,
  );
  attachNodeGraphKnobFaceLabelEdit(label, node);

  const dial = document.createElement("span");
  dial.className = "node-macro-knob-dial";
  dial.dataset.macroKnobDial = "true";
  dial.dataset.knobFaceDial = "true";

  const readout = document.createElement("strong");
  readout.className = "node-macro-knob-value";
  readout.dataset.knobFaceReadout = "true";
  readout.textContent = "0.00";

  const arc = document.createElement("i");
  arc.className = "node-macro-knob-arc";
  arc.dataset.knobFaceArc = "true";
  arc.dataset.macroKnobArc = "true";
  arc.setAttribute("aria-hidden", "true");

  dial.append(readout, arc);
  face.append(label, dial);
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
  face.classList.add("node-knob-module-macro", "node-macro-knob");

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const faceData = nodeGraphKnobFaceForNode(patchNode || { knobFace: null });
  const hasAny = nodeGraphKnobFaceHasAnyImage(faceData);

  // Sync image layers (art mode).
  for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
    const layerId = nodeGraphKnobFaceLayerIds[i];
    let wrap = face.querySelector(`[data-knob-face-layer="${layerId}"]`);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = `node-knob-face-layer node-knob-face-${layerId} is-empty`;
      wrap.dataset.knobFaceLayer = layerId;
      wrap.style.zIndex = String(i);
      wrap.append(nodeGraphKnobFaceMakeLayerImg(layerId));
      face.prepend(wrap);
    }
    const img = wrap.querySelector(`[data-knob-face-image="${layerId}"]`)
      || wrap.querySelector("img");
    const layer = faceData.layers[i];
    nodeGraphKnobFaceApplyLayerImage(img, layer, nodeId, layerId);
    face.classList.toggle(`has-${layerId}`, Boolean(layer?.dataUrl));
  }

  face.classList.toggle("has-image", hasAny);
  face.dataset.hasImage = hasAny ? "true" : "false";
  const anyRotate = faceData.layers.some((layer) => layer.rotate && layer.dataUrl);
  face.classList.toggle("rotate-knob", anyRotate && hasAny);

  const moduleEl = face.closest?.(".dsp-node");
  if (moduleEl) {
    moduleEl.classList.toggle("knob-face-has-image", hasAny);
    if (hasAny) {
      moduleEl.dataset.hideModuleFrame = "1";
      if (typeof nodeGraphModuleFrameHide === "function") {
        nodeGraphModuleFrameHide(moduleEl);
      }
    } else {
      moduleEl.dataset.hideModuleFrame = "0";
      if (typeof nodeGraphModuleFrameRestoreStrokeVars === "function") {
        nodeGraphModuleFrameRestoreStrokeVars(moduleEl);
      }
    }
  }

  if (typeof paintNodeGraphKnobFaceLive === "function") {
    paintNodeGraphKnobFaceLive(face, nodeId, null);
  }
}

function refreshNodeGraphKnobFaces() {
  for (const face of document.querySelectorAll(".node-knob-face")) {
    if (face.classList.contains("is-slider-look")) {
      const id = face.dataset?.node;
      if (id && typeof paintNodeGraphSliderFaceLive === "function") {
        paintNodeGraphSliderFaceLive(face, id, null);
      }
      continue;
    }
    renderNodeGraphKnobFace(face);
  }
}

/** Live Bias drag: update readout + macro arc unit. */
function syncNodeGraphKnobFaceFromSlider(slider) {
  if (!slider || slider.dataset.param !== "offset") {
    return;
  }
  const module = slider.closest?.(".dsp-node");
  const type = module?.dataset?.nodeType;
  if (!module || (type !== "knob" && type !== "pluginSlider")) {
    return;
  }
  const face = module.querySelector(".node-knob-face");
  if (!face) {
    return;
  }
  const nodeId = module.dataset.node;
  if (type === "pluginSlider" || face.classList.contains("is-slider-look")) {
    if (typeof paintNodeGraphSliderFaceLive === "function" && nodeId) {
      paintNodeGraphSliderFaceLive(face, nodeId, null);
    }
    return;
  }
  if (typeof paintNodeGraphKnobFaceLive === "function" && nodeId) {
    paintNodeGraphKnobFaceLive(face, nodeId, null);
    return;
  }
  const readout = face.querySelector("[data-knob-face-readout]");
  const domainRaw = Number(slider.dataset?.domainValue);
  const displayValue = Number.isFinite(domainRaw) ? domainRaw : Number(slider.value);
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  if (readout && !readout.hidden) {
    readout.textContent = nodeGraphKnobFaceFormatReadout(displayValue, patchNode, slider);
  }
  const u = nodeGraphKnobFaceUnitFromValue(displayValue, patchNode);
  face.style.setProperty("--macro-value", String(u));
}

function nodeGraphKnobFaceTargetNodeId(explicitId = "") {
  const fromArg = String(explicitId || "").trim();
  if (fromArg) {
    return fromArg;
  }
  // Prefer Display Settings target (image layers live there).
  if (typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function") {
    const fromDisplay = String(nodeGraphTraceDisplaySettingsTargetNodeId() || "").trim();
    if (fromDisplay) {
      return fromDisplay;
    }
  }
  if (nodeGraphMvp?.traceDisplaySettingsTargetNode) {
    return String(nodeGraphMvp.traceDisplaySettingsTargetNode).trim();
  }
  return String(
    (typeof nodeGraphModuleActionTargetNodeId === "function"
      ? nodeGraphModuleActionTargetNodeId()
      : "") || "",
  ).trim();
}

function nodeGraphKnobFacePatchTarget(nodeId) {
  const id = nodeGraphKnobFaceTargetNodeId(nodeId);
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
  // Soft-sync Display Settings layer list (filenames / rotate flags).
  if (typeof syncNodeGraphKnobFaceDisplaySettingsControls === "function") {
    syncNodeGraphKnobFaceDisplaySettingsControls();
  }
  return true;
}

function pickNodeGraphKnobFaceImage(layerId = "image1") {
  const nodeId = nodeGraphKnobFaceTargetNodeId();
  const sourceNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  if (nodeGraphMvp) {
    nodeGraphMvp.sceneContextTargetNode = nodeId;
    nodeGraphMvp.lastModuleActionTargetNode = nodeId;
  }
  const layer = nodeGraphKnobFaceNormalizeLayerId(layerId);
  const layerIndex = nodeGraphKnobFaceLayerIndex(layer);
  if (typeof nodeGraphPickImageFile !== "function") {
    return;
  }
  nodeGraphPickImageFile((asset) => {
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : sourceNode;
    if (!live || live.type !== "knob") {
      return;
    }
    const apply = (finalUrl) => {
      const prev = nodeGraphKnobFaceForNode(live);
      const nextLayers = prev.layers.map((entry, index) => (
        index === layerIndex
          ? {
            dataUrl: finalUrl,
            fileName: asset.fileName || `${layer}-image`,
            rotate: Boolean(entry.rotate),
          }
          : { ...entry }
      ));
      commitNodeGraphKnobFace({
        ...prev,
        layers: nextLayers,
      }, {
        status: `value slider ${layer} image loaded`,
      });
    };
    if (typeof nodeGraphKnobFaceMaybeStripSilverEdge === "function") {
      nodeGraphKnobFaceMaybeStripSilverEdge(asset.dataUrl).then(apply);
    } else {
      apply(asset.dataUrl);
    }
  });
}

function nodeGraphKnobFaceFileLooksSupported(file) {
  return typeof nodeGraphImageFileLooksSupported === "function"
    ? nodeGraphImageFileLooksSupported(file)
    : false;
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

function clearNodeGraphKnobFaceImage(layerId = "image1") {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphKnobFaceTargetNodeId())
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

function setNodeGraphKnobFaceLayerRotate(layerId, rotate, { record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphKnobFaceTargetNodeId())
    : null;
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const layer = nodeGraphKnobFaceNormalizeLayerId(layerId);
  const layerIndex = nodeGraphKnobFaceLayerIndex(layer);
  const prev = nodeGraphKnobFaceForNode(sourceNode);
  const nextLayers = prev.layers.map((entry, index) => (
    index === layerIndex
      ? { ...entry, rotate: Boolean(rotate) }
      : { ...entry }
  ));
  commitNodeGraphKnobFace({
    ...prev,
    layers: nextLayers,
  }, { record, status: `value slider ${layer} rotate updated` });
}

function setNodeGraphKnobFaceLayerRotateFromContext(layerId, { record = true } = {}) {
  const layer = nodeGraphKnobFaceNormalizeLayerId(layerId);
  const layerIndex = nodeGraphKnobFaceLayerIndex(layer);
  // Prefer Display Settings checkbox; fall back to legacy Module Settings id.
  const displayInput = document.querySelector(
    `#nodeTraceDisplaySettingsPopover [data-knob-face-rotate="${layer}"]`,
  );
  const legacyInput = document.getElementById(`nodeSceneKnobFaceRotate${layerIndex + 1}`);
  const checked = Boolean(displayInput?.checked ?? legacyInput?.checked);
  setNodeGraphKnobFaceLayerRotate(layer, checked, { record });
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

/** @deprecated Offset removed — span is always centered (−span/2 … +span/2). */
function setNodeGraphKnobFaceRotationOffsetFromContext() {
  // no-op (kept so old bindings do not throw)
}

/**
 * Image layers / span / readout live in Display Settings now.
 * Module Settings must not resurface the old face controls block.
 */
function syncNodeGraphKnobFaceControls(_targetNode) {
  const controls = document.getElementById("nodeSceneKnobFaceControls");
  if (controls) {
    controls.hidden = true;
  }
  if (typeof syncNodeGraphKnobFaceDisplaySettingsControls === "function") {
    syncNodeGraphKnobFaceDisplaySettingsControls();
  }
}

/** Image-layer rows for Knob Display Settings (not Module Settings). */
function buildNodeGraphKnobFaceLayersDisplaySettingsHtml() {
  const layerCount = typeof nodeGraphKnobFaceLayerCount === "number"
    ? nodeGraphKnobFaceLayerCount
    : 6;
  const rows = [];
  for (let i = 1; i <= layerCount; i += 1) {
    rows.push(`
      <div class="node-knob-face-layer-row" data-knob-face-layer="image${i}">
        <button type="button" data-knob-face-action="load" data-knob-face-layer-id="image${i}">load</button>
        <button type="button" data-knob-face-action="clear" data-knob-face-layer-id="image${i}">clear</button>
        <label class="node-knob-face-check" title="Rotate with Bias">
          <input type="checkbox" data-knob-face-rotate="image${i}">
          <span>rotate</span>
        </label>
        <p class="node-knob-face-filename" data-knob-face-filename="image${i}" title="">—</p>
      </div>`);
  }
  return `
    <div class="metadata-section-title">Image layers</div>
    <div class="metadata-field-section node-knob-face-display-layers" data-knob-face-display-settings-panel>
      <p class="node-knob-face-display-hint">Back (1) → front (${layerCount}). Optional art replaces the dial.</p>
      <div class="node-knob-face-layer-stack">
        ${rows.join("\n")}
      </div>
    </div>`;
}

function commitNodeGraphKnobPluginIdentity() {
  const moduleId = typeof nodeGraphModuleActionTargetNodeId === "function"
    ? nodeGraphModuleActionTargetNodeId()
    : "";
  const { patch, targetNode } = nodeGraphKnobFacePatchTarget(moduleId);
  if (!patch || !targetNode || (targetNode.type !== "knob" && targetNode.type !== "pluginSlider")) {
    return;
  }
  const folderEl = document.getElementById("nodeSceneKnobPluginFolder");
  const nameEl = document.getElementById("nodeSceneKnobPluginName");
  const idEl = document.getElementById("nodeSceneKnobPluginId");
  if (!folderEl && !nameEl && !idEl) {
    return;
  }
  const folder = String(folderEl?.value || "").trim();
  const name = String(nameEl?.value || "").trim();
  const idRaw = String(idEl?.value || "").trim();
  if (folder) {
    targetNode.pluginFolder = folder;
  } else {
    delete targetNode.pluginFolder;
  }
  if (name) {
    targetNode.pluginName = name;
  } else {
    delete targetNode.pluginName;
  }
  if (idRaw === "") {
    delete targetNode.pluginId;
  } else {
    let n = Math.round(Number(idRaw));
    if (!Number.isFinite(n)) {
      delete targetNode.pluginId;
    } else {
      n = Math.max(0, Math.min(31, n));
      targetNode.pluginId = n;
      if (idEl && String(idEl.value) !== String(n) && document.activeElement !== idEl) {
        idEl.value = String(n);
      }
    }
  }
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, { record: true, status: "knob plugin identity", softDom: true, markPending: false });
  }
}

function bindNodeGraphKnobFaceDisplaySettingsEvents(root) {
  const panel = root?.querySelector?.("[data-knob-face-display-settings-panel]") || root;
  if (!panel || panel.dataset.knobFaceDisplayBound === "true") {
    return;
  }
  panel.dataset.knobFaceDisplayBound = "true";
  panel.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("[data-knob-face-action]");
    if (!btn) {
      return;
    }
    event.preventDefault();
    const layerId = btn.dataset.knobFaceLayerId || "image1";
    const action = btn.dataset.knobFaceAction;
    if (action === "load") {
      pickNodeGraphKnobFaceImage(layerId);
    } else if (action === "clear") {
      clearNodeGraphKnobFaceImage(layerId);
    }
  });
  panel.addEventListener("change", (event) => {
    const input = event.target?.closest?.("[data-knob-face-rotate]");
    if (!input) {
      return;
    }
    const layerId = input.getAttribute("data-knob-face-rotate") || "image1";
    setNodeGraphKnobFaceLayerRotate(layerId, Boolean(input.checked), { record: true });
  });
}

function syncNodeGraphKnobFaceDisplaySettingsControls(root) {
  const host = root
    || document.getElementById("nodeTraceDisplaySettingsPopover");
  const panel = host?.querySelector?.("[data-knob-face-display-settings-panel]")
    || document.querySelector("#nodeTraceDisplaySettingsPopover [data-knob-face-display-settings-panel]");
  if (!panel) {
    return;
  }
  const nodeId = nodeGraphKnobFaceTargetNodeId();
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "knob") {
    return;
  }
  const face = nodeGraphKnobFaceForNode(node);
  for (let i = 0; i < nodeGraphKnobFaceLayerCount; i += 1) {
    const layerId = `image${i + 1}`;
    const layer = face.layers[i];
    const fileEl = panel.querySelector(`[data-knob-face-filename="${layerId}"]`);
    if (fileEl) {
      fileEl.textContent = layer.dataUrl
        ? (layer.fileName || `${layerId} loaded`)
        : "—";
      fileEl.title = layer.dataUrl ? (layer.fileName || layerId) : "no image";
    }
    const clearBtn = panel.querySelector(
      `[data-knob-face-action="clear"][data-knob-face-layer-id="${layerId}"]`,
    );
    if (clearBtn) {
      clearBtn.disabled = !layer.dataUrl;
    }
    const rotate = panel.querySelector(`[data-knob-face-rotate="${layerId}"]`);
    if (rotate && document.activeElement !== rotate) {
      rotate.checked = Boolean(layer.rotate);
    }
  }
}

/**
 * Right-click on Knob face → Display Settings (image layers, colors, span).
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
  if (!patchNode || (patchNode.type !== "knob" && patchNode.type !== "pluginSlider")) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (nodeGraphMvp) {
    nodeGraphMvp.sceneContextTargetNode = nodeId;
    nodeGraphMvp.lastModuleActionTargetNode = nodeId;
  }
  if (typeof openNodeGraphTraceDisplaySettings === "function") {
    return openNodeGraphTraceDisplaySettings(nodeId, event);
  }
  return false;
}
