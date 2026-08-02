function bindNodeGraphHeaderControlEvents() {
  bindNodeGraphEarProtectionFaultUi();
  document
    .getElementById("nodeCheckAllModulesButton")
    ?.addEventListener("click", runNodeGraphModuleSelfTest);
  if (typeof bindNodeGraphRoomDimmer === "function") {
    bindNodeGraphRoomDimmer();
  } else if (typeof bindNodeGraphShaderScriptEvents === "function") {
    bindNodeGraphShaderScriptEvents();
  }
  bindNodeGraphCanvasScriptEvents();
  bindNodeGraphCodeScreenEvents();
  renderNodeGraphPatchTimingControls();
  document.getElementById("nodeDeleteButton").addEventListener("click", deleteSelectedNodeGraphItem);
  document.getElementById("nodeUndoButton").addEventListener("click", undoNodeGraphPatch);
  document.getElementById("nodeRedoButton").addEventListener("click", redoNodeGraphPatch);
  document.getElementById("nodeFullUiButton")?.addEventListener("click", toggleNodeGraphFullUiView);
  document.getElementById("nodeVisibilityMenuClose").addEventListener("click", () => setNodeGraphVisibilityMenuOpen(false));
  document
    .querySelector("#nodeVisibilityMenu .scene-context-heading")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "visibilityMenu"));
  document
    .getElementById("nodeVisibilityMenuResizeHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "visibilityMenu"));
  // Move/up: nodeGraphFloatingWindowRegistryPointerBridge (floating-windows.js)
  document.getElementById("nodeVisibilityMenuButton").addEventListener("click", toggleNodeGraphVisibilityMenu);
  document.getElementById("nodeSavedPatchesWindowButton")?.addEventListener("click", toggleNodeGraphSavedPatchesWindow);
  document.getElementById("nodeStandaloneMidiKeyboardButton")?.addEventListener("click", toggleNodeGraphStandaloneMidiKeyboard);
  document.getElementById("nodeStandaloneMidiKeyboardCloseButton")?.addEventListener("click", closeNodeGraphStandaloneMidiKeyboard);
  document
    .getElementById("nodeStandaloneMidiKeyboardDragHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "standaloneMidiKeyboard"));
  document
    .getElementById("nodeStandaloneMidiKeyboardHeading")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "standaloneMidiKeyboard"));
  document
    .getElementById("nodeStandaloneMidiKeyboardResizeHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "standaloneMidiKeyboard"));
  // Move/up: registry pointer bridge
  document.getElementById("nodeTooltipWindowCloseButton")?.addEventListener("click", closeNodeGraphTooltipWindow);
  document
    .getElementById("nodeTooltipWindowDragHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "tooltipWindow"));
  document
    .getElementById("nodeTooltipWindowHeading")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "tooltipWindow"));
  document
    .getElementById("nodeTooltipWindowResizeHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "tooltipWindow"));
  // Move/up: registry pointer bridge
  document.getElementById("nodePhosphorWaveformSettingsClose")?.addEventListener("click", closeNodeGraphPhosphorWaveformSettings);
  document
    .getElementById("nodePhosphorWaveformSettingsDragHandle")
    ?.addEventListener("pointerdown", beginNodeGraphPhosphorWaveformSettingsDrag);
  document
    .getElementById("nodePhosphorWaveformSettingsHeading")
    ?.addEventListener("pointerdown", beginNodeGraphPhosphorWaveformSettingsDrag);
  if (typeof bindNodeGraphPhosphorWaveformTimeWindowEditing === "function") {
    bindNodeGraphPhosphorWaveformTimeWindowEditing();
  }
  if (typeof bindNodeGraphPhosphorWaveformPxFields === "function") {
    bindNodeGraphPhosphorWaveformPxFields();
  }
  if (typeof bindNodeGraphPhosphorWaveformSettingModifiers === "function") {
    bindNodeGraphPhosphorWaveformSettingModifiers();
  }
  // LED options: Command Center Display Settings only (no standalone window).
  document.addEventListener("pointermove", dragNodeGraphPhosphorWaveformSettings);
  document.addEventListener("pointerup", endNodeGraphPhosphorWaveformSettingsDrag);
  document.addEventListener("pointercancel", endNodeGraphPhosphorWaveformSettingsDrag);
  document
    .getElementById("nodePhosphorWaveformTimeWindowInput")
    ?.addEventListener("change", handleNodeGraphPhosphorWaveformTimeWindowChange);
  document
    .getElementById("nodePhosphorWaveformScrollSmoothButton")
    ?.addEventListener("click", () => setNodeGraphPhosphorWaveformScrollMode("smooth"));
  document
    .getElementById("nodePhosphorWaveformScrollSnapButton")
    ?.addEventListener("click", () => setNodeGraphPhosphorWaveformScrollMode("snap"));
  document
    .getElementById("nodePhosphorWaveformPositionLeftButton")
    ?.addEventListener("click", () => setNodeGraphPhosphorWaveformScrollLinePosition("left"));
  document
    .getElementById("nodePhosphorWaveformPositionMidButton")
    ?.addEventListener("click", () => setNodeGraphPhosphorWaveformScrollLinePosition("mid"));
  document
    .getElementById("nodePhosphorWaveformPositionRightButton")
    ?.addEventListener("click", () => setNodeGraphPhosphorWaveformScrollLinePosition("right"));
  document
    .getElementById("nodePhosphorWaveformLineWidthInput")
    ?.addEventListener("change", handleNodeGraphPhosphorWaveformLineWidthChange);
  document
    .getElementById("nodePhosphorWaveformTraceWidthInput")
    ?.addEventListener("change", handleNodeGraphPhosphorWaveformTraceWidthChange);
  document
    .getElementById("nodePhosphorWaveformTraceWidthInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformTraceWidthChange);
  document
    .getElementById("nodePhosphorWaveformHueInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformHueChange);
  document
    .getElementById("nodePhosphorWaveformLineBrightnessInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformLineBrightnessChange);
  document
    .getElementById("nodePhosphorWaveformGridBrightnessInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformGridBrightnessChange);
  document
    .getElementById("nodePhosphorWaveformBackgroundHueInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformBackgroundHueChange);
  document
    .getElementById("nodePhosphorWaveformBackgroundBrightnessInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformBackgroundBrightnessChange);
  document
    .getElementById("nodePhosphorWaveformCornerSquareButton")
    ?.addEventListener("click", () => setNodeGraphPhosphorWaveformCornerShape("square"));
  document
    .getElementById("nodePhosphorWaveformCornerSquircleButton")
    ?.addEventListener("click", () => setNodeGraphPhosphorWaveformCornerShape("squircle"));
  document
    .getElementById("nodePhosphorWaveformCornerRadiusInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformCornerRadiusChange);
  document
    .getElementById("nodePhosphorWaveformEdgeSpacingInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformEdgeSpacingChange);
  document
    .getElementById("nodePhosphorWaveformLabelInsetInput")
    ?.addEventListener("input", handleNodeGraphPhosphorWaveformLabelInsetChange);
  document.getElementById("nodeGridToggleButton").addEventListener("click", toggleNodeGraphGridVisibility);
  document.getElementById("nodeWiresAboveModulesToggleButton")
    ?.addEventListener("click", toggleNodeGraphWiresAboveModules);
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
  document.getElementById("nodeTooltipToggleButton").addEventListener("click", toggleNodeGraphTooltipWindow);
  document.getElementById("nodePreviousSavedPatchButton").addEventListener("click", () => loadAdjacentNodeGraphSavedPatch(-1));
  document.getElementById("nodeNextSavedPatchButton").addEventListener("click", () => loadAdjacentNodeGraphSavedPatch(1));
  document.getElementById("nodePatchInitButton").addEventListener("click", confirmAndInitNodeGraphPatchFromDefault);
  document.getElementById("nodePatchSaveButton").addEventListener("click", confirmAndSaveNodeGraphScript);
  document.getElementById("nodePatchShareLinkButton").addEventListener("click", copyNodeGraphShareLinkToClipboard);
  document.getElementById("nodeSavedPatchesWindowHeading")?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "patchExplorer"));
  document.getElementById("nodeSavedPatchesDragHandle")?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "patchExplorer"));
  document.getElementById("nodeSavedPatchesResizeHandle")?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "patchExplorer"));
  document.getElementById("nodePatchEditButton").addEventListener("click", () => setNodeGraphViewMode("settings"));
  document.getElementById("nodePatchCopyButton").addEventListener("click", copyNodeGraphScriptToClipboard);
  document.getElementById("nodePatchPasteButton").addEventListener("click", pasteNodeGraphScriptFromClipboard);
  // Move/up: registry pointer bridge
  document.getElementById("nodeSavedPatchesCloseButton").addEventListener("click", () => setNodeGraphSavedPatchesWindowVisible(false));
  document
    .getElementById("nodeUserUiSettingsSaveDefault")
    .addEventListener("click", handleSaveNodeUserUiSettingsDefaultClick);
  document
    .getElementById("nodeUserUiSettingsClearStartup")
    .addEventListener("click", handleClearNodeUserStartupStateClick);
  // Shortcut from the user-facing panel to the full UI Dev panel, where every
  // setting lives (including the ones not exposed here).
  document
    .getElementById("nodeUserUiSettingsOpenUiDev")
    ?.addEventListener("click", () => {
      if (typeof setNodeUiDevHelperVisible === "function") {
        setNodeUiDevHelperVisible(true);
      }
    });
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
  document.getElementById("nodeTooltipEmbedToggleButton")?.addEventListener("click", toggleNodeGraphTooltipEmbed);
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
    .addEventListener("click", () => openNodeGraphCodeBoxWindowFromHeader());
  document
    .getElementById("nodeUiViewButton")
    ?.addEventListener("click", () => setNodeGraphViewMode("ui"));
  document
    .getElementById("nodeModuleShopButton")
    ?.addEventListener("click", () => {
      const shopVisible =
        !document.getElementById("nodeModuleShopView")?.hidden;
      nodeGraphMvp.sceneContextPoint = null;
      if (shopVisible) {
        if (typeof closeNodeGraphUnifiedWindowPage === "function") {
          closeNodeGraphUnifiedWindowPage("moduleBrowser");
        } else {
          closeNodeGraphModuleShop();
        }
      } else if (typeof openNodeGraphUnifiedWindowPage === "function") {
        openNodeGraphUnifiedWindowPage("moduleBrowser");
      } else {
        openNodeGraphModuleShop(null);
      }
    });
  document
    .getElementById("nodeCommandCenterButton")
    ?.addEventListener("click", (event) => {
      // Anchor the first-ever spawn under the button rather than at the
      // pointer -- every later open restores the remembered position, same
      // as every other floating window. Unified open closes Modules / etc.
      const rect = event.currentTarget.getBoundingClientRect();
      if (typeof openNodeGraphUnifiedWindowPage === "function") {
        openNodeGraphUnifiedWindowPage("commandCenter", {
          x: rect.left,
          y: rect.bottom,
        });
      } else {
        openNodeGraphCommandCenter(rect.left, rect.bottom);
      }
    });
  document
    .getElementById("nodeGraphEmptyModuleButton")
    .addEventListener("click", () => {
      if (typeof openNodeGraphUnifiedWindowPage === "function") {
        openNodeGraphUnifiedWindowPage("moduleBrowser");
      } else {
        openNodeGraphModuleShop(null);
      }
    });
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
