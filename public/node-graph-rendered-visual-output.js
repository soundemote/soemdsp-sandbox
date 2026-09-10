function renderNodeVisualOutputMeta(entries = {}) {
  const list = document.getElementById("nodeVisualOutputMeta");
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const [label, value] of Object.entries(entries)) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    list.append(term, description);
  }
}

function nodeGraphVisualOutputSourceCanvas() {
  return document.getElementById("nodeVisualOutputCanvas");
}

function nodeGraphVisualOutputSize(sourceCanvas = nodeGraphVisualOutputSourceCanvas()) {
  const sourceWidth = Math.max(1, nodeGraphFiniteNumber(sourceCanvas?.width, 720));
  const sourceHeight = Math.max(1, nodeGraphFiniteNumber(sourceCanvas?.height, 300));
  return { height: sourceHeight, width: sourceWidth };
}

function drawNodeRenderedVisualOutput(options = {}) {
  const canvas = options.canvas || document.getElementById("nodeVisualOutputCanvas");
  const includePlaybackCursor = options.includePlaybackCursor !== false;
  const updateUi = options.updateUi !== false;
  const status = updateUi ? document.getElementById("nodeVisualOutputStatus") : null;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const gradient = context.createRadialGradient(
    width * 0.5,
    height * 0.5,
    0,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.62,
  );
  gradient.addColorStop(0, "#151719");
  gradient.addColorStop(1, "#0b0d0e");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(243, 241, 236, 0.09)";
  context.lineWidth = 1;
  context.beginPath();
  for (const radius of [0.16, 0.29, 0.42]) {
    context.ellipse(
      width / 2,
      height / 2,
      width * radius,
      height * radius,
      0,
      0,
      Math.PI * 2,
    );
  }
  context.moveTo(width / 2, height * 0.08);
  context.lineTo(width / 2, height * 0.92);
  context.moveTo(width * 0.08, height / 2);
  context.lineTo(width * 0.92, height / 2);
  context.stroke();

  const rendered = nodeGraphMvp.rendered;
  const leftSamples = rendered?.leftSamples || rendered?.samples;
  const rightSamples = rendered?.rightSamples;
  const samples = rendered?.samples;
  if (!leftSamples?.length && !samples?.length) {
    if (updateUi) {
      canvas.dataset.visualSource = "unavailable";
      canvas.dataset.visualMode = "waiting";
      canvas.dataset.visualFrames = "0";
      canvas.dataset.visualPlaybackFrame = "";
      canvas.dataset.visualPlaybackProgress = "0";
      canvas.dataset.visualPlaybackState = "idle";
      canvas.dataset.visualPatchFingerprint = "";
      canvas.title = nodeGraphTooltipText("legacyEvidence.visualOutputWaiting");
      renderNodeVisualOutputMeta({
        Frames: 0,
        Mode: "waiting",
        Peak: "0",
        RMS: "0",
        Source: "unavailable",
      });
      if (status) {
        status.textContent = "waiting";
        status.className = "pill";
      }
    }
    return;
  }

  const sourceSamples = leftSamples || samples;
  const visualSettings = normalizeNodeGraphPatchVisual(nodeGraphMvp.patch.visual);
  const visualTheme = nodeGraphVisualThemeColors(visualSettings.theme);
  const useStereo = visualSettings.mode === "stereo-xy" ||
    (visualSettings.mode === "auto" && Boolean(rightSamples?.length));
  const visualMode = useStereo ? "stereo xy" : "mono lag xy";
  const visualScale = 0.42 * visualSettings.scale;
  const lag = useStereo ? 0 : Math.max(1, Math.floor(nodeGraphMvp.sampleRate * 0.001));
  const firstFrame = useStereo ? 0 : lag;
  const step = Math.max(1, Math.floor(sourceSamples.length / 2600));

  function visualPoint(frame) {
    const xSample = useStereo ? sourceSamples[frame] || 0 : sourceSamples[frame - lag] || 0;
    const ySample = useStereo ? rightSamples[frame] || 0 : sourceSamples[frame] || 0;
    return {
      x: width / 2 + xSample * (width * visualScale),
      y: height / 2 - ySample * (height * visualScale),
    };
  }

  function drawVisualTrace({ lineWidth, strokeStyle }) {
    context.lineWidth = lineWidth;
    context.strokeStyle = strokeStyle;
    context.beginPath();
    for (let frame = firstFrame; frame < sourceSamples.length; frame += step) {
      const point = visualPoint(frame);
      if (frame === firstFrame) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }
    context.stroke();
  }

  if (visualSettings.style === "points") {
    context.fillStyle = visualTheme.point;
    if (visualSettings.trail > 0) {
      context.globalAlpha = visualSettings.trail;
      for (let frame = firstFrame; frame < sourceSamples.length; frame += Math.max(step * 9, 9)) {
        const point = visualPoint(frame);
        context.fillRect(point.x - 2, point.y - 2, 4, 4);
      }
      context.globalAlpha = 1;
    }
    for (let frame = firstFrame; frame < sourceSamples.length; frame += Math.max(step * 3, 3)) {
      const point = visualPoint(frame);
      context.fillRect(point.x - 1, point.y - 1, 2, 2);
    }
  } else {
    if (visualSettings.trail > 0) {
      context.globalAlpha = visualSettings.style === "glow"
        ? visualSettings.trail
        : visualSettings.trail * 0.45;
      drawVisualTrace({ lineWidth: visualSettings.style === "glow" ? 4 : 3, strokeStyle: visualTheme.glow });
      context.globalAlpha = 1;
    }
    drawVisualTrace({ lineWidth: 1.3, strokeStyle: visualTheme.trace });
  }

  const playbackFrame = includePlaybackCursor
    ? nodeGraphRenderedPlaybackFrame(sourceSamples.length)
    : null;
  if (playbackFrame !== null) {
    const point = visualPoint(playbackFrame);
    context.save();
    context.strokeStyle = "rgba(243, 241, 236, 0.94)";
    context.fillStyle = "rgba(226, 168, 109, 0.92)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  if (updateUi) {
    canvas.dataset.visualSource = "node graph rendered audio";
    canvas.dataset.visualMode = visualMode;
    canvas.dataset.visualModeSetting = visualSettings.mode;
    canvas.dataset.visualPlaybackFrame = playbackFrame === null ? "" : String(playbackFrame);
    canvas.dataset.visualPlaybackProgress = String(nodeGraphMvp.renderedPlayback?.progress || 0);
    canvas.dataset.visualPlaybackState = playbackFrame === null ? "idle" : "playing";
    canvas.dataset.visualScale = String(visualSettings.scale);
    canvas.dataset.visualStyle = visualSettings.style;
    canvas.dataset.visualTheme = visualSettings.theme;
    canvas.dataset.visualTrail = String(visualSettings.trail);
    canvas.dataset.visualFrames = String(sourceSamples.length);
    canvas.dataset.visualPatchFingerprint = rendered.patchFingerprint || "";
    canvas.dataset.visualPeak = formatCompactNumber(rendered.peak || 0);
    canvas.dataset.visualRms = formatCompactNumber(rendered.rms || 0);
    canvas.title =
      `Node graph visual output / ${canvas.dataset.visualMode} / ` +
      `${sourceSamples.length} frames / peak ${canvas.dataset.visualPeak} / rms ${canvas.dataset.visualRms}`;
    const outputSize = nodeGraphVisualOutputSize(canvas);
    renderNodeVisualOutputMeta({
      Frames: sourceSamples.length,
      Mode: visualSettings.mode === "auto" ? `auto ${visualMode}` : visualMode,
      Output: `${outputSize.width} x ${outputSize.height}`,
      Peak: canvas.dataset.visualPeak,
      Playback: playbackFrame === null ? "idle" : `frame ${playbackFrame}`,
      Patch: canvas.dataset.visualPatchFingerprint,
      RMS: canvas.dataset.visualRms,
      Scale: visualSettings.scale,
      Source: canvas.dataset.visualSource,
      Style: visualSettings.style,
      Theme: visualSettings.theme,
      Trail: visualSettings.trail,
    });
    if (status) {
      status.textContent = visualSettings.mode === "auto" ? `auto ${visualMode}` : visualMode;
      status.className = "pill good";
    }
  }
}
