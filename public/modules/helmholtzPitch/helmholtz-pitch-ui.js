// Pitch Detector face:
//   • Frequency → Number Readout LCD (DSEG / residual path)
//   • Fidelity  → cheapest plain DOM text strip
// One black plate; LCD fills it; Fid overlays the bottom (no fill/stroke).

function createNodeGraphPitchDetectorBody(nodeId) {
  const id = String(nodeId || "");
  const body = document.createElement("div");
  body.className = "node-pitch-detector-face node-light-source";
  body.dataset.node = id;
  body.dataset.nodeType = "helmholtzPitch";
  body.dataset.pitchDetectorFace = "true";
  body.dataset.lightSource = "screen";
  body.setAttribute("aria-label", "Pitch detector frequency LCD and fidelity");

  // LCD plate — registered as the scope surface for numberReadout paint.
  const lcd = document.createElement("div");
  lcd.className = "node-pitch-detector-lcd node-module-scope-window node-number-readout-face";
  lcd.dataset.node = id;
  lcd.dataset.nodeType = "helmholtzPitch";
  lcd.dataset.lightSource = "screen";
  lcd.setAttribute("aria-hidden", "true");

  // Cheap fidelity strip (no canvas).
  const fid = document.createElement("div");
  fid.className = "node-pitch-detector-fid";
  const fidKey = document.createElement("span");
  fidKey.className = "node-pitch-detector-k";
  fidKey.textContent = "Fid";
  const fidVal = document.createElement("strong");
  fidVal.className = "node-pitch-detector-v";
  fidVal.dataset.pitchValue = "fidelity";
  fidVal.textContent = "—";
  fid.append(fidKey, fidVal);

  body.append(lcd, fid);
  return body;
}

function nodeGraphPitchDetectorFormatFid(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return Math.max(0, Math.min(1, n)).toFixed(2);
}

/**
 * Update fidelity strip from live scope payload
 * (entries [id, samples] where id is "nodeId:Fidelity").
 * Frequency is painted by the Number Readout LCD path.
 */
function updateNodeGraphPitchDetectorFacesFromScopeValues(values) {
  if (!values || !values.length) {
    return;
  }
  for (const entry of values) {
    if (!entry) {
      continue;
    }
    const key = String(entry[0] || "");
    const samples = entry[1];
    if (!key || !samples) {
      continue;
    }
    const colon = key.indexOf(":");
    if (colon <= 0) {
      continue;
    }
    const nodeId = key.slice(0, colon);
    const port = key.slice(colon + 1);
    if (port !== "Fidelity") {
      continue;
    }
    const length = samples instanceof Float32Array
      ? samples.length
      : (Array.isArray(samples) ? samples.length : 0);
    if (!length) {
      continue;
    }
    const last = Number(samples[length - 1]);
    if (!Number.isFinite(last)) {
      continue;
    }
    const body = document.querySelector(`.node-pitch-detector-face[data-node="${nodeId}"]`);
    const fidEl = body?.querySelector?.('[data-pitch-value="fidelity"]');
    if (fidEl) {
      fidEl.textContent = nodeGraphPitchDetectorFormatFid(last);
    }
  }
}

/**
 * After module mount: register LCD for Number Readout paint + cold plate so
 * the black face is never invisible.
 */
function mountNodeGraphPitchDetectorFace(article, body, nodeId) {
  if (!article || !body) {
    return;
  }
  const lcd = body.querySelector(".node-pitch-detector-lcd") || body;
  if (typeof registerNodeGraphModuleScopeSlot === "function") {
    registerNodeGraphModuleScopeSlot(article, {
      nodeId: String(nodeId || body.dataset.node || ""),
      scopeElement: lcd,
      type: "helmholtzPitch",
      viewDrag: false,
    });
  }
  // Immediate cold LCD so the plate shows before the first scope post.
  if (typeof paintNodeGraphNumberReadoutColdBoot === "function"
    && typeof nodeGraphNumberReadoutCanvasForSlot === "function") {
    const slot = typeof nodeGraphModuleScopeState !== "undefined"
      ? nodeGraphModuleScopeState?.slots?.get?.(String(nodeId || body.dataset.node || ""))
      : null;
    if (slot) {
      const canvas = nodeGraphNumberReadoutCanvasForSlot(slot);
      const node = typeof nodeGraphPatchNode === "function"
        ? nodeGraphPatchNode(nodeId)
        : null;
      if (canvas && lcd) {
        paintNodeGraphNumberReadoutColdBoot(canvas, lcd, node);
      }
    }
  }
  if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
    nodeGraphModuleScopeMarkScreenLit(lcd, 1);
  }
}
