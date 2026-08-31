// Jack chrome SSOT — analog/digital + red/green/blue channel (+ CMYK yellow/cyan).
// Generic analog In/Out stay uncolored (gold). Explicit Mono = green; L/R = red/blue.
// APP_POLICY §13. Cables never use this. Pairing (L↔R) stays in node-graph-wire-actions.js.

const nodeGraphJackRgbTypeCache = new Map();
const nodeGraphJackQuadTypeCache = new Map();
const nodeGraphJackChaosTypeCache = new Map();

function nodeGraphJackTypeDefinition(type) {
  return typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[type]
    : null;
}

function nodeGraphJackTypePortList(type) {
  const def = nodeGraphJackTypeDefinition(type);
  if (!def) {
    return [];
  }
  return [
    ...(Array.isArray(def.inputs) ? def.inputs : []),
    ...(Array.isArray(def.outputs) ? def.outputs : []),
  ].map((port) => String(port || "").trim());
}

function nodeGraphModuleHasRgbColorPorts(type) {
  const key = String(type || "");
  if (nodeGraphJackRgbTypeCache.has(key)) {
    return nodeGraphJackRgbTypeCache.get(key);
  }
  const ports = new Set(nodeGraphJackTypePortList(type));
  const has = (ports.has("R") && ports.has("G") && ports.has("B"))
    || (ports.has("Red") && ports.has("Green") && ports.has("Blue"));
  nodeGraphJackRgbTypeCache.set(key, has);
  return has;
}

function nodeGraphModuleHasQuadraturePorts(type) {
  const key = String(type || "");
  if (nodeGraphJackQuadTypeCache.has(key)) {
    return nodeGraphJackQuadTypeCache.get(key);
  }
  const ports = nodeGraphJackTypePortList(type).map((port) => port.toLowerCase());
  const has = ports.some((port) => port === "sin" || port === "sine")
    && ports.some((port) => port === "cos" || port === "cosine");
  nodeGraphJackQuadTypeCache.set(key, has);
  return has;
}

function nodeGraphJackAxisToken(port, label) {
  const tryOne = (value) => {
    const raw = String(value || "").trim();
    const low = raw.toLowerCase();
    // Combined X/Y (or XY) is not a single axis — do not steal "Y" from "X/Y".
    if (!low || low === "x/y" || low === "xy" || low.includes("/")) {
      return "";
    }
    if (low === "x" || low === "y" || low === "z") {
      return low;
    }
    const token = nodeGraphJackLastToken(raw);
    if (token === "x" || token === "y" || token === "z") {
      return token;
    }
    return "";
  };
  return tryOne(port) || tryOne(label);
}

function nodeGraphModuleUsesChaosOutletRgb(type) {
  const key = String(type || "");
  if (nodeGraphJackChaosTypeCache.has(key)) {
    return nodeGraphJackChaosTypeCache.get(key);
  }
  const category = typeof nodeGraphModuleStoreCatalog === "object"
    ? nodeGraphModuleStoreCatalog?.[type]?.category
    : "";
  if (String(category || "").toLowerCase() === "chaos") {
    nodeGraphJackChaosTypeCache.set(key, true);
    return true;
  }
  const ports = nodeGraphJackTypePortList(type);
  const axes = new Set();
  for (const port of ports) {
    const axis = nodeGraphJackAxisToken(port);
    if (axis) {
      axes.add(axis);
    }
  }
  // X/Y pair is enough (2D phosphor / XY faces). Z is optional (green).
  const has = axes.has("x") && axes.has("y");
  nodeGraphJackChaosTypeCache.set(key, has);
  return has;
}

function nodeGraphJackLastToken(value) {
  const tokens = String(value || "").trim().toLowerCase().split(/[\s/_-]+/).filter(Boolean);
  return tokens[tokens.length - 1] || "";
}

function nodeGraphJackSignalKind(type, port, io = null) {
  if (typeof nodeGraphPortIsDigitalSignal === "function" && nodeGraphPortIsDigitalSignal(type, port, io)) {
    return "digital";
  }
  return "analog";
}

