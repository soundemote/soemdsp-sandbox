// Picture face: SVG/image load (Knob–style data URL) + center-based place.

const nodeGraphRgbPictureSettingsDefaults = Object.freeze({
  background: "#000000",
  dataUrl: "",
  fileName: "",
});

function normalizeNodeGraphRgbPictureDataUrl(value) {
  return typeof normalizeNodeGraphImageDataUrl === "function"
    ? normalizeNodeGraphImageDataUrl(value)
    : "";
}

function normalizeNodeGraphRgbPictureSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphRgbPictureSettingsDefaults;
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, defaults.background)
    : String(source.background || defaults.background);
  const dataUrl = normalizeNodeGraphRgbPictureDataUrl(source.dataUrl || source.image || "");
  const fileName = String(source.fileName || source.name || "").trim().slice(0, 160);
  return {
    background,
    dataUrl,
    fileName: dataUrl ? (fileName || "image") : "",
  };
}

function nodeGraphRgbPictureSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphRgbPictureSettings();
  }
  // Prefer dedicated patch field; fall back to display settings bag.
  const raw = node.rgbPicture && typeof node.rgbPicture === "object"
    ? { ...node.rgbPicture, ...(node.traceDisplaySettings || {}) }
    : (node.traceDisplaySettings || {});
  return normalizeNodeGraphRgbPictureSettings(raw);
}

function nodeGraphRgbPictureToPatch(settings) {
  const n = normalizeNodeGraphRgbPictureSettings(settings);
  return {
    background: n.background,
    ...(n.dataUrl ? { dataUrl: n.dataUrl, fileName: n.fileName } : {}),
  };
}

function nodeGraphRgbPictureFileLooksSupported(file) {
  return typeof nodeGraphImageFileLooksSupported === "function"
    ? nodeGraphImageFileLooksSupported(file)
    : false;
}

function nodeGraphRgbPictureCanvasForSlot(slot) {
  const face = slot?.scopeElement;
  if (!face) {
    return null;
  }
  return face.querySelector?.(":scope > .node-rgb-picture-canvas")
    || face.querySelector?.(".node-rgb-picture-canvas")
    || null;
}

