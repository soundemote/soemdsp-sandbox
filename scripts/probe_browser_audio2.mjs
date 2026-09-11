import { chromium } from "playwright";
import fs from "fs";

const patch = JSON.parse(fs.readFileSync("C:/Users/argit/Desktop/not working patch.json", "utf8"));
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded", timeout: 60000 });
const start = page.locator("#nodeBootStartButton");
if (await start.count()) await start.first().click();
await page.waitForTimeout(3000);

const info = await page.evaluate(async (patch) => {
  const mvp = window.nodeGraphMvp;
  const keys = mvp ? Object.keys(mvp).sort() : [];
  const interesting = keys.filter((k) => /audio|worklet|native|patch|load|play|efficient|plan|status/i.test(k));
  const out = { interesting, typeofMvp: typeof mvp };

  // Find patch import on window
  const winKeys = Object.keys(window).filter((k) => /patch|load|import|graph/i.test(k)).slice(0, 80);
  out.winKeys = winKeys;

  // Try common file-action path
  if (typeof window.nodeGraphImportPatchObject === "function") {
    out.importFn = "nodeGraphImportPatchObject";
    try {
      await window.nodeGraphImportPatchObject(patch);
      out.imported = true;
    } catch (e) {
      out.imported = String(e?.message || e);
    }
  } else if (typeof window.nodeGraphApplyPatchObject === "function") {
    out.importFn = "nodeGraphApplyPatchObject";
    try {
      await window.nodeGraphApplyPatchObject(patch);
      out.imported = true;
    } catch (e) {
      out.imported = String(e?.message || e);
    }
  }

  // Audio context
  const ac = mvp?.audioContext || mvp?.liveAudioContext || mvp?.context;
  out.acState = ac?.state || null;
  if (ac?.resume) await ac.resume();
  out.acState2 = ac?.state || null;

  // Worklet processor ref
  out.hasWorklet = !!(mvp?.workletNode || mvp?.liveWorklet || mvp?.audioWorkletNode);
  out.nativeCompiled = mvp?.liveProcessor?.nativeGraphCompiled
    ?? mvp?.workletNode?.port
    ?? null;

  // Ask worklet for status via message if possible
  const port = mvp?.workletNode?.port || mvp?.liveWorklet?.port;
  if (port) {
    out.hasPort = true;
    const status = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ timeout: true }), 1500);
      const onMsg = (ev) => {
        const d = ev.data;
        if (d && (d.type === "nativeGraphStatus" || d.status || d.type === "status")) {
          clearTimeout(t);
          port.removeEventListener("message", onMsg);
          resolve(d);
        }
      };
      port.addEventListener("message", onMsg);
      try { port.postMessage({ type: "getNativeGraphStatus" }); } catch (_) {}
      try { port.postMessage({ type: "status" }); } catch (_) {}
    });
    out.portStatus = status;
  }

  // Peak from destination
  try {
    if (ac) {
      const an = ac.createAnalyser();
      an.fftSize = 2048;
      const dest = mvp?.workletNode || mvp?.liveWorklet;
      if (dest?.connect) {
        dest.connect(an);
        // keep connected to destination too if needed
      }
      await new Promise((r) => setTimeout(r, 800));
      const buf = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      out.analyserPeak = peak;
    }
  } catch (e) {
    out.analyserErr = String(e.message || e);
  }

  return out;
}, patch);

console.log(JSON.stringify(info, null, 2));
console.log("--- logs ---");
logs.slice(-100).forEach((l) => console.log(l));
await browser.close();
