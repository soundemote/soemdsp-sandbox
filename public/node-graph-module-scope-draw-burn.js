// Scope2d / line-burn / hypersaw burn paint from scopes.js (Phase D).
// Load before scopes.js.

function disposeNodeGraphScope2dBurnRendererForCanvas(canvas) {
  if (!canvas) {
    return;
  }
  const renderer = nodeGraphModuleScopeState.scope2dBurnRenderers.get(canvas);
  if (!renderer) {
    return;
  }
  nodeGraphModuleScopeState.scope2dBurnRenderers.delete(canvas);
  const { gl } = renderer;
  if (!gl) {
    return;
  }
  deleteNodeGraphScope2dBurnSurface(gl, renderer.readSurface);
  deleteNodeGraphScope2dBurnSurface(gl, renderer.writeSurface);
  for (const buffer of [renderer.quadBuffer, renderer.beamBuffer]) {
    if (buffer) {
      gl.deleteBuffer(buffer);
    }
  }
  for (const program of [
    renderer.decayProgram,
    renderer.compositeProgram,
    renderer.copyProgram,
    renderer.beamProgram,
  ]) {
    if (program) {
      gl.deleteProgram(program);
    }
  }
}


/** True when the face can still take a 2D context (not WebGL-poisoned). */
function nodeGraphScope2dFaceCanvasIsUsable(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false;
  }
  try {
    return Boolean(canvas.getContext("2d"));
  } catch (_error) {
    return false;
  }
}

function nodeGraphScope2dBurnCanvasForSlot(slot) {
  const screenElement = slot?.scopeElement;
  const nodeId = slot?.nodeId;
  if (!screenElement) {
    return null;
  }
  let canvas = screenElement.querySelector(":scope > .node-module-scope-local-fallback-canvas");
  // DOM rebuild may have detached the face — re-attach the persistent canvas
  // so phosphor residual (_phosphorEnergyGl) survives add-module / re-render.
  if (!canvas && nodeId && nodeGraphModuleScopePersistentCanvases.has(nodeId)) {
    canvas = nodeGraphModuleScopePersistentCanvases.get(nodeId);
    // Never reattach a canvas that lost 2D (e.g. after legacy WebGL dispose).
    if (canvas && !nodeGraphScope2dFaceCanvasIsUsable(canvas)) {
      try {
        canvas.remove();
      } catch (_error) { /* ignore */ }
      nodeGraphModuleScopePersistentCanvases.delete(nodeId);
      canvas = null;
    } else if (canvas && canvas.parentNode !== screenElement) {
      screenElement.appendChild(canvas);
    }
  }
  if (canvas && canvas.dataset.scope2dRenderer !== nodeGraphScope2dBurnRendererVersion) {
    disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
    if (typeof nodeGraphPhosphorEnergyGlDestroy === "function" && canvas._phosphorEnergyGl) {
      try {
        nodeGraphPhosphorEnergyGlDestroy(canvas._phosphorEnergyGl);
      } catch (_) { /* ignore */ }
      canvas._phosphorEnergyGl = null;
    }
    canvas.remove();
    if (nodeId) {
      nodeGraphModuleScopePersistentCanvases.delete(nodeId);
    }
    canvas = null;
  }
  // Live face also poisoned? Drop and recreate.
  if (canvas && !nodeGraphScope2dFaceCanvasIsUsable(canvas)) {
    disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
    if (canvas._phosphorEnergyGl && typeof nodeGraphPhosphorEnergyGlDestroy === "function") {
      try {
        nodeGraphPhosphorEnergyGlDestroy(canvas._phosphorEnergyGl);
      } catch (_error) { /* ignore */ }
      canvas._phosphorEnergyGl = null;
    }
    try {
      canvas.remove();
    } catch (_error) { /* ignore */ }
    if (nodeId) {
      nodeGraphModuleScopePersistentCanvases.delete(nodeId);
    }
    canvas = null;
  }
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-module-scope-local-fallback-canvas";
    canvas.style.mixBlendMode = "normal";
    canvas.dataset.scope2dRenderer = nodeGraphScope2dBurnRendererVersion;
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
    if (nodeId) {
      nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
    }
  } else {
    if (canvas.style.mixBlendMode !== "normal") {
      canvas.style.mixBlendMode = "normal";
    }
    if (nodeId && !nodeGraphModuleScopePersistentCanvases.has(nodeId)) {
      nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
    }
  }
  return canvas;
}


function syncNodeGraphScope2dBurnCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  if (!canvas || !screenElement) {
    return { resized: false, synced: false };
  }
  // Layout pixel grid × density — not screen-space getBoundingClientRect.
  // Workspace zoom must not reallocate burn FBOs (that was the FPS cliff).
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return { resized: false, synced: false };
  }
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity({ pixelDensity }, 1)
    : Math.max(0, Math.min(1, Number(pixelDensity) || 0));
  const width = Math.max(1, Math.round(size.width * density));
  const height = Math.max(1, Math.round(size.height * density));
  const resized = canvas.width !== width || canvas.height !== height;
  if (resized) {
    canvas.width = width;
    canvas.height = height;
    // Pixel-space bridge point is invalid after a buffer resize (density /
    // layout change). Leaving it in the old coordinate space draws a bright
    // chord from the stale location to the new path — “lines out of place”
    // on X/Y phosphor faces.
    canvas._nodeGraphScope2dLastDrawnPoint = null;
  }
  // Below 1: intentional chunky CSS upscale. At/above 1: smooth scale.
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return { resized, synced: true, density };
}


