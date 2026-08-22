// RGB stamp tape — phosphor-stamp geometry, no Ghost / Trail / Burn / LUT.
// Instant Trace waterfall: scroll left, additive RGB dabs, blit to the face.
// Stereo blends in the same buffer (lighter / additive), not a gradient.

(function initTraceTape(global) {
  const MAX_DIM = 4096;
  let device = null;

  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, Number(fallback) || 0));
    }
    return Math.max(0, Math.min(1, n));
  }

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
    if (!vs || !fs) {
      return null;
    }
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

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const COPY_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 uUvOffset;
    void main() {
      vec2 uv = vUv + uUvOffset;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
      }
      gl_FragColor = texture2D(uTexture, uv);
    }
  `;

  const PRESENT_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main() {
      gl_FragColor = texture2D(uTexture, vUv);
    }
  `;

  // Same Meet as TraceStroke.drawStereo: overlap = complement (red+blue→green).
  const MEET_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uLeft;
    uniform sampler2D uRight;
    uniform vec3 uLeftColor;
    uniform vec3 uRightColor;
    uniform vec3 uMeetColor;
    void main() {
      vec4 lt = texture2D(uLeft, vUv);
      vec4 rt = texture2D(uRight, vUv);
      float L = max(lt.r, max(lt.g, lt.b));
      float R = max(rt.r, max(rt.g, rt.b));
      float m = min(L, R);
      vec3 c = (L - m) * uLeftColor + (R - m) * uRightColor + m * uMeetColor;
      float a = max(L, R);
      gl_FragColor = vec4(c, a);
    }
  `;

  const STAMP_VERT = `
    precision highp float;
    attribute vec2 aCenter;
    attribute float aCorner;
    uniform vec2 uCanvasSize;
    uniform float uRadius;
    uniform float uBlur;
    varying vec2 vOffset;
    varying vec2 vUv;
    varying float vRadius;
    varying float vBlur;
    void main() {
      float softAmt = clamp(uBlur, 0.0, 1.0);
      float pad = max(uRadius * mix(1.15, 3.2, softAmt), 1.25);
      vec2 cornerOffset = vec2(
        (aCorner == 0.0 || aCorner == 2.0) ? -1.0 : 1.0,
        (aCorner < 2.0) ? -1.0 : 1.0
      );
      vec2 position = aCenter + cornerOffset * pad;
      vOffset = position - aCenter;
      vUv = cornerOffset * 0.5 + 0.5;
      vRadius = max(uRadius, 0.35);
      vBlur = softAmt;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;

  const STAMP_FRAG = `
    precision highp float;
    uniform vec3 uColor;
    uniform float uBrightness;
    uniform sampler2D uStamp;
    varying vec2 vOffset;
    varying vec2 vUv;
    varying float vRadius;
    varying float vBlur;
    void main() {
      float R = max(vRadius, 0.35);
      float r = length(vOffset);
      vec4 stamp = texture2D(uStamp, vUv);
      float tex = max(stamp.r, max(stamp.g, stamp.b)) * stamp.a;
      if (stamp.a < 0.001) {
        tex = stamp.r;
      }
      float aa = max(0.55, min(1.25, R * 0.06));
      float hard = 1.0 - smoothstep(R - aa, R + aa * 0.25, r);
      float soft = clamp(vBlur, 0.0, 1.0);
      float profile = mix(hard * 0.92, tex * mix(0.78, 0.42, soft), pow(soft, 1.45));
      float e = max(profile, 0.0) * uBrightness;
      gl_FragColor = vec4(uColor * e, e);
    }
  `;

  function bakeGaussian(gl, size = 64) {
    const n = Math.max(8, Math.min(256, Math.round(Number(size) || 64)));
    const data = new Uint8Array(n * n * 4);
    const cx = (n - 1) * 0.5;
    const sigma = n * 0.18;
    const inv = 1 / (2 * sigma * sigma);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const dx = x - cx;
        const dy = y - cx;
        const g = Math.exp(-(dx * dx + dy * dy) * inv);
        const v = Math.round(Math.max(0, Math.min(1, g)) * 255);
        const o = (y * n + x) * 4;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = v;
      }
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  function createSurface(gl, w, h) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!ok) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      return null;
    }
    return { texture, framebuffer, width: w, height: h };
  }

  function destroySurface(gl, surface) {
    if (!gl || !surface) {
      return;
    }
    if (surface.framebuffer) {
      gl.deleteFramebuffer(surface.framebuffer);
    }
    if (surface.texture) {
      gl.deleteTexture(surface.texture);
    }
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
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      return null;
    }
    const copyProgram = link(gl, VERT, COPY_FRAG);
    const presentProgram = link(gl, VERT, PRESENT_FRAG);
    const stampProgram = link(gl, STAMP_VERT, STAMP_FRAG);
    const meetProgram = link(gl, VERT, MEET_FRAG);
    if (!copyProgram || !presentProgram || !stampProgram) {
      return null;
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const stampBuffer = gl.createBuffer();
    device = {
      canvas,
      gl,
      quad,
      stampBuffer,
      stampTexture: bakeGaussian(gl),
      copy: {
        program: copyProgram,
        aPos: gl.getAttribLocation(copyProgram, "aPos"),
        uTexture: gl.getUniformLocation(copyProgram, "uTexture"),
        uUvOffset: gl.getUniformLocation(copyProgram, "uUvOffset"),
      },
      present: {
        program: presentProgram,
        aPos: gl.getAttribLocation(presentProgram, "aPos"),
        uTexture: gl.getUniformLocation(presentProgram, "uTexture"),
      },
      meet: meetProgram ? {
        program: meetProgram,
        aPos: gl.getAttribLocation(meetProgram, "aPos"),
        uLeft: gl.getUniformLocation(meetProgram, "uLeft"),
        uRight: gl.getUniformLocation(meetProgram, "uRight"),
        uLeftColor: gl.getUniformLocation(meetProgram, "uLeftColor"),
        uRightColor: gl.getUniformLocation(meetProgram, "uRightColor"),
        uMeetColor: gl.getUniformLocation(meetProgram, "uMeetColor"),
      } : null,
      stamp: {
        program: stampProgram,
        aCenter: gl.getAttribLocation(stampProgram, "aCenter"),
        aCorner: gl.getAttribLocation(stampProgram, "aCorner"),
        uCanvasSize: gl.getUniformLocation(stampProgram, "uCanvasSize"),
        uRadius: gl.getUniformLocation(stampProgram, "uRadius"),
        uBlur: gl.getUniformLocation(stampProgram, "uBlur"),
        uColor: gl.getUniformLocation(stampProgram, "uColor"),
        uBrightness: gl.getUniformLocation(stampProgram, "uBrightness"),
        uStamp: gl.getUniformLocation(stampProgram, "uStamp"),
      },
      scratch: new Float32Array(0),
    };
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      device = null;
    }, false);
    return device;
  }

  function drawQuad(dev, loc) {
    const gl = dev.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, dev.quad);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function hexToRgb01(hex, fallback = [1, 0.2, 0.2]) {
    const text = String(hex || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return [
        parseInt(text.slice(1, 3), 16) / 255,
        parseInt(text.slice(3, 5), 16) / 255,
        parseInt(text.slice(5, 7), 16) / 255,
      ];
    }
    return fallback.slice();
  }

  function buildStampVertices(pathPoints, radius, blur, maxDots) {
    if (typeof global.nodeGraphPhosphorEnergyGlBuildDotVertices === "function") {
      return global.nodeGraphPhosphorEnergyGlBuildDotVertices(pathPoints, {
        radius,
        blur,
        maxDots,
        fullEconomy: true,
      });
    }
    const pts = Array.isArray(pathPoints) ? pathPoints.filter((p) => p && Number.isFinite(p.x)) : [];
    const corners = [0, 1, 2, 1, 3, 2];
    const out = [];
    for (let i = 0; i < pts.length; i += 1) {
      for (let c = 0; c < corners.length; c += 1) {
        out.push(pts[i].x, pts[i].y, corners[c]);
      }
    }
    return out;
  }

  function ensure(host, width, height, key = "_traceTapeRgb") {
    const dev = getDevice();
    if (!host || !dev) {
      return null;
    }
    const w = Math.max(1, Math.min(MAX_DIM, Math.round(width) || 1));
    const h = Math.max(1, Math.min(MAX_DIM, Math.round(height) || 1));
    let tape = host[key];
    if (tape?.alive && tape.gl === dev.gl && tape.width === w && tape.height === h) {
      return tape;
    }
    if (tape?.alive) {
      destroySurface(dev.gl, tape.read);
      destroySurface(dev.gl, tape.write);
    }
    const read = createSurface(dev.gl, w, h);
    const write = createSurface(dev.gl, w, h);
    if (!read || !write) {
      destroySurface(dev.gl, read);
      destroySurface(dev.gl, write);
      return null;
    }
    const gl = dev.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, read.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    tape = {
      alive: true,
      gl,
      device: dev,
      width: w,
      height: h,
      read,
      write,
    };
    host[key] = tape;
    return tape;
  }

  function clear(tape) {
    if (!tape?.alive || !tape.gl) {
      return false;
    }
    const gl = tape.gl;
    for (const surface of [tape.read, tape.write]) {
      if (!surface?.framebuffer) {
        continue;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
      gl.viewport(0, 0, tape.width, tape.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  function scroll(tape, dxPx) {
    if (!tape?.alive || !tape.device) {
      return false;
    }
    const dx = Math.round(Number(dxPx) || 0);
    if (!dx) {
      return true;
    }
    const dev = tape.device;
    const gl = tape.gl;
    const w = tape.width;
    const h = tape.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tape.write.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(dev.copy.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tape.read.texture);
    gl.uniform1i(dev.copy.uTexture, 0);
    gl.uniform2f(dev.copy.uUvOffset, Math.max(-w, Math.min(w, dx)) / w, 0);
    drawQuad(dev, dev.copy);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const tmp = tape.read;
    tape.read = tape.write;
    tape.write = tmp;
    return true;
  }

  function stamp(tape, options = {}) {
    if (!tape?.alive || !tape.device) {
      return 0;
    }
    const pathPoints = options.pathPoints;
    const radius = Math.max(0.35, Number(options.radius) || 2);
    const blur = clamp01(options.blur, 0.22);
    const brightness = Math.max(0, Number(options.brightness) || 0);
    if (brightness < 1e-6) {
      return 0;
    }
    const vertices = buildStampVertices(
      pathPoints,
      radius,
      blur,
      Math.max(64, Math.min(8192, Math.round(Number(options.maxDots) || 4096))),
    );
    const vertexCount = Math.floor(vertices.length / 3);
    if (vertexCount <= 0) {
      return 0;
    }
    const rgb = Array.isArray(options.rgb) && options.rgb.length >= 3
      ? options.rgb
      : hexToRgb01(options.color);
    const dev = tape.device;
    const gl = tape.gl;
    if (dev.scratch.length < vertices.length) {
      dev.scratch = new Float32Array(vertices.length);
    }
    dev.scratch.set(vertices);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tape.read.framebuffer);
    gl.viewport(0, 0, tape.width, tape.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(dev.stamp.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, dev.stampBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dev.scratch.subarray(0, vertices.length), gl.STREAM_DRAW);
    const stride = 3 * 4;
    gl.enableVertexAttribArray(dev.stamp.aCenter);
    gl.vertexAttribPointer(dev.stamp.aCenter, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(dev.stamp.aCorner);
    gl.vertexAttribPointer(dev.stamp.aCorner, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.uniform2f(dev.stamp.uCanvasSize, tape.width, tape.height);
    gl.uniform1f(dev.stamp.uRadius, radius);
    gl.uniform1f(dev.stamp.uBlur, blur);
    gl.uniform3f(dev.stamp.uColor, rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(dev.stamp.uBrightness, brightness);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dev.stampTexture);
    gl.uniform1i(dev.stamp.uStamp, 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return vertexCount;
  }

  function presentTo(tape, destCtx, options = {}) {
    if (!tape?.alive || !tape.device || !destCtx) {
      return false;
    }
    const dev = tape.device;
    const gl = tape.gl;
    const width = Math.max(1, Number(options.width) || tape.width);
    const height = Math.max(1, Number(options.height) || tape.height);
    if (dev.canvas.width !== width || dev.canvas.height !== height) {
      dev.canvas.width = width;
      dev.canvas.height = height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(dev.present.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tape.read.texture);
    gl.uniform1i(dev.present.uTexture, 0);
    drawQuad(dev, dev.present);
    gl.bindTexture(gl.TEXTURE_2D, null);
    destCtx.save();
    destCtx.globalCompositeOperation = options.composite || "source-over";
    destCtx.imageSmoothingEnabled = options.smooth === true;
    destCtx.drawImage(dev.canvas, 0, 0, width, height);
    destCtx.restore();
    return true;
  }

  function presentMeet(leftTape, rightTape, destCtx, options = {}) {
    if (!leftTape?.alive || !rightTape?.alive || !destCtx) {
      return false;
    }
    const dev = leftTape.device;
    if (!dev?.meet?.program) {
      return false;
    }
    const gl = leftTape.gl;
    const width = Math.max(1, Number(options.width) || leftTape.width);
    const height = Math.max(1, Number(options.height) || leftTape.height);
    if (dev.canvas.width !== width || dev.canvas.height !== height) {
      dev.canvas.width = width;
      dev.canvas.height = height;
    }
    let cL = Array.isArray(options.leftRgb) ? options.leftRgb : hexToRgb01(options.leftColor, [1, 0, 0]);
    let cR = Array.isArray(options.rightRgb) ? options.rightRgb : hexToRgb01(options.rightColor, [0, 0, 1]);
    let cM = Array.isArray(options.meetRgb) ? options.meetRgb : null;
    if (!cM && options.meetColor && options.meetColor !== "auto") {
      cM = hexToRgb01(options.meetColor);
    }
    if (!cM && typeof global.TraceStroke?.meetColorFromPair === "function") {
      cM = global.TraceStroke.meetColorFromPair(cL, cR);
    }
    if (!cM) {
      cM = [
        Math.max(0, 1 - cL[0] - cR[0]),
        Math.max(0, 1 - cL[1] - cR[1]),
        Math.max(0, 1 - cL[2] - cR[2]),
      ];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(dev.meet.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, leftTape.read.texture);
    gl.uniform1i(dev.meet.uLeft, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rightTape.read.texture);
    gl.uniform1i(dev.meet.uRight, 1);
    gl.uniform3f(dev.meet.uLeftColor, cL[0], cL[1], cL[2]);
    gl.uniform3f(dev.meet.uRightColor, cR[0], cR[1], cR[2]);
    gl.uniform3f(dev.meet.uMeetColor, cM[0], cM[1], cM[2]);
    drawQuad(dev, dev.meet);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    destCtx.save();
    destCtx.globalCompositeOperation = "source-over";
    destCtx.imageSmoothingEnabled = options.smooth === true;
    destCtx.drawImage(dev.canvas, 0, 0, width, height);
    destCtx.restore();
    return true;
  }

  function radiusFromSize(faceMinSide, size01) {
    if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.radiusFromSize) {
      return PhosphorDrawer.radiusFromSize(faceMinSide, size01);
    }
    return Math.max(0.35, Math.max(1, Number(faceMinSide) || 1) * clamp01(size01, 0.035) * 0.5);
  }

  global.TraceTape = {
    ensure,
    clear,
    scroll,
    stamp,
    presentTo,
    presentMeet,
    radiusFromSize,
    hexToRgb01,
  };
})(typeof window !== "undefined" ? window : globalThis);
