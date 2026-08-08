// Display Settings form HTML builders extracted from node-graph-module-scopes.js
// (Phase D). Load after scope-display-mode, before scopes.js.

function nodeGraphDisplaySettingsBuildStepperRowHtml(key, formType = null) {
  const meta = nodeGraphDisplaySettingsFieldMeta[key] || { label: key, inputmode: "decimal" };
  let label = meta.label;
  let title = meta.title;
  // Knob display settings: explicit "Num decimals" for the face readout.
  if (key === "decimals" && formType === "knobFace") {
    label = "Num decimals";
    title = "Digits after the decimal on the Knob face readout (0–8).";
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

/** Packing toggles share one horizontal row on 2D Phosphor (Full Dot Economy | Dots only). */
const NODE_GRAPH_DISPLAY_PACKING_TOGGLE_KEYS = Object.freeze(["fullDotEconomy", "dotsOnly"]);

function nodeGraphDisplaySettingsBuildPackingToggleRowHtml(keys) {
  const labels = keys.map((key) => {
    const meta = nodeGraphDisplaySettingsToggleMeta[key] || { label: key };
    const idAttr = meta.id ? ` id="${nodeGraphDisplaySettingsEscapeHtml(meta.id)}"` : "";
    const titleAttr = meta.title
      ? ` title="${nodeGraphDisplaySettingsEscapeHtml(meta.title)}"`
      : "";
    return `
    <label class="metadata-checkbox-label node-trace-display-packing-toggle"${titleAttr}>
      <input type="checkbox" data-trace-display-toggle="${key}"${idAttr}${titleAttr}>
      ${nodeGraphDisplaySettingsEscapeHtml(meta.label)}
    </label>`;
  }).join("");
  return `<div class="node-trace-display-packing-toggles" data-trace-display-control-row>${labels}</div>`;
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
  if (formType === "numberReadout" && key === "ghostColor") {
    aria = "LCD ghost segment color";
  } else if (formType === "numberReadout" && key === "backgroundColor") {
    aria = "LCD back plate color";
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
      parts.push(`<div class="metadata-section-title node-trace-display-gradient-title">Gradient</div>`);
      // Single host for NodeGraphGradientSelector (all faces share this control).
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

    const sectionControls = nodeGraphTraceDisplaySectionControls[section];
    if (!sectionControls) {
      continue;
    }
    const fieldKeys = (sectionControls.fields || []).filter(
      (key) => activeFields.has(key) && allowKey("fields", key),
    );
    const colorKeys = (sectionControls.colors || []).filter(
      (key) => activeColors.has(key) && allowKey("colors", key),
    );
    const toggleKeys = (sectionControls.toggles || []).filter(
      (key) => activeToggles.has(key) && allowKey("toggles", key),
    );
    const choiceKeys = (sectionControls.choices || []).filter(
      (key) => activeChoices.has(key) && allowKey("choices", key),
    );
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
    if (section === "secondary") {
      const enabledToggle = isStereoTraceNode && type === "trace" && activeToggles.has("secondaryEnabled")
        ? `<input id="nodeTraceDisplaySecondaryEnabled" type="checkbox" aria-label="${isStereoTraceNode ? "Right on" : "Secondary on"}" data-trace-display-toggle="secondaryEnabled">`
        : "";
      parts.push(`
        <div class="metadata-section-title node-trace-display-secondary-title">
          <span id="nodeTraceDisplaySecondaryTitleLabel">${nodeGraphDisplaySettingsEscapeHtml(titleText)}</span>
          ${enabledToggle}
        </div>`);
    } else if (section === "dot1") {
      // Phosphor faces: stamp geometry/light (not a second "Dot" copy of Brightness/Blur).
      const phosphorStamp =
        type === "scope2d"
        || type === "scope2dTrace"
        || type === "phosphorLight"
        || type === "lineBurn"
        || type === "dot"
        || type === "value"
        || type === "videoscopeBurn"
        || type === "oscilloscopeBankBurn"
        || type === "hypersawBurn"
        || type === "xyPad";
      const dotTitle = type === "xyPad"
        ? "Beam & puck"
        : phosphorStamp
          ? "Stamp"
          : titleText;
      parts.push(`
        <div class="metadata-section-title node-trace-display-dot1-title">
          <span id="nodeTraceDisplayDot1TitleLabel">${nodeGraphDisplaySettingsEscapeHtml(dotTitle)}</span>
        </div>`);
    } else {
      parts.push(`<div class="metadata-section-title node-trace-display-${section}-title">${nodeGraphDisplaySettingsEscapeHtml(titleText)}</div>`);
    }

    const rows = [];
    // Preferred order: choices (sync), toggles, fields, colors — matches prior UX.
    for (const key of choiceKeys) {
      rows.push(nodeGraphDisplaySettingsBuildChoiceRowHtml(key));
    }
    // Group Full Dot Economy + Dots only on one horizontal row when both present.
    const packingKeys = NODE_GRAPH_DISPLAY_PACKING_TOGGLE_KEYS.filter((key) => toggleKeys.includes(key));
    const packingKeySet = new Set(packingKeys);
    let packingRowEmitted = false;
    for (const key of toggleKeys) {
      if (section === "secondary" && key === "secondaryEnabled") {
        continue; // already in title
      }
      if (packingKeySet.has(key)) {
        if (!packingRowEmitted && packingKeys.length) {
          rows.push(nodeGraphDisplaySettingsBuildPackingToggleRowHtml(packingKeys));
          packingRowEmitted = true;
        }
        continue;
      }
      rows.push(nodeGraphDisplaySettingsBuildToggleRowHtml(key));
    }
    for (const key of fieldKeys) {
      rows.push(nodeGraphDisplaySettingsBuildStepperRowHtml(key, type));
    }
    for (const key of colorKeys) {
      rows.push(nodeGraphDisplaySettingsBuildColorRowHtml(key, type));
    }
    parts.push(`<div class="metadata-field-section node-trace-display-${section}-section">${rows.join("")}</div>`);
  }

  return parts.join("\n");
}

