// 1D Trace (mono + stereo) — Trace-family woscope beam with heart-monitor sweep.
// X = free-run / sync sweep phase (left→right). Y = signal amplitude.
// At the right edge the pen hard-resets to the left (not Waterfall scroll).
// Reuses 1D Phosphor phasor/Reset/Sync math; ink is TraceWoscope (not phosphor).

function nodeGraphScope1dTraceIsSlot(slot) {
  const renderer = typeof nodeGraphModuleDisplayRendererForSlot === "function"
    ? nodeGraphModuleDisplayRendererForSlot(slot)
    : "";
  return renderer === "scope1dTrace"
    || slot?.type === "scope1dTrace"
    || slot?.type === "scope1dTraceStereo";
}


function nodeGraphScope1dTraceInkRgb01(settings = {}, role = "primary") {
  // Flat fallback only. The beam itself is brightness, then gradient lookup.
  const t = Math.max(0, Math.min(1, nodeGraphScope1dTraceBrightness01(settings, role)));
  const stops = typeof nodeGraphPhosphorGradientStopsFromSettings === "function"
    ? nodeGraphPhosphorGradientStopsFromSettings(settings, "#ffffff")
    : settings?.gradientStops;
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    const rgb = nodeGraphSampleGradientStopsRgb(stops, t, "#ffffff");
    const r = Number(rgb?.[0]);
    const g = Number(rgb?.[1]);
    const b = Number(rgb?.[2]);
    if ([r, g, b].every(Number.isFinite)) {
      return [r / 255, g / 255, b / 255];
    }
  }
  return [t, t, t];
}

/** Bright 0…1: position along the beam gradient (0 = start, 1 = peak). */
function nodeGraphScope1dTraceBrightness01(settings = {}, role = "primary") {
  const isSecondary = role === "secondary" || role === "right";
  const brightKey = isSecondary
    ? (settings?.secondaryBrightness ?? settings?.dot1Brightness ?? settings?.brightness)
    : (settings?.dot1Brightness ?? settings?.brightness);
  const bright = Number(brightKey);
  if (!Number.isFinite(bright)) {
    return 1;
  }
  return Math.max(0, bright);
}


/** Size authored CSS px @ 96 for TraceWoscope beam diameter (uSize via faceInkPx). */
function nodeGraphScope1dTraceSizePx(settings = {}, role = "primary") {
  const isSecondary = role === "secondary" || role === "right";
  const raw = isSecondary
    ? (settings?.secondarySize ?? settings?.dot1Size ?? settings?.size)
    : (settings?.dot1Size ?? settings?.size);
  const defaults = typeof nodeGraphScope1dTraceSettingsDefaults !== "undefined"
    ? nodeGraphScope1dTraceSettingsDefaults
    : null;
  const fallback = isSecondary
    ? (defaults?.secondarySize ?? defaults?.dot1Size ?? 2)
    : (defaults?.dot1Size ?? 2);
  if (typeof nodeGraphTraceDisplayNormalizeInkPx === "function") {
    return nodeGraphTraceDisplayNormalizeInkPx(raw, fallback);
  }
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return Math.max(0, Math.min(32, n));
  }
  const fb = Number(fallback);
  return Number.isFinite(fb) ? Math.max(0, Math.min(32, fb)) : 2;
}

/**
 * Stereo / multi-channel 1D Trace points on one shared sweep phasor.
 * channels: Array<{ buffer: Float32Array, enabled?: boolean }>
 * Returns { channels: points[][], endFrame }
 * Phasor / Reset / Sync state lives on the face canvas (same keys as 1D Phosphor).
 */
