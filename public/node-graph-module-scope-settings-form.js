// Display Settings form HTML builders extracted from node-graph-module-scopes.js
// (Phase D). Load after scope-display-mode, before scopes.js.

function nodeGraphDisplaySettingsBuildStepperRowHtml(key, formType = null, options = {}) {
  const meta = nodeGraphDisplaySettingsFieldMeta[key] || { label: key, inputmode: "decimal" };
  let label = meta.label;
  let title = meta.title;
  // Knob display settings labels.
  if (key === "decimals" && formType === "knobFace") {
    label = "Num decimals";
    title = "Digits after the decimal on the Knob face readout (0–8).";
  }
  if (key === "rotationDegrees" && formType === "knobFace") {
    label = "Span °";
    title = "Centered arc sweep across Bias 0…1 (degrees). Opens left and right together; gap stays opposite center.";
  }
  if ((key === "zoomSeconds" || key === "historySeconds") && (
    formType === "trace"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
  )) {
    label = "History";
    title = "Seconds of live history drawn on the face.";
  }
  if (key === "lineThickness" && (
    formType === "trace"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
    || formType === "value"
  )) {
    label = "Blur";
    title = "0 = Size as a hard line. Raise to fatten a soft halo outward. Lower returns to the thin sharp line.";
  }
  if ((key === "dot1Size" || key === "secondarySize") && (
    formType === "trace"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
    || formType === "value"
  )) {
    label = "\u26AA Size";
    title = "Stroke diameter vs face min side. 0 = gone; 1 = full square. Goes sub-pixel as you approach 0.";
  }
  if ((key === "dot1Brightness" || key === "secondaryBrightness") && (
    formType === "trace"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
    || formType === "value"
  )) {
    label = "\uD83D\uDCA1 Bright";
    title = "Ink light 0…1 (1 = full). Does not change the Display Settings preview dot.";
  }
  if (key === "pixelDensity" && (
    formType === "trace"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
  )) {
    label = "Pixel density";
    title = "1 = CSS \u00d7 devicePixelRatio. Below 1 = chunky lo-fi face buffer.";
  }
  if (key === "fade" && (
    formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
  )) {
    label = "Fade";
    title = "Fade the stroke along history. 0 = even ink. 1 = oldest gone, newest full. Does not change the preview dot.";
  }
  if (key === "scale" && (
    formType === "trace"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
    || formType === "value"
  )) {
    label = "Scale";
    title = "Amplitude zoom on the face (1 = full-scale). Does not change the Display Settings preview dot.";
  }
  if (key === "dialSize" && formType === "knobFace") {
    label = "Knob size";
    title = "Dial ring size 0…1. 1 = fill available space. Only scales the arc — label and value stay put.";
  }
  if (key === "labelSize" && formType === "knobFace") {
    label = "Label size";
    title = "Title size 0…1. Independent of knob size.";
  }
  if (key === "valueSize" && formType === "knobFace") {
    label = "Value size";
    title = "Readout size 0…1. Independent of knob size.";
  }
  if (formType === "roundShapeFace" && key === "lineThickness") {
    label = "Line thickness";
    title = "Stroke width in CSS pixels (0.25–16).";
  }
  if (formType === "roundShapeFace" && key === "lineBlur") {
    label = "Line blur";
    title = "Diamond restroke blur in CSS pixels (0 = hard). Path is redrawn at 9 tent-weighted offsets — cheap, no extra canvas.";
  }
  if (formType === "roundShapeFace" && key === "pixelDensity") {
    label = "Pixel density";
    title = "1.0 = CSS × devicePixelRatio. Below 1 = chunky lo-fi.";
  }
  const stereoSide = options.stereoSide === "R" ? "R" : (options.stereoSide === "L" ? "L" : "");
  if (stereoSide) {
    if (key === "dot1Size" || key === "secondarySize") {
      label = `\u26AA Size ${stereoSide}`;
    } else if (key === "lineThickness" || key === "secondaryLineThickness") {
      label = `Blur ${stereoSide}`;
    } else if (key === "dot1Brightness" || key === "secondaryBrightness") {
      label = `\uD83D\uDCA1 Bright ${stereoSide}`;
    } else if (label && !String(label).endsWith(` ${stereoSide}`)) {
      label = `${label} ${stereoSide}`;
    }
  }
  if (key === "innerRadius" && formType === "knobFace") {
    label = "Inner radius";
    title = "Arc hole size 0…1 (0 = solid, ~0.7 default ring, higher = thinner ring).";
  }
  if (formType === "numberReadout" && key === "dot1Brightness") {
    const nodeType = typeof nodeGraphPatchNode === "function"
      && typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type
      : null;
    if (nodeType === "valueLcd") {
      label = "Ink";
      title = "LCD ink strength 0…1 (how hard the dark digits print on the plate). Also scales deposit energy on digit change.";
    } else {
      label = "LED";
      title = "Live light grey→hue→white (0 = mid grey, 0.5 = full Hue, 1 = white; never black). Also scales deposit energy on digit change.";
    }
  }
  if (formType === "numberReadout" && (key === "ghost" || key === "ghostBrightness")) {
    label = "Ghost";
    title = "Extreme analog (super-exp) residual hang 0…1 (not brightness). With Trail at 0 this is the full hang algorithm. Bright only sets deposit light.";
  }
  if (formType === "numberReadout" && (key === "trail" || key === "residual")) {
    label = "Trail";
    title = "Mix from Ghost-only toward linear, then freeze. 0 = Ghost only; 0.5 = half linear / half Ghost; 0.75 = full linear; 1 = never decay pixels.";
  }
  if (formType === "numberReadout" && key === "burn") {
    label = "Burn";
    title = "Sticky residual floor 0…1. 0 = no stick; 0.5 = once energy ≥ 0.5 the pixel freezes at that floor; 1 = freeze all residual. Off by default.";
  }
  if (formType === "numberReadout" && key === "burnAmount") {
    label = "Burn \u2A2F";
    title = "Residual deposit gain vs LED Bright (default 1). Deposit peak = Bright \u00d7 this control. 0.5 = half deposit; 2 = double. Live LED light is unchanged.";
  }
  if (formType === "numberReadout" && key === "unlitSegments") {
    label = "Ghost";
    title =
      "LCD Ghost: permanent dim all-8 segment plate 0…1. Soft fade from 0 (no hard pop). Not residual hang (LED Trail/Ghost).";
  }
  if (formType === "numberReadout" && key === "facePadding") {
    label = "Padding";
    title = "Linear inset on each axis (half-width / half-height). 0 = no inset; +1 = pin pixel; negative grows digits toward the walls (dial in how close ink meets the plate).";
  }
  if (formType === "numberReadout" && key === "innerShadowDistance") {
    label = "Shadow dist";
    title = "How far the Gaussian inset glass shadow reaches from the plate edge (0 = none, 1 = deep). Dial the “behind a screen” depth.";
  }
  if (formType === "numberReadout" && key === "innerShadowSharpness") {
    label = "Shadow hard";
    title =
      "Shadow hardness 0…1. Soft = wide translucent Gaussian; harder = darker. Full hardness = solid black hard rim.";
  }
  if (formType === "numberReadout" && key === "innerShadowOffsetX") {
    label = "Shadow X";
    title = "Inset shadow horizontal offset −1…1 (0 = centered). Positive darkens the left edge.";
  }
  if (formType === "numberReadout" && key === "innerShadowOffsetY") {
    label = "Shadow Y";
    title = "Inset shadow vertical offset −1…1 (0 = centered). Positive darkens the top edge.";
  }
  const titleAttr = title
    ? ` title="${nodeGraphDisplaySettingsEscapeHtml(title)}"`
    : "";
  const idAttr = meta.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(meta.id)}"` : "";
  return `
    <label class="node-trace-display-line-burn-row" data-trace-display-control-row>
      <span>${nodeGraphDisplaySettingsEscapeHtml(label)}</span>
      <span class="metadata-stepper-control">
        <button type="button" data-trace-display-step-target="${key}" data-trace-display-step-direction="-1">-</button>
        <input type="text" inputmode="${meta.inputmode || "decimal"}" data-trace-display-field="${key}"${idAttr}${titleAttr}>
        <button type="button" data-trace-display-step-target="${key}" data-trace-display-step-direction="1">+</button>
      </span>
    </label>`;
}

