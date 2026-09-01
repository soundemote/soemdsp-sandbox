// Group Input's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here
// instead of node-graph-module-definitions.js / node-graph-module-store.js.
//
// Fully custom UI, same tier as LED (public/modules/led/): a Group Input
// needs exactly one thing, an Out port. No params, no generic body.
registerNodeGraphChromelessModule("groupInput", {
  label: "Group Input",
  compactTile: true,
  definition: {
    planRole: "source",
    outputs: ["Out"],
    parameters: [],
  },
  catalog: {
    category: "Portals",
    description: "Portal inlet for patch-boundary signal lanes. Rename it (right-click, module title alias) if you want a distinct label.",
    notes: ["group interface", "public input", "patch boundary"],
  },
});
