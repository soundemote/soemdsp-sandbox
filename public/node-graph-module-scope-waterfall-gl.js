// Instant Waterfall face. WebGL end to end: history texture, scroll left,
// stamp filled bars on the right. Not a Canvas2D plate with a blur composite.
// Sub-texel time is uniform uSub on the present shader. No blur pass.
// Each bar edge is a 1px box coverage (the pixel the edge actually crosses),
// so fractional Y is not a hard stair. Context antialias does not apply:
// bars are drawn into a texture, not the multisampled default framebuffer.

function nodeGraphWaterfallGlParsePlate(css) {
  const s = String(css || "#000000").trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(s);
  if (rgb) {
    const p = rgb[1].trim().split(/[\s,]+/).map((v) => Number(v));
    return [(p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255];
  }
  return [0, 0, 0];
}

function nodeGraphWaterfallGlCompile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function nodeGraphWaterfallGlProgram(gl, vert, frag) {
  const vs = nodeGraphWaterfallGlCompile(gl, gl.VERTEX_SHADER, vert);
  const fs = nodeGraphWaterfallGlCompile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.bindAttribLocation(prog, 1, "aUv");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function nodeGraphWaterfallGlMakeTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo };
}

function nodeGraphWaterfallGlFilter(gl, tex, linear) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
}

const NODE_GRAPH_WF_GL_VERT = `
attribute vec2 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const NODE_GRAPH_WF_GL_SCROLL = `
precision mediump float;
uniform sampler2D uTex;
uniform float uShiftPx;
uniform vec2 uSize;
uniform vec3 uPlate;
void main() {
  float x = gl_FragCoord.x + uShiftPx;
  if (x >= uSize.x) {
    gl_FragColor = vec4(uPlate, 1.0);
  } else {
    gl_FragColor = texture2D(uTex, vec2(x / uSize.x, gl_FragCoord.y / uSize.y));
  }
}
`;

const NODE_GRAPH_WF_GL_PRESENT = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uSub;
void main() {
  float x = gl_FragCoord.x + uSub;
  gl_FragColor = texture2D(uTex, vec2(x / uSize.x, gl_FragCoord.y / uSize.y));
}
`;

const NODE_GRAPH_WF_GL_BAR = `
precision mediump float;
uniform vec3 uColor;
uniform vec2 uSize;
uniform vec2 uSpan;
uniform vec4 uEdge;
uniform float uBlendKind;
uniform float uMode;
uniform float uStrokePx;
void main() {
  // Canvas Y, top-down. Coverage is the 1px box overlap with the span at
  // this x, so a fractional edge is a partial pixel, not a stair.
  // uMode 0 = solid fill. uMode 1 = stroke along the top and bottom only.
  // Stroke does not draw the vertical ends or a line to the next bar.
  float y = uSize.y - gl_FragCoord.y;
  float span = max(uSpan.y - uSpan.x, 1e-4);
  float t = clamp((gl_FragCoord.x - uSpan.x) / span, 0.0, 1.0);
  float yTop = mix(uEdge.x, uEdge.y, t);
  float yBot = mix(uEdge.z, uEdge.w, t);
  float lo = min(yTop, yBot);
  float hi = max(yTop, yBot);
  float a = max(y - 0.5, lo);
  float b = min(y + 0.5, hi);
  float body = clamp(b - a, 0.0, 1.0);
  float cover = body;
  if (uMode > 0.5) {
    float halfS = max(uStrokePx * 0.5, 0.5);
    float topC = clamp(min(y + 0.5, yTop + halfS) - max(y - 0.5, yTop - halfS), 0.0, 1.0);
    float botC = clamp(min(y + 0.5, yBot + halfS) - max(y - 0.5, yBot - halfS), 0.0, 1.0);
    cover = max(topC, botC);
  }
  if (cover <= 0.0) discard;
  if (uBlendKind > 1.5) {
    gl_FragColor = vec4(mix(vec3(1.0), uColor, cover), 1.0);
  } else if (uBlendKind > 0.5) {
    gl_FragColor = vec4(uColor * cover, 0.0);
  } else {
    gl_FragColor = vec4(uColor * cover, cover);
  }
}
`;

