// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphExternalButtonEventPulse(runtime, name) {
  const events = runtime?.externalButtonEvents;
  if (!(events instanceof Map)) {
    return 0;
  }
  const remaining = Number(events.get(name)) || 0;
  if (remaining <= 0) {
    events.delete(name);
    return 0;
  }
  events.set(name, remaining - 1);
  return 1;
}


// Registers the offline/render-time dispatch handler for buttonEvents into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.buttonEvents = ({ runtime }) => ({
  Click: nodeGraphExternalButtonEventPulse(runtime, "click"),
  Hover: nodeGraphExternalButtonEventPulse(runtime, "hover"),
  Down: nodeGraphExternalButtonEventPulse(runtime, "down"),
  Up: nodeGraphExternalButtonEventPulse(runtime, "up"),
  Enter: nodeGraphExternalButtonEventPulse(runtime, "enter"),
  Leave: nodeGraphExternalButtonEventPulse(runtime, "leave"),
});
