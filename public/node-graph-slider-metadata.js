const nodeSliderNumberFormatSmokeCases = Object.freeze([
  { value: 1456.6982, maxDigits: 5, expected: "1456.7" },
  { value: 220, maxDigits: 5, expected: "220.00" },
  { value: 1, maxDigits: 3, expected: "1.00" },
  { value: 12.34567, maxDigits: 5, expected: "12.346" },
  { value: 0.123456, maxDigits: 5, expected: "0.1235" },
  { value: -0.123456, maxDigits: 5, expected: "-0.1235" },
  { value: 0.123456, maxDigits: 5, showSign: true, expected: "+0.1235" },
  { value: 0.123456, maxDigits: 5, reserveSignSpace: true, expected: " 0.1235" },
]);

function limit_decimals(
  value,
  maxDigits,
  minDecimalPlaces = 0,
  maxDecimalPlaces = maxDigits,
  removeTrailingZeros = true,
  allowExtraDecimalForLeadingZero = false,
) {
  const source = String(value ?? "").trimStart();
  const signMatch = source.match(/^[+-]/);
  const sign = signMatch ? signMatch[0] : "";
  const unsigned = sign ? source.slice(1) : source;
  const match = unsigned.match(/^(\d*)(\.?)(\d*)/);
  let whole = match?.[1] || "";
  const dot = match?.[2] || "";
  const decimalSource = match?.[3] || "";
  const omitLeadingZero = allowExtraDecimalForLeadingZero && whole === "0";

  if (omitLeadingZero) {
    whole = "";
  } else if (!whole) {
    whole = "0";
  }
  if (!dot) {
    if (!removeTrailingZeros) {
      // maxDigits policy: ≥ 1 app-wide (same as normalizeNodeGraphMetadataMaxDigits).
      const boundedMaxDigits = Math.max(1, Math.min(12, Math.round(Number(maxDigits) || 1)));
      const boundedMinDecimals = Math.max(0, Math.round(Number(minDecimalPlaces) || 0));
      const boundedMaxDecimals = Math.max(0, Math.round(Number(maxDecimalPlaces) || 0));
      const digitBudget = Math.max(0, boundedMaxDigits - whole.length);
      const decimals = "".padEnd(Math.min(digitBudget, boundedMinDecimals, boundedMaxDecimals), "0");
      if (decimals) {
        return `${sign}${whole}.${decimals}`;
      }
    }
    return `${sign}${whole}`;
  }

  const boundedMaxDigits = Math.max(1, Math.min(12, Math.round(Number(maxDigits) || 1)));
  const boundedMinDecimals = Math.max(0, Math.round(Number(minDecimalPlaces) || 0));
  const boundedMaxDecimals = Math.max(0, Math.round(Number(maxDecimalPlaces) || 0));
  let digitBudget = Math.max(0, boundedMaxDigits - whole.length);
  let decimalPlaces = Math.min(digitBudget, boundedMaxDecimals);
  let decimals = decimalSource.slice(0, decimalPlaces);
  const roundDigit = Number(decimalSource.charAt(decimalPlaces) || "0");

  if (roundDigit >= 5) {
    const rounded = nodeSliderRoundLimitedDecimalDigits(whole, decimals, decimalPlaces);
    whole = rounded.whole;
    decimals = rounded.decimals;
    digitBudget = Math.max(0, boundedMaxDigits - whole.length);
    decimalPlaces = Math.min(decimals.length, digitBudget, boundedMaxDecimals);
    decimals = decimals.slice(0, decimalPlaces);
  }

  if (removeTrailingZeros) {
    decimals = decimals.replace(/0+$/, "");
  } else {
    decimals = decimals.padEnd(Math.min(digitBudget, boundedMinDecimals), "0");
  }

  if (!decimals) {
    return `${sign}${whole}`;
  }
  return `${sign}${omitLeadingZero ? "" : whole}.${decimals}`;
}

