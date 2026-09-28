function signalPlotRegionColor(index) {
  return index % 2 === 0 ? "rgba(127,199,217,0.76)" : "rgba(226,168,109,0.72)";
}

function drawSignalPlot() {
  const canvas = document.getElementById("signalPlotCanvas");
  const waveform = state.waveform;
  if (!waveform) {
    return;
  }

  const samples = waveform.samples;
  const lagFrames = signalPlotLagFrames(waveform);
  const drawableFrames = Math.max(0, samples.length - lagFrames);
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(240, Math.floor(canvas.clientHeight * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111418";
  context.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const scale = Math.min(width, height) * 0.44 * state.signalPlotScale;

  context.strokeStyle = "rgba(243,241,236,0.16)";
  context.lineWidth = Math.max(1, pixelRatio);
  context.beginPath();
  context.moveTo(centerX, 0);
  context.lineTo(centerX, height);
  context.moveTo(0, centerY);
  context.lineTo(width, centerY);
  context.stroke();

  if (drawableFrames === 0) {
    return;
  }

  const stride = Math.max(1, Math.floor(drawableFrames / 4200));
  const regions = signalPlotRegions(waveform, drawableFrames);

  for (const [regionIndex, region] of regions.entries()) {
    const startFrame = Math.max(0, Math.min(drawableFrames, region.startFrame));
    const endFrame = Math.max(startFrame, Math.min(drawableFrames, region.endFrame));
    context.strokeStyle = signalPlotRegionColor(regionIndex);
    context.fillStyle = signalPlotRegionColor(regionIndex);
    context.lineWidth = Math.max(1, pixelRatio);
    if (state.signalPlotMode === "waterfall") {
      context.beginPath();
    }
    let started = false;

    for (let frame = startFrame; frame < endFrame; frame += stride) {
      const x = centerX + samples[frame] * scale;
      const y = centerY - samples[frame + lagFrames] * scale;

      if (state.signalPlotMode === "points") {
        context.fillRect(x, y, Math.max(1, pixelRatio), Math.max(1, pixelRatio));
      } else {
        if (!started) {
          context.moveTo(x, y);
          started = true;
        } else {
          context.lineTo(x, y);
        }
      }
    }

    if (state.signalPlotMode === "waterfall") {
      context.stroke();
    }
  }

  const pointFrame = Math.max(
    0,
    Math.min(drawableFrames - 1, state.playheadFrame),
  );
  context.fillStyle = "#f3f1ec";
  context.beginPath();
  context.arc(
    centerX + samples[pointFrame] * scale,
    centerY - samples[pointFrame + lagFrames] * scale,
    Math.max(3, 3 * pixelRatio),
    0,
    Math.PI * 2,
  );
  context.fill();

  const nearestProbe = state.signalPlotProbe?.nearest;
  if (nearestProbe) {
    const probeFrame = Math.max(
      0,
      Math.min(drawableFrames - 1, nearestProbe.frame),
    );
    const probeX = centerX + samples[probeFrame] * scale;
    const probeY = centerY - samples[probeFrame + lagFrames] * scale;
    const radius = Math.max(7, 7 * pixelRatio);
    context.strokeStyle = "#f6c96d";
    context.lineWidth = Math.max(2, 2 * pixelRatio);
    context.beginPath();
    context.arc(probeX, probeY, radius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(probeX - radius * 1.35, probeY);
    context.lineTo(probeX + radius * 1.35, probeY);
    context.moveTo(probeX, probeY - radius * 1.35);
    context.lineTo(probeX, probeY + radius * 1.35);
    context.stroke();
  }
}

function renderSignalPlot() {
  const status = document.getElementById("signalPlotStatus");
  const meta = document.getElementById("signalPlotMeta");
  const canvas = document.getElementById("signalPlotCanvas");
  const waveform = state.waveform;
  renderSignalPlotControls();
  renderSignalPlotSummary();
  renderSignalPlotPoint();
  renderSignalPlotProbe();
  if (!waveform) {
    canvas.dataset.signalSource = "unavailable";
    canvas.dataset.signalFocus = "unavailable";
    canvas.dataset.signalMode = state.signalPlotMode;
    canvas.dataset.signalScale = String(state.signalPlotScale);
    canvas.dataset.signalWindow = "unavailable";
    canvas.dataset.signalWindowMs = String(state.signalPlotWindowMs);
    canvas.dataset.signalLagMs = String(state.signalLagMs);
    canvas.dataset.signalLagFrames = "unavailable";
    canvas.dataset.signalPoints = "unavailable";
    canvas.title = nodeGraphTooltipText("legacyEvidence.signalPlotUnavailable");
    status.textContent = "Check";
    status.className = "pill warn";
    renderUnavailableSignalPlotMeta();
    return;
  }

  const lagFrames = signalPlotLagFrames(waveform);
  const drawableFrames = Math.max(0, waveform.samples.length - lagFrames);
  const focusStats = signalPlotFocusStats(waveform, drawableFrames);
  const focusName = signalPlotFocusName(waveform);
  const windowName = signalPlotWindowName(waveform, drawableFrames);
  const pointCount = signalPlotPointCount(waveform, drawableFrames);
  canvas.dataset.signalSource = "decoded primary WAV";
  canvas.dataset.signalFocus = focusName;
  canvas.dataset.signalMode = state.signalPlotMode;
  canvas.dataset.signalScale = String(state.signalPlotScale);
  canvas.dataset.signalWindow = windowName;
  canvas.dataset.signalWindowMs = String(state.signalPlotWindowMs);
  canvas.dataset.signalLagMs = String(state.signalLagMs);
  canvas.dataset.signalLagFrames = String(lagFrames);
  canvas.dataset.signalPoints = String(pointCount);
  canvas.dataset.signalFocusPeak = formatCompactNumber(focusStats.peak);
  canvas.dataset.signalFocusRms = formatCompactNumber(focusStats.rms);
  canvas.title =
    `Primary WAV signal plot / ${focusName} / ${state.signalPlotMode} / ` +
    `x${state.signalPlotScale} / ${windowName} / lag ${state.signalLagMs} ms / ${pointCount} points`;
  drawSignalPlot();
  renderKeyValue(meta, [
    ["focus", focusName],
    ["mode", state.signalPlotMode],
    ["scale", `x${state.signalPlotScale}`],
    ["window", windowName],
    ["window size", `${state.signalPlotWindowMs} ms`],
    ["x", "sample[n]"],
    ["y", "sample[n + lag]"],
    ["lag", `${state.signalLagMs} ms`],
    ["lag frames", String(lagFrames)],
    ["lag time", formatSeconds(lagFrames / waveform.sampleRate)],
    ["points", String(pointCount)],
    ["focus peak", formatCompactNumber(focusStats.peak)],
    ["focus rms", formatCompactNumber(focusStats.rms)],
    ["focus min", formatCompactNumber(focusStats.min)],
    ["focus max", formatCompactNumber(focusStats.max)],
  ]);
  status.textContent = "Drawn";
  status.className = "pill good";
}

function renderUnavailableSignalPlotMeta() {
  renderKeyValue(document.getElementById("signalPlotMeta"), [
    ["focus", "unavailable", "present"],
    ["mode", state.signalPlotMode],
    ["window", "unavailable", "present"],
    ["lag", `${state.signalLagMs} ms`],
    ["points", "unavailable", "present"],
    ["source", "manifest/audio required", "decoded primary WAV"],
  ]);
}
