// Stub before the bulk of classic scripts. node-graph-state.js replaces this
// with the real object; without a stub, any early rAF/handler that touches
// zoom/patch/rendered/live throws and aborts sandbox startup.
// Must stay in an external file — smoke_test shell contract forbids inline <script>.

// Finite coerce for knobs/CV/samples — 0 is valid. SSOT later in
// node-graph-param-surface-helpers.js; early stub so rewritten scripts boot.
if (typeof globalThis.nodeGraphFiniteNumber !== "function") {
  globalThis.nodeGraphFiniteNumber = function nodeGraphFiniteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
}

// Slider clamp — SSOT later in node-graph-slider-values.js. Early stub so Instant
// Waterfall paint / settings normalize cannot throw ReferenceError during the
// deferred-script race (boot watchdog can reveal UI before slider-values loads).
if (typeof globalThis.clampNodeSliderValue !== "function") {
  globalThis.clampNodeSliderValue = function clampNodeSliderValue(value, min, max) {
    const n = Number(value);
    const lo = Number(min);
    const hi = Number(max);
    const v = Number.isFinite(n) ? n : 0;
    const a = Number.isFinite(lo) ? lo : 0;
    const b = Number.isFinite(hi) ? hi : 1;
    return Math.max(a, Math.min(b, v));
  };
}

window.nodeGraphMvp = window.nodeGraphMvp || {
  zoom: 1,
  pan: { x: 0, y: 0 },
  rendered: null,
  live: {},
  patch: { nodes: [], connections: [], modulations: [], graphConnections: [] },
  connections: [],
  graphConnections: [],
  activeNodes: new Set(),
  sliderDragging: null,
  tooltips: {},
  midiKeyboardKeyCount: 25,
  efficientProduct: true,
};

/** "debug" | "release" — stamped by server.py (--release / SOEMDSP_BUILD_MODE). */
function nodeGraphBootBuildMode() {
  const raw = String(
    document.body?.dataset?.buildModeValue
      || document.querySelector(".node-boot-loading-screen")?.dataset?.buildModeValue
      || document.getElementById("nodeBuildNumberReadout")?.dataset?.buildModeValue
      || "",
  ).trim().toLowerCase();
  return raw === "release" ? "release" : "debug";
}

/** Start-menu hero: Soundemote.io, or soundemote.io/{patch} from URL / embed path. */
function nodeBootHeroPatchSlug() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = String(params.get("pagePatch") || "").trim();
    if (fromQuery) return fromQuery;
  } catch (_error) {
    /* ignore */
  }
  const reserved = new Set([
    "",
    "index.html",
    "perform.html",
    "public",
    "soemdsp-sandbox",
  ]);
  const tryPath = (pathname) => {
    const path = String(pathname || "").replace(/^\/+|\/+$/g, "");
    if (!path || reserved.has(path.toLowerCase())) return "";
    // Single segment only (soundemote.io/ThePatchName).
    if (path.includes("/")) return "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path)) return "";
    return path;
  };
  try {
    if (window.parent && window.parent !== window) {
      const parentSlug = tryPath(window.parent.location.pathname);
      if (parentSlug) return parentSlug;
    }
  } catch (_error) {
    /* cross-origin parent */
  }
  try {
    return tryPath(window.location.pathname);
  } catch (_error) {
    return "";
  }
}

function nodeBootRefreshHeroTitle() {
  const el = document.getElementById("nodeBootHeroTitle");
  if (!el) return;
  const slug = nodeBootHeroPatchSlug();
  el.textContent = slug ? `soundemote.io/${slug}` : "Soundemote.io";
}

nodeBootRefreshHeroTitle();

/**
 * Boot-menu links with data-site-route (analog dream -> /analogdream/perform).
 * Inside the soundemote.io embed, point them at the clean site URL in the
 * parent window so the address bar shows it. Standalone (local server.py) and
 * cross-origin embeds keep the plain ./index.html?... href.
 */
function nodeBootApplySiteRouteLinks() {
  let parentSameOrigin = false;
  try {
    parentSameOrigin = Boolean(
      window.parent
      && window.parent !== window
      && window.parent.location.origin === window.location.origin,
    );
  } catch (_error) {
    parentSameOrigin = false;
  }
  if (!parentSameOrigin) return;
  for (const link of document.querySelectorAll("a[data-site-route]")) {
    const route = String(link.getAttribute("data-site-route") || "").trim();
    if (!route.startsWith("/") || route.startsWith("//")) continue;
    link.setAttribute("href", route);
    link.setAttribute("target", "_parent");
  }
}

