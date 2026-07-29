// Native/module fault diagnostics: informational failure reporting for
// problems. These faults used to open their own modal. The app now has one
// debug log/error surface, so diagnostics are recorded there instead.

const nodeGraphModuleDiagnosticsSilenceWindowSeconds = 3;

function nodeGraphModuleDiagnosticsState() {
  if (!nodeGraphMvp.moduleDiagnostics) {
    nodeGraphMvp.moduleDiagnostics = {
      faults: [],
      serial: 0,
      silenceTracking: new Map(),
    };
  }
  return nodeGraphMvp.moduleDiagnostics;
}

function nodeGraphModuleDiagnosticsIsTripped() {
  return nodeGraphModuleDiagnosticsState().faults.length > 0;
}

function nodeGraphModuleFaultKey(details = {}) {
  return `${details.kind || "fault"}:${details.moduleName || details.nodeId || details.moduleType || "unknown"}`;
}

function nodeGraphModuleDiagnosticsFaultDetail(details = {}) {
  const label = details.label || nodeGraphNodeLabels?.[details.moduleType] || details.moduleType || details.moduleName || "A module";
  if (details.kind === "native-load") {
    return `${label} failed to load its native engine (${details.status || "unknown status"})${details.message ? `: ${details.message}` : ""}. It may be running a slower fallback, or not running at all.`;
  }
  if (details.kind === "native-exception") {
    return `${label} threw an error while running (${details.message || "no message"}). It has fallen back to its JS implementation, or stopped producing output.`;
  }
  if (details.kind === "silent-node") {
    return `${label} is wired to Output but has produced no valid signal for ${nodeGraphModuleDiagnosticsSilenceWindowSeconds}+ seconds (reason: ${details.reason || "bad values"}). Check its parameters -- if this persists, it may be a genuine bug.`;
  }
  return `${label} reported an unspecified issue.`;
}

function nodeGraphReportModuleDiagnosticsError(fault) {
  if (!fault) {
    return;
  }
  const message = fault.count > 1 ? `${fault.detail} (x${fault.count})` : fault.detail;
  if (globalThis.SE?.ERROR) {
    globalThis.SE.ERROR(message, "module-diagnostics");
    return;
  }
  try {
    console.error("[module-diagnostics]", message);
  } catch (_error) {
    // Diagnostics must never become the thing that breaks the app.
  }
}

function nodeGraphModuleDiagnosticsIsUnderConstruction(details = {}) {
  if (typeof nodeGraphNativeModuleRefIsUnderConstruction === "function") {
    return nodeGraphNativeModuleRefIsUnderConstruction(details);
  }
  if (typeof nodeGraphModuleTypeIsUnderConstruction === "function") {
    const type = String(details.moduleType || details.targetType || "").trim();
    if (type && nodeGraphModuleTypeIsUnderConstruction(type)) {
      return true;
    }
  }
  return false;
}

function nodeGraphRecordModuleFault(details = {}) {
  // Under-construction modules (store UC set) are allowed incomplete engines.
  // Recording them as SE.ERROR just noise-bombs the debug log on every live
  // start — e.g. wall_delay's deliberate "unsupported native module" stub.
  if (nodeGraphModuleDiagnosticsIsUnderConstruction(details)) {
    return false;
  }
  const key = nodeGraphModuleFaultKey(details);
  const state = nodeGraphModuleDiagnosticsState();
  const existing = state.faults.find((fault) => fault.key === key);
  const detail = nodeGraphModuleDiagnosticsFaultDetail(details);
  if (existing) {
    existing.detail = detail;
    existing.count = (existing.count || 1) + 1;
    existing.lastSeen = Date.now();
  } else {
    state.serial += 1;
    state.faults.push({
      count: 1,
      detail,
      firstSeen: Date.now(),
      key,
      kind: details.kind || "fault",
      lastSeen: Date.now(),
      serial: state.serial,
    });
  }
  nodeGraphReportModuleDiagnosticsError(existing || state.faults[state.faults.length - 1]);
  return true;
}

