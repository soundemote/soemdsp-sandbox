// Room light — screenspace dim veil with rect light punches.
//
// 💡 drag = room dim. Screens/text = axis-aligned rect lights only.
//
// Policy: cables stay under the veil and dim with the room. Do not re-add
// wire polyline punches, glow underlays, or a second "undimmed" wire layer.
// Coarse path sampling cannot match the SVG cable; faking it is not acceptable.

(() => {
  "use strict";

  const STORAGE_KEY = "soemdsp-sandbox.roomDimmer.v1";
  const MAX_RECTS = 40;
  const SHADER_REV = 4;

  const LIGHT_SELECTOR = [
    "[data-light-source]",
    ".node-light-source",
    ".node-module-scope-window",
    ".node-led-face",
    ".node-xy-pad",
    ".node-number-readout-face",
    ".node-ray-bouncer-face",
    // Music Player face (not a module-scope window)
    ".node-phosphor-waveform-display",
  ].join(", ");
  const TEXT_LIGHT_SELECTOR = [
    ".dsp-node .node-header-title-row",
    ".dsp-node .node-slider-readout-label",
    ".dsp-node .node-slider-readout-value",
    ".dsp-node .node-port-label",
    ".dsp-node .node-io-row > span",
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
uniform float uExposure;
uniform float uAspect; // width/height of canvas (uv x is stretched)

uniform int uRectCount;
uniform vec4 uRect[${MAX_RECTS}];
uniform float uRectStr[${MAX_RECTS}];

varying vec2 vUv;

float rectSdf(vec2 p, vec4 r) {
  vec2 c = r.xy + r.zw * 0.5;
  vec2 h = max(r.zw * 0.5, vec2(1e-4));
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  float dim = clamp(uDim, 0.0, 1.0);
  float veilUser = pow(dim, 0.82);
  float veil = clamp(veilUser * mix(1.0, uExposure, 0.55), 0.0, 1.08);

  float core = 0.0;
  float bloom = 0.0;

  // Screens + text (rects) only — no wire polyline underlay.
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uRectCount) break;
    float s = clamp(uRectStr[i], 0.0, 1.0);
    if (s < 0.008) continue;
    float d = rectSdf(vUv, uRect[i]);
    float solid = 1.0 - smoothstep(-0.001, 0.0025, d);
    float punch = s >= 0.34 ? solid : solid * s * 1.15;
    core = max(core, clamp(punch, 0.0, 1.0));
    float harsh = pow(s, 1.8);
    float fall = mix(70.0, 36.0, harsh);
    bloom = max(bloom, exp(-max(d, 0.0) * fall) * harsh * 0.28);
  }

  bloom = min(bloom, 0.55);
  core = clamp(core, 0.0, 1.0);

  float roomA = clamp(veil * (1.0 - core) * 0.992, 0.0, 0.992);
  float bloomGain = 0.08 + 0.22 * smoothstep(0.15, 0.9, veil);
  vec3 tint = vec3(0.45, 0.85, 0.95);
  vec3 rgb = tint * bloom * bloomGain;

  gl_FragColor = vec4(rgb, roomA);
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

  function workspace() {
    return document.getElementById("nodeGraphWorkspace");
  }

  function canvasEl() {
    return document.getElementById("nodeRoomDimmerCanvas");
  }

  function buttonEl() {
    return document.getElementById("nodeRoomDimmerButton");
  }

  function load() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
      state.dim = clamp01(raw.dim);
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
          JSON.stringify({ v: 2, dim: state.dim }),
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
      uExposure: gl.getUniformLocation(prog, "uExposure"),
      uAspect: gl.getUniformLocation(prog, "uAspect"),
      uRectCount: gl.getUniformLocation(prog, "uRectCount"),
      uRect: Array.from({ length: MAX_RECTS }, (_, i) =>
        gl.getUniformLocation(prog, `uRect[${i}]`)),
      uRectStr: Array.from({ length: MAX_RECTS }, (_, i) =>
        gl.getUniformLocation(prog, `uRectStr[${i}]`)),
    };
    return gl;
  }

  function resizeCanvas(canvas) {
    const host = workspace();
    if (!host || !canvas) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return true;
  }

  function lightStrength(el, kind) {
    const raw = el?.dataset?.lightStrength;
    if (raw != null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return clamp01(n);
    }
    if (kind === "text") return 0.16;
    if (el.classList?.contains("node-led-face") || el.classList?.contains("node-led-lamp")) return 0.88;
    if (el.classList?.contains("node-number-readout-face")) return 0.52;
    if (el.classList?.contains("node-xy-pad")) return 0.68;
    if (el.classList?.contains("node-ray-bouncer-face")) return 0.72;
    if (el.classList?.contains("node-module-scope-window")) return 0.7;
    if (el.classList?.contains("node-phosphor-waveform-display")) return 0.74;
    return 0.65;
  }

  function clientToUv(clientX, clientY, wr, sx, sy, canvas) {
    const x = ((clientX - wr.left) * sx) / canvas.width;
    const y = (canvas.height - ((clientY - wr.top) * sy)) / canvas.height;
    return [
      Math.max(-1, Math.min(2, x)),
      Math.max(-1, Math.min(2, y)),
    ];
  }

  function pushRectLight(el, kind, wr, sx, sy, canvas, seen, rects, strengths, energyRef) {
    if (!el || seen.has(el) || el.offsetParent === null) return;
    if (kind === "screen") {
      const parentLight = el.parentElement?.closest?.(
        "[data-light-source], .node-light-source, .node-module-scope-window, .node-xy-pad, .node-phosphor-waveform-display",
      );
      if (parentLight && parentLight !== el) return;
    }
    if (kind === "text" && el.closest?.(
      "[data-light-source], .node-light-source, .node-module-scope-window, .node-led-face, .node-xy-pad, .node-phosphor-waveform-display",
    )) {
      return;
    }
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;

    const x = ((r.left - wr.left) * sx) / canvas.width;
    const y = (canvas.height - ((r.bottom - wr.top) * sy)) / canvas.height;
    const w = (r.width * sx) / canvas.width;
    const h = (r.height * sy) / canvas.height;
    const str = lightStrength(el, kind);

    rects.push([
      Math.max(-1, Math.min(2, x)),
      Math.max(-1, Math.min(2, y)),
      Math.max(0, Math.min(2, w)),
      Math.max(0, Math.min(2, h)),
    ]);
    strengths.push(str);
    if (kind === "screen") {
      energyRef.v += Math.max(0, w * h) * str;
    }
  }

  function collectLights(canvas) {
    const host = workspace();
    if (!host || !canvas?.width || !canvas?.height) {
      return { rects: [], rectStr: [], exposure: 1 };
    }
    const wr = host.getBoundingClientRect();
    const sx = canvas.width / Math.max(1, wr.width);
    const sy = canvas.height / Math.max(1, wr.height);
    const seen = new Set();
    const rects = [];
    const rectStr = [];
    const energyRef = { v: 0 };

    for (const el of host.querySelectorAll(LIGHT_SELECTOR)) {
      if (rects.length >= MAX_RECTS) break;
      pushRectLight(el, "screen", wr, sx, sy, canvas, seen, rects, rectStr, energyRef);
    }
    for (const el of host.querySelectorAll(TEXT_LIGHT_SELECTOR)) {
      if (rects.length >= MAX_RECTS) break;
      pushRectLight(el, "text", wr, sx, sy, canvas, seen, rects, rectStr, energyRef);
    }

    const e = Math.min(1, energyRef.v / 0.16);
    const exposure = 1 + e * 0.22;

    return {
      rects,
      rectStr,
      exposure,
    };
  }

  function drawFrame() {
    state.raf = 0;
    const dim = clamp01(state.dim);
    const canvas = canvasEl();
    const host = workspace();
    if (!canvas || !host) return;

    if (dim <= 0.0005) {
      host.classList.remove("room-dimmer-on");
      clearCanvas();
      return;
    }

    host.classList.add("room-dimmer-on");
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

    const { rects, rectStr, exposure } = collectLights(canvas);
    const { locs } = state;
    const aspect = canvas.width / Math.max(1, canvas.height);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(state.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    gl.enableVertexAttribArray(locs.aPos);
    gl.vertexAttribPointer(locs.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(locs.uDim, dim);
    gl.uniform1f(locs.uExposure, exposure);
    gl.uniform1f(locs.uAspect, aspect);
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
    if (clamp01(state.dim) <= 0.0005) return;
    state.raf = window.requestAnimationFrame(drawFrame);
  }

  function syncButton() {
    const btn = buttonEl();
    if (!btn) return;
    const dim = clamp01(state.dim);
    const on = dim > 0.0005;
    btn.style.setProperty("--room-dim", String(dim));
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-valuenow", String(Math.round(dim * 100)));
    btn.setAttribute("aria-valuemin", "0");
    btn.setAttribute("aria-valuemax", "100");
    btn.setAttribute("aria-valuetext", `Room dim ${Math.round(dim * 100)} percent`);
    btn.title = on
      ? `Room ${Math.round(dim * 100)}% · drag up/down`
      : "Room light · drag down to darken (screens / wires / text stay lit)";
  }

  function setDim(value, options = {}) {
    state.dim = clamp01(value);
    syncButton();
    if (state.dim > 0.0005) {
      scheduleDraw();
    } else {
      if (state.raf) {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
      workspace()?.classList.remove("room-dimmer-on");
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
        d0: clamp01(state.dim),
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
      const d = clamp01(state.dim);
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

  function bind() {
    load();
    bindButton();
    syncButton();
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
  window.nodeGraphRoomDim = () => clamp01(state.dim);
  window.bindNodeGraphRoomDimmer = bind;
  window.setNodeGraphLightStrength = setLightStrength;

  window.setNodeGraphShaderScriptEnabled = (on) => {
    if (!on) setDim(0);
    else if (clamp01(state.dim) < 0.001) setDim(0.55);
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
