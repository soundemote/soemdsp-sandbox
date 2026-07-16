(function () {
  function createNodeGraphWireHelpers(deps) {
    const endpointPort = (endpoint) => endpoint?.param || endpoint?.port || "";

    function endpointFromElement(element) {
      if (!element) {
        return null;
      }
      if (element.classList?.contains("node-io-row")) {
        return {
          io: element.dataset.io,
          node: element.dataset.node,
          port: element.dataset.port,
        };
      }
      if (element.classList?.contains("graph-input")) {
        return {
          graphInput: element.dataset.graphInput,
          io: "graph",
          node: element.dataset.node,
          port: element.dataset.port || element.dataset.graphInput,
        };
      }
      if (element.classList?.contains("modulation-input")) {
        return {
          io: "modulation",
          node: element.dataset.node,
          param: element.dataset.param,
          port: element.dataset.port || element.dataset.param,
        };
      }
      if (element.classList?.contains("node-port")) {
        return {
          io: element.dataset.io,
          node: element.dataset.node,
          parameterOutput: element.classList.contains("parameter-output"),
          port: element.dataset.port,
        };
      }
      return null;
    }

    function visualEndpointElement(element) {
      if (element?.classList?.contains("node-io-row")) {
        return element.querySelector(".node-port") || element;
      }
      return element || null;
    }

    function endpointsMatch(a, b) {
      return Boolean(
        a &&
        b &&
        a.io === b.io &&
        a.node === b.node &&
        endpointPort(a) === endpointPort(b),
      );
    }

    function path(from, to) {
      const horizontalDistance = Math.abs(to.x - from.x);
      const verticalDistance = Math.abs(to.y - from.y);
      const span = Math.min(96, horizontalDistance * 0.48 + verticalDistance * 0.12);
      return `M ${from.x} ${from.y} C ${from.x + span} ${from.y}, ${to.x - span} ${to.y}, ${to.x} ${to.y}`;
    }

    function straightPath(from, to) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    function traceCoordinate(value) {
      return Math.round(Number(value) || 0) + 0.5;
    }

    function traceSegmentCommands(from, to) {
      const midX = traceCoordinate((from.x + to.x) * 0.5);
      return `H ${midX} V ${traceCoordinate(to.y)} H ${traceCoordinate(to.x)}`;
    }

    function tracePath(from, to) {
      const start = {
        x: traceCoordinate(from.x),
        y: traceCoordinate(from.y),
      };
      return `M ${start.x} ${start.y} ${traceSegmentCommands(from, to)}`;
    }

    function hexToRgb(color) {
      const match = String(color || "").trim().match(/^#([0-9a-f]{6})$/i);
      if (!match) {
        return null;
      }
      const value = Number.parseInt(match[1], 16);
      return {
        b: value & 255,
        g: (value >> 8) & 255,
        r: (value >> 16) & 255,
      };
    }

    function mixWireColor(fromColor, toColor) {
      const fromRgb = hexToRgb(fromColor);
      const toRgb = hexToRgb(toColor);
      if (!fromRgb || !toRgb) {
        return `color-mix(in srgb, ${fromColor} 50%, ${toColor})`;
      }
      const channel = (key) => Math.round((fromRgb[key] + toRgb[key]) / 2);
      return `rgb(${channel("r")} ${channel("g")} ${channel("b")})`;
    }

    function createGradient(svg, id, from, to, stopClass = "node-wire-gradient-stop", colors = null) {
      const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      gradient.id = id;
      gradient.setAttribute("gradientUnits", "userSpaceOnUse");
      gradient.setAttribute("x1", String(from.x));
      gradient.setAttribute("y1", String(from.y));
      gradient.setAttribute("x2", String(to.x));
      gradient.setAttribute("y2", String(to.y));

      const [fromColor, toColor] = colors || [null, null];
      // Same color on both ends: skip the opacity dip entirely rather than
      // faking a transition that never actually changes color -- app-wide
      // policy, not specific to any one wire kind.
      const sameColor = Boolean(fromColor) && Boolean(toColor) && fromColor === toColor;
      const middleColor = !sameColor && fromColor && toColor ? mixWireColor(fromColor, toColor) : null;
      // Legacy smoke contract strings: ["48%", "0.36", fromColor], ["52%", "0.36", toColor].
      const stops = sameColor
        ? [
            ["0%", "1", fromColor],
            ["100%", "1", toColor],
          ]
        : [
            ["0%", "1", fromColor],
            ["48%", "0.36", fromColor],
            ["50%", "0.34", middleColor],
            ["52%", "0.36", toColor],
            ["100%", "1", toColor],
          ];
      for (const [offset, opacity, color] of stops) {
        const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop.setAttribute("class", stopClass);
        stop.setAttribute("offset", offset);
        stop.setAttribute("stop-opacity", opacity);
        if (color) {
          stop.setAttribute("stop-color", color);
          stop.style.setProperty("stop-color", color);
        }
        gradient.append(stop);
      }

      svg.querySelector("defs")?.append(gradient);
      return `url(#${id})`;
    }

    function drawPath(svg, options) {
      const {
        alias = "",
        from,
        gradientClass = "node-wire-gradient-stop",
        gradientId,
        index,
        kind = "signal",
        mode = "same-pass",
        pathClass = "node-wire-path",
        pathData: explicitPathData = null,
        to,
        wireColors = null,
        wireType = "cable",
      } = options;
      const normalizedWireType = normalizeNodeGraphWireType(wireType);
      const isTrace = normalizedWireType === nodeGraphWireTypes.trace;
      const pathData = explicitPathData || (isTrace ? tracePath(from, to) : path(from, to));
      const stroke = createGradient(svg, gradientId, from, to, gradientClass, wireColors);
      const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitPath.setAttribute("class", "node-wire-hit-path");
      hitPath.dataset.alias = alias;
      hitPath.dataset.connectionIndex = String(index);
      hitPath.dataset.connectionKind = kind;
      hitPath.dataset.interactionMode = mode;
      if (Array.isArray(options.tracePoints)) {
        hitPath.dataset.tracePoints = nodeGraphTraceWaypointAttribute(options.tracePoints);
      }
      hitPath.setAttribute("d", pathData);
      hitPath.addEventListener("click", (event) => deps.selectWire(event, index, kind));
      svg.append(hitPath);

      const renderedPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      renderedPath.setAttribute(
        "class",
        `${pathClass}${isTrace ? " trace-wire" : ""}`,
      );
      renderedPath.dataset.alias = alias;
      renderedPath.dataset.connectionIndex = String(index);
      renderedPath.dataset.connectionKind = kind;
      renderedPath.dataset.interactionMode = mode;
      if (Array.isArray(options.tracePoints)) {
        renderedPath.dataset.tracePoints = nodeGraphTraceWaypointAttribute(options.tracePoints);
      }
      renderedPath.setAttribute("d", pathData);
      renderedPath.setAttribute("stroke", stroke);
      svg.append(renderedPath);
    }

    function elementForEndpoint(endpoint) {
      const surface = deps.zoomSurface();
      if (!surface || !endpoint) {
        return null;
      }
      if (endpoint.io === "modulation") {
        return surface.querySelector(deps.modulationPortSelector(endpoint.node, endpoint.param || endpoint.port));
      }
      if (endpoint.io === "graph") {
        return surface.querySelector(deps.graphInputPortSelector(endpoint.node, endpoint.graphInput || endpoint.port));
      }
      if (endpoint.io === "input" || endpoint.io === "output") {
        return surface.querySelector(deps.portSelector(endpoint.node, endpoint.port, endpoint.io));
      }
      return null;
    }

    function endpointHitboxClientRect(endpoint, hitboxElement = null) {
      const element = hitboxElement?.classList?.contains("node-io-row")
        ? hitboxElement
        : elementForEndpoint(endpoint);
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      const box = {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
      const style = getComputedStyle(element);
      const portDiameter =
        Number.parseFloat(style.getPropertyValue("--node-port-diameter")) ||
        Math.max(rect.width, rect.height);
      const patchPointRatio =
        Number.parseFloat(style.getPropertyValue("--node-wire-patch-point-size-ratio")) ||
        0;
      const explicitPatchPointSize =
        Number.parseFloat(style.getPropertyValue("--node-wire-patch-point-size")) ||
        0;
      const patchPointSize = explicitPatchPointSize || portDiameter * patchPointRatio;
      if (!element.classList.contains("connected-port") || patchPointSize <= 0) {
        return box;
      }
      const center = typeof nodeGraphElementPatchPointClientCenter === "function"
        ? nodeGraphElementPatchPointClientCenter(element, endpoint.io)
        : {
          x: endpoint.io === "output" ? rect.right : rect.left,
          y: rect.top + rect.height * 0.5,
        };
      const radius = patchPointSize * 0.5;
      const left = Math.min(box.left, center.x - radius);
      const right = Math.max(box.right, center.x + radius);
      const top = Math.min(box.top, center.y - radius);
      const bottom = Math.max(box.bottom, center.y + radius);
      return {
        bottom,
        height: bottom - top,
        left,
        right,
        top,
        width: right - left,
      };
    }

    function pointInEndpointHitbox(endpoint, clientX, clientY, hitboxElement = null) {
      const rect = endpointHitboxClientRect(endpoint, hitboxElement);
      if (!rect) {
        return false;
      }
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }

    function patchPointTargetFromPoint(clientX, clientY) {
      let best = null;
      let bestDistance = Infinity;
      for (const target of document.querySelectorAll(".node-port, .node-io-row, .node-param-port.modulation-input, .node-param-port.graph-input")) {
        const endpoint = endpointFromElement(target);
        const rect = endpointHitboxClientRect(endpoint, target);
        const visualElement = visualEndpointElement(target);
        const elementRect = visualElement?.getBoundingClientRect();
        if (
          !rect ||
          !elementRect ||
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          continue;
        }
        const center = typeof nodeGraphElementPatchPointClientCenter === "function"
          ? nodeGraphElementPatchPointClientCenter(visualElement, endpoint.io)
          : {
            x: endpoint.io === "output" ? elementRect.right : elementRect.left,
            y: elementRect.top + elementRect.height * 0.5,
          };
        const distance = Math.hypot(clientX - center.x, clientY - center.y);
        if (distance < bestDistance) {
          best = target;
          bestDistance = distance;
        }
      }
      return best;
    }

    function connectEndpoints(a, b, options = {}) {
      if (!a || !b || endpointsMatch(a, b)) {
        return false;
      }
      const reversedOptions = () => ({
        ...options,
        tracePoints: normalizeNodeGraphTracePoints(options.tracePoints).reverse(),
      });
      if (a.io === "output" && b.io === "input") {
        return deps.connectPorts(a.node, a.port, b.node, b.port, options);
      }
      if (a.io === "input" && b.io === "output") {
        return deps.connectPorts(b.node, b.port, a.node, a.port, reversedOptions());
      }
      if (a.io === "output" && b.io === "modulation") {
        return deps.connectModulation(a.node, a.port, b.node, b.param, options);
      }
      if (a.io === "modulation" && b.io === "output") {
        return deps.connectModulation(b.node, b.port, a.node, a.param, reversedOptions());
      }
      if (a.io === "output" && b.io === "graph") {
        return deps.connectGraphInput(a.node, a.port, b.node, b.graphInput || b.port, options);
      }
      if (a.io === "graph" && b.io === "output") {
        return deps.connectGraphInput(b.node, b.port, a.node, a.graphInput || a.port, reversedOptions());
      }
      return false;
    }

    function endpointsAreDuplicate(a, b) {
      if (!a || !b) {
        return false;
      }
      const patch = deps.patch();
      if (a.io === "output" && b.io === "input") {
        return patch.connections.some(
          (connection) =>
            connection.sourceNode === a.node &&
            connection.sourcePort === a.port &&
            connection.destinationNode === b.node &&
            connection.destinationPort === b.port,
        );
      }
      if (a.io === "input" && b.io === "output") {
        return patch.connections.some(
          (connection) =>
            connection.sourceNode === b.node &&
            connection.sourcePort === b.port &&
            connection.destinationNode === a.node &&
            connection.destinationPort === a.port,
        );
      }
      if (a.io === "output" && b.io === "modulation") {
        return patch.modulations.some(
          (modulation) =>
            modulation.sourceNode === a.node &&
            modulation.sourcePort === a.port &&
            modulation.destinationNode === b.node &&
            modulation.destinationParam === b.param,
        );
      }
      if (a.io === "modulation" && b.io === "output") {
        return patch.modulations.some(
          (modulation) =>
            modulation.sourceNode === b.node &&
            modulation.sourcePort === b.port &&
            modulation.destinationNode === a.node &&
            modulation.destinationParam === a.param,
        );
      }
      if (a.io === "output" && b.io === "graph") {
        return (patch.graphConnections || []).some(
          (connection) =>
            connection.sourceNode === a.node &&
            connection.sourcePort === a.port &&
            connection.destinationNode === b.node &&
            connection.destinationGraphInput === (b.graphInput || b.port),
        );
      }
      if (a.io === "graph" && b.io === "output") {
        return (patch.graphConnections || []).some(
          (connection) =>
            connection.sourceNode === b.node &&
            connection.sourcePort === b.port &&
            connection.destinationNode === a.node &&
            connection.destinationGraphInput === (a.graphInput || a.port),
        );
      }
      return false;
    }

    function endpointsAreParameterAudioMismatch(a, b) {
      return Boolean(
        a &&
        b &&
        ((a.io === "modulation" && b.io === "input") ||
          (a.io === "input" && b.io === "modulation") ||
          (a.io === "graph" && b.io !== "output") ||
          (b.io === "graph" && a.io !== "output")),
      );
    }

    function endpointsShareNode(a, b) {
      return Boolean(a && b && a.node === b.node);
    }

    function endpointsShouldBurst(a, b) {
      if (endpointsShareNode(a, b)) {
        return false;
      }
      return Boolean(
        a &&
        b &&
        (((a.io === "output" && b.io === "output") ||
          (a.io === "input" && b.io === "input")) ||
          ((a.io === "output" && b.io === "graph") && nodeGraphPatchNodeType(a.node) !== "graph") ||
          ((b.io === "output" && a.io === "graph") && nodeGraphPatchNodeType(b.node) !== "graph") ||
          endpointsAreParameterAudioMismatch(a, b) ||
          endpointsAreDuplicate(a, b)),
      );
    }

    function endpointPoint(endpoint, fallbackElement = null) {
      if (!endpoint) {
        return null;
      }
      if (endpoint.io === "modulation") {
        return deps.modulationPortCenter(endpoint.node, endpoint.param || endpoint.port);
      }
      if (endpoint.io === "graph") {
        return deps.graphInputPortCenter(endpoint.node, endpoint.graphInput || endpoint.port);
      }
      if (endpoint.io === "input" || endpoint.io === "output") {
        return deps.portCenter(endpoint.node, endpoint.port, endpoint.io);
      }
      const visual = fallbackElement || null;
      if (visual) {
        return deps.elementCenter(visual);
      }
      return null;
    }

    return {
      connectEndpoints,
      createGradient,
      drawPath,
      endpointFromElement,
      endpointPoint,
      endpointsMatch,
      endpointsShouldBurst,
      patchPointTargetFromPoint,
      path,
      pointInEndpointHitbox,
      straightPath,
      tracePath,
    };
  }

  function createNodeGraphWireInteractionController(deps) {
    const { helpers, state } = deps;
    let hoveredPatchPoint = null;

    function setHoveredPatchPoint(target) {
      if (hoveredPatchPoint === target) {
        return;
      }
      hoveredPatchPoint?.classList.remove("patch-point-hover");
      hoveredPatchPoint = target || null;
      hoveredPatchPoint?.classList.add("patch-point-hover");
    }

    function clearHover() {
      setHoveredPatchPoint(null);
    }

    function animateDestroyedWire(from, to) {
      const svg = deps.svg();
      if (!svg || !from || !to) {
        return;
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "node-wire-path destroyed");
      path.setAttribute("d", helpers.straightPath(from, to));
      path.addEventListener("animationend", () => path.remove(), { once: true });
      svg.append(path);
    }

    function endpointKey(endpoint) {
      return `${endpoint.node}:${endpoint.port ?? endpoint.param ?? endpoint.graphInput}:${endpoint.io}`;
    }

    function portDirectionFromIo(io) {
      return io === "output" ? "output" : "input";
    }

    function isCompatibleTarget(mode, endpoint) {
      if (mode.direction === "output") {
        return endpoint.io === "input" || endpoint.io === "modulation" || endpoint.io === "graph";
      }
      return endpoint.io === "output";
    }

    function isSameDirection(mode, endpoint) {
      return portDirectionFromIo(endpoint.io) === mode.direction;
    }

    function clearPortConnectionMode() {
      const mode = state.portConnectionMode;
      if (!mode) {
        return;
      }
      for (const { element } of mode.selected.values()) {
        if (!element) { continue; }
        element.classList.remove("port-connection-selected");
        element.querySelector?.(".node-port")?.classList.remove("port-connection-selected");
      }
      state.portConnectionMode = null;
    }

    function cancelPortConnectionMode() {
      if (!state.portConnectionMode) {
        return false;
      }
      clearPortConnectionMode();
      deps.drawWires();
      return true;
    }

    function commitPortConnectionMode(targetEndpoint, targetElement) {
      const mode = state.portConnectionMode;
      if (!mode) {
        return;
      }
      for (const { endpoint, from } of mode.selected.values()) {
        const connected = helpers.connectEndpoints(endpoint, targetEndpoint);
        if (!connected && helpers.endpointsShouldBurst(endpoint, targetEndpoint)) {
          const to = helpers.endpointPoint(targetEndpoint, targetElement);
          animateDestroyedWire(from, to);
          deps.burstZap(from);
          deps.burstZap(to);
          deps.triggerWireBreak?.("port-click");
        }
      }
      clearPortConnectionMode();
      deps.drawWires();
    }

    function handlePortClickFromElement(portElement, clientX, clientY) {
      const hitboxElement = portElement.closest?.(".node-io-row") || portElement;
      const endpoint = helpers.endpointFromElement(hitboxElement);
      if (!endpoint) {
        return false;
      }
      if (!helpers.pointInEndpointHitbox(endpoint, clientX, clientY, hitboxElement)) {
        return false;
      }
      const visualElement = hitboxElement.classList.contains("node-io-row")
        ? (hitboxElement.querySelector(".node-port") || hitboxElement)
        : hitboxElement;
      const mode = state.portConnectionMode;
      if (!mode) {
        const from = helpers.endpointPoint(endpoint, hitboxElement);
        if (!from) {
          return false;
        }
        state.portConnectionMode = {
          direction: portDirectionFromIo(endpoint.io),
          selected: new Map([[endpointKey(endpoint), { endpoint, element: hitboxElement, from }]]),
          cursorPoint: deps.clientPoint({ clientX, clientY }),
        };
        hitboxElement.classList.add("port-connection-selected");
        visualElement.classList.add("port-connection-selected");
        deps.drawWires();
        return true;
      }
      if (isCompatibleTarget(mode, endpoint)) {
        commitPortConnectionMode(endpoint, hitboxElement);
        return true;
      }
      if (isSameDirection(mode, endpoint)) {
        const key = endpointKey(endpoint);
        if (mode.selected.has(key)) {
          // Re-clicking the single port that's the whole pending selection
          // is an attempted self-connection (port -> itself) -- invalid,
          // same as any other incompatible connect attempt, so it gets the
          // same burst treatment instead of a silent cancel. Skipped when
          // more than one port is selected: clicking an already-selected
          // entry there is legitimate multi-select pruning, not a
          // self-connection attempt.
          if (mode.selected.size === 1) {
            const { from } = mode.selected.get(key);
            deps.burstZap(from);
            deps.triggerWireBreak?.("port-click-self");
            if (endpoint.io === "input" && typeof triggerNodeGraphInputWireBreakPulse === "function") {
              triggerNodeGraphInputWireBreakPulse(endpoint.node, endpoint.port);
            }
            clearPortConnectionMode();
            deps.drawWires();
            return true;
          }
          mode.selected.delete(key);
          hitboxElement.classList.remove("port-connection-selected");
          visualElement.classList.remove("port-connection-selected");
          if (mode.selected.size === 0) {
            cancelPortConnectionMode();
          } else {
            deps.drawWires();
          }
        } else {
          const from = helpers.endpointPoint(endpoint, hitboxElement);
          if (from) {
            mode.selected.set(key, { endpoint, element: hitboxElement, from });
            hitboxElement.classList.add("port-connection-selected");
            visualElement.classList.add("port-connection-selected");
            deps.drawWires();
          }
        }
        return true;
      }
      return false;
    }

    function handlePortClick(event) {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      const port = event.currentTarget instanceof Element ? event.currentTarget : null;
      if (!port) {
        return;
      }
      if (handlePortClickFromElement(port, event.clientX, event.clientY)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function handleWorkspaceClick(event) {
      if (!state.portConnectionMode) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest?.(".node-port, .node-io-row, .node-param-port.modulation-input, .node-param-port.graph-input")) {
        return;
      }
      cancelPortConnectionMode();
    }

    function updateConnectionModeCursor(event) {
      let redraw = false;
      if (state.portConnectionMode) {
        state.portConnectionMode.cursorPoint = deps.clientPoint(event);
        redraw = true;
      }
      if (state.wireDragging) {
        state.wireDragging.cursorPoint = deps.clientPoint(event);
        redraw = true;
      }
      if (redraw) {
        deps.drawWires();
      }
    }

    function handlePortPointerDown(event) {
      if (event.button !== 0) {
        return;
      }
      const port = event.currentTarget instanceof Element ? event.currentTarget : null;
      if (!port) {
        return;
      }
      const hitboxElement = port.closest?.(".node-io-row") || port;
      const endpoint = helpers.endpointFromElement(hitboxElement);
      if (!endpoint) {
        return;
      }
      const from = helpers.endpointPoint(endpoint, hitboxElement);
      if (!from) {
        return;
      }
      state.wireDragging = {
        endpoint,
        element: hitboxElement,
        from,
        startClientX: event.clientX,
        startClientY: event.clientY,
        cursorPoint: deps.clientPoint(event),
        active: false,
        pointerId: event.pointerId ?? null,
      };
      event.stopPropagation();
    }

    function handleWireDragMove(event) {
      const drag = state.wireDragging;
      if (!drag) {
        return;
      }
      if (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (!drag.active && Math.hypot(dx, dy) < 4) {
        return;
      }
      drag.active = true;
      drag.cursorPoint = deps.clientPoint(event);
      deps.drawWires();
    }

    function handleWireDragEnd(event) {
      const drag = state.wireDragging;
      if (!drag) {
        return;
      }
      if (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId) {
        return;
      }
      state.wireDragging = null;
      if (!drag.active) {
        deps.drawWires();
        return;
      }
      const target = helpers.patchPointTargetFromPoint(event.clientX, event.clientY);
      const targetHitbox = target?.closest?.(".node-io-row") || target;
      const targetEndpoint = targetHitbox ? helpers.endpointFromElement(targetHitbox) : null;
      if (targetEndpoint) {
        const connected = helpers.connectEndpoints(drag.endpoint, targetEndpoint);
        if (!connected && helpers.endpointsShouldBurst(drag.endpoint, targetEndpoint)) {
          const to = helpers.endpointPoint(targetEndpoint, targetHitbox);
          animateDestroyedWire(drag.from, to);
          deps.burstZap(drag.from);
          deps.burstZap(to);
          deps.triggerWireBreak?.("wire-drag");
        }
      }
      deps.drawWires();
    }

    function handlePatchPointHover(event) {
      if (state.sliderDragging) {
        setHoveredPatchPoint(null);
        return;
      }
      const workspace = deps.workspace();
      const target = event.target instanceof Element ? event.target : null;
      if (!workspace?.contains(target)) {
        setHoveredPatchPoint(null);
        return;
      }
      const directTarget = target.closest?.(".node-port, .node-io-row, .node-param-port.modulation-input, .node-param-port.graph-input");
      if (directTarget) {
        setHoveredPatchPoint(directTarget);
        return;
      }
      setHoveredPatchPoint(
        helpers.patchPointTargetFromPoint(event.clientX, event.clientY),
      );
    }

    return {
      cancelPortConnectionMode,
      clearHover,
      handlePatchPointHover,
      handlePortClick,
      handlePortPointerDown,
      handleWireDragEnd,
      handleWireDragMove,
      handleWorkspaceClick,
      updateConnectionModeCursor,
    };
  }

  window.createNodeGraphWireHelpers = createNodeGraphWireHelpers;
  window.createNodeGraphWireInteractionController = createNodeGraphWireInteractionController;
}());