function nodeGraphWaterfallGlEnsure(canvas, plateCss) {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  const w = Math.max(1, canvas.width | 0);
  const h = Math.max(1, canvas.height | 0);
  let s = canvas._wfGlSession;
  if (s && s.gl && s.gl.isContextLost()) s = null;
  if (s && s.w === w && s.h === h && s.gl && s.read) {
    s.plate = nodeGraphWaterfallGlParsePlate(plateCss);
    return s;
  }
  if (s && s.gl && s.read && s.presentProg) {
    s.plate = nodeGraphWaterfallGlParsePlate(plateCss);
    nodeGraphWaterfallGlResizeHistory(s, w, h);
    return s;
  }
  let gl = canvas._wfGl;
  if (!gl || gl.isContextLost()) {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    }) || canvas.getContext("experimental-webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    canvas._wfGl = gl;
  }
  if (!gl) return null;
  const scrollProg = nodeGraphWaterfallGlProgram(gl, NODE_GRAPH_WF_GL_VERT, NODE_GRAPH_WF_GL_SCROLL);
  const presentProg = nodeGraphWaterfallGlProgram(gl, NODE_GRAPH_WF_GL_VERT, NODE_GRAPH_WF_GL_PRESENT);
  const barProg = nodeGraphWaterfallGlProgram(gl, NODE_GRAPH_WF_GL_VERT, NODE_GRAPH_WF_GL_BAR);
  if (!scrollProg || !presentProg || !barProg) return null;
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1,
    -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1, 1,
  ]), gl.STATIC_DRAW);
  const barBuf = gl.createBuffer();
  s = {
    gl,
    w,
    h,
    plate: nodeGraphWaterfallGlParsePlate(plateCss),
    read: nodeGraphWaterfallGlMakeTarget(gl, w, h),
    write: nodeGraphWaterfallGlMakeTarget(gl, w, h),
    scrollProg,
    presentProg,
    barProg,
    quad,
    barBuf,
  };
  canvas._wfGlSession = s;
  nodeGraphWaterfallGlClearRead(s);
  return s;
}

function nodeGraphWaterfallGlDropTarget(gl, target) {
  if (!gl || !target) return;
  if (target.tex) gl.deleteTexture(target.tex);
  if (target.fbo) gl.deleteFramebuffer(target.fbo);
}

// Stretch the existing history into a new texture size. A failed copy keeps
// the old texture. An empty plate is only for a session that has no history yet.
function nodeGraphWaterfallGlResizeHistory(s, w, h) {
  if (!s?.gl || !s.read?.tex || !s.presentProg) return false;
  if (s.w === w && s.h === h) return true;
  const gl = s.gl;
  const nextRead = nodeGraphWaterfallGlMakeTarget(gl, w, h);
  const nextWrite = nodeGraphWaterfallGlMakeTarget(gl, w, h);
  const oldRead = s.read;
  const oldWrite = s.write;
  const oldW = s.w;
  const oldH = s.h;
  s.read = nextRead;
  s.write = nextWrite;
  s.w = w;
  s.h = h;
  gl.bindFramebuffer(gl.FRAMEBUFFER, nextRead.fbo);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  if (!complete || !nodeGraphWaterfallGlCopyHistory(s, oldRead.tex)) {
    nodeGraphWaterfallGlDropTarget(gl, nextRead);
    nodeGraphWaterfallGlDropTarget(gl, nextWrite);
    s.read = oldRead;
    s.write = oldWrite;
    s.w = oldW;
    s.h = oldH;
    return false;
  }
  nodeGraphWaterfallGlDropTarget(gl, oldRead);
  nodeGraphWaterfallGlDropTarget(gl, oldWrite);
  return true;
}

function nodeGraphWaterfallGlCopyHistory(s, srcTex) {
  const gl = s.gl;
  if (!srcTex) return false;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.read.fbo);
  gl.viewport(0, 0, s.w, s.h);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  nodeGraphWaterfallGlFilter(gl, srcTex, true);
  nodeGraphWaterfallGlBindQuad(gl, s, s.presentProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(gl.getUniformLocation(s.presentProg, "uTex"), 0);
  const sizeLoc = gl.getUniformLocation(s.presentProg, "uSize");
  if (sizeLoc) gl.uniform2f(sizeLoc, s.w, s.h);
  const subLoc = gl.getUniformLocation(s.presentProg, "uSub");
  if (subLoc) gl.uniform1f(subLoc, 0);
  nodeGraphWaterfallGlDrawQuad(s);
  nodeGraphWaterfallGlFilter(gl, srcTex, false);
  return true;
}

