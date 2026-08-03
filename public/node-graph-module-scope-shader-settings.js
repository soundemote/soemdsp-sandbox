// Scope light-shader settings helpers (Phase D).
// Load after scopes.js. Extract-only.

function nodeGraphModuleScopeDefaultShaderSourceForNode(node) {
  try {
    const moduleDefault = typeof nodeGraphScopeShaderModuleDefaultSource === "function"
      ? nodeGraphScopeShaderModuleDefaultSource(node)
      : "";
    if (moduleDefault) {
      return moduleDefault;
    }
  } catch {
    // Fall through to the built-in starter shader.
  }
  const builtInSource = typeof nodeGraphScopeShaderDefaultSourceForType === "function"
    ? nodeGraphScopeShaderDefaultSourceForType(node?.type)
    : "";
  return normalizeNodeGraphScopeShader({ source: builtInSource }).source;
}

function nodeGraphModuleScopeExplicitShaderSourceForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node) {
    return "";
  }
  return Object.hasOwn(node, "scopeShader")
    ? normalizeNodeGraphScopeShader(node.scopeShader).source
    : "";
}

function nodeGraphModuleScopeShaderSourceForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node) {
    return "";
  }
  return nodeGraphModuleScopeExplicitShaderSourceForSlot(slot) ||
    nodeGraphModuleScopeDefaultShaderSourceForNode(node);
}

function nodeGraphModuleScopeShaderVideoInputForSlot(slot) {
  return normalizeNodeGraphScopeShader({ source: nodeGraphModuleScopeShaderSourceForSlot(slot) }).videoInput;
}

function nodeGraphModuleScopeShaderConfigForSlot(slot) {
  return normalizeNodeGraphScopeShader({ source: nodeGraphModuleScopeShaderSourceForSlot(slot) });
}

function nodeGraphModuleScopeExplicitShaderConfigForSlot(slot) {
  const source = nodeGraphModuleScopeExplicitShaderSourceForSlot(slot);
  return source ? normalizeNodeGraphScopeShader({ source }) : null;
}

function nodeGraphModuleScopeShaderOutputPortForSlot(slot) {
  const videoInput = nodeGraphModuleScopeShaderVideoInputForSlot(slot);
  const match = String(videoInput || "").match(/^output(\d+)$/);
  if (!match) {
    return "";
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const outputs = node ? nodeGraphPatchNodeOutputPorts(node) : [];
  return outputs[Number(match[1])] || "";
}

function nodeGraphModuleScopeShaderAssignmentValue(source, dotName, key) {
  const safeDotName = dotName === "dot2" ? "dot2" : "dot1";
  const safeKey = String(key || "").replace(/[^\w]/g, "");
  if (!safeKey) {
    return "";
  }
  const match = String(source || "").match(new RegExp(`\\b${safeDotName}\\.${safeKey}\\s*=\\s*([^;]+)\\s*;`));
  return String(match?.[1] || "").trim();
}

function nodeGraphModuleScopeShaderColor(source, dotName, fallback) {
  const value = nodeGraphModuleScopeShaderAssignmentValue(source, dotName, "color");
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return nodeGraphNormalizeScopeTraceColor(value);
  }
  if (new RegExp(`^${dotName}\\.(?:global|globals)\\.color$`).test(value)) {
    return nodeGraphModuleScopeShaderGlobalColor(dotName);
  }
  return fallback;
}

// Only "dot1" resolves to anything now that Dot 2 has been removed -- a
// legacy custom shader script that still assigns from `dot2.global.color`
// (parsed generically by nodeGraphModuleScopeShaderExpressionPartValue's
// dot([12]) regex, independent of what this app calls it with) is gated
// out by nodeGraphModuleScopeShaderDotNameIsPrimary below, which
// nodeGraphModuleScopeShaderColor's caller already treats as "use the
// fallback" -- a true no-op, not a throw.
function nodeGraphModuleScopeShaderDotNameIsPrimary(dotName) {
  return dotName === "dot1";
}

function nodeGraphModuleScopeShaderGlobalColor(dotName) {
  if (!nodeGraphModuleScopeShaderDotNameIsPrimary(dotName)) {
    return null;
  }
  const defaultCore = nodeGraphModuleScopeDefaultDotCores.dot1;
  return normalizeNodeGraphModuleScopeDotCoreColor(
    nodeGraphMvp?.moduleScopeDotCore1Color ?? defaultCore.color,
    defaultCore.color,
  );
}

function nodeGraphModuleScopeShaderNumber(source, dotName, key, fallback) {
  const value = nodeGraphModuleScopeShaderExpressionValue(
    nodeGraphModuleScopeShaderAssignmentValue(source, dotName, key),
    dotName,
    key,
    fallback,
  );
  return Number.isFinite(value) ? value : fallback;
}

