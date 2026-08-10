function setNodeGraphLiveProcessorError(message = "AudioWorklet processor error") {
  nodeGraphClearGpuAdditivePrime();
  setNodeGraphLiveOutputMuted(true);
  nodeGraphMvp.live.runtime = null;
  setNodeGraphLiveEvidence("processor-error", {
    message,
    patchFingerprint: nodeGraphPatchFingerprint(),
  });
  setNodeGraphLiveStatus("error", "warn");
  setNodeGraphLiveEngineStatus("engine error", "warn");
  setNodeGraphLiveEngineTitle(message);
  setNodeGraphLivePlanStatus("plan blocked", "warn");
  setNodeGraphLiveInputMeter();
  setNodeGraphLiveMeter();
  setNodeGraphGpuAdditiveStatus();
  setNodeGraphLiveScheduleStatus(`processor error: ${message}`, "warn");
  document.getElementById("nodeLiveStatus").title = message;
  renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
}

function normalizeNodeGraphVolume(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  // Deliberately capped at unity: the volume controls can only ever make the
  // output quieter than the patch already is, never louder.
  return Math.max(0, Math.min(1, number));
}

// Host Web Audio gain is MUTE ONLY. Loudness is the Output module's `volume`
// param (applied inside the graph). Toolbar 🔊 is a mirror of that param —
// not a second volume stage (would double-attenuate).
function nodeGraphLiveOutputTargetGain() {
  return nodeGraphMvp.live.outputMuted ? 0 : 1;
}

function applyNodeGraphLiveOutputGain() {
  const outputGain = nodeGraphMvp.live.outputGain;
  const context = nodeGraphMvp.live.context;
  if (!outputGain?.gain) {
    return;
  }
  const value = nodeGraphLiveOutputTargetGain();
  const time = context?.currentTime || 0;
  try {
    outputGain.gain.cancelScheduledValues(time);
    outputGain.gain.setValueAtTime(value, time);
  } catch (_error) {
    outputGain.gain.value = value;
  }
}

function setNodeGraphLiveOutputMuted(muted) {
  nodeGraphMvp.live.outputMuted = Boolean(muted);
  applyNodeGraphLiveOutputGain();
}

// ── Module level mirrors (toolbar 🔊 ↔ Input/Output module params) ────────
// Loudness lives in the graph (audioInput.level, output.volume). Host gain is
// mute-only for output and unity for input so we never double-apply.

function nodeGraphPatchModuleNodeByType(type, fallbackId = "") {
  const nodes = nodeGraphMvp?.patch?.nodes;
  if (!Array.isArray(nodes)) {
    return null;
  }
  const found = nodes.find((node) => node?.type === type);
  if (found) {
    return found;
  }
  if (fallbackId && typeof nodeGraphPatchNode === "function") {
    const byId = nodeGraphPatchNode(fallbackId);
    if (byId?.type === type) {
      return byId;
    }
  }
  return null;
}

function nodeGraphModuleParamSlider(node, paramKey) {
  if (!node?.id || !paramKey) {
    return null;
  }
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(node.id) : node.id;
  return document.getElementById(`node-${node.id}-${paramKey}`)
    || document.querySelector(`.dsp-node[data-node="${esc}"] input[data-param="${paramKey}"]`)
    || null;
}

function nodeGraphReadModuleParamLevel(node, paramKey, fallback) {
  if (!node) {
    return normalizeNodeGraphVolume(fallback, 1);
  }
  const slider = nodeGraphModuleParamSlider(node, paramKey);
  if (slider) {
    const fromDom = Number(slider.value);
    if (Number.isFinite(fromDom)) {
      return normalizeNodeGraphVolume(fromDom);
    }
  }
  const fromParams = Number(node.params?.[paramKey]);
  if (Number.isFinite(fromParams)) {
    return normalizeNodeGraphVolume(fromParams);
  }
  return normalizeNodeGraphVolume(fallback, 1);
}

/**
 * Write a 0..1 level onto a module param + its slider, keep a toolbar mirror.
 * lockKey: e.g. "_outputVolumeMirrorLock" — blocks recursive toolbar sync.
 */
function nodeGraphWriteModuleParamLevel(node, paramKey, value, options = {}) {
  const level = normalizeNodeGraphVolume(value);
  const lockKey = options.lockKey || "";
  if (node && !options.fromModuleSlider) {
    node.params = { ...(node.params || {}), [paramKey]: level };
    const slider = nodeGraphModuleParamSlider(node, paramKey);
    if (slider && typeof setNodeSliderValue === "function") {
      if (lockKey) {
        nodeGraphMvp[lockKey] = true;
      }
      try {
        setNodeSliderValue(slider, level, {
          interaction: options.interaction || "drag",
        });
      } finally {
        if (lockKey) {
          nodeGraphMvp[lockKey] = false;
        }
      }
    } else {
      if (slider) {
        slider.value = String(level);
        if (typeof syncNodeSliderReadout === "function") {
          syncNodeSliderReadout(slider);
        }
      }
      if (typeof scheduleNodeGraphLiveParameterSync === "function") {
        scheduleNodeGraphLiveParameterSync();
      }
    }
  }
  return level;
}

function nodeGraphOutputModuleNode() {
  return nodeGraphPatchModuleNodeByType("output", "output");
}

function nodeGraphAudioInputModuleNode() {
  // Prefer the first Input module in the patch (usually the live mic path).
  return nodeGraphPatchModuleNodeByType("audioInput", "audioInput");
}

/** Canonical live out level = Output module volume (0..1). */
function getNodeGraphOutputModuleVolume() {
  return nodeGraphReadModuleParamLevel(
    nodeGraphOutputModuleNode(),
    "volume",
    nodeGraphMvp?.live?.outputVolume ?? 0.1,
  );
}

/** Canonical live in level = Input module Amplitude / level (0..1). */
function getNodeGraphAudioInputModuleLevel() {
  return nodeGraphReadModuleParamLevel(
    nodeGraphAudioInputModuleNode(),
    "level",
    nodeGraphMvp?.live?.inputVolume ?? 1,
  );
}

function setNodeGraphOutputModuleVolume(value, options = {}) {
  const level = nodeGraphWriteModuleParamLevel(
    nodeGraphOutputModuleNode(),
    "volume",
    value,
    { ...options, lockKey: "_outputVolumeMirrorLock" },
  );
  if (nodeGraphMvp?.live) {
    nodeGraphMvp.live.outputVolume = level;
  }
  if (!options.fromToolbar && typeof syncNodeGraphVolumeSlider === "function") {
    syncNodeGraphVolumeSlider("nodeLiveOutputVolume", "nodeLiveOutputVolumeValue", level);
  }
  return level;
}

function setNodeGraphAudioInputModuleLevel(value, options = {}) {
  const level = nodeGraphWriteModuleParamLevel(
    nodeGraphAudioInputModuleNode(),
    "level",
    value,
    { ...options, lockKey: "_inputVolumeMirrorLock" },
  );
  if (nodeGraphMvp?.live) {
    nodeGraphMvp.live.inputVolume = level;
  }
  // Host mic gain is unity — level is applied on the audioInput module only.
  applyNodeGraphLiveInputHostGain();
  if (!options.fromToolbar && typeof syncNodeGraphVolumeSlider === "function") {
    syncNodeGraphVolumeSlider("nodeLiveInputVolume", "nodeLiveInputVolumeValue", level);
  }
  return level;
}

/** Toolbar / API: set volume = Output module volume (mirrored). */
function setNodeGraphLiveOutputVolume(value) {
  return setNodeGraphOutputModuleVolume(value, { fromToolbar: true, interaction: "drag" });
}

/** Toolbar / API: set level = Input module Amplitude (mirrored). */
function setNodeGraphLiveInputVolume(value) {
  return setNodeGraphAudioInputModuleLevel(value, { fromToolbar: true, interaction: "drag" });
}

/** Pull toolbar 🔊 from the Output module (after patch load / module drag). */
function syncNodeGraphLiveOutputVolumeFromOutputModule() {
  if (nodeGraphMvp?._outputVolumeMirrorLock) {
    return getNodeGraphOutputModuleVolume();
  }
  const level = getNodeGraphOutputModuleVolume();
  if (nodeGraphMvp?.live) {
    nodeGraphMvp.live.outputVolume = level;
  }
  if (typeof syncNodeGraphVolumeSlider === "function") {
    syncNodeGraphVolumeSlider("nodeLiveOutputVolume", "nodeLiveOutputVolumeValue", level);
  }
  applyNodeGraphLiveOutputGain();
  return level;
}

/** Pull toolbar 🔊 from the Input module Amplitude (after patch load / drag). */
function syncNodeGraphLiveInputVolumeFromInputModule() {
  if (nodeGraphMvp?._inputVolumeMirrorLock) {
    return getNodeGraphAudioInputModuleLevel();
  }
  const level = getNodeGraphAudioInputModuleLevel();
  if (nodeGraphMvp?.live) {
    nodeGraphMvp.live.inputVolume = level;
  }
  if (typeof syncNodeGraphVolumeSlider === "function") {
    syncNodeGraphVolumeSlider("nodeLiveInputVolume", "nodeLiveInputVolumeValue", level);
  }
  applyNodeGraphLiveInputHostGain();
  return level;
}

function syncNodeGraphLiveVolumeMirrorsFromModules() {
  syncNodeGraphLiveOutputVolumeFromOutputModule();
  syncNodeGraphLiveInputVolumeFromInputModule();
}

/**
 * Mic host gain is always unity. Attenuation is audioInput.level in the graph
 * (same rule as output: one place for loudness). Node still exists so the
 * stream can be rewired without re-prompting for permission.
 */
function applyNodeGraphLiveInputHostGain() {
  const gainNode = nodeGraphMvp?.live?.inputVolumeGain;
  const context = nodeGraphMvp?.live?.context;
  if (!gainNode?.gain) {
    return;
  }
  const time = context?.currentTime || 0;
  try {
    gainNode.gain.cancelScheduledValues(time);
    gainNode.gain.setValueAtTime(1, time);
  } catch (_error) {
    gainNode.gain.value = 1;
  }
}

let nodeGraphLiveNativeModuleCatalogPromise = null;
let nodeGraphLiveNativeModuleBytes = {};

// On static hosts with no server behind the page (e.g. the sandbox embedded
// as a static export), "/api/native-modules" doesn't exist. Fall back to a
// pre-generated catalog shipped alongside index.html — same shape server.py
// returns, so nothing downstream needs to know which path was used.
async function fetchNodeGraphLiveNativeModuleCatalogFallback() {
  try {
    const response = await fetch("native-modules-catalog.json", { cache: "no-store" });
    return response.ok ? response.json() : { modules: [] };
  } catch (_error) {
    return { modules: [] };
  }
}

async function fetchNodeGraphLiveNativeModuleCatalog() {
  if (!nodeGraphLiveNativeModuleCatalogPromise) {
    nodeGraphLiveNativeModuleCatalogPromise = fetch("/api/native-modules", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : fetchNodeGraphLiveNativeModuleCatalogFallback())
      .catch(() => fetchNodeGraphLiveNativeModuleCatalogFallback());
  }
  return nodeGraphLiveNativeModuleCatalogPromise;
}

/** Phase E diagnostics: bytes fetched per wasm URL (filled after each fetch). */
const nodeGraphLiveNativeWasmFetchStats = {
  mode: null,
  byUrl: Object.create(null),
  totalBytes: 0,
  fetchCount: 0,
};

function nodeGraphLiveRecordNativeWasmFetch(wasmUrl, byteLength) {
  const url = String(wasmUrl || "");
  const n = Number(byteLength) || 0;
  if (!url || n <= 0) {
    return;
  }
  if (!nodeGraphLiveNativeWasmFetchStats.byUrl[url]) {
    nodeGraphLiveNativeWasmFetchStats.byUrl[url] = { bytes: 0, hits: 0 };
  }
  const row = nodeGraphLiveNativeWasmFetchStats.byUrl[url];
  // Count first successful materialization only (cache hits share one ArrayBuffer).
  if (row.hits === 0) {
    row.bytes = n;
    nodeGraphLiveNativeWasmFetchStats.totalBytes += n;
  }
  row.hits += 1;
  nodeGraphLiveNativeWasmFetchStats.fetchCount += 1;
}

/** Console/API helper: `nodeGraphLiveNativeWasmFetchReport()`. */
function nodeGraphLiveNativeWasmFetchReport() {
  const mode = nodeGraphLiveNativeWasmLoadModeResolved
    || nodeGraphLiveNativeWasmFetchStats.mode
    || (typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.nativeWasmLoadMode : null)
    || "unresolved";
  const urls = Object.keys(nodeGraphLiveNativeWasmFetchStats.byUrl).sort();
  const report = {
    mode,
    fetchCount: nodeGraphLiveNativeWasmFetchStats.fetchCount,
    uniqueUrls: urls.length,
    totalBytes: nodeGraphLiveNativeWasmFetchStats.totalBytes,
    totalKiB: Math.round(nodeGraphLiveNativeWasmFetchStats.totalBytes / 102.4) / 10,
    byUrl: urls.map((url) => ({
      url,
      bytes: nodeGraphLiveNativeWasmFetchStats.byUrl[url].bytes,
      hits: nodeGraphLiveNativeWasmFetchStats.byUrl[url].hits,
    })),
  };
  // Discoverable on window for player/embed diagnostics (Phase E).
  try {
    if (typeof window !== "undefined") {
      window.nodeGraphLiveNativeWasmFetchReport = nodeGraphLiveNativeWasmFetchReport;
      window.nodeGraphLiveNativeWasmFetchStats = nodeGraphLiveNativeWasmFetchStats;
    }
  } catch (_e) { /* ignore */ }
  return report;
}

async function fetchNodeGraphLiveNativeModuleBytes(entry) {
  const wasmUrl = String(entry?.wasmUrl || "");
  if (!wasmUrl) {
    return null;
  }
  if (!nodeGraphLiveNativeModuleBytes[wasmUrl]) {
    nodeGraphLiveNativeModuleBytes[wasmUrl] = fetch(wasmUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const buf = await response.arrayBuffer();
        nodeGraphLiveRecordNativeWasmFetch(wasmUrl, buf?.byteLength);
        return buf;
      })
      .catch(() => null);
  }
  return nodeGraphLiveNativeModuleBytes[wasmUrl];
}

// A few native modules serve more than one node type (see the worklet's own
// nativeModuleStatus alias checks). The catalog only records one targetType
// per entry, so a patch using the aliased type would otherwise miss the
// priority boost below.
const nodeGraphLiveNativeModuleTypeAliases = Object.freeze({
  vactrolEnvelopeSeries: ["vactrolEnvelopeCustom"],
  triggerDivider: ["clockDivider"],
});

function nodeGraphLiveActivePatchNativeTargetTypes(plan) {
  const types = new Set();
  for (const node of plan?.nodes || []) {
    if (node?.type) {
      types.add(node.type);
    }
  }
  return types;
}

function nodeGraphLiveNativeModuleIsUsedByPatch(entry, activeTypes) {
  const targetType = entry?.targetType || "";
  if (!targetType) {
    return false;
  }
  if (activeTypes.has(targetType)) {
    return true;
  }
  const aliases = nodeGraphLiveNativeModuleTypeAliases[targetType];
  return Array.isArray(aliases) && aliases.some((type) => activeTypes.has(type));
}

async function sendNodeGraphLiveNativeModule(liveNode, entry) {
  const bytes = await fetchNodeGraphLiveNativeModuleBytes(entry);
  if (!(bytes instanceof ArrayBuffer)) {
    return;
  }
  const transferableBytes = bytes.slice(0);
  liveNode.port.postMessage(
    {
      type: "setNativeModuleWasm",
      name: entry.name || entry.targetType || "",
      targetType: entry.targetType || "",
      bytes: transferableBytes,
    },
    [transferableBytes],
  );
}

// Hands native-module wasm to the worklet.
//
// Load modes (Phase E — see docs/WASM_SLIM_LOAD.md):
//   combined — one soemdsp_combined.wasm (all modules, one memory). Default
//              for authoring so any module can be added without a re-fetch.
//   slim     — only wasm for types on the current plan. Prefer for player /
//              embed / clapplayer (?wasmLoad=slim or embed-config).
//
// Chrome caps wasm memories per process (~100); many standalone instances
// hit that cap. Slim is for small used-sets; huge patches should use combined.
const nodeGraphLiveCombinedNativeModuleUrl = "native_modules/combined/soemdsp_combined.wasm?v=fast-sin-turns-1";

/** @type {null|"slim"|"combined"} */
let nodeGraphLiveNativeWasmLoadModeResolved = null;

/**
 * Resolve native WASM load policy once.
 * Query: ?wasmLoad=slim|combined  (aliases: used, used-modules, full)
 * embed-config.json: { "wasmLoad": "slim" } or { "nativeWasmLoad": "slim" }
 * Runtime override: nodeGraphMvp.live.nativeWasmLoadMode
 */
function nodeGraphLiveInstallNativeWasmDiagnostics() {
  try {
    if (typeof window === "undefined") {
      return;
    }
    window.nodeGraphLiveNativeWasmFetchReport = nodeGraphLiveNativeWasmFetchReport;
    window.nodeGraphLiveNativeWasmFetchStats = nodeGraphLiveNativeWasmFetchStats;
    window.nodeGraphLiveGetNativeWasmLoadMode = () =>
      nodeGraphLiveNativeWasmLoadModeResolved || nodeGraphLiveNativeWasmFetchStats.mode || "unresolved";
  } catch (_e) { /* ignore */ }
}

