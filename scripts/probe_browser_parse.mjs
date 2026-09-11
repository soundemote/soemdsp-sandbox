import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
const failed = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}\n${err.stack || ""}`));
page.on("requestfailed", (req) => failed.push(`${req.url()} :: ${req.failure()?.errorText}`));
page.on("response", async (res) => {
  if (!res.ok() && res.url().includes("127.0.0.1:8765")) {
    failed.push(`HTTP ${res.status()} ${res.url()}`);
  }
});

await page.goto("http://127.0.0.1:8765/", { waitUntil: "networkidle", timeout: 90000 }).catch((e) => {
  logs.push(`[goto] ${e.message}`);
});

// Click start
const start = page.locator("#nodeBootStartButton");
if (await start.count()) await start.click().catch(() => {});
await page.waitForTimeout(4000);

const scripts = await page.evaluate(() => {
  return [...document.scripts].map((s) => ({
    src: s.src || "(inline)",
    async: s.async,
    defer: s.defer,
    type: s.type || "",
  }));
});

console.log("scripts", scripts.length);
console.log("--- failed ---");
failed.forEach((f) => console.log(f));
console.log("--- logs ---");
logs.forEach((l) => console.log(l));

// Try to find which script has Unexpected end of input by fetching each
const bad = [];
for (const s of scripts) {
  if (!s.src || s.src.startsWith("http") === false && !s.src.includes("127.0.0.1")) continue;
  if (!s.src.includes("127.0.0.1:8765") && !s.src.includes("/public/")) continue;
  try {
    const text = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return { ok: r.ok, status: r.status, text: await r.text() };
    }, s.src);
    if (!text.ok) {
      bad.push({ src: s.src, err: `HTTP ${text.status}` });
      continue;
    }
    try {
      // eslint-disable-next-line no-new-func
      new Function(text.text);
    } catch (e) {
      bad.push({ src: s.src, err: String(e.message), len: text.text.length, tail: text.text.slice(-120) });
    }
  } catch (e) {
    bad.push({ src: s.src, err: String(e.message) });
  }
}
console.log("--- parse failures ---");
console.log(JSON.stringify(bad, null, 2));

await browser.close();