nodeBootApplySiteRouteLinks();


function nodeGraphBootIsRelease() {
  return nodeGraphBootBuildMode() === "release";
}

/** AudioWorklet / Live need HTTPS or localhost — not http://169.254.* / LAN IPs. */
function nodeGraphBootSecureContextOk() {
  try {
    if (window.isSecureContext) return true;
  } catch (_e) { /* ignore */ }
  const host = String(window.location?.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function nodeGraphBootSecureContextMessage() {
  const host = String(window.location?.hostname || "");
  const port = String(window.location?.port || "");
  const portPart = port ? `:${port}` : "";
  return `Live audio needs HTTPS or localhost. This page is http://${host}${portPart} — open http://127.0.0.1${portPart}/ (or https) instead of a LAN / link-local address.`;
}

function ensureNodeBootSecureContextBanner() {
  if (nodeGraphBootSecureContextOk()) return;
  let banner = document.getElementById("nodeBootSecureContextBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "nodeBootSecureContextBanner";
    banner.className = "node-boot-secure-context-banner";
    banner.setAttribute("role", "alert");
    const panel = document.querySelector(".node-boot-loading-panel");
    const startBtn = document.getElementById("nodeBootStartButton");
    if (panel && startBtn) {
      panel.insertBefore(banner, startBtn);
    } else if (panel) {
      panel.prepend(banner);
    } else {
      document.body.prepend(banner);
    }
  }
  banner.textContent = nodeGraphBootSecureContextMessage();
  banner.hidden = false;
}

function renderNodeBootSysinfo(parts) {
  const el = document.getElementById("nodeBootSysinfo");
  if (!el) return;
  el.textContent = parts.filter(Boolean).join("  |  ");
  el.hidden = !el.textContent;
}

function probeWebGLVRAM(gl) {
  // Non-destructive only. The old path allocated 4096×4096 RGBA textures
  // until OOM (up to ~8 GB) to estimate VRAM. That can exhaust GPU memory
  // and leave later sandbox WebGL contexts unable to draw — boot screen
  // looks fine (DOM), then the app reveals a black canvas.
  try {
    const ext = gl.getExtension("WEBKIT_WEBGL_memory_info");
    if (ext) {
      const kb = gl.getParameter(ext.CURRENT_AVAILABLE_VIDMEM_WEBGL);
      if (kb > 0) return Math.round(kb / 1024);
    }
  } catch (_) {}
  return null;
}

async function populateNodeBootSysinfo() {
  const el = document.getElementById("nodeBootSysinfo");
  if (!el) return;
  // Release builds: never show OS / GPU / RAM / browser fingerprint line.
  if (nodeGraphBootIsRelease()) {
    el.textContent = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;

  // CPU core count is hidden for now -- feels too close to a fingerprinting
  // detail for users to be comfortable seeing on a loading screen.
  const cpuStr = null;

  const ramGB = navigator.deviceMemory;
  const ramStr = ramGB ? `RAM: ${ramGB} GB` : null;

  let gpuName = "";
  let vramMB = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        gpuName = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
        gpuName = gpuName.replace(/\s*(Direct3D\S*|vs_\S+|ps_\S+|OpenGL\S*|Metal\s*\S*)/gi, "").trim();
      }
      vramMB = probeWebGLVRAM(gl);
    }
  } catch (_) {}

  let gpuStr = null;
  try {
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        let info = null;
        if (typeof adapter.requestAdapterInfo === "function") {
          info = await adapter.requestAdapterInfo();
        } else if (adapter.info) {
          info = adapter.info;
        }
        if (info) {
          const desc = info.description || info.device || gpuName;
          const vramStr = vramMB ? `${vramMB >= 1024 ? `${Math.round(vramMB / 1024)} GB` : `${vramMB} MB`} VRAM` : null;
          const gpuParts = [vramStr, desc || gpuName].filter(Boolean);
          gpuStr = gpuParts.length ? `GPU: ${gpuParts.join(", ")}` : null;
        }
      }
    }
  } catch (_) {}

  if (!gpuStr) {
    const vramStr = vramMB ? `${vramMB >= 1024 ? `${Math.round(vramMB / 1024)} GB` : `${vramMB} MB`} VRAM` : null;
    const gpuParts = [vramStr, gpuName].filter(Boolean);
    gpuStr = gpuParts.length ? `GPU: ${gpuParts.join(", ")}` : null;
  }

  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const arch = navigator.userAgentData?.architecture || "";
  const osParts = [platform, arch].filter(Boolean);
  const osStr = osParts.length ? `OS: ${osParts.join(" ")}` : null;

  let browserStr = null;
  const brands = navigator.userAgentData?.brands;
  if (brands && brands.length) {
    const significant = brands.filter((b) => !/not.a.brand/i.test(b.brand));
    const brand = significant[significant.length - 1] || brands[brands.length - 1];
    if (brand) browserStr = `Browser: ${brand.brand} ${brand.version}`;
  } else {
    const ua = navigator.userAgent;
    const match = ua.match(/(Edg(?:e|)\/([\d]+)|Chrome\/([\d]+)|Firefox\/([\d]+)|Safari\/([\d]+))/);
    if (match) {
      const name = match[1].startsWith("Edg") ? "Edge" : match[1].startsWith("Chr") ? "Chrome" : match[1].startsWith("Fir") ? "Firefox" : "Safari";
      const ver = match[2] || match[3] || match[4] || match[5];
      browserStr = `Browser: ${name} ${ver}`;
    }
  }

  const dpr = Math.round(window.devicePixelRatio * 100) / 100;
  const screenStr = `Screen: ${screen.width}×${screen.height}${dpr !== 1 ? ` @${dpr}x` : ""}`;

  renderNodeBootSysinfo([cpuStr, gpuStr, ramStr, osStr, browserStr, screenStr]);
}

