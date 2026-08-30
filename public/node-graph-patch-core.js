function nodeGraphBypassGlyph(bypassed) {
  return "\u{1F5F2}";
}

function normalizeNodeGraphPatchParameter(type, key, value, metadata = null) {
  const parameter = nodeGraphModuleDefinitions[type]?.parameters?.find(
    (candidate) => candidate.key === key,
  );
  if (!parameter) {
    return null;
  }
  const number = Number(value);
  const fallback = Number(metadata?.def ?? parameter?.defaultValue);
  const candidate = Number.isFinite(number)
    ? number
    : Number.isFinite(fallback)
      ? fallback
      : 0;
  // min/max are slider guides — only hard-clamp wraparound / resource constraints.
  const meta = metadata && typeof metadata === "object"
    ? metadata
    : {
      min: parameter?.min,
      max: parameter?.max,
      wraparound: parameter?.wraparound,
      constraint: parameter?.constraint,
      hardClamp: parameter?.hardClamp,
    };
  if (typeof nodeGraphParamApplyDomainBounds === "function") {
    return nodeGraphParamApplyDomainBounds(candidate, {
      min: meta.min ?? parameter?.min,
      max: meta.max ?? parameter?.max,
      wraparound: meta.wraparound ?? parameter?.wraparound,
      constraint: meta.constraint ?? parameter?.constraint,
      hardClamp: meta.hardClamp ?? parameter?.hardClamp,
    });
  }
  const min = Number(meta.min ?? parameter?.min);
  const max = Number(meta.max ?? parameter?.max);
  const wrap = Boolean(meta.wraparound ?? parameter?.wraparound);
  const constraint = String(meta.constraint ?? parameter?.constraint ?? "").toLowerCase();
  const hard = meta.hardClamp === true
    || wrap
    || constraint === "cpu"
    || constraint === "gpu"
    || constraint === "ram"
    || constraint === "memory";
  if (!hard || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return candidate;
  }
  return wrap
    ? wrapNodeSliderValue(candidate, min, max)
    : clampNodeSliderValue(candidate, min, max);
}

// "graph" (per-point curve shape/contour) is retired in favor of "graph2"
// (one global smoothing mode for the whole curve) -- both modules produced
// effectively the same result in practice, and graph2's approach was the
// one working well. Old patches with a "graph" node just drop it, same as
// any other retired type below, rather than crashing on load.
const nodeGraphRetiredNodeTypes = new Set([
  "bipolarKnob",
  // Legacy host module type; drop silently so old patches don't throw unknown-type.
  "clapPlugin",
  "formulaVisual",
  "graph",
  "impulseButton",
  "macroKnob",
  "moduleHome",
  "moduleShop",
  "scriptBox",
]);

/**
 * Legacy phosphorLight → scope2d (2D Phosphor).
 * Ports stay X/Y; settings map color/brightness → dot1Color/dot1Brightness.
 */
function migrateNodeGraphPhosphorLightToScope2d(node) {
  if (!node || String(node.type || "").trim() !== "phosphorLight") {
    return node;
  }
  const src = node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  const migratedSettings = {
    ...src,
    background: src.background ?? src.backgroundColor,
    decay: src.decay,
    scale: src.scale,
    dot1Size: src.dot1Size,
    lineThickness: src.lineThickness ?? src.dot1Blur,
    pixelDensity: src.pixelDensity,
    dot1Color: src.dot1Color ?? src.color,
    dot1Brightness: src.dot1Brightness ?? src.brightness,
  };
  return {
    ...node,
    type: "scope2d",
    traceDisplaySettings: migratedSettings,
  };
}

