function nodeGraphRenderedSampleDownloadName() {
  const info = typeof normalizeNodeGraphPatchInfo === "function"
    ? normalizeNodeGraphPatchInfo(nodeGraphMvp?.patch?.info)
    : {};
  const base = String(info?.name || "rendered-sample")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "rendered-sample";
  return `${base}.wav`;
}

function downloadNodeGraphRenderedSample() {
  if (!nodeGraphMvp?.rendered?.samples?.length) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Render a sample first.");
    }
    return false;
  }
  if (typeof renderedNodeGraphWavBlob !== "function") {
    return false;
  }
  const blob = renderedNodeGraphWavBlob(nodeGraphMvp.rendered);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = nodeGraphRenderedSampleDownloadName();
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

function nodeGraphBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function spawnNodeGraphSamplePlayerFromRendered(clientX, clientY) {
  if (!nodeGraphMvp?.rendered?.samples?.length || typeof renderedNodeGraphWavBlob !== "function") {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Render a sample first.");
    }
    return "";
  }
  const blob = renderedNodeGraphWavBlob(nodeGraphMvp.rendered);
  const dataUrl = await nodeGraphBlobToDataUrl(blob);
  const sampleId = normalizeNodeGraphSampleId(`rendered-${Date.now()}`);
  const name = nodeGraphRenderedSampleDownloadName().replace(/\.wav$/i, "");
  const reference = typeof normalizeNodeGraphSampleReference === "function"
    ? normalizeNodeGraphSampleReference({
      channels: 2,
      dataUrl,
      frames: nodeGraphMvp.rendered.frames,
      id: sampleId,
      name,
      sampleRate: nodeGraphMvp.rendered.sampleRate || nodeGraphMvp.sampleRate,
    })
    : { dataUrl, id: sampleId, name };
  if (typeof decodeNodeGraphSampleDataUrl === "function") {
    try {
      const decoded = await decodeNodeGraphSampleDataUrl(dataUrl, name);
      if (decoded && nodeGraphMvp.sampleBuffers instanceof Map) {
        nodeGraphMvp.sampleBuffers.set(sampleId, decoded);
      }
    } catch (_error) {
      /* live decode can catch up later */
    }
  }
  const point = typeof nodeGraphClientPoint === "function"
    ? nodeGraphClientPoint({ clientX, clientY })
    : null;
  const nodeId = typeof showNodeGraphModule === "function"
    ? showNodeGraphModule("samplePlayer", point, { status: "sample player added" })
    : "";
  if (!nodeId) {
    return "";
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const samples = new Map(
    (typeof normalizeNodeGraphPatchSamples === "function"
      ? normalizeNodeGraphPatchSamples(patch.samples)
      : []).map((entry) => [entry.id, entry]),
  );
  samples.set(sampleId, reference);
  patch.samples = [...samples.values()];
  const node = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (node) {
    node.sample = { id: sampleId };
    node.params = { ...(node.params || {}), sample: String(patch.samples.length) };
  }
  commitNodeGraphPatch(patch, { status: "sample player loaded" });
  if (typeof setNodeGraphNodeSelection === "function") {
    setNodeGraphNodeSelection([nodeId]);
  }
  return nodeId;
}

function bindNodeGraphRenderedSampleDownloadDrag() {
  const button = document.getElementById("nodeDownloadSampleButton");
  if (!button) {
    return;
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    downloadNodeGraphRenderedSample();
  });
  button.addEventListener("dragstart", (event) => {
    if (!nodeGraphMvp?.rendered?.samples?.length) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-soemdsp-rendered-sample", "1");
    event.dataTransfer.setData("text/plain", nodeGraphRenderedSampleDownloadName());
    const ghost = document.createElement("div");
    ghost.className = "node-sample-drag-ghost";
    ghost.textContent = "You are dragging around the sample";
    document.body.append(ghost);
    event.dataTransfer.setDragImage(ghost, 16, 16);
    window.setTimeout(() => ghost.remove(), 0);
    button.dataset.draggingSample = "true";
  });
  button.addEventListener("dragend", () => {
    delete button.dataset.draggingSample;
  });
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace || workspace.dataset.renderedSampleDropBound === "true") {
    return;
  }
  workspace.dataset.renderedSampleDropBound = "true";
  workspace.addEventListener("dragover", (event) => {
    if (![...event.dataTransfer.types].includes("application/x-soemdsp-rendered-sample")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  workspace.addEventListener("drop", (event) => {
    if (![...event.dataTransfer.types].includes("application/x-soemdsp-rendered-sample")) {
      return;
    }
    event.preventDefault();
    spawnNodeGraphSamplePlayerFromRendered(event.clientX, event.clientY);
  });
}

function bindNodeGraphRenderLiveControlEvents() {
  document.getElementById("nodeRenderButton")?.addEventListener("click", renderNodeGraphAudio);
  // Transport clicks (boot-defer may miss window "load").
  if (typeof bindNodeGraphTransportButtons === "function") {
    bindNodeGraphTransportButtons();
  }
  bindNodeGraphRenderedSampleDownloadDrag();
  // Debug-only copy/export/mock controls — optional in release (stubs or omitted).
  if (typeof copyNodeGraphRuntimeSketch === "function") {
    document.getElementById("nodeCopyRuntimeSketchButton")?.addEventListener("click", copyNodeGraphRuntimeSketch);
  }
  if (typeof copyNodeGraphExecutionJson === "function") {
    document.getElementById("nodeCopyExecutionJsonButton")?.addEventListener("click", copyNodeGraphExecutionJson);
  }
  if (typeof downloadNodeGraphLivePlanJson === "function") {
    document.getElementById("nodeExportLivePlanButton")?.addEventListener("click", downloadNodeGraphLivePlanJson);
  }
  document.getElementById("nodeBadValueMonitorButton")?.addEventListener("click", toggleNodeGraphBadValueMonitor);
  document.getElementById("nodeTripEarProtectionButton")
    ?.addEventListener("click", () => nodeGraphTripEarProtection({ source: "manual", protectionMuteCount: 1 }));
  document.getElementById("nodeLiveInputButton")?.addEventListener("click", toggleNodeGraphLiveInput);
  if (typeof startNodeGraphMockInputDebug === "function") {
    document
      .getElementById("nodeStartMockInputDebugButton")
      ?.addEventListener("click", () => startNodeGraphMockInputDebug());
  }
  if (typeof stopNodeGraphMockInputDebug === "function") {
    document
      .getElementById("nodeStopMockInputDebugButton")
      ?.addEventListener("click", stopNodeGraphMockInputDebug);
  }
  document
    .getElementById("nodeLiveInputDeviceSelect")
    ?.addEventListener("change", handleNodeGraphLiveInputDeviceChange);
  document.getElementById("nodeLiveOutputButton")?.addEventListener("click", toggleNodeGraphLiveOutput);
  document.getElementById("nodeLiveMidiButton")?.addEventListener("click", () => {
    toggleNodeGraphMidiInput();
  });
  renderNodeGraphMidiToggleButton();
  renderNodeGraphBadValueMonitorEvidence();
}