function nodeGraphClearModuleFault(key) {
  const state = nodeGraphModuleDiagnosticsState();
  const index = state.faults.findIndex((fault) => fault.key === key);
  if (index === -1) {
    return false;
  }
  state.faults.splice(index, 1);
  return true;
}

function nodeGraphResetModuleDiagnosticsFault() {
  const state = nodeGraphModuleDiagnosticsState();
  state.faults = [];
}

// Native WASM load failure or in-flight exception, reported via the
// worklet's existing "nativeModuleStatus" postMessage (status !== "ready").
function nodeGraphRecordNativeModuleFault(message = {}) {
  const status = String(message.status || "");
  const kind = status === "disabled" ? "native-exception" : "native-load";
  nodeGraphRecordModuleFault({
    kind,
    message: message.message || "",
    moduleName: message.name || "",
    moduleType: message.targetType || "",
    status,
  });
}

// Sustained silence/NaN detection for a reachable, non-bypassed node, fed
// by the worklet's "meter" message (badNumberCount/lastBadValueNodeId).
// Fires once per continuous bad streak, then suppresses until the node
// reports a good value again.
function nodeGraphTrackNodeSilenceWindow(nodeId, isBad, reason = "") {
  if (!nodeId) {
    return;
  }
  let reachableNodes;
  let bypassedNodes;
  try {
    const plan = compileNodeGraphExecutionPlan(nodeGraphMvp.patch);
    reachableNodes = new Set(plan.reachableNodes || []);
    bypassedNodes = new Set(plan.bypassedNodes || []);
  } catch (_error) {
    return;
  }
  if (!reachableNodes.has(nodeId) || bypassedNodes.has(nodeId)) {
    nodeGraphModuleDiagnosticsState().silenceTracking.delete(nodeId);
    nodeGraphClearModuleFault(`silent-node:${nodeId}`);
    return;
  }

  const tracking = nodeGraphModuleDiagnosticsState().silenceTracking;
  const now = Date.now();
  if (!isBad) {
    tracking.delete(nodeId);
    nodeGraphClearModuleFault(`silent-node:${nodeId}`);
    return;
  }

  const entry = tracking.get(nodeId) || { firedFault: false, since: now };
  if (!tracking.has(nodeId)) {
    tracking.set(nodeId, entry);
  }
  const elapsedSeconds = (now - entry.since) / 1000;
  if (!entry.firedFault && elapsedSeconds >= nodeGraphModuleDiagnosticsSilenceWindowSeconds) {
    entry.firedFault = true;
    const node = (nodeGraphMvp.patch?.nodes || []).find((candidate) => candidate.id === nodeId);
    nodeGraphRecordModuleFault({
      kind: "silent-node",
      moduleType: node?.type || "",
      nodeId,
      reason,
    });
  }
}

// The worklet's "meter" message only names a single most-recent bad nodeId
// per tick, not a full per-node good/bad status. When a tick reports zero
// bad values at all, that means every previously-tracked node has recovered
// (the worklet's own badNumberCount resets to 0 each report window), so
// clear everything being tracked.
function nodeGraphClearAllTrackedModuleSilence() {
  const tracking = nodeGraphModuleDiagnosticsState().silenceTracking;
  for (const nodeId of [...tracking.keys()]) {
    tracking.delete(nodeId);
    nodeGraphClearModuleFault(`silent-node:${nodeId}`);
  }
}

