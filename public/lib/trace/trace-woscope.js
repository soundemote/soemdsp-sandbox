// 2D Trace / Gradient Vectorscope / 1D Trace beam — blatant copy of
// m1el/woscope line shaders (https://m1el.github.io/woscope-how/ , MIT).
//
// Each consecutive sample pair is a quad (upstream vsLine/fsLine: caps of
// uSize, sigma = uSize/4, erf integral). Gradient Vectorscope samples the
// shared colormap LUT along path length (point t) and additively blends.
// 1D and 2D Trace store a brightness drawable (0 black .. 1 white),
// including the unstroked area (plate brightness). One present shader
// looks the gradient up at that brightness. Not an alpha fade and not
// rgb * brightness.

(function initTraceWoscope(global) {
  const EPS = 1e-6;
  const BATCH_SEGMENTS = 4096;
  const VERTS_PER_SEG = 4;
  const FLOATS_PER_VERT = 7;
  const LUT_WIDTH = 256;

  const VS_LINE = `
precision highp float;
#define EPS 1E-6
uniform vec2 uCanvasSize;
uniform float uSize;
attribute vec2 aStart, aEnd;
attribute float aIdx;
attribute float aT0, aT1;
varying vec4 uvl;
varying float vT0;
varying float vT1;
void main () {
    float idx = mod(aIdx, 4.0);
    vec2 current;
    float tang;
    if (idx >= 2.0) {
        current = aEnd;
        tang = 1.0;
    } else {
        current = aStart;
        tang = -1.0;
    }
    float side = (mod(idx, 2.0) - 0.5) * 2.0;
    uvl.xy = vec2(tang, side);
    uvl.w = floor(aIdx / 4.0 + 0.5);

    vec2 dir = aEnd - aStart;
    uvl.z = length(dir);
    if (uvl.z > EPS) {
        dir = dir / uvl.z;
    } else {
        dir = vec2(1.0, 0.0);
    }
    vec2 norm = vec2(-dir.y, dir.x);
    vT0 = aT0;
    vT1 = aT1;
    vec2 pos = current + (tang * dir + norm * side) * uSize;
    gl_Position = vec4(
        (pos.x / max(uCanvasSize.x, 1.0)) * 2.0 - 1.0,
        1.0 - (pos.y / max(uCanvasSize.y, 1.0)) * 2.0,
        0.0,
        1.0
    );
}
`;

  const FS_LINE = `
precision highp float;
#define EPS 1E-6
#define TAUR 2.5066282746310002
#define SQRT2 1.4142135623730951
uniform float uSize;
uniform float uIntensity;
uniform float uBrightAlong;
uniform float uSolidCore;
uniform vec4 uColor;
uniform float uUseLut;
uniform sampler2D uLut;
varying vec4 uvl;
varying float vT0;
varying float vT1;

float gaussian(float x, float sigma) {
    return exp(-(x * x) / (2.0 * sigma * sigma)) / (TAUR * sigma);
}

float erf(float x) {
    float s = sign(x), a = abs(x);
    x = 1.0 + (0.278393 + (0.230389 + (0.000972 + 0.078108 * a) * a) * a) * a;
    x *= x;
    return s - s / (x * x);
}

void main (void) {
    float len = uvl.z;
    vec2 xy = vec2((len / 2.0 + uSize) * uvl.x + len / 2.0, uSize * uvl.y);
    float sigma = uSize / 4.0;
    float g = exp(-xy.y * xy.y / (2.0 * sigma * sigma));
    float axial = 1.0;
    float alpha;
    if (len < EPS) {
        g = exp(-pow(length(xy), 2.0) / (2.0 * sigma * sigma));
        alpha = g / 2.0 / sqrt(uSize);
    } else {
        axial = erf((len - xy.x) / SQRT2 / sigma) + erf(xy.x / SQRT2 / sigma);
        alpha = axial * g / 2.0 / len * uSize;
    }
    // 2D / vectorscope: integral coverage, solid hue or path-t LUT.
    alpha *= uIntensity;
    // Same colormap as phosphor / vectorscope: texture2D(uLut, vec2(t, 0.5)).
    // Vectorscope t is path position. Trace t is this pixel's gaussian
    // brightness (0 skirt -> 1 core), scaled by Bright. Not rgb * e.
    // 2D Trace keeps the per-segment erf ridge (axial / peak).
    // 1D (uSolidCore) does not. sigma = uSize/4 is ~0.5px at the old
    // half-width floor, and low LUT stops are near black, so only the
    // exact ridge indexes the bright stop. Diagonal centers sit ~0.7px
    // off that ridge: 1px gaps. Capsule gaussian, sigma >= 1.35px,
    // plateau within 1px of the stroke so the core is the bright stop
    // and the skirt still falls through the LUT.
    float alongGrad = step(0.5, uBrightAlong);
    float axialPeak = (len < EPS)
        ? 1.0
        : max(2.0 * erf((len * 0.5) / SQRT2 / sigma), 1e-4);
    float cover = (len < EPS) ? g : (g * clamp(axial / axialPeak, 0.0, 1.0));
    if (uSolidCore > 0.5) {
        float endX = max(len, 0.0);
        float cx = clamp(xy.x, 0.0, endX);
        float dist = length(vec2(xy.x - cx, xy.y));
        float sigmaSolid = max(uSize / 4.0, 1.35);
        float gSolid = exp(-dist * dist / (2.0 * sigmaSolid * sigmaSolid));
        float gCore = exp(-1.0 / (2.0 * sigmaSolid * sigmaSolid));
        cover = clamp(gSolid / max(gCore, 1e-4), 0.0, 1.0);
    }
    float beamE = clamp(cover * max(uIntensity, 0.0), 0.0, 0.999);
    if (alongGrad > 0.5) {
        // 1D/2D Trace: this fragment is brightness only (0 black .. 1 white).
        // Not an alpha, and not rgb * brightness. The present pass looks up
        // the gradient for every pixel of the drawable, including unstroked.
        if (beamE <= 0.001) discard;
        gl_FragColor = vec4(beamE, beamE, beamE, 1.0);
        return;
    }
    // Gradient Vectorscope only (not traces): path-t colormap, src-alpha.
    float along = len > EPS ? clamp(xy.x / len, 0.0, 1.0) : 1.0;
    float gt = mix(vT0, vT1, along);
    vec3 mapped = texture2D(uLut, vec2(gt, 0.5)).rgb;
    float useMap = step(0.5, uUseLut);
    vec3 beam = mix(uColor.rgb, mapped, useMap);
    gl_FragColor = vec4(beam, uColor.a * alpha);
}
`;

  let device = null;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function parseColor(color, fallback) {
    if (Array.isArray(color) && color.length >= 3) {
      const r = Number(color[0]);
      const g = Number(color[1]);
      const b = Number(color[2]);
      if (![r, g, b].every(Number.isFinite)) {
        return fallback;
      }
      if (r > 1 || g > 1 || b > 1) {
        return [r / 255, g / 255, b / 255, 1];
      }
      return [r, g, b, 1];
    }
    const hex = String(color || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
        1,
      ];
    }
    return fallback;
  }

  function hexRgb(hex, fallback = [255, 255, 255]) {
    const text = String(hex || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return [
        parseInt(text.slice(1, 3), 16),
        parseInt(text.slice(3, 5), 16),
        parseInt(text.slice(5, 7), 16),
      ];
    }
    return fallback.slice();
  }

  function sampleStopsRgb(stops, t, fallbackHex = "#ffffff") {
    if (typeof global.nodeGraphSampleGradientStopsRgb === "function") {
      return global.nodeGraphSampleGradientStopsRgb(stops, t, fallbackHex);
    }
    const list = Array.isArray(stops) ? stops : [];
    if (list.length < 2) {
      return hexRgb(fallbackHex);
    }
    const u = Math.max(0, Math.min(1, nodeGraphFiniteNumber(t)));
    const first = hexRgb(list[0]?.color, hexRgb(fallbackHex));
    const last = hexRgb(list[list.length - 1]?.color, first);
    return [
      Math.round(first[0] + (last[0] - first[0]) * u),
      Math.round(first[1] + (last[1] - first[1]) * u),
      Math.round(first[2] + (last[2] - first[2]) * u),
    ];
  }

  function stopsKey(stops) {
    if (!Array.isArray(stops) || !stops.length) {
      return "";
    }
    let key = "";
    for (let i = 0; i < stops.length; i += 1) {
      key += `${stops[i]?.t}:${stops[i]?.color}|`;
    }
    return key;
  }

  function uploadLut(glDevice, stops, sampleRgb, cacheKey) {
    const gl = glDevice.gl;
    const key = cacheKey || `${stopsKey(stops)}#${typeof sampleRgb}`;
    if (glDevice.lutKey === key) {
      return;
    }
    const pixels = new Uint8Array(LUT_WIDTH * 4);
    const sample = typeof sampleRgb === "function"
      ? sampleRgb
      : (t) => sampleStopsRgb(stops, t, "#ffffff");
    for (let i = 0; i < LUT_WIDTH; i += 1) {
      const rgb = sample(i / (LUT_WIDTH - 1)) || [255, 255, 255];
      const o = i * 4;
      pixels[o] = Math.max(0, Math.min(255, Math.round(nodeGraphFiniteNumber(rgb[0]))));
      pixels[o + 1] = Math.max(0, Math.min(255, Math.round(nodeGraphFiniteNumber(rgb[1]))));
      pixels[o + 2] = Math.max(0, Math.min(255, Math.round(nodeGraphFiniteNumber(rgb[2]))));
      pixels[o + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, glDevice.lutTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      LUT_WIDTH,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    glDevice.lutKey = key;
  }

  function getDevice() {
    if (device?.gl && !device.gl.isContextLost()) {
      return device;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }) || canvas.getContext("experimental-webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      device = null;
      return null;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VS_LINE);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS_LINE);
    if (!vs || !fs) {
      device = null;
      return null;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      device = null;
      return null;
    }
    const vertBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    const indices = new Uint16Array(BATCH_SEGMENTS * 6);
    for (let s = 0; s < BATCH_SEGMENTS; s += 1) {
      const pos = s * VERTS_PER_SEG;
      const o = s * 6;
      indices[o] = pos;
      indices[o + 1] = pos + 2;
      indices[o + 2] = pos + 1;
      indices[o + 3] = pos + 1;
      indices[o + 4] = pos + 2;
      indices[o + 5] = pos + 3;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    const lutTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lutTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      LUT_WIDTH,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(LUT_WIDTH * 4).fill(255),
    );
    const floats = new Float32Array(BATCH_SEGMENTS * VERTS_PER_SEG * FLOATS_PER_VERT);
    device = {
      canvas,
      gl,
      program,
      vertBuffer,
      indexBuffer,
      lutTexture,
      lutKey: "",
      floats,
      aStart: gl.getAttribLocation(program, "aStart"),
      aEnd: gl.getAttribLocation(program, "aEnd"),
      aIdx: gl.getAttribLocation(program, "aIdx"),
      aT0: gl.getAttribLocation(program, "aT0"),
      aT1: gl.getAttribLocation(program, "aT1"),
      uCanvasSize: gl.getUniformLocation(program, "uCanvasSize"),
      uSize: gl.getUniformLocation(program, "uSize"),
      uIntensity: gl.getUniformLocation(program, "uIntensity"),
      uBrightAlong: gl.getUniformLocation(program, "uBrightAlong"),
      uSolidCore: gl.getUniformLocation(program, "uSolidCore"),
      uColor: gl.getUniformLocation(program, "uColor"),
      uUseLut: gl.getUniformLocation(program, "uUseLut"),
      uLut: gl.getUniformLocation(program, "uLut"),
    };
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      device = null;
    }, false);
    return device;
  }

  function collectSegments(points) {
    const segs = [];
    let realTotal = 0;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        realTotal += 1;
      }
    }
    let prev = null;
    let prevT = 0;
    let realIndex = 0;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        prev = null;
        continue;
      }
      const namedT = Number(p.t);
      const t = Number.isFinite(namedT)
        ? Math.max(0, Math.min(1, namedT))
        : (realTotal > 1 ? realIndex / (realTotal - 1) : 1);
      if (prev) {
        segs.push(prev.x, prev.y, p.x, p.y, prevT, t);
      }
      prev = p;
      prevT = t;
      realIndex += 1;
    }
    return segs;
  }

  const VS_QUAD = `
precision highp float;
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  const FS_TRACE_FADE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform float uErase;
void main() {
    float b = texture2D(uSrc, vUv).r * (1.0 - clamp(uErase, 0.0, 1.0));
    gl_FragColor = vec4(b, b, b, 1.0);
}
`;

  const FS_TRACE_GHOST = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uGhost;
