const nodeGraphClapHostDefaultPort = 47991;
const nodeGraphClapHostName = "Soundemote WebUI CLAP Host";
const nodeGraphClapEditorRequestTimeoutMs = 12000;
const nodeGraphClapHostStorageKey = "nodeGraphClapHostBaseUrl";
const nodeGraphClapHostUnderConstruction = false;

const nodeGraphClapHostState = {
  status: "disconnected",
  baseUrl: `http://127.0.0.1:${nodeGraphClapHostDefaultPort}`,
  capabilities: {},
  hostConfig: {},
  version: "",
  plugins: [],
  instances: new Map(),
  pluginCount: null,
  parameterPayloads: new Map(),
  parameterWriteTimers: new Map(),
  presets: [],
  lastError: "",
};

function defaultNodeGraphClapHostBaseUrl() {
  return `http://127.0.0.1:${nodeGraphClapHostDefaultPort}`;
}

function normalizeNodeGraphClapHostBaseUrl(value = "") {
  const raw = String(value || "").trim() || defaultNodeGraphClapHostBaseUrl();
  const source = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(source);
  if (url.protocol !== "http:") {
    throw new Error("host URL must use http");
  }
  if (!url.hostname) {
    throw new Error("host URL needs a hostname");
  }
  return url.origin;
}

function loadNodeGraphClapHostBaseUrl() {
  try {
    return normalizeNodeGraphClapHostBaseUrl(
      window.localStorage?.getItem(nodeGraphClapHostStorageKey) || nodeGraphClapHostState.baseUrl,
    );
  } catch {
    return defaultNodeGraphClapHostBaseUrl();
  }
}

function saveNodeGraphClapHostBaseUrl(value) {
  try {
    window.localStorage?.setItem(nodeGraphClapHostStorageKey, value);
  } catch {
    // Host URL persistence is a convenience, not a rendering requirement.
  }
}

function nodeGraphClapHostLaunchCommand(baseUrl = nodeGraphClapHostState.baseUrl) {
  const url = new URL(normalizeNodeGraphClapHostBaseUrl(baseUrl));
  const port = url.port || String(nodeGraphClapHostDefaultPort);
  return `tools\\webui-clap-host\\start_webui_clap_host.cmd -BindHost ${url.hostname} -Port ${port}`;
}

function syncNodeGraphClapHostUrlInput() {
  const input = document.getElementById("nodeClapHostUrl");
  if (input) {
    input.value = nodeGraphClapHostState.baseUrl;
  }
}

function markNodeGraphClapHostButtonUnderConstruction(button) {
  if (!button) {
    return;
  }
  button.classList.add("node-under-construction-control");
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
}

function markNodeGraphClapHostButtonsUnderConstruction(buttons) {
  for (const button of buttons || []) {
    markNodeGraphClapHostButtonUnderConstruction(button);
  }
}

function createNodeGraphClapPluginActionButton(label, datasetKey, nodeId, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "node-secondary-button";
  button.textContent = label;
  button.dataset[datasetKey] = nodeId;
  if (nodeGraphClapHostUnderConstruction) {
    markNodeGraphClapHostButtonUnderConstruction(button);
  } else {
    button.addEventListener("click", () => handler(nodeId));
  }
  return button;
}

function applyNodeGraphClapHostBaseUrlFromInput(options = {}) {
  const input = document.getElementById("nodeClapHostUrl");
  const next = normalizeNodeGraphClapHostBaseUrl(input?.value || nodeGraphClapHostState.baseUrl);
  const changed = next !== nodeGraphClapHostState.baseUrl;
  nodeGraphClapHostState.baseUrl = next;
  saveNodeGraphClapHostBaseUrl(next);
  syncNodeGraphClapHostUrlInput();
  if (changed && options.disconnect !== false) {
    nodeGraphClapHostState.version = "";
    nodeGraphClapHostState.capabilities = {};
    nodeGraphClapHostState.hostConfig = {};
    nodeGraphClapHostState.plugins = [];
    nodeGraphClapHostState.pluginCount = null;
    nodeGraphClapHostState.parameterPayloads.clear();
    clearNodeGraphClapHostInstanceSummaries();
    setNodeGraphClapHostStatus("disconnected", `host set to ${next}`);
  }
  return next;
}

const nodeGraphClapHostCapabilityKeys = [
  "audioProcessing",
  "instanceProbing",
  "liveAudio",
  "metadataInspection",
  "offlineRenderSessions",
  "persistentInstances",
  "processBatch",
  "pluginEditorInfo",
  "pluginEditorOpening",
  "pluginLatencyInfo",
  "pluginStatePersistence",
  "pluginTailInfo",
  "pluginLoading",
  "pluginScanning",
];

function normalizeNodeGraphClapHostCapabilities(capabilities = {}) {
  const normalized = Object.fromEntries(
    nodeGraphClapHostCapabilityKeys.map((key) => [key, capabilities?.[key] === true]),
  );
  const maxProcessFrames = Number(capabilities?.maxProcessFrames);
  if (Number.isFinite(maxProcessFrames) && maxProcessFrames > 0) {
    normalized.maxProcessFrames = Math.floor(maxProcessFrames);
  }
  const maxProcessBatchItems = Number(capabilities?.maxProcessBatchItems);
  if (Number.isFinite(maxProcessBatchItems) && maxProcessBatchItems > 0) {
    normalized.maxProcessBatchItems = Math.floor(maxProcessBatchItems);
  }
  for (const key of ["liveAudioMinBlockFrames", "liveAudioMaxBlockFrames", "liveAudioDefaultBlockFrames"]) {
    const value = Number(capabilities?.[key]);
    if (Number.isFinite(value) && value > 0) {
      normalized[key] = Math.floor(value);
    }
  }
  return normalized;
}

function normalizeNodeGraphClapHostConfig(config = {}) {
  const port = Number(config?.port);
  const scanDirs = Array.isArray(config?.scanDirs)
    ? config.scanDirs.map((path) => String(path || "")).filter(Boolean).slice(0, 64)
    : [];
  const explicitPlugins = Array.isArray(config?.explicitPlugins)
    ? config.explicitPlugins.map((path) => String(path || "")).filter(Boolean).slice(0, 64)
    : [];
  return {
    bindHost: String(config?.bindHost || "").trim(),
    defaultPort: Number.isFinite(Number(config?.defaultPort)) ? Math.floor(Number(config.defaultPort)) : nodeGraphClapHostDefaultPort,
    explicitPlugins,
    inspectMetadata: config?.inspectMetadata === true,
    port: Number.isFinite(port) && port > 0 ? Math.floor(port) : 0,
    pythonExecutable: String(config?.pythonExecutable || "").trim(),
    scanDirs,
    scriptPath: String(config?.scriptPath || "").trim(),
    testInstantiate: config?.testInstantiate === true,
    workingDirectory: String(config?.workingDirectory || "").trim(),
  };
}

function nodeGraphClapHostConfigSummary() {
  const config = normalizeNodeGraphClapHostConfig(nodeGraphClapHostState.hostConfig);
  const scanText = `${config.scanDirs.length} scan ${config.scanDirs.length === 1 ? "dir" : "dirs"}`;
  const explicitText = config.explicitPlugins.length
    ? `; ${config.explicitPlugins.length} explicit ${config.explicitPlugins.length === 1 ? "plugin" : "plugins"}`
    : "";
  const inspectText = config.inspectMetadata ? "; metadata on" : "; metadata off";
  const probeText = config.testInstantiate ? "; instantiate probe on" : "";
  return `${scanText}${explicitText}${inspectText}${probeText}`;
}

function updateNodeGraphClapHostCapabilities(capabilities = {}) {
  const next = normalizeNodeGraphClapHostCapabilities(nodeGraphClapHostState.capabilities);
  for (const key of nodeGraphClapHostCapabilityKeys) {
    if (Object.hasOwn(capabilities || {}, key)) {
      next[key] = capabilities[key] === true;
    }
  }
  const maxProcessFrames = Number(capabilities?.maxProcessFrames);
  if (Number.isFinite(maxProcessFrames) && maxProcessFrames > 0) {
    next.maxProcessFrames = Math.floor(maxProcessFrames);
  }
  const maxProcessBatchItems = Number(capabilities?.maxProcessBatchItems);
  if (Number.isFinite(maxProcessBatchItems) && maxProcessBatchItems > 0) {
    next.maxProcessBatchItems = Math.floor(maxProcessBatchItems);
  }
  nodeGraphClapHostState.capabilities = next;
}

function nodeGraphClapHostCanProcessAudio() {
  return nodeGraphClapHostState.capabilities.audioProcessing === true;
}

function nodeGraphClapHostCanUseRenderSessions() {
  return nodeGraphClapHostState.capabilities.offlineRenderSessions === true;
}

function nodeGraphClapHostMaxProcessFrames() {
  const frames = Number(nodeGraphClapHostState.capabilities.maxProcessFrames);
  return Number.isFinite(frames) && frames > 0 ? Math.floor(frames) : 48000;
}

