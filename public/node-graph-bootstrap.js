async function initNodeGraphMvp() {
  setNodeSandboxStartupProgress(10, "loading tooltips");
  installNodeGraphDebugApi();
  configureNodeGraphDefaultPresetButton();
  await loadNodeGraphTooltips();
  setNodeSandboxStartupProgress(25, "binding events");
  await bindNodeGraphMvpEvents();
  setNodeSandboxStartupProgress(42, "loading resources");
  if (typeof loadNodeGraphResourceManifest === "function") {
    await loadNodeGraphResourceManifest();
  }
  setNodeSandboxStartupProgress(58, "loading patch");
  nodeGraphMvp.defaultPatch = await loadNodeGraphDefaultPresetPatch();
  setNodeSandboxStartupProgress(72, "building interface");
  let startupPatch = nodeGraphMvp.workingPatch || nodeGraphMvp.defaultPatch;
  let startupPatchDirtyState = nodeGraphMvp.workingPatch && ["saved", "edited", "untouched"].includes(nodeGraphMvp.patchDirtyState)
    ? nodeGraphMvp.patchDirtyState
    : "untouched";
  try {
    const sharePayload = typeof nodeGraphSharePayloadFromUrl === "function"
      ? nodeGraphSharePayloadFromUrl()
      : null;
    if (sharePayload?.project_data) {
      startupPatch = nodeGraphPatchFromShareProjectData(sharePayload.project_data);
      startupPatchDirtyState = "untouched";
    }
  } catch (error) {
    window.setTimeout(() => {
      if (typeof setNodeGraphScriptStatus === "function") {
        setNodeGraphScriptStatus(`share link failed: ${error?.message || error}`, false);
      }
    }, 0);
  }
  // An embedding page can push a patch (e.g. "soundemote:sandbox-project-data")
  // before this async boot sequence reaches here -- don't clobber it with the
  // internal default/working patch in that case.
  if (!nodeGraphMvp.externalStartupPatchApplied) {
    commitNodeGraphPatch(cloneNodeGraphPatch(startupPatch), {
      autosaveWorkingPatch: false,
      markPending: false,
      patchDirtyState: startupPatchDirtyState,
      record: false,
      status: "script synced",
    });
  }
  resetNodeGraphStartupView();
  recordNodeGraphHistory();
  markNodeGraphRenderPending();
  applyNodeGraphZoom();
  renderNodeGraphGridToggle();
  if (typeof renderNodeGraphGridLightToggle === "function") {
    renderNodeGraphGridLightToggle();
  }
  if (typeof renderNodeGraphWireLengthsToggle === "function") {
    renderNodeGraphWireLengthsToggle();
  }
  if (typeof renderNodeGraphWiresAboveModulesToggle === "function") {
    renderNodeGraphWiresAboveModulesToggle();
  }
  bindNodeGraphMacroControlModuleEvents();
  bindNodeGraphKeyboardControllerModuleEvents();
  bindNodeGraphMetadataPopoverEvents();
  renderNodeGraphMacroControls();
  if (typeof applyNodeGraphMacroControlsFaceSettings === "function") {
    applyNodeGraphMacroControlsFaceSettings();
  } else {
    applyNodeGraphMacroKnobArcThickness();
    applyNodeGraphMacroKnobArcGapBrightness();
    applyNodeGraphMacroKnobSizeScale();
    applyNodeGraphMacroKnobLabelPosition();
    applyNodeGraphMacroKnobValuePosition();
  }
  if (typeof bindNodeGraphMacroControlsDisplayContextMenu === "function") {
    bindNodeGraphMacroControlsDisplayContextMenu();
  }
  renderNodeGraphKeyboardControllerModules();
  renderNodeGraphModuleVisibilityToggles();
  renderNodeGraphPatchTimingControls();
  renderNodeGraphVisibilityMenuButton();
  bindNodeMetadataScriptBeforeUnload();
  scheduleNodeMetadataScriptParserSelfTestStatus();
  renderNodeGraphModuleScopeBrightnessControl();
  renderNodeGraphSnapGridButton();
  // Refresh / cold boot: diagnostics always start hidden (never restored).
  // Same in debug and release builds — UX must not default to developer chrome.
  if (typeof hideNodeGraphDebugChrome === "function") {
    hideNodeGraphDebugChrome();
  } else {
    nodeGraphMvp.keyboardDebugInfoVisible = false;
    renderNodeGraphKeyboardDebugToggle();
  }
  renderNodeGraphSliderVisibilityToggles();
  renderNodeGraphSliderLayout();
  ensureNodeGraphStartupModulesVisible();
  if (typeof applyNodeGraphWorkspaceWindowStates === "function") {
    applyNodeGraphWorkspaceWindowStates();
  }
  renderNodeGraphStandaloneMidiKeyboardToggle();
  if (typeof applyNodeGraphTooltipEmbed === "function") {
    applyNodeGraphTooltipEmbed();
  }
  renderNodeGraphTooltipWindowToggle();
  if (typeof ensureNodeGraphWorkspaceWireLayoutObserver === "function") {
    ensureNodeGraphWorkspaceWireLayoutObserver();
  }
  loadNodeMetadataKindTemplates();
  refreshNodeGraphLiveInputDevices();
  refreshNodeGraphLiveMicrophonePermissionState();
  navigator.mediaDevices?.addEventListener?.("devicechange", refreshNodeGraphLiveInputDevices);
}

function clearNodeGraphStartupPatchRecoveryStorage() {
  try {
    window.localStorage?.removeItem?.(nodeGraphDefaultPresetStorageKey);
  } catch {}
}

function ensureNodeGraphStartupModulesVisible() {
  const container = document.getElementById("nodeGraphNodes");
  if (!container || container.querySelector(".dsp-node")) {
    return;
  }
  // If we already have a working patch with nodes but the DOM is empty, re-apply
  // that patch — never replace with the default (and never autosave over it).
  const working = nodeGraphMvp?.workingPatch;
  const workingHasNodes = Array.isArray(working?.nodes) && working.nodes.length > 0;
  const liveHasNodes = Array.isArray(nodeGraphMvp?.patch?.nodes) && nodeGraphMvp.patch.nodes.length > 0;
  if (workingHasNodes || liveHasNodes) {
    const source = workingHasNodes ? working : nodeGraphMvp.patch;
    console.warn(
      "[soemdsp] Startup: module DOM empty but patch has nodes — re-applying patch (not default).",
      source.nodes.length,
    );
    commitNodeGraphPatch(cloneNodeGraphPatch(source), {
      autosaveWorkingPatch: false,
      markPending: false,
      record: false,
      status: "startup patch reapplied",
    });
    return;
  }
  clearNodeGraphStartupPatchRecoveryStorage();
  // Default only when there truly is no patch — never write that back as the
  // working-patch autosave (would lock the user into the default on refresh).
  commitNodeGraphPatch(cloneNodeGraphPatch(nodeGraphDefaultPatch), {
    autosaveWorkingPatch: false,
    markPending: false,
    record: false,
    status: "startup default restored",
  });
}