function nodeGraphScope2dBurnTextureFormats(gl) {
  if (!gl) {
    return [];
  }
  if (!gl._nodeGraphScope2dBurnTextureFormats) {
    const halfFloat = gl.getExtension("OES_texture_half_float");
    const halfFloatLinear = gl.getExtension("OES_texture_half_float_linear");
    const colorBufferHalfFloat = gl.getExtension("EXT_color_buffer_half_float");
    const formats = [];
    if (halfFloat && colorBufferHalfFloat) {
      formats.push({
        filter: halfFloatLinear ? gl.LINEAR : gl.NEAREST,
        label: "rgba16f",
        type: halfFloat.HALF_FLOAT_OES,
      });
    }
    formats.push({
      filter: gl.LINEAR,
      label: "rgba8",
      type: gl.UNSIGNED_BYTE,
    });
    gl._nodeGraphScope2dBurnTextureFormats = formats;
  }
  return gl._nodeGraphScope2dBurnTextureFormats;
}


function createNodeGraphScope2dBurnTexture(gl, width, height, format = {}) {
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
    Math.max(1, width),
    Math.max(1, height),
    0,
    gl.RGBA,
    format.type || gl.UNSIGNED_BYTE,
    null,
  );
  return texture;
}


function createNodeGraphScope2dBurnFramebuffer(gl, texture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return framebuffer;
}


function createNodeGraphScope2dBurnSurface(gl, width, height) {
  for (const format of nodeGraphScope2dBurnTextureFormats(gl)) {
    const texture = createNodeGraphScope2dBurnTexture(gl, width, height, format);
    const framebuffer = createNodeGraphScope2dBurnFramebuffer(gl, texture);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (complete) {
      return {
        format: format.label,
        framebuffer,
        texture,
      };
    }
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
  }
  const texture = createNodeGraphScope2dBurnTexture(gl, width, height);
  return {
    format: "rgba8",
    framebuffer: createNodeGraphScope2dBurnFramebuffer(gl, texture),
    texture,
  };
}


function deleteNodeGraphScope2dBurnSurface(gl, surface) {
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


function createNodeGraphScope2dBurnRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  }) || canvas.getContext("experimental-webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }
  const quadVertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;
  const decayProgram = createNodeGraphModuleScopeProgram(gl, quadVertexSource, `
    precision highp float;
    uniform sampler2D uTexture;
    uniform float uDecayFast;
    uniform float uDecaySlow;
    uniform float uFloor;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(uTexture, vUv).rgb;
      float luma = max(max(color.r, color.g), color.b);
      float brightWeight = smoothstep(0.08, 0.7, luma);
      float decay = mix(uDecaySlow, uDecayFast, brightWeight);
      color = color * decay;
      color = max(color - vec3(uFloor), vec3(0.0));
      color *= smoothstep(0.0, uFloor * 10.0, max(max(color.r, color.g), color.b));
      gl_FragColor = vec4(color, 1.0);
    }
  `);
  const compositeProgram = createNodeGraphModuleScopeProgram(gl, quadVertexSource, `
    precision highp float;
    uniform sampler2D uTexture;
    uniform float uExposure;
    varying vec2 vUv;
    void main() {
      vec3 energy = texture2D(uTexture, vUv).rgb * uExposure;
      vec3 mapped = vec3(1.0) - exp(-energy);
      mapped = pow(mapped, vec3(0.72));
      float alpha = clamp(max(max(mapped.r, mapped.g), mapped.b), 0.0, 1.0);
      gl_FragColor = vec4(mapped, alpha);
    }
  `);
  const copyProgram = createNodeGraphModuleScopeProgram(gl, quadVertexSource, `
    precision highp float;
    uniform sampler2D uTexture;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(uTexture, vUv);
    }
  `);
  const beamProgram = createNodeGraphModuleScopeProgram(gl, `
    attribute vec2 aStart;
    attribute vec2 aEnd;
    attribute float aCorner;
    uniform vec2 uCanvasSize;
    uniform float uRadius;
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
  `, `
    precision highp float;
    uniform vec3 uColor;
    uniform float uBrightness;
    uniform float uBlur;
    uniform float uRadius;
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
      float energy = profile * uBrightness;
      gl_FragColor = vec4(uColor * energy, energy);
    }
  `);
  if (!decayProgram || !compositeProgram || !copyProgram || !beamProgram) {
    if (decayProgram) {
      gl.deleteProgram(decayProgram);
    }
    if (compositeProgram) {
      gl.deleteProgram(compositeProgram);
    }
    if (copyProgram) {
      gl.deleteProgram(copyProgram);
    }
    if (beamProgram) {
      gl.deleteProgram(beamProgram);
    }
    return null;
  }
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
  ]), gl.STATIC_DRAW);
  const renderer = {
    beamBuffer: gl.createBuffer(),
    beamBlurLocation: gl.getUniformLocation(beamProgram, "uBlur"),
    beamBrightnessLocation: gl.getUniformLocation(beamProgram, "uBrightness"),
    beamCanvasSizeLocation: gl.getUniformLocation(beamProgram, "uCanvasSize"),
    beamColorLocation: gl.getUniformLocation(beamProgram, "uColor"),
    beamCornerLocation: gl.getAttribLocation(beamProgram, "aCorner"),
    beamEndLocation: gl.getAttribLocation(beamProgram, "aEnd"),
    beamProgram,
    beamRadiusLocation: gl.getUniformLocation(beamProgram, "uRadius"),
    beamStartLocation: gl.getAttribLocation(beamProgram, "aStart"),
    canvas,
    compositeExposureLocation: gl.getUniformLocation(compositeProgram, "uExposure"),
    compositePositionLocation: gl.getAttribLocation(compositeProgram, "aPosition"),
    compositeProgram,
    compositeTextureLocation: gl.getUniformLocation(compositeProgram, "uTexture"),
    copyPositionLocation: gl.getAttribLocation(copyProgram, "aPosition"),
    copyProgram,
    copyTextureLocation: gl.getUniformLocation(copyProgram, "uTexture"),
    decayFastLocation: gl.getUniformLocation(decayProgram, "uDecayFast"),
    decayFloorLocation: gl.getUniformLocation(decayProgram, "uFloor"),
    decayPositionLocation: gl.getAttribLocation(decayProgram, "aPosition"),
    decayProgram,
    decaySlowLocation: gl.getUniformLocation(decayProgram, "uDecaySlow"),
    decayTextureLocation: gl.getUniformLocation(decayProgram, "uTexture"),
    gl,
    height: 0,
    lastFrame: NaN,
    lastPoint: null,
    quadBuffer,
    readSurface: null,
    segmentScratch: new Float32Array(0),
    width: 0,
    writeSurface: null,
  };
  return renderer;
}


