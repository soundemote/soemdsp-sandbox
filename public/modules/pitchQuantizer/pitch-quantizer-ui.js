// Pitch Quantizer face: one-octave pitch-class keyboard. Toggle keys to
// choose which classes quantize — applied across every octave via the
// 12-bit scale mask (same as the Scale jack).

function createNodeGraphPitchQuantizerFace(node) {
  const type = "pitchQuantizer";
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
  const mask = typeof nodeGraphPitchQuantizerMaskForNode === "function"
    ? nodeGraphPitchQuantizerMaskForNode(patchNode)
    : 2741;

  const face = document.createElement("div");
  face.className = "node-pitch-quantizer-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", "Pitch quantizer scale keyboard");

  const toolbar = document.createElement("div");
  toolbar.className = "node-pitch-quantizer-toolbar";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "node-pitch-quantizer-tool";
  allBtn.textContent = "All";
  allBtn.setAttribute("aria-label", "Enable all pitch classes (chromatic)");
  allBtn.addEventListener("click", (event) => {
    setNodeGraphPitchQuantizerMask(node, 0xFFF, event, "chromatic");
  });
  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = "node-pitch-quantizer-tool";
  noneBtn.textContent = "None";
  noneBtn.setAttribute("aria-label", "Clear all pitch classes");
  noneBtn.addEventListener("click", (event) => {
    setNodeGraphPitchQuantizerMask(node, 0, event, "empty");
  });
  const hint = document.createElement("span");
  hint.className = "node-pitch-quantizer-hint";
  hint.textContent = "keys → all octaves";
  toolbar.append(allBtn, noneBtn, hint);

  const surface = document.createElement("div");
  surface.className = "node-pitch-quantizer-keyboard";
  surface.setAttribute("role", "group");
  surface.setAttribute("aria-label", "Scale pitch classes");

  const whiteRow = document.createElement("div");
  whiteRow.className = "node-pitch-quantizer-white-row";
  const whites = typeof nodeGraphPitchQuantizerWhiteClasses !== "undefined"
    ? nodeGraphPitchQuantizerWhiteClasses
    : [0, 2, 4, 5, 7, 9, 11];
  const names = typeof nodeGraphPitchQuantizerNoteNames !== "undefined"
    ? nodeGraphPitchQuantizerNoteNames
    : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  for (const pc of whites) {
    whiteRow.append(createNodeGraphPitchQuantizerKeyButton(node, pc, names[pc], mask, false));
  }

  const blackRow = document.createElement("div");
  blackRow.className = "node-pitch-quantizer-black-row";
  const blacks = typeof nodeGraphPitchQuantizerBlackKeys !== "undefined"
    ? nodeGraphPitchQuantizerBlackKeys
    : [
      { pitchClass: 1, afterWhite: 0 },
      { pitchClass: 3, afterWhite: 1 },
      { pitchClass: 6, afterWhite: 3 },
      { pitchClass: 8, afterWhite: 4 },
      { pitchClass: 10, afterWhite: 5 },
    ];
  const whiteCount = whites.length;
  for (const key of blacks) {
    const leftPercent = whiteCount > 0
      ? ((key.afterWhite + 0.65) / whiteCount) * 100
      : 0;
    const widthPercent = whiteCount > 0 ? (0.62 / whiteCount) * 100 : 8;
    const btn = createNodeGraphPitchQuantizerKeyButton(node, key.pitchClass, names[key.pitchClass], mask, true);
    btn.style.setProperty("--key-left", `${leftPercent}%`);
    btn.style.width = `${widthPercent}%`;
    blackRow.append(btn);
  }

  surface.append(whiteRow, blackRow);
  face.append(toolbar, surface);

  // Don't start module drag when interacting with the face.
  face.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) {
      event.stopPropagation();
    }
  });

  return face;
}

