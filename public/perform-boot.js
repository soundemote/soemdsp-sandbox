/**
 * Perform mode (Step 1): layout-canvas perform page for the plugin host.
 * No AudioWorklet. Controllers with pluginId 0-31 emit gestures (no Bias write).
 * setSlot paints faces; ignored while that pluginId has an open gesture.
 * Activate via /perform.html or index.html?mode=perform
 */
(function soemdspPerformBoot(global) {
  "use strict";

  var PROTOCOL_TYPE = "soemdsp-perform";
  var PROTOCOL_V = 1;
  var BODY_CLASS = "node-perform-mode";
  var CACHE_TAG = "perform-1";
  var CONTROLLER_TYPES = {
    knob: true,
    pluginSlider: true,
    toggleButton: true,
    momentaryButton: true,
  };

  function isPerformPath() {
    try {
      var path = String((global.location && global.location.pathname) || "").toLowerCase();
      if (path.endsWith("/perform.html") || path.endsWith("/perform")) return true;
      var mode = String(new URLSearchParams(global.location.search).get("mode") || "")
        .trim()
        .toLowerCase();
      return mode === "perform";
    } catch (_e) {
      return false;
    }
  }

  if (!isPerformPath()) {
    global.soemdspPerformMode = false;
    return;
  }
  global.soemdspPerformMode = true;

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
