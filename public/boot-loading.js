// Stub before the bulk of classic scripts. node-graph-state.js replaces this
// with the real object; without a stub, any early rAF/handler that touches
// zoom/patch/rendered/live throws and aborts sandbox startup.
// Must stay in an external file — smoke_test shell contract forbids inline <script>.
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
  macroKnobArcThickness: 7,
  midiKeyboardKeyCount: 25,
  efficientProduct: true,
};

function renderNodeBootSysinfo(parts) {
  const el = document.getElementById("nodeBootSysinfo");
  if (!el) return;
  el.textContent = parts.filter(Boolean).join("  |  ");
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

  // CPU core count is hidden for now -- feels too close to a fingerprinting
  // detail for users to be comfortable seeing on a loading screen.
  const cpuStr = null;

  // RAM
  const ramGB = navigator.deviceMemory;
  const ramStr = ramGB ? `RAM: ${ramGB} GB` : null;

  // GPU from WebGL
  let gpuName = "";
  let vramMB = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        gpuName = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
        // Strip boilerplate suffixes Chrome/D3D append
        gpuName = gpuName.replace(/\s*(Direct3D\S*|vs_\S+|ps_\S+|OpenGL\S*|Metal\s*\S*)/gi, "").trim();
      }
      vramMB = probeWebGLVRAM(gl);
    }
  } catch (_) {}

  // Try WebGPU for better GPU name and description
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

  // OS
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const arch = navigator.userAgentData?.architecture || "";
  const osParts = [platform, arch].filter(Boolean);
  const osStr = osParts.length ? `OS: ${osParts.join(" ")}` : null;

  // Browser
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

  // Screen
  const dpr = Math.round(window.devicePixelRatio * 100) / 100;
  const screenStr = `Screen: ${screen.width}×${screen.height}${dpr !== 1 ? ` @${dpr}x` : ""}`;

  renderNodeBootSysinfo([cpuStr, gpuStr, ramStr, osStr, browserStr, screenStr]);
}

populateNodeBootSysinfo();

function setNodeBootLoadingProgress(value, label = "") {
  const fill = document.getElementById("nodeBootLoadingBarFill");
  const bar = document.querySelector(".node-boot-loading-bar");
  const labelElement = document.getElementById("nodeBootLoadingLabel");
  if (value != null) {
    const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (bar) bar.setAttribute("aria-valuenow", String(progress));
    if (fill) fill.style.width = `${progress}%`;
  }
  if (label && labelElement) {
    labelElement.textContent = label;
    const messages = document.getElementById("nodeBootLoadingMessages");
    if (messages) {
      const line = document.createElement("div");
      line.className = "node-boot-loading-message";
      line.textContent = label;
      messages.prepend(line);
    }
  }
}

function finishNodeBootLoading() {
  if (!document.body.classList.contains("node-boot-loading")) {
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
    // Boot kept .shell visibility:hidden; cull may have put every module to
    // sleep (display:none). Also a restored session can leave viewMode on
    // settings/code/mapping (content-view-mode hides the graph) while K still
    // toggles the controller dock — black workspace, keyboard works. Force a
    // visible modular graph after reveal.
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
  // Chrome can restore a pan/zoom that leaves modules in the DOM but off-screen
  // while the top chrome still paints — empty black workspace. Always recover.
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
  }

  // Prefer modular workspace so the graph is not stuck behind Script/Code/UI.
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

  // Immediate + delayed passes: first paint / session apply / cull can race,
  // especially in Chrome with a restored localStorage view.
  reframe(nodeGraphBootWantsResetView() ? "resetview" : "boot");
  for (const delay of [120, 450, 1100, 2200]) {
    window.setTimeout(() => reframe("retry"), delay);
  }
}

window.addEventListener("nodeSandboxStartupProgress", (event) => {
  setNodeBootLoadingProgress(event.detail?.progress, event.detail?.label);
});
window.addEventListener("nodeSandboxInterfaceReady", finishNodeBootLoading, { once: true });

window.setTimeout(() => {
  if (!document.body.classList.contains("node-boot-loading")) {
    return;
  }
  setNodeBootLoadingProgress(100, "ready");
  document.body.dataset.nodeBootFinished = "watchdog";
  finishNodeBootLoading();
}, 10000);

if (window.nodeSandboxInterfaceReady) {
  finishNodeBootLoading();
}
