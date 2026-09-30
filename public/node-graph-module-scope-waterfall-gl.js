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
    const p = rgb[1].split(",").map((v) => Number(v));
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
void main() {
  // Canvas Y, top-down. Coverage is the 1px box overlap with the filled
  // span at this x, so a fractional edge is a partial pixel, not a stair.
  float y = uSize.y - gl_FragCoord.y;
  float span = max(uSpan.y - uSpan.x, 1e-4);
  float t = clamp((gl_FragCoord.x - uSpan.x) / span, 0.0, 1.0);
  float yTop = mix(uEdge.x, uEdge.y, t);
  float yBot = mix(uEdge.z, uEdge.w, t);
  float lo = min(yTop, yBot);
  float hi = max(yTop, yBot);
  float a = max(y - 0.5, lo);
  float b = min(y + 0.5, hi);
  float cover = clamp(b - a, 0.0, 1.0);
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
  if (s && s.w === w && s.h === h && s.gl) {
    s.plate = nodeGraphWaterfallGlParsePlate(plateCss);
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
  if (shift >= s.w) {
    nodeGraphWaterfallGlClearRead(s);
    return true;
  }
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

function nodeGraphWaterfallGlDrawBar(s, verts, rgb, blend, edge) {
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
  gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
}

function nodeGraphWaterfallGlClip(x, y, w, h) {
  return [(x / w) * 2 - 1, 1 - (y / h) * 2];
}

function nodeGraphWaterfallGlStampBar(canvas, x, spanW, ys, prevEdge, connect, rgb, blend, thickness) {
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
  // Pad so the 1px coverage fringe is inside the triangle. The shader
  // keeps the true edge; this does not widen the ink.
  const fringe = 1;
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
  });
  return true;
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
  canvas.style.imageRendering = "pixelated";
  return true;
}

function nodeGraphWaterfallGlCold(canvas, plateCss) {
  if (!canvas) return false;
  if (canvas._waterfall && canvas._waterfall.started) {
    return nodeGraphWaterfallGlPresent(canvas, plateCss);
  }
  if (!nodeGraphWaterfallGlReset(canvas, plateCss)) return false;
  return nodeGraphWaterfallGlPresent(canvas, plateCss);
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
