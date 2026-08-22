function nodeGraphHistorySampleBank() {
  if (!(nodeGraphMvp.historySampleBank instanceof Map)) {
    nodeGraphMvp.historySampleBank = new Map();
  }
  return nodeGraphMvp.historySampleBank;
}

function nodeGraphHistoryRememberSamples(samples) {
  if (!Array.isArray(samples)) {
    return;
  }
  const bank = nodeGraphHistorySampleBank();
  for (const sample of samples) {
    const id = sample?.id;
    if (!id) {
      continue;
    }
    if (!bank.has(id)) {
      bank.set(id, sample);
    }
  }
}

function nodeGraphHistorySlimSamples(samples) {
  nodeGraphHistoryRememberSamples(samples);
  if (!Array.isArray(samples)) {
    return [];
  }
  return samples.map((sample) => {
    if (!sample || typeof sample !== "object") {
      return sample;
    }
    if (typeof nodeGraphPatchSamplesWithoutEmbeddedAudio === "function") {
      return nodeGraphPatchSamplesWithoutEmbeddedAudio([sample])[0] || sample;
    }
    const slim = { ...sample };
    delete slim.dataUrl;
    return slim;
  });
}

function nodeGraphHistoryResolveSamples(samples) {
  nodeGraphHistoryRememberSamples(nodeGraphMvp.patch?.samples);
  if (!Array.isArray(samples)) {
    return Array.isArray(nodeGraphMvp.patch?.samples) ? nodeGraphMvp.patch.samples : [];
  }
  const bank = nodeGraphHistorySampleBank();
  return samples.map((sample) => {
    const id = sample?.id;
    const full = id ? bank.get(id) : null;
    return full || sample;
  });
}

function recordNodeGraphHistory() {
  const live = nodeGraphMvp.patch;
  nodeGraphHistoryRememberSamples(live?.samples);
  const snapshot = serializeNodeGraphPatch(
    { ...live, samples: nodeGraphHistorySlimSamples(live?.samples) },
    { pretty: false },
  );
  if (nodeGraphMvp.historySnapshots[nodeGraphMvp.historyIndex] === snapshot) {
    renderNodeGraphHistoryControls();
    return;
  }
  nodeGraphMvp.historySnapshots = nodeGraphMvp.historySnapshots.slice(0, nodeGraphMvp.historyIndex + 1);
  nodeGraphMvp.historySnapshots.push(snapshot);
  if (nodeGraphMvp.historySnapshots.length > nodeGraphMvp.historyLimit) {
    nodeGraphMvp.historySnapshots.shift();
  }
  nodeGraphMvp.historyIndex = nodeGraphMvp.historySnapshots.length - 1;
  renderNodeGraphHistoryControls();
}

function nodeGraphHistoryStableJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function nodeGraphHistoryWiresKey(patch) {
  return nodeGraphHistoryStableJson({
    bypassedNodes: patch?.bypassedNodes,
    connections: patch?.connections,
    graphConnections: patch?.graphConnections,
    modulations: patch?.modulations,
  });
}

function nodeGraphHistoryRestKey(patch) {
  const sampleIds = (Array.isArray(patch?.samples) ? patch.samples : [])
    .map((sample) => sample?.id)
    .filter(Boolean);
  return nodeGraphHistoryStableJson({
    activeCameraId: patch?.activeCameraId,
    audio: patch?.audio,
    cameras: patch?.cameras,
    codeScreen: patch?.codeScreen,
    grid: patch?.grid,
    monitors: patch?.monitors,
    samples: sampleIds,
    timing: patch?.timing,
    uiItems: patch?.uiItems,
    view: patch?.view,
    visual: patch?.visual,
    windows: patch?.windows,
  });
}