function setNodeBootLoadingProgress(value, label = "") {
  if (document.body.classList.contains("node-boot-waiting")) {
    return;
  }
  const fill = document.getElementById("nodeBootLoadingBarFill");
  const bar = document.getElementById("nodeBootLoadingBar")
    || document.querySelector(".node-boot-loading-bar");
  const labelElement = document.getElementById("nodeBootLoadingLabel");
  if (value != null) {
    const progress = Math.max(0, Math.min(100, Math.round(nodeGraphFiniteNumber(value))));
    if (bar) bar.setAttribute("aria-valuenow", String(progress));
    if (fill) fill.style.width = `${progress}%`;
  }
  if (label && labelElement) {
    labelElement.hidden = false;
    labelElement.textContent = label;
    const messages = document.getElementById("nodeBootLoadingMessages");
    if (messages) {
      messages.hidden = false;
      const line = document.createElement("div");
      line.className = "node-boot-loading-message";
      line.textContent = label;
      messages.prepend(line);
    }
  }
}

/** Activate deferred <script data-boot-defer> tags (type=text/plain until start). */
function nodeGraphBootActivateDeferredScripts() {
  const deferred = Array.from(document.querySelectorAll("script[data-boot-defer][src]"));
  for (const old of deferred) {
    const src = old.getAttribute("src");
    if (!src) continue;
    const next = document.createElement("script");
    next.src = src;
    if (old.getAttribute("data-boot-module") === "1") {
      next.type = "module";
    } else {
      // Preserve classic execution order across dynamically inserted scripts.
      next.async = false;
    }
    old.replaceWith(next);
  }
}

function beginNodeBootLoadSequence() {
  if (document.body.dataset.nodeBootStarted === "1") {
    return;
  }
  document.body.dataset.nodeBootStarted = "1";
  document.body.classList.remove("node-boot-waiting");

  const startBtn = document.getElementById("nodeBootStartButton");
  if (startBtn) {
    startBtn.hidden = true;
    startBtn.disabled = true;
  }
  const label = document.getElementById("nodeBootLoadingLabel");
  if (label) {
    label.hidden = false;
    label.textContent = "loading";
  }
  const bar = document.getElementById("nodeBootLoadingBar");
  if (bar) bar.hidden = false;
  const messages = document.getElementById("nodeBootLoadingMessages");
  if (messages) messages.hidden = false;

  setNodeBootLoadingProgress(2, "starting");
  nodeGraphBootActivateDeferredScripts();

  // Failsafe if interface-ready never fires after the user starts load.
  window.setTimeout(() => {
    if (!document.body.classList.contains("node-boot-loading")) {
      return;
    }
    setNodeBootLoadingProgress(100, "ready");
    document.body.dataset.nodeBootFinished = "watchdog";
    finishNodeBootLoading();
  }, 10000);
}