async function nodeGraphLiveResolveNativeWasmLoadMode() {
  if (nodeGraphLiveNativeWasmLoadModeResolved === "slim" || nodeGraphLiveNativeWasmLoadModeResolved === "combined") {
    nodeGraphLiveNativeWasmFetchStats.mode = nodeGraphLiveNativeWasmLoadModeResolved;
    nodeGraphLiveInstallNativeWasmDiagnostics();
    return nodeGraphLiveNativeWasmLoadModeResolved;
  }
  const normalize = (raw) => {
    const key = String(raw || "").trim().toLowerCase();
    if (key === "slim" || key === "used" || key === "used-modules" || key === "usedmodules") {
      return "slim";
    }
    if (key === "combined" || key === "full" || key === "all") {
      return "combined";
    }
    return "";
  };
  let mode = "";
  try {
    const fromLive = normalize(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.nativeWasmLoadMode : "");
    if (fromLive) {
      mode = fromLive;
    }
  } catch (_e) { /* ignore */ }
  if (!mode) {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const fromQuery = normalize(params.get("wasmLoad") || params.get("nativeWasm") || "");
      if (fromQuery) {
        mode = fromQuery;
      } else {
        // Player-style embeds (hide chrome / autoplay) default to slim unless
        // explicitly set to combined above. Authoring sandbox stays combined.
        const hideUi = params.get("hideui") === "1" || params.get("hideUI") === "1";
        const autoStart = params.get("autostart") === "1";
        const playerHint = params.get("player") === "1" || params.get("clapplayer") === "1";
        if (hideUi || autoStart || playerHint) {
          mode = "slim";
        }
      }
    } catch (_e) { /* ignore */ }
  }
  if (!mode) {
    try {
      if (typeof nodeGraphLoadEmbedConfig === "function") {
        const config = await nodeGraphLoadEmbedConfig();
        const fromConfig = normalize(config?.wasmLoad || config?.nativeWasmLoad || "");
        if (fromConfig) {
          mode = fromConfig;
        } else if (config?.player === true || config?.mode === "player") {
          mode = "slim";
        }
      }
    } catch (_e) { /* ignore */ }
  }
  if (!mode) {
    mode = "combined";
  }
  nodeGraphLiveNativeWasmLoadModeResolved = mode;
  nodeGraphLiveNativeWasmFetchStats.mode = mode;
  try {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.live) {
      // Mirror for UI/status without calling async resolve again.
      nodeGraphMvp.live.nativeWasmLoadMode = mode;
    }
  } catch (_e) { /* ignore */ }
  nodeGraphLiveInstallNativeWasmDiagnostics();
  return mode;
}

async function sendNodeGraphLiveNativeModulesUsedOnly(liveNode, plan, eligibleEntries, sent) {
  const activeTargetTypes = nodeGraphLiveActivePatchNativeTargetTypes(plan);
  const neededEntries = [];
  for (const entry of eligibleEntries) {
    const key = String(entry.name || entry.targetType || "");
    if (sent.has(key) || sent.has("combined")) {
      continue;
    }
    if (nodeGraphLiveNativeModuleIsUsedByPatch(entry, activeTargetTypes)) {
      sent.add(key);
      neededEntries.push(entry);
    }
  }
  if (neededEntries.length && typeof console !== "undefined" && console.debug) {
    console.debug(
      "[native-wasm slim] fetch",
      neededEntries.map((e) => e.targetType || e.name).filter(Boolean),
    );
  }
  await Promise.all(neededEntries.map((entry) => sendNodeGraphLiveNativeModule(liveNode, entry)));
  if (neededEntries.length && typeof console !== "undefined" && console.debug) {
    const report = nodeGraphLiveNativeWasmFetchReport();
    console.debug("[native-wasm slim] totals", {
      uniqueUrls: report.uniqueUrls,
      totalKiB: report.totalKiB,
      mode: report.mode,
    });
  }
}

/** Force re-resolve load mode (e.g. after embed flips player flag). */
function nodeGraphLiveResetNativeWasmLoadMode() {
  nodeGraphLiveNativeWasmLoadModeResolved = null;
}

async function sendNodeGraphLiveNativeModules(liveNode, plan = null) {
  if (!liveNode?.port) {
    return;
  }
  if (!liveNode.nodeGraphSentNativeModules) {
    liveNode.nodeGraphSentNativeModules = new Set();
  }
  const sent = liveNode.nodeGraphSentNativeModules;
  const catalog = await fetchNodeGraphLiveNativeModuleCatalog();
  const nativeModules = Array.isArray(catalog?.modules) ? catalog.modules : [];
  const eligibleEntries = nativeModules.filter((entry) => {
    // video-poc entries (e.g. video_synth_raster) have their own standalone
    // demo page that fetches and instantiates their wasm directly -- they
    // were never wired into the worklet's nativeModuleStatus dispatch, so
    // sending them here only produces a false-positive "unsupported
    // native module" diagnostic.
    if (!entry?.wasmAvailable || entry.kind === "video-poc") {
      return false;
    }
    // Under-construction modules (see nodeGraphModuleStoreUnderConstructionTypes)
    // may ship placeholder native shells (wall_delay version stub). Skip them
    // so the worklet never posts "unsupported native module" for expected UC.
    if (
      typeof nodeGraphNativeModuleRefIsUnderConstruction === "function" &&
      nodeGraphNativeModuleRefIsUnderConstruction(entry)
    ) {
      return false;
    }
    return true;
  });

  const loadMode = await nodeGraphLiveResolveNativeWasmLoadMode();
  nodeGraphLiveNativeWasmFetchStats.mode = loadMode;

  // Phase E slim: only wasm for types on this plan (player / embed / clapplayer).
  if (loadMode === "slim") {
    await sendNodeGraphLiveNativeModulesUsedOnly(liveNode, plan, eligibleEntries, sent);
    nodeGraphLiveMaybeLogWasmFetchStats(loadMode);
    return;
  }

  // Authoring default: ONE combined .wasm (all modules, one linear memory).
  // Built by scripts/build_native_modules.ps1. On failure → lazy used-modules.
  if (!liveNode.nodeGraphCombinedUnavailable && !sent.has("combined")) {
    const combinedBytes = await fetchNodeGraphLiveNativeModuleBytes({
      wasmUrl: nodeGraphLiveCombinedNativeModuleUrl,
    });
    if (combinedBytes instanceof ArrayBuffer) {
      sent.add("combined");
      const transferableBytes = combinedBytes.slice(0);
      liveNode.port.postMessage(
        {
          type: "setNativeModuleWasm",
          name: "combined",
          targetType: "",
          modules: eligibleEntries.map((entry) => ({
            name: String(entry.name || ""),
            targetType: String(entry.targetType || ""),
          })),
          bytes: transferableBytes,
        },
        [transferableBytes],
      );
      nodeGraphLiveMaybeLogWasmFetchStats(loadMode);
      return;
    }
    liveNode.nodeGraphCombinedUnavailable = true;
  }
  if (sent.has("combined")) {
    nodeGraphLiveMaybeLogWasmFetchStats(loadMode);
    return;
  }
  // Fallback (no combined binary): send only modules the patch uses.
  await sendNodeGraphLiveNativeModulesUsedOnly(liveNode, plan, eligibleEntries, sent);
  nodeGraphLiveMaybeLogWasmFetchStats(loadMode);
}

/** Log fetch report when ?wasmStats=1 or live.debugNativeWasm is set. */
function nodeGraphLiveMaybeLogWasmFetchStats(loadMode) {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const want =
      params.get("wasmStats") === "1" ||
      params.get("nativeWasmStats") === "1" ||
      (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.live?.debugNativeWasm === true);
    if (!want || typeof console === "undefined" || !console.info) {
      return;
    }
    const report = nodeGraphLiveNativeWasmFetchReport();
    report.mode = loadMode || report.mode;
    console.info("[native-wasm] fetch report", report);
  } catch (_e) { /* ignore */ }
}

async function refreshNodeGraphLiveMicrophonePermissionState() {
  if (!navigator.permissions?.query) {
    nodeGraphMvp.live.inputPermissionStatus = "unsupported";
    updateNodeGraphLiveInputTestStatus();
    return "unsupported";
  }
  try {
    const permission = await navigator.permissions.query({ name: "microphone" });
    const updatePermissionState = () => {
      nodeGraphMvp.live.inputPermissionStatus = permission.state || "unknown";
      if (
        nodeGraphMvp.live.inputActive &&
        !nodeGraphMvp.live.inputStream &&
        permission.state === "denied"
      ) {
        const message = "Microphone permission is blocked in the browser.";
        setNodeGraphLiveInputStatus("blocked", message);
        setNodeGraphLiveMicStatus("blocked", message);
      } else if (
        nodeGraphMvp.live.inputActive &&
        !nodeGraphMvp.live.inputStream &&
        nodeGraphMvp.live.micStatus === "blocked"
      ) {
        const routeState = nodeGraphLiveInputRouteState();
        setNodeGraphLiveInputStatus(routeState.state, routeState.message);
        setNodeGraphLiveMicStatus(
          "armed",
          permission.state === "granted"
            ? "Microphone permission is allowed. Start OUTPUT to connect it."
            : "Start OUTPUT to request browser microphone permission.",
        );
      } else {
        updateNodeGraphLiveInputTestStatus();
      }
    };
    updatePermissionState();
    permission.onchange = updatePermissionState;
    return nodeGraphMvp.live.inputPermissionStatus;
  } catch (_error) {
    nodeGraphMvp.live.inputPermissionStatus = "unsupported";
    updateNodeGraphLiveInputTestStatus();
    return "unsupported";
  }
}

async function refreshNodeGraphLiveInputDevices() {
  const select = document.getElementById("nodeLiveInputDeviceSelect");
  if (!select) {
    return;
  }
  const selectedDeviceId = nodeGraphMvp.live.inputDeviceId || "";
  select.replaceChildren(new Option("default input", ""));
  select.value = "";
  select.disabled = !navigator.mediaDevices?.enumerateDevices;
  if (select.disabled) {
    select.title = nodeGraphTooltipText("audio.inputDeviceUnavailable");
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputDevices = devices.filter((device) => device.kind === "audioinput");
    inputDevices.forEach((device, index) => {
      const label = device.label || `input ${index + 1}`;
      select.append(new Option(label, device.deviceId));
    });
    const hasSelectedDevice = selectedDeviceId &&
      inputDevices.some((device) => device.deviceId === selectedDeviceId);
    select.value = hasSelectedDevice ? selectedDeviceId : "";
    if (!hasSelectedDevice) {
      nodeGraphMvp.live.inputDeviceId = "";
    }
    select.title = inputDevices.length
      ? nodeGraphTooltipText("audio.inputDevice")
      : nodeGraphTooltipText("audio.inputDeviceMissing");
  } catch (error) {
    select.disabled = true;
    select.title = error.message || nodeGraphTooltipText("audio.inputDeviceUnavailable");
  }
}

async function handleNodeGraphLiveInputDeviceChange(event) {
  nodeGraphMvp.live.inputDeviceId = event.target.value || "";
  if (!nodeGraphMvp.live.inputActive || !nodeGraphMvp.live.context || !nodeGraphMvp.live.node) {
    return;
  }
  stopNodeGraphLiveInputSource();
  try {
    await startNodeGraphLiveInputSource();
  } catch (error) {
    setNodeGraphLiveBlockedError("input", error, { schedule: false });
  }
}

function nodeGraphLiveInputErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was blocked. Allow microphone access in the browser, then press Output again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No browser audio input device was found.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The selected audio input is busy or unavailable.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "The selected audio input is unavailable.";
  }
  return error?.message || "Browser audio input unavailable.";
}

function cleanupNodeGraphMockInputStream() {
  try {
    nodeGraphMvp.live.mockInputOscillator?.stop();
  } catch (_error) {
    // Mock input may already be stopped by live shutdown.
  }
  try {
    nodeGraphMvp.live.mockInputOscillator?.disconnect();
    nodeGraphMvp.live.mockInputGain?.disconnect();
    nodeGraphMvp.live.mockInputDestination?.disconnect?.();
  } catch (_error) {
    // Disconnected mock graph nodes are harmless.
  }
  nodeGraphMvp.live.mockInputDestination = null;
  nodeGraphMvp.live.mockInputGain = null;
  nodeGraphMvp.live.mockInputOscillator = null;
}

function setNodeGraphMockInputFactory(options = {}) {
  const frequency = Number.isFinite(Number(options.frequency))
    ? Math.max(20, Math.min(20000, Number(options.frequency)))
    : 220;
  const gain = Number.isFinite(Number(options.gain))
    ? Math.max(0, Math.min(1, Number(options.gain)))
    : 0.25;
  nodeGraphMvp.live.inputStreamFactory = async ({ context }) => {
    if (!context?.createMediaStreamDestination) {
      throw new Error("Mock browser input needs MediaStreamDestination support.");
    }
    cleanupNodeGraphMockInputStream();
    const oscillator = context.createOscillator();
    const inputGain = context.createGain();
    const destination = context.createMediaStreamDestination();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    inputGain.gain.value = gain;
    oscillator.connect(inputGain);
    inputGain.connect(destination);
    oscillator.start();
    nodeGraphMvp.live.mockInputDestination = destination;
    nodeGraphMvp.live.mockInputGain = inputGain;
    nodeGraphMvp.live.mockInputOscillator = oscillator;
    return destination.stream;
  };
}

function stopNodeGraphMockInput() {
  const hadMockInput = Boolean(
    nodeGraphMvp.live.mockInputOscillator ||
    nodeGraphMvp.live.mockInputGain ||
    nodeGraphMvp.live.mockInputDestination
  );
  nodeGraphMvp.live.inputStreamFactory = null;
  if (hadMockInput && nodeGraphMvp.live.inputStream) {
    stopNodeGraphLiveInputSource();
  } else {
    cleanupNodeGraphMockInputStream();
  }
}

async function startNodeGraphMockInput(options = {}) {
  setNodeGraphMockInputFactory(options);
  nodeGraphMvp.live.inputActive = true;
  ensureNodeGraphLiveInputModule();
  if (!nodeGraphMvp.live.node || !nodeGraphMvp.live.context) {
    nodeGraphMvp.live.outputEnabled = true;
    await startNodeGraphLiveAudio();
  } else {
    await syncNodeGraphLiveInputSource();
  }
  return nodeGraphLiveDebug();
}

function nodeGraphLiveInputDeviceIsUnavailable(error) {
  return [
    "ConstraintNotSatisfiedError",
    "DevicesNotFoundError",
    "NotFoundError",
    "OverconstrainedError",
  ].includes(error?.name || "");
}

async function requestNodeGraphLiveInputStream(deviceId = nodeGraphMvp.live.inputDeviceId) {
  if (typeof nodeGraphMvp.live.inputStreamFactory === "function") {
    return nodeGraphMvp.live.inputStreamFactory({
      context: nodeGraphMvp.live.context,
      deviceId,
    });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: false,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
    },
  });
}

function nodeGraphLiveOutputStartCancelled(serial) {
  return serial !== nodeGraphMvp.live.outputToggleSerial || !nodeGraphMvp.live.outputEnabled;
}

function nodeGraphLiveInputIsUnderConstruction() {
  return false;
}

function toggleNodeGraphLiveInput() {
  nodeGraphMvp.live.inputActive = !nodeGraphMvp.live.inputActive;
  const addedInputModule = nodeGraphMvp.live.inputActive
    ? ensureNodeGraphLiveInputModule()
    : false;
  if (nodeGraphMvp.live.inputActive) {
    const routeState = nodeGraphLiveInputRouteState();
    setNodeGraphLiveInputStatus(routeState.state, routeState.message);
    refreshNodeGraphLiveMicrophonePermissionState();
  } else {
    setNodeGraphLiveInputStatus("off");
    setNodeGraphLiveMicStatus("off");
  }
  if (!addedInputModule) {
    applyNodeGraphPatchToDom();
    drawNodeGraphWires();
    scheduleNodeGraphLivePlanSync();
  }
  renderNodeGraphLiveControls();
  if (nodeGraphMvp.live.context && nodeGraphMvp.live.node) {
    syncNodeGraphLiveInputSource().catch((error) => {
      nodeGraphMvp.live.inputActive = false;
      stopNodeGraphLiveInputSource();
      setNodeGraphLiveInputStatus("blocked", error.message);
      applyNodeGraphPatchToDom();
      drawNodeGraphWires();
      renderNodeGraphLiveControls();
      setNodeGraphLiveBlockedError("input", error, { schedule: false });
    });
  }
}

