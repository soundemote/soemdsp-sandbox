// Circuit patches: the default patch is the full parameter set you edit
// until you load another note. A set note stores only the parameters that
// differ from the default. Click loads. Set, Copy, and Paste use the loaded one.
// A note that was never set uses the nearest lower set note, or the default.

const NODE_GRAPH_CIRCUIT_PATCH_COUNT = 128;
const NODE_GRAPH_CIRCUIT_PATCH_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NODE_GRAPH_CIRCUIT_PATCH_DEFAULT = -1;

function nodeGraphCircuitPatchMidiName(index) {
  const name = NODE_GRAPH_CIRCUIT_PATCH_NOTE_NAMES[index % 12];
  const octave = Math.floor(index / 12) - 1;
  return `${name}${octave}`;
}

let nodeGraphCircuitPatchClipboard = null;

function nodeGraphCloneCircuitPatchValues(values) {
  try {
    return JSON.parse(JSON.stringify(values || {}));
  } catch (_error) {
    return {};
  }
}

function nodeGraphCircuitPatchValuesEqual(a, b) {
  return Object.is(a, b);
}

function nodeGraphCollectCircuitPatchValues(patch) {
  const values = {};
  for (const node of patch?.nodes || []) {
    const id = String(node?.id || "").trim();
    if (!id || !node.params || typeof node.params !== "object") {
      continue;
    }
    values[id] = { ...node.params };
  }
  return values;
}

function nodeGraphCircuitPatchDiff(full, baseline) {
  const out = {};
  const ids = new Set([
    ...Object.keys(full || {}),
    ...Object.keys(baseline || {}),
  ]);
  for (const id of ids) {
    const next = full?.[id] || {};
    const base = baseline?.[id] || {};
    const keys = new Set([...Object.keys(next), ...Object.keys(base)]);
    const diff = {};
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        continue;
      }
      if (!nodeGraphCircuitPatchValuesEqual(next[key], base[key])) {
        diff[key] = next[key];
      }
    }
    if (Object.keys(diff).length) {
      out[id] = diff;
    }
  }
  return out;
}

function nodeGraphCircuitPatchSourceIndex(patch, index) {
  const slots = patch?.circuitPatches || [];
  for (let i = index; i >= 0; i -= 1) {
    if (slots[i]?.values) {
      return i;
    }
  }
  return null;
}

function nodeGraphCircuitPatchResolvedValues(patch, index) {
  const resolved = nodeGraphCloneCircuitPatchValues(patch?.defaultCircuitPatch?.values || {});
  if (index === NODE_GRAPH_CIRCUIT_PATCH_DEFAULT) {
    return resolved;
  }
  const source = nodeGraphCircuitPatchSourceIndex(patch, index);
  if (source == null) {
    return resolved;
  }
  const over = patch.circuitPatches[source]?.values || {};
  for (const id of Object.keys(over)) {
    resolved[id] = { ...(resolved[id] || {}), ...over[id] };
  }
  return resolved;
}

function nodeGraphEnsureCircuitPatches(patch) {
  if (!patch || typeof patch !== "object") {
    return patch;
  }
  const slots = new Array(NODE_GRAPH_CIRCUIT_PATCH_COUNT).fill(null);
  if (Array.isArray(patch.circuitPatches)) {
    for (let i = 0; i < NODE_GRAPH_CIRCUIT_PATCH_COUNT; i += 1) {
      const slot = patch.circuitPatches[i];
      if (slot && slot.values && typeof slot.values === "object") {
        slots[i] = { values: slot.values };
      }
    }
  }
  let active = Number(patch.activeCircuitPatch);
  const hadDefault = Boolean(patch.defaultCircuitPatch?.values);
  if (!hadDefault && slots[0]?.values) {
    patch.defaultCircuitPatch = { values: nodeGraphCloneCircuitPatchValues(slots[0].values) };
    slots[0] = null;
    if (active === 0) {
      active = NODE_GRAPH_CIRCUIT_PATCH_DEFAULT;
    }
  }
  if (!patch.defaultCircuitPatch?.values) {
    patch.defaultCircuitPatch = { values: nodeGraphCollectCircuitPatchValues(patch) };
  }
  if (!Number.isInteger(active) || active < NODE_GRAPH_CIRCUIT_PATCH_DEFAULT || active >= NODE_GRAPH_CIRCUIT_PATCH_COUNT) {
    active = NODE_GRAPH_CIRCUIT_PATCH_DEFAULT;
  }
  patch.circuitPatches = slots;
  patch.activeCircuitPatch = active;
  return patch;
}