function nodeGraphDisplaySettingsStereoPairKey(leftKey) {
  if (leftKey === "dot1Size") {
    return "secondarySize";
  }
  if (leftKey === "lineThickness") {
    return "secondaryLineThickness";
  }
  if (leftKey === "dot1Brightness") {
    return "secondaryBrightness";
  }
  return "";
}

function nodeGraphDisplaySettingsBuildStereoPairRowHtml(leftKey, rightKey, formType = null) {
  return `
    <div class="node-trace-display-lr-row" data-trace-display-lr-row>
      ${nodeGraphDisplaySettingsBuildStepperRowHtml(leftKey, formType, { stereoSide: "L" })}
      ${nodeGraphDisplaySettingsBuildStepperRowHtml(rightKey, formType, { stereoSide: "R" })}
    </div>`;
}

/**
 * App-wide hue-title stepper: one horizontal row
 *   [ Title on pure-hue fill (drag = hue) ][ value ][ − ][ + ]
 * Smart black/white title ink keeps the label readable on any hue.
 *
 * @param {{
 *   title: string,
 *   stepField: string,
 *   colorField: string,
 *   titleAttr?: string,
 *   formType?: string,
 *   defaultHueHex?: string,
 * }} options
 */
function nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml(options = {}) {
  const title = String(options.title || "Color");
  const stepField = String(options.stepField || "dot1Brightness");
  const colorField = String(options.colorField || "dot1Color");
  const formType = options.formType || null;
  const meta = nodeGraphDisplaySettingsFieldMeta[stepField] || { inputmode: "decimal" };
  let titleTip = options.titleAttr || "";
  if (!titleTip && formType === "numberReadout" && stepField === "dot1Brightness") {
    titleTip = "LED amount 0…1 (0 grey, 0.5 full Hue, 1 white). Drag title strip to change hue.";
  }
  const tipAttr = titleTip
    ? ` title="${nodeGraphDisplaySettingsEscapeHtml(titleTip)}"`
    : "";
  const idAttr = meta.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(meta.id)}"` : "";
  const colorMeta = nodeGraphDisplaySettingsColorRowMeta(colorField, formType);
  const colorIdAttr = colorMeta.id
    ? ` id="${nodeGraphDisplaySettingsEscapeHtml(colorMeta.id)}"`
    : "";
  const defaultHex = nodeGraphDisplaySettingsEscapeHtml(
    options.defaultHueHex || colorMeta.defaultValue || "#ff0000",
  );
  return `
    <div
      class="hue-title-stepper"
      data-hue-title-stepper
      data-trace-display-control-row
      data-hue-title-step-field="${nodeGraphDisplaySettingsEscapeHtml(stepField)}"
      data-hue-title-color-field="${nodeGraphDisplaySettingsEscapeHtml(colorField)}"${tipAttr}>
      <button
        type="button"
        class="hue-title-stepper-title"
        data-hue-title-swatch
        aria-label="${nodeGraphDisplaySettingsEscapeHtml(`${title} hue — drag to change`)}"
        title="Drag to change hue">
        <span class="hue-title-stepper-label">${nodeGraphDisplaySettingsEscapeHtml(title)}</span>
      </button>
      <span class="metadata-stepper-control">
        <button type="button" data-trace-display-step-target="${nodeGraphDisplaySettingsEscapeHtml(stepField)}" data-trace-display-step-direction="-1" aria-label="Decrease ${nodeGraphDisplaySettingsEscapeHtml(title)}">-</button>
        <input type="text" inputmode="${meta.inputmode || "decimal"}" data-trace-display-field="${nodeGraphDisplaySettingsEscapeHtml(stepField)}"${idAttr} readonly value="0.5" aria-label="${nodeGraphDisplaySettingsEscapeHtml(title)} amount">
        <button type="button" data-trace-display-step-target="${nodeGraphDisplaySettingsEscapeHtml(stepField)}" data-trace-display-step-direction="1" aria-label="Increase ${nodeGraphDisplaySettingsEscapeHtml(title)}">+</button>
      </span>
      <input type="hidden" data-trace-display-color="${nodeGraphDisplaySettingsEscapeHtml(colorField)}"${colorIdAttr} value="${defaultHex}">
    </div>`;
}