function validateNodeGraphPatch(patch) {
  if (!patch || typeof patch !== "object") {
    throw new Error("patch must be an object");
  }

  // Phase C: climb format.version before shape checks / unknown-type throws.
  const migrated = typeof migrateNodeGraphPatchToCurrent === "function"
    ? migrateNodeGraphPatchToCurrent(patch)
    : patch;
  patch = migrated;

  if (patch.format !== undefined) {
    if (
      patch.format?.kind !== nodeGraphPatchFormat.kind ||
      Number(patch.format?.version) !== nodeGraphPatchFormat.version
    ) {
      throw new Error("unsupported patch format");
    }
  }

  const cameraState = normalizeNodeGraphPatchCameras(patch.cameras, patch.activeCameraId);
  const grid = normalizeNodeGraphPatchGrid(patch.grid);
  if (!Number.isFinite(grid.widthPx) || grid.widthPx <= 0) {
    throw new Error("grid.widthPx must be a positive number");
  }
  if (!Number.isFinite(grid.heightPx) || grid.heightPx <= 0) {
    throw new Error("grid.heightPx must be a positive number");
  }

  if (!Array.isArray(patch.nodes)) {
    throw new Error("nodes must be an array");
  }

  const retiredNodeTypes = nodeGraphRetiredNodeTypes;
  // Dropped nodes = retired types + unknown types (pretend deleted). Wires that
  // touched them are stripped below; load still succeeds with a warning dialog.
  const loadWarnings = [];
  const droppedNodeIds = new Set();
  for (const rawNode of patch.nodes) {
    const id = String(rawNode?.id || "").trim();
    if (!id) {
      continue;
    }
    const rawType = String(rawNode?.type || "").trim();
    if (retiredNodeTypes.has(rawType)) {
      droppedNodeIds.add(id);
      continue;
    }
    const resolved = typeof nodeGraphResolveModuleTypeAlias === "function"
      ? nodeGraphResolveModuleTypeAlias(rawType)
      : rawType;
    // phosphorLight migrates to scope2d — not unknown.
    const probeType = resolved === "phosphorLight" ? "scope2d" : resolved;
    if (!Object.hasOwn(nodeGraphModuleDefinitions, probeType)) {
      droppedNodeIds.add(id);
      loadWarnings.push(`unknown node type ${resolved || rawType || "(missing)"} (node id ${id})`);
    }
  }
  // Alias used by connection/modulation filters below (was retiredNodeIds only).
  const retiredNodeIds = droppedNodeIds;
  const ids = new Set();
  const uniqueTypesSeen = new Set();
  const nodes = patch.nodes
    .filter((node) => !droppedNodeIds.has(String(node.id || "").trim()))
    // phosphorLight → scope2d also runs inside migrateNodeGraphPatchToCurrent;
    // keep local map for boot if migrations.js is missing.
    .map((rawNode) => (
      typeof migrateNodeGraphPhosphorLightToScope2d === "function"
        ? migrateNodeGraphPhosphorLightToScope2d(rawNode)
        : rawNode
    ))
    .filter((node) => {
      const type = typeof nodeGraphResolveModuleTypeAlias === "function"
        ? nodeGraphResolveModuleTypeAlias(node.type)
        : String(node.type || "").trim();
      if (!Object.hasOwn(nodeGraphModuleDefinitions, type)) {
        return false;
      }
      if (typeof nodeGraphModuleTypeIsUniqueInPatch === "function"
        && nodeGraphModuleTypeIsUniqueInPatch(type)) {
        if (uniqueTypesSeen.has(type)) {
          return false;
        }
        uniqueTypesSeen.add(type);
      }
      return true;
    })
    .map((node) => {
    const id = String(node.id || "").trim();
    const type = typeof nodeGraphResolveModuleTypeAlias === "function"
      ? nodeGraphResolveModuleTypeAlias(node.type)
      : String(node.type || "").trim();
    if (!id) {
      throw new Error("node id missing");
    }
    if (ids.has(id)) {
      throw new Error(`duplicate node id ${id}`);
    }
    if (type === "output" && id !== "output") {
      throw new Error("output module id must be output");
    }
    const gx = roundNodeGraphGridCoordinate(Number(node.gx));
    const gy = roundNodeGraphGridCoordinate(Number(node.gy));
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
      throw new Error(`node ${id} grid position invalid`);
    }
    const sizingCapabilities = nodeGraphModuleSizingCapabilities(type);
    const hasCustomWidth = sizingCapabilities.width && Object.hasOwn(node, "widthGu");
    const widthGu = hasCustomWidth ? normalizeNodeGraphModuleWidthUnits(type, node.widthGu) : null;
    if (hasCustomWidth && !Number.isFinite(Number(node.widthGu))) {
      throw new Error(`node ${id} widthGu invalid`);
    }
    const hasCustomModuleHeight = ["custom", "textBox"].includes(sizingCapabilities.moduleHeight)
      && Object.hasOwn(node, "heightGu");
    const heightGu = hasCustomModuleHeight
      ? sizingCapabilities.moduleHeight === "textBox"
        ? normalizeNodeGraphTextBoxHeightUnits(node.heightGu, node.ui)
        : normalizeNodeGraphModuleHeightUnits(type, node.heightGu, node.ui)
      : null;
    if (hasCustomModuleHeight && !Number.isFinite(Number(node.heightGu))) {
      throw new Error(`node ${id} heightGu invalid`);
    }
    const params = {};
    const paramMeta = {};
    const rawParams = node.params && typeof node.params === "object" ? node.params : {};
    const rawParamMeta = node.paramMeta && typeof node.paramMeta === "object" ? node.paramMeta : {};
    const fbmFieldFaceKeys = [
      "lacunarity",
      "smoothness",
      "scale",
      "zoom",
      "contrast",
      "brightness",
      "rotate",
    ];
    const liftFbmFieldFaceParams = type === "fbmField"
      && fbmFieldFaceKeys.every((key) => rawParamMeta[key]?.visible !== true);
    for (const parameter of nodeGraphModuleDefinitions[type].parameters || []) {
      // Legacy source "level" → "amplitude" (RoundShape and other sources).
      const legacyLevelMeta = parameter.key === "amplitude" ? rawParamMeta.level : undefined;
      const metadata = normalizeNodeGraphPatchParameterMetadata(
        type,
        parameter.key,
        rawParamMeta[parameter.key] ?? legacyLevelMeta,
      );
      // Raster RGB: contrast/brightness used to be 0…1 unipolar.
      if (
        type === "rasterRgb"
        && (parameter.key === "contrast" || parameter.key === "brightness")
        && metadata
        && Number(metadata.min) === 0
      ) {
        metadata.min = -4;
      }
      if (
        type === "rasterRgb"
        && (parameter.key === "width" || parameter.key === "height")
        && metadata
      ) {
        if (Number(metadata.min) < 0) {
          metadata.min = 0;
        }
        if (
          (parameter.key === "width" && Number(metadata.max) === 320)
          || (parameter.key === "height" && Number(metadata.max) === 240)
        ) {
          metadata.max = 512;
        }
        if (Number(metadata.maxDigits) > 0 || !Object.hasOwn(metadata, "maxDigits")) {
          metadata.maxDigits = 0;
        }
      }
      if (liftFbmFieldFaceParams && fbmFieldFaceKeys.includes(parameter.key)) {
        metadata.visible = true;
      }
      paramMeta[parameter.key] = metadata;
      let value = Object.hasOwn(rawParams, parameter.key)
        ? rawParams[parameter.key]
        : (parameter.key === "amplitude" && Object.hasOwn(rawParams, "level")
          ? rawParams.level
          : (parameter.key === "filters"
            && type === "phaseDisperse"
            && Object.hasOwn(rawParams, "amount")
            ? (typeof nodeGraphPhaseDisperseAmountToStages === "function"
              ? nodeGraphPhaseDisperseAmountToStages(rawParams.amount)
              : 1 + Math.max(0, Math.min(1, Number(rawParams.amount) || 0)) * 63)
            : parameter.defaultValue));
      // Old Active Filter had a single Frequency knob. Missing Low/High inherit it.
      if (
        type === "activeFilter"
        && (parameter.key === "lowFrequency" || parameter.key === "highFrequency")
        && !Object.hasOwn(rawParams, parameter.key)
        && Object.hasOwn(rawParams, "frequency")
      ) {
        const hz = Number(rawParams.frequency);
        if (Number.isFinite(hz) && hz >= 0) {
          value = hz;
        }
      }
      // Squares+offset era → absolute W×H. Missing Squares means W×H already absolute.
      if (
        type === "rasterRgb"
        && (parameter.key === "width" || parameter.key === "height")
        && Object.hasOwn(rawParams, "squares")
      ) {
        const squares = Number(rawParams.squares) || 0;
        const offset = Number(value);
        value = Math.max(0, Math.round((Number.isFinite(offset) ? offset : 0) + squares));
      }
      // Smooth Graph Curve: collapse old 6-choice layout (Linear/Smooth/Bezier/
      // Quadratic/Cubic/Catmull) where Smooth/Bezier/Catmull were one path.
      // Detect old layout via saved max≥5 or orphan indices 4–5.
      // Inertial Filter: Attack/Release used to be 0…1 mix/sample. Now Hz.
      if (
        type === "inertialFilter"
        && (parameter.key === "attack" || parameter.key === "release")
      ) {
        const sourceMax = Number(rawParamMeta[parameter.key]?.max);
        const n = Number(value);
        const legacyUnit = Number.isFinite(sourceMax) && sourceMax <= 1 && sourceMax > 0;
        const legacyDefault = !Number.isFinite(sourceMax)
          && Number.isFinite(n)
          && (
            (parameter.key === "attack" && n === 1)
            || (parameter.key === "release" && Math.abs(n - 0.005) < 1e-9)
          );
        if ((legacyUnit || legacyDefault) && Number.isFinite(n) && n >= 0 && n <= 1) {
          value = n >= 1
            ? 20000
            : (n <= 0 ? 0 : -44100 * Math.log(1 - n) / (2 * Math.PI));
        }
      }
      if (type === "graph2" && parameter.key === "smoothingMode") {
        const sourceMax = Number(node.paramMeta?.[parameter.key]?.max);
        const n = Math.round(Number(value));
        const looksLegacySix = (Number.isFinite(sourceMax) && sourceMax >= 5)
          || n === 4
          || n === 5;
        if (looksLegacySix && typeof nodeGraphGraph2SmoothingModeFourIndexFromLegacy === "function") {
          value = nodeGraphGraph2SmoothingModeFourIndexFromLegacy(value);
        } else if (looksLegacySix) {
          // Fallback if graph-utils not loaded yet (plan/worklet paths).
          const six = [0, 1, 1, 2, 3, 1];
          value = Number.isFinite(n) && n >= 0 && n < six.length ? six[n] : 1;
        }
      }
      params[parameter.key] = normalizeNodeGraphPatchParameter(
        type,
        parameter.key,
        value,
        metadata,
      );
    }
    ids.add(id);
    const normalizedNode = {
      gx,
      gy,
      id,
      paramMeta,
      params,
      type,
      ...(Object.keys(normalizeNodeGraphPatchPortMeta(node.portMeta)).length
        ? { portMeta: normalizeNodeGraphPatchPortMeta(node.portMeta) }
        : {}),
      ...(normalizeNodeGraphPatchNodeAlias(node.alias)
        ? { alias: normalizeNodeGraphPatchNodeAlias(node.alias) }
        : {}),
      ...(hasCustomWidth ? { widthGu } : {}),
      ...(hasCustomModuleHeight ? { heightGu } : {}),
    };
    if (nodeGraphModuleDefinitions[type].layout === "textBox") {
      normalizedNode.layout = normalizeNodeGraphTextBoxLayout(node.layout);
    } else if (type === "keypad" && typeof normalizeNodeGraphKeypadLayout === "function") {
      normalizedNode.layout = normalizeNodeGraphKeypadLayout(node.layout);
    } else if (nodeGraphModuleDefinitions[type].layout === "image") {
      normalizedNode.layout = normalizeNodeGraphImageLayout(node.layout);
    } else if (type === "led") {
      normalizedNode.vectorDotSettings = typeof normalizeNodeGraphVectorDotSettings === "function"
        ? normalizeNodeGraphVectorDotSettings(
          node.vectorDotSettings
          || (typeof nodeGraphMigrateLegacyLedToVectorDot === "function"
            ? nodeGraphMigrateLegacyLedToVectorDot(node.led)
            : node.led),
        )
        : (node.vectorDotSettings || {});
    } else if (type === "lcdDot") {
      normalizedNode.vectorDotSettings = typeof normalizeNodeGraphLcdDotSettings === "function"
        ? normalizeNodeGraphLcdDotSettings(node.vectorDotSettings)
        : (node.vectorDotSettings || {});
    }
    if (nodeGraphModuleIsGraphType(type)) {
      const phaseLinkedGraph = nodeGraphGraphWithPhaseCursor(normalizedNode, node.graph);
      normalizedNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(normalizedNode)
        ? nodeGraphGraphWithLockedEndpointY(phaseLinkedGraph)
        : phaseLinkedGraph;
    }
    if (type === "codeblock") {
      normalizedNode.codeblock = normalizeNodeGraphCodeblock(node.codeblock);
    }
    if (type === "customDisplay") {
      normalizedNode.customDisplay = normalizeNodeGraphCustomDisplay(node.customDisplay);
    }
    if (type === "bugButton") {
      normalizedNode.bugButton = {
        glyph: normalizeNodeGraphBugButtonGlyph(node.bugButton?.glyph),
      };
    }
    // matrixWaterfall = rain glyphs; matrixDisplay = plate message; asciiscope = XY glyphRamp.
    if (type === "matrixWaterfall" && typeof normalizeNodeGraphMatrixWaterfall === "function") {
      normalizedNode.matrixWaterfall = normalizeNodeGraphMatrixWaterfall(
        node.matrixWaterfall || node.matrixDisplay,
      );
    }
    if (type === "matrixDisplay") {
      if (typeof normalizeNodeGraphMatrixPlate === "function") {
        normalizedNode.matrixDisplay = normalizeNodeGraphMatrixPlate(node.matrixDisplay);
      } else if (typeof normalizeNodeGraphAsciiscope === "function") {
        normalizedNode.matrixDisplay = normalizeNodeGraphAsciiscope(node.matrixDisplay);
      }
    }
    if (type === "asciiscope" && typeof normalizeNodeGraphMatrixDisplay === "function") {
      const xy = node.asciiscope?.glyphRamp != null ? node.asciiscope : node.matrixDisplay;
      normalizedNode.asciiscope = normalizeNodeGraphMatrixDisplay(xy);
    }
    if (type === "textStream" && typeof normalizeNodeGraphTextStream === "function") {
      normalizedNode.textStream = normalizeNodeGraphTextStream(node.textStream);
    }
    if (type === "knob" && typeof normalizeNodeGraphKnobFace === "function") {
      const face = normalizeNodeGraphKnobFace(node.knobFace);
      if (typeof nodeGraphKnobFaceIsNonDefault === "function"
        ? nodeGraphKnobFaceIsNonDefault(face)
        : (typeof nodeGraphKnobFaceHasAnyImage === "function"
          ? nodeGraphKnobFaceHasAnyImage(face)
          : face.layers?.some?.((layer) => layer?.dataUrl))) {
        normalizedNode.knobFace = typeof nodeGraphKnobFaceToPatch === "function"
          ? nodeGraphKnobFaceToPatch(face)
          : face;
      }
    }
    if (type === "rgbPicture" && typeof normalizeNodeGraphRgbPictureSettings === "function") {
      const picture = normalizeNodeGraphRgbPictureSettings(
        node.rgbPicture || node.traceDisplaySettings,
      );
      if (picture.dataUrl || (picture.background && picture.background !== "#000000")) {
        normalizedNode.rgbPicture = typeof nodeGraphRgbPictureToPatch === "function"
          ? nodeGraphRgbPictureToPatch(picture)
          : picture;
      }
    }
    const normalizedPortScripts = normalizeNodeGraphPortScripts(type, node.portScripts);
    if (normalizedPortScripts) {
      normalizedNode.portScripts = normalizedPortScripts;
    }
    if (type === "canvas") {
      normalizedNode.canvasScript = normalizeNodeGraphCanvasScript(node.canvasScript);
    }
    if (type === "screenSpaceShader") {
      normalizedNode.screenSpaceShader = normalizeNodeGraphScreenSpaceShader(node.screenSpaceShader);
    }
    Object.assign(normalizedNode, cloneNodeGraphTypedDisplaySettings(node));
    if (Object.hasOwn(node, "scopeShader")) {
      normalizedNode.scopeShader = normalizeNodeGraphScopeShader(node.scopeShader);
    }
    if (type === "moduleGroup") {
      normalizedNode.moduleGroup = normalizeNodeGraphModuleGroup(node.moduleGroup);
    }
    if (
      (type === "samplePlayer" || type === "sampleLooper" || type === "audioPlayer") &&
      node.sample
    ) {
      const pointer = typeof normalizeNodeGraphNodeSamplePointer === "function"
        ? normalizeNodeGraphNodeSamplePointer(node.sample)
        : (normalizeNodeGraphSampleId(node.sample?.id) ? { id: normalizeNodeGraphSampleId(node.sample.id) } : null);
      if (pointer) {
        normalizedNode.sample = pointer;
      }
    }
    if (type === "audioPlayer" && Object.hasOwn(node, "phosphorWaveformSettings")) {
      normalizedNode.phosphorWaveformSettings = normalizeNodeGraphPhosphorWaveformSettings(node.phosphorWaveformSettings);
    }
    // Remembered playhead (0..1) so Music Player restores position after refresh.
    if (type === "audioPlayer" && Object.hasOwn(node, "samplePhase")) {
      const samplePhase = Number(node.samplePhase);
      if (Number.isFinite(samplePhase)) {
        normalizedNode.samplePhase = Math.max(0, Math.min(1, samplePhase));
      }
    }
    if (type === "audioPlayer" && Object.hasOwn(node, "playlist") && typeof nodeGraphAudioPlayerPlaylistNormalize === "function") {
      normalizedNode.playlist = nodeGraphAudioPlayerPlaylistNormalize(node.playlist);
    }
    if (type === "phosphillator") {
      const drawnPath = normalizeNodeGraphPhosphillatorDrawnPath(node.drawnPath);
      if (drawnPath) {
        normalizedNode.drawnPath = drawnPath;
      }
    }
    const ui = nodeGraphModuleDefinitions[type].layout === "textBox" && !Object.hasOwn(node, "ui")
      ? { buttonsHidden: true }
      : normalizeNodeGraphPatchNodeUi(node.ui, node.type);
    // Drop legacy multi-mode face selection (one display type per module now).
    if (ui.displayModeKey) {
      ui.displayModeKey = "";
    }
    if (
      ui.buttonsHidden
      || ui.buttonsForceShow
      || ui.ioHidden
      || ui.hideUnused
      || ui.interfaceControlsHidden
      || ui.interfaceControlsForceShow
      || ui.movementLocked
      || ui.titleHidden
      || ui.oscilloscopeHidden
      || ui.oscilloscopeForceShow
      || ui.slidersHidden
      || ui.slidersForceShow
      || ui.displayHeightOffsetGu
    ) {
      normalizedNode.ui = ui;
    }
    return normalizedNode;
  });
  const uiItems = normalizeNodeGraphPatchUiItems(patch.uiItems, { nodeIds: ids });

  const bypassedNodes = [];
  const bypassedNodeIds = new Set();
  if (patch.bypassedNodes !== undefined && !Array.isArray(patch.bypassedNodes)) {
    throw new Error("bypassedNodes must be an array");
  }
  for (const value of patch.bypassedNodes || []) {
    const id = String(value || "").trim();
    if (!id) {
      throw new Error("bypassedNodes entry missing node id");
    }
    if (!ids.has(id)) {
      // Dropped unknown/retired node — ignore stale bypass entry.
      if (droppedNodeIds.has(id)) {
        continue;
      }
      throw new Error(`bypassed node missing: ${id}`);
    }
    if (id === "output") {
      throw new Error("output module cannot be bypassed");
    }
    if (!bypassedNodeIds.has(id)) {
      bypassedNodeIds.add(id);
      bypassedNodes.push(id);
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connectionKeys = new Set();
  const connections = (Array.isArray(patch.connections) ? patch.connections : []).flatMap((connection) => {
    const sourceNode = String(connection.sourceNode || "").trim();
    let sourcePort = String(connection.sourcePort || "").trim();
    const destinationNode = String(connection.destinationNode || "").trim();
    let destinationPort = String(connection.destinationPort || "").trim();
    const sourceType = nodeById.get(sourceNode)?.type;
    const destinationType = nodeById.get(destinationNode)?.type;
    if (!sourceType || !destinationType) {
      if (retiredNodeIds.has(sourceNode) || retiredNodeIds.has(destinationNode)) {
        return [];
      }
      throw new Error("connection references missing node");
    }
    sourcePort = nodeGraphCanonicalOutputPort(sourceType, sourcePort);
    if (!nodeGraphPatchNodeOutputPorts(nodeById.get(sourceNode)).includes(sourcePort)) {
      throw new Error(`connection source port invalid: ${sourceNode}.${sourcePort}`);
    }
    if (destinationType === "output" && destinationPort === "In") {
      destinationPort = "Mono";
    }
    destinationPort = nodeGraphCanonicalInputPort(destinationType, destinationPort);
    if (!nodeGraphPatchNodeInputPorts(nodeById.get(destinationNode)).includes(destinationPort)) {
      throw new Error(`connection destination port invalid: ${destinationNode}.${destinationPort}`);
    }
    const key = `${sourceNode}.${sourcePort}->${destinationNode}.${destinationPort}`;
    if (connectionKeys.has(key)) {
      return [];
    }
    connectionKeys.add(key);
    return [{
      destinationNode,
      destinationPort,
      sourceNode,
      sourcePort,
      ...(typeof nodeGraphWireOptionalPatchFields === "function"
        ? nodeGraphWireOptionalPatchFields(connection)
        : {
          ...(nodeGraphWireTypePatchValue(connection.wireType)
            ? { wireType: nodeGraphWireTypePatchValue(connection.wireType) }
            : {}),
          ...(normalizeNodeGraphTracePoints(connection.tracePoints).length
            ? { tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints) }
            : {}),
        }),
    }];
  });

  const modulationKeys = new Set();
  const modulations = (Array.isArray(patch.modulations) ? patch.modulations : [])
    .flatMap((modulation) => {
      const sourceNode = String(modulation.sourceNode || "").trim();
      let sourcePort = String(modulation.sourcePort || "").trim();
      const destinationNode = String(modulation.destinationNode || "").trim();
      const destinationParam = String(modulation.destinationParam || "").trim();
      if (!sourceNode || !sourcePort || !destinationNode || !destinationParam) {
        throw new Error("modulation entries require sourceNode, sourcePort, destinationNode, destinationParam");
      }
      const sourceType = nodeById.get(sourceNode)?.type;
      const destinationType = nodeById.get(destinationNode)?.type;
      if (!sourceType || !destinationType) {
        if (retiredNodeIds.has(sourceNode) || retiredNodeIds.has(destinationNode)) {
          return [];
        }
        throw new Error("modulation references missing node");
      }
      sourcePort = nodeGraphCanonicalOutputPort(sourceType, sourcePort);
      if (!nodeGraphPatchNodeOutputPorts(nodeById.get(sourceNode)).includes(sourcePort)) {
        throw new Error(`modulation source port invalid: ${sourceNode}.${sourcePort}`);
      }
      const destinationPatchNode = nodeById.get(destinationNode);
      if (!nodeGraphPatchNodeParameterDefinitions(destinationPatchNode).some((parameter) => parameter.key === destinationParam)) {
        throw new Error(`modulation destination parameter invalid: ${destinationNode}.${destinationParam}`);
      }
      const key = `${sourceNode}.${sourcePort}->${destinationNode}.${destinationParam}`;
      if (modulationKeys.has(key)) {
        return [];
      }
      modulationKeys.add(key);
      return [{
        destinationNode,
        destinationParam,
        sourceNode,
        sourcePort,
        ...(typeof nodeGraphWireOptionalPatchFields === "function"
          ? nodeGraphWireOptionalPatchFields(modulation)
          : {
            ...(nodeGraphWireTypePatchValue(modulation.wireType)
              ? { wireType: nodeGraphWireTypePatchValue(modulation.wireType) }
              : {}),
            ...(normalizeNodeGraphTracePoints(modulation.tracePoints).length
              ? { tracePoints: normalizeNodeGraphTracePoints(modulation.tracePoints) }
              : {}),
          }),
      }];
    });

  const graphConnectionKeys = new Set();
  const graphConnections = Array.isArray(patch.graphConnections) ? patch.graphConnections.flatMap((connection) => {
    const sourceNode = String(connection.sourceNode || "").trim();
    let sourcePort = String(connection.sourcePort || "").trim();
    const destinationNode = String(connection.destinationNode || "").trim();
    const destinationGraphInput = String(connection.destinationGraphInput || "").trim();
    if (!sourceNode || !sourcePort || !destinationNode || !destinationGraphInput) {
      throw new Error("graph connection entries require sourceNode, sourcePort, destinationNode, destinationGraphInput");
    }
    const sourcePatchNode = nodeById.get(sourceNode);
    const destinationPatchNode = nodeById.get(destinationNode);
    const sourceType = sourcePatchNode?.type;
    const destinationType = destinationPatchNode?.type;
    if (!sourceType || !destinationType) {
      if (retiredNodeIds.has(sourceNode) || retiredNodeIds.has(destinationNode)) {
        return [];
      }
      throw new Error("graph connection references missing node");
    }
    sourcePort = nodeGraphCanonicalOutputPort(sourceType, sourcePort);
    if (!nodeGraphModuleIsGraphType(sourceType) || sourcePort !== "Out") {
      throw new Error(`graph connection source must be Graph.Out or Graph 2.Out: ${sourceNode}.${sourcePort}`);
    }
    if (!nodeGraphModuleGraphInputs(destinationType).includes(destinationGraphInput)) {
      throw new Error(`graph connection destination invalid: ${destinationNode}.${destinationGraphInput}`);
    }
    const key = `${sourceNode}.${sourcePort}->${destinationNode}.${destinationGraphInput}`;
    if (graphConnectionKeys.has(key)) {
      return [];
    }
    graphConnectionKeys.add(key);
    return [{
      destinationGraphInput,
      destinationNode,
      sourceNode,
      sourcePort,
      ...(typeof nodeGraphWireOptionalPatchFields === "function"
        ? nodeGraphWireOptionalPatchFields(connection)
        : {
          ...(nodeGraphWireTypePatchValue(connection.wireType)
            ? { wireType: nodeGraphWireTypePatchValue(connection.wireType) }
            : {}),
          ...(normalizeNodeGraphTracePoints(connection.tracePoints).length
            ? { tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints) }
            : {}),
        }),
    }];
  }) : [];

  const view = normalizeNodeGraphPatchView(patch.view);
  if (view.widthGu && view.widthGu < nodeGraphWorkspaceViewLimits.minWidthGu) {
    throw new Error(`view.widthGu must be 0 or at least ${nodeGraphWorkspaceViewLimits.minWidthGu}`);
  }
  if (view.heightGu && view.heightGu < nodeGraphWorkspaceViewLimits.minHeightGu) {
    throw new Error(`view.heightGu must be 0 or at least ${nodeGraphWorkspaceViewLimits.minHeightGu}`);
  }

  const normalized = {
    activeCameraId: cameraState.activeCameraId,
    audio: normalizeNodeGraphPatchAudio(patch.audio),
    bypassedNodes,
    cameras: cameraState.cameras,
    codeScreen: normalizeNodeGraphCodeScreen(patch.codeScreen),
    connections,
    format: { ...nodeGraphPatchFormat },
    graphConnections,
    grid,
    info: normalizeNodeGraphPatchInfo(patch.info),
    modularOnlyControlsVisible: Boolean(patch.modularOnlyControlsVisible),
    modulations,
    monitors: normalizeNodeGraphPatchMonitors(patch.monitors, {
      ...patch,
      nodes,
    }),
    nodes,
    requiredAssets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch({
        ...patch,
        nodes,
        samples: typeof normalizeNodeGraphPatchSamples === "function"
          ? normalizeNodeGraphPatchSamples(patch.samples)
          : [],
      })
      : [],
    samples: typeof normalizeNodeGraphPatchSamples === "function"
      ? normalizeNodeGraphPatchSamples(patch.samples)
      : [],
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    uiItems,
    view,
    visual: normalizeNodeGraphPatchVisual(patch.visual),
    windows: normalizeNodeGraphPatchWindows(patch.windows),
  };
  if (loadWarnings.length) {
    // Ephemeral — stripped before serialize / commit persistence.
    normalized.loadWarnings = loadWarnings;
  }
  return normalized;
}

