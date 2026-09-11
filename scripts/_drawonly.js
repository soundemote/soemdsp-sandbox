function drawNodeGraphTransportBpmItem(renderer, item, pixelRatio) {
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

  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(item.slot)
    : (typeof nodeGraphMvp !== "undefined"
      ? nodeGraphMvp?.patch?.nodes?.find?.((n) => n?.id === nodeId)
      : null);
  // Prefer this module's BPM param; fall back to patch-wide tempo.
  const nodeBpm = Number(node?.params?.bpm);
  const patchBpm = typeof nodeGraphPatchTimingValue === "function"
    ? Number(nodeGraphPatchTimingValue("tempoBpm"))
    : NaN;
  const bpm = Math.max(
    1,
    Math.round(
      (Number.isFinite(nodeBpm) && nodeBpm > 0)
        ? nodeBpm
        : (Number.isFinite(patchBpm) && patchBpm > 0 ? patchBpm : 120),
    ),
  );
  const digits = String(bpm);
  const gate01 = nodeGraphTransportGateLevel01(nodeId, node);
  const gateLit = gate01 > 0.001 ? 1 : 0;
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();

  // While frozen, keep the last gate lamp state so pause doesn't flicker.
  let drawGate = gateLit;
  if (frozen && canvas._nodeGraphTransportGateLit != null) {
    drawGate = canvas._nodeGraphTransportGateLit;
  } else {
    canvas._nodeGraphTransportGateLit = gateLit;
  }

  // Always repaint. Scope wipe / plate fills clear pixels but used to leave
  // stale cache keys, which made the Master Clock face stay blank forever.
  canvas._nodeGraphTransportBpmDigits = digits;
  canvas._nodeGraphTransportBpmFontReady = nodeGraphTransportBpmFontReady;
  canvas._nodeGraphTransportBpmWidth = canvas.width;
  canvas._nodeGraphTransportBpmHeight = canvas.height;
  canvas._nodeGraphTransportGateDrawn = drawGate;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#020a06";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const digitFontFamily = nodeGraphTransportBpmFontReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  const labelHeight = canvas.height * 0.22;
  const digitAreaHeight = canvas.height - labelHeight;
  const charCount = Math.max(1, digits.length);
  const digitFontSize = Math.max(1, Math.min(digitAreaHeight * 0.82, (canvas.width / charCount) * 1.55));

  ctx.font = `${digitFontSize}px ${digitFontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(120, 255, 170, 0.92)";
  ctx.fillText(digits, canvas.width * 0.5, digitAreaHeight * 0.5, canvas.width);

  const labelFontSize = Math.max(1, Math.min(labelHeight * 0.7, canvas.width * 0.14));
  ctx.font = `${labelFontSize}px "Consolas", "Courier New", monospace';
  ctx.fillStyle = "rgba(120, 255, 170, 0.55)";
  ctx.fillText("BPM", canvas.width * 0.5, digitAreaHeight + labelHeight * 0.5, canvas.width);

  // Gate lamp - top-right corner LED on the BPM plate.
  const lampR = Math.max(2, Math.min(canvas.width, canvas.height) * 0.07);
  const lampX = canvas.width - lampR * 1.6;
  const lampY = lampR * 1.4;
  ctx.beginPath();
  ctx.arc(lampX, lampY, lampR, 0, Math.PI * 2);
  if (drawGate) {
    ctx.fillStyle = "rgba(120, 255, 170, 0.95)";
    ctx.shadowColor = "rgba(120, 255, 170, 0.85)";
    ctx.shadowBlur = lampR * 1.8;
  } else {
    ctx.fillStyle = "rgba(120, 255, 170, 0.12)";
    ctx.shadowBlur = 0;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.transportBpm = drawNodeGraphTransportBpmItem;
}