function nodeGraphWriteActiveCircuitPatchParam(nodeId, key, value) {
  const patch = nodeGraphMvp?.patch;
  if (!patch || !nodeId || !key) {
    return;
  }
  nodeGraphEnsureCircuitPatches(patch);
  const index = patch.activeCircuitPatch;
  if (index === NODE_GRAPH_CIRCUIT_PATCH_DEFAULT) {
    const prior = patch.defaultCircuitPatch.values;
    const nodeValues = { ...(prior[nodeId] || {}), [key]: value };
    patch.defaultCircuitPatch = {
      values: { ...prior, [nodeId]: nodeValues },
    };
    return;
  }
  const slot = patch.circuitPatches[index];
  if (!slot?.values) {
    return;
  }
  const base = patch.defaultCircuitPatch?.values?.[nodeId]?.[key];
  const nodeValues = { ...(slot.values[nodeId] || {}) };
  if (nodeGraphCircuitPatchValuesEqual(value, base)) {
    delete nodeValues[key];
  } else {
    nodeValues[key] = value;
  }
  const values = { ...slot.values };
  if (Object.keys(nodeValues).length) {
    values[nodeId] = nodeValues;
  } else {
    delete values[nodeId];
  }
  patch.circuitPatches[index] = { values };
}

function nodeGraphSelectedCircuitPatchIndex(patch) {
  const index = Number(patch?.activeCircuitPatch);
  if (index === NODE_GRAPH_CIRCUIT_PATCH_DEFAULT) {
    return NODE_GRAPH_CIRCUIT_PATCH_DEFAULT;
  }
  if (!Number.isInteger(index) || index < 0 || index >= NODE_GRAPH_CIRCUIT_PATCH_COUNT) {
    return NODE_GRAPH_CIRCUIT_PATCH_DEFAULT;
  }
  return index;
}

function nodeGraphStoreCircuitPatchValues(patch, index, fullValues) {
  const values = nodeGraphCloneCircuitPatchValues(fullValues);
  if (index === NODE_GRAPH_CIRCUIT_PATCH_DEFAULT) {
    patch.defaultCircuitPatch = { values };
    return;
  }
  patch.circuitPatches[index] = {
    values: nodeGraphCircuitPatchDiff(values, patch.defaultCircuitPatch?.values || {}),
  };
}

function nodeGraphCaptureCircuitPatchSlot(index) {
  const patch = nodeGraphMvp?.patch;
  if (window.soemdspPerformPage) {
    return false;
  }
  if (!patch || !Number.isInteger(index) || index < NODE_GRAPH_CIRCUIT_PATCH_DEFAULT || index >= NODE_GRAPH_CIRCUIT_PATCH_COUNT) {
    return false;
  }
  nodeGraphEnsureCircuitPatches(patch);
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  nodeGraphStoreCircuitPatchValues(patch, index, nodeGraphCollectCircuitPatchValues(patch));
  patch.activeCircuitPatch = index;
  if (typeof setNodeGraphPatchDirtyState === "function") {
    setNodeGraphPatchDirtyState("edited");
  }
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  nodeGraphRenderCircuitPatchList();
  return true;
}

