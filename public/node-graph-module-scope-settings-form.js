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
    || formType === "traceRgb"
  )) {
    label = "History";
    title = "Seconds of tape across the face. 0 = now (a full-width line). Off: scroll speed. Sync: time for the pen to walk left→right.";
  } else if ((key === "zoomSeconds" || key === "historySeconds") && (
    formType === "traceXyz"
    || formType === "gradientVectorscopeFace"
  )) {
    label = "History";
    title = "Seconds of live history drawn on the face.";
  }
  if (key === "lineThickness" && (
    formType === "trace"
    || formType === "traceRgb"
    || formType === "traceXyz"
  )) {
    label = "Blur";
    title = "0 = hard pixel disc at Size (no AA). 1 = smoothstep from center to that same edge (Size does not grow).";
  } else if (key === "stampDensity" && (
    formType === "trace"
    || formType === "traceRgb"
    || formType === "traceXyz"
  )) {
    label = "Dot density";
    title = "0 = extremely sparse (~200× default gap); 0.5 = recommended; 1 = 2× recommended density.";
  } else if (key === "lineThickness" && formType === "value") {
    label = "Blur";
    title = "0 = Size as a hard line. Raise to fatten a soft halo outward. Lower returns to the thin sharp line.";
  }
  if ((key === "dot1Size" || key === "secondarySize") && (
    formType === "trace"
    || formType === "traceRgb"
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
    || formType === "traceRgb"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
    || formType === "value"
    || formType === "scope2d"
    || formType === "lineBurn"
    || formType === "phosphorLight"
  )) {
    label = "\uD83D\uDCA1 Bright";
    title = formType === "scope2dTrace"
      ? "Beam brightness 0…1 (black → full hue at 0.5 → white). Drag the Trace title to change hue."
      : formType === "trace" || formType === "traceRgb" || formType === "traceXyz" || formType === "gradientVectorscopeFace" || formType === "value"
      ? "Ink light 0…1 (1 = full)."
      : "Stamp brightness 0…1 (single source of truth). 1 = full ink. Preview matches the face.";
  }
  if (key === "pixelDensity" && (
    formType === "trace"
    || formType === "traceRgb"
    || formType === "traceXyz"
    || formType === "scope2dTrace"
    || formType === "gradientVectorscopeFace"
    || formType === "scope2d"
    || formType === "lineBurn"
    || formType === "phosphorLight"
    || formType === "xyPad"
  )) {
    label = "Pixel density";
    title = "1 = native face buffer. Below 1 = chunky lo-fi grid (nearest-neighbor).";
  }
  if (key === "fade" && formType === "traceXyz") {
    label = "Fade";
    title = "Fade the stroke along history. 0 = even ink. 1 = oldest gone, newest full. Does not change the preview dot.";
  }
  if (key === "scale" && (
    formType === "trace"
    || formType === "traceRgb"
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
  if ((formType === "roundShapeFace" || formType === "basicShapeFace") && key === "lineThickness") {
    label = "Line thickness";
    title = formType === "basicShapeFace"
      ? "Wave stroke width in CSS pixels (0.25–16)."
      : "Orbit stroke width in CSS pixels (0.25–16).";
  }
  if ((formType === "roundShapeFace" || formType === "basicShapeFace") && key === "dotThickness") {
    label = "Dot thickness";
    title = "Phase-dot diameter in CSS pixels (0.25–32).";
  }
  if ((formType === "roundShapeFace" || formType === "basicShapeFace") && key === "lineBlur") {
    label = "Line blur";
    title = "Diamond restroke blur in CSS pixels (0 = hard). Path is redrawn at 9 tent-weighted offsets — cheap, no extra canvas.";
  }
  if ((formType === "roundShapeFace" || formType === "basicShapeFace") && key === "pixelDensity") {
    label = "Pixel density";
    title = "1.0 = CSS × devicePixelRatio. Below 1 = chunky lo-fi.";
  }
  if (key === "innerRadius" && formType === "knobFace") {
    label = "Inner radius";
    title = "Arc hole size 0…1 (0 = solid, ~0.7 default ring, higher = thinner ring).";
  }
  if ((formType === "vectorDot" || formType === "pulseDot" || formType === "lcdDot") && key === "lineThickness") {
    label = "Blur";
    title = "Smoothstep edge softness 0…1 (0 = hard edge, 1 = soft skirt). Baked into the stamp bitmap.";
  }
  if ((formType === "vectorDot" || formType === "pulseDot" || formType === "lcdDot") && key === "dot1Size") {
    label = "Size";
    title = "Dot diameter as a fraction of the face min side.";
  }
  if ((formType === "vectorDot" || formType === "pulseDot" || formType === "lcdDot") && key === "shapeParam") {
    const live = document.getElementById("nodeTraceDisplaySettingsPopover")
      ?.querySelector?.(`[data-trace-display-choice="shape"]`)?.value;
    const shape = typeof normalizeTraceStampShape === "function"
      ? normalizeTraceStampShape(live || "circle")
      : String(live || "circle");
    const meta = typeof traceStampShapeParamMeta === "function"
      ? traceStampShapeParamMeta(shape)
      : null;
    label = meta?.label || "Shape";
    title = meta?.title
      || "Shape parameter 0…1. Meaning depends on Shape.";
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
    title = "Extra persist 0…1 on leftover energy. 0 = Trail/Ghost only; mid = dim afterglow that still fades; 1 = freeze residual.";
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
  const ariaLabel = String(options.ariaLabel || label || key).trim();
  const ariaAttr = options.hideLabel
    ? ` aria-label="${nodeGraphDisplaySettingsEscapeHtml(ariaLabel)}"`
    : "";
  const labelHtml = options.hideLabel
    ? ""
    : `<span>${nodeGraphDisplaySettingsEscapeHtml(label)}</span>`;
  const rowClass = options.hideLabel
    ? "node-trace-display-line-burn-row node-trace-display-stepper-only"
    : "node-trace-display-line-burn-row";
  return `
    <label class="${rowClass}" data-trace-display-control-row>
      ${labelHtml}
      <span class="metadata-stepper-control">
        <button type="button" data-trace-display-step-target="${key}" data-trace-display-step-direction="-1">-</button>
        <input type="text" inputmode="${meta.inputmode || "decimal"}" data-trace-display-field="${key}"${idAttr}${titleAttr}${ariaAttr}>
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

function nodeGraphDisplaySettingsStereoSharedLabel(leftKey) {
  if (leftKey === "dot1Size") {
    return "\u26AA Size";
  }
  if (leftKey === "lineThickness") {
    return "Blur";
  }
  if (leftKey === "dot1Brightness") {
    return "\uD83D\uDCA1 Bright";
  }
  return "";
}

function nodeGraphDisplaySettingsBuildStereoPairRowHtml(leftKey, rightKey, formType = null) {
  const shared = nodeGraphDisplaySettingsStereoSharedLabel(leftKey)
    || (nodeGraphDisplaySettingsFieldMeta[leftKey] || {}).label
    || leftKey;
  return `
    <div class="node-trace-display-lr-row" data-trace-display-lr-row>
      <span class="node-trace-display-lr-shared-label">${nodeGraphDisplaySettingsEscapeHtml(shared)}</span>
      <div class="node-trace-display-lr-pair">
        ${nodeGraphDisplaySettingsBuildStepperRowHtml(leftKey, formType, { hideLabel: true, ariaLabel: `${shared} L` })}
        ${nodeGraphDisplaySettingsBuildStepperRowHtml(rightKey, formType, { hideLabel: true, ariaLabel: `${shared} R` })}
      </div>
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
      ? "LCD Value foreground (digit ink) color"
      : "LED Value digit hue; LED amount maps grey → full hue → white";
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
  } else if ((formType === "roundShapeFace" || formType === "basicShapeFace") && key === "backgroundColor") {
    aria = "RoundShape background color";
    base = { ...base, defaultValue: "#020609" };
  } else if ((formType === "roundShapeFace" || formType === "basicShapeFace") && key === "strokeColor") {
    aria = "RoundShape foreground / stroke color";
    base = { ...base, defaultValue: "#78dcc8" };
  } else if ((formType === "roundShapeFace" || formType === "basicShapeFace") && key === "dotColor") {
    aria = "RoundShape cursor dot color";
    base = { ...base, defaultValue: "#ffffff" };
  } else if (formType === "limiterGainFace" && key === "backgroundColor") {
    aria = "Limiter gain face background color";
    base = { ...base, defaultValue: "#020407" };
  } else if (formType === "textBoxFace" && key === "backgroundColor") {
    aria = "Text Box background color";
    base = { ...base, defaultValue: "#020407" };
  } else if (formType === "trace" && options.xyz && key === "dot1Color") {
    aria = "X";
    base = { ...base, defaultValue: "#ff0000" };
  } else if (formType === "trace" && options.xyz && key === "secondaryColor") {
    aria = "Y";
    base = { ...base, defaultValue: "#0000ff" };
  } else if (formType === "trace" && options.xyz && key === "tertiaryColor") {
    aria = "Z";
    base = { ...base, defaultValue: "#00ff00" };
  } else if (formType === "trace" && options.stereo && key === "dot1Color") {
    aria = "Left";
    base = { ...base, defaultValue: "#ff0000" };
  } else if (formType === "trace" && options.stereo && key === "secondaryColor") {
    aria = "Right";
    base = { ...base, defaultValue: "#0000ff" };
  } else if (formType === "trace" && (options.stereo || options.xyz) && key === "backgroundColor") {
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

function nodeGraphDisplaySettingsShowsStampPreview(type) {
  return type === "vectorDot"
    || type === "pulseDot"
    || type === "lcdDot"
    || type === "dot"
    || (typeof nodeGraphDisplaySettingsIsVectorTraceFormType === "function"
      && nodeGraphDisplaySettingsIsVectorTraceFormType(type))
    || (typeof nodeGraphDisplaySettingsIsPhosphorFormType === "function"
      && nodeGraphDisplaySettingsIsPhosphorFormType(type));
}

function nodeGraphStampPreviewHtml(stereo = false, kind = "trace", xyz = false, rgb = false) {
  const canvas = (side, label) => `
      <div class="node-trace-display-preview-cell">
        ${side ? `<span class="node-trace-display-preview-side-label" data-preview-side-label="${side}">${label}</span>` : ""}
        <canvas
          class="node-trace-display-dot-preview"
          data-stamp-preview-canvas
          ${side ? `data-preview-side="${side}"` : ""}
          width="96"
          height="96"
          aria-label="${side ? `${label} size, blur, and pixel density preview` : "Stamp size, blur, and pixel density preview"}"></canvas>
      </div>`;
  if (rgb) {
    // Labels follow CMY checkbox when the form has already loaded settings;
    // paint path also remaps gun colors from settings.cmyMode.
    return `
    <div class="node-trace-display-preview-shell is-rgb" data-stamp-preview="${kind}" data-preview-rgb="1">
      ${canvas("GunR", "R/C")}
      ${canvas("GunG", "G/M")}
      ${canvas("GunB", "B/Y")}
    </div>`;
  }
  if (xyz) {
    return `
    <div class="node-trace-display-preview-shell is-xyz" data-stamp-preview="${kind}" data-preview-xyz="1">
      ${canvas("X", "X")}
      ${canvas("Y", "Y")}
      ${canvas("Z", "Z")}
    </div>`;
  }
  if (stereo) {
    return `
    <div class="node-trace-display-preview-shell is-stereo" data-stamp-preview="${kind}" data-preview-stereo="1">
      ${canvas("L", "L")}
      ${canvas("R", "R")}
    </div>`;
  }
  return `
    <div class="node-trace-display-preview-shell" data-stamp-preview="${kind}">
      ${canvas("", "")}
    </div>`;
}

function nodeGraphStampPreviewUnit(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    const fb = Number(fallback);
    return Math.max(0, Math.min(1, Number.isFinite(fb) ? fb : 0));
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphStampPreviewParseHex(hex, fallback = [255, 255, 255]) {
  const s = String(hex || "").replace("#", "");
  if (s.length < 6) {
    return fallback;
  }
  const r = Number.parseInt(s.slice(0, 2), 16);
  const g = Number.parseInt(s.slice(2, 4), 16);
  const b = Number.parseInt(s.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) {
    return fallback;
  }
  return [r, g, b];
}

/** Live module face buffer min-side. Never the preview plate. */
function nodeGraphStampPreviewFaceMinSide(settings) {
  const nodeId = String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim();
  if (nodeId && typeof nodeGraphModuleScopePersistentCanvases !== "undefined") {
    const face = nodeGraphModuleScopePersistentCanvases.get?.(nodeId);
    const w = Number(face?.width);
    const h = Number(face?.height);
    if (w > 0 && h > 0) {
      return Math.min(w, h);
    }
  }
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : nodeGraphStampPreviewUnit(settings?.pixelDensity, 1);
  const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
  return Math.max(1, Math.round(128 * dpr * Math.max(0, density)));
}

/** Halo extent in face-buffer px so the full stamp (core + Blur) fits. */
function nodeGraphStampPreviewExtent(radius, blur01, phosphor) {
  const r = Math.max(0, Number(radius) || 0);
  const blur = nodeGraphStampPreviewUnit(blur01, 0);
  if (phosphor) {
    return r * (1.2 + 5.3 * blur) + 1.5 * (1 - blur);
  }
  return r * (1 + 2 * blur);
}

/**
 * Preview plate size — FIXED square.
 * Stereo L/R and XYZ X/Y/Z must not shrink with column count (that made XYZ
 * previews look like a different design than stereo).
 */
function nodeGraphStampPreviewPlateSize(_canvas) {
  const side = 96;
  return { width: side, height: side };
}

/** Channel color for Instant Trace stamp preview (same mapping as waterfall ink). */
function nodeGraphStampPreviewTraceColor(settings, side, kind = "trace") {
  // RGB waterfall: fixed guns (never reuse stereo "R" → blue mapping).
  if (kind === "traceRgb" || side === "GunR" || side === "GunG" || side === "GunB") {
    const cmy = settings?.cmyMode === true;
    if (side === "GunG" || side === "G") return cmy ? "#ff00ff" : "#00ff00";
    if (side === "GunB" || side === "B") return cmy ? "#ffff00" : "#0000ff";
    return cmy ? "#00ffff" : "#ff0000";
  }
  if (side === "R" || side === "Y") {
    return settings.secondaryColor || "#0000ff";
  }
  if (side === "Z") {
    return settings.tertiaryColor || "#00ff00";
  }
  if (side === "L" || side === "X") {
    return settings.dot1Color || settings.color || "#ff0000";
  }
  return settings.dot1Color || settings.color || "#ffffff";
}

/** Size + color + blur (+ bright for RGB guns) for Instant Trace stamp preview. */
function nodeGraphStampPreviewTraceInk(settings, side, kind = "trace") {
  const right = side === "R";
  const rgb = kind === "traceRgb" || String(side || "").startsWith("Gun");
  const instant = kind === "trace" || kind === "traceRgb" || kind === "traceXyz"
    || rgb || side === "L" || side === "X" || side === "Y" || side === "Z";
  return {
    size: nodeGraphStampPreviewUnit(
      right ? (settings.secondarySize ?? settings.dot1Size ?? settings.size) : (settings.dot1Size ?? settings.size),
      0,
    ),
    color: nodeGraphStampPreviewTraceColor(settings, side, kind),
    blur: instant ? nodeGraphStampPreviewUnit(settings.lineThickness, 0) : 0,
    bright: rgb
      ? nodeGraphStampPreviewUnit(settings.dot1Brightness ?? settings.brightness, 1)
      : 1,
  };
}

function nodeGraphStampPreviewScratch(owner, size) {
  let scratch = owner._stampPreviewScratch;
  if (!(scratch instanceof HTMLCanvasElement)) {
    scratch = document.createElement("canvas");
    owner._stampPreviewScratch = scratch;
  }
  const n = Math.max(1, Math.round(Number(size) || 1));
  if (scratch.width !== n) {
    scratch.width = n;
  }
  if (scratch.height !== n) {
    scratch.height = n;
  }
  return scratch;
}

function nodeGraphStampPreviewBlit(plateCtx, plateW, plateH, scratch, bgHex = "#020405", smooth = false) {
  plateCtx.setTransform(1, 0, 0, 1, 0, 0);
  plateCtx.imageSmoothingEnabled = Boolean(smooth);
  plateCtx.globalCompositeOperation = "source-over";
  plateCtx.fillStyle = bgHex || "#020405";
  plateCtx.fillRect(0, 0, plateW, plateH);
  if (scratch && scratch.width > 0 && scratch.height > 0) {
    plateCtx.drawImage(scratch, 0, 0, scratch.width, scratch.height, 0, 0, plateW, plateH);
  }
}

function paintNodeGraphStampPreviewCanvas(canvas, settings = {}, side = "", kind = "trace") {
  if (!canvas) {
    return;
  }
  const plate = nodeGraphStampPreviewPlateSize(canvas);
  if (canvas.width !== plate.width) {
    canvas.width = plate.width;
  }
  if (canvas.height !== plate.height) {
    canvas.height = plate.height;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const bgHex = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground(settings, "#020405")
    : "#020405";
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : 1;
  const fillEmpty = () => {
    nodeGraphStampPreviewBlit(context, plate.width, plate.height, null, bgHex);
  };
  // Instant Trace / RGB waterfall: same dab path as the face (hard or soft).
  // Draw in plate space, scaled so the full stamp (core + blur) fits — never
  // ClampPoint-shift into the right edge of a too-small scratch.
  if (kind === "trace" || kind === "traceRgb") {
    const ink = nodeGraphStampPreviewTraceInk(settings, side, kind);
    if (!(ink.size > 0)) {
      fillEmpty();
      return;
    }
    const faceMin = nodeGraphStampPreviewFaceMinSide(settings);
    const faceRadius = typeof nodeGraphWaterfallGlRadius === "function"
      ? nodeGraphWaterfallGlRadius(faceMin, ink.size)
      : (typeof TraceStroke !== "undefined" && typeof TraceStroke.radiusPx === "function"
        ? TraceStroke.radiusPx(faceMin, ink.size)
        : faceMin * ink.size * 0.5);
    if (!(faceRadius > 0)) {
      fillEmpty();
      return;
    }
    const blur = Number(ink.blur) || 0;
    const facePad = typeof nodeGraphWaterfallSoftPad === "function"
      ? nodeGraphWaterfallSoftPad(faceRadius, blur)
      : faceRadius * (1 + blur * 1.65) + 1;
    const plateSide = Math.min(plate.width, plate.height);
    const fit = Math.max(0.001, (plateSide * 0.5 - 1.5) / Math.max(facePad, faceRadius, 0.5));
    const radius = Math.max(0.5, faceRadius * fit);
    const cx = plate.width * 0.5;
    const cy = plate.height * 0.5;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = bgHex;
    context.fillRect(0, 0, plate.width, plate.height);
    let rgb = nodeGraphStampPreviewParseHex(ink.color);
    if (typeof nodeGraphWaterfallScaleRgb === "function") {
      rgb = nodeGraphWaterfallScaleRgb(rgb, ink.bright);
    }
    // Same dab as the face (smoothstep blur, no size growth). Scratch avoids clamp nudge.
    if (typeof nodeGraphWaterfallDab === "function") {
      const pad = typeof nodeGraphWaterfallSoftPad === "function"
        ? nodeGraphWaterfallSoftPad(radius, blur)
        : radius;
      const buf = Math.max(plateSide, Math.ceil(pad * 2 + 4));
      const scratch = nodeGraphStampPreviewScratch(canvas, buf);
      const scratchCtx = scratch.getContext("2d");
      if (!scratchCtx) {
        fillEmpty();
        return;
      }
      scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
      scratchCtx.clearRect(0, 0, buf, buf);
      nodeGraphWaterfallDab(scratchCtx, buf * 0.5, buf * 0.5, radius, rgb, "source-over", blur);
      context.imageSmoothingEnabled = blur >= 0.02 && density >= 0.999;
      context.drawImage(
        scratch,
        buf * 0.5 - plate.width * 0.5,
        buf * 0.5 - plate.height * 0.5,
        plate.width,
        plate.height,
        0,
        0,
        plate.width,
        plate.height,
      );
    } else {
      context.imageSmoothingEnabled = false;
      context.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
    }
    canvas.style.imageRendering = density < 0.999 || blur < 0.02 ? "pixelated" : "";
    return;
  }

  const right = side === "R";
  const size = nodeGraphStampPreviewUnit(
    right ? settings.secondarySize : (settings.dot1Size ?? settings.size),
    0,
  );
  if (!(size > 0)) {
    fillEmpty();
    return;
  }
  const blur = Number(right ? settings.secondaryLineThickness : settings.lineThickness);
  const blur01 = kind === "scope2dTrace"
    ? 0
    : (Number.isFinite(blur) ? Math.max(0, Math.min(1, blur)) : 0);
  let color = nodeGraphStampPreviewTraceColor(settings, side);
  if (kind === "scope2dTrace" && typeof nodeGraphScope2dTraceInkHex === "function") {
    color = nodeGraphScope2dTraceInkHex(settings);
  }
  const faceMin = nodeGraphStampPreviewFaceMinSide(settings);
  const phosphor = typeof nodeGraphDisplaySettingsIsPhosphorFormType === "function"
    && nodeGraphDisplaySettingsIsPhosphorFormType(kind);
  const radius = phosphor && typeof PhosphorDrawer !== "undefined"
    && typeof PhosphorDrawer.radiusFromSize === "function"
    ? PhosphorDrawer.radiusFromSize(faceMin, size)
    : (typeof TraceStroke !== "undefined" && typeof TraceStroke.radiusPx === "function"
      ? TraceStroke.radiusPx(faceMin, size)
      : faceMin * size * 0.5);
  if (!(radius > 0)) {
    fillEmpty();
    return;
  }
  const extent = nodeGraphStampPreviewExtent(radius, blur01, phosphor);
  const buf = Math.max(1, Math.min(2048, Math.ceil(extent * 2 + 2)));
  const scratch = nodeGraphStampPreviewScratch(canvas, buf);
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) {
    fillEmpty();
    return;
  }
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.imageSmoothingEnabled = false;
  scratchCtx.globalCompositeOperation = "source-over";
  scratchCtx.fillStyle = bgHex;
  scratchCtx.fillRect(0, 0, buf, buf);
  const cx = buf * 0.5;
  const cy = buf * 0.5;
  const bright = Number(settings.dot1Brightness ?? settings.brightness);
  const bright01 = kind === "scope2dTrace"
    ? 1
    : (Number.isFinite(bright) ? Math.max(0, bright) : 1);
  let painted = false;
  const spriteKind = kind === "vectorDot" || kind === "pulseDot" || kind === "lcdDot" || kind === "dot" || phosphor;
  if (spriteKind && typeof TraceDotSprite !== "undefined" && typeof TraceDotSprite.draw === "function") {
    const amt = Number.isFinite(bright01) ? Math.max(0, Math.min(1, bright01)) : 0.5;
    if (kind === "vectorDot" || kind === "pulseDot" || kind === "lcdDot") {
      const stampShape = typeof normalizeTraceStampShape === "function"
        ? normalizeTraceStampShape(settings.shape)
        : String(settings.shape || "circle");
      const shapeParam = Math.max(0, Math.min(1, Number(
        settings.shapeParam ?? (stampShape === "pill" ? settings.pill : settings.squircle),
      ) || 0.5));
      const stretch = stampShape === "pill" ? shapeParam : 0;
      const ext = typeof nodeGraphVectorDotStampExtents === "function"
        ? nodeGraphVectorDotStampExtents(buf, buf, size, stretch)
        : { rx: radius * (1 + stretch * 2), ry: radius };
      if (kind === "lcdDot") {
        TraceDotSprite.draw(scratchCtx, cx, cy, radius, blur01, {
          color,
          amount: 1,
          rx: ext.rx,
          ry: ext.ry,
          shape: stampShape,
          shapeParam,
        }, amt);
      } else {
        const hue = typeof nodeGraphHueDegFromHex === "function"
          ? nodeGraphHueDegFromHex(color)
          : 25;
        TraceDotSprite.draw(scratchCtx, cx, cy, radius, blur01, {
          hue,
          amount: amt,
          rx: ext.rx,
          ry: ext.ry,
          shape: stampShape,
          shapeParam,
        }, 1);
      }
    } else if (kind === "dot" && typeof nodeGraphPhosphorDotLutCss === "function") {
      TraceDotSprite.draw(scratchCtx, cx, cy, radius, blur01, {
        amount: amt,
        colorAt: (b) => nodeGraphPhosphorDotLutCss(settings, b),
      }, 1);
    } else {
      TraceDotSprite.draw(scratchCtx, cx, cy, radius, blur01, {
        amount: amt,
        color,
      }, 1);
    }
    painted = true;
  }
  if (!painted && phosphor && typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.ensure && PhosphorDrawer.stepDots) {
    const splat = PhosphorDrawer.ensure(scratch, buf, buf, "_stampPreview");
    if (splat) {
      if (typeof nodeGraphPhosphorEnergyGlClear === "function") {
        nodeGraphPhosphorEnergyGlClear(splat);
      } else if (typeof PhosphorDrawer.stepFade === "function") {
        PhosphorDrawer.stepFade(splat, { decay: 1, trail: 1, ghost: 1, bleed: 0 });
      }
      const stops = Array.isArray(settings.gradientStops) ? settings.gradientStops : null;
      if (stops && stops.length >= 2 && typeof PhosphorDrawer.setLutStops === "function") {
        PhosphorDrawer.setLutStops(splat, stops);
      } else if (typeof PhosphorDrawer.setLut === "function") {
        PhosphorDrawer.setLut(splat, nodeGraphStampPreviewParseHex(color), bgHex);
      }
      PhosphorDrawer.stepDots(splat, {
        pathPoints: [{ x: cx, y: cy }],
        size01: size,
        faceMinSide: faceMin,
        radius,
        brightness: bright01,
        useDepositGain: false,
        blur: blur01,
        maxDots: 1,
        dotsOnly: true,
        trail: 0,
        ghost: 0,
        burnAmount: 1,
        decay: 0,
        bleed: 0,
      });
      if (typeof PhosphorDrawer.presentTo === "function") {
        PhosphorDrawer.presentTo(splat, scratchCtx, {
          width: buf,
          height: buf,
          smooth: density >= 0.999,
          exposure: typeof PhosphorDrawer.exposure === "function"
            ? PhosphorDrawer.exposure(bright01)
            : undefined,
        });
      }
      painted = true;
    }
  }
  if (!painted && typeof TraceStroke !== "undefined" && typeof TraceStroke.draw === "function") {
    TraceStroke.draw(scratchCtx, [{ x: cx, y: cy }], {
      size,
      blur: blur01,
      brightness: bright01,
      color,
      faceMinSide: faceMin,
      composite: "source-over",
    });
    painted = true;
  }
  if (!painted) {
    scratchCtx.fillStyle = color;
    scratchCtx.beginPath();
    scratchCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    scratchCtx.fill();
  }
  context.imageSmoothingEnabled = density >= 0.999;
  canvas.style.imageRendering = density < 0.999 ? "pixelated" : "";
  nodeGraphStampPreviewBlit(context, plate.width, plate.height, scratch, bgHex);
}

function paintNodeGraphStampPreview(root, settings = {}) {
  const shell = root?.querySelector?.("[data-stamp-preview]");
  const kind = shell?.getAttribute?.("data-stamp-preview") || "trace";
  const canvases = root?.querySelectorAll?.("[data-stamp-preview-canvas]");
  if (!canvases?.length) {
    return;
  }
  for (const canvas of canvases) {
    paintNodeGraphStampPreviewCanvas(
      canvas,
      settings,
      canvas.getAttribute("data-preview-side") || "",
      kind,
    );
  }
}

/** Hide Shape param for Circle; retitle Stretch/Corners/Sides/… from live Shape. */
function syncNodeGraphStampShapeControls(root, settings = {}) {
  const host = root?.querySelector?.(`[data-trace-display-choice="shape"]`)
    ? root
    : document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!host) {
    return;
  }
  const shapeSelect = host.querySelector(`[data-trace-display-choice="shape"]`);
  if (!shapeSelect) {
    return;
  }
  const shape = typeof normalizeTraceStampShape === "function"
    ? normalizeTraceStampShape(shapeSelect.value || settings.shape || "circle")
    : String(shapeSelect.value || settings.shape || "circle");
  const usesParam = typeof traceStampShapeUsesParam === "function"
    ? traceStampShapeUsesParam(shape)
    : shape !== "circle";
  const meta = typeof traceStampShapeParamMeta === "function"
    ? traceStampShapeParamMeta(shape)
    : { label: "Shape", title: "" };
  const field = host.querySelector(`[data-trace-display-field="shapeParam"]`);
  const row = field?.closest?.("[data-trace-display-control-row]") || null;
  if (row) {
    row.hidden = !usesParam;
    row.style.display = usesParam ? "" : "none";
  }
  if (!usesParam) {
    return;
  }
  // Stepper rows: first child <span> is the field title.
  const titleSpan = row?.querySelector?.(":scope > span:not(.metadata-stepper-control)");
  if (titleSpan) {
    titleSpan.textContent = meta.label;
  }
  if (row && meta.title) {
    row.title = meta.title;
  }
  if (field) {
    if (meta.title) {
      field.title = meta.title;
    }
    field.setAttribute("aria-label", meta.label);
  }
}

function syncNodeGraphStampPreview(root, settings) {
  const host = root?.querySelector?.("[data-stamp-preview]")
    ? root
    : document.getElementById("nodeTraceDisplaySettingsPopover");
  if (typeof syncNodeGraphStampShapeControls === "function") {
    syncNodeGraphStampShapeControls(host || root, settings);
  }
  if (!host?.querySelector?.("[data-stamp-preview-canvas]")) {
    return;
  }
  host._stampPreviewSettings = settings || {};
  const paint = () => paintNodeGraphStampPreview(host, host._stampPreviewSettings || {});
  const shell = host.querySelector("[data-stamp-preview]");
  if (typeof ResizeObserver === "function" && shell && host._stampPreviewResizeTarget !== shell) {
    host._stampPreviewResize?.disconnect?.();
    host._stampPreviewResize = new ResizeObserver(() => {
      paint();
    });
    host._stampPreviewResize.observe(shell);
    host._stampPreviewResizeTarget = shell;
  }
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(paint);
  } else {
    paint();
  }
}

/** @deprecated Use syncNodeGraphStampPreview. */
function syncNodeGraphInstantTracePreview(root, settings) {
  return syncNodeGraphStampPreview(root, settings);
}

function nodeGraphDisplaySettingsPushBackgroundHueRow(rows, type) {
  rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
    title: "Background",
    stepField: "backgroundBrightness",
    colorField: "backgroundColor",
    formType: type,
    defaultHueHex: typeof nodeGraphHueUnitHex === "function"
      ? nodeGraphHueUnitHex(0)
      : "#ff0000",
    titleAttr: "Plate brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.",
  }));
}

