# UTF-8 safe: remove K badge on keyboard button + cache-bust versions.
from __future__ import annotations

import re
from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "public" / "index.html"

BUSTS = {
    "styles.css": "module-stroke-round-1",
    "node-graph-module-frame.js": "module-stroke-round-1",
    "node-graph-keyboard-shortcuts.js": "no-hotkey-k-1",
}


def main() -> None:
    raw = INDEX.read_bytes()
    text = raw.decode("utf-8")
    text2, n = re.subn(
        r'(<button id="nodeSceneToggleStandaloneMidiKeyboard"[^>]*>\s*'
        r'<span class="scene-context-window-button-icon"[^>]*>[^<]*</span>)\s*'
        r"<kbd>K</kbd>",
        r"\1",
        text,
        count=1,
    )
    print(f"removed kbd K: {n}")
    text = text2
    for name, ver in BUSTS.items():
        text, count = re.subn(re.escape(name) + r"\?v=[^\"']+", f"{name}?v={ver}", text)
        print(f"{name}: {count} -> {ver}")
    if b"\r\n" in raw:
        text = text.replace("\r\n", "\n").replace("\n", "\r\n")
    INDEX.write_bytes(text.encode("utf-8"))
    out = INDEX.read_bytes().decode("utf-8")
    # Remaining <kbd>K</kbd> may exist elsewhere (Ctrl+K) — that's fine.
    has_scene_k = bool(
        re.search(
            r'id="nodeSceneToggleStandaloneMidiKeyboard"[\s\S]{0,200}<kbd>K</kbd>',
            out,
        )
    )
    print("scene keyboard kbd gone:", not has_scene_k)
    print("rocket ok:", "\U0001F680" in out)


if __name__ == "__main__":
    main()