/** UIDEV "wires follow port colors". Default on. */
function nodeGraphWiresFollowPortColors() {
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp && typeof nodeGraphMvp.wiresFollowPortColors === "boolean") {
    return nodeGraphMvp.wiresFollowPortColors;
  }
  const input = typeof document !== "undefined"
    ? document.getElementById("nodeUiDevWiresFollowPortColors")
    : null;
  if (input) {
    return Boolean(input.checked);
  }
  return true;
}

function nodeGraphJackChannelCssColor(channel) {
  if (channel === "red") {
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-red", "#f25d5d")
      : "#f25d5d";
  }
  if (channel === "green") {
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-green", "#3ddc84")
      : "#3ddc84";
  }
  if (channel === "blue") {
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-blue", "#4d8dff")
      : "#4d8dff";
  }
  if (channel === "purple") {
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-purple", "#c44dff")
      : "#c44dff";
  }
  // CMYK additive plane: C=cyan Parameter, Y=yellow Graph. M/K reserved unused.
  if (channel === "cyan") {
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-cyan", "#00e5ff")
      : "#00e5ff";
  }
  if (channel === "yellow") {
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-yellow", "#ffe600")
      : "#ffe600";
  }
  if (channel === "turquoise") {
    // Legacy alias → cyan (block-rate Parameter). Prefer "cyan".
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-cyan", "#00e5ff")
      : "#00e5ff";
  }
  if (channel === "magenta") {
    // Reserved (CMYK M) — unused for live jack assignment.
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-magenta", "#e040fb")
      : "#e040fb";
  }
  if (channel === "black" || channel === "k") {
    // Reserved (CMYK K) — unused for live jack assignment.
    return typeof nodeGraphCssColor === "function"
      ? nodeGraphCssColor("--node-jack-black", "#111111")
      : "#111111";
  }
  return "";
}

/**
 * Cable end color when follow-port-colors is on.
 * Digital stays white. RGB / stereo / chaos / quad jacks use channel color.
 * Uncolored analog returns "" so the caller keeps gold/cyan.
 */
function nodeGraphJackWireColor(type, port, io = "output") {
  if (nodeGraphJackSignalKind(type, port, io) === "digital") {
    return "#ffffff";
  }
  if (!nodeGraphWiresFollowPortColors()) {
    return "";
  }
  return nodeGraphJackChannelCssColor(nodeGraphJackChannel(type, port, io));
}

function nodeGraphJackRgbLetterChannel(type, value) {
  const key = String(value || "").trim();
  if (!key) {
    return "";
  }
  const low = key.toLowerCase();
  if (low === "rgba" || key === "📺") {
    return "";
  }
  if (low === "red") {
    return "red";
  }
  if (low === "green") {
    return "green";
  }
  if (low === "blue") {
    return "blue";
  }
  if (key.length !== 1) {
    return "";
  }
  const letter = key.toUpperCase();
  if (letter !== "R" && letter !== "G" && letter !== "B") {
    return "";
  }
  if (!nodeGraphModuleHasRgbColorPorts(type)) {
    return "";
  }
  if (letter === "R") {
    return "red";
  }
  if (letter === "G") {
    return "green";
  }
  return "blue";
}

function nodeGraphJackChaosChannel(type, port, label) {
  if (!nodeGraphModuleUsesChaosOutletRgb(type)) {
    return "";
  }
  const axis = nodeGraphJackAxisToken(port, label);
  if (axis === "x") {
    return "red";
  }
  if (axis === "y") {
    return "blue";
  }
  if (axis === "z") {
    return "green";
  }
  return "";
}

function nodeGraphJackQuadratureChannel(type, port) {
  if (!nodeGraphModuleHasQuadraturePorts(type)) {
    return "";
  }
  const key = String(port || "").trim().toLowerCase();
  if (key === "sin" || key === "sine") {
    return "red";
  }
  if (key === "cos" || key === "cosine") {
    return "blue";
  }
  return "";
}