async function setNodeGraphLiveOutputEnabled(enabled) {
  if (enabled && nodeGraphEarProtectionIsTripped()) {
    nodeGraphMvp.live.outputEnabled = false;
    nodeGraphTripEarProtection({ source: "live" });
    renderNodeGraphLiveControls(false);
    renderNodeGraphExecutionPlanDebug();
    return;
  }
  const outputEnabled = Boolean(enabled);

  // Idempotent enable: re-arming while already live/starting used to bump
  // outputToggleSerial, cancel the in-flight start, and flash green → red stop
  // even though audio came up (or a cancelled start tore the winner down).
  if (outputEnabled) {
    if (nodeGraphMvp.live.outputEnabled && nodeGraphMvp.live.node) {
      renderNodeGraphLiveControls(true);
      renderNodeGraphExecutionPlanDebug();
      return;
    }
    if (nodeGraphMvp.live.outputEnabled && !nodeGraphMvp.live.node) {
      const status = String(document.getElementById("nodeLiveStatus")?.textContent || "");
      if (status === "starting" || status === "priming") {
        renderNodeGraphLiveControls();
        renderNodeGraphExecutionPlanDebug();
        return;
      }
    }
  } else if (!nodeGraphMvp.live.outputEnabled && !nodeGraphMvp.live.node && !nodeGraphMvp.live.context) {
    renderNodeGraphLiveControls(false);
    renderNodeGraphExecutionPlanDebug();
    return;
  }

  const serial = nodeGraphMvp.live.outputToggleSerial + 1;
  nodeGraphMvp.live.outputToggleSerial = serial;
  nodeGraphMvp.live.outputEnabled = outputEnabled;
  renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
  renderNodeGraphExecutionPlanDebug();

  if (!outputEnabled) {
    // Full stop (same as transport ⏹): tear down audio, wipe screens, clear
    // transport pause so the next start is live — never "still paused".
    await stopNodeGraphLiveAudio();
    renderNodeGraphExecutionPlanDebug();
    return;
  }

  // Starting output is never "resume paused" — clear transport pause so Play
  // means live simulation until the user pauses again.
  if ((nodeGraphMvp.live.speedMultiplier ?? 1) <= 0) {
    const resume = Number(nodeGraphMvp.live.lastPlaySpeed);
    nodeGraphMvp.live.speedMultiplier = Number.isFinite(resume) && resume > 0 ? resume : 1;
  }

  if (nodeGraphMvp.live.node || nodeGraphMvp.live.context) {
    await stopNodeGraphLiveAudio();
  }
  if (serial !== nodeGraphMvp.live.outputToggleSerial || !nodeGraphMvp.live.outputEnabled) {
    return;
  }
  renderNodeGraphLiveControls();
  renderNodeGraphExecutionPlanDebug();
  await startNodeGraphLiveAudio(serial);
  if (serial === nodeGraphMvp.live.outputToggleSerial) {
    renderNodeGraphExecutionPlanDebug();
  }
}

/**
 * Full simulation restart: cold stop (wipe screens / tear down audio) then
 * start again. Does not require the user to stop first — transport ⏮ uses this.
 *
 * Important: do NOT route through setNodeGraphLiveOutputEnabled(false) then
 * (true). That bumps outputToggleSerial twice and can leave a start mid-flight
 * cancelled with status still "starting" and no worklet — Play then only
 * toggles pause and the engine never comes back.
 */
async function restartNodeGraphLiveSimulation() {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphTripEarProtection({ source: "live" });
    renderNodeGraphLiveControls(false);
    renderNodeGraphExecutionPlanDebug();
    return false;
  }

  // One serial for this whole restart so nothing mid-flight from a prior
  // enable/disable can "win" and leave us half-started.
  const serial = nodeGraphMvp.live.outputToggleSerial + 1;
  nodeGraphMvp.live.outputToggleSerial = serial;
  nodeGraphMvp.live.outputEnabled = true;

  // Cold boot is never "still paused" — restore last play speed (or 1).
  const resume = Number(nodeGraphMvp.live.lastPlaySpeed);
  nodeGraphMvp.live.speedMultiplier = Number.isFinite(resume) && resume > 0 ? resume : 1;
  if (!(Number(nodeGraphMvp.live.lastPlaySpeed) > 0)) {
    nodeGraphMvp.live.lastPlaySpeed = nodeGraphMvp.live.speedMultiplier;
  }

  try {
    if (typeof stopNodeGraphLiveAudio === "function") {
      await stopNodeGraphLiveAudio();
    }
  } catch (_error) {
    // Teardown is best effort before a fresh start.
  }

  // Another restart/stop may have superseded us while we were tearing down.
  if (serial !== nodeGraphMvp.live.outputToggleSerial || !nodeGraphMvp.live.outputEnabled) {
    renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
    renderNodeGraphExecutionPlanDebug();
    return false;
  }

  // stopNodeGraphLiveAudio may leave status "stopped"; keep output armed.
  nodeGraphMvp.live.outputEnabled = true;

  if (typeof startNodeGraphLiveAudio === "function") {
    await startNodeGraphLiveAudio(serial);
  }

  // If start cancelled itself without a node, do not leave UI looking "live".
  if (!nodeGraphMvp.live.node && serial === nodeGraphMvp.live.outputToggleSerial) {
    if (typeof setNodeGraphLiveStatus === "function") {
      setNodeGraphLiveStatus("stopped");
    }
    nodeGraphMvp.live.outputEnabled = false;
  }

  renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
  renderNodeGraphExecutionPlanDebug();
  return Boolean(nodeGraphMvp.live.outputEnabled && nodeGraphMvp.live.node);
}

/**
 * Red Output button / bypass: if the engine is on (running or paused), always
 * full stop. If off, start. Pause is transport-only until we have a timeline.
 */
function toggleNodeGraphLiveOutput() {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphTripEarProtection({ source: "live" });
    return;
  }
  const engineUp = Boolean(nodeGraphMvp.live.node || nodeGraphMvp.live.context);
  const outputOn = Boolean(nodeGraphMvp.live.outputEnabled);
  if (outputOn || engineUp) {
    setNodeGraphLiveOutputEnabled(false);
    return;
  }
  setNodeGraphLiveOutputEnabled(true);
}

function setNodeGraphLiveSpeed(speed) {
  const value = Number(speed);
  const clamped = Number.isFinite(value) ? Math.max(0, value) : 1;
  if (nodeGraphMvp.live.speedMultiplier === clamped) {
    return;
  }
  if (clamped > 0) {
    nodeGraphMvp.live.lastPlaySpeed = clamped;
  }
  nodeGraphMvp.live.speedMultiplier = clamped;
  sendNodeGraphLiveSpeed();
  // Every pause/play path funnels through here (transport button, spacebar,
  // external host messages), so refresh the header Speed readout and the
  // play/pause glyph from one place rather than at each call site.
  if (typeof renderNodeGraphLiveControls === "function") {
    renderNodeGraphLiveControls();
  }
  if (typeof nodeGraphExternalNotifyLiveOutputChanged === "function") {
    nodeGraphExternalNotifyLiveOutputChanged();
  }
  // Speed 0 = simulation pause: stop phosphor energy steps immediately so
  // trails do not keep decaying on the main-thread draw loop.
  if (clamped <= 0 && typeof absorbNodeGraphModuleScopePhosphorDrawCursors === "function") {
    if (typeof nodeGraphModuleScopeState === "object" && nodeGraphModuleScopeState) {
      if (nodeGraphModuleScopeState.drawFrame) {
        window.cancelAnimationFrame(nodeGraphModuleScopeState.drawFrame);
        nodeGraphModuleScopeState.drawFrame = 0;
        nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
      }
      if (nodeGraphModuleScopeState.drawFrameWatchdog) {
        window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
        nodeGraphModuleScopeState.drawFrameWatchdog = 0;
      }
    }
    absorbNodeGraphModuleScopePhosphorDrawCursors();
  } else if (clamped > 0) {
    // Unpause after Clear-while-paused: Instant Trace can early-out on a stale
    // draw signature (black face, unchanged sample count). Force a full paint.
    if (typeof nodeGraphModuleScopeState === "object" && nodeGraphModuleScopeState) {
      try {
        nodeGraphModuleScopeState.traceDisplayDrawCache?.clear?.();
      } catch (_error) {
        // Best-effort.
      }
    }
    if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
      scheduleNodeGraphModuleScopeDraw({ force: true });
    }
  }
}

function sendNodeGraphLiveSpeed() {
  if (!nodeGraphMvp.live.node || !nodeGraphMvp.live.usesWorklet) {
    return;
  }
  try {
    nodeGraphMvp.live.node.port.postMessage({
      type: "setSpeed",
      speed: nodeGraphMvp.live.speedMultiplier,
    });
  } catch (_error) {
    // Worklet may be disconnected.
  }
}

function sendNodeGraphLiveSpeedLimit() {
  if (!nodeGraphMvp.live.node || !nodeGraphMvp.live.usesWorklet) {
    return;
  }
  try {
    nodeGraphMvp.live.node.port.postMessage({
      type: "setSpeedLimit",
      speedLimit: typeof nodeGraphLiveSpeedLimitHz === "function"
        ? nodeGraphLiveSpeedLimitHz()
        : (Number(nodeGraphMvp.live.speedLimit) || 20000),
    });
  } catch (_error) {
    // Worklet may be disconnected.
  }
}

function renderNodeGraphLiveScriptBlock(event) {
  const output = event.outputBuffer;
  const frames = output.length;
  const runtime = nodeGraphMvp.live.runtime;
  if (!runtime) {
    for (let channel = 0; channel < output.numberOfChannels; channel += 1) {
      output.getChannelData(channel).fill(0);
    }
    return;
  }
  const sampleRate = event.playbackTime !== undefined
    ? output.sampleRate
    : nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate;
  runtime.externalInput = {
    left: event.inputBuffer?.numberOfChannels > 0
      ? event.inputBuffer.getChannelData(0)
      : null,
    right: event.inputBuffer?.numberOfChannels > 1
      ? event.inputBuffer.getChannelData(1)
      : null,
  };
  const blockStartFrame = Number.isFinite(runtime.absoluteFrameCursor)
    ? runtime.absoluteFrameCursor
    : 0;
  for (let frame = 0; frame < frames; frame += 1) {
    runtime.absoluteFrame = blockStartFrame + frame;
    const inputLeft = Number(runtime.externalInput.left?.[frame]) || 0;
    const inputRight = Number(runtime.externalInput.right?.[frame]) || inputLeft;
    nodeGraphMvp.live.inputMeterPeak = Math.max(
      nodeGraphMvp.live.inputMeterPeak,
      Math.abs(inputLeft),
      Math.abs(inputRight),
    );
    nodeGraphMvp.live.inputMeterSquareSum += (inputLeft * inputLeft + inputRight * inputRight) * 0.5;
    nodeGraphMvp.live.inputMeterSamples += 1;
    const frameOutput = evaluateNodeGraphPlanFrame(runtime, sampleRate, frame, frames);
    captureNodeGraphLiveModuleScopeFrame(runtime, sampleRate);
    if (nodeGraphOutputSampleClipped(frameOutput.left)) {
      runtime.meterClipCount += 1;
    }
    if (nodeGraphOutputSampleClipped(frameOutput.right)) {
      runtime.meterClipCount += 1;
    }
    if (
      nodeGraphOutputSampleTripsEarProtection(frameOutput.left) ||
      nodeGraphOutputSampleTripsEarProtection(frameOutput.right)
    ) {
      runtime.meterProtectionMuteCount = (runtime.meterProtectionMuteCount || 0) + 1;
      runtime.speakerProtectionPeak = Math.max(
        Number(runtime.speakerProtectionPeak) || 0,
        Number.isFinite(Number(frameOutput.left)) ? Math.abs(Number(frameOutput.left)) : Infinity,
        Number.isFinite(Number(frameOutput.right)) ? Math.abs(Number(frameOutput.right)) : Infinity,
      );
      nodeGraphTripEarProtection({
        source: "live output > 1.0",
        protectionMuteCount: runtime.meterProtectionMuteCount,
        protectionPeak: Number(runtime.speakerProtectionPeak) || 0,
      });
      for (let channel = 0; channel < output.numberOfChannels; channel += 1) {
        output.getChannelData(channel)[frame] = 0;
      }
      continue;
    }
    const protectedFrame = runtime.earProtector?.protect(frameOutput.left, frameOutput.right) || {
      left: frameOutput.left,
      muted: false,
      right: frameOutput.right,
    };
    if (protectedFrame.muted) {
      runtime.meterProtectionMuteCount = (runtime.meterProtectionMuteCount || 0) + 1;
      nodeGraphTripEarProtection({
        source: "live",
        protectionMuteCount: runtime.meterProtectionMuteCount,
      });
    }
    const left = nodeGraphClampOutputSample(protectedFrame.left);
    const right = nodeGraphClampOutputSample(protectedFrame.right);
    const value = Math.max(Math.abs(left), Math.abs(right));
    runtime.meterPeak = Math.max(runtime.meterPeak, Math.abs(value));
    runtime.meterSquareSum += (left * left + right * right) * 0.5;
    runtime.meterSamples += 1;
    for (let channel = 0; channel < output.numberOfChannels; channel += 1) {
      output.getChannelData(channel)[frame] = channel === 0 ? left : right;
    }
  }
  runtime.absoluteFrameCursor = blockStartFrame + frames;
  runtime.externalInput = null;
  nodeGraphSetVisualControls(runtime.visualControls || { screenShake: 0 });
  if (nodeGraphMvp.live.lastEvidence) {
    nodeGraphMvp.live.lastEvidence.visualControls = {
      ...(nodeGraphMvp.live.lastEvidence.visualControls || {}),
      blue: Number(runtime.visualControls?.blue) || 0,
      chromaAlpha: Number(runtime.visualControls?.chromaAlpha) || 0,
      chromaDrift: Number(runtime.visualControls?.chromaDrift) || 0,
      chromaHue: Number(runtime.visualControls?.chromaHue) || 0,
      chromaLightness: Number(runtime.visualControls?.chromaLightness) || 0,
      chromaSaturation: Number(runtime.visualControls?.chromaSaturation) || 0,
      chromaSpread: Number(runtime.visualControls?.chromaSpread) || 0,
      green: Number(runtime.visualControls?.green) || 0,
      red: Number(runtime.visualControls?.red) || 0,
      scopePaused: Number(runtime.visualControls?.scopePaused) || 0,
      scopeTracesOff: Number(runtime.visualControls?.scopeTracesOff) || 0,
      screenDim: Number(runtime.visualControls?.screenDim) || 0,
      screenShake: Number(runtime.visualControls?.screenShake) || 0,
      visualBloom: Number(runtime.visualControls?.visualBloom) || 0,
      visualBrightness: Number(runtime.visualControls?.visualBrightness) || 0,
      visualGlow: Number(runtime.visualControls?.visualGlow) || 0,
      x: Number(runtime.visualControls?.x) || 0,
      y: Number(runtime.visualControls?.y) || 0,
    };
  }
  finishNodeGraphParameterSmoothing(runtime.smoothers, runtime);
  runtime.meterCounter += frames;
  if (runtime.meterCounter >= sampleRate / 10) {
    setNodeGraphLiveInputMeter(
      nodeGraphMvp.live.inputMeterPeak,
      Math.sqrt(nodeGraphMvp.live.inputMeterSquareSum / Math.max(1, nodeGraphMvp.live.inputMeterSamples)),
    );
    setNodeGraphLiveMeter(
      runtime.meterPeak,
      Math.sqrt(runtime.meterSquareSum / Math.max(1, runtime.meterSamples)),
      runtime.meterClipCount,
      runtime.meterProtectionMuteCount || 0,
      runtime.badNumberCount || 0,
      0,
      0,
      0,
    );
    runtime.meterCounter = 0;
    nodeGraphMvp.live.inputMeterPeak = 0;
    nodeGraphMvp.live.inputMeterSamples = 0;
    nodeGraphMvp.live.inputMeterSquareSum = 0;
    runtime.meterClipCount = 0;
    runtime.meterProtectionMuteCount = 0;
    runtime.badNumberCount = 0;
    runtime.meterPeak = 0;
    runtime.meterSamples = 0;
    runtime.meterSquareSum = 0;
  }
}

function nodeGraphStopGpuAdditiveProducer() {
  nodeGraphClearGpuAdditivePrime();
  setNodeGraphGpuAdditiveStatus();
  const state = nodeGraphMvp.live.gpuAdditive;
  if (!state) {
    return;
  }
  if (state.timer) {
    clearInterval(state.timer);
  }
  state.nodes = new Map();
  state.timer = 0;
}

function nodeGraphGpuAdditiveNodeParam(node, key, fallback) {
  return nodeGraphNodeParamNumber(node, key, fallback);
}

function nodeGraphGpuAdditiveNodeVersion(node, sampleRate) {
  const keys = [
    "frequency",
    "harmonics",
    "level",
    "waveform",
    "modA",
    "harmonicPhaseAdd",
    "harmonicPhaseMultiply",
    "dampingFilterFrequency",
  ];
  return [
    node?.id || "",
    Math.round(Number(sampleRate) || 0),
    ...keys.map((key) => `${key}:${nodeGraphGpuAdditiveNodeParam(node, key, "")}`),
  ].join("|");
}

function nodeGraphGpuAdditiveChunkSafe(plan, node) {
  const nodeId = String(node?.id || "");
  if (!nodeId) {
    return false;
  }
  const hasSignalInput = (plan.connections || []).some((connection) =>
    connection.destinationNode === nodeId ||
    connection.toNode === nodeId ||
    connection.targetNode === nodeId
  );
  const hasModulationInput = (plan.modulations || []).some((modulation) =>
    modulation.destinationNode === nodeId ||
    modulation.toNode === nodeId ||
    modulation.targetNode === nodeId
  );
  const hasGraphInput = (plan.graphConnections || []).some((connection) =>
    connection.destinationNode === nodeId ||
    connection.toNode === nodeId ||
    connection.targetNode === nodeId
  );
  return !hasSignalInput && !hasModulationInput && !hasGraphInput;
}

