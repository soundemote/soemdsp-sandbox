// XY Pad's custom body -- a standard-chrome module (like audioPlayer's
// waveform widget) with an interactive pad bolted above the generic
// parameter rows. The pad drives the module's hidden x/y/gate parameters
// through the normal slider elements (so parameter sync, smoothing,
// persistence, undo, and modulation all keep working for free), and fires
// a one-sample Spike through the shared nodeId-keyed impulse trigger.
//
// Controls (visible sliders): X/Y Quantize (0 = free, >0 = snap to a grid
// of 2..17 divisions that fades in over the pad) and X/Y Phase (shifts the
// grid start by a fraction of one cell).

const nodeGraphXyPadResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => {
    for (const entry of entries) {
      drawNodeGraphXyPad(entry.target.closest(".node-xy-pad"));
    }
  })
  : null;

function nodeGraphXyPadDivisions(quantize) {
  const q = Math.max(0, Math.min(1, Number(quantize) || 0));
  // 0 -> 1 division (free, no grid); (0..1] -> 2..17 divisions.
  return q <= 0 ? 1 : 1 + Math.max(1, Math.round(q * 16));
}

function nodeGraphXyPadQuantizeValue(value, quantize, phase) {
  const divisions = nodeGraphXyPadDivisions(quantize);
  if (divisions <= 1) {
    return Math.max(0, Math.min(1, value));
  }
  const step = 1 / divisions;
  const offset = (Math.max(0, Math.min(1, Number(phase) || 0))) * step;
  const snapped = Math.round((value - offset) / step) * step + offset;
  return Math.max(0, Math.min(1, snapped));
}

function nodeGraphXyPadSlider(pad, key) {
  return document.getElementById(`node-${pad.dataset.node}-${key}`);
}

