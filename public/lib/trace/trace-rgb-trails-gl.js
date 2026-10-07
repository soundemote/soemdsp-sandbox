// RGB DestFade trails — phosphor STEP_FRAG dual residual in RGB.
// Shared picture-device context (no per-face WebGL). Hot = Trail keepFast;
// Ghost = max(min(prev*keepSlow, cap), hot). Additive RGB point stamps.
// Canvas2D DestFade remains the fallback when this device is unavailable.

(function initTraceRgbTrailsGl(global) {
  const KEY = "_traceRgbTrailsGl";
  const REV = 1;
  let shared = null;

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  // RGB dual residual (matches PhosphorResidual / mono STEP_FRAG intent).
  const STEP_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uPrev;
    uniform float uKeepFast;
    uniform float uKeepSlow;
    uniform float uGhostCap;
    uniform vec3 uPlate;
    void main() {
      vec3 prev = texture2D(uPrev, vUv).rgb;
      // Hot relative to plate so plate colour doesn't bleach the trail.
      vec3 hot = max(prev - uPlate, 0.0);
      float keepFast = clamp(uKeepFast, 0.0, 1.0);
      float keepSlow = max(keepFast, clamp(uKeepSlow, 0.0, 0.9998));
      float cap = max(uGhostCap, 0.0);
      vec3 eFast = hot * keepFast;
      vec3 eGhost = min(hot * keepSlow, vec3(cap));
      vec3 e = max(eFast, eGhost);
      gl_FragColor = vec4(uPlate + e, 1.0);
    }
  `;

  const COPY_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main() {
      gl_FragColor = texture2D(uTexture, vUv);
    }
  `;

  const POINT_VS = `
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

  const POINT_FS = `
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

  const PRESENT_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uPlate;
    void main() {
      gl_FragColor = texture2D(uPlate, vUv);
    }
  `;

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

  function link(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  function hexToRgb01(hex, fallback = [0, 0, 0]) {
    const color = typeof normalizeNodeGraphTraceDisplayColor === "function"
      ? normalizeNodeGraphTraceDisplayColor(hex, "#000000")
      : String(hex || "#000000");
    const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!m) return fallback;
    const n = Number.parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function textureFormats(gl) {
    if (gl._traceRgbTrailsFormats) return gl._traceRgbTrailsFormats;
    const formats = [];
    const halfFloat = gl.getExtension("OES_texture_half_float");
    const colorBufferHalfFloat = gl.getExtension("EXT_color_buffer_half_float");
    const halfFloatLinear = gl.getExtension("OES_texture_half_float_linear");
    if (halfFloat && colorBufferHalfFloat) {
      formats.push({
        internal: gl.RGBA,
        format: gl.RGBA,
        type: halfFloat.HALF_FLOAT_OES,
        filter: halfFloatLinear ? gl.LINEAR : gl.NEAREST,
        label: "rgba16f",
      });
    }
    formats.push({
      internal: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      filter: gl.LINEAR,
      label: "rgba8",
    });
    gl._traceRgbTrailsFormats = formats;
    return formats;
  }

  function createSurface(gl, w, h, fmt) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, fmt.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, fmt.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!ok) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      return null;
    }
    return { texture: tex, framebuffer: fbo, width: w, height: h };
  }

  function getShared() {
    if (shared?.gl && !shared.gl.isContextLost() && shared.rev === REV) return shared;
    shared = null;
    const picture = typeof nodeGraphPictureDevice === "function" ? nodeGraphPictureDevice() : null;
    if (!picture?.gl) return null;
    const gl = picture.gl;
    const step = link(gl, VERT, STEP_FRAG);
    const copy = link(gl, VERT, COPY_FRAG);
    const present = link(gl, VERT, PRESENT_FRAG);
    const points = link(gl, POINT_VS, POINT_FS);
    if (!step || !copy || !present || !points) return null;
    shared = {
      rev: REV,
      gl,
      canvas: picture.canvas,
      quad: picture.quad,
      step: {
        program: step,
        aPos: gl.getAttribLocation(step, "aPos"),
        uPrev: gl.getUniformLocation(step, "uPrev"),
        uKeepFast: gl.getUniformLocation(step, "uKeepFast"),
        uKeepSlow: gl.getUniformLocation(step, "uKeepSlow"),
        uGhostCap: gl.getUniformLocation(step, "uGhostCap"),
        uPlate: gl.getUniformLocation(step, "uPlate"),
      },
      copy: {
        program: copy,
        aPos: gl.getAttribLocation(copy, "aPos"),
        uTexture: gl.getUniformLocation(copy, "uTexture"),
      },
      present: {
        program: present,
        aPos: gl.getAttribLocation(present, "aPos"),
        uPlate: gl.getUniformLocation(present, "uPlate"),
      },
      points: {
        program: points,
        aPos: gl.getAttribLocation(points, "aPos"),
        aRgb: gl.getAttribLocation(points, "aRgb"),
        uCanvas: gl.getUniformLocation(points, "uCanvas"),
        uSize: gl.getUniformLocation(points, "uSize"),
        buf: gl.createBuffer(),
        scratch: new Float32Array(8192 * 5),
      },
    };
    return shared;
  }

  function bindQuad(gl, loc, quad) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function ensure(host, width, height) {
    if (!host) return null;
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const device = getShared();
    if (!device) return null;
    let state = host[KEY];
    if (state?.alive && state.width === w && state.height === h && state.device === device) {
      return state;
    }
    if (state) destroy(host);
    const gl = device.gl;
    let read = null;
    let write = null;
    let fmtLabel = "";
    for (const fmt of textureFormats(gl)) {
      read = createSurface(gl, w, h, fmt);
      write = createSurface(gl, w, h, fmt);
      if (read && write) {
        fmtLabel = fmt.label;
        break;
      }
      if (read) {
        gl.deleteFramebuffer(read.framebuffer);
        gl.deleteTexture(read.texture);
      }
      if (write) {
        gl.deleteFramebuffer(write.framebuffer);
        gl.deleteTexture(write.texture);
      }
      read = write = null;
    }
    if (!read || !write) return null;
    // Clear to black plate.
    for (const s of [read, write]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    state = {
      alive: true,
      device,
      width: w,
      height: h,
      read,
      write,
      fmtLabel,
      frame: 0,
    };
    host[KEY] = state;
    return state;
  }

  function destroy(host) {
    const state = host?.[KEY];
    if (!state) return;
    const gl = state.device?.gl;
    if (gl) {
      for (const s of [state.read, state.write]) {
        if (!s) continue;
        if (s.framebuffer) gl.deleteFramebuffer(s.framebuffer);
        if (s.texture) gl.deleteTexture(s.texture);
      }
    }
    host[KEY] = null;
  }

  function swap(state) {
    const t = state.read;
    state.read = state.write;
    state.write = t;
  }

  function residualKeeps(trail, ghost) {
    const Residual = global.PhosphorResidual;
    if (Residual?.residualKeeps) return Residual.residualKeeps(trail, ghost);
    const t = Math.max(0, Math.min(1, Number(trail) || 0.3));
    const g = Math.max(0, Math.min(1, Number(ghost) || 0));
    const fade = Math.max(0.006, Math.min(0.55, 0.006 + (1 - t) * 0.11 + (1 - t) * (1 - t) * 0.32));
    const keepFast = Math.max(0, 1 - fade);
    const keepSlow = g <= 0.001 ? keepFast : Math.min(0.99975, Math.max(keepFast, 1 - Math.pow(1 - g, 2.8) * 0.012));
    const ghostCap = g * 0.1 + g * g * 0.22;
    return { keepFast, keepSlow, ghostCap };
  }

  function stepFade(host, trail, ghost, plateCss) {
    const state = host?.[KEY];
    if (!state?.alive) return false;
    const { gl, device } = { gl: state.device.gl, device: state.device };
    const keeps = residualKeeps(trail, ghost);
    const plate = hexToRgb01(plateCss);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.write.framebuffer);
    gl.viewport(0, 0, state.width, state.height);
    gl.disable(gl.BLEND);
    gl.useProgram(device.step.program);
    bindQuad(gl, device.step.aPos, device.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.read.texture);
    gl.uniform1i(device.step.uPrev, 0);
    gl.uniform1f(device.step.uKeepFast, keeps.keepFast);
    gl.uniform1f(device.step.uKeepSlow, keeps.keepSlow);
    gl.uniform1f(device.step.uGhostCap, keeps.ghostCap);
    gl.uniform3f(device.step.uPlate, plate[0], plate[1], plate[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    swap(state);
    state.frame += 1;
    return true;
  }

  function stampPoints(host, packed, count, sizePx) {
    const state = host?.[KEY];
    if (!state?.alive || !packed || !(count > 0)) return false;
    const device = state.device;
    const gl = device.gl;
    const n = Math.max(0, Math.floor(count));
    const FLOATS = 5;
    const BATCH = 8192;
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.read.framebuffer);
    gl.viewport(0, 0, state.width, state.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(device.points.program);
    gl.uniform2f(device.points.uCanvas, state.width, state.height);
    gl.uniform1f(device.points.uSize, Math.max(1, Number(sizePx) || 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, device.points.buf);
    gl.enableVertexAttribArray(device.points.aPos);
    gl.enableVertexAttribArray(device.points.aRgb);
    gl.vertexAttribPointer(device.points.aPos, 2, gl.FLOAT, false, FLOATS * 4, 0);
    gl.vertexAttribPointer(device.points.aRgb, 3, gl.FLOAT, false, FLOATS * 4, 8);
    let offset = 0;
    while (offset < n) {
      const take = Math.min(BATCH, n - offset);
      const floats = take * FLOATS;
      const srcStart = offset * FLOATS;
      device.points.scratch.set(packed.subarray(srcStart, srcStart + floats), 0);
      gl.bufferData(gl.ARRAY_BUFFER, device.points.scratch.subarray(0, floats), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.POINTS, 0, take);
      offset += take;
    }
    gl.disableVertexAttribArray(device.points.aPos);
    gl.disableVertexAttribArray(device.points.aRgb);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  /** Upload a 2D canvas (after external stamps) as the new hot plate. */
  function ingestCanvas(host, canvas) {
    const state = host?.[KEY];
    if (!state?.alive || !canvas) return false;
    const gl = state.device.gl;
    gl.bindTexture(gl.TEXTURE_2D, state.read.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    } catch (_e) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      return false;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    return true;
  }

  function presentTo(host, destCtx, plateCss) {
    const state = host?.[KEY];
    if (!state?.alive || !destCtx) return false;
    const device = state.device;
    const gl = device.gl;
    const rw = state.width;
    const rh = state.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, rw, rh);
    gl.scissor(0, 0, rw, rh);
    gl.enable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(device.present.program);
    bindQuad(gl, device.present.aPos, device.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.read.texture);
    gl.uniform1i(device.present.uPlate, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.SCISSOR_TEST);
    destCtx.save();
    destCtx.setTransform(1, 0, 0, 1, 0, 0);
    destCtx.globalCompositeOperation = "copy";
    destCtx.globalAlpha = 1;
    destCtx.imageSmoothingEnabled = false;
    const srcY = Math.max(0, device.canvas.height - rh);
    destCtx.drawImage(device.canvas, 0, srcY, rw, rh, 0, 0, destCtx.canvas.width, destCtx.canvas.height);
    destCtx.restore();
    return true;
  }

  function clear(host, plateCss) {
    const state = host?.[KEY];
    if (!state?.alive) return false;
    const gl = state.device.gl;
    const plate = hexToRgb01(plateCss);
    for (const s of [state.read, state.write]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
      gl.viewport(0, 0, state.width, state.height);
      gl.clearColor(plate[0], plate[1], plate[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  global.TraceRgbTrailsGl = {
    ensure,
    destroy,
    stepFade,
    stampPoints,
    ingestCanvas,
    presentTo,
    clear,
    available: () => Boolean(getShared()),
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
