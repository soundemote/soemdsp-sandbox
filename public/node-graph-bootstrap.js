async function initNodeGraphMvp() {
  setNodeSandboxStartupProgress(10, "loading tooltips");
  if (typeof installNodeGraphDebugApi === "function") {
    installNodeGraphDebugApi();
  }
  configureNodeGraphDefaultPresetButton();
  await loadNodeGraphTooltips();
  setNodeSandboxStartupProgress(25, "binding events");
  await bindNodeGraphMvpEvents();
  setNodeSandboxStartupProgress(42, "loading resources");
  if (typeof loadNodeGraphResourceManifest === "function") {
    await loadNodeGraphResourceManifest();
  }
  setNodeSandboxStartupProgress(58, "loading patch");
  // Factory default is always patches/init.json. Working/autosaved session
  // patch wins only when present and usable.
  nodeGraphMvp.defaultPatch = await loadNodeGraphDefaultPresetPatch();
  setNodeSandboxStartupProgress(72, "building interface");
  const workingStartup = nodeGraphMvp.workingPatch;
  const workingUsable = typeof nodeGraphWorkingPatchShouldRestore === "function"
    ? nodeGraphWorkingPatchShouldRestore(workingStartup)
    : Boolean(workingStartup && Array.isArray(workingStartup.nodes) && workingStartup.nodes.length > 0);
  let startupPatch = workingUsable ? workingStartup : nodeGraphMvp.defaultPatch;
  let startupPatchDirtyState = workingUsable && ["saved", "edited", "untouched"].includes(nodeGraphMvp.patchDirtyState)
    ? nodeGraphMvp.patchDirtyState
    : "untouched";
  if (!workingUsable) {
    nodeGraphMvp.workingPatch = null;
  }
  // URL ?pagePatch=slug loads /soemdsp-sandbox/patches/{slug}.json and wins
  // over workingPatch so page routes never stick on a stale session graph.
  const pagePatchSlug = String(
    new URLSearchParams(window.location.search).get("pagePatch") || "",
  ).trim().toLowerCase();
  let pagePatchLoaded = false;
  if (pagePatchSlug) {
    try {
      const pagePatchUrls = [
        `/soemdsp-sandbox/patches/${encodeURIComponent(pagePatchSlug)}.json`,
        `./patches/${encodeURIComponent(pagePatchSlug)}.json`,
      ];
      let loaded = null;
      for (const url of pagePatchUrls) {
        const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        loaded = typeof nodeGraphPatchFromShareProjectData === "function"
          ? nodeGraphPatchFromShareProjectData(
            data?.kind === "sandbox_patch"
              ? data
              : {
                kind: "sandbox_patch",
                version: 1,
                title: pagePatchSlug,
                bank_name: "soundemote",
                patch_data: data,
              },
          )
          : (data?.patch_data || data);
        break;
      }
      if (loaded) {
        startupPatch = loaded;
        startupPatchDirtyState = "untouched";
        pagePatchLoaded = true;
        nodeGraphMvp.externalStartupPatchApplied = true;
        nodeGraphMvp.workingPatch = null;
      } else if (typeof setNodeGraphScriptStatus === "function") {
        setNodeGraphScriptStatus(`page patch missing: ${pagePatchSlug}`, false);
      }
    } catch (error) {
      if (typeof setNodeGraphScriptStatus === "function") {
        setNodeGraphScriptStatus(`page patch failed: ${error?.message || error}`, false);
      }
    }
  }
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
  if (pagePatchLoaded) {
    commitNodeGraphPatch(cloneNodeGraphPatch(startupPatch), {
      autosaveWorkingPatch: false,
      markPending: false,
      patchDirtyState: "untouched",
      record: false,
      status: `page /${pagePatchSlug} loaded`,
    });
  } else if (!nodeGraphMvp.externalStartupPatchApplied) {
    commitNodeGraphPatch(cloneNodeGraphPatch(startupPatch), {
      autosaveWorkingPatch: false,
      markPending: false,
      patchDirtyState: startupPatchDirtyState,
      record: false,
      status: "script synced",
    });
  }
  resetNodeGraphStartupView();
  // Page-patch embeds often restore a stale pan from session storage; force
  // fit-to-patch after the page graph is committed so / and /init are not a
  // black empty viewport.
  if (pagePatchLoaded && typeof nodeGraphExternalAutoFrameAfterLoad === "function") {
    nodeGraphExternalAutoFrameAfterLoad({ force: true });
  } else if (pagePatchLoaded && typeof window.nodeGraphAutoFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.nodeGraphAutoFrame({ force: true });
      });
    });
  }
  recordNodeGraphHistory();
  markNodeGraphRenderPending();
  applyNodeGraphZoom({ immediate: true, persist: false });
  if (typeof clearNodeGraphViewportGestureClass === "function") {
    clearNodeGraphViewportGestureClass();
  }
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
  if (typeof renderNodeGraphKeyboardDebugToggle === "function") {
    renderNodeGraphKeyboardDebugToggle();
  }
  if (typeof renderNodeGraphConstraintGuide === "function") {
    renderNodeGraphConstraintGuide();
  }
  if (typeof applyNodeGraphConstraintToggles === "function") {
    applyNodeGraphConstraintToggles(nodeGraphMvp?.constraintToggles, { persist: false });
  }
  renderNodeGraphSliderVisibilityToggles();
  renderNodeGraphSliderLayout();
  ensureNodeGraphStartupModulesVisible();
  if (typeof applyNodeGraphSessionSelection === "function") {
    applyNodeGraphSessionSelection();
  }
  if (typeof applyNodeGraphWorkspaceWindowStates === "function") {
    applyNodeGraphWorkspaceWindowStates();
  }
  renderNodeGraphStandaloneMidiKeyboardToggle();
  if (typeof applyNodeGraphTooltipEmbed === "function") {
    applyNodeGraphTooltipEmbed({
      shown: nodeGraphMvp.tooltipEmbedded !== false,
      persist: false,
    });
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
  // Prefer in-memory Init (from patches/init.json). Hardcoded patch is last resort.
  const recoveryPatch = nodeGraphMvp?.defaultPatch || nodeGraphDefaultPatch;
  commitNodeGraphPatch(cloneNodeGraphPatch(recoveryPatch), {
    autosaveWorkingPatch: false,
    markPending: false,
    record: false,
    status: "startup default restored",
  });
}