function nodeSliderRoundLimitedDecimalDigits(whole, decimals, decimalPlaces) {
  const nextDecimals = decimals.padEnd(decimalPlaces, "0").split("");
  for (let index = nextDecimals.length - 1; index >= 0; index -= 1) {
    if (nextDecimals[index] !== "9") {
      nextDecimals[index] = String(Number(nextDecimals[index]) + 1);
      return { whole, decimals: nextDecimals.join("") };
    }
    nextDecimals[index] = "0";
  }
  return {
    whole: nodeSliderIncrementWholeDigits(whole),
    decimals: nextDecimals.join(""),
  };
}

function nodeSliderIncrementWholeDigits(whole) {
  const digits = (whole || "0").split("");
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== "9") {
      digits[index] = String(Number(digits[index]) + 1);
      return digits.join("");
    }
    digits[index] = "0";
  }
  return `1${digits.join("")}`;
}

function formatNodeSliderNumber(value, options = {}) {
  const number = Number(value);
  const maxDigits = normalizeNodeGraphMetadataMaxDigits(options.maxDigits, options.kind);
  const text = Number.isFinite(number)
    ? limit_decimals(String(number), maxDigits, maxDigits, maxDigits, Boolean(options.removeTrailingZeros))
    : "";
  if (options.showSign && number >= 0) {
    return `+${text}`;
  }
  return options.reserveSignSpace && number >= 0 ? ` ${text}` : text;
}

