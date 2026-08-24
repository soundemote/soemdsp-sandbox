// Scope sync / trigger helpers peeled from module-scopes.js (Phase D).
// Load after scopes.js. Extract-only.

function nodeGraphModuleScopeRisingCrossings(buffer, threshold, start = 1, end = buffer.length, options = {}) {
  const crossings = [];
  const first = Math.max(1, Math.floor(start));
  const limit = Math.min(buffer?.length || 0, Math.ceil(end));
  const level = Number(threshold);
  if (!Number.isFinite(level) || limit <= first) {
    return crossings;
  }
  const hyst = Math.max(0, Number(options.hysteresis) || 0);
  if (hyst <= 0) {
    for (let index = first; index < limit; index += 1) {
      const previous = Number(buffer[index - 1]) || 0;
      const current = Number(buffer[index]) || 0;
      if (previous <= level && current > level) {
        const delta = current - previous;
        const fraction = Math.abs(delta) > 1e-12
          ? clampNodeSliderValue((level - previous) / delta, 0, 1)
          : 0;
        crossings.push((index - 1) + fraction);
      }
    }
    return crossings;
  }
  const low = level - hyst;
  const high = level + hyst;
  let armed = (Number(buffer[first - 1]) || 0) < low;
  for (let index = first; index < limit; index += 1) {
    const previous = Number(buffer[index - 1]) || 0;
    const current = Number(buffer[index]) || 0;
    if (current < low) {
      armed = true;
      continue;
    }
    if (!armed || current <= high || previous > high) {
      continue;
    }
    // Fire on rising through the high threshold while armed.
    const delta = current - previous;
    const fraction = Math.abs(delta) > 1e-12
      ? clampNodeSliderValue((high - previous) / delta, 0, 1)
      : 0;
    crossings.push((index - 1) + fraction);
    armed = false;
  }
  return crossings;
}

function nodeGraphModuleScopeMedianPeriod(crossings) {
  if (!Array.isArray(crossings) || crossings.length < 2) {
    return null;
  }
  const distances = [];
  for (let index = 1; index < crossings.length; index += 1) {
    const distance = crossings[index] - crossings[index - 1];
    if (distance >= 2) {
      distances.push(distance);
    }
  }
  if (!distances.length) {
    return null;
  }
  distances.sort((a, b) => a - b);
  const periodSamples = distances[Math.floor(distances.length / 2)];
  return Number.isFinite(periodSamples) && periodSamples > 0 ? periodSamples : null;
}

function nodeGraphModuleScopeLowpassSyncTrace(buffer, start, end, periodSamples = 0) {
  const first = Math.max(0, Math.floor(start));
  const limit = Math.min(buffer.length, Math.ceil(end));
  if (limit - first < 3) {
    return null;
  }
  const threshold = nodeGraphModuleScopeThreshold(buffer, first, limit);
  if (threshold === null) {
    return null;
  }
  const sampleRate = nodeGraphScopeSampleRate(buffer);
  // Light noise taming only — keep cutoff high so audio still yields rising
  // zero-crossings. We do not need a clean fundamental (old default 120 Hz →
  // 480 Hz cut killed ~1 kHz+ sines and left Sync stuck on a bad period).
  const fundamental = periodSamples > 0 ? sampleRate / periodSamples : 0;
  const cutoff = clampNodeSliderValue(
    fundamental > 0
      ? Math.max(fundamental * 4, sampleRate * 0.2)
      : sampleRate * 0.35,
    20,
    sampleRate * 0.45,
  );
  const alpha = clampNodeSliderValue(1 - Math.exp((-2 * Math.PI * cutoff) / Math.max(1, sampleRate)), 0.001, 1);
  const trace = new Float32Array(limit - first);
  let y1 = (Number(buffer[first]) || 0) - threshold;
  let y2 = y1;
  let y3 = y1;
  let y4 = y1;
  for (let index = first; index < limit; index += 1) {
    const input = (Number(buffer[index]) || 0) - threshold;
    y1 += (input - y1) * alpha;
    y2 += (y1 - y2) * alpha;
    y3 += (y2 - y3) * alpha;
    y4 += (y3 - y4) * alpha;
    trace[index - first] = y4;
  }
  return {
    start: first,
    threshold,
    trace,
  };
}

