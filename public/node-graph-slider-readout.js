function syncNodeSliderPortalHandle(readout, slider, position, enabled) {
  readout.classList.toggle("wraparound-slider", enabled);
  if (!enabled) {
    readout.style.removeProperty("--portal-left-width");
    readout.style.removeProperty("--portal-right-width");
    return;
  }

  const width = nodeSliderElementLayoutWidth(readout);
  if (!Number.isFinite(width) || width <= 0) {
    readout.style.setProperty("--portal-left-width", "0px");
    readout.style.setProperty("--portal-right-width", "0px");
    return;
  }

  const boundedPosition = Math.max(0, Math.min(100, position));
  const center = (boundedPosition / 100) * width;
  const handleHalfWidth = nodeSliderHandleHalfWidthPx;
  const leftOverflow = Math.max(0, handleHalfWidth - center);
  const rightOverflow = Math.max(0, center + handleHalfWidth - width);
  readout.style.setProperty("--portal-left-width", `${rightOverflow}px`);
  readout.style.setProperty("--portal-right-width", `${leftOverflow}px`);
}

function nodeSliderChoiceDividerBackground(readout, choices) {
  const width = Math.floor(nodeSliderElementLayoutWidth(readout));
  const dividerColor = "rgba(243, 241, 236, 0.2)";
  const dividerLayers = Array.from({ length: Math.max(0, choices.length - 1) }, (_, index) => {
    if (!Number.isFinite(width) || width <= 0) {
      const position = ((index + 1) / choices.length) * 100;
      return `linear-gradient(90deg, transparent 0 calc(${position}% - 0.5px), ${dividerColor} calc(${position}% - 0.5px) calc(${position}% + 0.5px), transparent calc(${position}% + 0.5px) 100%)`;
    }
    const position = Math.round(((index + 1) / choices.length) * width);
    return `linear-gradient(90deg, transparent 0 ${position}px, ${dividerColor} ${position}px ${position + 1}px, transparent ${position + 1}px 100%)`;
  });
  return dividerLayers.join(", ") || "none";
}

function nodeSliderReadCssNumber(element, property, fallback, min = -Infinity, max = Infinity) {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(property));
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function nodeSliderChoiceCellRects(width, height, choices) {
  const layoutWidth = Number(width);
  const layoutHeight = Number(height);
  const count = choices.length;
  if (!count || !Number.isFinite(layoutWidth) || !Number.isFinite(layoutHeight) || layoutWidth <= 0 || layoutHeight <= 0) {
    return [];
  }

  return choices.map((_, index) => {
    const segmentLeft = index === 0 ? 0 : Math.round((index / count) * layoutWidth);
    const segmentRight = index === count - 1 ? layoutWidth : Math.round(((index + 1) / count) * layoutWidth);
    return {
      height: layoutHeight,
      left: segmentLeft,
      top: 0,
      width: Math.max(0, segmentRight - segmentLeft),
    };
  });
}

function nodeSliderChoiceCellRectsFromWalls(wallXs, height, viewportLeft, viewportTop, emptyPixelBorder = 0, visualScale = 1) {
  const boundedEmptyPixelBorder = Math.max(0, Math.min(8, Number(emptyPixelBorder) || 0));
  const bottomExtensionPx = 2;
  const strokeInset = 0.5;
  const trailingPixelCorrection = boundedEmptyPixelBorder > 0 ? 1 : 0;
  return wallXs.slice(0, -1).map((leftWall, index) => {
    const rightWall = wallXs[index + 1];
    const left = nodeSliderSnapStrokeCoordinate(
      leftWall + boundedEmptyPixelBorder + strokeInset,
      viewportLeft,
      1,
      visualScale,
    );
    const right = nodeSliderSnapStrokeCoordinate(
      rightWall - boundedEmptyPixelBorder - strokeInset - trailingPixelCorrection,
      viewportLeft,
      1,
      visualScale,
    );
    const top = nodeSliderSnapStrokeCoordinate(
      boundedEmptyPixelBorder + strokeInset,
      viewportTop,
      1,
      visualScale,
    );
    const bottom = nodeSliderSnapStrokeCoordinate(
      height - boundedEmptyPixelBorder - strokeInset - trailingPixelCorrection + bottomExtensionPx,
      viewportTop,
      1,
      visualScale,
    );
    return {
      height: Math.max(0, bottom - top),
      left,
      top,
      width: Math.max(0, right - left),
    };
  });
}

