function populateNodeSliderReadoutShell(readout) {
  const amountFill = document.createElement("span");
  amountFill.className = "node-slider-amount-fill";
  amountFill.setAttribute("aria-hidden", "true");
  const portalLeft = document.createElement("span");
  portalLeft.className = "node-slider-readout-portal node-slider-readout-portal-left";
  portalLeft.setAttribute("aria-hidden", "true");
  const portalRight = document.createElement("span");
  portalRight.className = "node-slider-readout-portal node-slider-readout-portal-right";
  portalRight.setAttribute("aria-hidden", "true");
  const labelText = document.createElement("span");
  labelText.className = "node-slider-readout-label";
  const valueText = document.createElement("span");
  valueText.className = "node-slider-readout-value";
  const unitText = document.createElement("span");
  unitText.className = "node-slider-readout-unit";
  readout.append(amountFill, portalLeft, portalRight, labelText, valueText, unitText);
}

function commitNodeSliderReadoutEdit(input) {
  if (input.dataset.editCanceled === "true" || input.dataset.editCommitted === "true") {
    return;
  }
  input.dataset.editCommitted = "true";
  const slider = document.getElementById(input.dataset.sliderTarget);
  updateNodeSliderCurrentValue(slider, input.value);
  const readout = document.createElement("button");
  readout.type = "button";
  readout.className = "node-slider-readout";
  readout.dataset.sliderTarget = input.dataset.sliderTarget;
  readout.dataset.paramLabel = input.dataset.paramLabel || "";
  readout.dataset.control = slider?.dataset?.control || "";
  readout.classList.toggle("number-only", slider?.dataset?.control === "number");
  readout.setAttribute("aria-label", input.getAttribute("aria-label"));
  populateNodeSliderReadoutShell(readout);
  input.replaceWith(readout);
  attachNodeSliderReadoutEvents(readout);
  syncNodeSliderReadout(slider);
}

function cancelNodeSliderReadoutEdit(input) {
  if (input.dataset.editCommitted === "true" || input.dataset.editCanceled === "true") {
    return;
  }
  input.dataset.editCanceled = "true";
  const slider = document.getElementById(input.dataset.sliderTarget);
  const readout = document.createElement("button");
  readout.type = "button";
  readout.className = "node-slider-readout";
  readout.dataset.sliderTarget = input.dataset.sliderTarget;
  readout.dataset.paramLabel = input.dataset.paramLabel || "";
  readout.dataset.control = slider?.dataset?.control || "";
  readout.classList.toggle("number-only", slider?.dataset?.control === "number");
  readout.setAttribute("aria-label", input.getAttribute("aria-label"));
  populateNodeSliderReadoutShell(readout);
  input.replaceWith(readout);
  attachNodeSliderReadoutEvents(readout);
  syncNodeSliderReadout(slider);
}

function beginNodeSliderReadoutEdit(readout) {
  const slider = document.getElementById(readout.dataset.sliderTarget);
  if (!slider) {
    return;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "node-slider-readout-input";
  input.inputMode = "text";
  // Prefer domainValue (may exceed HTML thumb min/max); slider.value is clamped.
  const domainRaw = Number(slider.dataset?.domainValue);
  const editValue = Number.isFinite(domainRaw) ? domainRaw : Number(slider.value);
  input.value = nodeSliderChoiceLabel(slider) ?? formatNodeSliderNumber(editValue, {
    kind: slider.dataset.kind,
    maxDigits: slider.dataset.maxDigits,
    reserveSignSpace: true,
    showSign: nodeSliderShouldShowSign(slider),
  });
  input.dataset.sliderTarget = slider.id;
  input.dataset.paramLabel = readout.dataset.paramLabel || "";
  input.setAttribute("aria-label", readout.getAttribute("aria-label"));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commitNodeSliderReadoutEdit(input);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelNodeSliderReadoutEdit(input);
    }
  });
  input.addEventListener("blur", () => {
    if (input.dataset.editCanceled !== "true") {
      commitNodeSliderReadoutEdit(input);
    }
  });
  // Single-click anywhere outside the input commits and closes the edit.
  // Blur alone doesn't cover this: workspace pointerdown handlers call
  // preventDefault (pan/marquee/slider-drag), which suppresses the focus
  // change so the input never blurs. Capture-phase document listener sees
  // the pointerdown regardless; it self-removes once the edit is over.
  const closeOnOutsidePointerDown = (event) => {
    if (
      !document.contains(input) ||
      input.dataset.editCommitted === "true" ||
      input.dataset.editCanceled === "true"
    ) {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      return;
    }
    if (event.target === input) {
      return;
    }
    document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
    commitNodeSliderReadoutEdit(input);
  };
  document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
  readout.replaceWith(input);
  input.focus();
  input.select();
}

function nodeSliderReadoutIsNumberOnly(readout) {
  const slider = document.getElementById(readout?.dataset?.sliderTarget);
  return slider?.dataset?.control === "number";
}

function stopNodeSliderReadoutPointer(event) {
  event.preventDefault();
  event.stopPropagation();
}

function attachNodeSliderReadoutEvents(readout) {
  readout.addEventListener("dblclick", () => beginNodeSliderReadoutEdit(readout));
  readout.addEventListener("contextmenu", (event) => openNodeMetadataPopover(event, readout));
  if (nodeSliderReadoutIsNumberOnly(readout)) {
    readout.addEventListener("pointerdown", stopNodeSliderReadoutPointer);
    readout.addEventListener("mousedown", stopNodeSliderReadoutPointer);
    return;
  }
  readout.addEventListener("pointerdown", beginNodeSliderDrag);
  readout.addEventListener("lostpointercapture", endNodeSliderDrag);
  readout.addEventListener("mousedown", beginNodeSliderDrag);
  readout.addEventListener("keydown", stepNodeSliderFromKeyboard);
}

function createNodeSliderReadout(slider) {
  const label = slider.closest("label");
  if (!label || label.querySelector(".node-slider-readout, .node-slider-readout-input")) {
    return;
  }

  slider.dataset.mid ||= String((Number(slider.min) + Number(slider.max)) / 2);
  slider.dataset.default ||= slider.value;
  slider.dataset.step ||= slider.step || "any";
  slider.step = "any";
  slider.dataset.kind ||= "decimal";
  slider.dataset.maxDigits ||= String(nodeGraphDefaultMetadataMaxDigits(slider.dataset.kind));
  slider.dataset.unit ??= "";
  slider.dataset.choices ??= "";
  slider.dataset.displayChoices ??= "false";
  slider.dataset.divideChoicesVisibly ??= "false";
  slider.dataset.linearSmoothing ??= "true";
  slider.dataset.showSign ??= "false";
  slider.dataset.wraparound ??= "false";

  const readout = document.createElement("button");
  readout.type = "button";
  readout.className = "node-slider-readout";
  readout.dataset.sliderTarget = slider.id;
  readout.dataset.paramLabel = label.dataset.paramLabel || nodeSliderLabelText(slider);
  readout.dataset.control = slider.dataset.control || "";
  readout.classList.toggle("number-only", slider.dataset.control === "number");
  readout.setAttribute("aria-label", `${slider.id} current value`);
  populateNodeSliderReadoutShell(readout);
  attachNodeSliderReadoutEvents(readout);
  label.append(readout);
  syncNodeSliderReadout(slider);
}