// Same reasoning as nodeGraphModuleScopeShaderGlobalColor above: a custom
// shader script's embedded expression can still literally say "dot2.global.*"
// (parsed by the generic dot([12]) regex in
// nodeGraphModuleScopeShaderExpressionPartValue, independent of which dot
// this call is actually computing) -- with no Dot 2 state left to read,
// that resolves to the given fallback, i.e. no effect, not a throw.
function nodeGraphModuleScopeShaderGlobalValue(dotName, key, fallback) {
  if (!nodeGraphModuleScopeShaderDotNameIsPrimary(dotName)) {
    return fallback;
  }
  const defaultCore = nodeGraphModuleScopeDefaultDotCores.dot1;
  const enabled = nodeGraphMvp?.moduleScopeDotCore1Enabled !== false;
  if (key === "size") {
    const size = normalizeNodeGraphModuleScopeDotCoreSize(
      nodeGraphMvp?.moduleScopeDotCore1Size ?? defaultCore.size,
      defaultCore.size,
    );
    return normalizeNodeGraphModuleScopeDotCoreSize(
      (Number(fallback) || 0) * (size / defaultCore.size),
      defaultCore.size,
    );
  }
  if (key === "brightness") {
    if (!enabled) {
      return 0;
    }
    return normalizeNodeGraphModuleScopeDotCoreBrightness(
      nodeGraphMvp?.moduleScopeDotCore1Brightness ?? defaultCore.brightness,
      defaultCore.brightness,
    );
  }
  if (key === "blur") {
    return Number.isFinite(Number(defaultCore.blur)) ? normalizeNodeGraphModuleScopeDotBlur(defaultCore.blur, 0) : 0;
  }
  return fallback;
}

function nodeGraphModuleScopeShaderExpressionPartValue(part, dotName, key, fallback) {
  const text = String(part || "").trim();
  if (!text) {
    return NaN;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }
  const globalMatch = text.match(/^dot([12])\.(?:global|globals)\.(size|brightness|blur)$/);
  if (globalMatch) {
    return nodeGraphModuleScopeShaderGlobalValue(`dot${globalMatch[1]}`, globalMatch[2], fallback);
  }
  if (text === "globalsize" || text === "global.size") {
    return nodeGraphModuleScopeShaderGlobalValue(dotName, "size", fallback);
  }
  return NaN;
}

function nodeGraphModuleScopeShaderExpressionValue(expression, dotName, key, fallback) {
  const text = String(expression || "").trim();
  if (!text) {
    return fallback;
  }
  const product = text
    .split("*")
    .map((part) => nodeGraphModuleScopeShaderExpressionPartValue(part, dotName, key, fallback));
  if (product.length && product.every((value) => Number.isFinite(value))) {
    return product.reduce((value, part) => value * part, 1);
  }
  return fallback;
}

function nodeGraphModuleScopeShaderSizeRatio(source, dotName, fallback) {
  return clampNodeSliderValue(
    nodeGraphModuleScopeShaderNumber(source, dotName, "size", fallback),
    0,
    1,
  );
}

function normalizeNodeGraphModuleScopeDotBlur(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(number, 0, 1) : fallback;
}

function nodeGraphModuleScopeShaderBlurRatio(source, dotName, fallback = 0) {
  return normalizeNodeGraphModuleScopeDotBlur(
    nodeGraphModuleScopeShaderNumber(source, dotName, "blur", fallback),
    fallback,
  );
}

function nodeGraphModuleScopeLightShaderStyle(slot, buffer) {
  const source = nodeGraphModuleScopeShaderSourceForSlot(slot);
  const dotCore1Enabled = nodeGraphMvp?.moduleScopeDotCore1Enabled !== false;
  const centerFallback = normalizeNodeGraphModuleScopeDotCoreColor(
    buffer.nodeGraphScopeLightCenterColor ?? nodeGraphMvp?.moduleScopeDotCore1Color ?? nodeGraphModuleScopeDefaultDotCores.dot1.color,
    nodeGraphModuleScopeDefaultDotCores.dot1.color,
  );
  return {
    centerBrightness: clampNodeSliderValue(
      (dotCore1Enabled ? 1 : 0) * nodeGraphModuleScopeShaderNumber(
        source,
        "dot1",
        "brightness",
        normalizeNodeGraphModuleScopeDotCoreBrightness(
          nodeGraphMvp?.moduleScopeDotCore1Brightness ?? nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
          nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
        ),
      ),
      0,
      40,
    ),
    centerColor: nodeGraphModuleScopeShaderColor(source, "dot1", centerFallback),
    centerBlur: nodeGraphModuleScopeShaderBlurRatio(source, "dot1", 0),
    centerSize: nodeGraphModuleScopeShaderSizeRatio(
      source,
      "dot1",
      0.035,
    ),
    source,
    usesShader: Boolean(source),
  };
}