function nodeGraphModuleScopeTraceRisingCrossings(trace, start = 1, end = trace?.length || 0, offset = 0) {
  return nodeGraphModuleScopeRisingCrossings(trace || [], 0, start, end)
    .map((crossing) => crossing + offset);
}

function nodeGraphModuleScopeSyncBuffer(buffer) {
  return buffer?.nodeGraphScopeSyncBuffer?.length === buffer?.length
    ? buffer.nodeGraphScopeSyncBuffer
    : buffer;
}

/**
 * Collect oscilloscope-style rising triggers in a buffer slice.
 * Light low-pass + hysteresis; falls back to raw hysteresis edges.
 * Returns { edges, periodSamples, threshold, span } — edges may be empty.
 */
function nodeGraphModuleScopeCollectSyncTriggers(syncBuffer, searchStart, searchEnd, periodHint = 0, thresholdHint = null) {
  const empty = { edges: [], periodSamples: null, span: 0, threshold: null };
  if (!syncBuffer?.length) {
    return empty;
  }
  const first = Math.max(0, Math.floor(searchStart));
  const limit = Math.min(syncBuffer.length, Math.ceil(searchEnd));
  if (limit - first < 4) {
    return empty;
  }
  const range = nodeGraphModuleScopeSampleRange(syncBuffer, first, limit);
  if (!range) {
    return empty;
  }
  const threshold = Number.isFinite(Number(thresholdHint)) ? Number(thresholdHint) : range.mid;
  const hyst = Math.max(range.span * 0.04, 1e-4);
  const periodSeed = Number(periodHint) > 0 ? Number(periodHint) : 0;
  // Prefer filtered zero-crossings (AC path) — less noise than raw level snaps.
  const syncTrace = nodeGraphModuleScopeLowpassSyncTrace(
    syncBuffer,
    first,
    limit,
    periodSeed > 0 ? periodSeed : 0,
  );
  let edges = [];
  if (syncTrace?.trace?.length > 2) {
    // Filtered trace is centered near 0; use hysteresis around 0.
    const acHyst = Math.max(1e-4, range.span * 0.03);
    edges = nodeGraphModuleScopeRisingCrossings(
      syncTrace.trace,
      0,
      1,
      syncTrace.trace.length,
      { hysteresis: acHyst },
    ).map((crossing) => crossing + (syncTrace.start || 0));
  }
  if (!edges.length) {
    edges = nodeGraphModuleScopeRisingCrossings(
      syncBuffer,
      threshold,
      first + 1,
      limit,
      { hysteresis: hyst },
    );
  }
  const measuredPeriod = nodeGraphModuleScopeMedianPeriod(edges);
  const periodSamples = measuredPeriod
    || (periodSeed > 0 ? periodSeed : null);
  return {
    edges,
    periodSamples,
    span: range.span,
    threshold,
  };
}

function nodeGraphModuleScopeEstimatedCycle(buffer) {
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(buffer);
  if (!syncBuffer?.length) {
    return null;
  }
  const searchStart = Math.max(0, syncBuffer.length - Math.min(syncBuffer.length, 8192));
  const searchEnd = syncBuffer.length;
  const hintedPeriodSamples = Number(buffer?.nodeGraphScopePeriodSamples);
  const triggers = nodeGraphModuleScopeCollectSyncTriggers(
    syncBuffer,
    searchStart,
    searchEnd,
    Number.isFinite(hintedPeriodSamples) && hintedPeriodSamples > 0 ? hintedPeriodSamples : 0,
    null,
  );
  if (Number.isFinite(hintedPeriodSamples) && hintedPeriodSamples > 0) {
    return {
      periodSamples: hintedPeriodSamples,
      threshold: triggers.threshold ?? nodeGraphModuleScopeThreshold(syncBuffer, searchStart, searchEnd),
    };
  }
  if (!triggers.periodSamples || triggers.threshold === null) {
    return null;
  }
  return {
    periodSamples: triggers.periodSamples,
    threshold: triggers.threshold,
  };
}

