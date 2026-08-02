// Group Output's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here
// instead of node-graph-module-definitions.js / node-graph-module-store.js.
//
// Fully custom UI, same tier as LED. A Group Output only needs an
// in-universe input (In) -- what's wired into it is what reaches the
// output that spawns on the moduleGroup's own box once this node's
// group is built. It still computes/returns an "Out" value internally
// (see group-output-live-evaluator.js / the worklet evaluator) because
// that's how the parent group's runtime reads this node's value back
// out (nodeGraphModuleGroupInterfaceFromPatch hardcodes port: "Out" for
// every groupOutput entry) -- but that "Out" is implementation-only,
// deliberately not declared here, so it never renders as a second,
// confusing, not-actually-wireable-to-anything-useful port inside the
// group's own universe.
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
    description: "Defines an exposed output on a saved module group. Rename it (right-click, module title alias) to name the port that appears on the group's own box.",
    notes: ["group interface", "public output", "patch boundary"],
  },
});