function nodeGraphLivePlanGpuAdditiveNodes(plan = {}) {
  return (plan.nodes || [])
    .filter((node) => node?.type === "gpuAdditiveOsc" && nodeGraphGpuAdditiveChunkSafe(plan, node));
}

function nodeGraphGpuAdditiveParams(node) {
  return {
    dampingFilterFrequency: nodeGraphGpuAdditiveNodeParam(node, "dampingFilterFrequency", 20000),
    frequency: Math.max(0, nodeGraphGpuAdditiveNodeParam(node, "frequency", 220)),
    harmonicPhaseAdd: nodeGraphGpuAdditiveNodeParam(node, "harmonicPhaseAdd", 0),
    harmonicPhaseMultiply: nodeGraphGpuAdditiveNodeParam(node, "harmonicPhaseMultiply", 0),
    harmonics: nodeGraphGpuAdditiveNodeParam(node, "harmonics", 256),
    level: nodeGraphGpuAdditiveNodeParam(node, "level", 0.35),
    modA: nodeGraphGpuAdditiveNodeParam(node, "modA", 0.5),
    phase: nodeGraphPhaseRadians(nodeGraphGpuAdditiveNodeParam(node, "phase", 0)),
    waveform: nodeGraphGpuAdditiveNodeParam(node, "waveform", 1),
  };
}

function nodeGraphSetLivePlanRunningStatus(plan) {
  setNodeGraphLiveOutputMuted(false);
  setNodeGraphLiveStatus("running", "good");
  clearNodeGraphLiveStatusTitle();
  setNodeGraphLiveScheduleStatus(
    nodeGraphScheduleText(
      plan.order,
      [],
      plan.feedbackConnections,
      plan.feedbackModulations,
    ),
    "good",
  );
  renderNodeGraphLiveControls(true);
  if (typeof refreshNodeGraphBadvalMonitorBodies === "function") {
    refreshNodeGraphBadvalMonitorBodies();
  }
}

function nodeGraphClearGpuAdditivePrime() {
  const prime = nodeGraphMvp.live.gpuAdditivePrime;
  if (prime?.timer) {
    window.clearTimeout(prime.timer);
  }
  nodeGraphMvp.live.gpuAdditivePrime = null;
}

function nodeGraphFinishGpuAdditivePrime(reason = "ready") {
  const prime = nodeGraphMvp.live.gpuAdditivePrime;
  if (!prime || prime.planSerial !== nodeGraphMvp.live.planSerial) {
    return false;
  }
  nodeGraphClearGpuAdditivePrime();
  nodeGraphSetLivePlanRunningStatus(prime.plan);
  setNodeGraphLivePlanTitle(`${nodeGraphLivePlanScheduleTitle(prime.plan.order)}\nGPU Additive prime ${reason}`);
  return true;
}

function nodeGraphBeginGpuAdditivePrime(plan) {
  nodeGraphClearGpuAdditivePrime();
  if (!nodeGraphMvp.live.usesWorklet || !nodeGraphLivePlanGpuAdditiveNodes(plan).length) {
    return false;
  }
  setNodeGraphLiveOutputMuted(true);
  setNodeGraphLiveStatus("priming", "warn");
  setNodeGraphLiveScheduleStatus("gpu additive priming", "warn");
  const prime = {
    plan,
    planSerial: nodeGraphMvp.live.planSerial,
    timer: window.setTimeout(() => {
      nodeGraphFinishGpuAdditivePrime("timeout");
    }, 450),
  };
  nodeGraphMvp.live.gpuAdditivePrime = prime;
  return true;
}

const nodeGraphGpuAdditiveChunkFrames = 2048;
const nodeGraphGpuAdditiveDefaultTargetChunks = 6;
const nodeGraphGpuAdditiveMaxTargetChunks = 11;
const nodeGraphGpuAdditiveMaxInFlightChunks = 3;

function nodeGraphGpuAdditiveCanUseWebGpu(params) {
  return params && typeof nodeGraphRenderGpuAdditiveChunk === "function";
}

async function nodeGraphRenderGpuAdditiveProducerChunk(params, chunkFrames, sampleRate, cacheKey = "") {
  if (
    nodeGraphGpuAdditiveCanUseWebGpu(params) &&
    typeof nodeGraphRenderGpuAdditiveChunk === "function"
  ) {
    return nodeGraphRenderGpuAdditiveChunk(params, {
      cacheKey,
      frameCount: chunkFrames,
      sampleRate,
    });
  }
  return {
    backend: "cpu-chunk",
    diagnostics: {
      reason: "WebGPU additive renderer unavailable",
    },
    samples: nodeGraphGpuAdditiveCpuRender(params, chunkFrames, sampleRate),
  };
}

function nodeGraphStartGpuAdditiveProducer(plan, audio) {
  nodeGraphStopGpuAdditiveProducer();
  if (!nodeGraphMvp.live.usesWorklet || !nodeGraphMvp.live.node?.port) {
    return;
  }
  const sampleRate = Math.max(1, Number(audio?.clampedEngineSampleRate) || nodeGraphMvp.sampleRate || 44100);
  const nodes = (plan.nodes || [])
    .filter((node) => node?.type === "gpuAdditiveOsc" && nodeGraphGpuAdditiveChunkSafe(plan, node));
  if (!nodes.length || typeof nodeGraphGpuAdditiveCpuRender !== "function") {
    return;
  }
  const producer = nodeGraphMvp.live.gpuAdditive;
  const chunkFrames = nodeGraphGpuAdditiveChunkFrames;
  const defaultTargetChunks = nodeGraphGpuAdditiveDefaultTargetChunks;
  const maxTargetChunks = nodeGraphGpuAdditiveMaxTargetChunks;
  producer.nodes = new Map(nodes.map((node) => [node.id, {
    completedChunks: new Map(),
    generation: 0,
    inFlightSlots: new Set(),
    nextChunkSequence: 0,
    pendingChunks: 0,
    phase: nodeGraphPhaseRadians(nodeGraphGpuAdditiveNodeParam(node, "phase", 0)),
    queueChunks: 0,
    sendChunkSequence: 0,
    targetChunks: defaultTargetChunks,
    version: nodeGraphGpuAdditiveNodeVersion(node, sampleRate),
  }]));

  const postOrderedGpuAdditiveChunks = (node, state, version) => {
    if (!nodeGraphMvp.live.node?.port || nodeGraphMvp.live.sessionId <= 0) {
      return;
    }
    while (state.completedChunks.has(state.sendChunkSequence)) {
      const chunk = state.completedChunks.get(state.sendChunkSequence);
      state.completedChunks.delete(state.sendChunkSequence);
      state.sendChunkSequence += 1;
      state.backend = chunk.backend;
      state.diagnostics = chunk.diagnostics;
      if (!(chunk.samples instanceof Float32Array) || chunk.samples.length <= 0) {
        continue;
      }
      state.queueChunks += 1;
      nodeGraphMvp.live.node.port.postMessage({
        backend: chunk.backend,
        nodeId: node.id,
        planSerial: nodeGraphMvp.live.planSerial,
        samples: chunk.samples,
        sequence: chunk.sequence,
        sessionId: nodeGraphMvp.live.sessionId,
        type: "gpuAdditiveChunk",
        version,
      }, [chunk.samples.buffer]);
    }
  };

  const reserveGpuAdditiveRenderSlot = (state) => {
    for (let slot = 0; slot < nodeGraphGpuAdditiveMaxInFlightChunks; slot += 1) {
      if (!state.inFlightSlots.has(slot)) {
        state.inFlightSlots.add(slot);
        state.pendingChunks += 1;
        return slot;
      }
    }
    return -1;
  };

  const releaseGpuAdditiveRenderSlot = (state, slot) => {
    if (!state) {
      return;
    }
    state.inFlightSlots.delete(slot);
    state.pendingChunks = Math.max(0, (Number(state.pendingChunks) || 0) - 1);
  };

  const produce = () => {
    if (!nodeGraphMvp.live.node?.port || nodeGraphMvp.live.sessionId <= 0) {
      nodeGraphStopGpuAdditiveProducer();
      return;
    }
    for (const node of nodes) {
      const state = producer.nodes.get(node.id);
      if (!state) {
        continue;
      }
      const version = nodeGraphGpuAdditiveNodeVersion(node, sampleRate);
      if (state.version !== version) {
        state.version = version;
        state.completedChunks.clear();
        state.generation = (Number(state.generation) || 0) + 1;
        state.inFlightSlots.clear();
        state.nextChunkSequence = 0;
        state.pendingChunks = 0;
        state.phase = nodeGraphPhaseRadians(nodeGraphGpuAdditiveNodeParam(node, "phase", 0));
        state.queueChunks = 0;
        state.sendChunkSequence = 0;
        state.targetChunks = defaultTargetChunks;
      }
      const targetChunks = Math.max(1, Math.min(maxTargetChunks, Number(state.targetChunks) || defaultTargetChunks));
      while (
        state.queueChunks + state.pendingChunks + state.completedChunks.size < targetChunks &&
        state.pendingChunks < nodeGraphGpuAdditiveMaxInFlightChunks
      ) {
        const renderSlot = reserveGpuAdditiveRenderSlot(state);
        if (renderSlot < 0) {
          break;
        }
        const renderGeneration = Number(state.generation) || 0;
        const renderSequence = state.nextChunkSequence;
        state.nextChunkSequence += 1;
        const renderPhase = state.phase;
        state.phase = wrapNodeSliderValue(
          state.phase + Math.PI * 2 * Math.max(0, nodeGraphGpuAdditiveNodeParam(node, "frequency", 220)) * (chunkFrames / sampleRate),
          0,
          Math.PI * 2,
        );
        const renderStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const params = {
          ...nodeGraphGpuAdditiveParams(node),
          phase: renderPhase,
        };
        nodeGraphRenderGpuAdditiveProducerChunk(params, chunkFrames, sampleRate, `${node.id}:${renderGeneration}:${renderSlot}`)
        .then((result) => {
          if (
            !nodeGraphMvp.live.node?.port ||
            nodeGraphMvp.live.sessionId <= 0 ||
            producer.nodes.get(node.id) !== state ||
            state.version !== version
          ) {
            return;
          }
          const samples = result?.samples instanceof Float32Array
            ? result.samples
            : new Float32Array(result?.samples || []);
          if (samples.length <= 0) {
            state.backend = "empty";
            state.completedChunks.set(renderSequence, {
              backend: state.backend,
              diagnostics: { empty: true, sequence: renderSequence },
              samples,
              sequence: renderSequence,
            });
            postOrderedGpuAdditiveChunks(node, state, version);
            return;
          }
          state.backend = result?.backend || "unknown";
          const renderEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          const diagnostics = {
            ...(result?.diagnostics || {}),
            generation: renderGeneration,
            renderMs: Math.max(0, renderEndedAt - renderStartedAt),
            pendingChunks: state.pendingChunks,
            renderSlot,
            sequence: renderSequence,
            targetChunks,
          };
          state.completedChunks.set(renderSequence, {
            backend: state.backend,
            diagnostics,
            samples,
            sequence: renderSequence,
          });
          postOrderedGpuAdditiveChunks(node, state, version);
        })
        .catch((error) => {
          const renderEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          state.backend = "cpu-chunk-error";
          const diagnostics = {
            error: error?.message || String(error),
            generation: renderGeneration,
            renderMs: Math.max(0, renderEndedAt - renderStartedAt),
            pendingChunks: state.pendingChunks,
            renderSlot,
            sequence: renderSequence,
            targetChunks,
          };
          const samples = nodeGraphGpuAdditiveCpuRender(params, chunkFrames, sampleRate);
          if (
            !nodeGraphMvp.live.node?.port ||
            nodeGraphMvp.live.sessionId <= 0 ||
            producer.nodes.get(node.id) !== state ||
            state.version !== version
          ) {
            return;
          }
          state.completedChunks.set(renderSequence, {
            backend: "cpu-chunk-error-fallback",
            diagnostics,
            samples,
            sequence: renderSequence,
          });
          postOrderedGpuAdditiveChunks(node, state, version);
        })
        .finally(() => {
          releaseGpuAdditiveRenderSlot(state, renderSlot);
          if (
            nodeGraphMvp.live.node?.port &&
            nodeGraphMvp.live.sessionId > 0 &&
            producer.nodes.get(node.id) === state &&
            state.queueChunks < Math.max(1, Math.min(maxTargetChunks, Number(state.targetChunks) || defaultTargetChunks))
          ) {
            window.setTimeout(produce, 0);
          }
        });
      }
    }
  };

  produce();
  producer.timer = setInterval(produce, 8);
}

function queueNodeGraphLivePatchCommand(command, nodeId = "") {
  const direction = command === "nextPatch" ? 1 : command === "previousPatch" ? -1 : 0;
  if (!direction) {
    return;
  }
  const key = `${command}:${nodeId || ""}`;
  if (!nodeGraphMvp.live.patchCommandQueue) {
    nodeGraphMvp.live.patchCommandQueue = new Set();
  }
  if (nodeGraphMvp.live.patchCommandQueue.has(key)) {
    return;
  }
  nodeGraphMvp.live.patchCommandQueue.add(key);
  window.setTimeout(async () => {
    nodeGraphMvp.live.patchCommandQueue?.delete(key);
    await loadAdjacentNodeGraphSavedPatch(direction);
  }, 0);
}

