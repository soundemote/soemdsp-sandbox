// Shared WebGL presenter for cheap one-cycle line + phase-dot faces.
// Screen-space thick polylines and circular dots. Not phosphor, trace, or waterfall.
// Coordinates are CSS pixels, origin top-left, y down (same as the old 2d faces).

const NODE_GRAPH_CYCLE_LINE_GL_LINE_VS = `
attribute vec2 aPos;
attribute float aSide;
attribute float aCore;
attribute vec4 aColor;
uniform vec2 uCss;
varying float vSide;
varying float vCore;
varying vec4 vColor;
void main() {
  vec2 clip = (aPos / uCss) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vSide = aSide;
  vCore = aCore;
  vColor = aColor;
}
`;

const NODE_GRAPH_CYCLE_LINE_GL_LINE_FS = `
precision mediump float;
varying float vSide;
varying float vCore;
varying vec4 vColor;
void main() {
  float d = abs(vSide);
  float alpha = 1.0 - smoothstep(vCore, 1.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
}
`;

const NODE_GRAPH_CYCLE_LINE_GL_DOT_VS = `
attribute vec2 aCenter;
attribute vec2 aLocal;
attribute float aRadius;
attribute vec4 aColor;
uniform vec2 uCss;
varying vec2 vLocal;
varying float vRadius;
varying vec4 vColor;
void main() {
  vec2 p = aCenter + aLocal * aRadius;
  vec2 clip = (p / uCss) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vLocal = aLocal;
  vRadius = aRadius;
  vColor = aColor;
}
`;

const NODE_GRAPH_CYCLE_LINE_GL_DOT_FS = `
precision mediump float;
varying vec2 vLocal;
varying float vRadius;
varying vec4 vColor;
void main() {
  float r = length(vLocal);
  float aa = 0.75 / max(vRadius, 0.75);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
}
`;

function nodeGraphCycleLineGlParseColor(value) {
  const s = String(value || "").trim();
  if (s.charAt(0) === "#") {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((ch) => ch + ch).join("");
    }
    if (hex.length === 6) {
      const n = Number.parseInt(hex, 16);
      if (Number.isFinite(n)) {
        return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1];
      }
    }
  }
  const match = s.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(",").map((part) => Number(part.trim()));
    return [
      (Number.isFinite(parts[0]) ? parts[0] : 0) / 255,
      (Number.isFinite(parts[1]) ? parts[1] : 0) / 255,
      (Number.isFinite(parts[2]) ? parts[2] : 0) / 255,
      parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1,
    ];
  }
  return [1, 1, 1, 1];
}

function nodeGraphCycleLineGlShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "cycle line shader");
  }
  return shader;
}

function nodeGraphCycleLineGlProgram(gl, vsSource, fsSource) {
  const program = gl.createProgram();
  const vs = nodeGraphCycleLineGlShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = nodeGraphCycleLineGlShader(gl, gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || "cycle line program");
  }
  return program;
}

