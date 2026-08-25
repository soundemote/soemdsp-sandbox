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

  // Disc stamp. Size = outer radius R (never grows with blur).
  // blur 0 = hard pixel disc; blur 1 = smoothstep center → edge at R.
  const STAMP_VERT = `
    precision highp float;
    attribute vec2 aCenter;
    attribute float aCorner;
    uniform vec2 uCanvasSize;
    uniform float uRadius;
    uniform float uBlur;
    varying vec2 vOffset;
    varying float vRadius;
    varying float vBlur;
    void main() {
      float R = max(uRadius, 0.35);
      float pad = R + 1.0;
      vec2 cornerOffset = vec2(
        (aCorner == 0.0 || aCorner == 2.0) ? -1.0 : 1.0,
        (aCorner < 2.0) ? -1.0 : 1.0
      );
      vec2 position = aCenter + cornerOffset * pad;
      vOffset = position - aCenter;
      vRadius = R;
      vBlur = clamp(uBlur, 0.0, 1.0);
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
    varying vec2 vOffset;
    varying float vRadius;
    varying float vBlur;
    void main() {
      float R = max(vRadius, 0.35);
      float soft = clamp(vBlur, 0.0, 1.0);
      float t = length(vOffset) / R;
      float e;
      if (soft < 0.02) {
        e = t < 0.999 ? 1.0 : 0.0;
      } else {
        // Knee pulls inward with blur; at 1.0 falloff starts at center.
        float knee = (1.0 - soft) * (1.0 - soft) * 0.92;
        if (t <= knee) e = 1.0;
        else if (t >= 1.0) e = 0.0;
        else {
          float u = (t - knee) / max(1e-6, 1.0 - knee);
          float s = u * u * (3.0 - 2.0 * u);
          e = 1.0 - s;
        }
      }
      e *= max(uBrightness, 0.0);
      if (e <= 0.001) discard;
      gl_FragColor = vec4(uColor * e, e);
    }
  `;

  // XYZ three-channel Meet (inclusion / complement pairs).
  const MEET3_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uA;
    uniform sampler2D uB;
    uniform sampler2D uC;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    uniform vec3 uMeetAB;
    uniform vec3 uMeetAC;
    uniform vec3 uMeetBC;
    uniform vec3 uMeetAll;
    float cov(vec4 t) { return max(t.r, max(t.g, t.b)); }
    void main() {
      float a = cov(texture2D(uA, vUv));
      float b = cov(texture2D(uB, vUv));
      float c = cov(texture2D(uC, vUv));
      float ab = min(a, b);
      float ac = min(a, c);
      float bc = min(b, c);
      float t = min(ab, c);
      float onlyA = a - ab - ac + t;
      float onlyB = b - ab - bc + t;
      float onlyC = c - ac - bc + t;
      vec3 rgb = onlyA * uColorA + onlyB * uColorB + onlyC * uColorC
        + (ab - t) * uMeetAB + (ac - t) * uMeetAC + (bc - t) * uMeetBC
        + t * uMeetAll;
      float alpha = max(a, max(b, c));
      if (alpha <= 0.001) discard;
      gl_FragColor = vec4(rgb, alpha);
    }
  `;

  function createSurface(gl, w, h) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // NEAREST: integer-pixel scroll stays crisp (LINEAR smeared Sync-Off tape).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
    const meet3Program = link(gl, VERT, MEET3_FRAG);
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
      meet3: meet3Program ? {
        program: meet3Program,
        aPos: gl.getAttribLocation(meet3Program, "aPos"),
        uA: gl.getUniformLocation(meet3Program, "uA"),
        uB: gl.getUniformLocation(meet3Program, "uB"),
        uC: gl.getUniformLocation(meet3Program, "uC"),
        uColorA: gl.getUniformLocation(meet3Program, "uColorA"),
        uColorB: gl.getUniformLocation(meet3Program, "uColorB"),
        uColorC: gl.getUniformLocation(meet3Program, "uColorC"),
        uMeetAB: gl.getUniformLocation(meet3Program, "uMeetAB"),
        uMeetAC: gl.getUniformLocation(meet3Program, "uMeetAC"),
        uMeetBC: gl.getUniformLocation(meet3Program, "uMeetBC"),
        uMeetAll: gl.getUniformLocation(meet3Program, "uMeetAll"),
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

  function buildStampVertices(pathPoints, radius, blur, maxDots, options = {}) {
    const corners = [0, 1, 2, 1, 3, 2];
    const cap = Math.max(1, Math.min(8192, Math.floor(Number(maxDots) || 2048)));
    const out = [];
    let stamps = 0;
    const push = (x, y) => {
      if (stamps >= cap) {
        return false;
      }
      for (let c = 0; c < corners.length; c += 1) {
        out.push(x, y, corners[c]);
      }
      stamps += 1;
      return true;
    };
    const raw = Array.isArray(pathPoints) ? pathPoints : [];
    // Dot density: 0.5 = recommended (~0.65×R), 1.0 = 2× that (half spacing),
    // 0 = near-empty (~4000× default gap; path samples skipped across frames).
    let spacing;
    if (Number(options.spacingPx) > 0) {
      spacing = Math.max(0.25, Number(options.spacingPx));
    } else {
      const density = clamp01(options.stampDensity ?? options.dotDensity ?? 0.5, 0.5);
      const r = Math.max(0.5, Number(radius) || 2);
      const spacingDefault = Math.max(0.75, r * 0.65);
      // relativeDensity: 0.5→1, 1→2, 0→1/4000.
      const relativeDensity = Math.max(1 / 4000, density * 2);
      spacing = Math.max(0.25, spacingDefault / relativeDensity);
    }
    // Accrue arc length; only stamp when traveled ≥ spacing.
    // `stampContinue` + `stampCarry` let waterfall strips span frames without
    // re-dabbing every strip's first sample (which made density 0 look dense).
    let prev = null;
    let carry = Number(options.stampCarry);
    if (!Number.isFinite(carry) || carry < 0) {
      carry = 0;
    }
    let continuing = Boolean(options.stampContinue);
    let full = false;
    for (let i = 0; i < raw.length; i += 1) {
      const p = raw[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        prev = null;
        carry = 0;
        continuing = false;
        continue;
      }
      if (!prev) {
        if (!continuing) {
          if (!push(p.x, p.y)) {
            full = true;
            break;
          }
          carry = 0;
        }
        continuing = true;
        prev = { x: p.x, y: p.y };
        continue;
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-4) {
        prev = { x: p.x, y: p.y };
        continue;
      }
      let traveled = 0;
      while (carry + (dist - traveled) >= spacing - 1e-6) {
        const need = spacing - carry;
        traveled += need;
        const t = traveled / dist;
        const x = prev.x + dx * t;
        const y = prev.y + dy * t;
        if (!push(x, y)) {
          full = true;
          carry = 0;
          prev = { x, y };
          break;
        }
        carry = 0;
      }
      if (full) {
        break;
      }
      carry += dist - traveled;
      prev = { x: p.x, y: p.y };
    }
    return { vertices: out, stamps, carry, continuing: Boolean(prev), spacing };
  }

  /** Grow the shared GL canvas; never shrink (resize was ~frame-budget each present). */
  function ensurePresentSize(dev, width, height) {
    const w = Math.max(1, Math.min(MAX_DIM, Math.round(width) || 1));
    const h = Math.max(1, Math.min(MAX_DIM, Math.round(height) || 1));
    const cw = Math.max(dev.canvas.width || 1, w);
    const ch = Math.max(dev.canvas.height || 1, h);
    if (dev.canvas.width !== cw || dev.canvas.height !== ch) {
      dev.canvas.width = cw;
      dev.canvas.height = ch;
    }
    return { w, h, cw, ch };
  }

  function bindPresentViewport(gl, cw, ch, w, h) {
    // 2D canvas origin is top-left; WebGL viewport y is from the bottom.
    const y = Math.max(0, ch - h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, y, w, h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, y, w, h);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
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
    const previous = (tape?.alive && tape.gl === dev.gl) ? tape : null;
    const read = createSurface(dev.gl, w, h);
    const write = createSurface(dev.gl, w, h);
    if (!read || !write) {
      destroySurface(dev.gl, read);
      destroySurface(dev.gl, write);
      return previous || null;
    }
    const gl = dev.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, read.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    if (previous?.read?.texture) {
      // Stretch prior ink into the new size — resize must not wipe history.
      gl.useProgram(dev.present.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, previous.read.texture);
      gl.uniform1i(dev.present.uTexture, 0);
      drawQuad(dev, dev.present);
      gl.bindTexture(gl.TEXTURE_2D, null);
    } else {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (previous) {
      destroySurface(dev.gl, previous.read);
      destroySurface(dev.gl, previous.write);
    }
    tape = {
      alive: true,
      gl,
      device: dev,
      width: w,
      height: h,
      read,
      write,
      stampCarry: previous?.stampCarry || 0,
      stampContinue: Boolean(previous?.stampContinue),
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
    tape.stampCarry = 0;
    tape.stampContinue = false;
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
    const blur = clamp01(options.blur, 0);
    const brightness = Math.max(0, Number(options.brightness) ?? 1);
    if (brightness < 1e-6) {
      return 0;
    }
    const built = buildStampVertices(
      pathPoints,
      radius,
      blur,
      Math.max(8, Math.min(8192, Math.round(Number(options.maxDots) || 4096))),
      {
        ...options,
        stampCarry: tape.stampCarry,
        stampContinue: tape.stampContinue,
      },
    );
    tape.stampCarry = built.carry;
    tape.stampContinue = built.continuing;
    const vertices = built.vertices;
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
    // Premultiplied additive stamps (same for Add guns / coverage tapes).
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
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
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
    const size = ensurePresentSize(dev, width, height);
    bindPresentViewport(gl, size.cw, size.ch, size.w, size.h);
    gl.useProgram(dev.present.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tape.read.texture);
    gl.uniform1i(dev.present.uTexture, 0);
    drawQuad(dev, dev.present);
    gl.bindTexture(gl.TEXTURE_2D, null);
    destCtx.save();
    destCtx.globalCompositeOperation = options.composite || "source-over";
    destCtx.imageSmoothingEnabled = options.smooth === true;
    destCtx.drawImage(dev.canvas, 0, 0, size.w, size.h, 0, 0, size.w, size.h);
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
    const size = ensurePresentSize(dev, width, height);
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
    bindPresentViewport(gl, size.cw, size.ch, size.w, size.h);
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
    destCtx.drawImage(dev.canvas, 0, 0, size.w, size.h, 0, 0, size.w, size.h);
    destCtx.restore();
    return true;
  }

  function meetPair(a, b) {
    if (typeof global.TraceStroke?.meetColorFromPair === "function") {
      return global.TraceStroke.meetColorFromPair(a, b);
    }
    return [
      Math.max(0, 1 - a[0] - b[0]),
      Math.max(0, 1 - a[1] - b[1]),
      Math.max(0, 1 - a[2] - b[2]),
    ];
  }

  function presentMeet3(tapeA, tapeB, tapeC, destCtx, options = {}) {
    if (!tapeA?.alive || !tapeB?.alive || !tapeC?.alive || !destCtx) {
      return false;
    }
    const dev = tapeA.device;
    if (!dev?.meet3?.program) {
      return false;
    }
    const gl = tapeA.gl;
    const width = Math.max(1, Number(options.width) || tapeA.width);
    const height = Math.max(1, Number(options.height) || tapeA.height);
    const size = ensurePresentSize(dev, width, height);
    const cA = Array.isArray(options.rgbA) ? options.rgbA : hexToRgb01(options.colorA, [1, 0, 0]);
    const cB = Array.isArray(options.rgbB) ? options.rgbB : hexToRgb01(options.colorB, [0, 0, 1]);
    const cC = Array.isArray(options.rgbC) ? options.rgbC : hexToRgb01(options.colorC, [0, 1, 0]);
    const mAB = meetPair(cA, cB);
    const mAC = meetPair(cA, cC);
    const mBC = meetPair(cB, cC);
    const mAll = [
      1 - (1 - cA[0]) * (1 - cB[0]) * (1 - cC[0]),
      1 - (1 - cA[1]) * (1 - cB[1]) * (1 - cC[1]),
      1 - (1 - cA[2]) * (1 - cB[2]) * (1 - cC[2]),
    ];
    bindPresentViewport(gl, size.cw, size.ch, size.w, size.h);
    gl.useProgram(dev.meet3.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tapeA.read.texture);
    gl.uniform1i(dev.meet3.uA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tapeB.read.texture);
    gl.uniform1i(dev.meet3.uB, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tapeC.read.texture);
    gl.uniform1i(dev.meet3.uC, 2);
    gl.uniform3f(dev.meet3.uColorA, cA[0], cA[1], cA[2]);
    gl.uniform3f(dev.meet3.uColorB, cB[0], cB[1], cB[2]);
    gl.uniform3f(dev.meet3.uColorC, cC[0], cC[1], cC[2]);
    gl.uniform3f(dev.meet3.uMeetAB, mAB[0], mAB[1], mAB[2]);
    gl.uniform3f(dev.meet3.uMeetAC, mAC[0], mAC[1], mAC[2]);
    gl.uniform3f(dev.meet3.uMeetBC, mBC[0], mBC[1], mBC[2]);
    gl.uniform3f(dev.meet3.uMeetAll, mAll[0], mAll[1], mAll[2]);
    drawQuad(dev, dev.meet3);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    destCtx.save();
    destCtx.globalCompositeOperation = "source-over";
    destCtx.imageSmoothingEnabled = options.smooth === true;
    destCtx.drawImage(dev.canvas, 0, 0, size.w, size.h, 0, 0, size.w, size.h);
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
    presentMeet3,
    radiusFromSize,
    hexToRgb01,
    meetPair,
  };
})(typeof window !== "undefined" ? window : globalThis);
