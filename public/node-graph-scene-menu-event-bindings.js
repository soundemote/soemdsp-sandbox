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
  bindNodeGraphSceneElementEvent("nodeModuleShopView", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "moduleBrowser"));
  bindNodeGraphSceneElementEvent("nodeModuleShopHeading", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "moduleBrowser"));
  bindNodeGraphSceneElementEvent("nodeModuleShopResizeHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "moduleBrowser"));
  bindNodeGraphSceneElementEvent("nodeModuleDepartmentSearch", "input", handleNodeGraphModuleDepartmentSearchInput);
  bindNodeGraphSceneElementEvent("nodeModuleDepartmentSearch", "keydown", handleNodeGraphModuleDepartmentSearchKeydown);
  bindNodeGraphSceneElementEvent("nodeCommandCenterModuleSearchInput", "input", handleNodeGraphCommandCenterModuleSearchInput);
  bindNodeGraphSceneElementEvent("nodeCommandCenterModuleSearchInput", "keydown", handleNodeGraphCommandCenterModuleSearchKeydown);
  bindNodeGraphSceneElementEvent("nodeCommandCenterModuleSearchResults", "click", handleNodeGraphModuleStoreClick);
  bindNodeGraphSceneElementEvent("nodeCommandCenterModuleSearchResults", "pointerdown", beginNodeGraphModuleStorePointerPlacement);
  bindNodeGraphSceneElementEvent("nodeModuleDepartmentBack", "click", () => setNodeGraphModuleStoreDepartment(""));
  // Module shop / module actions / code box / command center drag+resize:
  // registry pointer bridge (node-graph-floating-windows.js)
  document.addEventListener("pointerup", releaseNodeGraphModuleStorePointerPlacement);
  document.addEventListener("pointercancel", cancelNodeGraphModuleStorePointerPlacement);
  bindNodeGraphSceneElementEvent("nodeGraphWorkspace", "pointerdown", beginNodeGraphGraphNodeDrag, true);
  bindNodeGraphSceneElementEvent("nodeGraphWorkspace", "contextmenu", handleNodeGraphGraphNodeContextMenu, true);
  bindNodeGraphSceneElementEvent("nodeGraphWorkspace", "dblclick", handleNodeGraphGraphNodeDoubleClick, true);
  document.addEventListener("pointermove", dragNodeGraphGraphNode);
  document.addEventListener("pointerup", endNodeGraphGraphNodeDrag);
  document.addEventListener("pointercancel", endNodeGraphGraphNodeDrag);
  bindNodeGraphSceneElementEvent("nodeSceneDeleteModule", "click", deleteNodeGraphSelectionFromContext);
  document
    .querySelectorAll("#nodeSceneWireTypeControl [data-wire-type]")
    .forEach((button) => {
      button.addEventListener("click", () => setSelectedNodeGraphWireType(button.dataset.wireType));
    });
  document.getElementById("nodeSceneWirePixelToggle")?.addEventListener("click", () => {
    const btn = document.getElementById("nodeSceneWirePixelToggle");
    const next = btn?.getAttribute("aria-pressed") !== "true";
    if (typeof setSelectedNodeGraphWirePixel === "function") {
      setSelectedNodeGraphWirePixel(next);
    }
  });
  if (typeof ensureNodeGraphWireCurveControl === "function") {
    ensureNodeGraphWireCurveControl();
  }
  bindNodeGraphSceneElementEvent("nodeSceneWireAttenuate", "click", () => {
    if (typeof attenuateSelectedNodeGraphWires === "function") {
      attenuateSelectedNodeGraphWires();
    }
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
  bindNodeGraphSceneElementEvent("nodeSceneBroomBatch", "click", applyNodeGraphPatchDefaultsFromCurrentSelection);
  bindNodeGraphSceneElementEvent("nodePatchDefaultsClose", "click", () => setNodeGraphPatchDefaultsVisible(false));
  bindNodeGraphSceneElementEvent("nodePatchDefaultsHeading", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "patchDefaults"));
  bindNodeGraphSceneElementEvent("nodePatchDefaultsDragHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "patchDefaults"));
  bindNodeGraphSceneElementEvent("nodePatchDefaultsResizeHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "patchDefaults"));
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularInfiniteView", "click", () => {
    if (typeof setNodeGraphModularWindowedActive === "function") {
      setNodeGraphModularWindowedActive(false);
    }
  });
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularWindowedView", "click", () => {
    if (typeof setNodeGraphModularWindowedActive === "function") {
      setNodeGraphModularWindowedActive(true);
    }
  });
  // Legacy ids (hidden).
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularOnlyView", "click", toggleNodeGraphModularWindowedView);
  bindNodeGraphSceneElementEvent("nodeSceneToggleModularOnlyControls", "click", toggleNodeGraphAppChromeBarsVisibility);
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
  bindNodeGraphSceneElementEvent("nodeModuleActionsWindowHeading", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "moduleActions"));
  bindNodeGraphSceneElementEvent("nodeModuleActionsDragHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "moduleActions"));
  bindNodeGraphSceneElementEvent("nodeModuleActionsResizeHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "moduleActions"));
  bindNodeGraphSceneElementEvent("nodeCodeBoxClose", "click", closeNodeGraphCodeBoxWindow);
  bindNodeGraphSceneElementEvent("nodeCodeBoxWindowHeading", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "codeBox"));
  bindNodeGraphSceneElementEvent("nodeCodeBoxDragHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "codeBox"));
  bindNodeGraphSceneElementEvent("nodeCodeBoxResizeHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "codeBox"));
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
  bindNodeGraphSceneElementEvent("nodeSceneToggleStandaloneMidiKeyboard", "click", toggleNodeGraphStandaloneMidiKeyboard);
  bindNodeGraphSceneElementEvent("nodeSceneOpenUiSettings", "click", () => {
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("uiSettings");
      return;
    }
    setNodeUserUiSettingsVisible(true);
  });
  // Room dimmer: focus the 💡 control (no legacy shader dialog).
  bindNodeGraphSceneElementEvent("nodeSceneOpenPostProcessing", "click", () => {
    document.getElementById("nodeRoomDimmerButton")?.focus?.();
  });
  bindNodeGraphSceneElementEvent("nodeSceneOpenVisibility", "click", () => {
    // Standalone Visibility window (own seat) — never unified seat handoff.
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
  // Module actions drag: registry pointer bridge
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
  bindNodeGraphSceneElementEvent("nodeSceneKnobTextInput", "input", () => setNodeGraphKnobTextFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobTextInput", "change", () => setNodeGraphKnobTextFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobTextInput", "keydown", (event) => event.stopPropagation());
  bindNodeGraphSceneElementEvent("nodeSceneKnobTextInput", "keyup", (event) => event.stopPropagation());
  bindNodeGraphSceneElementEvent("nodeSceneToggleButtons", "click", toggleNodeGraphModuleButtonsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleModuleEnabled", "click", toggleNodeGraphModuleEnabledFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneOpenNativeCode", "click", openNodeGraphNativeModuleCodeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneOpenNativeLib", "click", openNodeGraphNativeModuleLibFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleOscilloscope", "click", toggleNodeGraphModuleOscilloscopeFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleInterfaceControls", "click", toggleNodeGraphModuleInterfaceControlsFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleSliders", "click", toggleNodeGraphModuleSlidersFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleIo", "click", toggleNodeGraphModuleIoFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleHideUnused", "click", toggleNodeGraphModuleHideUnusedFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleCollapsed", "click", toggleNodeGraphModuleCollapsedFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneToggleTitle", "click", toggleNodeGraphModuleTitleFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneImageLoad", "click", loadNodeGraphImageFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneImageSave", "click", saveNodeGraphImageFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneImageRefresh", "click", refreshNodeGraphImageFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceLoad1", "click", () => pickNodeGraphKnobFaceImage("image1"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceClear1", "click", () => clearNodeGraphKnobFaceImage("image1"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotate1", "change", () => setNodeGraphKnobFaceLayerRotateFromContext("image1", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceLoad2", "click", () => pickNodeGraphKnobFaceImage("image2"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceClear2", "click", () => clearNodeGraphKnobFaceImage("image2"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotate2", "change", () => setNodeGraphKnobFaceLayerRotateFromContext("image2", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceLoad3", "click", () => pickNodeGraphKnobFaceImage("image3"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceClear3", "click", () => clearNodeGraphKnobFaceImage("image3"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotate3", "change", () => setNodeGraphKnobFaceLayerRotateFromContext("image3", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceLoad4", "click", () => pickNodeGraphKnobFaceImage("image4"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceClear4", "click", () => clearNodeGraphKnobFaceImage("image4"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotate4", "change", () => setNodeGraphKnobFaceLayerRotateFromContext("image4", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceLoad5", "click", () => pickNodeGraphKnobFaceImage("image5"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceClear5", "click", () => clearNodeGraphKnobFaceImage("image5"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotate5", "change", () => setNodeGraphKnobFaceLayerRotateFromContext("image5", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceLoad6", "click", () => pickNodeGraphKnobFaceImage("image6"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceClear6", "click", () => clearNodeGraphKnobFaceImage("image6"));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotate6", "change", () => setNodeGraphKnobFaceLayerRotateFromContext("image6", { record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotationDegrees", "input", () => setNodeGraphKnobFaceRotationDegreesFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotationDegrees", "change", () => setNodeGraphKnobFaceRotationDegreesFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotationOffset", "input", () => setNodeGraphKnobFaceRotationOffsetFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKnobFaceRotationOffset", "change", () => setNodeGraphKnobFaceRotationOffsetFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneCanvasScript", "click", openNodeGraphCanvasScriptFromContext);
  bindNodeGraphSceneElementEvent("nodeSceneLedColor", "input", () => setNodeGraphLedColorFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneLedColor", "change", () => setNodeGraphLedColorFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadFont", "change", () => setNodeGraphKeypadLayoutFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadTextSize", "input", () => setNodeGraphKeypadLayoutFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadTextSize", "change", () => setNodeGraphKeypadLayoutFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadTextWeight", "input", () => setNodeGraphKeypadLayoutFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadTextWeight", "change", () => setNodeGraphKeypadLayoutFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadButtonColor", "input", () => setNodeGraphKeypadLayoutFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadButtonColor", "change", () => setNodeGraphKeypadLayoutFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadTextColor", "input", () => setNodeGraphKeypadLayoutFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadTextColor", "change", () => setNodeGraphKeypadLayoutFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadButtonWidth", "input", () => setNodeGraphKeypadLayoutFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadButtonWidth", "change", () => setNodeGraphKeypadLayoutFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadButtonHeight", "input", () => setNodeGraphKeypadLayoutFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneKeypadButtonHeight", "change", () => setNodeGraphKeypadLayoutFromContext({ record: true }));
  bindNodeGraphSceneElementEvent("nodeSceneBugButtonGlyph", "input", () => setNodeGraphBugButtonGlyphFromContext());
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxSingleLine", "click", () => setNodeGraphTextBoxModeFromContext("singleLine"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxMultiline", "click", () => setNodeGraphTextBoxModeFromContext("multiline"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxFill", "click", () => setNodeGraphTextBoxModeFromContext("fill"));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "input", () => setNodeGraphTextBoxTextFromContext({ record: false }));
  bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "change", () => setNodeGraphTextBoxTextFromContext({ record: true }));
  if (typeof nodeGraphTextBoxBindFloatingFieldSteals === "function") {
    nodeGraphTextBoxBindFloatingFieldSteals();
  } else {
    bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "keydown", (event) => event.stopPropagation());
    bindNodeGraphSceneElementEvent("nodeSceneTextBoxTextInput", "keyup", (event) => event.stopPropagation());
    bindNodeGraphSceneElementEvent("nodeSceneAliasInput", "keydown", (event) => event.stopPropagation());
    bindNodeGraphSceneElementEvent("nodeSceneAliasInput", "keyup", (event) => event.stopPropagation());
  }
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
  // List owns node edit / select / remove / add ([+] under last row, ✕ per row).
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeList", "click", handleNodeGraphGraphNodeListClick);
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeList", "input", handleNodeGraphGraphNodeListInput);
  bindNodeGraphSceneElementEvent("nodeSceneGraphNodeList", "change", handleNodeGraphGraphNodeListChange);
  bindNodeGraphSceneElementEvent("nodeSceneGraphReset", "click", resetNodeGraphGraphFromContext);
  document
    .querySelectorAll("#nodeSceneGraphPresetControls [data-graph-preset]")
    .forEach((button) => {
      button.addEventListener("click", () => setNodeGraphGraphPresetFromContext(button.dataset.graphPreset));
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
  bindNodeGraphSceneElementEvent("nodeSceneDragHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "commandCenter"));
  bindNodeGraphSceneElementEvent("nodeSceneContextResizeHandle", "pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "commandCenter"));
  document
    .querySelector("#nodeSceneContextMenu .scene-context-heading")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "commandCenter"));
  document
    .querySelector("#nodeSceneContextMenu .scene-context-heading")
    ?.addEventListener("dblclick", (event) => {
      if (typeof undockNodeGraphCommandCenterInPlace === "function" && undockNodeGraphCommandCenterInPlace()) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  if (typeof bindNodeGraphCommandCenterDockSplit === "function") {
    bindNodeGraphCommandCenterDockSplit();
  }
}
