const { chromium } = require("playwright");

async function measurePeak(page, seconds = 0.35) {
  return page.evaluate(async (secs) => {
    const ctx = nodeGraphMvp.live?.context;
    const node = nodeGraphMvp.live?.node || nodeGraphMvp.live?.scriptNode;
    if (!ctx || !node) return { err: "no ctx/node" };
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    try {
      node.connect(analyser);
    } catch (_) {
      // may already be connected elsewhere; tap via outputGain if present
    }
    const tap = nodeGraphMvp.live?.outputGain || nodeGraphMvp.live?.meterGain || node;
    try { tap.connect(analyser); } catch (_) {}
    const data = new Float32Array(analyser.fftSize);
    const t0 = performance.now();
    let peak = 0;
    while (performance.now() - t0 < secs * 1000) {
      analyser.getFloatTimeDomainData(data);
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
      }
      await new Promise((r) => setTimeout(r, 16));
    }
    try { analyser.disconnect(); } catch (_) {}
    return {
      peak,
      evidence: nodeGraphMvp.live?.lastEvidence || null,
      planEvidence: nodeGraphMvp.live?.planEvidence || null,
    };
  }, seconds);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.grantPermissions(["microphone"]);
  const page = await context.newPage();
  const msgs = [];
  page.on("console", (m) => {
    const t = m.type();
    const text = m.text();
    if (
      t === "error"
      || t === "warning"
      || /native|live|plan|expo|silence|refus|fail|efficient|add_node|connect|worklet|wasm/i.test(text)
    ) {
      msgs.push(`[${t}] ${text.slice(0, 500)}`);
    }
  });
  page.on("pageerror", (e) => msgs.push(`[pageerror] ${e.message}`));

  await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded" });
  await page.click("#nodeBootStartButton");
  await page.waitForFunction(
    () => document.body?.dataset?.nodeBootFinished,
    null,
    { timeout: 120000 },
  );

  const setup = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const blank = {
      schemaVersion: nodeGraphMvp.patch?.schemaVersion || 1,
      nodes: [{ id: "output", type: "output", gx: 12, gy: 4, params: {}, ui: {} }],
      connections: [],
      modulations: [],
    };
    commitNodeGraphPatch(blank, { topologyEdit: true, record: false });
    await wait(150);
    const poly = showNodeGraphModule("polyBlep", null, { record: false });
    await wait(150);
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    patch.connections = [{
      id: "c_poly_out",
      sourceNode: poly,
      sourcePort: "Wave",
      destinationNode: "output",
      destinationPort: "Mono",
    }];
    commitNodeGraphPatch(patch, { topologyEdit: true, record: false });
    await wait(150);
    if (typeof toggleNodeGraphLiveOutput === "function") {
      if (!nodeGraphMvp.live?.outputEnabled) await toggleNodeGraphLiveOutput();
    }
    if (typeof startNodeGraphLiveAudio === "function") {
      await startNodeGraphLiveAudio();
    }
    await wait(1200);
    return {
      nodes: (nodeGraphMvp.patch.nodes || []).map((n) => n.type),
      ctxState: nodeGraphMvp.live?.context?.state || null,
      outputEnabled: !!nodeGraphMvp.live?.outputEnabled,
      evidence: nodeGraphMvp.live?.lastEvidence || null,
      planEvidence: nodeGraphMvp.live?.planEvidence || null,
    };
  });
  console.log("SETUP", JSON.stringify(setup, null, 2));
  const peakBefore = await measurePeak(page, 0.4);
  console.log("PEAK_BEFORE", JSON.stringify(peakBefore, null, 2));

  const add = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let id = null;
    let err = null;
    try {
      id = showNodeGraphModule("expoPluckEnvelope", null, { record: false });
    } catch (e) {
      err = String(e && e.message || e);
    }
    await wait(1500);
    return {
      id,
      err,
      evidence: nodeGraphMvp.live?.lastEvidence || null,
      planEvidence: nodeGraphMvp.live?.planEvidence || null,
      ctxState: nodeGraphMvp.live?.context?.state || null,
      outputEnabled: !!nodeGraphMvp.live?.outputEnabled,
      nodeTypes: (nodeGraphMvp.patch.nodes || []).map((n) => n.type),
    };
  });
  console.log("ADD", JSON.stringify(add, null, 2));
  const peakAfter = await measurePeak(page, 0.4);
  console.log("PEAK_AFTER", JSON.stringify(peakAfter, null, 2));

  // Remove expo and measure again
  const removed = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    patch.nodes = (patch.nodes || []).filter((n) => n.type !== "expoPluckEnvelope");
    commitNodeGraphPatch(patch, { topologyEdit: true, record: false });
    await wait(1200);
    return {
      nodeTypes: (patch.nodes || []).map((n) => n.type),
      evidence: nodeGraphMvp.live?.lastEvidence || null,
      planEvidence: nodeGraphMvp.live?.planEvidence || null,
    };
  });
  console.log("REMOVED", JSON.stringify(removed, null, 2));
  const peakRemoved = await measurePeak(page, 0.4);
  console.log("PEAK_REMOVED", JSON.stringify(peakRemoved, null, 2));

  console.log("MSGS_TAIL");
  for (const m of msgs.slice(-80)) console.log(m);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
