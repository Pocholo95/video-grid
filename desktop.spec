# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the VidGrid desktop app.

Build with (from the repo root, so dist/ paths resolve correctly):
    pyinstaller desktop.spec --distpath pyinstaller_dist --workpath pyinstaller_build

--onedir (not --onefile): resource resolution in desktop/paths.py uses
Path(sys.executable).parent, and --onefile would re-extract ~150MB of
ffmpeg/ffprobe binaries to a fresh temp dir on every launch.

NOTE: explicit --distpath/--workpath are required -- PyInstaller's own
default output dir is also named "dist", which would collide with the
Vite build output this spec bundles as data.

Cross-platform: builds on Windows produce VidGrid.exe, on Linux/macOS a
plain VidGrid binary -- PyInstaller picks the right one automatically.
bin/ffmpeg[.exe]/bin/ffprobe[.exe] are only bundled if present; if you'd
rather rely on a system ffmpeg (common on Linux, see desktop/paths.py's
PATH fallback), just don't put binaries in bin/ and the build still works.
"""

import sys
from pathlib import Path

_exe_suffix = ".exe" if sys.platform == "win32" else ""
_bin_datas = [
    (str(p), "bin")
    for name in ("ffmpeg", "ffprobe")
    if (p := Path("bin") / f"{name}{_exe_suffix}").is_file()
]

a = Analysis(
    ["desktop_main.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("dist", "dist"),
        *_bin_datas,
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="VidGrid",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # console=True: there's no app window anymore (the UI opens in the
    # user's browser), so this terminal is the only way to see ffmpeg
    # logs/errors and the only way to stop the server (Ctrl+C).
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="VidGrid",
)
