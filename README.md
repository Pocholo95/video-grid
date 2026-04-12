# VidGrid-HTML

A fully **client-side** video thumbnail grid generator. Drop in one or more
video files and get a single JPG contact sheet for each one — no upload, no
server processing, no account.

---

## What it does

VidGrid-HTML analyses each video, samples frames at evenly-spaced timestamps
across the duration, and assembles them into a configurable grid. Each cell can
be annotated with a timecode overlay. An optional header row shows the filename,
resolution, duration, bitrate, and file size. The result is saved as a
high-quality JPEG you can preview and download immediately.

---

## Privacy

**Nothing ever leaves your device.** All processing — metadata reading, frame
extraction, canvas compositing, and JPEG encoding — happens entirely inside
your browser. No file data, no metadata, and no generated images are
transmitted to any server.

---

## Features

- **In-browser preview** — thumbnail previews of completed grids with a
  full-size modal viewer.
- **Universal metadata reading** via MediaInfo.js (WASM). Accurately reads
  duration, resolution, and bitrate from virtually any container format (MP4,
  MKV, AVI, MOV, WMV, WebM, TS, and many more) without decoding frames.
- **Native frame extraction** using the browser's built-in video decoder for
  all formats the browser supports — fast, with no extra memory overhead.
- **FFmpeg WASM fallback** for formats the browser cannot decode natively
  (e.g. AVI, WMV, certain MKV/H.265 files). A warning is shown before
  processing starts when this path will be taken.
- **Batch processing** — queue multiple files and process them one after
  another with combined progress tracking.
- **Batch download** of the generated outputs in ZIP-compressed format.
- **Configurable grid** — choose columns, rows, output width, frame spacing,
  and timecode position (or disable the overlay entirely).
- **Custom colours** — set the background and text colour for the header and
  timecode overlays.
- **Optional metadata header** — toggle a header row showing file info above
  the grid.
- **Presets** — save and switch between named option sets. Presets are stored
  in localStorage and accessible from a compact dropdown at the top of the
  options panel. The built-in `<Default options>` entry always restores the
  factory defaults.
- **Persistent settings** — save and restore your last-used options across
  sessions via localStorage (independent of named presets).
- **Cancel at any time** — interrupt a running batch cleanly after the current
  frame.

---

## Options

| Option | Description | Default |
| --- | --- | --- |
| **Output width** | Total pixel width of the generated JPG | 1920 px |
| **Grid columns** | Number of columns in the grid | 3 |
| **Grid rows** | Number of rows in the grid | 4 |
| **Frame spacing** | Gap in pixels between cells | 0 |
| **Timecode position** | Corner where the timestamp overlay appears, or **Disabled** to omit it | Top-left |
| **Background color** | Canvas and header background | `#000000` |
| **Text color** | Header text and timecode label colour | `#ffffff` |
| **Show header metadata** | Toggle the filename/info header row | On |
| **Show preview** | Show thumbnail previews in the output list | On |

---

## Presets

The 🗂️ dropdown at the top of the options panel lets you manage named presets:

- **Select a preset** from the dropdown to instantly apply its settings.
- **`<Default options>`** is a permanent, undeletable entry that resets all
  settings to the factory defaults.
- **💾 Add / save preset** — opens an inline name field pre-filled with the
  current preset name (or blank when `<Default options>` is selected). Enter a
  name and confirm to create a new preset or overwrite an existing one.
- **🗑️ Delete preset** — removes the currently selected preset. Disabled when
  `<Default options>` is selected.

Presets are stored in `localStorage` under the key `vidgrid_presets` and
persist between browser sessions.

---

## FFmpeg WASM — limitations and expectations

When a video cannot be decoded natively by the browser, VidGrid-HTML falls
back to **FFmpeg compiled to WebAssembly**. This is powerful but comes with
real trade-offs:

- **The entire file must be copied into the WASM memory heap.** For files
  larger than ~500 MB, this can consume several gigabytes of RAM and may
  cause the tab to crash on memory-constrained devices.
- **Frame extraction is sequential and slow.** Each seek-and-decode operation
  runs single-threaded inside the WASM sandbox. A 12-frame grid from a large
  file can take several minutes.
- **Some codecs are not supported.** The bundled FFmpeg build covers common
  codecs (H.264, H.265/HEVC, VP8/VP9, AV1) but exotic or proprietary codecs
  may fail silently or produce corrupted frames.
- **Out-of-memory errors are unrecoverable.** If the WASM heap runs out, the
  current file is skipped with an error. Reducing output width, columns, or
  rows lowers peak memory usage.

If you regularly work with formats that require FFmpeg (AVI, WMV, older MKV),
consider re-muxing them to MP4/H.264 beforehand for the best experience.

---

## Browser compatibility

VidGrid-HTML requires a modern browser with WebAssembly and OffscreenCanvas
support. Chrome 90+, Firefox 90+, Edge 90+, and Safari 16.4+ are supported.
The FFmpeg fallback additionally requires `SharedArrayBuffer`, which needs the
page to be served over HTTPS with appropriate COOP/COEP headers (handled
automatically by GitLab Pages).

---

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
npm run preview    # preview the production build locally
```

See [RELEASE.md](./RELEASE.md) for deployment instructions.

---

## Tech stack

- [Vite](https://vitejs.dev/) + TypeScript
- [mediainfo.js](https://mediainfo.js.org/) — container/codec metadata
- [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) — frame
  extraction fallback for natively unsupported formats
- [JSZip](https://github.com/Stuk/jszip) — Compressing generated output for download
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — Download helper
- HTML5 Canvas API — grid compositing and JPEG encoding
- HTML5 Video API — native frame seeking for supported formats

## License

See the LICENSE file for details.