function handleNodeGraphLiveWorkletMessage(event) {
  const message = event.data || {};
  if (message.type === "meter") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    setNodeGraphLiveInputMeter(
      Number(message.inputPeak) || 0,
      Number(message.inputRms) || 0,
    );
    setNodeGraphLiveMeter(
      Number(message.peak) || 0,
      Number(message.rms) || 0,
      Number(message.clipCount) || 0,
      Number(message.protectionMuteCount) || 0,
      Number(message.badNumberCount) || 0,
      Number(message.overrunCount) || 0,
      Number(message.maxBlockProcessMs) || 0,
      Number(message.maxBlockBudgetRatio) || 0,
    );
    if (typeof syncNodeGraphAudioPlayerRuntimeStatus === "function") {
      syncNodeGraphAudioPlayerRuntimeStatus({
        nodeId: message.audioPlayerNodeId || "",
        nodeIds: message.audioPlayerNodeIds || [],
        peak: Number(message.audioPlayerPeak) || 0,
        phase: Number(message.audioPlayerPhase) || 0,
        reason: message.audioPlayerReason || "",
        samples: Number(message.audioPlayerSamples) || 0,
      });
    }
    if (Number(message.badNumberCount) > 0) {
      nodeGraphRecordBadValueEvent({
        count: Number(message.badNumberCount) || 1,
        engine: "worklet",
        force: Boolean(message.lastBadValueNodeId),
        nodeId: message.lastBadValueNodeId || "",
        reason: message.lastBadValueReason || "bad",
        source: message.lastBadValueSource || "worklet meter",
      });
      if (message.lastBadValueNodeId && typeof nodeGraphTrackNodeSilenceWindow === "function") {
        nodeGraphTrackNodeSilenceWindow(message.lastBadValueNodeId, true, message.lastBadValueReason || "bad");
      }
    } else if (typeof nodeGraphClearAllTrackedModuleSilence === "function") {
      nodeGraphClearAllTrackedModuleSilence();
    }
    if (Number(message.protectionMuteCount) > 0) {
      nodeGraphTripEarProtection({
        nodeId: message.protectionNodeId || "",
        protectionPeak: Number(message.protectionPeak) || 0,
        source: "Worklet",
        protectionMuteCount: Number(message.protectionMuteCount) || 0,
      });
    }
  } else if (message.type === "nativeModuleStatus") {
    setNodeGraphLiveEvidence("native-module", message);
    if (message.status && message.status !== "ready") {
      const underConstruction = typeof nodeGraphNativeModuleRefIsUnderConstruction === "function"
        && nodeGraphNativeModuleRefIsUnderConstruction(message);
      // UC modules: keep evidence for debugging, but no plan-status warn and
      // no SE.ERROR (nodeGraphRecordModuleFault also no-ops for UC).
      if (!underConstruction) {
        setNodeGraphLivePlanStatus(
          `${message.name || "native module"} ${message.status}`,
          "warn",
        );
        if (typeof nodeGraphRecordNativeModuleFault === "function") {
          nodeGraphRecordNativeModuleFault(message);
        }
      }
      // Un-mark the module in the lazy-send dedupe set so the next full
      // plan update retries it -- without this, one transient instantiate
      // failure (e.g. a momentary wasm-memory squeeze) would pin the module
      // to its JS fallback until page reload.
      if (message.status === "error" && message.name) {
        nodeGraphMvp.live.node?.nodeGraphSentNativeModules?.delete(String(message.name));
      }
    }
  } else if (message.type === "patchCommand") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    queueNodeGraphLivePatchCommand(message.command, message.nodeId || "");
  } else if (message.type === "planApplied") {
    if (
      message.sessionId !== nodeGraphMvp.live.sessionId ||
      message.planSerial !== nodeGraphMvp.live.planSerial ||
      !nodeGraphMvp.live.node
    ) {
      return;
    }
    setNodeGraphLiveEvidence("plan-applied", message);
    setNodeGraphLivePlanStatus(nodeGraphLivePlanAppliedStatusText(message), "good");
    setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(message.order));
  } else if (message.type === "scope") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    pushNodeGraphLiveModuleScopeSnapshot(message.values || [], {
      patchFingerprint: message.patchFingerprint || nodeGraphPatchFingerprint(),
      sampleRate: message.sampleRate || nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    });
    if (Array.isArray(message.dataPorts) && message.dataPorts.length) {
      for (const [nodeId, port, value] of message.dataPorts) {
        writeNodeGraphDataOutput(String(nodeId), port, value);
      }
    }
  } else if (message.type === "visualControls") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    nodeGraphSetVisualControls({
      blue: Number(message.blue) || 0,
      chromaAlpha: Number(message.chromaAlpha) || 0,
      chromaDrift: Number(message.chromaDrift) || 0,
      chromaHue: Number(message.chromaHue) || 0,
      chromaLightness: Number(message.chromaLightness) || 0,
      chromaSaturation: Number(message.chromaSaturation) || 0,
      chromaSpread: Number(message.chromaSpread) || 0,
      green: Number(message.green) || 0,
      red: Number(message.red) || 0,
      scopePaused: Number(message.scopePaused) || 0,
      scopeTracesOff: Number(message.scopeTracesOff) || 0,
      screenDim: Number(message.screenDim) || 0,
      screenShake: Number(message.screenShake) || 0,
      visualBloom: Number(message.visualBloom) || 0,
      visualBrightness: Number(message.visualBrightness) || 0,
      visualGlow: Number(message.visualGlow) || 0,
      x: Number(message.x) || 0,
      y: Number(message.y) || 0,
    });
    if (nodeGraphMvp.live.lastEvidence) {
      nodeGraphMvp.live.lastEvidence.visualControls = {
        ...(nodeGraphMvp.live.lastEvidence.visualControls || {}),
        blue: Number(message.blue) || 0,
        chromaAlpha: Number(message.chromaAlpha) || 0,
        chromaDrift: Number(message.chromaDrift) || 0,
        chromaHue: Number(message.chromaHue) || 0,
        chromaLightness: Number(message.chromaLightness) || 0,
        chromaSaturation: Number(message.chromaSaturation) || 0,
        chromaSpread: Number(message.chromaSpread) || 0,
        green: Number(message.green) || 0,
        red: Number(message.red) || 0,
        scopePaused: Number(message.scopePaused) || 0,
        scopeTracesOff: Number(message.scopeTracesOff) || 0,
        screenDim: Number(message.screenDim) || 0,
        screenShake: Number(message.screenShake) || 0,
        visualBloom: Number(message.visualBloom) || 0,
        visualBrightness: Number(message.visualBrightness) || 0,
        visualGlow: Number(message.visualGlow) || 0,
        x: Number(message.x) || 0,
        y: Number(message.y) || 0,
      };
    }
  } else if (message.type === "gpuAdditiveStatus") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    const producer = nodeGraphMvp.live.gpuAdditive;
    const enhancedQueues = (message.queues || []).map((queue) => {
      const state = producer?.nodes?.get?.(queue.nodeId);
      if (state) {
        state.queueChunks = Math.max(0, Number(queue.chunks) || 0);
        const underruns = Math.max(0, Number(message.underruns) || 0);
        const droppedChunks = Math.max(0, Number(queue.droppedChunks) || 0);
        if (underruns > 0 || droppedChunks > 0) {
          state.targetChunks = Math.min(
            nodeGraphGpuAdditiveMaxTargetChunks,
            (Number(state.targetChunks) || nodeGraphGpuAdditiveDefaultTargetChunks) + 1,
          );
        } else if (
          state.queueChunks > nodeGraphGpuAdditiveDefaultTargetChunks + 2 &&
          Number(queue.samples) > nodeGraphGpuAdditiveChunkFrames * (nodeGraphGpuAdditiveDefaultTargetChunks + 1)
        ) {
          state.targetChunks = Math.max(
            nodeGraphGpuAdditiveDefaultTargetChunks,
            (Number(state.targetChunks) || nodeGraphGpuAdditiveDefaultTargetChunks) - 1,
          );
        }
      }
      return {
        ...queue,
        diagnostics: {
          ...(state?.diagnostics || {}),
          droppedChunks: Math.max(0, Number(queue.droppedChunks) || 0),
          expectedSequence: Math.max(0, Number(queue.expectedSequence) || 0),
          heldGain: Number.isFinite(Number(queue.heldGain)) ? Number(queue.heldGain) : 1,
          heldSamples: Math.max(0, Number(queue.heldSamples) || 0),
          resetCount: Math.max(0, Number(queue.resetCount) || 0),
          targetChunks: Math.max(
            1,
            Math.min(
              nodeGraphGpuAdditiveMaxTargetChunks,
              Number(state?.targetChunks) || nodeGraphGpuAdditiveDefaultTargetChunks,
            ),
          ),
        },
      };
    });
    if (nodeGraphMvp.live.lastEvidence) {
      nodeGraphMvp.live.lastEvidence.gpuAdditive = {
        queues: enhancedQueues,
        underruns: Number(message.underruns) || 0,
      };
    }
    setNodeGraphGpuAdditiveStatus({
      queues: enhancedQueues,
      underruns: Number(message.underruns) || 0,
    });
    if (enhancedQueues.some((queue) => Number(queue.samples) > 0 || Number(queue.chunks) > 0)) {
      nodeGraphFinishGpuAdditivePrime("ready");
    }
  } else if (message.type === "paramsApplied") {
    if (
      message.sessionId !== nodeGraphMvp.live.sessionId ||
      message.planSerial !== nodeGraphMvp.live.planSerial ||
      !nodeGraphMvp.live.node
    ) {
      return;
    }
    setNodeGraphLiveEvidence("params-applied", message);
    setNodeGraphLivePlanStatus(nodeGraphLiveParametersAppliedStatusText(message), "good");
    setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(message.order));
  }
}
function nodeGraphLivePlanErrorIssues(error) {
  return Array.isArray(error?.issues) && error.issues.length
    ? error.issues.map((issue) => String(issue))
    : [String(error?.message || error || "unknown live plan failure")];
}

function nodeGraphLivePlanIssueRemovesOutputRoute(issue) {
  return issue === "output node missing" || issue === "missing Output speaker input";
}

function nodeGraphCurrentPatchHasSpeakerOutputRoute() {
  try {
    const plan = compileNodeGraphExecutionPlan(nodeGraphMvp.patch);
    const issues = Array.isArray(plan?.issues) ? plan.issues.map((issue) => String(issue)) : [];
    return Boolean(plan?.speakerOutputActive) && !issues.some(nodeGraphLivePlanIssueRemovesOutputRoute);
  } catch (_error) {
    return false;
  }
}

function nodeGraphShouldPreservePreviousLivePlanAfterError(error) {
  const issues = nodeGraphLivePlanErrorIssues(error);
  if (issues.some(nodeGraphLivePlanIssueRemovesOutputRoute)) {
    return false;
  }
  return nodeGraphCurrentPatchHasSpeakerOutputRoute();
}

function nodeGraphLivePlanShapeSignature(plan = {}) {
  return JSON.stringify({
    nodes: (Array.isArray(plan.nodes) ? plan.nodes : []).map((node) => [node.id, node.type]),
    order: Array.isArray(plan.order) ? plan.order : [],
    outputNode: plan.outputNode || "output",
    samples: (Array.isArray(plan.samples) ? plan.samples : []).map((sample) => sample?.id || ""),
    scopeCaptureNodeIds: Array.isArray(plan.scopeCaptureNodeIds) ? plan.scopeCaptureNodeIds : [],
    visualSinks: (Array.isArray(plan.visualSinks) ? plan.visualSinks : []).map((sink) => [
      sink.nodeId,
      sink.displayType,
      (Array.isArray(sink.bufferedInputs) ? sink.bufferedInputs : []).join(","),
    ]),
  });
}

function nodeGraphLiveConnectionUpdatePayload(plan = {}, audio = {}) {
  const pitchReference = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const graphData = {};
  for (const node of plan.nodes || []) {
    if (nodeGraphModuleIsGraphType(node.type) && node.graph) {
      graphData[node.id] = node.graph;
    }
  }
  return {
    connections: Array.isArray(plan.connections) ? plan.connections : [],
    engineSampleRate: audio.clampedEngineSampleRate,
    graphConnections: Array.isArray(plan.graphConnections) ? plan.graphConnections : [],
    graphData: Object.keys(graphData).length > 0 ? graphData : undefined,
    modulations: Array.isArray(plan.modulations) ? plan.modulations : [],
    outputNode: plan.outputNode || "output",
    oversamplingRatio: audio.oversamplingRatio,
    patchFingerprint: plan.patchFingerprint,
    pitchReferenceHz: pitchReference.pitchReferenceHz,
    pitchReferenceMidiNote: pitchReference.pitchReferenceMidiNote,
    planSerial: nodeGraphMvp.live.planSerial,
    sampleRate: nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    scopeCaptureNodeIds: Array.isArray(plan.scopeCaptureNodeIds) ? plan.scopeCaptureNodeIds : [],
    sessionId: nodeGraphMvp.live.sessionId,
    type: "setConnections",
    visualSinks: Array.isArray(plan.visualSinks) ? plan.visualSinks : [],
  };
}

/**
 * Push the current patch plan into the live engine.
 * @returns {Promise<boolean>} true if the plan applied (or was intentionally
 *   preserved after a recoverable error); false if audio was muted/stopped.
 */
async function sendNodeGraphLivePlan() {
  if (!nodeGraphMvp.live.node && !nodeGraphMvp.live.context) {
    return false;
  }
  const hadLivePlan = Boolean(
    nodeGraphMvp.live.planEvidence ||
    nodeGraphMvp.live.runtime ||
    nodeGraphMvp.live.planSerial > 0 ||
    nodeGraphMvp.live.activeNodeIds?.size,
  );

  try {
    const plan = nodeGraphBuildLivePlan();
    if (typeof nodeGraphEnsureLiveSamplesForPlan === "function") {
      await nodeGraphEnsureLiveSamplesForPlan(plan, nodeGraphMvp.patch);
    }
    const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);
    const planShapeSignature = nodeGraphLivePlanShapeSignature(plan);
    const canSendConnectionUpdate = Boolean(
      hadLivePlan &&
      nodeGraphMvp.live.planShapeSignature &&
      nodeGraphMvp.live.planShapeSignature === planShapeSignature,
    );
    nodeGraphMvp.live.activeNodeIds = new Set(plan.order);
    beginNodeGraphLiveModuleScopeCapture(plan, {
      sampleRate: nodeGraphMvp.live.usesWorklet
        ? audio.clampedEngineSampleRate
        : nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    });
    nodeGraphMvp.live.planSerial += 1;
    nodeGraphMvp.live.planEvidence = nodeGraphLivePlanEvidenceDetails(plan, {
      engineSampleRate: audio.clampedEngineSampleRate,
      oversamplingRatio: audio.oversamplingRatio,
      planSerial: nodeGraphMvp.live.planSerial,
      sampleRate: nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    });
    if (nodeGraphMvp.live.usesWorklet) {
      setNodeGraphLiveEvidence("plan-sent", nodeGraphMvp.live.planEvidence);
      setNodeGraphLivePlanStatus(nodeGraphLivePlanSentStatusText(), "warn");
      setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(plan.order));
      if (canSendConnectionUpdate) {
        nodeGraphMvp.live.node?.port?.postMessage(nodeGraphLiveConnectionUpdatePayload(plan, audio));
      } else {
        {
          const pitchReference = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
          nodeGraphMvp.live.node?.port?.postMessage({
            engineSampleRate: audio.clampedEngineSampleRate,
            oversamplingRatio: audio.oversamplingRatio,
            plan,
            patchFingerprint: plan.patchFingerprint,
            pitchReferenceHz: pitchReference.pitchReferenceHz,
            pitchReferenceMidiNote: pitchReference.pitchReferenceMidiNote,
            planSerial: nodeGraphMvp.live.planSerial,
            sampleRate: nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
            sessionId: nodeGraphMvp.live.sessionId,
            type: "setPlan",
          });
          sendNodeGraphLiveSpeed();
          sendNodeGraphLiveSpeedLimit();
        }
        // Lazily send wasm for any native module type this plan introduced
        // (no-op for already-sent modules; see sendNodeGraphLiveNativeModules).
        // Await so cold-start does not race "running" UI ahead of the plan.
        if (typeof sendNodeGraphLiveNativeModules === "function") {
          await sendNodeGraphLiveNativeModules(nodeGraphMvp.live.node, plan);
        }
        nodeGraphStartGpuAdditiveProducer(plan, audio);
      }
    } else if (nodeGraphMvp.live.runtime) {
      if (canSendConnectionUpdate && typeof updateNodeGraphLiveRuntimeConnections === "function") {
        updateNodeGraphLiveRuntimeConnections(nodeGraphMvp.live.runtime, plan);
      } else {
        updateNodeGraphLiveRuntimePlan(nodeGraphMvp.live.runtime, plan);
      }
      setNodeGraphLiveEvidence("plan-applied", nodeGraphMvp.live.planEvidence);
      setNodeGraphLivePlanStatus(nodeGraphLivePlanStatusText(plan), "good");
      setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(plan.order));
    } else {
      nodeGraphMvp.live.runtime = createNodeGraphLiveRuntime(plan, nodeGraphMvp.live.runtime);
      setNodeGraphLiveEvidence("plan-applied", nodeGraphMvp.live.planEvidence);
      setNodeGraphLivePlanStatus(nodeGraphLivePlanStatusText(plan), "good");
      setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(plan.order));
    }
    if (!nodeGraphBeginGpuAdditivePrime(plan)) {
      nodeGraphSetLivePlanRunningStatus(plan);
    }
    nodeGraphMvp.live.planShapeSignature = planShapeSignature;
    // Plan applied — never leave host gain muted from a prior error.
    setNodeGraphLiveOutputMuted(false);
    return true;
  } catch (error) {
    const issues = nodeGraphLivePlanErrorIssues(error);
    nodeGraphClearGpuAdditivePrime();
    error.issues = issues;
    const canPreservePlan = hadLivePlan && nodeGraphShouldPreservePreviousLivePlanAfterError(error);
    if (!canPreservePlan) {
      // Cold / non-recoverable plan failure: full tear-down, not a muted zombie
      // worklet (muted + status error was painting red stop with no audio).
      setNodeGraphLiveOutputMuted(true);
      nodeGraphMvp.live.runtime = null;
      try {
        nodeGraphMvp.live.node?.port?.postMessage({
          type: "stop",
          sessionId: nodeGraphMvp.live.sessionId,
          planSerial: nodeGraphMvp.live.planSerial,
        });
      } catch (_error) {
        // Worklet may already be dead.
      }
      setNodeGraphLiveBlockedError("plan", error, { preservePreviousPlan: false });
      return false;
    }
    setNodeGraphLiveBlockedError("plan", error, { preservePreviousPlan: true });
    return true;
  }
}

/**
 * Push graph control-point data into the live engine without a full plan rebuild.
 * Call while dragging graph dots so Out tracks the curve in realtime; pointer-up
 * still commits history via commitNodeGraphPatch.
 */
function sendNodeGraphLiveGraphData(graphDataByNodeId = {}) {
  const entries = Object.entries(graphDataByNodeId || {}).filter(
    ([nodeId, graph]) => nodeId && graph && typeof graph === "object",
  );
  if (!entries.length) {
    return false;
  }
  const graphData = Object.fromEntries(
    entries.map(([nodeId, graph]) => [
      nodeId,
      typeof normalizeNodeGraphGraph === "function" ? normalizeNodeGraphGraph(graph) : graph,
    ]),
  );
  // Keep the main-thread patch + offline runtime in lockstep with the face.
  for (const [nodeId, graph] of Object.entries(graphData)) {
    const patchNode = nodeGraphMvp.patch?.nodes?.find((node) => node.id === nodeId);
    if (patchNode && typeof nodeGraphModuleIsGraphType === "function" && nodeGraphModuleIsGraphType(patchNode.type)) {
      patchNode.graph = graph;
    }
    const runtimeNode = nodeGraphMvp.live?.runtime?.nodes?.get?.(nodeId);
    if (runtimeNode) {
      runtimeNode.graph = graph;
    }
  }
  if (nodeGraphMvp.live?.usesWorklet && nodeGraphMvp.live?.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      graphData,
      sessionId: nodeGraphMvp.live.sessionId,
      type: "setGraphData",
    });
    return true;
  }
  return Boolean(nodeGraphMvp.live?.runtime);
}

/** rAF-coalesce graph-data pushes during pointer moves (one post per frame). */
function scheduleNodeGraphLiveGraphData(nodeId, graph) {
  const id = String(nodeId || "").trim();
  if (!id || !graph) {
    return;
  }
  if (!(nodeGraphMvp._pendingLiveGraphData instanceof Map)) {
    nodeGraphMvp._pendingLiveGraphData = new Map();
  }
  nodeGraphMvp._pendingLiveGraphData.set(
    id,
    typeof normalizeNodeGraphGraph === "function" ? normalizeNodeGraphGraph(graph) : graph,
  );
  if (nodeGraphMvp._pendingLiveGraphDataFrame) {
    return;
  }
  nodeGraphMvp._pendingLiveGraphDataFrame = window.requestAnimationFrame(() => {
    nodeGraphMvp._pendingLiveGraphDataFrame = 0;
    const pending = nodeGraphMvp._pendingLiveGraphData;
    nodeGraphMvp._pendingLiveGraphData = null;
    if (!pending?.size) {
      return;
    }
    sendNodeGraphLiveGraphData(Object.fromEntries(pending));
  });
}