function nodeGraphDisplaySettingsBuildToggleRowHtml(key) {
  const meta = nodeGraphDisplaySettingsToggleMeta[key] || { label: key };
  const idAttr = meta.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(meta.id)}"` : "";
  const titleAttr = meta.title
    ? ` title="${nodeGraphDisplaySettingsEscapeHtml(meta.title)}"`
    : "";
  return `
    <label class="metadata-checkbox-label" data-trace-display-control-row${titleAttr}>
      <input type="checkbox" data-trace-display-toggle="${key}"${idAttr}${titleAttr}>
      ${nodeGraphDisplaySettingsEscapeHtml(meta.label)}
    </label>`;
}

/** Packing latches share one horizontal row on phosphor faces (+ Clear). */
const NODE_GRAPH_DISPLAY_PACKING_TOGGLE_KEYS = Object.freeze([
  "sourceSync",
  "fullDotEconomy",
  "dotsOnly",
]);

/**
 * Sync | Full Dots | Dots only | Clear — app-wide latch buttons (full cell,
 * fit-to-box title, on=highlight / off=dim). Clear wipes phosphor residual.
 */
function nodeGraphDisplaySettingsBuildPackingToggleRowHtml(keys) {
  const latch = typeof AppLatchButton !== "undefined" ? AppLatchButton : null;
  const buttons = (keys || []).map((key) => {
    const meta = nodeGraphDisplaySettingsToggleMeta[key] || { label: key };
    return {
      label: meta.label || key,
      title: meta.title || "",
      id: meta.id || "",
      toggleKey: key,
      on: false,
      className: "node-trace-display-packing-latch",
    };
  });
  // Clear is always last: restart pixel burn-in when Trail is frozen.
  // Multi-select: wipes every display currently targeted by this panel.
  buttons.push({
    label: "Clear",
    title:
      "Wipe phosphor residual on the selected face(s) (restart burn-in). "
      + "When several modules share this Display Settings panel, clears all of them.",
    id: "nodeTraceDisplayClearPhosphor",
    action: "clearPhosphor",
    className: "node-trace-display-packing-latch node-trace-display-clear-phosphor",
  });
  if (latch && typeof latch.buildRowHtml === "function") {
    return latch.buildRowHtml(buttons, "node-trace-display-packing-toggles");
  }
  // Fallback if latch-button.js not loaded yet.
  const cells = buttons.map((opts) => {
    if (opts.action) {
      return (
        `<button type="button" class="app-latch-button node-trace-display-packing-latch"`
        + ` data-latch-button="true" data-latch-mode="action" data-trace-display-action="${opts.action}"`
        + ` title="${nodeGraphDisplaySettingsEscapeHtml(opts.title || "")}">`
        + `<span class="app-latch-button-label">${nodeGraphDisplaySettingsEscapeHtml(opts.label)}</span>`
        + `</button>`
      );
    }
    return (
      `<button type="button" class="app-latch-button node-trace-display-packing-latch is-off"`
      + ` data-latch-button="true" data-latch-mode="latch" data-trace-display-toggle="${opts.toggleKey}"`
      + ` aria-pressed="false" data-latch-on="0"`
      + ` title="${nodeGraphDisplaySettingsEscapeHtml(opts.title || "")}"`
      + (opts.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(opts.id)}"` : "")
      + `>`
      + `<span class="app-latch-button-label">${nodeGraphDisplaySettingsEscapeHtml(opts.label)}</span>`
      + `</button>`
    );
  }).join("");
  return (
    `<div class="app-latch-button-row node-trace-display-packing-toggles"`
    + ` data-latch-button-row data-trace-display-control-row>${cells}</div>`
  );
}


function nodeGraphDisplaySettingsBuildChoiceRowHtml(key) {
  const meta = nodeGraphDisplaySettingsChoiceMeta[key];
  if (!meta) {
    return "";
  }
  const idAttr = meta.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(meta.id)}"` : "";
  const options = (meta.options || [])
    .map((option) => (
      `<option value="${nodeGraphDisplaySettingsEscapeHtml(option.value)}">${nodeGraphDisplaySettingsEscapeHtml(option.label)}</option>`
    ))
    .join("");
  return `
    <label class="node-trace-display-line-burn-row" data-trace-display-control-row data-trace-display-choice-row="${key}">
      <span>${nodeGraphDisplaySettingsEscapeHtml(meta.label)}</span>
      <select data-trace-display-choice="${key}"${idAttr} aria-label="${nodeGraphDisplaySettingsEscapeHtml(meta.aria || meta.label)}">
        ${options}
      </select>
    </label>`;
}