/** SinCos4 A/B/C taps — RGB like XYZ chaos, D stays uncolored. */
function nodeGraphJackSinCos4Channel(type, port) {
  if (String(type || "") !== "sineWavetable") {
    return "";
  }
  const key = String(port || "").trim().toUpperCase();
  if (key === "A") {
    return "red";
  }
  if (key === "B") {
    return "green";
  }
  if (key === "C") {
    return "blue";
  }
  return "";
}

/** Stereo / mono words only. Never maps RGB R or Chaos X/Y/Z. */
function nodeGraphJackStereoChannel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  const tokens = raw.split(/[\s/_-]+/).filter(Boolean);
  const first = tokens[0] || raw;
  const last = tokens[tokens.length - 1] || raw;
  if (raw === "l" || /^l\d+$/.test(raw) || raw === "left" || first === "left" || last === "left" || raw === "tonel") {
    return "red";
  }
  if (raw === "m" || raw === "mono" || first === "mono" || last === "mono") {
    return "green";
  }
  // Bare In/Out/Input/Output = generic analog → uncolored (gold). Not purple.
  // Explicit Mono (name or label) is green above; Left/Right are red/blue.
  if (/^r\d+$/.test(raw) || raw === "right" || first === "right" || last === "right" || raw === "toner") {
    return "blue";
  }
  return "";
}

/**
 * "" | "red" | "green" | "blue" | "purple" | "cyan" | "yellow"
 * (+ reserved "magenta" / "black" unused)
 *
 * CMYK additive non-realtime plane (Yellow Graph):
 *   Yellow → Graph chunk in/out (data-plane, once per quantum)
 *   Cyan   → Parameter / block-rate ZOH in/out (once per quantum, held)
 *   Magenta / K → reserved unused
 * Digital ports have no channel.
 */
function nodeGraphJackChannel(type, port, io = "output") {
  const key = String(port || "");
  if (!key.trim()) {
    return "";
  }
  if (nodeGraphJackSignalKind(type, key, io) === "digital") {
    return "";
  }
  if (typeof nodeGraphPortIsGraphChunkSignal === "function" && nodeGraphPortIsGraphChunkSignal(type, key, io)) {
    return "yellow";
  }
  if (typeof nodeGraphPortIsBlockRateSignal === "function" && nodeGraphPortIsBlockRateSignal(type, key, io)) {
    return "cyan";
  }
  const fromRgb = nodeGraphJackRgbLetterChannel(type, key);
  if (fromRgb) {
    return fromRgb;
  }
  const def = nodeGraphJackTypeDefinition(type);
  const labelMap = io === "input" ? def?.inputLabels : def?.outputLabels;
  const label = labelMap?.[key];
  const fromLabelRgb = nodeGraphJackRgbLetterChannel(type, label);
  if (fromLabelRgb) {
    return fromLabelRgb;
  }
  const fromChaos = nodeGraphJackChaosChannel(type, key, label);
  if (fromChaos) {
    return fromChaos;
  }
  const fromQuad = nodeGraphJackQuadratureChannel(type, key);
  if (fromQuad) {
    return fromQuad;
  }
  const fromSinCos4 = nodeGraphJackSinCos4Channel(type, key);
  if (fromSinCos4) {
    return fromSinCos4;
  }
  const fromName = nodeGraphJackStereoChannel(key);
  if (fromName) {
    return fromName;
  }
  const fromLabel = nodeGraphJackStereoChannel(label);
  if (fromLabel) {
    return fromLabel;
  }
  const aliases = io === "input" ? def?.inputAliases : def?.outputAliases;
  if (aliases && typeof aliases === "object") {
    for (const [alias, target] of Object.entries(aliases)) {
      if (String(target) !== key) {
        continue;
      }
      const fromAliasRgb = nodeGraphJackRgbLetterChannel(type, alias);
      if (fromAliasRgb) {
        return fromAliasRgb;
      }
      const fromAliasChaos = nodeGraphJackChaosChannel(type, key, alias);
      if (fromAliasChaos) {
        return fromAliasChaos;
      }
      const fromAlias = nodeGraphJackStereoChannel(alias);
      // Legacy Out/In/Mono aliases must not recolor a renamed jack
      // (e.g. polyBlep Out → Wave Out stays gold, not green-via-Mono).
      if (fromAlias === "green" || fromAlias === "red" || fromAlias === "blue") {
        const aliasKey = String(alias || "").trim().toLowerCase();
        if (
          aliasKey === "out" || aliasKey === "output"
          || aliasKey === "in" || aliasKey === "input"
          || aliasKey === "mono" || aliasKey === "m"
        ) {
          continue;
        }
      }
      if (fromAlias) {
        return fromAlias;
      }
    }
  }
  return "";
}

