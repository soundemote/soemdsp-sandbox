// 2D Trace / Gradient Vectorscope beam — blatant copy of m1el/woscope line
// shaders (https://m1el.github.io/woscope-how/ , MIT / public-domain GLSL).
//
// Each consecutive sample pair is a quad. Intensity is the analytical
// integral of a Gaussian along the segment (erf), additively blended.
// Optional LUT colors the beam along path length (oldest → newest).

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
    float alpha;
    float sigma = uSize / 4.0;
    if (len < EPS) {
        alpha = exp(-pow(length(xy), 2.0) / (2.0 * sigma * sigma)) / 2.0 / sqrt(uSize);
    } else {
        alpha = erf((len - xy.x) / SQRT2 / sigma) + erf(xy.x / SQRT2 / sigma);
        alpha *= exp(-xy.y * xy.y / (2.0 * sigma * sigma)) / 2.0 / len * uSize;
    }
    alpha *= uIntensity;
    float along = len > EPS ? clamp(xy.x / len, 0.0, 1.0) : 1.0;
    float gt = mix(vT0, vT1, along);
    vec3 lut = texture2D(uLut, vec2(gt, 0.5)).rgb;
    vec3 beam = mix(uColor.rgb, lut, step(0.5, uUseLut));
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
    const u = Math.max(0, Math.min(1, Number(t) || 0));
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

  function uploadLut(glDevice, stops, sampleRgb) {
    const gl = glDevice.gl;
    const key = `${stopsKey(stops)}#${typeof sampleRgb}`;
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
      pixels[o] = Math.max(0, Math.min(255, Math.round(Number(rgb[0]) || 0)));
      pixels[o + 1] = Math.max(0, Math.min(255, Math.round(Number(rgb[1]) || 0)));
      pixels[o + 2] = Math.max(0, Math.min(255, Math.round(Number(rgb[2]) || 0)));
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

  function draw(context, points, options = {}) {
    const dest = context?.canvas;
    const width = Math.max(1, dest?.width || 0);
    const height = Math.max(1, dest?.height || 0);
    if (!dest || width < 2 || height < 2 || !Array.isArray(points) || !points.length) {
      return 0;
    }
    const face = Math.max(1, Number(options.faceMinSide) || Math.min(width, height));
    const size01 = Math.max(0, Math.min(1, Number(options.size) || 0));
    const intensity = Math.max(0, Number(options.intensity ?? options.brightness ?? 1));
    if (intensity <= 0 || size01 <= 0) {
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
    const uSize = Math.max(0.5, size01 * face * 0.5);
    const color = parseColor(options.color, [1 / 32, 1, 1 / 32, 1]);
    const useLut = Array.isArray(options.gradientStops) && options.gradientStops.length >= 2
      || typeof options.sampleRgb === "function";
    if (useLut) {
      uploadLut(glDevice, options.gradientStops, options.sampleRgb);
    }

    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(glDevice.program);
    gl.uniform2f(glDevice.uCanvasSize, width, height);
    gl.uniform1f(glDevice.uSize, uSize);
    gl.uniform1f(glDevice.uIntensity, intensity);
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