function nodeGraphHistoryCommitOptions(prev, next) {
  const prevNodes = Array.isArray(prev?.nodes) ? prev.nodes : [];
  const nextNodes = Array.isArray(next?.nodes) ? next.nodes : [];
  const prevById = new Map(prevNodes.map((node) => [node.id, node]));
  const nextIds = new Set();
  const changedIds = [];
  let added = 0;
  for (const node of nextNodes) {
    nextIds.add(node.id);
    const before = prevById.get(node.id);
    if (!before) {
      added += 1;
      continue;
    }
    if (nodeGraphHistoryStableJson(before) !== nodeGraphHistoryStableJson(node)) {
      changedIds.push(node.id);
    }
  }
  let removed = 0;
  for (const node of prevNodes) {
    if (!nextIds.has(node.id)) {
      removed += 1;
    }
  }
  const wiresChanged = nodeGraphHistoryWiresKey(prev) !== nodeGraphHistoryWiresKey(next);
  const restChanged = nodeGraphHistoryRestKey(prev) !== nodeGraphHistoryRestKey(next);
  const options = {
    deferUiPanels: true,
    skipValidate: true,
  };
  if (restChanged) {
    return options;
  }
  if ((added || removed) && changedIds.length === 0) {
    options.topologyEdit = true;
    return options;
  }
  if (!added && !removed && !wiresChanged && changedIds.length > 0) {
    options.liveParamsOnly = true;
    options.paramSyncIds = changedIds;
    return options;
  }
  if (!added && !removed && wiresChanged && changedIds.length === 0) {
    options.wireEdit = true;
    return options;
  }
  if (changedIds.length > 0) {
    options.paramSyncIds = changedIds;
  }
  return options;
}

let nodeGraphHistoryAutosaveTimer = 0;

function scheduleNodeGraphHistoryAutosave() {
  if (typeof saveNodeGraphWorkingPatchToUserSettings !== "function") {
    return;
  }
  if (nodeGraphHistoryAutosaveTimer) {
    window.clearTimeout(nodeGraphHistoryAutosaveTimer);
  }
  nodeGraphHistoryAutosaveTimer = window.setTimeout(() => {
    nodeGraphHistoryAutosaveTimer = 0;
    saveNodeGraphWorkingPatchToUserSettings();
  }, 400);
}

function applyNodeGraphHistorySnapshot(snapshot, status) {
  let next = snapshot;
  if (typeof snapshot === "string") {
    try {
      next = JSON.parse(snapshot);
    } catch (error) {
      if (typeof loadNodeGraphPatchFromScript === "function") {
        next = loadNodeGraphPatchFromScript(snapshot);
      } else {
        throw error;
      }
    }
  }
  if (!next || typeof next !== "object") {
    return;
  }
  next.samples = nodeGraphHistoryResolveSamples(next.samples);
  const flags = nodeGraphHistoryCommitOptions(nodeGraphMvp.patch, next);
  commitNodeGraphPatch(next, {
    ...flags,
    autosaveWorkingPatch: false,
    record: false,
    skipValidate: true,
    status,
  });
  scheduleNodeGraphHistoryAutosave();
}

function nodeGraphHistoryGlowClass(kind) {
  if (kind === "undo") {
    return "is-history-glow-undo";
  }
  if (kind === "redo") {
    return "is-history-glow-redo";
  }
  if (kind === "last") {
    return "is-history-glow-last";
  }
  return "is-history-glow-delete";
}

function nodeGraphHistoryActionButtons(kind) {
  const ids = kind === "undo"
    ? ["nodeUndoButton", "nodeSceneUndoButton"]
    : kind === "redo"
      ? ["nodeRedoButton", "nodeSceneRedoButton"]
      : kind === "last"
        ? ["nodeHistoryLastAction"]
        : ["nodeSceneHistoryDeleteButton", "nodeDeleteButton", "nodeSceneDeleteModule"];
  return ids.map((id) => document.getElementById(id)).filter(Boolean);
}

function renderNodeGraphLastActionReadout() {
  const el = document.getElementById("nodeHistoryLastAction");
  if (!el) {
    return;
  }
  el.textContent = String(nodeGraphMvp.lastHeavyAction || "");
}

