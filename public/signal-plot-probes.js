function signalPlotProbeAtClientPoint(clientX, clientY) {
  const canvas = document.getElementById("signalPlotCanvas");
  const waveform = state.waveform;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const scale = Math.min(width, height) * 0.44 * state.signalPlotScale;
  const x = (clientX - rect.left - width / 2) / scale;
  const y = -(clientY - rect.top - height / 2) / scale;
  const normalizedX = x;
  const normalizedY = y;

  if (!waveform) {
    return {
      x: normalizedX,
      y: normalizedY,
      nearest: null,
    };
  }

  const lagFrames = signalPlotLagFrames(waveform);
  const drawableFrames = Math.max(0, waveform.samples.length - lagFrames);
  const stride = Math.max(1, Math.floor(drawableFrames / 4200));
  let nearest = null;

  for (const region of signalPlotRegions(waveform, drawableFrames)) {
    const startFrame = Math.max(0, Math.min(drawableFrames, region.startFrame));
    const endFrame = Math.max(startFrame, Math.min(drawableFrames, region.endFrame));
    for (let frame = startFrame; frame < endFrame; frame += stride) {
      const sampleX = waveform.samples[frame] || 0;
      const sampleY = waveform.samples[frame + lagFrames] || 0;
      const distance =
        (sampleX - normalizedX) * (sampleX - normalizedX) +
        (sampleY - normalizedY) * (sampleY - normalizedY);
      if (!nearest || distance < nearest.distance) {
        nearest = {
          frame,
          phase: waveformRegionAtFrame(frame)?.name || "phase",
          seconds: frame / waveform.sampleRate,
          distance,
        };
      }
    }
  }

  return {
    x: normalizedX,
    y: normalizedY,
    nearest,
  };
}

function signalPlotProbeAtFrame(frame) {
  const waveform = state.waveform;
  if (!waveform) {
    return null;
  }

  const lagFrames = signalPlotLagFrames(waveform);
  const drawableFrames = Math.max(0, waveform.samples.length - lagFrames);
  const probeFrame = Math.max(0, Math.min(drawableFrames - 1, frame));
  return {
    x: waveform.samples[probeFrame] || 0,
    y: waveform.samples[probeFrame + lagFrames] || 0,
    nearest: {
      frame: probeFrame,
      phase: waveformRegionAtFrame(probeFrame)?.name || "phase",
      seconds: probeFrame / waveform.sampleRate,
      distance: 0,
    },
  };
}

function renderSignalPlotProbe() {
  const probe = document.getElementById("signalPlotProbe");
  const source = document.getElementById("signalPlotProbeSource");
  if (!state.waveform || !state.signalPlotProbe) {
    resetIdleProbePill("signalPlotProbe", "Signal plot probe idle");
    resetProbePill("signalPlotProbeSource", "near frame", "Signal plot source probe idle");
    return;
  }

  const nearest = state.signalPlotProbe.nearest;
  const probeSource = state.waveformProbeSource || inspectionSources.signalPlot;
  const pointText = `x ${formatCompactNumber(
    state.signalPlotProbe.x,
  )} / y ${formatCompactNumber(state.signalPlotProbe.y)}`;
  probe.textContent = nearest
    ? `probe ${formatProbeFrame(nearest.frame, state.waveform)} / ${pointText}`
    : `probe ${pointText}`;
  setProbePillMetadata(
    probe,
    probeSource,
    nearest?.frame,
    nearest
      ? `Signal plot probe ${probeSource} / ${formatProbeFrame(
          nearest.frame,
          state.waveform,
        )} / ${pointText}`
      : `Signal plot probe ${probeSource} / ${pointText}`,
  );
  source.textContent = nearest
    ? `${probeSourceText()} / near frame ${nearest.frame} / ${formatSeconds(
        nearest.seconds,
      )} / ${nearest.phase}`
    : "near frame";
  setProbePillMetadata(
    source,
    probeSource,
    nearest?.frame,
    nearest
      ? `Signal plot source ${probeSource} / near frame ${nearest.frame} / ${formatSeconds(
          nearest.seconds,
        )} / ${nearest.phase}`
      : `Signal plot source ${probeSource} / no nearest frame`,
  );
}

function probeSignalPlot(event) {
  if (!state.waveform) {
    return;
  }

  state.signalPlotProbe = signalPlotProbeAtClientPoint(event.clientX, event.clientY);
  state.waveformProbeFrame = state.signalPlotProbe.nearest?.frame ?? null;
  state.waveformProbeSource =
    state.waveformProbeFrame === null ? null : inspectionSources.signalPlot;
  drawSignalPlot();
  renderSignalPlotProbe();
  drawWaveform();
  renderWaveformProbe();
  drawLevelEnvelope();
  renderLevelEnvelopeProbe();
}

function clearSignalPlotProbe() {
  resetSharedProbeState();
  drawSignalPlot();
  renderSignalPlotProbe();
  drawWaveform();
  renderWaveformProbe();
  drawLevelEnvelope();
  renderLevelEnvelopeProbe();
}
