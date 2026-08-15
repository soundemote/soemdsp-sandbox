function recordNodeGraphHistory() {
  const snapshot = serializeNodeGraphPatch();
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

function nodeGraphHistoryGlowClass(kind) {
  if (kind === "undo") {
    return "is-history-glow-undo";
  }
  if (kind === "redo") {
    return "is-history-glow-redo";
  }
  return "is-history-glow-delete";
}

function nodeGraphHistoryActionButtons(kind) {
  const ids = kind === "undo"
    ? ["nodeUndoButton", "nodeSceneUndoButton"]
    : kind === "redo"
      ? ["nodeRedoButton", "nodeSceneRedoButton"]
      : ["nodeHistoryDeleteButton", "nodeSceneHistoryDeleteButton", "nodeDeleteButton", "nodeSceneDeleteModule"];
  return ids.map((id) => document.getElementById(id)).filter(Boolean);
}

function beginNodeGraphHistoryGlow(kind) {
  const on = nodeGraphHistoryGlowClass(kind);
  for (const button of nodeGraphHistoryActionButtons(kind)) {
    button.classList.remove("is-history-glow-undo", "is-history-glow-redo", "is-history-glow-delete");
    button.classList.add(on);
  }
  void document.body?.offsetWidth;
}

function endNodeGraphHistoryGlow(kind) {
  const cls = nodeGraphHistoryGlowClass(kind);
  for (const button of nodeGraphHistoryActionButtons(kind)) {
    button.classList.remove(cls);
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
    commitNodeGraphPatch(loadNodeGraphPatchFromScript(nodeGraphMvp.historySnapshots[nodeGraphMvp.historyIndex]), {
      record: false,
      status: "undo",
    });
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
    commitNodeGraphPatch(loadNodeGraphPatchFromScript(nodeGraphMvp.historySnapshots[nodeGraphMvp.historyIndex]), {
      record: false,
      status: "redo",
    });
  });
}
