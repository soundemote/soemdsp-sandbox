// XYZ Trace — three 1D history plots. X=red, Y=blue, Z=green.
// Stack: all three on one plot (blend like Output). Separate: three vertical bands.

const nodeGraphTraceXyzColors = Object.freeze({
  X: "#ff0000",
  Y: "#0000ff",
  Z: "#00ff00",
});

const nodeGraphTraceXyzPorts = Object.freeze(["X", "Y", "Z"]);

function nodeGraphTraceXyzSettingsForNode(node) {
  const raw = node?.traceDisplaySettings;
  if (typeof normalizeNodeGraphTraceDisplaySettings === "function") {
    return normalizeNodeGraphTraceDisplaySettings(raw);
  }
  return raw && typeof raw === "object" ? raw : {};
}

function nodeGraphTraceXyzPickBuffer(slot, port) {
  const local = typeof nodeGraphModuleScopeState === "object"
    ? nodeGraphModuleScopeState.buffers.get(`${slot.nodeId}:${port}`)
    : null;
  const connected = typeof nodeGraphModuleScopeConnectedSourceBuffer === "function"
    ? nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, port)
    : null;
  if (typeof nodeGraphScope2dPickRicherBuffer === "function") {
    return nodeGraphScope2dPickRicherBuffer(local, connected);
  }
  return connected || local || null;
}

function nodeGraphTraceXyzBuildPoints(buffer, canvas, slot, rect) {
  if (typeof buildNodeGraphTraceDisplayCanvasPoints === "function") {
    const prepared = typeof prepareNodeGraphTraceDisplayBuffer === "function"
      ? prepareNodeGraphTraceDisplayBuffer(buffer, nodeGraphTraceDisplaySettingsForSlot?.(slot))
      : buffer;
    return buildNodeGraphTraceDisplayCanvasPoints(prepared || buffer, canvas, slot, null, rect);
  }
  if (typeof TraceWaveform !== "undefined" && typeof TraceWaveform.buildPoints === "function" && buffer?.length) {
    const width = rect ? rect.width : canvas.width;
    const height = rect ? rect.height : canvas.height;
    const built = TraceWaveform.buildPoints({
      buffer,
      start: 0,
      end: buffer.length,
      width,
      height,
      midY: height * 0.5,
      halfHeight: height * 0.45,
      gain: 1,
      offset: 0,
    });
    if (!rect || (!rect.x && !rect.y)) {
      return built;
    }
    return built.map((p) => (p && Number.isFinite(p.x) ? { x: p.x + rect.x, y: p.y + rect.y } : p));
  }
  return [];
}

function drawNodeGraphTraceXyzFaceItem(_renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
    : null;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    return;
  }
  const settings = nodeGraphTraceXyzSettingsForNode(
    typeof nodeGraphModuleScopeNodeForSlot === "function" ? nodeGraphModuleScopeNodeForSlot(slot) : null,
  );
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : 1;
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, face, pixelRatio, density)) {
    return;
  }
  canvas.classList.add("node-module-scope-vector-trace");
  canvas.style.imageRendering = density < 0.999 ? "pixelated" : "";
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const bg = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground(settings)
    : (settings.background || "#000000");
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(face, bg);
  }
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(ctx, canvas, bg);
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  if (frozen) {
    return;
  }

  const history = Number(settings.historySeconds ?? settings.zoomSeconds) || 0.05;
  const captured = typeof nodeGraphRgbAlignedCapture === "function"
    ? nodeGraphRgbAlignedCapture(slot, nodeGraphTraceXyzPorts, history)
    : null;
  const buffers = {
    X: captured?.X || nodeGraphTraceXyzPickBuffer(slot, "X"),
    Y: captured?.Y || nodeGraphTraceXyzPickBuffer(slot, "Y"),
    Z: captured?.Z || nodeGraphTraceXyzPickBuffer(slot, "Z"),
  };
  const hasAny = nodeGraphTraceXyzPorts.some((port) => buffers[port]?.length);
  if (!hasAny) {
    return;
  }

  const size = Number.isFinite(Number(settings.dot1Size)) ? Number(settings.dot1Size) : 0.035;
  const blur = Number.isFinite(Number(settings.lineThickness)) ? Number(settings.lineThickness) : 0.15;
  const budget = Math.max(8, Math.round(Number(settings.dotBudget) || 2048));
  const blend = settings.stereoBlend || "combine";
  const layout = String(settings.xyzLayout || "stack").toLowerCase() === "separate"
    ? "separate"
    : "stack";
  const faceMin = Math.min(canvas.width, canvas.height);
  const strokeOpts = {
    size,
    blur,
    dotBudget: budget,
    faceMinSide: faceMin,
    blend,
    meetColor: "auto",
  };

  if (layout === "separate") {
    const bandH = canvas.height / 3;
    for (let i = 0; i < nodeGraphTraceXyzPorts.length; i += 1) {
      const port = nodeGraphTraceXyzPorts[i];
      const buffer = buffers[port];
      if (!buffer?.length) {
        continue;
      }
      const rect = { x: 0, y: i * bandH, width: canvas.width, height: bandH };
      const points = nodeGraphTraceXyzBuildPoints(buffer, canvas, slot, rect);
      if (typeof TraceHistoryDraw !== "undefined" && typeof TraceHistoryDraw.strokeSolid === "function") {
        TraceHistoryDraw.strokeSolid(ctx, points, {
          ...strokeOpts,
          color: nodeGraphTraceXyzColors[port],
          blend: "source-over",
        });
      }
    }
    return;
  }

  const layers = nodeGraphTraceXyzPorts.map((port) => {
    const buffer = buffers[port];
    return {
      enabled: Boolean(buffer?.length),
      color: nodeGraphTraceXyzColors[port],
      points: buffer?.length ? nodeGraphTraceXyzBuildPoints(buffer, canvas, slot, null) : [],
    };
  });
  if (typeof TraceHistoryDraw !== "undefined" && typeof TraceHistoryDraw.strokeLayers === "function") {
    if (blend !== "combine") {
      // plate already filled
    } else {
      // Meet/add writes opaque pixels — keep plate under holes.
    }
    TraceHistoryDraw.strokeLayers(ctx, layers, strokeOpts);
    if (blend === "combine" && typeof nodeGraphFacePlateFillUnder === "function") {
      nodeGraphFacePlateFillUnder(ctx, canvas, bg);
    }
    return;
  }
  for (const layer of layers) {
    if (typeof TraceHistoryDraw !== "undefined" && typeof TraceHistoryDraw.strokeSolid === "function") {
      TraceHistoryDraw.strokeSolid(ctx, layer.points, {
        ...strokeOpts,
        color: layer.color,
        blend: blend === "combine" ? "lighter" : blend,
      });
    }
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.traceXyz = drawNodeGraphTraceXyzFaceItem;
}
