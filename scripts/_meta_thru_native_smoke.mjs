/**
 * Smoke: Meta In/Out native-graph thrus + demo flip/orphan hygiene.
 * Requires :8765. Run: node scripts/_meta_thru_native_smoke.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const URL = process.env.SANDBOX_URL || "http://127.0.0.1:8765/";
const DEMO = process.env.META_DEMO_PATCH
  || path.join(process.env.USERPROFILE || "", "Desktop", "metamodule not yet fully functional.json");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (err) => console.warn("pageerror", err.message));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
const start = page.locator("#nodeBootStartButton");
if (await start.count()) await start.click();
await page.waitForFunction(
  () => document.body?.classList?.contains("node-boot-ready")
    && typeof validateNodeGraphPatch === "function"
    && typeof nodeGraphMetamoduleFlipMiswiredOutletToInlet === "function",
  null,
  { timeout: 120000 },
);

// Load worklet native-graph source into page and bind thru helpers onto a stub.
const nativeSrc = await page.evaluate(async () => {
  const res = await fetch("./public/node-live-audio-worklet-native-graph.js?v=meta-thru-1");
  if (!res.ok) throw new Error(`fetch native-graph ${res.status}`);
  return res.text();
});

const demoJson = fs.existsSync(DEMO) ? fs.readFileSync(DEMO, "utf8") : null;

const result = await page.evaluate(({ nativeSrcText, demoText }) => {
  const out = { ok: false, steps: [], fail: "", demo: {} };
  const push = (s) => out.steps.push(s);
  try {
    // Minimal host so the worklet file's prototype assignments stick.
    globalThis.NodeLiveAudioProcessor = globalThis.NodeLiveAudioProcessor || function NodeLiveAudioProcessor() {};
    globalThis.NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS =
      globalThis.NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS || { hypersaw2: 158 };
    // eslint-disable-next-line no-new-func
    (0, eval)(nativeSrcText);
    const proto = NodeLiveAudioProcessor.prototype;
    if (typeof proto.nativeGraphThruInPortForNode !== "function") {
      out.fail = "nativeGraphThruInPortForNode missing after eval";
      return out;
    }

    const thru = (type, port) => proto.nativeGraphThruInPortForNode.call(
      {},
      { type, bypassSpec: null },
      port,
    );
    const inOut = thru("metamoduleIn", "Out");
    const outOut = thru("metamoduleOut", "Out");
    const mono = thru("metamoduleOut", "Mono");
    push(`thru In.Out→${inOut} Out.Out→${outOut} Out.Mono→${mono}`);
    if (inOut !== "In" || outOut !== "In" || mono !== "In") {
      out.fail = `expected Out/Mono→In, got In=${inOut} Out=${outOut} Mono=${mono}`;
      return out;
    }

    const fake = {
      nodes: new Map([
        ["metaOut", { id: "metaOut", type: "metamoduleOut" }],
        ["hs", { id: "hs", type: "hypersaw2" }],
      ]),
      _planConnections: [],
      _planConnectionsByDst: null,
      _planConnectionsByDstSerial: null,
      ensurePlanConnectionsByDst: proto.ensurePlanConnectionsByDst,
      nativeGraphThruInPortForNode: proto.nativeGraphThruInPortForNode,
      nativeGraphObserverThruInPort: proto.nativeGraphObserverThruInPort,
      resolveNativeGraphThruSources: proto.resolveNativeGraphThruSources,
    };
    const undriven = proto.resolveNativeGraphThruSources.call(fake, "metaOut", "Out", null, 0);
    push(`undriven Meta Out resolve → ${JSON.stringify(undriven)}`);
    if (!Array.isArray(undriven) || undriven.length !== 0) {
      out.fail = `undriven Meta Out must resolve [], got ${JSON.stringify(undriven)}`;
      return out;
    }

    fake._planConnections = [
      { sourceNode: "hs", sourcePort: "Left", destinationNode: "metaOut", destinationPort: "In" },
    ];
    fake._planConnectionsByDst = null;
    const driven = proto.resolveNativeGraphThruSources.call(
      fake,
      "metaOut",
      "Out",
      new Set(["hs"]),
      0,
    );
    push(`driven Meta Out resolve → ${JSON.stringify(driven)}`);
    if (!driven.some((r) => r.sourceNode === "hs" && r.sourcePort === "Left")) {
      out.fail = `driven Meta Out should walk to hs.Left, got ${JSON.stringify(driven)}`;
      return out;
    }

    if (demoText) {
      const raw = JSON.parse(demoText);
      const normalized = validateNodeGraphPatch(raw);
      const fPortal = normalized.nodes.find((n) => {
        if (!n || (n.type !== "metamoduleIn" && n.type !== "metamoduleOut")) return false;
        const id = String(n.id || "");
        const alias = String(n.alias || "");
        return id === "metamoduleOut-7" || id.includes("Out-7") || alias === "ƒ";
      });
      const orphans = normalized.nodes.filter((n) =>
        (n.type === "metamoduleIn" || n.type === "metamoduleOut")
        && !String(n.ownerMetamoduleId || "").trim()
      );
      const meta = normalized.nodes.find((n) => n.id === "metamodule-1");
      const boundary = meta?.metamodule?.boundary || [];
      const fEntry = boundary.find((e) =>
        String(e.id || "") === String(fPortal?.id || "")
        || String(e.shellPort || "") === "ƒ"
      );
      out.demo = {
        fPortalType: fPortal?.type || null,
        fPortalId: fPortal?.id || null,
        fBoundaryDir: fEntry?.direction || null,
        fBoundaryType: fEntry?.type || null,
        orphanCount: orphans.length,
        orphanIds: orphans.map((n) => n.id),
        shellPorts: typeof nodeGraphMetamoduleShellPorts === "function"
          ? nodeGraphMetamoduleShellPorts(meta)
          : null,
      };
      push(`demo fPortal=${out.demo.fPortalType}/${out.demo.fPortalId} orphans=${out.demo.orphanCount}`);
      push(`shell ${JSON.stringify(out.demo.shellPorts)}`);
      if (out.demo.fPortalType !== "metamoduleIn") {
        out.fail = `demo ƒ portal should flip to metamoduleIn, got ${out.demo.fPortalType}`;
        return out;
      }
      if (out.demo.fBoundaryDir !== "in" && out.demo.fBoundaryType !== "metamoduleIn") {
        out.fail = `boundary ƒ should be inlet, got ${JSON.stringify(fEntry)}`;
        return out;
      }
      if (out.demo.orphanCount > 0) {
        out.fail = `expected orphans pruned, still have ${out.demo.orphanIds.join(",")}`;
        return out;
      }
      const inputs = out.demo.shellPorts?.inputs || [];
      if (!inputs.includes("ƒ") && !inputs.includes("f")) {
        out.fail = `shell should expose ƒ inlet after flip, got inputs=${inputs.join(",")}`;
        return out;
      }
    } else {
      push("demo patch skipped (file missing)");
    }

    out.ok = true;
    return out;
  } catch (err) {
    out.fail = err?.stack || err?.message || String(err);
    return out;
  }
}, { nativeSrcText: nativeSrc, demoText: demoJson });

await browser.close();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  console.error("FAIL:", result.fail);
  process.exit(1);
}
console.log("OK");
