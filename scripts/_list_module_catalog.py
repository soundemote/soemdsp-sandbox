#!/usr/bin/env python3
from pathlib import Path
import re
import json

store = Path("public/node-graph-module-store.js").read_text(encoding="utf-8")
start = store.find("const nodeGraphModuleStoreCatalog = Object.freeze({")
end = store.find("\n});", start)
body = store[start:end]
entries = []
for m in re.finditer(r"\n  ([a-zA-Z][a-zA-Z0-9_]*):\s*\{", body):
    key = m.group(1)
    chunk = body[m.end() : m.end() + 2000]
    lab = re.search(r'label:\s*"([^"]*)"', chunk)
    # single-line description
    desc_m = re.search(r'description:\s*"((?:\\.|[^"\\])*)"', chunk)
    if not desc_m:
        # multi-line string concat
        desc_m = re.search(
            r"description:\s*((?:\"(?:\\.|[^\"\\])*\"\s*\+\s*)*\"(?:\\.|[^\"\\])*\")",
            chunk,
            re.S,
        )
        if desc_m:
            parts = re.findall(r'"((?:\\.|[^"\\])*)"', desc_m.group(1))
            desc = " ".join(parts)
        else:
            desc = ""
    else:
        desc = desc_m.group(1)
    desc = desc.replace("\\n", " ").replace('\\"', '"')
    entries.append({
        "type": key,
        "label": lab.group(1) if lab else key,
        "description": desc,
    })

out = Path("scripts/_module_catalog_snapshot.json")
out.write_text(json.dumps(entries, indent=2), encoding="utf-8")
print(len(entries), "->", out)
