// Port scripts: a script attached to one input or output port of one node
// instance (stored as an ordinary `kind: "code"` parameter, exactly like
// any other parameter -- same serialization, same undo/redo, no new node
// field). Not a language, not an interpreter -- this is plain JavaScript,
// compiled by the JS engine itself via `new Function`, at full native JIT
// speed. A tree-walking interpreter would be reinventing something the
// browser already gives us for free.
//
// Lives entirely on the main thread, at data-plane rate (see
// node-graph-data-bus.js) -- never inside the AudioWorklet's isolated
// realtime scope. Same trust model as this sandbox's existing Codeblock
// module, which already runs user-authored JS inside a node -- not a new
// risk class.
//
// A script is the *body* of a function: `input` is bound to whatever
// value arrived (a number, string, or array, depending on the port), a
// curated set of helpers below are in scope by name (so a script
// transforms instead of re-deriving basic math/bit primitives), and the
// script's `return` value is what the port actually publishes/passes on.

const nodeGraphPortScriptHelpers = Object.freeze({
  // Basic math a script would otherwise have to hand-roll every time.
  clamp: (value, lo, hi) => Math.min(hi, Math.max(lo, value)),
  lerp: (a, b, t) => a + (b - a) * t,
  wrap01: (value) => {
    const w = value - Math.floor(value);
    return w < 0 ? 0 : (w >= 1 ? 0 : w);
  },
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  sin: Math.sin,
  cos: Math.cos,
  floor: Math.floor,
  round: Math.round,
  rand: Math.random,

  // Bit/digital-signal helpers -- the "beautiful chaos" side: crushing,
  // rotating, and counting bits on a Scale-style mask without a script
  // having to reimplement bit math from scratch.
  popcount: (mask) => {
    let n = Math.trunc(Number(mask) || 0) >>> 0;
    let count = 0;
    while (n) {
      n &= n - 1;
      count++;
    }
    return count;
  },
  rotateLeft12: (mask, amount) => {
    const m = Math.trunc(Number(mask) || 0) & 0xFFF;
    const n = ((Math.trunc(Number(amount) || 0) % 12) + 12) % 12;
    if (n === 0) return m;
    return ((m << n) | (m >> (12 - n))) & 0xFFF;
  },
});

const nodeGraphPortScriptHelperNames = Object.freeze(Object.keys(nodeGraphPortScriptHelpers));
const nodeGraphPortScriptHelperValues = Object.freeze(
  nodeGraphPortScriptHelperNames.map((name) => nodeGraphPortScriptHelpers[name]),
);

const nodeGraphPortScriptCompileCache = new Map();

// Compiles (and caches by exact source text) a port script body into a
// callable `(input) => result` function. Returns null if the source
// doesn't compile -- callers should fall back to passing `input` through
// unchanged rather than crashing the graph over one bad script.
function compileNodeGraphPortScript(source) {
  const trimmed = typeof source === "string" ? source.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (nodeGraphPortScriptCompileCache.has(trimmed)) {
    return nodeGraphPortScriptCompileCache.get(trimmed);
  }
  let compiled = null;
  try {
    // eslint-disable-next-line no-new-func -- this is the whole mechanism.
    const rawFn = new Function("input", ...nodeGraphPortScriptHelperNames, trimmed);
    compiled = (input) => rawFn(input, ...nodeGraphPortScriptHelperValues);
  } catch (error) {
    console.warn(`Port script compile error: ${error?.message || error}`);
    compiled = null;
  }
  nodeGraphPortScriptCompileCache.set(trimmed, compiled);
  return compiled;
}

