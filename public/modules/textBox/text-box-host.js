// Sandbox adapter for the isolated Text Box widget.
// Widget never sees patch / wires / audio. Host writes layout and commits.

const nodeGraphTextBoxWidgets = new WeakMap();

function nodeGraphTextBoxHostFindWidget(nodeId) {
  const el = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(nodeId)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId || ""))}"]`);
  const body = el?.querySelector?.(".node-text-box-body");
  return body ? nodeGraphTextBoxWidgets.get(body) || null : null;
}

function nodeGraphTextBoxHostMirrorSceneText(text, { force = false } = {}) {
  const field = document.getElementById("nodeSceneTextBoxTextInput");
  if (!field) return;
  if (!force && document.activeElement === field) return;
  if (field.value !== text) field.value = text;
}

function nodeGraphTextBoxHostPaintFace(nodeId, text) {
  const shown = String(text ?? "");
  const widget = nodeGraphTextBoxHostFindWidget(nodeId);
  if (widget) {
    widget.setText(shown);
    return;
  }
  const el = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(nodeId)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId || ""))}"]`);
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (el && node && typeof nodeGraphTextBoxHostSync === "function") {
    nodeGraphTextBoxHostSync(el, { ...node, layout: { ...(node.layout || {}), text: shown } });
    return;
  }
  const field = el?.querySelector?.(".node-text-box-input");
  if (field) {
    if (typeof textBoxWidgetWriteText === "function") textBoxWidgetWriteText(field, shown);
    else field.textContent = shown;
  }
}

function nodeGraphTextBoxHostWriteLiveText(nodeId, text) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || typeof normalizeNodeGraphTextBoxLayout !== "function") return;
  const layout = normalizeNodeGraphTextBoxLayout(node.layout);
  node.layout = normalizeNodeGraphTextBoxLayout({ ...layout, text });
  nodeGraphTextBoxHostPaintFace(nodeId, node.layout.text);
  nodeGraphTextBoxHostMirrorSceneText(node.layout.text);
}

function nodeGraphTextBoxHostCommitText(nodeId, text) {
  if (typeof cloneNodeGraphPatch !== "function" || typeof commitNodeGraphPatch !== "function") {
    nodeGraphTextBoxHostWriteLiveText(nodeId, text);
    return;
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || (typeof nodeGraphNodeTypeHasTextBoxLayout === "function"
    && !nodeGraphNodeTypeHasTextBoxLayout(node.type))) {
    return;
  }
  const liveLayout = typeof normalizeNodeGraphTextBoxLayout === "function"
    ? normalizeNodeGraphTextBoxLayout({ ...(node.layout || {}), text })
    : { ...(node.layout || {}), text };
  node.layout = liveLayout;
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const target = patch.nodes.find((n) => n.id === nodeId);
  if (!target) return;
  target.layout = liveLayout;
  commitNodeGraphPatch(patch, {
    softDom: true,
    skipLivePlan: true,
    record: true,
    status: "text box text changed",
  });
  if (typeof nodeGraphTextBoxAnimatedCommitTextOut === "function") {
    nodeGraphTextBoxAnimatedCommitTextOut(nodeId, liveLayout.text);
  }
}

function nodeGraphTextBoxHostEnsureWidget(body, nodeId, layout, { editable = true } = {}) {
  if (!body || typeof createTextBoxWidget !== "function") return null;
  let widget = nodeGraphTextBoxWidgets.get(body);
  if (!widget || !widget.field?.isConnected) {
    widget = createTextBoxWidget(body, {
      text: layout.text,
      textMode: layout.textMode,
      horizontalAlign: layout.horizontalAlign,
      verticalAlignPercent: layout.verticalAlignPercent,
      textSizePercent: layout.textSizePercent,
      font: layout.font,
      backgroundColor: layout.backgroundColor,
      textColor: layout.textColor,
      editable,
      ariaLabel: typeof nodeGraphNodeDisplayName === "function"
        ? `${nodeGraphNodeDisplayName(nodeId)} text`
        : "Text box",
      onBackgroundWheel(event) {
        if (event.deltaY && typeof zoomNodeGraphAt === "function") {
          zoomNodeGraphAt(-Math.sign(event.deltaY), event.clientX, event.clientY);
        }
      },
    });
    widget.onChange((value) => nodeGraphTextBoxHostWriteLiveText(nodeId, value));
    widget.onCommit((value) => nodeGraphTextBoxHostCommitText(nodeId, value));
    nodeGraphTextBoxWidgets.set(body, widget);
  }
  return widget;
}