function nodeGraphDisplaySettingsColorRowMeta(key, formType = null, options = {}) {
  let base = nodeGraphDisplaySettingsColorMeta[key] || {
    label: "",
    aria: key,
    defaultValue: "#ffffff",
  };
  // Never a side "Color |" column — one contiguous widget row app-wide.
  let aria = base.aria || key;
  if (formType === "numberReadout" && key === "dot1Color") {
    const nodeType = typeof nodeGraphPatchNode === "function"
      && typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type
      : null;
    aria = nodeType === "valueLcd"
      ? "Value LCD foreground (digit ink) color"
      : "LED digit hue; LED amount maps grey → full hue → white";
  } else if (formType === "numberReadout" && key === "backgroundColor") {
    aria = "Value face background color";
  } else if (formType === "knobFace" && key === "backgroundColor") {
    aria = "Knob face background";
  } else if (formType === "knobFace" && key === "arcFill") {
    aria = "Knob arc fill (value)";
  } else if (formType === "knobFace" && key === "arcTrack") {
    aria = "Knob arc track (unfilled)";
  } else if (formType === "keypadFace" && key === "backgroundColor") {
    aria = "Keypad background color";
    base = { ...base, defaultValue: "#f4f3f0" };
  } else if (formType === "keypadFace" && key === "buttonColor") {
    aria = "Keypad button color";
    base = { ...base, defaultValue: "#f3f1ec" };
  } else if (formType === "keypadFace" && key === "hoverColor") {
    aria = "Keypad mouse hover color";
    base = { ...base, defaultValue: "#ddd9d2" };
  } else if (formType === "keypadFace" && key === "downColor") {
    aria = "Keypad mouse down color";
    base = { ...base, defaultValue: "#c4bdb3" };
  } else if (formType === "keypadFace" && key === "textColor") {
    aria = "Keypad text color";
  } else if (formType === "keypadFace" && key === "strokeColor") {
    aria = "Keypad stroke color";
  } else if (formType === "roundShapeFace" && key === "backgroundColor") {
    aria = "RoundShape background color";
    base = { ...base, defaultValue: "#020609" };
  } else if (formType === "roundShapeFace" && key === "strokeColor") {
    aria = "RoundShape foreground / stroke color";
    base = { ...base, defaultValue: "#78dcc8" };
  } else if (formType === "roundShapeFace" && key === "dotColor") {
    aria = "RoundShape cursor dot color";
    base = { ...base, defaultValue: "#ffffff" };
  } else if (formType === "limiterGainFace" && key === "backgroundColor") {
    aria = "Limiter gain face background color";
    base = { ...base, defaultValue: "#020407" };
  } else if (formType === "textBoxFace" && key === "backgroundColor") {
    aria = "Text Box background color";
    base = { ...base, defaultValue: "#020407" };
  } else if (formType === "trace" && options.stereo && key === "dot1Color") {
    aria = "Left";
    base = { ...base, defaultValue: "#ff0000" };
  } else if (formType === "trace" && options.stereo && key === "secondaryColor") {
    aria = "Right";
    base = { ...base, defaultValue: "#0000ff" };
  } else if (formType === "trace" && options.stereo && key === "backgroundColor") {
    aria = "Background";
  } else if (formType === "textBoxFace" && key === "textColor") {
    aria = "Text Box text color";
    base = { ...base, defaultValue: "#f3f1ec" };
  }
  return {
    ...base,
    label: "",
    aria,
    sideLabel: false,
  };
}


const NODE_GRAPH_TRACE_STEREO_COLOR_ORDER = Object.freeze([
  "dot1Color",
  "secondaryColor",
  "backgroundColor",
]);

function nodeGraphInstantTracePreviewHtml(stereo = false) {
  const canvas = (side, label) => `
      <div class="node-trace-display-preview-cell">
        ${side ? `<span class="node-trace-display-preview-side-label" data-preview-side-label="${side}">${label}</span>` : ""}
        <canvas
          class="node-trace-display-dot-preview"
          data-instant-trace-preview-canvas
          ${side ? `data-preview-side="${side}"` : ""}
          width="96"
          height="96"
          aria-label="${side ? `${label} size, blur, and pixel density preview` : "Trace size, blur, and pixel density preview"}"></canvas>
      </div>`;
  if (stereo) {
    return `
    <div class="node-trace-display-preview-shell is-stereo" data-instant-trace-preview data-preview-stereo="1">
      ${canvas("L", "L")}
      ${canvas("R", "R")}
    </div>`;
  }
  return `
    <div class="node-trace-display-preview-shell" data-instant-trace-preview>
      ${canvas("", "")}
    </div>`;
}

function paintNodeGraphInstantTracePreviewCanvas(canvas, settings = {}, side = "") {
  if (!canvas) {
    return;
  }
  const cssW = Math.max(48, Math.round(canvas.clientWidth || 96));
  const cssH = Math.max(48, Math.round(canvas.clientHeight || 96));
  const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : Math.max(0, Math.min(1, Number(settings?.pixelDensity) || 1));
  const bw = Math.max(1, Math.round(cssW * dpr * density));
  const bh = Math.max(1, Math.round(cssH * dpr * density));
  if (canvas.width !== bw) {
    canvas.width = bw;
  }
  if (canvas.height !== bh) {
    canvas.height = bh;
  }
  canvas.style.imageRendering = density < 0.999 ? "pixelated" : "auto";
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, bw, bh);
  context.fillStyle = "#020405";
  context.fillRect(0, 0, bw, bh);
  const right = side === "R";
  const size = Number(right ? settings.secondarySize : settings.dot1Size);
  if (!(size > 0)) {
    return;
  }
  const blur = Number(right ? settings.secondaryLineThickness : settings.lineThickness);
  const color = right
    ? (settings.secondaryColor || "#0000ff")
    : (side === "L"
      ? (settings.dot1Color || settings.color || "#ff0000")
      : "#ffffff");
  const face = Math.min(bw, bh);
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.draw === "function") {
    TraceStroke.draw(context, [{ x: bw * 0.5, y: bh * 0.5 }], {
      size,
      blur: Number.isFinite(blur) ? blur : 0,
      brightness: 1,
      color,
      faceMinSide: face,
      composite: "source-over",
    });
    return;
  }
  const diameter = face * Math.max(0, Math.min(1, size));
  if (!(diameter > 0)) {
    return;
  }
  context.fillStyle = color;
  context.beginPath();
  context.arc(bw * 0.5, bh * 0.5, diameter * 0.5, 0, Math.PI * 2);
  context.fill();
}