// Normalizes a node's `portScripts` map for patch persistence: only keeps
// string entries keyed by one of that node type's actual data ports
// (mirrors the same "define the field, validate against real ports"
// pattern used by nodeGraphPatchNodeInputPorts elsewhere), dropping empty
// strings and unknown ports. Returns undefined (not even an empty object)
// when nothing survives, so normalized nodes without scripts stay clean.
function normalizeNodeGraphPortScripts(type, portScripts) {
  if (!portScripts || typeof portScripts !== "object") {
    return undefined;
  }
  const definition = nodeGraphModuleDefinitions[type];
  const validPorts = new Set([
    ...(definition?.dataInputs || []),
    ...(definition?.dataOutputs || []),
  ]);
  const normalized = {};
  for (const [port, source] of Object.entries(portScripts)) {
    if (!validPorts.has(port) || typeof source !== "string" || !source.trim()) {
      continue;
    }
    normalized[port] = source;
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

// Runs a port script source against an input value. Returns `input`
// unchanged if the script is empty, fails to compile, or throws at
// runtime -- a bad script degrades to a no-op passthrough, it never takes
// the graph down with it.
function evaluateNodeGraphPortScript(source, input) {
  const compiled = compileNodeGraphPortScript(source);
  if (!compiled) {
    return input;
  }
  try {
    const result = compiled(input);
    return result === undefined ? input : result;
  } catch (error) {
    console.warn(`Port script runtime error: ${error?.message || error}`);
    return input;
  }
}

// Script Box: a spawnable node whose entire job is a port script with
// multiple named data-plane inputs and outputs, i.e. the "actual code box"
// version of a port script -- one drops it on the canvas and wires
// arbitrary data ports through it, rather than a script living hidden
// inside one specific module (Text Box's Title/Text). Ports are dynamic
// per node instance, same convention as the Codeblock module
// (node.codeblock.inputs/outputs), reusing its port-list parser directly.
// Unlike Codeblock, this runs at data-plane rate on the main thread (see
// node-graph-data-bus.js) -- never inside the AudioWorklet -- since its
// values are whole values (arrays, strings, numbers), not per-sample floats.

const nodeGraphScriptBoxDefaultCode = "Out1 = In1;";

function normalizeNodeGraphScriptBox(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const inputs = normalizeNodeGraphCodeblockPortList(source.inputs, "In");
  const reserved = new Set(inputs);
  const rawOutputs = normalizeNodeGraphCodeblockPortList(source.outputs, "Out");
  const outputs = rawOutputs.filter((port) => !reserved.has(port));
  if (!outputs.length) {
    let index = 1;
    let name = "Out1";
    while (reserved.has(name)) {
      index += 1;
      name = `Out${index}`;
    }
    outputs.push(name);
  }
  return {
    code: String(source.code ?? nodeGraphScriptBoxDefaultCode),
    inputs,
    outputs,
  };
}

function nodeGraphScriptBoxBuildFunctionBody(scriptBox) {
  const inputs = scriptBox.inputs
    .map((port, index) => `let ${port} = __inputs[${index}];`)
    .join("\n");
  const outputs = scriptBox.outputs.map((port) => `let ${port};`).join("\n");
  const writes = scriptBox.outputs
    .map((port) => `__outputs[${JSON.stringify(port)}] = ${port};`)
    .join("\n");
  return `"use strict";\n${inputs}\n${outputs}\n${scriptBox.code}\n${writes}\nreturn __outputs;`;
}

function nodeGraphScriptBoxCompileStatus(scriptBox) {
  try {
    const normalized = normalizeNodeGraphScriptBox(scriptBox);
    new Function(
      "__inputs",
      "__outputs",
      ...nodeGraphPortScriptHelperNames,
      nodeGraphScriptBoxBuildFunctionBody(normalized),
    );
    return { ok: true, message: "code ok" };
  } catch (error) {
    return { ok: false, message: error?.message || "compile error" };
  }
}

const nodeGraphScriptBoxFunctions = new Map();

// Compiles (and caches per node id, invalidated whenever ports/code
// change) then runs one Script Box node against the current data bus:
// reads each input port, executes the script, publishes each output port.
// A bad script logs and leaves prior outputs on the bus untouched rather
// than crashing the render loop.
function evaluateNodeGraphScriptBoxNode(node) {
  const scriptBox = normalizeNodeGraphScriptBox(node.scriptBox);
  const key = `${scriptBox.inputs.join(",")}=>${scriptBox.outputs.join(",")}::${scriptBox.code}`;
  let compiled = nodeGraphScriptBoxFunctions.get(node.id);
  if (!compiled || compiled.key !== key) {
    let fn = null;
    try {
      fn = new Function(
        "__inputs",
        "__outputs",
        ...nodeGraphPortScriptHelperNames,
        nodeGraphScriptBoxBuildFunctionBody(scriptBox),
      );
    } catch (error) {
      console.warn(`Script Box compile error: ${error?.message || error}`);
    }
    compiled = { fn, key };
    nodeGraphScriptBoxFunctions.set(node.id, compiled);
  }
  if (!compiled.fn) {
    return;
  }
  const inputs = scriptBox.inputs.map((port) => readNodeGraphDataInput(node.id, port));
  const outputs = {};
  try {
    compiled.fn(inputs, outputs, ...nodeGraphPortScriptHelperValues);
  } catch (error) {
    console.warn(`Script Box runtime error: ${error?.message || error}`);
    return;
  }
  for (const port of scriptBox.outputs) {
    writeNodeGraphDataOutput(node.id, port, outputs[port]);
  }
}

const nodeGraphCustomDisplayDefaultCode = `function draw({ ctx, width, height, inputs, time }) {
  const value = inputs.In1?.latest ?? 0;
  const radius = 8 + Math.abs(value) * Math.min(width, height) * 0.18;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(126, 230, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.5, radius, 0, Math.PI * 2);
  ctx.fill();
}`;

function normalizeNodeGraphCustomDisplay(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    code: String(source.code ?? nodeGraphCustomDisplayDefaultCode),
    inputs: normalizeNodeGraphCodeblockPortList(source.inputs, "In"),
    outputs: [],
  };
}

function nodeGraphCustomDisplayBuildFunctionBody(displayScript) {
  return `"use strict";\n${displayScript.code}\nif (typeof draw !== "function") {\n  throw new Error("define function draw(api)");\n}\nreturn draw(__api);`;
}

function nodeGraphCustomDisplayCompileStatus(displayScript) {
  try {
    const normalized = normalizeNodeGraphCustomDisplay(displayScript);
    new Function(
      "__api",
      ...nodeGraphPortScriptHelperNames,
      nodeGraphCustomDisplayBuildFunctionBody(normalized),
    );
    return { ok: true, message: "code ok" };
  } catch (error) {
    return { ok: false, message: error?.message || "compile error" };
  }
}

const nodeGraphCustomDisplayFunctions = new Map();

function compiledNodeGraphCustomDisplayFunction(node) {
  const displayScript = normalizeNodeGraphCustomDisplay(node?.customDisplay);
  const key = `${displayScript.inputs.join(",")}::${displayScript.code}`;
  let compiled = nodeGraphCustomDisplayFunctions.get(node?.id);
  if (!compiled || compiled.key !== key) {
    let fn = null;
    let error = "";
    try {
      fn = new Function(
        "__api",
        ...nodeGraphPortScriptHelperNames,
        nodeGraphCustomDisplayBuildFunctionBody(displayScript),
      );
    } catch (caught) {
      error = caught?.message || "compile error";
    }
    compiled = { error, fn, key };
    if (node?.id) {
      nodeGraphCustomDisplayFunctions.set(node.id, compiled);
    }
  }
  return compiled;
}