/** Legacy stereo-slot names. Prefer nodeGraphJackChannel. */
function nodeGraphOutletChannelKind(type, port, io = "output") {
  const channel = nodeGraphJackChannel(type, port, io);
  if (channel === "red") {
    return "left";
  }
  if (channel === "green") {
    return "mono";
  }
  if (channel === "blue") {
    return "right";
  }
  return "";
}

function nodeGraphApplyJackChrome(element, type, port, io = "output") {
  if (!element) {
    return "";
  }
  const direction = io || element.dataset?.io || "output";
  const channel = nodeGraphJackChannel(type, port, direction);
  element.classList.remove("node-outlet-mono", "node-outlet-left", "node-outlet-right");
  delete element.dataset.outletChannel;
  if (channel) {
    element.dataset.jackChannel = channel;
  } else {
    delete element.dataset.jackChannel;
  }
  return channel;
}

function nodeGraphApplyOutletChannelMark(element, type, port) {
  return nodeGraphApplyJackChrome(element, type, port, element?.dataset?.io || "output");
}

function nodeGraphJackIsSignalPort(element) {
  return Boolean(
    element
    && element.classList
    && element.classList.contains("node-port")
    && !element.classList.contains("node-param-port")
    && !element.classList.contains("node-io-proxy-port"),
  );
}

function nodeGraphJackElementVisibility(element) {
  if (!element) {
    return {
      painted: false,
      reasons: ["missing-element"],
    };
  }
  const cs = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  const rect = typeof element.getBoundingClientRect === "function"
    ? element.getBoundingClientRect()
    : { width: 0, height: 0, top: 0, left: 0 };
  const display = cs?.display || "";
  const visibility = cs?.visibility || "";
  const opacity = cs ? Number(cs.opacity) : 1;
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  const hiddenHost = Boolean(element.hidden || element.closest?.("[hidden]"));
  const ioHidden = Boolean(element.closest?.(".io-hidden"));
  const unusedHost = Boolean(element.closest?.(".unused-hidden, .patch-unused-ports-hidden"));
  const connected = Boolean(element.classList?.contains("connected-port"));
  const painted = display !== "none"
    && visibility !== "hidden"
    && !(Number.isFinite(opacity) && opacity <= 0.02)
    && width >= 2
    && height >= 2
    && !hiddenHost;
  const reasons = [];
  if (display === "none") reasons.push("display-none");
  if (visibility === "hidden") reasons.push("visibility-hidden");
  if (Number.isFinite(opacity) && opacity <= 0.02) reasons.push("opacity");
  if (width < 2 || height < 2) reasons.push(`size-${width.toFixed(1)}x${height.toFixed(1)}`);
  if (hiddenHost) reasons.push("hidden-attr");
  if (ioHidden) reasons.push("io-hidden");
  if (unusedHost && !connected) reasons.push("unused-hidden");
  return {
    node: element.dataset?.node || "",
    port: element.dataset?.port || "",
    io: element.dataset?.io || "",
    channel: element.dataset?.jackChannel
      || element.closest?.(".node-io-row")?.dataset?.jackChannel
      || "",
    width,
    height,
    display,
    visibility,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    painted,
    ioHidden,
    unusedHidden: unusedHost && !connected,
    connected,
    stroke: cs?.getPropertyValue?.("--node-port-crescent-stroke")?.trim() || "",
    reasons,
  };
}

