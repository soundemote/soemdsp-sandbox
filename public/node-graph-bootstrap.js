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
  bindNodeGraphMacroControlModuleEvents();
  bindNodeGraphKeyboardControllerModuleEvents();
  bindNodeGraphMetadataPopoverEvents();
  renderNodeGraphMacroControls();
  renderNodeGraphKeyboardControllerModules();
  renderNodeGraphModuleVisibilityToggles();
  renderNodeGraphPatchTimingControls();
  renderNodeGraphVisibilityMenuButton();
  bindNodeMetadataScriptBeforeUnload();
  scheduleNodeMetadataScriptParserSelfTestStatus();
  renderNodeGraphModuleScopeBrightnessControl();
  renderNodeGraphSnapGridButton();
  renderNodeGraphKeyboardDebugToggle();
  renderNodeGraphSliderVisibilityToggles();
  renderNodeGraphSliderLayout();
  ensureNodeGraphStartupModulesVisible();
  if (typeof applyNodeGraphWorkspaceWindowStates === "function") {
    applyNodeGraphWorkspaceWindowStates();
  }
  renderNodeGraphStandaloneMidiKeyboardToggle();
  renderNodeGraphTooltipWindowToggle();
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
  clearNodeGraphStartupPatchRecoveryStorage();
  commitNodeGraphPatch(cloneNodeGraphPatch(nodeGraphDefaultPatch), {
    markPending: false,
    record: false,
    status: "startup default restored",
  });
}