uniform sampler2D uHot;
uniform float uErase;
uniform float uDeposit;
void main() {
    // Decaying brightness (not a colored afterimage). Keep the peak hot
    // brightness, then fade it by uErase. uDeposit is 1 while Ghost is on.
    float g = texture2D(uGhost, vUv).r * (1.0 - clamp(uErase, 0.0, 1.0));
    float hot = texture2D(uHot, vUv).r;
    g = max(g, hot * clamp(uDeposit, 0.0, 1.0));
    gl_FragColor = vec4(g, g, g, 1.0);
}
`;

  // Whole drawable: unstroked brightness is uPlate, stroke brightness is the
  // buffer, then one colormap lookup. Opaque. No alpha fade.
  const FS_TRACE_PRESENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBright;
uniform sampler2D uGhost;
uniform sampler2D uLut;
uniform float uPlate;
uniform float uGhostGain;
void main() {
    float hot = texture2D(uBright, vUv).r;
    float ghost = texture2D(uGhost, vUv).r * clamp(uGhostGain, 0.0, 1.0);
    float b = max(hot, ghost);
    b = max(b, clamp(uPlate, 0.0, 1.0));
    b = clamp(b, 0.0, 0.999);
    vec3 c = texture2D(uLut, vec2(b, 0.5)).rgb;
    gl_FragColor = vec4(c, 1.0);
}
`;

  const traceByDest = new WeakMap();

  function linkProgram(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) {
      return null;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function ensureTracePresent(glDevice) {
    if (glDevice.tracePresent) {
      return glDevice.tracePresent;
    }
    const gl = glDevice.gl;
    const fade = linkProgram(gl, VS_QUAD, FS_TRACE_FADE);
    const ghost = linkProgram(gl, VS_QUAD, FS_TRACE_GHOST);
    const present = linkProgram(gl, VS_QUAD, FS_TRACE_PRESENT);
    if (!fade || !ghost || !present) {
      return null;
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1,
    ]), gl.STATIC_DRAW);
    glDevice.tracePresent = {
      quad,
      fade: { program: fade, aPos: gl.getAttribLocation(fade, "aPos"), uSrc: gl.getUniformLocation(fade, "uSrc"), uErase: gl.getUniformLocation(fade, "uErase") },
      ghost: {
        program: ghost,
        aPos: gl.getAttribLocation(ghost, "aPos"),
        uGhost: gl.getUniformLocation(ghost, "uGhost"),
        uHot: gl.getUniformLocation(ghost, "uHot"),
        uErase: gl.getUniformLocation(ghost, "uErase"),
        uDeposit: gl.getUniformLocation(ghost, "uDeposit"),
      },
      present: {
        program: present,
        aPos: gl.getAttribLocation(present, "aPos"),
        uBright: gl.getUniformLocation(present, "uBright"),
        uGhost: gl.getUniformLocation(present, "uGhost"),
        uLut: gl.getUniformLocation(present, "uLut"),
        uPlate: gl.getUniformLocation(present, "uPlate"),
        uGhostGain: gl.getUniformLocation(present, "uGhostGain"),
      },
    };
    return glDevice.tracePresent;
  }

  function allocBrightTarget(gl, w, h) {
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
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  }

  function traceStateFor(glDevice, dest, w, h) {
    const gl = glDevice.gl;
    let st = traceByDest.get(dest);
    if (!st || st.gl !== gl || st.w !== w || st.h !== h) {
      st = {
        gl,
        w,
        h,
        read: allocBrightTarget(gl, w, h),
        write: allocBrightTarget(gl, w, h),
        ghostRead: allocBrightTarget(gl, w, h),
        ghostWrite: allocBrightTarget(gl, w, h),
      };
      traceByDest.set(dest, st);
    }
    return st;
  }

  function drawTraceQuad(gl, prog) {
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, glDeviceQuad(gl));
    gl.enableVertexAttribArray(prog.aPos);
    gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function glDeviceQuad(gl) {
    const dev = device;
    return dev && dev.gl === gl ? dev.tracePresent.quad : null;
  }

  function traceUnit(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  }

  function traceTrailErase(options) {
    const trail = Number(options.trail);
    const t = Number.isFinite(trail) ? trail : 0;
    if (typeof PhosphorResidual !== "undefined" && typeof PhosphorResidual.destFadeAmount === "function") {
      return traceUnit(PhosphorResidual.destFadeAmount(t, 0), 0);
    }
    return 0;
  }

  function drawTraceBrightness(context, points, options) {
    const dest = context?.canvas;
    const width = Math.max(1, dest?.width || 0);
    const height = Math.max(1, dest?.height || 0);
    if (!dest || width < 2 || height < 2) {
      return 0;
    }
    const face = Math.max(1, Number(options.faceMinSide) || Math.min(width, height));
    const diameter = typeof faceInkPx === "function"
      ? faceInkPx(options.size, face)
      : Math.max(0, Number(options.size) || 0);
    const intensity = Math.max(0, Number(options.intensity ?? options.brightness ?? 1));
    const packed = collectSegments(Array.isArray(points) ? points : []);
    const packedStride = 6;
    const segCount = packed.length / packedStride;
    const glDevice = getDevice();
    if (!glDevice?.gl) {
      return 0;
    }
    const presentApi = ensureTracePresent(glDevice);
    if (!presentApi) {
      return 0;
    }
    const gl = glDevice.gl;
    const canvas = glDevice.canvas;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    let uSize = Math.max(0.05, diameter * 0.5);
    const solidCore = options.solidCore === true;
    uSize = Math.max(uSize, 2.0);
    if (solidCore) uSize = Math.max(uSize, 3.0);
    const useLut = (Array.isArray(options.gradientStops) && options.gradientStops.length >= 2)
      || typeof options.sampleRgb === "function";
    if (useLut) {
      uploadLut(glDevice, options.gradientStops, options.sampleRgb, options.lutKey);
    }
    const st = traceStateFor(glDevice, dest, width, height);
    const cont = options.traceContinue === true;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, width, height);
    if (!cont) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, st.write.fbo);
      gl.useProgram(presentApi.fade.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, st.read.tex);
      gl.uniform1i(presentApi.fade.uSrc, 0);
      gl.uniform1f(presentApi.fade.uErase, traceTrailErase(options));
      gl.bindBuffer(gl.ARRAY_BUFFER, presentApi.quad);
      gl.enableVertexAttribArray(presentApi.fade.aPos);
      gl.vertexAttribPointer(presentApi.fade.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (segCount >= 1 && diameter > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, st.write.fbo);
      gl.enable(gl.BLEND);
      if (!Object.prototype.hasOwnProperty.call(glDevice, "maxBlend")) {
        glDevice.maxBlend = gl.getExtension("EXT_blend_minmax");
      }
      if (glDevice.maxBlend) {
        gl.blendEquation(glDevice.maxBlend.MAX_EXT);
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE);
      }
      gl.useProgram(glDevice.program);
      gl.uniform2f(glDevice.uCanvasSize, width, height);
      gl.uniform1f(glDevice.uSize, uSize);
      gl.uniform1f(glDevice.uIntensity, intensity);
      if (glDevice.uBrightAlong) gl.uniform1f(glDevice.uBrightAlong, 1);
      if (glDevice.uSolidCore) gl.uniform1f(glDevice.uSolidCore, solidCore ? 1 : 0);
      gl.uniform4f(glDevice.uColor, 1, 1, 1, 1);
      gl.uniform1f(glDevice.uUseLut, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, glDevice.vertBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glDevice.indexBuffer);
      const stride = FLOATS_PER_VERT * 4;
      gl.enableVertexAttribArray(glDevice.aStart);
      gl.vertexAttribPointer(glDevice.aStart, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(glDevice.aEnd);
      gl.vertexAttribPointer(glDevice.aEnd, 2, gl.FLOAT, false, stride, 8);
      gl.enableVertexAttribArray(glDevice.aIdx);
      gl.vertexAttribPointer(glDevice.aIdx, 1, gl.FLOAT, false, stride, 16);
      if (glDevice.aT0 >= 0) {
        gl.enableVertexAttribArray(glDevice.aT0);
        gl.vertexAttribPointer(glDevice.aT0, 1, gl.FLOAT, false, stride, 20);
      }
      if (glDevice.aT1 >= 0) {
        gl.enableVertexAttribArray(glDevice.aT1);
        gl.vertexAttribPointer(glDevice.aT1, 1, gl.FLOAT, false, stride, 24);
      }
      const floats = glDevice.floats;
      let drawn = 0;
      while (drawn < segCount) {
        const batch = Math.min(BATCH_SEGMENTS, segCount - drawn);
        let w = 0;
        for (let s = 0; s < batch; s += 1) {
          const src = (drawn + s) * packedStride;
          const sx = packed[src];
          const sy = packed[src + 1];
          const ex = packed[src + 2];
          const ey = packed[src + 3];
          const t0 = packed[src + 4];
          const t1 = packed[src + 5];
          const baseIdx = drawn + s;
          for (let v = 0; v < VERTS_PER_SEG; v += 1) {
            floats[w] = sx;
            floats[w + 1] = sy;
            floats[w + 2] = ex;
            floats[w + 3] = ey;
            floats[w + 4] = baseIdx * 4 + v;
            floats[w + 5] = t0;
            floats[w + 6] = t1;
            w += FLOATS_PER_VERT;
          }
        }
        gl.bufferData(gl.ARRAY_BUFFER, floats.subarray(0, w), gl.STREAM_DRAW);
        gl.drawElements(gl.TRIANGLES, batch * 6, gl.UNSIGNED_SHORT, 0);
        drawn += batch;
      }
    }
    const doPresent = options.tracePresent !== false;
    if (doPresent) {
      const ghostAmt = Number(options.ghost);
      const ghostOn = Number.isFinite(ghostAmt) && ghostAmt > 0;
      const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
      // Erase rate is the Ghost knob (slow hang). Deposit the hot brightness
      // itself. destGhostDeposit / destGhostPresent are canvas alphas (~0.02)
      // and would collapse this brightness to the plate stop of the LUT.
      const gErase = ghostOn && Residual?.destGhostEraseAmount ? Residual.destGhostEraseAmount(ghostAmt) : 1;
      const gDeposit = ghostOn ? 1 : 0;
      const gGain = ghostOn ? traceUnit(ghostAmt, 0) : 0;
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, st.ghostWrite.fbo);
      gl.useProgram(presentApi.ghost.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, st.ghostRead.tex);
      gl.uniform1i(presentApi.ghost.uGhost, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, st.write.tex);
      gl.uniform1i(presentApi.ghost.uHot, 1);
      gl.uniform1f(presentApi.ghost.uErase, traceUnit(gErase, 1));
      gl.uniform1f(presentApi.ghost.uDeposit, traceUnit(gDeposit, 0));
      gl.bindBuffer(gl.ARRAY_BUFFER, presentApi.quad);
      gl.enableVertexAttribArray(presentApi.ghost.aPos);
      gl.vertexAttribPointer(presentApi.ghost.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const ghostTmp = st.ghostRead;
      st.ghostRead = st.ghostWrite;
      st.ghostWrite = ghostTmp;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(presentApi.present.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, st.write.tex);
      gl.uniform1i(presentApi.present.uBright, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, st.ghostRead.tex);
      gl.uniform1i(presentApi.present.uGhost, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, glDevice.lutTexture);
      gl.uniform1i(presentApi.present.uLut, 2);
      const plate = traceUnit(options.plateBrightness, 0);
      gl.uniform1f(presentApi.present.uPlate, plate);
      gl.uniform1f(presentApi.present.uGhostGain, ghostOn ? Math.max(0, Number(gGain) || 0) : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, presentApi.quad);
      gl.enableVertexAttribArray(presentApi.present.aPos);
      gl.vertexAttribPointer(presentApi.present.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const hotTmp = st.read;
      st.read = st.write;
      st.write = hotTmp;
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.imageSmoothingEnabled = false;
      context.globalCompositeOperation = "copy";
      context.drawImage(canvas, 0, 0, width, height);
      context.restore();
    } else {
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
    }
    return Math.max(segCount, 1);
  }

  function draw(context, points, options = {}) {
    if (options.brightAlong === true) {
      return drawTraceBrightness(context, points, options);
    }
    const dest = context?.canvas;
    const width = Math.max(1, dest?.width || 0);
    const height = Math.max(1, dest?.height || 0);
    if (!dest || width < 2 || height < 2 || !Array.isArray(points) || !points.length) {
      return 0;
    }
    const face = Math.max(1, Number(options.faceMinSide) || Math.min(width, height));
    // Size is authored CSS px at a 96px face, not a 0…1 fraction of the canvas.
    const diameter = typeof faceInkPx === "function"
      ? faceInkPx(options.size, face)
      : Math.max(0, Number(options.size) || 0);
    const brightAlong = options.brightAlong === true;
    const intensity = Math.max(0, Number(options.intensity ?? options.brightness ?? 1));
    // Bright scales gaussian energy into the shared LUT (0 = no
    // fragments). Vectorscope does not set brightAlong.
    if (!(diameter > 0) || (!brightAlong && intensity <= 0)) {
      return 0;
    }
    const packed = collectSegments(points);
    const packedStride = 6;
    const segCount = packed.length / packedStride;
    if (segCount < 1) {
      return 0;
    }
    const glDevice = getDevice();
    if (!glDevice?.gl) {
      return 0;
    }
    const gl = glDevice.gl;
    const canvas = glDevice.canvas;
    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }
    // Half-width in px. sigma = uSize/4 (upstream). 2D Trace floor
    // stays 2px. 1D solidCore quad must hold a 1.35px sigma.
    let uSize = Math.max(0.05, diameter * 0.5);
    const solidCore = options.solidCore === true;
    if (brightAlong) {
      uSize = Math.max(uSize, 2.0);
    }
    if (solidCore) {
      uSize = Math.max(uSize, 3.0);
    }
    const color = parseColor(options.color, [1 / 32, 1, 1 / 32, 1]);
    const useLut = Array.isArray(options.gradientStops) && options.gradientStops.length >= 2
      || typeof options.sampleRgb === "function";
    if (useLut) {
      uploadLut(glDevice, options.gradientStops, options.sampleRgb, options.lutKey);
    }

    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // 1D writes LUT(brightness) opaquely. Max keeps the hotter stop where
    // quads overlap so tails do not add into one hue. 2D / vectorscope stay
    // additive src-alpha.
    if (!Object.prototype.hasOwnProperty.call(glDevice, "maxBlend")) {
      glDevice.maxBlend = gl.getExtension("EXT_blend_minmax");
    }
    if (brightAlong && glDevice.maxBlend) {
      gl.blendEquation(glDevice.maxBlend.MAX_EXT);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    }
    gl.useProgram(glDevice.program);
    gl.uniform2f(glDevice.uCanvasSize, width, height);
    gl.uniform1f(glDevice.uSize, uSize);
    gl.uniform1f(glDevice.uIntensity, intensity);
    if (glDevice.uBrightAlong) {
      gl.uniform1f(glDevice.uBrightAlong, brightAlong ? 1 : 0);
    }
    if (glDevice.uSolidCore) {
      gl.uniform1f(glDevice.uSolidCore, solidCore ? 1 : 0);
    }
    gl.uniform4f(glDevice.uColor, color[0], color[1], color[2], color[3]);
    gl.uniform1f(glDevice.uUseLut, useLut ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glDevice.lutTexture);
    gl.uniform1i(glDevice.uLut, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, glDevice.vertBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glDevice.indexBuffer);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(glDevice.aStart);
    gl.vertexAttribPointer(glDevice.aStart, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(glDevice.aEnd);
    gl.vertexAttribPointer(glDevice.aEnd, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(glDevice.aIdx);
    gl.vertexAttribPointer(glDevice.aIdx, 1, gl.FLOAT, false, stride, 16);
    if (glDevice.aT0 >= 0) {
      gl.enableVertexAttribArray(glDevice.aT0);
      gl.vertexAttribPointer(glDevice.aT0, 1, gl.FLOAT, false, stride, 20);
    }
    if (glDevice.aT1 >= 0) {
      gl.enableVertexAttribArray(glDevice.aT1);
      gl.vertexAttribPointer(glDevice.aT1, 1, gl.FLOAT, false, stride, 24);
    }

    const floats = glDevice.floats;
    let drawn = 0;
    while (drawn < segCount) {
      const batch = Math.min(BATCH_SEGMENTS, segCount - drawn);
      let w = 0;
      for (let s = 0; s < batch; s += 1) {
        const src = (drawn + s) * packedStride;
        const sx = packed[src];
        const sy = packed[src + 1];
        const ex = packed[src + 2];
        const ey = packed[src + 3];
        const t0 = packed[src + 4];
        const t1 = packed[src + 5];
        const baseIdx = drawn + s;
        for (let v = 0; v < VERTS_PER_SEG; v += 1) {
          floats[w] = sx;
          floats[w + 1] = sy;
          floats[w + 2] = ex;
          floats[w + 3] = ey;
          floats[w + 4] = baseIdx * 4 + v;
          floats[w + 5] = t0;
          floats[w + 6] = t1;
          w += FLOATS_PER_VERT;
        }
      }
      gl.bufferData(gl.ARRAY_BUFFER, floats.subarray(0, w), gl.STREAM_DRAW);
      gl.drawElements(gl.TRIANGLES, batch * 6, gl.UNSIGNED_SHORT, 0);
      drawn += batch;
    }

    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(null);

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = false;
    context.globalCompositeOperation = "lighter";
    context.drawImage(canvas, 0, 0, width, height);
    context.restore();
    return segCount;
  }

  global.TraceWoscope = {
    draw,
  };
}(typeof window !== "undefined" ? window : globalThis));
