// Display Settings form HTML builders extracted from node-graph-module-scopes.js
// (Phase D). Load after scope-display-mode, before scopes.js.

function nodeGraphDisplaySettingsBuildStepperRowHtml(key, formType = null) {
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
  if (key === "dialSize" && formType === "knobFace") {
    label = "Size";
    title = "Dial ring size 0…1. 1 = fill available space. Only scales the arc — label and value stay put.";
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
    title = "Adds linear decay over Ghost, then freezes. 0 = pure Ghost; 0.5 = half linear / half Ghost; 0.75 = full linear; 1 = never decay pixels.";
  }
  if (formType === "numberReadout" && key === "burn") {
    label = "Burn";
    title = "Sticky residual floor 0…1. 0 = no pixels stick; 0.5 = once energy ≥ 0.5 the pixel freezes at that floor; 1 = all residual freezes. Off by default.";
  }
  if (formType === "numberReadout" && key === "unlitSegments") {
    label = "Ghost";
    title =
      "LCD Ghost: permanent dim all-8 segment plate 0…1. Soft fade from 0 (no hard pop). Not residual hang (LED Trail/Ghost).";
  }
  if (formType === "numberReadout" && key === "facePadding") {
    label = "Padding";
    title = "Linear 0…1 inset on each axis (half-width and half-height). 0 = digits hit the plate edge; 1 = one pin pixel of display (LED phosphor / LCD screen).";
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


function nodeGraphDisplaySettingsColorRowMeta(key, formType = null) {
  const base = nodeGraphDisplaySettingsColorMeta[key] || {
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
  }
  return {
    ...base,
    label: "",
    aria,
    sideLabel: false,
  };
}


function nodeGraphDisplaySettingsBuildColorRowHtml(key, formType = null) {
  const meta = nodeGraphDisplaySettingsColorRowMeta(key, formType);
  const idAttr = meta.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(meta.id)}"` : "";
  return `
    <div class="node-trace-display-color-widget-row no-side-label" data-trace-display-control-row data-trace-display-color-row="${key}">
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

  const sectionOrder = nodeGraphDisplaySettingsIsPhosphorFormType(type)
    ? nodeGraphPhosphorDisplaySettingsSectionOrder
    : nodeGraphDisplaySettingsSectionOrder;
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
    let colorKeys = (sectionControls.colors || []).filter(
      (key) => activeColors.has(key) && allowKey("colors", key),
    );
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
      if (nrNodeType === "valueLcd") {
        // Value LCD (vector): Foreground + Background, padding, Ghost plate, glass shadow — no residual hang.
        fieldKeys = [
          "decimals",
          "facePadding",
          "unlitSegments",
          "innerShadowDistance",
          "innerShadowSharpness",
          "innerShadowOffsetX",
          "innerShadowOffsetY",
        ].filter((key) => activeFields.has(key));
        colorKeys = ["dot1Color", "backgroundColor"]
          .filter((key) => activeColors.has(key));
        choiceKeys = [];
      } else {
        // Value LED: Decimals → Padding → Bright → Ghost → Trail → Burn (last) → blend → Background → Ghost Gradient.
        fieldKeys = ["decimals", "facePadding", "dot1Brightness", "ghost", "trail", "burn"]
          .filter((key) => activeFields.has(key));
        colorKeys = ["backgroundColor"]
          .filter((key) => activeColors.has(key));
        choiceKeys = ["lightBlend"]
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
      || (isPhosphorForm && (section === "trace" || section === "dot1"));
    if (skipSectionTitle) {
      // no title row
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
      parts.push(`
        <div class="metadata-section-title node-trace-display-dot1-title">
          <span id="nodeTraceDisplayDot1TitleLabel">${nodeGraphDisplaySettingsEscapeHtml(dotTitle)}</span>
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
    for (const key of choiceKeys) {
      rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml(key));
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

  // Knob image layers + rotate flags live only in Display Settings.
  if (type === "knobFace" && typeof buildNodeGraphKnobFaceLayersDisplaySettingsHtml === "function") {
    parts.push(buildNodeGraphKnobFaceLayersDisplaySettingsHtml());
  }

  return parts.join("\n");
}

