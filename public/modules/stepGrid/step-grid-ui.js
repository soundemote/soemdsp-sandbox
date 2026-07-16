// Fully custom / chromeless UI (see nodeGraphChromelessModuleLayouts in
// node-graph-module-rendering.js) -- moved out of the shared
// node-graph-module-factories.js file since this module doesn't use any of
// the generic header/IO-column/param-row machinery that file mostly builds.
// A future 100% custom-UI module should follow this same shape: its own
// module folder, its own *-ui.js file alongside the *-live-evaluator.js /
// *-worklet-evaluator.js DSP files.

function stepGridStepCount(patchNode) {
  const raw = Math.round(Number(patchNode?.params?.steps));
  return Number.isFinite(raw) ? Math.max(1, Math.min(STEP_GRID_MAX_STEPS, raw)) : 8;
}

// Flips one step's on/off param and commits the patch. Mirrors
// toggleNodeGraphModuleBypassFromNode's clone -> mutate -> commitNodeGraphPatch
// shape (node-graph-module-rendering.js) -- the DOM redraw that follows a
// commit rebuilds this node's body from the new params, so the button's
// visual state never needs to be touched directly here.
function toggleNodeGraphStepGridStep(nodeId, stepIndex, event) {
  if (!nodeGraphScriptReadyForGraphAction("step grid")) {
    return false;
  }
  if (!nodeId || !nodeGraphMvp.activeNodes.has(nodeId)) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (!patchNode) {
    return false;
  }
  const key = `step${stepIndex + 1}`;
  const isOn = Number(patchNode.params?.[key]) > 0.5;
  const nextValue = isOn ? 0 : 1;
  patchNode.params = {
    ...(patchNode.params || {}),
    [key]: normalizeNodeGraphPatchParameter(patchNode.type, key, nextValue, patchNode.paramMeta?.[key]),
  };
  commitNodeGraphPatch(patch, { status: `step ${stepIndex + 1} ${nextValue ? "on" : "off"}` });
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

// Grows/shrinks the visible step count. Steps beyond the new count are left
// untouched in params rather than cleared -- shrinking then regrowing
// restores whatever pattern was there before instead of losing it.
function resizeNodeGraphStepGridSteps(nodeId, delta, event) {
  if (!nodeGraphScriptReadyForGraphAction("step grid")) {
    return false;
  }
  if (!nodeId || !nodeGraphMvp.activeNodes.has(nodeId)) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (!patchNode) {
    return false;
  }
  const current = stepGridStepCount(patchNode);
  const next = Math.max(1, Math.min(STEP_GRID_MAX_STEPS, current + delta));
  if (next === current) {
    return false;
  }
  patchNode.params = {
    ...(patchNode.params || {}),
    steps: normalizeNodeGraphPatchParameter(patchNode.type, "steps", next, patchNode.paramMeta?.steps),
  };
  commitNodeGraphPatch(patch, { status: `steps ${next}` });
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

// Ports are tiny absolutely-positioned buttons glued directly onto the
// body, same pattern as createNodeGraphLedFace's single input port, just
// four of them (two per edge) since this module has Trigger/Reset in and
// Gate/Step out.
function createNodeGraphStepGridBody(node) {
  const type = "stepGrid";
  const patchNode = nodeGraphPatchNode(node);
  const stepCount = stepGridStepCount(patchNode);
  const body = document.createElement("div");
  body.className = "node-step-grid-body";
  body.dataset.node = node;
  body.dataset.nodeType = type;
  body.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} step grid`);

  const inputColumn = document.createElement("div");
  inputColumn.className = "node-step-grid-ports node-step-grid-ports-input";
  inputColumn.append(createNodeGraphPort(node, type, "Trigger", "input"));
  inputColumn.append(createNodeGraphPort(node, type, "Reset", "input"));
  body.append(inputColumn);

  const row = document.createElement("div");
  row.className = "node-step-grid-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Step grid");
  // +1 column for the trailing "add step" square when there's room to grow.
  const canGrow = stepCount < STEP_GRID_MAX_STEPS;
  row.style.gridTemplateColumns = `repeat(${stepCount + (canGrow ? 1 : 0)}, minmax(0, 1fr))`;

  for (let index = 0; index < stepCount; index += 1) {
    const key = `step${index + 1}`;
    const isOn = Number(patchNode?.params?.[key]) > 0.5;
    const isLast = index === stepCount - 1;
    const square = document.createElement("button");
    square.type = "button";
    square.className = "node-step-grid-square";
    square.classList.toggle("on", isOn);
    square.dataset.stepIndex = String(index);
    square.setAttribute("role", "switch");
    square.setAttribute("aria-checked", String(isOn));
    square.setAttribute("aria-label", `Step ${index + 1} ${isOn ? "on" : "off"}`);
    square.addEventListener("click", (event) => {
      toggleNodeGraphStepGridStep(node, index, event);
    });
    if (isLast && stepCount > 1) {
      // Reveals a small remove affordance only on the last square, only on
      // hover/focus -- no permanent extra chrome, but discoverable the
      // moment you're looking at the one square that's actually removable.
      const remove = document.createElement("span");
      remove.className = "node-step-grid-square-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-hidden", "true");
      remove.addEventListener("click", (event) => {
        resizeNodeGraphStepGridSteps(node, -1, event);
      });
      square.append(remove);
      square.setAttribute(
        "aria-label",
        `Step ${index + 1} ${isOn ? "on" : "off"} (click the × in the corner to remove this step)`,
      );
    }
    row.append(square);
  }

  if (canGrow) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "node-step-grid-square node-step-grid-add";
    add.textContent = "+";
    add.setAttribute("aria-label", `Add step (${stepCount} of ${STEP_GRID_MAX_STEPS})`);
    add.addEventListener("click", (event) => {
      resizeNodeGraphStepGridSteps(node, 1, event);
    });
    row.append(add);
  }
  body.append(row);

  const outputColumn = document.createElement("div");
  outputColumn.className = "node-step-grid-ports node-step-grid-ports-output";
  outputColumn.append(createNodeGraphPort(node, type, "Gate", "output"));
  outputColumn.append(createNodeGraphPort(node, type, "Step", "output"));
  body.append(outputColumn);

  return body;
}

registerNodeGraphChromelessModuleUi("stepGrid", {
  createBody: createNodeGraphStepGridBody,
});