function nodeGraphClapHostCanProcessBatch() {
  return nodeGraphClapHostState.capabilities.processBatch === true;
}

function nodeGraphClapHostMaxProcessBatchItems() {
  const count = Number(nodeGraphClapHostState.capabilities.maxProcessBatchItems);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 64;
}

function setNodeGraphClapHostStatus(status, detail = "") {
  nodeGraphClapHostState.status = status;
  const statusElement = document.getElementById("nodeClapHostStatus");
  const detailElement = document.getElementById("nodeClapHostDetail");
  const connectButton = document.getElementById("nodeClapHostConnectButton");
  const pluginsButton = document.getElementById("nodeClapHostPluginsButton");
  const diagnosticsButton = document.getElementById("nodeClapHostDiagnosticsButton");
  const commandButton = document.getElementById("nodeClapHostCommandButton");
  if (!statusElement || !detailElement || !connectButton) return;

  if (nodeGraphClapHostUnderConstruction) {
    statusElement.classList.add("warn");
    statusElement.classList.remove("error");
    statusElement.textContent = "CLAP Host: Under Construction";
    detailElement.textContent = detail || "local companion UI is being built here under the render controls";
    markNodeGraphClapHostButtonsUnderConstruction([
      connectButton,
      pluginsButton,
      diagnosticsButton,
      commandButton,
    ]);
    syncNodeGraphClapPluginElements();
    return;
  }

  statusElement.classList.toggle("warn", status !== "connected");
  statusElement.classList.toggle("error", status === "error");
  connectButton.disabled = status === "connecting";
  if (pluginsButton) {
    pluginsButton.disabled = status !== "connected";
  }
  if (diagnosticsButton) {
    diagnosticsButton.disabled = status === "connecting";
  }

  if (status === "connected") {
    const versionText = nodeGraphClapHostState.version
      ? ` ${nodeGraphClapHostState.version}`
      : "";
    const capabilityText = nodeGraphClapHostCanProcessAudio()
      ? "Render Sample CLAP processing available"
      : "Render Sample CLAP processing unavailable";
    statusElement.textContent = `CLAP Host: Connected${versionText}`;
    detailElement.textContent = detail || `local companion answered health check; ${capabilityText}; ${nodeGraphClapHostConfigSummary()}`;
    syncNodeGraphClapPluginElements();
    return;
  }
  if (status === "connecting") {
    statusElement.textContent = "CLAP Host: Connecting";
    detailElement.textContent = `checking ${nodeGraphClapHostState.baseUrl}`;
    syncNodeGraphClapPluginElements();
    return;
  }
  if (status === "error") {
    statusElement.textContent = "CLAP Host: Error";
    detailElement.textContent = detail || nodeGraphClapHostState.lastError || "connection failed";
    syncNodeGraphClapPluginElements();
    return;
  }
  statusElement.textContent = "CLAP Host: Under Construction";
  detailElement.textContent = detail || "local companion UI is being built here under the render controls";
  syncNodeGraphClapPluginElements();
}

function nodeGraphClapPluginCountText(count) {
  const label = count === 1 ? "entry" : "entries";
  return `${count} CLAP plugin ${label} discovered; select a plugin to create a host instance`;
}

function nodeGraphClapPluginCatalogText(plugins) {
  const pluginList = Array.isArray(plugins) ? plugins : [];
  const inspectedCount = pluginList.filter((plugin) => plugin?.metadataInspected).length;
  const descriptorCount = pluginList.filter(
    (plugin) => plugin?.metadataInspected && !plugin?.metadataError
  ).length;
  const instantiationTestedCount = pluginList.filter(
    (plugin) => plugin?.instantiationTested
  ).length;
  const instantiableCount = pluginList.filter((plugin) => plugin?.instantiable).length;
  if (instantiationTestedCount > 0) {
    return `${pluginList.length} CLAP plugin entries discovered; ${descriptorCount} descriptors inspected; ${instantiableCount} init probes passed; bounded Render Sample processing available`;
  }
  if (inspectedCount > 0) {
    return `${pluginList.length} CLAP plugin entries discovered; ${descriptorCount} descriptors inspected; create an instance to enable bounded Render Sample processing`;
  }
  return nodeGraphClapPluginCountText(pluginList.length);
}

function nodeGraphClapHostDiagnosticsText(payload = {}) {
  const summary = payload?.summary || {};
  const scanPathCount = Math.max(0, Math.floor(Number(summary.scanPathCount) || 0));
  const existingScanPathCount = Math.max(0, Math.floor(Number(summary.existingScanPathCount) || 0));
  const pluginCount = Math.max(0, Math.floor(Number(summary.pluginCount) || 0));
  const loadableCount = Math.max(0, Math.floor(Number(summary.loadableCount) || 0));
  const metadataErrorCount = Math.max(0, Math.floor(Number(summary.metadataErrorCount) || 0));
  const instantiationErrorCount = Math.max(0, Math.floor(Number(summary.instantiationErrorCount) || 0));
  const missingExplicitPluginCount = Math.max(0, Math.floor(Number(summary.missingExplicitPluginCount) || 0));
  const issueCount = metadataErrorCount + instantiationErrorCount + missingExplicitPluginCount;
  const issueText = issueCount
    ? `; ${issueCount} setup ${issueCount === 1 ? "issue" : "issues"}`
    : "; no setup issues";
  return `diagnostics ${payload?.status || "ready"}: ${pluginCount} entries, ${loadableCount} loadable, ${existingScanPathCount}/${scanPathCount} scan dirs present${issueText}`;
}

async function copyNodeGraphClapHostLaunchCommand() {
  const detailElement = document.getElementById("nodeClapHostDetail");
  try {
    const baseUrl = applyNodeGraphClapHostBaseUrlFromInput({ disconnect: false });
    const command = nodeGraphClapHostLaunchCommand(baseUrl);
    await copyTextToClipboard(command);
    if (detailElement) {
      detailElement.textContent = "host prototype command copied";
    }
  } catch (error) {
    if (detailElement) {
      try {
        detailElement.textContent = `copy unavailable; run ${nodeGraphClapHostLaunchCommand()}`;
      } catch {
        detailElement.textContent = `copy failed: ${error?.message || error}`;
      }
    }
  }
}

