// Room light — full-UI screenspace dim veil with rect light punches.
//
// Lightbulb control drag = room dim (0 = full light / no veil, 1 = pure black
// outside holes). Button icons crossfade lightbulb-on → lightbulb-off with dim.
// Covers the whole app chrome (top toolbar + bottom resource bar + workspace).
// At 100% the room is blacked out; painted displays stay lit (rect punches) and
// the dimmer button stays punched/stacked above the veil so you can drag back.
//
// Simple light sim only:
//   - black veil alpha = dim (true 0…1)
//   - hard rect holes from painted light faces + the dimmer control itself
// Cables stay under the veil.
//
// Punch geometry:
//   Prefer the *painted* surface (scope fallback canvas, music-player panel
//   canvas, LED lamp) — not the outer module cell — so module strokes /
//   padding / widgets stay under the veil. Map holes via the dimmer canvas
//   client rect (fixed full-viewport) so CSS `zoom` on the graph surface
//   keeps holes locked to the screens.

(() => {
  "use strict";

  const STORAGE_KEY = "soemdsp-sandbox.roomDimmer.v1";
  const MAX_RECTS = 48;
  const SHADER_REV = 9;
  // Inset punch by this many CSS px so 1px borders / AA don't open chrome.
  const PUNCH_INSET_CSS = 1.25;

  // Prefer painted canvases first; shells only if no canvas child.
  // Hovered modules punch as whole .dsp-node rects (see room-dimmer-hover-cutout).
  const LIGHT_SELECTOR = [
    "canvas.node-phosphor-waveform-canvas",
    "canvas.node-module-scope-local-fallback-canvas",
    "canvas.node-xy-pad-canvas",
    "canvas.node-number-readout-canvas",
    "canvas.node-asciiscope-canvas",
    "canvas.node-matrix-display-canvas",
    "canvas.node-filter-curve-canvas",
    ".node-led-lamp",
    ".dsp-node.room-dimmer-hover-cutout",
    ".node-module-scope-window",
    ".node-xy-pad",
    ".node-number-readout-face",
    ".node-knob-face",
    ".node-ray-bouncer-face",
    ".node-phosphor-waveform-display",
    ".node-filter-curve-display",
    ".node-asciiscope-stage",
    ".node-matrix-display-stage",
    "[data-light-source]",
    ".node-light-source",
  ].join(", ");

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`.trim();

  const FRAG = `
precision mediump float;

uniform float uDim;
uniform int uRectCount;
uniform vec4 uRect[${MAX_RECTS}];
uniform float uRectStr[${MAX_RECTS}];

varying vec2 vUv;

// Axis-aligned rect SDF in UV space (r = xy min, zw size).
float rectSdf(vec2 p, vec4 r) {
  vec2 c = r.xy + r.zw * 0.5;
  vec2 h = max(r.zw * 0.5, vec2(1e-4));
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  // Dim is a true 0…1 gain: 0 = no veil, 1 = pure black outside holes.
  float veil = clamp(uDim, 0.0, 1.0);

  // open = 1 → full hole (nothing of the veil over this pixel).
  float open = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uRectCount) break;
    float s = clamp(uRectStr[i], 0.0, 1.0);
    if (s < 0.001) continue;
    float d = rectSdf(vUv, uRect[i]);
    // Hard edge + 1px AA. Strength s is hole gain (use 1.0 for full cutout).
    float inside = 1.0 - smoothstep(-0.0005, 0.001, d);
    open = max(open, inside * s);
  }
  open = clamp(open, 0.0, 1.0);

  // Full range: veil=1 and open=0 → alpha 1 (pure darkness).
  // veil=1 and open=1 → alpha 0 (screen fully visible).
  float roomA = veil * (1.0 - open);
  gl_FragColor = vec4(0.0, 0.0, 0.0, roomA);
}
`.trim();

  const state = {
    dim: 0,
    gl: null,
    program: null,
    programRev: 0,
    buffer: null,
    locs: null,
    raf: 0,
    drag: null,
    persistTimer: 0,
  };

  function clamp01(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  /** Live dim is full range 0…1 (100% blacks out the UI; button stays punched). */
  function clampDim(n) {
    return clamp01(n);
  }

  // Persist at most half-dark so a refresh never restores a pure-black UI.
  const PERSIST_DIM_MAX = 0.5;

  function clampPersistDim(n) {
    return Math.min(PERSIST_DIM_MAX, clamp01(n));
  }

  function workspace() {
    return document.getElementById("nodeGraphWorkspace");
  }

  /** Full-UI host for the fixed veil (bars + workspace). */
  function veilHost() {
    return document.body || document.documentElement;
  }

  function canvasEl() {
    return document.getElementById("nodeRoomDimmerCanvas");
  }

  function buttonEl() {
    return document.getElementById("nodeRoomDimmerButton");
  }

  function setVeilActive(on) {
    const body = veilHost();
    const ws = workspace();
    if (on) {
      body?.classList?.add("room-dimmer-on");
      ws?.classList?.add("room-dimmer-on");
    } else {
      body?.classList?.remove("room-dimmer-on");
      ws?.classList?.remove("room-dimmer-on");
    }
  }

  function load() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
      state.dim = clampPersistDim(raw.dim);
    } catch {
      state.dim = 0;
    }
  }

  function saveSoon() {
    if (state.persistTimer) return;
    state.persistTimer = window.setTimeout(() => {
      state.persistTimer = 0;
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ v: 3, dim: clampPersistDim(state.dim) }),
        );
      } catch { /* ignore */ }
    }, 120);
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(sh) || "compile failed";
      gl.deleteShader(sh);
      throw new Error(err);
    }
    return sh;
  }

  function ensureGl() {
    const canvas = canvasEl();
    if (!canvas) return null;
    if (
      state.gl
      && state.program
      && state.programRev === SHADER_REV
      && !state.gl.isContextLost()
    ) {
      return state.gl;
    }

    if (state.gl && state.program) {
      try { state.gl.deleteProgram(state.program); } catch { /* ignore */ }
      state.program = null;
    }

    const gl = state.gl && !state.gl.isContextLost()
      ? state.gl
      : canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        stencil: false,
      });
    if (!gl) return null;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(prog) || "link failed";
      gl.deleteProgram(prog);
      throw new Error(err);
    }

    if (!state.buffer) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      state.buffer = buf;
    }

    state.gl = gl;
    state.program = prog;
    state.programRev = SHADER_REV;
    state.locs = {
      aPos: gl.getAttribLocation(prog, "aPos"),
      uDim: gl.getUniformLocation(prog, "uDim"),
      uRectCount: gl.getUniformLocation(prog, "uRectCount"),
      uRect: Array.from({ length: MAX_RECTS }, (_, i) =>
        gl.getUniformLocation(prog, `uRect[${i}]`)),
      uRectStr: Array.from({ length: MAX_RECTS }, (_, i) =>
        gl.getUniformLocation(prog, `uRectStr[${i}]`)),
    };
    return gl;
  }

  function resizeCanvas(canvas) {
    if (!canvas) return false;
    // Fixed full-viewport veil (covers top/bottom bars + workspace).
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(rect.width, window.innerWidth || 1, 1);
    const cssH = Math.max(rect.height, window.innerHeight || 1, 1);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return canvas.width > 0 && canvas.height > 0;
  }

  function lightStrength(el) {
    // Walk up for strength (canvas children inherit from face / lamp).
    let node = el;
    for (let i = 0; i < 4 && node; i += 1) {
      const raw = node.dataset?.lightStrength;
      if (raw != null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) return clamp01(n);
      }
      node = node.parentElement;
    }
    // Unset painted screens default to full hole.
    return 1;
  }

  /**
   * Prefer the painted panel over the outer module cell so punches don't open
   * module strokes / black padding / slider chrome.
   */
  function resolvePunchElement(el) {
    if (!el) return null;
    // Full-module hover cutout: punch the whole .dsp-node, not a face child.
    if (el.matches?.(".dsp-node.room-dimmer-hover-cutout")) return el;
    if (el.matches?.("canvas.node-phosphor-waveform-canvas")) return el;
    if (el.matches?.("canvas.node-module-scope-local-fallback-canvas")) return el;
    if (el.matches?.("canvas.node-xy-pad-canvas")) return el;
    if (el.matches?.("canvas.node-number-readout-canvas")) return el;
    if (el.matches?.("canvas.node-asciiscope-canvas")) return el;
    if (el.matches?.("canvas.node-matrix-display-canvas")) return el;
    if (el.matches?.("canvas.node-filter-curve-canvas")) return el;
    if (el.matches?.(".node-led-lamp")) return el;

    // Outer shells: only if no painted canvas is already the target.
    const painted = el.querySelector?.(
      "canvas.node-module-scope-local-fallback-canvas, canvas.node-phosphor-waveform-canvas, canvas.node-xy-pad-canvas, canvas.node-number-readout-canvas, canvas.node-asciiscope-canvas, canvas.node-matrix-display-canvas, canvas.node-filter-curve-canvas, .node-led-lamp",
    );
    if (painted) return painted;

    if (el.matches?.(".node-phosphor-waveform-display")) {
      return el.querySelector?.("canvas.node-phosphor-waveform-canvas") || el;
    }
    if (el.matches?.(".node-filter-curve-display")) {
      return el.querySelector?.("canvas.node-filter-curve-canvas") || el;
    }
    return el;
  }

  function pushRectLight(el, canvasRect, canvas, seen, rects, strengths) {
    if (!el || seen.has(el)) return;
    if (el.offsetParent === null && el !== document.body) {
      // Zoom surface uses pointer-events:none; offsetParent can be null.
      // Still punch if the element has a real client rect.
    }
    const punchEl = resolvePunchElement(el);
    if (!punchEl || seen.has(punchEl)) return;

    // Skip outer shell when we already punched its canvas (seen later or earlier).
    if (
      punchEl !== el
      && el.matches?.(
        ".node-module-scope-window, .node-xy-pad, .node-number-readout-face, .node-knob-face, .node-ray-bouncer-face, .node-phosphor-waveform-display, [data-light-source], .node-light-source",
      )
    ) {
      // Still mark shell seen so generic selectors don't double-add.
      seen.add(el);
    }

    seen.add(punchEl);
    seen.add(el);

    const str = lightStrength(punchEl);
    if (str < 0.001) return;

    const r = punchEl.getBoundingClientRect();
    if (r.width < 1.5 || r.height < 1.5) return;

    // Map in the veil canvas's client space (same box the GL buffer fills).
    const cr = canvasRect;
    const cssW = Math.max(1e-6, cr.width);
    const cssH = Math.max(1e-6, cr.height);
    // Device-pixel snap after inset so zoom doesn't leave half-pixel leaks.
    const dprX = canvas.width / cssW;
    const dprY = canvas.height / cssH;
    const insetX = Math.max(1, Math.round(PUNCH_INSET_CSS * dprX));
    const insetY = Math.max(1, Math.round(PUNCH_INSET_CSS * dprY));

    let leftPx = Math.round((r.left - cr.left) * dprX) + insetX;
    let topPx = Math.round((r.top - cr.top) * dprY) + insetY;
    let rightPx = Math.round((r.right - cr.left) * dprX) - insetX;
    let bottomPx = Math.round((r.bottom - cr.top) * dprY) - insetY;
    if (rightPx <= leftPx + 1 || bottomPx <= topPx + 1) {
      // Face smaller than inset budget — use un-inset snapped rect.
      leftPx = Math.round((r.left - cr.left) * dprX);
      topPx = Math.round((r.top - cr.top) * dprY);
      rightPx = Math.round((r.right - cr.left) * dprX);
      bottomPx = Math.round((r.bottom - cr.top) * dprY);
    }
    if (rightPx <= leftPx || bottomPx <= topPx) return;

    // Shader UV: origin bottom-left of canvas buffer (matches previous convention).
    const x = leftPx / canvas.width;
    const y = (canvas.height - bottomPx) / canvas.height;
    const w = (rightPx - leftPx) / canvas.width;
    const h = (bottomPx - topPx) / canvas.height;

    rects.push([
      Math.max(-1, Math.min(2, x)),
      Math.max(-1, Math.min(2, y)),
      Math.max(0, Math.min(2, w)),
      Math.max(0, Math.min(2, h)),
    ]);
    strengths.push(str);
  }

  function collectLights(canvas) {
    if (!canvas?.width || !canvas?.height) {
      return { rects: [], rectStr: [] };
    }
    // Full-viewport veil: map module light rects in the same client space.
    const canvasRect = canvas.getBoundingClientRect();
    if (!(canvasRect.width > 0) || !(canvasRect.height > 0)) {
      return { rects: [], rectStr: [] };
    }
    const seen = new Set();
    const rects = [];
    const rectStr = [];
    // Lights live in the graph; query the document so we still find them if
    // the canvas is reparented outside the workspace.
    const root = document;
    for (const el of root.querySelectorAll(LIGHT_SELECTOR)) {
      if (rects.length >= MAX_RECTS) break;
      // Dimmer control is handled below (always full hole, even at 100% dim).
      if (el.closest?.("#nodeRoomDimmerButton, .node-room-dimmer-button")) continue;
      pushRectLight(el, canvasRect, canvas, seen, rects, rectStr);
    }

    // Always punch the dimmer button so it stays visible/usable at full black.
    const btn = buttonEl();
    if (btn && rects.length < MAX_RECTS) {
      const prev = btn.dataset?.lightStrength;
      if (btn.dataset) {
        btn.dataset.lightStrength = "1";
      }
      pushRectLight(btn, canvasRect, canvas, seen, rects, rectStr);
      if (btn.dataset) {
        if (prev == null || prev === "") {
          delete btn.dataset.lightStrength;
        } else {
          btn.dataset.lightStrength = prev;
        }
      }
    }

    return { rects, rectStr };
  }

  function drawFrame() {
    state.raf = 0;
    const dim = clampDim(state.dim);
    const canvas = canvasEl();
    if (!canvas) return;

    if (dim <= 0.0005) {
      setVeilActive(false);
      clearCanvas();
      return;
    }

    setVeilActive(true);
    if (!resizeCanvas(canvas)) {
      scheduleDraw();
      return;
    }

    let gl;
    try {
      gl = ensureGl();
    } catch (err) {
      console.warn("[room-light]", err?.message || err);
      return;
    }
    if (!gl || !state.program) {
      scheduleDraw();
      return;
    }

    const { rects, rectStr } = collectLights(canvas);
    const { locs } = state;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // Straight alpha: black veil RGB is 0, so premultiply is irrelevant;
    // ONE, ONE_MINUS_SRC_ALPHA still composites correctly with RGB=0.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(state.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    gl.enableVertexAttribArray(locs.aPos);
    gl.vertexAttribPointer(locs.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(locs.uDim, dim);
    gl.uniform1i(locs.uRectCount, rects.length);

    for (let i = 0; i < MAX_RECTS; i += 1) {
      const r = rects[i] || [0, 0, 0, 0];
      if (locs.uRect[i]) gl.uniform4f(locs.uRect[i], r[0], r[1], r[2], r[3]);
      if (locs.uRectStr[i]) gl.uniform1f(locs.uRectStr[i], rectStr[i] || 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(locs.aPos);
    scheduleDraw();
  }

  function clearCanvas() {
    const canvas = canvasEl();
    const gl = state.gl;
    if (!gl || !canvas) return;
    try {
      gl.viewport(0, 0, canvas.width || 1, canvas.height || 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } catch { /* ignore */ }
  }

  function scheduleDraw() {
    if (state.raf) return;
    if (clampDim(state.dim) <= 0.0005) return;
    state.raf = window.requestAnimationFrame(drawFrame);
  }

  function syncButton() {
    const btn = buttonEl();
    if (!btn) return;
    const dim = clampDim(state.dim);
    const on = dim > 0.0005;
    const pct = Math.round(dim * 100);
    // Drives CSS crossfade: on opacity = 1−dim, off opacity = dim.
    btn.style.setProperty("--room-dim", String(dim));
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-valuenow", String(pct));
    btn.setAttribute("aria-valuemin", "0");
    btn.setAttribute("aria-valuemax", "100");
    btn.setAttribute(
      "aria-valuetext",
      pct <= 0
        ? "Room light full on"
        : pct >= 100
          ? "Room dark; displays stay lit"
          : `Room ${pct} percent dark; displays stay lit`,
    );
    btn.title = on
      ? `Room ${pct}% dark · drag (displays stay lit)`
      : "Room light · drag up to darken the room (displays stay lit)";
  }

  function setDim(value, options = {}) {
    state.dim = clampDim(value);
    syncButton();
    if (state.dim > 0.0005) {
      scheduleDraw();
    } else {
      if (state.raf) {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
      setVeilActive(false);
      clearCanvas();
    }
    if (options.persist !== false) saveSoon();
    return state.dim;
  }

  function bindButton() {
    const btn = buttonEl();
    if (!btn || btn.dataset.roomDimmerBound === "1") return;
    btn.dataset.roomDimmerBound = "1";
    btn.setAttribute("role", "slider");
    btn.setAttribute("aria-orientation", "vertical");

    const end = (event) => {
      if (!state.drag) return;
      state.drag = null;
      btn.classList.remove("room-dimmer-dragging");
      try { btn.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
      saveSoon();
    };

    btn.addEventListener("pointerdown", (event) => {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      state.drag = {
        id: event.pointerId,
        y0: event.clientY,
        d0: clampDim(state.dim),
      };
      btn.classList.add("room-dimmer-dragging");
      try { btn.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
    });
    btn.addEventListener("pointermove", (event) => {
      if (!state.drag || state.drag.id !== event.pointerId) return;
      const dy = state.drag.y0 - event.clientY;
      setDim(state.drag.d0 + dy / 140, { persist: false });
    });
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("keydown", (event) => {
      const d = clampDim(state.dim);
      if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        event.preventDefault();
        setDim(d + 0.05);
      } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        event.preventDefault();
        setDim(d - 0.05);
      } else if (event.key === "Home") {
        event.preventDefault();
        setDim(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setDim(1);
      }
    });
  }

  /** UI Dev: full-module cutout while pointer hovers a module (default on). */
  let hoverCutoutEnabled = true;
  let hoverCutoutModule = null;

  function isHoverCutoutEnabled() {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.hoverModuleDimmerCutoutEnabled === "boolean") {
      return nodeGraphMvp.hoverModuleDimmerCutoutEnabled;
    }
    return hoverCutoutEnabled;
  }

  function clearHoverCutoutClass(el) {
    if (!el?.classList) return;
    el.classList.remove("room-dimmer-hover-cutout");
    if (el.dataset?.roomDimmerHover === "1") {
      delete el.dataset.roomDimmerHover;
      // Only clear strength if we set it for hover (don't clobber painted faces).
      if (el.dataset.lightStrength === "1" && el.dataset.roomDimmerHoverStrength === "1") {
        delete el.dataset.lightStrength;
        delete el.dataset.roomDimmerHoverStrength;
      } else {
        delete el.dataset.roomDimmerHoverStrength;
      }
    }
  }

  function clearAllHoverCutouts() {
    document.querySelectorAll(".dsp-node.room-dimmer-hover-cutout").forEach(clearHoverCutoutClass);
    hoverCutoutModule = null;
  }

  function setHoverCutoutModule(moduleEl) {
    if (!isHoverCutoutEnabled()) {
      if (hoverCutoutModule) {
        clearHoverCutoutClass(hoverCutoutModule);
        hoverCutoutModule = null;
        scheduleDraw();
      }
      return;
    }
    if (moduleEl === hoverCutoutModule) return;
    if (hoverCutoutModule) {
      clearHoverCutoutClass(hoverCutoutModule);
    }
    hoverCutoutModule = moduleEl || null;
    if (hoverCutoutModule) {
      hoverCutoutModule.classList.add("room-dimmer-hover-cutout");
      hoverCutoutModule.dataset.roomDimmerHover = "1";
      hoverCutoutModule.dataset.roomDimmerHoverStrength = "1";
      hoverCutoutModule.dataset.lightStrength = "1";
    }
    scheduleDraw();
  }

  function bindHoverCutout() {
    const ws = document.getElementById("nodeGraphWorkspace");
    if (!ws || ws.dataset.roomDimmerHoverBound === "1") return;
    ws.dataset.roomDimmerHoverBound = "1";
    ws.addEventListener("pointerover", (event) => {
      if (!isHoverCutoutEnabled()) return;
      const moduleEl = event.target?.closest?.(".dsp-node");
      if (moduleEl && ws.contains(moduleEl)) {
        setHoverCutoutModule(moduleEl);
      }
    });
    ws.addEventListener("pointerout", (event) => {
      if (!hoverCutoutModule) return;
      const related = event.relatedTarget;
      // Still inside the same module (or a child that left into a non-module).
      if (related && hoverCutoutModule.contains(related)) return;
      if (related?.closest?.(".dsp-node") === hoverCutoutModule) return;
      // Moving to another module is handled by pointerover on that module.
      const nextModule = related?.closest?.(".dsp-node");
      if (nextModule && ws.contains(nextModule)) {
        setHoverCutoutModule(nextModule);
        return;
      }
      setHoverCutoutModule(null);
    });
    ws.addEventListener("pointerleave", () => {
      setHoverCutoutModule(null);
    });
  }

  function setHoverModuleDimmerCutoutEnabled(on) {
    hoverCutoutEnabled = Boolean(on);
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      nodeGraphMvp.hoverModuleDimmerCutoutEnabled = hoverCutoutEnabled;
    }
    if (!hoverCutoutEnabled) {
      clearAllHoverCutouts();
      scheduleDraw();
    }
  }

  function bind() {
    load();
    bindButton();
    bindHoverCutout();
    syncButton();
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.hoverModuleDimmerCutoutEnabled === "boolean") {
      hoverCutoutEnabled = nodeGraphMvp.hoverModuleDimmerCutoutEnabled;
    }
    if (state.dim > 0.0005) scheduleDraw();
    window.addEventListener("resize", () => {
      if (state.dim > 0.0005) scheduleDraw();
    });
  }

  function setLightStrength(el, strength) {
    if (!el) return;
    el.dataset.lightStrength = String(clamp01(strength));
  }

  window.setNodeGraphRoomDim = setDim;
  window.nodeGraphRoomDim = () => clampDim(state.dim);
  window.nodeGraphRoomDimMax = () => 1;
  window.bindNodeGraphRoomDimmer = bind;
  window.setNodeGraphLightStrength = setLightStrength;
  window.scheduleNodeGraphRoomDimmerDraw = scheduleDraw;
  window.setNodeGraphHoverModuleDimmerCutoutEnabled = setHoverModuleDimmerCutoutEnabled;

  window.setNodeGraphShaderScriptEnabled = (on) => {
    if (!on) setDim(0);
    else if (clampDim(state.dim) < 0.001) setDim(0.55);
  };
  window.bindNodeGraphShaderScriptEvents = bind;
  window.openNodeGraphGlobalShaderScript = () => {};
  window.openNodeGraphScopeShaderScript = () => false;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
