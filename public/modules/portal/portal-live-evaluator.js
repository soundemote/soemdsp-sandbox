function nodeGraphBindPortalLiveEvaluators() {
  const inletTypes = typeof nodeGraphPortalInletTypes === "function"
    ? nodeGraphPortalInletTypes()
    : ["portalInlet"];
  const outletTypes = typeof nodeGraphPortalOutletTypes === "function"
    ? nodeGraphPortalOutletTypes()
    : ["portalOutlet"];
  for (const type of inletTypes) {
    nodeGraphLiveModuleEvaluators[type] = ({ runtime, node, nodeId, frame, mixInput }) =>
      nodeGraphEvaluatePortalInlet(runtime.externalInput, node?.type || type, nodeId, mixInput, frame);
  }
  for (const type of outletTypes) {
    nodeGraphLiveModuleEvaluators[type] = ({ node, nodeId, mixInput }) =>
      nodeGraphEvaluatePortalOutlet(node?.type || type, nodeId, mixInput);
  }
}

nodeGraphBindPortalLiveEvaluators();