function sendNodeGraphLiveParameterUpdate() {
  if (!nodeGraphMvp.live.node && !nodeGraphMvp.live.context) {
    return;
  }

  try {
    const nodes = nodeGraphBuildLiveParameterNodes(nodeGraphMvp.live.activeNodeIds);
    const patchFingerprint = nodeGraphPatchFingerprint();
    const now = performance.now();
    const previous = Number(nodeGraphMvp.live.lastParameterUpdateTime) || 0;
    const measuredSeconds = previous > 0 ? (now - previous) / 1000 : nodeGraphMvp.live.autoSmoothingSeconds;
    nodeGraphMvp.live.lastParameterUpdateTime = now;
    if (!nodeGraphMvp.live.autoSmoothingManual) {
      nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(
        (Number(nodeGraphMvp.live.autoSmoothingSeconds) || nodeGraphAutoSmoothingDefaultSeconds) * 0.82 +
        clampNodeGraphAutoSmoothingSeconds(measuredSeconds) * 0.18,
      );
    } else {
      nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(nodeGraphMvp.live.autoSmoothingSeconds);
    }
    const autoSmoothingSeconds = nodeGraphMvp.live.autoSmoothingSeconds;
    syncNodeGraphGlobalSmoothingControl();
    nodeGraphMvp.live.planSerial += 1;
    if (nodeGraphMvp.live.usesWorklet) {
      setNodeGraphLiveEvidence("params-sent", {
        autoSmoothingSeconds,
        nodeCount: nodes.length,
        parameterCount: nodeGraphLiveParameterCount(nodes),
        patchFingerprint,
        planSerial: nodeGraphMvp.live.planSerial,
      });
      setNodeGraphLivePlanStatus(nodeGraphLiveParametersSentStatusText(nodes), "warn");
      nodeGraphMvp.live.node?.port?.postMessage({
        nodes,
        autoSmoothingSeconds,
        patchFingerprint,
        planSerial: nodeGraphMvp.live.planSerial,
        sessionId: nodeGraphMvp.live.sessionId,
        type: "setParams",
      });
    } else if (nodeGraphMvp.live.runtime) {
      nodeGraphMvp.live.runtime.autoSmoothingSeconds = autoSmoothingSeconds;
      updateNodeGraphLiveRuntimeParameters(nodeGraphMvp.live.runtime, nodes);
      setNodeGraphLiveEvidence("params-applied", {
        autoSmoothingSeconds,
        nodeCount: nodes.length,
        parameterCount: nodeGraphLiveParameterCount(nodes),
        patchFingerprint,
        planSerial: nodeGraphMvp.live.planSerial,
      });
      setNodeGraphLivePlanStatus(
        nodeGraphLiveParametersAppliedStatusText({
          nodeCount: nodes.length,
          parameterCount: nodeGraphLiveParameterCount(nodes),
          patchFingerprint,
          planSerial: nodeGraphMvp.live.planSerial,
        }),
        "good",
      );
    }
    setNodeGraphLiveStatus("running", "good");
    clearNodeGraphLiveStatusTitle();
  } catch (error) {
    setNodeGraphLiveBlockedError("params", error, { schedule: false });
  }
}

function sendNodeGraphLiveMidiKeyboardSignal(signal = nodeGraphMvp.midiKeyboardSignal) {
  const payload = signal && typeof signal === "object" ? { ...signal } : null;
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.midiKeyboardSignal = payload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      signal: payload,
      type: "setMidiKeyboardSignal",
    });
  }
}

function sendNodeGraphLiveMacroControls(values = nodeGraphMvp.macroControls) {
  const payload = Array.from({ length: 8 }, (_, index) => (
    Math.max(0, Math.min(1, Number(values?.[index]) || 0))
  ));
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.macroControls = payload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      values: payload,
      type: "setMacroControls",
    });
  }
}

function sendNodeGraphLiveMidiKeyboardHeldKeysBitmask(
  low = nodeGraphMvp.midiKeyboardHeldKeysLowBitmask,
  high = nodeGraphMvp.midiKeyboardHeldKeysHighBitmask,
) {
  const safeLow = Math.floor(Number(low));
  const safeHigh = Math.floor(Number(high));
  const lowPayload = Number.isFinite(safeLow) && safeLow >= 0 ? safeLow : 0;
  const highPayload = Number.isFinite(safeHigh) && safeHigh >= 0 ? safeHigh : 0;
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.midiKeyboardHeldKeysLowBitmask = lowPayload;
    nodeGraphMvp.live.runtime.midiKeyboardHeldKeysHighBitmask = highPayload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      high: highPayload,
      low: lowPayload,
      type: "setMidiKeyboardHeldKeysBitmask",
    });
  }
}

function nodeGraphPitchModWheelPayload() {
  return {
    mod: Math.max(0, Math.min(1, Number(nodeGraphMvp.modWheelSignal) || 0)),
    pitch: Math.max(-1, Math.min(1, Number(nodeGraphMvp.pitchWheelSignal) || 0)),
  };
}

function sendNodeGraphLivePitchModWheelSignal(signal = nodeGraphPitchModWheelPayload()) {
  const source = signal && typeof signal === "object" ? signal : {};
  const pitch = Number(source.pitch);
  const payload = {
    mod: Math.max(0, Math.min(1, Number(source.mod) || 0)),
    pitch: Math.max(-1, Math.min(1, Number.isFinite(pitch) ? pitch : 0)),
  };
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.pitchModWheelSignal = payload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      signal: payload,
      type: "setPitchModWheelSignal",
    });
  }
}

function nodeGraphGlobalSmoothingSamples() {
  return nodeGraphSmoothingSamplesFromSeconds(
    nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
  );
}

function nodeGraphGlobalSmoothingSeconds() {
  return clampNodeGraphAutoSmoothingSeconds(
    nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
  );
}

function formatNodeGraphGlobalSmoothingSeconds(seconds) {
  const value = clampNodeGraphAutoSmoothingSeconds(seconds);
  if (typeof limit_decimals === "function") {
    return limit_decimals(String(value), 5, 3, 4, false);
  }
  return value.toFixed(4).replace(/0$/, "");
}

// Scene-context widget + header "Smooth Time" field next to Speed Limit.
function nodeGraphGlobalSmoothingInputElements() {
  return Array.from(document.querySelectorAll(
    "#nodeSceneGlobalSmoothingSeconds, [data-global-smoothing-seconds='true']",
  ));
}

function syncNodeGraphGlobalSmoothingControl(options = {}) {
  const text = formatNodeGraphGlobalSmoothingSeconds(nodeGraphGlobalSmoothingSeconds());
  for (const input of nodeGraphGlobalSmoothingInputElements()) {
    if (!options.force && document.activeElement === input) {
      continue;
    }
    input.value = text;
  }
}

function setNodeGraphGlobalSmoothingSamples(samples, options = {}) {
  setNodeGraphGlobalSmoothingSeconds(nodeGraphSmoothingSecondsFromSamples(samples), options);
}

function setNodeGraphGlobalSmoothingSeconds(seconds, options = {}) {
  const normalized = clampNodeGraphAutoSmoothingSeconds(seconds);
  nodeGraphMvp.live.autoSmoothingSeconds = normalized;
  nodeGraphMvp.live.autoSmoothingManual = options.manual !== false;
  syncNodeGraphGlobalSmoothingControl({ force: true });
  scheduleNodeGraphLiveParameterSync();
  if (typeof saveNodeGraphWorkspaceViewToUserSettings === "function") {
    saveNodeGraphWorkspaceViewToUserSettings({ status: false });
  }
}

// Log-space drag for Smooth Time: much finer near 0 (sample / sub-ms), still
// reaches multi-second values without endless linear scrubbing.
// Value ≈ exp(log(start + ε) + pixels · rate) − ε
const nodeGraphGlobalSmoothingDragLogEps = 1e-4; // ~0.1 ms floor for log map
const nodeGraphGlobalSmoothingDragLogRate = 0.012; // ~1 decade per ~192 px

function nodeGraphGlobalSmoothingDragMultiplier(event) {
  const multiplier = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

/** @deprecated linear step — kept for any external callers; drag uses log map. */
function nodeGraphGlobalSmoothingDragStep(event) {
  const multiplier = nodeGraphGlobalSmoothingDragMultiplier(event);
  // Scale with current value so near-0 stays fine even if something still calls this.
  const v = nodeGraphGlobalSmoothingSeconds();
  return Math.max(2e-5, 5e-5 + v * 0.02) * multiplier;
}

function nodeGraphGlobalSmoothingSecondsFromDragDelta(startSeconds, pixelDelta, event) {
  const eps = nodeGraphGlobalSmoothingDragLogEps;
  const rate = nodeGraphGlobalSmoothingDragLogRate * nodeGraphGlobalSmoothingDragMultiplier(event);
  const start = Math.max(0, Number(startSeconds) || 0);
  const next = Math.exp(Math.log(start + eps) + pixelDelta * rate) - eps;
  // Snap tiny values to exact 0 so “off” is reachable without hunting.
  if (next < eps * 0.25) {
    return 0;
  }
  return clampNodeGraphAutoSmoothingSeconds(next);
}

function nodeGraphGlobalSmoothingInputFromEvent(event) {
  const target = event?.currentTarget;
  if (target instanceof HTMLInputElement) {
    return target;
  }
  if (target instanceof Element) {
    return target.querySelector?.("input[data-global-smoothing-seconds='true'], #nodeSceneGlobalSmoothingSeconds")
      || null;
  }
  return document.getElementById("nodeSceneGlobalSmoothingSeconds")
    || document.querySelector("[data-global-smoothing-seconds='true']");
}

function handleNodeGraphGlobalSmoothingSecondsChange(event) {
  const input = nodeGraphGlobalSmoothingInputFromEvent(event);
  if (!input) {
    return;
  }
  setNodeGraphGlobalSmoothingSeconds(input.value);
  for (const el of nodeGraphGlobalSmoothingInputElements()) {
    el.readOnly = true;
  }
}

function handleNodeGraphGlobalSmoothingSecondsKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  handleNodeGraphGlobalSmoothingSecondsChange(event);
  event.currentTarget?.blur?.();
}