function parseNodeSliderMathExpression(text) {
  const source = String(text ?? "").trim();
  if (!source) {
    return NaN;
  }
  if (!/^[\d.eE+\-*/()\s]+$/.test(source)) {
    return Number(source);
  }

  let index = 0;
  const peek = () => source[index] || "";
  const skipSpace = () => {
    while (/\s/.test(peek())) {
      index += 1;
    }
  };
  const parseNumber = () => {
    skipSpace();
    const match = source.slice(index).match(/^(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?/);
    if (!match) {
      return NaN;
    }
    index += match[0].length;
    return Number(match[0]);
  };
  const parseFactor = () => {
    skipSpace();
    if (peek() === "+") {
      index += 1;
      return parseFactor();
    }
    if (peek() === "-") {
      index += 1;
      return -parseFactor();
    }
    if (peek() === "(") {
      index += 1;
      const value = parseExpression();
      skipSpace();
      if (peek() !== ")") {
        return NaN;
      }
      index += 1;
      return value;
    }
    return parseNumber();
  };
  const parseTerm = () => {
    let value = parseFactor();
    while (Number.isFinite(value)) {
      skipSpace();
      const operator = peek();
      if (operator !== "*" && operator !== "/") {
        break;
      }
      index += 1;
      const right = parseFactor();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  function parseExpression() {
    let value = parseTerm();
    while (Number.isFinite(value)) {
      skipSpace();
      const operator = peek();
      if (operator !== "+" && operator !== "-") {
        break;
      }
      index += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const value = parseExpression();
  skipSpace();
  return index === source.length && Number.isFinite(value) ? value : NaN;
}

function nodeSliderShouldShowSign(slider) {
  return slider.dataset.showSign === "true";
}

function nodeSliderShouldDisplayChoices(slider) {
  return slider.dataset.displayChoices === "true";
}

function nodeSliderShouldDivideChoicesVisibly(slider) {
  return slider.dataset.divideChoicesVisibly === "true";
}

function nodeSliderShouldWraparound(slider) {
  return slider.dataset.wraparound === "true";
}

function nodeSliderShouldUseLinearSmoothing(slider) {
  return slider.dataset.linearSmoothing !== "false";
}

function nodeSliderShouldUseNonlinearSlider(slider) {
  return slider.dataset.nonlinearSlider === "true";
}

function nodeSliderSmoothingSeconds(slider) {
  const value = Number(slider.dataset.smoothingSeconds);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function nodeSliderSmoothingMode(slider) {
  return normalizeNodeGraphMetadataSmoothingMode(slider.dataset.smoothingMode);
}

function normalizeNodeSliderCurve(value, nonlinearSlider = false) {
  const curve = String(value || "").trim().toLowerCase();
  if (curve === "edges" || curve === "edge" || curve === "s") {
    return "edges";
  }
  // Mid-style power curve, but knee from SENSITIVITY (−1…+1) instead of MID.
  if (curve === "custom" || curve === "sens" || curve === "sensitivity") {
    return "custom";
  }
  if (curve === "skew" || curve === "mid" || curve === "nonlinear" || curve === "exponential") {
    return "skew";
  }
  return nonlinearSlider ? "skew" : "linear";
}

/** True when SKEW mode uses the SENSITIVITY (−1…+1) field. */
function nodeSliderCurveUsesSensitivity(curve) {
  const c = normalizeNodeSliderCurve(curve, false);
  return c === "custom" || c === "edges";
}

/** True when SKEW mode uses the MID domain field for the response knee. */
function nodeSliderCurveUsesMid(curve) {
  return normalizeNodeSliderCurve(curve, false) === "skew";
}

function nodeSliderCurve(slider) {
  return normalizeNodeSliderCurve(slider.dataset.sliderCurve, nodeSliderShouldUseNonlinearSlider(slider));
}

function nodeSliderCurveAmount(slider) {
  return normalizeNodeSliderCurveAmount(slider.dataset.curveAmount);
}

function formatNodeSliderCompactNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)).toString() : "";
}

function sanitizeNodeGraphNumericText(value) {
  const source = String(value ?? "").trim().replace(/,/g, "");
  let output = "";
  let hasDot = false;
  let hasExponent = false;
  let exponentHasDigit = false;
  for (const character of source) {
    if (character >= "0" && character <= "9") {
      output += character;
      if (hasExponent) {
        exponentHasDigit = true;
      }
      continue;
    }
    if ((character === "+" || character === "-") && (output === "" || /[eE]$/.test(output))) {
      output += character;
      continue;
    }
    if (character === "." && !hasDot && !hasExponent) {
      output += character;
      hasDot = true;
      continue;
    }
    if ((character === "e" || character === "E") && !hasExponent && /[0-9]/.test(output)) {
      output += "e";
      hasExponent = true;
      continue;
    }
  }
  if (hasExponent && !exponentHasDigit) {
    output = output.replace(/[eE][+-]?$/, "");
  }
  return /^[-+]?\.?$/.test(output) ? "" : output;
}

function parseNodeMetadataNumber(value, fallback) {
  const number = Number(sanitizeNodeGraphNumericText(value));
  return Number.isFinite(number) ? number : fallback;
}

function formatNodeMetadataStep(value) {
  return Number.isFinite(Number(value)) ? formatNodeSliderCompactNumber(Math.max(0, Number(value))) : "0";
}

function parseNodeMetadataChoices(value) {
  return String(value)
    .split(",")
    .map((choice) => choice.trim())
    .filter(Boolean);
}

function formatNodeMetadataChoices(choices) {
  return choices.join(", ");
}

function nodeSliderChoiceLabel(slider) {
  const metadata = nodeSliderMetadata(slider);
  if (!metadata.displayChoices || !metadata.choices.length) {
    return null;
  }

  const index = Math.round(Number(slider.value));
  if (!Number.isFinite(index)) {
    return null;
  }

  return metadata.choices[Math.max(0, Math.min(metadata.choices.length - 1, index))] ?? null;
}

function nodeGraphPatchChoiceLabel(metadata, value) {
  if (!metadata?.displayChoices || !metadata.choices?.length) {
    return null;
  }
  const index = Math.round(Number(value));
  if (!Number.isFinite(index)) {
    return null;
  }
  return metadata.choices[Math.max(0, Math.min(metadata.choices.length - 1, index))] ?? null;
}

function nodeSliderChoiceIndexFromText(slider, value) {
  const metadata = nodeSliderMetadata(slider);
  if (!metadata.displayChoices || !metadata.choices.length) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const exactIndex = metadata.choices.findIndex(
    (choice) => choice.toLowerCase() === normalized,
  );
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const prefixMatches = metadata.choices
    .map((choice, index) => ({ choice: choice.toLowerCase(), index }))
    .filter((choice) => choice.choice.startsWith(normalized));
  return prefixMatches.length === 1 ? prefixMatches[0].index : null;
}

function nodeSliderMetadata(slider) {
  const min = Number(slider.min);
  const mid = Number(slider.dataset.mid);
  const max = Number(slider.max);
  const def = Number(slider.dataset.default);
  const cur = Number(slider.value);
  const step =
    slider.dataset.step && slider.dataset.step !== "any"
      ? Number(slider.dataset.step)
      : 0;
  return {
    alias: slider.dataset.alias ?? "",
    choices: parseNodeMetadataChoices(slider.dataset.choices || ""),
    curveAmount: nodeSliderCurveAmount(slider),
    cur,
    def,
    displayChoices: nodeSliderShouldDisplayChoices(slider),
    divideChoicesVisibly: nodeSliderShouldDivideChoicesVisibly(slider),
    bipolar: slider.dataset.bipolar === "true",
    linearSmoothing: nodeSliderShouldUseLinearSmoothing(slider),
    nonlinearSlider: nodeSliderShouldUseNonlinearSlider(slider),
    sliderCurve: nodeSliderCurve(slider),
    showSign: nodeSliderShouldShowSign(slider),
    smoothingMode: nodeSliderSmoothingMode(slider),
    smoothingSeconds: nodeSliderSmoothingSeconds(slider),
    smoothingType: typeof normalizeNodeGraphMetadataSmoothingType === "function"
      ? normalizeNodeGraphMetadataSmoothingType(slider.dataset.smoothingType)
      : "onePole",
    wraparound: nodeSliderShouldWraparound(slider),
    unit: slider.dataset.unit ?? "",
    kind: slider.dataset.kind || "decimal",
    max,
    maxDigits: normalizeNodeGraphMetadataMaxDigits(slider.dataset.maxDigits, slider.dataset.kind),
    mid,
    min,
    step,
    tooltip: String(slider.dataset.tooltip || "").slice(0, 240),
  };
}

function formatNodeSliderMetadataTooltip(slider) {
  const metadata = nodeSliderMetadata(slider);
  const numberOptions = { kind: metadata.kind, maxDigits: metadata.maxDigits };
  const stepText = formatNodeMetadataStep(metadata.step);
  const rows = [
    ...(metadata.tooltip ? [`tooltip ${metadata.tooltip}`] : []),
    `current ${formatNodeSliderNumber(metadata.cur, numberOptions)}`,
    `default ${formatNodeSliderNumber(metadata.def, numberOptions)}`,
    `min ${formatNodeSliderNumber(metadata.min, numberOptions)}`,
    `max ${formatNodeSliderNumber(metadata.max, numberOptions)}`,
    `step ${stepText}`,
    `alias ${metadata.alias || "none"}`,
    `kind ${metadata.kind}`,
    `max digits ${metadata.maxDigits}`,
    `unit ${metadata.unit}`,
    `choices ${metadata.choices.length ? formatNodeMetadataChoices(metadata.choices) : "none"}`,
    `curve ${metadata.sliderCurve}`,
    `display choices ${metadata.displayChoices}`,
    `divide choices visibly ${metadata.divideChoicesVisibly}`,
    `linear smoothing ${metadata.linearSmoothing}`,
    `smoothing type ${metadata.smoothingType || "onePole"}`,
    `show sign ${metadata.showSign}`,
    `wraparound ${metadata.wraparound}`,
  ];
  if (typeof nodeSliderCurveUsesSensitivity === "function"
    ? nodeSliderCurveUsesSensitivity(metadata.sliderCurve)
    : (metadata.sliderCurve === "edges" || metadata.sliderCurve === "custom")) {
    rows.push(`sensitivity ${formatNodeSliderCompactNumber(metadata.curveAmount)}`);
  }
  if (typeof nodeSliderCurveUsesMid === "function"
    ? nodeSliderCurveUsesMid(metadata.sliderCurve)
    : metadata.sliderCurve === "skew") {
    rows.splice(3, 0, `mid ${formatNodeSliderNumber(metadata.mid, numberOptions)}`);
  }
  return rows.join(" / ");
}

function syncNodeSliderMetadataTooltip(slider) {
  const tooltip = formatNodeSliderMetadataTooltip(slider);
  slider.setAttribute("aria-valuetext", tooltip);
  slider.removeAttribute("title");
  slider.closest(".node-slider-drag-surface")?.removeAttribute("title");
}
