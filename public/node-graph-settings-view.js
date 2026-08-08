function renderNodeGraphVisualSettings() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  const visual = normalizeNodeGraphPatchVisual(nodeGraphMvp.patch.visual);
  const uiBackground = document.getElementById("nodeUiDevWorkspaceBackgroundColor")?.value;
  workspace.style.setProperty(
    "--node-workspace-bg",
    uiBackground ? normalizeNodeUiDevColor(uiBackground, nodeGraphWorkspaceBackgroundCss(visual.background)) : nodeGraphWorkspaceBackgroundCss(visual.background),
  );
}

function syncNodeGraphSettingsView() {
  const info = normalizeNodeGraphPatchInfo(nodeGraphMvp.patch.info);
  setNodeGraphSettingsField("nodePatchNameHeader", info.name);
  setNodeGraphSettingsField("nodePatchTagsHeader", info.tags);
  if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
    syncNodeGraphCurrentSavedPatchHeader();
  }
  setNodeGraphSettingsField("patchNameValue", info.name);
  setNodeGraphSettingsField("patchAuthorValue", info.author);
  setNodeGraphSettingsField("patchTagsValue", info.tags);
  setNodeGraphSettingsField("patchDescriptionValue", info.description);
  const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);
  setNodeGraphSettingsField("patchCurrentSampleRateValue", nodeGraphFormatSampleRate(audio.currentSampleRate));
  setNodeGraphSettingsField("patchOversamplingValue", nodeGraphOversamplingPresetForRatio(audio.oversamplingRatio));
  setNodeGraphSettingsField("patchTargetSampleRateValue", audio.targetSampleRate);
  setNodeGraphSettingsField("patchResultingSampleRateValue", nodeGraphFormatSampleRate(audio.resultingSampleRate));
  setNodeGraphSettingsField("patchResultingOversamplingValue", nodeGraphFormatOversamplingRatio(audio.oversamplingRatio));
  setNodeGraphSettingsField("patchOutputSampleRateValue", nodeGraphFormatSampleRate(audio.outputSampleRate));
  const pitchReference = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  setNodeGraphSettingsField("patchPitchReferenceMidiNoteValue", pitchReference.pitchReferenceMidiNote);
  setNodeGraphSettingsField("patchPitchReferenceHzValue", pitchReference.pitchReferenceHz);
  setNodeGraphSettingsField("patchSpeedLimitHzValue", pitchReference.speedLimitHz);
  const grid = normalizeNodeGraphPatchGrid(nodeGraphMvp.patch.grid);
  setNodeGraphSettingsField("patchGridWidthPxValue", grid.widthPx);
  setNodeGraphSettingsField("patchGridHeightPxValue", grid.heightPx);
  setNodeGraphSettingsField("nodeScriptGridWidthPxValue", grid.widthPx);
  setNodeGraphSettingsField("nodeScriptGridHeightPxValue", grid.heightPx);
  const visual = normalizeNodeGraphPatchVisual(nodeGraphMvp.patch.visual);
  setNodeGraphSettingsField("patchWorkspaceHueValue", visual.background.h);
  setNodeGraphSettingsField("patchWorkspaceSaturationValue", visual.background.s);
  setNodeGraphSettingsField("patchWorkspaceLightnessValue", visual.background.l);
  setNodeGraphSettingsField("patchVisualModeValue", visual.mode);
  setNodeGraphSettingsField("patchVisualScaleValue", visual.scale);
  setNodeGraphSettingsField("patchVisualStyleValue", visual.style);
  setNodeGraphSettingsField("patchVisualThemeValue", visual.theme);
  setNodeGraphSettingsField("patchVisualTrailValue", visual.trail);
}

function readNodeGraphSettingsView() {
  return normalizeNodeGraphPatchInfo({
    author: document.getElementById("patchAuthorValue")?.value,
    description: document.getElementById("patchDescriptionValue")?.value,
    name: document.getElementById("patchNameValue")?.value,
    tags: document.getElementById("patchTagsValue")?.value,
  });
}