function nodeSliderChoiceSquareRects(width, height, choices) {
  return nodeSliderChoiceCellRects(width, height, choices);
}

function nodeSliderChoiceDividerLinesFromCells(cellRects) {
  if (cellRects.length <= 1) {
    return [];
  }
  return Array.from({ length: cellRects.length - 1 }, (_, index) => ({
    height: cellRects[index].height,
    top: cellRects[index].top,
    x: cellRects[index].left + cellRects[index].width,
  }));
}

function nodeSliderSelectedChoiceDividerLines(dividerLines, selectedIndex) {
  return dividerLines.filter((divider) => (
    divider.index === selectedIndex - 1 ||
    divider.index === selectedIndex
  ));
}

function nodeSliderChoiceDividerInset(readout) {
  return nodeSliderReadCssNumber(readout, "--node-choice-divider-padding", 3, 0, 16);
}

function nodeSliderSnapStrokeCoordinate(localPosition, viewportOrigin, strokeWidth = 1, visualScale = 1) {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(0.01, Number(visualScale) || 1);
  const strokeCenter = viewportOrigin + localPosition * scale;
  const offset = strokeWidth % 2 === 0 ? 0 : 0.5;
  const snappedStrokeCenter = (Math.round(strokeCenter * dpr - offset) + offset) / dpr;
  return (snappedStrokeCenter - viewportOrigin) / scale;
}

function nodeSliderSnapStrokeSpan(start, end, viewportOrigin, strokeWidth = 1, visualScale = 1) {
  const snappedStart = nodeSliderSnapStrokeCoordinate(start, viewportOrigin, strokeWidth, visualScale);
  const snappedEnd = nodeSliderSnapStrokeCoordinate(end, viewportOrigin, strokeWidth, visualScale);
  return {
    start: snappedStart,
    size: Math.max(0, snappedEnd - snappedStart),
  };
}

