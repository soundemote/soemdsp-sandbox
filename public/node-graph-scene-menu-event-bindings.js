function bindNodeGraphSceneElementEvent(id, eventName, handler, options = undefined) {
  const element = document.getElementById(id);
  if (!element || typeof handler !== "function") {
    return;
  }
  element.addEventListener(eventName, handler, options);
}

function bindNodeGraphSceneMenuEvents() {
  if (typeof bindNodeGraphSettingsTextInputProtection === "function") {
    bindNodeGraphSettingsTextInputProtection(document.getElementById("nodeGlobalScopeMenu"));
  }
  ensureNodeGraphModuleActionsWindowBody();
  bindNodeGraphSceneElementEvent("nodeModuleShopView", "click", handleNodeGraphModuleStoreClick);
  bindNodeGraphSceneElementEvent("nodeModuleShopView", "keydown", handleNodeGraphModuleStoreKeydown);
  bindNodeGraphSceneElementEvent("nodeModuleShopClose", "click", closeNodeGraphModuleShop);
  bindNodeGraphSceneElementEvent("nodeModuleShopView", "pointerdown", beginNodeGraphModuleStorePointerPlacement);
  bindNodeGraphSceneElementEvent("nodeModuleShopView", "pointerdown", beginNodeGraphModuleShopViewDrag);
  bindNodeGraphSceneElementEvent("nodeModuleShopHeading", "pointerdown", beginNodeGraphModuleShopViewDrag);
  bindNodeGraphSceneElementEvent("nodeModuleShopResizeHandle", "pointerdown", beginNodeGraphModuleShopViewResize);
  bindNodeGraphSceneElementEvent("nodeModuleDepartmentSearch", "input", handleNodeGraphModuleDepartmentSearchInput);
  bindNodeGraphSceneElementEvent("nodeModuleDepartmentSearch", "keydown", handleNodeGraphModuleDepartmentSearchKeydown);
  bindNodeGraphSceneElementEvent("nodeModuleDepartmentBack", "click", () => setNodeGraphModuleStoreDepartment(""));
  document.addEventListener("pointermove", dragNodeGraphModuleShopView);
  document.addEventListener("pointerup", endNodeGraphModuleShopViewDrag);
  document.addEventListener("pointercancel", endNodeGraphModuleShopViewDrag);
  document.addEventListener("pointerup", releaseNodeGraphModuleStorePointerPlacement);
  document.addEventListener("pointercancel", cancelNodeGraphModuleStorePointerPlacement);
  document.addEventListener("pointermove", dragNodeGraphModuleShopViewResize);
  document.addEventListener("pointerup", endNodeGraphModuleShopViewResize);
  document.addEventListener("pointercancel", endNodeGraphModuleShopViewResize);
  bindNodeGraphSceneElementEvent("nodeGraphWorkspace", "pointerdown", beginNodeGraphGraphNodeDrag, true);
  bindNodeGraphSceneElementEvent("nodeGraphWorkspace", "contextmenu", handleNodeGraphGraphNodeContextMenu, true);
  bindNodeGraphSceneElementEvent("nodeGraphWorkspace", "dblclick", handleNodeGraphGraphNodeDoubleClick, true);
  document.addEventListener("pointermove", dragNodeGraphGraphNode);
  document.addEventListener("pointerup", endNodeGraphGraphNodeDrag);
  document.addEventListener("pointercancel", endNodeGraphGraphNodeDrag);
  document.addEventListener("pointermove", dragNodeModuleActionsWindowResize);
  document.addEventListener("pointerup", endNodeModuleActionsWindowResize);
  document.addEventListener("pointercancel", endNodeModuleActionsWindowResize);
  document.addEventListener("pointermove", dragNodeGraphCodeBoxWindow);
  document.addEventListener("pointerup", endNodeGraphCodeBoxWindowDrag);
  document.addEventListener("pointercancel", endNodeGraphCodeBoxWindowDrag);
  document.addEventListener("pointermove", dragNodeGraphCodeBoxWindowResize);
  document.addEventListener("pointerup", endNodeGraphCodeBoxWindowResize);
  document.addEventListener("pointercancel", endNodeGraphCodeBoxWindowResize);
  bindNodeGraphSceneElementEvent("nodeSceneDeleteModule", "click", deleteNodeGraphSelectionFromContext);
  document
    .querySelectorAll("#nodeSceneWireTypeControl [data-wire-type]")
    .forEach((button) => {
      button.addEventListener("click", () => setSelectedNodeGraphWireType(button.dataset.wireType));
    });
  bindNodeGraphSceneElementEvent("nodeSceneCopyModule", "click", copyNodeGraphModuleFromContext);
  // Wired but disabled -- module grouping itself is under construction (see
  // saveNodeGraphSelectionAsModuleGroup's early return in
  // node-graph-module-actions.js and configureNodeSceneContextMenu's
  // addToGroupButton.disabled = true in node-graph-context-menu.js). The
  // button exists now so the rest of the UI plumbing (menu placement,
  // disabled/tooltip state) is in place ahead of building the feature out.
  bindNodeGraphSceneElementEvent("nodeSceneAddToGroup", "click", saveNodeGraphSelectionAsModuleGroup);
  bindNodeGraphSceneElementEvent("nodeSceneCopyModuleSettings", "click", copyNodeGraphModuleSettingsFromContext);
  bindNodeGraphSceneElementEvent("nodeScenePasteModuleSettings", "click", pasteNodeGraphModuleSettingsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneSetModuleSettingsAsDefault", "click", setNodeGraphModuleSettingsAsDefaultFromButton);
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularOnlyView", "click", toggleNodeGraphModularOnlyView);
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularOnlyControls", "click", toggleNodeGraphViewButtonsVisibility);
  bindNodeGraphSceneElementEvent("nodeSceneOpenModuleBrowser", "click", () => {
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("moduleBrowser", {
        point: nodeGraphMvp.sceneContextPoint,
      });
      return;
    }
    openNodeGraphModuleShop(nodeGraphMvp.sceneContextPoint);
  });
  bindNodeGraphSceneElementEvent("nodeSceneOpenModuleActions", "click", () => {
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("moduleActions");
      return;
    }
    openNodeGraphModuleActionsFromContextWindow();
  });
  bindNodeGraphSceneElementEvent("nodeModuleActionsClose", "click", closeNodeModuleActionsWindow);
  bindNodeGraphSceneElementEvent("nodeModuleActionsWindowHeading", "pointerdown", beginNodeModuleActionsWindowDrag);
  bindNodeGraphSceneElementEvent("nodeModuleActionsDragHandle", "pointerdown", beginNodeModuleActionsWindowDrag);
  bindNodeGraphSceneElementEvent("nodeModuleActionsResizeHandle", "pointerdown", beginNodeModuleActionsWindowResize);
  bindNodeGraphSceneElementEvent("nodeCodeBoxClose", "click", closeNodeGraphCodeBoxWindow);
  bindNodeGraphSceneElementEvent("nodeCodeBoxWindowHeading", "pointerdown", beginNodeGraphCodeBoxWindowDrag);
  bindNodeGraphSceneElementEvent("nodeCodeBoxDragHandle", "pointerdown", beginNodeGraphCodeBoxWindowDrag);
  bindNodeGraphSceneElementEvent("nodeCodeBoxResizeHandle", "pointerdown", beginNodeGraphCodeBoxWindowResize);
  bindNodeGraphSceneElementEvent("nodeCodeBoxApplyCode", "click", applyNodeGraphCodeBoxWindowCode);
  bindNodeGraphSceneElementEvent("nodeCodeBoxOpenFullScreen", "click", openNodeGraphCodeBoxWindowFullScreen);
  bindNodeGraphSceneElementEvent("nodeCodeBoxTitle", "input", scheduleNodeGraphCodeBoxWindowTitleApply);
  bindNodeGraphSceneElementEvent("nodeCodeBoxTitle", "change", applyNodeGraphCodeBoxWindowTitle);
  bindNodeGraphSceneElementEvent("nodeCodeBoxInputs", "input", scheduleNodeGraphCodeBoxWindowPortsApply);
  bindNodeGraphSceneElementEvent("nodeCodeBoxOutputs", "input", scheduleNodeGraphCodeBoxWindowPortsApply);
  bindNodeGraphSceneElementEvent("nodeCodeBoxOutputs", "change", applyNodeGraphCodeBoxWindowPorts);
  bindNodeGraphSceneElementEvent("nodeCodeBoxSource", "input", handleNodeGraphCodeBoxWindowSourceInput);
  bindNodeGraphSceneElementEvent("nodeCodeBoxSource", "scroll", updateNodeGraphCodeBoxWindowEditorChrome);
  bindNodeGraphSceneElementEvent("nodeSceneUndoButton", "click", undoNodeGraphPatch);
  bindNodeGraphSceneElementEvent("nodeSceneRedoButton", "click", redoNodeGraphPatch);
  bindNodeGraphSceneElementEvent("nodeSceneOpenSavedPatches", "click", () => {
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("patchExplorer");
      return;
    }
    setNodeGraphSavedPatchesWindowVisible(true);
  });
  bindNodeGraphSceneElementEvent("nodeSceneToggleStandaloneMidiKeyboard", "click", toggleNodeGraphStandaloneMidiKeyboard);
  bindNodeGraphSceneElementEvent("nodeSceneCopyPatch", "click", copyNodeGraphScriptToClipboard);
  bindNodeGraphSceneElementEvent("nodeScenePastePatch", "click", pasteNodeGraphScriptFromClipboard);
  bindNodeGraphSceneElementEvent("nodeSceneOpenUiSettings", "click", () => {
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("uiSettings");
      return;
    }
    setNodeUserUiSettingsVisible(true);
  });
  // Screen Shader is WIP — leave as a standalone open, not unified pages.
  bindNodeGraphSceneElementEvent("nodeSceneOpenPostProcessing", "click", () => {
    openNodeGraphGlobalShaderScript();
  });
  bindNodeGraphSceneElementEvent("nodeSceneOpenVisibility", "click", () => {
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("visibilityMenu");
      return;
    }
    setNodeGraphVisibilityMenuOpen(true);
  });
  bindNodeGraphSceneElementEvent("nodeSceneGlobalSmoothingSeconds", "change", handleNodeGraphGlobalSmoothingSecondsChange);
  bindNodeGraphSceneElementEvent("nodeSceneGlobalSmoothingSeconds", "keydown", handleNodeGraphGlobalSmoothingSecondsKeydown);
  bindNodeGraphSceneElementEvent("nodeSceneGlobalSmoothingSeconds", "blur", handleNodeGraphGlobalSmoothingSecondsChange);
  bindNodeGraphSceneElementEvent("nodeSceneGlobalSmoothingSeconds", "dblclick", beginNodeGraphGlobalSmoothingSecondsEdit);
  bindNodeGraphSceneElementEvent("nodeSceneGlobalSmoothingSeconds", "pointerdown", beginNodeGraphGlobalSmoothingSecondsDrag);
  document.addEventListener("pointermove", dragNodeGraphGlobalSmoothingSeconds);
  document.addEventListener("pointerup", endNodeGraphGlobalSmoothingSecondsDrag);
  document.addEventListener("pointercancel", endNodeGraphGlobalSmoothingSecondsDrag);
  if (typeof syncNodeGraphGlobalSmoothingControl === "function") {
    syncNodeGraphGlobalSmoothingControl({ force: true });
  }
  bindNodeGraphSceneElementEvent("nodeSceneWidthDecrease", "click", () => adjustNodeGraphModuleWidthFromContext(-1));
  bindNodeGraphSceneElementEvent("nodeSceneWidthIncrease", "click", () => adjustNodeGraphModuleWidthFromContext(1));
  bindNodeGraphSceneElementEvent("nodeSceneDisplayHeightDecrease", "click", () => adjustNodeGraphModuleDisplayHeightFromContext(-1));
  bindNodeGraphSceneElementEvent("nodeSceneDisplayHeightIncrease", "click", () => adjustNodeGraphModuleDisplayHeightFromContext(1));
  document
    .querySelectorAll("#nodeGlobalScopeMenu [data-scope-control]")
    .forEach((button) => {
      button.addEventListener("click", handleNodeGraphSceneScopeControlClick);
    });
  document
    .querySelectorAll("#nodeGlobalScopeMenu [data-scope-input]")
    .forEach((input) => {
      input.addEventListener("change", handleNodeGraphSceneScopeNumericInput);
      input.addEventListener("keydown", handleNodeGraphSceneScopeNumericKeydown);
      input.addEventListener("dblclick", beginNodeGraphScopeNumberEdit);
      input.addEventListener("pointerdown", beginNodeGraphScopeNumberDrag);
      input.addEventListener("lostpointercapture", endNodeGraphScopeNumberDrag);
    });
  document.addEventListener("pointermove", dragNodeGraphScopeNumber);
  document.addEventListener("pointerup", endNodeGraphScopeNumberDrag);
  document.addEventListener("pointercancel", endNodeGraphScopeNumberDrag);
  document.addEventListener("pointermove", dragNodeScopeContextMenu);
  document.addEventListener("pointerup", endNodeScopeContextMenuDrag);
  document.addEventListener("pointercancel", endNodeScopeContextMenuDrag);
  document.addEventListener("pointermove", dragNodeModuleActionsWindow);
  document.addEventListener("pointerup", endNodeModuleActionsWindowDrag);
  document.addEventListener("pointercancel", endNodeModuleActionsWindowDrag);
  document.addEventListener("pointermove", dragNodeGlobalScopeMenu);
  document.addEventListener("pointerup", endNodeGlobalScopeMenuDrag);
  document.addEventListener("pointercancel", endNodeGlobalScopeMenuDrag);
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextSizeDecrease", "click", () =>
    adjustNodeGraphTextBoxTextSizeFromContext(-nodeGraphTextBoxTextSizeLimits.stepPercent));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextSizeIncrease", "click", () =>
    adjustNodeGraphTextBoxTextSizeFromContext(nodeGraphTextBoxTextSizeLimits.stepPercent));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxHeightDecrease", "click", () =>
    adjustNodeGraphModuleHeightFromContext(-1));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxHeightIncrease", "click", () =>
    adjustNodeGraphModuleHeightFromContext(1));
  bindNodeGraphSceneElementEvent("nodeSceneAliasInput", "input", () => setNodeGraphModuleAliasFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneAliasInput", "change", () => setNodeGraphModuleAliasFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneToggleButtons", "click", toggleNodeGraphModuleButtonsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleModuleEnabled", "click", toggleNodeGraphModuleEnabledFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneOpenNativeCode", "click", openNodeGraphNativeModuleCodeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneOpenNativeLib", "click", openNodeGraphNativeModuleLibFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleOscilloscope", "click", toggleNodeGraphModuleOscilloscopeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleInterfaceControls", "click", toggleNodeGraphModuleInterfaceControlsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleSliders", "click", toggleNodeGraphModuleSlidersFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleIo", "click", toggleNodeGraphModuleIoFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleTitle", "click", toggleNodeGraphModuleTitleFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneImageSave", "click", saveNodeGraphImageFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneImageRefresh", "click", refreshNodeGraphImageFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneCanvasScript", "click", openNodeGraphCanvasScriptFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneLedColor", "input", () => setNodeGraphLedColorFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneLedColor", "change", () => setNodeGraphLedColorFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneBugButtonGlyph", "input", () => setNodeGraphBugButtonGlyphFromContext());
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxSingleLine", "click", () => setNodeGraphTextBoxModeFromContext("singleLine"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxMultiline", "click", () => setNodeGraphTextBoxModeFromContext("multiline"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "input", () => setNodeGraphTextBoxTextFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "change", () => setNodeGraphTextBoxTextFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockApplyPorts", "click", applyNodeGraphCodeblockPortsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockOpenCodeScreen", "click", () => openNodeGraphCodeBoxWindowForNode());
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockSource", "input", () => setNodeGraphCodeblockSourceFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockSource", "change", () => setNodeGraphCodeblockSourceFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTitleScript", "input", () => setNodeGraphTextBoxPortScriptFromContext("Title", { record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTitleScript", "change", () => setNodeGraphTextBoxPortScriptFromContext("Title", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextScript", "input", () => setNodeGraphTextBoxPortScriptFromContext("Text", { record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextScript", "change", () => setNodeGraphTextBoxPortScriptFromContext("Text", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphCursorX", "input", () => setNodeGraphGraphCursorFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphCursorX", "change", () => setNodeGraphGraphCursorFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeIndex", "change", selectNodeGraphGraphNodeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeX", "input", () => setNodeGraphGraphNodeFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeX", "change", () => setNodeGraphGraphNodeFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeY", "input", () => setNodeGraphGraphNodeFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeY", "change", () => setNodeGraphGraphNodeFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeContour", "input", () => setNodeGraphGraphNodeFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeContour", "change", () => setNodeGraphGraphNodeFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeShape", "change", () => setNodeGraphGraphNodeFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeList", "click", handleNodeGraphGraphNodeListClick);
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeList", "input", handleNodeGraphGraphNodeListInput);
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeList", "change", handleNodeGraphGraphNodeListChange);
  bindNodeGraphSceneElementEvent("nodeSceneGraphPreviousNode", "click", () => selectNodeGraphGraphNodeOffsetFromContext(-1));
  bindNodeGraphSceneElementEvent("nodeSceneGraphNextNode", "click", () => selectNodeGraphGraphNodeOffsetFromContext(1));
  bindNodeGraphSceneElementEvent("nodeSceneGraphAddNode", "click", addNodeGraphGraphNodeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneGraphDuplicateNode", "click", duplicateNodeGraphGraphNodeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneGraphRemoveNode", "click", removeNodeGraphGraphNodeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneGraphReset", "click", resetNodeGraphGraphFromContext);
  document
    .querySelectorAll("#nodeSceneGraphPresetControls [data-graph-preset]")
    .forEach((button) => {
      button.addEventListener("click", () => setNodeGraphGraphPresetFromContext(button.dataset.graphPreset));
    });
  document
    .querySelectorAll("#nodeSceneGraphRangeControls [data-graph-range-min][data-graph-range-max]")
    .forEach((button) => {
      button.addEventListener("click", () => setNodeGraphGraphOutputRangeFromContext(
        button.dataset.graphRangeMin,
        button.dataset.graphRangeMax,
      ));
    });
  document
    .querySelectorAll("#nodeSceneGraphTransformControls [data-graph-transform]")
    .forEach((button) => {
      button.addEventListener("click", () => transformNodeGraphGraphFromContext(button.dataset.graphTransform));
    });
  bindNodeGraphSceneElementEvent("nodeSceneGraphCopy", "click", copyNodeGraphGraphFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneGraphPaste", "click", pasteNodeGraphGraphFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxAlignLeft", "click", () => setNodeGraphTextBoxHorizontalAlignFromContext("left"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxAlignCenter", "click", () => setNodeGraphTextBoxHorizontalAlignFromContext("center"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxAlignRight", "click", () => setNodeGraphTextBoxHorizontalAlignFromContext("right"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxVerticalAlign", "input", () => setNodeGraphTextBoxVerticalAlignFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxVerticalAlign", "change", () => setNodeGraphTextBoxVerticalAlignFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneCloseMenu", "click", () =>
    closeNodeSceneContextMenu({ explicit: true }));
  bindNodeGraphSceneElementEvent("nodeSceneDragHandle", "pointerdown", beginNodeSceneContextMenuDrag);
  bindNodeGraphSceneElementEvent("nodeSceneContextResizeHandle", "pointerdown", beginNodeSceneContextWindowResize);
  document.addEventListener("pointermove", dragNodeSceneContextWindowResize);
  document.addEventListener("pointerup", endNodeSceneContextWindowResize);
  document.addEventListener("pointercancel", endNodeSceneContextWindowResize);
  document
    .querySelector("#nodeSceneContextMenu .scene-context-heading")
    ?.addEventListener("pointerdown", beginNodeSceneContextMenuDrag);
}
