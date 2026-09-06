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
      const curve = typeof nodeGraphWireCurve === "function"
        ? nodeGraphWireCurve()
        : 1;
      const span = Math.min(
        96,
        (Math.abs(b.x - a.x) * 0.48 + Math.abs(b.y - a.y) * 0.12) * curve,
      );
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
     * gradient stop at that end). The cable is the overlay stroke — not a
     * second under-module path plus a short jut.
     */
    function wireEndColor(endColor, paint) {
      const hex = String(endColor || "").trim();
      if (hex && !hex.startsWith("url(")) {
        return hex;
      }
      const fallback = String(paint || "").trim();
      if (fallback && !fallback.startsWith("url(")) {
        return fallback;
      }
      return "";
    }

    function drawEndpointCap(svg, attachPoint, role, paint, extraClass = "", options = {}) {
      // Always on the overlay above modules — fakes the plug where the
      // under-module cable disappears into the plate. Do not follow the cable
      // host (visualCableSvg); that hid the disc under the idle stroke.
      const target = endpointCapSvg() || visualCableSvg(svg) || svg;
      const point = wireEndpointCapCenter(attachPoint, role);
      if (!target || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return null;
      }
      const fill = wireEndColor(options.endColor, paint);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute(
        "class",
        ["node-wire-endpoint-cap", extraClass].filter(Boolean).join(" "),
      );
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", String(wireEndpointCapRadius()));
      circle.setAttribute("color-interpolation", "sRGB");
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
      gradient.setAttribute("color-interpolation", "sRGB");
      // Push the axis past each jack so a curved stroke still samples the
      // solid end color at the contact disc (userSpaceOnUse is a chord, not
      // the bezier).
      const dx = (Number(to.x) || 0) - (Number(from.x) || 0);
      const dy = (Number(to.y) || 0) - (Number(from.y) || 0);
      const len = Math.hypot(dx, dy) || 1;
      const pad = Math.max(wireEndpointCapRadius() * 3, Math.min(36, len * 0.12));
      const ux = dx / len;
      const uy = dy / len;
      gradient.setAttribute("x1", String(from.x - ux * pad));
      gradient.setAttribute("y1", String(from.y - uy * pad));
      gradient.setAttribute("x2", String(to.x + ux * pad));
      gradient.setAttribute("y2", String(to.y + uy * pad));
      gradient.setAttribute("spreadMethod", "pad");

      // Same color on both ends: skip the opacity dip entirely rather than
      // faking a transition that never actually changes color -- app-wide
      // policy, not specific to any one wire kind.
      const sameColor = Boolean(fromColor) && Boolean(toColor) && fromColor === toColor;
      const middleColor = !sameColor && fromColor && toColor ? mixWireColor(fromColor, toColor) : null;
      const opaque = typeof nodeGraphFullyOpaqueWires === "function"
        ? nodeGraphFullyOpaqueWires()
        : Boolean(typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.fullyOpaqueWires);
      // Opacity stays 1 until near the midpoint so the plug and the cable
      // leaving it are the same color. The phosphor dip is only the center.
      const stops = sameColor
        ? [
            ["0%", "1", fromColor],
            ["100%", "1", toColor],
          ]
        : opaque
          ? [
              ["0%", "1", fromColor],
              ["42%", "1", fromColor],
              ["58%", "1", toColor],
              ["100%", "1", toColor],
            ]
          : [
              ["0%", "1", fromColor],
              ["42%", "1", fromColor],
              ["48%", "0.36", fromColor],
              ["50%", "0.34", middleColor],
              ["52%", "0.36", toColor],
              ["58%", "1", toColor],
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

      // Paint server on both layers so the same url(#id) works above or below.
      const capSvg = endpointCapSvg();
      ensureSvgDefs(svg)?.append(gradient);
      if (capSvg && capSvg !== svg) {
        ensureSvgDefs(capSvg)?.append(gradient.cloneNode(true));
      }
      return `url(#${id})`;
    }

    /** True when cable strokes paint above module faces (Visibility toggle). */
    function wiresAboveModules() {
      return Boolean(
        typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.wiresAboveModules,
      );
    }

    /**
     * Visual curve + dots host.
     * Above modules → overlay. Below → #nodeWireSvg (dots go with the cable).
     * Hit targets always stay on the under-module wire SVG.
     */
    function visualCableSvg(wireSvg) {
      if (wiresAboveModules()) {
        return endpointCapSvg() || wireSvg;
      }
      return wireSvg;
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

      // Curve follows Visibility → Wires Above. Contact discs are always
      // drawn on #nodeWireEndpointSvg (drawEndpointCap), above the plate.
      const paintSvg = visualCableSvg(svg) || svg;
      const showLength = typeof nodeGraphMvp === "undefined"
        || nodeGraphMvp?.wireLengthsVisible !== false;
      const [fromColor, toColor] = wireColors || [null, null];
      const capClass = [
        String(pathClass).includes("inactive-wire") ? "inactive-wire" : "",
        kind === "modulation" || kind === "graph" ? "modulation" : "",
      ].filter(Boolean).join(" ");

      if (showLength) {
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
        renderedPath.setAttribute("color-interpolation", "sRGB");
        renderedPath.style.stroke = stroke;
        paintSvg.append(renderedPath);
      }

      drawEndpointCap(paintSvg, from, "from", fromColor, capClass, { endColor: fromColor });
      drawEndpointCap(paintSvg, to, "to", toColor, capClass, { endColor: toColor });
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

    function endpointJackElement(endpoint, hitboxElement = null) {
      const row = hitboxElement?.classList?.contains("node-io-row")
        ? hitboxElement
        : hitboxElement?.closest?.(".node-io-row") || null;
      return row?.querySelector?.(".node-port")
        || (hitboxElement?.classList?.contains("node-port") ? hitboxElement : null)
        || (hitboxElement?.classList?.contains("node-param-port") ? hitboxElement : null)
        || elementForEndpoint(endpoint);
    }

    function endpointIoRow(hitboxElement = null) {
      if (hitboxElement?.classList?.contains("node-io-row")) {
        return hitboxElement;
      }
      return hitboxElement?.closest?.(".node-io-row") || null;
    }

    function visibleIoLabel(row) {
      const label = row?.querySelector?.(":scope > .node-io-label");
      if (!label) {
        return null;
      }
      const style = getComputedStyle(label);
      if (style.display === "none" || style.visibility === "hidden") {
        return null;
      }
      return label;
    }

    function unionClientRect(a, b) {
      const left = Math.min(a.left, b.left);
      const top = Math.min(a.top, b.top);
      const right = Math.max(a.right, b.right);
      const bottom = Math.max(a.bottom, b.bottom);
      return {
        bottom,
        height: Math.max(0, bottom - top),
        left,
        right,
        top,
        width: Math.max(0, right - left),
      };
    }

    function endpointHitboxClientRect(endpoint, hitboxElement = null) {
      // One item: jack ∪ visible label. Empty row chrome is not a wire target.
      const jack = endpointJackElement(endpoint, hitboxElement);
      if (!jack) {
        return null;
      }
      if (
        typeof nodeGraphElementInSkippedContentVisibility === "function"
        && nodeGraphElementInSkippedContentVisibility(jack)
      ) {
        return null;
      }
      const jackRect = jack.getBoundingClientRect();
      if (jackRect.width <= 0 || jackRect.height <= 0) {
        return null;
      }
      const row = endpointIoRow(hitboxElement) || jack.closest?.(".node-io-row");
      const label = visibleIoLabel(row);
      if (!label) {
        return {
          bottom: jackRect.bottom,
          height: jackRect.height,
          left: jackRect.left,
          right: jackRect.right,
          top: jackRect.top,
          width: jackRect.width,
        };
      }
      const labelRect = label.getBoundingClientRect();
      if (labelRect.width <= 0 || labelRect.height <= 0) {
        return {
          bottom: jackRect.bottom,
          height: jackRect.height,
          left: jackRect.left,
          right: jackRect.right,
          top: jackRect.top,
          width: jackRect.width,
        };
      }
      return unionClientRect(jackRect, labelRect);
    }

    function pointInEndpointHitbox(endpoint, clientX, clientY, hitboxElement = null) {
      const rect = endpointHitboxClientRect(endpoint, hitboxElement);
      if (!rect) {
        return false;
      }
      return clientX >= rect.left && clientX <= rect.right
        && clientY >= rect.top && clientY <= rect.bottom;
    }

    function patchPointTargetFromPoint(clientX, clientY) {
      let best = null;
      let bestDistance = Infinity;
      const targets = document.querySelectorAll(
        ".node-io-row, .node-param-port.modulation-input, .node-param-port.graph-input, .node-port:not(.node-io-row .node-port)",
      );
      for (const target of targets) {
        if (
          typeof nodeGraphElementInSkippedContentVisibility === "function"
          && nodeGraphElementInSkippedContentVisibility(target)
        ) {
          continue;
        }
        const endpoint = endpointFromElement(target);
        const visualElement = visualEndpointElement(target);
        if (
          visualElement
          && typeof nodeGraphElementInSkippedContentVisibility === "function"
          && nodeGraphElementInSkippedContentVisibility(visualElement)
        ) {
          continue;
        }
        const elementRect = visualElement?.getBoundingClientRect();
        if (
          !endpoint
          || !elementRect
          || !pointInEndpointHitbox(endpoint, clientX, clientY, target)
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

    /** Data plane (Graph/Phases/…) ↔ realtime (signal / MOD) — wire break. */
    function endpointsAreDimensionMismatch(a, b) {
      if (typeof nodeGraphWireEndpointsDimensionMismatch === "function") {
        return nodeGraphWireEndpointsDimensionMismatch(a, b);
      }
      return false;
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
          // Graph-face In is only valid on smoothGraph / stepGraph (layout "graph").
          ((a.io === "output" && b.io === "graph") &&
            !(typeof nodeGraphModuleIsGraphType === "function" &&
              nodeGraphModuleIsGraphType(nodeGraphPatchNodeType(b.node)))) ||
          ((b.io === "output" && a.io === "graph") &&
            !(typeof nodeGraphModuleIsGraphType === "function" &&
              nodeGraphModuleIsGraphType(nodeGraphPatchNodeType(a.node)))) ||
          endpointsAreParameterAudioMismatch(a, b) ||
          endpointsAreDimensionMismatch(a, b) ||
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
      visualCableSvg,
      wireEndpointCapCenter,
      wireEndpointCapRadius,
      straightPath,
      tracePath,
    };
  }

  function createNodeGraphWireInteractionController(deps) {
    const { helpers, state } = deps;
    let hoveredPatchPoint = null;

    function setHoveredPatchPoint(target) {
      const item = !target
        ? null
        : (target.classList?.contains("node-io-row")
          ? target
          : (target.closest?.(".node-io-row") || target));
      if (hoveredPatchPoint === item) {
        return;
      }
      hoveredPatchPoint?.classList.remove("patch-point-hover");
      hoveredPatchPoint = item || null;
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
      state.portMovePointer = null;
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
      // Moving existing wires: remove originals first (one commit), then reattach.
      if (mode.movingWires) {
        const removes = [];
        for (const entry of mode.selected.values()) {
          if (entry.remove && Number.isInteger(entry.remove.index)) {
            removes.push({ kind: entry.remove.kind || "signal", index: entry.remove.index });
          }
          if (Array.isArray(entry.extraRemoves)) {
            for (const extra of entry.extraRemoves) {
              if (extra && Number.isInteger(extra.index)) {
                removes.push({ kind: extra.kind || "signal", index: extra.index });
              }
            }
          }
        }
        if (removes.length) {
          if (typeof disconnectNodeGraphConnections === "function") {
            disconnectNodeGraphConnections(removes, {
              status: removes.length === 1 ? "wire moved" : `${removes.length} wires moved`,
            });
          } else {
            const byKind = new Map();
            for (const entry of removes) {
              const list = byKind.get(entry.kind) || [];
              list.push(entry.index);
              byKind.set(entry.kind, list);
            }
            for (const [kind, indices] of byKind) {
              indices.sort((a, b) => b - a);
              for (const index of indices) {
                disconnectNodeGraphConnection(index, kind);
              }
            }
          }
        }
      }
      for (const { endpoint, from, connectOptions } of mode.selected.values()) {
        const options = connectOptions || {};
        const connected = helpers.connectEndpoints(endpoint, targetEndpoint, options);
        if (!connected && helpers.endpointsShouldBurst(endpoint, targetEndpoint)) {
          const to = helpers.endpointPoint(targetEndpoint, targetElement);
          animateDestroyedWire(from, to);
          deps.burstZap(from);
          deps.burstZap(to);
          deps.triggerWireBreak?.("port-click");
        }
      }
      // Keep a one-shot suppressClick arm if the caller set one (drag-drop),
      // so the trailing click does not start a new wire.
      const suppressClick = Boolean(state.portMovePointer?.suppressClick);
      clearPortConnectionMode();
      if (suppressClick) {
        state.portMovePointer = { suppressClick: true, active: false, pointerId: null };
      }
      deps.drawWires();
    }

    function portsMatch(a, b) {
      return String(a || "").trim() === String(b || "").trim();
    }

    function wireListForKind(kind) {
      if (kind === "modulation") {
        return Array.isArray(state.modulations)
          ? state.modulations
          : (state.patch?.modulations || []);
      }
      if (kind === "graph") {
        return Array.isArray(state.graphConnections)
          ? state.graphConnections
          : (state.patch?.graphConnections || []);
      }
      return Array.isArray(state.connections)
        ? state.connections
        : (state.patch?.connections || []);
    }

    function wireTouchesEndpoint(kind, wire, endpoint) {
      if (!wire || !endpoint) {
        return null;
      }
      const node = String(endpoint.node || "");
      if (endpoint.io === "input" && kind === "signal") {
        if (
          String(wire.destinationNode || "") === node &&
          portsMatch(wire.destinationPort, endpoint.port)
        ) {
          return {
            freeRole: "destination",
            fixedEndpoint: {
              io: "output",
              node: wire.sourceNode,
              port: wire.sourcePort,
            },
          };
        }
      }
      if (endpoint.io === "modulation" && kind === "modulation") {
        const param = endpoint.param || endpoint.port;
        if (
          String(wire.destinationNode || "") === node &&
          portsMatch(wire.destinationParam, param)
        ) {
          return {
            freeRole: "destination",
            fixedEndpoint: {
              io: "output",
              node: wire.sourceNode,
              port: wire.sourcePort,
            },
          };
        }
      }
      if (endpoint.io === "graph" && kind === "graph") {
        const graphInput = endpoint.graphInput || endpoint.port;
        if (
          String(wire.destinationNode || "") === node &&
          portsMatch(wire.destinationGraphInput, graphInput)
        ) {
          return {
            freeRole: "destination",
            fixedEndpoint: {
              io: "output",
              node: wire.sourceNode,
              port: wire.sourcePort,
            },
          };
        }
      }
      if (endpoint.io === "output") {
        if (
          String(wire.sourceNode || "") === node &&
          portsMatch(wire.sourcePort, endpoint.port)
        ) {
          // Grabbing the source end: free end is the output; fixed is destination.
          if (kind === "signal") {
            return {
              freeRole: "source",
              fixedEndpoint: {
                io: "input",
                node: wire.destinationNode,
                port: wire.destinationPort,
              },
            };
          }
          if (kind === "modulation") {
            return {
              freeRole: "source",
              fixedEndpoint: {
                io: "modulation",
                node: wire.destinationNode,
                param: wire.destinationParam,
                port: wire.destinationParam,
              },
            };
          }
          if (kind === "graph") {
            return {
              freeRole: "source",
              fixedEndpoint: {
                io: "graph",
                node: wire.destinationNode,
                graphInput: wire.destinationGraphInput,
                port: wire.destinationGraphInput,
              },
            };
          }
        }
      }
      return null;
    }

    /**
     * Selected wires that touch this jack (only those — not every cable on the port).
     */
    function selectedWiresAtEndpoint(endpoint) {
      if (!endpoint) {
        return [];
      }
      const entries = typeof nodeGraphSelectedWireEntries === "function"
        ? nodeGraphSelectedWireEntries(state.selected)
        : [];
      if (!entries.length) {
        return [];
      }
      const results = [];
      for (const entry of entries) {
        const kind = entry.kind || "signal";
        const list = wireListForKind(kind);
        const wire = list[entry.index];
        if (!wire) {
          continue;
        }
        const touch = wireTouchesEndpoint(kind, wire, endpoint);
        if (!touch) {
          continue;
        }
        results.push({
          kind,
          index: entry.index,
          wire,
          freeRole: touch.freeRole,
          fixedEndpoint: touch.fixedEndpoint,
        });
      }
      return results;
    }

    function elementForEndpoint(endpoint) {
      if (!endpoint) {
        return null;
      }
      if (endpoint.io === "input" || endpoint.io === "output") {
        if (typeof nodeGraphPortElementForWireEndpoint === "function") {
          const portEl = nodeGraphPortElementForWireEndpoint(endpoint.node, endpoint.port, endpoint.io);
          return portEl?.closest?.(".node-io-row") || portEl || null;
        }
        return null;
      }
      if (endpoint.io === "modulation" && typeof nodeGraphModulationPortSelector === "function") {
        return document.querySelector(nodeGraphModulationPortSelector(endpoint.node, endpoint.param || endpoint.port));
      }
      if (endpoint.io === "graph" && typeof nodeGraphGraphInputPortSelector === "function") {
        return document.querySelector(
          nodeGraphGraphInputPortSelector(endpoint.node, endpoint.graphInput || endpoint.port),
        );
      }
      return null;
    }

    function connectOptionsFromWire(wire) {
      if (!wire) {
        return { autoPair: false };
      }
      const options = { autoPair: false };
      if (wire.wireType) {
        options.wireType = wire.wireType;
      }
      if (wire.pixelWire) {
        options.pixelWire = true;
      }
      if (Array.isArray(wire.tracePoints) && wire.tracePoints.length) {
        options.tracePoints = wire.tracePoints.slice();
      }
      return options;
    }

    function markEndpointSelected(element) {
      if (!element) {
        return;
      }
      element.classList.add("port-connection-selected");
      element.querySelector?.(".node-port")?.classList.add("port-connection-selected");
      if (element.classList.contains("node-port")) {
        element.classList.add("port-connection-selected");
      }
    }

    function fixedEndpointPoint(fixedEndpoint, clientX, clientY) {
      const element = elementForEndpoint(fixedEndpoint);
      let from = helpers.endpointPoint(fixedEndpoint, element);
      if (!from && typeof nodeGraphPortCenter === "function" && (fixedEndpoint.io === "input" || fixedEndpoint.io === "output")) {
        from = nodeGraphPortCenter(fixedEndpoint.node, fixedEndpoint.port, fixedEndpoint.io);
      }
      if (!from && fixedEndpoint.io === "modulation" && typeof nodeGraphModulationPortCenter === "function") {
        from = nodeGraphModulationPortCenter(fixedEndpoint.node, fixedEndpoint.param || fixedEndpoint.port);
      }
      if (!from && fixedEndpoint.io === "graph" && typeof nodeGraphGraphInputPortCenter === "function") {
        from = nodeGraphGraphInputPortCenter(fixedEndpoint.node, fixedEndpoint.graphInput || fixedEndpoint.port);
      }
      if (!from) {
        from = deps.clientPoint({ clientX, clientY });
      }
      return { from, element };
    }

    /**
     * Soft-lift only selected wires that attach to this jack.
     * Cable paths hide while moving; endpoint dots stay (drawn as caps).
     */
    function startMoveSelectedWiresAtPort(endpoint, clientX, clientY) {
      const movable = selectedWiresAtEndpoint(endpoint);
      if (!movable.length) {
        return false;
      }

      state.wireDragging = null;

      // Grabbing destination end → free end seeks a new input (fixed = sources).
      // Grabbing source end → free end seeks a new output (fixed = destinations).
      const freeIsDestination = movable[0].freeRole === "destination";
      const direction = freeIsDestination ? "output" : "input";

      const selected = new Map();
      const hideWireKeys = [];
      const fixedCapEndpoints = [];

      for (const entry of movable) {
        // Only move wires grabbed from the same end type as the first match.
        if ((entry.freeRole === "destination") !== freeIsDestination) {
          continue;
        }
        hideWireKeys.push(`${entry.kind}:${entry.index}`);
        const fixed = entry.fixedEndpoint;
        const fixedKey = endpointKey(fixed);
        const { from, element } = fixedEndpointPoint(fixed, clientX, clientY);
        fixedCapEndpoints.push({
          endpoint: fixed,
          point: from,
          kind: entry.kind,
        });
        if (selected.has(fixedKey)) {
          const existing = selected.get(fixedKey);
          if (!existing.extraRemoves) {
            existing.extraRemoves = [];
          }
          existing.extraRemoves.push({ kind: entry.kind, index: entry.index });
          continue;
        }
        selected.set(fixedKey, {
          endpoint: fixed,
          element,
          from,
          connectOptions: connectOptionsFromWire(entry.wire),
          remove: { kind: entry.kind, index: entry.index },
        });
        markEndpointSelected(element);
      }

      if (selected.size === 0) {
        return false;
      }

      // Endpoint dots while moving use the color of the jack the user grabbed.
      let interactColor = null;
      if (typeof nodeGraphPortWireColor === "function") {
        const portName = endpoint.port || endpoint.param || endpoint.graphInput || "";
        interactColor = nodeGraphPortWireColor(endpoint.node, portName, endpoint.io) || null;
      }

      state.portConnectionMode = {
        direction,
        selected,
        cursorPoint: deps.clientPoint({ clientX, clientY }),
        movingWires: true,
        hideWireKeys,
        // Caps for fixed ends (and original grab port) while cable paths are hidden.
        fixedCapEndpoints,
        interactColor,
        originEndpoint: {
          io: endpoint.io,
          node: endpoint.node,
          port: endpoint.port,
          param: endpoint.param,
          graphInput: endpoint.graphInput,
        },
      };
      deps.drawWires();
      return true;
    }

    /** Self-plug attempt on an input: fire a unit impulse + spark. */
    function pokeInputPortImpulse(endpoint, hitboxElement) {
      if (!endpoint || endpoint.io !== "input") {
        return false;
      }
      const from = helpers.endpointPoint(endpoint, hitboxElement);
      if (from) {
        deps.burstZap(from);
        // Tiny self-wire flash so the poke reads like a break spark.
        const to = { x: from.x + 10, y: from.y - 8 };
        animateDestroyedWire(from, to);
      }
      deps.triggerWireBreak?.("port-impulse");
      if (typeof triggerNodeGraphInputWireBreakPulse === "function") {
        triggerNodeGraphInputWireBreakPulse(endpoint.node, endpoint.port);
      }
      return true;
    }

    function handlePortClickFromElement(portElement, clientX, clientY, _clickDetail = 1) {
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

      // Swallow the synthetic click after a selected-wire drag (drop or cancel)
      // so we don't also start a brand-new wire on the same gesture.
      if (state.portMovePointer?.suppressClick) {
        state.portMovePointer = null;
        return true;
      }

      if (!mode) {
        // Normal click-to-start (or multi-select) a new wire from this jack.
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
            // Re-click same jack = attempted self-plug → poke input (or zap out).
            if (endpoint.io === "input") {
              pokeInputPortImpulse(endpoint, hitboxElement);
            } else {
              const { from } = mode.selected.get(key);
              deps.burstZap(from);
              deps.triggerWireBreak?.("port-click-self");
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
      if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
        return;
      }
      const port = event.currentTarget instanceof Element ? event.currentTarget : null;
      if (!port) {
        return;
      }
      const detail = Number(event.detail) || 1;
      if (handlePortClickFromElement(port, event.clientX, event.clientY, detail)) {
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
      if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
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

      // Arm selected-wire move: only selected wires that touch THIS port.
      // Actual lift happens after drag threshold so plain click still starts
      // a normal new wire.
      const movable = selectedWiresAtEndpoint(endpoint);
      if (movable.length > 0 && !state.portConnectionMode) {
        state.portMovePointer = {
          pointerId: event.pointerId ?? null,
          startClientX: event.clientX,
          startClientY: event.clientY,
          endpoint,
          active: false,
          suppressClick: false,
        };
        event.stopPropagation();
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
      const movePtr = state.portMovePointer;
      if (movePtr) {
        if (
          movePtr.pointerId !== null &&
          event.pointerId !== undefined &&
          movePtr.pointerId !== event.pointerId
        ) {
          // not our pointer
        } else {
          const dx = event.clientX - movePtr.startClientX;
          const dy = event.clientY - movePtr.startClientY;
          if (!movePtr.active && Math.hypot(dx, dy) >= 4) {
            // Crossed drag threshold → soft-lift selected wires at this port.
            if (
              startMoveSelectedWiresAtPort(
                movePtr.endpoint,
                event.clientX,
                event.clientY,
              )
            ) {
              movePtr.active = true;
              movePtr.suppressClick = true;
            } else {
              // Selection no longer valid; fall back to normal new-wire drag.
              state.portMovePointer = null;
            }
          }
          if (movePtr?.active && state.portConnectionMode?.movingWires) {
            state.portConnectionMode.cursorPoint = deps.clientPoint(event);
            deps.drawWires();
            return;
          }
          if (movePtr && !movePtr.active) {
            // Still arming — don't start a parallel single-wire drag.
            return;
          }
        }
      }
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
      const movePtr = state.portMovePointer;
      if (movePtr) {
        if (
          movePtr.pointerId !== null &&
          event.pointerId !== undefined &&
          movePtr.pointerId !== event.pointerId
        ) {
          // not our pointer
        } else if (movePtr.active && state.portConnectionMode?.movingWires) {
          const target = helpers.patchPointTargetFromPoint(event.clientX, event.clientY);
          const targetHitbox = target?.closest?.(".node-io-row") || target;
          const targetEndpoint = targetHitbox ? helpers.endpointFromElement(targetHitbox) : null;
          // Swallow the trailing click after a real drag-move (drop or cancel).
          state.portMovePointer = {
            pointerId: movePtr.pointerId,
            suppressClick: true,
            active: false,
          };
          if (
            targetEndpoint &&
            isCompatibleTarget(state.portConnectionMode, targetEndpoint)
          ) {
            commitPortConnectionMode(targetEndpoint, targetHitbox);
            return;
          }
          // Dropped on empty / invalid: cancel move (wires snap back).
          // Keep suppressClick arm so click does not start a new wire.
          const suppress = state.portMovePointer;
          cancelPortConnectionMode();
          state.portMovePointer = suppress;
          return;
        } else if (!movePtr.active) {
          // Never dragged — clear arm so click can start a normal new wire.
          state.portMovePointer = null;
        }
      }
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
      const directTarget = target.closest?.(
        ".node-io-row, .node-param-port.modulation-input, .node-param-port.graph-input, .node-port:not(.node-io-row .node-port)",
      );
      if (directTarget) {
        const endpoint = helpers.endpointFromElement(directTarget);
        const hitbox = directTarget;
        if (
          endpoint &&
          helpers.pointInEndpointHitbox(endpoint, event.clientX, event.clientY, hitbox)
        ) {
          setHoveredPatchPoint(directTarget);
          return;
        }
        // Over empty row chrome, not jack∪label — leave it for module drag.
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
      // Intentionally no dblclick poke — impulse is self-plug only (re-click).
      handlePortDblClick: () => {},
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