function createNodeGraphPitchQuantizerKeyButton(nodeId, pitchClass, label, mask, isBlack) {
  const on = typeof nodeGraphPitchQuantizerMaskHasClass === "function"
    ? nodeGraphPitchQuantizerMaskHasClass(mask, pitchClass)
    : false;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = isBlack
    ? "node-pitch-quantizer-key node-pitch-quantizer-key-black"
    : "node-pitch-quantizer-key node-pitch-quantizer-key-white";
  btn.dataset.pitchClass = String(pitchClass);
  btn.dataset.node = nodeId;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute(
    "aria-label",
    `${label} ${on ? "on" : "off"} — quantize to this pitch class in every octave`,
  );
  btn.classList.toggle("active", on);
  btn.textContent = label;
  btn.addEventListener("click", (event) => {
    // Scale jack owns the mask when patched — face is display-only then.
    if (typeof nodeGraphPitchQuantizerScaleJackConnected === "function"
      && nodeGraphPitchQuantizerScaleJackConnected(nodeId)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    toggleNodeGraphPitchQuantizerKey(nodeId, pitchClass, event);
  });
  return btn;
}

function setNodeGraphPitchQuantizerMask(nodeId, mask, event, statusLabel = "scale") {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("pitch quantizer")) {
    return false;
  }
  if (!nodeId || (typeof nodeGraphMvp !== "undefined" && !nodeGraphMvp.activeNodes?.has?.(nodeId))) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (!patchNode) {
    return false;
  }
  const nextMask = typeof nodeGraphPitchQuantizerNormalizeMask === "function"
    ? nodeGraphPitchQuantizerNormalizeMask(mask)
    : (Math.round(Number(mask)) || 0) & 0xFFF;
  const scaleChoice = typeof nodeGraphPitchQuantizerChoiceForMask === "function"
    ? nodeGraphPitchQuantizerChoiceForMask(nextMask)
    : 6;
  patchNode.params = {
    ...(patchNode.params || {}),
    scaleMask: normalizeNodeGraphPatchParameter(
      patchNode.type,
      "scaleMask",
      nextMask,
      patchNode.paramMeta?.scaleMask,
    ),
    scale: normalizeNodeGraphPatchParameter(
      patchNode.type,
      "scale",
      scaleChoice,
      patchNode.paramMeta?.scale,
    ),
  };
  commitNodeGraphPatch(patch, { status: `pitch quantizer ${statusLabel}` });
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

function toggleNodeGraphPitchQuantizerKey(nodeId, pitchClass, event) {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("pitch quantizer")) {
    return false;
  }
  if (!nodeId || (typeof nodeGraphMvp !== "undefined" && !nodeGraphMvp.activeNodes?.has?.(nodeId))) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (!patchNode) {
    return false;
  }
  const current = typeof nodeGraphPitchQuantizerMaskForNode === "function"
    ? nodeGraphPitchQuantizerMaskForNode(patchNode)
    : 0;
  const nextMask = typeof nodeGraphPitchQuantizerMaskToggleClass === "function"
    ? nodeGraphPitchQuantizerMaskToggleClass(current, pitchClass)
    : (current ^ (1 << (((pitchClass % 12) + 12) % 12)));
  const names = typeof nodeGraphPitchQuantizerNoteNames !== "undefined"
    ? nodeGraphPitchQuantizerNoteNames
    : [];
  const label = names[pitchClass] || String(pitchClass);
  const on = typeof nodeGraphPitchQuantizerMaskHasClass === "function"
    ? nodeGraphPitchQuantizerMaskHasClass(nextMask, pitchClass)
    : false;
  return setNodeGraphPitchQuantizerMask(
    nodeId,
    nextMask,
    event,
    `${label} ${on ? "on" : "off"}`,
  );
}

/** Soft-paint active keys without full module rebuild (optional fast path). */
function syncNodeGraphPitchQuantizerFace(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode) {
    return;
  }
  const mask = typeof nodeGraphPitchQuantizerMaskForNode === "function"
    ? nodeGraphPitchQuantizerMaskForNode(patchNode)
    : 0;
  const jacked = typeof nodeGraphPitchQuantizerScaleJackConnected === "function"
    && nodeGraphPitchQuantizerScaleJackConnected(nodeId);
  const root = document.querySelector(
    `.dsp-node[data-node="${CSS.escape(String(nodeId))}"] .node-pitch-quantizer-face`,
  );
  if (!root) {
    return;
  }
  root.classList.toggle("scale-jacked", jacked);
  root.title = jacked
    ? "Scale jack connected — keyboard shows the external mask (read-only)"
    : "";
  for (const btn of root.querySelectorAll("[data-pitch-class]")) {
    const pc = Number(btn.dataset.pitchClass);
    const on = typeof nodeGraphPitchQuantizerMaskHasClass === "function"
      ? nodeGraphPitchQuantizerMaskHasClass(mask, pc)
      : false;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.disabled = jacked;
  }
}
