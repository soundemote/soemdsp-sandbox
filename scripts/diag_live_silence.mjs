// Headless probe: start Live, read status/meters/evidence after a few seconds.
import { chromium } from "playwright";

const url = process.env.DIAG_URL || "http://127.0.0.1:8765/?v=efficient-init-1";

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage();
page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning") {
    console.log(`[console.${t}]`, msg.text());
  }
});
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.addInitScript(() => {
  window.__diagWorkletMsgs = [];
  const push = (d) => {
    if (!d || typeof d !== "object") return;
    if (!(d.type === "nativeGraphStatus" || d.type === "nativeModuleStatus"
      || d.type === "meter" || d.type === "planApplied" || d.type === "planRejected"
      || d.type === "planForeignStripped" || d.type === "paramsApplied")) {
      return;
    }
    window.__diagWorkletMsgs.push({
      type: d.type,
      status: d.status,
      message: d.message,
      name: d.name,
      peak: d.peak,
      compiled: d.compiled,
      foreignTypes: d.foreignTypes,
    });
    if (window.__diagWorkletMsgs.length > 120) window.__diagWorkletMsgs.shift();
  };
  const hook = () => {
    if (typeof globalThis.handleNodeGraphLiveWorkletMessage !== "function") return false;
    if (globalThis.handleNodeGraphLiveWorkletMessage.__diagHooked) return true;
    const prev = globalThis.handleNodeGraphLiveWorkletMessage;
    globalThis.handleNodeGraphLiveWorkletMessage = function diagHandle(event) {
      push(event?.data || event);
      return prev.apply(this, arguments);
    };
    globalThis.handleNodeGraphLiveWorkletMessage.__diagHooked = true;
    return true;
  };
  const id = setInterval(() => { if (hook()) clearInterval(id); }, 20);
  setTimeout(() => clearInterval(id), 20000);
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);

const before = await page.evaluate(() => {
  const nodes = Array.isArray(globalThis.nodeGraphMvp?.patch?.nodes)
    ? globalThis.nodeGraphMvp.patch.nodes.map((n) => n?.type)
    : [];
  const foreign = typeof globalThis.nodeGraphEfficientProductForeignTypesFromNodes === "function"
    ? globalThis.nodeGraphEfficientProductForeignTypesFromNodes(globalThis.nodeGraphMvp?.patch?.nodes || [])
    : [];
  return {
    status: document.getElementById("nodeLiveStatus")?.textContent || "",
    plan: document.getElementById("nodeLivePlanStatus")?.textContent || "",
    engine: document.getElementById("nodeLiveEngineStatus")?.textContent || "",
    outputBtn: document.getElementById("nodeLiveOutputButton")?.textContent || "",
    transport: document.querySelector("[data-transport-action='play']")?.dataset?.transportState
      || document.querySelector("#nodeTransportPlay")?.dataset?.transportState || "",
    efficient: globalThis.nodeGraphMvp?.efficientProduct,
    speed: globalThis.nodeGraphMvp?.live?.speedMultiplier,
    hasNode: Boolean(globalThis.nodeGraphMvp?.live?.node),
    outputEnabled: globalThis.nodeGraphMvp?.live?.outputEnabled,
    outputMuted: globalThis.nodeGraphMvp?.live?.outputMuted,
    outputGain: globalThis.nodeGraphMvp?.live?.outputGain?.gain?.value,
    ctxState: globalThis.nodeGraphMvp?.live?.context?.state,
    patchName: globalThis.nodeGraphMvp?.patch?.info?.name || "",
    nodeTypes: nodes,
    foreignTypes: foreign,
  };
});
console.log("BEFORE", JSON.stringify(before, null, 2));

// Start via API (toolbar may be CSS-hidden in headless / compact layout).
const startResult = await page.evaluate(async () => {
  const log = [];
  try {
    if (typeof globalThis.setNodeGraphLiveOutputEnabled === "function") {
      log.push("calling setNodeGraphLiveOutputEnabled(true)");
      await globalThis.setNodeGraphLiveOutputEnabled(true);
      log.push("setNodeGraphLiveOutputEnabled done");
    } else if (typeof globalThis.nodeGraphTransportHandleAction === "function") {
      log.push("calling transport play");
      globalThis.nodeGraphTransportHandleAction("play");
    } else {
      log.push("no start API");
    }
  } catch (e) {
    log.push(`start error: ${e?.message || e}`);
  }
  try {
    const ctx = globalThis.nodeGraphMvp?.live?.context;
    if (ctx?.resume) {
      await ctx.resume();
      log.push(`ctx.state=${ctx.state}`);
    }
  } catch (e) {
    log.push(`resume error: ${e?.message || e}`);
  }
  return log;
});
console.log("START", JSON.stringify(startResult, null, 2));

await page.waitForTimeout(5000);

const after = await page.evaluate(() => {
  const live = globalThis.nodeGraphMvp?.live || {};
  const evidence = live.lastEvidence || null;
  const meterEl = document.getElementById("nodeLiveMeter") || document.querySelector("[data-live-meter]");
  const pills = [...document.querySelectorAll(".pill")].map((el) => el.id + "=" + (el.textContent || "").trim());
  return {
    status: document.getElementById("nodeLiveStatus")?.textContent || "",
    plan: document.getElementById("nodeLivePlanStatus")?.textContent || "",
    engine: document.getElementById("nodeLiveEngineStatus")?.textContent || "",
    outputBtn: document.getElementById("nodeLiveOutputButton")?.textContent || "",
    transportPlay: document.querySelector("[data-transport-action='play']")?.dataset?.transportState || "",
    speed: live.speedMultiplier,
    hasNode: Boolean(live.node),
    usesWorklet: live.usesWorklet,
    outputEnabled: live.outputEnabled,
    outputMuted: live.outputMuted,
    outputGain: live.outputGain?.gain?.value,
    ctxState: live.context?.state,
    meterPeak: live.meterPeak,
    meterRms: live.meterRms,
    meterText: meterEl?.textContent || "",
    planSerial: live.planSerial,
    sessionId: live.sessionId,
    sentNative: live.node?.nodeGraphSentNativeModules
      ? [...live.node.nodeGraphSentNativeModules]
      : null,
    combinedUnavailable: Boolean(live.node?.nodeGraphCombinedUnavailable),
    evidenceType: evidence?.type || evidence?.kind || null,
    evidence,
    pills,
  };
});
console.log("AFTER", JSON.stringify(after, null, 2));

const msgs = await page.evaluate(() => window.__diagWorkletMsgs || []);
const summary = {
  nativeGraph: msgs.filter((m) => m.type === "nativeGraphStatus").slice(-10),
  nativeModule: msgs.filter((m) => m.type === "nativeModuleStatus").slice(-10),
  meters: msgs.filter((m) => m.type === "meter").slice(-5),
  plan: msgs.filter((m) => m.type === "planApplied" || m.type === "planRejected" || m.type === "planForeignStripped"),
  meterMaxPeak: msgs.filter((m) => m.type === "meter").reduce((a, m) => Math.max(a, Number(m.peak) || 0), 0),
};
console.log("WORKLET_MSGS", JSON.stringify(summary, null, 2));

await browser.close();
process.exit(summary.meterMaxPeak > 0.001 || summary.nativeGraph.some((m) => m.status === "compiled") ? 0 : 2);
