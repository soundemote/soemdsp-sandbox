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
    if (message.type === "setKeyboardModuleSignal") {
      this.setKeyboardModuleSignal(message.signal);
      return;
    }
    if (message.type === "setMidiKeyboardHeldKeysBitmask") {
      this.setMidiKeyboardHeldKeysBitmask(message.mask, message.velocities, message.octave);
      return;
    }
    if (message.type === "setChordMemoryLatch") {
      this.setChordMemoryLatch?.(message.slotsByNode, message.playMaskByNode, message.momentaryPlayMask);
      return;
    }
    if (message.type === "setMidiKeyboardPlayKeysBitmask") {
      this.setMidiKeyboardPlayKeysBitmask(message.mask);
      return;
    }
    if (message.type === "setPolyphonyVelocities") {
      this.setPolyphonyVelocities(message.source, message.velocities);
      return;
    }
    if (message.type === "setMetaView") {
      if (typeof this.applyMetaViewPreview === "function") {
        this.applyMetaViewPreview(message.metaId);
      } else {
        this._metaViewId = String(message.metaId || "");
      }
      this._nativeGraphTopologyKey = "";
      if (typeof this.compileNativeGraphFromPlan === "function") {
        this.compileNativeGraphFromPlan();
      }
      return;
    }
    if (message.type === "vmNoteOn") {
      this.vmNoteOn?.(message.note, message.velocity);
      return;
    }
    if (message.type === "vmNoteOff") {
      this.vmNoteOff?.(message.note);
      return;
    }
    if (message.type === "vmAllNotesOff") {
      this.vmAllNotesOff?.();
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
    if (message.type === "arpOverride") {
      const nid = String(message.nodeId || "");
      const midi = Number(message.midi);
      if (!this._arpOverrideByNode) this._arpOverrideByNode = new Map();
      if (!nid) return;
      if (Number.isFinite(midi) && midi >= 0) {
        this._arpOverrideByNode.set(nid, Math.max(0, Math.min(127, midi | 0)));
      } else {
        this._arpOverrideByNode.set(nid, -1);
      }
      const native = this.nativeGraph;
      if (native?.soemdsp_arp_set_override_midi && this.nativeGraphHandle) {
        const hash = this.fnv1aHash32?.(nid) || 0;
        let handle = 0;
        try {
          handle = native.soemdsp_graph_node_native_handle?.(this.nativeGraphHandle, hash) | 0;
        } catch (_e) {
          handle = 0;
        }
        if (handle > 0) {
          native.soemdsp_arp_set_override_midi(handle, this._arpOverrideByNode.get(nid));
        }
      }
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
      this.setSpeed(message.speed, { restartSequencer: message.restartSequencer === true });
      return;
    }
    if (message.type === "setSpeedLimit") {
      this.setSpeedLimit(message.speedLimit);
      return;
    }
};
