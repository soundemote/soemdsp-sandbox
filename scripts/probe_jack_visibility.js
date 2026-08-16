// Headless Chrome census: load the live sandbox and count painted jacks.
// Confirms inlets/outlets exist in the rendered DOM with non-zero boxes.

var child_process = require("child_process");
var fs = require("fs");
var http = require("http");
var os = require("os");
var path = require("path");

var URL = process.env.SOEMDSP_URL || "http://127.0.0.1:8765/";
var CHROME = process.env.CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
var PORT = Number(process.env.SOEMDSP_CDP_PORT || 9333);
var WAIT_MS = Number(process.env.SOEMDSP_JACK_WAIT_MS || 25000);

function fail(msg) {
  console.error("FAIL " + msg);
  process.exit(1);
}

function getJson(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      var buf = "";
      res.on("data", function (c) { buf += c; });
      res.on("end", function () {
        try { resolve(JSON.parse(buf)); } catch (err) { reject(err); }
      });
    }).on("error", reject);
  });
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function waitForCdp(tries) {
  var left = tries || 40;
  return getJson("http://127.0.0.1:" + PORT + "/json/version").catch(function (err) {
    if (left <= 1) throw err;
    return sleep(250).then(function () { return waitForCdp(left - 1); });
  });
}

function Cdp(wsUrl) {
  this.ws = new WebSocket(wsUrl);
  this.next = 1;
  this.pending = new Map();
  var self = this;
  this.ready = new Promise(function (resolve, reject) {
    self.ws.addEventListener("open", resolve);
    self.ws.addEventListener("error", reject);
  });
  this.ws.addEventListener("message", function (ev) {
    var msg = JSON.parse(String(ev.data));
    if (msg.id && self.pending.has(msg.id)) {
      var pair = self.pending.get(msg.id);
      self.pending.delete(msg.id);
      if (msg.error) pair.reject(new Error(JSON.stringify(msg.error)));
      else pair.resolve(msg.result);
    }
  });
}

Cdp.prototype.send = function (method, params) {
  var id = this.next++;
  var self = this;
  return new Promise(function (resolve, reject) {
    self.pending.set(id, { resolve: resolve, reject: reject });
    self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
};

Cdp.prototype.eval = function (expression) {
  return this.send("Runtime.evaluate", {
    expression: expression,
    awaitPromise: true,
    returnByValue: true,
  }).then(function (res) {
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "evaluate failed");
    }
    return res.result && res.result.value;
  });
};