function syncNodeSliderChoiceDebugSquares(readout, choices, enabled, selectedIndex = 0) {
  let layer = readout.querySelector(".node-choice-debug-layer");
  if (!enabled) {
    layer?.remove();
    return;
  }
  if (!layer || layer.tagName.toLowerCase() !== "svg") {
    layer?.remove();
    layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    layer.setAttribute("class", "node-choice-debug-layer");
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("focusable", "false");
    readout.append(layer);
  }

  const layerRect = layer.getBoundingClientRect();
  const layerWidth = nodeSliderElementLayoutWidth(layer);
  const layerHeight = nodeSliderElementLayoutHeight(layer);
  const layerScale = nodeSliderElementVisualScale(layer);
  const emptyPixelBorder = nodeSliderReadCssNumber(readout, "--node-choice-slide-empty-border", 0, 0, 8);
  layer.setAttribute("viewBox", `0 0 ${layerWidth.toFixed(3)} ${layerHeight.toFixed(3)}`);
  layer.setAttribute("preserveAspectRatio", "none");
  const segmentRects = nodeSliderChoiceCellRects(layerWidth, layerHeight, choices);
  const dividerInset = nodeSliderChoiceDividerInset(readout);
  const dividerHeight = Math.max(0, layerHeight - dividerInset * 2);
  const dividerTop = dividerInset;
  const dividerLines = nodeSliderChoiceDividerLinesFromCells(segmentRects).map((divider, index) => ({
    ...divider,
    height: dividerHeight,
    index,
    top: dividerTop,
    x: nodeSliderSnapStrokeCoordinate(divider.x, layerRect.left, 1, layerScale),
  }));
  const cellWallXs = [
    0,
    ...dividerLines.map((divider) => divider.x),
    layerWidth,
  ];
  const engineSliderWallXs = [
    nodeSliderSnapStrokeCoordinate(0.5, layerRect.left, 1, layerScale),
    nodeSliderSnapStrokeCoordinate(Math.max(0.5, layerWidth - 0.5), layerRect.left, 1, layerScale),
  ];
  const cellRects = nodeSliderChoiceCellRectsFromWalls(
    cellWallXs,
    layerHeight,
    layerRect.left,
    layerRect.top,
    emptyPixelBorder,
    layerScale,
  );
  const activeChoiceIndex = Math.max(
    0,
    Math.min(cellRects.length - 1, Number.isFinite(selectedIndex) ? Math.round(selectedIndex) : 0),
  );
  const visibleDividerLines = nodeSliderSelectedChoiceDividerLines(dividerLines, activeChoiceIndex);
  const dividers = visibleDividerLines.map((divider) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "line");
    marker.setAttribute("class", "node-choice-debug-divider");
    marker.setAttribute("data-choice-divider-index", String(divider.index));
    marker.setAttribute("x1", divider.x.toFixed(3));
    marker.setAttribute("x2", divider.x.toFixed(3));
    marker.setAttribute("y1", divider.top.toFixed(3));
    marker.setAttribute("y2", (divider.top + divider.height).toFixed(3));
    return marker;
  });
  const debugWalls = cellWallXs.map((wallX, index) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "line");
    marker.setAttribute("class", "node-choice-debug-wall");
    marker.setAttribute("data-choice-wall-index", String(index));
    marker.setAttribute("x1", wallX.toFixed(3));
    marker.setAttribute("x2", wallX.toFixed(3));
    marker.setAttribute("y1", "0");
    marker.setAttribute("y2", layerHeight.toFixed(3));
    return marker;
  });
  const debugSliderWalls = engineSliderWallXs.map((wallX, index) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "line");
    marker.setAttribute("class", "node-choice-debug-slider-wall");
    marker.setAttribute("data-choice-slider-wall-index", String(index));
    marker.setAttribute("x1", wallX.toFixed(3));
    marker.setAttribute("x2", wallX.toFixed(3));
    marker.setAttribute("y1", "0");
    marker.setAttribute("y2", layerHeight.toFixed(3));
    return marker;
  });
  const selectedCellRects = cellRects
    .map((cell, index) => ({ cell, index }))
    .filter(({ index }) => index === activeChoiceIndex);
  const debugCellStrokes = cellRects.map((cell, index) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    marker.setAttribute("class", "node-choice-debug-cell-debug");
    marker.setAttribute("data-choice-index", String(index));
    marker.setAttribute("x", cell.left.toFixed(3));
    marker.setAttribute("y", cell.top.toFixed(3));
    marker.setAttribute("width", cell.width.toFixed(3));
    marker.setAttribute("height", cell.height.toFixed(3));
    return marker;
  });
  const cells = selectedCellRects.map(({ cell, index }) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    marker.setAttribute("class", "node-choice-debug-square node-choice-debug-cell node-choice-debug-cell-fill");
    marker.setAttribute("data-choice-index", String(index));
    marker.setAttribute("x", cell.left.toFixed(3));
    marker.setAttribute("y", cell.top.toFixed(3));
    marker.setAttribute("width", cell.width.toFixed(3));
    marker.setAttribute("height", cell.height.toFixed(3));
    return marker;
  });
  const cellStrokes = selectedCellRects.map(({ cell, index }) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const right = cell.left + cell.width;
    const bottom = cell.top + cell.height;
    marker.setAttribute("class", "node-choice-debug-square node-choice-debug-cell node-choice-debug-cell-stroke");
    marker.setAttribute("data-choice-index", String(index));
    marker.setAttribute(
      "d",
      [
        `M ${cell.left.toFixed(3)} ${cell.top.toFixed(3)}`,
        `H ${right.toFixed(3)}`,
        `V ${bottom.toFixed(3)}`,
        `H ${cell.left.toFixed(3)}`,
        "Z",
      ].join(" "),
    );
    return marker;
  });
  layer.replaceChildren(
    ...cells,
    ...dividers,
    ...cellStrokes,
    ...debugCellStrokes,
    ...debugWalls,
    ...debugSliderWalls,
  );
}

