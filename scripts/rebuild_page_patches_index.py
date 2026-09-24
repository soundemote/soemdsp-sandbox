#!/usr/bin/env python3
"""Rebuild patches/index.json for the Pages picker (root + one folder deep)."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PATCHES = ROOT / "patches"
BASE = "/soemdsp-sandbox/patches"


def read_patch_info(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    patch_data = data.get("patch_data")
    if isinstance(patch_data, dict) and isinstance(patch_data.get("info"), dict):
        return patch_data["info"]
    if isinstance(data.get("info"), dict):
        return data["info"]
    return {}


def catalog_entry(path: Path, *, slug: str, folder: str | None, url: str) -> dict:
    info = read_patch_info(path)
    name = str(info.get("name") or "").strip()
    entry = {
        "slug": slug,
        "label": path.stem,
        "name": name,
        "url": url,
        "author": str(info.get("author") or "").strip(),
        "tags": str(info.get("tags") or "").strip(),
        "emoji": str(info.get("emoji") or "").strip(),
    }
    if folder:
        entry["folder"] = folder
    return entry


def main() -> None:
    entries: list[dict] = []
    for path in sorted(PATCHES.glob("*.json"), key=lambda p: p.name.lower()):
        if path.name.lower() == "index.json":
            continue
        entries.append(
            catalog_entry(
                path,
                slug=path.stem,
                folder=None,
                url=f"{BASE}/{quote(path.name, safe='')}",
            )
        )
    for folder in sorted(
        [p for p in PATCHES.iterdir() if p.is_dir()],
        key=lambda p: p.name.lower(),
    ):
        for path in sorted(folder.glob("*.json"), key=lambda p: p.name.lower()):
            entries.append(
                catalog_entry(
                    path,
                    slug=f"{folder.name}/{path.stem}",
                    folder=folder.name,
                    url=f"{BASE}/{quote(folder.name, safe='')}/{quote(path.name, safe='')}",
                )
            )

    def sort_key(e: dict) -> tuple:
        folder = e.get("folder") or ""
        # filter* folders on top of everything, then other folders, then root.
        if folder.lower().startswith("filter"):
            tier = 0
        elif folder:
            tier = 1
        else:
            tier = 2
        return (tier, folder.lower(), str(e["label"]).lower())

    entries.sort(key=sort_key)
    catalog = {
        "kind": "soundemote-page-patches",
        "version": 1,
        "base": BASE,
        "patches": entries,
    }
    out = PATCHES / "index.json"
    out.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)} ({len(entries)} patches)")


if __name__ == "__main__":
    main()
