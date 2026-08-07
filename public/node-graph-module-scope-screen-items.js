// Scope screen items / light sprites / custom display (Phase D).
// Load after scopes.js (+ vertices if used). Extract-only.

function clearNodeGraphModuleScopeLocalFallback(slot) {
  const canvas = slot?.scopeElement?.querySelector?.(":scope > .node-module-scope-local-fallback-canvas");
  const context = canvas?.getContext?.("2d");
  if (canvas && context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function clearNodeGraphModuleScopeLocalFallbackForNode(nodeId) {
  const id = String(nodeId || "");
  if (!id) {
    return;
  }
  clearNodeGraphModuleScopeLocalFallback(nodeGraphModuleScopeState.slots.get(id));
}

function applyNodeGraphModuleScopeCanvasAnalogFade(context, canvas, settings) {
  if (!canvas?.width || !canvas?.height || !context) {
    return;
  }
  const fadeAlpha = clampNodeSliderValue(Number(settings?.fadeAlpha) || 0.08, 0.006, 0.18);
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${fadeAlpha.toFixed(4)})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function nodeGraphModuleScopeFallbackBufferView(buffer, limit = 2048) {
  if (!buffer) {
    return buffer;
  }
  const safeLimit = Math.max(16, Math.min(1024, Math.floor(Number(limit) || 384)));
  if (buffer.nodeGraphScopeXy) {
    return {
      ...buffer,
      nodeGraphScopeVisualPointLimit: Math.min(
        safeLimit,
        Math.max(2, Math.floor(Number(buffer.nodeGraphScopeVisualPointLimit) || safeLimit)),
      ),
    };
  }
  buffer.nodeGraphScopeVisualPointLimit = Math.min(
    safeLimit,
    Math.max(2, Math.floor(Number(buffer.nodeGraphScopeVisualPointLimit) || safeLimit)),
  );
  return buffer;
}

function nodeGraphModuleScopeCanvasRgba(rgb, alpha) {
  const color = Array.isArray(rgb) ? rgb : [1, 1, 1];
  const opacity = clampNodeSliderValue(Number(alpha) || 0, 0, 1);
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${opacity})`;
}

// drawNodeGraphModuleScopeCanvasDotPath → node-graph-module-scope-draw-basic.js
function nodeGraphModuleScopeLightSpriteKey(options) {
  return [
    options.shape,
    Math.round(options.radius * 1000) / 1000,
    options.centerRgb.join(","),
    Math.round(options.centerAlphaFactor * 1000) / 1000,
    Math.round(options.centerBlur * 1000) / 1000,
    options.usesShader ? "shader" : "normal",
  ].join("|");
}

function nodeGraphModuleScopeTrimLightSpriteCache() {
  const cache = nodeGraphModuleScopeState.lightSpriteTextures;
  const maxSprites = 96;
  while (cache.size > maxSprites) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) {
      break;
    }
    cache.delete(firstKey);
  }
}

function nodeGraphModuleScopeLightSpriteTexture(options) {
  const radius = Math.max(0.5, Number(options.radius) || 0.5);
  const size = Math.max(2, Math.ceil(radius * 2));
  const key = nodeGraphModuleScopeLightSpriteKey({ ...options, radius });
  const cached = nodeGraphModuleScopeState.lightSpriteTextures.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const center = size * 0.5;
  const drawRadius = Math.max(0.5, Math.min(center, radius));
  context.save();
  context.globalCompositeOperation = options.usesShader ? "source-over" : "lighter";
  context.fillStyle = nodeGraphModuleScopeLightFillStyle(
    context,
    center,
    center,
    drawRadius,
    options.centerRgb,
    options.centerAlphaFactor,
    options.centerBlur,
  );
  drawNodeGraphModuleScopeLightShape(context, options.shape, center, center, drawRadius);
  context.fill();
  context.restore();

  const sprite = { canvas, size };
  nodeGraphModuleScopeState.lightSpriteTextures.set(key, sprite);
  nodeGraphModuleScopeTrimLightSpriteCache();
  return sprite;
}

function nodeGraphModuleScopeEmissiveShaderRgb(rgb, brightness) {
  const values = (rgb || []).map((component) => Math.round(clampNodeSliderValue(component, 0, 255)));
  const maxChannel = Math.max(0, ...values);
  if (maxChannel <= 0) {
    return values;
  }
  const targetMax = clampNodeSliderValue(72 + Math.max(0, Number(brightness) || 0) * 144, 72, 255);
  const scale = Math.max(1, targetMax / maxChannel);
  return values.map((component) => Math.round(clampNodeSliderValue(component * scale, 0, 255)));
}

// drawNodeGraphModuleScopeLightDisplay → node-graph-module-scope-draw-basic.js
// drawNodeGraphModuleScopeLightDisplays → node-graph-module-scope-draw-basic.js
function nodeGraphModuleScopeScreenItems(workspace, canvas, pixelRatio) {
  const workspaceRect = workspace.getBoundingClientRect();
  const viewportRect = {
    height: workspaceRect.height,
    left: 0,
    top: 0,
    width: workspaceRect.width,
  };
  const slotDebug = [];
  const items = nodeGraphVisibleModuleScopeSlots()
    .map((slot) => {
      const buffer = nodeGraphModuleScopeDisplayBuffer(
        slot,
        nodeGraphModuleScopeCapturedBufferForSlot(slot),
      );
      const entry = {
        bufferLength: buffer?.length || 0,
        displayType: nodeGraphModuleDisplayRendererForSlot(slot),
        nodeId: slot.nodeId,
        rectHeight: 0,
        rectWidth: 0,
        type: slot.type,
      };
      if (!buffer) {
        entry.skip = "no-buffer";
        slotDebug.push(entry);
        renderNodeGraphModuleScopeAnalyzer(slot, null);
        // Self-painted faces: remove any Trace overlay entirely (don't leave a
        // transparent absolute canvas sitting on the custom UI).
        {
          const selfPaint = nodeGraphModuleDisplayRendererForSlot(slot);
          if (
            selfPaint === "selfPaintFace"
            || selfPaint === "matrixFace"
            || selfPaint === "matrixWaterfallFace"
            || selfPaint === "matrixDisplayFace"
          ) {
            drawNodeGraphSelfPaintFaceItem(null, { slot, screenElement: slot.scopeElement }, 1);
          } else if (selfPaint === "knobFace") {
            drawNodeGraphKnobFaceItem(null, {
              slot,
              screenElement: slot.scopeElement,
              buffer: null,
            }, 1);
          } else {
            clearNodeGraphModuleScopeLocalFallback(slot);
          }
        }
        // Number Readout: keep an idle LCD plate when there is no live sample
        // (stop / unwired) instead of leaving a wiped blank face.
        if (slot?.type === "numberReadout" || nodeGraphModuleDisplayRendererForSlot(slot) === "numberReadout") {
          const face = slot.scopeElement;
          const numberCanvas = nodeGraphNumberReadoutCanvasForSlot(slot);
          if (numberCanvas && face) {
            paintNodeGraphNumberReadoutColdBoot(
              numberCanvas,
              face,
              nodeGraphModuleScopeNodeForSlot(slot),
            );
          }
        }
        return null;
      }
      const rect = slot.scopeElement.getBoundingClientRect();
      entry.rectHeight = rect.height;
      entry.rectWidth = rect.width;
      const screenRect = {
        height: rect.height,
        left: rect.left - workspaceRect.left,
        top: rect.top - workspaceRect.top,
        width: rect.width,
      };
      const drawRect = nodeGraphModuleScopeDrawingRect(screenRect, buffer, slot);
      const zoomScale = nodeGraphModuleScopeZoomScale();
      const visibleGeometry = nodeGraphModuleScopeVisibleDrawGeometry(screenRect, drawRect, viewportRect, zoomScale);
      if (!visibleGeometry) {
        entry.skip = "offscreen";
        slotDebug.push(entry);
        renderNodeGraphModuleScopeAnalyzer(slot, null);
        clearNodeGraphModuleScopeLocalFallback(slot);
        return null;
      }
      entry.skip = "";
      slotDebug.push(entry);
      return {
        buffer,
        displayRect: screenRect,
        drawRect,
        fullDrawRect: drawRect,
        nodeId: slot.nodeId,
        screenElement: slot.scopeElement,
        screenRect,
        scopeRect: {
          height: drawRect.height,
          left: drawRect.left,
          sampleHeight: nodeGraphModuleScopeUnzoomedLength(drawRect.height, zoomScale),
          sampleWidth: nodeGraphModuleScopeUnzoomedLength(drawRect.width, zoomScale),
          top: drawRect.top,
          width: drawRect.width,
        },
        settings: nodeGraphModuleScopeEffectiveSettingForSlot(slot),
        slot,
        type: slot.type,
        visibleDrawRect: visibleGeometry.visibleDrawRect,
        visibleProgressRange: visibleGeometry.visibleProgressRange,
        visibleScopeRect: visibleGeometry.visibleScopeRect,
      };
    })
    .filter(Boolean);
  if (nodeGraphModuleScopeState.renderDebug) {
    nodeGraphModuleScopeState.renderDebug.scopeSlots = slotDebug;
  }
  return items;
}

function nodeGraphModuleScopeTraceDisplayFrameUnchanged(visibleItems) {
  if (!Array.isArray(visibleItems) || !visibleItems.length) {
    return false;
  }
  let traceCount = 0;
  for (const item of visibleItems) {
    const slot = item?.slot;
    if (nodeGraphModuleDisplayRendererForSlot(slot) !== "trace") {
      return false;
    }
    traceCount += 1;
    const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
    if (!nodeGraphTraceDisplaySignatureUnchanged(slot, item, item.buffer, settings)) {
      return false;
    }
  }
  return traceCount > 0;
}

// drawNodeGraphTraceDisplayItem → node-graph-module-scope-draw-basic.js
function nodeGraphOscilloscopeLatestSample(buffer, fallback = 0) {
  if (buffer?.nodeGraphScopeXy) {
    return fallback;
  }
  for (let index = (buffer?.length || 0) - 1; index >= 0; index -= 1) {
    const sample = Number(buffer[index]);
    if (Number.isFinite(sample)) {
      return sample;
    }
  }
  return fallback;
}

// The beam fragment shader converts its uSize uniform into a core radius via
// `radius = max(uSize * 0.34, 0.0001)`. Callers that want a specific on-screen
// radius have to divide by this; keep the two in step.
const NODE_GRAPH_BEAM_SIZE_TO_RADIUS = 0.34;

// drawNodeGraphOscilloscopeBeam → node-graph-module-scope-draw-basic.js
// drawNodeGraphDotOscilloscopeItem → node-graph-module-scope-draw-basic.js
// drawNodeGraphValueOscilloscopeCanvasLine → node-graph-module-scope-draw-basic.js
function nodeGraphValueOscilloscopeTrailSamples(buffer) {
  if (!buffer?.length) {
    return [];
  }
  const samples = [];
  for (let index = 0; index < buffer.length; index += 1) {
    samples.push(clampNodeSliderValue(Number(buffer[index]) || 0, -1, 1));
  }
  return samples;
}

// drawNodeGraphValueOscilloscopeTrail → node-graph-module-scope-draw-basic.js
// drawNodeGraphValueOscilloscopeItem → node-graph-module-scope-draw-basic.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared 0–1 energy phosphor (foundation for LCD + scope burn surfaces)
//
// Burn light as a single energy channel (grayscale canvas), then map 0–1 → RGB
// with a gradient at present time. Soft edges are trivial (blur the deposit);
// color is a cheap colormap, not RGB trails.
//
// Energy buffer: R=G=B = energy*255 (luma). Decay uses destination-out.
// Deposit uses soft white ink (shadowBlur). Present samples luma → gradient.
//
// Number Readout is the first consumer; other burn paths can migrate later.
// ─────────────────────────────────────────────────────────────────────────────

// nodeGraphPhosphorEnergyEnsureCanvas → node-graph-module-scope-phosphor.js
/**
 * Per-frame energy erase amount in 0–1 (destination-out alpha).
 * Decay alone drives fade rate. Burn is deposit gain only — do not cancel fade
 * with burn or small decay values become invisible under continuous re-deposit.
 */
// nodeGraphPhosphorEnergyFadeAmount → node-graph-module-scope-phosphor.js
/**
 * Online (soundemote) deposit: (burn, brightness, size01).
 * Legacy 2-arg (brightness, size01) uses default burn 0.45.
 */
function nodeGraphScope2dEnergyBurnDepositGain(burn, brightness, size01) {
  if (arguments.length < 3 || size01 === undefined) {
    return nodeGraphScope2dEnergyBurnDepositGain(0.45, burn, brightness);
  }
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.depositGain) {
    return PhosphorDrawer.depositGain(burn, brightness, size01);
  }
  const b = clampNodeSliderValue(Number(burn) || 0, 0, 1);
  const br = Math.max(0, Number(brightness) || 0);
  const s = clampNodeSliderValue(Number(size01) || 0, 0, 1);
  // Slight low-end lift (pow < 1) so scrubbing 0.02→0.08 feels continuous.
  // Floor keeps a faint tip at burn 0; span covers strong dwell at burn 1.
  const burnShape = Math.pow(b, 0.78);
  const sizeFactor = 1.12 - s * 0.42;
  return Math.max(0, br * (0.022 + burnShape * 0.10) * sizeFactor);
}

/** Soft present exposure — burn gently opens film (online sandbox formula). */
function nodeGraphScope2dEnergyBurnExposure(burn) {
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.exposure) {
    return PhosphorDrawer.exposure(burn);
  }
  const b = clampNodeSliderValue(Number(burn) || 0, 0, 1);
  // Base exposure keeps low residual visible; burn only gently opens the film.
  return 1.85 + b * 2.1;
}

// nodeGraphPhosphorEnergyFade → node-graph-module-scope-phosphor.js
/** Softness in buffer px for energy deposits (size only — no ad-hoc glow). */
// nodeGraphPhosphorEnergySoftnessPx → node-graph-module-scope-phosphor.js
/**
 * Build a 0–1 → RGB gradient for phosphor presentation.
 * peakRgb: 0–255 triple (or 0–1 floats — both accepted).
 * Stops: floor → dim body → peak → hot shoulder.
 */
// nodeGraphPhosphorBuildGradientStops → node-graph-module-scope-phosphor.js
// nodeGraphPhosphorSampleGradient → node-graph-module-scope-phosphor.js
/**
 * Map grayscale energy canvas → colored RGBA into colorCanvas (same size).
 * Energy luma is max(R,G,B)/255. Output alpha tracks energy for lighter blit.
 */
// nodeGraphPhosphorMapEnergyToColorCanvas → node-graph-module-scope-phosphor.js
// ─────────────────────────────────────────────────────────────────────────────
// Number Readout — energy phosphor + hard LCD plate / live digits
// DSEG7 Classic: https://github.com/keshikan/DSEG (SIL OFL 1.1)
//
// Residual model (simple, intentional):
//   • Live reading is ALWAYS hard DSEG — never energy-charged. No change ⇒ clean.
//   • On text change, stamp only *changed* previous cells (static digits never charged).
//   • Present punches live glyphs out of residual every frame (no brightening under 0s).
//   • "Decay" UI = ghost hold length (0 = no ghosts, 1 = longest). Mapped to fade rate.
//   • No burn param. No soft blur / bleed on stamps.
// ─────────────────────────────────────────────────────────────────────────────
let nodeGraphNumberReadoutDsegReady = false;
document.fonts.load('700 40px "DSEG7 Classic"').then(() => {
  nodeGraphNumberReadoutDsegReady = document.fonts.check('700 40px "DSEG7 Classic"');
}).catch(() => {
  // Monospace stack below if the font fails to load.
});

// nodeGraphNumberReadoutCanvasForSlot → node-graph-module-scope-number-readout.js
/** Force the next number-readout draw to repaint (after engine stop wipe). */
// invalidateNodeGraphNumberReadoutPaintCache → node-graph-module-scope-number-readout.js
/**
 * Idle LCD after engine stop / before first live sample: plate + unlit segments.
 * Restores room-light strength so the face is not stuck dark under the dimmer.
 */
// paintNodeGraphNumberReadoutColdBoot → node-graph-module-scope-number-readout.js
// wipeNodeGraphNumberReadoutScreensToColdBoot → node-graph-module-scope-number-readout.js
// syncNodeGraphNumberReadoutCanvas → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutEnergyMaskCanvas → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutEnergyGl → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutSafeDecimals → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutFormatValue → node-graph-module-scope-number-readout.js
// DSEG period has zero advance; every other character is one equal LCD cell
// (width of "8"). Fixed cells keep lit digits and ghost plate locked together.
// https://github.com/keshikan/DSEG#usage
// nodeGraphNumberReadoutDsegWidthChars → node-graph-module-scope-number-readout.js
// Ghost plate: full-width cells only. Digits / all-off "!" → all-on "8".
// Spaces stay blank cells (drawn as "!" under the plate path). Do NOT map
// space→"8" — space is narrower than a digit in DSEG and shifts the plate.
// nodeGraphNumberReadoutGhostPlateText → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutUnitForSlot → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutSettingsSignature → node-graph-module-scope-number-readout.js
/** Unlit LCD segment RGB from independent ghostColor (not gradient sample). */
// nodeGraphNumberReadoutGhostPlateRgb → node-graph-module-scope-number-readout.js
/**
 * Natural (unskewed) DSEG layout for the face.
 * Height-first em size from the font; uniform shrink only if the block would
 * overflow the face width. Never non-uniform scale to fill the module.
 */
// nodeGraphNumberReadoutComputeLayout → node-graph-module-scope-number-readout.js
// Ghost deposit text: only previous glyphs that *left* (char-level).
// Unchanged cells become "!" (skip draw, keep spacing) so static "0"s never
// receive residual energy — canvas XOR of full strings left AA fringes on them.
// When cell counts differ (layout shift), return full previous string.
// nodeGraphNumberReadoutGhostDepositText → node-graph-module-scope-number-readout.js
// Draw DSEG on a fixed cell grid (cell = natural advance of "8" at fontSize).
// Ghost plate and lit value share the same pen positions. No X/Y stretch.
// softBlurPx: when set, deposits a soft energy/glow edge (for 0–1 phosphor).
// nodeGraphNumberReadoutDrawDigits → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutDrawInnerShadow → node-graph-module-scope-number-readout.js
// drawNodeGraphNumberReadoutItem → node-graph-module-scope-number-readout.js
function nodeGraphCustomDisplayCanvasForSlot(slot) {
  const screenElement = slot?.scopeElement;
  if (!screenElement) {
    return null;
  }
  let canvas = screenElement.querySelector(":scope > .node-custom-display-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-custom-display-canvas";
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
  }
  return canvas;
}

function syncNodeGraphCustomDisplayCanvas(canvas, screenElement, pixelRatio) {
  if (!canvas || !screenElement) {
    return false;
  }
  const rect = screenElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * pixelRatio));
  const height = Math.max(1, Math.floor(rect.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  return true;
}

function nodeGraphCustomDisplayInputApi(node, displayScript, primaryBuffer) {
  const inputs = {};
  for (const port of displayScript.inputs || []) {
    const buffer = nodeGraphModuleScopeState.buffers.get(`${node.id}:${port}`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(node.id, port) ||
      (port === displayScript.inputs[0] ? primaryBuffer : null);
    inputs[port] = {
      buffer: buffer || new Float32Array(0),
      latest: buffer?.length ? Number(buffer[buffer.length - 1]) || 0 : 0,
      length: buffer?.length || 0,
    };
  }
  return inputs;
}

// drawNodeGraphCustomDisplayItem → node-graph-module-scope-draw-basic.js
function nodeGraphDisplaySettingsAmplitudeScale(settings) {
  const s = Number(settings?.scale);
  return Number.isFinite(s) && s > 0 ? clampNodeSliderValue(s, 0.01, 100) : 1;
}

// Paint helpers (1D burn, face plate, late scope2d paths) → node-graph-module-scope-paint-helpers.js
