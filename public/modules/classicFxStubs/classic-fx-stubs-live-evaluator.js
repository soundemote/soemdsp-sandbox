// Under-construction classic FX / spectral placeholders — dry passthrough.
// Types: phaser, flanger, chorus, bode, phaseDisperse, stftBlur

function nodeGraphClassicFxStubPassthrough(nodeId, mixInput) {
  const mono = Number(mixInput(nodeId)) || 0;
  return mono;
}

["phaser", "flanger", "chorus", "bode", "phaseDisperse", "stftBlur"].forEach((type) => {
  nodeGraphLiveModuleEvaluators[type] = ({ nodeId, mixInput }) =>
    nodeGraphClassicFxStubPassthrough(nodeId, mixInput);
});
