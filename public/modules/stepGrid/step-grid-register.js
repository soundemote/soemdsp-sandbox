// Step Grid's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here instead
// of node-graph-module-definitions.js / node-graph-module-store.js, and
// why this file has to load early (before those two build their frozen
// objects).

// Steps beyond the visible count stay in params (untouched) rather than
// being cleared -- shrinking then regrowing the step count restores
// whatever pattern was there before, which reads as more "undo-friendly"
// than surprising. STEP_GRID_MAX_STEPS is also imported by
// step-grid-ui.js/-live-evaluator.js/-worklet-evaluator.js.
const STEP_GRID_MAX_STEPS = 16;

function stepGridParameterDefinitions() {
  const parameters = [
    {
      defaultValue: "0",
      key: "threshold",
      label: "Threshold",
      max: "1",
      mid: "0",
      min: "-1",
      nonlinearSlider: false,
      step: "any",
    },
    {
      defaultValue: "8",
      key: "steps",
      label: "Steps",
      max: String(STEP_GRID_MAX_STEPS),
      mid: "8",
      min: "1",
      nonlinearSlider: false,
      step: "1",
    },
  ];
  for (let index = 1; index <= STEP_GRID_MAX_STEPS; index += 1) {
    parameters.push({
      defaultValue: "0",
      key: `step${index}`,
      label: `Step ${index}`,
      max: "1",
      mid: "0",
      min: "0",
      nonlinearSlider: false,
      step: "1",
    });
  }
  return parameters;
}

registerNodeGraphChromelessModule("stepGrid", {
  label: "Step Grid",
  definition: {
    // Unsmoothed gate/trigger ports -- see nodeGraphPortIsDigitalSignal.
    digitalInputs: ["Trigger", "Reset"],
    digitalOutputs: ["Gate", "Step"],
    // Keeps the default (unresized) grid height exactly as it always was --
    // see nodeGraphModuleGridHeightUnitsForUi's chromeless branch, which now
    // lets this grow via the same display-height mechanism other
    // display-capable modules already expose (context menu / keyboard
    // shortcut) instead of being pinned at 1gu.
    displayHeightGu: 1,
    inputs: ["Trigger", "Reset"],
    outputs: ["Gate", "Step"],
    parameters: stepGridParameterDefinitions(),
  },
  catalog: {
    category: "Sequence",
    description: "Gate sequencer with a click-to-toggle grid, 1-16 steps. Advance it with Clock; Gate fires only on steps you've switched on.",
    notes: ["trigger input", "reset input", "gate pattern", "click grid", "variable steps"],
  },
});