// -----------------------------------------------------------------------
// "Check All Modules" -- an on-demand self-test, triggered only by a
// button in Settings (never automatically). It tests every native module
// in native-modules-catalog.json directly, independent of the live audio
// worklet or the current patch, so it works whether or not live audio is
// running and can't be confused by whatever happens to be wired up.
//
// Two depths, by design (see the "Check depth" choice this feature was
// built from): every module gets a load check (fetch its .wasm, attempt
// WebAssembly.instantiate -- this alone would have caught the
// keplerBouwkamp catalog bug). The 8 Jerobeam modules additionally get a
// full create->sample(defaults)x2000->x/y read->destroy signal-sanity
// check, since their raw export convention
// (_create/_destroy/_reset/_sample/_x/_y/_version) and exact per-module
// default parameter order are both known precisely (they were all authored
// this way, on purpose, in this repo). The other 17 pre-existing native
// modules use call conventions specific to each one (different export
// names, different per-module option shapes) that aren't safe to guess
// generically, so they get the load check only -- reported as such, not
// silently treated as equivalent.
const nodeGraphJerobeamSelfTestManifest = Object.freeze([
  {
    targetType: "wirdoSpiral",
    exportPrefix: "soemdsp_jbwirdo",
    // frequency, sharp, cross, density, length, rotate, splashDepth, splashDensity, cut, scrap, ringCut, splashSpeed, syncCut
    args: [8, 0, 0, 0.8, 1, 0, 0, 0, 1000, 1, 10, 0, 1],
  },
  {
    targetType: "blubb",
    exportPrefix: "soemdsp_jbblubb",
    // frequency, shape, rotX, rotY, zDepth
    args: [8, 0, 0, 0, 0],
  },
  {
    targetType: "mushroom",
    exportPrefix: "soemdsp_jbmushroom",
    // frequency, phaseOffset, numMushrooms, grow, density, capRotation, stemRotationSpeed, head, spread, wobble, clusterRotation, clusterRotationSpeed, sharp, width, stem, apart, capStemTransition
    args: [8, 0, 1, 1, 3, 0, 0, 0.6667, 0.5, 0.0625, 0, 0, 0, 1, 0, 0, 0.1],
  },
  {
    targetType: "boing",
    exportPrefix: "soemdsp_jbboing",
    // frequency, density, sharpness, rotX, rotY, zDepth, zAmount, ends, boing, boingStrength, dir, shape, volume, volumePreJump
    args: [8, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  },
  {
    targetType: "torus",
    exportPrefix: "soemdsp_jbtorus",
    // frequency, density, quantizeDensity, subdensity, quantizeSubDensity, sharp, size, length, balance, wander, darkAngle, darkIntensity, rotX, rotY, rotZ, zAngleX, zAngleY, zDepth
    args: [8, 1, 1, 0, 1, 0.5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    targetType: "keplerBouwkamp",
    exportPrefix: "soemdsp_jbkepler",
    // frequency, start, length, circles, zoom, rotation, tri
    args: [8, 3, 1, 0.5, 0, 0, 0],
  },
  {
    targetType: "nyquistShannon",
    exportPrefix: "soemdsp_jbnyquist",
    // frequencyA, midiNoteRaw, rate, sampleDots, phaseOffset, frequencyB, subPhase, subPhaseRotationSpeed, tone, toneSmoothTime, artifact, enableToneModPitch, enableToneModFreq, enableToneModNote
    args: [440, 48, 20, 0, 0, 5, 0, 0, 0, 0.01, 0, 1, 0, 0],
  },
  {
    targetType: "radar",
    exportPrefix: "soemdsp_jbradar",
    // frequency, phaseOffset, density, sharp, fade, rotation, direction, shade, lap, ringcut, pow1Up, pow1Down, pow2Bend, phaseInv, tunnelInv, spiralReturn, length, ratio, frontring, zoom, zDepth, inner, x, y
    args: [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  },
]);

const nodeGraphModuleSelfTestSampleCount = 2000;
const nodeGraphModuleSelfTestSampleRate = 44100;

async function nodeGraphRunJerobeamModuleSelfTest(entry, manifestEntry) {
  try {
    const response = await fetch(entry.wasmUrl, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, reason: `wasm fetch failed (HTTP ${response.status})` };
    }
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exportsObj = instance.exports;
    const prefix = manifestEntry.exportPrefix;
    const create = exportsObj[`${prefix}_create`];
    const destroy = exportsObj[`${prefix}_destroy`];
    const sample = exportsObj[`${prefix}_sample`];
    const getX = exportsObj[`${prefix}_x`];
    const getY = exportsObj[`${prefix}_y`];
    if (!create || !destroy || !sample || !getX || !getY) {
      return { ok: false, reason: `missing expected exports (${prefix}_create/_destroy/_sample/_x/_y)` };
    }
    const handle = create();
    if (!handle) {
      return { ok: false, reason: "create() returned no handle (pool exhausted?)" };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let badCount = 0;
    for (let i = 0; i < nodeGraphModuleSelfTestSampleCount; i++) {
      sample(handle, ...manifestEntry.args, nodeGraphModuleSelfTestSampleRate);
      const x = getX(handle);
      const y = getY(handle);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        badCount += 1;
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    destroy(handle);
    if (badCount > 0) {
      return { ok: false, reason: `produced NaN/Inf on ${badCount}/${nodeGraphModuleSelfTestSampleCount} samples` };
    }
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    if (rangeX < 1e-9 && rangeY < 1e-9) {
      return { ok: false, reason: `output never changed across ${nodeGraphModuleSelfTestSampleCount} samples (frozen at X=${minX}, Y=${minY})` };
    }
    return {
      ok: true,
      reason: `finite, varying output over ${nodeGraphModuleSelfTestSampleCount} samples (ΔX=${rangeX.toFixed(4)}, ΔY=${rangeY.toFixed(4)})`,
    };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || "unknown error") };
  }
}

async function nodeGraphRunGenericModuleLoadCheck(entry) {
  try {
    const response = await fetch(entry.wasmUrl, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, reason: `wasm fetch failed (HTTP ${response.status})` };
    }
    const bytes = await response.arrayBuffer();
    // compile (not instantiate): validates the fetch + binary without
    // allocating a wasm linear memory. Chrome caps the number of wasm
    // memories per process, and instantiating all ~77 catalog modules here
    // on top of the live worklet's own instances blew that budget -- the
    // self-test itself caused "Out of memory: Cannot allocate Wasm memory"
    // for every module late in the alphabet.
    await WebAssembly.compile(bytes);
    return { ok: true, reason: "wasm fetched and compiled successfully" };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || "unknown error") };
  }
}