function nodeGraphJackVisibilityCensus(root) {
  const scope = root && typeof root.querySelectorAll === "function"
    ? root
    : (typeof document !== "undefined" ? document : null);
  if (!scope) {
    return {
      ok: false,
      moduleCount: 0,
      portCount: 0,
      paintedCount: 0,
      inletCount: 0,
      outletCount: 0,
      rgbCount: 0,
      applyFn: typeof nodeGraphApplyJackChrome === "function",
      sample: [],
      hidden: [],
    };
  }
  const modules = [...scope.querySelectorAll(".dsp-node")];
  const ports = [...scope.querySelectorAll(".node-port")].filter(nodeGraphJackIsSignalPort);
  const rows = ports.map(nodeGraphJackElementVisibility);
  const painted = rows.filter((row) => row.painted);
  const inlets = painted.filter((row) => row.io === "input");
  const outlets = painted.filter((row) => row.io === "output");
  const rgb = painted.filter((row) => row.channel === "red" || row.channel === "green" || row.channel === "blue");
  const workspace = typeof document !== "undefined" && typeof document.getElementById === "function"
    ? document.getElementById("nodeGraphWorkspace")
    : scope.querySelector?.(".node-graph-workspace");
  return {
    ok: painted.length > 0 && (inlets.length > 0 || outlets.length > 0),
    moduleCount: modules.length,
    portCount: ports.length,
    paintedCount: painted.length,
    inletCount: inlets.length,
    outletCount: outlets.length,
    rgbCount: rgb.length,
    ioHiddenModules: modules.filter((node) => node.classList.contains("io-hidden")).length,
    unusedHiddenModules: modules.filter((node) => node.classList.contains("unused-hidden")).length,
    workspaceUnusedHidden: Boolean(workspace?.classList.contains("patch-unused-ports-hidden")),
    applyFn: typeof nodeGraphApplyJackChrome === "function",
    sample: painted.slice(0, 24),
    hidden: rows.filter((row) => !row.painted).slice(0, 16),
  };
}

function nodeGraphLogJackVisibility(reason = "census") {
  const report = nodeGraphJackVisibilityCensus();
  if (typeof window !== "undefined") {
    window.__jackVisibilityLast = report;
  }
  const workspace = typeof document !== "undefined"
    ? document.getElementById("nodeGraphWorkspace")
    : null;
  if (workspace?.dataset) {
    workspace.dataset.jackPainted = String(report.paintedCount);
    workspace.dataset.jackPorts = String(report.portCount);
    workspace.dataset.jackInlets = String(report.inletCount);
    workspace.dataset.jackOutlets = String(report.outletCount);
    workspace.dataset.jackOk = report.ok ? "1" : "0";
  }
  const se = typeof window !== "undefined" ? window.SE : null;
  if (!report.ok && typeof se?.FAIL === "function") {
    se.FAIL(
      `JACKS not visible (${reason}) painted=${report.paintedCount} hidden=${JSON.stringify(report.hidden)}`,
    );
  }
  return report;
}

let nodeGraphJackVisibilityLogTimer = 0;

function nodeGraphScheduleJackVisibilityLog(reason = "census") {
  if (typeof window === "undefined") {
    return;
  }
  if (nodeGraphJackVisibilityLogTimer) {
    clearTimeout(nodeGraphJackVisibilityLogTimer);
  }
  nodeGraphJackVisibilityLogTimer = setTimeout(() => {
    nodeGraphJackVisibilityLogTimer = 0;
    const run = () => nodeGraphLogJackVisibility(reason);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else {
      run();
    }
  }, 60);
}
