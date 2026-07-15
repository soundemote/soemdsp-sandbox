// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphWireBreakEventSample(runtime) {
  const event = runtime?.wireBreakEvent;
  if (!event || typeof event !== "object") {
    return { Pulse: 0, Gate: 0 };
  }
  const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
  const gateSamples = Math.max(0, Number(event.gateSamples) || 0);
  const output = {
    Pulse: pulseSamples > 0 ? 1 : 0,
    Gate: gateSamples > 0 ? 1 : 0,
  };
  event.pulseSamples = Math.max(0, pulseSamples - 1);
  event.gateSamples = Math.max(0, gateSamples - 1);
  return output;
}

function nodeGraphWireDisconnectEventSample(runtime) {
  const event = runtime?.wireDisconnectEvent;
  if (!event || typeof event !== "object") {
    return { Pulse: 0 };
  }
  const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
  event.pulseSamples = Math.max(0, pulseSamples - 1);
  return { Pulse: pulseSamples > 0 ? 1 : 0 };
}

function nodeGraphWireConnectEventSample(runtime) {
  const event = runtime?.wireConnectEvent;
  if (!event || typeof event !== "object") {
    return { Pulse: 0 };
  }
  const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
  event.pulseSamples = Math.max(0, pulseSamples - 1);
  return { Pulse: pulseSamples > 0 ? 1 : 0 };
}

function nodeGraphWindowReopenEventSample(runtime) {
  const event = runtime?.windowReopenEvent;
  if (!event || typeof event !== "object") {
    return { Pulse: 0, Gate: 0, Sine: 0 };
  }
  const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
  const gateSamples = Math.max(0, Number(event.gateSamples) || 0);
  const totalSamples = Math.max(1, Number(event.totalSamples) || gateSamples || 1);
  const progress = gateSamples > 0 ? 1 - gateSamples / totalSamples : 1;
  const sine = gateSamples > 0 ? Math.sin(Math.PI * Math.max(0, Math.min(1, progress))) : 0;
  event.pulseSamples = Math.max(0, pulseSamples - 1);
  event.gateSamples = Math.max(0, gateSamples - 1);
  return {
    Pulse: pulseSamples > 0 ? 1 : 0,
    Gate: gateSamples > 0 ? 1 : 0,
    Sine: sine,
  };
}


// Registers the offline/render-time dispatch handlers for wireBreak, wireConnect,
// wireDisconnect, and windowReopen into nodeGraphLiveModuleEvaluators (declared
// in node-graph-live-frame-evaluator.js). Extracted from the inline if/else-if
// branches that used to live in that file. Small, standalone editor-event
// pulse types -- grouped into one file since each is a single-line pass-through.
nodeGraphLiveModuleEvaluators.wireBreak = ({ runtime }) => nodeGraphWireBreakEventSample(runtime);
nodeGraphLiveModuleEvaluators.wireConnect = ({ runtime }) => nodeGraphWireConnectEventSample(runtime);
nodeGraphLiveModuleEvaluators.wireDisconnect = ({ runtime }) => nodeGraphWireDisconnectEventSample(runtime);
nodeGraphLiveModuleEvaluators.windowReopen = ({ runtime }) => nodeGraphWindowReopenEventSample(runtime);