function nodeGraphCycleLineGlContext(canvas) {
  if (!canvas) return null;
  if (canvas.__cycleLineGl && canvas.__cycleLineGl.gl && !canvas.__cycleLineGl.gl.isContextLost()) {
    return canvas.__cycleLineGl;
  }
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  }) || canvas.getContext("experimental-webgl", {
    alpha: false,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  let lineProgram;
  let dotProgram;
  try {
    lineProgram = nodeGraphCycleLineGlProgram(gl, NODE_GRAPH_CYCLE_LINE_GL_LINE_VS, NODE_GRAPH_CYCLE_LINE_GL_LINE_FS);
    dotProgram = nodeGraphCycleLineGlProgram(gl, NODE_GRAPH_CYCLE_LINE_GL_DOT_VS, NODE_GRAPH_CYCLE_LINE_GL_DOT_FS);
  } catch (error) {
    console.warn("[cycle-line-gl] program failed", error);
    return null;
  }
  const state = {
    gl,
    lineProgram,
    dotProgram,
    lineBuf: gl.createBuffer(),
    dotBuf: gl.createBuffer(),
    lineVerts: 0,
    dotVerts: 0,
    waveKey: "",
    lineLoc: {
      pos: gl.getAttribLocation(lineProgram, "aPos"),
      side: gl.getAttribLocation(lineProgram, "aSide"),
      core: gl.getAttribLocation(lineProgram, "aCore"),
      color: gl.getAttribLocation(lineProgram, "aColor"),
      css: gl.getUniformLocation(lineProgram, "uCss"),
    },
    dotLoc: {
      center: gl.getAttribLocation(dotProgram, "aCenter"),
      local: gl.getAttribLocation(dotProgram, "aLocal"),
      radius: gl.getAttribLocation(dotProgram, "aRadius"),
      color: gl.getAttribLocation(dotProgram, "aColor"),
      css: gl.getUniformLocation(dotProgram, "uCss"),
    },
  };
  canvas.__cycleLineGl = state;
  return state;
}

function nodeGraphCycleLineGlMetrics(section, canvas, pixelDensity) {
  if (!section || !canvas) return null;
  const density = typeof nodeGraphResolveDisplayPixelDensity === "function"
    ? nodeGraphResolveDisplayPixelDensity(pixelDensity)
    : (Number.isFinite(Number(pixelDensity)) && Number(pixelDensity) > 0 ? Number(pixelDensity) : 1);
  const face = typeof ensureFaceMetrics === "function"
    ? ensureFaceMetrics(section, { observe: true })
    : null;
  let cssWidth;
  let cssHeight;
  let devicePixelRatio;
  if (face) {
    cssWidth = Math.max(1, face.cssW);
    cssHeight = Math.max(1, face.cssH);
    devicePixelRatio = Math.max(1, face.dpr || window.devicePixelRatio || 1);
  } else {
    devicePixelRatio = window.devicePixelRatio || 1;
    cssWidth = Math.max(1, Number(section.clientWidth || section.offsetWidth || 0));
    cssHeight = Math.max(1, Number(section.clientHeight || section.offsetHeight || 0));
  }
  const width = Math.max(1, Math.round(Math.round(cssWidth * devicePixelRatio) * Math.max(density, 1e-6)));
  const height = Math.max(1, Math.round(Math.round(cssHeight * devicePixelRatio) * Math.max(density, 1e-6)));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering === "pixelated") {
    canvas.style.imageRendering = "";
  }
  const state = nodeGraphCycleLineGlContext(canvas);
  if (!state) return null;
  return {
    cssWidth,
    cssHeight,
    pixelRatio: devicePixelRatio * Math.max(density, 1e-6),
    width,
    height,
  };
}

function nodeGraphCycleLineGlBlurTaps(blur) {
  const spread = Math.max(0, Number(blur) || 0);
  if (!(spread > 0.02)) {
    return [{ x: 0, y: 0, w: 1 }];
  }
  const taps = [
    { x: 0, y: 0, w: 1 },
    { x: spread, y: 0, w: 0.5 },
    { x: -spread, y: 0, w: 0.5 },
    { x: 0, y: spread, w: 0.5 },
    { x: 0, y: -spread, w: 0.5 },
    { x: spread * 0.707, y: spread * 0.707, w: 0.25 },
    { x: -spread * 0.707, y: spread * 0.707, w: 0.25 },
    { x: spread * 0.707, y: -spread * 0.707, w: 0.25 },
    { x: -spread * 0.707, y: -spread * 0.707, w: 0.25 },
  ];
  let sum = 0;
  for (let i = 0; i < taps.length; i += 1) sum += taps[i].w;
  return taps.map((tap) => ({ x: tap.x, y: tap.y, w: tap.w / sum }));
}