function paintNodeGraphInstantTracePreview(root, settings = {}) {
  const canvases = root?.querySelectorAll?.("[data-instant-trace-preview-canvas]");
  if (!canvases?.length) {
    return;
  }
  for (const canvas of canvases) {
    paintNodeGraphInstantTracePreviewCanvas(
      canvas,
      settings,
      canvas.getAttribute("data-preview-side") || "",
    );
  }
}

function syncNodeGraphInstantTracePreview(root, settings) {
  const host = root?.querySelector?.("[data-instant-trace-preview]")
    ? root
    : document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!host?.querySelector?.("[data-instant-trace-preview-canvas]")) {
    return;
  }
  const paint = () => paintNodeGraphInstantTracePreview(host, settings || {});
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(paint);
  } else {
    paint();
  }
}

function buildNodeGraphInstantTraceDisplaySettingsBodyHtml(type, node, allowKey) {
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", type);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", type);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", type);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", type);
  const isStereoTraceNode = typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
    ? nodeGraphModuleUsesStereoTraceDisplay(node?.type)
    : node?.type === "output";
  const allow = typeof allowKey === "function" ? allowKey : () => true;
  const fieldList = [...activeFields].filter((key) => allow("fields", key));
  const primaryOrder = typeof nodeGraphInstantTraceDisplayFieldOrder !== "undefined"
    ? nodeGraphInstantTraceDisplayFieldOrder
    : ["scale", "historySeconds", "zoomSeconds", "dot1Size", "lineThickness", "pixelDensity", "dot1Brightness"];
  const secondaryOrder = typeof nodeGraphTraceDisplaySecondaryInkFieldOrder !== "undefined"
    ? nodeGraphTraceDisplaySecondaryInkFieldOrder
    : ["secondarySize", "secondaryLineThickness", "secondaryBrightness"];
  const primarySet = new Set(primaryOrder);
  const secondarySet = new Set(secondaryOrder);
  const capSet = new Set(["capSize", "capLength", "capPadding"]);
  const orderedPrimary = primaryOrder.filter((key) => fieldList.includes(key));
  const orderedSecondary = secondaryOrder.filter((key) => fieldList.includes(key));
  const leftover = fieldList.filter(
    (key) => !primarySet.has(key) && !secondarySet.has(key) && !capSet.has(key),
  );
  const capKeys = ["capSize", "capLength", "capPadding"].filter((key) => fieldList.includes(key));
  const choiceKeys = [...activeChoices].filter((key) => allow("choices", key));
  const toggleKeys = [...activeToggles].filter((key) => allow("toggles", key));
  const inkColors = (isStereoTraceNode && type === "trace"
    ? ["dot1Color", "secondaryColor"]
    : ["dot1Color"]
  ).filter((key) => activeColors.has(key) && allow("colors", key));
  const bgColors = ["backgroundColor"].filter((key) => activeColors.has(key) && allow("colors", key));
  const parts = [];
  const rows = [];
  const stereoInk = isStereoTraceNode && type === "trace";
  const previewAfter = orderedPrimary.includes("dot1Brightness")
    ? "dot1Brightness"
    : (orderedPrimary.includes("pixelDensity")
      ? "pixelDensity"
      : (orderedPrimary.includes("lineThickness") ? "lineThickness" : orderedPrimary[orderedPrimary.length - 1]));
  let previewPlaced = false;
  const pushPreview = () => {
    if (previewPlaced) {
      return;
    }
    rows.push(nodeGraphInstantTracePreviewHtml(stereoInk));
    previewPlaced = true;
  };
  const sharedSet = new Set(["scale", "historySeconds", "zoomSeconds", "fade"]);
  const sharedPrimary = orderedPrimary.filter((key) => sharedSet.has(key));
  const inkPrimary = orderedPrimary.filter((key) => !sharedSet.has(key));
  for (const key of sharedPrimary) {
    rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
  }
  for (const key of toggleKeys) {
    if (key === "sourceSync") {
      rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml(key));
    }
  }
  if (stereoInk) {
    rows.push(`
      <div class="metadata-section-title node-trace-display-dot1-title node-trace-display-stereo-title">
        <span id="nodeTraceDisplayDot1TitleLabel">L / R</span>
        <button type="button" id="nodeTraceDisplaySwapStereoLook" class="node-trace-display-swap-lr">Swap L/R</button>
      </div>`);
  }
  const pairedSecondary = new Set();
  for (const key of inkPrimary) {
    const rightKey = stereoInk ? nodeGraphDisplaySettingsStereoPairKey(key) : "";
    if (rightKey && orderedSecondary.includes(rightKey)) {
      rows.push(nodeGraphDisplaySettingsBuildStereoPairRowHtml(key, rightKey, type));
      pairedSecondary.add(rightKey);
    } else {
      rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
    }
    if (key === previewAfter) {
      pushPreview();
    }
  }
  if (!previewPlaced) {
    pushPreview();
  }
  for (const key of leftover) {
    rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
  }
  for (const key of choiceKeys) {
    rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml(key));
  }
  for (const key of toggleKeys) {
    if (key === "secondaryEnabled" || key === "sourceSync") {
      continue;
    }
    rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml(key));
  }
  if (capKeys.length) {
    rows.push(`<div class="metadata-section-title node-trace-display-caps-title">Caps</div>`);
    for (const key of capKeys) {
      rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
    }
  }
  if (orderedSecondary.length && !stereoInk) {
    const enabledToggle = activeToggles.has("secondaryEnabled")
      ? `<input id="nodeTraceDisplaySecondaryEnabled" type="checkbox" aria-label="Secondary on" data-trace-display-toggle="secondaryEnabled">`
      : "";
    rows.push(`
      <div class="metadata-section-title node-trace-display-secondary-title">
        <span id="nodeTraceDisplaySecondaryTitleLabel">Secondary</span>
        ${enabledToggle}
      </div>`);
    for (const key of orderedSecondary) {
      rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
    }
  } else if (orderedSecondary.length) {
    for (const key of orderedSecondary) {
      if (pairedSecondary.has(key)) {
        continue;
      }
      rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type, { stereoSide: "R" }));
    }
  }
  const stereoColorPair = stereoInk
    && inkColors.includes("dot1Color")
    && inkColors.includes("secondaryColor");
  if (stereoColorPair) {
    rows.push(`
      <div class="node-trace-display-lr-row node-trace-display-lr-color-row" data-trace-display-lr-row>
        ${nodeGraphDisplaySettingsBuildColorRowHtml("dot1Color", type, { stereo: true })}
        ${nodeGraphDisplaySettingsBuildColorRowHtml("secondaryColor", type, { stereo: true })}
      </div>`);
  }
  for (const key of inkColors) {
    if (stereoColorPair && (key === "dot1Color" || key === "secondaryColor")) {
      continue;
    }
    rows.push(nodeGraphDisplaySettingsBuildColorRowHtml(key, type, {
      stereo: stereoInk,
    }));
  }
  if (
    typeof nodeGraphDisplaySettingsFormTypeUsesGradient === "function"
    && nodeGraphDisplaySettingsFormTypeUsesGradient(type)
  ) {
    rows.push(`
      <div class="metadata-field-section node-trace-display-gradient-section">
        <div
          id="nodeTraceDisplayGradientSelectorHost"
          class="node-gradient-selector-host node-shared-gradient-host node-spectrogram-gradient-host"
          data-gradient-selector-host
          data-shared-gradient-host
          data-spectrogram-gradient-host></div>
      </div>`);
  }
  for (const key of bgColors) {
    rows.push(nodeGraphDisplaySettingsBuildColorRowHtml(key, type, {
      stereo: isStereoTraceNode && type === "trace",
    }));
  }
  parts.push(`<div class="metadata-field-section node-trace-display-trace-section">${rows.join("")}</div>`);
  return parts.join("\n");
}

