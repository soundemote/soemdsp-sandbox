/**
 * Perform / cellphone canvas boot.
 *
 * Plugin-host perform: /perform.html only
 *   Auto-starts, layout-canvas only, no AudioWorklet (host drives audio).
 *
 * Light perform (live audio): ?mode=perform or ?view=perform
 *   Same chrome as phone canvas; auto-starts into perform stage.
 *   soundemote.io/perform/<patch> iframes with mode=perform.
 *
 * Phone canvas (soundemote.io): same start menu, then canvas-only after START.
 *   Live audio stays enabled. Detection: touch + coarse pointer / phone UA.
 *   Desktop preview: ?mobile=1 or ?phone=1. Force full workspace: ?desktop=1.
 *
 * NOT light perform: ?mode=canvas / layoutCanvas=1 (boot-loading opens F-stage
 * without perform.css lock). ?mode=circuitbuilder boots modular workspace only.
 */
(function soemdspPerformBoot(global) {
  "use strict";

  var PROTOCOL_TYPE = "soemdsp-perform";
  var PROTOCOL_V = 1;
  var BODY_CLASS = "node-perform-mode";
  var CACHE_TAG = "mode-scheme-perform-1";
  var CONTROLLER_TYPES = {
    knob: true,
    pluginSlider: true,
    toggleButton: true,
    momentaryButton: true,
  };

  function queryFlag(name) {
    try {
      var raw = String(new URLSearchParams(global.location.search).get(name) || "")
        .trim()
        .toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes";
    } catch (_e) {
      return false;
    }
  }

  /** Plugin host only: dedicated perform.html shell (no AudioWorklet). */
  function isPerformPath() {
    try {
      var path = String((global.location && global.location.pathname) || "").toLowerCase();
      return path.endsWith("/perform.html");
    } catch (_e) {
      return false;
    }
  }

  /**
   * Light perform (live audio): mode=perform or view=perform.
   * mode=canvas is NOT light perform — boot-loading opens layout-canvas instead.
   */
  function isForcedPerformView() {
    try {
      var params = new URLSearchParams(global.location.search);
      var mode = String(params.get("mode") || "").trim().toLowerCase();
      if (mode === "perform") return true;
      var view = String(params.get("view") || "").trim().toLowerCase();
      return view === "perform";
    } catch (_e) {
      return false;
    }
  }

  /** Phones only (not tablets). Query overrides win. */
  function isMobilePhoneClient() {
    if (queryFlag("desktop")) return false;
    if (queryFlag("mobile") || queryFlag("phone")) return true;
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || "");
      if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return false;
      if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return false;
      if (/Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|IEMobile|Opera Mini|webOS/i.test(ua)) {
        return true;
      }
    } catch (_e) { /* ignore */ }
    try {
      var mq = global.matchMedia
        ? function (q) { return Boolean(global.matchMedia(q).matches); }
        : function () { return false; };
      var coarse = mq("(pointer: coarse)");
      var fine = mq("(pointer: fine)");
      var noHover = mq("(hover: none)");
      var touchPoints = Number(global.navigator && global.navigator.maxTouchPoints) || 0;
      var width = Math.min(
        Number(global.screen && global.screen.width) || 9999,
        Number(global.innerWidth) || 9999
      );
      if (coarse && noHover && !fine && width <= 920) return true;
      if (touchPoints > 1 && noHover && width <= 820) return true;
    } catch (_e) { /* ignore */ }
    return false;
  }

  function ensureBodyClassEarly() {
    document.documentElement.classList.add(BODY_CLASS);
    if (document.body) document.body.classList.add(BODY_CLASS);
  }

  function ensurePerformCssEarly() {
    if (document.getElementById("soemdspPerformCss")) return;
    var link = document.createElement("link");
    link.id = "soemdspPerformCss";
    link.rel = "stylesheet";
    link.href = "./public/perform.css?v=" + CACHE_TAG;
    (document.head || document.documentElement).appendChild(link);
  }

  function openMobilePerformCanvas() {
    ensureBodyClassEarly();
    ensurePerformCssEarly();
    var opened = false;
    if (typeof global.nodeGraphLayoutCanvasOpen === "function") {
      opened = Boolean(global.nodeGraphLayoutCanvasOpen("perform", { silent: true }));
    }
    document.body.classList.remove("node-layout-canvas-edit");
    var stage = document.getElementById("nodeScreenSoloStage");
    if (stage) stage.classList.remove("node-layout-canvas-edit");
    return opened;
  }

  /**
   * Phone path: keep identical start menu; after START show patch canvas only.
   * Does not set soemdspPerformMode (that path disables AudioWorklet for the plugin host).
   */
  function bootMobileCanvas(options) {
    var opts = options || {};
    var autoStart = Boolean(opts.autoStart);
    global.soemdspPerformMode = false;
    global.soemdspMobileCanvasMode = true;

    function onUserStart() {
      // Apply perform chrome only after START so the start menu stays identical
      // (forced ?view=perform applies it immediately via autoStart).
      ensureBodyClassEarly();
      ensurePerformCssEarly();
    }

    var origBegin = global.beginNodeBootLoadSequence;
    if (typeof origBegin === "function" && !origBegin._soemdspMobileWrapped) {
      function wrappedBegin() {
        onUserStart();
        return origBegin.apply(this, arguments);
      }
      wrappedBegin._soemdspMobileWrapped = true;
      global.beginNodeBootLoadSequence = wrappedBegin;
    }

    var startBtn = document.getElementById("nodeBootStartButton");
    if (startBtn && startBtn.dataset.soemdspMobileBound !== "1") {
      startBtn.dataset.soemdspMobileBound = "1";
      startBtn.addEventListener("click", onUserStart);
    }

    function lockPerformOnlyToggle() {
      var original = global.nodeGraphLayoutCanvasOpen;
      if (typeof original === "function" && !original._soemdspMobileWrapped) {
        function wrappedOpen(mode, options) {
          return original.call(this, mode === "edit" ? "perform" : mode, options);
        }
        wrappedOpen._soemdspMobileWrapped = true;
        global.nodeGraphLayoutCanvasOpen = wrappedOpen;
      }
      var toggle = global.toggleNodeGraphLayoutCanvasView;
      if (typeof toggle === "function" && !toggle._soemdspMobileWrapped) {
        function wrappedToggle() {
          return openMobilePerformCanvas();
        }
        wrappedToggle._soemdspMobileWrapped = true;
        global.toggleNodeGraphLayoutCanvasView = wrappedToggle;
      }
    }

    function afterInterfaceReady() {
      onUserStart();
      lockPerformOnlyToggle();
      openMobilePerformCanvas();
      // Patch / pins can settle after first paint.
      [120, 450, 1100].forEach(function (ms) {
        global.setTimeout(openMobilePerformCanvas, ms);
      });
    }

    if (
      document.documentElement.dataset.nodeSandboxInterfaceReady === "true"
      || global.nodeSandboxInterfaceReady === true
    ) {
      afterInterfaceReady();
    } else {
      global.addEventListener("nodeSandboxInterfaceReady", afterInterfaceReady, {
        once: true,
      });
    }

    if (autoStart) {
      function autoStartBoot() {
        onUserStart();
        if (typeof global.beginNodeBootLoadSequence === "function") {
          global.beginNodeBootLoadSequence();
          return;
        }
        var btn = document.getElementById("nodeBootStartButton");
        if (btn) btn.click();
      }
      if (document.body && document.body.dataset.nodeBootStarted === "1") return;
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", autoStartBoot, { once: true });
      } else {
        autoStartBoot();
      }
    }
  }

  var pluginPerform = isPerformPath();
  var forcedPerformView = !pluginPerform && isForcedPerformView();
  var mobileCanvas = !pluginPerform && !forcedPerformView && isMobilePhoneClient();

  if (!pluginPerform && !mobileCanvas && !forcedPerformView) {
    global.soemdspPerformMode = false;
    global.soemdspMobileCanvasMode = false;
    return;
  }

  if (mobileCanvas || forcedPerformView) {
    bootMobileCanvas({ autoStart: forcedPerformView });
    return;
  }

  global.soemdspPerformMode = true;
  global.soemdspMobileCanvasMode = false;

  var openGestures = new Set();
  var slotValues = new Map();
  var readySent = false;
  var emptyNoteEl = null;

  function clamp01(n, fallback) {
    var x = Number(n);
    if (!Number.isFinite(x)) return fallback == null ? 0 : fallback;
    return Math.max(0, Math.min(1, x));
  }

  function clampPluginId(raw) {
    if (raw === 0 || raw === "0") return 0;
    var n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > 31) return null;
    return n;
  }

  function ensureBodyClass() {
    document.documentElement.classList.add(BODY_CLASS);
    if (document.body) document.body.classList.add(BODY_CLASS);
  }

  function ensurePerformCss() {
    if (document.getElementById("soemdspPerformCss")) return;
    var link = document.createElement("link");
    link.id = "soemdspPerformCss";
    link.rel = "stylesheet";
    link.href = "./public/perform.css?v=" + CACHE_TAG;
    (document.head || document.documentElement).appendChild(link);
  }

  function postToHost(payload) {
    var msg = Object.assign({ type: PROTOCOL_TYPE, v: PROTOCOL_V }, payload);
    try {
      if (global.parent && global.parent !== global) global.parent.postMessage(msg, "*");
    } catch (_e) {}
    try {
      global.postMessage(msg, "*");
    } catch (_e) {}
    try {
      var juce = global.__JUCE__ && global.__JUCE__.backend;
      if (juce && typeof juce.emitEvent === "function") juce.emitEvent(PROTOCOL_TYPE, msg);
    } catch (_e) {}
  }

  function emitGesture(pluginId, value, phase) {
    var id = clampPluginId(pluginId);
    if (id == null) return;
    var unit = clamp01(value);
    if (phase === "begin") openGestures.add(id);
    if (phase === "end") openGestures.delete(id);
    slotValues.set(id, unit);
    postToHost({ event: "gesture", pluginId: id, value: unit, phase: phase });
  }

  var lastParams = new Map();

  function copyParams(params) {
    var out = {};
    if (!params) return out;
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i += 1) {
      var v = params[keys[i]];
      if (typeof v === "number" && Number.isFinite(v)) out[keys[i]] = v;
    }
    return out;
  }

  function snapshotParams() {
    lastParams.clear();
    var nodes = patchNodes();
    for (var i = 0; i < nodes.length; i += 1) {
      var n = nodes[i];
      if (!n || !n.id) continue;
      lastParams.set(String(n.id), copyParams(n.params));
    }
  }

  global.soemdspPerformEmitDirtyParams = function soemdspPerformEmitDirtyParams() {
    var nodes = patchNodes();
    for (var i = 0; i < nodes.length; i += 1) {
      var n = nodes[i];
      if (!n || !n.id) continue;
      var id = String(n.id);
      var now = copyParams(n.params);
      var prev = lastParams.get(id);
      if (!prev) {
        lastParams.set(id, now);
        continue;
      }
      var keys = Object.keys(now);
      for (var k = 0; k < keys.length; k += 1) {
        var key = keys[k];
        if (prev[key] !== now[key]) {
          postToHost({ event: "param", nodeId: id, key: key, value: now[key] });
        }
      }
      lastParams.set(id, now);
    }
  };

  global.soemdspPerformEmitNoteMask = function soemdspPerformEmitNoteMask(mask) {
    if (typeof noteMaskPackChunks !== "function") return;
    var chunks = noteMaskPackChunks(mask);
    var el = document.querySelector(".dsp-node[data-node-type='keyboardController']");
    var id = el && el.dataset ? String(el.dataset.node || "") : "";
    postToHost({
      event: "notes",
      nodeId: id,
      c0: Number(chunks.c0) || 0,
      c1: Number(chunks.c1) || 0,
      c2: Number(chunks.c2) || 0,
    });
  };

  function emitReady() {
    if (readySent) return;
    readySent = true;
    postToHost({ event: "ready" });
  }

  function patchNodes() {
    var nodes = global.nodeGraphMvp && global.nodeGraphMvp.patch && global.nodeGraphMvp.patch.nodes;
    return Array.isArray(nodes) ? nodes : [];
  }

  function nodeForPluginId(pluginId) {
    var id = clampPluginId(pluginId);
    if (id == null) return null;
    for (var i = 0; i < patchNodes().length; i += 1) {
      var n = patchNodes()[i];
      if (clampPluginId(n && n.pluginId) === id) return n;
    }
    return null;
  }

  function pluginIdForNodeId(nodeId) {
    var id = String(nodeId || "").trim();
    if (!id) return null;
    var node = typeof global.nodeGraphPatchNode === "function"
      ? global.nodeGraphPatchNode(id)
      : null;
    if (!node) {
      var nodes = patchNodes();
      for (var i = 0; i < nodes.length; i += 1) {
        if (String(nodes[i] && nodes[i].id) === id) {
          node = nodes[i];
          break;
        }
      }
    }
    if (!node || !CONTROLLER_TYPES[String(node.type || "")]) return null;
    return clampPluginId(node.pluginId);
  }

  function nodeIdFromSlider(slider) {
    if (!slider) return "";
    var fromData = String((slider.dataset && slider.dataset.node) || "").trim();
    if (fromData) return fromData;
    var match = /^node-(.+)-offset$/.exec(String(slider.id || ""));
    return match ? match[1] : "";
  }

  function unitFromDomain(nodeId, domainValue) {
    var node = typeof global.nodeGraphPatchNode === "function"
      ? global.nodeGraphPatchNode(nodeId)
      : null;
    if (typeof global.nodeGraphKnobFaceUnitFromValue === "function") {
      var u = global.nodeGraphKnobFaceUnitFromValue(domainValue, node || { id: nodeId });
      if (Number.isFinite(u)) return clamp01(u);
    }
    if (typeof global.nodeGraphParamControlPosition === "function") {
      var meta = typeof global.nodeGraphKnobFaceOffsetMetadata === "function"
        ? global.nodeGraphKnobFaceOffsetMetadata(node)
        : (node && node.paramMeta && node.paramMeta.offset) || { min: 0, max: 1 };
      var u2 = global.nodeGraphParamControlPosition(domainValue, meta);
      if (Number.isFinite(u2)) return clamp01(u2);
    }
    return clamp01(domainValue);
  }

  function domainFromUnit(nodeId, unit01) {
    var node = typeof global.nodeGraphPatchNode === "function"
      ? global.nodeGraphPatchNode(nodeId)
      : null;
    var meta = typeof global.nodeGraphKnobFaceOffsetMetadata === "function"
      ? global.nodeGraphKnobFaceOffsetMetadata(node)
      : (node && node.paramMeta && node.paramMeta.offset) || { min: 0, max: 1 };
    if (typeof global.nodeGraphParamDomainFromControlPosition === "function") {
      var d = global.nodeGraphParamDomainFromControlPosition(clamp01(unit01), meta);
      if (Number.isFinite(d)) return d;
    }
    var lo = Number.isFinite(Number(meta && meta.min)) ? Number(meta.min) : 0;
    var hi = Number.isFinite(Number(meta && meta.max)) ? Number(meta.max) : 1;
    return lo + (hi - lo) * clamp01(unit01);
  }

  function paintNodeVisual(nodeId, unit01) {
    var id = String(nodeId || "").trim();
    if (!id) return;
    var domain = domainFromUnit(id, unit01);
    var slider = document.getElementById("node-" + id + "-offset");
    if (slider) {
      slider.dataset.domainValue = String(domain);
      slider.value = String(domain);
    }
    var node = typeof global.nodeGraphPatchNode === "function"
      ? global.nodeGraphPatchNode(id)
      : null;
    if (node) {
      if (!node.params || typeof node.params !== "object") node.params = {};
      node.params.offset = domain;
    }
    var esc = (typeof CSS !== "undefined" && CSS.escape)
      ? CSS.escape(id)
      : id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    var knobFace = document.querySelector('.node-knob-face[data-node="' + esc + '"]');
    if (knobFace) {
      if (
        knobFace.classList.contains("is-slider-look")
        && typeof global.paintNodeGraphSliderFaceLive === "function"
      ) {
        global.paintNodeGraphSliderFaceLive(knobFace, id);
      } else if (typeof global.paintNodeGraphKnobFaceLive === "function") {
        global.paintNodeGraphKnobFaceLive(knobFace, id);
      }
    }
    var btnFace = document.querySelector(
      '.node-plugin-toggle-face[data-node="' + esc + '"],'
      + '.node-plugin-momentary-face[data-node="' + esc + '"]'
    );
    if (btnFace && typeof btnFace.syncFromParameters === "function") {
      btnFace.syncFromParameters();
    }
  }

  function showEmptyNote(show) {
    if (!show) {
      if (emptyNoteEl) emptyNoteEl.remove();
      emptyNoteEl = null;
      return;
    }
    var stage = document.getElementById("nodeScreenSoloStage");
    if (!stage && typeof global.ensureNodeGraphScreenSoloStage === "function") {
      stage = global.ensureNodeGraphScreenSoloStage();
    }
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "nodeScreenSoloStage";
      stage.className = "node-screen-solo-stage node-layout-canvas-stage";
      document.body.appendChild(stage);
    }
    stage.hidden = false;
    document.body.classList.add(
      "node-screen-solo-active",
      "node-layout-canvas-active",
      BODY_CLASS
    );
    if (!emptyNoteEl) {
      emptyNoteEl = document.createElement("div");
      emptyNoteEl.className = "soemdsp-perform-empty-note";
      emptyNoteEl.setAttribute("role", "status");
      emptyNoteEl.textContent =
        "Pin displays on the site (Show in canvas), then loadPatch again.";
    }
    if (!emptyNoteEl.parentElement) stage.appendChild(emptyNoteEl);
  }

  function openPerformCanvas() {
    ensureBodyClass();
    var opened = false;
    if (typeof global.nodeGraphLayoutCanvasOpen === "function") {
      opened = Boolean(global.nodeGraphLayoutCanvasOpen("perform", { silent: true }));
    }
    var pinned = typeof global.nodeGraphLayoutCanvasPinnedNodeIds === "function"
      ? global.nodeGraphLayoutCanvasPinnedNodeIds()
      : [];
    showEmptyNote(!opened || !pinned.length);
    document.body.classList.remove("node-layout-canvas-edit");
    var stage = document.getElementById("nodeScreenSoloStage");
    if (stage) stage.classList.remove("node-layout-canvas-edit");
    return opened;
  }

  function loadPatch(patch) {
    if (!patch || typeof patch !== "object") {
      throw new Error("soemdspPerform.loadPatch requires a patch object");
    }
    if (typeof global.loadNodeGraphPatchFromObject !== "function") {
      throw new Error("loadNodeGraphPatchFromObject is not available yet");
    }
    if (typeof global.commitNodeGraphPatch !== "function") {
      throw new Error("commitNodeGraphPatch is not available yet");
    }
    openGestures.clear();
    var loaded = global.loadNodeGraphPatchFromObject(patch);
    if (typeof global.nodeGraphAssignKnobPortalIndexes === "function") {
      global.nodeGraphAssignKnobPortalIndexes(loaded);
    }
    global.commitNodeGraphPatch(loaded, { status: "perform loadPatch" });
    snapshotParams();
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        openPerformCanvas();
      });
    });
    return true;
  }

  function setSlot(pluginId, value) {
    var id = clampPluginId(pluginId);
    if (id == null) return false;
    if (openGestures.has(id)) return false;
    var unit = clamp01(value);
    slotValues.set(id, unit);
    var node = nodeForPluginId(id);
    if (!node || !node.id) return false;
    paintNodeVisual(node.id, unit);
    return true;
  }

  function handleControllerWrite(nodeId, domainValue, phase, options) {
    var pluginId = pluginIdForNodeId(nodeId);
    if (pluginId == null) return false;
    var unit = unitFromDomain(nodeId, domainValue);
    var ph = phase === "begin" || phase === "end" ? phase : "set";
    var opts = options || {};
    var silent = Boolean(opts.silent);
    if (ph === "set" && !openGestures.has(pluginId) && opts.dragCommit) silent = true;
    if (!silent) emitGesture(pluginId, unit, ph);
    paintNodeVisual(nodeId, unit);
    return true;
  }

  global.soemdspPerform = {
    loadPatch: loadPatch,
    setSlot: setSlot,
    isActive: function () { return true; },
    _handleControllerWrite: handleControllerWrite,
    _pluginIdForNodeId: pluginIdForNodeId,
    _nodeIdFromSlider: nodeIdFromSlider,
    _openGestures: openGestures,
  };

  function onHostMessage(event) {
    var data = event && event.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== PROTOCOL_TYPE || Number(data.v) !== PROTOCOL_V) return;
    var cmd = String(data.cmd || data.command || data.event || "").trim();
    if (cmd === "loadPatch" || cmd === "load-patch") {
      try {
        loadPatch(data.patch);
      } catch (error) {
        console.warn("soemdspPerform loadPatch failed", error);
      }
      return;
    }
    if (cmd === "setSlot" || cmd === "set-slot") {
      setSlot(data.pluginId, data.value);
    }
  }
  global.addEventListener("message", onHostMessage);

  function blockLiveOutput() {
    var original = global.setNodeGraphLiveOutputEnabled;
    if (typeof original !== "function" || original._soemdspPerformWrapped) return;
    function wrapped(enabled) {
      if (enabled) {
        console.info(
          "soemdspPerform: live audio / AudioWorklet is disabled on the perform page"
        );
        return;
      }
      return original.apply(this, arguments);
    }
    wrapped._soemdspPerformWrapped = true;
    global.setNodeGraphLiveOutputEnabled = wrapped;
  }

  function blockEditMode() {
    var original = global.nodeGraphLayoutCanvasOpen;
    if (typeof original === "function" && !original._soemdspPerformWrapped) {
      function wrappedOpen(mode, options) {
        return original.call(this, mode === "edit" ? "perform" : mode, options);
      }
      wrappedOpen._soemdspPerformWrapped = true;
      global.nodeGraphLayoutCanvasOpen = wrappedOpen;
    }
    var toggle = global.toggleNodeGraphLayoutCanvasView;
    if (typeof toggle === "function" && !toggle._soemdspPerformWrapped) {
      function wrappedToggle() {
        return openPerformCanvas();
      }
      wrappedToggle._soemdspPerformWrapped = true;
      global.toggleNodeGraphLayoutCanvasView = wrappedToggle;
    }
  }

  function afterInterfaceReady() {
    ensureBodyClass();
    blockLiveOutput();
    blockEditMode();
    openPerformCanvas();
    emitReady();
  }

  function autoStartBoot() {
    ensureBodyClass();
    if (typeof global.beginNodeBootLoadSequence === "function") {
      global.beginNodeBootLoadSequence();
    } else {
      var btn = document.getElementById("nodeBootStartButton");
      if (btn) btn.click();
    }
  }

  function boot() {
    ensureBodyClass();
    ensurePerformCss();
    if (
      document.documentElement.dataset.nodeSandboxInterfaceReady === "true"
      || global.nodeSandboxInterfaceReady === true
    ) {
      afterInterfaceReady();
      return;
    }
    global.addEventListener("nodeSandboxInterfaceReady", afterInterfaceReady, {
      once: true,
    });
    if (document.body && document.body.dataset.nodeBootStarted === "1") return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoStartBoot, { once: true });
    } else {
      autoStartBoot();
    }
  }

  boot();
})(window);