function nodeGraphCycleLineGlStrips(points) {
  const strips = [];
  let current = [];
  const list = Array.isArray(points) ? points : [];
  for (let i = 0; i < list.length; i += 1) {
    const point = list[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      if (current.length) strips.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length) strips.push(current);
  return strips;
}

function nodeGraphCycleLineGlBuildLines(lines) {
  const chunks = [];
  let count = 0;
  const list = Array.isArray(lines) ? lines : [];
  for (let i = 0; i < list.length; i += 1) {
    const line = list[i] || {};
    const rgba = nodeGraphCycleLineGlParseColor(line.color);
    const width = Math.max(0.25, Number(line.width) || 1);
    const half = width * 0.5;
    const expand = half + 0.75;
    const core = half / expand;
    const taps = nodeGraphCycleLineGlBlurTaps(line.blur);
    const strips = nodeGraphCycleLineGlStrips(line.points);
    for (let s = 0; s < strips.length; s += 1) {
      const strip = strips[s];
      for (let p = 1; p < strip.length; p += 1) {
        const p0 = strip[p - 1];
        const p1 = strip[p];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (!(len > 1e-4)) continue;
        const inv = 1 / len;
        const dirX = dx * inv;
        const dirY = dy * inv;
        const nx = -dirY;
        const ny = dirX;
        for (let t = 0; t < taps.length; t += 1) {
          const tap = taps[t];
          const ox = tap.x;
          const oy = tap.y;
          const ax = p0.x + ox - dirX * half;
          const ay = p0.y + oy - dirY * half;
          const bx = p1.x + ox + dirX * half;
          const by = p1.y + oy + dirY * half;
          const color = [rgba[0], rgba[1], rgba[2], rgba[3] * tap.w];
          const corners = [
            [ax + nx * expand, ay + ny * expand, 1],
            [ax - nx * expand, ay - ny * expand, -1],
            [bx + nx * expand, by + ny * expand, 1],
            [ax - nx * expand, ay - ny * expand, -1],
            [bx - nx * expand, by - ny * expand, -1],
            [bx + nx * expand, by + ny * expand, 1],
          ];
          for (let c = 0; c < corners.length; c += 1) {
            const corner = corners[c];
            chunks.push(
              corner[0], corner[1], corner[2], core,
              color[0], color[1], color[2], color[3],
            );
            count += 1;
          }
        }
      }
    }
  }
  return { data: new Float32Array(chunks), count };
}

function nodeGraphCycleLineGlBuildDots(dots) {
  const chunks = [];
  let count = 0;
  const list = Array.isArray(dots) ? dots : [];
  const locals = [
    [-1, -1], [1, -1], [1, 1],
    [-1, -1], [1, 1], [-1, 1],
  ];
  for (let i = 0; i < list.length; i += 1) {
    const dot = list[i];
    if (!dot || !Number.isFinite(dot.x) || !Number.isFinite(dot.y)) continue;
    const radius = Math.max(0.5, Number(dot.radius) || 0.5);
    const rgba = nodeGraphCycleLineGlParseColor(dot.color);
    for (let v = 0; v < locals.length; v += 1) {
      const local = locals[v];
      chunks.push(dot.x, dot.y, local[0], local[1], radius, rgba[0], rgba[1], rgba[2], rgba[3]);
      count += 1;
    }
  }
  return { data: new Float32Array(chunks), count };
}

function nodeGraphCycleLineGlDraw(canvas, state, cssWidth, cssHeight, background, dots) {
  const gl = state.gl;
  const bg = nodeGraphCycleLineGlParseColor(background || "#020609");
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (state.lineVerts > 0) {
    const loc = state.lineLoc;
    gl.useProgram(state.lineProgram);
    gl.uniform2f(loc.css, cssWidth, cssHeight);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.lineBuf);
    const stride = 8 * 4;
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(loc.side);
    gl.vertexAttribPointer(loc.side, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(loc.core);
    gl.vertexAttribPointer(loc.core, 1, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(loc.color);
    gl.vertexAttribPointer(loc.color, 4, gl.FLOAT, false, stride, 16);
    gl.drawArrays(gl.TRIANGLES, 0, state.lineVerts);
  }
  const builtDots = nodeGraphCycleLineGlBuildDots(dots);
  state.dotVerts = builtDots.count;
  if (builtDots.count > 0) {
    const loc = state.dotLoc;
    gl.useProgram(state.dotProgram);
    gl.uniform2f(loc.css, cssWidth, cssHeight);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.dotBuf);
    gl.bufferData(gl.ARRAY_BUFFER, builtDots.data, gl.DYNAMIC_DRAW);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(loc.center);
    gl.vertexAttribPointer(loc.center, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(loc.local);
    gl.vertexAttribPointer(loc.local, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(loc.radius);
    gl.vertexAttribPointer(loc.radius, 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(loc.color);
    gl.vertexAttribPointer(loc.color, 4, gl.FLOAT, false, stride, 20);
    gl.drawArrays(gl.TRIANGLES, 0, builtDots.count);
  }
}

function nodeGraphCycleLineGlPresent(canvas, frame = {}) {
  const state = canvas && canvas.__cycleLineGl;
  if (!state || !state.gl || state.gl.isContextLost()) return false;
  const cssWidth = Math.max(1, Number(frame.cssWidth) || 1);
  const cssHeight = Math.max(1, Number(frame.cssHeight) || 1);
  const waveKey = `${frame.waveKey || ""}|${canvas.width}x${canvas.height}`;
  if (state.waveKey !== waveKey) {
    const built = nodeGraphCycleLineGlBuildLines(frame.lines);
    state.gl.bindBuffer(state.gl.ARRAY_BUFFER, state.lineBuf);
    state.gl.bufferData(state.gl.ARRAY_BUFFER, built.data, state.gl.DYNAMIC_DRAW);
    state.lineVerts = built.count;
    state.waveKey = waveKey;
  }
  nodeGraphCycleLineGlDraw(canvas, state, cssWidth, cssHeight, frame.background, frame.dots);
  return true;
}