function nodeGraphShowModuleSelfTestReport(report) {
  if (report.running) {
    globalThis.SE?.INFO?.("module self-test running: fetching and checking native modules");
    return;
  }
  const okCount = report.results.filter((item) => item.ok).length;
  globalThis.SE?.INFO?.(`module self-test complete: ${okCount}/${report.results.length} modules OK`);
  for (const item of report.results) {
    const text = `${item.ok ? "OK" : "FAIL"} - ${item.label} (${item.depth}): ${item.reason}`;
    if (item.ok) {
      globalThis.SE?.INFO?.(text);
    } else if (globalThis.SE?.ERROR) {
      globalThis.SE.ERROR(text, "module-self-test");
    } else {
      console.error("[module-self-test]", text);
    }
  }
}

let nodeGraphModuleSelfTestRunning = false;

async function runNodeGraphModuleSelfTest() {
  if (nodeGraphModuleSelfTestRunning) {
    return;
  }
  nodeGraphModuleSelfTestRunning = true;
  const button = document.getElementById("nodeCheckAllModulesButton");
  if (button) {
    button.disabled = true;
  }
  try {
    nodeGraphShowModuleSelfTestReport({ running: true, results: [] });
    const jerobeamManifestByTargetType = new Map(
      nodeGraphJerobeamSelfTestManifest.map((entry) => [entry.targetType, entry]),
    );
    let catalog;
    try {
      catalog = await fetchNodeGraphLiveNativeModuleCatalog();
    } catch (_error) {
      catalog = { modules: [] };
    }
    const modules = Array.isArray(catalog?.modules) ? catalog.modules : [];
    const results = [];
    for (const entry of modules) {
      const manifestEntry = jerobeamManifestByTargetType.get(entry.targetType);
      const result = manifestEntry
        ? await nodeGraphRunJerobeamModuleSelfTest(entry, manifestEntry)
        : await nodeGraphRunGenericModuleLoadCheck(entry);
      results.push({
        depth: manifestEntry ? "load + signal check" : "load check only",
        label: entry.label || entry.targetType || entry.name || "unknown module",
        ok: result.ok,
        reason: result.reason,
      });
    }
    nodeGraphShowModuleSelfTestReport({ running: false, results });
  } finally {
    nodeGraphModuleSelfTestRunning = false;
    if (button) {
      button.disabled = false;
    }
  }
}
