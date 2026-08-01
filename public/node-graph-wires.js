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

    /** Resolve a CSS length token on the zoom surface (handles calc()). */
    function resolveCssLengthPx(cssVarName, fallbackPx) {
      const workspace = document.getElementById("nodeGraphWorkspace");
      const surface = typeof deps.zoomSurface === "function" ? deps.zoomSurface() : null;
      const host = surface || workspace;
      if (host && typeof document !== "undefined") {
        const probe = document.createElement("div");
        probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;"
          + `width:var(${cssVarName});height:0;`;
        host.append(probe);
        const size = probe.offsetWidth;
        probe.remove();
        if (Number.isFinite(size) && size > 0) {
          return size;
        }
      }
      return fallbackPx;
    }

    /** Radius of the contact plug in zoom-surface units (matches CSS token). */
    function wireEndpointCapRadius() {
      const size = resolveCssLengthPx("--node-wire-patch-point-size", 6);
      return Math.max(1.5, size * 0.5);
    }

    /**
     * Attach center = middle of the inlet/outlet flat edge (patch-point).
     * Wire path and contact both use this point. Caps paint on a layer
     * *above* modules so the plug is visible mid-jack (cable SVG stays under).
     */
    function wireEndpointCapCenter(attachPoint, _role) {
      if (!attachPoint || !Number.isFinite(attachPoint.x) || !Number.isFinite(attachPoint.y)) {
        return attachPoint;
      }
      return { x: attachPoint.x, y: attachPoint.y };
    }

    function endpointCapSvg() {
      return document.getElementById("nodeWireEndpointSvg")
        || document.getElementById("nodeWireSvg");
    }

    /** Wire path ends at the contact centers (mid inlet / mid outlet). */
    function path(from, to) {
      const a = wireEndpointCapCenter(from, "from");
      const b = wireEndpointCapCenter(to, "to");
      const horizontalDistance = Math.abs(b.x - a.x);
      const verticalDistance = Math.abs(b.y - a.y);
      const span = Math.min(96, horizontalDistance * 0.48 + verticalDistance * 0.12);
      return `M ${a.x} ${a.y} C ${a.x + span} ${a.y}, ${b.x - span} ${b.y}, ${b.x} ${b.y}`;
    }

    function straightPath(from, to) {
      const a = wireEndpointCapCenter(from, "from");
      const b = wireEndpointCapCenter(to, "to");
      return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    }

    /**
     * Solid full-circle contact on the overlay above modules, centered on the
     * mid-jack attach point. Fill is the endpoint port color (same as the
     * gradient stop at that end) — no glow, no stub line.
     */
    function drawEndpointCap(_svg, attachPoint, role, paint, extraClass = "", options = {}) {
      const target = endpointCapSvg();
      const point = wireEndpointCapCenter(attachPoint, role);
      if (!target || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return null;
      }
      const endColor = options.endColor || null;
      // Prefer solid end color so the disc matches the gradient stop at 0%/100%.
      // Fall back to stroke paint only if color is missing.
      const fill = endColor || paint || null;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute(
        "class",
        ["node-wire-endpoint-cap", extraClass].filter(Boolean).join(" "),
      );
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", String(wireEndpointCapRadius()));
      if (fill) {
        circle.setAttribute("fill", fill);
        circle.style.fill = fill;
      }
      circle.setAttribute("pointer-events", "none");
      target.append(circle);
      return circle;
    }

    // Currently unreachable from any live call site (nodeGraphManualTracePathOptions
    // always supplies explicit pathData for trace-type wires, so the
    // `explicitPathData || tracePath(...)` fallback below never fires) --
    // fixed for consistency with nodeGraphTracePoint (node-graph-trace-router.js)
    // rather than left as a landmine with the same zoom/rounding-order bug
    // if something ever starts relying on the fallback again.
    function traceCoordinate(value) {
      const number = Number(value) || 0;
      const zoom = typeof nodeGraphZoom === "function" ? nodeGraphZoom() : 1;
      const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
      return (Math.round(number * safeZoom) + 0.5) / safeZoom;
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

    function ensureSvgDefs(svg) {
      if (!svg) {
        return null;
      }
      let defs = svg.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svg.prepend(defs);
      }
      return defs;
    }

    function createGradient(svg, id, from, to, stopClass = "node-wire-gradient-stop", colors = null) {
      const [fromColor, toColor] = colors || [null, null];
      const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      gradient.id = id;
      gradient.setAttribute("gradientUnits", "userSpaceOnUse");
      gradient.setAttribute("x1", String(from.x));
      gradient.setAttribute("y1", String(from.y));
      gradient.setAttribute("x2", String(to.x));
      gradient.setAttribute("y2", String(to.y));

      // Same color on both ends: skip the opacity dip entirely rather than
      // faking a transition that never actually changes color -- app-wide
      // policy, not specific to any one wire kind.
      const sameColor = Boolean(fromColor) && Boolean(toColor) && fromColor === toColor;
      const middleColor = !sameColor && fromColor && toColor ? mixWireColor(fromColor, toColor) : null;
      // End plateaus: solid port color near each jack (matches contact discs);
      // phosphor dip + crossfade only in the middle of the cable.
      const endPlateau = 0.14;
      const p0 = "0%";
      const pFrom = `${Math.round(endPlateau * 100)}%`;
      const pTo = `${Math.round((1 - endPlateau) * 100)}%`;
      const p1 = "100%";
      const stops = sameColor
        ? [
            [p0, "1", fromColor],
            [p1, "1", toColor],
          ]
        : [
            [p0, "1", fromColor],
            [pFrom, "1", fromColor],
            ["48%", "0.36", fromColor],
            ["50%", "0.34", middleColor],
            ["52%", "0.36", toColor],
            [pTo, "1", toColor],
            [p1, "1", toColor],
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

      // Visual stroke lives on the endpoint SVG — define the paint server there
      // (clone onto the wire SVG too if different, for any under-layer use).
      const capSvg = endpointCapSvg();
      const primary = capSvg || svg;
      ensureSvgDefs(primary)?.append(gradient);
      if (svg && svg !== primary) {
        ensureSvgDefs(svg)?.append(gradient.cloneNode(true));
      }
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
        skipHitPath = false,
        to,
        wireColors = null,
        wireType = "cable",
        pixelWire = false,
      } = options;
      const normalizedWireType = normalizeNodeGraphWireType(wireType);
      const isTrace = normalizedWireType === nodeGraphWireTypes.trace;
      const isPixel = pixelWire === true
        || (typeof normalizeNodeGraphWirePixel === "function" && normalizeNodeGraphWirePixel(pixelWire));
      const pathData = explicitPathData || (isTrace ? tracePath(from, to) : path(from, to));
      const stroke = createGradient(svg, gradientId, from, to, gradientClass, wireColors);
      // Hit paths stay on the under-module wire SVG (interaction only).
      if (!skipHitPath) {
        const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hitPath.setAttribute("class", "node-wire-hit-path");
        hitPath.dataset.alias = alias;
        hitPath.dataset.connectionIndex = String(index);
        hitPath.dataset.connectionKind = kind;
        hitPath.dataset.interactionMode = mode;
        if (isPixel) {
          hitPath.dataset.pixelWire = "true";
        }
        if (Array.isArray(options.tracePoints)) {
          hitPath.dataset.tracePoints = nodeGraphTraceWaypointAttribute(options.tracePoints);
        }
        hitPath.setAttribute("d", pathData);
        hitPath.addEventListener("click", (event) => deps.selectWire(event, index, kind));
        svg.append(hitPath);
      }

      // Visual cable + discs share the endpoint SVG above modules.
      // Paint order: discs first, then stroke on top. If the disc is drawn
      // *over* the stroke, the circle's antialiased edge composites over the
      // cable and samples show a third color only at the join — even when
      // fill and stroke are the same RGB (art-program pixel check).
      const capSvg = endpointCapSvg() || svg;
      const [fromColor, toColor] = wireColors || [null, null];
      const capClass = [
        String(pathClass).includes("inactive-wire") ? "inactive-wire" : "",
        kind === "modulation" || kind === "graph" ? "modulation" : "",
      ].filter(Boolean).join(" ");
      // Disc fill = port color at that end (matches gradient end plateaus).
      // Stroke is painted after discs so the join has no AA fringe.
      drawEndpointCap(svg, from, "from", stroke, capClass, {
        endColor: fromColor,
        gradientId,
      });
      drawEndpointCap(svg, to, "to", stroke, capClass, {
        endColor: toColor,
        gradientId,
      });

      const renderedPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      renderedPath.setAttribute(
        "class",
        `${pathClass}${isTrace ? " trace-wire" : ""}${isPixel ? " pixel-wire" : ""}`,
      );
      renderedPath.dataset.alias = alias;
      renderedPath.dataset.connectionIndex = String(index);
      renderedPath.dataset.connectionKind = kind;
      renderedPath.dataset.interactionMode = mode;
      if (isPixel) {
        renderedPath.dataset.pixelWire = "true";
      }
      if (Array.isArray(options.tracePoints)) {
        renderedPath.dataset.tracePoints = nodeGraphTraceWaypointAttribute(options.tracePoints);
      }
      renderedPath.setAttribute("d", pathData);
      renderedPath.setAttribute("stroke", stroke);
      renderedPath.style.stroke = stroke;
      capSvg.append(renderedPath);
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
      // Geometry is always centered on the jack.
      // - Solid shells: jack-local pad only (row is a full 1gu band; expanding
      //   to the whole row stole module drag and felt like shifting hitboxes).
      // - Headered stacked IO: if the row is already a tight band, use it;
      //   tall stretched rows keep only the local jack neighborhood.
      const row = hitboxElement?.classList?.contains("node-io-row")
        ? hitboxElement
        : hitboxElement?.closest?.(".node-io-row") || null;
      const solidShell = Boolean(row?.closest?.(".node-solid-module-shell"));
      const jack = row?.querySelector?.(".node-port")
        || (hitboxElement?.classList?.contains("node-port") ? hitboxElement : null)
        || elementForEndpoint(endpoint);
      if (!jack && !row) {
        return null;
      }
      const visual = jack || row;
      const jackRect = (jack || row).getBoundingClientRect();
      if (jackRect.width <= 0 || jackRect.height <= 0) {
        return null;
      }
      const style = getComputedStyle(visual);
      const portDiameter =
        Number.parseFloat(style.getPropertyValue("--node-port-diameter")) ||
        Math.max(jackRect.width, jackRect.height);
      const portArea =
        Number.parseFloat(style.getPropertyValue("--node-port-area-size")) ||
        portDiameter / 0.57;
      // Local surrounding pad around the jack.
      const padX = Math.max(portDiameter * 0.65, 8);
      const padY = Math.max(portArea * 0.42, portDiameter * 0.55, 8);
      const center = typeof nodeGraphElementPatchPointClientCenter === "function"
        ? nodeGraphElementPatchPointClientCenter(jack || row, endpoint?.io)
        : {
          x: endpoint?.io === "output"
            ? jackRect.right
            : (endpoint?.io === "input" ? jackRect.left : jackRect.left + jackRect.width * 0.5),
          y: jackRect.top + jackRect.height * 0.5,
        };

      let left = center.x - padX;
      let right = center.x + padX;
      let top = center.y - padY;
      let bottom = center.y + padY;

      // Always cover the jack box itself.
      left = Math.min(left, jackRect.left);
      right = Math.max(right, jackRect.right);
      top = Math.min(top, jackRect.top);
      bottom = Math.max(bottom, jackRect.bottom);

      if (solidShell) {
        // Reach a short way toward the label so the name is still wirable,
        // but leave most of the row free for module select/drag.
        const labelReach = Math.max(portArea * 0.9, 18);
        if (endpoint?.io === "input") {
          right = Math.max(right, center.x + labelReach);
        } else if (endpoint?.io === "output") {
          left = Math.min(left, center.x - labelReach);
        }
        // Vertical: stay inside the 1gu port band so space-evenly gaps stay drag.
        if (row) {
          const rowRect = row.getBoundingClientRect();
          top = Math.max(top, rowRect.top);
          bottom = Math.min(bottom, rowRect.bottom);
        }
      } else if (row) {
        const rowRect = row.getBoundingClientRect();
        const maxBand = portArea * 1.35;
        if (rowRect.height > 0 && rowRect.height <= maxBand) {
          left = Math.min(left, rowRect.left);
          right = Math.max(right, rowRect.right);
          top = Math.min(top, rowRect.top);
          bottom = Math.max(bottom, rowRect.bottom);
        }
      }

      return {
        bottom,
        height: Math.max(0, bottom - top),
        left,
        right,
        top,
        width: Math.max(0, right - left),
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
      drawEndpointCap,
      drawPath,
      endpointFromElement,
      endpointPoint,
      endpointsMatch,
      endpointsShouldBurst,
      patchPointTargetFromPoint,
      path,
      pointInEndpointHitbox,
      wireEndpointCapCenter,
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
      // Only start a wire when the pointer is actually near the jack —
      // otherwise solid-module edge rows must not steal module select/drag.
      if (!helpers.pointInEndpointHitbox(endpoint, event.clientX, event.clientY, hitboxElement)) {
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
        const endpoint = helpers.endpointFromElement(
          directTarget.classList?.contains("node-io-row")
            ? directTarget
            : (directTarget.closest?.(".node-io-row") || directTarget),
        );
        const hitbox = directTarget.closest?.(".node-io-row") || directTarget;
        if (
          endpoint &&
          helpers.pointInEndpointHitbox(endpoint, event.clientX, event.clientY, hitbox)
        ) {
          setHoveredPatchPoint(directTarget);
          return;
        }
        // Over a stretched/empty part of an io-row but outside the jack —
        // do not highlight.
        setHoveredPatchPoint(null);
        return;
      }
      setHoveredPatchPoint(
        helpers.patchPointTargetFromPoint(event.clientX, event.clientY),
      );
    }

    return {
      cancelPortConnectionMode,
      clearHover,
      // Exposed for solid-module empty-edge drag vs jack hitbox checks.
      helpers,
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