function beginNodeGraphGlobalSmoothingSecondsEdit(event) {
  const input = nodeGraphGlobalSmoothingInputFromEvent(event);
  if (!input) {
    return;
  }
  input.readOnly = false;
  input.focus();
  input.select();
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphGlobalSmoothingSecondsDrag(event) {
  const input = nodeGraphGlobalSmoothingInputFromEvent(event);
  if (!input || event.button > 0 || event.detail > 1) {
    return;
  }
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const resetToDefaultOnClick = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
  nodeGraphMvp.globalSmoothingSecondsDragging = {
    input,
    moved: false,
    pointerId: event.pointerId ?? null,
    resetToDefaultOnClick,
    startValue: nodeGraphGlobalSmoothingSeconds(),
    startX: event.clientX,
    startY: event.clientY,
    fineScale: nodeGraphGlobalSmoothingDragMultiplier(event),
  };
  input.readOnly = true;
  input.classList.add("value-dragging");
  input.closest(".scene-context-global-smoothing-control, .node-header-timing-field")
    ?.classList.add("value-dragging");
  if (event.pointerId !== undefined) {
    input.setPointerCapture?.(event.pointerId);
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphGlobalSmoothingSeconds(event) {
  const drag = nodeGraphMvp.globalSmoothingSecondsDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  if (
    typeof nodeGraphPointerDragExceededMoveThreshold === "function"
      ? nodeGraphPointerDragExceededMoveThreshold(drag.startX, drag.startY, event.clientX, event.clientY, 1)
      : (Math.abs(event.clientX - drag.startX) > 1 || Math.abs(drag.startY - event.clientY) > 1)
  ) {
    drag.moved = true;
  }
  if (drag.resetToDefaultOnClick && !drag.moved) {
    event.preventDefault();
    return;
  }
  // Re-anchor when Shift/Ctrl fine scale changes mid-drag (no jump).
  const currentScale = nodeGraphGlobalSmoothingDragMultiplier(event);
  if (currentScale !== drag.fineScale) {
    drag.startValue = nodeGraphGlobalSmoothingSeconds();
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.fineScale = currentScale;
    event.preventDefault();
    return;
  }
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : {
      combined: (event.clientX - drag.startX) + (drag.startY - event.clientY),
    };
  setNodeGraphGlobalSmoothingSeconds(
    nodeGraphGlobalSmoothingSecondsFromDragDelta(drag.startValue, axes.combined, event),
  );
  event.preventDefault();
}

function endNodeGraphGlobalSmoothingSecondsDrag(event) {
  const drag = nodeGraphMvp.globalSmoothingSecondsDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  if (drag.resetToDefaultOnClick && !drag.moved) {
    setNodeGraphGlobalSmoothingSeconds(nodeGraphDefaultSmoothingBlockSeconds());
  }
  drag.input.classList.remove("value-dragging");
  drag.input.closest(".scene-context-global-smoothing-control, .node-header-timing-field")
    ?.classList.remove("value-dragging");
  drag.input.readOnly = true;
  if (event.pointerId !== undefined && drag.input.hasPointerCapture?.(event.pointerId)) {
    drag.input.releasePointerCapture(event.pointerId);
  }
  nodeGraphMvp.globalSmoothingSecondsDragging = null;
  event.preventDefault();
}

function scheduleNodeGraphLiveSync(mode = "plan") {
  if (!nodeGraphMvp.live.node || nodeGraphMvp.live.syncFrame || nodeGraphMvp.live.syncTimer) {
    if (mode === "plan") {
      nodeGraphMvp.live.syncMode = "plan";
    }
    return;
  }
  nodeGraphMvp.live.syncMode = mode;
  const flush = () => flushNodeGraphLivePlanSync();
  nodeGraphMvp.live.syncFrame = window.requestAnimationFrame(flush);
  nodeGraphMvp.live.syncTimer = window.setTimeout(flush, 50);
}

function scheduleNodeGraphLivePlanSync() {
  scheduleNodeGraphLiveSync("plan");
}

function scheduleNodeGraphLiveParameterSync() {
  scheduleNodeGraphLiveSync("params");
}

function clearNodeGraphLivePlanSync() {
  if (nodeGraphMvp.live.syncFrame) {
    window.cancelAnimationFrame(nodeGraphMvp.live.syncFrame);
    nodeGraphMvp.live.syncFrame = 0;
  }
  if (nodeGraphMvp.live.syncTimer) {
    window.clearTimeout(nodeGraphMvp.live.syncTimer);
    nodeGraphMvp.live.syncTimer = 0;
  }
}

function flushNodeGraphLivePlanSync() {
  const mode = nodeGraphMvp.live.syncMode || "plan";
  nodeGraphMvp.live.syncMode = "";
  clearNodeGraphLivePlanSync();
  if (mode === "params") {
    sendNodeGraphLiveParameterUpdate();
  } else {
    sendNodeGraphLivePlan();
  }
}

async function stopNodeGraphLiveAudio() {
  clearNodeGraphLivePlanSync();
  stopNodeGraphLiveInputSource();
  const liveNode = nodeGraphMvp.live.node;
  const liveContext = nodeGraphMvp.live.context;
  const scriptNode = nodeGraphMvp.live.scriptNode;
  nodeGraphMvp.live.node = null;
  nodeGraphMvp.live.context = null;
  nodeGraphMvp.live.meterGain = null;
  nodeGraphMvp.live.outputGain = null;
  nodeGraphMvp.live.outputMuted = false;
  nodeGraphMvp.live.inputVolumeGain = null;
  nodeGraphMvp.live.activeNodeIds = new Set();
  nodeGraphMvp.live.lastEvidence = null;
  nodeGraphMvp.live.lastParameterUpdateTime = 0;
  nodeGraphMvp.live.planEvidence = null;
  nodeGraphMvp.live.planSerial = 0;
  nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(nodeGraphMvp.live.autoSmoothingSeconds);
  nodeGraphMvp.live.runtime = null;
  nodeGraphMvp.live.scriptNode = null;
  nodeGraphMvp.live.sessionId += 1;
  nodeGraphMvp.live.syncMode = "";
  nodeGraphMvp.live.usesWorklet = false;
  // Stop clears transport pause. Without a timeline, halt = cold engine, not
  // "still paused" — next Output/Play starts live (speed 0 stuck forever).
  // (Do not clear outputEnabled here — start path stops-then-restarts and
  // still needs outputEnabled true after this teardown.)
  if ((nodeGraphMvp.live.speedMultiplier ?? 1) <= 0) {
    const resume = Number(nodeGraphMvp.live.lastPlaySpeed);
    nodeGraphMvp.live.speedMultiplier = Number.isFinite(resume) && resume > 0 ? resume : 1;
  }
  nodeGraphStopGpuAdditiveProducer();
  // Full simulation restart on live output off: wipe scope history, phosphor
  // residual, and display state so the next start is a clean cold boot (not
  // a resume of trails / attractors mid-orbit).
  if (typeof clearNodeGraphModuleScopeBuffers === "function") {
    clearNodeGraphModuleScopeBuffers({
      preserveBuffers: false,
      preserveDisplay: false,
    });
  }
  if (typeof nodeGraphPhosphorWaveformViewStates !== "undefined" && nodeGraphPhosphorWaveformViewStates?.clear) {
    nodeGraphPhosphorWaveformViewStates.clear();
  }
  nodeGraphClearVisualControls();

  try {
    liveNode?.port?.postMessage({ type: "stop", sessionId: nodeGraphMvp.live.sessionId, planSerial: nodeGraphMvp.live.planSerial });
    liveNode?.disconnect();
    scriptNode?.disconnect();
  } catch (_error) {
    // Live shutdown is best effort; a disconnected worklet is already silent.
  }
  if (liveContext && liveContext.state !== "closed") {
    await liveContext.close();
  }
  setNodeGraphLiveStatus("stopped");
  setNodeGraphLiveEvidence("stopped");
  setNodeGraphLiveEngineStatus();
  setNodeGraphLiveEngineTitle();
  setNodeGraphLivePlanStatus();
  setNodeGraphLivePlanTitle();
  setNodeGraphLiveInputMeter();
  setNodeGraphLiveMeter();
  setNodeGraphGpuAdditiveStatus();
  setNodeGraphLiveScheduleStatus("schedule stopped");
  clearNodeGraphLiveStatusTitle();
  renderNodeGraphLiveControls(false);
  if (typeof refreshNodeGraphBadvalMonitorBodies === "function") {
    refreshNodeGraphBadvalMonitorBodies();
  }
}

// Ordered source files assembled into one Blob and loaded via a single
// addModule() call -- AudioWorkletGlobalScope can only load ONE static
// module URL, so this is how multiple files get concatenated into that one
// module instead of the whole processor living in a single giant file.
// Order matters: core defines the processor class (no registerProcessor
// call), then per-module chunks would go here as they migrate out of core,
// then register.js calls registerProcessor last, once everything above it
// has finished defining/registering.
const nodeGraphLiveWorkletSourceFiles = [
  // Pure stdlib first so per-module worklet chunks can call nodeGraphWrap01 /
  // nodeGraphTrisaw / nodeGraphPitchedFrequency / nodeGraphAdvancePhase01.
  "./public/node-graph-stdlib/node-graph-phasor-helpers.js?v=phasor-helpers-1",
  "./public/node-graph-stdlib/node-graph-control-bus-helpers.js?v=control-bus-1",
  "./public/node-graph-stdlib/node-graph-param-surface-helpers.js?v=param-surface-4",
  "./public/node-graph-stdlib/node-graph-seeded-rng-helpers.js?v=softpop-1",
  "./public/node-graph-parameter-smoother-filters.js?v=linear-lerp-1",
  // Bypass passthrough maps + frame eval (shared with main thread).
  "./public/node-graph-module-bypass.js?v=vectorscope-bypass-1",
  "./public/node-live-audio-worklet-core.js?v=plan-d-split-8",
  // Phase D: class methods extracted from core (must follow class definition).
  "./public/node-live-audio-worklet-graph.js?v=plan-d-split-5",
  "./public/node-live-audio-worklet-smoother.js?v=linear-lerp-1",
  "./public/node-live-audio-worklet-param-map.js?v=plan-d-split-7",
  "./public/node-live-audio-worklet-destroy.js?v=plan-d-split-6",
  "./public/node-live-audio-worklet-analog.js?v=plan-d-split-7",
  "./public/node-live-audio-worklet-dsp-state.js?v=plan-d-split-8",
  "./public/node-live-audio-worklet-events.js?v=plan-d-split-8",
  "./public/node-live-audio-worklet-visual.js?v=plan-d-split-7",
  "./public/node-live-audio-worklet-scope-io.js?v=output-force-capture-1",
  "./public/node-live-audio-worklet-native-load.js?v=plan-d-split-7",
  "./public/node-live-audio-worklet-evaluators-sources.js?v=sinepulse-24",
  "./public/node-live-audio-worklet-evaluators-processors.js?v=delay-mixm-1",
  "./public/node-live-audio-worklet-evaluators-utility.js?v=orbit-speed-1",
  "./public/node-live-audio-worklet-evaluators.js?v=evaluators-split-1",
  "./public/node-live-audio-worklet-native-exports.js?v=plan-d-split-2",
  "./public/node-live-audio-worklet-set-plan.js?v=module-bypass-2",
  "./public/node-live-audio-worklet-clear-plan.js?v=plan-d-split-3",
  "./public/node-live-audio-worklet-handle-message.js?v=plan-d-split-4",
  "./public/node-live-audio-worklet-scope-snapshot.js?v=scope-abs-frame-1",
  "./public/node-live-audio-worklet-evaluate-frame.js?v=output-scope-bus-1",
  "./public/node-live-audio-worklet-process.js?v=plan-d-split-4",
  "./public/modules/codeblock/codeblock-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/moduleGroup/module-group-worklet-evaluator.js?v=xy-pad-dsp-path-1",
  "./public/modules/ellipsoid/ellipsoid-worklet-evaluator.js?v=uni-bi-outs-1",
  "./public/modules/sineWavetable/sine-wavetable-worklet-evaluator.js?v=sincos-no-amp-in-1",
  "./public/modules/additiveOsc/additive-osc-worklet-evaluator.js?v=native-core-1",
  "./public/modules/polyBlep/poly-blep-worklet-evaluator.js?v=one-core-native-20260803",
  "./public/modules/noiseGenerator/noise-generator-worklet-evaluator.js?v=native-strip-1",
  // noise channel math lives in worklet methods; main-thread uses noise-generator-math.js
  "./public/modules/randomWalk/random-walk-math.js?v=random-walk-1",
  "./public/modules/randomWalk/random-walk-worklet-evaluator.js?v=random-walk-1",
  "./public/modules/piSpigotNoise/pi-spigot-noise-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/bradley2a/bradley-2a-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/antisaw/antisaw-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/fractalBrownianNoise/fractal-brownian-noise-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/fbmField/fbm-field-worklet-evaluator.js?v=fbm-field-21",
  "./public/modules/rgbFractal/rgb-fractal-math.js?v=orbit-speed-1",
  "./public/modules/rgbFractal/rgb-fractal-worklet-evaluator.js?v=orbit-speed-1",
  "./public/modules/logisticMap/logistic-map-math.js?v=logistic-map-1",
  "./public/modules/logisticMap/logistic-map-worklet-evaluator.js?v=logistic-map-1",
  "./public/modules/turingMachine/turing-machine-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/henonMap/henon-map-math.js?v=henon-map-1",
  "./public/modules/henonMap/henon-map-worklet-evaluator.js?v=henon-map-1",
  "./public/modules/rayBouncer/ray-bouncer-worklet-evaluator.js?v=ray-bouncer-native-only-1",
  "./public/modules/chuaAttractor/chua-attractor-math.js?v=chua-1",
  "./public/modules/chuaAttractor/chua-attractor-worklet-evaluator.js?v=chua-1",
  "./public/modules/chordMemory/chord-memory-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/pitchQuantizer/pitch-quantizer-worklet-evaluator.js?v=pitch-quantizer-face-1",
  "./public/modules/wirdoSpiral/wirdo-spiral-worklet-evaluator.js?v=phasor-stdlib-1",
  "./public/modules/blubb/blubb-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/mushroom/mushroom-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/boing/boing-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/torus/torus-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/keplerBouwkamp/kepler-bouwkamp-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/nyquistShannon/nyquist-shannon-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/surgeOscillator/surge-oscillator-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/softwaveOsc/softwave-osc-worklet-evaluator.js?v=native-core-1",
  // Pure curve math before worklet glue (createNodeGraphCurveOscState / sample).
  "./public/modules/curveOsc/curve-osc-math.js?v=curve-osc-1",
  "./public/modules/curveOsc/curve-osc-worklet-evaluator.js?v=curve-osc-1",
  // RS-MET-style L-system turtle oscillator (pure JS).
  "./public/modules/snowflake/snowflake-math.js?v=snowflake-direction-1",
  "./public/modules/snowflake/snowflake-worklet-evaluator.js?v=snowflake-direction-1",
  "./public/modules/textStream/text-stream-worklet-evaluator.js?v=text-stream-1",
  "./public/modules/dsfOscillator/dsf-oscillator-worklet-evaluator.js?v=native-core-1",
  "./public/modules/robinSupersaw/robin-supersaw-worklet-evaluator.js?v=native-no-fallback-1",
  "./public/modules/hypersaw/hypersaw-worklet-evaluator.js?v=phasor-stdlib-1",
  "./public/modules/chordSequencer/chord-sequencer-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/chordPad/chord-pad-worklet-evaluator.js?v=chord-pad-1",
  // Musical engines last among musical/chord chunks so JS spruces override native-only stubs.
  "./public/modules/musicalEngines/musical-engines-worklet-evaluator.js?v=musical-engines-1",
  "./public/modules/lutCell/lut-cell-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/passiveFilter/passive-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/papoulisFilter/papoulis-filter-worklet-evaluator.js?v=xy-pad-native-1",
  "./public/modules/phosphillator/phosphillator-worklet-evaluator.js?v=drawnpath-fix-1",
  "./public/modules/cookbookFilter/cookbook-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/ladderFilter/ladder-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/flowerChildFilter/flower-child-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/activeFilter/active-filter-math.js?v=active-filter-1",
  "./public/modules/activeFilter/active-filter-worklet-evaluator.js?v=active-filter-1",
  "./public/modules/yellowjacketFilter/yellowjacket-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/superloveFilter/superlove-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/chaoticPhaseLockingFilter/chaotic-phase-locking-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/resonatorFilter/resonator-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/humanFilter/human-filter-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/pulseExplosion/pulse-explosion-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/comparator/comparator-math.js?v=comparator-1",
  "./public/modules/comparator/comparator-worklet-evaluator.js?v=comparator-1",
  "./public/modules/sampleDelay/sample-delay-math.js?v=sample-delay-1",
  "./public/modules/sampleDelay/sample-delay-worklet-evaluator.js?v=sample-delay-1",
  "./public/modules/minMax/min-max-math.js?v=min-max-1",
  "./public/modules/minMax/min-max-worklet-evaluator.js?v=min-max-1",
  "./public/modules/aliasSine/alias-sine-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/robinSinusoid/robin-sinusoid-math.js?v=robin-sin-fm-1",
  "./public/modules/robinSinusoid/robin-sinusoid-worklet-evaluator.js?v=robin-sin-fm-1",
  "./public/modules/tb303Filter/tb303-filter-worklet-evaluator.js?v=native-no-fallback-1",
  "./public/modules/delayEffect/delay-effect-worklet-evaluator.js?v=delay-mixm-1",
  "./public/modules/pingPongDelay/ping-pong-delay-worklet-evaluator.js?v=tape-lfo-1",
  "./public/modules/wallDelay/wall-delay-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/reverbEffect/reverb-effect-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/soemReverb/soem-reverb-worklet-evaluator.js?v=5-ping-pong",
  "./public/modules/pll/pll-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/helmholtzPitch/helmholtz-pitch-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/slewLimiter/slew-limiter-math.js?v=slew-1",
  "./public/modules/slewLimiter/slew-limiter-worklet-evaluator.js?v=slew-1",
  "./public/modules/inertialFilter/inertial-filter-math.js?v=inertial-filter-1",
  "./public/modules/inertialFilter/inertial-filter-worklet-evaluator.js?v=inertial-filter-1",
  "./public/modules/tiltFilter/tilt-filter-math.js?v=tilt-eq-1",
  "./public/modules/tiltFilter/tilt-filter-worklet-evaluator.js?v=tilt-eq-1",
  "./public/modules/eqFilter/eq-filter-math.js?v=eq-zero-hz-1",
  "./public/modules/eqFilter/eq-filter-worklet-evaluator.js?v=eq-zero-hz-1",
  "./public/modules/scientificIir/scientific-iir-math.js?v=scientific-iir-1",
  "./public/modules/scientificIir/scientific-iir-worklet-evaluator.js?v=osc-uc-1",
  "./public/modules/crossover/crossover-math.js?v=xo-state-preserve-1",
  "./public/modules/crossover/crossover-worklet-evaluator.js?v=xo-state-preserve-1",
  "./public/modules/modeResonator/mode-resonator-math.js?v=mode-resonator-1",
  "./public/modules/modeResonator/mode-resonator-worklet-evaluator.js?v=mode-resonator-1",
  "./public/modules/combResonator/comb-resonator-math.js?v=comb-resonator-1",
  "./public/modules/combResonator/comb-resonator-worklet-evaluator.js?v=comb-resonator-1",
  "./public/modules/waveguide/waveguide-math.js?v=waveguide-stub-1",
  "./public/modules/waveguide/waveguide-worklet-evaluator.js?v=waveguide-stub-1",
  "./public/modules/classicFxStubs/classic-fx-stubs-worklet-evaluator.js?v=classic-fx-stubs-1",
  "./public/modules/phaseDisperse/phase-disperse-math.js?v=phase-disperse-filters-1",
  "./public/modules/phaseDisperse/phase-disperse-worklet-evaluator.js?v=phase-disperse-filters-1",
  "./public/modules/bode/bode-math.js?v=bode-1",
  "./public/modules/bode/bode-worklet-evaluator.js?v=bode-1",
  "./public/modules/stftBlur/stft-blur-math.js?v=stft-blur-1",
  "./public/modules/stftBlur/stft-blur-worklet-evaluator.js?v=stft-blur-1",
  "./public/modules/noiseGenerator/noise-generator-math.js?v=softpop-1",
  "./public/modules/softpopOscillator/softpop-oscillator-math.js?v=softpop-1",
  "./public/modules/softpopOscillator/softpop-oscillator-worklet-evaluator.js?v=softpop-1",
  "./public/modules/sinepulse/sinepulse-math.js?v=sinepulse-24",
  "./public/modules/sinepulse/sinepulse-worklet-evaluator.js?v=sinepulse-24",
  "./public/modules/sampleHold/sample-hold-math.js?v=sample-hold-1",
  "./public/modules/sampleHold/sample-hold-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/expAdsr/exp-adsr-math.js?v=exp-adsr-1",
  "./public/modules/expAdsr/exp-adsr-worklet-evaluator.js?v=exp-adsr-1",
  "./public/modules/attackDecay/attack-decay-math.js?v=attack-decay-1",
  "./public/modules/attackDecay/attack-decay-worklet-evaluator.js?v=attack-decay-1",
  "./public/modules/linearEnvelope/linear-envelope-math.js?v=linear-envelope-1",
  "./public/modules/linearEnvelope/linear-envelope-worklet-evaluator.js?v=linear-envelope-1",
  "./public/modules/pluckEnvelope/pluck-envelope-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/vactrolEnvelopeSeries/vactrol-envelope-series-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/bugButton/bug-button-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/xyPad/xy-pad-dsp.js?v=xy-pad-center-q-1",
  "./public/modules/xyPad/xy-pad-worklet-evaluator.js?v=xy-pad-phosphor-out-1",
  "./public/modules/flowerChildEnvelopeFollower/flower-child-envelope-follower-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/spiral/spiral-worklet-evaluator.js?v=phasor-stdlib-1",
  "./public/modules/fractalSpiral/fractal-spiral-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/logSpiral/log-spiral-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/lorenzAttractor/lorenz-attractor-math.js?v=lorenz-1",
  "./public/modules/lorenzAttractor/lorenz-attractor-worklet-evaluator.js?v=lorenz-1",
  "./public/modules/clock/clock-math.js?v=clock-1",
  "./public/modules/clock/clock-worklet-evaluator.js?v=clock-1",
  "./public/modules/transport/transport-math.js?v=transport-1",
  "./public/modules/transport/transport-worklet-evaluator.js?v=transport-1",
  "./public/modules/randomClock/random-clock-math.js?v=random-clock-1",
  "./public/modules/randomClock/random-clock-worklet-evaluator.js?v=random-clock-1",
  "./public/modules/triggerDivider/trigger-divider-math.js?v=trigger-divider-1",
  "./public/modules/triggerDivider/trigger-divider-worklet-evaluator.js?v=trigger-divider-1",
  "./public/modules/delayedTrigger/delayed-trigger-math.js?v=delayed-trigger-1",
  "./public/modules/delayedTrigger/delayed-trigger-worklet-evaluator.js?v=delayed-trigger-1",
  "./public/modules/triggerCounter/trigger-counter-math.js?v=trigger-counter-1",
  "./public/modules/triggerCounter/trigger-counter-worklet-evaluator.js?v=trigger-counter-1",
  "./public/modules/stepSequencer/step-sequencer-math.js?v=step-sequencer-1",
  "./public/modules/stepSequencer/step-sequencer-worklet-evaluator.js?v=step-sequencer-1",
  "./public/modules/stepGrid/step-grid-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/nextPatch/next-patch-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/softClipper/soft-clipper-math.js?v=soft-clipper-1",
  "./public/modules/softClipper/soft-clipper-worklet-evaluator.js?v=soft-clipper-js-fallback-1",
  "./public/modules/airClipper/air-clipper-math.js?v=air-clipper-1",
  "./public/modules/airClipper/air-clipper-worklet-evaluator.js?v=air-clipper-1",
  "./public/modules/rgbaHsla/rgba-hsla-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/screenSpaceShader/screen-space-shader-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/metallicRatio/metallic-ratio-math.js?v=metallic-ratio-1",
  "./public/modules/metallicRatio/metallic-ratio-worklet-evaluator.js?v=metallic-ratio-1",
  "./public/modules/speakerProtection/speaker-protection-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/badvalMonitor/badval-monitor-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/radar/radar-worklet-evaluator.js?v=phasor-stdlib-1",
  "./public/modules/audioPlayer/audio-player-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/gainBiasMix/gain-bias-mix-worklet-evaluator.js?v=native-strip-1",
  "./public/modules/gain/gain-math.js?v=gain-offset-1",
  "./public/modules/gain/gain-worklet-evaluator.js?v=gain-offset-1",
  "./public/modules/bias/bias-math.js?v=bias-1",
  "./public/modules/bias/bias-worklet-evaluator.js?v=bias-1",

  "./public/modules/rotate3dTo2d/rotate-3d-to-2d-math.js?v=rotate-3d-to-2d-1",
  "./public/modules/rotate3dTo2d/rotate-3d-to-2d-worklet-evaluator.js?v=rotate-3d-to-2d-1",
  "./public/modules/vectorscopeTransform/vectorscope-transform-math.js?v=vectorscope-rotation-1",
  "./public/modules/vectorscopeTransform/vectorscope-transform-worklet-evaluator.js?v=vectorscope-rotation-1",
  "./public/modules/speedColorInertia/speed-color-inertia-math.js?v=speed-color-inertia-2",
  "./public/modules/speedColorInertia/speed-color-inertia-worklet-evaluator.js?v=speed-color-inertia-2",
  "./public/modules/sinc/sinc-worklet-evaluator.js?v=native-core-1",
  "./public/modules/videoscope/videoscope-worklet-evaluator.js?v=videoscope-buffer-hold-1",
  "./public/modules/spectrogram/spectrogram-worklet-evaluator.js?v=spec-overlap-batch-1",
  "./public/node-live-audio-worklet-register.js?v=blob-loader-20260711",
];

async function buildNodeGraphLiveWorkletBlobUrl(sourceFiles) {
  const sources = await Promise.all(sourceFiles.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch AudioWorklet source "${url}": ${response.status}`);
    }
    return response.text();
  }));
  const combined = sources.join("\n;\n");
  const blob = new Blob([combined], { type: "text/javascript" });
  return URL.createObjectURL(blob);
}

async function createNodeGraphLiveWorkletNode(context, plan = null) {
  if (!context.audioWorklet || typeof AudioWorkletNode === "undefined") {
    throw new Error("AudioWorklet unavailable");
  }
  const blobUrl = await buildNodeGraphLiveWorkletBlobUrl(nodeGraphLiveWorkletSourceFiles);
  try {
    await nodeGraphLiveAwaitStartup(
      context.audioWorklet.addModule(blobUrl),
      "AudioWorklet startup timed out",
    );
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  const workletNode = new AudioWorkletNode(
    context,
    "node-live-audio-processor",
    {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    },
  );
  workletNode.port.onmessage = handleNodeGraphLiveWorkletMessage;
  workletNode.onprocessorerror = () => {
    setNodeGraphLiveProcessorError("AudioWorklet processor crashed");
  };
  // Await native wasm post so setPlan is less likely to race an empty
  // nativePolyBlepReady (PolyBLEP used to throw and kill the worklet).
  // Instantiate is still async inside the worklet; evaluators must soft-silence
  // until ready rather than throw.
  if (typeof sendNodeGraphLiveNativeModules === "function") {
    try {
      await sendNodeGraphLiveNativeModules(workletNode, plan);
    } catch (error) {
      console.warn("[live] native module preload failed", error);
    }
  }
  return workletNode;
}

function nodeGraphLiveAwaitStartup(promise, message = "live audio startup timed out", timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

function createNodeGraphLiveScriptProcessorNode(context, plan) {
  const scriptNode = context.createScriptProcessor(nodeGraphAudioBlockSize, 2, 2);
  scriptNode.onaudioprocess = renderNodeGraphLiveScriptBlock;
  nodeGraphMvp.live.runtime = createNodeGraphLiveRuntime(plan, nodeGraphMvp.live.runtime);
  nodeGraphMvp.live.runtime.earProtector = createNodeGraphEarProtector(context.sampleRate);
  nodeGraphMvp.live.scriptNode = scriptNode;
  return scriptNode;
}

function stopNodeGraphLiveInputSource() {
  const source = nodeGraphMvp.live.inputSource;
  const stream = nodeGraphMvp.live.inputStream;
  const inputVolumeGain = nodeGraphMvp.live.inputVolumeGain;
  nodeGraphMvp.live.inputSource = null;
  nodeGraphMvp.live.inputStream = null;
  // The level itself (live.inputVolume) survives -- only the node goes.
  nodeGraphMvp.live.inputVolumeGain = null;
  cleanupNodeGraphMockInputStream();
  try {
    source?.disconnect();
  } catch (_error) {
    // Already disconnected input sources are harmless.
  }
  try {
    inputVolumeGain?.disconnect();
  } catch (_error) {
    // Already disconnected gain nodes are harmless.
  }
  for (const track of stream?.getTracks?.() || []) {
    track.stop();
  }
  setNodeGraphLiveInputStatus(
    nodeGraphMvp.live.inputActive ? nodeGraphLiveInputRouteState().state : "off",
    nodeGraphMvp.live.inputActive
      ? nodeGraphLiveInputRouteState().message
      : ""
  );
  setNodeGraphLiveMicStatus(
    nodeGraphMvp.live.inputActive ? "armed" : "off",
    nodeGraphMvp.live.inputActive
      ? "Start OUTPUT to request browser microphone permission."
      : ""
  );
}

async function startNodeGraphLiveInputSource() {
  const context = nodeGraphMvp.live.context;
  const liveNode = nodeGraphMvp.live.node;
  if (!context || !liveNode || nodeGraphMvp.live.inputStream) {
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    const message = window.isSecureContext
      ? "Browser audio input unavailable."
      : "Browser audio input needs HTTPS or localhost.";
    setNodeGraphLiveInputStatus("blocked", message);
    setNodeGraphLiveMicStatus("blocked", message);
    const error = new Error(message);
    error.nodeGraphInputError = true;
    throw error;
  }
  setNodeGraphLiveInputStatus("requesting", "Requesting browser microphone permission.");
  setNodeGraphLiveMicStatus("requesting", "Requesting browser microphone permission.");
  try {
    let stream = null;
    try {
      stream = await requestNodeGraphLiveInputStream();
    } catch (error) {
      if (!nodeGraphMvp.live.inputDeviceId || !nodeGraphLiveInputDeviceIsUnavailable(error)) {
        throw error;
      }
      nodeGraphMvp.live.inputDeviceId = "";
      setNodeGraphLiveInputStatus("requesting", "Selected input unavailable; retrying default input.");
      setNodeGraphLiveMicStatus("requesting", "Selected input unavailable; retrying default input.");
      await refreshNodeGraphLiveInputDevices();
      stream = await requestNodeGraphLiveInputStream("");
    }
    const source = context.createMediaStreamSource(stream);
    // Host gain is unity; Input module Amplitude (level) scales inside the graph.
    // Keep a gain node so the stream can be rewired without re-prompting.
    if (typeof syncNodeGraphLiveInputVolumeFromInputModule === "function") {
      syncNodeGraphLiveInputVolumeFromInputModule();
    }
    const inputVolumeGain = context.createGain();
    inputVolumeGain.gain.value = 1;
    source.connect(inputVolumeGain);
    inputVolumeGain.connect(liveNode);
    nodeGraphMvp.live.inputVolumeGain = inputVolumeGain;
    nodeGraphMvp.live.inputStream = stream;
    nodeGraphMvp.live.inputSource = source;
    nodeGraphMvp.live.inputPermissionStatus = "granted";
    setNodeGraphLiveInputStatus("connected", "Live INPUT is connected to the browser audio engine.");
    setNodeGraphLiveMicStatus("connected", "Browser microphone stream is connected.");
    refreshNodeGraphLiveInputDevices();
  } catch (error) {
    const message = nodeGraphLiveInputErrorMessage(error);
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      nodeGraphMvp.live.inputPermissionStatus = "denied";
    }
    setNodeGraphLiveInputStatus("blocked", message);
    setNodeGraphLiveMicStatus("blocked", message);
    error.nodeGraphInputError = true;
    throw error;
  }
}

async function syncNodeGraphLiveInputSource() {
  if (nodeGraphMvp.live.inputActive) {
    await startNodeGraphLiveInputSource();
  } else {
    stopNodeGraphLiveInputSource();
  }
}

/** Abort an in-flight start cleanly so UI does not stick on "starting". */
function nodeGraphLiveOutputAbortStart(reason = "stopped") {
  // Never paint "stopped" over a live/newer session — a superseded start
  // used to re-render red stop after the winner had already gone green.
  if (nodeGraphMvp.live.node) {
    if (typeof renderNodeGraphLiveControls === "function") {
      renderNodeGraphLiveControls(true);
    }
    if (typeof renderNodeGraphExecutionPlanDebug === "function") {
      renderNodeGraphExecutionPlanDebug();
    }
    return;
  }
  if (typeof setNodeGraphLiveStatus === "function") {
    setNodeGraphLiveStatus(reason === "error" ? "error" : "stopped");
  }
  // Only disarm output when we truly have no engine — a superseding start
  // keeps outputEnabled true with a new serial.
  if (!nodeGraphMvp.live.node && !nodeGraphMvp.live.context) {
    // Leave outputEnabled alone if a newer serial still owns a start request;
    // callers that fully cancel set it themselves.
  }
  if (typeof renderNodeGraphLiveControls === "function") {
    renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
  }
  if (typeof renderNodeGraphExecutionPlanDebug === "function") {
    renderNodeGraphExecutionPlanDebug();
  }
}

/**
 * Dispose a cancelled start without murdering a newer session.
 * Returns true if a full stopNodeGraphLiveAudio ran.
 */
async function nodeGraphLiveOutputDisposeCancelledStart(outputSerial, localContext = null, localNode = null) {
  const currentSerial = nodeGraphMvp.live.outputToggleSerial;
  const superseded = outputSerial !== currentSerial;
  const ownsLiveNode = localNode && nodeGraphMvp.live.node === localNode;
  const ownsLiveContext = localContext && nodeGraphMvp.live.context === localContext;

  if (superseded && !ownsLiveNode && !ownsLiveContext) {
    // Newer start owns the world — only free our orphan locals.
    try {
      localNode?.disconnect?.();
    } catch (_error) {
      // Already silent.
    }
    if (localContext && localContext.state !== "closed") {
      try {
        await localContext.close();
      } catch (_error) {
        // Context may already be closing.
      }
    }
    return false;
  }

  // We still own the live refs (or nothing is live) — full cold stop.
  if (typeof stopNodeGraphLiveAudio === "function") {
    await stopNodeGraphLiveAudio();
  }
  return true;
}

async function startNodeGraphLiveAudio(outputSerial = nodeGraphMvp.live.outputToggleSerial) {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphTripEarProtection({ source: "live" });
    renderNodeGraphLiveControls(false);
    renderNodeGraphExecutionPlanDebug();
    return;
  }
  if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
    nodeGraphLiveOutputAbortStart("stopped");
    return;
  }
  try {
    if (!nodeGraphScriptReadyForGraphAction("live audio")) {
      markNodeGraphLiveScriptBlocked();
      nodeGraphMvp.live.outputEnabled = false;
      renderNodeGraphLiveControls(false);
      return;
    }
    setNodeGraphLiveStatus("starting", "warn");
    renderNodeGraphLiveControls(false);
    stopNodeGraphRenderedPlayback();
    // Fresh session: reset BADVAL Monitor faces to CLEAR.
    if (typeof clearNodeGraphBadvalModuleStates === "function") {
      clearNodeGraphBadvalModuleStates();
    }
    if (nodeGraphMvp.live.node || nodeGraphMvp.live.context) {
      await stopNodeGraphLiveAudio();
      if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
        nodeGraphLiveOutputAbortStart("stopped");
        return;
      }
      setNodeGraphLiveStatus("starting", "warn");
      renderNodeGraphLiveControls(false);
    }

    const plan = nodeGraphBuildLivePlan();
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Web Audio API unavailable");
    }
    const context = new AudioContextConstructor();
    nodeGraphMvp.live.sessionId += 1;
    nodeGraphMvp.live.planSerial = 0;
    if (context.state === "suspended") {
      await context.resume();
    }
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      try {
        await context.close();
      } catch (_error) {
        // Context may already be closing.
      }
      nodeGraphLiveOutputAbortStart("stopped");
      return;
    }
    const outputGain = context.createGain();
    // Host gain is mute-only; loudness is Output.volume inside the graph.
    // Sync cache from the module before start so UI mirrors stay honest.
    if (typeof syncNodeGraphLiveOutputVolumeFromOutputModule === "function") {
      syncNodeGraphLiveOutputVolumeFromOutputModule();
    }
    outputGain.gain.value = nodeGraphLiveOutputTargetGain();
    let liveNode = null;
    let usesWorklet = false;
    try {
      liveNode = await createNodeGraphLiveWorkletNode(context, plan);
      usesWorklet = true;
    } catch (error) {
      liveNode = createNodeGraphLiveScriptProcessorNode(context, plan);
      setNodeGraphLiveEngineStatus("engine fallback", "warn");
      setNodeGraphLiveEngineTitle(error.message);
    }
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      await nodeGraphLiveOutputDisposeCancelledStart(outputSerial, context, liveNode);
      nodeGraphLiveOutputAbortStart("stopped");
      return;
    }
    nodeGraphMvp.live.context = context;
    nodeGraphMvp.live.meterGain = null;
    nodeGraphMvp.live.node = liveNode;
    nodeGraphMvp.live.outputGain = outputGain;
    nodeGraphMvp.live.usesWorklet = usesWorklet;
    liveNode.connect(outputGain);
    outputGain.connect(context.destination);
    // Fresh session is never muted — clear any sticky mute from a prior error.
    setNodeGraphLiveOutputMuted(false);
    await syncNodeGraphLiveInputSource();
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      // Superseded: dispose only if we still own live (never kill the winner).
      await nodeGraphLiveOutputDisposeCancelledStart(outputSerial, context, liveNode);
      nodeGraphLiveOutputAbortStart("stopped");
      return;
    }
    const planOk = await sendNodeGraphLivePlan();
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      await nodeGraphLiveOutputDisposeCancelledStart(outputSerial, context, liveNode);
      nodeGraphLiveOutputAbortStart("stopped");
      return;
    }
    if (!planOk) {
      // Plan failed on cold start: do not leave a silent connected worklet.
      // Capture error chrome before stop wipes status pills.
      const errTitle = document.getElementById("nodeLiveStatus")?.title || "";
      const errPlan = document.getElementById("nodeLivePlanStatus")?.textContent || "";
      const errPlanTitle = document.getElementById("nodeLivePlanStatus")?.title || "";
      nodeGraphMvp.live.outputEnabled = false;
      await stopNodeGraphLiveAudio();
      if (typeof setNodeGraphLiveStatus === "function") {
        setNodeGraphLiveStatus("error", "warn");
      }
      if (errTitle && document.getElementById("nodeLiveStatus")) {
        document.getElementById("nodeLiveStatus").title = errTitle;
      }
      if (errPlan && typeof setNodeGraphLivePlanStatus === "function") {
        setNodeGraphLivePlanStatus(errPlan, "warn");
      }
      if (errPlanTitle && typeof setNodeGraphLivePlanTitle === "function") {
        setNodeGraphLivePlanTitle(errPlanTitle);
      }
      renderNodeGraphLiveControls(false);
      return;
    }
    sendNodeGraphLiveMacroControls();
    sendNodeGraphLivePitchModWheelSignal();
    // Ensure worklet has the current transport speed (esp. after ⏮ restart).
    if (typeof sendNodeGraphLiveSpeed === "function") {
      sendNodeGraphLiveSpeed();
    }
    if (typeof sendNodeGraphLiveSpeedLimit === "function") {
      sendNodeGraphLiveSpeedLimit();
    }
    if (usesWorklet) {
      setNodeGraphLiveEngineStatus("engine worklet", "good");
      setNodeGraphLiveEngineTitle();
    }
    await context.resume();
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      await nodeGraphLiveOutputDisposeCancelledStart(outputSerial, context, liveNode);
      nodeGraphLiveOutputAbortStart("stopped");
      return;
    }
    clearNodeGraphLiveStatusTitle();
    if (typeof setNodeGraphLiveStatus === "function") {
      setNodeGraphLiveStatus("running", "good");
    }
    // Keep the arming flag honest once the worklet is up.
    nodeGraphMvp.live.outputEnabled = true;
    setNodeGraphLiveOutputMuted(false);
    renderNodeGraphLiveControls(true);
    // One more frame after layout/status pills settle — guarantee green Live.
    window.requestAnimationFrame(() => {
      if (nodeGraphMvp.live.node && nodeGraphMvp.live.outputEnabled) {
        renderNodeGraphLiveControls(true);
      }
    });
  } catch (error) {
    const inputError = Boolean(error.nodeGraphInputError);
    const inputErrorMessage = inputError ? nodeGraphLiveInputErrorMessage(error) : "";
    // Do not tear down a newer successful start from this failed serial.
    if (outputSerial === nodeGraphMvp.live.outputToggleSerial) {
      await stopNodeGraphLiveAudio();
      nodeGraphMvp.live.outputEnabled = false;
      if (inputError) {
        setNodeGraphLiveInputStatus("blocked", inputErrorMessage);
        setNodeGraphLiveMicStatus("blocked", inputErrorMessage);
        setNodeGraphLiveBlockedError("input", error, { schedule: false });
      } else {
        setNodeGraphLiveBlockedError("plan", error);
      }
      renderNodeGraphLiveControls(false);
    }
  }
}
