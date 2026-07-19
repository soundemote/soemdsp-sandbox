function bindNodeGraphRenderLiveControlEvents() {
  document.getElementById("nodeRenderButton").addEventListener("click", renderNodeGraphAudio);
document.getElementById("nodeCopyRuntimeSketchButton").addEventListener("click", copyNodeGraphRuntimeSketch);
  document.getElementById("nodeCopyExecutionJsonButton").addEventListener("click", copyNodeGraphExecutionJson);
  document.getElementById("nodeExportLivePlanButton").addEventListener("click", downloadNodeGraphLivePlanJson);
  document.getElementById("nodeBadValueMonitorButton").addEventListener("click", toggleNodeGraphBadValueMonitor);
  document.getElementById("nodeTripEarProtectionButton")
    .addEventListener("click", () => nodeGraphTripEarProtection({ source: "manual", protectionMuteCount: 1 }));
  document.getElementById("nodeLiveInputButton").addEventListener("click", toggleNodeGraphLiveInput);
  document
    .getElementById("nodeStartMockInputDebugButton")
    .addEventListener("click", () => startNodeGraphMockInputDebug());
  document
    .getElementById("nodeStopMockInputDebugButton")
    .addEventListener("click", stopNodeGraphMockInputDebug);
  document
    .getElementById("nodeLiveInputDeviceSelect")
    .addEventListener("change", handleNodeGraphLiveInputDeviceChange);
  document.getElementById("nodeLiveOutputButton").addEventListener("click", toggleNodeGraphLiveOutput);
  renderNodeGraphBadValueMonitorEvidence();
}
