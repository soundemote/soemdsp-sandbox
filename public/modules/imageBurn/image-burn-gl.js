// Image Ghost — dedicated WebGL residual (NOT phosphor Ghost/Trail).
//
// One residual buffer. Four knobs, one job each:
//   Hang     — how long the residual lasts (base keep; 1 = freeze)
//   Burn     — how hard highlights outlast darks (keep spread)
//   Contrast — which luma counts as highlight (gate power)
//   Blur     — spatial bloom recirculation
//
// Constraints learned the hard way:
//   • Never resize the shared GL canvas after init (wipes FBOs/textures)
//   • Residual size = face pixels (uniform fit if over GPU max) — no 2× hacks
//   • No dither into the residual, no mipmap tricks
//   • Dry flash is composited in 2D after present (so Image never hides burn)
//   • Deposit is prev+stamp in one pass (no float FBO blending)

(function initNodeGraphImageBurnGl(global) {
  const MAX_DIM = 4096;
  const KEY = "_imageBurnGl";

  let sharedDevice = null;

  function clamp01(v, fallback = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, Number(fallback) || 0));
    }
    return Math.max(0, Math.min(1, n));
  }

  function glSizeCap(gl) {
    if (!gl) return MAX_DIM;
    const tex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || MAX_DIM;
    const rb = Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || tex;
    return Math.max(256, Math.min(MAX_DIM, tex, rb));
  }

  function fitDims(width, height, maxDim) {
    let w = Math.max(1, Math.round(Number(width) || 1));
    let h = Math.max(1, Math.round(Number(height) || 1));
    const longest = Math.max(w, h);
    const cap = Math.max(1, Number(maxDim) || MAX_DIM);
    if (longest > cap) {
      const s = cap / longest;
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
    return { w, h };
  }

  /** Hang 0…1 → keep. Hang=1 freezes; mid values still linger. */
  function hangToKeep(hang01) {
    const h = clamp01(hang01);
    if (h >= 1) return 1;
    return 1 - Math.pow(1 - h, 3);
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("[image-burn-gl] shader compile failed", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function linkProgram(gl, vsSource, fsSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[image-burn-gl] program link failed", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  // Hang = base keep. Burn = dark↔bright keep spread (luma-weighted).
  const FADE_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uColor;
    uniform float uHangKeep;
    uniform float uBurn;
    void main() {
      vec3 c = texture2D(uColor, vUv).rgb;
      float luma = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0);
      float hang = clamp(uHangKeep, 0.0, 1.0);
      float burn = clamp(uBurn, 0.0, 1.0);
      // Hang is the floor for every pixel. Burn only extends highlight linger —
      // never multiplies darks below Hang (that made Hang 0.9 + Burn 0.2 flash-and-die).
      float darkKeep = hang;
      float brightKeep = mix(hang, 0.9995, burn);
      float keep = mix(darkKeep, brightKeep, clamp(luma, 0.0, 1.0));
      gl_FragColor = vec4(max(c * keep, 0.0), 1.0);
    }
  `;

  // Blur only. mix/sigma from Blur; 0 → identity.
  const BLUR_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uColor;
    uniform vec2 uTexel;
    uniform vec2 uDirection;
    uniform float uSigma;
    uniform float uMix;
    void main() {
      vec3 center = texture2D(uColor, vUv).rgb;
      float mixAmt = clamp(uMix, 0.0, 1.0);
      float sigma = max(uSigma, 1e-4);
      float s2 = sigma * sigma;
      float w0 = 1.0;
      float w1 = exp(-0.5 / s2);
      float w2 = exp(-2.0 / s2);
      float w3 = exp(-4.5 / s2);
      float w4 = exp(-8.0 / s2);
      float wSum = w0 + 2.0 * (w1 + w2 + w3 + w4);
      vec2 stepV = uTexel * uDirection;
      vec3 acc = center * w0;
      acc += (texture2D(uColor, vUv + stepV).rgb + texture2D(uColor, vUv - stepV).rgb) * w1;
      acc += (texture2D(uColor, vUv + stepV * 2.0).rgb + texture2D(uColor, vUv - stepV * 2.0).rgb) * w2;
      acc += (texture2D(uColor, vUv + stepV * 3.0).rgb + texture2D(uColor, vUv - stepV * 3.0).rgb) * w3;
      acc += (texture2D(uColor, vUv + stepV * 4.0).rgb + texture2D(uColor, vUv - stepV * 4.0).rgb) * w4;
      acc /= wSum;
      gl_FragColor = vec4(mix(center, acc, mixAmt), 1.0);
    }
  `;

  // Deposit: Feedback >0 adds (accumulate); ≤0 max-blends (ceiling at stamp, no stack).
  // Contrast is first on the source: 0→unchanged, 2→crush mid/lows (protect highs).
  const DEPOSIT_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uResidual;
    uniform sampler2D uImage;
    uniform vec4 uRect;
    uniform float uGain;
    uniform float uContrast;
    uniform float uAccumulate;
    vec3 applyContrast(vec3 c, float contrast) {
      // Full 0…2 dial: 0 = unchanged, 2 = max mid/low → black (highs protected).
      float amt = clamp(contrast, 0.0, 2.0) * 0.5;
      if (amt < 1e-6) {
        return c;
      }
      float luma = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0);
      if (luma < 1e-6) {
        return vec3(0.0);
      }
      float protect = smoothstep(0.28, 0.83, luma);
      float crushed = pow(luma, 1.0 + amt * 4.5);
      float newL = mix(crushed, luma, protect * protect);
      return c * (newL / luma);
    }
    void main() {
      vec3 prev = max(texture2D(uResidual, vUv).rgb, 0.0);
      vec3 stamp = vec3(0.0);
      vec2 local = (vUv - uRect.xy) / max(uRect.zw, vec2(1e-5));
      if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0) {
        vec4 tex = texture2D(uImage, local);
        vec3 c = applyContrast(tex.rgb * tex.a, uContrast);
        stamp = c * max(uGain, 0.0);
      }
      // Additive climbs forever; max fills hang up to one stamp and stops.
      vec3 outC = uAccumulate > 0.5 ? (prev + stamp) : max(prev, stamp);
      gl_FragColor = vec4(outC, 1.0);
    }
  `;

  // Present residual. Linear at ≤1 so Hang matches flash brightness;
  // soft-film only compresses HDR accumulate above 1.
  const PRESENT_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uResidual;
    void main() {
      vec3 raw = max(texture2D(uResidual, vUv).rgb, 0.0);
      vec3 outC = vec3(
        raw.r <= 1.0 ? raw.r : 1.0 + (raw.r - 1.0) / (1.0 + (raw.r - 1.0) * 0.35),
        raw.g <= 1.0 ? raw.g : 1.0 + (raw.g - 1.0) / (1.0 + (raw.g - 1.0) * 0.35),
        raw.b <= 1.0 ? raw.b : 1.0 + (raw.b - 1.0) / (1.0 + (raw.b - 1.0) * 0.35)
      );
      float a = clamp(max(max(outC.r, outC.g), outC.b), 0.0, 1.0);
      gl_FragColor = vec4(clamp(outC, 0.0, 1.0), a);
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

  function textureFormats(gl) {
    if (!gl) return [];
    if (!gl._imageBurnTextureFormats) {
      const halfFloat = gl.getExtension("OES_texture_half_float");
      const halfFloatLinear = gl.getExtension("OES_texture_half_float_linear");
      const colorBufferHalfFloat = gl.getExtension("EXT_color_buffer_half_float");
      const floatTex = gl.getExtension("OES_texture_float");
      const floatLinear = gl.getExtension("OES_texture_float_linear");
      const colorBufferFloat = gl.getExtension("WEBGL_color_buffer_float")
        || gl.getExtension("EXT_color_buffer_float");
      // WebGL2 sized formats
      const isWebGL2 = typeof WebGL2RenderingContext !== "undefined"
        && gl instanceof WebGL2RenderingContext;
      const formats = [];
      if (isWebGL2) {
        formats.push({
          internal: gl.RGBA16F,
          format: gl.RGBA,
          type: gl.HALF_FLOAT,
          filter: gl.LINEAR,
          label: "rgba16f",
        });
      }
      if (halfFloat && colorBufferHalfFloat) {
        formats.push({
          internal: gl.RGBA,
          format: gl.RGBA,
          type: halfFloat.HALF_FLOAT_OES,
          filter: halfFloatLinear ? gl.LINEAR : gl.NEAREST,
          label: "rgba16f",
        });
      }
      if (floatTex && colorBufferFloat) {
        formats.push({
          internal: gl.RGBA,
          format: gl.RGBA,
          type: gl.FLOAT,
          filter: floatLinear ? gl.LINEAR : gl.NEAREST,
          label: "rgba32f",
        });
      }
      formats.push({
        internal: gl.RGBA,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        filter: gl.LINEAR,
        label: "rgba8",
      });
      gl._imageBurnTextureFormats = formats;
    }
    return gl._imageBurnTextureFormats;
  }

  function createSurface(gl, w, h) {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    for (const format of textureFormats(gl)) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, format.filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, format.filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      try {
        gl.texImage2D(
          gl.TEXTURE_2D, 0,
          format.internal || gl.RGBA,
          width, height, 0,
          format.format || gl.RGBA,
          format.type || gl.UNSIGNED_BYTE,
          null,
        );
      } catch (_e) {
        gl.deleteTexture(texture);
        continue;
      }
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      if (ok) {
        return {
          texture,
          framebuffer,
          width,
          height,
          label: format.label || "rgba8",
        };
      }
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    }
    return null;
  }

  function destroySurface(gl, surface) {
    if (!surface || !gl) return;
    if (surface.framebuffer) gl.deleteFramebuffer(surface.framebuffer);
    if (surface.texture) gl.deleteTexture(surface.texture);
  }

  function createQuad(gl) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    return buffer;
  }

  function bindQuad(gl, loc, quad) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function swap(renderer) {
    const tmp = renderer.read;
    renderer.read = renderer.write;
    renderer.write = tmp;
  }

  function getSharedDevice() {
    if (sharedDevice?.gl && !sharedDevice.gl.isContextLost()) {
      return sharedDevice;
    }
    sharedDevice = null;
    const canvas = document.createElement("canvas");
    // Fixed size forever — resizing resets the entire GL context.
    canvas.width = MAX_DIM;
    canvas.height = MAX_DIM;
    const attrs = {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    };
    const gl = canvas.getContext("webgl2", attrs)
      || canvas.getContext("webgl", attrs)
      || canvas.getContext("experimental-webgl", attrs);
    if (!gl) return null;

    const fadeProgram = linkProgram(gl, VERT, FADE_FRAG);
    const blurProgram = linkProgram(gl, VERT, BLUR_FRAG);
    const depositProgram = linkProgram(gl, VERT, DEPOSIT_FRAG);
    const presentProgram = linkProgram(gl, VERT, PRESENT_FRAG);
    const copyProgram = linkProgram(gl, VERT, COPY_FRAG);
    if (!fadeProgram || !blurProgram || !depositProgram || !presentProgram || !copyProgram) {
      console.warn("[image-burn-gl] core programs failed to link");
      return null;
    }

    const quad = createQuad(gl);
    sharedDevice = {
      canvas,
      gl,
      quad,
      fade: {
        program: fadeProgram,
        aPos: gl.getAttribLocation(fadeProgram, "aPos"),
        uColor: gl.getUniformLocation(fadeProgram, "uColor"),
        uHangKeep: gl.getUniformLocation(fadeProgram, "uHangKeep"),
        uBurn: gl.getUniformLocation(fadeProgram, "uBurn"),
      },
      blur: {
        program: blurProgram,
        aPos: gl.getAttribLocation(blurProgram, "aPos"),
        uColor: gl.getUniformLocation(blurProgram, "uColor"),
        uTexel: gl.getUniformLocation(blurProgram, "uTexel"),
        uDirection: gl.getUniformLocation(blurProgram, "uDirection"),
        uSigma: gl.getUniformLocation(blurProgram, "uSigma"),
        uMix: gl.getUniformLocation(blurProgram, "uMix"),
      },
      deposit: {
        program: depositProgram,
        aPos: gl.getAttribLocation(depositProgram, "aPos"),
        uResidual: gl.getUniformLocation(depositProgram, "uResidual"),
        uImage: gl.getUniformLocation(depositProgram, "uImage"),
        uRect: gl.getUniformLocation(depositProgram, "uRect"),
        uGain: gl.getUniformLocation(depositProgram, "uGain"),
        uContrast: gl.getUniformLocation(depositProgram, "uContrast"),
        uAccumulate: gl.getUniformLocation(depositProgram, "uAccumulate"),
      },
      present: {
        program: presentProgram,
        aPos: gl.getAttribLocation(presentProgram, "aPos"),
        uResidual: gl.getUniformLocation(presentProgram, "uResidual"),
      },
      copy: {
        program: copyProgram,
        aPos: gl.getAttribLocation(copyProgram, "aPos"),
        uTexture: gl.getUniformLocation(copyProgram, "uTexture"),
      },
    };
    return sharedDevice;
  }

  function createRenderer(width, height) {
    const device = getSharedDevice();
    if (!device) return null;
    const { gl } = device;
    const { w, h } = fitDims(width, height, glSizeCap(gl));
    const surfaceA = createSurface(gl, w, h);
    const surfaceB = createSurface(gl, w, h);
    if (!surfaceA || !surfaceB) {
      destroySurface(gl, surfaceA);
      destroySurface(gl, surfaceB);
      return null;
    }
    const imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceA.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceB.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
      canvas: device.canvas,
      gl,
      device,
      width: w,
      height: h,
      read: surfaceA,
      write: surfaceB,
      imageTexture,
      imageUrl: "",
      imageNatW: 0,
      imageNatH: 0,
      alive: true,
      formatLabel: surfaceA.label,
    };
  }

  function destroyRenderer(renderer) {
    if (!renderer?.alive) return;
    const { gl } = renderer;
    destroySurface(gl, renderer.read);
    destroySurface(gl, renderer.write);
    if (renderer.imageTexture) gl.deleteTexture(renderer.imageTexture);
    renderer.read = null;
    renderer.write = null;
    renderer.imageTexture = null;
    renderer.alive = false;
  }

  function ensureSize(renderer, width, height) {
    if (!renderer?.alive) return null;
    const { w, h } = fitDims(width, height, glSizeCap(renderer.gl));
    if (renderer.width === w && renderer.height === h) return renderer;
    const { gl, device } = renderer;
    const nextA = createSurface(gl, w, h);
    const nextB = createSurface(gl, w, h);
    if (!nextA || !nextB) {
      destroySurface(gl, nextA);
      destroySurface(gl, nextB);
      return renderer;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, nextA.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(device.copy.program);
    bindQuad(gl, device.copy.aPos, device.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderer.read.texture);
    gl.uniform1i(device.copy.uTexture, 0);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, nextB.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    destroySurface(gl, renderer.read);
    destroySurface(gl, renderer.write);
    renderer.read = nextA;
    renderer.write = nextB;
    renderer.width = w;
    renderer.height = h;
    renderer.formatLabel = nextA.label;
    renderer.imageUrl = "";
    return renderer;
  }

  function ensure(host, width, height) {
    if (!host) return null;
    let renderer = host[KEY];
    if (renderer?.alive && renderer.gl && !renderer.gl.isContextLost()) {
      return ensureSize(renderer, width, height);
    }
    if (renderer) {
      destroyRenderer(renderer);
      host[KEY] = null;
    }
    renderer = createRenderer(width, height);
    if (!renderer) return null;
    host[KEY] = renderer;
    return renderer;
  }

  function clear(host) {
    const renderer = host?.[KEY];
    if (!renderer?.alive) return;
    const { gl } = renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.read.framebuffer);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.write.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function uploadImage(renderer, img, url) {
    if (!renderer?.alive || !img?.complete || !(img.naturalWidth > 0)) {
      return false;
    }
    const key = String(url || img.src || "");
    if (renderer.imageUrl === key && renderer.imageNatW === img.naturalWidth) {
      return true;
    }
    const { gl } = renderer;
    const maxTex = glSizeCap(gl);
    let src = img;
    let natW = img.naturalWidth;
    let natH = img.naturalHeight;
    if (Math.max(natW, natH) > maxTex) {
      const s = maxTex / Math.max(natW, natH);
      const tw = Math.max(1, Math.round(natW * s));
      const th = Math.max(1, Math.round(natH * s));
      let c = renderer._imageUploadCanvas;
      if (!c) {
        c = document.createElement("canvas");
        renderer._imageUploadCanvas = c;
      }
      c.width = tw;
      c.height = th;
      const c2d = c.getContext("2d");
      if (c2d) {
        c2d.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in c2d) c2d.imageSmoothingQuality = "high";
        c2d.drawImage(img, 0, 0, tw, th);
        src = c;
        natW = tw;
        natH = th;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, renderer.imageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (_e) {
      gl.bindTexture(gl.TEXTURE_2D, null);
      return false;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    renderer.imageUrl = key;
    renderer.imageNatW = natW;
    renderer.imageNatH = natH;
    return true;
  }

  /** Contain-fit stamp rect in UV (same math as 2D dest rect). */
  function imageRectUv(renderer, imageSize) {
    // Soft layout guard only — Size dial range is owned by param metadata.
    const size = Math.max(0, Math.min(64, Number(imageSize) || 1));
    const faceW = Math.max(1, renderer.width || 1);
    const faceH = Math.max(1, renderer.height || 1);
    const natW = Math.max(1, renderer.imageNatW || 1);
    const natH = Math.max(1, renderer.imageNatH || 1);
    if (!(size > 0)) return [0, 0, 0, 0];
    const availW = Math.max(1, faceW * size);
    const availH = Math.max(1, faceH * size);
    const imgAspect = natW / natH;
    const boxAspect = availW / availH;
    let destW;
    let destH;
    if (imgAspect > boxAspect) {
      destW = availW;
      destH = availW / imgAspect;
    } else {
      destH = availH;
      destW = availH * imgAspect;
    }
    return [
      (faceW - destW) * 0.5 / faceW,
      (faceH - destH) * 0.5 / faceH,
      destW / faceW,
      destH / faceH,
    ];
  }

  function blurParams(blur01, width, height) {
    const a = clamp01(blur01);
    const px = Math.pow(a, 1.15) * 8.0;
    const minSide = Math.max(1, Math.min(width, height));
    return {
      sigma: Math.max(1e-4, px * (minSide / 256)),
      mix: Math.pow(a, 0.9),
    };
  }

  function drawPass(renderer, programBag, setup) {
    const { gl, device } = renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.write.framebuffer);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.useProgram(programBag.program);
    bindQuad(gl, programBag.aPos, device.quad);
    setup(gl, programBag);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    swap(renderer);
  }

  function step(host, options = {}) {
    const renderer = host?.[KEY];
    if (!renderer?.alive) return false;
    if (options.paused) return true;

    const hangKeep = hangToKeep(options.hang);
    const burn = clamp01(options.burn);
    const contrast = Math.max(0, Math.min(2, Number(options.contrast)));
    const contrastAmt = Number.isFinite(contrast) ? contrast : 0;
    const blur = clamp01(options.blur);
    const deposit = Math.max(0, Number(options.deposit) || 0);
    const accumulate = Boolean(options.accumulate);
    const img = options.image;
    const { gl, device } = renderer;

    // 1) Hang + Burn fade
    drawPass(renderer, device.fade, (g, p) => {
      g.disable(g.BLEND);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, renderer.read.texture);
      g.uniform1i(p.uColor, 0);
      g.uniform1f(p.uHangKeep, hangKeep);
      g.uniform1f(p.uBurn, burn);
    });

    // 2) Blur
    {
      const { sigma, mix: mixAmt } = blurParams(blur, renderer.width, renderer.height);
      const texel = [1 / renderer.width, 1 / renderer.height];
      drawPass(renderer, device.blur, (g, p) => {
        g.disable(g.BLEND);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, renderer.read.texture);
        g.uniform1i(p.uColor, 0);
        g.uniform2f(p.uTexel, texel[0], texel[1]);
        g.uniform2f(p.uDirection, 1, 0);
        g.uniform1f(p.uSigma, sigma);
        g.uniform1f(p.uMix, mixAmt);
      });
      drawPass(renderer, device.blur, (g, p) => {
        g.disable(g.BLEND);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, renderer.read.texture);
        g.uniform1i(p.uColor, 0);
        g.uniform2f(p.uTexel, texel[0], texel[1]);
        g.uniform2f(p.uDirection, 0, 1);
        g.uniform1f(p.uSigma, sigma);
        g.uniform1f(p.uMix, mixAmt);
      });
    }

    // 3) Deposit (Feedback >0 adds; ≤0 max-blends so brightness cannot stack)
    if (deposit > 0 && img && uploadImage(renderer, img, options.dataUrl || img.src)) {
      const rect = imageRectUv(renderer, options.imageSize);
      drawPass(renderer, device.deposit, (g, p) => {
        g.disable(g.BLEND);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, renderer.read.texture);
        g.uniform1i(p.uResidual, 0);
        g.activeTexture(g.TEXTURE1);
        g.bindTexture(g.TEXTURE_2D, renderer.imageTexture);
        g.uniform1i(p.uImage, 1);
        g.uniform4f(p.uRect, rect[0], rect[1], rect[2], rect[3]);
        g.uniform1f(p.uGain, deposit);
        g.uniform1f(p.uContrast, contrastAmt);
        g.uniform1f(p.uAccumulate, accumulate ? 1.0 : 0.0);
      });
    }

    return true;
  }

  function presentTo(host, destCtx, width, height) {
    const renderer = host?.[KEY];
    if (!renderer?.alive || !destCtx) return false;
    const { gl, device } = renderer;
    const destW = Math.max(1, Math.round(width) || renderer.width);
    const destH = Math.max(1, Math.round(height) || renderer.height);
    const rw = renderer.width;
    const rh = renderer.height;

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
    gl.bindTexture(gl.TEXTURE_2D, renderer.read.texture);
    gl.uniform1i(device.present.uResidual, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.SCISSOR_TEST);

    destCtx.save();
    destCtx.setTransform(1, 0, 0, 1, 0, 0);
    destCtx.globalCompositeOperation = "source-over";
    destCtx.globalAlpha = 1;
    destCtx.imageSmoothingEnabled = rw !== destW || rh !== destH;
    const srcY = Math.max(0, device.canvas.height - rh);
    destCtx.drawImage(device.canvas, 0, srcY, rw, rh, 0, 0, destW, destH);
    destCtx.restore();
    return true;
  }

  global.nodeGraphImageBurnGlEnsure = ensure;
  global.nodeGraphImageBurnGlClear = clear;
  global.nodeGraphImageBurnGlStep = step;
  global.nodeGraphImageBurnGlPresentTo = presentTo;
  global.nodeGraphImageBurnGlDestroy = (host) => {
    if (!host?.[KEY]) return;
    destroyRenderer(host[KEY]);
    host[KEY] = null;
  };
  global.nodeGraphImageBurnGlAvailable = () => Boolean(getSharedDevice());
  global.nodeGraphImageBurnGlFormatLabel = (host) => host?.[KEY]?.formatLabel || "";
})(typeof globalThis !== "undefined" ? globalThis : window);