function syncNodeGraphSliderReadouts() {
  for (const slider of document.querySelectorAll(".dsp-node input[data-param]")) {
    syncNodeSliderReadout(slider);
  }
  if (typeof syncNodeGraphGhostSliders === "function") {
    syncNodeGraphGhostSliders();
  }
}

function scheduleNodeGraphSliderReadoutRelayout() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return;
  }
  if (scheduleNodeGraphSliderReadoutRelayout._frame) {
    return;
  }
  scheduleNodeGraphSliderReadoutRelayout._frame = window.requestAnimationFrame(() => {
    scheduleNodeGraphSliderReadoutRelayout._frame = window.requestAnimationFrame(() => {
      scheduleNodeGraphSliderReadoutRelayout._frame = 0;
      syncNodeGraphSliderReadouts();
    });
  });
}

// Knob face live sync: modules/knob/knob-face.js
// (syncNodeGraphKnobFaceFromSlider).

function syncNodeSliderReadout(slider) {
  if (typeof syncNodeGraphKnobFaceFromSlider === "function") {
    syncNodeGraphKnobFaceFromSlider(slider);
  }
  const readout = slider.closest("label")?.querySelector(".node-slider-readout");
  if (!readout) {
    return;
  }

  if (!readout.querySelector(".node-slider-readout-value")) {
    readout.textContent = "";
    populateNodeSliderReadoutShell(readout);
  }
  const labelText = readout.querySelector(".node-slider-readout-label");
  const valueText = readout.querySelector(".node-slider-readout-value");
  const unitText = readout.querySelector(".node-slider-readout-unit");
  // Prefer unbounded domain value (typed Amplitude etc.); thumb may be clamped.
  const domainRaw = Number(slider.dataset?.domainValue);
  const displayValue = Number.isFinite(domainRaw) ? domainRaw : Number(slider.value);
  const position = nodeSliderTravelFromValue(slider, displayValue) * 100;
  let unit = (slider.dataset.unit || "").trim();
  let formattedValue = displayValue;
  let formattedKind = slider.dataset.kind;
  let formattedMaxDigits = slider.dataset.maxDigits;
  const choiceLabel = nodeSliderChoiceLabel(slider);
  if (!choiceLabel && typeof slider.displayTransform === "function") {
    let transformed = null;
    try {
      transformed = slider.displayTransform(displayValue, slider);
    } catch (error) {
      transformed = null;
    }
    if (transformed && typeof transformed === "object") {
      if (Number.isFinite(Number(transformed.value))) {
        formattedValue = Number(transformed.value);
        formattedKind = "";
      }
      if (typeof transformed.unit === "string") {
        unit = transformed.unit;
      }
      if (transformed.maxDigits != null) {
        formattedMaxDigits = transformed.maxDigits;
      }
    } else if (Number.isFinite(Number(transformed))) {
      formattedValue = Number(transformed);
      formattedKind = "";
    }
  }
  const choices = parseNodeMetadataChoices(slider.dataset.choices || "");
  const usesChoices = nodeSliderShouldDisplayChoices(slider) && choices.length > 0;
  const dividesChoices = usesChoices && nodeSliderShouldDivideChoicesVisibly(slider);
  const usesNumericReadout = !choiceLabel;
  const usesPortalWrap = nodeSliderShouldWraparound(slider) && !usesChoices;
  if (labelText) {
    // Prefer live control/alias (nodeSliderLabelText) over a stale
    // readout.dataset.paramLabel left over from factory create ("→").
    const displayLabel = nodeSliderLabelText(slider);
    if (displayLabel) {
      readout.dataset.paramLabel = displayLabel;
    }
    labelText.textContent = displayLabel || readout.dataset.paramLabel || "";
  }
  valueText.textContent = choiceLabel ? ` ${choiceLabel}` : formatNodeSliderNumber(formattedValue, {
    kind: formattedKind,
    maxDigits: formattedMaxDigits,
    reserveSignSpace: true,
    showSign: nodeSliderShouldShowSign(slider),
    removeTrailingZeros: slider.dataset.removeTrailingZeros === "true",
  });
  unitText.textContent = unit;
  unitText.classList.toggle("is-empty", !unit);
  unitText.setAttribute("aria-hidden", unit ? "false" : "true");
  readout.dataset.value = String(displayValue);
  readout.dataset.unit = unit;
  readout.dataset.choiceCount = usesChoices ? String(choices.length) : "0";
  readout.classList.toggle("choices-divided", dividesChoices);
  readout.classList.toggle("reserves-sign-column", usesNumericReadout || usesChoices);
  readout.removeAttribute("title");
  if (dividesChoices) {
    readout.style.removeProperty("--amount-start");
    readout.style.removeProperty("--amount-end");
    readout.style.removeProperty("--value-start");
    readout.style.removeProperty("--value-end");
    readout.classList.remove("is-bipolar");
    readout.style.setProperty("--choice-divider-background", "none");
    syncNodeSliderChoiceDebugSquares(readout, choices, true, Number(slider.value));
    syncNodeSliderPortalHandle(readout, slider, position, false);
  } else {
    const travel = Math.max(0, Math.min(1, position / 100));
    const range = nodeSliderHandleRangeFromTravel(slider, readout, travel);
    // Amount fill must NOT sit under the translucent handle. Overlap stacks
    // amount color + handle alpha and reads as a second rectangle / split thumb.
    // Unipolar: fill 0 → handle LEFT edge. Bipolar: mid → nearer handle edge.
    const bipolar = slider.dataset.bipolar === "true";
    readout.classList.toggle("is-bipolar", bipolar);
    if (bipolar) {
      const midValue = Number(slider.dataset.mid);
      const midTravel = nodeSliderTravelFromValue(
        slider,
        Number.isFinite(midValue) ? midValue : 0,
      );
      const midRange = nodeSliderHandleRangeFromTravel(slider, readout, midTravel);
      const mid = midRange.center;
      let fillLeft;
      let fillRight;
      if (range.center >= mid) {
        // Value right of mid: fill mid → handle left (no overlap under thumb).
        fillLeft = mid;
        fillRight = range.start;
      } else {
        // Value left of mid: fill handle right → mid.
        fillLeft = range.end;
        fillRight = mid;
      }
      if (fillRight < fillLeft) {
        const t = fillLeft;
        fillLeft = fillRight;
        fillRight = t;
      }
      readout.style.setProperty("--amount-start", `${fillLeft}px`);
      readout.style.setProperty("--amount-end", `${fillRight}px`);
    } else {
      readout.style.setProperty("--amount-start", "0px");
      // Stop at handle left edge so thumb is pure position color over track bg.
      readout.style.setProperty("--amount-end", `${range.start}px`);
    }
    readout.style.setProperty(
      "--value-start",
      `${range.start}px`,
    );
    readout.style.setProperty(
      "--value-end",
      `${range.end}px`,
    );
    readout.style.setProperty("--choice-divider-background", "none");
    syncNodeSliderChoiceDebugSquares(readout, choices, false);
    syncNodeSliderPortalHandle(readout, slider, position, usesPortalWrap);
  }
  syncNodeSliderMetadataTooltip(slider);
}

function nodeSliderLabelText(slider) {
  // Explicit metadata alias (Bias → "Cutoff", etc.)
  const alias = typeof normalizeNodeGraphPatchMetadataAlias === "function"
    ? normalizeNodeGraphPatchMetadataAlias(slider?.dataset?.alias)
    : String(slider?.dataset?.alias || "").trim();
  if (alias) {
    return alias;
  }
  const control = slider?.closest?.(".node-parameter-control");
  const controlLabel = control?.dataset?.paramLabel?.trim();
  if (controlLabel) {
    return controlLabel;
  }
  const defaultLabel = control?.dataset?.defaultParamLabel?.trim();
  if (defaultLabel) {
    return defaultLabel;
  }
  const label = slider?.closest?.("label");
  if (!label) {
    return "";
  }
  if (Object.hasOwn(label.dataset, "paramLabel")) {
    return String(label.dataset.paramLabel || "").trim();
  }
  for (const node of label.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function nodeSliderDebugPath(slider) {
  const node = slider.closest(".dsp-node");
  const nodeName = node ? nodeGraphNodeDisplayName(node.dataset.node) : "Node";
  return `${nodeName} : ${nodeSliderLabelText(slider)} : Metadata`;
}