function nodeGraphScope2dBurnRendererForCanvas(canvas) {
  if (!canvas) {
    return null;
  }
  const cached = nodeGraphModuleScopeState.scope2dBurnRenderers.get(canvas);
  if (cached?.canvas === canvas) {
    return cached;
  }
  const renderer = createNodeGraphScope2dBurnRenderer(canvas);
  if (renderer) {
    nodeGraphModuleScopeState.scope2dBurnRenderers.set(canvas, renderer);
  }
  return renderer;
}


function resizeNodeGraphScope2dBurnRenderer(renderer, width, height) {
  if (!renderer?.gl) {
    return false;
  }
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  if (renderer.width === safeWidth && renderer.height === safeHeight && renderer.readSurface && renderer.writeSurface) {
    return false;
  }
  const gl = renderer.gl;
  const previousReadSurface = renderer.readSurface;
  const previousWriteSurface = renderer.writeSurface;
  const nextReadSurface = createNodeGraphScope2dBurnSurface(gl, safeWidth, safeHeight);
  const nextWriteSurface = createNodeGraphScope2dBurnSurface(gl, safeWidth, safeHeight);
  const copiedRead = copyNodeGraphScope2dBurnSurface(renderer, previousReadSurface, nextReadSurface, safeWidth, safeHeight);
  const copiedWrite = copyNodeGraphScope2dBurnSurface(renderer, previousWriteSurface, nextWriteSurface, safeWidth, safeHeight);
  renderer.readSurface = nextReadSurface;
  renderer.writeSurface = nextWriteSurface;
  renderer.width = safeWidth;
  renderer.height = safeHeight;
  renderer.lastPoint = null;
  for (const surface of [
    copiedRead ? null : renderer.readSurface,
    copiedWrite ? null : renderer.writeSurface,
  ]) {
    if (!surface) {
      continue;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
    gl.viewport(0, 0, safeWidth, safeHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  deleteNodeGraphScope2dBurnSurface(gl, previousReadSurface);
  deleteNodeGraphScope2dBurnSurface(gl, previousWriteSurface);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return true;
}


function copyNodeGraphScope2dBurnSurface(renderer, sourceSurface, targetSurface, width, height) {
  const gl = renderer?.gl;
  if (!gl || !sourceSurface?.texture || !targetSurface?.framebuffer || !renderer.copyProgram) {
    return false;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, targetSurface.framebuffer);
  gl.viewport(0, 0, Math.max(1, width), Math.max(1, height));
  gl.disable(gl.BLEND);
  bindNodeGraphScope2dQuad(renderer, renderer.copyProgram, renderer.copyPositionLocation);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceSurface.texture);
  gl.uniform1i(renderer.copyTextureLocation, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return true;
}


function nodeGraphScope2dBurnDecayValues(settings) {
  const decay = clampNodeSliderValue(Number(settings?.decay) || 0, 0, 1);
  return {
    decayFast: decay > 0 ? 1 - decay * 0.38 : 1,
    decaySlow: decay > 0 ? 1 - decay * 0.1 : 1,
    exposure: nodeGraphScope2dEnergyBurnExposure(),
    floor: erase > 0 ? erase * 0.0035 : 0,
  };
}


function decayNodeGraphScope2dBurn(renderer, settings) {
  const gl = renderer?.gl;
  if (!gl || !renderer.readSurface || !renderer.writeSurface) {
    return;
  }
  const values = nodeGraphScope2dBurnDecayValues(settings);
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.writeSurface.framebuffer);
  gl.viewport(0, 0, renderer.width, renderer.height);
  gl.disable(gl.BLEND);
  bindNodeGraphScope2dQuad(renderer, renderer.decayProgram, renderer.decayPositionLocation);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.readSurface.texture);
  gl.uniform1i(renderer.decayTextureLocation, 0);
  gl.uniform1f(renderer.decayFastLocation, values.decayFast);
  gl.uniform1f(renderer.decaySlowLocation, values.decaySlow);
  gl.uniform1f(renderer.decayFloorLocation, values.floor);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}


function nodeGraphScope2dBurnLayers(settings, dotSpace) {
  const layers = [];
  if (settings?.dot1Enabled !== false) {
    // Linear diameter map: size * minSide, radius = half; size 0 → 1px (radius 0.5).
    const size01 = clampNodeSliderValue(settings.dot1Size, 0, 1);
    const side = Math.max(1, Number(dotSpace) || 1);
    const radius = typeof nodeGraphScopeSize01ToRadiusPx === "function"
      ? nodeGraphScopeSize01ToRadiusPx(side, size01)
      : (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.size01ToRadiusPx
        ? PhosphorDrawer.size01ToRadiusPx(side, size01)
        : Math.max(0.5, side * size01 * 0.5));
    layers.push({
      // Blur 0 hard disc … 1 full soft gaussian.
      blur: nodeGraphTraceDisplayClampStampBlur(settings.lineThickness),
      brightness: Math.max(0, Number(settings.dot1Brightness) || 0),
      color: nodeGraphScopeHexColorToRgb(settings.dot1Color),
      radius,
    });
  }
  // Size 0 is valid (1px floor) — only brightness gates the layer.
  return layers.filter((layer) => layer.brightness > 0 && layer.radius > 0);
}


function appendNodeGraphScope2dBurnSegment(vertices, from, to) {
  if (!from || !to) {
    return;
  }
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  let distance = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(distance)) {
    return;
  }
  const end = { x: to.x, y: to.y };
  if (distance < 0.01) {
    end.x = from.x + 0.01;
    end.y = from.y;
    dx = end.x - from.x;
    dy = end.y - from.y;
    distance = 0.01;
  }
  const corners = [0, 1, 2, 1, 3, 2];
  for (const corner of corners) {
    vertices.push(from.x, from.y, end.x, end.y, corner);
  }
}