function buildNodeGraphInstantTraceDisplaySettingsBodyHtml(type, node, allowKey) {
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", type);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", type);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", type);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", type);
  const isStereoTraceNode = typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
    ? nodeGraphModuleUsesStereoTraceDisplay(node?.type)
    : node?.type === "output";
  const isXyzTraceNode = typeof nodeGraphModuleUsesXyzTraceDisplay === "function"
    ? nodeGraphModuleUsesXyzTraceDisplay(node?.type)
    : false;
  const allow = typeof allowKey === "function" ? allowKey : () => true;
  const fieldList = [...activeFields].filter((key) => allow("fields", key));
  const primaryOrder = typeof nodeGraphInstantTraceDisplayFieldOrder !== "undefined"
    ? nodeGraphInstantTraceDisplayFieldOrder
    : ["scale", "historySeconds", "zoomSeconds", "backgroundBrightness", "backgroundHue", "dot1Size", "lineThickness", "dot1Brightness", "dotBudget", "pixelDensity"];
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
  const inkColors = (isXyzTraceNode && type === "trace"
    ? ["dot1Color", "secondaryColor", "tertiaryColor"]
    : (isStereoTraceNode && type === "trace"
      ? ["dot1Color", "secondaryColor"]
      : ["dot1Color"])
  ).filter((key) => activeColors.has(key) && allow("colors", key));
  const parts = [];
  const rows = [];
  const xyzInk = isXyzTraceNode && type === "trace";
  const rgbInk = type === "traceRgb";
  const stereoInk = isStereoTraceNode && type === "trace" && !xyzInk;
  const inkHueTitle = type === "scope2dTrace";
  // Preview sits after Bright when present (RGB); otherwise after Size.
  const previewAfter = orderedPrimary.includes("dot1Brightness")
    ? "dot1Brightness"
    : "dot1Size";
  let previewPlaced = false;
  const pushPreview = () => {
    if (previewPlaced) {
      return;
    }
    rows.push(nodeGraphStampPreviewHtml(stereoInk, type, xyzInk, rgbInk));
    previewPlaced = true;
  };
  const usedChoices = new Set();
  const usedToggles = new Set();
  if (toggleKeys.includes("skipDiscontinuities")) {
    rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml("skipDiscontinuities"));
    usedToggles.add("skipDiscontinuities");
  }
  if (stereoInk && choiceKeys.includes("syncChannel")) {
    rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml("syncChannel"));
    usedChoices.add("syncChannel");
  } else if (toggleKeys.includes("sourceSync")) {
    rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml("sourceSync"));
    usedToggles.add("sourceSync");
  }
  const stackHead = new Set([
    "scale",
    "historySeconds",
    "zoomSeconds",
    "backgroundBrightness",
    "backgroundHue",
  ]);
  const pushStackField = (key) => {
    if (!orderedPrimary.includes(key)) {
      return;
    }
    if (key === "zoomSeconds" && orderedPrimary.includes("historySeconds")) {
      return;
    }
    rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
  };
  pushStackField("scale");
  if (choiceKeys.includes("stereoBlend")) {
    rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml("stereoBlend"));
    usedChoices.add("stereoBlend");
  }
  pushStackField("historySeconds");
  pushStackField("zoomSeconds");
  pushStackField("backgroundBrightness");
  pushStackField("backgroundHue");
  const inkPrimary = orderedPrimary.filter((key) => !stackHead.has(key));
  if (stereoInk) {
    rows.push(`
      <div class="metadata-section-title node-trace-display-dot1-title node-trace-display-stereo-title">
        <button type="button" id="nodeTraceDisplaySwapStereoLook" class="node-trace-display-swap-lr">Swap L/R</button>
        <span id="nodeTraceDisplayDot1TitleLabel" class="node-trace-display-lr-pair node-trace-display-lr-heads">
          <span class="node-trace-display-lr-col-head">L</span>
          <span class="node-trace-display-lr-col-head">R</span>
        </span>
      </div>`);
  }

  const pairedSecondary = new Set();
  for (const key of inkPrimary) {
    const rightKey = stereoInk ? nodeGraphDisplaySettingsStereoPairKey(key) : "";
    if (rightKey && orderedSecondary.includes(rightKey)) {
      rows.push(nodeGraphDisplaySettingsBuildStereoPairRowHtml(key, rightKey, type));
      pairedSecondary.add(rightKey);
    } else if (inkHueTitle && key === "dot1Brightness") {
      rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
        title: "Trace",
        stepField: "dot1Brightness",
        colorField: "dot1Color",
        formType: type,
        defaultHueHex: typeof nodeGraphHueUnitHex === "function"
          ? nodeGraphHueUnitHex(
            typeof nodeGraphHueDegFromHex === "function"
              && typeof nodeGraphScopePhosphorLookDefaults !== "undefined"
              ? nodeGraphHueDegFromHex(nodeGraphScopePhosphorLookDefaults.peakColor)
              : 60,
          )
          : "#fcfdbf",
        titleAttr: "Beam brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.",
      }));
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
    if (usedChoices.has(key)) {
      continue;
    }
    rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml(key));
  }
  for (const key of toggleKeys) {
    if (key === "secondaryEnabled" || usedToggles.has(key)) {
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
      rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
    }
  }
  const stereoColorPair = stereoInk
    && inkColors.includes("dot1Color")
    && inkColors.includes("secondaryColor");
  const xyzColorTriple = xyzInk
    && inkColors.includes("dot1Color")
    && inkColors.includes("secondaryColor")
    && inkColors.includes("tertiaryColor");
  if (xyzColorTriple) {
    rows.push(`
      <div class="node-trace-display-lr-row node-trace-display-lr-color-row" data-trace-display-lr-row>
        <div class="node-trace-display-lr-pair is-xyz">
          ${nodeGraphDisplaySettingsBuildColorRowHtml("dot1Color", type, { xyz: true })}
          ${nodeGraphDisplaySettingsBuildColorRowHtml("secondaryColor", type, { xyz: true })}
          ${nodeGraphDisplaySettingsBuildColorRowHtml("tertiaryColor", type, { xyz: true })}
        </div>
      </div>`);
  } else if (stereoColorPair) {
    rows.push(`
      <div class="node-trace-display-lr-row node-trace-display-lr-color-row" data-trace-display-lr-row>
        <div class="node-trace-display-lr-pair">
          ${nodeGraphDisplaySettingsBuildColorRowHtml("dot1Color", type, { stereo: true })}
          ${nodeGraphDisplaySettingsBuildColorRowHtml("secondaryColor", type, { stereo: true })}
        </div>
      </div>`);
  }
  for (const key of inkColors) {
    if (xyzColorTriple && (key === "dot1Color" || key === "secondaryColor" || key === "tertiaryColor")) {
      continue;
    }
    if (stereoColorPair && (key === "dot1Color" || key === "secondaryColor")) {
      continue;
    }
    if (inkHueTitle && key === "dot1Color") {
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


function buildNodeGraphPhosphorDisplaySettingsBodyHtml(type, node, allowKey) {
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", type);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", type);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", type);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", type);
  const allow = typeof allowKey === "function" ? allowKey : () => true;
  const fieldList = [...activeFields].filter((key) => allow("fields", key));
  const toggleKeys = [...activeToggles].filter((key) => allow("toggles", key));
  const choiceKeys = [...activeChoices].filter((key) => allow("choices", key));
  const colorKeys = [...activeColors].filter((key) => allow("colors", key));
  const order = typeof nodeGraphPhosphorDisplayFieldOrder !== "undefined"
    ? nodeGraphPhosphorDisplayFieldOrder
    : (typeof nodeGraphDisplaySettingsSharedStackOrder !== "undefined"
      ? nodeGraphDisplaySettingsSharedStackOrder
      : fieldList);
  const ordered = order.filter((key) => fieldList.includes(key));
  const leftover = fieldList.filter((key) => !order.includes(key));
  const packingKeys = NODE_GRAPH_DISPLAY_PACKING_TOGGLE_KEYS.filter(
    (key) => toggleKeys.includes(key) && key !== "sourceSync",
  );
  const packingKeySet = new Set(packingKeys);
  const usedToggles = new Set();
  const usedChoices = new Set();
  const rows = [];
  let previewPlaced = false;
  const pushPreview = () => {
    if (previewPlaced) {
      return;
    }
    rows.push(nodeGraphStampPreviewHtml(false, type));
    previewPlaced = true;
  };
  if (toggleKeys.includes("skipDiscontinuities")) {
    rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml("skipDiscontinuities"));
    usedToggles.add("skipDiscontinuities");
  }
  if (toggleKeys.includes("sourceSync")) {
    rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml("sourceSync"));
    usedToggles.add("sourceSync");
  }
  for (const key of choiceKeys) {
    rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml(key));
    usedChoices.add(key);
  }
  for (const key of ordered) {
    rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
    if (key === "dot1Brightness") {
      pushPreview();
    }
  }
  if (!previewPlaced) {
    pushPreview();
  }
  for (const key of leftover) {
    rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
  }
  for (const key of toggleKeys) {
    if (usedToggles.has(key) || packingKeySet.has(key)) {
      continue;
    }
    rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml(key));
  }
  if (packingKeys.length) {
    rows.push(nodeGraphDisplaySettingsBuildPackingToggleRowHtml(packingKeys));
  }
  for (const key of colorKeys) {
    rows.push(nodeGraphDisplaySettingsBuildColorRowHtml(key, type));
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
  return `<div class="metadata-field-section node-trace-display-trace-section">${rows.join("")}</div>`;
}

