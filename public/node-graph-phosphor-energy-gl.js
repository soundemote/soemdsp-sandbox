// Shared WebGL 0–1 energy phosphor (efficient screen model).
//
// Architecture (Lorenz-style retention, monochrome energy + gradient present):
//   energy  ──fade──►  energy'
//   energy' ──+ GPU gaussian segment beams (additive)──►  energy''
//   present: color = LUT(energy)   (1D gradient / black→white→peak)
//   resize:  reallocate FBOs + copy residual (do NOT clear on zoom)
//
// Beams match scope2d / Lorenz: one ribbon quad per sample pair with
// distance-to-segment gaussian in the fragment shader — not RGB burn and
// not dense 2D stamp loops. Optional 2D mask deposit remains for LCD glyphs
// (Number Readout).
//
// Consumers:
//   const glr = nodeGraphPhosphorEnergyGlEnsure(host, w, h);
//   nodeGraphPhosphorEnergyGlSetLutFromPeak(glr, rgbBytes, bgHex);
//   nodeGraphPhosphorEnergyGlStepBeams(glr, { decay, pathPoints, radius, brightness, blur });
//   // or mask path: nodeGraphPhosphorEnergyGlStep(glr, { decay, maskCanvas, depositGain });
//   nodeGraphPhosphorEnergyGlPresent(glr);
//   destCtx.drawImage(glr.canvas, 0, 0);

