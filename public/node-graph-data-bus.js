// The data plane: a general mechanism for wires that carry a whole value
// (an array, a string, ...) instead of a per-sample scalar float.
//
// This sandbox's regular wires (inputs/outputs) are the signal plane:
// per-sample, synchronous, flowing through mixInput on the audio clock --
// correct for audio/CV, which really is a continuous stream. Data-plane
// wires (dataInputs/dataOutputs in node-graph-module-definitions.js) are
// the other case: something changes, gets published once, and a consumer
// reads whatever the latest published value is -- no audio-rate
// simulation, no Number() coercion (readNodeGraphRuntimeOutput's
// `Number(output[port] ?? ...)` would mangle an array or string the same
// way it would a real number).
//
// A port lives on exactly one plane, declared once in the module
// definition. Also used for module-local face data (e.g. Hypersaw burn
// stems publish Phases/Amplitudes/Pans on the bus without exposing jacks).

const nodeGraphDataBus = new Map();

function nodeGraphDataBusKey(nodeId, port) {
  return `${nodeId}.${port}`;
}

// Called by a producing module whenever its data-plane output actually
// changes (not every sample -- that's the whole point of this plane).
function writeNodeGraphDataOutput(nodeId, port, value) {
  nodeGraphDataBus.set(nodeGraphDataBusKey(nodeId, port), value);
}

// Called by a consuming module (or its renderer) to read a data-plane
// input's current value. Returns undefined if the port isn't wired to
// anything -- callers decide their own fallback (e.g. Text Box falls
// back to its typed value).
function readNodeGraphDataInput(nodeId, port) {
  const connection = nodeGraphModuleScopeConnectionsTo(nodeId, port)
    .find((candidate) => candidate?.sourceNode && candidate?.sourcePort);
  if (!connection) {
    return undefined;
  }
  return nodeGraphDataBus.get(nodeGraphDataBusKey(connection.sourceNode, connection.sourcePort));
}

// Called when a node is deleted so stale published values for it don't
// linger in the bus forever.
function clearNodeGraphDataOutputsForNode(nodeId) {
  const prefix = `${nodeId}.`;
  for (const key of [...nodeGraphDataBus.keys()]) {
    if (key.startsWith(prefix)) {
      nodeGraphDataBus.delete(key);
    }
  }
}