function readNodeGraphVisualSettingsView() {
  return normalizeNodeGraphPatchVisual({
    background: {
      h: nodeGraphSyncedFieldValue(["patchWorkspaceHueValue"]),
      s: nodeGraphSyncedFieldValue(["patchWorkspaceSaturationValue"]),
      l: nodeGraphSyncedFieldValue(["patchWorkspaceLightnessValue"]),
    },
    mode: document.getElementById("patchVisualModeValue")?.value,
    scale: document.getElementById("patchVisualScaleValue")?.value,
    style: document.getElementById("patchVisualStyleValue")?.value,
    theme: document.getElementById("patchVisualThemeValue")?.value,
    trail: document.getElementById("patchVisualTrailValue")?.value,
  });
}

function readNodeGraphAudioSettingsView() {
  const pitchReferenceMidiNote = document.getElementById("patchPitchReferenceMidiNoteValue")?.value;
  const pitchReferenceHz = document.getElementById("patchPitchReferenceHzValue")?.value;
  const speedLimitHz = document.getElementById("patchSpeedLimitHzValue")?.value;
  const oversampling = document.getElementById("patchOversamplingValue")?.value;
  if (nodeGraphOversamplingPresets.map(String).includes(oversampling)) {
    return normalizeNodeGraphPatchAudio({
      targetSampleRate: nodeGraphTargetSampleRateForOversampling(Number(oversampling)),
      pitchReferenceMidiNote,
      pitchReferenceHz,
      speedLimitHz,
    });
  }
  return normalizeNodeGraphPatchAudio({
    targetSampleRate: document.getElementById("patchTargetSampleRateValue")?.value,
    pitchReferenceMidiNote,
    pitchReferenceHz,
    speedLimitHz,
  });
}

function readNodeGraphGridSettingsView() {
  return normalizeNodeGraphPatchGrid({
    heightPx: nodeGraphSyncedFieldValue(["patchGridHeightPxValue", "nodeScriptGridHeightPxValue"]),
    widthPx: nodeGraphSyncedFieldValue(["patchGridWidthPxValue", "nodeScriptGridWidthPxValue"]),
  });
}

function handleNodeGraphSettingsInput(event) {
  if (event?.currentTarget?.hasAttribute?.("data-patch-info-field") && typeof setNodeGraphCurrentSavedPatch === "function") {
    setNodeGraphCurrentSavedPatch("");
  }
  if (event?.currentTarget?.id === "patchTargetSampleRateValue") {
    setNodeGraphSettingsField("patchOversamplingValue", "custom");
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.audio = readNodeGraphAudioSettingsView();
  patch.grid = readNodeGraphGridSettingsView();
  patch.info = readNodeGraphSettingsView();
  patch.visual = readNodeGraphVisualSettingsView();
  commitNodeGraphPatch(patch, {
    markPending: false,
    record: false,
    status: "settings synced",
  });
  drawNodeRenderedVisualOutput();
}

function commitNodeGraphSettingsHistory() {
  recordNodeGraphHistory();
  const scriptStatus = nodeGraphPatchScriptStatus("settings saved", true);
  syncNodeGraphScriptView(scriptStatus.message, scriptStatus.ok);
}

function handleNodeGraphHeaderInfoInput(event) {
  const field = event.currentTarget?.dataset?.patchHeaderInfoField;
  if (!["name", "tags"].includes(field)) {
    return;
  }
  if (typeof setNodeGraphCurrentSavedPatch === "function") {
    setNodeGraphCurrentSavedPatch("");
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.info = normalizeNodeGraphPatchInfo({
    ...patch.info,
    [field]: event.currentTarget.value,
  });
  commitNodeGraphPatch(patch, {
    markPending: false,
    record: false,
    status: "settings synced",
  });
}