/** Most recent rising edge that still fits [start, start+visible] inside the buffer. */
function nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples) {
  const periodSamples = Number(cycleEstimate?.periodSamples) || 0;
  if (!syncBuffer?.length || !(visibleSamples > 0)) {
    return null;
  }
  const periodForSearch = periodSamples > 0 ? periodSamples : Math.max(32, visibleSamples * 0.25);
  const searchSpan = Math.min(
    syncBuffer.length,
    Math.max(visibleSamples + periodForSearch * 6, 1024),
  );
  const searchStart = Math.max(1, syncBuffer.length - Math.ceil(searchSpan));
  const searchEnd = syncBuffer.length;
  const triggers = nodeGraphModuleScopeCollectSyncTriggers(
    syncBuffer,
    searchStart,
    searchEnd,
    periodSamples,
    cycleEstimate?.threshold,
  );
  for (let index = triggers.edges.length - 1; index >= 0; index -= 1) {
    const start = triggers.edges[index];
    if (
      Number.isFinite(start)
      && start >= 0
      && start + visibleSamples <= syncBuffer.length
    ) {
      return start;
    }
  }
  return null;
}

/**
 * Pick a trigger index for the visible window.
 * Prefer phase continuity with `phaseHint`, else the most recent valid edge
 * (true scope re-trigger — not “nearest freerun end”).
 */
function nodeGraphTraceDisplaySyncedStart(syncBuffer, cycleEstimate, visibleSamples, validStart, validEnd, phaseHint = null) {
  const periodSamples = Number(cycleEstimate?.periodSamples) || 0;
  if (!syncBuffer?.length || !(visibleSamples > 0)) {
    return null;
  }
  const periodForSearch = periodSamples > 0 ? periodSamples : Math.max(32, visibleSamples * 0.25);
  const searchSpan = Math.min(
    syncBuffer.length,
    Math.max(visibleSamples + periodForSearch * 8, 1024),
  );
  const searchEnd = Math.min(syncBuffer.length, validEnd);
  const searchStart = Math.max(1, searchEnd - Math.ceil(searchSpan));
  if (searchEnd <= searchStart + 1) {
    return null;
  }
  const triggers = nodeGraphModuleScopeCollectSyncTriggers(
    syncBuffer,
    searchStart,
    searchEnd,
    periodSamples,
    cycleEstimate?.threshold,
  );
  const period = triggers.periodSamples || periodSamples;
  const valid = [];
  for (const edge of triggers.edges) {
    if (edge >= validStart && edge + visibleSamples <= validEnd) {
      valid.push(edge);
    }
  }
  if (!valid.length) {
    return null;
  }
  if (Number.isFinite(phaseHint) && period > 1) {
    const phaseHits = [];
    for (const edge of valid) {
      let d = Math.abs(edge - phaseHint);
      const mod = ((d % period) + period) % period;
      d = Math.min(mod, period - mod);
      if (d <= period * 0.28) {
        phaseHits.push(edge);
      }
    }
    if (phaseHits.length) {
      // Most recent among phase-compatible edges (stable lock without freezing).
      return Math.max(...phaseHits);
    }
  }
  // Auto / unlocked: most recent edge that still fills the window.
  return Math.max(...valid);
}