(function initNodeGraphPhosphorEnergyGl(global) {
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
    // uExposure > 0: soft film curve (1 - exp(-e * exposure)) like classic scope2d
    // composite — keeps ultra-soft peaks without hard clipping. 0 = simple gamma.
    uniform float uExposure;
    void main() {
      float e = texture2D(uEnergy, vUv).r;
      if (uExposure > 0.001) {
        e = 1.0 - exp(-max(e, 0.0) * uExposure);
        e = pow(clamp(e, 0.0, 1.0), 0.72);
      } else {
        // Mild gamma keeps soft edges from posterizing.
        e = pow(clamp(e, 0.0, 1.0), 1.12);
      }
      vec3 c = texture2D(uLut, vec2(e, 0.5)).rgb;
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
      float padding = max(uRadius * 3.45, 2.0);
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
      float blur = clamp(uBlur, 0.0, 1.0);
      float sigma = max(uRadius * mix(0.34, 1.0, blur), 0.55);
      float segmentLengthSquared = dot(segment, segment);
      float t = segmentLengthSquared > 0.000001
        ? clamp(dot(vPosition - vStart, segment) / segmentLengthSquared, 0.0, 1.0)
        : 0.0;
      vec2 closest = vStart + segment * t;
      float distanceToBeam = length(vPosition - closest);
      float profile = exp(-(distanceToBeam * distanceToBeam) / (2.0 * sigma * sigma));
      float e = profile * uBrightness;
      // Monochrome energy (R=G=B); additive blend accumulates trail.
      gl_FragColor = vec4(e, e, e, e);
    }
  `;

  // True circular soft impacts: hard-ish core + soft light skirt.
  // Size (uRadius) = geometric footprint. Blur 0 = harder core / tighter skirt;
  // blur 1 = softer core / wide skirt so hits bleed outward when they stack.
  // aCorner: 0=BL, 1=BR, 2=TL, 3=TR — two triangles 0,1,2 + 1,3,2.
  const DOT_VERT = `
    precision mediump float;
    attribute vec2 aCenter;
    attribute float aCorner;
    uniform mediump vec2 uCanvasSize;
    uniform mediump float uRadius;
    uniform mediump float uBlur;
    varying vec2 vOffset;
    varying float vRadius;
    varying float vBlur;
    void main() {
      float blur = clamp(uBlur, 0.0, 1.0);
      // Soft end needs a wide pad so the skirt isn't clipped to a square.
      float pad = max(uRadius * mix(2.4, 3.8, blur), 2.0);
      vec2 cornerOffset = vec2(
        (aCorner == 0.0 || aCorner == 2.0) ? -1.0 : 1.0,
        (aCorner < 2.0) ? -1.0 : 1.0
      );
      vec2 position = aCenter + cornerOffset * pad;
      vOffset = position - aCenter;
      vRadius = max(uRadius, 0.5);
      vBlur = blur;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;

  const DOT_FRAG = `
    precision mediump float;
    uniform mediump float uBrightness;
    varying vec2 vOffset;
    varying float vRadius;
    varying float vBlur;
    void main() {
      float blur = clamp(vBlur, 0.0, 1.0);
      float R = max(vRadius, 0.5);
      float r = length(vOffset);
      // Core: tighter when hard (blur→0), still a smooth gaussian (no pixel edge).
      float coreW = max(R * mix(0.18, 0.42, blur), 0.4);
      float core = exp(-(r * r) / (2.0 * coreW * coreW));
      // Skirt: wide soft lobe — accumulates outward when many hits land nearby.
      float skirtW = max(R * mix(0.55, 1.45, blur), coreW * 1.35);
      float skirt = exp(-(r * r) / (2.0 * skirtW * skirtW));
      // Hard end: bright core + light skirt. Soft end: core still present, skirt dominates.
      float coreAmt = mix(0.78, 0.32, blur);
      float skirtAmt = mix(0.28, 0.88, blur);
      float profile = core * coreAmt + skirt * skirtAmt;
      // Smooth outer roll-off (smoothstep) so the support edge never looks hard.
      float outer = mix(R * 1.05, R * 1.65, blur);
      float inner = outer * mix(0.72, 0.55, blur);
      profile *= 1.0 - smoothstep(inner, outer, r);
      float e = max(profile, 0.0) * uBrightness;
      gl_FragColor = vec4(e, e, e, e);
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
   * Dots-only with dwell fill + beautiful budget failure.
   *
   * Under budget: stamp only at ideal spacing (enough for fused soft lines);
   * may use far fewer than maxDots — never pad.
   *
   * Over budget: do NOT solid-line the head and drop the rest. Widen spacing
   * evenly across the whole path so the full signal shape stays visible as
   * disconnected dots (skips). Fail beautifully instead of truncating.
   *
   * Format: center.x, center.y, corner (6 verts per stamp).
   */
  function buildDotVertices(pathPoints, options = {}) {
    const points = Array.isArray(pathPoints) ? pathPoints : [];
    const radius = Math.max(0.5, Number(options.radius) || 2);
    const blur = Math.max(0, Math.min(1, Number(options.blur) || 0.35));
    const maxDots = Math.max(16, Math.floor(Number(options.maxDots) || 2048));
    const sigma = Math.max(0.55, radius * (0.34 + blur * 0.66));
    // Ideal spacing fuses disks into a continuous soft line.
    const idealStep = Math.max(0.25, Math.min(sigma * 0.32, radius * 0.28));

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

    let totalLen = 0;
    let pairCount = 0;
    for (let p = 0; p < pieces.length; p += 1) {
      const pts = pieces[p];
      if (pts.length === 1) {
        continue;
      }
      for (let i = 1; i < pts.length; i += 1) {
        totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        pairCount += 1;
      }
    }
    // Estimate stamps if we used ideal spacing. Many tiny pairs need ~1 stamp
    // each (ceil), so length/step alone under-counts — that false ceiling used
    // to stop mid-path and made low-frequency look disconnected.
    let idealCount = pieces.length;
    for (let p = 0; p < pieces.length; p += 1) {
      const pts = pieces[p];
      for (let i = 1; i < pts.length; i += 1) {
        const dist = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        idealCount += dist < 1e-4 ? 0 : Math.max(1, Math.ceil(dist / idealStep));
      }
    }
    idealCount = Math.max(1, idealCount);
    // Under budget: ideal step, place only what the path needs (no pad, no early stop).
    // Over budget: widen step evenly across the FULL path so HF fails as skips,
    // not a solid head with the rest missing.
    const overBudget = idealCount > maxDots && totalLen > 1e-4;
    const step = overBudget
      ? Math.max(idealStep, totalLen / Math.max(1, maxDots - Math.max(1, pieces.length)))
      : idealStep;
    // Hard ceiling is always maxDots only — never a short idealCount cap.
    const stampCap = maxDots;

    const stamps = [];
    const pushStamp = (x, y) => {
      if (stamps.length / 2 >= stampCap) {
        return false;
      }
      stamps.push(x, y);
      return true;
    };

    // Oldest→newest so even sparse coverage maps the whole shape.
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
    void pairCount;

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
      : buildDotVertices(pathPoints);
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
   * One simulation step: fade residual, optionally add soft mask deposit.
   * maskCanvas: same size preferred; uploaded as RGBA.
   * Prefer stepBeams for XY scopes (GPU ribbons, no mask upload).
   */
  function stepEnergy(renderer, options = {}) {
    if (!isRendererLive(renderer)) {
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

    // No decay and no deposit: skip the full-screen pass entirely.
    if (keep >= 0.9999 && !useMask) {
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

    gl.uniform1f(renderer.step.uKeep, keep);
    gl.uniform1f(renderer.step.uGain, useMask ? Math.max(0, Math.min(1.5, depositGain)) : 0);
    gl.uniform1f(renderer.step.uUseMask, useMask);

    drawFullScreen(renderer, renderer.step);
    swap(renderer);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (fade > 0) {
      renderer.quietFrames = (renderer.quietFrames || 0) + 1;
      // After long quiet fade, trail is effectively black — stop presenting.
      if (renderer.quietFrames > 180) {
        renderer.energyActive = false;
      }
    }
    return true;
  }

  /**
   * Efficient scope frame: fade mono energy, then additive GPU beam segments
   * (Lorenz geometry → energy FBO → LUT present later).
   * options.mode: "segments" (default) | "dots" — dots = one soft impact per sample.
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
      mode = "segments",
    } = options;
    const dotsMode = String(mode || "segments").toLowerCase() === "dots";
    const maxDots = Math.max(64, Math.floor(Number(options.maxDots) || 2048));
    let depositVertices = vertices;
    if (dotsMode) {
      if (!Array.isArray(depositVertices) || depositVertices.length < 3) {
        depositVertices = buildDotVertices(pathPoints, {
          radius,
          blur,
          maxDots,
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

    // Fade residual only when needed (no 2D mask upload).
    stepEnergy(renderer, { decay, depositGain: 0, maskCanvas: null });
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
  global.nodeGraphPhosphorEnergyGlResize = resizeRenderer;
  global.nodeGraphPhosphorEnergyGlSetLutFromPeak = setLutFromPeak;
  global.nodeGraphPhosphorEnergyGlStep = stepEnergy;
  global.nodeGraphPhosphorEnergyGlStepBeams = stepBeams;
  global.nodeGraphPhosphorEnergyGlDepositBeams = depositBeamSegments;
  global.nodeGraphPhosphorEnergyGlBuildBeamVertices = buildBeamVertices;
  global.nodeGraphPhosphorEnergyGlBuildDotVertices = buildDotVertices;
  global.nodeGraphPhosphorEnergyGlPresent = present;
  global.nodeGraphPhosphorEnergyGlFadeAmount = fadeAmount;
  global.nodeGraphPhosphorEnergyGlSoftnessPx = softnessPx;
  global.nodeGraphPhosphorEnergyGlBuildStops = buildStops;
  global.nodeGraphPhosphorEnergyGlMaxDim = MAX_DIM;
})(typeof window !== "undefined" ? window : globalThis);
