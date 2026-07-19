// Group Input's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here
// instead of node-graph-module-definitions.js / node-graph-module-store.js.
//
// Fully custom UI, same tier as LED (public/modules/led/): a Group Input
// needs exactly one thing, an Out port. No params, no generic body. Its
// name -- set the normal way, right-click -> module title alias -- is
// what becomes the matching input port's name on the moduleGroup box
// once this node's group is built (see nodeGraphModuleGroupEndpointName /
// nodeGraphModuleGroupInterfaceFromPatch, node-graph-parameter-metadata.js).
registerNodeGraphChromelessModule("groupInput", {
  label: "Group Input",
  compactTile: true,
  definition: {
    outputs: ["Out"],
    parameters: [],
  },
  catalog: {
    category: "Portals",
    description: "Defines an exposed input on a saved module group. Rename it (right-click, module title alias) to name the port that appears on the group's own box.",
    notes: ["group interface", "public input", "patch boundary"],
  },
});