/**
 * Hard-fail patch load diagnostics. No soft recovery — either the patch
 * validates or we throw with a concrete source line.
 *
 * Message shape:
 *   failed to load patch at: line N: <that line of patch code>
 *   <underlying reason>
 */

function nodeGraphPatchSourceLines(text) {
  return String(text ?? "").split(/\r?\n/);
}

function nodeGraphPatchFindLineNumber(sourceText, needle) {
  const target = String(needle || "").trim();
  if (!target) {
    return 0;
  }
  const lines = nodeGraphPatchSourceLines(sourceText);
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(target)) {
      return i + 1;
    }
  }
  return 0;
}

/** Map JSON SyntaxError / message → 1-based line in sourceText. */
function nodeGraphPatchErrorLineNumber(sourceText, error) {
  const source = String(sourceText ?? "");
  const msg = String(error?.message || error || "");

  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = Math.max(0, Number(posMatch[1]) || 0);
    let line = 1;
    const limit = Math.min(pos, source.length);
    for (let i = 0; i < limit; i += 1) {
      if (source.charCodeAt(i) === 10) {
        line += 1;
      }
    }
    return line;
  }

  const lineMatch = msg.match(/\bline\s+(\d+)\b/i);
  if (lineMatch) {
    return Math.max(1, Number(lineMatch[1]) || 1);
  }

  // Validation messages often name a type or id — land on that line of JSON.
  const typeMatch = msg.match(/unknown node type\s+([A-Za-z0-9_.:-]+)/i);
  if (typeMatch) {
    const t = typeMatch[1];
    const hit = nodeGraphPatchFindLineNumber(source, `"type": "${t}"`)
      || nodeGraphPatchFindLineNumber(source, `"type":"${t}"`);
    if (hit) {
      return hit;
    }
  }

  const idMatch = msg.match(/(?:duplicate node id|bypassed node missing:|node)\s+([A-Za-z0-9_.:-]+)/i);
  if (idMatch) {
    const id = idMatch[1];
    if (id !== "id" && id !== "type" && id !== "missing") {
      const hit = nodeGraphPatchFindLineNumber(source, `"id": "${id}"`)
        || nodeGraphPatchFindLineNumber(source, `"id":"${id}"`);
      if (hit) {
        return hit;
      }
    }
  }

  const portMatch = msg.match(/(?:source port invalid|destination port invalid|destination parameter invalid):\s*([A-Za-z0-9_.:-]+)/i);
  if (portMatch) {
    const nodeId = String(portMatch[1]).split(".")[0];
    if (nodeId) {
      const hit = nodeGraphPatchFindLineNumber(source, `"id": "${nodeId}"`)
        || nodeGraphPatchFindLineNumber(source, `"id":"${nodeId}"`);
      if (hit) {
        return hit;
      }
    }
  }

  return source ? 1 : 1;
}