function nodeGraphModuleScopeVisibleSamples(buffer, settings, cycleEstimate) {
  const cycles = nodeGraphModuleScopeEffectiveCycles(settings);
  if (cycleEstimate?.periodSamples) {
    return Math.min(buffer.length, Math.max(8, cycleEstimate.periodSamples * cycles));
  }
  const sampleRate = nodeGraphScopeSampleRate(buffer);
  const cycleRatio = Math.max(
    0.001,
    (Number(cycles) || nodeGraphModuleScopeDefaultSettings.cycles) /
      Math.max(0.001, nodeGraphModuleScopeDefaultSettings.cycles),
  );
  return settings.timeMs > 0
    ? Math.min(buffer.length, Math.max(8, Math.round((settings.timeMs / 1000) * sampleRate * cycleRatio)))
    : buffer.length;
}

function nodeGraphTraceDisplayHistorySampleCount(buffer, settings) {
  const safeSettings = typeof normalizeNodeGraphTraceDisplaySettings === "function"
    ? normalizeNodeGraphTraceDisplaySettings(settings)
    : (settings || {});
  const windowSeconds = Number(safeSettings.historySeconds ?? safeSettings.zoomSeconds);
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return Math.max(1, buffer?.length || 1);
  }
  const sampleRate = typeof nodeGraphScopeSampleRate === "function"
    ? nodeGraphScopeSampleRate(buffer)
    : 0;
  const hz = sampleRate > 0
    ? sampleRate
    : (Number(nodeGraphModuleScopeState?.sampleRate) || Number(nodeGraphMvp?.sampleRate) || 44100);
  return Math.max(1, Math.round(windowSeconds * hz));
}

function nodeGraphTraceDisplayVisibleSamples(buffer, settings) {
  const requestedSamples = nodeGraphTraceDisplayHistorySampleCount(buffer, settings);
  if (!Number.isFinite(requestedSamples)) {
    return 0;
  }
  return Math.max(0, Math.min(buffer?.length || 0, requestedSamples));
}

/**
 * Snap the visible sample window so freerun scroll advances in whole pixels.
 *
 * Without this: each frame the window end tracks the latest sample (start += N),
 * and x is remapped as 0..width across the window. When history is long,
 * samples-per-pixel (spp) is >> 1, so a 1-sample advance is a fraction of a
 * pixel — the waveform crawls with subpixel shimmer. Short history (spp≈1)
 * or low pixel density (few columns) already hides it.
 *
 * Snapping start to floor(start / spp) * spp keeps the stroke locked to the
 * pixel grid until enough samples arrive for a full 1px step.
 */
function nodeGraphTraceDisplayPixelLockedView(view, canvasWidthPx) {
  if (!view || !Number.isFinite(Number(view.start)) || !Number.isFinite(Number(view.end))) {
    return view;
  }
  const visible = Number(view.end) - Number(view.start);
  if (!(visible > 0) || !Number.isFinite(visible)) {
    return view;
  }
  const width = Math.max(1, Math.floor(Number(canvasWidthPx) || 1));
  const spp = visible / width;
  if (!(spp > 1e-9) || !Number.isFinite(spp)) {
    return view;
  }
  const snappedStart = Math.floor(Number(view.start) / spp) * spp;
  if (!Number.isFinite(snappedStart)) {
    return view;
  }
  return {
    ...view,
    start: snappedStart,
    end: snappedStart + visible,
  };
}

// 1D Waterfall: Sync Off scrolls with user History; Sync On phase-locks ~2
// cycles to a rising zero-crossing (see paint waterfall). Newest-edge helper
// kept for diagnostics / older callers.

function nodeGraphWaterfallNewestEdgeAbs(syncBuffer) {
  if (!syncBuffer?.length) {
    return null;
  }
  const searchStart = Math.max(1, syncBuffer.length - 8192);
  const triggers = typeof nodeGraphModuleScopeCollectSyncTriggers === "function"
    ? nodeGraphModuleScopeCollectSyncTriggers(syncBuffer, searchStart, syncBuffer.length)
    : null;
  const edges = triggers?.edges;
  if (!edges?.length) {
    return null;
  }
  const idx = Number(edges[edges.length - 1]);
  if (!Number.isFinite(idx)) {
    return null;
  }
  const absEnd = Number(syncBuffer.nodeGraphScopeAbsoluteFrame);
  const total = Number(syncBuffer.nodeGraphScopeTotalSampleCount);
  if (Number.isFinite(absEnd) && absEnd > 0) {
    return absEnd - (syncBuffer.length - idx);
  }
  if (Number.isFinite(total) && total > 0) {
    return total - (syncBuffer.length - idx);
  }
  return idx;
}

