// Release-safe no-ops for APIs that live only in debug/evidence scripts.
// sync_soundemote_site.ps1 omits those scripts from the live shell; debug builds
// load the real files after this one and overwrite these globals.
// Keep this file in release (do not add its name to $releaseOmitScriptSubstrings).

function renderNodeGraphExecutionPlanDebug() {}
function renderNodeGraphExecutionOrderBadges() {}
function renderNodeGraphExecutionPlanSummary() {}
function renderNodeGraphExecutionSummarySelection() {}
function toggleDebugSections() {}

function installNodeGraphDebugApi() {}
function stopNodeGraphMockInputDebug() {}
function downloadNodeGraphLivePlanJson() {}
function serializeNodeGraphExecutionPlanDebug() {
  return "{}";
}
function serializeNodeGraphExecutionPlanApiDebug() {
  return {};
}
function nodeGraphLastRenderDebug() {
  return null;
}
function nodeGraphRuntimeBoundaryDebug() {
  return null;
}
function nodeGraphExecutionParameterSnapshot() {
  return [];
}
function nodeGraphSoemdspObjectConcept() {
  return null;
}
function nodeGraphSoemdspRuntimeMapping() {
  return null;
}
function nodeGraphSoemdspRuntimeSketch() {
  return null;
}
function fallbackCopyTextToClipboard() {
  return false;
}
async function copyNodeGraphRuntimeSketch() {}
async function copyNodeGraphExecutionJson() {}
async function startNodeGraphMockInputDebug() {}

function validateConsumerChecklist() {
  return { accepted: true, checks: [] };
}
function renderCheckRows() {}
function renderChecklist() {}
function renderUnavailableChecklist() {}

function renderSource() {}
function renderHandsOnReadiness() {}
function renderUnavailableHandsOnReadiness() {}

function renderProducerProof() {}
function renderUnavailableProducerProof() {}
function renderCircuitChain() {}
function renderUnavailableCircuitChain() {}
function renderSandboxContract() {}
function renderUnavailableSandboxContract() {}
function renderUnavailableBoundaryFlags() {}

function renderPhaseCoverage() {}
function renderUnavailablePhaseCoverage() {}

function renderArtifactCoverage() {}
function renderUnavailableArtifactCoverage() {}
function renderArtifacts() {}
function renderUnavailableArtifacts() {}
function renderArtifactPacketStatus() {}

function setActiveReport() {}
function renderReportControls() {}
function renderActiveReport() {}
async function renderReports() {}