function nodeGraphPatchLoadFailureMessage(sourceText, lineNumber, detail) {
  const lines = nodeGraphPatchSourceLines(sourceText);
  const total = Math.max(1, lines.length);
  const raw = Number(lineNumber);
  const lineNo = Number.isFinite(raw) && raw >= 1
    ? Math.min(total, Math.floor(raw))
    : 1;
  const line = lines[lineNo - 1] ?? "";
  const reason = String(detail || "").trim();
  const head = `failed to load patch at: line ${lineNo}: ${line.trimEnd()}`;
  return reason ? `${head}\n${reason}` : head;
}

function nodeGraphPatchThrowLoadFailure(sourceText, error) {
  const source = String(sourceText ?? "");
  const existing = String(error?.message || error || "");
  // Preserve prior hard-fail message; still attach script + open dialog.
  let message = existing;
  if (!existing.startsWith("failed to load patch at:")) {
    const line = nodeGraphPatchErrorLineNumber(source, error);
    message = nodeGraphPatchLoadFailureMessage(source, line, existing);
  }
  const fail = new Error(message);
  fail.patchScript = source;
  fail.patchLoadFailure = true;
  // Keep the script on screen — do not rely on clipboard alone.
  if (typeof nodeGraphShowPatchLoadFault === "function") {
    try {
      nodeGraphShowPatchLoadFault({ message, script: source });
    } catch (_error) {
      // Dialog optional at early boot; still throw.
    }
  }
  throw fail;
}