function nodeGraphXyPadParam(pad, key, fallback) {
  const value = Number(nodeGraphXyPadSlider(pad, key)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function nodeGraphXyPadInputConnected(pad, port) {
  const nodeId = String(pad?.dataset?.node || "");
  return Boolean(nodeId && (nodeGraphMvp.patch.connections || []).some((connection) =>
    connection.destinationNode === nodeId && connection.destinationPort === port
  ));
}

function drawNodeGraphXyPad(pad) {
  const canvas = pad?.querySelector(".node-xy-pad-canvas");
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return;
  }
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  // Dim quantize grid -- one axis at a time so X and Y stay independent.
  const drawGrid = (quantKey, phaseKey, vertical) => {
    const divisions = nodeGraphXyPadDivisions(nodeGraphXyPadParam(pad, quantKey, 0));
    if (divisions <= 1) {
      return;
    }
    const step = 1 / divisions;
    const offset = nodeGraphXyPadParam(pad, phaseKey, 0) * step;
    // Grid opacity scales with the quantize amount so the grid "starts to
    // appear" as the control leaves zero.
    const strength = Math.max(0, Math.min(1, nodeGraphXyPadParam(pad, quantKey, 0)));
    ctx.strokeStyle = `rgba(127, 199, 217, ${0.10 + strength * 0.16})`;
    ctx.lineWidth = Math.max(1, dpr * 0.75);
    ctx.beginPath();
    for (let i = -1; i <= divisions + 1; i++) {
      const t = i * step + offset;
      if (t < -0.0001 || t > 1.0001) {
        continue;
      }
      if (vertical) {
        const x = Math.round(t * width) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      } else {
        // y param is bottom-up; canvas y is top-down.
        const y = Math.round((1 - t) * height) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
    }
    ctx.stroke();
  };
  drawGrid("xQuantize", "xPhase", true);
  drawGrid("yQuantize", "yPhase", false);

  // Puck at the (quantized) x/y position -- what the outputs actually emit.
  const x = nodeGraphXyPadQuantizeValue(
    nodeGraphXyPadParam(pad, "x", 0.5),
    nodeGraphXyPadParam(pad, "xQuantize", 0),
    nodeGraphXyPadParam(pad, "xPhase", 0),
  );
  const y = nodeGraphXyPadQuantizeValue(
    nodeGraphXyPadParam(pad, "y", 0.5),
    nodeGraphXyPadParam(pad, "yQuantize", 0),
    nodeGraphXyPadParam(pad, "yPhase", 0),
  );
  const px = x * width;
  const py = (1 - y) * height;
  const ghostXConnected = nodeGraphXyPadInputConnected(pad, "X");
  const ghostYConnected = nodeGraphXyPadInputConnected(pad, "Y");
  if (ghostXConnected || ghostYConnected) {
    const ghostX = ghostXConnected
      ? nodeGraphModuleScopeLatestOutputValue(pad.dataset.node, "X", x)
      : x;
    const ghostY = ghostYConnected
      ? nodeGraphModuleScopeLatestOutputValue(pad.dataset.node, "Y", y)
      : y;
    ctx.beginPath();
    ctx.arc(
      Math.max(0, Math.min(1, ghostX)) * width,
      (1 - Math.max(0, Math.min(1, ghostY))) * height,
      5.5 * dpr,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "rgba(177, 132, 255, 0.38)";
    ctx.fill();
  }
  // A faint concentric ring gives the puck separation without turning clicks
  // into a bright focus/pressed outline.
  ctx.beginPath();
  ctx.arc(px, py, 7 * dpr, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(127, 199, 217, 0.24)";
  ctx.lineWidth = dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, 5.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(127, 199, 217, 0.9)";
  ctx.fill();
  // Crosshair guides.
  ctx.strokeStyle = "rgba(127, 199, 217, 0.14)";
  ctx.lineWidth = dpr * 0.75;
  ctx.beginPath();
  ctx.moveTo(px, 0); ctx.lineTo(px, height);
  ctx.moveTo(0, py); ctx.lineTo(width, py);
  ctx.stroke();
}

function nodeGraphXyPadAbsolutePointerMode(event) {
  return Boolean(event?.altKey) && !(event?.shiftKey && (event.ctrlKey || event.metaKey));
}

function nodeGraphXyPadDragMultiplier(event) {
  return typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
}

function nodeGraphXyPadReanchorDrag(pad, drag, event) {
  drag.startClientX = event.clientX;
  drag.startClientY = event.clientY;
  drag.startX = nodeGraphXyPadParam(pad, "x", 0.5);
  drag.startY = nodeGraphXyPadParam(pad, "y", 0.5);
}

function nodeGraphXyPadApplyPointer(pad, event, drag, options = {}) {
  const canvas = pad.querySelector(".node-xy-pad-canvas");
  const rect = canvas.getBoundingClientRect();
  const xSlider = nodeGraphXyPadSlider(pad, "x");
  const ySlider = nodeGraphXyPadSlider(pad, "y");
  const absolute = nodeGraphXyPadAbsolutePointerMode(event);
  const multiplier = nodeGraphXyPadDragMultiplier(event);

  if (!absolute && (drag.absolute || multiplier !== drag.multiplier)) {
    nodeGraphXyPadReanchorDrag(pad, drag, event);
  }
  drag.absolute = absolute;
  drag.multiplier = multiplier;

  const x = absolute
    ? (event.clientX - rect.left) / Math.max(1, rect.width)
    : drag.startX + ((event.clientX - drag.startClientX) / Math.max(1, rect.width)) * multiplier;
  const y = absolute
    ? 1 - ((event.clientY - rect.top) / Math.max(1, rect.height))
    : drag.startY - ((event.clientY - drag.startClientY) / Math.max(1, rect.height)) * multiplier;
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));
  if (xSlider) setNodeSliderValue(xSlider, clampedX, { interaction: "drag" });
  if (ySlider) setNodeSliderValue(ySlider, clampedY, { interaction: "drag" });
  // The drag path defers slider.value to the scope-draw rAF flush, which
  // only runs while scopes are drawing -- flush here so the pad works (and
  // the puck tracks) with live audio off too.
  if (typeof flushNodeSliderReadoutUpdates === "function") {
    flushNodeSliderReadoutUpdates();
  }
  if (options.commit) {
    if (xSlider) commitNodeSliderDragValue(xSlider, "XY pad moved");
    if (ySlider) commitNodeSliderDragValue(ySlider, "XY pad moved");
  }
  drawNodeGraphXyPad(pad);
}

function nodeGraphXyPadSetGate(pad, high) {
  const gateSlider = nodeGraphXyPadSlider(pad, "gate");
  if (gateSlider) {
    // Non-drag path: immediate slider write + full parameter sync, so the
    // gate edge reaches the engine on this event, not a deferred flush.
    setNodeSliderValue(gateSlider, high ? 1 : 0);
  }
}

function createNodeGraphXyPadBody(node, type) {
  const pad = document.createElement("div");
  pad.className = "node-xy-pad";
  pad.dataset.node = node;
  pad.dataset.nodeType = type;
  // Shared solid-module contract (same as bug button): parameter-driven visuals
  // set data-parameter-visual + syncFromParameters so every parameter-change
  // path (typed readout edit, slider drag flush, patch re-render) redraws the
  // grid/puck in realtime without a module-specific listener.
  pad.dataset.parameterVisual = "true";
  const canvas = document.createElement("canvas");
  canvas.className = "node-xy-pad-canvas";
  canvas.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} XY pad`);
  pad.append(canvas);

  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: nodeGraphXyPadParam(pad, "x", 0.5),
      startY: nodeGraphXyPadParam(pad, "y", 0.5),
      absolute: nodeGraphXyPadAbsolutePointerMode(event),
      multiplier: nodeGraphXyPadDragMultiplier(event),
      moved: false,
      resetToDefault: (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey,
    };
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    // Click: 1-sample Spike + Gate high for as long as the press holds.
    if (typeof triggerNodeGraphImpulseButton === "function") {
      triggerNodeGraphImpulseButton(node);
    }
    nodeGraphXyPadSetGate(pad, true);
    if (drag.absolute) {
      nodeGraphXyPadApplyPointer(pad, event, drag);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    event.preventDefault();
    if (Math.abs(event.clientX - drag.startClientX) > 1 || Math.abs(event.clientY - drag.startClientY) > 1) {
      drag.moved = true;
    }
    nodeGraphXyPadApplyPointer(pad, event, drag);
  });
  const release = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) {
      return;
    }
    const completedDrag = drag;
    drag = null;
    nodeGraphXyPadSetGate(pad, false);
    if (completedDrag.resetToDefault && !completedDrag.moved) {
      const xSlider = nodeGraphXyPadSlider(pad, "x");
      const ySlider = nodeGraphXyPadSlider(pad, "y");
      if (xSlider) setNodeSliderValue(xSlider, Number(xSlider.dataset.default), { interaction: "drag" });
      if (ySlider) setNodeSliderValue(ySlider, Number(ySlider.dataset.default), { interaction: "drag" });
      if (typeof flushNodeSliderReadoutUpdates === "function") {
        flushNodeSliderReadoutUpdates();
      }
      if (xSlider) commitNodeSliderDragValue(xSlider, "XY pad reset to default");
      if (ySlider) commitNodeSliderDragValue(ySlider, "XY pad reset to default");
      drawNodeGraphXyPad(pad);
      return;
    }
    nodeGraphXyPadApplyPointer(pad, event, completedDrag, { commit: true });
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("lostpointercapture", release);

  // Redraw when any of the module's own sliders change (quantize/phase grid,
  // or x/y edited from a readout or modulation UI). syncFromParameters is the
  // shared solid-module hook the generic refresh paths call (see
  // syncNodeGraphParameterVisualsForNodeElement); redrawFromSliders is kept as
  // an alias for any legacy callers.
  pad.syncFromParameters = () => drawNodeGraphXyPad(pad);
  pad.redrawFromSliders = pad.syncFromParameters;
  if (nodeGraphXyPadResizeObserver) {
    nodeGraphXyPadResizeObserver.observe(canvas);
  }
  // First draw once the element is laid out.
  requestAnimationFrame(() => drawNodeGraphXyPad(pad));
  return pad;
}

// The connected-input ghost puck follows a live signal, so redraw those pads on
// every module-scope snapshot. Parameter-driven redraws (grid, puck, typed x/y)
// go through the shared syncFromParameters contract, not this listener.
addNodeGraphModuleScopeSnapshotListener(() => {
  for (const pad of document.querySelectorAll(".node-xy-pad")) {
    if (nodeGraphXyPadInputConnected(pad, "X") || nodeGraphXyPadInputConnected(pad, "Y")) {
      drawNodeGraphXyPad(pad);
    }
  }
});

registerNodeGraphChromelessModuleUi("xyPad", {
  createBody: createNodeGraphXyPadBody,
});
