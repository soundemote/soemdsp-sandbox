// Knob face = shared macro-knob dial renderer (arc + label + value).
// Colors / readout options live in per-node Display Settings (not the global
// Macro Controls bank). Bank look (thickness, span, size) is the Macro
// Controls display-settings face. Drag still drives Bias via the offset slider.
//
// Legacy image-layer APIs remain for old Module Settings / patches; the live
// face no longer paints stacked images.

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

function nodeGraphKnobFaceLabelTextForNode(node) {
  const settings = typeof nodeGraphKnobFaceDisplaySettingsForNode === "function"
    ? nodeGraphKnobFaceDisplaySettingsForNode(node)
    : node?.traceDisplaySettings;
  const text = nodeGraphKnobFaceNormalizeLabelText(settings?.labelText);
  if (text) {
    return text;
  }
  return String(nodeGraphNodeLabels?.knob || "Knob");
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

function nodeGraphKnobFaceWriteLabelText(nodeId, rawText, { record = true } = {}) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return;
  }
  const text = nodeGraphKnobFaceNormalizeLabelText(rawText);
  const stored = text || "Knob";
  if (!record) {
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
    if (!live) {
      return;
    }
    const current = typeof nodeGraphKnobFaceDisplaySettingsForNode === "function"
      ? nodeGraphKnobFaceDisplaySettingsForNode(live)
      : {};
    live.traceDisplaySettings = typeof normalizeNodeGraphKnobFaceDisplaySettings === "function"
      ? normalizeNodeGraphKnobFaceDisplaySettings({ ...current, labelText: stored })
      : { ...(live.traceDisplaySettings || {}), labelText: stored };
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
  const current = typeof nodeGraphKnobFaceDisplaySettingsForNode === "function"
    ? nodeGraphKnobFaceDisplaySettingsForNode(target)
    : {};
  const next = typeof normalizeNodeGraphKnobFaceDisplaySettings === "function"
    ? normalizeNodeGraphKnobFaceDisplaySettings({ ...current, labelText: stored })
    : { ...(target.traceDisplaySettings || {}), labelText: stored };
  if (nodeGraphKnobFaceNormalizeLabelText(current.labelText) === next.labelText) {
    nodeGraphKnobFaceApplyLabelTextToDom(id, next.labelText);
    return;
  }
  target.traceDisplaySettings = next;
  commitNodeGraphPatch(patch, { status: "knob text changed" });
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
  }
  const valueScale = Number.parseFloat(
    host.style?.getPropertyValue?.("--knob-value-size")
    || getComputedStyle(host).getPropertyValue("--knob-value-size"),
  );
  const scale = Number.isFinite(valueScale) ? Math.max(0, Math.min(1, valueScale)) : 0.45;
  style.fontSize = `${(best * scale).toFixed(2)}px`;

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

/** Live Max + Polarity → Bias domain [min, max] for dial mapping. */
function nodeGraphKnobFaceBiasRange(patchNode) {
  const id = patchNode?.id;
  let rangeMax = 1;
  let polarity = 0;
  if (id && typeof nodeGraphReadNodeNumber === "function") {
    const rm = nodeGraphReadNodeNumber(id, "rangeMax");
    const pol = nodeGraphReadNodeNumber(id, "polarity");
    if (Number.isFinite(rm)) rangeMax = rm;
    if (Number.isFinite(pol)) polarity = pol;
  } else {
    const rm = Number(patchNode?.params?.rangeMax);
    const pol = Number(patchNode?.params?.polarity);
    if (Number.isFinite(rm)) rangeMax = rm;
    if (Number.isFinite(pol)) polarity = pol;
  }
  if (typeof nodeGraphDspKnobBiasRange === "function") {
    return nodeGraphDspKnobBiasRange(rangeMax, polarity);
  }
  const hi = Math.abs(rangeMax) > 0 ? Math.abs(rangeMax) : 1;
  const bipolar = Math.round(polarity) >= 1;
  return { min: bipolar ? -hi : 0, max: hi, bipolar };
}