/**
 * Load + validate a patch from JSON text. Hard-fails with line context for
 * parse / structural errors. Unknown module types are dropped (like delete)
 * and reported via the patch-load fault dialog; the cleaned patch is returned.
 */
function loadNodeGraphPatchFromScript(text) {
  const source = String(text ?? "");
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    nodeGraphPatchThrowLoadFailure(source, error);
  }
  try {
    const patch = validateNodeGraphPatch(data);
    const warnings = Array.isArray(patch.loadWarnings) ? patch.loadWarnings.slice() : [];
    delete patch.loadWarnings;
    if (warnings.length) {
      let prettyClean = source;
      try {
        prettyClean = typeof serializeNodeGraphPatch === "function"
          ? serializeNodeGraphPatch(patch)
          : JSON.stringify(patch, null, 2);
        if (typeof prettyClean !== "string") {
          prettyClean = JSON.stringify(patch, null, 2);
        }
      } catch (_error) {
        try {
          prettyClean = JSON.stringify(patch, null, 2);
        } catch (__error) {
          prettyClean = source;
        }
      }
      // Cite first unknown type line in the original pretty source when possible.
      let prettySource = source;
      try {
        prettySource = JSON.stringify(data, null, 2);
      } catch (_error) {
        prettySource = source;
      }
      const firstDetail = warnings[0] || "unknown node type";
      const typeMatch = firstDetail.match(/unknown node type\s+(\S+)/i);
      const line = typeMatch
        ? nodeGraphPatchFindLineNumber(prettySource, `"type": "${typeMatch[1]}"`)
          || nodeGraphPatchFindLineNumber(prettySource, `"type":"${typeMatch[1]}"`)
          || 1
        : 1;
      const message = [
        nodeGraphPatchLoadFailureMessage(prettySource, line, firstDetail),
        ...(warnings.length > 1 ? warnings.slice(1) : []),
        "",
        "Unknown modules were removed (as if deleted). Close to keep the cleaned patch in the script editor.",
      ].join("\n");
      if (typeof nodeGraphShowPatchLoadFault === "function") {
        try {
          nodeGraphShowPatchLoadFault({
            message,
            script: prettyClean,
            title: "Unknown modules removed",
            softRecovered: true,
          });
        } catch (_error) {
          // Dialog optional.
        }
      }
    }
    return patch;
  } catch (error) {
    // Pretty-print so line numbers match readable patch JSON when possible.
    let pretty = source;
    try {
      pretty = JSON.stringify(data, null, 2);
    } catch (_error) {
      pretty = source;
    }
    nodeGraphPatchThrowLoadFailure(pretty, error);
  }
}

/**
 * Load + validate an in-memory patch object. Hard-fails with line context from
 * a pretty-printed snapshot (no silent null / soft recovery).
 */
function loadNodeGraphPatchFromObject(patch) {
  let pretty = "";
  try {
    pretty = JSON.stringify(patch, null, 2);
  } catch (error) {
    throw new Error(
      nodeGraphPatchLoadFailureMessage(
        "(unserializable patch)",
        1,
        error?.message || String(error),
      ),
    );
  }
  return loadNodeGraphPatchFromScript(pretty);
}

function nodeGraphModuleShouldBeVisible(node) {
  void node;
  // Input modules stay on the graph even when the bottom Input button is Off.
  // Live capture is still gated by inputActive (runtime bypass / host stream).
  return true;
}

function nodeGraphPatchNodeIsVisible(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  return Boolean(
    node &&
    nodeGraphModuleShouldBeVisible(node),
  );
}

function nodeGraphModuleStructuralUiSignature(patchNode) {
  const patchNodeUi = typeof nodeGraphEffectivePatchNodeUi === "function"
    ? nodeGraphEffectivePatchNodeUi(patchNode?.ui, patchNode?.type)
    : (patchNode?.ui || {});
  return [
    patchNodeUi.oscilloscopeHidden ? "scope-hidden" : "scope-visible",
    patchNodeUi.titleHidden ? "title-hidden" : "title-visible",
  ].join("|");
}

function nodeGraphModulePortSignature(patchNode) {
  const outputPorts = nodeGraphPatchNodeOutputPorts(patchNode).filter(
    (port) => !(nodeGraphModuleDefinitions[patchNode.type]?.parameters || []).some((parameter) => parameter.key === port),
  );
  return `${nodeGraphPatchNodeInputPorts(patchNode).join(",")}=>${outputPorts.join(",")}=>${nodeGraphModuleGraphInputs(patchNode.type).join(",")}`;
}