function nodeGraphScope1dTraceFrameChannels(canvas, channels, settings, resetBuffer = null, drawOptions = null) {
  const list = Array.isArray(channels) ? channels.filter((ch) => ch?.buffer?.length) : [];
  if (!list.length || !canvas?.width || !canvas?.height) {
    return { channels: list.map(() => []), endFrame: null };
  }
  let driver = list[0].buffer;
  let maxCount = 0;
  let endFrame = null;
  let windowOverlap = 0;
  for (const ch of list) {
    const info = typeof nodeGraphOneDimensionalBurnUndrawnWindow === "function"
      ? nodeGraphOneDimensionalBurnUndrawnWindow(canvas, ch.buffer)
      : {
        count: Math.min(
          ch.buffer.length,
          Math.floor(Number(ch.buffer.nodeGraphScopeRecentSampleCount) || 1),
        ),
        drawStartIndex: 0,
        endFrame: null,
      };
    const count = Math.max(0, Math.floor(Number(info.count) || 0));
    if (count > maxCount) {
      maxCount = count;
      driver = ch.buffer;
      endFrame = info.endFrame;
      windowOverlap = info.overlap ? 1 : 0;
    }
  }
  if (maxCount <= 0) {
    return { channels: list.map(() => []), endFrame };
  }
  const sampleRate = Math.max(1, nodeGraphFiniteNumber(nodeGraphScopeSampleRate(driver), 44100));
  const defaults = typeof nodeGraphScope1dTraceSettingsDefaults !== "undefined"
    ? nodeGraphScope1dTraceSettingsDefaults
    : null;
  const sweepPair = typeof normalizeNodeGraphLineBurnSweepPair === "function"
    ? normalizeNodeGraphLineBurnSweepPair(settings, defaults)
    : null;
  let sweepHz = Number(sweepPair?.sweepHz ?? settings?.sweepHz);
  if (!Number.isFinite(sweepHz)) {
    sweepHz = 4;
  }
  sweepHz = Math.max(0, Math.min(100, sweepHz));
  const horizontalBurn = sweepHz <= 0;
  const sweepPhaseInc = horizontalBurn ? 0 : sweepHz / sampleRate;
  const width = canvas.width;
  const height = canvas.height;

  let phasor = Number(canvas._lineBurnPhasor);
  if (!Number.isFinite(phasor) || phasor < 0 || phasor >= 1) {
    phasor = 0;
  }
  if (windowOverlap && width > 0 && Array.isArray(canvas._lineBurnJoinPoints)) {
    const prev = canvas._lineBurnJoinPoints.find((point) => point && Number.isFinite(point.x));
    const joined = prev ? prev.x / width : NaN;
    if (joined >= 0 && joined < 1 && phasor + 1e-9 >= joined) {
      phasor = joined;
    }
  }
  let resetWasHigh = canvas._lineBurnResetWasHigh === true;
  const autoSync = typeof nodeGraphDisplaySettingsToggleIsOn === "function"
    ? nodeGraphDisplaySettingsToggleIsOn(settings?.sourceSync ?? settings?.sync)
    : Boolean(settings?.sourceSync);
  // Mirror 1D Phosphor (lineBurn): lift pen on large |Δsample| so wrap/jump
  // edges do not draw vertical strokes. Threshold SSOT = module scope constant.
  const skipDisc = typeof nodeGraphDisplaySettingsToggleIsOn === "function"
    ? nodeGraphDisplaySettingsToggleIsOn(settings?.skipDiscontinuities ?? true)
    : (settings?.skipDiscontinuities !== false);
  const discThreshold = typeof nodeGraphModuleScopeDiscontinuityThreshold === "number"
    ? nodeGraphModuleScopeDiscontinuityThreshold
    : 0.85;
  let signalWasHigh = canvas._lineBurnSignalWasHigh === true;
  const syncThreshold = Number.isFinite(Number(typeof nodeGraphLineBurnResetThreshold !== "undefined"
    ? nodeGraphLineBurnResetThreshold
    : 0.5))
    ? Number(typeof nodeGraphLineBurnResetThreshold !== "undefined"
      ? nodeGraphLineBurnResetThreshold
      : 0.5)
    : 0.5;
  let syncPeriodSamples = Number(canvas._lineBurnSyncPeriodSamples);
  if (!Number.isFinite(syncPeriodSamples) || syncPeriodSamples < 2) {
    syncPeriodSamples = 0;
  }
  let samplesSinceSync = Number(canvas._lineBurnSamplesSinceSync);
  if (!Number.isFinite(samplesSinceSync) || samplesSinceSync < 0) {
    samplesSinceSync = 0;
  }
  let syncAwaitingRestart = canvas._lineBurnSyncAwaitingRestart === true;
  const syncCyclesInView = (() => {
    if (horizontalBurn) {
      return 1;
    }
    const raw = Number(sweepPair?.sweepCycles ?? settings?.sweepCycles);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 4;
    }
    return Math.max(0.05, Math.min(100, raw));
  })();
  const syncPhaseIncForPeriod = (periodSamples) => {
    if (!(periodSamples >= 2)) {
      return sweepPhaseInc;
    }
    return 1 / (periodSamples * syncCyclesInView);
  };
  let phaseInc = horizontalBurn
    ? 0
    : (autoSync && syncPeriodSamples >= 2
      ? syncPhaseIncForPeriod(syncPeriodSamples)
      : sweepPhaseInc);

  const retuneSyncPeriodFromGap = () => {
    if (samplesSinceSync >= 2) {
      syncPeriodSamples = samplesSinceSync;
      if (!horizontalBurn && autoSync) {
        phaseInc = syncPhaseIncForPeriod(syncPeriodSamples);
      }
    }
    samplesSinceSync = 0;
  };

  const out = list.map(() => []);
  const hadPoint = list.map(() => false);
  const prevSample = list.map(() => NaN);
  const carriedJoins = Array.isArray(canvas._lineBurnJoinPoints) ? canvas._lineBurnJoinPoints : [];
  const joinUsed = list.map(() => false);
  const nextJoins = list.map(() => null);
  const starts = list.map((ch) => Math.max(0, ch.buffer.length - maxCount));
  const externalSync = drawOptions?.syncBuffer;
  const syncBuf = externalSync?.length ? externalSync : list[0].buffer;
  const syncStart = Math.max(0, syncBuf.length - maxCount);
  const ampDiv = Number(drawOptions?.amplitudeDivisor);
  const sampleDiv = Number.isFinite(ampDiv) && Math.abs(ampDiv) > 1e-4 ? ampDiv : 1;

  for (let index = 0; index < maxCount; index += 1) {
    const syncSample = syncBuf[syncStart + index];
    const resetSample = typeof nodeGraphOneDimensionalBurnResetSample === "function"
      ? nodeGraphOneDimensionalBurnResetSample(resetBuffer, index, maxCount)
      : 0;
    const resetHigh = Number(resetSample) >= syncThreshold;
    const resetEdge = resetHigh && !resetWasHigh;
    let syncEdge = false;
    if (autoSync) {
      const signalHigh = Number(syncSample) >= 0;
      if (signalHigh && !signalWasHigh) {
        syncEdge = true;
      }
      signalWasHigh = signalHigh;
    }
    if (resetEdge) {
      for (let c = 0; c < list.length; c += 1) {
        if (hadPoint[c]) {
          nodeGraphOneDimensionalBurnBreakPath(out[c]);
        }
        hadPoint[c] = false;
        prevSample[c] = NaN;
      }
      retuneSyncPeriodFromGap();
      phasor = 0;
      syncAwaitingRestart = false;
    } else if (syncEdge) {
      const hadPeriod = syncPeriodSamples >= 2;
      retuneSyncPeriodFromGap();
      if (autoSync && (syncAwaitingRestart || !hadPeriod)) {
        for (let c = 0; c < list.length; c += 1) {
          if (hadPoint[c]) {
            nodeGraphOneDimensionalBurnBreakPath(out[c]);
          }
          hadPoint[c] = false;
          prevSample[c] = NaN;
        }
        phasor = 0;
        syncAwaitingRestart = false;
      }
    }
    resetWasHigh = resetHigh;
    if (autoSync) {
      samplesSinceSync += 1;
    }

    if (autoSync && syncAwaitingRestart && !horizontalBurn) {
      phasor = 1;
      continue;
    }

    const x = horizontalBurn ? 0 : Math.min(width, phasor * width);
    for (let c = 0; c < list.length; c += 1) {
      if (list[c].enabled === false) {
        continue;
      }
      const sample = list[c].buffer[starts[c] + index] / sampleDiv;
      if (!horizontalBurn && !hadPoint[c] && !joinUsed[c]) {
        joinUsed[c] = true;
        if (typeof nodeGraphOneDimensionalBurnPrependJoin === "function"
          && nodeGraphOneDimensionalBurnPrependJoin(
            out[c],
            carriedJoins[c],
            sample,
            x,
            skipDisc,
            discThreshold,
          )) {
          hadPoint[c] = true;
          prevSample[c] = Number(carriedJoins[c].sample);
        }
      }
      // Same as nodeGraphOneDimensionalBurnFramePoints: break stroke on large jumps.
      if (
        skipDisc
        && hadPoint[c]
        && Number.isFinite(prevSample[c])
        && Math.abs(Number(sample) - prevSample[c]) > discThreshold
      ) {
        nodeGraphOneDimensionalBurnBreakPath(out[c]);
        hadPoint[c] = false;
        nextJoins[c] = null;
      }
      const y = nodeGraphOneDimensionalBurnSampleToY(sample, height, settings);
      const amp = typeof nodeGraphDisplaySettingsAmplitudeScale === "function"
        ? nodeGraphDisplaySettingsAmplitudeScale(settings)
        : 1;
      const energyT = Math.max(0, Math.min(1, Math.abs(nodeGraphFiniteNumber(sample) * amp)));
      if (horizontalBurn) {
        if (hadPoint[c]) {
          nodeGraphOneDimensionalBurnBreakPath(out[c]);
        }
        out[c].push({ x: 0, y, t: energyT });
        out[c].push({ x: width, y, t: energyT });
        nodeGraphOneDimensionalBurnBreakPath(out[c]);
        hadPoint[c] = false;
        prevSample[c] = Number(sample);
      } else {
        out[c].push({ x, y, t: energyT });
        hadPoint[c] = true;
        prevSample[c] = Number(sample);
        nextJoins[c] = { x, y, sample: Number(sample), t: energyT };
      }
    }

    if (!horizontalBurn) {
      phasor += phaseInc;
      if (phasor >= 1) {
        for (let c = 0; c < list.length; c += 1) {
          if (hadPoint[c]) {
            nodeGraphOneDimensionalBurnBreakPath(out[c]);
          }
          hadPoint[c] = false;
          prevSample[c] = NaN;
          nextJoins[c] = null;
        }
        if (autoSync && syncPeriodSamples >= 2) {
          phasor = 1;
          syncAwaitingRestart = true;
        } else {
          phasor -= Math.floor(phasor);
          if (phasor < 0 || phasor >= 1) {
            phasor = 0;
          }
        }
      }
    }
  }

  canvas._lineBurnJoinPoints = horizontalBurn ? null : nextJoins;
  canvas._lineBurnPhasor = phasor;
  canvas._lineBurnResetWasHigh = resetWasHigh;
  canvas._lineBurnSignalWasHigh = signalWasHigh;
  canvas._lineBurnSyncPeriodSamples = syncPeriodSamples;
  canvas._lineBurnSamplesSinceSync = samplesSinceSync;
  canvas._lineBurnSyncAwaitingRestart = syncAwaitingRestart;
  delete canvas._lineBurnSweepOriginFrame;
  return { channels: out, endFrame };
}

