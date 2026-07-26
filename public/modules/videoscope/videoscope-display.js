// Bespoke display renderer for the videoscope module (displayType
// "videoscopeBurn"). Data arrives self-addressed on nodeGraphDataBus (worklet
// -> main thread via the periodic "scope" postMessage, same mechanism
// Hypersaw's own display uses) rather than through a wired dataInputs
// connection -- see public/modules/videoscope/videoscope-worklet-evaluator.js
// for the producing side. Dot/Line modes draw the native column min/max
// envelope; XY mode draws A-vs-B point pairs.
//
// Brightness: strokes are drawn with globalCompositeOperation "lighter"
// (additive), so overlapping columns build up like phosphor. Without a
// brightness control every stroke was full-intensity, so a transient that
// redraws many overlapping strokes within a single frame saturated every
// channel straight to 255 (white) almost immediately. The "brightness" node
// param (same 0.1-2 range/shape as the spectrogram module's control) scales
// each stroke color's peak intensity before the additive blend, the same
// multiplicative approach spectrogram-display.js uses -- not globalAlpha,
// since canvas silently ignores globalAlpha assignments outside 0-1 and
// values above 1 need to keep working here.

function nodeGraphVideoscopeScaleColor(r, g, b, brightness) {
  const scale = (channel) => Math.max(0, Math.min(255, Math.round(channel * brightness)));
  return `rgb(${scale(r)}, ${scale(g)}, ${scale(b)})`;
}

function drawNodeGraphVideoscopeItem(renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const node = nodeGraphPatchNode(nodeId);
  const mode = Math.round(Number(node?.params?.mode) || 0);
  const brightness = Math.max(0.1, Math.min(2, Number(node?.params?.brightness) || 1));

  if (mode === 2) {
    drawNodeGraphVideoscopeXy(ctx, canvas, nodeId, brightness);
    return;
  }
  drawNodeGraphVideoscopeTrace(ctx, canvas, nodeId, mode === 0, brightness);
}

function drawNodeGraphVideoscopeTrace(ctx, canvas, nodeId, dotMode, brightness) {
  const colMinA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMinA"));
  const colMaxA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMaxA"));
  const colMinB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMinB"));
  const colMaxB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMaxB"));
  if (!colMinA?.length || !colMaxA?.length) {
    return;
  }

  const centerY = canvas.height / 2;
  const halfHeight = canvas.height / 2;
  const columns = colMinA.length;
  const colWidth = canvas.width / columns;

  ctx.globalCompositeOperation = "lighter";
  const drawChannel = (colMin, colMax, color) => {
    if (!colMin?.length || !colMax?.length) {
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = dotMode ? Math.max(1.5, colWidth * 0.6) : Math.max(1, colWidth * 0.9);
    ctx.lineCap = dotMode ? "round" : "butt";
    const count = Math.min(colMin.length, colMax.length, columns);
    for (let col = 0; col < count; col += 1) {
      const x = (col + 0.5) * colWidth;
      const yMin = centerY - clampNodeSliderValue(colMin[col], -1.5, 1.5) * halfHeight;
      const yMax = centerY - clampNodeSliderValue(colMax[col], -1.5, 1.5) * halfHeight;
      ctx.beginPath();
      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
      ctx.stroke();
    }
  };
  drawChannel(colMinA, colMaxA, nodeGraphVideoscopeScaleColor(80, 220, 120, brightness));
  drawChannel(colMinB, colMaxB, nodeGraphVideoscopeScaleColor(90, 160, 255, brightness));
  ctx.globalCompositeOperation = "source-over";
}

function drawNodeGraphVideoscopeXy(ctx, canvas, nodeId, brightness) {
  const xyA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "XyA"));
  const xyB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "XyB"));
  if (!xyA?.length || !xyB?.length) {
    return;
  }
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const halfWidth = canvas.width / 2;
  const halfHeight = canvas.height / 2;
  const count = Math.min(xyA.length, xyB.length);

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = nodeGraphVideoscopeScaleColor(120, 230, 160, brightness);
  ctx.lineWidth = Math.max(1, canvas.width / 400);
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const x = centerX + clampNodeSliderValue(xyA[i], -1.5, 1.5) * halfWidth;
    const y = centerY - clampNodeSliderValue(xyB[i], -1.5, 1.5) * halfHeight;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

nodeGraphModuleScopeCustomRenderers.videoscopeBurn = drawNodeGraphVideoscopeItem;