function finishNodeBootLoading() {
  if (!document.body.classList.contains("node-boot-loading")) {
    return;
  }
  if (document.body.classList.contains("node-boot-waiting")) {
    return;
  }
  if (typeof resetNodeGraphStartupView === "function") {
    try {
      resetNodeGraphStartupView();
    } catch (error) {
      console.warn("Unable to reset startup view before hiding boot screen", error);
    }
  }
  if (typeof renderNodeGraphKeyboardDebugToggle === "function") {
    try {
      renderNodeGraphKeyboardDebugToggle();
    } catch (error) {
      console.warn("Unable to apply debug chrome before revealing interface", error);
    }
  }
  if (typeof renderNodeGraphConstraintGuide === "function") {
    try {
      renderNodeGraphConstraintGuide();
    } catch (error) {
      console.warn("Unable to apply constraint guide before revealing interface", error);
    }
  }
  setNodeBootLoadingProgress(100, "ready");
  document.body.dataset.nodeBootFinished = "interface-ready";
  document.body.classList.remove("node-boot-loading");
  document.body.classList.add("node-boot-fading");
  window.setTimeout(() => {
    document.body.classList.remove("node-boot-fading");
    document.body.classList.add("node-boot-ready");
    try {
      recoverNodeGraphAfterBoot();
    } catch (error) {
      console.warn("Unable to recover graph after boot", error);
    }
  }, 333);
}

function nodeGraphBootWantsResetView() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const raw = String(params.get("resetview") || params.get("resetView") || "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  } catch (_error) {
    return false;
  }
}

function nodeGraphBootWantsAutoframe() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const raw = String(params.get("autoframe") || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || nodeGraphBootWantsResetView();
  } catch (_error) {
    return nodeGraphBootWantsResetView();
  }
}

function nodeGraphBootReframeWorkspace(reason = "boot") {
  if (typeof nodeGraphViewportCullWakeAll === "function") {
    nodeGraphViewportCullWakeAll();
  } else {
    document.querySelectorAll(".dsp-node.viewport-asleep").forEach((el) => {
      el.classList.remove("viewport-asleep");
    });
  }

  const force = nodeGraphBootWantsAutoframe() || reason === "resetview";
  let framed = false;
  if (force && typeof window.nodeGraphAutoFrame === "function") {
    framed = Boolean(window.nodeGraphAutoFrame({ padding: 0.08 }));
  }
  if (!framed && typeof window.nodeGraphRecoverViewportIfModulesOffscreen === "function") {
    window.nodeGraphRecoverViewportIfModulesOffscreen();
  } else if (!framed && typeof window.nodeGraphAutoFrame === "function") {
    const visibleOnScreen = typeof window.nodeGraphModulesIntersectViewport === "function"
      ? window.nodeGraphModulesIntersectViewport()
      : false;
    const moduleCount = document.querySelectorAll(".dsp-node:not(.removed)").length;
    if (moduleCount > 0 && !visibleOnScreen) {
      window.nodeGraphAutoFrame({ padding: 0.08 });
    }
  }

  if (typeof scheduleNodeGraphViewportCullRefresh === "function") {
    scheduleNodeGraphViewportCullRefresh();
  }
  if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires();
  }
}

