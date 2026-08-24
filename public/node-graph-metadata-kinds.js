const nodeMetadataKindAliases = Object.freeze({
  bipolar: "decimal_bipolar",
  gain: "amplitude",
});

function populateNodeMetadataKindChoices() {
  const select = document.getElementById("metadataKindValue");
  if (select.options.length) {
    return;
  }
  for (const [kind, template] of Object.entries(nodeMetadataKindTemplates)) {
    const option = document.createElement("option");
    option.value = kind;
    option.textContent = template.label;
    select.append(option);
  }
}

function normalizeNodeMetadataKind(kind) {
  return nodeMetadataKindAliases[kind] || kind || "decimal";
}

function applyNodeMetadataKindTemplates(templates) {
  if (!templates || typeof templates !== "object") {
    return;
  }

  nodeMetadataKindTemplates = Object.freeze(Object.fromEntries(
    Object.entries(templates).map(([kind, template]) => [
      kind,
      normalizeNodeMetadataKindTemplate(template, kind),
    ]),
  ));
  const select = document.getElementById("metadataKindValue");
  if (select) {
    select.replaceChildren();
    populateNodeMetadataKindChoices();
  }
  if (typeof syncNodeMetadataScriptReference === "function") {
    syncNodeMetadataScriptReference();
  }
  if (nodeGraphMvp.metadataEditorTarget) {
    const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
    if (slider) {
      fillNodeMetadataPopover(slider);
    }
  }
}

async function loadNodeMetadataKindTemplates() {
  try {
    const response = await fetch("/api/node-metadata-kinds", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    if (payload?.ok === true) {
      applyNodeMetadataKindTemplates(payload.templates);
    }
  } catch (_error) {
    nodeMetadataKindTemplates = Object.freeze(Object.fromEntries(
      Object.entries(fallbackNodeMetadataKindTemplates).map(([kind, template]) => [
        kind,
        normalizeNodeMetadataKindTemplate(template, kind),
      ]),
    ));
  }
}

function syncNodeMetadataMidVisibility() {
  const label = document.getElementById("metadataMidLabel");
  const sensitivity = document.getElementById("metadataCurveSensitivityLabel");
  const hint = document.getElementById("metadataCurveSensitivityHint");
  const curve = document.getElementById("metadataSliderCurveValue");
  const checkbox = document.getElementById("metadataNonlinearSliderValue");
  const curveValue = curve
    ? (typeof normalizeNodeSliderCurve === "function"
      ? normalizeNodeSliderCurve(curve.value)
      : curve.value)
    : (checkbox?.checked ? "skew" : "linear");
  const nonlinear = curveValue !== "linear";
  // MID only for mid skew; SENSITIVITY for custom skew + edge skew.
  if (label) {
    label.hidden = typeof nodeSliderCurveUsesMid === "function"
      ? !nodeSliderCurveUsesMid(curveValue)
      : curveValue !== "skew";
  }
  if (sensitivity) {
    sensitivity.hidden = typeof nodeSliderCurveUsesSensitivity === "function"
      ? !nodeSliderCurveUsesSensitivity(curveValue)
      : (curveValue !== "edges" && curveValue !== "custom" && curveValue !== "bipolarRational");
  }
  if (hint) {
    // Custom = mid-style power from sens; edge = S-curve travel balance.
    hint.textContent = curveValue === "bipolarRational"
      ? "0 is linear | +1 fine near CENTER | −1 fine near EDGE"
      : curveValue === "edges"
      ? "0 is mild | +1 fine near EDGE | −1 fine near CENTER"
      : "0 is linear | +1 fine near MIN | −1 fine near MAX";
  }
  if (checkbox) {
    checkbox.checked = Boolean(nonlinear);
  }
}
