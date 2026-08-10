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
  const SHADER_REV = 10;
  // Inset punch by this many CSS px so 1px borders / AA don't open chrome.
  const PUNCH_INSET_CSS = 1.25;

  // Prefer painted canvases first; shells only if no canvas child.
  // Hover cutouts (mouse / slider / title / module) are pushed in collectLights.
  const LIGHT_SELECTOR = [
    "canvas.node-phosphor-waveform-canvas",
    "canvas.node-module-scope-local-fallback-canvas",
    "canvas.node-xy-pad-canvas",
    "canvas.node-number-readout-canvas",
    "canvas.node-asciiscope-canvas",
    "canvas.node-matrix-display-canvas",
    "canvas.node-filter-curve-canvas",
    ".node-led-lamp",
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
  // Default mouse cutout size (CSS px); UI Dev can override.
  const HOVER_CURSOR_CUTOUT_CSS_DEFAULT = 56;

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
// Soft edge width in UV (0 ≈ hard AA). Roundness 0=square … 1=circle.
uniform float uRectSoft[${MAX_RECTS}];
uniform float uRectRound[${MAX_RECTS}];

varying vec2 vUv;

// Rounded box SDF in UV space (r = xy min, zw size; rr = corner radius 0…half-min).
float roundedBoxSdf(vec2 p, vec4 r, float rr) {
  vec2 c = r.xy + r.zw * 0.5;
  vec2 h = max(r.zw * 0.5, vec2(1e-4));
  float rad = clamp(rr, 0.0, min(h.x, h.y));
  vec2 q = abs(p - c) - h + vec2(rad);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
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
    float soft = max(uRectSoft[i], 0.0005);
    float d = roundedBoxSdf(vUv, uRect[i], uRectRound[i]);
    // soft = edge feather in UV; strength s is hole gain.
    float inside = 1.0 - smoothstep(-soft, soft, d);
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
      uRectSoft: Array.from({ length: MAX_RECTS }, (_, i) =>
        gl.getUniformLocation(prog, `uRectSoft[${i}]`)),
      uRectRound: Array.from({ length: MAX_RECTS }, (_, i) =>
        gl.getUniformLocation(prog, `uRectRound[${i}]`)),
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

  function pushRectArrays(rects, strengths, softs, rounds, x, y, w, h, str, soft = 0, round = 0) {
    if (rects.length >= MAX_RECTS) return;
    rects.push([
      Math.max(-1, Math.min(2, x)),
      Math.max(-1, Math.min(2, y)),
      Math.max(0, Math.min(2, w)),
      Math.max(0, Math.min(2, h)),
    ]);
    strengths.push(str);
    softs.push(Math.max(0, Number(soft) || 0));
    rounds.push(Math.max(0, Number(round) || 0));
  }

  function pushRectLight(el, canvasRect, canvas, seen, rects, strengths, softs, rounds) {
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
    pushRectArrays(rects, strengths, softs, rounds, x, y, w, h, str, 0, 0);
  }

  /**
   * Punch an arbitrary client-space axis-aligned rect (cursor hole, slider strip).
   * @param {{left:number,top:number,right:number,bottom:number}|DOMRect} r
   * @param {number} [softUv] edge feather in UV (mouse softness)
   * @param {number} [roundUv] corner radius in UV (mouse shape square→circle)
   */
  function pushClientRectLight(
    r,
    canvasRect,
    canvas,
    rects,
    strengths,
    softs,
    rounds,
    strength = 1,
    softUv = 0,
    roundUv = 0,
  ) {
    if (!r || !canvas?.width || !canvas?.height || rects.length >= MAX_RECTS) return;
    const str = clamp01(strength);
    if (str < 0.001) return;
    const width = Number(r.right) - Number(r.left);
    const height = Number(r.bottom) - Number(r.top);
    if (!(width > 1) || !(height > 1)) return;

    const cr = canvasRect;
    const cssW = Math.max(1e-6, cr.width);
    const cssH = Math.max(1e-6, cr.height);
    const dprX = canvas.width / cssW;
    const dprY = canvas.height / cssH;
    // Cursor / strip cutouts: no inset (we want the full hole under the pointer).
    const leftPx = Math.round((Number(r.left) - cr.left) * dprX);
    const topPx = Math.round((Number(r.top) - cr.top) * dprY);
    const rightPx = Math.round((Number(r.right) - cr.left) * dprX);
    const bottomPx = Math.round((Number(r.bottom) - cr.top) * dprY);
    if (rightPx <= leftPx || bottomPx <= topPx) return;

    const x = leftPx / canvas.width;
    const y = (canvas.height - bottomPx) / canvas.height;
    const w = (rightPx - leftPx) / canvas.width;
    const h = (bottomPx - topPx) / canvas.height;
    pushRectArrays(rects, strengths, softs, rounds, x, y, w, h, str, softUv, roundUv);
  }

  function collectLights(canvas) {
    if (!canvas?.width || !canvas?.height) {
      return { rects: [], rectStr: [], rectSoft: [], rectRound: [] };
    }
    // Full-viewport veil: map module light rects in the same client space.
    const canvasRect = canvas.getBoundingClientRect();
    if (!(canvasRect.width > 0) || !(canvasRect.height > 0)) {
      return { rects: [], rectStr: [], rectSoft: [], rectRound: [] };
    }
    const seen = new Set();
    const rects = [];
    const rectStr = [];
    const rectSoft = [];
    const rectRound = [];
    // Lights live in the graph; query the document so we still find them if
    // the canvas is reparented outside the workspace.
    const root = document;
    for (const el of root.querySelectorAll(LIGHT_SELECTOR)) {
      if (rects.length >= MAX_RECTS) break;
      // Dimmer control is handled below (always full hole, even at 100% dim).
      if (el.closest?.("#nodeRoomDimmerButton, .node-room-dimmer-button")) continue;
      pushRectLight(el, canvasRect, canvas, seen, rects, rectStr, rectSoft, rectRound);
    }

    // Always punch the dimmer button so it stays visible/usable at full black.
    const btn = buttonEl();
    if (btn && rects.length < MAX_RECTS) {
      const prev = btn.dataset?.lightStrength;
      if (btn.dataset) {
        btn.dataset.lightStrength = "1";
      }
      pushRectLight(btn, canvasRect, canvas, seen, rects, rectStr, rectSoft, rectRound);
      if (btn.dataset) {
        if (prev == null || prev === "") {
          delete btn.dataset.lightStrength;
        } else {
          btn.dataset.lightStrength = prev;
        }
      }
    }

    // Hover scheme (UI Dev): mouse / slider / title / full module cutouts.
    const cssW = Math.max(1e-6, canvasRect.width);
    const mouseOpts = readMouseCutoutOptions(cssW, canvas.width);

    if (isMouseCutoutEnabled() && hoverPointer) {
      const half = mouseOpts.sizeCss * 0.5;
      pushClientRectLight(
        {
          left: hoverPointer.x - half,
          top: hoverPointer.y - half,
          right: hoverPointer.x + half,
          bottom: hoverPointer.y + half,
        },
        canvasRect,
        canvas,
        rects,
        rectStr,
        rectSoft,
        rectRound,
        1,
        mouseOpts.softUv,
        mouseOpts.roundUv,
      );
    }
    if (isSliderCutoutEnabled() && hoverSliderStrip) {
      pushClientRectLight(hoverSliderStrip, canvasRect, canvas, rects, rectStr, rectSoft, rectRound, 1);
    }
    if (isTitleCutoutEnabled() && hoverTitleStrip) {
      pushClientRectLight(hoverTitleStrip, canvasRect, canvas, rects, rectStr, rectSoft, rectRound, 1);
    }
    if (isModuleCutoutEnabled() && hoverModuleRect) {
      pushClientRectLight(hoverModuleRect, canvasRect, canvas, rects, rectStr, rectSoft, rectRound, 1);
    }

    return { rects, rectStr, rectSoft, rectRound };
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

    const { rects, rectStr, rectSoft, rectRound } = collectLights(canvas);
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
      if (locs.uRectSoft?.[i]) gl.uniform1f(locs.uRectSoft[i], rectSoft?.[i] || 0);
      if (locs.uRectRound?.[i]) gl.uniform1f(locs.uRectRound[i], rectRound?.[i] || 0);
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
    // Keep workspace mouse-light amount in step with room dim when there is
    // no mouse cutout (heatmap rebuild reads nodeGraphRoomDim()).
    if (typeof scheduleNodeGraphGridHeatmapUpdate === "function") {
      scheduleNodeGraphGridHeatmapUpdate();
    } else if (typeof updateNodeGraphGridHeatmap === "function") {
      try { updateNodeGraphGridHeatmap({ force: true }); } catch { /* ignore */ }
    }
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

  /**
   * UI Dev hover cutouts (independent toggles):
   *   - mouse pointer cutout (size / softness / shape)
   *   - full-width slider strip
   *   - full-width title-row light box
   *   - full module plate
   */
  let cutoutSliderEnabled = true;
  let cutoutModuleEnabled = false;
  let cutoutTitleEnabled = true;
  let cutoutMouseEnabled = false;
  let mouseSizeCss = HOVER_CURSOR_CUTOUT_CSS_DEFAULT;
  let mouseSoftness01 = 0.25;
  let mouseShape01 = 0;
  /** @type {{ x: number, y: number } | null} */
  let hoverPointer = null;
  /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
  let hoverSliderStrip = null;
  /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
  let hoverTitleStrip = null;
  /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
  let hoverModuleRect = null;

  function mvpBool(key, fallback) {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp && typeof nodeGraphMvp[key] === "boolean") {
      return nodeGraphMvp[key];
    }
    return fallback;
  }

  function mvpNumber(key, fallback, min, max) {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      const n = Number(nodeGraphMvp[key]);
      if (Number.isFinite(n)) {
        return Math.max(min, Math.min(max, n));
      }
    }
    return fallback;
  }

  function isSliderCutoutEnabled() {
    // Prefer split key; fall back to legacy combined hover toggle.
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.dimmerCutoutSliderEnabled === "boolean") {
      return nodeGraphMvp.dimmerCutoutSliderEnabled;
    }
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.hoverModuleDimmerCutoutEnabled === "boolean") {
      return nodeGraphMvp.hoverModuleDimmerCutoutEnabled;
    }
    return cutoutSliderEnabled;
  }

  function isModuleCutoutEnabled() {
    return mvpBool("dimmerCutoutModuleEnabled", cutoutModuleEnabled);
  }

  function isTitleCutoutEnabled() {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.dimmerCutoutTitleEnabled === "boolean") {
      return nodeGraphMvp.dimmerCutoutTitleEnabled;
    }
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.hoverModuleTitleDimmerCutoutEnabled === "boolean") {
      return nodeGraphMvp.hoverModuleTitleDimmerCutoutEnabled;
    }
    return cutoutTitleEnabled;
  }

  function isMouseCutoutEnabled() {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.dimmerCutoutMouseEnabled === "boolean") {
      return nodeGraphMvp.dimmerCutoutMouseEnabled;
    }
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.hoverModuleDimmerCutoutEnabled === "boolean") {
      return nodeGraphMvp.hoverModuleDimmerCutoutEnabled;
    }
    return cutoutMouseEnabled;
  }

  function anyHoverCutoutEnabled() {
    return isSliderCutoutEnabled()
      || isModuleCutoutEnabled()
      || isTitleCutoutEnabled()
      || isMouseCutoutEnabled();
  }

  /**
   * Mouse cutout size (CSS px), softness (UV feather), corner radius (UV).
   * Shape 0 = square, ~0.5 = squircle, 1 = circle.
   */
  function readMouseCutoutOptions(cssW, canvasW) {
    const sizeCss = mvpNumber("dimmerMouseSize", mouseSizeCss, 8, 240);
    const soft01 = mvpNumber("dimmerMouseSoftness", mouseSoftness01 * 100, 0, 100) / 100;
    const shape01 = mvpNumber("dimmerMouseShape", mouseShape01 * 100, 0, 100) / 100;
    // Softness: map 0…1 → ~0.5px … ~22% of cutout diameter in UV.
    const sizeUv = Math.max(1e-5, (sizeCss / Math.max(1e-6, cssW)));
    const softUv = 0.0004 + soft01 * soft01 * sizeUv * 0.28;
    // Roundness: corner radius in UV (0 … half of min side = full circle).
    const halfMinUv = sizeUv * 0.5;
    // Ease mid toward squircle (~0.42 of half) then full circle at 1.
    const t = Math.max(0, Math.min(1, shape01));
    const roundUv = halfMinUv * (t < 0.5
      ? (t / 0.5) * 0.42
      : 0.42 + ((t - 0.5) / 0.5) * 0.58);
    return { sizeCss, softUv, roundUv, soft01, shape01 };
  }

  function clearHoverCutouts() {
    hoverPointer = null;
    hoverSliderStrip = null;
    hoverTitleStrip = null;
    hoverModuleRect = null;
  }

  /**
   * Full module width × row height strip in client px.
   */
  function moduleWidthStripFromRow(moduleEl, rowEl, padY = 2) {
    if (!moduleEl || !rowEl) return null;
    const mr = moduleEl.getBoundingClientRect();
    const rr = rowEl.getBoundingClientRect();
    if (!(mr.width > 1) || !(rr.height > 1)) return null;
    return {
      left: mr.left,
      right: mr.right,
      top: rr.top - padY,
      bottom: rr.bottom + padY,
    };
  }

  function moduleRectFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    const moduleEl = target.closest?.(".dsp-node");
    if (!moduleEl) return null;
    const r = moduleEl.getBoundingClientRect();
    if (!(r.width > 1) || !(r.height > 1)) return null;
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
    };
  }

  /**
   * Slider row strip: module full width × parameter-row height (client px).
   */
  function sliderStripFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    const row = target.closest?.(
      ".node-parameter-row, .node-slider-readout, .node-parameter-control",
    );
    if (!row) return null;
    // Prefer the parameter row for height; fall back to the readout itself.
    const rowEl = row.classList?.contains("node-parameter-row")
      ? row
      : (row.closest?.(".node-parameter-row") || row);
    const moduleEl = rowEl.closest?.(".dsp-node");
    return moduleWidthStripFromRow(moduleEl, rowEl, 2);
  }

  /**
   * Title light box: full module width × header title row height.
   */
  function titleStripFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    const hit = target.closest?.(
      ".node-header-title-row, .node-header-title, .dsp-node-header, .node-header-actions",
    );
    if (!hit) return null;
    const rowEl = hit.classList?.contains("node-header-title-row")
      ? hit
      : (hit.closest?.(".node-header-title-row")
        || hit.closest?.(".dsp-node-header")
        || hit);
    const moduleEl = rowEl.closest?.(".dsp-node");
    return moduleWidthStripFromRow(moduleEl, rowEl, 1);
  }

  function updateHoverFromEvent(event) {
    if (!anyHoverCutoutEnabled()) {
      clearHoverCutouts();
      return;
    }
    if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    hoverPointer = isMouseCutoutEnabled()
      ? { x: event.clientX, y: event.clientY }
      : null;
    hoverSliderStrip = isSliderCutoutEnabled()
      ? sliderStripFromEventTarget(event.target)
      : null;
    hoverTitleStrip = isTitleCutoutEnabled()
      ? titleStripFromEventTarget(event.target)
      : null;
    hoverModuleRect = isModuleCutoutEnabled()
      ? moduleRectFromEventTarget(event.target)
      : null;
  }

  function bindHoverCutout() {
    const ws = document.getElementById("nodeGraphWorkspace");
    if (!ws || ws.dataset.roomDimmerHoverBound === "1") return;
    ws.dataset.roomDimmerHoverBound = "1";
    // Pointermove drives mouse / slider / title / module cutouts while dimmer is on.
    ws.addEventListener("pointermove", (event) => {
      if (!anyHoverCutoutEnabled()) return;
      updateHoverFromEvent(event);
      if (state.dim > 0.0005) scheduleDraw();
    }, { passive: true });
    ws.addEventListener("pointerover", (event) => {
      if (!anyHoverCutoutEnabled()) return;
      updateHoverFromEvent(event);
      if (state.dim > 0.0005) scheduleDraw();
    }, { passive: true });
    ws.addEventListener("pointerleave", () => {
      clearHoverCutouts();
      if (state.dim > 0.0005) scheduleDraw();
    });
  }

  function applyHoverCutoutFlagsFromMvp() {
    if (typeof nodeGraphMvp === "undefined" || !nodeGraphMvp) return;
    // New split keys.
    if (typeof nodeGraphMvp.dimmerCutoutSliderEnabled === "boolean") {
      cutoutSliderEnabled = nodeGraphMvp.dimmerCutoutSliderEnabled;
    } else if (typeof nodeGraphMvp.hoverModuleDimmerCutoutEnabled === "boolean") {
      cutoutSliderEnabled = nodeGraphMvp.hoverModuleDimmerCutoutEnabled;
    }
    if (typeof nodeGraphMvp.dimmerCutoutMouseEnabled === "boolean") {
      cutoutMouseEnabled = nodeGraphMvp.dimmerCutoutMouseEnabled;
    } else if (typeof nodeGraphMvp.hoverModuleDimmerCutoutEnabled === "boolean") {
      cutoutMouseEnabled = nodeGraphMvp.hoverModuleDimmerCutoutEnabled;
    }
    if (typeof nodeGraphMvp.dimmerCutoutTitleEnabled === "boolean") {
      cutoutTitleEnabled = nodeGraphMvp.dimmerCutoutTitleEnabled;
    } else if (typeof nodeGraphMvp.hoverModuleTitleDimmerCutoutEnabled === "boolean") {
      cutoutTitleEnabled = nodeGraphMvp.hoverModuleTitleDimmerCutoutEnabled;
    }
    if (typeof nodeGraphMvp.dimmerCutoutModuleEnabled === "boolean") {
      cutoutModuleEnabled = nodeGraphMvp.dimmerCutoutModuleEnabled;
    }
    const size = Number(nodeGraphMvp.dimmerMouseSize);
    if (Number.isFinite(size)) mouseSizeCss = Math.max(8, Math.min(240, size));
    const soft = Number(nodeGraphMvp.dimmerMouseSoftness);
    if (Number.isFinite(soft)) mouseSoftness01 = Math.max(0, Math.min(100, soft)) / 100;
    const shape = Number(nodeGraphMvp.dimmerMouseShape);
    if (Number.isFinite(shape)) mouseShape01 = Math.max(0, Math.min(100, shape)) / 100;
  }

  /** @deprecated Prefer setNodeGraphDimmerCutoutOptions / split toggles. */
  function setHoverModuleDimmerCutoutEnabled(on) {
    const v = Boolean(on);
    cutoutSliderEnabled = v;
    cutoutMouseEnabled = v;
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      nodeGraphMvp.hoverModuleDimmerCutoutEnabled = v;
      nodeGraphMvp.dimmerCutoutSliderEnabled = v;
      nodeGraphMvp.dimmerCutoutMouseEnabled = v;
    }
    if (!anyHoverCutoutEnabled()) clearHoverCutouts();
    scheduleDraw();
  }

  /** @deprecated Prefer dimmerCutoutTitleEnabled. */
  function setHoverModuleTitleDimmerCutoutEnabled(on) {
    cutoutTitleEnabled = Boolean(on);
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      nodeGraphMvp.hoverModuleTitleDimmerCutoutEnabled = cutoutTitleEnabled;
      nodeGraphMvp.dimmerCutoutTitleEnabled = cutoutTitleEnabled;
    }
    if (!anyHoverCutoutEnabled()) clearHoverCutouts();
    else if (!cutoutTitleEnabled) hoverTitleStrip = null;
    scheduleDraw();
  }

  function setDimmerCutoutOptions(opts = {}) {
    if (opts && typeof opts === "object") {
      if (typeof opts.slider === "boolean") cutoutSliderEnabled = opts.slider;
      if (typeof opts.module === "boolean") cutoutModuleEnabled = opts.module;
      if (typeof opts.title === "boolean") cutoutTitleEnabled = opts.title;
      if (typeof opts.mouse === "boolean") cutoutMouseEnabled = opts.mouse;
      if (Number.isFinite(Number(opts.mouseSize))) {
        mouseSizeCss = Math.max(8, Math.min(240, Number(opts.mouseSize)));
      }
      if (Number.isFinite(Number(opts.mouseSoftness))) {
        mouseSoftness01 = Math.max(0, Math.min(100, Number(opts.mouseSoftness))) / 100;
      }
      if (Number.isFinite(Number(opts.mouseShape))) {
        mouseShape01 = Math.max(0, Math.min(100, Number(opts.mouseShape))) / 100;
      }
    }
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      nodeGraphMvp.dimmerCutoutSliderEnabled = cutoutSliderEnabled;
      nodeGraphMvp.dimmerCutoutModuleEnabled = cutoutModuleEnabled;
      nodeGraphMvp.dimmerCutoutTitleEnabled = cutoutTitleEnabled;
      nodeGraphMvp.dimmerCutoutMouseEnabled = cutoutMouseEnabled;
      nodeGraphMvp.dimmerMouseSize = mouseSizeCss;
      nodeGraphMvp.dimmerMouseSoftness = Math.round(mouseSoftness01 * 100);
      nodeGraphMvp.dimmerMouseShape = Math.round(mouseShape01 * 100);
      // Keep legacy mirrors for older UI Dev code paths.
      nodeGraphMvp.hoverModuleDimmerCutoutEnabled = cutoutSliderEnabled || cutoutMouseEnabled;
      nodeGraphMvp.hoverModuleTitleDimmerCutoutEnabled = cutoutTitleEnabled;
    }
    if (!anyHoverCutoutEnabled()) clearHoverCutouts();
    scheduleDraw();
    if (typeof scheduleNodeGraphGridHeatmapUpdate === "function") {
      scheduleNodeGraphGridHeatmapUpdate();
    }
  }

  function bind() {
    load();
    bindButton();
    bindHoverCutout();
    syncButton();
    applyHoverCutoutFlagsFromMvp();
    if (state.dim > 0.0005) scheduleDraw();
    if (typeof scheduleNodeGraphGridHeatmapUpdate === "function") {
      scheduleNodeGraphGridHeatmapUpdate();
    }
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
  window.setNodeGraphHoverModuleTitleDimmerCutoutEnabled = setHoverModuleTitleDimmerCutoutEnabled;
  window.setNodeGraphDimmerCutoutOptions = setDimmerCutoutOptions;

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