async function main() {
  if (!fs.existsSync(CHROME)) fail("Chrome not found at " + CHROME);
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), "soemdsp-jacks-"));
  var chrome = child_process.spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--mute-audio",
    "--user-data-dir=" + profile,
    "--remote-debugging-port=" + PORT,
    "--remote-allow-origins=*",
    URL,
  ], { stdio: "ignore" });

  var exitCode = 1;
  try {
    await waitForCdp(50);
    var pages = [];
    for (var i = 0; i < 40; i++) {
      pages = await getJson("http://127.0.0.1:" + PORT + "/json/list");
      if (Array.isArray(pages) && pages.some(function (p) { return p.type === "page" && p.webSocketDebuggerUrl; })) {
        break;
      }
      await sleep(250);
    }
    var page = (pages || []).find(function (p) {
      return p.type === "page" && p.webSocketDebuggerUrl && String(p.url || "").indexOf("127.0.0.1:8765") >= 0;
    }) || (pages || []).find(function (p) { return p.type === "page" && p.webSocketDebuggerUrl; });
    if (!page) fail("no Chrome page target");
    var cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    var deadline = Date.now() + WAIT_MS;
    var report = null;
    var last = "";
    while (Date.now() < deadline) {
      report = await cdp.eval("(() => {\n"
        + "  const fn = window.nodeGraphJackVisibilityCensus;\n"
        + "  const nodes = document.querySelectorAll('.dsp-node').length;\n"
        + "  const ports = document.querySelectorAll('.node-port:not(.node-param-port):not(.node-io-proxy-port)').length;\n"
        + "  const census = typeof fn === 'function' ? fn() : null;\n"
        + "  const err = window.__seDebugConsole && window.__seDebugConsole.entries\n"
        + "    ? window.__seDebugConsole.entries().filter(e => e.level === 'ERROR').slice(0, 8).map(e => e.msg)\n"
        + "    : [];\n"
        + "  return { nodes, ports, census, token: document.querySelector('[data-build-token-value]')?.textContent || '', errors: err, applyFn: typeof window.nodeGraphApplyJackChrome === 'function' };\n"
        + "})()");
      last = JSON.stringify(report);
      var bootReady = await cdp.eval("document.body.classList.contains('node-boot-ready')");
      if (report && report.census && report.census.paintedCount > 0 && bootReady) break;
      if (report && report.nodes > 0 && report.ports > 0 && report.census && report.census.paintedCount === 0) {
        // DOM exists; give layout a couple more frames, then accept the zero if it sticks.
        await sleep(400);
        report = await cdp.eval("(() => {\n"
          + "  if (typeof nodeGraphLogJackVisibility === 'function') nodeGraphLogJackVisibility('probe');\n"
          + "  return typeof nodeGraphJackVisibilityCensus === 'function' ? nodeGraphJackVisibilityCensus() : null;\n"
          + "})()");
        if (report) break;
      }
      await sleep(250);
    }

    console.log("probe token=" + (report && report.token));
    console.log("probe applyFn=" + (report && report.applyFn));
    console.log("probe nodes=" + (report && report.nodes) + " ports=" + (report && report.ports));
    console.log("probe census=" + JSON.stringify(report && report.census, null, 2));
    if (report && report.errors && report.errors.length) {
      console.log("probe errors=" + JSON.stringify(report.errors, null, 2));
    }
    var painted = report && report.census && report.census.paintedCount;
    var inlets = report && report.census && report.census.inletCount;
    var outlets = report && report.census && report.census.outletCount;
    if (!(painted > 0)) fail("no painted jacks. last=" + last);
    if (!(inlets > 0)) fail("no painted inlets. last=" + last);
    if (!(outlets > 0)) fail("no painted outlets. last=" + last);
    var geo = await cdp.eval("(() => {\n"
      + "  const ws = document.getElementById('nodeGraphWorkspace');\n"
      + "  const nodes = [...document.querySelectorAll('.dsp-node')].map((n) => {\n"
      + "    const io = n.querySelector(':scope > .dsp-node-io-section');\n"
      + "    const r = n.getBoundingClientRect();\n"
      + "    const ir = io?.getBoundingClientRect();\n"
      + "    const cs = io ? getComputedStyle(io) : null;\n"
      + "    const port = n.querySelector('.node-port:not(.node-param-port)');\n"
      + "    const pcs = port ? getComputedStyle(port) : null;\n"
      + "    return {\n"
      + "      id: n.dataset.node, type: n.dataset.nodeType,\n"
      + "      ioHidden: n.classList.contains('io-hidden'),\n"
      + "      classes: n.className,\n"
      + "      node: {x:r.x,y:r.y,w:r.width,h:r.height},\n"
      + "      io: io ? {x:ir.x,y:ir.y,w:ir.width,h:ir.height,display:cs.display,visibility:cs.visibility,hidden:io.hidden} : null,\n"
      + "      labels: [...n.querySelectorAll('.node-io-label')].map((el) => el.textContent),\n"
      + "      portBg: pcs?.backgroundImage || '',\n"
      + "      portStroke: pcs?.getPropertyValue('--node-port-crescent-stroke') || '',\n"
      + "    };\n"
      + "  });\n"
      + "  return { wsClass: ws?.className || '', hideUnused: ws?.classList.contains('patch-unused-ports-hidden'), nodes };\n"
      + "})()");
    console.log("probe geo=" + JSON.stringify(geo, null, 2));
    var shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    if (shot && shot.data) {
      var out = require("path").join(__dirname, "..", "backups", "jack-visibility-probe.png");
      require("fs").writeFileSync(out, Buffer.from(shot.data, "base64"));
      console.log("probe screenshot=" + out);
    }
    console.log("ok jacks visible painted=" + painted + " in=" + inlets + " out=" + outlets);
    exitCode = 0;
  } catch (err) {
    console.error(err && err.stack || err);
  } finally {
    try { chrome.kill(); } catch (_) {}
    process.exit(exitCode);
  }
}

main();
