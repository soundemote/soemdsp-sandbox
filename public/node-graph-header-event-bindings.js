function bindNodeGraphHeaderControlEvents() {
  bindNodeGraphEarProtectionFaultUi();
  const sharePatchButton = document.getElementById("sharePatchCommunityButton");
  if (sharePatchButton) {
    sharePatchButton.removeAttribute("aria-disabled");
    sharePatchButton.setAttribute("aria-disabled", "false");
    sharePatchButton.addEventListener("click", () => {
      if (typeof downloadNodeGraphStaticPagePatch === "function") {
        downloadNodeGraphStaticPagePatch();
      }
    });
  }
  document
    .getElementById("nodeCheckAllModulesButton")
    ?.addEventListener("click", runNodeGraphModuleSelfTest);
  if (typeof bindNodeGraphRoomDimmer === "function") {
    bindNodeGraphRoomDimmer();
  } else if (typeof bindNodeGraphShaderScriptEvents === "function") {
    bindNodeGraphShaderScriptEvents();
  }
  if (typeof bindNodeGraphMagnifierZoomControl === "function") {
    bindNodeGraphMagnifierZoomControl();
  }
  if (typeof bindNodeGraphMagnifierSizeControl === "function") {
    bindNodeGraphMagnifierSizeControl();
  }
  if (typeof bindNodeGraphSnakeMouseSmoothControl === "function") {
    bindNodeGraphSnakeMouseSmoothControl();
  }
  bindNodeGraphCanvasScriptEvents();
  bindNodeGraphCodeScreenEvents();
  renderNodeGraphPatchTimingControls();
  document.getElementById("nodeDeleteButton")?.addEventListener("click", deleteSelectedNodeGraphItem);
  document.getElementById("nodeUndoButton").addEventListener("click", undoNodeGraphPatch);
  document.getElementById("nodeRedoButton").addEventListener("click", redoNodeGraphPatch);
  document.getElementById("nodeFullUiButton")?.addEventListener("click", toggleNodeGraphFullUiView);
  document.getElementById("nodeVisibilityMenuClose")?.addEventListener("click", () => {
    if (typeof closeNodeGraphUnifiedWindowPage === "function") {
      closeNodeGraphUnifiedWindowPage("visibilityMenu");
      return;
    }
    setNodeGraphVisibilityMenuOpen(false);
  });
  document
    .querySelector("#nodeVisibilityMenu .scene-context-heading")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "visibilityMenu"));
  document
    .getElementById("nodeVisibilityMenuResizeHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "visibilityMenu"));
  // Visibility lives on the Command Center 👁️ nav — no top-bar button.
  document.getElementById("nodeHotkeysPageClose")?.addEventListener("click", () => {
    if (typeof closeNodeGraphUnifiedWindowPage === "function") {
      closeNodeGraphUnifiedWindowPage("hotkeys");
      return;
    }
    setNodeGraphHotkeysPageOpen(false);
  });
  document
    .querySelector("#nodeHotkeysPage .scene-context-heading")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "hotkeys"));
  document
    .getElementById("nodeHotkeysPageResizeHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowResize(event, "hotkeys"));
  // Docked tips height: drag strip between tips band and modular workspace.
  const embedResize = document.getElementById("nodeInteractionHelpEmbedResize");
  if (embedResize && typeof beginNodeGraphTooltipEmbedResize === "function") {
    embedResize.addEventListener("pointerdown", beginNodeGraphTooltipEmbedResize);
  }
  // Move/up: registry pointer bridge
  if (typeof closeNodeGraphSampleWaveformSettings === "function") {
    document.getElementById("nodeSampleWaveformSettingsClose")?.addEventListener("click", closeNodeGraphSampleWaveformSettings);
  }
  if (typeof beginNodeGraphSampleWaveformSettingsDrag === "function") {
    document
      .getElementById("nodeSampleWaveformSettingsDragHandle")
      ?.addEventListener("pointerdown", beginNodeGraphSampleWaveformSettingsDrag);
    document
      .getElementById("nodeSampleWaveformSettingsHeading")
      ?.addEventListener("pointerdown", beginNodeGraphSampleWaveformSettingsDrag);
  }
  if (typeof bindNodeGraphSampleWaveformTimeWindowEditing === "function") {
    bindNodeGraphSampleWaveformTimeWindowEditing();
  }
  if (typeof bindNodeGraphSampleWaveformSettingModifiers === "function") {
    bindNodeGraphSampleWaveformSettingModifiers();
  }
  // LED options: Command Center Display Settings only (no standalone window).
  if (typeof dragNodeGraphSampleWaveformSettings === "function") {
    document.addEventListener("pointermove", dragNodeGraphSampleWaveformSettings);
  }
  if (typeof endNodeGraphSampleWaveformSettingsDrag === "function") {
    document.addEventListener("pointerup", endNodeGraphSampleWaveformSettingsDrag);
    document.addEventListener("pointercancel", endNodeGraphSampleWaveformSettingsDrag);
  }
  if (typeof handleNodeGraphSampleWaveformTimeWindowChange === "function") {
    document
      .getElementById("nodeSampleWaveformTimeWindowInput")
      ?.addEventListener("change", handleNodeGraphSampleWaveformTimeWindowChange);
  }
  if (typeof handleNodeGraphSampleWaveformLineWidthChange === "function") {
    document
      .getElementById("nodeSampleWaveformScrollSmoothButton")
      ?.addEventListener("click", () => setNodeGraphSampleWaveformScrollMode("smooth"));
    document
      .getElementById("nodeSampleWaveformScrollSnapButton")
      ?.addEventListener("click", () => setNodeGraphSampleWaveformScrollMode("snap"));
    document
      .getElementById("nodeSampleWaveformPositionLeftButton")
      ?.addEventListener("click", () => setNodeGraphSampleWaveformScrollLinePosition("left"));
    document
      .getElementById("nodeSampleWaveformPositionMidButton")
      ?.addEventListener("click", () => setNodeGraphSampleWaveformScrollLinePosition("mid"));
    document
      .getElementById("nodeSampleWaveformPositionRightButton")
      ?.addEventListener("click", () => setNodeGraphSampleWaveformScrollLinePosition("right"));
    document
      .getElementById("nodeSampleWaveformLineWidthInput")
      ?.addEventListener("change", handleNodeGraphSampleWaveformLineWidthChange);
    document
      .getElementById("nodeSampleWaveformTraceWidthInput")
      ?.addEventListener("change", handleNodeGraphSampleWaveformTraceWidthChange);
    document
      .getElementById("nodeSampleWaveformTraceWidthInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformTraceWidthChange);
    document
      .getElementById("nodeSampleWaveformHueInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformHueChange);
    document
      .getElementById("nodeSampleWaveformLineBrightnessInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformLineBrightnessChange);
    document
      .getElementById("nodeSampleWaveformGridBrightnessInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformGridBrightnessChange);
    document
      .getElementById("nodeSampleWaveformBackgroundHueInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformBackgroundHueChange);
    document
      .getElementById("nodeSampleWaveformBackgroundBrightnessInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformBackgroundBrightnessChange);
    document
      .getElementById("nodeSampleWaveformCornerSquareButton")
      ?.addEventListener("click", () => setNodeGraphSampleWaveformCornerShape("square"));
    document
      .getElementById("nodeSampleWaveformCornerSquircleButton")
      ?.addEventListener("click", () => setNodeGraphSampleWaveformCornerShape("squircle"));
    document
      .getElementById("nodeSampleWaveformCornerRadiusInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformCornerRadiusChange);
    document
      .getElementById("nodeSampleWaveformEdgeSpacingInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformEdgeSpacingChange);
    document
      .getElementById("nodeSampleWaveformLabelInsetInput")
      ?.addEventListener("input", handleNodeGraphSampleWaveformLabelInsetChange);
  }
  document.getElementById("nodeGridToggleButton").addEventListener("click", toggleNodeGraphGridVisibility);
  document.getElementById("nodeGridLightToggleButton")
    ?.addEventListener("click", toggleNodeGraphGridLightVisibility);

  document.getElementById("nodeWireLengthsToggleButton")
    ?.addEventListener("click", toggleNodeGraphWireLengthsVisibility);
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
  document.getElementById("nodeTooltipToggleButton")?.addEventListener("click", toggleNodeGraphTooltipWindow);
  document.getElementById("nodeAppChromeBarsToggleButton")?.addEventListener("click", toggleNodeGraphAppChromeBarsVisibility);
  document
    .getElementById("nodeUserUiSettingsSaveDefault")
    ?.addEventListener("click", handleSaveNodeUserUiSettingsDefaultClick);
  document
    .getElementById("nodeUserUiSettingsClearStartup")
    ?.addEventListener("click", handleClearNodeUserStartupStateClick);
  document
    .getElementById("clearNodeUiDevStartupButton")
    ?.addEventListener("click", handleClearNodeUserStartupStateClick);
  document
    .getElementById("nodeUserUiSettingsPageTab")
    ?.addEventListener("click", () => {
      if (typeof setNodeUserUiSettingsPage === "function") {
        setNodeUserUiSettingsPage("settings");
      }
    });
  document
    .getElementById("nodeUserUiSettingsUiDevTab")
    ?.addEventListener("click", () => {
      if (typeof setNodeUiDevHelperVisible === "function") {
        setNodeUiDevHelperVisible(true);
      } else if (typeof setNodeUserUiSettingsPage === "function") {
        setNodeUserUiSettingsPage("uidev");
      }
    });
  document
    .getElementById("nodeUserUiSettingsOpenUiDev")
    ?.addEventListener("click", () => {
      if (typeof setNodeUiDevHelperVisible === "function") {
        setNodeUiDevHelperVisible(true);
      }
    });
  const uiSettingsClose = document.getElementById("nodeUserUiSettingsClose");
  uiSettingsClose?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  uiSettingsClose?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof closeNodeGraphUnifiedWindowPage === "function") {
      closeNodeGraphUnifiedWindowPage("uiSettings");
    } else if (typeof setNodeUserUiSettingsVisible === "function") {
      setNodeUserUiSettingsVisible(false);
    }
  });
  document
    .getElementById("nodeUserUiSettingsDragHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "uiSettings"));
  document
    .getElementById("nodeUserUiSettingsHeading")
    ?.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.("#nodeUserUiSettingsClose, .panel-close-button")) {
        return;
      }
      beginNodeGraphRegisteredFloatingWindowDrag(event, "uiSettings");
    });
  if (typeof bindNodeGraphFloatingWindowResizeHandle === "function") {
    bindNodeGraphFloatingWindowResizeHandle("uiSettings");
  }
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
    ?.addEventListener("click", () => {
      const button = document.getElementById("nodeCodeScreenViewButton");
      if (button?.disabled || button?.getAttribute("aria-disabled") === "true") {
        return;
      }
      openNodeGraphCodeBoxWindowFromHeader();
    });
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
      if (typeof cycleNodeGraphCommandCenterPresentation === "function") {
        cycleNodeGraphCommandCenterPresentation({
          x: rect.left,
          y: rect.bottom,
        });
      } else if (typeof openNodeGraphUnifiedWindowPage === "function") {
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
  // 💻 — computer / infinite canvas (no crop, no resize widget).
  document
    .getElementById("nodeModularInfiniteViewButton")
    ?.addEventListener("click", () => {
      // 💻 — exit layout canvas if open; stay on infinite modular workspace.
      if (typeof nodeGraphLayoutCanvasClose === "function") {
        nodeGraphLayoutCanvasClose({ silent: true });
      }
      if (typeof setNodeGraphModularWindowedActive === "function") {
        setNodeGraphModularWindowedActive(false);
      }
    });
  // 📱 — same as F: Meta canvas pin when a child is selected, else layout canvas.
  document
    .getElementById("nodeModularWindowedViewButton")
    ?.addEventListener("click", () => {
      if (
        typeof nodeGraphMetamoduleToggleDisplaysForSelection === "function"
        && nodeGraphMetamoduleToggleDisplaysForSelection()
      ) {
        return;
      }
      if (typeof toggleNodeGraphLayoutCanvasView === "function") {
        toggleNodeGraphLayoutCanvasView();
      }
    });
  document
    .getElementById("nodeSnapGridViewButton")
    .addEventListener("click", handleNodeGraphSnapGridButtonClick);
  document
    .getElementById("nodeModularOnlyBackButton")
    ?.addEventListener("click", () => {
      if (typeof nodeGraphLayoutCanvasClose === "function") {
        nodeGraphLayoutCanvasClose({ silent: true });
      }
      if (typeof setNodeGraphViewMode === "function") {
        setNodeGraphViewMode("modular");
      }
    });
  document.getElementById("updateDefaultPresetButton")?.addEventListener("click", handleUpdateDefaultNodeGraphPresetClick);
  document.getElementById("loadNodeGraphScriptButton").addEventListener("click", loadNodeGraphScript);
  // Native save dialog (File System Access API) — same as Ctrl+S.
  document.getElementById("nodeSettingsSaveScriptButton").addEventListener("click", () => {
    if (typeof saveNodeGraphPatchWithNativeDialog === "function") {
      void saveNodeGraphPatchWithNativeDialog();
      return;
    }
    if (typeof saveNodeGraphScript === "function") {
      void saveNodeGraphScript();
    }
  });
  // Copy / Paste patch: toolbar only (not Command Center).
  document.getElementById("nodeToolbarCopyPatchButton")?.addEventListener("click", copyNodeGraphScriptToClipboard);
  document.getElementById("nodeToolbarPastePatchButton")?.addEventListener("click", pasteNodeGraphScriptFromClipboard);
}
