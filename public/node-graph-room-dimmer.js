// Room light — full-UI screenspace dim veil with rect light punches.
//
// Lightbulb control drag = room light (up brighter / down darker).
// Internal dim is 0 = full light / no veil, 1 = pure black outside holes.
// Button icons crossfade lightbulb-on → lightbulb-off with dim.
// Covers the whole app chrome (top toolbar + bottom resource bar + workspace).
// At 100% the room is blacked out; painted displays stay lit (rect punches) and
// the dimmer button stays punched/stacked above the veil so you can drag back.
//
// Two lights only:
//   1. Module lamps — CSS heatmap (fades 0.5…1).
//   2. Screen glow  — veil holes on painted canvases (0.5…1, sim on).
// 0…0.5: clip the veil off the workspace (CSS). Graph stays on heatmap.
// 0.5…1: fade a CSS-pixel workspace hole (1−deep) so lamps do not pop.
//         Same client→UV path as screens — no buffer snap (that box drifted).
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
  const MAX_RECTS = 128;
  const SHADER_REV = 15;
  // Inset punch by this many CSS px so 1px borders / AA don't open chrome.
  const PUNCH_INSET_CSS = 1.25;

  const SCREEN_SELECTOR = [
    "canvas.node-phosphor-waveform-canvas",
    "canvas.node-module-scope-local-fallback-canvas",
    "canvas.node-xy-pad-canvas",
    "canvas.node-number-readout-canvas",
    "canvas.node-asciiscope-canvas",
    "canvas.node-matrix-display-canvas",
    "canvas.node-filter-curve-canvas",
    "canvas.node-raster-rgb-canvas",
    ".node-keypad-face",
    ".node-text-box-body",
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
uniform vec2 uCanvasPx;
uniform int uRectCount;
uniform vec4 uRect[${MAX_RECTS}];
uniform float uRectStr[${MAX_RECTS}];
// Soft edge / corner radius in CSS pixels (isotropic). 0 ≈ 0.6px AA.
uniform float uRectSoft[${MAX_RECTS}];
uniform float uRectRound[${MAX_RECTS}];

varying vec2 vUv;

// Rounded box SDF in CSS-pixel space (r = xy min, zw size in UV).
float roundedBoxSdfPx(vec2 pPx, vec4 rUv, float rrPx) {
  vec2 scale = max(uCanvasPx, vec2(1.0));
  vec4 r = vec4(rUv.xy * scale, rUv.zw * scale);
  vec2 c = r.xy + r.zw * 0.5;
  vec2 h = max(r.zw * 0.5, vec2(1e-4));
  float rad = clamp(rrPx, 0.0, min(h.x, h.y));
  vec2 q = abs(pPx - c) - h + vec2(rad);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

void main() {
  // Dim is a true 0…1 gain: 0 = no veil, 1 = pure black outside holes.
  float veil = clamp(uDim, 0.0, 1.0);
  vec2 pPx = vUv * max(uCanvasPx, vec2(1.0));

  // open = 1 → full hole (nothing of the veil over this pixel).
  float open = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uRectCount) break;
    float s = clamp(uRectStr[i], 0.0, 1.0);
    if (s < 0.001) continue;
    float d = roundedBoxSdfPx(pPx, uRect[i], uRectRound[i]);
    float soft = uRectSoft[i];
    float inside;
    if (soft < 0.0) {
      // Screen: fully open on the glass (d<=0). Smoothstep *outward* only.
      float bloom = max(-soft, 1.0);
      float t = clamp(max(d, 0.0) / bloom, 0.0, 1.0);
      float s1 = t * t * (3.0 - 2.0 * t);
      float fall = 1.0 - s1 * s1;
      float core = 1.0 - smoothstep(-0.6, 0.6, d);
      inside = max(core, fall);
    } else {
      float feather = max(soft, 0.6);
      inside = 1.0 - smoothstep(-feather, feather, d);
    }
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

  /** 0 below half-dim; 1 at full black. Second-stage mix. */
  function dimDeep(dim = state.dim) {
    const d = clampDim(dim);
    return d <= 0.5 ? 0 : Math.min(1, (d - 0.5) * 2);
  }

  function simulationOn() {
    if (typeof nodeGraphLiveEngineIsUp === "function") {
      return Boolean(nodeGraphLiveEngineIsUp());
    }
    const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.live : null;
    return Boolean(live && live.outputEnabled && live.node);
  }

  function moduleLightSpread() {
    const ws = workspace();
    if (!ws) return 0.78;
    const raw = Number.parseFloat(
      ws.style.getPropertyValue("--node-module-light-spread")
      || getComputedStyle(ws).getPropertyValue("--node-module-light-spread")
      || "",
    );
    return Number.isFinite(raw) ? Math.max(0.4, Math.min(2.2, raw)) : 0.78;
  }

  function punchCornerRadiusPx(el, boxW, boxH) {
    if (!el) {
      return 0;
    }
    const cs = getComputedStyle(el);
    const raw = String(cs.borderTopLeftRadius || "").trim();
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return 0;
    }
    const short = Math.max(1, Math.min(Number(boxW) || 0, Number(boxH) || 0));
    const px = raw.endsWith("%") ? (n / 100) * short : n;
    return Math.max(0, Math.min(short * 0.5, px));
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

  /** 0…0.5: veil paints chrome only. Never a shader hole the size of the graph. */
  function clipVeilOffWorkspace(canvas, offWorkspace) {
    if (!canvas) return;
    if (!offWorkspace) {
      canvas.style.clipPath = "";
      return;
    }
    const ws = workspace();
    const cr = canvas.getBoundingClientRect();
    const wr = ws?.getBoundingClientRect();
    if (!wr || !(cr.width > 0) || !(cr.height > 0)) {
      canvas.style.clipPath = "";
      return;
    }
    const l = wr.left - cr.left;
    const t = wr.top - cr.top;
    const r = wr.right - cr.left;
    const b = wr.bottom - cr.top;
    const w = cr.width;
    const h = cr.height;
    canvas.style.clipPath = `polygon(evenodd, 0px 0px, ${w}px 0px, ${w}px ${h}px, 0px ${h}px, 0px 0px, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px, ${l}px ${t}px)`;
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
      uCanvasPx: gl.getUniformLocation(prog, "uCanvasPx"),
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
    // Walk up for strength. Prefer the first *positive* strength so a wiped
    // child canvas with data-light-strength="0" does not permanently veil a
    // still-lit Value LCD/LED face (pause→stop zeroed the canvas only;
    // digits painted but room dimmer punched strength 0 = invisible).
    let node = el;
    let zeroSeen = false;
    for (let i = 0; i < 6 && node; i += 1) {
      const raw = node.dataset?.lightStrength;
      if (raw != null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          if (n > 0.001) {
            return clamp01(n);
          }
          zeroSeen = true;
        }
      }
      node = node.parentElement;
    }
    // Explicit 0 with no lit ancestor (e.g. unlit LED lamp) stays closed.
    if (zeroSeen) {
      return 0;
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
    if (el.matches?.("canvas.node-raster-rgb-canvas")) return el;
    if (el.matches?.("canvas.node-module-scope-local-fallback-canvas")) return el;
    if (el.matches?.("canvas.node-xy-pad-canvas")) return el;
    if (el.matches?.("canvas.node-number-readout-canvas")) return el;
    if (el.matches?.("canvas.node-asciiscope-canvas")) return el;
    if (el.matches?.("canvas.node-matrix-display-canvas")) return el;
    if (el.matches?.("canvas.node-filter-curve-canvas")) return el;
    if (el.matches?.(".node-keypad-face")) return el;
    if (el.matches?.(".node-led-lamp")) return el;

    // Outer shells: only if no painted canvas is already the target.
    const painted = el.querySelector?.(
      "canvas.node-raster-rgb-canvas, canvas.node-module-scope-local-fallback-canvas, canvas.node-phosphor-waveform-canvas, canvas.node-xy-pad-canvas, canvas.node-number-readout-canvas, canvas.node-asciiscope-canvas, canvas.node-matrix-display-canvas, canvas.node-filter-curve-canvas, .node-keypad-face, .node-led-lamp",
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

  function pushRectLight(el, canvasRect, canvas, seen, rects, strengths, softs, rounds, opts = {}) {
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
        ".node-module-scope-window, .node-xy-pad, .node-number-readout-face, .node-knob-face, .node-ray-bouncer-face, .node-phosphor-waveform-display, .node-text-box-body, [data-light-source], .node-light-source",
      )
    ) {
      // Still mark shell seen so generic selectors don't double-add.
      seen.add(el);
    }

    seen.add(punchEl);
    seen.add(el);

    const scale = opts.strengthScale == null ? 1 : opts.strengthScale;
    // Keypad plate = LCD-style partial hole (50%), not a full phosphor punch.
    const str = punchEl.matches?.(".node-keypad-face")
      ? 0.5 * scale
      : lightStrength(punchEl) * scale;
    if (str < 0.001) return;

    const r = punchEl.getBoundingClientRect();
    if (r.width < 1.5 || r.height < 1.5) return;

    const cr = canvasRect;
    const cssW = Math.max(1e-6, cr.width);
    const cssH = Math.max(1e-6, cr.height);
    const screenSoft = Number(opts.screenSoft) || 0;
    const glowOn = screenSoft > 0 && simulationOn();
    // Client → UV, no buffer-pixel snap (that drifted under CSS zoom).
    let left = Number(r.left) - cr.left;
    let top = Number(r.top) - cr.top;
    let right = Number(r.right) - cr.left;
    let bottom = Number(r.bottom) - cr.top;
    if (screenSoft > 0) {
      left -= 0.5;
      top -= 0.5;
      right += 0.5;
      bottom += 0.5;
    } else {
      const inset = PUNCH_INSET_CSS;
      left += inset;
      top += inset;
      right -= inset;
      bottom -= inset;
      if (right <= left + 1 || bottom <= top + 1) {
        left = Number(r.left) - cr.left;
        top = Number(r.top) - cr.top;
        right = Number(r.right) - cr.left;
        bottom = Number(r.bottom) - cr.top;
      }
    }
    if (right <= left || bottom <= top) return;

    const x = left / cssW;
    const y = (cssH - bottom) / cssH;
    const w = (right - left) / cssW;
    const h = (bottom - top) / cssH;
    const bloomCss = glowOn
      ? Math.max(28, Math.min(52, 24 + 20 * (moduleLightSpread() - 0.4))) * screenSoft
      : 0;
    const soft = glowOn ? -bloomCss : 0;
    const round = punchCornerRadiusPx(punchEl, r.width, r.height);
    pushRectArrays(rects, strengths, softs, rounds, x, y, w, h, str, soft, round);
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

  /** Workspace open in CSS pixels (same UV as screen punches). No buffer snap. */
  function pushWorkspaceOpen(canvasRect, canvas, rects, strengths, softs, rounds, strength) {
    const ws = workspace();
    const str = clamp01(strength);
    if (!ws || !canvas || str < 0.001 || rects.length >= MAX_RECTS) return;
    const wr = ws.getBoundingClientRect();
    const cr = canvasRect;
    const cssW = Math.max(1e-6, cr.width);
    const cssH = Math.max(1e-6, cr.height);
    const left = Number(wr.left) - cr.left;
    const top = Number(wr.top) - cr.top;
    const right = Number(wr.right) - cr.left;
    const bottom = Number(wr.bottom) - cr.top;
    if (right <= left || bottom <= top) return;
    pushRectArrays(
      rects,
      strengths,
      softs,
      rounds,
      left / cssW,
      (cssH - bottom) / cssH,
      (right - left) / cssW,
      (bottom - top) / cssH,
      str,
      0,
      0,
    );
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
    const deep = dimDeep();
    // 0…0.5: clip handles this (no shader hole). 0.5…1: fade the hole so
    // the veil eases onto the plates with the heatmap lamps (no 0.5 pop).
    if (deep > 0) {
      pushWorkspaceOpen(canvasRect, canvas, rects, rectStr, rectSoft, rectRound, 1 - deep);
      for (const el of document.querySelectorAll(SCREEN_SELECTOR)) {
        if (rects.length >= MAX_RECTS) break;
        if (!el.closest?.("#nodeGraphWorkspace")) continue;
        pushRectLight(el, canvasRect, canvas, seen, rects, rectStr, rectSoft, rectRound, {
          screenSoft: deep,
        });
      }
    }

    // Punch the dimmer + magnifier pair so both stay usable at full black.
    const punch = document.querySelector(".node-room-tool-pair") || buttonEl();
    if (punch && rects.length < MAX_RECTS) {
      const prev = punch.dataset?.lightStrength;
      if (punch.dataset) {
        punch.dataset.lightStrength = "1";
      }
      pushRectLight(punch, canvasRect, canvas, seen, rects, rectStr, rectSoft, rectRound);
      if (punch.dataset) {
        if (prev == null || prev === "") {
          delete punch.dataset.lightStrength;
        } else {
          punch.dataset.lightStrength = prev;
        }
      }
    }

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
        mouseOpts.softUv * cssW,
        mouseOpts.roundUv * cssW,
      );
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
      clipVeilOffWorkspace(canvas, false);
      clearCanvas();
      return;
    }

    setVeilActive(true);
    clipVeilOffWorkspace(canvas, dimDeep(dim) <= 0);
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

    const cr = canvas.getBoundingClientRect();
    gl.uniform1f(locs.uDim, dim);
    if (locs.uCanvasPx) {
      gl.uniform2f(locs.uCanvasPx, Math.max(1, cr.width || canvas.width), Math.max(1, cr.height || canvas.height));
    }
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
    const deep = dimDeep(dim);
    btn.style.setProperty("--room-dim", String(dim));
    btn.style.setProperty("--room-dim-deep", String(deep));
    workspace()?.style.setProperty("--room-dim", String(dim));
    workspace()?.style.setProperty("--room-dim-deep", String(deep));
    veilHost()?.style?.setProperty?.("--room-dim", String(dim));
    veilHost()?.style?.setProperty?.("--room-dim-deep", String(deep));
    const lightPct = 100 - pct;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-valuenow", String(lightPct));
    btn.setAttribute("aria-valuemin", "0");
    btn.setAttribute("aria-valuemax", "100");
    btn.setAttribute(
      "aria-valuetext",
      lightPct >= 100
        ? "Room light full on"
        : lightPct <= 0
          ? "Room dark; displays stay lit"
          : `Room ${lightPct} percent light; displays stay lit`,
    );
    btn.title = on
      ? `Room ${lightPct}% light · drag up brighter, down darker (displays stay lit)`
      : "Room light · drag up to brighten, down to darken (displays stay lit)";
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
      setDim(state.drag.d0 - dy / 140, { persist: false });
    });
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("keydown", (event) => {
      const d = clampDim(state.dim);
      if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        event.preventDefault();
        setDim(d - 0.05);
      } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        event.preventDefault();
        setDim(d + 0.05);
      } else if (event.key === "Home") {
        event.preventDefault();
        setDim(1);
      } else if (event.key === "End") {
        event.preventDefault();
        setDim(0);
      }
    });
  }

  let cutoutMouseEnabled = false;
  let mouseSizeCss = HOVER_CURSOR_CUTOUT_CSS_DEFAULT;
  let mouseSoftness01 = 0.25;
  let mouseShape01 = 0;
  /** @type {{ x: number, y: number } | null} */
  let hoverPointer = null;

  function mvpNumber(key, fallback, min, max) {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      const n = Number(nodeGraphMvp[key]);
      if (Number.isFinite(n)) {
        return Math.max(min, Math.min(max, n));
      }
    }
    return fallback;
  }

  function isMouseCutoutEnabled() {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp
      && typeof nodeGraphMvp.dimmerCutoutMouseEnabled === "boolean") {
      return nodeGraphMvp.dimmerCutoutMouseEnabled;
    }
    return cutoutMouseEnabled;
  }

  /**
   * Mouse cutout size (CSS px), softness (UV feather), corner radius (UV).
   * Shape 0 = square, ~0.5 = squircle, 1 = circle.
   */
  function readMouseCutoutOptions(cssW, canvasW) {
    const zoom = typeof nodeGraphZoom === "function"
      ? nodeGraphZoom()
      : (Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.zoom : 1) || 1);
    const sizeCss = mvpNumber("dimmerMouseSize", mouseSizeCss, 8, 240) * Math.max(0.05, zoom);
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
  }

  function updateHoverFromEvent(event) {
    if (!isMouseCutoutEnabled()) {
      clearHoverCutouts();
      return;
    }
    if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    hoverPointer = { x: event.clientX, y: event.clientY };
  }

  function bindHoverCutout() {
    const ws = document.getElementById("nodeGraphWorkspace");
    if (!ws || ws.dataset.roomDimmerHoverBound === "1") return;
    ws.dataset.roomDimmerHoverBound = "1";
    ws.addEventListener("pointermove", (event) => {
      if (!isMouseCutoutEnabled()) return;
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
    if (typeof nodeGraphMvp.dimmerCutoutMouseEnabled === "boolean") {
      cutoutMouseEnabled = nodeGraphMvp.dimmerCutoutMouseEnabled;
    }
    const size = Number(nodeGraphMvp.dimmerMouseSize);
    if (Number.isFinite(size)) mouseSizeCss = Math.max(8, Math.min(240, size));
    const soft = Number(nodeGraphMvp.dimmerMouseSoftness);
    if (Number.isFinite(soft)) mouseSoftness01 = Math.max(0, Math.min(100, soft)) / 100;
    const shape = Number(nodeGraphMvp.dimmerMouseShape);
    if (Number.isFinite(shape)) mouseShape01 = Math.max(0, Math.min(100, shape)) / 100;
  }

  function setDimmerCutoutOptions(opts = {}) {
    if (opts && typeof opts === "object") {
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
      nodeGraphMvp.dimmerCutoutMouseEnabled = cutoutMouseEnabled;
      nodeGraphMvp.dimmerMouseSize = mouseSizeCss;
      nodeGraphMvp.dimmerMouseSoftness = Math.round(mouseSoftness01 * 100);
      nodeGraphMvp.dimmerMouseShape = Math.round(mouseShape01 * 100);
    }
    if (!isMouseCutoutEnabled()) clearHoverCutouts();
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
  window.nodeGraphRoomDimDeep = () => dimDeep();
  window.nodeGraphRoomDimMax = () => 1;
  window.nodeGraphRoomDimScreenSelector = () => SCREEN_SELECTOR;
  window.bindNodeGraphRoomDimmer = bind;
  window.setNodeGraphLightStrength = setLightStrength;
  window.scheduleNodeGraphRoomDimmerDraw = scheduleDraw;
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

/**
 * Light-button-style vertical fill slider (magnifier zoom, mouse smoother).
 * Drag 140px = full range. options: { min, max, get, set, format }.
 */
function bindNodeGraphToolbarFillSlider(button, options = {}) {
  if (!(button instanceof HTMLElement) || button.dataset.toolbarFillSliderBound === "true") {
    return;
  }
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 1;
  const span = max - min || 1;
  const get = typeof options.get === "function" ? options.get : () => min;
  const set = typeof options.set === "function" ? options.set : () => {};
  const format = typeof options.format === "function"
    ? options.format
    : (value) => String(value);
  const toUnit = (value) => Math.max(0, Math.min(1, (Number(value) - min) / span));
  const fromUnit = (unit) => min + Math.max(0, Math.min(1, Number(unit) || 0)) * span;

  const sync = () => {
    const value = get();
    const unit = toUnit(value);
    const label = format(value);
    button.style.setProperty("--toolbar-fill", String(unit));
    button.style.setProperty("--room-dim", String(unit));
    button.setAttribute("aria-valuenow", String(value));
    button.setAttribute("aria-valuetext", label);
    button.setAttribute("aria-pressed", unit > 0.001 ? "true" : "false");
    const readout = button.querySelector("[data-toolbar-fill-value]");
    if (readout) {
      readout.textContent = label;
    }
    const tip = String(button.getAttribute("data-toolbar-fill-tip") || button.getAttribute("aria-label") || "").trim();
    button.title = tip ? `${tip} · ${label} · drag up/down` : `${label} · drag up/down`;
  };

  button.dataset.toolbarFillSliderBound = "true";
  button.setAttribute("role", "slider");
  button.setAttribute("aria-orientation", "vertical");
  button.setAttribute("aria-valuemin", String(min));
  button.setAttribute("aria-valuemax", String(max));

  let drag = null;
  const end = (event) => {
    if (!drag) {
      return;
    }
    drag = null;
    button.classList.remove("room-dimmer-dragging");
    try {
      button.releasePointerCapture?.(event.pointerId);
    } catch (_error) {
      /* ignore */
    }
    set(get(), { persist: true });
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) {
      return;
    }
    event.preventDefault();
    drag = {
      id: event.pointerId,
      y0: event.clientY,
      u0: toUnit(get()),
    };
    button.classList.add("room-dimmer-dragging");
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      /* ignore */
    }
  });
  button.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    const dy = drag.y0 - event.clientY;
    set(fromUnit(drag.u0 + dy / 140), { persist: false });
  });
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("keydown", (event) => {
    const unit = toUnit(get());
    const step = event.shiftKey ? 0.02 : 0.05;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      set(fromUnit(unit + step), { persist: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      set(fromUnit(unit - step), { persist: true });
    } else if (event.key === "Home") {
      event.preventDefault();
      set(min, { persist: true });
    } else if (event.key === "End") {
      event.preventDefault();
      set(max, { persist: true });
    }
  });
  button._syncToolbarFill = sync;
  sync();
}
