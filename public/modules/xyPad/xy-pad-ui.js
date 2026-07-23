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
  const held = pad.classList.contains("held");
  ctx.beginPath();
  ctx.arc(px, py, (held ? 7 : 5.5) * dpr, 0, Math.PI * 2);
  ctx.fillStyle = held ? "rgba(57, 230, 163, 0.95)" : "rgba(127, 199, 217, 0.9)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, (held ? 11 : 9) * dpr, 0, Math.PI * 2);
  ctx.strokeStyle = held ? "rgba(57, 230, 163, 0.45)" : "rgba(127, 199, 217, 0.35)";
  ctx.lineWidth = dpr;
  ctx.stroke();
  // Crosshair guides.
  ctx.strokeStyle = "rgba(127, 199, 217, 0.14)";
  ctx.lineWidth = dpr * 0.75;
  ctx.beginPath();
  ctx.moveTo(px, 0); ctx.lineTo(px, height);
  ctx.moveTo(0, py); ctx.lineTo(width, py);
  ctx.stroke();
}

function nodeGraphXyPadApplyPointer(pad, event, options = {}) {
  const canvas = pad.querySelector(".node-xy-pad-canvas");
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / Math.max(1, rect.height)));
  const xSlider = nodeGraphXyPadSlider(pad, "x");
  const ySlider = nodeGraphXyPadSlider(pad, "y");
  if (xSlider) setNodeSliderValue(xSlider, x, { interaction: "drag" });
  if (ySlider) setNodeSliderValue(ySlider, y, { interaction: "drag" });
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
  pad.classList.toggle("held", Boolean(high));
}

function createNodeGraphXyPadBody(node, type) {
  const pad = document.createElement("div");
  pad.className = "node-xy-pad";
  pad.dataset.node = node;
  pad.dataset.nodeType = type;
  const canvas = document.createElement("canvas");
  canvas.className = "node-xy-pad-canvas";
  canvas.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} XY pad`);
  pad.append(canvas);

  let dragging = false;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    // Click: 1-sample Spike + Gate high for as long as the press holds.
    if (typeof triggerNodeGraphImpulseButton === "function") {
      triggerNodeGraphImpulseButton(node);
    }
    nodeGraphXyPadSetGate(pad, true);
    nodeGraphXyPadApplyPointer(pad, event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    event.preventDefault();
    nodeGraphXyPadApplyPointer(pad, event);
  });
  const release = (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    nodeGraphXyPadSetGate(pad, false);
    nodeGraphXyPadApplyPointer(pad, event, { commit: true });
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("lostpointercapture", release);

  // Redraw when any of the module's own sliders change (quantize/phase grid,
  // or x/y edited from a readout or modulation UI).
  pad.redrawFromSliders = () => drawNodeGraphXyPad(pad);
  if (nodeGraphXyPadResizeObserver) {
    nodeGraphXyPadResizeObserver.observe(canvas);
  }
  // First draw once the element is laid out.
  requestAnimationFrame(() => drawNodeGraphXyPad(pad));
  return pad;
}

// Keep the pad display in sync with slider edits made outside the pad
// (quantize/phase changes, typed x/y values). Event delegation so it works
// for every xyPad node without per-node listeners.
document.addEventListener("input", (event) => {
  const slider = event.target;
  if (!slider?.dataset?.param) {
    return;
  }
  const article = slider.closest?.('.dsp-node[data-node-type="xyPad"]');
  const pad = article?.querySelector(".node-xy-pad");
  if (pad) {
    drawNodeGraphXyPad(pad);
  }
}, true);
