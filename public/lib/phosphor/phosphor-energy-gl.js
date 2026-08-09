// Shared WebGL mono energy phosphor (canonical burn backend).
// Prefer public/lib/phosphor/phosphor-drawer.js for the high-level face API.
//
// Architecture:
//   energy  ──fade + optional bleed──►  energy'
//   energy' ──+ GPU soft/hard dots (additive mono deposit)──►  energy''
//   present: tone-map energy → e∈[0,1], color = LUT(e)  (any gradient, incl. white→black)
//   blit:    source-over onto plate (plate = gradient floor). Do NOT re-add as light —
//            additive already happened in energy space; lighter would kill dark LUT peaks.
//   resize:  reallocate FBOs + copy residual (do NOT clear on zoom)
//
// Blur UX: 0 = hard disc (~1px AA), 1 = full soft gaussian bleed.
// Optional 2D mask deposit remains for LCD glyphs (Number Readout).
//
// Consumers:
//   PhosphorDrawer.ensure / stepDots / presentTo
//   or low-level nodeGraphPhosphorEnergyGl* exports below.

(function initNodeGraphPhosphorEnergyGl(global) {
  if (typeof console !== "undefined" && console.info) {
    console.info("[phosphor-energy-gl] loaded online-site-1 (soundemote.io sandbox match)");
  }
  // Allow density 4× on large faces (matches scope max backing store).
  const MAX_DIM = 4096;

  /**
   * One shared WebGL context for every energy phosphor face.
   * Creating a context per scope blew past browser limits ("Too many active
   * WebGL contexts") once PhosphorLight / readouts multiply. Programs +
   * geometry buffers live here; each scope only owns FBOs + LUT + mask.
   */
  let sharedDevice = null;

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

  // Fade previous energy, optional soft neighborhood bleed, optional mask deposit.
  // Bleed is what makes a slow dwell "grow outward" instead of a hard saturated disc:
  // each frame a little energy seeps into neighbors (CRT phosphor charge diffusion).
  //
  // Dual residual (matches PhosphorResidual):
  //   uKeepFast  — Trail hot path (1 = freeze)
  //   uKeepSlow  — Ghost dim scorch hang (slower die)
  //   uGhostCap  — Ghost floor ceiling (never full peak)
  // When Ghost is 0, keepSlow/cap are 0 and only Trail erase runs.
  const STEP_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uEnergy;
    uniform sampler2D uMask;
    uniform float uKeepFast;
    uniform float uKeepSlow;
    uniform float uGhostCap;
    uniform float uGain;
    uniform float uUseMask;
    uniform vec2 uTexel;
    uniform float uBleed;
    void main() {
      float e0 = texture2D(uEnergy, vUv).r;
      float bleed = clamp(uBleed, 0.0, 1.0);
      float eBase = e0;
      if (bleed > 0.0001) {
        // 3×3 gaussian-ish blur; mix with center so cores seep outward slowly.
        vec2 t = max(uTexel, vec2(1e-5));
        float e1 = texture2D(uEnergy, vUv + vec2( t.x, 0.0)).r;
        float e2 = texture2D(uEnergy, vUv + vec2(-t.x, 0.0)).r;
        float e3 = texture2D(uEnergy, vUv + vec2(0.0,  t.y)).r;
        float e4 = texture2D(uEnergy, vUv + vec2(0.0, -t.y)).r;
        float e5 = texture2D(uEnergy, vUv + vec2( t.x,  t.y)).r;
        float e6 = texture2D(uEnergy, vUv + vec2(-t.x,  t.y)).r;
        float e7 = texture2D(uEnergy, vUv + vec2( t.x, -t.y)).r;
        float e8 = texture2D(uEnergy, vUv + vec2(-t.x, -t.y)).r;
        float blur = (e0 * 4.0 + (e1 + e2 + e3 + e4) * 2.0 + (e5 + e6 + e7 + e8)) / 16.0;
        eBase = mix(e0, blur, bleed);
      }
      // Trail hot path + optional Ghost dim floor (never full peak).
      float eFast = eBase * uKeepFast;
      float eGhost = (uGhostCap > 0.0001)
        ? min(eBase * uKeepSlow, uGhostCap)
        : 0.0;
      float e = max(eFast, eGhost);
      if (uUseMask > 0.5) {
        vec4 m = texture2D(uMask, vUv);
        float ink = max(m.r, max(m.g, m.b)) * m.a;
        // Soft masks often store premultiplied-ish white; prefer luma * alpha.
        ink = max(ink, max(m.r, max(m.g, m.b)));
        // No hard 1.0 clamp — HDR energy keeps soft skirts after long dwell.
        e = e + ink * uGain;
      }
      gl_FragColor = vec4(e, e, e, 1.0);
    }
  `;

  // Present = deposit amount → gradient color (not "emit light").
  //   1) Tone-map HDR mono energy to e∈[0,1] (film curve keeps soft skirts).
  //   2) Sample multi-stop LUT at e (stop0 = cold / plate floor, stop1 = hot peak).
  //   3) Premultiplied RGBA for source-over blit onto the face plate.
  // Additive accumulation already happened in the energy FBO — do not use
  // canvas "lighter" after this or dark LUT peaks (e.g. white→black) vanish.
  const PRESENT_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uEnergy;
    uniform sampler2D uLut;
    uniform float uTrailGain;
    uniform float uExposure;
    void main() {
      float raw = max(texture2D(uEnergy, vUv).r, 0.0);
      // Lift sub-threshold residual so near-zero energy still maps into the LUT
      // (avoids a hard empty band when burn is low under decay).
      float lifted = raw + 0.045 * pow(raw, 0.42);
      float e;
      if (uExposure > 0.001) {
        e = 1.0 - exp(-lifted * uExposure * 0.68);
        e = pow(clamp(e, 0.0, 1.0), 0.92);
      } else {
        e = lifted / (1.0 + lifted);
        e = pow(clamp(e, 0.0, 1.0), 0.88);
      }
      // e is the gradient coordinate. c is the face color at that deposit level.
      vec3 c = texture2D(uLut, vec2(clamp(e, 0.0, 1.0), 0.5)).rgb;
      // Coverage from deposit amount (soft skirts); color is independent of
      // whether the LUT peak is light or dark.
      float a = clamp(e * uTrailGain, 0.0, 1.0);
      gl_FragColor = vec4(c * a, a);
    }
  `;

  // Full-screen blit used on resize (same idea as scope2d burn copy-on-resize).
  const COPY_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main() {
      gl_FragColor = texture2D(uTexture, vUv);
    }
  `;

  // Continuous gaussian beam ribbon — same geometry as scope2d / Lorenz, mono energy.
  // Explicit mediump on every shared uniform so VS/FS precision always matches
  // (some drivers ignore default precision for uniforms and fail the link).
  const BEAM_VERT = `
    precision mediump float;
    attribute vec2 aStart;
    attribute vec2 aEnd;
    attribute float aCorner;
    uniform mediump vec2 uCanvasSize;
    uniform mediump float uRadius;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    void main() {
      vec2 segment = aEnd - aStart;
      float segmentLength = max(length(segment), 0.0001);
      vec2 tangent = segment / segmentLength;
      vec2 normal = vec2(-tangent.y, tangent.x);
      float side = (aCorner == 0.0 || aCorner == 2.0) ? 1.0 : -1.0;
      float endpointMix = aCorner < 2.0 ? 0.0 : 1.0;
      float cap = aCorner < 2.0 ? -1.0 : 1.0;
      // Pad must cover soft multi-skirt (up to ~3.2×R) so glow is not clipped.
      float padding = max(uRadius * 6.5, 2.5);
      vec2 endpoint = mix(aStart, aEnd, endpointMix);
      vec2 position = endpoint + normal * side * padding + tangent * cap * padding;
      vStart = aStart;
      vEnd = aEnd;
      vPosition = position;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;

  const BEAM_FRAG = `
    precision mediump float;
    uniform mediump float uBrightness;
    uniform mediump float uBlur;
    uniform mediump float uRadius;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    void main() {
      vec2 segment = vEnd - vStart;
      float soft = clamp(uBlur, 0.0, 1.0);
      float R = max(uRadius, 0.5);
      float segmentLengthSquared = dot(segment, segment);
      float t = segmentLengthSquared > 0.000001
        ? clamp(dot(vPosition - vStart, segment) / segmentLengthSquared, 0.0, 1.0)
        : 0.0;
      vec2 closest = vStart + segment * t;
      float d = length(vPosition - closest);
      float d2 = d * d;

      // Hard ribbon (blur 0): flat capsule core + ~1px AA — true hard edge.
      float aa = max(0.65, min(1.6, R * 0.08));
      float hard = 1.0 - smoothstep(R - aa, R + aa * 0.35, d);

      // Soft ribbon (blur 1): same triple-gaussian stack as soft stamps —
      // core + mid + wide skirt so trails read as glow, not a flat tube.
      float coreW = max(R * mix(0.30, 0.58, soft), 0.5);
      float midW = max(R * mix(0.55, 1.45, soft), coreW * 1.2);
      float skirtW = max(R * mix(0.9, 3.2, soft), midW * 1.2);
      float core = exp(-d2 / (2.0 * coreW * coreW));
      float mid = exp(-d2 / (2.0 * midW * midW));
      float skirt = exp(-d2 / (2.0 * skirtW * skirtW));
      float coreAmt = mix(0.72, 0.12, soft);
      float midAmt = mix(0.20, 0.40, soft);
      float skirtAmt = mix(0.06, 0.95, soft);
      float softPeak = mix(0.78, 0.36, soft);
      float softProfile = core * coreAmt + mid * midAmt + skirt * skirtAmt;
      float softNow = coreAmt + midAmt + skirtAmt;
      softProfile = softProfile * (softPeak / max(softNow, 0.001));

      // Morph hard capsule → soft gaussian beam.
      float softMix = pow(soft, 1.45);
      float hardPeak = 0.88;
      float profile = mix(hard * hardPeak, softProfile, softMix);

      float e = max(profile, 0.0) * uBrightness;
      // Monochrome energy (R=G=B); additive blend accumulates trail.
      gl_FragColor = vec4(e, e, e, e);
    }
  `;

  // Soft phosphor dabs — blur is 0..1 UX (hard → soft):
  //   blur 0 → hard disc + ~1px AA (crisp edge, almost no skirt)
  //   blur ~0.35 → painterly core + light outer skirt
  //   blur 1 → full soft wide gaussian (airbrush / bleed when hits stack)
  // Size (uRadius) = geometric footprint. aCorner: 0=BL,1=BR,2=TL,3=TR.
  const DOT_VERT = `
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
      float softAmt = clamp(uBlur, 0.0, 1.0);
      // Hard end: tight pad (disc + AA). Soft end: wide pad for long skirts.
      float pad = max(uRadius * mix(1.2, 6.5, softAmt) + mix(1.5, 0.0, softAmt), 2.0);
      vec2 cornerOffset = vec2(
        (aCorner == 0.0 || aCorner == 2.0) ? -1.0 : 1.0,
        (aCorner < 2.0) ? -1.0 : 1.0
      );
      vec2 position = aCenter + cornerOffset * pad;
      vOffset = position - aCenter;
      vRadius = max(uRadius, 0.5);
      vBlur = softAmt;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;

  const DOT_FRAG = `
    precision highp float;
    uniform float uBrightness;
    varying vec2 vOffset;
    varying float vRadius;
    varying float vBlur;
    void main() {
      // soft 0 = hard disc (flat + AA), 1 = full soft multi-skirt airbrush
      float soft = clamp(vBlur, 0.0, 1.0);
      float R = max(vRadius, 0.5);
      float r2 = dot(vOffset, vOffset);
      float r = sqrt(r2);

      // --- Hard disc (blur 0): flat core, crisp edge, ~1px AA only ---
      // Tighter AA than before so Size large + Blur 0 still reads as a disc.
      float aa = max(0.55, min(1.25, R * 0.06));
      float hard = 1.0 - smoothstep(R - aa, R + aa * 0.25, r);

      // --- Soft stack (blur 1): triple gaussians, wide bleed skirts ---
      float coreW = max(R * mix(0.30, 0.58, soft), 0.5);
      float midW = max(R * mix(0.55, 1.45, soft), coreW * 1.2);
      float skirtW = max(R * mix(0.9, 3.2, soft), midW * 1.2);
      float core = exp(-r2 / (2.0 * coreW * coreW));
      float mid = exp(-r2 / (2.0 * midW * midW));
      float skirt = exp(-r2 / (2.0 * skirtW * skirtW));
      float coreAmt = mix(0.72, 0.12, soft);
      float midAmt = mix(0.20, 0.40, soft);
      float skirtAmt = mix(0.06, 0.95, soft);
      float softPeak = mix(0.78, 0.36, soft);
      float softProfile = core * coreAmt + mid * midAmt + skirt * skirtAmt;
      float softNow = coreAmt + midAmt + skirtAmt;
      softProfile = softProfile * (softPeak / max(softNow, 0.001));

      // Morph hard → soft. pow keeps mid painterly; 0 = pure hard, 1 = pure soft.
      float softMix = pow(soft, 1.45);
      float hardPeak = 0.92;
      float profile = mix(hard * hardPeak, softProfile, softMix);

      float e = max(profile, 0.0) * uBrightness;
      gl_FragColor = vec4(e, e, e, e);
    }
  `;

  function energyTextureFormats(gl) {
    if (!gl) {
      return [];
    }
    if (!gl._phosphorEnergyTextureFormats) {
      const halfFloat = gl.getExtension("OES_texture_half_float");
      const halfFloatLinear = gl.getExtension("OES_texture_half_float_linear");
      const colorBufferHalfFloat = gl.getExtension("EXT_color_buffer_half_float")
        || gl.getExtension("WEBGL_color_buffer_float");
      const floatTex = gl.getExtension("OES_texture_float");
      const floatLinear = gl.getExtension("OES_texture_float_linear");
      const formats = [];
      // HDR energy is critical: 8-bit clamps cores to 1 and kills soft skirts.
      if (halfFloat && colorBufferHalfFloat) {
        formats.push({
          filter: halfFloatLinear ? gl.LINEAR : gl.NEAREST,
          type: halfFloat.HALF_FLOAT_OES,
          label: "rgba16f",
        });
      }
      if (floatTex && colorBufferHalfFloat) {
        formats.push({
          filter: floatLinear ? gl.LINEAR : gl.NEAREST,
          type: gl.FLOAT,
          label: "rgba32f",
        });
      }
      formats.push({
        filter: gl.LINEAR,
        type: gl.UNSIGNED_BYTE,
        label: "rgba8",
      });
      gl._phosphorEnergyTextureFormats = formats;
    }
    return gl._phosphorEnergyTextureFormats;
  }

  function createSurface(gl, w, h) {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    for (const format of energyTextureFormats(gl)) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, format.filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, format.filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        format.type || gl.UNSIGNED_BYTE,
        null,
      );
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      if (ok) {
        if (!gl._phosphorEnergyFormatLogged) {
          gl._phosphorEnergyFormatLogged = true;
          console.info("[phosphor-energy-gl] energy surface format:", format.label || "rgba8");
        }
        return {
          texture,
          framebuffer,
          width,
          height,
          type: format.type || gl.UNSIGNED_BYTE,
          label: format.label || "rgba8",
        };
      }
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    }
    return null;
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
    // Gentler floor than 0.025 — a high minimum erase made low burn deposits
    // quantize to zero (dead band ~0.04) instead of a dim continuous trail.
    return Math.max(0.006, Math.min(0.55, 0.006 + d * 0.11 + d * d * 0.32));
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

  function getSharedDevice() {
    if (sharedDevice?.gl && !sharedDevice.gl.isContextLost()) {
      return sharedDevice;
    }
    sharedDevice = null;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
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
    const copyProgram = linkProgram(gl, VERT, COPY_FRAG);
    const beamProgram = linkProgram(gl, BEAM_VERT, BEAM_FRAG);
    const dotProgram = linkProgram(gl, DOT_VERT, DOT_FRAG);
    // Beams/dots optional: mask/fade/present still work if those link fails.
    if (!stepProgram || !presentProgram || !copyProgram) {
      console.warn("[phosphor-energy-gl] core programs failed to link");
      return null;
    }
    if (!beamProgram) {
      console.warn("[phosphor-energy-gl] beam program failed; XY segments disabled");
    }
    if (!dotProgram) {
      console.warn("[phosphor-energy-gl] dot program failed; XY dots disabled");
    }

    const quad = createQuad(gl);
    const beamBuffer = gl.createBuffer();
    const step = {
      program: stepProgram,
      aPos: gl.getAttribLocation(stepProgram, "aPos"),
      uEnergy: gl.getUniformLocation(stepProgram, "uEnergy"),
      uMask: gl.getUniformLocation(stepProgram, "uMask"),
      // Dual residual: Trail keepFast + Ghost keepSlow/cap (uKeep is legacy alias).
      uKeepFast: gl.getUniformLocation(stepProgram, "uKeepFast"),
      uKeepSlow: gl.getUniformLocation(stepProgram, "uKeepSlow"),
      uGhostCap: gl.getUniformLocation(stepProgram, "uGhostCap"),
      uKeep: gl.getUniformLocation(stepProgram, "uKeepFast"),
      uGain: gl.getUniformLocation(stepProgram, "uGain"),
      uUseMask: gl.getUniformLocation(stepProgram, "uUseMask"),
      uTexel: gl.getUniformLocation(stepProgram, "uTexel"),
      uBleed: gl.getUniformLocation(stepProgram, "uBleed"),
    };
    const present = {
      program: presentProgram,
      aPos: gl.getAttribLocation(presentProgram, "aPos"),
      uEnergy: gl.getUniformLocation(presentProgram, "uEnergy"),
      uLut: gl.getUniformLocation(presentProgram, "uLut"),
      uTrailGain: gl.getUniformLocation(presentProgram, "uTrailGain"),
      uExposure: gl.getUniformLocation(presentProgram, "uExposure"),
    };
    const copy = {
      program: copyProgram,
      aPos: gl.getAttribLocation(copyProgram, "aPos"),
      uTexture: gl.getUniformLocation(copyProgram, "uTexture"),
    };
    let beam = null;
    if (beamProgram) {
      beam = {
        program: beamProgram,
        aStart: gl.getAttribLocation(beamProgram, "aStart"),
        aEnd: gl.getAttribLocation(beamProgram, "aEnd"),
        aCorner: gl.getAttribLocation(beamProgram, "aCorner"),
        uCanvasSize: gl.getUniformLocation(beamProgram, "uCanvasSize"),
        uRadius: gl.getUniformLocation(beamProgram, "uRadius"),
        uBrightness: gl.getUniformLocation(beamProgram, "uBrightness"),
        uBlur: gl.getUniformLocation(beamProgram, "uBlur"),
      };
    }
    let dot = null;
    if (dotProgram) {
      dot = {
        program: dotProgram,
        aCenter: gl.getAttribLocation(dotProgram, "aCenter"),
        aCorner: gl.getAttribLocation(dotProgram, "aCorner"),
        uCanvasSize: gl.getUniformLocation(dotProgram, "uCanvasSize"),
        uRadius: gl.getUniformLocation(dotProgram, "uRadius"),
        uBrightness: gl.getUniformLocation(dotProgram, "uBrightness"),
        uBlur: gl.getUniformLocation(dotProgram, "uBlur"),
      };
    }

    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      sharedDevice = null;
    }, false);

    sharedDevice = {
      canvas,
      gl,
      quad,
      beamBuffer,
      segmentScratch: new Float32Array(0),
      step,
      present,
      copy,
      beam,
      dot,
    };
    return sharedDevice;
  }

  /** Per-scope energy state (FBOs only) on the shared device. */
  function createRenderer(width, height) {
    const device = getSharedDevice();
    if (!device) {
      return null;
    }
    const w = Math.max(1, Math.min(MAX_DIM, Math.round(width) || 1));
    const h = Math.max(1, Math.min(MAX_DIM, Math.round(height) || 1));
    const { gl } = device;

    const surfaceA = createSurface(gl, w, h);
    const surfaceB = createSurface(gl, w, h);
    if (!surfaceA || !surfaceB) {
      destroySurface(gl, surfaceA);
      destroySurface(gl, surfaceB);
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

    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceA.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceB.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const defaultStops = buildStops([117, 235, 255], "#020608");
    uploadLut(gl, lutTexture, defaultStops);

    return {
      // Shared present target (resized per present call).
      canvas: device.canvas,
      gl,
      device,
      width: w,
      height: h,
      quad: device.quad,
      beamBuffer: device.beamBuffer,
      get segmentScratch() {
        return device.segmentScratch;
      },
      set segmentScratch(value) {
        device.segmentScratch = value;
      },
      read: surfaceA,
      write: surfaceB,
      lutTexture,
      maskTexture,
      step: device.step,
      present: device.present,
      copy: device.copy,
      beam: device.beam,
      dot: device.dot,
      lutSignature: "",
      alive: true,
      // Skip full-screen present when nothing changed (idle dark trail).
      energyActive: false,
      quietFrames: 0,
    };
  }

  function destroyRenderer(renderer) {
    if (!renderer?.alive) {
      return;
    }
    const { gl } = renderer;
    // Only free per-scope resources — shared device programs stay alive.
    destroySurface(gl, renderer.read);
    destroySurface(gl, renderer.write);
    if (renderer.lutTexture) {
      gl.deleteTexture(renderer.lutTexture);
    }
    if (renderer.maskTexture) {
      gl.deleteTexture(renderer.maskTexture);
    }
    renderer.read = null;
    renderer.write = null;
    renderer.lutTexture = null;
    renderer.maskTexture = null;
    renderer.alive = false;
    renderer.energyActive = false;
    renderer.quietFrames = 0;
  }

  /**
   * Wipe residual energy to black without tearing down GL (keeps face canvas
   * healthy). Used by Display Settings → Clear, including while paused.
   */
  function clearEnergy(renderer) {
    if (!isRendererLive(renderer)) {
      return false;
    }
    const { gl } = renderer;
    const w = Math.max(1, renderer.width || 1);
    const h = Math.max(1, renderer.height || 1);
    for (const surface of [renderer.read, renderer.write]) {
      if (!surface?.framebuffer) {
        continue;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Empty residual: present may skip (caller fills the 2D plate).
    renderer.energyActive = false;
    renderer.quietFrames = 0;
    return true;
  }

  /** Append one ribbon quad (6 verts × 5 floats) like scope2d burn. */
  function appendBeamSegment(vertices, from, to) {
    if (!from || !to) {
      return;
    }
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let distance = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(distance)) {
      return;
    }
    const endX = distance < 0.01 ? from.x + 0.01 : to.x;
    const endY = distance < 0.01 ? from.y : to.y;
    const corners = [0, 1, 2, 1, 3, 2];
    for (let i = 0; i < corners.length; i += 1) {
      vertices.push(from.x, from.y, endX, endY, corners[i]);
    }
  }

  function buildBeamVertices(pathPoints) {
    const points = Array.isArray(pathPoints) ? pathPoints : [];
    const vertices = [];
    let previous = null;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        previous = null;
        continue;
      }
      if (previous) {
        appendBeamSegment(vertices, previous, point);
      }
      previous = point;
    }
    return vertices;
  }

  /**
   * Dot deposit + Dot Budget.
   *
   * dotsOnly / verticesOnly: stamp ONLY real sample hits — no chord packing
   * between samples (no connective lines). Over maxDots: even index skip.
   *
   * Path packing (default): soft discs fuse into continuous trails.
   * fullEconomy OFF: fuse spacing. ON: denser pack toward maxDots.
   * Over budget: widen step evenly across the whole path.
   *
   * Format: center.x, center.y, corner (6 verts per stamp).
   */
  function buildDotVertices(pathPoints, options = {}) {
    const points = Array.isArray(pathPoints) ? pathPoints : [];
    const radius = Math.max(0.35, Number(options.radius) || 2);
    const blur = Math.max(0, Math.min(1, Number(options.blur) || 0));
    const maxDots = Math.max(16, Math.floor(Number(options.maxDots) || 2048));
    const fullEconomy = options.fullEconomy === true
      || options.fullDotEconomy === true
      || options.useFullDotEconomy === true
      || options.fullEconomy === 1
      || options.fullDotEconomy === 1;
    const dotsOnly = options.dotsOnly === true
      || options.verticesOnly === true
      || String(options.stampMode || "").toLowerCase() === "vertices";

    const pieces = [];
    let piece = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        if (piece.length) {
          pieces.push(piece);
          piece = [];
        }
        continue;
      }
      piece.push(p);
    }
    if (piece.length) {
      pieces.push(piece);
    }
    if (!pieces.length) {
      return [];
    }

    const stamps = [];
    const pushStamp = (x, y) => {
      if (stamps.length / 2 >= maxDots) {
        return false;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return true;
      }
      stamps.push(x, y);
      return true;
    };

    // —— Dots only: sample hits only, never mid-segment stamps ——
    if (dotsOnly) {
      let totalPts = 0;
      for (let p = 0; p < pieces.length; p += 1) {
        totalPts += pieces[p].length;
      }
      // Even index stride under budget; thrifty skips when not fullEconomy.
      let stride = totalPts > maxDots
        ? Math.max(1, Math.ceil(totalPts / maxDots))
        : 1;
      if (!fullEconomy && totalPts > 1 && totalPts <= maxDots) {
        // Mild thrifty: keep ~half the samples when dense (still no chords).
        stride = Math.max(1, Math.floor(totalPts / Math.min(maxDots, Math.max(2, Math.ceil(totalPts * 0.55)))));
      }
      let seen = 0;
      outerV: for (let p = 0; p < pieces.length; p += 1) {
        const pts = pieces[p];
        for (let i = 0; i < pts.length; i += 1) {
          if ((seen % stride) === 0) {
            if (!pushStamp(pts[i].x, pts[i].y)) {
              break outerV;
            }
          }
          seen += 1;
        }
      }
    } else {
      // —— Path packing: fuse soft stamps along continuous motion ——
      const fuseStep = Math.max(0.28, radius * (0.42 + blur * 0.22));
      const denseStep = Math.max(0.22, Math.min(radius * (0.18 + blur * 0.08), fuseStep * 0.55));

      let totalLen = 0;
      for (let p = 0; p < pieces.length; p += 1) {
        const pts = pieces[p];
        for (let i = 1; i < pts.length; i += 1) {
          const dist = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          if (dist > 1e-4) {
            totalLen += dist;
          }
        }
      }

      let step = fullEconomy ? denseStep : fuseStep;
      if (fullEconomy && totalLen > 1e-4) {
        const budgetStep = totalLen / Math.max(1, maxDots - Math.max(1, pieces.length));
        step = Math.max(0.22, Math.min(denseStep, budgetStep));
      }
      let idealCount = pieces.length;
      for (let p = 0; p < pieces.length; p += 1) {
        const pts = pieces[p];
        for (let i = 1; i < pts.length; i += 1) {
          const dist = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          idealCount += dist < 1e-4 ? 0 : Math.max(1, Math.ceil(dist / step));
        }
      }
      idealCount = Math.max(1, idealCount);
      if (idealCount > maxDots && totalLen > 1e-4) {
        step = Math.max(step, totalLen / Math.max(1, maxDots - Math.max(1, pieces.length)));
      }

      outer: for (let p = 0; p < pieces.length; p += 1) {
        const pts = pieces[p];
        if (pts.length === 1) {
          if (!pushStamp(pts[0].x, pts[0].y)) {
            break;
          }
          continue;
        }
        if (!pushStamp(pts[0].x, pts[0].y)) {
          break;
        }
        for (let i = 1; i < pts.length; i += 1) {
          const a = pts[i - 1];
          const b = pts[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 1e-4) {
            continue;
          }
          const n = Math.max(1, Math.ceil(dist / step));
          for (let s = 1; s <= n; s += 1) {
            const t = s / n;
            if (!pushStamp(a.x + dx * t, a.y + dy * t)) {
              break outer;
            }
          }
        }
      }
    }

    const vertices = [];
    const corners = [0, 1, 2, 1, 3, 2];
    const stampCount = Math.floor(stamps.length / 2);
    for (let i = 0; i < stampCount; i += 1) {
      const x = stamps[i * 2];
      const y = stamps[i * 2 + 1];
      for (let c = 0; c < corners.length; c += 1) {
        vertices.push(x, y, corners[c]);
      }
    }
    return vertices;
  }

  /**
   * Additive gaussian segment ribbons into current energy (read surface).
   * Same continuous beams as Lorenz — monochrome energy only.
   */
  function depositBeamSegments(renderer, options = {}) {
    if (!isRendererLive(renderer) || !renderer.beam?.program) {
      return 0;
    }
    const pathPoints = options.pathPoints;
    const vertices = Array.isArray(options.vertices)
      ? options.vertices
      : buildBeamVertices(pathPoints);
    const vertexCount = Math.floor(vertices.length / 5);
    if (vertexCount <= 0) {
      return 0;
    }
    const radius = Math.max(0.5, Number(options.radius) || 2);
    const brightness = Math.max(0, Number(options.brightness) || 0);
    if (brightness < 1e-6) {
      return 0;
    }
    const blur = Math.max(0, Math.min(1, Number(options.blur) || 0));
    const { gl } = renderer;

    if (renderer.segmentScratch.length < vertices.length) {
      renderer.segmentScratch = new Float32Array(vertices.length);
    }
    renderer.segmentScratch.set(vertices);

    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.read.framebuffer);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(renderer.beam.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      renderer.segmentScratch.subarray(0, vertices.length),
      gl.STREAM_DRAW,
    );
    const stride = 5 * 4;
    gl.enableVertexAttribArray(renderer.beam.aStart);
    gl.vertexAttribPointer(renderer.beam.aStart, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(renderer.beam.aEnd);
    gl.vertexAttribPointer(renderer.beam.aEnd, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(renderer.beam.aCorner);
    gl.vertexAttribPointer(renderer.beam.aCorner, 1, gl.FLOAT, false, stride, 4 * 4);
    gl.uniform2f(renderer.beam.uCanvasSize, renderer.width, renderer.height);
    gl.uniform1f(renderer.beam.uRadius, radius);
    gl.uniform1f(renderer.beam.uBrightness, brightness);
    gl.uniform1f(renderer.beam.uBlur, blur);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return vertexCount;
  }

  /**
   * Additive true-circular soft dots into energy (read surface).
   */
  function depositDots(renderer, options = {}) {
    if (!isRendererLive(renderer) || !renderer.dot?.program) {
      return 0;
    }
    const pathPoints = options.pathPoints;
    const vertices = Array.isArray(options.vertices)
      ? options.vertices
      : buildDotVertices(pathPoints, options);
    // 3 floats per vertex.
    const vertexCount = Math.floor(vertices.length / 3);
    if (vertexCount <= 0) {
      return 0;
    }
    const radius = Math.max(0.5, Number(options.radius) || 2);
    const brightness = Math.max(0, Number(options.brightness) || 0);
    if (brightness < 1e-6) {
      return 0;
    }
    // Blur 0 hard … 1 full soft gaussian.
    const blur = Math.max(0, Math.min(1, Number(options.blur) || 0));
    const { gl } = renderer;

    if (renderer.segmentScratch.length < vertices.length) {
      renderer.segmentScratch = new Float32Array(vertices.length);
    }
    renderer.segmentScratch.set(vertices);

    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.read.framebuffer);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(renderer.dot.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      renderer.segmentScratch.subarray(0, vertices.length),
      gl.STREAM_DRAW,
    );
    const stride = 3 * 4;
    gl.enableVertexAttribArray(renderer.dot.aCenter);
    gl.vertexAttribPointer(renderer.dot.aCenter, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(renderer.dot.aCorner);
    gl.vertexAttribPointer(renderer.dot.aCorner, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.uniform2f(renderer.dot.uCanvasSize, renderer.width, renderer.height);
    gl.uniform1f(renderer.dot.uRadius, radius);
    gl.uniform1f(renderer.dot.uBrightness, brightness);
    gl.uniform1f(renderer.dot.uBlur, blur);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return vertexCount;
  }

  /**
   * Blit source energy surface into target (UV 0–1 → stretch/shrink to new size).
   * Mirrors copyNodeGraphScope2dBurnSurface so zoom keeps phosphor trails.
   */
  function copySurface(renderer, sourceSurface, targetSurface, width, height) {
    const gl = renderer?.gl;
    if (!gl || !sourceSurface?.texture || !targetSurface?.framebuffer || !renderer.copy?.program) {
      return false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetSurface.framebuffer);
    gl.viewport(0, 0, Math.max(1, width), Math.max(1, height));
    gl.disable(gl.BLEND);
    gl.useProgram(renderer.copy.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceSurface.texture);
    gl.uniform1i(renderer.copy.uTexture, 0);
    drawFullScreen(renderer, renderer.copy);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  /**
   * Reallocate ping-pong energy surfaces at a new size, copying prior energy.
   * Same contract as resizeNodeGraphScope2dBurnRenderer (Lorenz/Chua scopes).
   */
  function resizeRenderer(renderer, width, height) {
    if (!renderer?.alive || !renderer.gl) {
      return false;
    }
    const w = Math.max(1, Math.min(MAX_DIM, Math.round(width) || 1));
    const h = Math.max(1, Math.min(MAX_DIM, Math.round(height) || 1));
    if (renderer.width === w && renderer.height === h && renderer.read && renderer.write) {
      return true;
    }
    const gl = renderer.gl;
    const previousRead = renderer.read;
    const previousWrite = renderer.write;
    const nextRead = createSurface(gl, w, h);
    const nextWrite = createSurface(gl, w, h);
    if (!nextRead || !nextWrite) {
      destroySurface(gl, nextRead);
      destroySurface(gl, nextWrite);
      return false;
    }

    const copiedRead = copySurface(renderer, previousRead, nextRead, w, h);
    const copiedWrite = copySurface(renderer, previousWrite, nextWrite, w, h);

    // Surfaces that failed to copy start black (no residual).
    for (const surface of [
      copiedRead ? null : nextRead,
      copiedWrite ? null : nextWrite,
    ]) {
      if (!surface) {
        continue;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Resize mask storage (deposit is one-frame; content need not be preserved).
    if (renderer.maskTexture) {
      gl.bindTexture(gl.TEXTURE_2D, renderer.maskTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Shared present canvas is resized in present(), not here.

    destroySurface(gl, previousRead);
    destroySurface(gl, previousWrite);
    renderer.read = nextRead;
    renderer.write = nextWrite;
    renderer.width = w;
    renderer.height = h;
    renderer.energyActive = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  function drawFullScreen(renderer, programLoc) {
    const { gl, quad } = renderer;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(programLoc.aPos);
    gl.vertexAttribPointer(programLoc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function isRendererLive(renderer) {
    return Boolean(
      renderer?.alive
      && renderer.gl
      && !renderer.gl.isContextLost()
      && renderer.read
      && renderer.write,
    );
  }

  function swap(renderer) {
    const tmp = renderer.read;
    renderer.read = renderer.write;
    renderer.write = tmp;
  }

  /**
   * Ensure a renderer on host[key] matching width/height.
   * host is typically the 2D face canvas element.
   * On size change: resize + copy residual energy (like scope2d burn / Lorenz).
   * Do not destroy-on-zoom — that is what cleared PhosphorLight trails.
   */
  function ensure(host, width, height, key = "_phosphorEnergyGl") {
    if (!host) {
      return null;
    }
    const w = Math.max(1, Math.min(MAX_DIM, Math.round(width) || 1));
    const h = Math.max(1, Math.min(MAX_DIM, Math.round(height) || 1));
    let renderer = host[key];
    if (renderer && renderer.gl?.isContextLost?.()) {
      renderer.alive = false;
      host[key] = null;
      renderer = null;
    }
    if (renderer && renderer.alive && renderer.width === w && renderer.height === h) {
      return renderer;
    }
    if (renderer && renderer.alive) {
      if (resizeRenderer(renderer, w, h)) {
        host[key] = renderer;
        return renderer;
      }
      destroyRenderer(renderer);
      host[key] = null;
    }
    renderer = createRenderer(w, h);
    host[key] = renderer;
    return renderer;
  }

  /**
   * Upload a multi-stop energy→color LUT.
   * Accepts either:
   *   [{ t, r, g, b }]  byte channels, or
   *   [{ t, color: "#rrggbb" }] hex stops (shared gradient editor format).
   */
  function setLutFromStops(renderer, stopsIn) {
    if (!isRendererLive(renderer)) {
      return false;
    }
    const raw = Array.isArray(stopsIn) ? stopsIn : [];
    const stops = [];
    for (let i = 0; i < raw.length; i += 1) {
      const s = raw[i];
      if (!s) continue;
      const t = Math.max(0, Math.min(1, Number(s.t)));
      if (Number.isFinite(Number(s.r)) && Number.isFinite(Number(s.g)) && Number.isFinite(Number(s.b))) {
        const toByte = (v) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return 0;
          return n <= 1
            ? Math.round(Math.max(0, Math.min(1, n)) * 255)
            : Math.round(Math.max(0, Math.min(255, n)));
        };
        stops.push({ t, r: toByte(s.r), g: toByte(s.g), b: toByte(s.b) });
        continue;
      }
      const hex = String(s.color || s.hex || "").trim();
      const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
      if (m) {
        const n = Number.parseInt(m[1], 16);
        stops.push({
          t: Number.isFinite(t) ? t : (raw.length <= 1 ? 0 : i / (raw.length - 1)),
          r: (n >> 16) & 255,
          g: (n >> 8) & 255,
          b: n & 255,
        });
      }
    }
    if (stops.length < 2) {
      return false;
    }
    stops.sort((a, b) => a.t - b.t);
    stops[0].t = 0;
    stops[stops.length - 1].t = 1;
    const sig = stops.map((s) => `${s.t.toFixed(4)}:${s.r},${s.g},${s.b}`).join("|");
    if (renderer.lutSignature === sig) {
      return true;
    }
    uploadLut(renderer.gl, renderer.lutTexture, stops);
    renderer.lutSignature = sig;
    return true;
  }

  function setLutFromPeak(renderer, peakRgb, backgroundHex) {
    if (!isRendererLive(renderer)) {
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
   * One simulation step: fade residual, soft neighborhood bleed, optional mask.
   * maskCanvas: same size preferred; uploaded as RGBA.
   * Prefer stepBeams for XY scopes (GPU ribbons, no mask upload).
   *
   * options.bleed: 0–1 per-frame energy diffusion (default soft phosphor seep).
   * Even with decay=0, bleed still runs so long dwell expands outward.
   */
  /**
   * Resolve Trail/Ghost residual keeps for the energy step.
   * Prefer explicit trail/ghost; fall back to legacy decay (high = faster die).
   */
  function residualKeeps(options = {}) {
    const Residual = global.PhosphorResidual;
    let trail;
    let ghost;
    if (options.trail != null && Number.isFinite(Number(options.trail))) {
      trail = Math.max(0, Math.min(1, Number(options.trail)));
    } else if (options.decay != null && Number.isFinite(Number(options.decay))) {
      trail = Math.max(0, Math.min(1, 1 - Number(options.decay)));
    } else {
      trail = 0.88;
    }
    if (options.ghost != null && Number.isFinite(Number(options.ghost))) {
      ghost = Math.max(0, Math.min(1, Number(options.ghost)));
    } else if (options.burn != null && Number.isFinite(Number(options.burn))) {
      // Legacy burn name = ghost hang, not deposit.
      ghost = Math.max(0, Math.min(1, Number(options.burn)));
    } else {
      ghost = 0;
    }
    if (Residual && typeof Residual.trailKeep === "function") {
      const keepFast = Residual.trailKeep(trail);
      const keepSlow = Residual.ghostKeep(ghost, keepFast);
      const ghostCap = Residual.ghostCap(ghost);
      const fade = 1 - keepFast;
      return { keepFast, keepSlow, ghostCap, fade, trail, ghost };
    }
    // No residual helper: Trail → fadeAmount(1-trail); Ghost ignored for keep.
    const decay = Math.max(0, Math.min(1, 1 - trail));
    const fade = fadeAmount(decay);
    const keepFast = Math.max(0, 1 - fade);
    return {
      keepFast,
      keepSlow: keepFast,
      ghostCap: 0,
      fade,
      trail,
      ghost,
    };
  }

  function stepEnergy(renderer, options = {}) {
    if (!isRendererLive(renderer)) {
      return false;
    }
    const {
      depositGain = 0,
      maskCanvas = null,
    } = options;
    const { gl } = renderer;
    const { keepFast, keepSlow, ghostCap, fade } = residualKeeps(options);
    const useMask = maskCanvas && depositGain > 0.0001 ? 1 : 0;
    // Default bleed: gentle CRT-like charge diffusion. Soft enough to not mush
    // the beam, strong enough that a slow burn grows a soft halo over time.
    const bleedOpt = Number(options.bleed);
    const bleed = Number.isFinite(bleedOpt)
      ? Math.max(0, Math.min(1, bleedOpt))
      : 0.12;

    // Skip only when truly idle: no fade, no bleed, no ghost hang, no mask.
    const fullyFrozen = keepFast >= 0.9999 && ghostCap <= 0.0001;
    if (fullyFrozen && bleed < 0.0001 && !useMask) {
      // Trail≈1: residual is frozen but still count quiet frames so we stop
      // calling into GL every RAF after a short hold (energyActive → false).
      if (renderer.energyActive !== false) {
        renderer.quietFrames = (renderer.quietFrames || 0) + 1;
        if (renderer.quietFrames > 90) {
          renderer.energyActive = false;
        }
      }
      return true;
    }
    // No residual and nothing depositing — skip empty full-screen passes.
    if (!useMask && renderer.energyActive === false && fullyFrozen) {
      return true;
    }

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
      renderer.energyActive = true;
      renderer.quietFrames = 0;
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

    if (renderer.step.uKeepFast) {
      gl.uniform1f(renderer.step.uKeepFast, keepFast);
    } else if (renderer.step.uKeep) {
      gl.uniform1f(renderer.step.uKeep, keepFast);
    }
    if (renderer.step.uKeepSlow) {
      gl.uniform1f(renderer.step.uKeepSlow, keepSlow);
    }
    if (renderer.step.uGhostCap) {
      gl.uniform1f(renderer.step.uGhostCap, ghostCap);
    }
    gl.uniform1f(renderer.step.uGain, useMask ? Math.max(0, Math.min(1.5, depositGain)) : 0);
    gl.uniform1f(renderer.step.uUseMask, useMask);
    const tw = Math.max(1, renderer.width);
    const th = Math.max(1, renderer.height);
    if (renderer.step.uTexel) {
      gl.uniform2f(renderer.step.uTexel, 1 / tw, 1 / th);
    }
    if (renderer.step.uBleed) {
      gl.uniform1f(renderer.step.uBleed, bleed);
    }

    drawFullScreen(renderer, renderer.step);
    swap(renderer);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // Count quiet frames whenever nothing is depositing (mask gain 0).
    // Trail≈1 freezes residual (fade≈0) but still must sleep after a dwell
    // with no new stamps — otherwise every RAF keeps full-screen stepEnergy.
    if (!useMask) {
      renderer.quietFrames = (renderer.quietFrames || 0) + 1;
      const Residual = global.PhosphorResidual;
      // Frozen trail: short sleep (hold image via last present until next deposit).
      // Ghost hang: long budget so scorch is not killed early.
      let sleepBudget = 240;
      if (fade <= 0.0001 && ghostCap <= 0.0001) {
        sleepBudget = 90; // ~1.5s @60fps then stop stepping frozen residual
      } else if (Residual && typeof Residual.residualSleepFrames === "function") {
        const ghostArg = Number.isFinite(Number(options.ghost))
          ? Number(options.ghost)
          : (ghostCap > 0 ? 0.45 : 0);
        sleepBudget = Residual.residualSleepFrames(ghostArg);
      }
      if (renderer.quietFrames > sleepBudget) {
        renderer.energyActive = false;
      }
    }
    return true;
  }

  /**
   * Efficient scope frame: fade mono energy, then additive deposit.
   * options.mode: "dots" (preferred — sample impacts) | "segments" (legacy beam ribbons).
   * Scope2d always passes dots; segments remain for any caller that still wants ribbons.
   */
  function stepBeams(renderer, options = {}) {
    if (!isRendererLive(renderer)) {
      return false;
    }
    const {
      decay = 0,
      pathPoints = null,
      vertices = null,
      radius = 2,
      brightness = 0,
      blur = 0.35,
      mode = "dots",
    } = options;
    const dotsMode = String(mode || "dots").toLowerCase() !== "segments";
    const maxDots = Math.max(64, Math.floor(Number(options.maxDots) || 2048));
    // Blur 0..1 — wider bleed when user asks for soft.
    const softAmt = Math.max(0, Math.min(1, Number(blur) || 0));
    const bleedOpt = Number(options.bleed);
    const bleed = Number.isFinite(bleedOpt)
      ? Math.max(0, Math.min(1, bleedOpt))
      // Hard end (blur 0): almost no seep so edges stay crisp.
      // Soft end: real phosphor charge diffusion for dwell hals.
      : softAmt * softAmt * 0.18;
    let depositVertices = vertices;
    if (dotsMode) {
      if (!Array.isArray(depositVertices) || depositVertices.length < 3) {
        depositVertices = buildDotVertices(pathPoints, {
          radius,
          blur,
          maxDots,
          fullEconomy: options.fullEconomy === true
            || options.fullDotEconomy === true
            || options.useFullDotEconomy === true,
          dotsOnly: options.dotsOnly === true || options.verticesOnly === true,
          verticesOnly: options.dotsOnly === true || options.verticesOnly === true,
          stampMode: options.stampMode,
        });
      }
    } else if (!Array.isArray(depositVertices) || depositVertices.length < 5) {
      depositVertices = buildBeamVertices(pathPoints);
    }
    const hasPath = Array.isArray(depositVertices)
      && depositVertices.length >= (dotsMode ? 3 : 5);
    const canDraw = dotsMode ? renderer.dot?.program : renderer.beam?.program;
    const willDeposit = hasPath && brightness > 1e-6 && canDraw;

    // Fully quiet trail and nothing new: skip fade + deposit + present upstream.
    if (!willDeposit && renderer.energyActive === false) {
      return true;
    }

    // Fade + neighborhood bleed. Trail=1 freezes hot path; Ghost = dim scorch hang.
    // Hard stamps pass bleed=0 so freeze-collect stays 1px crisp.
    stepEnergy(renderer, {
      decay,
      trail: options.trail,
      ghost: options.ghost,
      burn: options.burn,
      depositGain: 0,
      maskCanvas: null,
      bleed: willDeposit || renderer.energyActive ? bleed : 0,
    });
    if (willDeposit) {
      const count = dotsMode
        ? depositDots(renderer, {
          vertices: depositVertices,
          radius,
          brightness,
          blur,
        })
        : depositBeamSegments(renderer, {
          vertices: depositVertices,
          radius,
          brightness,
          blur,
        });
      if (count > 0) {
        renderer.energyActive = true;
        renderer.quietFrames = 0;
      }
    }
    return true;
  }

  /**
   * Present energy×LUT into shared canvas (premultiplied RGBA), sized to this scope.
   * Caller should source-over this onto the face plate (gradient floor / background).
   * options.exposure: optional soft film curve before LUT (scope2d / Lorenz beauty).
   */
  function present(renderer, trailGain = 0.85, options = {}) {
    if (!isRendererLive(renderer)) {
      return false;
    }
    // Idle dark: skip present GPU pass (caller still draws solid background).
    if (renderer.energyActive === false) {
      return false;
    }
    const { gl, canvas } = renderer;
    const w = renderer.width;
    const h = renderer.height;
    // Shared canvas is the present target — resize only when needed.
    if (canvas.width !== w) {
      canvas.width = w;
    }
    if (canvas.height !== h) {
      canvas.height = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
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
    const exposure = Number(options?.exposure);
    gl.uniform1f(
      renderer.present.uExposure,
      Number.isFinite(exposure) && exposure > 0 ? exposure : 0,
    );
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
  global.nodeGraphPhosphorEnergyGlClear = clearEnergy;
  global.nodeGraphPhosphorEnergyGlResize = resizeRenderer;
  global.nodeGraphPhosphorEnergyGlSetLutFromPeak = setLutFromPeak;
  global.nodeGraphPhosphorEnergyGlSetLutFromStops = setLutFromStops;
  global.nodeGraphPhosphorEnergyGlStep = stepEnergy;
  global.nodeGraphPhosphorEnergyGlStepBeams = stepBeams;
  global.nodeGraphPhosphorEnergyGlDepositBeams = depositBeamSegments;
  global.nodeGraphPhosphorEnergyGlBuildBeamVertices = buildBeamVertices;
  global.nodeGraphPhosphorEnergyGlBuildDotVertices = buildDotVertices;
  global.nodeGraphPhosphorEnergyGlPresent = present;
  global.nodeGraphPhosphorEnergyGlFadeAmount = fadeAmount;

  /** Normalize stamp blur to 0..1 (hard→soft). Migrates legacy signed -1..1. */
  function normalizeBlur(value, fallback = 0.35) {
    let v = Number(value);
    if (!Number.isFinite(v)) {
      v = Number(fallback);
    }
    if (!Number.isFinite(v)) {
      return 0.35;
    }
    // Legacy signed range used before 0–1 UX.
    if (v < 0) {
      v = (Math.max(-1, v) + 1) * 0.5;
    }
    return Math.max(0, Math.min(1, v));
  }
  global.nodeGraphPhosphorEnergyGlNormalizeBlur = normalizeBlur;
  global.nodeGraphPhosphorEnergyGlSoftnessPx = softnessPx;
  global.nodeGraphPhosphorEnergyGlBuildStops = buildStops;
  global.nodeGraphPhosphorEnergyGlMaxDim = MAX_DIM;
})(typeof window !== "undefined" ? window : globalThis);
