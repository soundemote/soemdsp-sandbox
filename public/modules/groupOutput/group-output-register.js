// Group Output's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here
// instead of node-graph-module-definitions.js / node-graph-module-store.js.
//
// Fully custom UI, same tier as LED. A Group Output only needs an In
// port. It still computes an internal Out in the evaluators for sink
// reachability, but that Out is not declared here so it does not render
// as a second jack.
registerNodeGraphChromelessModule("groupOutput", {
  label: "Group Output",
  compactTile: true,
  definition: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["In"],
    outputs: [],
    parameters: [],
  },
  catalog: {
    category: "Portals",
    description: "Portal outlet for patch-boundary signal lanes. Rename it (right-click, module title alias) if you want a distinct label.",
    notes: ["group interface", "public output", "patch boundary"],
  },
});