function recoverNodeGraphAfterBoot() {
  if (nodeGraphBootWantsResetView()) {
    try {
      window.localStorage.removeItem("soemdsp-sandbox.userSession.startup.v1");
    } catch (_error) {
      /* ignore */
    }
    try {
      // Live (non-local) hosts keep the session blob in per-tab sessionStorage.
      window.sessionStorage.removeItem("soemdsp-sandbox.userSession.startup.v1");
    } catch (_error) {
      /* ignore */
    }
  }

  if (typeof setNodeGraphViewMode === "function") {
    const mode = String(window.nodeGraphMvp?.viewMode || "");
    if (mode === "settings" || mode === "code" || mode === "mapping" || mode === "script") {
      setNodeGraphViewMode("modular");
    }
  }

  const shell = document.querySelector(".shell");
  if (shell) {
    shell.style.visibility = "";
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (workspace) {
    workspace.hidden = false;
  }
  document.getElementById("nodeWiringPanel")?.classList.remove("content-view-mode");

  const reframe = (reason) => {
    try {
      nodeGraphBootReframeWorkspace(reason);
    } catch (error) {
      console.warn("Unable to reframe workspace after boot", error);
    }
  };

  reframe(nodeGraphBootWantsResetView() ? "resetview" : "boot");
  for (const delay of [120, 450, 1100, 2200]) {
    window.setTimeout(() => reframe("retry"), delay);
  }

  // First-run orientation — cold visitors otherwise click randomly and leave the tab burning.
  window.setTimeout(() => {
    if (typeof setNodeInteractionHelp !== "function") return;
    setNodeInteractionHelp(
      "Start here: Space = play/pause · click empty graph / shop to add modules · "
      + "wire outputs into Output · Esc restores bars / leaves Metamodule. "
      + "Leaving this tab pauses audio automatically.",
    );
  }, 600);
}

window.addEventListener("nodeSandboxStartupProgress", (event) => {
  setNodeBootLoadingProgress(event.detail?.progress, event.detail?.label);
});
window.addEventListener("nodeSandboxInterfaceReady", finishNodeBootLoading, { once: true });

document.getElementById("nodeBootStartButton")?.addEventListener("click", () => {
  ensureNodeBootSecureContextBanner();
  beginNodeBootLoadSequence();
});

ensureNodeBootSecureContextBanner();

// Sysinfo only in debug builds (hidden entirely for --release).
if (!nodeGraphBootIsRelease()) {
  populateNodeBootSysinfo();
} else {
  const sys = document.getElementById("nodeBootSysinfo");
  if (sys) {
    sys.textContent = "";
    sys.hidden = true;
  }
}

if (window.nodeSandboxInterfaceReady && document.body.dataset.nodeBootStarted === "1") {
  finishNodeBootLoading();
}

/** Query flag helper for boot / mode deep-links. */
function nodeBootQueryFlag(name) {
  try {
    const raw = String(new URLSearchParams(window.location.search || "").get(name) || "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  } catch (_error) {
    return false;
  }
}

/**
 * Locked URL mode scheme (query `mode=`):
 *   perform        -> light perform (handled by perform-boot.js)
 *   circuitbuilder -> normal modular workspace (skip start menu)
 *   canvas         -> modular workspace already in layout-canvas (F once; not perform.css)
 */
function nodeBootResolveMode() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const mode = String(params.get("mode") || "").trim().toLowerCase();
    if (mode === "perform" || mode === "circuitbuilder" || mode === "canvas") return mode;
    // Legacy / alias flags
    if (nodeBootQueryFlag("layoutCanvas") || nodeBootQueryFlag("canvas")) return "canvas";
    const layoutRaw = String(params.get("layoutCanvas") || "").trim().toLowerCase();
    if (layoutRaw === "perform") return "canvas";
    if (nodeBootQueryFlag("boot")) return "circuitbuilder";
    return "";
  } catch (_error) {
    return "";
  }
}

/** Open layout-canvas perform stage (same as pressing F once). Not light perform.css. */
function nodeBootWantsLayoutCanvas() {
  return nodeBootResolveMode() === "canvas";
}

/** Skip start menu and load into modular / canvas / perform workspace. */
function nodeBootWantsAutoStart() {
  try {
    const mode = nodeBootResolveMode();
    if (mode === "circuitbuilder" || mode === "canvas" || mode === "perform") return true;
    if (nodeBootQueryFlag("boot")) return true;
    // Embeds that only set pagePatch (not home init) still boot into workspace.
    const pagePatch = String(
      new URLSearchParams(window.location.search || "").get("pagePatch") || "",
    ).trim().toLowerCase();
    if (pagePatch && pagePatch !== "init") return true;
    return false;
  } catch (_error) {
    return false;
  }
}

function nodeBootMaybeAutoStart() {
  if (!nodeBootWantsAutoStart()) return;
  if (document.body?.dataset?.nodeBootStarted === "1") return;
  const start = () => {
    ensureNodeBootSecureContextBanner();
    beginNodeBootLoadSequence();
  };
  // Defer so perform-boot.js (loaded next) can wrap beginNodeBootLoadSequence
  // before we fire (phones / mode=perform).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(start, 0), { once: true });
  } else {
    window.setTimeout(start, 0);
  }
}

/**
 * After interface-ready, open layout-canvas via the normal F API.
 * Does not enable perform-boot light chrome, so F still cycles off -> perform -> edit.
 */
function nodeBootOpenLayoutCanvas() {
  if (typeof window.nodeGraphLayoutCanvasOpen !== "function") {
    return false;
  }
  try {
    return Boolean(window.nodeGraphLayoutCanvasOpen("perform", { silent: true }));
  } catch (error) {
    console.warn("Unable to open layout canvas after boot", error);
    return false;
  }
}

function nodeBootMaybeOpenLayoutCanvas() {
  if (!nodeBootWantsLayoutCanvas()) return;
  const open = () => {
    nodeBootOpenLayoutCanvas();
    for (const ms of [120, 450, 1100]) {
      window.setTimeout(nodeBootOpenLayoutCanvas, ms);
    }
  };
  if (
    document.documentElement.dataset.nodeSandboxInterfaceReady === "true"
    || window.nodeSandboxInterfaceReady === true
  ) {
    open();
  } else {
    window.addEventListener("nodeSandboxInterfaceReady", open, { once: true });
  }
}

nodeBootMaybeAutoStart();
nodeBootMaybeOpenLayoutCanvas();