function flashNodeGraphLastActionReadout() {
  const el = document.getElementById("nodeHistoryLastAction");
  if (!el) {
    return;
  }
  el.classList.remove("is-history-glow-last");
  void el.offsetWidth;
  el.classList.add("is-history-glow-last");
  window.clearTimeout(flashNodeGraphLastActionReadout._glow);
  window.clearTimeout(flashNodeGraphLastActionReadout._clear);
  flashNodeGraphLastActionReadout._glow = window.setTimeout(() => {
    el.classList.remove("is-history-glow-last");
    flashNodeGraphLastActionReadout._clear = window.setTimeout(() => {
      clearNodeGraphLastActionReadout();
    }, 2000);
  }, 220);
}

function clearNodeGraphLastActionReadout() {
  nodeGraphMvp.lastHeavyAction = "";
  renderNodeGraphLastActionReadout();
}

function noteNodeGraphHeavyHistoryAction(kind) {
  const key = String(kind || "").trim();
  const labels = {
    add: "add",
    delete: "delete",
    swapLr: "swap l/r",
  };
  nodeGraphMvp.lastHeavyAction = labels[key] || key;
  renderNodeGraphLastActionReadout();
  flashNodeGraphLastActionReadout();
}

function noteNodeGraphDisplayChange() {
  nodeGraphMvp.lastHeavyAction = "Display Change";
  renderNodeGraphLastActionReadout();
  flashNodeGraphLastActionReadout();
}

function noteNodeGraphCommandCenterPage(label = "") {
  const name = String(label || "").trim();
  nodeGraphMvp.lastHeavyAction = name || "command center page";
  renderNodeGraphLastActionReadout();
  flashNodeGraphLastActionReadout();
}

function noteNodeGraphScriptPageOpen() {
  const page = typeof nodeGraphBookScriptPage === "function"
    ? nodeGraphBookScriptPage()
    : nodeGraphMvp?.bookScriptPage;
  nodeGraphMvp.lastHeavyAction = page === "ui-settings"
    ? "open ui settings script page"
    : "open script page";
  renderNodeGraphLastActionReadout();
  flashNodeGraphLastActionReadout();
}

function beginNodeGraphHistoryGlow(kind) {
  const on = nodeGraphHistoryGlowClass(kind);
  for (const button of nodeGraphHistoryActionButtons(kind)) {
    button.classList.remove(
      "is-history-glow-undo",
      "is-history-glow-redo",
      "is-history-glow-delete",
      "is-history-glow-last",
    );
    button.classList.add(on);
  }
  void document.body?.offsetWidth;
}

function endNodeGraphHistoryGlow(kind) {
  const cls = nodeGraphHistoryGlowClass(kind);
  for (const button of nodeGraphHistoryActionButtons(kind)) {
    button.classList.remove(cls);
  }
  if (kind === "last") {
    clearNodeGraphLastActionReadout();
  }
}

function runNodeGraphHistoryAfterGlow(kind, run) {
  beginNodeGraphHistoryGlow(kind);
  const finish = () => {
    try {
      run();
    } finally {
      endNodeGraphHistoryGlow(kind);
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
    return;
  }
  window.setTimeout(finish, 16);
}

function undoNodeGraphPatch() {
  if (!nodeGraphScriptReadyForGraphAction("undo")) {
    return;
  }
  if (nodeGraphMvp.historyIndex <= 0) {
    return;
  }
  runNodeGraphHistoryAfterGlow("undo", () => {
    nodeGraphMvp.historyIndex -= 1;
    applyNodeGraphHistorySnapshot(nodeGraphMvp.historySnapshots[nodeGraphMvp.historyIndex], "undo");
  });
}

function redoNodeGraphPatch() {
  if (!nodeGraphScriptReadyForGraphAction("redo")) {
    return;
  }
  if (nodeGraphMvp.historyIndex >= nodeGraphMvp.historySnapshots.length - 1) {
    return;
  }
  runNodeGraphHistoryAfterGlow("redo", () => {
    nodeGraphMvp.historyIndex += 1;
    applyNodeGraphHistorySnapshot(nodeGraphMvp.historySnapshots[nodeGraphMvp.historyIndex], "redo");
  });
}