function buildNodeGraphScope2dBurnVertices(pathPoints) {
  const points = Array.isArray(pathPoints) ? pathPoints : [];
  const vertices = [];
  let previousPoint = null;
  for (const point of points) {
    if (!point) {
      previousPoint = null;
      continue;
    }
    if (previousPoint) {
      appendNodeGraphScope2dBurnSegment(vertices, previousPoint, point);
    }
    previousPoint = point;
  }
  return vertices;
}


function drawNodeGraphScope2dBurnBeamLayer(renderer, vertices, layer, _ignoredBurn) {
  const gl = renderer?.gl;
  const vertexCount = Math.floor((vertices?.length || 0) / 5);
  if (!gl || vertexCount <= 0 || !layer || layer.radius <= 0 || layer.brightness <= 0) {
    return;
  }
  if (renderer.segmentScratch.length < vertices.length) {
    renderer.segmentScratch = new Float32Array(vertices.length);
  }
  renderer.segmentScratch.set(vertices);
  gl.useProgram(renderer.beamProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, renderer.segmentScratch.subarray(0, vertices.length), gl.STREAM_DRAW);
  const stride = 5 * 4;
  gl.enableVertexAttribArray(renderer.beamStartLocation);
  gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(renderer.beamEndLocation);
  gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(renderer.beamCornerLocation);
  gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, stride, 4 * 4);
  gl.uniform2f(renderer.beamCanvasSizeLocation, renderer.width, renderer.height);
  gl.uniform1f(renderer.beamRadiusLocation, Math.max(0.5, layer.radius));
  gl.uniform3f(renderer.beamColorLocation, layer.color[0], layer.color[1], layer.color[2]);
  gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(layer.blur, 0, 1));
  // Brightness only — fixed deposit scale (no burn multiplier).
  gl.uniform1f(renderer.beamBrightnessLocation, layer.brightness * 0.055);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  recordNodeGraphModuleScopeRenderMetrics(vertexCount, vertexCount);
}


function compositeNodeGraphScope2dBurn(renderer, settings, options = {}) {
  const gl = renderer?.gl;
  const surface = options.sourceSurface || renderer.writeSurface;
  if (!gl || !surface) {
    return;
  }
  const values = nodeGraphScope2dBurnDecayValues(settings);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, renderer.width, renderer.height);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  bindNodeGraphScope2dQuad(renderer, renderer.compositeProgram, renderer.compositePositionLocation);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, surface.texture);
  gl.uniform1i(renderer.compositeTextureLocation, 0);
  gl.uniform1f(renderer.compositeExposureLocation, values.exposure);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (options.swap === false) {
    return;
  }
  const nextRead = renderer.writeSurface;
  renderer.writeSurface = renderer.readSurface;
  renderer.readSurface = nextRead;
}


function drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, options = {}) {
  if (typeof nodeGraphPhosphorEnergyGlEnsure !== "function"
    || typeof nodeGraphPhosphorEnergyGlStepBeams !== "function"
    || typeof nodeGraphPhosphorEnergyGlPresent !== "function") {
    return false;
  }
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const sync = syncNodeGraphScope2dBurnCanvas(
    canvas,
    screenElement,
    pixelRatio,
    nodeGraphFacePlateDensity(settings),
  );
  if (!sync.synced || !canvas) {
    return false;
  }
  // Opaque plate — never CSS screen (that was the green/teal bleed).
  canvas.style.mixBlendMode = "normal";
  // Face must be 2D — dispose any leftover RGB WebGL burn on this canvas once.
  if (nodeGraphModuleScopeState.scope2dBurnRenderers?.get?.(canvas)) {
    disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
  }
  const context = canvas.getContext("2d");
  if (!context) {
    // Canvas already has a lost/foreign WebGL context — recreate the face.
    disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
    canvas.remove();
    return false;
  }

  const width = canvas.width;
  const height = canvas.height;
  const points = Array.isArray(pathPoints) ? pathPoints : [];
  const endFrame = Number(options.endFrame);
  const bgHex = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bgHex);
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  const hasPoints = points.length > 0;
  // Absorb cursor only after a successful paint (or when truly idle / frozen).
  // Absorbing *before* deposit used to burn undrawn samples when GL ensure or
  // present failed — faces stayed black until Stop+Play rebuilt the path.
  const absorbCursor = () => {
    if (Number.isFinite(endFrame)) {
      absorbNodeGraphPhosphorDrawCursorOnCanvas(canvas, endFrame);
    }
  };
  // No new stamps this frame: do NOT wipe the face. Filling the plate here
  // erased 1D Phosphor residual between scope posts (~30Hz), so the trail
  // looked frozen/dead until a Settings change force-painted. Hold pixels when
  // energy is idle; fall through to present-only when residual is still live.
  const existingEnergy = canvas._phosphorEnergyGl;
  const energyIdle = !existingEnergy || existingEnergy.energyActive === false;
  if (!frozen && !hasPoints && energyIdle) {
    // Still advance the sample cursor so we do not re-deposit a backlog later.
    absorbCursor();
    return true;
  }
  // Freeze still advances the sample cursor so unpause does not dump a backlog.
  if (frozen) {
    absorbCursor();
  }

  const energyGl = nodeGraphPhosphorEnergyGlEnsure(canvas, width, height, "_phosphorEnergyGl");
  if (!energyGl) {
    // Do not absorb — retry these samples next frame when GL is ready.
    return false;
  }

  // Residual model (phosphor-residual.js / Display Settings):
  //   Bright → peak deposit + present light
  //   Ghost  → extreme analog (super-exp) hang (NOT deposit ink)
  //   Trail  → linear residual blend (1 ≈ freeze, no erase)
  //   Burn   → sticky residual floor (0 = off)
  //   Burn Amount → multiplies Bright for residual deposits (default 1)
  const trail = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateTrail
    ? PhosphorResidual.migrateTrail(settings || {}, 0.88)
    : clampNodeSliderValue(Number(settings?.trail ?? (Number.isFinite(Number(settings?.decay)) ? 1 - Number(settings.decay) : 0.88)), 0, 1);
  const ghost = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateGhost
    ? PhosphorResidual.migrateGhost(settings || {}, 0.45)
    : clampNodeSliderValue(Number(settings?.ghost) || 0, 0, 1);
  const burn = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateBurn
    ? PhosphorResidual.migrateBurn(settings || {}, 0)
    : (
      Number(settings?.residualSchema) >= 2
        ? clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1)
        : 0
    );
  const burnAmount = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateBurnAmount
    ? PhosphorResidual.migrateBurnAmount(settings || {}, 1)
    : Math.max(0, Math.min(4, Number(settings?.burnAmount) || 1));
  const residualSchema = (typeof PhosphorResidual !== "undefined" && PhosphorResidual.RESIDUAL_SCHEMA) || 3;
  // Trail high → low decay (erase). Ghost must not be remapped into deposit.
  const decay = clampNodeSliderValue(1 - trail, 0, 1);
  const bright = clampNodeSliderValue(
    Number(settings?.dot1Brightness ?? settings?.brightness) || 0,
    0,
    1,
  );
  const dotSpace = nodeGraphScope2dStrokeSpace(canvas);
  const layers = nodeGraphScope2dBurnLayers(settings, dotSpace);
  const layer = layers[0] || null;
  // Multi-stop energy→color LUT from shared gradient editor.
  nodeGraphPhosphorApplyGradientLut(energyGl, settings, "#75ebff");

  // Engine speed 0 (and other pause paths): never step energy — hold FBO as-is.
  if (frozen) {
    // Present only (below). No decay, no bleed, no deposit.
  } else if (layer) {
    // Soft circular hits only (dots). Pack so soft discs fuse under budget;
    // Full Dot Economy densifies further toward Dot Budget.
    // Deposit = Bright only (Ghost is residual hang, not stamp gain).
    const size01 = clampNodeSliderValue(settings?.dot1Size, 0, 1);
    const stampBlur = nodeGraphTraceDisplayClampStampBlur(layer.blur);
    const beamBrightness = nodeGraphScope2dEnergyBurnDepositGain(
      layer.brightness > 0 ? layer.brightness : bright,
      size01,
    );
    // Packing flags from shared scope2d normalize (Snowflake / Lorenz / …).
    const fullDotEconomy = typeof nodeGraphDisplaySettingsToggleIsOn === "function"
      ? nodeGraphDisplaySettingsToggleIsOn(settings?.fullDotEconomy ?? settings?.useFullDotEconomy)
      : (settings?.fullDotEconomy === true || settings?.useFullDotEconomy === true);
    const dotsOnly = typeof nodeGraphDisplaySettingsToggleIsOn === "function"
      ? nodeGraphDisplaySettingsToggleIsOn(settings?.dotsOnly ?? settings?.verticesOnly)
      : (settings?.dotsOnly === true || settings?.verticesOnly === true);
    // Hard stamps (Blur 0) must freeze crisp — never force thrifty seepage.
    // Soft stamps may use gentle bleed (energy-gl default from blur when undefined).
    let bleed;
    if (stampBlur <= 0.001) {
      bleed = 0;
    } else if (fullDotEconomy && !dotsOnly) {
      bleed = undefined; // soft default from blur
    } else {
      // Thrifty soft: tiny seep so gaps stay dots, not dim threads.
      bleed = Math.min(0.035, 0.01 + stampBlur * 0.05);
    }
    nodeGraphPhosphorEnergyGlStepBeams(energyGl, {
      decay,
      trail,
      ghost,
      burn,
      burnAmount,
      residualSchema,
      pathPoints: points,
      radius: Math.max(0, Number(layer.radius) || 0),
      brightness: beamBrightness,
      blur: stampBlur,
      mode: "dots",
      // User / face ceiling. Under load: even skips across full path (not head-only).
      maxDots: (() => {
        const budget = Number(settings?.dotBudget);
        if (Number.isFinite(budget)) {
          return Math.max(1, Math.min(8192, Math.round(budget)));
        }
        const fallback = typeof nodeGraphScope2dMaxSamplesPerFrame === "function"
          ? nodeGraphScope2dMaxSamplesPerFrame(canvas)
          : 2048;
        return Math.max(0, Math.min(8192, Math.round(Number(fallback) || 2048)));
      })(),
      fullEconomy: fullDotEconomy,
      fullDotEconomy,
      // Sample hits only — no chord packing (no connective lines).
      dotsOnly,
      verticesOnly: dotsOnly,
      bleed,
    });
  } else if (typeof nodeGraphPhosphorEnergyGlStep === "function") {
    // Fade + bleed when no drawable layer (trail still softens outward).
    nodeGraphPhosphorEnergyGlStep(energyGl, {
      decay,
      trail,
      ghost,
      burn,
      burnAmount,
      residualSchema,
      depositGain: 0,
      bleed: ghost > 0.001 || burn > 0.001 ? 0.06 : 0,
    });
  }

  if (!frozen) {
    const lastPoint = lastNodeGraphScope2dPathPoint(points);
    if (lastPoint) {
      canvas._nodeGraphScope2dLastDrawnPoint = lastPoint;
    }
  }

  // Present film from Bright (peak light). Ghost does not open exposure.
  // Never wipe the 2D plate unless present actually produced a frame —
  // skipping present after a clear is the blank-flash when dots sit still
  // (energyActive goes false) and when the magnifier freeze-holds residual.
  const exposure = nodeGraphScope2dEnergyBurnExposure(bright);
  context.setTransform(1, 0, 0, 1, 0, 0);
  if (frozen && energyGl) {
    energyGl.energyDirty = true;
    if (energyGl.energyActive === false) {
      energyGl.energyActive = true;
    }
  }
  let presented = false;
  if (nodeGraphPhosphorEnergyGlPresent(energyGl, 1, { exposure })) {
    nodeGraphFacePlateFillCanvas(context, canvas, bgHex);
    context.save();
    // Energy is already additive mono; LUT paints color (incl. dark peaks).
    context.globalCompositeOperation = "source-over";
    // Smooth at native density; nearest when intentionally chunky.
    const dens = Number(sync.density);
    context.imageSmoothingEnabled = Number.isFinite(dens) ? dens >= 0.999 : true;
    context.drawImage(energyGl.canvas, 0, 0, width, height);
    context.restore();
    presented = true;
  }
  // Only consume the undrawn window after a real paint attempt completed
  // (present hit, freeze hold, or idle plate). Failed present keeps samples.
  if (presented || frozen || (!hasPoints && energyIdle)) {
    absorbCursor();
  } else if (hasPoints && !frozen) {
    // Deposit ran but present skipped (energyActive false): still advance
    // cursor when the GL face is live — residual will show next present.
    // Prefer retry if energy is completely idle so the next RAF can re-stamp.
    if (energyGl.energyActive !== false) {
      absorbCursor();
    }
  }
  return true;
}


function drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings) {
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const sync = syncNodeGraphScope2dBurnCanvas(
    canvas,
    screenElement,
    pixelRatio,
    nodeGraphFacePlateDensity(settings),
  );
  if (!sync.synced) {
    return;
  }
  const canvasSquare = nodeGraphScope2dBurnCanvasSquare(canvas);
  if (!canvasSquare) {
    return;
  }
  if (nodeGraphModuleScopePhosphorFrozen()) {
    // Freeze: re-present held energy, absorb sample cursor, no new stamps/decay.
    drawNodeGraphRetainedBurnPath(item, pixelRatio, [], settings, {
      endFrame: Number(buffer?.nodeGraphScopeAbsoluteFrame),
    });
    return;
  }
  // Deposit only samples since last draw (+ bridge). Phosphor residual is the
  // lagging trail — do not re-stamp the full history every frame.
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  const budget = nodeGraphScope2dMaxSamplesPerFrame(canvas);
  const rawStart = nodeGraphScope2dDrawStartIndex(canvas, buffer, count);
  const drawStartIndex = nodeGraphScope2dClampDrawStartIndex(rawStart, count, budget);
  let pathPoints = drawStartIndex < count
    ? buildNodeGraphScope2dPathPoints(canvasSquare, buffer, drawStartIndex, {
      interpolate: false,
      settings,
    })
    : [];
  // Adjacent-frame bridge (soundemote.io): short residual gap only; one vertex.
  pathPoints = bridgeNodeGraphScope2dAdjacentFramePath(
    canvas,
    pathPoints,
    nodeGraphScope2dTraceMaxSegmentPixels(canvasSquare),
    nodeGraphScope2dInterpolationSpacingPx(
      settings,
      Math.min(canvasSquare.width, canvasSquare.height),
    ),
  );
  drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, {
    endFrame: Number(buffer.nodeGraphScopeAbsoluteFrame),
  });
}


function drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, options = {}) {
  // Canonical: mono energy + LUT phosphor drawer (the one burn path).
  if (drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, options)) {
    return;
  }

  // Legacy RGB retained burn only if energy GL unavailable.
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const sync = syncNodeGraphScope2dBurnCanvas(
    canvas,
    screenElement,
    pixelRatio,
    nodeGraphFacePlateDensity(settings),
  );
  if (!sync.synced) {
    return;
  }
  const renderer = nodeGraphScope2dBurnRendererForCanvas(canvas);
  if (!renderer) {
    return;
  }
  resizeNodeGraphScope2dBurnRenderer(renderer, canvas.width, canvas.height);
  if (nodeGraphModuleScopePhosphorFrozen()) {
    // Legacy RGB path: composite held surfaces only — no decay pass.
    const endFrame = Number(options.endFrame);
    if (Number.isFinite(endFrame)) {
      absorbNodeGraphPhosphorDrawCursorOnCanvas(canvas, endFrame);
      renderer.lastFrame = endFrame;
    }
    compositeNodeGraphScope2dBurn(renderer, settings, {
      sourceSurface: renderer.readSurface,
      swap: false,
    });
    return;
  }
  decayNodeGraphScope2dBurn(renderer, settings);
  const points = Array.isArray(pathPoints) ? pathPoints : [];
  const dotSpace = nodeGraphScope2dStrokeSpace(canvas);
  const layers = nodeGraphScope2dBurnLayers(settings, dotSpace);
  if (!layers.length) {
    compositeNodeGraphScope2dBurn(renderer, settings);
    return;
  }
  const vertices = buildNodeGraphScope2dBurnVertices(points);
  const endFrame = Number(options.endFrame);
  if (Number.isFinite(endFrame)) {
    renderer.lastFrame = endFrame;
    renderer._nodeGraphScope2dLastDrawnFrame = endFrame;
    canvas._nodeGraphScope2dLastDrawnFrame = endFrame;
    canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = endFrame;
  }
  if (vertices.length > 0) {
    const gl = renderer.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.writeSurface.framebuffer);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const layer of layers) {
      drawNodeGraphScope2dBurnBeamLayer(renderer, vertices, layer);
    }
    gl.disable(gl.BLEND);
  }
  const lastPoint = lastNodeGraphScope2dPathPoint(points);
  if (lastPoint) {
    canvas._nodeGraphScope2dLastDrawnPoint = lastPoint;
  }
  compositeNodeGraphScope2dBurn(renderer, settings);
}


function drawNodeGraphLineBurnOscilloscopeItem(renderer, item, pixelRatio) {
  const buffer = item?.buffer;
  if (!buffer?.length) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const settings = nodeGraphLineBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  // Size face buffer once (layout×dpr × density) — same as 2D phosphor.
  const sync = syncNodeGraphScope2dBurnCanvas(
    canvas,
    screenElement,
    pixelRatio,
    nodeGraphFacePlateDensity(settings),
  );
  if (!sync.synced || !canvas) {
    return;
  }
  const endFrame = Number(buffer.nodeGraphScopeAbsoluteFrame);
  if (nodeGraphModuleScopePhosphorFrozen()) {
    // Freeze held phosphor; absorb cursor so resume does not flood the face.
    drawNodeGraphRetainedBurnPath(item, pixelRatio, [], settings, { endFrame });
    return;
  }
  const nodeId = String(item?.slot?.nodeId || "");
  // Prefer the sink's own Reset capture (full-rate visual input buffer).
  // Only when *fresh* samples arrived this post — stale Reset rings after
  // disconnect used to false-trigger rising edges and snap the pen (Y tears).
  let resetBuffer = null;
  if (nodeId) {
    const own = nodeGraphModuleScopeState.buffers.get(`${nodeId}:Reset`);
    const ownRecent = Math.floor(Number(own?.nodeGraphScopeRecentSampleCount) || 0);
    if (own && ownRecent > 0) {
      resetBuffer = own;
    } else if (typeof nodeGraphModuleScopeConnectedSourceBuffer === "function") {
      const wired = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "Reset");
      const wiredRecent = Math.floor(Number(wired?.nodeGraphScopeRecentSampleCount) || 0);
      if (wired && wiredRecent > 0) {
        resetBuffer = wired;
      }
    }
  }
  // Points already in canvas pixel space (not workspace screen rect).
  // Undrawn-window path draws every sample since lastDrawn (not just the
  // latest post) so skipped RAF / multi-post gaps no longer Y-jump the pen.
  // Match online: no spatial bridge (that glued stale lastPoint across gaps).
  const pathPoints = reduceNodeGraphOneDimensionalBurnPoints(
    nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, settings, resetBuffer),
    nodeGraphOneDimensionalBurnPointBudget(canvas),
  );
  // Prefer buffer absolute frame; fall back to undrawn-window end so the
  // cursor still advances when metadata is partial.
  let cursorEnd = endFrame;
  if (!Number.isFinite(cursorEnd) && typeof nodeGraphOneDimensionalBurnUndrawnWindow === "function") {
    const w = nodeGraphOneDimensionalBurnUndrawnWindow(canvas, buffer);
    if (Number.isFinite(Number(w?.endFrame))) {
      cursorEnd = Number(w.endFrame);
    }
  }
  drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, { endFrame: cursorEnd });
}


function drawNodeGraphHypersawBurnItem(renderer, item, pixelRatio) {
  // Vertical voice stems on the canonical mono energy phosphor drawer.
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const sync = syncNodeGraphScope2dBurnCanvas(canvas, screenElement, pixelRatio, 1);
  if (!sync.synced || !canvas) {
    return;
  }
  const phases = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get(nodeGraphDataBusKey(String(nodeId), "Phases"))
    : null;
  const pathPoints = [];
  if (Array.isArray(phases) && phases.length && typeof PhosphorDrawer !== "undefined") {
    const spacing = Math.max(1.5, canvas.height / 48);
    for (const phase of phases) {
      const p = Number(phase);
      if (!Number.isFinite(p)) continue;
      const x = clampNodeSliderValue(p, 0, 1) * canvas.width;
      PhosphorDrawer.appendSegment(pathPoints, x, 0, x, canvas.height, spacing);
    }
  }
  const minSide = Math.max(1, Math.min(canvas.width, canvas.height));
  const look = typeof nodeGraphScopePhosphorLookDefaults !== "undefined"
    ? nodeGraphScopePhosphorLookDefaults
    : null;
  const settings = {
    trail: look?.trail ?? 0,
    ghost: look?.ghost ?? 0.45,
    dot1Brightness: look?.brightness ?? 0.08,
    dot1Color: "#3de0ff",
    dot1Enabled: true,
    // Keep phase columns thin enough to resolve many voices on small faces.
    dot1Size: Math.min(
      look?.size ?? 0.02,
      Math.max(0.012, Math.min(0.06, 5 / minSide)),
    ),
    lineThickness: look?.blur ?? 0.35,
    pixelDensity: look?.pixelDensity ?? 1,
    dotBudget: look?.dotBudget ?? 2048,
  };
  drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, {
    endFrame: Number(item?.buffer?.nodeGraphScopeAbsoluteFrame),
  });
}


