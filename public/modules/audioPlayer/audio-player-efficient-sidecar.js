// Efficient-product Music Player peel — runs after native graph_process_block.
// Plays planar samples from this.samples and mixes into hardware outs via
// audioPlayer → Output connections (native graph skips audioPlayer nodes).
// Temporary until native audio_player buffer upload lands (APP_POLICY §0b).

NodeLiveAudioProcessor.prototype.processAudioPlayerEfficientSidecar = function processAudioPlayerEfficientSidecar(
  output,
  frames,
) {
  const ids = this.audioPlayerNodeIds;
  if (!Array.isArray(ids) || !ids.length) return;
  if (!output || !output[0] || !(frames > 0)) return;
  if (typeof this.audioPlayerSample !== "function") return;

  const rate = Math.max(1, Number(this.engineSampleRate) || Number(sampleRate) || 44100);
  const outL = output[0];
  const outR = output[1] || output[0];
  const nFrames = Math.min(frames, outL.length | 0);

  // Cache routes: player → Output when plan connections change.
  const conns = Array.isArray(this._planConnections) ? this._planConnections : [];
  const routeKey = `${ids.join(",")}|${conns.length}|${this.patchFingerprint || ""}`;
  if (!this._audioPlayerRoutes || this._audioPlayerRouteKey !== routeKey) {
    this._audioPlayerRouteKey = routeKey;
    this._audioPlayerRoutes = this.buildAudioPlayerEfficientRoutes(ids, conns);
  }
  const routes = this._audioPlayerRoutes;
  if (!routes.length) return;

  const readParam = (node, key, fallback) => {
    const p = node?.params || node?.parameters || {};
    const n = Number(p[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  // Interim: param-driven transport; live CV jacks (Speed/Phase/Reset) stay 0
  // unless we later pull native taps. Enough for load → Play → stereo.
  const readInput = () => 0;

  // Unique players in route list (sample once per frame — do not double-advance).
  const playerOrder = [];
  const seen = new Set();
  for (let r = 0; r < routes.length; r += 1) {
    const id = routes[r].nodeId;
    if (seen.has(id)) continue;
    seen.add(id);
    playerOrder.push(id);
  }

  for (let f = 0; f < nFrames; f += 1) {
    const frameOut = Object.create(null);
    for (let p = 0; p < playerOrder.length; p += 1) {
      const nodeId = playerOrder[p];
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      frameOut[nodeId] = this.audioPlayerSample(
        node,
        nodeId,
        () => 0,
        (key, fallback) => readParam(node, key, fallback),
        rate,
      );
    }
    for (let r = 0; r < routes.length; r += 1) {
      const route = routes[r];
      const sample = frameOut[route.nodeId];
      if (!sample) continue;
      let v = 0;
      if (route.src === "left") v = Number(sample.Left) || 0;
      else if (route.src === "right") v = Number(sample.Right) || 0;
      else v = Number(sample.Mono) || 0;
      if (route.dst === "left") outL[f] = (outL[f] || 0) + v;
      else if (route.dst === "right") outR[f] = (outR[f] || 0) + v;
      else {
        outL[f] = (outL[f] || 0) + v;
        outR[f] = (outR[f] || 0) + v;
      }
    }
  }
};

NodeLiveAudioProcessor.prototype.buildAudioPlayerEfficientRoutes = function buildAudioPlayerEfficientRoutes(playerIds, planConnections) {
  const idSet = new Set((playerIds || []).map(String));
  const conns = Array.isArray(planConnections) ? planConnections : [];
  const routes = [];
  for (let i = 0; i < conns.length; i += 1) {
    const c = conns[i];
    if (!c) continue;
    const srcId = String(c.sourceNode || "");
    if (!idSet.has(srcId)) continue;
    const dstNode = this.nodes.get(String(c.destinationNode || ""));
    if (!dstNode || String(dstNode.type) !== "output") continue;
    const sp = String(c.sourcePort || "").toLowerCase();
    const dp = String(c.destinationPort || "").toLowerCase();
    let src = "mono";
    if (sp === "left" || sp === "l") src = "left";
    else if (sp === "right" || sp === "r") src = "right";
    let dst = "mono";
    if (dp === "left" || dp === "l") dst = "left";
    else if (dp === "right" || dp === "r") dst = "right";
    routes.push({ nodeId: srcId, src, dst });
  }
  return routes;
};