function nodeGraphKnobFaceUnitFromValue(value, patchNode) {
  const range = nodeGraphKnobFaceBiasRange(patchNode);
  const lo = range.min;
  const hi = range.max;
  if (!(hi > lo)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (Number(value) - lo) / (hi - lo)));
}

/** Keep hidden offset slider + face ARIA in sync with Max / Polarity. */
function nodeGraphKnobFaceSyncOffsetDomain(patchNode) {
  if (!patchNode?.id) {
    return null;
  }
  const range = nodeGraphKnobFaceBiasRange(patchNode);
  const slider = typeof document !== "undefined"
    ? document.getElementById(`node-${patchNode.id}-offset`)
    : null;
  if (slider) {
    slider.min = String(range.min);
    slider.max = String(range.max);
    if (slider.dataset) {
      slider.dataset.min = String(range.min);
      slider.dataset.max = String(range.max);
    }
  }
  if (patchNode.paramMeta && typeof patchNode.paramMeta === "object") {
    const meta = patchNode.paramMeta.offset && typeof patchNode.paramMeta.offset === "object"
      ? patchNode.paramMeta.offset
      : {};
    patchNode.paramMeta.offset = {
      ...meta,
      bipolar: Boolean(range.bipolar),
      min: range.min,
      max: range.max,
      mid: range.bipolar ? 0 : range.max * 0.5,
    };
  }
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
  }

  const readout = face.querySelector("[data-knob-face-readout]");
  if (readout) {
    if (showReadout) {
      const slider = document.getElementById(`node-${nodeId}-offset`);
      readout.hidden = false;
      readout.style.display = "";
      readout.setAttribute("aria-hidden", "false");
      readout.textContent = nodeGraphKnobFaceFormatReadout(value, patchNode, slider);
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
  const u = Math.max(0, Math.min(1, Number(unit01) || 0));
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
    renderNodeGraphKnobFace(face);
  }
}

/** Live Bias drag: update readout + macro arc unit. */
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
  const nodeId = module.dataset.node;
  // Prefer full live paint (includes In + mod) when available.
  if (typeof paintNodeGraphKnobFaceLive === "function" && nodeId) {
    paintNodeGraphKnobFaceLive(face, nodeId, null);
    return;
  }
  const readout = face.querySelector("[data-knob-face-readout]");
  const displayValue = Number(slider.value);
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  if (readout && !readout.hidden) {
    readout.textContent = nodeGraphKnobFaceFormatReadout(displayValue, patchNode, slider);
  }
  const min = Number(slider.min);
  const max = Number(slider.max);
  let u = 0.5;
  if (Number.isFinite(min) && Number.isFinite(max) && max !== min) {
    u = (displayValue - min) / (max - min);
  }
  u = Math.max(0, Math.min(1, u));
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
      <p class="node-knob-face-display-hint">Back (1) → front (${layerCount}). Optional art replaces the macro dial.</p>
      <div class="node-knob-face-layer-stack">
        ${rows.join("\n")}
      </div>
    </div>`;
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
  const panel = root?.querySelector?.("[data-knob-face-display-settings-panel]")
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
  if (!patchNode || patchNode.type !== "knob") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  // Preserve multi-select for same-display multi-adjust when this knob is already selected.
  const alreadySelected = typeof nodeGraphSelectedNodeIds === "function"
    && nodeGraphSelectedNodeIds().has(nodeId);
  if (!alreadySelected && typeof setNodeGraphSelection === "function") {
    setNodeGraphSelection({ type: "node", id: nodeId });
  }
  if (nodeGraphMvp) {
    nodeGraphMvp.sceneContextTargetNode = nodeId;
    nodeGraphMvp.lastModuleActionTargetNode = nodeId;
  }
  if (typeof openNodeGraphTraceDisplaySettings === "function") {
    return openNodeGraphTraceDisplaySettings(nodeId, event);
  }
  return false;
}
