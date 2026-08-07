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
    if (canvas && canvas.parentNode !== screenElement) {
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
  // pixelDensity 2–4 supersamples so zoomed-in views stay soft, not blocky.
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return { resized: false, synced: false };
  }
  const resolved = nodeGraphScope2dResolvePixelDensity(pixelDensity, size.width, size.height);
  const density = resolved.effective;
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
  // Below 1: intentional chunk. At/above 1: smooth CSS scale (AA when density > 1).
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return { resized, synced: true, density, userDensity: resolved.density };
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
    // Size 0–1 of face min side: diameter = size * minSide (c1091b4 linear map).
    // Blur 0–1: hard-ish core → soft wide skirt (shader), not geometric size.
    const size01 = clampNodeSliderValue(settings.dot1Size, 0, 1);
    const side = Math.max(1, Number(dotSpace) || 1);
    const radius = typeof nodeGraphScopeSize01ToRadiusPx === "function"
      ? nodeGraphScopeSize01ToRadiusPx(side, size01)
      : (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.size01ToRadiusPx
        ? PhosphorDrawer.size01ToRadiusPx(side, size01)
        : Math.max(0.35, side * Math.max(0.08, size01) * 0.5));
    layers.push({
      // Blur 0 hard disc … 1 full soft gaussian.
      blur: nodeGraphTraceDisplayClampStampBlur(settings.lineThickness),
      brightness: Math.max(0, Number(settings.dot1Brightness) || 0),
      color: nodeGraphScopeHexColorToRgb(settings.dot1Color),
      radius,
    });
  }
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
  // Always absorb sample cursor when an endFrame is known (including freeze)
  // so pause does not bank up stamps for a resume dump.
  if (Number.isFinite(endFrame)) {
    absorbNodeGraphPhosphorDrawCursorOnCanvas(canvas, endFrame);
  }

  const energyGl = nodeGraphPhosphorEnergyGlEnsure(canvas, width, height, "_phosphorEnergyGl");
  if (!energyGl) {
    return false;
  }

  const trail = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateTrail
    ? PhosphorResidual.migrateTrail(settings || {}, 0.88)
    : clampNodeSliderValue(Number(settings?.trail ?? (Number.isFinite(Number(settings?.decay)) ? 1 - Number(settings.decay) : 0.88)), 0, 1);
  const ghost = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateGhost
    ? PhosphorResidual.migrateGhost(settings || {}, 0.45)
    : clampNodeSliderValue(Number(settings?.ghost ?? settings?.burn) || 0, 0, 1);
  const dotSpace = nodeGraphScope2dStrokeSpace(canvas);
  const layers = nodeGraphScope2dBurnLayers(settings, dotSpace);
  const layer = layers[0] || null;
  // Multi-stop energy→color LUT from shared gradient editor.
  const bgHex = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bgHex);
  nodeGraphPhosphorApplyGradientLut(energyGl, settings, "#75ebff");

  // Engine speed 0 (and other pause paths): never step energy — hold FBO as-is.
  const frozen = nodeGraphModuleScopePhosphorFrozen();
  if (frozen) {
    // Present only (below). No residual step, no bleed, no deposit.
  } else if (layer) {
    // Soft hits on NEW motion only. Deposit = brightness; Trail = hot hang; Ghost = dim scorch.
    // Always DOTS (never beam segments for burn faces). Lines form only when
    // stamps are dense enough to fuse. Under budget: spread stamps evenly.
    //
    // stampMode:
    //   "path" (default) — pack along polyline chords (2D orbits).
    //   "vertices"       — one stamp per true sample (1D lineBurn / PolyBLEP):
    //                      never interpolate chords (that made jagged “quantized”
    //                      polylines when control points were thinned).
    const size01 = clampNodeSliderValue(settings?.dot1Size, 0, 1);
    const beamBrightness = nodeGraphScope2dEnergyBurnDepositGain(
      layer.brightness,
      size01,
    );
    const maxDots = Math.max(
      64,
      Math.min(
        8192,
        Math.round(Number(settings?.dotBudget) || nodeGraphScope2dMaxSamplesPerFrame(canvas)),
      ),
    );
    const stampMode = String(options.stampMode || settings?.stampMode || "path").toLowerCase();
    nodeGraphPhosphorEnergyGlStepBeams(energyGl, {
      trail,
      ghost,
      pathPoints: points,
      radius: Math.max(0.35, layer.radius),
      brightness: beamBrightness,
      blur: nodeGraphTraceDisplayClampStampBlur(layer.blur),
      mode: "dots",
      stampMode,
      maxDots,
      // fullEconomy: pack dense when budget allows; when over budget, widen
      // spacing across the *whole* path (not head-only truncation).
      fullEconomy: settings?.fullDotEconomy !== false,
      fullDotEconomy: settings?.fullDotEconomy !== false,
    });
  } else if (typeof nodeGraphPhosphorEnergyGlStep === "function") {
    // Fade + bleed when no drawable layer (trail still softens outward).
    nodeGraphPhosphorEnergyGlStep(energyGl, { trail, ghost, depositGain: 0, bleed: 0.1 });
  }

  if (!frozen) {
    const lastPoint = lastNodeGraphScope2dPathPoint(points);
    if (lastPoint) {
      canvas._nodeGraphScope2dLastDrawnPoint = lastPoint;
    }
  }

  // Fixed film exposure (not a second brightness).
  const exposure = nodeGraphScope2dEnergyBurnExposure();
  context.setTransform(1, 0, 0, 1, 0, 0);
  nodeGraphFacePlateFillCanvas(context, canvas, bgHex);
  if (nodeGraphPhosphorEnergyGlPresent(energyGl, 1, { exposure })) {
    context.save();
    context.globalCompositeOperation = "lighter";
    // Always bilinear when compositing energy → face. Nearest upscale of a
    // sub-1 density FBO made continuous beams look stair-stepped / jagged.
    // (Pixel-density 0 1×1 “chunky” still soft-fills the plate.)
    context.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in context) {
      context.imageSmoothingQuality = "high";
    }
    context.drawImage(energyGl.canvas, 0, 0, width, height);
    context.restore();
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
  // Deposit only samples since last draw. Phosphor residual is the lagging
  // trail — do not re-stamp the full history every frame.
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  const budget = nodeGraphScope2dMaxSamplesPerFrame(canvas);
  const rawStart = nodeGraphScope2dDrawStartIndex(canvas, buffer, count);
  const drawStartIndex = nodeGraphScope2dClampDrawStartIndex(rawStart, count, budget);
  // Catch-up jump (skipped a backlog of samples): do NOT bridge to last point —
  // that paints bright wrong chords across the face (“erratic lines”).
  const catchUpJump = drawStartIndex > rawStart;
  // Control points only — stamp density is decided later by Dot Budget economy.
  let pathPoints = drawStartIndex < count
    ? buildNodeGraphScope2dPathPoints(canvasSquare, buffer, drawStartIndex, {
      interpolate: false,
      settings,
    })
    : [];
  if (!catchUpJump) {
    // Tight adjacent-frame bridge only (short residual gap). Loose bridges
    // looked like random line segments even when stamp quality was fine.
    pathPoints = bridgeNodeGraphScope2dAdjacentFramePath(
      canvas,
      pathPoints,
      Math.min(
        8,
        nodeGraphScope2dTraceMaxSegmentPixels(canvasSquare) * 0.15,
      ),
      nodeGraphScope2dInterpolationSpacingPx(
        settings,
        Math.min(canvasSquare.width, canvasSquare.height),
      ),
    );
  } else {
    // Drop stale bridge anchor after a catch-up.
    if (canvas) canvas._nodeGraphScope2dLastDrawnPoint = null;
  }
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
  // Fall back to whatever is wired into Reset if the port buffer is empty
  // (e.g. plan not yet rebuilt after adding the jack).
  let resetBuffer = null;
  if (nodeId) {
    const own = nodeGraphModuleScopeState.buffers.get(`${nodeId}:Reset`);
    const ownLen = own?.length || 0;
    const ownRecent = Math.floor(Number(own?.nodeGraphScopeRecentSampleCount) || 0);
    if (own && ownLen > 0 && (ownRecent > 0 || ownLen > 0)) {
      resetBuffer = own;
    } else if (typeof nodeGraphModuleScopeConnectedSourceBuffer === "function") {
      resetBuffer = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "Reset");
    }
  }
  // Points already in canvas pixel space (not workspace screen rect).
  // Pass true sample positions; energy-GL stamps vertices only (no chord fill).
  // Dot budget spreads by even sample skip when over maxDots — lines form only
  // when stamps are dense enough to fuse (explicit dots, implicit line).
  const pathPoints = nodeGraphOneDimensionalBurnFramePoints(
    canvas,
    buffer,
    settings,
    resetBuffer,
  );
  drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, {
    endFrame,
    stampMode: "vertices",
  });
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
  const settings = {
    trail: 0.78,
    ghost: 0.4,
    dot1Brightness: 0.95,
    dot1Color: "#3de0ff",
    dot1Enabled: true,
    dot1Size: Math.max(0.012, Math.min(0.06, 5 / minSide)),
    lineThickness: 0.25,
    pixelDensity: 1,
    dotBudget: 4096,
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
    const count = TraceStroke.draw(context, points, {
      size: settings.dot1Size,
      blur: 0,
      brightness: settings.dot1Brightness,
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
  const brightness = Math.max(0, Number(settings.dot1Brightness) || 0);
  if (brightness <= 0) {
    return;
  }
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(settings.dot1Color));
  const side = Math.max(1, Number(dotSpace) || 1);
  const radius = typeof nodeGraphScopeSize01ToRadiusPx === "function"
    ? nodeGraphScopeSize01ToRadiusPx(side, size)
    : Math.max(0.35, side * Math.max(0.08, size) * 0.5);
  // Canvas fallback: soft dots only (match energy-GL dots path; no polyline joins).
  context.save();
  context.globalCompositeOperation = "lighter";
  context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, brightness)})`;
  context.shadowBlur = 0;
  const r = Math.max(0.35, radius);
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
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const settings = nodeGraphScope2dTraceSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  // VECTOR polyline; density scales face buffer for lo-fi/AA (default 1).
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
  nodeGraphFacePlateFillCanvas(context, canvas, bg);
  if (!points.some(Boolean)) {
    return;
  }
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