function syncNodeGraphModuleChromeElement(element, patchNode) {
  const patchNodeUi = nodeGraphEffectivePatchNodeUi(patchNode.ui, patchNode.type);
  const structuralUiSignature = nodeGraphModuleStructuralUiSignature(patchNode);
  element.style.setProperty("--node-grid-width-units", String(nodeGraphPatchNodeGridWidthUnits(patchNode)));
  element.style.setProperty("--node-grid-height-units", String(nodeGraphPatchNodeGridHeightUnits(patchNode)));
  if (typeof nodeGraphApplyModuleShellHeightCssVars === "function") {
    nodeGraphApplyModuleShellHeightCssVars(element, patchNode);
  } else {
    element.style.setProperty("--node-module-display-height-units", String(nodeGraphPatchNodeDisplayHeightUnits(patchNode)));
  }
  element.style.setProperty("--node-module-interface-controls-height-units", String(nodeGraphPatchNodeInterfaceControlsHeightUnits(patchNode)));
  const point = nodeGraphGridToPixel(patchNode);
  positionNodeGraphNode(element, point, { clamp: false, snap: false });
  element.hidden = !nodeGraphModuleShouldBeVisible(patchNode);
  element.dataset.gridX = String(patchNode.gx);
  element.dataset.gridY = String(patchNode.gy);
  element.dataset.gridWidthGu = String(nodeGraphPatchNodeGridWidthUnits(patchNode));
  element.dataset.gridHeightGu = String(nodeGraphPatchNodeGridHeightUnits(patchNode));
  element.dataset.portSignature = nodeGraphModulePortSignature(patchNode);
  element.dataset.structuralUiSignature = structuralUiSignature;
  const titleText = element.querySelector(".node-header-title");
  if (titleText) {
    const chromeTitle = typeof nodeGraphPatchNodeTitle === "function"
      ? nodeGraphPatchNodeTitle(patchNode)
      : (typeof nodeGraphModuleChromeTitle === "function"
        ? nodeGraphModuleChromeTitle(patchNode)
        : nodeGraphDefaultNodeTitle(patchNode.type, patchNode.id));
    if (titleText.tagName === "INPUT") {
      if (document.activeElement !== titleText) {
        titleText.value = chromeTitle;
      }
    } else {
      titleText.textContent = chromeTitle;
    }
    if (typeof scheduleNodeGraphModuleTitleTextFit === "function") {
      scheduleNodeGraphModuleTitleTextFit();
    }
  }
  element.classList.toggle("buttons-hidden", patchNodeUi.buttonsHidden);
  element.classList.toggle("buttons-forced-visible", Boolean(patchNodeUi.buttonsForceShow));
  element.classList.toggle("io-hidden", patchNodeUi.ioHidden);
  element.classList.toggle(
    "unused-hidden",
    Boolean(normalizeNodeGraphPatchNodeUi(patchNode.ui, patchNode.type).hideUnused),
  );
  element.classList.toggle("interface-controls-hidden", patchNodeUi.interfaceControlsHidden);
  element.classList.toggle("interface-controls-forced-visible", Boolean(patchNodeUi.interfaceControlsForceShow));
  element.classList.toggle("movement-locked", patchNodeUi.movementLocked);
  element.classList.toggle("oscilloscope-hidden", patchNodeUi.oscilloscopeHidden);
  element.classList.toggle("oscilloscope-forced-visible", Boolean(patchNodeUi.oscilloscopeForceShow));
  element.classList.toggle("sliders-hidden", patchNodeUi.slidersHidden);
  element.classList.toggle("sliders-forced-visible", Boolean(patchNodeUi.slidersForceShow));
  element.classList.toggle("title-hidden", patchNodeUi.titleHidden);
  element.classList.toggle(
    "title-only",
    typeof nodeGraphModuleIsTitleOnlyUi === "function"
      && nodeGraphModuleIsTitleOnlyUi(patchNode.type, patchNode.ui),
  );
  element.classList.toggle(
    "module-collapsed",
    typeof nodeGraphModuleIsCollapsedUi === "function"
      && nodeGraphModuleIsCollapsedUi(patchNode.type, patchNode.ui),
  );
  if (typeof syncNodeGraphLayoutBNoParamsClass === "function") {
    syncNodeGraphLayoutBNoParamsClass(element, patchNode.type, patchNodeUi);
  }
  const dragHandle = element.querySelector(".node-drag-handle");
  if (dragHandle) {
    dragHandle.textContent = patchNodeUi.movementLocked ? "\uD83D\uDD12" : "\u2725";
    dragHandle.setAttribute(
      "aria-label",
      patchNodeUi.movementLocked
        ? `Unlock ${nodeGraphNodeDisplayName(patchNode.id)} module movement`
        : `Move ${nodeGraphNodeDisplayName(patchNode.id)} module`,
    );
    dragHandle.classList.toggle("node-drag-handle-locked", patchNodeUi.movementLocked);
  }
  const displayButton = element.querySelector(".node-display-settings-button");
  if (displayButton) {
    displayButton.setAttribute("aria-pressed", patchNodeUi.oscilloscopeHidden ? "false" : "true");
  }
  const metaparameterButton = element.querySelector(".node-metaparameter-button");
  if (metaparameterButton) {
    metaparameterButton.setAttribute("aria-pressed", patchNodeUi.slidersHidden ? "false" : "true");
  }
  const bypassed = nodeGraphNodeDisplaysBypassed(patchNode.id);
  element.classList.toggle("bypassed", bypassed);
  const bypassButton = element.querySelector(".node-bypass-button");
  if (bypassButton) {
    bypassButton.setAttribute("aria-pressed", bypassed ? "true" : "false");
    bypassButton.textContent = nodeGraphBypassGlyph(bypassed);
    nodeGraphApplyTooltip(
      bypassButton,
      patchNode.id === "output"
        ? (bypassed ? "module.outputOn" : "module.outputOff")
        : (bypassed ? "module.include" : "module.bypass"),
      {},
      { title: false },
    );
  }
}

function syncNodeGraphModuleParamElement(element, patchNode) {
  for (const parameter of nodeGraphModuleDefinitions[patchNode.type]?.parameters || []) {
    const input = element.querySelector(`input[data-param="${CSS.escape(parameter.key)}"]`);
    if (!input) {
      continue;
    }
    setNodeSliderMetadata(
      input,
      patchNode.paramMeta?.[parameter.key] ||
      nodeGraphParameterDefinitionMetadata(parameter),
    );
    const value = patchNode.params?.[parameter.key] ??
      nodeGraphParameterFallback(patchNode.type, parameter.key);
    if (typeof applyNodeGraphInputUnboundedValue === "function") {
      applyNodeGraphInputUnboundedValue(input, value);
    } else {
      const n = Number(value);
      if (Number.isFinite(n)) {
        input.dataset.domainValue = String(n);
      }
      input.value = String(value);
    }
    syncNodeSliderReadout(input);
  }
  if (typeof refreshNodeGraphModuleParameterVisibility === "function") {
    refreshNodeGraphModuleParameterVisibility(element, patchNode);
  }
  if (typeof scheduleNodeGraphSliderReadoutRelayout === "function") {
    scheduleNodeGraphSliderReadoutRelayout();
  }
  if (typeof syncNodeGraphParameterVisualsForNodeElement === "function") {
    syncNodeGraphParameterVisualsForNodeElement(element);
  } else {
    for (const visual of element.querySelectorAll("[data-parameter-visual]")) {
      visual.syncFromParameters?.();
    }
  }
  if (typeof syncNodeGraphModulePortLabels === "function") {
    syncNodeGraphModulePortLabels(element, patchNode);
  }
  if (nodeGraphModuleDefinitions[patchNode.type]?.layout === "textBox") {
    syncNodeGraphTextBoxElement(element, patchNode);
  } else if (patchNode.type === "keypad" && typeof syncNodeGraphKeypadElement === "function") {
    syncNodeGraphKeypadElement(element, patchNode);
  } else if (nodeGraphModuleDefinitions[patchNode.type]?.layout === "graph") {
    syncNodeGraphGraphElement(element, patchNode);
  } else if (
    patchNode.type === "knob"
    && typeof renderNodeGraphKnobFace === "function"
  ) {
    renderNodeGraphKnobFace(patchNode.id);
  }
}

function applyNodeGraphModuleElementFromPatch(patchNode, options = {}) {
  const container = document.getElementById("nodeGraphNodes");
  if (!container || !patchNode) {
    return null;
  }
  let element = nodeGraphNodeElement(patchNode.id);
  const portSignature = nodeGraphModulePortSignature(patchNode);
  const structuralUiSignature = nodeGraphModuleStructuralUiSignature(patchNode);
  let reusedUnchanged = false;
  if (
    element &&
    (
      element.dataset.nodeType !== patchNode.type ||
      element.dataset.portSignature !== portSignature ||
      element.dataset.structuralUiSignature !== structuralUiSignature
    )
  ) {
    element.remove();
    element = null;
  } else if (element) {
    reusedUnchanged = true;
  }
  if (!element) {
    element = createNodeGraphModuleElement(patchNode.type, patchNode.id);
    container.append(element);
    if (typeof nodeGraphModuleFrameObserve === "function") {
      nodeGraphModuleFrameObserve(element);
    }
    if (typeof nodeGraphViewportCullObserve === "function") {
      nodeGraphViewportCullObserve(element);
    }
  }
  if (options.skipExistingChrome && reusedUnchanged) {
    return element;
  }
  syncNodeGraphModuleChromeElement(element, patchNode);
  if (options.paramSync !== false) {
    syncNodeGraphModuleParamElement(element, patchNode);
  } else if (nodeGraphModuleDefinitions[patchNode.type]?.layout === "textBox") {
    syncNodeGraphTextBoxElement(element, patchNode);
  } else if (patchNode.type === "keypad" && typeof syncNodeGraphKeypadElement === "function") {
    syncNodeGraphKeypadElement(element, patchNode);
  }
  return element;
}

let nodeGraphChromeHeavyTimer = 0;

function scheduleNodeGraphChromeHeavyAfterResize() {
  if (nodeGraphChromeHeavyTimer) {
    window.clearTimeout(nodeGraphChromeHeavyTimer);
  }
  nodeGraphChromeHeavyTimer = window.setTimeout(() => {
    nodeGraphChromeHeavyTimer = 0;
    if (typeof updateNodeGraphGridHeatmap === "function") {
      updateNodeGraphGridHeatmap();
    }
    if (typeof drawNodeGraphWires === "function") {
      drawNodeGraphWires({
        lite: false,
        skipHeatmap: true,
        skipScopes: true,
        skipSelection: true,
      });
    }
  }, 90);
}