function nodeGraphScope2dBurnCanvasSquare(canvas) {
  const width = Math.max(1, Number(canvas?.width) || 1);
  const height = Math.max(1, Number(canvas?.height) || 1);
  const size = Math.max(1, Math.min(width, height));
  return {
    height: size,
    left: (width - size) * 0.5,
    top: (height - size) * 0.5,
    width: size,
  };
}


function drawNodeGraphScope2dTraceLayer(context, points, dotSpace, settings) {
  if (!context || !Array.isArray(points) || !points.length) {
    return;
  }
  if (settings.dot1Enabled === false) {
    return;
  }
  // VECTOR polyline (same philosophy as 1D Trace — not energy stamps).
  if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    const blur = Number.isFinite(Number(settings.lineThickness))
      ? Number(settings.lineThickness)
      : 0;
    const count = TraceStroke.draw(context, points, {
      size: settings.dot1Size,
      blur,
      brightness: settings.dot1Brightness,
      fade: Number.isFinite(Number(settings.fade)) ? Number(settings.fade) : 0,
      color: settings.dot1Color,
      faceMinSide: Math.max(1, Number(dotSpace) || 1),
      composite: "source-over",
    });
    if (count > 0) {
      recordNodeGraphModuleScopeRenderMetrics(count, count);
    }
    return;
  }
  const size = clampNodeSliderValue(settings.dot1Size, 0, 1);
  // Bright 0…1 exact — no 0…2 UI with a later half/clamp.
  const brightness = Math.max(0, Math.min(1, Number(settings.dot1Brightness) || 0));
  if (brightness <= 0) {
    return;
  }
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(settings.dot1Color));
  const side = Math.max(1, Number(dotSpace) || 1);
  const radius = typeof nodeGraphScopeSize01ToRadiusPx === "function"
    ? nodeGraphScopeSize01ToRadiusPx(side, size)
    : Math.max(0.5, side * size * 0.5);
  // Canvas fallback: soft dots only (match energy-GL dots path; no polyline joins).
  context.save();
  context.globalCompositeOperation = "lighter";
  context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${brightness})`;
  context.shadowBlur = 0;
  const r = Math.max(0.5, radius);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    context.beginPath();
    context.arc(p.x, p.y, r, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}


function drawNodeGraphScope2dTraceItem(renderer, item, pixelRatio) {
  const buffer = item?.buffer;
  if (!buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length) {
    return;
  }
  // Pause freeze: hold face pixels. Do not re-stroke history after Clear-while-paused.
  if (typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen()) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  if (typeof nodeGraphWaterfallAbandonTape === "function") {
    nodeGraphWaterfallAbandonTape(canvas);
  }
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const settings = nodeGraphScope2dTraceSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  // VECTOR polyline; density scales face buffer for lo-fi (default 1).
  const density = nodeGraphFacePlateDensity(settings, 1);
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(
    canvas,
    screenElement,
    pixelRatio,
    density,
  )) {
    return;
  }
  // Vector class: normal blend. Density < 1 stays pixelated (sync); density ≥ 1
  // clears inline image-rendering so workspace.pixelated-canvas-zoom can crisp
  // zoom-in without mushy bilinear scale.
  canvas.classList.add("node-module-scope-vector-trace");
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else {
    canvas.style.imageRendering = "";
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.imageSmoothingEnabled = density >= 0.999;
  if ("imageSmoothingQuality" in context && density >= 0.999) {
    context.imageSmoothingQuality = "high";
  }
  if (canvas.dataset.scope2dRenderer !== "sample-history-trace-1") {
    canvas.dataset.scope2dRenderer = "sample-history-trace-1";
  }
  // Buffer-local square (layout×dpr). Never use item.scopeRect/screenRect —
  // those are workspace screen coords and grow with zoom, so the stroke would
  // walk out of the face and clip into the module chrome.
  const canvasSquare = nodeGraphScope2dTraceCanvasSquare(canvas);
  const points = buildNodeGraphScope2dTraceCanvasPoints(canvasSquare, buffer, settings);
  const bg = nodeGraphFacePlateBackground(settings, nodeGraphScope2dTraceSettingsDefaults.background);
  nodeGraphFacePlateApplyCss(screenElement, bg);
  // Need two consecutive finite verts or the stroke is invisible and a fill
  // would blank the last frame (FPS 1 / one-sample posts).
  let strokeable = false;
  let run = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      run += 1;
      if (run >= 2) {
        strokeable = true;
        break;
      }
    } else {
      run = 0;
    }
  }
  if (!strokeable) {
    return;
  }
  nodeGraphFacePlateFillCanvas(context, canvas, bg);
  const dotSpace = Math.min(canvas.width, canvas.height);
  drawNodeGraphScope2dTraceLayer(context, points, dotSpace, settings);
}


function drawNodeGraphScope2dItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  const buffer = item?.buffer;
  if (!rect || !buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const square = nodeGraphModuleScopeCenteredSquareRect(rect);
  const settings = nodeGraphScope2dSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings);
}