function nodeGraphUpdateCircuitPatchSlot(index) {
  const patch = nodeGraphMvp?.patch;
  if (window.soemdspPerformPage) {
    return false;
  }
  if (!patch || !Number.isInteger(index) || index < NODE_GRAPH_CIRCUIT_PATCH_DEFAULT || index >= NODE_GRAPH_CIRCUIT_PATCH_COUNT) {
    return false;
  }
  nodeGraphEnsureCircuitPatches(patch);
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  const current = nodeGraphCollectCircuitPatchValues(patch);
  if (index === NODE_GRAPH_CIRCUIT_PATCH_DEFAULT) {
    const prior = nodeGraphCloneCircuitPatchValues(patch.defaultCircuitPatch?.values || {});
    for (const id of Object.keys(current)) {
      const nodeValues = { ...(prior[id] || {}) };
      for (const key of Object.keys(current[id] || {})) {
        if (!Object.prototype.hasOwnProperty.call(prior[id] || {}, key)) {
          nodeValues[key] = current[id][key];
        }
      }
      prior[id] = nodeValues;
    }
    patch.defaultCircuitPatch = { values: prior };
  } else {
    const existing = patch.circuitPatches[index]?.values || {};
    const diff = nodeGraphCircuitPatchDiff(current, patch.defaultCircuitPatch?.values || {});
    const merged = nodeGraphCloneCircuitPatchValues(existing);
    for (const id of Object.keys(diff)) {
      const nodeValues = { ...(merged[id] || {}) };
      for (const key of Object.keys(diff[id])) {
        if (!Object.prototype.hasOwnProperty.call(existing[id] || {}, key)) {
          nodeValues[key] = diff[id][key];
        }
      }
      if (Object.keys(nodeValues).length) {
        merged[id] = nodeValues;
      }
    }
    if (patch.circuitPatches[index]?.values || Object.keys(merged).length) {
      patch.circuitPatches[index] = { values: merged };
    }
  }
  if (typeof setNodeGraphPatchDirtyState === "function") {
    setNodeGraphPatchDirtyState("edited");
  }
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  nodeGraphRenderCircuitPatchList();
  return true;
}

function nodeGraphCopyCircuitPatchSlot() {
  const patch = nodeGraphMvp?.patch;
  if (!patch) {
    return false;
  }
  nodeGraphEnsureCircuitPatches(patch);
  const selected = nodeGraphSelectedCircuitPatchIndex(patch);
  nodeGraphCircuitPatchClipboard = nodeGraphCircuitPatchResolvedValues(patch, selected);
  return true;
}

function nodeGraphPasteCircuitPatchSlot() {
  const patch = nodeGraphMvp?.patch;
  if (window.soemdspPerformPage || !patch || !nodeGraphCircuitPatchClipboard) {
    return false;
  }
  nodeGraphEnsureCircuitPatches(patch);
  const index = nodeGraphSelectedCircuitPatchIndex(patch);
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  nodeGraphStoreCircuitPatchValues(patch, index, nodeGraphCircuitPatchClipboard);
  return nodeGraphApplyCircuitPatchSlot(index, { alreadyRecorded: true });
}

function nodeGraphApplyCircuitPatchValues(patch, values) {
  const changedIds = [];
  for (const node of patch.nodes || []) {
    const id = String(node?.id || "");
    const stored = values[id];
    if (!stored || typeof stored !== "object") {
      continue;
    }
    const next = { ...(node.params || {}) };
    let changed = false;
    for (const key of Object.keys(node.params || {})) {
      if (!Object.prototype.hasOwnProperty.call(stored, key)) {
        continue;
      }
      if (!nodeGraphCircuitPatchValuesEqual(next[key], stored[key])) {
        next[key] = stored[key];
        changed = true;
      }
    }
    for (const key of Object.keys(stored)) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        next[key] = stored[key];
        changed = true;
      }
    }
    if (changed) {
      node.params = next;
      changedIds.push(id);
    }
  }
  return changedIds;
}

