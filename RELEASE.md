# Release & Packaging Guide

VidGrid-HTML is now a **local desktop app** (Windows and Linux; a local
Python server + real ffmpeg, opened in your browser), not a hosted web app.
"Releasing" means building a standalone executable per platform, not
deploying a static site.

> **Note:** `.gitlab-ci.yml` in this repo still builds and publishes the
> frontend to GitLab Pages. Since the app depends entirely on the
> `desktop/` Python backend's `/api/*` routes for metadata and all
> processing, a plain browser visiting that Pages URL would get a UI that
> can't process anything (no backend behind it). If you don't need the
> hosted build anymore, remove or disable the `pages` job in
> `.gitlab-ci.yml`.

---

## Building a release

### Windows

```bash
npm ci
npm run build                        # frontend → dist/

.venv\Scripts\pip install -r requirements-desktop.txt pyinstaller
.venv\Scripts\pyinstaller desktop.spec --distpath pyinstaller_dist --workpath pyinstaller_build --noconfirm
```

The packaged app is at `pyinstaller_dist/VidGrid/VidGrid.exe` — an
`--onedir` build (a folder, not a single file) so `bin/ffmpeg.exe`/
`bin/ffprobe.exe` (~150MB) aren't re-extracted to a temp directory on every
launch. Distribute the whole `pyinstaller_dist/VidGrid/` folder.

`bin/ffmpeg.exe`/`bin/ffprobe.exe` are gitignored dev-time binaries you
provide yourself (see [README — Desktop App](./README.md#desktop-app)).
Use a build whose `ffmpeg -decoders` output includes `av1`/`libdav1d`/
`libaom-av1`.

### Linux

Must be built on Linux (PyInstaller doesn't cross-compile). No system
packages needed beyond Python itself (see [README — Desktop
App](./README.md#desktop-app)):

```bash
npm ci
npm run build                        # frontend → dist/

.venv/bin/pip install -r requirements-desktop.txt pyinstaller
.venv/bin/pyinstaller desktop.spec --distpath pyinstaller_dist --workpath pyinstaller_build --noconfirm
```

The packaged app is at `pyinstaller_dist/VidGrid/VidGrid`. Bundling
`bin/ffmpeg`/`bin/ffprobe` is optional on Linux — if `bin/` is empty at
build time, the packaged app falls back to `ffmpeg`/`ffprobe` on the target
machine's `PATH`.

Each platform's package must be built on that platform — build Windows
releases on Windows and Linux releases on Linux (or matching CI runners).

---

## Before shipping a build

- `npm run build` and `npm run test` both pass.
- On Windows: `bin\ffmpeg.exe -decoders | findstr av1` and
  `bin\ffprobe.exe -version` succeed (if bundling binaries).
- On Linux: `ffmpeg -decoders | grep av1` and `ffprobe -version` succeed,
  whether that's `bin/ffmpeg`/`bin/ffprobe` or the system PATH copy.
- The packaged exe/binary launches on a machine without a dev Python/Node
  install, and a batch of several videos (including at least one AV1 file)
  actually processes end-to-end with real concurrency (check Task
  Manager/`ps` for multiple `ffmpeg` processes during a multi-file batch).
- No automated test exercises the real ffmpeg subprocess pipeline or a real
  packaged executable — this must be checked manually per release, per
  platform.

## Versioning

Bump `package.json`'s version as usual:

```bash
npm version patch   # or minor / major
```
