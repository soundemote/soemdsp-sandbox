// 2D Trace beam — blatant copy of m1el/woscope line shaders
// (https://m1el.github.io/woscope-how/ , MIT / public-domain GLSL).
//
// Each consecutive sample pair is a quad. Intensity is the analytical
// integral of a Gaussian along the segment (erf), additively blended.
// Joints add to a mathematically even beam. Not phosphor energy / trail.

(function initTraceWoscope(global) {
  const EPS = 1e-6;
  const BATCH_SEGMENTS = 4096;
  const VERTS_PER_SEG = 4;
  const FLOATS_PER_VERT = 5;

  const VS_LINE = `
precision highp float;
#define EPS 1E-6
uniform vec2 uCanvasSize;
uniform float uSize;
attribute vec2 aStart, aEnd;
attribute float aIdx;
varying vec4 uvl;
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
varying vec4 uvl;

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
    gl_FragColor = vec4(vec3(uColor), uColor.a * alpha);
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
    const floats = new Float32Array(BATCH_SEGMENTS * VERTS_PER_SEG * FLOATS_PER_VERT);
    device = {
      canvas,
      gl,
      program,
      vertBuffer,
      indexBuffer,
      floats,
      aStart: gl.getAttribLocation(program, "aStart"),
      aEnd: gl.getAttribLocation(program, "aEnd"),
      aIdx: gl.getAttribLocation(program, "aIdx"),
      uCanvasSize: gl.getUniformLocation(program, "uCanvasSize"),
      uSize: gl.getUniformLocation(program, "uSize"),
      uIntensity: gl.getUniformLocation(program, "uIntensity"),
      uColor: gl.getUniformLocation(program, "uColor"),
    };
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      device = null;
    }, false);
    return device;
  }

  function collectSegments(points) {
    const segs = [];
    let prev = null;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        prev = null;
        continue;
      }
      if (prev) {
        segs.push(prev.x, prev.y, p.x, p.y);
      }
      prev = p;
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
    const segCount = packed.length / 4;
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
    gl.bindBuffer(gl.ARRAY_BUFFER, glDevice.vertBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glDevice.indexBuffer);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(glDevice.aStart);
    gl.vertexAttribPointer(glDevice.aStart, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(glDevice.aEnd);
    gl.vertexAttribPointer(glDevice.aEnd, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(glDevice.aIdx);
    gl.vertexAttribPointer(glDevice.aIdx, 1, gl.FLOAT, false, stride, 16);

    const floats = glDevice.floats;
    let drawn = 0;
    while (drawn < segCount) {
      const batch = Math.min(BATCH_SEGMENTS, segCount - drawn);
      let w = 0;
      for (let s = 0; s < batch; s += 1) {
        const src = (drawn + s) * 4;
        const sx = packed[src];
        const sy = packed[src + 1];
        const ex = packed[src + 2];
        const ey = packed[src + 3];
        const baseIdx = drawn + s;
        for (let v = 0; v < VERTS_PER_SEG; v += 1) {
          floats[w] = sx;
          floats[w + 1] = sy;
          floats[w + 2] = ex;
          floats[w + 3] = ey;
          floats[w + 4] = baseIdx * 4 + v;
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