async function fetchNodeGraphClapHostJson(path, timeoutMs = 1400, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${nodeGraphClapHostState.baseUrl}${path}`, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postNodeGraphClapHostJson(path, payload = {}, timeoutMs = 1800) {
  return fetchNodeGraphClapHostJson(path, timeoutMs, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function deleteNodeGraphClapHostJson(path, timeoutMs = 1400) {
  return fetchNodeGraphClapHostJson(path, timeoutMs, { method: "DELETE" });
}

function nodeGraphClapPluginOptionLabel(plugin = {}) {
  const vendor = String(plugin.vendor || "").trim();
  const name = String(plugin.name || plugin.path || "CLAP plugin").trim();
  return vendor ? `${vendor} - ${name}` : name;
}

function nodeGraphClapPluginBindingFromCatalog(plugin = {}) {
  return normalizeNodeGraphClapPluginBinding({
    catalogId: plugin.id,
    clapId: plugin.clapId,
    name: plugin.name,
    path: plugin.path,
    vendor: plugin.vendor,
  });
}

function nodeGraphClapParameterPayload(instanceId = "") {
  return nodeGraphClapHostState.parameterPayloads.get(String(instanceId || "")) || null;
}

function normalizeNodeGraphClapSafetyState(safety = {}) {
  const rawPeak = Number(safety.rawPeak);
  const peakLimit = Number(safety.peakLimit);
  return {
    latched: Boolean(safety.latched),
    peakLimit: Number.isFinite(peakLimit) ? peakLimit : 0,
    rawPeak: Number.isFinite(rawPeak) ? rawPeak : 0,
    reason: String(safety.reason || ""),
  };
}

function nodeGraphClapInstanceSummary(instanceId = "") {
  return nodeGraphClapHostState.instances.get(String(instanceId || "")) || null;
}

function nodeGraphClapInstanceIsStale(instanceId = "") {
  return Boolean(
    instanceId &&
    nodeGraphClapHostState.status === "connected" &&
    !nodeGraphClapInstanceSummary(instanceId)
  );
}

function nodeGraphClapInstanceSafety(instanceId = "") {
  return normalizeNodeGraphClapSafetyState(nodeGraphClapInstanceSummary(instanceId)?.safety);
}

function nodeGraphClapInstanceEditor(instanceId = "") {
  const editor = nodeGraphClapInstanceSummary(instanceId)?.editor || {};
  return {
    api: String(editor.api || ""),
    canOpen: editor.canOpen === true,
    height: Number.isFinite(Number(editor.height)) ? Math.max(0, Math.round(Number(editor.height))) : 0,
    open: editor.open === true,
    preferredApi: String(editor.preferredApi || ""),
    preferredFloating: editor.preferredFloating === true,
    reason: String(editor.reason || ""),
    supported: editor.supported === true,
    supportedApis: Array.isArray(editor.supportedApis) ? editor.supportedApis : [],
    width: Number.isFinite(Number(editor.width)) ? Math.max(0, Math.round(Number(editor.width))) : 0,
  };
}

function nodeGraphClapInstanceLatency(instanceId = "") {
  const latency = nodeGraphClapInstanceSummary(instanceId)?.latency || {};
  const samples = Number(latency.samples);
  return {
    error: String(latency.error || ""),
    samples: Number.isFinite(samples) && samples > 0 ? Math.round(samples) : 0,
    supported: latency.supported === true,
  };
}

function nodeGraphClapLatencyStatusText(instanceId = "") {
  if (!instanceId) {
    return "Latency: no host instance.";
  }
  const latency = nodeGraphClapInstanceLatency(instanceId);
  if (!latency.supported) {
    return "Latency: plugin does not expose clap.latency.";
  }
  if (latency.error) {
    return `Latency: read error; ${latency.error}.`;
  }
  return `Latency: ${latency.samples} samples reported.`;
}

function nodeGraphClapInstanceTail(instanceId = "") {
  const tail = nodeGraphClapInstanceSummary(instanceId)?.tail || {};
  const samples = Number(tail.samples);
  return {
    error: String(tail.error || ""),
    infinite: tail.infinite === true,
    samples: Number.isFinite(samples) && samples > 0 ? Math.round(samples) : 0,
    supported: tail.supported === true,
  };
}

function nodeGraphClapTailStatusText(instanceId = "") {
  if (!instanceId) {
    return "Tail: no host instance.";
  }
  const tail = nodeGraphClapInstanceTail(instanceId);
  if (!tail.supported) {
    return "Tail: plugin does not expose clap.tail.";
  }
  if (tail.error) {
    return `Tail: read error; ${tail.error}.`;
  }
  return tail.infinite
    ? "Tail: infinite tail reported."
    : `Tail: ${tail.samples} samples reported.`;
}

function nodeGraphClapInstanceState(instanceId = "") {
  const state = nodeGraphClapInstanceSummary(instanceId)?.state || {};
  const maxStateBytes = Number(state.maxStateBytes);
  return {
    maxStateBytes: Number.isFinite(maxStateBytes) && maxStateBytes > 0 ? Math.floor(maxStateBytes) : 0,
    supported: state.supported === true,
  };
}

function formatNodeGraphClapByteCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return "0 bytes";
  }
  if (count >= 1024 * 1024) {
    return `${(count / (1024 * 1024)).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} MB`;
  }
  if (count >= 1024) {
    return `${(count / 1024).toFixed(1).replace(/0+$/, "").replace(/\.$/, "")} KB`;
  }
  return `${Math.round(count)} bytes`;
}

function nodeGraphClapStateStatusText(instanceId = "", binding = {}) {
  const savedText = binding.stateBase64
    ? ` Patch has saved state (${formatNodeGraphClapByteCount(binding.stateByteCount)}).`
    : " Patch has no saved state.";
  if (!instanceId) {
    return `State: no host instance.${savedText}`;
  }
  const state = nodeGraphClapInstanceState(instanceId);
  if (!state.supported) {
    return `State: plugin does not expose clap.state.${savedText}`;
  }
  return `State: supported.${savedText}`;
}

function nodeGraphClapEditorStatusText(instanceId = "") {
  const editor = nodeGraphClapInstanceEditor(instanceId);
  if (!instanceId) {
    return "Editor: no host instance.";
  }
  if (!editor.supported) {
    return `Editor: unavailable${editor.reason ? `; ${editor.reason}` : ""}.`;
  }
  const preferred = editor.preferredApi
    ? ` Preferred: ${editor.preferredApi}${editor.preferredFloating ? " floating" : " embedded"}.`
    : "";
  const apiCount = editor.supportedApis.length;
  const supportText = apiCount ? ` ${apiCount} GUI API ${apiCount === 1 ? "mode" : "modes"} reported.` : "";
  const openText = editor.open ? ` Open: ${editor.api || "host"} ${editor.width}x${editor.height}.` : "";
  return editor.canOpen
    ? `Editor: can open.${openText}${preferred}${supportText}`
    : `Editor: detected, opening unavailable in this prototype.${preferred}${supportText}`;
}

function nodeGraphClapCommitInstanceSummary(instance = {}) {
  if (!instance?.instanceId) {
    return;
  }
  const instanceId = String(instance.instanceId);
  nodeGraphClapHostState.instances.set(instanceId, {
    ...(nodeGraphClapHostState.instances.get(instanceId) || {}),
    ...instance,
  });
}

function nodeGraphClapDeleteInstanceSummary(instanceId = "") {
  nodeGraphClapHostState.instances.delete(String(instanceId || ""));
}

function clearNodeGraphClapHostInstanceSummaries() {
  nodeGraphClapHostState.instances.clear();
}

function formatNodeGraphClapSafetyNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return Math.abs(number) >= 1000 || (Math.abs(number) > 0 && Math.abs(number) < 0.001)
    ? number.toExponential(3)
    : number.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function nodeGraphClapParameterKey(parameter = {}) {
  const id = Number(parameter.id);
  if (Number.isFinite(id)) {
    return `clap_${Math.round(id)}`;
  }
  const index = Number(parameter.index);
  return `clap_index_${Number.isFinite(index) ? Math.round(index) : 0}`;
}

function nodeGraphClapParameterMetadata(parameter = {}) {
  const range = nodeGraphClapParameterRange(parameter);
  const value = nodeGraphClapParameterValue(parameter);
  const stepped = Array.isArray(parameter.flagNames) && (
    parameter.flagNames.includes("stepped") ||
    parameter.flagNames.includes("enum")
  );
  const label = String(parameter.name || `Param ${parameter.index ?? parameter.id ?? 0}`).trim();
  const clapParamId = Number(parameter.id);
  const clapParamIndex = Number(parameter.index);
  return normalizeNodeGraphPatchParameterMetadata("clapPlugin", nodeGraphClapParameterKey(parameter), {
    clapParamId: Number.isFinite(clapParamId) ? Math.round(clapParamId) : undefined,
    clapParamIndex: Number.isFinite(clapParamIndex) ? Math.round(clapParamIndex) : undefined,
    clapParamName: label,
    def: Number.isFinite(Number(parameter.default)) ? Number(parameter.default) : value,
    displayChoices: false,
    divideChoicesVisibly: false,
    kind: "decimal",
    linearSmoothing: true,
    max: range.max,
    maxDigits: 6,
    mid: Number.isFinite(Number(parameter.default)) ? Number(parameter.default) : (range.min + range.max) / 2,
    min: range.min,
    nonlinearSlider: false,
    showSign: range.min < 0,
    step: stepped ? 1 : 0,
    unit: "",
    wraparound: false,
  });
}

function nodeGraphClapParameterDefinition(parameter = {}) {
  const metadata = nodeGraphClapParameterMetadata(parameter);
  const label = String(parameter.name || `Param ${parameter.index ?? parameter.id ?? 0}`).trim();
  return {
    ...metadata,
    defaultValue: metadata.def,
    key: nodeGraphClapParameterKey(parameter),
    label,
  };
}

function nodeGraphClapPatchParametersFromPayload(payload = {}) {
  return (Array.isArray(payload.parameters) ? payload.parameters : [])
    .map(nodeGraphClapParameterDefinition)
    .filter((parameter) => parameter?.key);
}

function nodeGraphCommitClapPluginParameterPayload(nodeId, payload = {}) {
  const parameters = nodeGraphClapPatchParametersFromPayload(payload);
  if (!parameters.length) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((node) => node.id === nodeId && node.type === "clapPlugin");
  if (!patchNode) {
    return false;
  }
  patchNode.paramMeta = { ...(patchNode.paramMeta || {}) };
  patchNode.params = { ...(patchNode.params || {}) };
  for (const parameter of parameters) {
    patchNode.paramMeta[parameter.key] = parameter;
    const current = Number(
      payload.parameters.find((candidate) => nodeGraphClapParameterKey(candidate) === parameter.key)?.current,
    );
    patchNode.params[parameter.key] = normalizeNodeGraphPatchParameter(
      patchNode.type,
      parameter.key,
      Object.hasOwn(patchNode.params, parameter.key) ? patchNode.params[parameter.key] : current,
      patchNode.paramMeta[parameter.key],
    );
  }
  commitNodeGraphPatch(patch, {
    record: false,
    status: "CLAP parameters synced",
  });
  return true;
}

function syncNodeGraphClapPatchParameterFromHostSlider(nodeId, parameter, value) {
  const patchNode = nodeGraphMvp.patch.nodes.find((node) => node.id === nodeId && node.type === "clapPlugin");
  if (!patchNode) {
    return;
  }
  const key = nodeGraphClapParameterKey(parameter);
  const metadata = nodeGraphClapParameterMetadata(parameter);
  patchNode.paramMeta = {
    ...(patchNode.paramMeta || {}),
    [key]: metadata,
  };
  patchNode.params = {
    ...(patchNode.params || {}),
    [key]: normalizeNodeGraphPatchParameter("clapPlugin", key, value, metadata),
  };
  syncNodeGraphScriptView("CLAP parameter synced", true);
  renderNodeGraphExecutionPlanDebug();
  markNodeGraphRenderPending();
}

async function syncStoredNodeGraphClapParametersToHost(nodeId, binding, payload = {}) {
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!patchNode || !binding.instanceId || !Array.isArray(payload.parameters)) {
    return false;
  }
  const parameters = [];
  for (const parameter of payload.parameters) {
    const key = nodeGraphClapParameterKey(parameter);
    if (!Object.hasOwn(patchNode.params || {}, key)) {
      continue;
    }
    const value = Number(patchNode.params[key]);
    if (!Number.isFinite(value) || Math.abs(value - Number(parameter.current)) < 1e-9) {
      continue;
    }
    parameters.push({ paramId: Number(parameter.id), value });
  }
  if (!parameters.length) {
    return false;
  }
  await postNodeGraphClapHostJson(
    `/instances/${encodeURIComponent(binding.instanceId)}/params`,
    { parameters },
    5000,
  );
  return true;
}

function nodeGraphClapParameterValue(parameter = {}) {
  const current = Number(parameter.current);
  if (Number.isFinite(current)) {
    return current;
  }
  const fallback = Number(parameter.default);
  return Number.isFinite(fallback) ? fallback : 0;
}

function nodeGraphClapParameterRange(parameter = {}) {
  const min = Number(parameter.min);
  const max = Number(parameter.max);
  const value = nodeGraphClapParameterValue(parameter);
  const safeMin = Number.isFinite(min) ? min : Math.min(0, value);
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
  return { max: safeMax, min: safeMin };
}

function formatNodeGraphClapParameterValue(parameter = {}, value = nodeGraphClapParameterValue(parameter)) {
  const display = String(parameter.display || "").trim();
  if (display && Math.abs(Number(parameter.current) - Number(value)) < 1e-9) {
    return display;
  }
  if (!Number.isFinite(Number(value))) {
    return "";
  }
  const absolute = Math.abs(Number(value));
  return absolute >= 1000 || (absolute > 0 && absolute < 0.001)
    ? Number(value).toExponential(4)
    : Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function nodeGraphClapSelectedCatalogPlugin(patchNode) {
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!binding.catalogId) {
    return null;
  }
  return nodeGraphClapHostState.plugins.find((plugin) => plugin.id === binding.catalogId) || null;
}

function nodeGraphCommitClapPluginBinding(nodeId, clap, options = {}) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((node) => node.id === nodeId && node.type === "clapPlugin");
  if (!patchNode) {
    return false;
  }
  patchNode.clap = normalizeNodeGraphClapPluginBinding(clap);
  if (options.clearParameters) {
    patchNode.params = {};
    patchNode.paramMeta = {};
  }
  commitNodeGraphPatch(patch, { status: "CLAP plugin updated" });
  return true;
}

// Presets are files on the host (see cached_discover_clap_plugins-style
// GET/POST/DELETE /presets in webui_clap_host.py), not a per-plugin Module
// Browser catalog entry -- a configured node is already a self-describing
// preset (clap binding + params + saved clap.state), so this just persists
// that shape and replays it onto a *fresh* instance on load. instanceId is
// deliberately never part of a preset; it's scoped to one running host
// process's lifetime, not portable across sessions. See "Design Direction"
// in docs/WEBUI_CLAP_HOST_PLAN.md.
async function refreshNodeGraphClapPresets() {
  if (nodeGraphClapHostState.status !== "connected") return;
  try {
    const payload = await fetchNodeGraphClapHostJson("/presets", 3000);
    if (payload?.ok === true && Array.isArray(payload.presets)) {
      nodeGraphClapHostState.presets = payload.presets;
    }
  } catch {
    // Preset listing is a convenience; a failed fetch just leaves the
    // picker showing whatever it last had (or empty on first connect).
  }
  syncNodeGraphClapPluginElements();
}

async function saveNodeGraphClapPluginPreset(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.catalogId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  const detailElement = document.getElementById("nodeClapHostDetail");
  const nameInput = document.querySelector(`[data-clap-plugin-preset-name="${CSS.escape(nodeId)}"]`);
  const name = String(nameInput?.value || "").trim() || binding.name || "Untitled Preset";
  try {
    // Freshen saved state before capturing the preset, if there's a live
    // instance -- otherwise the preset would carry whatever state was
    // saved last (possibly none).
    if (binding.instanceId) {
      await saveNodeGraphClapPluginState(nodeId);
    }
    const freshNode = nodeGraphPatchNode(nodeId);
    const freshBinding = normalizeNodeGraphClapPluginBinding(freshNode?.clap);
    const payload = await postNodeGraphClapHostJson("/presets", {
      name,
      clap: freshBinding,
      params: freshNode?.params || {},
      paramMeta: freshNode?.paramMeta || {},
    }, 4000);
    if (payload?.ok !== true) {
      throw new Error(payload?.error || "preset save failed");
    }
    if (detailElement) {
      detailElement.textContent = `connected; saved preset "${payload.name}"`;
    }
    await refreshNodeGraphClapPresets();
  } catch (error) {
    if (detailElement) {
      detailElement.textContent = `connected; preset save error: ${error?.message || error}`;
    }
  }
  syncNodeGraphClapPluginElements();
}

function applyNodeGraphClapPluginPreset(nodeId, preset) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((node) => node.id === nodeId && node.type === "clapPlugin");
  if (!patchNode) {
    return false;
  }
  patchNode.clap = normalizeNodeGraphClapPluginBinding(preset?.clap);
  patchNode.params = preset?.params && typeof preset.params === "object" ? { ...preset.params } : {};
  patchNode.paramMeta = preset?.paramMeta && typeof preset.paramMeta === "object" ? { ...preset.paramMeta } : {};
  commitNodeGraphPatch(patch, { status: `CLAP preset "${preset?.name || ""}" loaded` });
  return true;
}

async function loadNodeGraphClapPluginPreset(nodeId, presetId) {
  if (!presetId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  const detailElement = document.getElementById("nodeClapHostDetail");
  try {
    const preset = await fetchNodeGraphClapHostJson(`/presets/${encodeURIComponent(presetId)}`, 3000);
    if (preset?.ok !== true || !preset.clap?.clapId) {
      throw new Error(preset?.error || "preset not found");
    }
    applyNodeGraphClapPluginPreset(nodeId, preset);
    // Presets always create a fresh instance -- createNodeGraphClapPluginInstance
    // already restores saved clap.state when present, or otherwise syncs the
    // preset's stored params onto the new instance via
    // refreshNodeGraphClapPluginParameters -> syncStoredNodeGraphClapParametersToHost.
    await createNodeGraphClapPluginInstance(nodeId);
  } catch (error) {
    if (detailElement) {
      detailElement.textContent = `connected; preset load error: ${error?.message || error}`;
    }
    syncNodeGraphClapPluginElements();
  }
}

async function deleteNodeGraphClapPreset(presetId) {
  if (!presetId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  try {
    await deleteNodeGraphClapHostJson(`/presets/${encodeURIComponent(presetId)}`, 3000);
  } catch {
    // Best-effort; the list refresh below will still reflect host truth.
  }
  await refreshNodeGraphClapPresets();
}

function createNodeGraphClapParameterRow(nodeId, binding, parameter) {
  const definition = nodeGraphClapParameterDefinition(parameter);
  const row = document.createElement("div");
  row.className = "node-clap-plugin-param-row node-parameter-row";
  row.dataset.clapParamId = String(parameter.id);
  row.dataset.param = definition.key;

  row.append(createNodeParameterModulationPort(nodeId, "clapPlugin", definition));

  const control = document.createElement("label");
  control.className = "node-parameter-control node-clap-plugin-param-control";
  control.dataset.paramLabel = definition.label;
  control.setAttribute("aria-label", definition.label);

  const header = document.createElement("span");
  header.className = "node-clap-plugin-param-header";
  const name = document.createElement("span");
  name.className = "node-clap-plugin-param-name";
  name.textContent = definition.label;
  const valueText = document.createElement("span");
  valueText.className = "node-clap-plugin-param-value";
  const key = definition.key;
  const patchNode = nodeGraphPatchNode(nodeId);
  const patchValue = Number(patchNode?.params?.[key]);
  const value = Number.isFinite(patchValue) ? patchValue : nodeGraphClapParameterValue(parameter);
  valueText.textContent = formatNodeGraphClapParameterValue(parameter, value);
  header.append(name, valueText);

  const input = document.createElement("input");
  input.type = "range";
  input.dataset.clapParamId = String(parameter.id);
  input.dataset.param = key;
  input.dataset.step = String(definition.step ?? 0);
  input.dataset.mid = String(definition.mid ?? definition.defaultValue ?? 0);
  input.dataset.default = String(definition.defaultValue ?? 0);
  input.dataset.kind = definition.kind || "decimal";
  input.dataset.maxDigits = String(
    normalizeNodeGraphMetadataMaxDigits(definition.maxDigits, definition.kind),
  );
  input.dataset.unit = definition.unit ?? "";
  input.dataset.choices = formatNodeMetadataChoices(definition.choices || []);
  input.dataset.displayChoices = definition.displayChoices ? "true" : "false";
  input.dataset.divideChoicesVisibly = definition.divideChoicesVisibly ? "true" : "false";
  input.dataset.linearSmoothing = definition.linearSmoothing === false ? "false" : "true";
  input.dataset.sliderCurve = normalizeNodeSliderCurve(definition.sliderCurve, definition.nonlinearSlider);
  input.dataset.curveAmount = String(normalizeNodeSliderCurveAmount(definition.curveAmount));
  input.dataset.nonlinearSlider = definition.nonlinearSlider ? "true" : "false";
  input.dataset.showSign = definition.showSign ? "true" : "false";
  input.dataset.wraparound = definition.wraparound ? "true" : "false";
  const range = nodeGraphClapParameterRange(parameter);
  input.min = String(range.min);
  input.max = String(range.max);
  input.step = Array.isArray(parameter.flagNames) && (
    parameter.flagNames.includes("stepped") ||
    parameter.flagNames.includes("enum")
  ) ? "1" : "any";
  input.value = String(Math.max(range.min, Math.min(range.max, value)));
  input.disabled = Array.isArray(parameter.flagNames) && parameter.flagNames.includes("readonly");
  input.addEventListener("input", () => {
    valueText.textContent = formatNodeGraphClapParameterValue(parameter, Number(input.value));
    syncNodeGraphClapPatchParameterFromHostSlider(nodeId, parameter, Number(input.value));
    queueNodeGraphClapParameterWrite(nodeId, binding.instanceId, Number(parameter.id), Number(input.value));
  });

  control.append(header, input);
  row.append(control);
  row.append(createNodeParameterOutputPort(nodeId, "clapPlugin", definition));
  return row;
}

function createNodeGraphClapPluginBody(nodeId) {
  const body = document.createElement("div");
  body.className = "dsp-node-body node-clap-plugin-body";
  body.dataset.clapPluginNode = nodeId;

  const select = document.createElement("select");
  select.className = "node-clap-plugin-select";
  select.dataset.clapPluginSelect = nodeId;
  select.setAttribute("aria-label", "CLAP plugin");
  select.addEventListener("change", () => {
    const plugin = nodeGraphClapHostState.plugins.find((candidate) => candidate.id === select.value);
    const previous = normalizeNodeGraphClapPluginBinding(nodeGraphPatchNode(nodeId)?.clap);
    const next = plugin ? nodeGraphClapPluginBindingFromCatalog(plugin) : {};
    nodeGraphCommitClapPluginBinding(nodeId, next, {
      clearParameters: previous.catalogId !== next.catalogId,
    });
  });

  const presetRow = document.createElement("div");
  presetRow.className = "node-clap-plugin-preset-row";

  const presetSelect = document.createElement("select");
  presetSelect.className = "node-clap-plugin-preset-select";
  presetSelect.dataset.clapPluginPresetSelect = nodeId;
  presetSelect.setAttribute("aria-label", "Load CLAP preset");
  presetSelect.addEventListener("change", () => {
    if (presetSelect.value) {
      loadNodeGraphClapPluginPreset(nodeId, presetSelect.value);
    }
  });

  // Deletes whichever preset is currently selected in presetSelect --
  // simpler than a per-option delete affordance, and the picker naturally
  // shows what's about to be deleted.
  const presetDeleteButton = createNodeGraphClapPluginActionButton(
    "Delete Preset",
    "clapPluginDeletePreset",
    nodeId,
    () => deleteNodeGraphClapPreset(presetSelect.value),
  );

  const presetNameInput = document.createElement("input");
  presetNameInput.type = "text";
  presetNameInput.className = "node-clap-plugin-preset-name";
  presetNameInput.dataset.clapPluginPresetName = nodeId;
  presetNameInput.placeholder = "Preset name";
  presetNameInput.setAttribute("aria-label", "CLAP preset name");

  const presetSaveButton = createNodeGraphClapPluginActionButton(
    "Save as Preset",
    "clapPluginSavePreset",
    nodeId,
    saveNodeGraphClapPluginPreset,
  );

  presetRow.append(presetSelect, presetDeleteButton, presetNameInput, presetSaveButton);

  const detail = document.createElement("div");
  detail.className = "node-clap-plugin-detail";
  detail.dataset.clapPluginDetail = nodeId;

  const safety = document.createElement("div");
  safety.className = "node-clap-plugin-safety";
  safety.dataset.clapPluginSafety = nodeId;

  const actions = document.createElement("div");
  actions.className = "node-clap-plugin-actions";
  const createButton = createNodeGraphClapPluginActionButton(
    "Create Instance",
    "clapPluginCreate",
    nodeId,
    createNodeGraphClapPluginInstance,
  );
  const deleteButton = createNodeGraphClapPluginActionButton(
    "Delete Instance",
    "clapPluginDelete",
    nodeId,
    deleteNodeGraphClapPluginInstance,
  );
  const refreshButton = createNodeGraphClapPluginActionButton(
    "Refresh Params",
    "clapPluginRefreshParams",
    nodeId,
    refreshNodeGraphClapPluginParameters,
  );
  const resetSafetyButton = createNodeGraphClapPluginActionButton(
    "Reset Safety",
    "clapPluginResetSafety",
    nodeId,
    resetNodeGraphClapPluginSafety,
  );
  const editorButton = createNodeGraphClapPluginActionButton(
    "Open Editor",
    "clapPluginOpenEditor",
    nodeId,
    openNodeGraphClapPluginEditor,
  );
  const closeEditorButton = createNodeGraphClapPluginActionButton(
    "Close Editor",
    "clapPluginCloseEditor",
    nodeId,
    closeNodeGraphClapPluginEditor,
  );
  const saveStateButton = createNodeGraphClapPluginActionButton(
    "Save State",
    "clapPluginSaveState",
    nodeId,
    saveNodeGraphClapPluginState,
  );
  const restoreStateButton = createNodeGraphClapPluginActionButton(
    "Restore State",
    "clapPluginRestoreState",
    nodeId,
    restoreNodeGraphClapPluginState,
  );
  actions.append(
    createButton,
    deleteButton,
    refreshButton,
    resetSafetyButton,
    editorButton,
    closeEditorButton,
    saveStateButton,
    restoreStateButton,
  );

  const params = document.createElement("div");
  params.className = "node-clap-plugin-param-list";
  params.dataset.clapPluginParamList = nodeId;

  body.append(select, presetRow, detail, safety, actions, params);
  syncNodeGraphClapPluginBody(body, nodeGraphPatchNode(nodeId));
  return body;
}

function syncNodeGraphClapPluginElement(element, patchNode) {
  const body = element?.querySelector?.(".node-clap-plugin-body");
  if (body) {
    syncNodeGraphClapPluginBody(body, patchNode);
  }
}

function syncNodeGraphClapPluginActionButtons(buttons, binding, staleInstance) {
  const buttonList = [
    buttons?.createButton,
    buttons?.deleteButton,
    buttons?.refreshButton,
    buttons?.resetSafetyButton,
    buttons?.editorButton,
    buttons?.closeEditorButton,
    buttons?.saveStateButton,
    buttons?.restoreStateButton,
  ];
  if (nodeGraphClapHostUnderConstruction) {
    markNodeGraphClapHostButtonsUnderConstruction(buttonList);
    return;
  }
  if (buttons?.createButton) {
    buttons.createButton.disabled = nodeGraphClapHostState.status !== "connected" ||
      !binding.path ||
      !binding.clapId ||
      Boolean(binding.instanceId);
  }
  if (buttons?.deleteButton) {
    buttons.deleteButton.textContent = staleInstance ? "Forget Instance" : "Delete Instance";
    buttons.deleteButton.disabled = nodeGraphClapHostState.status !== "connected" || !binding.instanceId;
  }
  if (buttons?.refreshButton) {
    buttons.refreshButton.disabled = nodeGraphClapHostState.status !== "connected" ||
      !binding.instanceId ||
      staleInstance;
  }
  if (buttons?.resetSafetyButton) {
    buttons.resetSafetyButton.disabled = nodeGraphClapHostState.status !== "connected" ||
      !binding.instanceId ||
      staleInstance;
  }
  const editor = nodeGraphClapInstanceEditor(binding.instanceId);
  if (buttons?.editorButton) {
    buttons.editorButton.disabled = nodeGraphClapHostState.status !== "connected" ||
      !binding.instanceId ||
      staleInstance ||
      !editor.canOpen;
  }
  if (buttons?.closeEditorButton) {
    buttons.closeEditorButton.disabled = nodeGraphClapHostState.status !== "connected" ||
      !binding.instanceId ||
      staleInstance ||
      editor.open !== true;
  }
  const state = nodeGraphClapInstanceState(binding.instanceId);
  if (buttons?.saveStateButton) {
    buttons.saveStateButton.disabled = nodeGraphClapHostState.status !== "connected" ||
      !binding.instanceId ||
      staleInstance ||
      !state.supported;
  }
  if (buttons?.restoreStateButton) {
    buttons.restoreStateButton.disabled = nodeGraphClapHostState.status !== "connected" ||
      !binding.instanceId ||
      staleInstance ||
      !state.supported ||
      !binding.stateBase64;
  }
}

function syncNodeGraphClapPluginBody(body, patchNode) {
  if (!body || !patchNode) {
    return;
  }
  const binding = normalizeNodeGraphClapPluginBinding(patchNode.clap);
  const select = body.querySelector("[data-clap-plugin-select]");
  const presetSelect = body.querySelector("[data-clap-plugin-preset-select]");
  const presetNameInput = body.querySelector("[data-clap-plugin-preset-name]");
  const presetSaveButton = body.querySelector("[data-clap-plugin-save-preset]");
  const presetDeleteButton = body.querySelector("[data-clap-plugin-delete-preset]");
  const detail = body.querySelector("[data-clap-plugin-detail]");
  const createButton = body.querySelector("[data-clap-plugin-create]");
  const deleteButton = body.querySelector("[data-clap-plugin-delete]");
  const refreshButton = body.querySelector("[data-clap-plugin-refresh-params]");
  const resetSafetyButton = body.querySelector("[data-clap-plugin-reset-safety]");
  const editorButton = body.querySelector("[data-clap-plugin-open-editor]");
  const closeEditorButton = body.querySelector("[data-clap-plugin-close-editor]");
  const saveStateButton = body.querySelector("[data-clap-plugin-save-state]");
  const restoreStateButton = body.querySelector("[data-clap-plugin-restore-state]");
  const safety = body.querySelector("[data-clap-plugin-safety]");
  const paramList = body.querySelector("[data-clap-plugin-param-list]");
  if (select) {
    const selectedValue = binding.catalogId;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = nodeGraphClapHostState.status === "connected"
      ? "Select CLAP plugin"
      : "Connect host first";
    select.append(placeholder);
    for (const plugin of nodeGraphClapHostState.plugins) {
      const option = document.createElement("option");
      option.value = plugin.id;
      option.textContent = nodeGraphClapPluginOptionLabel(plugin);
      select.append(option);
    }
    select.value = selectedValue;
    select.disabled = nodeGraphClapHostState.status !== "connected" || nodeGraphClapHostState.plugins.length === 0;
  }
  if (presetSelect) {
    const previousValue = presetSelect.value;
    presetSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = nodeGraphClapHostState.presets.length
      ? "Load saved preset..."
      : "No saved presets";
    presetSelect.append(placeholder);
    for (const preset of nodeGraphClapHostState.presets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.pluginName ? `${preset.name} (${preset.pluginName})` : preset.name;
      presetSelect.append(option);
    }
    // Only preserve a prior selection if it's still a real saved preset --
    // otherwise leave it on the placeholder (e.g. right after a delete).
    presetSelect.value = nodeGraphClapHostState.presets.some((preset) => preset.id === previousValue)
      ? previousValue
      : "";
    presetSelect.disabled = nodeGraphClapHostState.status !== "connected" || nodeGraphClapHostState.presets.length === 0;
  }
  if (presetSaveButton) {
    presetSaveButton.disabled = nodeGraphClapHostUnderConstruction ||
      nodeGraphClapHostState.status !== "connected" ||
      !binding.catalogId;
  }
  if (presetDeleteButton) {
    presetDeleteButton.disabled = nodeGraphClapHostUnderConstruction ||
      nodeGraphClapHostState.status !== "connected" ||
      !presetSelect?.value;
  }
  if (presetNameInput && !presetNameInput.value) {
    presetNameInput.placeholder = binding.name ? `Preset name (e.g. "${binding.name} lead")` : "Preset name";
  }
  const selectedPlugin = nodeGraphClapSelectedCatalogPlugin(patchNode);
  const staleInstance = nodeGraphClapInstanceIsStale(binding.instanceId);
  if (detail) {
    if (!binding.catalogId) {
      detail.textContent = "No plugin selected. Select a host catalog entry, then create an instance.";
    } else if (selectedPlugin?.metadataError) {
      detail.textContent = `Descriptor error: ${selectedPlugin.metadataError}`;
    } else {
      const source = selectedPlugin || binding;
      const identity = [source.vendor, source.name].filter(Boolean).join(" - ") || source.clapId || source.path || "Selected CLAP plugin";
      const instanceText = staleInstance
        ? ` Instance ${binding.instanceId} is not present in the connected host.`
        : binding.instanceId ? ` Instance: ${binding.instanceId}.` : " No host instance.";
      const editorText = staleInstance ? "" : ` ${nodeGraphClapEditorStatusText(binding.instanceId)}`;
      const latencyText = staleInstance ? "" : ` ${nodeGraphClapLatencyStatusText(binding.instanceId)}`;
      const tailText = staleInstance ? "" : ` ${nodeGraphClapTailStatusText(binding.instanceId)}`;
      const stateText = staleInstance ? "" : ` ${nodeGraphClapStateStatusText(binding.instanceId, binding)}`;
      detail.textContent = `${identity}.${instanceText} Render Sample uses the host instance when connected.${editorText}${latencyText}${tailText}${stateText}`;
    }
  }
  if (safety) {
    safety.classList.remove("warn", "good");
    if (!binding.instanceId) {
      safety.textContent = "Safety: no host instance.";
    } else if (staleInstance) {
      safety.classList.add("warn");
      safety.textContent = "Safety: host instance is stale. Forget it, then create a new instance.";
    } else {
      const state = nodeGraphClapInstanceSafety(binding.instanceId);
      safety.classList.add(state.latched ? "warn" : "good");
      if (state.latched) {
        safety.textContent = `Safety muted: ${state.reason || "latched"}; raw peak ${formatNodeGraphClapSafetyNumber(state.rawPeak)} / limit ${formatNodeGraphClapSafetyNumber(state.peakLimit)}.`;
      } else {
        safety.textContent = `Safety clear. Raw peak ${formatNodeGraphClapSafetyNumber(state.rawPeak)} / limit ${formatNodeGraphClapSafetyNumber(state.peakLimit)}.`;
      }
    }
  }
  syncNodeGraphClapPluginActionButtons({
    createButton,
    deleteButton,
    refreshButton,
    resetSafetyButton,
    editorButton,
    closeEditorButton,
    saveStateButton,
    restoreStateButton,
  }, binding, staleInstance);
  if (paramList) {
    paramList.replaceChildren();
    if (!binding.instanceId) {
      const empty = document.createElement("div");
      empty.className = "node-clap-plugin-param-empty";
      empty.textContent = "Create an instance to read CLAP parameters.";
      paramList.append(empty);
    } else {
      const payload = nodeGraphClapParameterPayload(binding.instanceId);
      const parameters = Array.isArray(payload?.parameters) ? payload.parameters : [];
      if (staleInstance) {
        const empty = document.createElement("div");
        empty.className = "node-clap-plugin-param-empty";
        empty.textContent = "Host instance is stale. Forget it, then create a new instance.";
        paramList.append(empty);
      } else if (!payload) {
        const empty = document.createElement("div");
        empty.className = "node-clap-plugin-param-empty";
        empty.textContent = "Parameters not loaded.";
        paramList.append(empty);
      } else if (!payload.supported) {
        const empty = document.createElement("div");
        empty.className = "node-clap-plugin-param-empty";
        empty.textContent = "Plugin does not expose clap.params.";
        paramList.append(empty);
      } else if (parameters.length === 0) {
        const empty = document.createElement("div");
        empty.className = "node-clap-plugin-param-empty";
        empty.textContent = "No parameters exposed.";
        paramList.append(empty);
      } else {
        for (const parameter of parameters.slice(0, 24)) {
          paramList.append(createNodeGraphClapParameterRow(nodeGraphClapPluginNodeIdFromBody(body), binding, parameter));
        }
        if (parameters.length > 24) {
          const truncated = document.createElement("div");
          truncated.className = "node-clap-plugin-param-empty";
          truncated.textContent = `${parameters.length - 24} more parameters hidden in this prototype.`;
          paramList.append(truncated);
        }
      }
    }
  }
}

function nodeGraphClapPluginNodeIdFromBody(body) {
  return String(body?.dataset?.clapPluginNode || "");
}

function syncNodeGraphClapPluginElements() {
  for (const element of document.querySelectorAll(".dsp-node[data-node-type='clapPlugin']")) {
    syncNodeGraphClapPluginElement(element, nodeGraphPatchNode(element.dataset.node));
  }
}

async function refreshNodeGraphClapPluginParameters(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.instanceId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  try {
    const payload = await fetchNodeGraphClapHostJson(
      `/instances/${encodeURIComponent(binding.instanceId)}/params`,
      3000,
    );
    if (payload?.ok !== true) {
      throw new Error("parameter read failed");
    }
    if (await syncStoredNodeGraphClapParametersToHost(nodeId, binding, payload)) {
      const updatedPayload = await fetchNodeGraphClapHostJson(
        `/instances/${encodeURIComponent(binding.instanceId)}/params`,
        3000,
      );
      if (updatedPayload?.ok === true) {
        payload.parameters = updatedPayload.parameters;
        payload.count = updatedPayload.count;
        payload.supported = updatedPayload.supported;
      }
    }
    nodeGraphClapHostState.parameterPayloads.set(binding.instanceId, payload);
    nodeGraphCommitClapPluginParameterPayload(nodeId, payload);
  } catch (error) {
    const detailElement = document.getElementById("nodeClapHostDetail");
    if (detailElement) {
      detailElement.textContent = `connected; parameter error: ${error?.message || error}`;
    }
  }
  syncNodeGraphClapPluginElements();
}

function queueNodeGraphClapParameterWrite(nodeId, instanceId, paramId, value) {
  if (!instanceId || !Number.isFinite(paramId) || !Number.isFinite(value)) {
    return;
  }
  const key = `${instanceId}:${paramId}`;
  const existing = nodeGraphClapHostState.parameterWriteTimers.get(key);
  if (existing) {
    window.clearTimeout(existing);
  }
  const timer = window.setTimeout(async () => {
    nodeGraphClapHostState.parameterWriteTimers.delete(key);
    try {
      const payload = await postNodeGraphClapHostJson(
        `/instances/${encodeURIComponent(instanceId)}/param`,
        { paramId, value },
        3000,
      );
      if (payload?.ok !== true) {
        throw new Error("parameter write failed");
      }
      await refreshNodeGraphClapPluginParameters(nodeId);
    } catch (error) {
      const detailElement = document.getElementById("nodeClapHostDetail");
      if (detailElement) {
        detailElement.textContent = `connected; parameter write error: ${error?.message || error}`;
      }
      syncNodeGraphClapPluginElements();
    }
  }, 180);
  nodeGraphClapHostState.parameterWriteTimers.set(key, timer);
}

async function createNodeGraphClapPluginInstance(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.path || !binding.clapId || binding.instanceId) {
    return;
  }
  try {
    const payload = await postNodeGraphClapHostJson("/instances", {
      clapId: binding.clapId,
      path: binding.path,
    }, 4000);
    if (payload?.ok !== true || !payload.instance?.instanceId) {
      throw new Error("instance creation failed");
    }
    nodeGraphClapCommitInstanceSummary(payload.instance);
    nodeGraphCommitClapPluginBinding(nodeId, {
      ...binding,
      audioInputs: payload.instance.audioInputs,
      audioOutputs: payload.instance.audioOutputs,
      instanceId: payload.instance.instanceId,
    });
    const restoredState = binding.stateBase64
      ? await restoreNodeGraphClapPluginState(nodeId, { silent: true })
      : false;
    if (!restoredState) {
      await refreshNodeGraphClapPluginParameters(nodeId);
    }
  } catch (error) {
    const detailElement = document.getElementById("nodeClapHostDetail");
    if (detailElement) {
      detailElement.textContent = `connected; instance error: ${error?.message || error}`;
    }
    syncNodeGraphClapPluginElements();
  }
}

async function resetNodeGraphClapPluginSafety(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.instanceId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  try {
    const payload = await postNodeGraphClapHostJson(
      `/instances/${encodeURIComponent(binding.instanceId)}/safety/reset`,
      {},
      2500,
    );
    if (payload?.ok !== true) {
      throw new Error("safety reset failed");
    }
    nodeGraphClapCommitInstanceSummary({
      ...(nodeGraphClapInstanceSummary(binding.instanceId) || {}),
      instanceId: binding.instanceId,
      safety: payload.safety,
    });
    markNodeGraphRenderPending("CLAP safety reset; render sample to process again.");
  } catch (error) {
    const detailElement = document.getElementById("nodeClapHostDetail");
    if (detailElement) {
      detailElement.textContent = `connected; safety reset error: ${error?.message || error}`;
    }
  }
  syncNodeGraphClapPluginElements();
}

async function openNodeGraphClapPluginEditor(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.instanceId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  const detailElement = document.getElementById("nodeClapHostDetail");
  try {
    const payload = await postNodeGraphClapHostJson(
      `/instances/${encodeURIComponent(binding.instanceId)}/editor/open`,
      {},
      nodeGraphClapEditorRequestTimeoutMs,
    );
    nodeGraphClapCommitInstanceSummary({
      ...(nodeGraphClapInstanceSummary(binding.instanceId) || {}),
      instanceId: binding.instanceId,
      editor: payload.editor,
    });
    if (detailElement) {
      detailElement.textContent = payload?.ok === true
        ? "connected; plugin editor opened"
        : `connected; editor unavailable: ${payload?.error || payload?.editor?.reason || "not implemented"}`;
    }
  } catch (error) {
    if (detailElement) {
      detailElement.textContent = `connected; editor error: ${error?.message || error}`;
    }
  }
  syncNodeGraphClapPluginElements();
}

async function closeNodeGraphClapPluginEditor(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.instanceId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  const detailElement = document.getElementById("nodeClapHostDetail");
  try {
    const payload = await postNodeGraphClapHostJson(
      `/instances/${encodeURIComponent(binding.instanceId)}/editor/close`,
      {},
      nodeGraphClapEditorRequestTimeoutMs,
    );
    nodeGraphClapCommitInstanceSummary({
      ...(nodeGraphClapInstanceSummary(binding.instanceId) || {}),
      instanceId: binding.instanceId,
      editor: payload.editor,
    });
    if (detailElement) {
      detailElement.textContent = payload?.ok === true
        ? "connected; plugin editor closed"
        : `connected; editor close unavailable: ${payload?.error || payload?.editor?.reason || "not available"}`;
    }
  } catch (error) {
    if (detailElement) {
      detailElement.textContent = `connected; editor close error: ${error?.message || error}`;
    }
  }
  syncNodeGraphClapPluginElements();
}

async function saveNodeGraphClapPluginState(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.instanceId || nodeGraphClapHostState.status !== "connected") {
    return;
  }
  const detailElement = document.getElementById("nodeClapHostDetail");
  try {
    const payload = await fetchNodeGraphClapHostJson(
      `/instances/${encodeURIComponent(binding.instanceId)}/state`,
      4000,
    );
    if (payload?.ok !== true) {
      throw new Error(payload?.error || "state save failed");
    }
    nodeGraphClapCommitInstanceSummary({
      ...(nodeGraphClapInstanceSummary(binding.instanceId) || {}),
      instanceId: binding.instanceId,
      state: payload.state,
    });
    if (payload.supported !== true) {
      if (detailElement) {
        detailElement.textContent = "connected; plugin does not expose clap.state";
      }
      syncNodeGraphClapPluginElements();
      return;
    }
    nodeGraphCommitClapPluginBinding(nodeId, {
      ...binding,
      stateBase64: payload.stateBase64,
      stateByteCount: payload.byteCount,
      stateSavedAt: new Date().toISOString(),
    });
    if (detailElement) {
      detailElement.textContent = `connected; saved CLAP state (${formatNodeGraphClapByteCount(payload.byteCount)})`;
    }
  } catch (error) {
    if (detailElement) {
      detailElement.textContent = `connected; state save error: ${error?.message || error}`;
    }
  }
  syncNodeGraphClapPluginElements();
}

async function restoreNodeGraphClapPluginState(nodeId, options = {}) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.instanceId || !binding.stateBase64 || nodeGraphClapHostState.status !== "connected") {
    return false;
  }
  const detailElement = document.getElementById("nodeClapHostDetail");
  try {
    const payload = await postNodeGraphClapHostJson(
      `/instances/${encodeURIComponent(binding.instanceId)}/state`,
      { stateBase64: binding.stateBase64 },
      4000,
    );
    if (payload?.ok !== true) {
      throw new Error(payload?.error || "state restore failed");
    }
    nodeGraphClapCommitInstanceSummary({
      ...(nodeGraphClapInstanceSummary(binding.instanceId) || {}),
      instanceId: binding.instanceId,
      state: payload.state,
    });
    if (!options.silent && detailElement) {
      detailElement.textContent = `connected; restored CLAP state (${formatNodeGraphClapByteCount(payload.byteCount)})`;
    }
    await refreshNodeGraphClapPluginParameters(nodeId);
    return true;
  } catch (error) {
    if (!options.silent && detailElement) {
      detailElement.textContent = `connected; state restore error: ${error?.message || error}`;
    }
  }
  syncNodeGraphClapPluginElements();
  return false;
}

async function deleteNodeGraphClapPluginInstance(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const binding = normalizeNodeGraphClapPluginBinding(patchNode?.clap);
  if (!patchNode || !binding.instanceId) {
    return;
  }
  try {
    await deleteNodeGraphClapHostJson(`/instances/${encodeURIComponent(binding.instanceId)}`, 2500);
  } catch {
    // The browser patch should still forget stale host instance ids after host restarts.
  }
  const { instanceId, ...nextBinding } = binding;
  nodeGraphClapDeleteInstanceSummary(instanceId);
  nodeGraphClapHostState.parameterPayloads.delete(instanceId);
  nodeGraphCommitClapPluginBinding(nodeId, nextBinding);
}

async function refreshNodeGraphClapHostInstances() {
  if (nodeGraphClapHostState.status !== "connected") {
    return;
  }
  try {
    const payload = await fetchNodeGraphClapHostJson("/instances", 3000);
    if (payload?.ok !== true || !Array.isArray(payload.instances)) {
      throw new Error("unexpected instance list response");
    }
    clearNodeGraphClapHostInstanceSummaries();
    for (const instance of payload.instances) {
      nodeGraphClapCommitInstanceSummary(instance);
    }
    syncNodeGraphClapPluginElements();
  } catch (error) {
    clearNodeGraphClapHostInstanceSummaries();
    const detailElement = document.getElementById("nodeClapHostDetail");
    if (detailElement) {
      detailElement.textContent = `connected; instance list error: ${error?.message || error}`;
    }
    syncNodeGraphClapPluginElements();
  }
}

async function connectNodeGraphClapHost() {
  try {
    applyNodeGraphClapHostBaseUrlFromInput({ disconnect: false });
  } catch (error) {
    nodeGraphClapHostState.lastError = String(error?.message || error);
    setNodeGraphClapHostStatus("error", nodeGraphClapHostState.lastError);
    return;
  }
  setNodeGraphClapHostStatus("connecting");
  try {
    const payload = await fetchNodeGraphClapHostJson("/health");
    if (!payload || payload.ok !== true || payload.name !== nodeGraphClapHostName) {
      throw new Error("unexpected host response");
    }
    nodeGraphClapHostState.version = String(payload.version || "");
    updateNodeGraphClapHostCapabilities(payload.capabilities);
    nodeGraphClapHostState.hostConfig = normalizeNodeGraphClapHostConfig(payload.hostConfig);
    nodeGraphClapHostState.lastError = "";
    setNodeGraphClapHostStatus("connected");
    await refreshNodeGraphClapHostInstances();
    refreshNodeGraphClapHostPlugins();
    refreshNodeGraphClapPresets();
  } catch (error) {
    nodeGraphClapHostState.version = "";
    nodeGraphClapHostState.capabilities = {};
    nodeGraphClapHostState.hostConfig = {};
    nodeGraphClapHostState.plugins = [];
    nodeGraphClapHostState.presets = [];
    clearNodeGraphClapHostInstanceSummaries();
    nodeGraphClapHostState.parameterPayloads.clear();
    nodeGraphClapHostState.pluginCount = null;
    nodeGraphClapHostState.lastError =
      error?.name === "AbortError" ? "connection timed out" : String(error?.message || error);
    setNodeGraphClapHostStatus("error", nodeGraphClapHostState.lastError);
  }
}

async function refreshNodeGraphClapHostPlugins(forceRefresh = false) {
  if (nodeGraphClapHostState.status !== "connected") return;
  const pluginsButton = document.getElementById("nodeClapHostPluginsButton");
  const detailElement = document.getElementById("nodeClapHostDetail");
  if (pluginsButton) {
    pluginsButton.disabled = true;
    pluginsButton.textContent = "Scanning Plugins";
  }
  if (detailElement) {
    detailElement.textContent = "scanning CLAP catalog";
  }
  try {
    // The host caches its scan result for its process lifetime (see
    // cached_discover_clap_plugins in webui_clap_host.py) since a cold
    // scan re-inspects every plugin's descriptor in an isolated
    // subprocess and can take several seconds. The automatic post-connect
    // scan is fine reading that cache; the explicit "Refresh Plugins"
    // button needs to see newly-installed plugins, so it bypasses it.
    const path = forceRefresh ? "/plugins?refresh=1" : "/plugins";
    const payload = await fetchNodeGraphClapHostJson(path, 6000);
    if (!payload || payload.ok !== true || !Array.isArray(payload.plugins)) {
      throw new Error("unexpected plugin catalog response");
    }
    nodeGraphClapHostState.plugins = payload.plugins;
    updateNodeGraphClapHostCapabilities(payload.capabilities);
    nodeGraphClapHostState.pluginCount = Number(payload.count || payload.plugins.length || 0);
    if (detailElement) {
      detailElement.textContent = nodeGraphClapPluginCatalogText(payload.plugins);
    }
    syncNodeGraphClapPluginElements();
  } catch (error) {
    nodeGraphClapHostState.plugins = [];
    nodeGraphClapHostState.pluginCount = null;
    if (detailElement) {
      const message =
        error?.name === "AbortError" ? "plugin scan timed out" : String(error?.message || error);
      detailElement.textContent = `connected; plugin catalog error: ${message}`;
    }
    syncNodeGraphClapPluginElements();
  } finally {
    if (pluginsButton) {
      pluginsButton.textContent = "Refresh Plugins";
      pluginsButton.disabled = nodeGraphClapHostState.status !== "connected";
    }
  }
}

async function runNodeGraphClapHostDiagnostics() {
  const detailElement = document.getElementById("nodeClapHostDetail");
  try {
    applyNodeGraphClapHostBaseUrlFromInput({ disconnect: false });
    if (detailElement) {
      detailElement.textContent = "running host diagnostics";
    }
    const payload = await fetchNodeGraphClapHostJson("/diagnostics", 15000);
    if (payload?.ok !== true) {
      throw new Error(payload?.error || "diagnostics failed");
    }
    const catalog = payload.catalog || {};
    nodeGraphClapHostState.version = String(payload.version || "");
    nodeGraphClapHostState.hostConfig = normalizeNodeGraphClapHostConfig(payload.hostConfig);
    updateNodeGraphClapHostCapabilities(catalog.capabilities || payload.capabilities);
    if (Array.isArray(catalog.plugins)) {
      nodeGraphClapHostState.plugins = catalog.plugins;
      nodeGraphClapHostState.pluginCount = catalog.count ?? catalog.plugins.length;
    }
    setNodeGraphClapHostStatus("connected", nodeGraphClapHostDiagnosticsText(payload));
    refreshNodeGraphClapHostInstances();
  } catch (error) {
    nodeGraphClapHostState.lastError = String(error?.message || error);
    nodeGraphClapHostState.hostConfig = {};
    setNodeGraphClapHostStatus("error", `diagnostics failed: ${nodeGraphClapHostState.lastError}`);
  }
}

function bindNodeGraphClapHostControls() {
  const connectButton = document.getElementById("nodeClapHostConnectButton");
  const pluginsButton = document.getElementById("nodeClapHostPluginsButton");
  const diagnosticsButton = document.getElementById("nodeClapHostDiagnosticsButton");
  const commandButton = document.getElementById("nodeClapHostCommandButton");
  const hostUrlInput = document.getElementById("nodeClapHostUrl");
  nodeGraphClapHostState.baseUrl = loadNodeGraphClapHostBaseUrl();
  syncNodeGraphClapHostUrlInput();
  if (nodeGraphClapHostUnderConstruction) {
    markNodeGraphClapHostButtonsUnderConstruction([
      connectButton,
      pluginsButton,
      diagnosticsButton,
      commandButton,
    ]);
    setNodeGraphClapHostStatus("disconnected");
    return;
  }
  connectButton?.addEventListener("click", () => {
    connectNodeGraphClapHost();
  });
  pluginsButton?.addEventListener("click", () => {
    refreshNodeGraphClapHostPlugins(true);
  });
  diagnosticsButton?.addEventListener("click", () => {
    runNodeGraphClapHostDiagnostics();
  });
  commandButton?.addEventListener("click", () => {
    copyNodeGraphClapHostLaunchCommand();
  });
  hostUrlInput?.addEventListener("change", () => {
    try {
      applyNodeGraphClapHostBaseUrlFromInput();
    } catch (error) {
      nodeGraphClapHostState.lastError = String(error?.message || error);
      setNodeGraphClapHostStatus("error", nodeGraphClapHostState.lastError);
    }
  });
  hostUrlInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      connectNodeGraphClapHost();
    }
  });
  setNodeGraphClapHostStatus("disconnected");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindNodeGraphClapHostControls);
} else {
  bindNodeGraphClapHostControls();
}