/**
 * Oscilloscope-style auto-trigger for Trace / Output displays.
 *
 * Real scopes re-trigger each sweep (not open-loop predict forever). We:
 *  1) Find hysteresis rising edges every frame
 *  2) Prefer an edge phase-compatible with the previous lock (anti-jitter)
 *  3) Else take the most recent edge that still fills the window
 *  4) Brief phase-hold if edges are missing this frame
 *  5) Auto freerun (return null) after a short timeout so the display never freezes
 *
 * `lock` is per-display-node (see traceDisplaySyncLocks) so multiple scopes
 * watching one source do not clobber each other.
 */
function nodeGraphTraceDisplayStabilizedSyncStart(lock, buffer, syncBuffer, cycleEstimate, visibleSamples, validStart, validEnd) {
  if (!(visibleSamples > 0) || validEnd <= validStart) {
    return null;
  }
  const source = syncBuffer || buffer;
  if (!source?.length) {
    return null;
  }
  const periodHint = Number(cycleEstimate?.periodSamples) || 0;
  const totalSampleCount = Number(buffer?.nodeGraphScopeTotalSampleCount);
  const prevTotalSampleCount = Number(lock.lastSyncTotalSampleCount);
  const elapsed = Number.isFinite(prevTotalSampleCount) && Number.isFinite(totalSampleCount)
    ? Math.max(0, totalSampleCount - prevTotalSampleCount)
    : 0;
  const sampleRate = nodeGraphScopeSampleRate(buffer || source);

  // Smooth period so holdoff / phase windows stay stable across frames.
  if (periodHint > 0) {
    const prevPeriod = Number(lock.periodEma);
    lock.periodEma = Number.isFinite(prevPeriod) && prevPeriod > 0
      ? prevPeriod * 0.82 + periodHint * 0.18
      : periodHint;
  }
  const period = Number(lock.periodEma) > 0
    ? Number(lock.periodEma)
    : (periodHint > 0 ? periodHint : 0);

  const prevStart = Number(lock.lastSyncStart);
  let phaseHint = null;
  if (Number.isFinite(prevStart) && elapsed >= 0) {
    // Buffer shifts left as new samples arrive at the end (copyWithin model).
    let predicted = prevStart - elapsed;
    if (period > 1) {
      const maxStart = validEnd - visibleSamples;
      if (maxStart >= validStart) {
        while (predicted < validStart) {
          predicted += period;
        }
        while (predicted > maxStart) {
          predicted -= period;
        }
        if (predicted >= validStart && predicted + visibleSamples <= validEnd) {
          phaseHint = predicted;
        }
      }
    } else if (predicted >= validStart && predicted + visibleSamples <= validEnd) {
      phaseHint = predicted;
    }
  }

  const estimate = {
    periodSamples: period || periodHint,
    threshold: cycleEstimate?.threshold,
  };
  const reacquired = nodeGraphTraceDisplaySyncedStart(
    source,
    estimate,
    visibleSamples,
    validStart,
    validEnd,
    phaseHint,
  );
  if (reacquired !== null) {
    lock.lastSyncStart = reacquired;
    lock.lastSyncPeriod = period || periodHint;
    lock.lastSyncVisibleSamples = visibleSamples;
    lock.lastSyncTotalSampleCount = totalSampleCount;
    lock.missedSamples = 0;
    lock.stuckFrames = 0;
    lock.haveLock = true;
    if (!(Number(lock.periodEma) > 0) && periodHint > 0) {
      lock.periodEma = periodHint;
    }
    return reacquired;
  }

  // No edge this frame — hold phase briefly (Normal-mode stickiness), then
  // Auto freerun so aperiodic / quiet signals never freeze the face.
  const step = Math.max(1, elapsed || Math.round(Math.max(8, sampleRate / 120)));
  lock.missedSamples = (Number(lock.missedSamples) || 0) + step;
  // If samples advance but we keep holding the same phase without reacquire,
  // count "stuck" progress — multi-sync thrash used to freeze here forever.
  if (elapsed > 0 && phaseHint !== null && Number(lock.lastHeldStart) === phaseHint) {
    lock.stuckFrames = (Number(lock.stuckFrames) || 0) + 1;
  } else {
    lock.stuckFrames = 0;
  }
  lock.lastHeldStart = phaseHint;
  const autoTimeout = Math.max(
    visibleSamples,
    period > 0 ? period * 2.5 : 0,
    Math.round(sampleRate * 0.08),
  );
  const stuckTooLong = (Number(lock.stuckFrames) || 0) > 12;
  if (
    lock.haveLock
    && phaseHint !== null
    && lock.missedSamples < autoTimeout
    && !stuckTooLong
  ) {
    lock.lastSyncStart = phaseHint;
    lock.lastSyncPeriod = period || periodHint;
    lock.lastSyncVisibleSamples = visibleSamples;
    lock.lastSyncTotalSampleCount = totalSampleCount;
    return phaseHint;
  }

  // Lost lock — freerun (caller uses latest window). Ready to re-arm next edge.
  lock.haveLock = false;
  lock.missedSamples = 0;
  lock.stuckFrames = 0;
  lock.lastHeldStart = null;
  if (Number.isFinite(totalSampleCount)) {
    lock.lastSyncTotalSampleCount = totalSampleCount;
  }
  return null;
}

