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
  const isSecondary = role === "secondary" || role === "right";
  const colorKey = isSecondary
    ? (settings?.secondaryColor ?? settings?.dot1Color)
    : (settings?.dot1Color ?? settings?.color);
  const brightKey = isSecondary
    ? (settings?.secondaryBrightness ?? settings?.dot1Brightness ?? settings?.brightness)
    : (settings?.dot1Brightness ?? settings?.brightness);
  const hue = typeof nodeGraphHueDegFromHex === "function"
    ? nodeGraphHueDegFromHex(colorKey)
    : (isSecondary ? 240 : 0);
  const bright = Number(brightKey);
  const amount = Number.isFinite(bright) ? bright : 0.5;
  if (typeof nodeGraphHueBrightnessRgb01 === "function") {
    return nodeGraphHueBrightnessRgb01(hue, amount);
  }
  return isSecondary ? [0, 0, 1] : [1, 0, 0];
}

/**
 * Stereo / multi-channel 1D Trace points on one shared sweep phasor.
 * channels: Array<{ buffer: Float32Array, enabled?: boolean }>
 * Returns { channels: points[][], endFrame }
 * Phasor / Reset / Sync state lives on the face canvas (same keys as 1D Phosphor).
 */
function nodeGraphScope1dTraceFrameChannels(canvas, channels, settings, resetBuffer = null) {
  const list = Array.isArray(channels) ? channels.filter((ch) => ch?.buffer?.length) : [];
  if (!list.length || !canvas?.width || !canvas?.height) {
    return { channels: list.map(() => []), endFrame: null };
  }
  let driver = list[0].buffer;
  let maxCount = 0;
  let endFrame = null;
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
  let resetWasHigh = canvas._lineBurnResetWasHigh === true;
  const autoSync = typeof nodeGraphDisplaySettingsToggleIsOn === "function"
    ? nodeGraphDisplaySettingsToggleIsOn(settings?.sourceSync ?? settings?.sync)
    : Boolean(settings?.sourceSync);
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
  const starts = list.map((ch) => Math.max(0, ch.buffer.length - maxCount));
  const syncBuf = list[0].buffer;
  const syncStart = starts[0];

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
      const sample = list[c].buffer[starts[c] + index];
      const y = nodeGraphOneDimensionalBurnSampleToY(sample, height, settings);
      if (horizontalBurn) {
        if (hadPoint[c]) {
          nodeGraphOneDimensionalBurnBreakPath(out[c]);
        }
        out[c].push({ x: 0, y });
        out[c].push({ x: width, y });
        nodeGraphOneDimensionalBurnBreakPath(out[c]);
        hadPoint[c] = false;
      } else {
        out[c].push({ x, y });
        hadPoint[c] = true;
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

  canvas._lineBurnPhasor = phasor;
  canvas._lineBurnResetWasHigh = resetWasHigh;
  canvas._lineBurnSignalWasHigh = signalWasHigh;
  canvas._lineBurnSyncPeriodSamples = syncPeriodSamples;
  canvas._lineBurnSamplesSinceSync = samplesSinceSync;
  canvas._lineBurnSyncAwaitingRestart = syncAwaitingRestart;
  delete canvas._lineBurnSweepOriginFrame;
  return { channels: out, endFrame };
}

function nodeGraphScope1dTraceDrawLayer(context, points, settings, role = "primary") {
  if (!context || !Array.isArray(points) || !points.length) {
    return 0;
  }
  const size = role === "secondary" || role === "right"
    ? (settings?.secondarySize ?? settings?.dot1Size)
    : settings?.dot1Size;
  const inkRgb = nodeGraphScope1dTraceInkRgb01(settings, role);
  const faceMinSide = Math.max(1, Math.min(context.canvas.width, context.canvas.height));
  if (typeof TraceWoscope !== "undefined" && typeof TraceWoscope.draw === "function") {
    const count = TraceWoscope.draw(context, points, {
      size,
      color: inkRgb,
      faceMinSide,
    });
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

  const bg = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground(
      settings,
      (typeof nodeGraphScope1dTraceSettingsDefaults !== "undefined"
        ? nodeGraphScope1dTraceSettingsDefaults.background
        : "#000000"),
    )
    : "#000000";
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(screenElement, bg);
  }
  const sizeKey = `${canvas.width}x${canvas.height}`;
  if (canvas._s1dSizeKey !== sizeKey) {
    canvas._s1dSizeKey = sizeKey;
    canvas._s1dPrimed = false;
  }
  if (!canvas._s1dPrimed) {
    if (typeof nodeGraphFacePlateFillCanvas === "function") {
      nodeGraphFacePlateFillCanvas(context, canvas, bg);
    } else {
      context.fillStyle = bg;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    canvas._s1dPrimed = true;
  }
  if (typeof nodeGraphScopeDestFadeTowardPlate === "function") {
    nodeGraphScopeDestFadeTowardPlate(context, canvas, bg, settings.trail, settings.ghost);
  }

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
  const stereoPorts = typeof nodeGraphModuleStereoTracePorts === "function"
    ? nodeGraphModuleStereoTracePorts(type)
    : null;
  let channels = [];
  if (stereoPorts && typeof nodeGraphStereoTraceBuffers === "function") {
    const stereo = nodeGraphStereoTraceBuffers(nodeId, type);
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

  const framed = nodeGraphScope1dTraceFrameChannels(canvas, channels, settings, resetBuffer);
  let drawn = 0;
  for (let i = 0; i < framed.channels.length; i += 1) {
    const role = channels[i]?.role || (i === 0 ? "primary" : "secondary");
    const shaped = typeof nodeGraphTraceApplyDrawMode === "function"
      ? nodeGraphTraceApplyDrawMode(framed.channels[i], settings)
      : framed.channels[i];
    drawn += nodeGraphScope1dTraceDrawLayer(context, shaped, settings, role);
  }
  if (drawn > 0 && typeof recordNodeGraphModuleScopeRenderMetrics === "function") {
    recordNodeGraphModuleScopeRenderMetrics(drawn, drawn);
  }
  const endFrame = Number(framed.endFrame);
  if (Number.isFinite(endFrame)) {
    canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = endFrame;
    canvas._nodeGraphScope2dLastDrawnFrame = endFrame;
  }
  if (typeof nodeGraphScopeDestFadeGhostAfterStamps === "function") {
    nodeGraphScopeDestFadeGhostAfterStamps(context, canvas);
  }
}
