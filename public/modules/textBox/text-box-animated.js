// Animated Text Box ports stay in the host. The widget never reads wires.

function nodeGraphTextBoxAnimatedResolvedTitle(patchNode) {
  if (!patchNode || typeof readNodeGraphDataInput !== "function") return null;
  const raw = readNodeGraphDataInput(patchNode.id, "Title");
  if (raw === undefined) return null;
  const scripted = typeof evaluateNodeGraphPortScript === "function"
    ? evaluateNodeGraphPortScript(patchNode.portScripts?.Title, raw)
    : raw;
  return String(scripted ?? "");
}

function nodeGraphTextBoxAnimatedResolvedText(patchNode) {
  if (!patchNode || typeof readNodeGraphDataInput !== "function") return null;
  if (!nodeGraphModuleDefinitions?.[patchNode.type]?.dataInputs?.includes("Text")) {
    return null;
  }
  const raw = readNodeGraphDataInput(patchNode.id, "Text");
  if (raw === undefined) return null;
  const scripted = typeof evaluateNodeGraphPortScript === "function"
    ? evaluateNodeGraphPortScript(patchNode.portScripts?.Text, raw)
    : raw;
  return String(scripted ?? "");
}

function nodeGraphTextBoxAnimatedSyncTitle(element, patchNode) {
  const field = element?.querySelector?.(".node-header-title");
  if (!field) return;
  const resolvedTitle = nodeGraphTextBoxAnimatedResolvedTitle(patchNode);
  if (resolvedTitle !== null) {
    field.dataset.titleLocked = "1";
  } else {
    delete field.dataset.titleLocked;
  }
  const displayValue = resolvedTitle !== null
    ? resolvedTitle
    : (typeof nodeGraphPatchNodeTitle === "function" ? nodeGraphPatchNodeTitle(patchNode.id) : "");
  if (field.dataset.titleEditing !== "1" && field.textContent !== displayValue) {
    field.textContent = displayValue;
  }
}

function nodeGraphTextBoxAnimatedCommitTextOut(nodeId, text) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) return;
  if (!nodeGraphModuleDefinitions?.[node.type]?.dataOutputs?.includes("Text Out")) return;
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(nodeId, "Text Out", String(text ?? ""));
  }
}
