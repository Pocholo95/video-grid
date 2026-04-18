# VidGrid-HTML

A fully **client-side** video thumbnail grid generator. Drop in one or more
video files and get a single JPG contact sheet for each one — no upload, no
server processing, no account required.

---

## What it does

VidGrid-HTML analyses each video, samples frames at evenly-spaced timestamps
across the duration, and assembles them into a configurable grid. Each cell can
be annotated with a timecode overlay. An optional header row shows the filename,
resolution, duration, bitrate, and file size. The result is saved as a
high-quality JPEG you can preview, download, and/or upload to an image host.

---

## Privacy

**Nothing ever leaves your device** unless you explicitly upload to an image
host. All processing — metadata reading, frame extraction, canvas compositing,
and JPEG encoding — happens entirely inside your browser. No file data, no
metadata, and no generated images are transmitted to any server unless you
trigger an upload.

---

## Features

- **In-browser preview** — thumbnail previews of completed grids with a
  full-size modal viewer.
- **Universal metadata reading** — MediaInfo.js (WASM) accurately reads
  duration, resolution, and bitrate from virtually any container format (MP4,
  MKV, AVI, MOV, WMV, WebM, TS, and many more) without decoding frames.
- **Native frame extraction** using the browser's built-in video decoder for
  all formats the browser supports — fast, with no extra memory overhead.
- **FFmpeg WASM fallback** — formats the browser cannot decode natively
  (e.g. AVI, WMV, certain MKV/H.265 files). A warning is shown on the file
  card during the analysis phase when this path will be taken.
- **Batch processing** — queue multiple files and process them one after
  another with combined progress tracking.
- **Batch download** — completed outputs can be downloaded together as a
  ZIP archive.
- **Upload to image hosts** — upload generated grids to one or more configured
  Chevereto-compatible image hosts (e.g. ImgBB). See [Upload Destinations](#upload-destinations).
- **Copy links** — after uploading, copy links in multiple formats per output
  or for all outputs at once. See [Copying Links](#copying-links).
- **Configurable grid** — choose columns, rows, output width, frame spacing,
  and timecode position (or disable the overlay entirely).
- **Custom colours** — set the background and text colour for the header and
  timecode overlays.
- **Optional metadata header** — toggle a header row showing file info above
  the grid.
- **Presets** — save and switch between named option sets stored in
  localStorage. See [Presets](#presets).
- **Cancel at any time** — interrupt a running batch cleanly after the current
  frame.

---

## Options

| Option                   | Description                                                             | Default   |
| ------------------------ | ----------------------------------------------------------------------- | --------- |
| **Output width**         | Total pixel width of the generated JPG                                  | 1920 px   |
| **Grid columns**         | Number of columns in the grid                                           | 3         |
| **Grid rows**            | Number of rows in the grid                                              | 4         |
| **Frame spacing**        | Gap in pixels between cells                                             | 0         |
| **Timecode position**    | Corner where the timestamp overlay appears, or **Disabled** to omit it  | Top-left  |
| **Background color**     | Canvas and header background                                            | `#000000` |
| **Text color**           | Header text and timecode label colour                                   | `#ffffff` |
| **Show header metadata** | Toggle the filename/info header row                                     | On        |
| **Show preview**         | Show thumbnail previews in the output list                              | On        |

---

## Presets

The 🗂️ dropdown at the top of the options panel lets you manage named presets:

- **Select a preset** from the dropdown to instantly apply its settings.
- **`<Default Preset>`** is a permanent, undeletable entry that resets all
  settings to the factory defaults.
- **💾 Save / Add preset** — opens an inline name field pre-filled with the current
  preset name (or blank when `<Default Preset>` is selected). Enter a name and
  confirm to create a new preset or overwrite an existing one with the same name.
- **🗑️ Delete preset** — removes the currently selected preset. Disabled when
  `<Default Preset>` is selected.

Presets are stored in the browser's `localStorage` and persist between sessions.
The last selected preset will also be restored when you return.

---

## Upload Destinations

VidGrid-HTML can upload completed grids to one or more image hosts compatible
with the Chevereto v1 API (including [ImgBB](https://imgbb.com)) as long as they
have enabled API uploads and provide you with an API key (Under Settings).

### Managing destinations

Click **☁️ Upload Destinations** in the top-right corner to open the destination
manager. From there you can:

- **Add** a new destination by clicking **＋ Add destination** and filling in
  its name, type, upload URL, and API key.
- **Edit** an existing destination with the ✏️ button.
- **Enable / disable** a destination with its toggle (✅ / ⬜) without deleting it.
  Disabled destinations are skipped during uploads.
- **Delete** a destination with the 🗑️ button.
- Click **Save & close** to persist your changes, or **Discard changes** to
  cancel.

Destinations are stored in `localStorage` alongside presets and persist between
sessions.

### Uploading

Once one or more destinations are enabled and processing is complete:

- Each output card shows a **☁️ Upload** button. Clicking it uploads that grid
  to all enabled destinations.
- The **☁️ Upload All** button in the outputs header uploads every completed
  grid to all enabled destinations in sequence, with a short delay between
  requests to respect rate limits.

Upload progress is shown per-destination on each output card. Once complete,
the card expands a link panel for each destination (see below).

---

## Copying Links

After a successful upload, each output card shows a collapsible link panel
(one per destination). Expand it with the destination name button to access the
following link formats:

| Format                  | Description                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| **Direct URL**          | Full-resolution image link                                             |
| **Viewer page**         | Host viewer/page URL                                                   |
| **BBCode - full image** | `[img]...[/img]` tag                                                   |
| **BBCode - medium**     | Medium-size image linking to the viewer page (when provided by host)   |
| **BBCode - thumbnail**  | Thumbnail linking to the viewer page                                   |
| **Markdown**            | `![alt](url)`                                                          |
| **HTML img**            | `<img src="..." alt="..." />`                                          |
| **Post Template**       | Forum-style BBCode block with title and thumbnail (see Copy All below) |

Each row has an individual **Copy** button. You can also **delete the image**
from the host using the 🗑 Delete link in the panel header — this opens the
host's delete URL in a new tab.

### Copy All

When at least one output has been uploaded, a **Copy all links** bar appears
above the output list. Use the dropdown to select a format and click **Copy All**
to copy links for all uploaded outputs at once, one per line.

The **Post Template** format produces a BBCode block per output: a bold title
line (`[b]filename resolution[/b]`) followed by thumbnail links from every
destination on the same line, ready to paste into a forum post.

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

VidGrid-HTML requires a modern browser with WebAssembly support. Chrome 90+,
Firefox 90+, Edge 90+, and Safari 16.4+ are supported.
Also note that certain browsers support more video codec natively, e.g.
Chrome, and they will have a higher rate of success generating thumbnails.

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
- [JSZip](https://github.com/Stuk/jszip) — compressing generated output for download
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — download helper
- HTML5 Canvas API — grid compositing and JPEG encoding
- HTML5 Video API — native frame seeking for supported formats

## License

See the LICENSE file for details.