/**
 * 1D Waterfall + 1D Phosphor share one Sync feature.
 * Stereo waterfall uses syncChannel (off/left/right/mono);
 * everything else uses sourceSync on/off (stored as mono/off).
 */
const NODE_GRAPH_DISPLAY_1D_SYNC_FORM_TYPES = Object.freeze(["trace", "lineBurn", "dot"]);

function nodeGraphDisplayFormTypeHas1dSync(formType) {
  return NODE_GRAPH_DISPLAY_1D_SYNC_FORM_TYPES.includes(String(formType || "").trim());
}

/**
 * Resolve sync mode: "off" | "left" | "right" | "mono".
 * SSOT for Instant Trace window lock and 1D phosphor auto-trigger.
 * Legacy: sourceSync / settings.sync true → mono; false → off.
 */
function nodeGraphTraceDisplaySyncChannel(settings) {
  const raw = String(settings?.syncChannel || "").toLowerCase().trim();
  if (raw === "left" || raw === "right" || raw === "mono" || raw === "off") {
    return raw;
  }
  if (settings?.sourceSync === false || settings?.sync === false) {
    return "off";
  }
  if (settings?.sourceSync || settings?.sync === true) {
    return "mono";
  }
  return "off";
}

function nodeGraphDisplaySyncIsOn(settings) {
  return nodeGraphTraceDisplaySyncChannel(settings) !== "off";
}

function nodeGraphDisplayApplySyncEnabled(settings, on) {
  const next = settings && typeof settings === "object" ? { ...settings } : {};
  if (on) {
    next.sourceSync = true;
    const channel = String(next.syncChannel || "").toLowerCase().trim();
    next.syncChannel = channel === "left" || channel === "right" || channel === "mono"
      ? channel
      : "mono";
  } else {
    next.sourceSync = false;
    next.syncChannel = "off";
  }
  return next;
}