function syncNodeGraphRgbPictureCanvas(canvas, face, pixelRatio) {
  if (!canvas || !face) {
    return false;
  }
  const dpr = Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(face.clientWidth * dpr));
  const h = Math.max(1, Math.round(face.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  return w > 0 && h > 0;
}

function nodeGraphRgbPictureReadParam(nodeId, key, fallback) {
  if (typeof nodeGraphReadNodeNumber === "function") {
    const n = nodeGraphReadNodeNumber(nodeId, key);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const raw = Number(node?.params?.[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function nodeGraphRgbPictureEnsureImage(face, dataUrl) {
  if (!face) {
    return null;
  }
  let img = face._rgbPictureImage;
  const url = String(dataUrl || "").trim();
  if (!url) {
    if (img) {
      img.removeAttribute("src");
    }
    return null;
  }
  if (!img) {
    img = new Image();
    img.decoding = "async";
    face._rgbPictureImage = img;
  }
  if (img.dataset.rgbPictureUrl !== url) {
    img.dataset.rgbPictureUrl = url;
    img.src = url;
  }
  return img;
}

function paintNodeGraphRgbPictureFace(canvas, face, nodeId) {
  if (!canvas || !face || !nodeId) {
    return false;
  }
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);
  if (!syncNodeGraphRgbPictureCanvas(canvas, face, pixelRatio)) {
    return false;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphRgbPictureSettingsForNode(patchNode);
  const w = canvas.width;
  const h = canvas.height;
  const bg = settings.background || "#000000";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const width = Math.max(0, nodeGraphRgbPictureReadParam(nodeId, "width", 1));
  const height = Math.max(0, nodeGraphRgbPictureReadParam(nodeId, "height", 1));
  const x = nodeGraphRgbPictureReadParam(nodeId, "x", 0);
  const y = nodeGraphRgbPictureReadParam(nodeId, "y", 0);
  const cx = w * 0.5 + (Math.max(-1, Math.min(1, x)) * w * 0.5);
  const cy = h * 0.5 - (Math.max(-1, Math.min(1, y)) * h * 0.5);
  const halfW = Math.max(0.5, (width * 0.5) * (w * 0.5));
  const halfH = Math.max(0.5, (height * 0.5) * (h * 0.5));

  const img = nodeGraphRgbPictureEnsureImage(face, settings.dataUrl);
  if (img?.complete && img.naturalWidth > 0) {
    ctx.drawImage(
      img,
      cx - halfW,
      cy - halfH,
      halfW * 2,
      halfH * 2,
    );
  } else if (settings.dataUrl && img) {
    // Draw again when decode finishes.
    img.onload = () => {
      if (typeof paintNodeGraphRgbPictureFaceForNode === "function") {
        paintNodeGraphRgbPictureFaceForNode(nodeId);
      }
    };
  } else {
    // Empty plate hint
    ctx.fillStyle = "rgba(127, 199, 217, 0.35)";
    ctx.font = `${Math.max(10, Math.round(Math.min(w, h) * 0.06))}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Load image in Display Settings", w * 0.5, h * 0.5);
  }

  if (face.dataset) {
    face.dataset.lightStrength = settings.dataUrl ? "1" : "0";
    face.classList.toggle("has-image", Boolean(settings.dataUrl));
  }
  return true;
}

function paintNodeGraphRgbPictureFaceForNode(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  const article = typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(id) : null;
  const face = article?.querySelector?.(".node-rgb-picture-face");
  const canvas = face?.querySelector?.(".node-rgb-picture-canvas");
  if (!face || !canvas) {
    return false;
  }
  return paintNodeGraphRgbPictureFace(canvas, face, id);
}

function drawNodeGraphRgbPictureFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  const canvas = nodeGraphRgbPictureCanvasForSlot(slot);
  if (!slot || !face || !canvas) {
    return;
  }
  paintNodeGraphRgbPictureFace(canvas, face, slot.nodeId);
}

function commitNodeGraphRgbPicture(nodeId, nextSettings, options = {}) {
  const id = String(nodeId || "").trim();
  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : null;
  const node = patch?.nodes?.find((n) => n.id === id);
  if (!node || node.type !== "rgbPicture") {
    return false;
  }
  const normalized = normalizeNodeGraphRgbPictureSettings(nextSettings);
  node.rgbPicture = nodeGraphRgbPictureToPatch(normalized);
  node.traceDisplaySettings = {
    ...(node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {}),
    background: normalized.background,
    dataUrl: normalized.dataUrl,
    fileName: normalized.fileName,
  };
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      record: options.record !== false,
      status: options.status || (normalized.dataUrl ? "picture loaded" : "picture cleared"),
    });
  }
  paintNodeGraphRgbPictureFaceForNode(id);
  requestAnimationFrame(() => paintNodeGraphRgbPictureFaceForNode(id));
  return true;
}

function clearNodeGraphRgbPictureImage(nodeId) {
  const id = String(nodeId || "").trim()
    || (typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? nodeGraphTraceDisplaySettingsTargetNodeId()
      : "");
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!patchNode || patchNode.type !== "rgbPicture") {
    return;
  }
  const prev = nodeGraphRgbPictureSettingsForNode(patchNode);
  commitNodeGraphRgbPicture(id, {
    ...prev,
    dataUrl: "",
    fileName: "",
  }, { status: "picture cleared" });
  if (typeof syncNodeGraphRgbPictureDisplaySettingsControls === "function") {
    syncNodeGraphRgbPictureDisplaySettingsControls();
  }
}

function pickNodeGraphRgbPictureImage() {
  if (typeof nodeGraphPickImageFile !== "function") {
    return;
  }
  const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : "";
  nodeGraphPickImageFile((asset) => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (!patchNode || patchNode.type !== "rgbPicture") {
      return;
    }
    const prev = nodeGraphRgbPictureSettingsForNode(patchNode);
    commitNodeGraphRgbPicture(nodeId, {
      ...prev,
      dataUrl: asset.dataUrl,
      fileName: asset.fileName || "image",
    }, { status: `${asset.fileName || "image"} loaded` });
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(`Picture: loaded ${asset.fileName || "image"}.`);
    }
    if (typeof syncNodeGraphRgbPictureDisplaySettingsControls === "function") {
      syncNodeGraphRgbPictureDisplaySettingsControls();
    }
  });
}

function buildNodeGraphRgbPictureDisplaySettingsBodyHtml() {
  return `
    <div class="node-rgb-picture-display-settings-panel" data-rgb-picture-display-settings-panel>
      <div class="metadata-field-section">
        <div class="metadata-section-title">IMAGE</div>
        ${(typeof nodeGraphBuildImageAssetRowHtml === "function"
          ? nodeGraphBuildImageAssetRowHtml({ key: "picture", label: "Picture" })
          : "")}
        <p class="node-rgb-picture-settings-hint">PNG, JPEG, WebP, GIF, or SVG. Place with Width / Height / X / Y (center-based).</p>
      </div>
    </div>
  `;
}

function bindNodeGraphRgbPictureDisplaySettingsEvents(root) {
  const panel = root?.querySelector?.("[data-rgb-picture-display-settings-panel]") || root;
  if (!panel || panel.dataset.rgbPictureBound === "true") {
    return;
  }
  panel.dataset.rgbPictureBound = "true";
  if (typeof nodeGraphBindImageAssetClicks === "function") {
    nodeGraphBindImageAssetClicks(panel, (_key, action) => {
      if (action === "load") {
        pickNodeGraphRgbPictureImage();
      } else if (action === "clear") {
        clearNodeGraphRgbPictureImage();
      } else if (action === "save") {
        const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
          ? nodeGraphTraceDisplaySettingsTargetNodeId()
          : "";
        const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
        const settings = nodeGraphRgbPictureSettingsForNode(node);
        if (typeof nodeGraphSaveImageAsset === "function") {
          nodeGraphSaveImageAsset(settings, "rgb-picture");
        }
      }
    });
  }
}

function syncNodeGraphRgbPictureDisplaySettingsControls(root) {
  const panel = root?.querySelector?.("[data-rgb-picture-display-settings-panel]")
    || document.querySelector("#nodeTraceDisplaySettingsPopover [data-rgb-picture-display-settings-panel]");
  if (!panel) {
    return;
  }
  const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphRgbPictureSettingsForNode(node);
  if (typeof nodeGraphSyncImageAssetRow === "function") {
    nodeGraphSyncImageAssetRow(panel, "picture", settings, "no image");
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.rgbPictureFace = drawNodeGraphRgbPictureFaceItem;
}
