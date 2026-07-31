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

function nodeSliderChoiceDividerHeight(readout, layerHeight) {
  const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
  const heightAtOneToOne = nodeSliderReadCssNumber(readout, "--node-choice-divider-height", 35, 0, 35);
  return Math.max(0, Math.min(layerHeight, heightAtOneToOne / zoom));
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
  const dividerHeight = nodeSliderChoiceDividerHeight(readout, layerHeight);
  const dividerTop = (layerHeight - dividerHeight) * 0.5;
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

/** LayoutB Value Slider face mirrors the Bias param. */
function syncNodeGraphValueSliderFaceFromSlider(slider) {
  if (!slider || slider.dataset.param !== "offset") {
    return;
  }
  const module = slider.closest?.(".dsp-node");
  if (!module || module.dataset.nodeType !== "valueSlider") {
    return;
  }
  const faceReadout = module.querySelector("[data-value-slider-face-readout]");
  if (!faceReadout) {
    return;
  }
  const displayValue = Number.isFinite(Number(slider.dataset.unboundedValue))
    ? Number(slider.dataset.unboundedValue)
    : Number(slider.value);
  faceReadout.textContent = typeof formatNodeSliderNumber === "function"
    ? formatNodeSliderNumber(displayValue, {
      kind: slider.dataset.kind,
      maxDigits: slider.dataset.maxDigits,
      reserveSignSpace: true,
      showSign: typeof nodeSliderShouldShowSign === "function"
        ? nodeSliderShouldShowSign(slider)
        : true,
    }).trim()
    : String(displayValue);
}

function syncNodeSliderReadout(slider) {
  syncNodeGraphValueSliderFaceFromSlider(slider);
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
  const displayValue = Number.isFinite(Number(slider.dataset.unboundedValue))
    ? Number(slider.dataset.unboundedValue)
    : Number(slider.value);
  const position = nodeSliderTravelFromValue(slider, Number(slider.value)) * 100;
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
    labelText.textContent = readout.dataset.paramLabel || nodeSliderLabelText(slider);
  }
  valueText.textContent = choiceLabel ? ` ${choiceLabel}` : formatNodeSliderNumber(formattedValue, {
    kind: formattedKind,
    maxDigits: formattedMaxDigits,
    reserveSignSpace: true,
    showSign: nodeSliderShouldShowSign(slider),
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
    // Amount fill ends at the handle's RIGHT edge, not its centre. The handle
    // centre stops half a handle short of the track end even at full travel,
    // so a centre-anchored fill never reached the right edge -- and because
    // the handle itself is translucent you saw the fill edge through it as a
    // second, offset edge. range.end lines the fill up with the handle edge.
    const bipolar = slider.dataset.bipolar === "true";
    readout.classList.toggle("is-bipolar", bipolar);
    if (bipolar) {
      // Fill spans from the MID value's track position to the current value
      // (centered on mid — typically 0 for bipolar ranges).
      const midValue = Number(slider.dataset.mid);
      const midTravel = nodeSliderTravelFromValue(
        slider,
        Number.isFinite(midValue) ? midValue : 0,
      );
      const midRange = nodeSliderHandleRangeFromTravel(slider, readout, midTravel);
      const fillLeft = Math.min(midRange.center, range.center);
      const fillRight = Math.max(midRange.center, range.center);
      readout.style.setProperty("--amount-start", `${fillLeft}px`);
      readout.style.setProperty("--amount-end", `${fillRight}px`);
    } else {
      readout.style.setProperty("--amount-start", "0px");
      readout.style.setProperty("--amount-end", `${range.end}px`);
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
  const controlLabel = slider.closest(".node-parameter-control")?.dataset.paramLabel?.trim();
  if (controlLabel) {
    return controlLabel;
  }
  const label = slider.closest("label");
  if (!label) {
    return slider.id;
  }
  for (const node of label.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        return text;
      }
    }
  }
  return slider.id;
}

function nodeSliderDebugPath(slider) {
  const node = slider.closest(".dsp-node");
  const nodeName = node ? nodeGraphNodeDisplayName(node.dataset.node) : "Node";
  return `${nodeName} : ${nodeSliderLabelText(slider)} : Metadata`;
}
