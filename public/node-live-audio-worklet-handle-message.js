// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: handleMessage — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.handleMessage = function handleMessage(message) {
    if (message.type === "stop") {
      if (message.sessionId !== this.sessionId || message.planSerial !== this.planSerial) {
        return;
      }
      this.clearPlan();
      return;
    }
    if (message.type === "setPlan") {
      // Efficient path needs graph_engine exports before compile. Wasm instantiate
      // is async — queue the plan until nativeGraphReady rather than compiling empty.
      if (this.efficientProduct && !this.nativeGraphReady) {
        this._pendingSetPlan = { plan: message.plan || message, message };
        return;
      }
      this.setPlan(message.plan, message);
      return;
    }
    if (message.type === "setConnections") {
      if (this.efficientProduct && !this.nativeGraphReady) {
        this._pendingSetConnections = { plan: message.plan || message, message };
        return;
      }
      this.setConnections(message.plan || message, message);
      return;
    }
    if (message.type === "setNativeModuleWasm") {
      this.setNativeModuleWasm(message);
      return;
    }
    if (message.type === "setParams") {
      this.setParams(message.nodes, message);
      return;
    }
    if (message.type === "setGraphData") {
      this.setGraphData(message.graphData);
      return;
    }
    if (message.type === "gpuAdditiveChunk") {
      this.pushGpuAdditiveChunk(message);
      return;
    }
    if (message.type === "setMidiKeyboardSignal") {
      this.setMidiKeyboardSignal(message.signal);
      return;
    }
    if (message.type === "setMidiKeyboardHeldKeysBitmask") {
      this.setMidiKeyboardHeldKeysBitmask(message.low, message.high);
      return;
    }
    if (message.type === "setMacroControls") {
      this.setMacroControls(message.values);
      return;
    }
    if (message.type === "setPitchModWheelSignal") {
      this.setPitchModWheelSignal(message.signal);
      return;
    }
    if (message.type === "externalButtonEvent") {
      this.setExternalButtonEvent(message.name);
      return;
    }
    if (message.type === "wireBreakEvent") {
      this.setWireBreakEvent();
      return;
    }
    if (message.type === "wireConnectEvent") {
      this.setWireConnectEvent();
      return;
    }
    if (message.type === "wireDisconnectEvent") {
      this.setWireDisconnectEvent();
      return;
    }
    if (message.type === "windowReopenEvent") {
      this.setWindowReopenEvent();
      return;
    }
    if (message.type === "shootingStarExplosionEvent") {
      this.setShootingStarExplosionEvent(message.speed);
      return;
    }
    if (message.type === "impulseButtonTrigger") {
      this.setImpulseButtonTrigger(message.nodeId, message.amplitude);
      return;
    }
    if (message.type === "bugButtonInteraction") {
      this.setBugButtonInteraction(message);
      return;
    }
    if (message.type === "keypadInteraction") {
      this.setKeypadInteraction(message);
      return;
    }
    if (message.type === "inputWireBreakTrigger") {
      this.setInputWireBreakTrigger(message.nodeId, message.port);
      return;
    }
    if (message.type === "setDisplayFps") {
      const fps = Number(message.displayFps);
      this.displayFps = Number.isFinite(fps)
        ? Math.max(0, Math.min(240, Math.round(fps)))
        : 0;
      return;
    }
    if (message.type === "setSpeed") {
      this.setSpeed(message.speed);
      return;
    }
    if (message.type === "setSpeedLimit") {
      this.setSpeedLimit(message.speedLimit);
      return;
    }
};