function nodeGraphScope1dTraceDrawLayer(context, points, settings, role = "primary", phase = {}) {
  if (!context || !Array.isArray(points) || !points.length) {
    return 0;
  }
  // Size SSOT (like Bright -> intensity): authored CSS px @ 96 -> TraceWoscope uSize.
  const size = nodeGraphScope1dTraceSizePx(settings, role);
  const inkRgb = nodeGraphScope1dTraceInkRgb01(settings, role);
  // Bright scales the 0..1 coverage channel. The present shader looks the
  // shared gradient up at that brightness. Not an alpha, not rgb * bright.
  const brightness = nodeGraphScope1dTraceBrightness01(settings, role);
  const faceMinSide = Math.max(1, Math.min(context.canvas.width, context.canvas.height));
  const plateN = Number(settings?.backgroundBrightness);
  if (typeof TraceWoscope !== "undefined" && typeof TraceWoscope.draw === "function") {
    const stops = typeof nodeGraphPhosphorGradientStopsFromSettings === "function"
      ? nodeGraphPhosphorGradientStopsFromSettings(settings, "#ffffff")
      : settings?.gradientStops;
    const woscopeOpts = {
      size,
      color: [1, 1, 1],
      faceMinSide,
      brightness,
      intensity: brightness,
      brightAlong: true,
      // solidCore is 1D stroke profile (not color). Leave it.
      solidCore: true,
      gradientStops: stops,
      plateBrightness: Number.isFinite(plateN) ? Math.max(0, Math.min(1, plateN)) : 0,
      trail: settings?.trail,
      ghost: settings?.ghost,
      traceContinue: phase.traceContinue === true,
      tracePresent: phase.tracePresent !== false,
      presentComposite: phase.presentComposite || "copy",
    };
    const count = TraceWoscope.draw(context, points, woscopeOpts);
    if (count > 0) {
      return count;
    }
  }
  if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    const to = (c) => Math.round(Math.max(0, Math.min(1, Number(c) || 0)) * 255)
      .toString(16)
      .padStart(2, "0");
    const inkHex = `#${to(inkRgb[0])}${to(inkRgb[1])}${to(inkRgb[2])}`;
    return TraceStroke.draw(context, points, {
      size,
      blur: 0,
      brightness: 1,
      color: inkHex,
      faceMinSide,
      composite: "lighter",
    }) || 0;
  }
  return 0;
}

