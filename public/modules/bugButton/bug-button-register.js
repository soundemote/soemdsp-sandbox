// Bug Button's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here instead
// of node-graph-module-definitions.js / node-graph-module-store.js, and why
// this file has to load early (before those two build their frozen objects).
//
// A 1gu 🐞 tile with a single "Spike" output: clicking the bug fires a
// one-sample impulse (amplitude 1). Same trigger plumbing as impulseButton
// (triggerNodeGraphImpulseButton / the worklet's impulseButtonStates --
// both are nodeId-keyed and type-agnostic), just wearing a compact-tile
// body like LED instead of the buttonWidget chrome.
registerNodeGraphChromelessModule("bugButton", {
  label: "Bug Button",
  compactTile: true,
  definition: {
    inputs: [],
    outputs: ["Spike"],
    parameters: [],
  },
  catalog: {
    category: "controller",
    description: "One-grid-unit 🐞 tile. Click the bug to fire a single-sample spike (amplitude 1) from its Spike output -- a compact manual trigger for envelopes, counters, and other transient-driven modules.",
    notes: ["1 GU tile", "manual trigger", "one-sample spike"],
  },
});
