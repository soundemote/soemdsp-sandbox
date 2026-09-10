// Realtime worklet evaluator methods for codeblock, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor, so this file just needs to run somewhere in that
// window -- no call-site changes needed since the dispatch registry
// already calls these via this.evaluateCodeblock(...).
NodeLiveAudioProcessor.prototype.validCodeblockIdentifier = function validCodeblockIdentifier(name) {
  const value = String(name || "").trim();
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) &&
    !new Set([
      "__context",
      "__ctx",
      "__inputs",
      "__outputs",
      "__state",
      "arguments",
      "await",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "document",
      "else",
      "eval",
      "export",
      "extends",
      "false",
      "fetch",
      "finally",
      "frame",
      "frames",
      "for",
      "Function",
      "globalThis",
      "if",
      "import",
      "in",
      "instanceof",
      "let",
      "new",
      "null",
      "return",
      "sampleRate",
      "self",
      "super",
      "switch",
      "state",
      "this",
      "throw",
      "time",
      "true",
      "try",
      "typeof",
      "var",
      "void",
      "while",
      "window",
      "with",
      "yield",
      "dt",
    ]).has(value);
};

NodeLiveAudioProcessor.prototype.normalizeCodeblockPortList = function normalizeCodeblockPortList(value, fallbackPrefix = "In") {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[\s,]+/);
  const ports = [];
  const seen = new Set();
  for (const item of raw) {
    const name = String(item || "").trim();
    if (!this.validCodeblockIdentifier(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    ports.push(name.slice(0, 32));
  }
  if (!ports.length) {
    ports.push(`${fallbackPrefix}1`);
  }
  return ports;
};

NodeLiveAudioProcessor.prototype.normalizeCodeblock = function normalizeCodeblock(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const inputs = this.normalizeCodeblockPortList(source.inputs, "In");
  const reserved = new Set(inputs);
  const outputs = this.normalizeCodeblockPortList(source.outputs, "Out")
    .filter((port) => !reserved.has(port));
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
    code: String(source.code ?? "Out1 = In1;"),
    inputs,
    outputs,
  };
};

NodeLiveAudioProcessor.prototype.codeblockFunctionBody = function codeblockFunctionBody(codeblock) {
  const shadows = ["window", "document", "fetch", "Function", "globalThis", "self"]
    .map((name) => `const ${name} = undefined;`)
    .join("\n");
  const context = [
    "const state = __state;",
    "const __ctx = __context || {};",
    "const sampleRate = nodeGraphFiniteNumber(__ctx.sampleRate, 44100);",
    "const frame = nodeGraphFiniteNumber(__ctx.frame);",
    "const frames = nodeGraphFiniteNumber(__ctx.frames, 1);",
    "const time = nodeGraphFiniteNumber(__ctx.time);",
    "const dt = 1 / sampleRate;",
  ].join("\n");
  const inputs = codeblock.inputs
    .map((port, index) => `const ${port} = __inputs[${index}] || 0;`)
    .join("\n");
  const outputs = codeblock.outputs.map((port) => `let ${port} = 0;`).join("\n");
  const writes = codeblock.outputs
    .map((port) => `__outputs[${JSON.stringify(port)}] = ${port};`)
    .join("\n");
  return `"use strict";\n${shadows}\n${context}\n${inputs}\n${outputs}\n${codeblock.code}\n${writes}\nreturn __outputs;`;
};

NodeLiveAudioProcessor.prototype.codeblockCacheKey = function codeblockCacheKey(codeblock) {
  return `${codeblock.inputs.join(",")}=>${codeblock.outputs.join(",")}::${codeblock.code}`;
};

NodeLiveAudioProcessor.prototype.markCodeblockError = function markCodeblockError(nodeId, reason, source) {
  this.badNumberCount += 1;
  this.lastBadValueReason = reason;
  this.lastBadValueNodeId = nodeId || "";
  this.lastBadValueSource = source || "codeblock";
};

NodeLiveAudioProcessor.prototype.safeCodeblockNumber = function safeCodeblockNumber(value, nodeId, port) {
  const number = Number(value);
  const reason = this.badValueReason(number);
  if (!reason) {
    return number;
  }
  this.markCodeblockError(nodeId, reason, `codeblock ${port} output`);
  return 0;
};

NodeLiveAudioProcessor.prototype.createCodeblockOutputObject = function createCodeblockOutputObject(codeblock) {
  const output = {};
  for (const port of codeblock.outputs) {
    output[port] = 0;
  }
  return output;
};

NodeLiveAudioProcessor.prototype.compileCodeblockFunction = function compileCodeblockFunction(node) {
  const codeblock = this.normalizeCodeblock(node.codeblock);
  const key = this.codeblockCacheKey(codeblock);
  const cached = this.codeblockFunctions.get(node.id);
  if (cached?.key === key) {
    return cached;
  }
  const fn = Function(
    "__inputs",
    "__outputs",
    "__state",
    "__context",
    this.codeblockFunctionBody(codeblock),
  );
  const compiled = {
    codeblock,
    fn,
    inputs: new Array(codeblock.inputs.length).fill(0),
    key,
    output: this.createCodeblockOutputObject(codeblock),
    state: Object.create(null),
  };
  this.codeblockFunctions.set(node.id, compiled);
  return compiled;
};

NodeLiveAudioProcessor.prototype.evaluateCodeblock = function evaluateCodeblock(node, mixInput, frame = 0, frames = 1, sampleRate = this.engineSampleRate || 44100, inputFrame = frame) {
  let compiled = null;
  try {
    compiled = this.compileCodeblockFunction(node);
  } catch (error) {
    this.markCodeblockError(node.id, "compile error", `codeblock ${error?.message || ""}`);
    return {};
  }
  const { codeblock, fn, inputs, output, state } = compiled;
  try {
    for (let index = 0; index < codeblock.inputs.length; index += 1) {
      inputs[index] = this.safeFilterNumber(mixInput(node.id, codeblock.inputs[index]), null);
    }
    for (const port of codeblock.outputs) {
      output[port] = 0;
    }
    fn(inputs, output, state, {
      frame,
      frames,
      sampleRate,
      time: (nodeGraphFiniteNumber(inputFrame)) / (nodeGraphFiniteNumber(sampleRate, 44100)),
    });
    for (const port of codeblock.outputs) {
      output[port] = this.safeCodeblockNumber(output[port], node.id, port);
    }
    return output;
  } catch (error) {
    this.markCodeblockError(node.id, "runtime error", `codeblock ${error?.message || ""}`);
    for (const port of codeblock.outputs) {
      output[port] = 0;
    }
    return output;
  }
};