function nodeGraphTextBoxHostSync(element, patchNode) {
  if (!element || !patchNode) return;
  if (typeof nodeGraphTextBoxAnimatedSyncTitle === "function") {
    nodeGraphTextBoxAnimatedSyncTitle(element, patchNode);
  }
  const body = element.querySelector(".node-text-box-body");
  if (!body) return;
  body.hidden = false;
  body.removeAttribute("hidden");
  const layout = typeof normalizeNodeGraphTextBoxLayout === "function"
    ? normalizeNodeGraphTextBoxLayout(patchNode.layout)
    : (patchNode.layout || {});
  const driven = typeof nodeGraphTextBoxAnimatedResolvedText === "function"
    ? nodeGraphTextBoxAnimatedResolvedText(patchNode)
    : null;
  const displayText = driven !== null ? driven : layout.text;
  const editable = driven === null;
  const widget = nodeGraphTextBoxHostEnsureWidget(body, patchNode.id, {
    ...layout,
    text: displayText,
  }, { editable });
  if (!widget) return;
  widget.setEditable(editable);
  if (document.activeElement !== widget.field) {
    widget.setText(displayText);
  }
  widget.setLayout({
    textMode: layout.textMode,
    horizontalAlign: layout.horizontalAlign,
    verticalAlignPercent: layout.verticalAlignPercent,
    textSizePercent: layout.textSizePercent,
    font: layout.font,
    backgroundColor: layout.backgroundColor,
    textColor: layout.textColor,
  });
  nodeGraphTextBoxHostMirrorSceneText(displayText);
}

const nodeGraphTextBoxFloatingFieldIds = Object.freeze({
  title: "nodeSceneAliasInput",
  text: "nodeSceneTextBoxTextInput",
});

const nodeGraphTextBoxTypingSelector = [
  ".node-text-box-input",
  "#nodeSceneTextBoxTextInput",
  "#nodeSceneAliasInput",
].join(", ");

function nodeGraphTextBoxIsTypingElement(el) {
  return el instanceof Element && Boolean(el.closest?.(nodeGraphTextBoxTypingSelector));
}

function nodeGraphTextBoxIsTyping(event = null) {
  if (event && nodeGraphTextBoxIsTypingElement(event.target)) {
    return true;
  }
  return nodeGraphTextBoxIsTypingElement(document.activeElement);
}

function nodeGraphTextBoxStealHotkeys(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  event.stopPropagation();
}

function nodeGraphTextBoxBindFieldKeySteal(field) {
  if (!field || field.dataset.textBoxKeySteal === "1") {
    return field;
  }
  field.dataset.textBoxKeySteal = "1";
  field.addEventListener("keydown", nodeGraphTextBoxStealHotkeys, true);
  field.addEventListener("keyup", nodeGraphTextBoxStealHotkeys, true);
  field.addEventListener("keypress", nodeGraphTextBoxStealHotkeys, true);
  return field;
}

function nodeGraphTextBoxBindFloatingFieldSteals() {
  nodeGraphTextBoxBindFieldKeySteal(document.getElementById(nodeGraphTextBoxFloatingFieldIds.title));
  nodeGraphTextBoxBindFieldKeySteal(document.getElementById(nodeGraphTextBoxFloatingFieldIds.text));
}

function nodeGraphTextBoxFocusFloatingField(which = "text") {
  const fieldId = nodeGraphTextBoxFloatingFieldIds[which] || nodeGraphTextBoxFloatingFieldIds.text;
  const focusField = () => {
    const field = nodeGraphTextBoxBindFieldKeySteal(document.getElementById(fieldId));
    if (!field || field.disabled) return false;
    const wrap = field.closest("[hidden]");
    if (wrap?.hidden || field.closest("label")?.hidden) return false;
    if (field.readOnly) {
      field.readOnly = false;
    }
    field.focus();
    if (typeof field.select === "function") {
      field.select();
    }
    return document.activeElement === field;
  };
  if (focusField()) return true;
  requestAnimationFrame(() => {
    if (!focusField()) requestAnimationFrame(focusField);
  });
  return false;
}

function nodeGraphTextBoxSettingsWindowIsOpen() {
  const menu = document.getElementById("nodeModuleActionsWindow");
  return Boolean(menu && !menu.hidden);
}

function nodeGraphTextBoxEnsureSettingsOpen(nodeId, event = null) {
  const menu = document.getElementById("nodeModuleActionsWindow");
  const alreadyOpen = Boolean(menu && !menu.hidden);
  const current = String(nodeGraphMvp?.sceneContextTargetNode || nodeGraphMvp?.lastModuleActionTargetNode || "");
  if (alreadyOpen && current === String(nodeId || "")) {
    return;
  }
  if (alreadyOpen) {
    if (nodeGraphMvp) {
      nodeGraphMvp.sceneContextTargetNode = nodeId;
      nodeGraphMvp.lastModuleActionTargetNode = nodeId;
    }
    if (typeof configureNodeSceneContextMenu === "function") {
      configureNodeSceneContextMenu("module");
    }
    return;
  }
  const nodeEl = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(nodeId)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId || ""))}"]`);
  if (typeof openNodeGraphModuleSettingsFromContextEvent === "function") {
    openNodeGraphModuleSettingsFromContextEvent(event || { target: nodeEl }, nodeEl);
  }
}

function nodeGraphTextBoxOpenFloatingEditor(nodeId, which = "text", event = null) {
  nodeGraphTextBoxEnsureSettingsOpen(nodeId, event);
  nodeGraphTextBoxBindFloatingFieldSteals();
  nodeGraphTextBoxFocusFloatingField(which);
}

function nodeGraphTextBoxHostApplySceneText(nodeId, text, { commit = false } = {}) {
  nodeGraphTextBoxHostWriteLiveText(nodeId, text);
  if (commit) nodeGraphTextBoxHostCommitText(nodeId, text);
}