function nodeGraphWaterfallGlBindQuad(gl, s, prog) {
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.quad);
  const pLoc = gl.getAttribLocation(prog, "aPos");
  const uLoc = gl.getAttribLocation(prog, "aUv");
  if (pLoc >= 0) {
    gl.enableVertexAttribArray(pLoc);
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 16, 0);
  }
  if (uLoc >= 0) {
    gl.enableVertexAttribArray(uLoc);
    gl.vertexAttribPointer(uLoc, 2, gl.FLOAT, false, 16, 8);
  }
}

function nodeGraphWaterfallGlDrawQuad(s) {
  s.gl.drawArrays(s.gl.TRIANGLES, 0, 6);
}

function nodeGraphWaterfallGlClearRead(s) {
  const gl = s.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.read.fbo);
  gl.viewport(0, 0, s.w, s.h);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(s.plate[0], s.plate[1], s.plate[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.write.fbo);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

const NODE_GRAPH_ONSET_LINE_VS = `
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

const NODE_GRAPH_ONSET_LINE_FS = `
precision mediump float;
varying float vSide;
varying float vCore;
varying vec4 vColor;
void main() {
  float alpha = 1.0 - smoothstep(vCore, 1.0, abs(vSide));
  gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
}
`;

function nodeGraphOnsetGlLineProgram(gl) {
  const vs = nodeGraphWaterfallGlCompile(gl, gl.VERTEX_SHADER, NODE_GRAPH_ONSET_LINE_VS);
  const fs = nodeGraphWaterfallGlCompile(gl, gl.FRAGMENT_SHADER, NODE_GRAPH_ONSET_LINE_FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  return prog;
}

function nodeGraphOnsetGlEnsureLine(s) {
  if (s.lineProg) return s;
  const gl = s.gl;
  const prog = nodeGraphOnsetGlLineProgram(gl);
  if (!prog) return s;
  s.lineProg = prog;
  s.lineBuf = gl.createBuffer();
  s.lineLoc = {
    pos: gl.getAttribLocation(prog, "aPos"),
    side: gl.getAttribLocation(prog, "aSide"),
    core: gl.getAttribLocation(prog, "aCore"),
    color: gl.getAttribLocation(prog, "aColor"),
    css: gl.getUniformLocation(prog, "uCss"),
  };
  return s;
}

function nodeGraphOnsetGlStrokePolyline(canvas, points, widthPx, rgb) {
  const s = canvas && canvas._wfGlSession;
  if (!s || !points || points.length < 2) return false;
  nodeGraphOnsetGlEnsureLine(s);
  if (!s.lineProg) return false;
  const gl = s.gl;
  const width = Math.max(0.75, Number(widthPx) || 1);
  const half = width * 0.5;
  const expand = half + 0.75;
  const core = half / expand;
  const color = [
    Math.max(0, Math.min(1, Number(rgb?.[0]) || 0)),
    Math.max(0, Math.min(1, Number(rgb?.[1]) || 0)),
    Math.max(0, Math.min(1, Number(rgb?.[2]) || 0)),
    1,
  ];
  const chunks = [];
  for (let p = 1; p < points.length; p += 1) {
    const p0 = points[p - 1];
    const p1 = points[p];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-4)) continue;
    const inv = 1 / len;
    const dirX = dx * inv;
    const dirY = dy * inv;
    const nx = -dirY;
    const ny = dirX;
    const ax = p0.x - dirX * half;
    const ay = p0.y - dirY * half;
    const bx = p1.x + dirX * half;
    const by = p1.y + dirY * half;
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
      chunks.push(corner[0], corner[1], corner[2], core, color[0], color[1], color[2], color[3]);
    }
  }
  if (!chunks.length) return false;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.read.fbo);
  gl.viewport(0, 0, s.w, s.h);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(s.lineProg);
  gl.uniform2f(s.lineLoc.css, s.w, s.h);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.lineBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(chunks), gl.DYNAMIC_DRAW);
  const stride = 32;
  gl.enableVertexAttribArray(s.lineLoc.pos);
  gl.vertexAttribPointer(s.lineLoc.pos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(s.lineLoc.side);
  gl.vertexAttribPointer(s.lineLoc.side, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(s.lineLoc.core);
  gl.vertexAttribPointer(s.lineLoc.core, 1, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(s.lineLoc.color);
  gl.vertexAttribPointer(s.lineLoc.color, 4, gl.FLOAT, false, stride, 16);
  gl.drawArrays(gl.TRIANGLES, 0, chunks.length / 8);
  return true;
}

function nodeGraphWaterfallGlReset(canvas, plateCss) {
  const s = nodeGraphWaterfallGlEnsure(canvas, plateCss);
  if (!s) return false;
  s.plate = nodeGraphWaterfallGlParsePlate(plateCss);
  nodeGraphWaterfallGlClearRead(s);
  return true;
}

function nodeGraphWaterfallGlScroll(canvas, px, plateCss) {
  const s = nodeGraphWaterfallGlEnsure(canvas, plateCss);
  if (!s) return false;
  s.plate = nodeGraphWaterfallGlParsePlate(plateCss);
  const shift = Math.round(Number(px) || 0);
  if (shift < 1) return true;
  const gl = s.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.write.fbo);
  gl.viewport(0, 0, s.w, s.h);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  nodeGraphWaterfallGlFilter(gl, s.read.tex, false);
  nodeGraphWaterfallGlBindQuad(gl, s, s.scrollProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.read.tex);
  gl.uniform1i(gl.getUniformLocation(s.scrollProg, "uTex"), 0);
  gl.uniform1f(gl.getUniformLocation(s.scrollProg, "uShiftPx"), shift);
  gl.uniform2f(gl.getUniformLocation(s.scrollProg, "uSize"), s.w, s.h);
  gl.uniform3f(gl.getUniformLocation(s.scrollProg, "uPlate"), s.plate[0], s.plate[1], s.plate[2]);
  nodeGraphWaterfallGlDrawQuad(s);
  const tmp = s.read;
  s.read = s.write;
  s.write = tmp;
  return true;
}

function nodeGraphWaterfallGlClearColumn(canvas, x, w, plateCss) {
  const s = canvas && canvas._wfGlSession;
  if (!s) return false;
  s.plate = nodeGraphWaterfallGlParsePlate(plateCss || "#000000");
  const gl = s.gl;
  const x0 = Math.max(0, Math.floor(Number(x) || 0));
  const x1 = Math.min(s.w, Math.ceil((Number(x) || 0) + (Number(w) || 0)));
  if (x1 <= x0) return true;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.read.fbo);
  gl.viewport(0, 0, s.w, s.h);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(x0, 0, x1 - x0, s.h);
  gl.clearColor(s.plate[0], s.plate[1], s.plate[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
  return true;
}

function nodeGraphWaterfallGlApplyBlend(gl, mode) {
  gl.enable(gl.BLEND);
  const m = String(mode || "source-over");
  if (m === "lighter" || m === "screen" || m === "combine" || m === "meet") {
    gl.blendFunc(gl.ONE, gl.ONE);
  } else if (m === "multiply") {
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
  } else {
    // Bar shader writes premultiplied coverage.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}

function nodeGraphWaterfallGlBlendKind(mode) {
  const m = String(mode || "source-over");
  if (m === "lighter" || m === "screen" || m === "combine" || m === "meet") return 1;
  if (m === "multiply") return 2;
  return 0;
}

function nodeGraphWaterfallGlDrawBar(s, verts, rgb, blend, edge, mode, strokePx) {
  const gl = s.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.read.fbo);
  gl.viewport(0, 0, s.w, s.h);
  gl.disable(gl.SCISSOR_TEST);
  nodeGraphWaterfallGlApplyBlend(gl, blend);
  gl.useProgram(s.barProg);
  const uvLoc = gl.getAttribLocation(s.barProg, "aUv");
  if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.barBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
  const pLoc = gl.getAttribLocation(s.barProg, "aPos");
  gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 8, 0);
  const c = [
    Math.max(0, Math.min(255, Number(rgb?.[0]) || 0)) / 255,
    Math.max(0, Math.min(255, Number(rgb?.[1]) || 0)) / 255,
    Math.max(0, Math.min(255, Number(rgb?.[2]) || 0)) / 255,
  ];
  gl.uniform3f(gl.getUniformLocation(s.barProg, "uColor"), c[0], c[1], c[2]);
  gl.uniform2f(gl.getUniformLocation(s.barProg, "uSize"), s.w, s.h);
  gl.uniform2f(gl.getUniformLocation(s.barProg, "uSpan"), edge.x0, edge.x1);
  gl.uniform4f(
    gl.getUniformLocation(s.barProg, "uEdge"),
    edge.top0, edge.top1, edge.bot0, edge.bot1,
  );
  gl.uniform1f(gl.getUniformLocation(s.barProg, "uBlendKind"), nodeGraphWaterfallGlBlendKind(blend));
  gl.uniform1f(gl.getUniformLocation(s.barProg, "uMode"), mode > 0 ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(s.barProg, "uStrokePx"), Math.max(0.5, Number(strokePx) || 1));
  gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
}

function nodeGraphWaterfallGlClip(x, y, w, h) {
  return [(x / w) * 2 - 1, 1 - (y / h) * 2];
}

function nodeGraphWaterfallGlStampQuad(s, x0, wid, top0, top1, bot0, bot1, fringe, rgb, blend, mode, strokePx) {
  const clip = (px, py) => nodeGraphWaterfallGlClip(px, py, s.w, s.h);
  const a = clip(x0, top0 - fringe);
  const b = clip(x0 + wid, top1 - fringe);
  const c = clip(x0, bot0 + fringe);
  const d = clip(x0 + wid, bot1 + fringe);
  const verts = [a[0], a[1], b[0], b[1], c[0], c[1], c[0], c[1], b[0], b[1], d[0], d[1]];
  nodeGraphWaterfallGlDrawBar(s, verts, rgb, blend, {
    x0,
    x1: x0 + wid,
    top0,
    top1,
    bot0,
    bot1,
  }, mode, strokePx);
}

function nodeGraphWaterfallGlStampBar(canvas, x, spanW, ys, prevEdge, connect, rgb, blend, thickness, filled, stroke) {
  const s = canvas && canvas._wfGlSession;
  if (!s || !ys) return false;
  const thick = Math.max(0, Math.min(1, Number(thickness)));
  if (!(thick > 0)) return true;
  let x0 = Number(x) || 0;
  let wid = Math.max(0, Number(spanW) || 0);
  if (thick < 0.999) {
    const pad = wid * (1 - thick) * 0.5;
    x0 += pad;
    wid *= thick;
  }
  if (!(wid > 0)) return true;
  const yTop = Math.min(ys.y0, ys.y1);
  const yBot = Math.max(ys.y0, ys.y1);
  const strokeTop = Math.min(
    Number.isFinite(ys.strokeY0) ? ys.strokeY0 : yTop,
    Number.isFinite(ys.strokeY1) ? ys.strokeY1 : yBot,
  );
  const strokeBot = Math.max(
    Number.isFinite(ys.strokeY0) ? ys.strokeY0 : yTop,
    Number.isFinite(ys.strokeY1) ? ys.strokeY1 : yBot,
  );
  const strokeOn = !!(stroke && stroke.on);
  const strokePx = Math.max(0.5, Number(stroke?.px) || 1);
  if (filled !== false) {
    let top0 = yTop;
    let bot0 = yBot;
    let top1 = yTop;
    let bot1 = yBot;
    if (connect && prevEdge && Number.isFinite(prevEdge.y0) && Number.isFinite(prevEdge.y1)) {
      top0 = Math.min(prevEdge.y0, prevEdge.y1);
      bot0 = Math.max(prevEdge.y0, prevEdge.y1);
      top1 = yTop;
      bot1 = yBot;
    }
    nodeGraphWaterfallGlStampQuad(s, x0, wid, top0, top1, bot0, bot1, 1, rgb, blend, 0, 1);
  }
  if (strokeOn) {
    // This column only. Flat top and bottom. No join to the previous bar.
    nodeGraphWaterfallGlStampQuad(
      s, x0, wid, strokeTop, strokeTop, strokeBot, strokeBot, strokePx, stroke.rgb || rgb, blend, 1, strokePx,
    );
  }
  return true;
}

function nodeGraphOnsetGlPositionLine(canvas, x) {
  const s = canvas && canvas._wfGlSession;
  if (!s || !s.gl) return;
  const gl = s.gl;
  const px = Math.max(0, Math.min(s.w - 1, Math.floor(Number(x) || 0)));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, s.w, s.h);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  const clip = (ax, ay) => nodeGraphWaterfallGlClip(ax, ay, s.w, s.h);
  const a = clip(px, -1);
  const b = clip(px + 1, -1);
  const c = clip(px, s.h + 1);
  const d = clip(px + 1, s.h + 1);
  const verts = [a[0], a[1], b[0], b[1], c[0], c[1], c[0], c[1], b[0], b[1], d[0], d[1]];
  gl.useProgram(s.barProg);
  const uvLoc = gl.getAttribLocation(s.barProg, "aUv");
  if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.barBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
  const pLoc = gl.getAttribLocation(s.barProg, "aPos");
  gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 8, 0);
  gl.uniform3f(gl.getUniformLocation(s.barProg, "uColor"), 0.55, 0.55, 0.55);
  gl.uniform2f(gl.getUniformLocation(s.barProg, "uSize"), s.w, s.h);
  gl.uniform2f(gl.getUniformLocation(s.barProg, "uSpan"), px, px + 1);
  gl.uniform4f(gl.getUniformLocation(s.barProg, "uEdge"), 0, 0, s.h, s.h);
  gl.uniform1f(gl.getUniformLocation(s.barProg, "uBlendKind"), 1);
  gl.uniform1f(gl.getUniformLocation(s.barProg, "uMode"), 0);
  gl.uniform1f(gl.getUniformLocation(s.barProg, "uStrokePx"), 1);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function nodeGraphWaterfallGlPresent(canvas, plateCss) {
  const s = nodeGraphWaterfallGlEnsure(canvas, plateCss || "#000000");
  if (!s) return false;
  const gl = s.gl;
  const sub = Number(canvas._wfSubPx) || 0;
  const tex = s.read.tex;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, s.w, s.h);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  nodeGraphWaterfallGlFilter(gl, tex, Math.abs(sub) > 0.001);
  nodeGraphWaterfallGlBindQuad(gl, s, s.presentProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(gl.getUniformLocation(s.presentProg, "uTex"), 0);
  gl.uniform2f(gl.getUniformLocation(s.presentProg, "uSize"), s.w, s.h);
  gl.uniform1f(gl.getUniformLocation(s.presentProg, "uSub"), sub);
  nodeGraphWaterfallGlDrawQuad(s);
  if (canvas.style.imageRendering === "pixelated" || canvas.style.imageRendering === "auto") {
    canvas.style.imageRendering = "";
  }
  return true;
}

function nodeGraphWaterfallGlCold(canvas, plateCss) {
  if (!canvas) return false;
  // A live tape already has history. Present it. The next column or sweep
  // paints the new plate color. Do not clear the face because a setting changed.
  const started = Boolean(canvas._waterfall && canvas._waterfall.started);
  const hasHistory = Boolean(canvas._wfGlSession && canvas._wfGlSession.read);
  if (started || hasHistory || canvas._onset) {
    return nodeGraphWaterfallGlPresent(canvas, plateCss);
  }
  if (!nodeGraphWaterfallGlReset(canvas, plateCss)) return false;
  return nodeGraphWaterfallGlPresent(canvas, plateCss);
}

function nodeGraphWaterfallGlStampCanvas(face, sourceCanvas) {
  const s = face && face._wfGlSession;
  if (!s?.gl || !s.read?.fbo || !sourceCanvas) return false;
  const gl = s.gl;
  if (!s.inkTex) {
    s.inkTex = gl.createTexture();
  }
  gl.bindTexture(gl.TEXTURE_2D, s.inkTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.read.fbo);
  gl.viewport(0, 0, s.w, s.h);
  gl.enable(gl.BLEND);
  // Canvas2D ink (pause/protect) is straight RGBA + globalAlpha — not premultiplied bars.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  nodeGraphWaterfallGlBindQuad(gl, s, s.presentProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.inkTex);
  const texLoc = gl.getUniformLocation(s.presentProg, "uTex");
  if (texLoc) gl.uniform1i(texLoc, 0);
  const sizeLoc = gl.getUniformLocation(s.presentProg, "uSize");
  if (sizeLoc) gl.uniform2f(sizeLoc, s.w, s.h);
  const subLoc = gl.getUniformLocation(s.presentProg, "uSub");
  if (subLoc) gl.uniform1f(subLoc, 0);
  nodeGraphWaterfallGlDrawQuad(s);
  gl.disable(gl.BLEND);
  return true;
}

function nodeGraphWaterfallInkOverlay(face) {
  if (!face || !face.parentElement) return null;
  let ink = face._wfInkOverlay;
  if (!ink) {
    ink = document.createElement("canvas");
    ink.className = "node-module-scope-local-fallback-canvas node-waterfall-ink-overlay";
    ink.setAttribute("aria-hidden", "true");
    ink.style.zIndex = "3";
    ink.style.background = "transparent";
    face._wfInkOverlay = ink;
  }
  if (ink.parentElement !== face.parentElement) face.parentElement.appendChild(ink);
  const w = Math.max(1, face.width | 0);
  const h = Math.max(1, face.height | 0);
  if (ink.width !== w) ink.width = w;
  if (ink.height !== h) ink.height = h;
  return ink;
}
