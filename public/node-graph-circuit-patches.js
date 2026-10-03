// Circuit patches: 128 parameter snapshots. Slot 0 is the default working set.
// Ctrl+click stores the current biases. Left click loads that slot.

const NODE_GRAPH_CIRCUIT_PATCH_COUNT = 128;

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
  if (!slots[0]) {
    slots[0] = { values: nodeGraphCollectCircuitPatchValues(patch) };
  }
  let active = Number(patch.activeCircuitPatch);
  if (!Number.isInteger(active) || active < 0 || active >= NODE_GRAPH_CIRCUIT_PATCH_COUNT) {
    active = 0;
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
  const slot = patch.circuitPatches[index] || { values: {} };
  const prior = slot.values && typeof slot.values === "object" ? slot.values : {};
  const nodeValues = { ...(prior[nodeId] || {}), [key]: value };
  patch.circuitPatches[index] = {
    values: { ...prior, [nodeId]: nodeValues },
  };
}

function nodeGraphCaptureCircuitPatchSlot(index) {
  const patch = nodeGraphMvp?.patch;
  if (window.soemdspPerformPage) {
    return false;
  }
  if (!patch || !Number.isInteger(index) || index < 0 || index >= NODE_GRAPH_CIRCUIT_PATCH_COUNT) {
    return false;
  }
  nodeGraphEnsureCircuitPatches(patch);
  patch.circuitPatches[index] = { values: nodeGraphCollectCircuitPatchValues(patch) };
  if (typeof setNodeGraphPatchDirtyState === "function") {
    setNodeGraphPatchDirtyState("edited");
  }
  nodeGraphRenderCircuitPatchList();
  return true;
}

function nodeGraphApplyCircuitPatchSlot(index) {
  const patch = nodeGraphMvp?.patch;
  if (!patch) {
    return false;
  }
  nodeGraphEnsureCircuitPatches(patch);
  const slot = patch.circuitPatches[index];
  if (!slot?.values) {
    return false;
  }
  patch.activeCircuitPatch = index;
  for (const node of patch.nodes || []) {
    const stored = slot.values[String(node?.id || "")];
    if (!stored || typeof stored !== "object") {
      continue;
    }
    node.params = { ...(node.params || {}), ...stored };
  }
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, { status: "circuit patch loaded" });
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
  const buttons = [];
  for (let i = 0; i < NODE_GRAPH_CIRCUIT_PATCH_COUNT; i += 1) {
    const filled = Boolean(patch.circuitPatches[i]?.values);
    const label = i === 0 ? `${i} default` : String(i);
    buttons.push(
      `<button type="button" class="node-circuit-patch-slot${filled ? " is-filled" : ""}${i === active ? " is-active" : ""}" data-circuit-slot="${i}" title="Left click loads. Ctrl+click stores the current parameters.">${label}</button>`,
    );
  }
  list.innerHTML = buttons.join("");
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
    if (event.ctrlKey || event.metaKey) {
      nodeGraphCaptureCircuitPatchSlot(index);
      return;
    }
    nodeGraphApplyCircuitPatchSlot(index);
  });
}