function nodeGraphApplyCircuitPatchSlot(index, options = {}) {
  const patch = nodeGraphMvp?.patch;
  if (!patch) {
    return false;
  }
  nodeGraphEnsureCircuitPatches(patch);
  if (!Number.isInteger(index) || index < NODE_GRAPH_CIRCUIT_PATCH_DEFAULT || index >= NODE_GRAPH_CIRCUIT_PATCH_COUNT) {
    return false;
  }
  const values = nodeGraphCircuitPatchResolvedValues(patch, index);
  if (!options.alreadyRecorded && typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  patch.activeCircuitPatch = index;
  const changedIds = nodeGraphApplyCircuitPatchValues(patch, values);
  if (changedIds.length && typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      status: "circuit patch loaded",
      liveParamsOnly: true,
      paramSyncIds: changedIds,
    });
  } else if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  nodeGraphRenderCircuitPatchList();
  return true;
}

function nodeGraphRenderCircuitPatchList() {
  const list = document.getElementById("nodeCircuitPatchList");
  const patch = nodeGraphMvp?.patch;
  if (!list || !patch) {
    return;
  }
  nodeGraphEnsureCircuitPatches(patch);
  const active = patch.activeCircuitPatch;
  const defaultButton = document.getElementById("nodeCircuitPatchDefault");
  if (defaultButton) {
    defaultButton.classList.toggle("is-filled", true);
    defaultButton.classList.toggle("is-active", active === NODE_GRAPH_CIRCUIT_PATCH_DEFAULT);
  }
  const buttons = [];
  for (let i = 0; i < NODE_GRAPH_CIRCUIT_PATCH_COUNT; i += 1) {
    const filled = Boolean(patch.circuitPatches[i]?.values);
    const label = nodeGraphCircuitPatchMidiName(i);
    buttons.push(
      `<button type="button" class="node-circuit-patch-slot${filled ? " is-filled" : ""}${i === active ? " is-active" : ""}" data-circuit-slot="${i}" title="${label}. Click loads this note. An unset note uses the previous set note, or the default patch.">${label}</button>`,
    );
  }
  list.innerHTML = buttons.join("");
  if (typeof renderNodeGraphMidiKeyboardHeldKeys === "function") {
    renderNodeGraphMidiKeyboardHeldKeys();
  }
}

function nodeGraphBindCircuitPatchList() {
  const list = document.getElementById("nodeCircuitPatchList");
  if (!list || list.dataset.bound === "true") {
    return;
  }
  list.dataset.bound = "true";
  list.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-circuit-slot]");
    if (!button) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const index = Number(button.dataset.circuitSlot);
    nodeGraphApplyCircuitPatchSlot(index);
  });
  const setButton = document.getElementById("nodeCircuitPatchSet");
  const updateButton = document.getElementById("nodeCircuitPatchUpdate");
  const copyButton = document.getElementById("nodeCircuitPatchCopy");
  const pasteButton = document.getElementById("nodeCircuitPatchPaste");
  const defaultButton = document.getElementById("nodeCircuitPatchDefault");
  setButton?.addEventListener("click", (event) => {
    event.preventDefault();
    const patch = nodeGraphMvp?.patch;
    if (!patch) {
      return;
    }
    nodeGraphEnsureCircuitPatches(patch);
    nodeGraphCaptureCircuitPatchSlot(nodeGraphSelectedCircuitPatchIndex(patch));
  });
  updateButton?.addEventListener("click", (event) => {
    event.preventDefault();
    const patch = nodeGraphMvp?.patch;
    if (!patch) {
      return;
    }
    nodeGraphEnsureCircuitPatches(patch);
    nodeGraphUpdateCircuitPatchSlot(nodeGraphSelectedCircuitPatchIndex(patch));
  });
  copyButton?.addEventListener("click", (event) => {
    event.preventDefault();
    nodeGraphCopyCircuitPatchSlot();
  });
  pasteButton?.addEventListener("click", (event) => {
    event.preventDefault();
    nodeGraphPasteCircuitPatchSlot();
  });
  defaultButton?.addEventListener("click", (event) => {
    event.preventDefault();
    nodeGraphApplyCircuitPatchSlot(NODE_GRAPH_CIRCUIT_PATCH_DEFAULT);
  });
}