function applyNodeGraphChromeNodesToDom(nodeIds = []) {
  const ids = Array.isArray(nodeIds) && nodeIds.length
    ? nodeIds
    : (nodeGraphMvp.patch.nodes || []).map((node) => node.id);
  const elements = [];
  for (const id of ids) {
    const patchNode = nodeGraphPatchNode(id);
    if (!patchNode) {
      continue;
    }
    const element = applyNodeGraphModuleElementFromPatch(patchNode, { paramSync: false });
    if (element) {
      elements.push(element);
    }
  }
  if (typeof scheduleNodeGraphModuleFramesUpdate === "function") {
    for (const element of elements) {
      scheduleNodeGraphModuleFramesUpdate({ force: true, nodeElement: element });
    }
  }
  if (typeof nodeGraphViewportCullObserve === "function") {
    for (const element of elements) {
      nodeGraphViewportCullObserve(element);
    }
  }
  // Heatmap + all-wire measure used to run on every key-repeat size step and
  // forced layout of every module (including off-screen FBM / LCD faces).
  scheduleNodeGraphChromeHeavyAfterResize();
  return elements;
}

function applyNodeGraphPatchToDom(options = {}) {
  if (typeof nodeGraphScreenSoloIsActive === "function" && nodeGraphScreenSoloIsActive()) {
    const soloIds = typeof nodeGraphScreenSoloNodeIds === "function"
      ? nodeGraphScreenSoloNodeIds()
      : [(typeof nodeGraphScreenSoloNodeId === "function" ? nodeGraphScreenSoloNodeId() : "")];
    const stillThere = soloIds.some((id) => id && nodeGraphMvp?.patch?.nodes?.some((node) => node?.id === id));
    if (!stillThere) {
      endNodeGraphScreenSolo({ silent: true });
    }
  }
  const container = document.getElementById("nodeGraphNodes");
  if (!container) {
    return;
  }
  const skipExistingSync = Boolean(options.skipExistingSync);
  const paramSyncIds = Array.isArray(options.paramSyncIds)
    ? new Set(options.paramSyncIds)
    : (options.paramSyncIds instanceof Set ? options.paramSyncIds : null);

  applyNodeGraphWorkspaceView();
  const workspace = document.getElementById("nodeGraphWorkspace");
  const visiblePatchNodeCount = nodeGraphMvp.patch.nodes.filter((node) => nodeGraphModuleShouldBeVisible(node)).length;
  workspace?.classList.toggle("empty-patch", visiblePatchNodeCount === 0);
  const emptyButton = document.getElementById("nodeGraphEmptyModuleButton");
  if (emptyButton) {
    emptyButton.hidden = true;
  }

  for (const element of [...container.querySelectorAll(".dsp-node")]) {
    if (!nodeGraphPatchNode(element.dataset.node)) {
      element.remove();
    }
  }

  for (const patchNode of nodeGraphMvp.patch.nodes) {
    const existing = nodeGraphNodeElement(patchNode.id);
    const syncThis = skipExistingSync
      ? !existing
      : (paramSyncIds ? paramSyncIds.has(patchNode.id) : true);
    const element = applyNodeGraphModuleElementFromPatch(patchNode, {
      paramSync: syncThis,
      skipExistingChrome: Boolean(existing) && (skipExistingSync || (paramSyncIds && !syncThis)),
    });
    if (element && typeof nodeGraphViewportCullObserve === "function") {
      nodeGraphViewportCullObserve(element);
    }
  }
  syncNodeGraphInputModuleLiveState();
  if (typeof bindNodeGraphMacroControlModuleEvents === "function") {
    bindNodeGraphMacroControlModuleEvents();
  }
  if (typeof renderNodeGraphKeyboardControllerModules === "function") {
    renderNodeGraphKeyboardControllerModules();
  }
  if (typeof renderNodeGraphCameraView === "function") {
    renderNodeGraphCameraView();
  }
  syncNodeGraphHeaderTimingWidgets();
  updateNodeGraphGridHeatmap();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
    scheduleNodeGraphWireRedrawAfterLayout();
  }
  if (typeof syncNodeGraphModuleFramesAfterDom === "function") {
    syncNodeGraphModuleFramesAfterDom();
  }
  // Bottom 🔊 mirrors Output.volume + Input.level after every full DOM rebuild.
  if (typeof syncNodeGraphLiveVolumeMirrorsFromModules === "function") {
    syncNodeGraphLiveVolumeMirrorsFromModules();
  } else if (typeof syncNodeGraphLiveOutputVolumeFromOutputModule === "function") {
    syncNodeGraphLiveOutputVolumeFromOutputModule();
  }
  if (typeof nodeGraphScheduleJackVisibilityLog === "function") {
    nodeGraphScheduleJackVisibilityLog("patch-dom");
  }
}

/**
 * Layout-only path after module drag: positions are already on the DOM.
 * Avoid full applyNodeGraphPatchToDom (re-syncs every slider / face / knob),
 * live plan rebuild, and render-pending — none of those depend on gx/gy.
 */
function applyNodeGraphLayoutPositionsToDom(patch = nodeGraphMvp.patch) {
  for (const patchNode of patch?.nodes || []) {
    const element = typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(patchNode.id)
      : null;
    if (!element) {
      continue;
    }
    const point = typeof nodeGraphGridToPixel === "function"
      ? nodeGraphGridToPixel(patchNode)
      : null;
    if (point && typeof positionNodeGraphNode === "function") {
      positionNodeGraphNode(element, point, { clamp: false, snap: false });
    }
    element.dataset.gridX = String(patchNode.gx);
    element.dataset.gridY = String(patchNode.gy);
  }
  if (typeof updateNodeGraphGridHeatmap === "function") {
    updateNodeGraphGridHeatmap();
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
    scheduleNodeGraphWireRedrawAfterLayout();
  }
}

let nodeGraphChromeHistoryTimer = 0;

function scheduleNodeGraphChromeHistoryAndAutosave(options = {}) {
  if (options.record === false && options.autosaveWorkingPatch === false) {
    return;
  }
  if (nodeGraphChromeHistoryTimer) {
    window.clearTimeout(nodeGraphChromeHistoryTimer);
  }
  nodeGraphChromeHistoryTimer = window.setTimeout(() => {
    nodeGraphChromeHistoryTimer = 0;
    if (options.record !== false && typeof recordNodeGraphHistory === "function") {
      recordNodeGraphHistory();
    }
    if (options.autosaveWorkingPatch !== false && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings();
    }
  }, 160);
}

