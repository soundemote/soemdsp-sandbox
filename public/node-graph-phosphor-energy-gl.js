// Shared WebGL 0–1 energy phosphor (long-term path for LCD + scope burn).
//
// Architecture:
//   energy (R)  ──fade──►  energy'  ──+ soft mask * burn──►  energy''
//   present: color = LUT(energy)   (1D gradient texture)
//
// Deposit masks are rasterized on a small 2D canvas (soft glyphs / beams),
// then uploaded once per deposit — no per-frame getImageData colormap.
//
// Consumers (Number Readout first; scopes migrate later):
//   const glr = nodeGraphPhosphorEnergyGlEnsure(host, w, h);
//   nodeGraphPhosphorEnergyGlSetLutFromPeak(glr, rgbBytes, bgHex);
//   nodeGraphPhosphorEnergyGlStep(glr, { decay, burn, maskCanvas, depositGain });
//   nodeGraphPhosphorEnergyGlPresent(glr); // draws into glr.canvas
//   destCtx.drawImage(glr.canvas, 0, 0);

(function initNodeGraphPhosphorEnergyGl(global) {
  const MAX_DIM = 2048;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("[phosphor-energy-gl] shader compile failed", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function linkProgram(gl, vsSource, fsSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
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
      console.warn("[phosphor-energy-gl] program link failed", gl.getProgramInfoLog(program));
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

  // Fade previous energy and optionally add a soft deposit mask in one pass.
  const STEP_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uEnergy;
    uniform sampler2D uMask;
    uniform float uKeep;
    uniform float uGain;
    uniform float uUseMask;
    void main() {
      float e = texture2D(uEnergy, vUv).r * uKeep;
      if (uUseMask > 0.5) {
        vec4 m = texture2D(uMask, vUv);
        float ink = max(m.r, max(m.g, m.b)) * m.a;
        // Soft masks often store premultiplied-ish white; prefer luma * alpha.
        ink = max(ink, max(m.r, max(m.g, m.b)));
        e = min(1.0, e + ink * uGain);
      }
      gl_FragColor = vec4(e, e, e, 1.0);
    }
  `;

  const PRESENT_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uEnergy;
    uniform sampler2D uLut;
    uniform float uTrailGain;
    void main() {
      float e = texture2D(uEnergy, vUv).r;
      // Mild gamma keeps soft edges from posterizing.
      e = pow(clamp(e, 0.0, 1.0), 1.12);
      vec3 c = texture2D(uLut, vec2(e, 0.5)).rgb;
      float a = clamp(e * uTrailGain, 0.0, 1.0);
      gl_FragColor = vec4(c * a, a);
    }
  `;

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
    if (!surface || !gl) {
      return;
    }
    if (surface.framebuffer) {
      gl.deleteFramebuffer(surface.framebuffer);
    }
    if (surface.texture) {
      gl.deleteTexture(surface.texture);
    }
  }

  function createQuad(gl) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]),
      gl.STATIC_DRAW,
    );
    return buffer;
  }

  function fadeAmount(decay) {
    const d = Math.max(0, Math.min(1, Number(decay) || 0));
    if (d <= 0.001) {
      return 0;
    }
    return Math.max(0.025, Math.min(0.55, 0.025 + d * 0.14 + d * d * 0.28));
  }

  function buildStops(peakRgb, backgroundHex) {
    const peak = Array.isArray(peakRgb) ? peakRgb : [117, 235, 255];
    const toByte = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return n <= 1 ? Math.round(Math.max(0, Math.min(1, n)) * 255) : Math.round(Math.max(0, Math.min(255, n)));
    };
    const pr = toByte(peak[0]);
    const pg = toByte(peak[1]);
    const pb = toByte(peak[2]);
    const bg = String(backgroundHex || "#000000").trim();
    const hex = /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : "#000000";
    const br = parseInt(hex.slice(1, 3), 16) || 0;
    const bgG = parseInt(hex.slice(3, 5), 16) || 0;
    const bb = parseInt(hex.slice(5, 7), 16) || 0;
    const mix = (a, b, t) => Math.round(a + (b - a) * t);
    return [
      { t: 0, r: br, g: bgG, b: bb },
      { t: 0.18, r: mix(br, pr, 0.28), g: mix(bgG, pg, 0.28), b: mix(bb, pb, 0.28) },
      { t: 0.55, r: mix(br, pr, 0.7), g: mix(bgG, pg, 0.7), b: mix(bb, pb, 0.7) },
      { t: 1, r: pr, g: pg, b: pb },
    ];
  }

  function sampleStops(e, stops) {
    const t = Math.max(0, Math.min(1, e));
    if (t <= stops[0].t) {
      return stops[0];
    }
    const last = stops[stops.length - 1];
    if (t >= last.t) {
      return last;
    }
    for (let i = 1; i < stops.length; i += 1) {
      const a = stops[i - 1];
      const b = stops[i];
      if (t <= b.t) {
        const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return {
          r: Math.round(a.r + (b.r - a.r) * u),
          g: Math.round(a.g + (b.g - a.g) * u),
          b: Math.round(a.b + (b.b - a.b) * u),
        };
      }
    }
    return last;
  }

  function uploadLut(gl, lutTexture, stops) {
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i += 1) {
      const c = sampleStops(i / 255, stops);
      const o = i * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, lutTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  function createRenderer(width, height) {
    const w = Math.max(1, Math.min(MAX_DIM, Math.round(width) || 1));
    const h = Math.max(1, Math.min(MAX_DIM, Math.round(height) || 1));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    }) || canvas.getContext("experimental-webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      return null;
    }

    const stepProgram = linkProgram(gl, VERT, STEP_FRAG);
    const presentProgram = linkProgram(gl, VERT, PRESENT_FRAG);
    if (!stepProgram || !presentProgram) {
      return null;
    }

    const quad = createQuad(gl);
    const surfaceA = createSurface(gl, w, h);
    const surfaceB = createSurface(gl, w, h);
    if (!surfaceA || !surfaceB) {
      return null;
    }

    const lutTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lutTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const maskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Clear energy to 0.
    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceA.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceB.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const defaultStops = buildStops([117, 235, 255], "#020608");
    uploadLut(gl, lutTexture, defaultStops);

    const step = {
      program: stepProgram,
      aPos: gl.getAttribLocation(stepProgram, "aPos"),
      uEnergy: gl.getUniformLocation(stepProgram, "uEnergy"),
      uMask: gl.getUniformLocation(stepProgram, "uMask"),
      uKeep: gl.getUniformLocation(stepProgram, "uKeep"),
      uGain: gl.getUniformLocation(stepProgram, "uGain"),
      uUseMask: gl.getUniformLocation(stepProgram, "uUseMask"),
    };
    const present = {
      program: presentProgram,
      aPos: gl.getAttribLocation(presentProgram, "aPos"),
      uEnergy: gl.getUniformLocation(presentProgram, "uEnergy"),
      uLut: gl.getUniformLocation(presentProgram, "uLut"),
      uTrailGain: gl.getUniformLocation(presentProgram, "uTrailGain"),
    };

    return {
      canvas,
      gl,
      width: w,
      height: h,
      quad,
      read: surfaceA,
      write: surfaceB,
      lutTexture,
      maskTexture,
      step,
      present,
      lutSignature: "",
      alive: true,
    };
  }

  function destroyRenderer(renderer) {
    if (!renderer?.alive) {
      return;
    }
    const { gl } = renderer;
    destroySurface(gl, renderer.read);
    destroySurface(gl, renderer.write);
    if (renderer.lutTexture) {
      gl.deleteTexture(renderer.lutTexture);
    }
    if (renderer.maskTexture) {
      gl.deleteTexture(renderer.maskTexture);
    }
    if (renderer.quad) {
      gl.deleteBuffer(renderer.quad);
    }
    if (renderer.step?.program) {
      gl.deleteProgram(renderer.step.program);
    }
    if (renderer.present?.program) {
      gl.deleteProgram(renderer.present.program);
    }
    renderer.alive = false;
  }

  function drawFullScreen(renderer, programLoc) {
    const { gl, quad } = renderer;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(programLoc.aPos);
    gl.vertexAttribPointer(programLoc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function swap(renderer) {
    const tmp = renderer.read;
    renderer.read = renderer.write;
    renderer.write = tmp;
  }

  /**
   * Ensure a renderer on host[key] matching width/height.
   * host is typically the 2D face canvas element.
   */
  function ensure(host, width, height, key = "_phosphorEnergyGl") {
    if (!host) {
      return null;
    }
    const w = Math.max(1, Math.min(MAX_DIM, Math.round(width) || 1));
    const h = Math.max(1, Math.min(MAX_DIM, Math.round(height) || 1));
    let renderer = host[key];
    if (renderer && renderer.alive && renderer.width === w && renderer.height === h) {
      return renderer;
    }
    if (renderer) {
      destroyRenderer(renderer);
    }
    renderer = createRenderer(w, h);
    host[key] = renderer;
    return renderer;
  }

  function setLutFromPeak(renderer, peakRgb, backgroundHex) {
    if (!renderer?.alive) {
      return;
    }
    const sig = `${Array.isArray(peakRgb) ? peakRgb.join(",") : peakRgb}|${backgroundHex || ""}`;
    if (renderer.lutSignature === sig) {
      return;
    }
    const stops = buildStops(peakRgb, backgroundHex);
    uploadLut(renderer.gl, renderer.lutTexture, stops);
    renderer.lutSignature = sig;
  }

  /**
   * One simulation step: fade residual, optionally add soft mask deposit.
   * maskCanvas: same size preferred; uploaded as RGBA.
   */
  function stepEnergy(renderer, options = {}) {
    if (!renderer?.alive) {
      return false;
    }
    const {
      decay = 0,
      depositGain = 0,
      maskCanvas = null,
    } = options;
    const { gl } = renderer;
    const fade = fadeAmount(decay);
    const keep = Math.max(0, 1 - fade);
    const useMask = maskCanvas && depositGain > 0.0001 ? 1 : 0;

    if (useMask) {
      gl.bindTexture(gl.TEXTURE_2D, renderer.maskTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
      } catch (error) {
        console.warn("[phosphor-energy-gl] mask upload failed", error);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return false;
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.write.framebuffer);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.disable(gl.BLEND);
    gl.useProgram(renderer.step.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderer.read.texture);
    gl.uniform1i(renderer.step.uEnergy, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, renderer.maskTexture);
    gl.uniform1i(renderer.step.uMask, 1);

    gl.uniform1f(renderer.step.uKeep, keep);
    gl.uniform1f(renderer.step.uGain, useMask ? Math.max(0, Math.min(1.5, depositGain)) : 0);
    gl.uniform1f(renderer.step.uUseMask, useMask);

    drawFullScreen(renderer, renderer.step);
    swap(renderer);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  /** Present energy×LUT into renderer.canvas (premultiplied RGBA). */
  function present(renderer, trailGain = 0.85) {
    if (!renderer?.alive) {
      return false;
    }
    const { gl } = renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(renderer.present.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderer.read.texture);
    gl.uniform1i(renderer.present.uEnergy, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, renderer.lutTexture);
    gl.uniform1i(renderer.present.uLut, 1);

    gl.uniform1f(renderer.present.uTrailGain, Math.max(0, Math.min(2, Number(trailGain) || 0.85)));
    drawFullScreen(renderer, renderer.present);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  function softnessPx(sizePx, burn = 0.5) {
    const size = Math.max(1, Number(sizePx) || 1);
    const b = Math.max(0, Math.min(1, Number(burn) || 0));
    return Math.max(1.25, size * (0.1 + b * 0.22));
  }

  global.nodeGraphPhosphorEnergyGlEnsure = ensure;
  global.nodeGraphPhosphorEnergyGlDestroy = destroyRenderer;
  global.nodeGraphPhosphorEnergyGlSetLutFromPeak = setLutFromPeak;
  global.nodeGraphPhosphorEnergyGlStep = stepEnergy;
  global.nodeGraphPhosphorEnergyGlPresent = present;
  global.nodeGraphPhosphorEnergyGlFadeAmount = fadeAmount;
  global.nodeGraphPhosphorEnergyGlSoftnessPx = softnessPx;
  global.nodeGraphPhosphorEnergyGlBuildStops = buildStops;
  global.nodeGraphPhosphorEnergyGlMaxDim = MAX_DIM;
})(typeof window !== "undefined" ? window : globalThis);
