// Chord Pad face: Key + Mode + 7 diatonic chord pads → params.degree / key / mode.

function createNodeGraphChordPadFace(nodeId) {
  const type = "chordPad";
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const params = patchNode?.params || {};
  const key = typeof nodeGraphChordPadClampKey === "function"
    ? nodeGraphChordPadClampKey(params.key)
    : 0;
  const mode = typeof nodeGraphChordPadClampMode === "function"
    ? nodeGraphChordPadClampMode(params.mode)
    : 0;
  const degree = typeof nodeGraphChordPadClampDegree === "function"
    ? nodeGraphChordPadClampDegree(params.degree)
    : 0;

  const face = document.createElement("div");
  face.className = "node-chord-pad-face node-light-source";
  face.dataset.node = nodeId;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", "Chord pad");

  const toolbar = document.createElement("div");
  toolbar.className = "node-chord-pad-toolbar";

  const keyField = document.createElement("label");
  keyField.className = "node-chord-pad-field";
  keyField.append(document.createTextNode("Key"));
  const keySelect = document.createElement("select");
  keySelect.dataset.chordPadField = "key";
  keySelect.setAttribute("aria-label", "Chord key");
  const names = typeof nodeGraphChordPadNoteNames !== "undefined"
    ? nodeGraphChordPadNoteNames
    : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  for (let i = 0; i < 12; i += 1) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = names[i] || String(i);
    if (i === key) {
      opt.selected = true;
    }
    keySelect.append(opt);
  }
  keySelect.addEventListener("change", (event) => {
    setNodeGraphChordPadParams(nodeId, { key: Number(keySelect.value) }, event, "key");
  });
  keyField.append(keySelect);

  const modeField = document.createElement("label");
  modeField.className = "node-chord-pad-field";
  modeField.append(document.createTextNode("Mode"));
  const modeSelect = document.createElement("select");
  modeSelect.dataset.chordPadField = "mode";
  modeSelect.setAttribute("aria-label", "Chord mode");
  for (const [value, label] of [[0, "Major"], [1, "Minor"]]) {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = label;
    if (value === mode) {
      opt.selected = true;
    }
    modeSelect.append(opt);
  }
  modeSelect.addEventListener("change", (event) => {
    setNodeGraphChordPadParams(nodeId, { mode: Number(modeSelect.value) }, event, "mode");
  });
  modeField.append(modeSelect);

  const hint = document.createElement("span");
  hint.className = "node-chord-pad-hint";
  hint.textContent = "→ Scale";

  toolbar.append(keyField, modeField, hint);

  const grid = document.createElement("div");
  grid.className = "node-chord-pad-grid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Diatonic chords");

  for (let d = 0; d < 7; d += 1) {
    const label = typeof nodeGraphChordPadPadLabel === "function"
      ? nodeGraphChordPadPadLabel(key, mode, d)
      : { roman: String(d), name: "?" };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "node-chord-pad-pad";
    btn.dataset.degree = String(d);
    btn.dataset.node = nodeId;
    btn.classList.toggle("active", d === degree);
    btn.setAttribute("aria-pressed", d === degree ? "true" : "false");
    btn.setAttribute("aria-label", `${label.roman} ${label.name}`);
    const roman = document.createElement("span");
    roman.className = "node-chord-pad-roman";
    roman.textContent = label.roman;
    const name = document.createElement("span");
    name.className = "node-chord-pad-name";
    name.textContent = label.name;
    btn.append(roman, name);
    btn.addEventListener("click", (event) => {
      setNodeGraphChordPadParams(nodeId, { degree: d }, event, label.name);
    });
    grid.append(btn);
  }

  face.append(toolbar, grid);
  face.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, select")) {
      event.stopPropagation();
    }
  });
  return face;
}

function setNodeGraphChordPadParams(nodeId, patchParams, event, statusLabel = "chord") {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("chord pad")) {
    return false;
  }
  if (!nodeId || (typeof nodeGraphMvp !== "undefined" && !nodeGraphMvp.activeNodes?.has?.(nodeId))) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (!patchNode || patchNode.type !== "chordPad") {
    return false;
  }
  const next = { ...(patchNode.params || {}) };
  for (const [key, value] of Object.entries(patchParams || {})) {
    next[key] = normalizeNodeGraphPatchParameter(
      patchNode.type,
      key,
      value,
      patchNode.paramMeta?.[key],
    );
  }
  patchNode.params = next;
  commitNodeGraphPatch(patch, { status: `chord pad ${statusLabel}` });
  // Live-paint connected Pitch Quantizer keyboards from this Scale source.
  if (typeof syncNodeGraphPitchQuantizersFedByChordPad === "function") {
    syncNodeGraphPitchQuantizersFedByChordPad(nodeId);
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

function syncNodeGraphChordPadFace(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode || patchNode.type !== "chordPad") {
    return;
  }
  const params = patchNode.params || {};
  const key = typeof nodeGraphChordPadClampKey === "function"
    ? nodeGraphChordPadClampKey(params.key)
    : 0;
  const mode = typeof nodeGraphChordPadClampMode === "function"
    ? nodeGraphChordPadClampMode(params.mode)
    : 0;
  const degree = typeof nodeGraphChordPadClampDegree === "function"
    ? nodeGraphChordPadClampDegree(params.degree)
    : 0;
  const root = document.querySelector(`.dsp-node[data-node="${nodeId}"] .node-chord-pad-face`);
  if (!root) {
    return;
  }
  const keySelect = root.querySelector('[data-chord-pad-field="key"]');
  if (keySelect && document.activeElement !== keySelect) {
    keySelect.value = String(key);
  }
  const modeSelect = root.querySelector('[data-chord-pad-field="mode"]');
  if (modeSelect && document.activeElement !== modeSelect) {
    modeSelect.value = String(mode);
  }
  for (const btn of root.querySelectorAll("[data-degree]")) {
    const d = Number(btn.dataset.degree);
    const label = typeof nodeGraphChordPadPadLabel === "function"
      ? nodeGraphChordPadPadLabel(key, mode, d)
      : { roman: String(d), name: "?" };
    const active = d === degree;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.setAttribute("aria-label", `${label.roman} ${label.name}`);
    const romanEl = btn.querySelector(".node-chord-pad-roman");
    const nameEl = btn.querySelector(".node-chord-pad-name");
    if (romanEl) {
      romanEl.textContent = label.roman;
    }
    if (nameEl) {
      nameEl.textContent = label.name;
    }
  }
}