function commitNodeGraphPatch(patch, options = {}) {
  const isWireEdit = Boolean(options.wireEdit);
  // layoutEdit: module move / snap only — skip DOM rebuild + audio plan + render pending.
  const isLayoutEdit = Boolean(options.layoutEdit);
  // topologyEdit: add/remove modules — do not re-sync every existing slider/face.
  const isTopologyEdit = Boolean(options.topologyEdit);
  // chromeEdit: size / show-hide — touch only named modules, defer history/serialize.
  const isChromeEdit = Boolean(options.chromeEdit);
  // softDom: cosmetic module face / label-only edits — keep existing module DOM
  // (avoids image reload flash on Knob readout/rotate toggles).
  const isSoftDom = Boolean(options.softDom || options.faceEdit);
  const skipValidate = Boolean(options.skipValidate);
  if (skipValidate) {
    // Size / show-hide already cloned the live patch. Re-validating every
    // parameter of every module on key-repeat is what made Patch plate resize
    // hitch even when it was the only module on screen.
    nodeGraphMvp.patch = patch;
  } else {
    let validated;
    try {
      validated = validateNodeGraphPatch(patch);
    } catch (error) {
      // Hard fail with source line — no soft recovery.
      let pretty = "";
      try {
        pretty = JSON.stringify(patch, null, 2);
      } catch (_error) {
        pretty = String(error?.message || error || "invalid patch");
      }
      nodeGraphPatchThrowLoadFailure(pretty, error);
    }
    nodeGraphMvp.patch = validated;
  }
  if (typeof preserveNodeGraphEditorZoomOnPatch === "function") {
    preserveNodeGraphEditorZoomOnPatch(nodeGraphMvp.patch);
  }
  if (!isChromeEdit) {
    syncNodeGraphRuntimeFromPatch();
  }
  if (isLayoutEdit) {
    applyNodeGraphLayoutPositionsToDom(nodeGraphMvp.patch);
  } else if (isChromeEdit) {
    applyNodeGraphChromeNodesToDom(options.chromeNodeIds);
  } else if (!isWireEdit && !isSoftDom) {
    applyNodeGraphPatchToDom({
      skipExistingSync: isTopologyEdit,
      paramSyncIds: options.paramSyncIds,
    });
    if (!isTopologyEdit && typeof applyNodeGraphZoom === "function") {
      applyNodeGraphZoom();
    }
    syncNodeGraphMonitorIndicators();
    pruneNodeGraphSelectionAfterPatch();
  }
  // Positions / face cosmetics / chrome size do not change offline render output.
  if (options.markPending !== false && !isLayoutEdit && !isSoftDom && !isChromeEdit) {
    markNodeGraphRenderPending();
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function" && !isSoftDom && !isChromeEdit) {
    scheduleNodeGraphWireRedrawAfterLayout();
  }
  if (options.patchDirtyState) {
    nodeGraphMvp.patchDirtyState = options.patchDirtyState;
  } else if (options.autosaveWorkingPatch !== false) {
    nodeGraphMvp.patchDirtyState = "edited";
  }
  // Audio graph topology/params are unchanged by gx/gy, size, or most chrome.
  // Hide-display may defer a plan sync so the click stays responsive.
  if (isChromeEdit && options.deferLivePlan) {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (typeof scheduleNodeGraphLivePlanSync === "function") {
          scheduleNodeGraphLivePlanSync();
        }
      }, 0);
    });
  } else if (options.liveParamsOnly) {
    if (typeof scheduleNodeGraphLiveParameterSync === "function") {
      scheduleNodeGraphLiveParameterSync();
    } else if (typeof scheduleNodeGraphLivePlanSync === "function") {
      scheduleNodeGraphLivePlanSync();
    }
  } else if (
    options.skipLivePlan !== true
    && (options.livePlan || (!isLayoutEdit && !isSoftDom && !isChromeEdit))
  ) {
    scheduleNodeGraphLivePlanSync();
  }

  const runDeferredUiPanels = () => {
    if (isChromeEdit) {
      if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
        syncNodeGraphCurrentSavedPatchHeader();
      }
      scheduleNodeGraphChromeHistoryAndAutosave(options);
      return;
    }
    if (isSoftDom) {
      // Face-only: skip palette/connection/scope rewrites (those flash modules).
      if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
        syncNodeGraphCurrentSavedPatchHeader();
      }
    } else if (!isLayoutEdit) {
      renderNodePalette();
      if (typeof renderNodeGraphConnectionList === "function") {
        renderNodeGraphConnectionList();
      }
      syncNodeGraphGhostSliders();
      syncNodeGraphFilterCurveDisplays();
      renderNodeGraphVisualSettings();
      syncNodeGraphSettingsView();
      if (typeof renderNodeGraphMissingSampleAssetsDialog === "function") {
        renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch);
      }
      if (typeof renderNodeGraphCodeScreen === "function" && !document.getElementById("nodeCodeScreenView")?.hidden) {
        renderNodeGraphCodeScreen();
      }
      const scriptStatus = nodeGraphPatchScriptStatus(
        options.status || "script synced",
        options.ok ?? true,
      );
      syncNodeGraphScriptView(scriptStatus.message, scriptStatus.ok);
    } else if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
      // Light header dirty-state only — no full script panel rewrite.
      syncNodeGraphCurrentSavedPatchHeader();
    }
    if (options.record !== false) {
      recordNodeGraphHistory();
    } else {
      renderNodeGraphHistoryControls();
    }
    if (options.autosaveWorkingPatch !== false && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings();
    } else if (typeof syncNodeGraphCurrentSavedPatchHeader === "function" && !isLayoutEdit) {
      syncNodeGraphCurrentSavedPatchHeader();
    }
  };

  // Wire/layout/chrome edits keep the UI responsive: history/autosave/palette
  // work runs after the current pointer/frame.
  if (isWireEdit || isLayoutEdit || isChromeEdit || isTopologyEdit || options.deferUiPanels) {
    window.requestAnimationFrame(() => {
      window.setTimeout(runDeferredUiPanels, 0);
    });
  } else {
    runDeferredUiPanels();
  }
}

function clearNodeGraphWires() {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.connections = [];
  patch.graphConnections = [];
  patch.modulations = [];
  setNodeGraphSelection(null);
  markNodeGraphRenderPending();
  commitNodeGraphPatch(patch, { status: "wires cleared" });
}

function deleteSelectedNodeGraphItem() {
  if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Patch is locked.");
    }
    return;
  }
  if (!nodeGraphScriptReadyForGraphAction("delete")) {
    return;
  }
  if (typeof nodeGraphSelectionCanDelete === "function" && !nodeGraphSelectionCanDelete()) {
    return;
  }
  const selection = nodeGraphMvp.selected;
  if (!selection) {
    return;
  }
  const deletingModule = selection.type !== "wire"
    && selection.type !== "wires"
    && (typeof nodeGraphSelectedNodeIds === "function"
      ? [...nodeGraphSelectedNodeIds(selection)].some((id) => {
        const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
        return node
          && typeof nodeGraphNodeCanBeDeleted === "function"
          && nodeGraphNodeCanBeDeleted(node)
          && !(typeof nodeGraphNodeDeleteHidesOnly === "function" && nodeGraphNodeDeleteHidesOnly(node));
      })
      : true);
  if (deletingModule && typeof noteNodeGraphHeavyHistoryAction === "function") {
    noteNodeGraphHeavyHistoryAction("delete");
  }
  if (typeof runNodeGraphHistoryAfterGlow === "function") {
    runNodeGraphHistoryAfterGlow(deletingModule ? "last" : "delete", () => performNodeGraphDeleteSelection(selection));
    return;
  }
  performNodeGraphDeleteSelection(selection);
}

function performNodeGraphDeleteSelection(selection = nodeGraphMvp.selected) {
  if (!selection) {
    return;
  }

  if (selection.type === "wire" || selection.type === "wires") {
    const entries = typeof nodeGraphSelectedWireEntries === "function"
      ? nodeGraphSelectedWireEntries(selection)
      : [{ kind: selection.kind || "signal", index: selection.index }];
    // High → low per kind so indices stay valid while removing.
    const byKind = new Map();
    for (const entry of entries) {
      const kind = entry.kind || "signal";
      if (!byKind.has(kind)) {
        byKind.set(kind, []);
      }
      byKind.get(kind).push(Number(entry.index));
    }
    for (const [kind, indices] of byKind) {
      indices.sort((a, b) => b - a);
      for (const index of indices) {
        disconnectNodeGraphConnection(index, kind);
      }
    }
    return;
  }

  const selectedNodeIds = nodeGraphSelectedNodeIds(selection);
  const hideOnlyNodeIds = new Set();
  const removableNodeIds = new Set();
  for (const nodeId of selectedNodeIds) {
    const node = nodeGraphPatchNode(nodeId);
    if (!nodeGraphNodeCanBeDeleted(node)) {
      continue;
    }
    if (nodeGraphNodeDeleteHidesOnly(node)) {
      hideOnlyNodeIds.add(nodeId);
    } else {
      removableNodeIds.add(nodeId);
    }
  }

  if (hideOnlyNodeIds.size) {
    nodeGraphMvp.live.inputActive = false;
    stopNodeGraphLiveInputSource();
  }

  if (removableNodeIds.size) {
    const live = nodeGraphMvp.patch;
    const patch = {
      ...live,
      nodes: live.nodes.filter((node) => !removableNodeIds.has(node.id)),
      bypassedNodes: (live.bypassedNodes || []).filter((nodeId) => !removableNodeIds.has(nodeId)),
      connections: (live.connections || []).filter(
        (connection) =>
          !removableNodeIds.has(connection.sourceNode) &&
          !removableNodeIds.has(connection.destinationNode),
      ),
      modulations: (live.modulations || []).filter(
        (modulation) =>
          !removableNodeIds.has(modulation.sourceNode) &&
          !removableNodeIds.has(modulation.destinationNode),
      ),
      graphConnections: (live.graphConnections || []).filter(
        (connection) =>
          !removableNodeIds.has(connection.sourceNode) &&
          !removableNodeIds.has(connection.destinationNode),
      ),
    };
    setNodeGraphSelection(null);
    commitNodeGraphPatch(patch, {
      topologyEdit: true,
      deferUiPanels: true,
      status: removableNodeIds.size === 1 ? "module deleted" : "modules deleted",
    });
    renderNodeGraphLiveControls();
    return;
  }

  if (hideOnlyNodeIds.size) {
    setNodeGraphSelection(null);
    applyNodeGraphPatchToDom({ skipExistingSync: true });
    if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
      scheduleNodeGraphWireRedrawAfterLayout();
    } else if (typeof drawNodeGraphWires === "function") {
      drawNodeGraphWires();
    }
    scheduleNodeGraphLivePlanSync();
    renderNodeGraphLiveControls();
    setNodeGraphScriptStatus("input module hidden; script preserved", true);
  }
}

function nodeGraphStableSeed(text) {
  let seed = 0x12345678;
  for (const character of text) {
    seed = (Math.imul(seed ^ character.charCodeAt(0), 16777619)) >>> 0;
  }
  return seed || 0x12345678;
}
