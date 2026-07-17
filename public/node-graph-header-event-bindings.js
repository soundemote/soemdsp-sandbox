function bindNodeGraphHeaderControlEvents() {
  bindNodeGraphEarProtectionFaultUi();
  bindNodeGraphModuleDiagnosticsFaultUi();
  document
    .getElementById("nodeCheckAllModulesButton")
    ?.addEventListener("click", runNodeGraphModuleSelfTest);
  bindNodeGraphShaderScriptEvents();
  bindNodeGraphCanvasScriptEvents();
  bindNodeGraphCodeScreenEvents();
  renderNodeGraphPatchTimingControls();
  document.getElementById("nodeDeleteButton").addEventListener("click", deleteSelectedNodeGraphItem);
  document.getElementById("nodeUndoButton").addEventListener("click", undoNodeGraphPatch);
  document.getElementById("nodeRedoButton").addEventListener("click", redoNodeGraphPatch);
  document.getElementById("nodeFullUiButton")?.addEventListener("click", () => setNodeGraphViewMode("ui"));
  document.getElementById("nodeVisibilityMenuClose").addEventListener("click", () => setNodeGraphVisibilityMenuOpen(false));
  document
    .querySelector("#nodeVisibilityMenu .node-visibility-menu-heading")
    .addEventListener("pointerdown", beginNodeGraphVisibilityMenuDrag);
  document
    .getElementById("nodeVisibilityMenuResizeHandle")
    .addEventListener("pointerdown", beginNodeGraphVisibilityMenuResize);
  document.addEventListener("pointermove", dragNodeGraphVisibilityMenu);
  document.addEventListener("pointermove", dragNodeGraphVisibilityMenuResize);
  document.addEventListener("pointerup", endNodeGraphVisibilityMenuDrag);
  document.addEventListener("pointerup", endNodeGraphVisibilityMenuResize);
  document.addEventListener("pointercancel", endNodeGraphVisibilityMenuDrag);
  document.addEventListener("pointercancel", endNodeGraphVisibilityMenuResize);
  document.getElementById("nodeVisibilityMenuButton").addEventListener("click", toggleNodeGraphVisibilityMenu);
  document.getElementById("nodeSavedPatchesWindowButton")?.addEventListener("click", toggleNodeGraphSavedPatchesWindow);
  document.getElementById("nodeStandaloneMidiKeyboardButton")?.addEventListener("click", toggleNodeGraphStandaloneMidiKeyboard);
  document.getElementById("nodeStandaloneMidiKeyboardCloseButton")?.addEventListener("click", closeNodeGraphStandaloneMidiKeyboard);
  document
    .getElementById("nodeStandaloneMidiKeyboardDragHandle")
    ?.addEventListener("pointerdown", beginNodeGraphStandaloneMidiKeyboardDrag);
  document
    .getElementById("nodeStandaloneMidiKeyboardHeading")
    ?.addEventListener("pointerdown", beginNodeGraphStandaloneMidiKeyboardDrag);
  document
    .getElementById("nodeStandaloneMidiKeyboardResizeHandle")
    ?.addEventListener("pointerdown", beginNodeGraphStandaloneMidiKeyboardResize);
  document.addEventListener("pointermove", dragNodeGraphStandaloneMidiKeyboard);
  document.addEventListener("pointermove", dragNodeGraphStandaloneMidiKeyboardResize);
  document.addEventListener("pointerup", endNodeGraphStandaloneMidiKeyboardDrag);
  document.addEventListener("pointerup", endNodeGraphStandaloneMidiKeyboardResize);
  document.addEventListener("pointercancel", endNodeGraphStandaloneMidiKeyboardDrag);
  document.addEventListener("pointercancel", endNodeGraphStandaloneMidiKeyboardResize);
  document.getElementById("nodeTooltipWindowCloseButton")?.addEventListener("click", closeNodeGraphTooltipWindow);
  document
    .getElementById("nodeTooltipWindowDragHandle")
    ?.addEventListener("pointerdown", beginNodeGraphTooltipWindowDrag);
  document
    .getElementById("nodeTooltipWindowHeading")
    ?.addEventListener("pointerdown", beginNodeGraphTooltipWindowDrag);
  document
    .getElementById("nodeTooltipWindowResizeHandle")
    ?.addEventListener("pointerdown", beginNodeGraphTooltipWindowResize);
  document.addEventListener("pointermove", dragNodeGraphTooltipWindow);
  document.addEventListener("pointermove", dragNodeGraphTooltipWindowResize);
  document.addEventListener("pointerup", endNodeGraphTooltipWindowDrag);
  document.addEventListener("pointerup", endNodeGraphTooltipWindowResize);
  document.addEventListener("pointercancel", endNodeGraphTooltipWindowDrag);
  document.addEventListener("pointercancel", endNodeGraphTooltipWindowResize);
  document.getElementById("nodeGridToggleButton").addEventListener("click", toggleNodeGraphGridVisibility);
  document.getElementById("nodeVideoViewButton")?.addEventListener("click", toggleNodeGraphVideoView);
  document.getElementById("nodeMappingViewButton")?.addEventListener("click", () => setNodeGraphViewMode("mapping"));
  document.getElementById("nodeModuleButtonsToggleButton").addEventListener("click", toggleNodeGraphModuleButtonsVisibility);
  document.getElementById("nodeOscilloscopeToggleButton").addEventListener("click", toggleNodeGraphOscilloscopeVisibility);
  document.getElementById("nodeModuleInterfaceControlsToggleButton").addEventListener("click", toggleNodeGraphModuleInterfaceControlsVisibility);
  document.getElementById("nodeGlobalScopeCloseMenu").addEventListener("click", closeNodeGlobalScopeMenu);
  document.getElementById("nodeGlobalScopeDragHandle").addEventListener("pointerdown", beginNodeGlobalScopeMenuDrag);
  document
    .querySelector("#nodeGlobalScopeMenu .scene-context-heading")
    .addEventListener("pointerdown", beginNodeGlobalScopeMenuDrag);
  document
    .getElementById("nodeMasterScopeBackgroundColor")
    ?.addEventListener("input", (event) => setNodeGraphModuleScopeBackgroundColor(event.currentTarget.value));
  document
    .getElementById("nodeMasterScopeFps")
    ?.addEventListener("input", handleNodeGraphModuleScopeFramesPerSecondInput);
  document
    .getElementById("nodeMasterScopeFps")
    ?.addEventListener("change", handleNodeGraphModuleScopeFramesPerSecondInput);
  document
    .getElementById("nodeMasterScopeDotCore1Size")
    .addEventListener("input", (event) => setNodeGraphModuleScopeDotCore1Size(event.currentTarget.value));
  document
    .getElementById("nodeMasterScopeDotCore1Size")
    .addEventListener("change", (event) => setNodeGraphModuleScopeDotCore1Size(event.currentTarget.value));
  document
    .getElementById("nodeMasterScopeDotCore1Brightness")
    .addEventListener("input", (event) => setNodeGraphModuleScopeDotCore1Brightness(event.currentTarget.value));
  document
    .getElementById("nodeMasterScopeDotCore1Brightness")
    .addEventListener("change", (event) => setNodeGraphModuleScopeDotCore1Brightness(event.currentTarget.value));
  document
    .getElementById("nodeMasterScopeDotCore1Color")
    .addEventListener("input", (event) => setNodeGraphModuleScopeDotCore1Color(event.currentTarget.value));
  document
    .getElementById("nodeMasterScopeDotCore1Color")
    .addEventListener("change", (event) => setNodeGraphModuleScopeDotCore1Color(event.currentTarget.value));
  document
    .querySelectorAll("input[type='number'][data-global-scope-input]")
    .forEach((input) => {
      input.addEventListener("dblclick", beginNodeGraphScopeNumberEdit);
      input.addEventListener("pointerdown", beginNodeGraphScopeNumberDrag);
      input.addEventListener("lostpointercapture", endNodeGraphScopeNumberDrag);
    });
  document
    .getElementById("nodeMasterScopeLineThickness")
    .addEventListener("input", handleNodeGraphModuleScopeLineThicknessInput);
  document
    .getElementById("nodeMasterScopeLineThickness")
    .addEventListener("change", handleNodeGraphModuleScopeLineThicknessInput);
  document
    .getElementById("nodeMasterScopeDiscontinuitySkipSamples")
    .addEventListener("input", handleNodeGraphModuleScopeDiscontinuitySkipSamplesInput);
  document
    .getElementById("nodeMasterScopeDiscontinuitySkipSamples")
    .addEventListener("change", handleNodeGraphModuleScopeDiscontinuitySkipSamplesInput);
  document
    .getElementById("nodeMasterScopeDotCore1Enabled")
    .addEventListener("click", handleNodeGraphModuleScopeDotCoreToggle);
  document
    .getElementById("nodeSceneScopeTime")
    .addEventListener("change", handleNodeGraphSceneScopeNumericInput);
  document
    .getElementById("nodeSceneScopeTime")
    .addEventListener("keydown", handleNodeGraphSceneScopeNumericKeydown);
  document
    .getElementById("nodeSceneScopeTime")
    .addEventListener("dblclick", beginNodeGraphScopeNumberEdit);
  document
    .getElementById("nodeSceneScopeTime")
    .addEventListener("pointerdown", beginNodeGraphScopeNumberDrag);
  document
    .getElementById("nodeSceneScopeTime")
    .addEventListener("lostpointercapture", endNodeGraphScopeNumberDrag);
  document
    .getElementById("nodeSceneScopeSync")
    .addEventListener("click", handleNodeGraphSceneScopeControlClick);
  document
    .getElementById("nodeSceneScopeOscillatorTraceMode")
    .addEventListener("click", handleNodeGraphSceneScopeControlClick);
  document
    .getElementById("nodeSceneBlinkLightShape")
    .addEventListener("change", handleNodeGraphSceneScopeOptionInput);
  document.getElementById("nodeModuleSlidersToggleButton").addEventListener("click", toggleNodeGraphModuleSlidersVisibility);
  document.getElementById("nodeTooltipToggleButton").addEventListener("click", toggleNodeGraphTooltipVisibility);
  document.getElementById("nodePreviousSavedPatchButton").addEventListener("click", () => loadAdjacentNodeGraphSavedPatch(-1));
  document.getElementById("nodeNextSavedPatchButton").addEventListener("click", () => loadAdjacentNodeGraphSavedPatch(1));
  document.getElementById("nodePatchInitButton").addEventListener("click", confirmAndInitNodeGraphPatchFromDefault);
  document.getElementById("nodePatchSaveButton").addEventListener("click", confirmAndSaveNodeGraphScript);
  document.getElementById("nodePatchShareLinkButton").addEventListener("click", copyNodeGraphShareLinkToClipboard);
  document.getElementById("nodeSavedPatchesWindowHeading").addEventListener("pointerdown", beginNodeGraphSavedPatchesWindowDrag);
  document.getElementById("nodeSavedPatchesDragHandle").addEventListener("pointerdown", beginNodeGraphSavedPatchesWindowDrag);
  document.getElementById("nodeSavedPatchesResizeHandle").addEventListener("pointerdown", beginNodeGraphSavedPatchesWindowResize);
  document.getElementById("nodePatchEditButton").addEventListener("click", () => setNodeGraphViewMode("settings"));
  document.getElementById("nodePatchCopyButton").addEventListener("click", copyNodeGraphScriptToClipboard);
  document.getElementById("nodePatchPasteButton").addEventListener("click", pasteNodeGraphScriptFromClipboard);
  document.addEventListener("pointermove", dragNodeGraphSavedPatchesWindow);
  document.addEventListener("pointerup", endNodeGraphSavedPatchesWindowDrag);
  document.addEventListener("pointercancel", endNodeGraphSavedPatchesWindowDrag);
  document.addEventListener("pointermove", dragNodeGraphSavedPatchesWindowResize);
  document.addEventListener("pointerup", endNodeGraphSavedPatchesWindowResize);
  document.addEventListener("pointercancel", endNodeGraphSavedPatchesWindowResize);
  document.getElementById("nodeSavedPatchesCloseButton").addEventListener("click", () => setNodeGraphSavedPatchesWindowVisible(false));
  document
    .getElementById("nodeUserUiSettingsSaveDefault")
    .addEventListener("click", handleSaveNodeUserUiSettingsDefaultClick);
  document
    .getElementById("nodeUserUiSettingsClearStartup")
    .addEventListener("click", handleClearNodeUserStartupStateClick);
  document.getElementById("nodeUserUiSettingsClose").addEventListener("click", () => setNodeUserUiSettingsVisible(false));
  document
    .getElementById("nodeUserUiSettingsDragHandle")
    .addEventListener("pointerdown", beginNodeUserUiSettingsDrag);
  document
    .getElementById("nodeUserUiSettingsHeading")
    .addEventListener("pointerdown", beginNodeUserUiSettingsDrag);
  document.getElementById("nodeSliderAmountToggleButton").addEventListener("click", toggleNodeGraphSliderAmount);
  document.getElementById("nodeSliderPositionToggleButton").addEventListener("click", toggleNodeGraphSliderPosition);
  document.getElementById("nodeKeyboardDebugToggleButton").addEventListener("click", toggleNodeGraphKeyboardDebugVisibility);
  document
    .getElementById("nodeZoomOutButton")
    .addEventListener("click", (event) => zoomNodeGraphBy(-1, event));
  document
    .getElementById("nodeZoomResetButton")
    .addEventListener("click", handleNodeGraphZoomResetClick);
  document
    .getElementById("nodeZoomResetButton")
    .addEventListener("dblclick", beginNodeGraphZoomInput);
  document
    .getElementById("nodeZoomInButton")
    .addEventListener("click", (event) => zoomNodeGraphBy(1, event));
  document
    .getElementById("nodeSettingsViewButton")
    .addEventListener("click", () => {
      const settingsVisible = !document.getElementById("nodeSettingsView").hidden;
      setNodeGraphViewMode(settingsVisible ? "modular" : "settings");
    });
  document
    .getElementById("nodeSettingsBackButton")
    ?.addEventListener("click", () => setNodeGraphViewMode("modular"));
  document
    .getElementById("nodeUserUiSettingsButton")
    .addEventListener("click", toggleNodeUserUiSettings);
  document
    .getElementById("nodeCodeScreenViewButton")
    .addEventListener("click", () => setNodeGraphViewMode("code"));
  document
    .getElementById("nodeUiViewButton")
    ?.addEventListener("click", () => setNodeGraphViewMode("ui"));
  document
    .getElementById("nodeModuleShopButton")
    ?.addEventListener("click", () => {
      const shopVisible =
        !document.getElementById("nodeModuleShopView").hidden;
      nodeGraphMvp.sceneContextPoint = null;
      if (shopVisible) {
        closeNodeGraphModuleShop();
      } else {
        openNodeGraphModuleShop(null);
      }
    });
  document
    .getElementById("nodeGraphEmptyModuleButton")
    .addEventListener("click", () => openNodeGraphModuleShop(null));
  document
    .getElementById("nodeModularOnlyViewButton")
    .addEventListener("click", () => setNodeGraphViewMode("modular-only"));
  document
    .getElementById("nodeSnapGridViewButton")
    .addEventListener("click", handleNodeGraphSnapGridButtonClick);
  document
    .getElementById("nodeModularOnlyBackButton")
    .addEventListener("click", () => setNodeGraphViewMode("modular"));
  document
    .getElementById("nodeSettingsScriptViewButton")
    .addEventListener("click", () => setNodeGraphViewMode("script"));
  document.getElementById("nodePatchScript").addEventListener("input", handleNodePatchScriptInput);
  document.getElementById("saveNodeGraphScriptEditorButton")?.addEventListener("click", saveNodeGraphScriptEditor);
  document.getElementById("downloadNodeGraphScriptButton").addEventListener("click", saveNodeGraphScript);
  document.getElementById("nodePatchPresetSaveButton").addEventListener("click", saveCurrentNodeGraphPatchPreset);
  document.getElementById("nodePatchPresetLoadButton").addEventListener("click", loadSelectedNodeGraphPatchPreset);
  document.getElementById("nodePatchPresetDeleteButton").addEventListener("click", deleteSelectedNodeGraphPatchPreset);
  document.getElementById("nodePatchPresetSelect").addEventListener("change", handleNodeGraphPatchPresetSelectChange);
  document.getElementById("updateDefaultPresetButton").addEventListener("click", handleUpdateDefaultNodeGraphPresetClick);
  document.getElementById("loadNodeGraphScriptButton").addEventListener("click", loadNodeGraphScript);
  document.getElementById("nodeSettingsSaveScriptButton").addEventListener("click", saveNodeGraphScript);
  renderNodeGraphPatchPresetControls();
}
