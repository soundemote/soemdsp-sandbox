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
  document.addEventListener("pointermove", dragNodeGraphGraphNode);
  document.addEventListener("pointerup", endNodeGraphGraphNodeDrag);
  document.addEventListener("pointercancel", endNodeGraphGraphNodeDrag);
  document.addEventListener("pointermove", dragNodeModuleActionsWindowResize);
  document.addEventListener("pointerup", endNodeModuleActionsWindowResize);
  document.addEventListener("pointercancel", endNodeModuleActionsWindowResize);
  bindNodeGraphSceneElementEvent("nodeSceneDeleteModule", "click", deleteNodeGraphSelectionFromContext);
  document
    .querySelectorAll("#nodeSceneWireTypeControl [data-wire-type]")
    .forEach((button) => {
      button.addEventListener("click", () => setSelectedNodeGraphWireType(button.dataset.wireType));
    });
  bindNodeGraphSceneElementEvent("nodeSceneCopyModule", "click", copyNodeGraphModuleFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularOnlyView", "click", () => {
    const modularOnlyActive = document.getElementById("nodeWiringPanel")?.classList.contains("modular-only-view");
    setNodeGraphViewMode(modularOnlyActive ? "modular" : "modular-only");
  });
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularOnlyControls", "click", () => {
    // "View Buttons" toggles module-button visibility, but if we're
    // currently off in settings/script/UI/mapping view it also needs to
    // bring us back to the modular workspace first -- otherwise there's
    // nothing on screen for the toggle to visibly affect. Preserves
    // modular-only mode if that's what we were already in.
    if (document.getElementById("nodeGraphWorkspace")?.hidden) {
      const modularOnlyActive = document.getElementById("nodeWiringPanel")?.classList.contains("modular-only-view");
      setNodeGraphViewMode(modularOnlyActive ? "modular-only" : "modular");
    }
    toggleNodeGraphModularOnlyControlsVisible();
  });
  bindNodeGraphSceneElementEvent("nodeSceneOpenModuleBrowser", "click", () => {
    openNodeGraphModuleShop(nodeGraphMvp.sceneContextPoint);
  });
  bindNodeGraphSceneElementEvent("nodeSceneOpenModuleActions", "click", openNodeGraphModuleActionsFromContextWindow);
  bindNodeGraphSceneElementEvent("nodeModuleActionsClose", "click", closeNodeModuleActionsWindow);
  bindNodeGraphSceneElementEvent("nodeModuleActionsWindowHeading", "pointerdown", beginNodeModuleActionsWindowDrag);
  bindNodeGraphSceneElementEvent("nodeModuleActionsDragHandle", "pointerdown", beginNodeModuleActionsWindowDrag);
  bindNodeGraphSceneElementEvent("nodeModuleActionsResizeHandle", "pointerdown", beginNodeModuleActionsWindowResize);
  bindNodeGraphSceneElementEvent("nodeSceneUndoButton", "click", undoNodeGraphPatch);
  bindNodeGraphSceneElementEvent("nodeSceneRedoButton", "click", redoNodeGraphPatch);
  bindNodeGraphSceneElementEvent("nodeSceneOpenSavedPatches", "click", () => {
    setNodeGraphSavedPatchesWindowVisible(true);
  });
  bindNodeGraphSceneElementEvent("nodeSceneCopyPatch", "click", copyNodeGraphScriptToClipboard);
  bindNodeGraphSceneElementEvent("nodeScenePastePatch", "click", pasteNodeGraphScriptFromClipboard);
  bindNodeGraphSceneElementEvent("nodeSceneSharePatch", "click", copyNodeGraphShareLinkToClipboard);
  bindNodeGraphSceneElementEvent("nodeSceneOpenUiSettings", "click", () => {
    setNodeUserUiSettingsVisible(true);
  });
  bindNodeGraphSceneElementEvent("nodeSceneOpenPostProcessing", "click", () => {
    openNodeGraphGlobalShaderScript();
  });
  bindNodeGraphSceneElementEvent("nodeSceneOpenVisibility", "click", () => {
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
  bindNodeGraphSceneElementEvent("nodeSceneAddToGroup", "click", saveNodeGraphSelectionAsModuleGroup);
  bindNodeGraphSceneElementEvent("nodeSceneAddToUi", "click", addNodeGraphModuleToUiFromContext);
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
    adjustNodeGraphTextBoxHeightFromContext(-1));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxHeightIncrease", "click", () =>
    adjustNodeGraphTextBoxHeightFromContext(1));
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
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxSingleLine", "click", () => setNodeGraphTextBoxModeFromContext("singleLine"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxMultiline", "click", () => setNodeGraphTextBoxModeFromContext("multiline"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "input", () => setNodeGraphTextBoxTextFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "change", () => setNodeGraphTextBoxTextFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockApplyPorts", "click", applyNodeGraphCodeblockPortsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockOpenCodeScreen", "click", () => openNodeGraphCodeScreenForNode());
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockSource", "input", () => setNodeGraphCodeblockSourceFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneCodeblockSource", "change", () => setNodeGraphCodeblockSourceFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneScriptBoxApplyPorts", "click", applyNodeGraphScriptBoxPortsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneScriptBoxSource", "input", () => setNodeGraphScriptBoxSourceFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneScriptBoxSource", "change", () => setNodeGraphScriptBoxSourceFromContext({ record: true }));
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