function nodeGraphDisplaySettingsBuildColorRowHtml(key, formType = null, options = {}) {
  const meta = nodeGraphDisplaySettingsColorRowMeta(key, formType, options);
  const idAttr = meta.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(meta.id)}"` : "";
  const caption = String(meta.caption || "").trim();
  const captionHtml = caption
    ? `<div class="node-trace-display-color-caption">${nodeGraphDisplaySettingsEscapeHtml(caption)}</div>`
    : "";
  return `
    <div class="node-trace-display-color-widget-row no-side-label${caption ? " has-color-caption" : ""}" data-trace-display-control-row data-trace-display-color-row="${key}">
      ${captionHtml}
      <div
        class="node-trace-display-color-widget-host"
        data-trace-display-color-widget="${key}"
        role="group"
        aria-label="${nodeGraphDisplaySettingsEscapeHtml(meta.aria || key)}"></div>
      <input type="hidden" data-trace-display-color="${key}"${idAttr} value="${nodeGraphDisplaySettingsEscapeHtml(meta.defaultValue || "#ffffff")}">
    </div>`;
}


function buildNodeGraphDisplaySettingsBodyHtml(formType, node = null) {
  const type = formType || "trace";
  // LED keeps its range-slider control scheme (preview + Color/Brightness/
  // Blur/Corners/Rounding) — better than the generic stepper form.
  if (type === "ledLamp" && typeof buildNodeGraphLedDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphLedDisplaySettingsBodyHtml();
  }
  if (type === "keypadFace" && typeof buildNodeGraphKeypadDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphKeypadDisplaySettingsBodyHtml();
  }
  if (type === "phosphorWaveform" && typeof buildNodeGraphPhosphorWaveformDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphPhosphorWaveformDisplaySettingsBodyHtml();
  }
  if (type === "limiterGainFace" && typeof buildNodeGraphLimiterGainDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphLimiterGainDisplaySettingsBodyHtml();
  }
  if (type === "portalFace" && typeof buildNodeGraphPortalDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphPortalDisplaySettingsBodyHtml();
  }
  if (type === "textBoxFace" && typeof buildNodeGraphTextBoxDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphTextBoxDisplaySettingsBodyHtml();
  }
  if (type === "rgbPictureFace" && typeof buildNodeGraphRgbPictureDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphRgbPictureDisplaySettingsBodyHtml();
  }
  // Matrix Waterfall / Matrix Display custom bodies.
  if (
    (type === "matrixFace" || type === "matrixWaterfallFace" || type === "matrixDisplayFace")
    && typeof buildNodeGraphMatrixFaceDisplaySettingsBodyHtml === "function"
  ) {
    return buildNodeGraphMatrixFaceDisplaySettingsBodyHtml(type);
  }
  if (type === "macroControlsFace" && typeof buildNodeGraphMacroControlsFaceDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphMacroControlsFaceDisplaySettingsBodyHtml();
  }
  if (type === "keyboardControllerFace" && typeof buildNodeGraphKeyboardControllerFaceDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphKeyboardControllerFaceDisplaySettingsBodyHtml();
  }
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", type);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", type);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", type);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", type);
  const isStereoTraceNode = typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
    ? nodeGraphModuleUsesStereoTraceDisplay(node?.type)
    : node?.type === "output";
  const parts = [];

  // Filter keys that only apply on stereo Trace faces (Output / SoEmReverb / …).
  const allowKey = (kind, key) => {
    if (type !== "trace") {
      return true;
    }
    if (!isStereoTraceNode) {
      if (
        key === "secondarySize" ||
        key === "secondaryBrightness" ||
        key === "secondaryLineThickness" ||
        key === "secondaryEnabled" ||
        key === "secondaryColor" ||
        key === "syncChannel" ||
        key === "stereoBlend"
      ) {
        return false;
      }
    } else if (key === "sourceSync") {
      // Stereo Trace uses syncChannel select, not the legacy Sync checkbox.
      return false;
    }
    return true;
  };

  const isVectorTraceForm = typeof nodeGraphDisplaySettingsIsVectorTraceFormType === "function"
    && nodeGraphDisplaySettingsIsVectorTraceFormType(type);
  if (isVectorTraceForm) {
    return buildNodeGraphInstantTraceDisplaySettingsBodyHtml(type, node, allowKey);
  }
  const sectionOrder = nodeGraphDisplaySettingsIsPhosphorFormType(type)
    ? nodeGraphPhosphorDisplaySettingsSectionOrder
    : (isVectorTraceForm && typeof nodeGraphTraceDisplaySettingsSectionOrder !== "undefined"
      ? nodeGraphTraceDisplaySettingsSectionOrder
      : nodeGraphDisplaySettingsSectionOrder);
  for (const section of sectionOrder) {
    if (section === "gradient") {
      if (!nodeGraphDisplaySettingsFormTypeUsesGradient(type)) {
        continue;
      }
      // Number Readout: gradient sits inside the Readout section (no gap after Background).
      if (type === "numberReadout") {
        continue;
      }
      parts.push(`
        <div class="metadata-field-section node-trace-display-gradient-section">
          <div
            id="nodeTraceDisplayGradientSelectorHost"
            class="node-gradient-selector-host node-shared-gradient-host node-spectrogram-gradient-host"
            data-gradient-selector-host
            data-shared-gradient-host
            data-spectrogram-gradient-host></div>
        </div>`);
      continue;
    }

    // Value LED / Value LCD: single Readout stack — no separate "Light" section title.
    // Order: Decimals → LED|Ink → Ghost → Trail → blend → Background → Ghost Gradient.
    if (type === "numberReadout" && section === "dot1") {
      continue;
    }

    const sectionControls = nodeGraphTraceDisplaySectionControls[section];
    if (!sectionControls) {
      continue;
    }
    let fieldKeys = (sectionControls.fields || []).filter(
      (key) => activeFields.has(key) && allowKey("fields", key),
    );
    if (isVectorTraceForm && typeof nodeGraphDisplaySettingsOrderTraceInkFields === "function") {
      fieldKeys = nodeGraphDisplaySettingsOrderTraceInkFields(fieldKeys);
    }
    let colorKeys = (sectionControls.colors || []).filter(
      (key) => activeColors.has(key) && allowKey("colors", key),
    );
    if (type === "trace" && isStereoTraceNode) {
      colorKeys = colorKeys.filter((key) => !NODE_GRAPH_TRACE_STEREO_COLOR_ORDER.includes(key));
    }
    const toggleKeys = (sectionControls.toggles || []).filter(
      (key) => activeToggles.has(key) && allowKey("toggles", key),
    );
    let choiceKeys = (sectionControls.choices || []).filter(
      (key) => activeChoices.has(key) && allowKey("choices", key),
    );
    if (type === "numberReadout" && section === "trace") {
      const nrNodeType = node?.type
        || (typeof nodeGraphPatchNode === "function"
          && typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
          ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type
          : null);
      if (nrNodeType === "valueLcd" || nrNodeType === "helmholtzPitch") {
        // Value LCD (vector): Digits/Decimals + padding, Ghost plate, glass shadow — no residual hang.
        fieldKeys = [
          "digits",
          "decimals",
          "facePadding",
          "unlitSegments",
          ...(nrNodeType === "helmholtzPitch" ? ["centsBand"] : []),
          "innerShadowDistance",
          "innerShadowSharpness",
          "innerShadowOffsetX",
          "innerShadowOffsetY",
        ].filter((key) => activeFields.has(key));
        choiceKeys = ["polarity"].filter((key) => activeChoices.has(key));
        colorKeys = ["dot1Color", "backgroundColor"]
          .filter((key) => activeColors.has(key));
      } else {
        // Value LED: Digits → Decimals → Padding → Bright → Ghost → Trail → Burn → Burn ⨉.
        fieldKeys = [
          "digits",
          "decimals",
          "facePadding",
          "dot1Brightness",
          "ghost",
          "trail",
          "burn",
          "burnAmount",
        ].filter((key) => activeFields.has(key));
        colorKeys = ["backgroundColor"]
          .filter((key) => activeColors.has(key));
        choiceKeys = ["lightBlend", "polarity"]
          .filter((key) => activeChoices.has(key));
      }
    }
    // syncChannel / stereoBlend live in activeChoices but are listed under
    // "trace" sectionChoices only for spectrogram historically — include
    // Output sync choices from active set even if not in section map.
    if (section === "trace" && type === "trace" && isStereoTraceNode) {
      for (const key of ["syncChannel", "stereoBlend"]) {
        if (activeChoices.has(key) && !choiceKeys.includes(key)) {
          choiceKeys.push(key);
        }
      }
    }
    if (section === "trace" && type === "traceXyz") {
      for (const key of ["stereoBlend", "xyzLayout"]) {
        if (activeChoices.has(key) && !choiceKeys.includes(key)) {
          choiceKeys.push(key);
        }
      }
    }
    if (!fieldKeys.length && !colorKeys.length && !toggleKeys.length && !choiceKeys.length) {
      // secondaryEnabled is only in section title for secondary; handle below.
      if (!(section === "secondary" && activeToggles.has("secondaryEnabled") && isStereoTraceNode && type === "trace")) {
        continue;
      }
    }

    let titleText = section === "trace"
      ? (nodeGraphDisplaySettingsFormTypeTitles[type] || "Trace")
      : section === "value"
        ? "Line"
        : section === "dot1"
          ? (isStereoTraceNode && type === "trace" ? "Left" : "Dot")
          : section === "secondary"
            ? (isStereoTraceNode && type === "trace" ? "Right" : "Secondary")
            : section === "caps"
              ? "Caps"
              : section;
    // Skip redundant section titles: NR chrome, phosphor "2D"/"Stamp"/"Burn" headers.
    const isPhosphorForm = typeof nodeGraphDisplaySettingsIsPhosphorFormType === "function"
      && nodeGraphDisplaySettingsIsPhosphorFormType(type);
    const skipSectionTitle =
      (type === "numberReadout" && section === "trace")
      || (isPhosphorForm && (section === "trace" || section === "dot1"))
      || (isVectorTraceForm && section === "dot1" && !(isStereoTraceNode && type === "trace"));
    if (skipSectionTitle) {
      // no title row
    } else if (section === "trace" && isStereoTraceNode && type === "trace") {
      parts.push(`<div class="metadata-section-title node-trace-display-${section}-title">${nodeGraphDisplaySettingsEscapeHtml(titleText)}</div>`);
    } else if (section === "secondary") {
      const enabledToggle = isStereoTraceNode && type === "trace" && activeToggles.has("secondaryEnabled")
        ? `<input id="nodeTraceDisplaySecondaryEnabled" type="checkbox" aria-label="${isStereoTraceNode ? "Right on" : "Secondary on"}" data-trace-display-toggle="secondaryEnabled">`
        : "";
      parts.push(`
        <div class="metadata-section-title node-trace-display-secondary-title">
          <span id="nodeTraceDisplaySecondaryTitleLabel">${nodeGraphDisplaySettingsEscapeHtml(titleText)}</span>
          ${enabledToggle}
        </div>`);
    } else if (section === "dot1") {
      const dotTitle = type === "xyPad" ? "Beam & puck" : titleText;
      const swapHtml = isStereoTraceNode && type === "trace"
        ? `<button type="button" id="nodeTraceDisplaySwapStereoLook" class="node-trace-display-swap-lr">Swap L/R</button>`
        : "";
      parts.push(`
        <div class="metadata-section-title node-trace-display-dot1-title${swapHtml ? " node-trace-display-stereo-title" : ""}">
          <span id="nodeTraceDisplayDot1TitleLabel">${nodeGraphDisplaySettingsEscapeHtml(dotTitle)}</span>
          ${swapHtml}
        </div>`);
    } else {
      parts.push(`<div class="metadata-section-title node-trace-display-${section}-title">${nodeGraphDisplaySettingsEscapeHtml(titleText)}</div>`);
    }

    const rows = [];
    // Packing toggles (Sync | Full Dots | Dots only) sit *below* Dot Budget.
    // Sync only rides this row when a phosphor packing toggle is also active
    // (otherwise Trace keeps the ordinary Sync checkbox).
    const packingCandidates = NODE_GRAPH_DISPLAY_PACKING_TOGGLE_KEYS.filter((key) => toggleKeys.includes(key));
    const hasPhosphorPacking = packingCandidates.some(
      (key) => key === "fullDotEconomy" || key === "dotsOnly",
    );
    const packingKeys = hasPhosphorPacking
      ? packingCandidates
      : packingCandidates.filter((key) => key !== "sourceSync");
    const packingKeySet = new Set(packingKeys);
    // Preferred order: choices → toggles (except packing) → fields → packing → colors.
    // Spectrogram: one column, one row per control (label | dropdown).
    // Other faces may pack 2+ short choices into a two-column grid.
    if (type === "spectrogramBurn" || choiceKeys.length < 2) {
      for (const key of choiceKeys) {
        rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml(key));
      }
    } else {
      rows.push(
        `<div class="node-trace-display-choice-grid">${
          choiceKeys.map((key) => nodeGraphDisplaySettingsBuildChoiceRowHtml(key)).join("")
        }</div>`,
      );
    }
    for (const key of toggleKeys) {
      if (section === "secondary" && key === "secondaryEnabled") {
        continue; // already in title
      }
      if (packingKeySet.has(key)) {
        continue; // after fields / Dot Budget
      }
      rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml(key));
    }
    for (const key of fieldKeys) {
      if (type === "numberReadout" && key === "dot1Brightness" && activeColors.has("dot1Color")) {
        // Value LED only (LCD has no Bright field in its stack).
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: "LED",
          stepField: "dot1Brightness",
          colorField: "dot1Color",
          formType: type,
        }));
        continue;
      }
      rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
    }
    // Sync | Full Dots | Dots only | Clear — one row under Dot Budget (1D + 2D phosphor).
    if (packingKeys.length) {
      rows.push(nodeGraphDisplaySettingsBuildPackingToggleRowHtml(packingKeys));
    }
    for (const key of colorKeys) {
      rows.push(nodeGraphDisplaySettingsBuildColorRowHtml(key, type));
    }
    // Value LED: Ghost Gradient under Background. Value LCD skips (reflective ink model).
    if (type === "numberReadout" && section === "trace"
      && typeof nodeGraphDisplaySettingsFormTypeUsesGradient === "function"
      && nodeGraphDisplaySettingsFormTypeUsesGradient(type)) {
      const nrNodeType = typeof nodeGraphPatchNode === "function"
        && typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
        ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type
        : null;
      if (nrNodeType !== "valueLcd") {
        rows.push(`
        <div class="metadata-section-title node-trace-display-gradient-title">Ghost Gradient</div>
        <div
          id="nodeTraceDisplayGradientSelectorHost"
          class="node-gradient-selector-host node-shared-gradient-host node-spectrogram-gradient-host"
          data-gradient-selector-host
          data-shared-gradient-host
          data-spectrogram-gradient-host></div>`);
      }
    }
    parts.push(`<div class="metadata-field-section node-trace-display-${section}-section">${rows.join("")}</div>`);
  }

  if (type === "trace" && isStereoTraceNode) {
    const stereoColors = NODE_GRAPH_TRACE_STEREO_COLOR_ORDER.filter(
      (key) => activeColors.has(key) && allowKey("colors", key),
    );
    if (stereoColors.length) {
      parts.push(
        `<div class="metadata-field-section node-trace-display-stereo-colors-section">${
          stereoColors.map((key) => nodeGraphDisplaySettingsBuildColorRowHtml(key, type, { stereo: true })).join("")
        }</div>`,
      );
    }
  }

  // Knob image layers + rotate flags live only in Display Settings.
  if (type === "knobFace" && typeof buildNodeGraphKnobFaceLayersDisplaySettingsHtml === "function") {
    parts.push(buildNodeGraphKnobFaceLayersDisplaySettingsHtml());
  }

  return parts.join("\n");
}

