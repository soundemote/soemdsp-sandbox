// Value Slider face visuals: three image layers + optional mid-layer knob
// rotation + readout overlay. Right-click the face → Module Settings.
//
// Layer stack (back → front):
//   bottom  — static (does not rotate)
//   mid     — optional rotate-like-knob (maps Bias / offset)
//   top     — static (does not rotate)
//   label / readout overlays (text)
//
// Formats: PNG, JPEG, WebP, GIF, SVG (APNG when the browser animates image/png).

const nodeGraphValueSliderFaceAcceptedTypes = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const nodeGraphValueSliderFaceLayerIds = Object.freeze(["bottom", "mid", "top"]);

const nodeGraphValueSliderFaceDefaults = Object.freeze({
  bottom: Object.freeze({ dataUrl: "", fileName: "" }),
  mid: Object.freeze({ dataUrl: "", fileName: "" }),
  top: Object.freeze({ dataUrl: "", fileName: "" }),
  // Mid layer only: map Bias across rotationDegrees (knob feel).
  rotateLikeKnob: false,
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
  };
}

function normalizeNodeGraphValueSliderFace(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  // Legacy single-image shape → mid layer.
  const legacyUrl = normalizeNodeGraphValueSliderFaceDataUrl(raw.dataUrl || raw.src || "");
  const legacyName = String(raw.fileName || raw.name || "").trim().slice(0, 96);
  const midSource = raw.mid && typeof raw.mid === "object"
    ? raw.mid
    : (legacyUrl ? { dataUrl: legacyUrl, fileName: legacyName } : {});
  const rotationDegrees = Number(raw.rotationDegrees);
  const rotationOffsetDegrees = Number(raw.rotationOffsetDegrees);
  return {
    bottom: normalizeNodeGraphValueSliderFaceLayer(raw.bottom),
    mid: normalizeNodeGraphValueSliderFaceLayer(midSource),
    top: normalizeNodeGraphValueSliderFaceLayer(raw.top),
    rotateLikeKnob: Boolean(raw.rotateLikeKnob ?? raw.rotate),
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
  return Boolean(f.bottom.dataUrl || f.mid.dataUrl || f.top.dataUrl);
}

function nodeGraphValueSliderFaceIsNonDefault(face) {
  const f = normalizeNodeGraphValueSliderFace(face);
  return nodeGraphValueSliderFaceHasAnyImage(f)
    || f.rotateLikeKnob
    || !f.showReadout
    || !f.showLabel
    || f.rotationDegrees !== nodeGraphValueSliderFaceDefaults.rotationDegrees
    || f.rotationOffsetDegrees !== nodeGraphValueSliderFaceDefaults.rotationOffsetDegrees;
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

function nodeGraphValueSliderFaceRotationDeg(face, unit01) {
  if (!face?.rotateLikeKnob) {
    return 0;
  }
  const u = Math.max(0, Math.min(1, Number(unit01) || 0));
  return Number(face.rotationOffsetDegrees) + u * Number(face.rotationDegrees);
}

function nodeGraphValueSliderFaceMakeLayerImg(layerId) {
  const img = document.createElement("img");
  img.className = `node-value-slider-face-image node-value-slider-face-image-${layerId}`;
  img.dataset.valueSliderFaceImage = layerId;
  img.alt = "";
  img.draggable = false;
  img.hidden = true;
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
  // Workspace also listens capture-phase; attach here for lostpointercapture
  // and so face is currentTarget when handlers run on the element itself.
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
  // Swallow native dblclick so solid-shell Module Settings does not open;
  // type-in edit is handled inside beginNodeSliderDrag (second pointerdown).
  face.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}

/**
 * Build the LayoutB face DOM (called from factories).
 * Stack: bottom (static) → mid plate (optional rotate) → top (static) → text.
 */
function createNodeGraphValueSliderFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-value-slider-face";
  face.dataset.node = node;
  face.dataset.nodeType = type || "valueSlider";
  // Same contract as Bias readout: drives input#node-{id}-offset.
  face.dataset.sliderTarget = `node-${node}-offset`;
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} value display`);

  const bottom = document.createElement("div");
  bottom.className = "node-value-slider-face-layer node-value-slider-face-bottom";
  bottom.dataset.valueSliderFaceLayer = "bottom";
  bottom.append(nodeGraphValueSliderFaceMakeLayerImg("bottom"));

  const plate = document.createElement("div");
  plate.className = "node-value-slider-face-plate node-value-slider-face-layer";
  plate.dataset.valueSliderFacePlate = "true";
  plate.dataset.valueSliderFaceLayer = "mid";
  plate.append(nodeGraphValueSliderFaceMakeLayerImg("mid"));

  const top = document.createElement("div");
  top.className = "node-value-slider-face-layer node-value-slider-face-top";
  top.dataset.valueSliderFaceLayer = "top";
  top.append(nodeGraphValueSliderFaceMakeLayerImg("top"));

  const label = document.createElement("div");
  label.className = "node-value-slider-face-label";
  label.dataset.valueSliderFaceLabel = "true";
  label.textContent = nodeGraphNodeLabels?.[type || "valueSlider"] || "Value";

  const readout = document.createElement("div");
  readout.className = "node-value-slider-face-readout";
  readout.dataset.valueSliderFaceReadout = "true";
  readout.textContent = "0";

  face.append(bottom, plate, top, label, readout);
  attachNodeGraphValueSliderFaceDrag(face);
  renderNodeGraphValueSliderFace(face, node);
  return face;
}

function nodeGraphValueSliderFaceApplyLayerImage(img, layer, nodeId, layerId) {
  if (!img) {
    return;
  }
  if (layer?.dataUrl) {
    if (img.getAttribute("src") !== layer.dataUrl) {
      img.onerror = () => {
        nodeGraphValueSliderFaceLog("FAIL", `face ${layerId} <img> failed to decode`, {
          nodeId,
          fileName: layer.fileName,
          header: layer.dataUrl.slice(0, Math.min(64, layer.dataUrl.indexOf(",") + 1 || 64)),
        });
      };
      img.onload = () => {
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
    img.alt = layer.fileName || `${layerId} layer`;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    img.alt = "";
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
  const plate = face.querySelector("[data-value-slider-face-plate]");
  const label = face.querySelector("[data-value-slider-face-label]");
  const readout = face.querySelector("[data-value-slider-face-readout]");

  const hasAny = nodeGraphValueSliderFaceHasAnyImage(faceData);
  face.classList.toggle("has-image", hasAny);
  face.classList.toggle("has-bottom", Boolean(faceData.bottom.dataUrl));
  face.classList.toggle("has-mid", Boolean(faceData.mid.dataUrl));
  face.classList.toggle("has-top", Boolean(faceData.top.dataUrl));
  face.classList.toggle("rotate-knob", Boolean(faceData.rotateLikeKnob));
  face.classList.toggle("show-readout", Boolean(faceData.showReadout));
  face.dataset.hasImage = hasAny ? "true" : "false";
  face.dataset.showReadout = faceData.showReadout ? "true" : "false";

  for (const layerId of nodeGraphValueSliderFaceLayerIds) {
    const img = face.querySelector(`[data-value-slider-face-image="${layerId}"]`);
    nodeGraphValueSliderFaceApplyLayerImage(img, faceData[layerId], nodeId, layerId);
  }

  if (label) {
    label.hidden = !faceData.showLabel || hasAny;
    if (!hasAny) {
      // Face caption = user alias (Module Settings ALIAS); fallback to type name.
      const alias = typeof normalizeNodeGraphPatchNodeAlias === "function"
        ? normalizeNodeGraphPatchNodeAlias(patchNode?.alias)
        : String(patchNode?.alias || "").trim();
      label.textContent = alias
        || (nodeGraphNodeLabels?.valueSlider || "Value Slider");
    }
  }
  if (readout) {
    // hidden alone is not enough: .node-value-slider-face-readout { display: flex }
    // can override [hidden] in author CSS. Class + attribute keep the graphic clean.
    const show = Boolean(faceData.showReadout);
    readout.hidden = !show;
    readout.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show) {
      readout.textContent = "";
    } else {
      const slider = document.getElementById(`node-${nodeId}-offset`);
      if (slider && typeof syncNodeGraphValueSliderFaceFromSlider === "function") {
        // Fill numeric text without depending on a later drag sample.
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
  const deg = nodeGraphValueSliderFaceRotationDeg(faceData, unit);
  if (plate) {
    // Only the mid plate rotates; bottom/top stay fixed.
    plate.style.transform = faceData.rotateLikeKnob && faceData.mid.dataUrl
      ? `rotate(${deg}deg)`
      : "";
  }
}

function refreshNodeGraphValueSliderFaces() {
  for (const face of document.querySelectorAll(".node-value-slider-face")) {
    renderNodeGraphValueSliderFace(face);
  }
}

/** Live Bias drag: update readout + mid-layer knob angle. */
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
  const plate = face.querySelector("[data-value-slider-face-plate]");
  if (plate && faceData.rotateLikeKnob && faceData.mid.dataUrl) {
    const min = Number(slider.min);
    const max = Number(slider.max);
    let u = 0.5;
    if (Number.isFinite(min) && Number.isFinite(max) && max !== min) {
      u = (displayValue - min) / (max - min);
    }
    u = Math.max(0, Math.min(1, u));
    const next = `rotate(${nodeGraphValueSliderFaceRotationDeg(faceData, u)}deg)`;
    // Skip no-op writes so CSS transform transition does not flash.
    if (plate.style.transform !== next) {
      plate.style.transform = next;
    }
  } else if (plate && plate.style.transform) {
    plate.style.transform = "";
  }
}

function nodeGraphValueSliderFacePatchTarget(nodeId) {
  const id = String(nodeId || nodeGraphModuleActionTargetNodeId?.() || "").trim();
  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : null;
  const targetNode = patch?.nodes?.find((node) => node.id === id) || null;
  return { id, patch, targetNode };
}

function commitNodeGraphValueSliderFace(nextFace, { record = true, status = "value slider face updated" } = {}) {
  const { patch, targetNode } = nodeGraphValueSliderFacePatchTarget();
  if (!patch || !targetNode || targetNode.type !== "valueSlider") {
    return false;
  }
  targetNode.valueSliderFace = normalizeNodeGraphValueSliderFace(nextFace);
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, { record, status });
  }
  renderNodeGraphValueSliderFace(targetNode.id);
  if (typeof configureNodeSceneContextMenu === "function") {
    configureNodeSceneContextMenu("module");
  }
  return true;
}

function nodeGraphValueSliderFaceNormalizeLayerId(layerId) {
  const id = String(layerId || "mid").trim().toLowerCase();
  return nodeGraphValueSliderFaceLayerIds.includes(id) ? id : "mid";
}

function pickNodeGraphValueSliderFaceImage(layerId = "mid") {
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

function handleNodeGraphValueSliderFaceFileInputChange(event) {
  const input = event.currentTarget;
  const targetNodeId = input.dataset.targetNode || nodeGraphModuleActionTargetNodeId?.();
  const layer = nodeGraphValueSliderFaceNormalizeLayerId(input.dataset.layer || "mid");
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
    const prev = nodeGraphValueSliderFaceForNode(sourceNode);
    const next = {
      ...prev,
      [layer]: {
        dataUrl,
        fileName: file.name || `${layer}-image`,
      },
    };
    const ok = commitNodeGraphValueSliderFace(next, {
      status: `value slider ${layer} image loaded`,
    });
    const after = typeof nodeGraphPatchNode === "function"
      ? nodeGraphValueSliderFaceForNode(nodeGraphPatchNode(targetNodeId))
      : null;
    nodeGraphValueSliderFaceLog(ok && after?.[layer]?.dataUrl ? "INFO" : "FAIL", "face commit result", {
      commitOk: ok,
      layer,
      hasDataUrlAfterValidate: Boolean(after?.[layer]?.dataUrl),
      fileNameAfter: after?.[layer]?.fileName || "",
    });
  };
  reader.readAsDataURL(file);
}

function clearNodeGraphValueSliderFaceImage(layerId = "mid") {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const layer = nodeGraphValueSliderFaceNormalizeLayerId(layerId);
  const prev = nodeGraphValueSliderFaceForNode(sourceNode);
  commitNodeGraphValueSliderFace({
    ...prev,
    [layer]: { dataUrl: "", fileName: "" },
  }, { status: `value slider ${layer} image cleared` });
}

function setNodeGraphValueSliderFaceRotateFromContext({ record = true } = {}) {
  const sourceNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId?.())
    : null;
  if (!sourceNode || sourceNode.type !== "valueSlider") {
    return;
  }
  const input = document.getElementById("nodeSceneValueSliderFaceRotate");
  const prev = nodeGraphValueSliderFaceForNode(sourceNode);
  commitNodeGraphValueSliderFace({
    ...prev,
    rotateLikeKnob: Boolean(input?.checked),
  }, { record, status: "value slider rotate updated" });
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
  const fileNameIds = {
    bottom: "nodeSceneValueSliderFaceFileNameBottom",
    mid: "nodeSceneValueSliderFaceFileNameMid",
    top: "nodeSceneValueSliderFaceFileNameTop",
  };
  const clearIds = {
    bottom: "nodeSceneValueSliderFaceClearBottom",
    mid: "nodeSceneValueSliderFaceClearMid",
    top: "nodeSceneValueSliderFaceClearTop",
  };
  const emptyLabels = { top: "no top image", mid: "no mid image", bottom: "no low image" };
  for (const layerId of nodeGraphValueSliderFaceLayerIds) {
    const el = document.getElementById(fileNameIds[layerId]);
    const layer = face[layerId];
    if (el) {
      el.textContent = layer.dataUrl
        ? (layer.fileName || `${layerId} loaded`)
        : (emptyLabels[layerId] || `no ${layerId} image`);
    }
    const clearBtn = document.getElementById(clearIds[layerId]);
    if (clearBtn) {
      clearBtn.disabled = !layer.dataUrl;
    }
  }
  const rotate = document.getElementById("nodeSceneValueSliderFaceRotate");
  const degrees = document.getElementById("nodeSceneValueSliderFaceRotationDegrees");
  const offset = document.getElementById("nodeSceneValueSliderFaceRotationOffset");
  const showReadout = document.getElementById("nodeSceneValueSliderFaceShowReadout");
  // Rotate is always interactive (preference can be set before a mid image loads).
  if (rotate && document.activeElement !== rotate) {
    rotate.checked = face.rotateLikeKnob;
    rotate.disabled = false;
  }
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
