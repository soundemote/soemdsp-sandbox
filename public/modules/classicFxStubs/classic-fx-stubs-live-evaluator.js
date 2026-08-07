// Under-construction classic FX / spectral placeholders — dry passthrough.
// Types: phaser, flanger, chorus, stftBlur
// (bode + phaseDisperse have real engines in their own modules.)

function nodeGraphClassicFxStubPassthrough(nodeId, mixInput) {
  const mono = Number(mixInput(nodeId)) || 0;
  return mono;
}

["phaser", "flanger", "chorus", "stftBlur"].forEach((type) => {
  nodeGraphLiveModuleEvaluators[type] = ({ nodeId, mixInput }) =>
    nodeGraphClassicFxStubPassthrough(nodeId, mixInput);
});
