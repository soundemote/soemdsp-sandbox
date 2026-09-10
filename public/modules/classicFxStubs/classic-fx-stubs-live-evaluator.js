// Under-construction classic FX placeholders — dry passthrough.
// Types: phaser, flanger, chorus
// (bode, phaseDisperse, stftBlur have real engines in their own modules.)

function nodeGraphClassicFxStubPassthrough(nodeId, mixInput) {
  const mono = nodeGraphFiniteNumber(mixInput(nodeId));
  return mono;
}

["phaser", "flanger", "chorus"].forEach((type) => {
  nodeGraphLiveModuleEvaluators[type] = ({ nodeId, mixInput }) =>
    nodeGraphClassicFxStubPassthrough(nodeId, mixInput);
});
