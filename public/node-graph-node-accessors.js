function nodeGraphLabel(node, port) {
  return `${nodeGraphNodeDisplayName(node)}.${port}`;
}

function nodeGraphNodeSelector(node) {
  return `.dsp-node[data-node="${CSS.escape(node)}"]`;
}

function nodeGraphNodeElement(node) {
  return document.querySelector(nodeGraphNodeSelector(node));
}

function nodeGraphNodeType(node) {
  return nodeGraphNodeElement(node)?.dataset.nodeType || nodeGraphPatchNodeType(node);
}

function nodeGraphNodeDisplayName(node) {
  return nodeGraphPatchNodeTitle(node);
}

function nodeGraphReadNodeNumber(node, key) {
  // Prefer patch domain (may exceed HTML range min/max).
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
  if (patchNode?.params && Object.hasOwn(patchNode.params, key)) {
    const fromPatch = Number(patchNode.params[key]);
    if (Number.isFinite(fromPatch)) {
      return fromPatch;
    }
  }
  const input = nodeGraphNodeElement(node)?.querySelector(
    `input[data-param="${CSS.escape(key)}"]`,
  );
  const fromDomain = Number(input?.dataset?.domainValue);
  if (Number.isFinite(fromDomain)) {
    return fromDomain;
  }
  const value = Number(input?.value);
  return Number.isFinite(value)
    ? value
    : nodeGraphParameterFallback(nodeGraphNodeType(node), key);
}

function nodeGraphReadPatchParameterValue(node, key) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (!patchNode) {
    return nodeGraphParameterFallback(nodeGraphPatchNodeType(node), key);
  }
  const value = Number(patchNode.params?.[key]);
  return Number.isFinite(value)
    ? value
    : nodeGraphParameterFallback(patchNode.type, key);
}

function nodeGraphParameterFallback(type, key) {
  const parameter = nodeGraphModuleDefinitions[type]?.parameters?.find(
    (candidate) => candidate.key === key,
  );
  const value = Number(parameter?.defaultValue);
  return Number.isFinite(value) ? value : 0;
}

function nodeGraphReadPatchParameterMetadata(node, key) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  const type = patchNode?.type || nodeGraphPatchNodeType(node);
  return normalizeNodeGraphPatchParameterMetadata(
    type,
    key,
    patchNode?.paramMeta?.[key],
  ) || nodeGraphParameterDefinitionMetadata(
    nodeGraphModuleDefinitions[type]?.parameters?.find((parameter) => parameter.key === key),
  );
}

function nodeGraphReadNodeParameterMetadata(node, key) {
  const input = nodeGraphNodeElement(node)?.querySelector(
    `input[data-param="${CSS.escape(key)}"]`,
  );
  if (!input) {
    const patchMetadata = nodeGraphPatchNode(node)?.paramMeta?.[key];
    if (patchMetadata) {
      return {
        linearSmoothing: patchMetadata.linearSmoothing !== false,
        max: Number(patchMetadata.max ?? 1),
        min: Number(patchMetadata.min ?? 0),
        smoothingSeconds: normalizeNodeGraphMetadataSmoothingSeconds(patchMetadata.smoothingSeconds),
        wraparound: Boolean(patchMetadata.wraparound),
      };
    }
    const definition = nodeGraphModuleDefinitions[nodeGraphPatchNodeType(node)];
    const parameter = definition?.parameters?.find((candidate) => candidate.key === key);
    return {
      linearSmoothing: parameter?.linearSmoothing !== false,
      max: Number(parameter?.max ?? 1),
      min: Number(parameter?.min ?? 0),
      smoothingSeconds: normalizeNodeGraphMetadataSmoothingSeconds(parameter?.smoothingSeconds),
      wraparound: Boolean(parameter?.wraparound),
    };
  }
  return {
    linearSmoothing: nodeSliderShouldUseLinearSmoothing(input),
    max: Number(input.max),
    min: Number(input.min),
    smoothingSeconds: nodeSliderSmoothingSeconds(input),
    wraparound: nodeSliderShouldWraparound(input),
  };
}

function nodeGraphParameterKey(node, parameter) {
  return `${node}.${parameter}`;
}
