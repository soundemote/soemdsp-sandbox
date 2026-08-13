(function () {
  const assignmentTokenPattern =
    /[A-Za-z_][\w-]*(?:\.[A-Za-z0-9_.-]+)+|\[[^\]]*\]|-?(?:\d+\.\d+|\d+|\.\d+)(?:e[+-]?\d+)?|\b(?:true|false)\b|=|[A-Za-z_][\w-]*/gi;

  function escapeHtml(value = "") {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function assignmentInfo(line = "", options = {}) {
    const keyFromPath = typeof options.keyFromPath === "function"
      ? options.keyFromPath
      : (path) => String(path || "").split(".").pop();
    const code = String(line || "").replace(/\/\/.*$/, "");
    const assignment = code.match(/^(.+?)\s*=\s*(.*?)\s*;?\s*$/);
    if (!assignment) {
      return null;
    }
    const equalsIndex = code.indexOf("=");
    const rawPath = assignment[1] || "";
    const rawValue = assignment[2] || "";
    const valueOffset = code.slice(equalsIndex + 1).search(/\S/);
    const valueStart = valueOffset >= 0 ? equalsIndex + 1 + valueOffset : equalsIndex + 1;
    const semicolonIndex = code.lastIndexOf(";");
    const valueEnd = semicolonIndex >= valueStart
      ? semicolonIndex
      : valueStart + rawValue.length;
    return {
      key: keyFromPath(rawPath),
      pathEnd: rawPath.length,
      rawPath: rawPath.trim(),
      rawValue: rawValue.trim(),
      valueEnd,
      valueStart,
    };
  }

  function referenceOptionHtml(option, context = {}, options = {}) {
    const value = String(option?.value ?? "");
    const label = String(option?.label ?? value);
    const className = options.optionClass || "metadata-script-reference-kind";
    const ariaLabel = options.ariaLabel ||
      `Use ${context.label || context.key || "value"} ${label}`;
    return `<code class="${escapeHtml(className)}" data-token-option="${escapeHtml(value)}" role="button" tabindex="0" aria-label="${escapeHtml(ariaLabel)}" title="Use ${escapeHtml(value)}">${escapeHtml(label)}</code>`;
  }

  function referenceContextHtml(context = null, options = {}) {
    if (!context?.config?.options?.length) {
      return "";
    }
    const label = context.config.label || context.key || "value";
    const optionHtml = context.config.options
      .map((option) => referenceOptionHtml(option, { ...context, label }, options))
      .join("");
    return `
      <span>${escapeHtml(label)}</span>
      ${optionHtml}`;
  }

  function referenceHtml(options = {}) {
    const contextualHtml = referenceContextHtml(options.context, options);
    if (contextualHtml) {
      return contextualHtml;
    }
    const suggestions = Array.isArray(options.defaultSuggestions)
      ? options.defaultSuggestions
      : [];
    const keyClass = options.keyClass || "metadata-script-reference-key";
    const keyHtml = suggestions
      .map((suggestion) => {
        const key = typeof suggestion === "string" ? suggestion : String(suggestion?.value ?? "");
        const label = typeof suggestion === "string" ? suggestion : String(suggestion?.label ?? key);
        const title = suggestion?.title || `Insert ${key}`;
        return `<code class="${escapeHtml(keyClass)}" data-key="${escapeHtml(key)}" role="button" tabindex="0" aria-label="Insert ${escapeHtml(label)}" title="${escapeHtml(title)}">${escapeHtml(label)}</code>`;
      })
      .join("");
    return `
      <span>${escapeHtml(options.defaultLabel || "keys")}</span>
      ${keyHtml}`;
  }

  function tokenClass(token = "", options = {}) {
    const lowerToken = String(token || "").toLowerCase();
    const classes = {
      assignment: "metadata-token-assignment",
      keyword: "metadata-token-keyword",
      list: "metadata-token-list",
      number: "metadata-token-number",
      property: "metadata-token-property",
      value: "metadata-token-value",
      ...(options.classes || {}),
    };
    if (options.isPropertyToken?.(token)) {
      return classes.property;
    }
    if (token === "=") {
      return classes.assignment;
    }
    if (token.startsWith("[") && token.endsWith("]")) {
      return classes.list;
    }
    if (["true", "false"].includes(lowerToken)) {
      return classes.keyword;
    }
    if (Number.isFinite(Number(token))) {
      return classes.number;
    }
    return classes.value;
  }

  function colorizeLine(line = "", options = {}) {
    const commentIndex = line.indexOf("//");
    const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
    const tokenPattern = options.tokenPattern || assignmentTokenPattern;
    const assignment = typeof options.assignmentInfo === "function"
      ? options.assignmentInfo(line)
      : assignmentInfo(line, options);
    let html = "";
    let lastIndex = 0;
    for (const match of code.matchAll(tokenPattern)) {
      const token = match[0];
      const tokenStart = match.index;
      const tokenEnd = tokenStart + token.length;
      html += escapeHtml(code.slice(lastIndex, match.index));
      const className = tokenClass(token, options);
      const linkClass = options.tokenIsMenuEligible?.(assignment?.key, tokenStart, tokenEnd, assignment)
        ? ` ${options.linkClass || "metadata-token-link"}`
        : "";
      html += `<span class="${className}${linkClass}">${escapeHtml(token)}</span>`;
      lastIndex = match.index + token.length;
    }
    html += escapeHtml(code.slice(lastIndex));
    if (comment) {
      html += `<span class="${options.commentClass || "metadata-token-comment"}">${escapeHtml(comment)}</span>`;
    }
    return html;
  }

  function isJsonIdentChar(ch) {
    return Boolean(ch) && /[A-Za-z0-9_]/.test(ch);
  }

  function jsonHighlightHtml(text = "") {
    const source = String(text || "");
    if (!source) {
      return "&nbsp;";
    }
    let html = "";
    let i = 0;
    const n = source.length;
    while (i < n) {
      const ch = source[i];
      if (ch === " " || ch === "\t" || ch === "\r") {
        const start = i;
        i += 1;
        while (i < n && (source[i] === " " || source[i] === "\t" || source[i] === "\r")) {
          i += 1;
        }
        html += escapeHtml(source.slice(start, i));
        continue;
      }
      if (ch === "\n") {
        html += "\n";
        i += 1;
        continue;
      }
      if (ch === "\"") {
        let j = i + 1;
        while (j < n) {
          if (source[j] === "\\") {
            j += 2;
            continue;
          }
          if (source[j] === "\"") {
            j += 1;
            break;
          }
          j += 1;
        }
        const raw = source.slice(i, j);
        i = j;
        let peek = i;
        while (peek < n && /[\s]/.test(source[peek])) {
          peek += 1;
        }
        const className = source[peek] === ":" ? "json-token-key" : "json-token-string";
        html += `<span class="${className}">${escapeHtml(raw)}</span>`;
        continue;
      }
      if (ch === "-" || (ch >= "0" && ch <= "9")) {
        const start = i;
        if (ch === "-") {
          i += 1;
        }
        while (i < n && source[i] >= "0" && source[i] <= "9") {
          i += 1;
        }
        if (source[i] === ".") {
          i += 1;
          while (i < n && source[i] >= "0" && source[i] <= "9") {
            i += 1;
          }
        }
        if (source[i] === "e" || source[i] === "E") {
          i += 1;
          if (source[i] === "+" || source[i] === "-") {
            i += 1;
          }
          while (i < n && source[i] >= "0" && source[i] <= "9") {
            i += 1;
          }
        }
        html += `<span class="json-token-number">${escapeHtml(source.slice(start, i))}</span>`;
        continue;
      }
      if (source.startsWith("true", i) && !isJsonIdentChar(source[i + 4])) {
        html += `<span class="json-token-keyword">true</span>`;
        i += 4;
        continue;
      }
      if (source.startsWith("false", i) && !isJsonIdentChar(source[i + 5])) {
        html += `<span class="json-token-keyword">false</span>`;
        i += 5;
        continue;
      }
      if (source.startsWith("null", i) && !isJsonIdentChar(source[i + 4])) {
        html += `<span class="json-token-keyword">null</span>`;
        i += 4;
        continue;
      }
      if ("{}[],:".includes(ch)) {
        html += `<span class="json-token-punct">${escapeHtml(ch)}</span>`;
        i += 1;
        continue;
      }
      html += escapeHtml(ch);
      i += 1;
    }
    return html;
  }

  function highlightHtml(text = "", options = {}) {
    const ignoredLines = options.ignoredLines instanceof Set
      ? options.ignoredLines
      : new Set(options.ignoredLines || []);
    const lineClass = options.lineClass || "metadata-script-line";
    const ignoredLineClass = options.ignoredLineClass || `${lineClass} metadata-script-line-ignored`;
    const colorizer = typeof options.colorizeLine === "function"
      ? options.colorizeLine
      : (line) => colorizeLine(line, options);
    return String(text || "").split("\n").map((line, index) => {
      const lineNumber = index + 1;
      const className = ignoredLines.has(lineNumber) ? ignoredLineClass : lineClass;
      return `<span class="${className}">${colorizer(line) || " "}</span>`;
    }).join("\n") || "&nbsp;";
  }

  function findTokenAt(text = "", index = 0, options = {}) {
    const source = String(text || "");
    const position = Math.max(0, Math.min(Number(index) || 0, source.length));
    const lines = source.split("\n");
    let offset = 0;
    for (const [lineIndex, line] of lines.entries()) {
      const lineStart = offset;
      const lineEnd = lineStart + line.length;
      if (position < lineStart || position > lineEnd + 1) {
        offset = lineEnd + 1;
        continue;
      }
      const assignment = typeof options.assignmentInfo === "function"
        ? options.assignmentInfo(line)
        : assignmentInfo(line, options);
      const config = options.optionsForKey?.(assignment?.key);
      if (!assignment || !config?.options?.length) {
        return null;
      }
      const valueStart = lineStart + assignment.valueStart;
      const valueEnd = lineStart + assignment.valueEnd;
      if (position < valueStart || position > valueEnd + 1) {
        return null;
      }
      const tokenText = source.slice(valueStart, valueEnd).trim();
      const leadingWhitespace = source.slice(valueStart, valueEnd).search(/\S/);
      const start = valueStart + Math.max(0, leadingWhitespace);
      const end = start + tokenText.length;
      return {
        assignment,
        config,
        end,
        key: assignment.key,
        line: lineIndex + 1,
        start,
        token: tokenText,
        type: "value",
      };
    }
    return null;
  }

  const api = Object.freeze({
    assignmentInfo,
    assignmentTokenPattern,
    colorizeLine,
    escapeHtml,
    findTokenAt,
    highlightHtml,
    jsonHighlightHtml,
    referenceContextHtml,
    referenceHtml,
    referenceOptionHtml,
    tokenClass,
  });
  window.nodeCodeSettingsEditor = api;
  window.codeSettingsEditor ||= api;
})();
