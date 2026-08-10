# UTF-8 safe: Visibility menu defaults + cache-bust.
from __future__ import annotations

import re
from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "public" / "index.html"

WHITE = "\u2b1c"  # ⬜
BLACK = "\u2b1b"  # ⬛

REPLACEMENTS = [
    (
        'id="nodeGridToggleButton" type="button" role="menuitem" aria-pressed="false">Show Grid</button>',
        f'id="nodeGridToggleButton" type="button" role="menuitem" aria-pressed="false">{WHITE} Grid</button>',
    ),
    (
        'id="nodeModuleButtonsToggleButton" type="button" role="menuitem" aria-pressed="false">Show Module Buttons</button>',
        f'id="nodeModuleButtonsToggleButton" type="button" role="menuitem" aria-pressed="false">{WHITE} Module Buttons</button>',
    ),
    (
        'id="nodeOscilloscopeToggleButton" type="button" role="menuitem" aria-pressed="false">Show Displays</button>',
        f'id="nodeOscilloscopeToggleButton" type="button" role="menuitem" aria-pressed="false">{WHITE} Displays</button>',
    ),
    (
        'id="nodeModuleInterfaceControlsToggleButton" type="button" role="menuitem" aria-pressed="true">Hide Control Surfaces</button>',
        f'id="nodeModuleInterfaceControlsToggleButton" type="button" role="menuitem" aria-pressed="true">{BLACK} Control Surfaces</button>',
    ),
    (
        'id="nodeModuleSlidersToggleButton" type="button" role="menuitem" aria-pressed="true">Hide Sliders</button>',
        f'id="nodeModuleSlidersToggleButton" type="button" role="menuitem" aria-pressed="true">{BLACK} Sliders</button>',
    ),
    (
        'id="nodeSliderAmountToggleButton" type="button" role="menuitem" aria-pressed="false">Show Amount Slider</button>',
        f'id="nodeSliderAmountToggleButton" type="button" role="menuitem" aria-pressed="false">{WHITE} Amount Slider</button>',
    ),
    (
        'id="nodeSliderPositionToggleButton" type="button" role="menuitem" aria-pressed="true">Hide Position Slider</button>',
        f'id="nodeSliderPositionToggleButton" type="button" role="menuitem" aria-pressed="true">{BLACK} Position Slider</button>',
    ),
    (
        'id="nodeKeyboardDebugToggleButton" type="button" role="menuitem" aria-pressed="false"><span>Show Debug</span><kbd>D</kbd></button>',
        f'id="nodeKeyboardDebugToggleButton" type="button" role="menuitem" aria-pressed="false"><span>{BLACK} Debug</span><kbd>D</kbd></button>',
    ),
    (
        '<div class="scene-context-module-section-title">Show / Hide</div>',
        '<div class="scene-context-module-section-title">Visibility</div>',
    ),
]

BUSTS = {
    "node-graph-view-controls.js": "vis-emoji-1",
    "node-graph-context-menu.js": "vis-emoji-1",
}


def main() -> None:
    raw = INDEX.read_bytes()
    text = raw.decode("utf-8")
    for old, new in REPLACEMENTS:
        if old not in text:
            print("MISSING:", old[:90])
        else:
            text = text.replace(old, new, 1)
            print("ok:", new[:70])

    # Module-settings visibility rows: first line Show|Hide -> white square default
    text2, n = re.subn(
        r'(class="scene-context-button-lines"><span>)(?:Show|Hide)(</span>)',
        rf"\g<1>{WHITE}\g<2>",
        text,
    )
    print(f"module button lines: {n}")
    text = text2

    for name, ver in BUSTS.items():
        text, count = re.subn(re.escape(name) + r"\?v=[^\"']+", f"{name}?v={ver}", text)
        print(f"{name}: {count} -> {ver}")

    if b"\r\n" in raw:
        text = text.replace("\r\n", "\n").replace("\n", "\r\n")
    INDEX.write_bytes(text.encode("utf-8"))
    out = INDEX.read_bytes().decode("utf-8")
    print("has Show Grid:", "Show Grid" in out)
    print("has white square:", WHITE in out)
    print("rocket ok:", "\U0001F680" in out)


if __name__ == "__main__":
    main()
