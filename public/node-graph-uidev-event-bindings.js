async function bindNodeGraphUiDevSettingsEvents() {
  document.getElementById("copyNodeUiDevSettingsButton").addEventListener("click", copyNodeUiDevSettingsToClipboard);
  document.getElementById("loadNodeUiDevSettingsButton").addEventListener("click", loadNodeUiDevSettingsFile);
  document.getElementById("saveNodeUiDevSettingsButton").addEventListener("click", saveNodeUiDevSettingsFile);
  document
    .getElementById("updateDefaultNodeUiDevSettingsButton")
    .addEventListener("click", handleUpdateDefaultNodeUiDevSettingsPresetClick);
  document.getElementById("nodeUiDevButton").addEventListener("click", toggleNodeUiDevHelper);
  document.getElementById("nodeUiDevHelperClose").addEventListener("click", () => setNodeUiDevHelperVisible(false));
  document
    .getElementById("nodeUiDevHelperDragHandle")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "uiDev"));
  document
    .getElementById("nodeUiDevHelperHeading")
    ?.addEventListener("pointerdown", (event) => beginNodeGraphRegisteredFloatingWindowDrag(event, "uiDev"));
  if (typeof bindNodeGraphFloatingWindowResizeHandle === "function") {
    bindNodeGraphFloatingWindowResizeHandle("uiDev");
  }
  document
    .getElementById("nodeUiDevSettingsHeaderTextSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevButtonTextSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevLiveToggleTextSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModularHeaderButtonBackground")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevTooltipTextSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevMinimumGridBrightness")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevMouseLightEnabled")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  for (const id of [
    "nodeUiDevDimmerCutoutSlider",
    "nodeUiDevDimmerCutoutModule",
    "nodeUiDevDimmerCutoutTitle",
    "nodeUiDevDimmerCutoutMouse",
  ]) {
    document.getElementById(id)?.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  }
  for (const id of [
    "nodeUiDevDimmerMouseSize",
    "nodeUiDevDimmerMouseSoftness",
    "nodeUiDevDimmerMouseShape",
  ]) {
    document.getElementById(id)?.addEventListener("input", syncNodeUiDevSettingsHeaderControls);
    document.getElementById(id)?.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  }
  document
    .getElementById("nodeUiDevShowOriginMarker")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevScopeBloomEnabled")
    ?.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleLightSpread")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevTextGlowLevel")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleGridInset")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleRoundness")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevGridColor")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevGridColor")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  // Patch grid unit size (px/gu) — lives on the patch, edited in UIDEV.
  const applyPatchGrid = () => {
    if (typeof applyNodeUiDevPatchGridFromFields === "function") {
      applyNodeUiDevPatchGridFromFields({ record: false });
    }
  };
  const commitPatchGrid = () => {
    if (typeof applyNodeUiDevPatchGridFromFields === "function") {
      applyNodeUiDevPatchGridFromFields({ record: true });
    }
  };
  document.getElementById("nodeUiDevPatchGridWidthPx")?.addEventListener("input", applyPatchGrid);
  document.getElementById("nodeUiDevPatchGridWidthPx")?.addEventListener("change", commitPatchGrid);
  document.getElementById("nodeUiDevPatchGridHeightPx")?.addEventListener("input", applyPatchGrid);
  document.getElementById("nodeUiDevPatchGridHeightPx")?.addEventListener("change", commitPatchGrid);
  if (typeof syncNodeUiDevPatchGridFields === "function") {
    syncNodeUiDevPatchGridFields();
  }
  document
    .getElementById("nodeUiDevWorkspaceBackgroundColor")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevWorkspaceBackgroundColor")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleBrowserEntryHeight")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleBrowserEntryPadding")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleBrowserEntryTextSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSettingsHeaderTopRatio")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSettingsHeaderPadding")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleTitleFont")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleTitleFont")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleTitleHeight")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleTitleTextFill")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleIoSectionHeight")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleNodeSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderWidth")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderHeight")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderLabelColor")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderLabelColor")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderValueColor")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderValueColor")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderUnitColor")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderUnitColor")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderFillHoverColor")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderFillHoverColor")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSliderFillHoverAlpha")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevNodeGlowSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevWirePatchPointSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevWireThickness")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevTraceWireThickness")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevChoiceSlideEmptyBorder")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevChoiceDividerHeight")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevChoiceSlideDebugBoxes")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevBypassIconSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevBypassIconGlowSpread")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  for (const colorInputId of [
    "nodeUiDevBypassIconGlowColor",
    "nodeUiDevBypassIconOnColor",
    "nodeUiDevBypassOnBackgroundColor",
    "nodeUiDevBypassOffBackgroundColor",
  ]) {
    const colorInput = document.getElementById(colorInputId);
    colorInput.addEventListener("input", syncNodeUiDevSettingsHeaderControls);
    colorInput.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  }
  document
    .getElementById("nodeUiDevMoveSymbolSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevCloseIconSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevSettingsHeaderHighlights")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  for (const colorInput of document.querySelectorAll("[data-node-color-var]")) {
    colorInput.addEventListener("input", syncNodeUiDevSettingsHeaderControls);
    colorInput.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  }
  bindNodeUiDevSliderFillColorControls();
  installNodeUiDevExposeControls();
  organizeNodeUiDevSections();
  renderNodeUiDevHelperViewControls();
  installNodeSettingsHeaderTextFitObserver();
  installNodeLiveToggleTextFitObserver();
  await loadNodeUiDevDefaultSettings();
  syncNodeUiDevSettingsHeaderControls();
  // Move/up/resize: nodeGraphFloatingWindowRegistryPointerBridge (floating-windows.js)
  if (typeof installNodeGraphFloatingWindowResizeHandles === "function") {
    installNodeGraphFloatingWindowResizeHandles();
  }
  if (typeof bindNodeGraphFloatingWindowResizeHandle === "function") {
    bindNodeGraphFloatingWindowResizeHandle("uiSettings");
    bindNodeGraphFloatingWindowResizeHandle("uiDev");
  }
}
