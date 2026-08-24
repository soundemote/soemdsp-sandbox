async function bindNodeGraphUiDevSettingsEvents() {
  if (typeof mountNodeUiDevHelperAsUiSettingsPage === "function") {
    mountNodeUiDevHelperAsUiSettingsPage();
  }
  if (typeof syncNodeUserUiSettingsPageChrome === "function") {
    syncNodeUserUiSettingsPageChrome();
  }
  document.getElementById("saveNodeUiDevSettingsButton")?.addEventListener("click", saveNodeUiDevSettingsFile);
  document.getElementById("nodeUserUiSettingsCopy")?.addEventListener("click", copyNodeUiDevSettingsToClipboard);
  document.getElementById("nodeUserUiSettingsPaste")?.addEventListener("click", pasteNodeUiDevSettingsFromClipboard);
  document.getElementById("loadNodeUiDevSettingsButton").addEventListener("click", loadNodeUiDevSettingsFile);
  document
    .getElementById("updateDefaultNodeUiDevSettingsButton")
    .addEventListener("click", handleUpdateDefaultNodeUiDevSettingsPresetClick);
  document.getElementById("nodeUiDevButton")?.addEventListener("click", toggleNodeUiDevHelper);
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
    .getElementById("nodeUiDevTooltipTextSize")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  bindNodeUiDevModuleLightGridControls();
  document
    .getElementById("nodeUiDevMouseLightEnabled")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevDimmerCutoutMouse")
    ?.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  for (const id of [
    "nodeUiDevDimmerMouseSize",
    "nodeUiDevDimmerMouseSoftness",
    "nodeUiDevDimmerMouseShape",
    "nodeUiDevMagnifierBorderThickness",
    "nodeUiDevMagnifierBorderSoftness",
  ]) {
    document.getElementById(id)?.addEventListener("input", syncNodeUiDevSettingsHeaderControls);
    document.getElementById(id)?.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  }
  document
    .getElementById("nodeUiDevShowOriginMarker")
    .addEventListener("change", syncNodeUiDevSettingsHeaderControls);

  document
    .getElementById("nodeUiDevModuleGridInset")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevInletOutletSize")
    ?.addEventListener("input", syncNodeUiDevPortSize);
  document
    .getElementById("nodeUiDevInletOutletSize")
    ?.addEventListener("change", syncNodeUiDevPortSize);
  document
    .getElementById("nodeUiDevInletOutletStrokeThickness")
    ?.addEventListener("input", syncNodeUiDevPortStrokeThickness);
  document
    .getElementById("nodeUiDevInletOutletStrokeThickness")
    ?.addEventListener("change", syncNodeUiDevPortStrokeThickness);
  document
    .getElementById("nodeUiDevInletOutletGap")
    ?.addEventListener("input", syncNodeUiDevInletOutletGap);
  document
    .getElementById("nodeUiDevInletOutletGap")
    ?.addEventListener("change", syncNodeUiDevInletOutletGap);
  document
    .getElementById("nodeUiDevIoSectionPaddingTop")
    ?.addEventListener("input", syncNodeUiDevIoSectionPadding);
  document
    .getElementById("nodeUiDevIoSectionPaddingTop")
    ?.addEventListener("change", syncNodeUiDevIoSectionPadding);
  document
    .getElementById("nodeUiDevIoSectionPaddingBottom")
    ?.addEventListener("input", syncNodeUiDevIoSectionPadding);
  document
    .getElementById("nodeUiDevIoSectionPaddingBottom")
    ?.addEventListener("change", syncNodeUiDevIoSectionPadding);
  document
    .getElementById("nodeUiDevUsedPortBrightness")
    ?.addEventListener("input", syncNodeUiDevPortBrightness);
  document
    .getElementById("nodeUiDevUsedPortBrightness")
    ?.addEventListener("change", syncNodeUiDevPortBrightness);
  document
    .getElementById("nodeUiDevUnusedPortBrightness")
    ?.addEventListener("input", syncNodeUiDevPortBrightness);
  document
    .getElementById("nodeUiDevUnusedPortBrightness")
    ?.addEventListener("change", syncNodeUiDevPortBrightness);
  for (const jackColorId of [
    "nodeUiDevJackRgbRed",
    "nodeUiDevJackRgbGreen",
    "nodeUiDevJackRgbBlue",
    "nodeUiDevJackAnalog",
    "nodeUiDevJackDigital",
  ]) {
    document.getElementById(jackColorId)?.addEventListener("input", syncNodeUiDevJackColors);
    document.getElementById(jackColorId)?.addEventListener("change", syncNodeUiDevJackColors);
  }
  document
    .getElementById("nodeUiDevGridDivisionMultiply")
    ?.addEventListener("input", syncNodeUiDevGridDivisionMultiply);
  document
    .getElementById("nodeUiDevGridDivisionMultiply")
    ?.addEventListener("change", syncNodeUiDevGridDivisionMultiply);
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
    .getElementById("nodeUiDevModuleFillColor")
    ?.addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleFillColor")
    ?.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevModuleFillAlpha")
    ?.addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevTraceWireThickness")
    .addEventListener("input", syncNodeUiDevSettingsHeaderControls);
  document
    .getElementById("nodeUiDevChoiceSlideEmptyBorder")
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
    colorInput?.addEventListener("input", syncNodeUiDevSettingsHeaderControls);
    colorInput?.addEventListener("change", syncNodeUiDevSettingsHeaderControls);
  }
  bindNodeUiDevSliderFillColorControls();
  bindNodeUiDevModuleIdleStroke();
  if (typeof bindNodeUiDevModuleRoundness === "function") {
    bindNodeUiDevModuleRoundness();
  }
  installNodeUiDevExposeControls();
  // Apply saved settings before grouping. Organize/view-mount used to throw
  // and skip apply; unload persist then wrote HTML defaults over the last
  // good localStorage blob.
  await loadNodeUiDevDefaultSettings();
  try {
    renderNodeUiDevHelperViewControls();
    organizeNodeUiDevSections();
  } catch (error) {
    console.error("[soemdsp] UIDEV panel organize failed after settings load", error);
  }
  installNodeSettingsHeaderTextFitObserver();
  installNodeLiveToggleTextFitObserver();
  if (typeof installNodeModularToolbarTextFitObserver === "function") {
    installNodeModularToolbarTextFitObserver();
  }
  if (typeof installNodeGraphModuleTitleTextFitObserver === "function") {
    installNodeGraphModuleTitleTextFitObserver();
  }
  syncNodeUiDevSettingsHeaderControls();
  if (typeof syncNodeUserUiSettingsViewControls === "function") {
    syncNodeUserUiSettingsViewControls();
  }
  // Same modifier drag/wheel/arrows as Display Settings + module face sliders.
  if (typeof bindNodeGraphNativeSliderModifiersIn === "function") {
    bindNodeGraphNativeSliderModifiersIn(document.getElementById("nodeUiDevHelper"));
  }
  // Move/up/resize: nodeGraphFloatingWindowRegistryPointerBridge (floating-windows.js)
  if (typeof installNodeGraphFloatingWindowResizeHandles === "function") {
    installNodeGraphFloatingWindowResizeHandles();
  }
  if (typeof bindNodeGraphFloatingWindowResizeHandle === "function") {
    bindNodeGraphFloatingWindowResizeHandle("uiSettings");
    bindNodeGraphFloatingWindowResizeHandle("uiDev");
  }
}