function drawNodeGraphScope1dTraceItem(renderer, item, pixelRatio) {
  if (typeof scopePaintIsFrozen === "function"
    ? scopePaintIsFrozen()
    : (typeof nodeGraphModuleScopePhosphorFrozen === "function"
      && nodeGraphModuleScopePhosphorFrozen())) {
    return;
  }
  const slot = item?.slot;
  const nodeId = String(slot?.nodeId || "");
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : null;
  const settings = nodeGraphScope1dTraceSettingsForNode(node);
  const canvas = typeof ensureNodeGraphModuleScopeFaceCanvas === "function"
    ? ensureNodeGraphModuleScopeFaceCanvas(slot, { mode: "tape" })
    : (typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
      ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
      : null);
  if (typeof nodeGraphWaterfallAbandonTape === "function") {
    nodeGraphWaterfallAbandonTape(canvas);
  }
  const screenElement = item?.screenElement || slot?.scopeElement;
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : 1;
  const syncOk = typeof syncNodeGraphModuleScopeFaceCanvas === "function"
    ? Boolean(syncNodeGraphModuleScopeFaceCanvas(
      canvas, screenElement, pixelRatio, density, { policy: "tape" },
    )?.synced)
    : (typeof syncNodeGraphModuleScopeLocalFallbackCanvas === "function"
      ? syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio, density)
      : Boolean(canvas));
  if (!canvas || !syncOk) {
    return;
  }
  if (typeof tagNodeGraphModuleScopeFaceCanvas === "function") {
    tagNodeGraphModuleScopeFaceCanvas(canvas, "tape");
  }
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

  const gradientFloor = Array.isArray(settings?.gradientStops) && settings.gradientStops.length
    ? settings.gradientStops[0]?.color
    : "";
  const bg = gradientFloor
    || (typeof nodeGraphFacePlateBackground === "function"
      ? nodeGraphFacePlateBackground(
        settings,
        (typeof nodeGraphScope1dTraceSettingsDefaults !== "undefined"
          ? nodeGraphScope1dTraceSettingsDefaults.background
          : "#000000"),
      )
      : "#000000");
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(screenElement, bg);
  }
  const sizeKey = `${canvas.width}x${canvas.height}`;
  if (canvas._s1dSizeKey !== sizeKey) {
    canvas._s1dSizeKey = sizeKey;
    canvas._s1dPrimed = false;
  }
  // No plate fill. Unstroked brightness is presented by the trace shader.
  canvas._s1dPrimed = true;

  let resetBuffer = null;
  if (nodeId && typeof nodeGraphModuleScopeState !== "undefined") {
    const own = nodeGraphModuleScopeState.buffers?.get?.(`${nodeId}:Reset`);
    const ownRecent = Math.floor(nodeGraphFiniteNumber(own?.nodeGraphScopeRecentSampleCount));
    if (own && ownRecent > 0) {
      resetBuffer = own;
    } else if (typeof nodeGraphModuleScopeConnectedSourceBuffer === "function") {
      const wired = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "Reset");
      const wiredRecent = Math.floor(nodeGraphFiniteNumber(wired?.nodeGraphScopeRecentSampleCount));
      if (wired && wiredRecent > 0) {
        resetBuffer = wired;
      }
    }
  }

  const type = String(slot?.type || node?.type || "");
  const stereoPorts = typeof nodeGraphModuleStereoWaterfallPorts === "function"
    ? nodeGraphModuleStereoWaterfallPorts(type)
    : null;
  let channels = [];
  if (stereoPorts && typeof nodeGraphStereoWaterfallBuffers === "function") {
    const stereo = nodeGraphStereoWaterfallBuffers(nodeId, type);
    if (stereo?.left?.length) {
      channels.push({
        buffer: stereo.left,
        enabled: settings.dot1Enabled !== false,
        role: "primary",
      });
    }
    if (stereo?.right?.length) {
      channels.push({
        buffer: stereo.right,
        enabled: settings.secondaryEnabled !== false,
        role: "secondary",
      });
    }
  }
  if (!channels.length) {
    const buffer = item?.buffer;
    if (buffer?.length) {
      channels.push({ buffer, enabled: settings.dot1Enabled !== false, role: "primary" });
    }
  }
  if (!channels.length) {
    return;
  }
  if (typeof renderNodeGraphModuleScopeAnalyzer === "function" && channels[0]?.buffer) {
    renderNodeGraphModuleScopeAnalyzer(slot, channels[0].buffer);
  }

  const syncBuffer = settings
    && nodeGraphDisplaySettingsToggleIsOn?.(settings.sourceSync) !== false
    && typeof nodeGraphModuleTraceInputSyncBuffer === "function"
    ? nodeGraphModuleTraceInputSyncBuffer(nodeId, type)
    : null;
  let amplitudeDivisor = 1;
  if (nodeGraphModuleDefinitions?.[type]?.displayIgnoresAmplitude === true) {
    const amp = Number(node?.params?.amplitude);
    if (Number.isFinite(amp) && Math.abs(amp) > 1e-4) {
      amplitudeDivisor = amp;
    }
  }
  const framed = nodeGraphScope1dTraceFrameChannels(canvas, channels, settings, resetBuffer, {
    syncBuffer,
    amplitudeDivisor,
  });
  let drawn = 0;
  const jobs = [];
  for (let i = 0; i < framed.channels.length; i += 1) {
    const role = channels[i]?.role || (i === 0 ? "primary" : "secondary");
    const shaped = typeof nodeGraphTraceApplyDrawMode === "function"
      ? nodeGraphTraceApplyDrawMode(framed.channels[i], settings)
      : framed.channels[i];
    if (Array.isArray(shaped) && shaped.length) {
      jobs.push({ shaped, role });
    }
  }
  if (!jobs.length) {
    drawn += nodeGraphScope1dTraceDrawLayer(context, [], settings, "primary", {
      tracePresent: true,
    });
  } else {
    for (let i = 0; i < jobs.length; i += 1) {
      drawn += nodeGraphScope1dTraceDrawLayer(context, jobs[i].shaped, settings, jobs[i].role, {
        traceContinue: i > 0,
        tracePresent: i === jobs.length - 1,
      });
    }
  }
  if (drawn > 0 && typeof recordNodeGraphModuleScopeRenderMetrics === "function") {
    recordNodeGraphModuleScopeRenderMetrics(drawn, drawn);
  }
  const endFrame = Number(framed.endFrame);
  if (Number.isFinite(endFrame)) {
    canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = endFrame;
    canvas._nodeGraphScope2dLastDrawnFrame = endFrame;
  }
}

