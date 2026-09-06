// Cheap RGB vectorscope stamps — batched WebGL POINTS onto an offscreen
// canvas, then additive blit onto the 2D face. Callers fade the plate
// separately (DestFadeTowardPlate / PhosphorResidual).
// Packed verts: x, y, r, g, b (canvas px + 0…1 color).

(function initTraceRgbPoints(global) {
  const BATCH = 8192;
  const FLOATS = 5;

  const VS = `
precision mediump float;
uniform vec2 uCanvas;
uniform float uSize;
attribute vec2 aPos;
attribute vec3 aRgb;
varying vec3 vRgb;
void main() {
  vRgb = aRgb;
  vec2 ndc = vec2(
    (aPos.x / max(uCanvas.x, 1.0)) * 2.0 - 1.0,
    1.0 - (aPos.y / max(uCanvas.y, 1.0)) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = max(1.0, uSize);
}
`;

  const FS = `
precision mediump float;
varying vec3 vRgb;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 2.2);
  gl_FragColor = vec4(vRgb * a, a);
}
`;

  let device = null;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function ensure(canvas) {
    if (device && device.canvas === canvas && device.gl && !device.gl.isContextLost()) {
      return device;
    }
    device = null;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      return null;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) {
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }
    device = {
      canvas,
      gl,
      prog,
      buf: gl.createBuffer(),
      scratch: new Float32Array(BATCH * FLOATS),
      loc: {
        aPos: gl.getAttribLocation(prog, "aPos"),
        aRgb: gl.getAttribLocation(prog, "aRgb"),
        uCanvas: gl.getUniformLocation(prog, "uCanvas"),
        uSize: gl.getUniformLocation(prog, "uSize"),
      },
    };
    return device;
  }

  /**
   * Stamp packed RGB points onto a 2D context (offscreen WebGL → lighter blit).
   * @returns {boolean} false if WebGL unavailable — caller should fall back.
   */
  function stamp(ctx, packed, count, opts = {}) {
    const dest = ctx?.canvas;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (!dest || !packed || n <= 0) {
      return false;
    }
    let off = dest._traceRgbPointsOffscreen;
    if (!off || off.width !== dest.width || off.height !== dest.height) {
      off = document.createElement("canvas");
      off.width = dest.width;
      off.height = dest.height;
      dest._traceRgbPointsOffscreen = off;
      device = null;
    }
    const d = ensure(off);
    if (!d) {
      return false;
    }
    const gl = d.gl;
    const w = off.width;
    const h = off.height;
    const sizePx = Math.max(1, Number(opts.sizePx) || 2);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(d.prog);
    gl.uniform2f(d.loc.uCanvas, w, h);
    gl.uniform1f(d.loc.uSize, sizePx);
    gl.bindBuffer(gl.ARRAY_BUFFER, d.buf);
    gl.enableVertexAttribArray(d.loc.aPos);
    gl.enableVertexAttribArray(d.loc.aRgb);
    gl.vertexAttribPointer(d.loc.aPos, 2, gl.FLOAT, false, FLOATS * 4, 0);
    gl.vertexAttribPointer(d.loc.aRgb, 3, gl.FLOAT, false, FLOATS * 4, 8);
    let offset = 0;
    while (offset < n) {
      const take = Math.min(BATCH, n - offset);
      const floats = take * FLOATS;
      const srcStart = offset * FLOATS;
      d.scratch.set(packed.subarray(srcStart, srcStart + floats), 0);
      gl.bufferData(gl.ARRAY_BUFFER, d.scratch.subarray(0, floats), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.POINTS, 0, take);
      offset += take;
    }
    gl.disableVertexAttribArray(d.loc.aPos);
    gl.disableVertexAttribArray(d.loc.aRgb);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    return true;
  }

  global.TraceRgbPoints = Object.freeze({
    stamp,
    FLOATS,
  });
})(typeof window !== "undefined" ? window : globalThis);