function buildNodeGraphDisplaySettingsBodyHtml(formType, node = null) {
  const type = formType || "trace";
  if (type === "keypadFace" && typeof buildNodeGraphKeypadDisplaySettingsBodyHtml === "function") {
    return buildNodeGraphKeypadDisplaySettingsBodyHtml();
  }
  if (
    (type === "toggleButtonFace" || type === "momentaryButtonFace")
    && typeof buildNodeGraphPluginButtonDisplaySettingsBodyHtml === "function"
  ) {
    return buildNodeGraphPluginButtonDisplaySettingsBodyHtml();
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
  const isXyzTraceNode = typeof nodeGraphModuleUsesXyzTraceDisplay === "function"
    ? nodeGraphModuleUsesXyzTraceDisplay(node?.type)
    : false;
  const parts = [];

  // Filter keys that only apply on stereo Trace faces (Output / SoEmReverb / …).
  const allowKey = (kind, key) => {
    if (type !== "trace") {
      return true;
    }
    if (isXyzTraceNode) {
      if (
        key === "secondarySize"
        || key === "secondaryBrightness"
        || key === "secondaryLineThickness"
        || key === "secondaryEnabled"
        || key === "syncChannel"
        // Waterfall XYZ ignores Bright — hard ink only.
        || key === "dot1Brightness"
      ) {
        return false;
      }
      if (key === "sourceSync") {
        return true;
      }
      return true;
    }
    if (!isStereoTraceNode) {
      if (
        key === "secondarySize" ||
        key === "secondaryBrightness" ||
        key === "secondaryLineThickness" ||
        key === "secondaryEnabled" ||
        key === "secondaryColor" ||
        key === "tertiaryColor" ||
        key === "syncChannel" ||
        key === "stereoBlend"
      ) {
        return false;
      }
    } else if (key === "sourceSync") {
      // Stereo Trace uses syncChannel select, not the legacy Sync checkbox.
      return false;
    } else if (key === "tertiaryColor") {
      return false;
    }
    return true;
  };

  const isVectorTraceForm = typeof nodeGraphDisplaySettingsIsVectorTraceFormType === "function"
    && nodeGraphDisplaySettingsIsVectorTraceFormType(type);
  if (isVectorTraceForm) {
    return buildNodeGraphInstantTraceDisplaySettingsBodyHtml(type, node, allowKey);
  }
  if (
    typeof nodeGraphDisplaySettingsIsPhosphorFormType === "function"
    && nodeGraphDisplaySettingsIsPhosphorFormType(type)
  ) {
    return buildNodeGraphPhosphorDisplaySettingsBodyHtml(type, node, allowKey);
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
    if ((type === "roundShapeFace" || type === "basicShapeFace") && section === "dot1") {
      continue;
    }

    const sectionControls = nodeGraphTraceDisplaySectionControls[section];
    if (!sectionControls) {
      continue;
    }
    let fieldKeys = (sectionControls.fields || []).filter(
      (key) => activeFields.has(key) && allowKey("fields", key),
    );
    if ((type === "roundShapeFace" || type === "basicShapeFace") && section === "trace") {
      fieldKeys = [
        "lineThickness",
        "lineBrightness",
        "dotThickness",
        "dotBrightness",
        "backgroundBrightness",
        "lineBlur",
        "pixelDensity",
      ].filter((key) => activeFields.has(key) && allowKey("fields", key));
    }
    if (isVectorTraceForm && typeof nodeGraphDisplaySettingsOrderTraceInkFields === "function") {
      fieldKeys = nodeGraphDisplaySettingsOrderTraceInkFields(fieldKeys);
    }
    let colorKeys = (sectionControls.colors || []).filter(
      (key) => activeColors.has(key) && allowKey("colors", key),
    );
    if ((type === "roundShapeFace" || type === "basicShapeFace") || type === "vectorDot" || type === "pulseDot" || type === "lcdDot") {
      colorKeys = [];
    }
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
          "backgroundBrightness",
          "dot1Brightness",
          "unlitSegments",
          ...(nrNodeType === "helmholtzPitch" ? ["centsBand"] : []),
          "innerShadowDistance",
          "innerShadowSharpness",
          "innerShadowOffsetX",
          "innerShadowOffsetY",
        ].filter((key) => activeFields.has(key));
        choiceKeys = ["polarity"].filter((key) => activeChoices.has(key));
        colorKeys = [];
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
      if (type === "numberReadout" && key === "backgroundBrightness") {
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: "Background",
          stepField: "backgroundBrightness",
          colorField: "backgroundColor",
          formType: type,
          defaultHueHex: typeof nodeGraphHueUnitHex === "function"
            ? nodeGraphHueUnitHex(typeof nodeGraphValueLcdDefaultHueDeg === "number"
              ? nodeGraphValueLcdDefaultHueDeg
              : 82)
            : "#a2ff00",
          titleAttr: "LCD plate brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.",
        }));
        continue;
      }
      if (type === "numberReadout" && key === "dot1Brightness" && activeColors.has("dot1Color")) {
        const nrNodeType = typeof nodeGraphPatchNode === "function"
          && typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
          ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type
          : null;
        const lcdInk = nrNodeType === "valueLcd" || nrNodeType === "helmholtzPitch";
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: lcdInk ? "Foreground" : "LED",
          stepField: "dot1Brightness",
          colorField: "dot1Color",
          formType: type,
          defaultHueHex: lcdInk && typeof nodeGraphHueUnitHex === "function"
            ? nodeGraphHueUnitHex(typeof nodeGraphValueLcdDefaultHueDeg === "number"
              ? nodeGraphValueLcdDefaultHueDeg
              : 82)
            : undefined,
          titleAttr: lcdInk
            ? "LCD ink brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue."
            : undefined,
        }));
        continue;
      }
      if ((type === "vectorDot" || type === "pulseDot" || type === "lcdDot") && key === "backgroundBrightness") {
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: "BG",
          stepField: "backgroundBrightness",
          colorField: "backgroundColor",
          formType: type,
          defaultHueHex: typeof nodeGraphHueUnitHex === "function"
            ? nodeGraphHueUnitHex(type === "lcdDot"
              ? (typeof nodeGraphValueLcdDefaultHueDeg === "number" ? nodeGraphValueLcdDefaultHueDeg : 82)
              : 220)
            : (type === "lcdDot" ? "#a2ff00" : "#0055ff"),
          titleAttr: "Plate brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.",
        }));
        continue;
      }
      if ((type === "vectorDot" || type === "pulseDot" || type === "lcdDot") && key === "dot1Brightness") {
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: type === "lcdDot" ? "Ink" : "Dot",
          stepField: "dot1Brightness",
          colorField: "dot1Color",
          formType: type,
          defaultHueHex: typeof nodeGraphHueUnitHex === "function"
            ? nodeGraphHueUnitHex(type === "lcdDot"
              ? (typeof nodeGraphValueLcdDefaultHueDeg === "number" ? nodeGraphValueLcdDefaultHueDeg : 82)
              : 25)
            : (type === "lcdDot" ? "#a2ff00" : "#ff6a00"),
          titleAttr: type === "lcdDot"
            ? "LCD ink brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue."
            : "Dot brightness gain 0…1 (black → full hue at 0.5 → white). Signal energy scales this. Drag the title to change hue.",
        }));
        rows.push(nodeGraphStampPreviewHtml(false, type));
        continue;
      }
      if ((type === "roundShapeFace" || type === "basicShapeFace") && key === "lineBrightness") {
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: "Line",
          stepField: "lineBrightness",
          colorField: "strokeColor",
          formType: type,
          defaultHueHex: "#00ffd0",
          titleAttr: "Line brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.",
        }));
        continue;
      }
      if ((type === "roundShapeFace" || type === "basicShapeFace") && key === "dotBrightness") {
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: "Dot",
          stepField: "dotBrightness",
          colorField: "dotColor",
          formType: type,
          defaultHueHex: "#00ffd0",
          titleAttr: "Dot brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.",
        }));
        continue;
      }
      if ((type === "roundShapeFace" || type === "basicShapeFace") && key === "backgroundBrightness") {
        rows.push(nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
          title: "Background",
          stepField: "backgroundBrightness",
          colorField: "backgroundColor",
          formType: type,
          defaultHueHex: "#00aaff",
          titleAttr: "Background brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.",
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
      if (nrNodeType !== "valueLcd" && nrNodeType !== "helmholtzPitch") {
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