function nodeGraphNodeDisplaySyncSettings(node) {
  if (!node) {
    return {};
  }
  const schema = typeof nodeGraphModuleDisplaySettingsSchemaForNode === "function"
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : "";
  if (schema === "dot" && typeof nodeGraphZeroDBurnSettingsForNode === "function") {
    return nodeGraphZeroDBurnSettingsForNode(node);
  }
  if (schema === "lineBurn" && typeof nodeGraphLineBurnSettingsForNode === "function") {
    return nodeGraphLineBurnSettingsForNode(node);
  }
  if (typeof nodeGraphTraceDisplaySettingsForNode === "function") {
    return nodeGraphTraceDisplaySettingsForNode(node);
  }
  return node.traceDisplaySettings || {};
}

function nodeGraphNodeDisplaySyncIsOn(node) {
  return nodeGraphDisplaySyncIsOn(nodeGraphNodeDisplaySyncSettings(node));
}

function nodeGraphToggleNodeDisplaySync(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) {
    return;
  }
  const schema = typeof nodeGraphModuleDisplaySettingsSchemaForNode === "function"
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : "trace";
  const current = nodeGraphNodeDisplaySyncSettings(node);
  const next = nodeGraphDisplayApplySyncEnabled(current, !nodeGraphDisplaySyncIsOn(current));
  if (typeof assignNodeGraphTypedDisplaySettingsToNode === "function") {
    assignNodeGraphTypedDisplaySettingsToNode(node, schema, next);
  } else {
    node.traceDisplaySettings = next;
  }
  if (typeof writeNodeGraphTraceDisplaySettingsForm === "function") {
    writeNodeGraphTraceDisplaySettingsForm(next);
  }
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  }
  if (typeof updateNodeGraphModuleScopeSetting === "function") {
    updateNodeGraphModuleScopeSetting(nodeId, { sync: next.sourceSync === true });
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
}

/** Average L/R into a lightweight buffer for mono cycle detection. */
function nodeGraphTraceDisplayMonoSyncBuffer(leftBuffer, rightBuffer) {
  if (!leftBuffer?.length || !rightBuffer?.length) {
    return leftBuffer || rightBuffer || null;
  }
  const n = Math.min(leftBuffer.length, rightBuffer.length);
  // Scratch lives on a pair-specific key so concurrent scopes don't stomp one mono pad.
  const pairKey = `${nodeGraphScopeBufferObjectId(leftBuffer)}|${nodeGraphScopeBufferObjectId(rightBuffer)}`;
  if (!nodeGraphModuleScopeState.monoSyncScratch) {
    nodeGraphModuleScopeState.monoSyncScratch = new Map();
  }
  let mono = nodeGraphModuleScopeState.monoSyncScratch.get(pairKey);
  if (!mono || !(mono instanceof Float32Array) || mono.length < n) {
    mono = new Float32Array(n);
    nodeGraphModuleScopeState.monoSyncScratch.set(pairKey, mono);
  }
  for (let i = 0; i < n; i += 1) {
    const a = Number(leftBuffer[i]);
    const b = Number(rightBuffer[i]);
    mono[i] = ((Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0)) * 0.5;
  }
  // Attach the same metadata cycle/view helpers expect on captured buffers.
  const head = {
    length: n,
    nodeGraphScopeBufferKey: `mono:${pairKey}`,
    nodeGraphScopeTotalSampleCount: leftBuffer.nodeGraphScopeTotalSampleCount
      ?? rightBuffer.nodeGraphScopeTotalSampleCount,
    nodeGraphScopeRecentSampleCount: leftBuffer.nodeGraphScopeRecentSampleCount
      ?? rightBuffer.nodeGraphScopeRecentSampleCount,
    nodeGraphScopeAbsoluteFrame: leftBuffer.nodeGraphScopeAbsoluteFrame
      ?? rightBuffer.nodeGraphScopeAbsoluteFrame,
  };
  // Proxy numeric index access onto the Float32Array.
  return new Proxy(head, {
    get(target, prop) {
      if (prop === "length") {
        return n;
      }
      if (prop === "nodeGraphScopeBufferKey") {
        return target.nodeGraphScopeBufferKey;
      }
      if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
        return mono[Number(prop)];
      }
      if (prop in target) {
        return target[prop];
      }
      return mono[prop];
    },
  });
}

