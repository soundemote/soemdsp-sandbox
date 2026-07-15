// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphCodeblockCacheKey(codeblock) {
  return `${codeblock.inputs.join(",")}=>${codeblock.outputs.join(",")}::${codeblock.code}`;
}
function nodeGraphCreateCodeblockOutputObject(codeblock) {
  const output = {};
  for (const port of codeblock.outputs) {
    output[port] = 0;
  }
  return output;
}
function nodeGraphCompileCodeblockFunction(runtime, node) {
  const codeblock = normalizeNodeGraphCodeblock(node.codeblock);
  const key = nodeGraphCodeblockCacheKey(codeblock);
  const cached = runtime.codeblockFunctions?.get(node.id);
  if (cached?.key === key) {
    return cached;
  }
  const fn = Function(
    "__inputs",
    "__outputs",
    "__state",
    "__context",
    nodeGraphCodeblockBuildFunctionBody(codeblock),
  );
  const compiled = {
    codeblock,
    fn,
    inputs: new Array(codeblock.inputs.length).fill(0),
    key,
    output: nodeGraphCreateCodeblockOutputObject(codeblock),
    state: Object.create(null),
  };
  runtime.codeblockFunctions?.set(node.id, compiled);
  return compiled;
}


function nodeGraphEvaluateCodeblock(runtime, node, mixInput, sampleRate = nodeGraphMvp?.sampleRate || 44100, frame = 0, frames = 1) {
  let compiled = null;
  try {
    compiled = nodeGraphCompileCodeblockFunction(runtime, node);
  } catch (error) {
    nodeGraphMarkRuntimeBadNumber(runtime, node.id, `codeblock compile error ${error?.message || ""}`);
    return {};
  }
  const { codeblock, fn, inputs, output, state } = compiled;
  try {
    for (let index = 0; index < codeblock.inputs.length; index += 1) {
      const port = codeblock.inputs[index];
      inputs[index] = nodeGraphSafeFilterNumber(
        mixInput(node.id, port),
        runtime,
        node.id,
        null,
        `codeblock ${port} input`,
      );
    }
    for (const port of codeblock.outputs) {
      output[port] = 0;
    }
    fn(inputs, output, state, {
      frame,
      frames,
      sampleRate,
      time: (Number(frame) || 0) / (Number(sampleRate) || 44100),
    });
    for (const port of codeblock.outputs) {
      output[port] = nodeGraphSafeFilterNumber(
        output[port],
        runtime,
        node.id,
        null,
        `codeblock ${port} output`,
      );
    }
    return output;
  } catch (error) {
    nodeGraphMarkRuntimeBadNumber(runtime, node.id, `codeblock runtime error ${error?.message || ""}`);
    for (const port of codeblock.outputs) {
      output[port] = 0;
    }
    return output;
  }
}


// Registers the offline/render-time dispatch handler for codeblock into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.codeblock = ({ runtime, node, frame, frames, mixInput, sampleRate }) => nodeGraphEvaluateCodeblock(runtime, node, mixInput, sampleRate, frame, frames);
