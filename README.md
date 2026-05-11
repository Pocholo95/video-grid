# VidGrid-HTML

A fully **client-side** video thumbnail grid generator. Drop in one or more
video files and get a single JPG contact sheet or an **animated WebP** for
each video. No upload, no server processing, no account required.

---

## What it does

VidGrid-HTML analyzes each video, samples frames at evenly-spaced timestamps
or custom timestamps per file across the duration, and assembles them into
a configurable grid. Each cell can be annotated with a timecode overlay. An
optional header row shows the filename, resolution, duration, bitrate, and file
size. The result is saved as a high-quality JPEG or animated WebP you can
preview, download, and/or upload to an image host.

---

## Privacy

**Nothing ever leaves your device** unless you explicitly upload to an image
host. All processing — metadata reading, frame extraction, canvas compositing,
JPEG/WebP encoding — happens entirely inside your browser. No file data, no
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
- **Animated WebP output** — generate an animated thumbnail grid where each
  cell plays a short clip from its sampled timestamp. See
  [Animated Thumbnail Grids](#animated-thumbnail-grids).
- **VR Video support** — crop one eye from Side-by-Side or Top-Bottom stereo
  VR video so thumbnails show a single, undoubled image. See
  [VR Video](#vr-video).
- **Custom grid templates** — design a free-form layout with any number of
  rows and any number of cells per row, instead of a uniform columns × rows
  grid. See [Custom Grid Templates](#custom-grid-templates).
- **Custom timestamps per file** — click **Edit Timestamps** on any task item
  to set exact frame positions using a built-in video player with marker pins. See
  [Custom Timestamps](#custom-timestamps).
- **Batch processing** — queue multiple files and process them one after
  another with combined progress tracking.
- **Batch download** — completed tasks can be downloaded together as a
  ZIP archive.
- **Upload to image hosts** — upload generated grids to one or more configured
  Chevereto-compatible image hosts (e.g. ImgBB). See [Upload Destinations](#upload-destinations).
- **Copy links** — after uploading, copy links in multiple formats per task
  or for all tasks at once. See [Copying Links](#copying-links).
- **Configurable grid** — choose columns, rows, output width, frame spacing,
  and timecode position (or disable the overlay entirely).
- **Custom colors** — set the background and text color for the header and
  timecode overlays.
- **Optional metadata header** — toggle a header row showing file info above
  the grid.
- **Presets** — save and switch between named option sets stored in
  localStorage. See [Presets](#presets).
- **Cancel at any time** — interrupt a running batch cleanly after the current
  frame.

---

## Generation Options

The controls are grouped into three fieldsets: **Grid**, **Style**, and **Output Modes**.

### Grid

| Option                   | Description                                                                            | Default |
| ------------------------ | -------------------------------------------------------------------------------------- | ------- |
| **Output width**         | Total pixel width of the generated image.                                              | 1920 px |
| **Frame spacing**        | Gap in pixels between cells.                                                           | 0       |
| **Grid columns**         | Number of columns in the uniform grid. Hidden when a custom template is active.        | 3       |
| **Grid rows**            | Number of rows in the uniform grid. Hidden when a custom template is active.           | 4       |
| **Custom grid template** | Enable a free-form layout editor. See [Custom Grid Templates](#custom-grid-templates). | Off     |

### Output Modes

| Option                   | Description                                                                                                             | Default  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| **Timecode position**    | Corner where the timestamp overlay appears, or **Disabled** to omit it.                                                 | Top-left |
| **Show header metadata** | Toggle the filename/info header row.                                                                                    | On       |
| **VR Video**             | Crop one part of a stereo VR frame (SBS or TB layout), see [VR Video options](#vr-video-options)                        | Disabled |
| **Animated output**      | Generate an animated WebP instead of a static JPEG. Reveals more options, see [Animation settings](#animation-settings) | Off      |

### Style

| Option               | Description                           | Default   |
| -------------------- | ------------------------------------- | --------- |
| **Background color** | Canvas and header background.         | `#000000` |
| **Text color**       | Header text and timecode label color. | `#ffffff` |

---

## Custom Grid Templates

By default VidGrid-HTML arranges frames in a uniform columns × rows grid. The
**Custom grid template** checkbox in the Grid section replaces that with a
free-form layout: any number of rows, each with any number of cells.

### How it works

The template editor opens as a modal. Rows stack vertically on screen; within
each row, cells share the full output width equally — there is no manual width
control. The height of every cell in a row is derived automatically from the
cell width and the video's aspect ratio, so the output is always
pixel-perfect with no distortion. Fewer cells per row means wider, taller
cells; more cells means narrower, shorter cells.

### Building a template

- **+ Add Row** appends a new full-width single-cell row at the bottom.
- **+** at the right end of each row splits the row's available space by
  adding one more cell. All cells in that row are immediately rebalanced to
  equal widths.
- **✕** on a cell removes it; the remaining cells in that row rebalance
  equally. Removing the last cell in a row removes the entire row.
- The **⠿** handle on the left of each row can be grabbed to drag the row to
  a different position in the stack.
- **↺ Reset (?x?)** discards the current layout and restores a uniform grid
  sized based on the non-custom collumns/row option.

### Cell numbering and timestamps

Cells are numbered in reading order — left-to-right within each row and
top-to-bottom across rows. That number determines which timestamp is
sampled for each cell, and it is the same count the **Timestamp Editor**
uses when you set per-file custom markers. If you change the template after
setting custom markers on a task, requeue the task so the new cell count is
applied.

### Saving and reusing templates

The full grid template is saved as part of the **Preset**. To reuse the same
layout in a different preset or with different style settings, save the
preset after building your grid template, then load it later and adjust any other
options (output width, colors, header, etc.) without touching the template.

---

## Custom Timestamps

Each task item shows its timestamp mode (**Auto** or **Custom**) with an
**Edit Timestamps** button. Click to open a full-featured editor modal for that
specific video.

### Editor features

- **Video player** with seekbar, play/pause (⏸️/▶️), and current time display
- **Visual marker pins** on the seekbar — green (used in grid), orange (extra)
- **Keyboard shortcuts**: `Space` (play/pause), `M` (add marker), `Esc` (close)
- **Live marker list** — click to seek, ✕ to delete individual markers
- **Smart counting** — shows how many markers fit your grid (total cell count
  from the active layout, uniform or custom), extras ignored, shortages use
  auto fallback
- **Reset** — restore evenly-spaced timestamps
- **Save Markers** — apply custom timestamps

### Smart behaviors

- **Auto seeding** — opens with evenly-spaced timestamps as starting point
- **Zero markers = auto** — saving empty list reverts to automatic mode
- **Works with animation** — custom timestamps apply to both static JPEG and animated WebP modes
- **Per-file** — each video keeps its own custom markers independently

---

## Animated Thumbnail Grids

When **Animated output (WebP)** is enabled, VidGrid-HTML generates an animated
WebP instead of a static JPEG. Each grid cell shows a short looping video clip
sampled from its timestamp (auto or custom), giving a quick visual overview
of the entire video in motion.

### How animated grids works

1. **Frame composition** — for each animation frame the app seeks the source
   video to the appropriate timestamp for every cell, draws it onto a canvas,
   and exports the result as a PNG. This phase is driven entirely by the
   browser's native video decoder.
2. **WebP encoding** — once all canvas frames are composed, they are passed to
   FFmpeg WASM which assembles them into a single animated WebP file using
   libwebp.

### Animation settings

The **Animation settings** panel is shown below the main options whenever
animated mode is enabled.

These appear only when **Animated output** is enabled.

| Setting          | Description                                                                                         | Default |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------- |
| **Duration (s)** | Length of each cell's clip. The whole animation loops from the start                                | 3 s     |
| **FPS**          | Frame rate of the animated WebP. Higher values are smoother but produce larger files                | 10 fps  |
| **WebP method**  | Compression effort (0 = fastest, 6 = smallest file). Higher values slow down encoding significantly | 5       |
| **WebP quality** | Output quality (5–100). Lower values produce smaller files with more visible artefacts              | 90      |

### Requirements and limitations

- **Native browser decoding only.** Animated mode uses the browser's built-in
  `<video>` element to seek frames. Files that require the FFmpeg fallback
  (AVI, WMV, some MKV) are incompatible with animated mode. Disable animated
  mode and regenerate as a static JPEG if you need to cover those formats.
- **Large output files.** Animated WebPs are significantly larger than static
  JPEGs. A 3×4 grid at 3 s / 10 fps will composite 30 PNG frames before
  encoding. Reduce FPS, duration, or quality and increase the WebP method to
  keep file sizes manageable.
- **Encoding time.** libwebp encoding through FFmpeg WASM is single-threaded.
  High method values (5–6) combined with large frame counts can take many
  seconds or minutes.
- **Memory.** All composed PNG frames are held in browser memory before being
  handed to FFmpeg. Very high frame counts (long duration × high FPS) can
  exhaust available RAM.

---

## VR Video

The **VR Video** dropdown lets you generate thumbnails from stereoscopic VR
video without the distracting double-image that appears when the full frame is
captured. Instead of showing both eyes side by side (or stacked), VidGrid-HTML
crops a single eye from each decoded frame before drawing it onto the canvas.

When any VR mode other than **Disabled** is selected, a note is added to the
header row (when visible) explaining that the screenshots were modified.

### Stereo layouts

VR video is recorded in one of two stereo layouts:

- **SBS (Side-by-Side)** — the left and right eye views are placed next to each
  other horizontally. Each eye occupies half the frame width. Common in VR 180°
  content.
- **TB (Top-Bottom)** — the left and right eye views are stacked vertically.
  Each eye occupies half the frame height. Common in VR 360° content.

### VR Video options

| Option                           | Description                                              |
| -------------------------------- | -------------------------------------------------------- |
| **Disabled**                     | No VR processing. The full frame is used as-is (default) |
| **SBS - Crop Left Eye**          | Crops the left half of a Side-by-Side frame              |
| **SBS - Crop Right Eye**         | Crops the right half of a Side-by-Side frame             |
| **TB - Crop Top (Left Eye)**     | Crops the top half of a Top-Bottom frame                 |
| **TB - Crop Bottom (Right Eye)** | Crops the bottom half of a Top-Bottom frame              |

### How cropping works

The crop is applied directly inside the canvas `drawImage` call using the
9-argument form `drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)`, which
selects a source rectangle from the decoded frame without any additional
processing step. This means:

- There is no performance overhead compared to non-VR processing.
- It works on both the native browser decoder path and the FFmpeg WASM fallback
  path, so all formats are supported.
- Cell aspect ratio is automatically corrected — an SBS frame that is 16:9
  overall produces cells that are 8:9 (portrait), as expected for a single eye.

### Limitations

- **Crop only, no projection correction.** The tool isolates one eye from the
  stereo pair but does not reproject the image (e.g. equirectangular to flat
  perspective). Thumbnails from 180° or 360° content will retain the
  characteristic barrel distortion of those formats.
- **Manual format selection.** VidGrid-HTML does not attempt to auto-detect
  whether a file is VR or which stereo layout it uses. Select the correct mode
  for your content.

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
The last selected preset will also be restored when you return. All settings are
included in saved presets — grid options, style, output modes, animation
settings, VR mode, and any custom grid template. Custom timestamps are per-file
and are not stored in presets.

---

## Settings

A few app-wide settings are available through the **⚙️ Settings** icon in the header:

| Setting                | Description                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Themes**             | Choose a visual style for the app (Dark, Light, Dimmed, or Classic). The change visually applies immediately to the UI but need to be saved to persist. |
| **Show Previews**      | Toggle visibility of thumbnail previews in the tasks list.                                                                                              |
| **Upload Destinatons** | Button that opens a new dialog window to manage the upload destinations for the generated files. See [Upload Destinations](#upload-destinations).       |

These settings are independent of presets, they persist separately and affect only the application's appearance and behavior, not your grid generation options.

### Upload Destinations

VidGrid-HTML can upload completed grids to one or more image hosts compatible
with the Chevereto v1 API (including [ImgBB](https://imgbb.com)) as long as they
have enabled API uploads and provide you with an API key (often under "Settings" in the hosting website dashboard).

#### Managing destinations

Click **☁️ Upload Destinations** in the Settings to open the destination
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

Once one or more destinations are added and enabled (see [Settings](#settings)) and processing is complete:

- Each task card shows a **☁️ Upload** button. Clicking it uploads that grid
  to all enabled destinations.
- The **☁️ Upload All** button in the tasks header uploads every completed
  grid to all enabled destinations in sequence, with a short delay between
  requests to respect rate limits.
  Upload progress is shown per-destination on each task card. Once complete,
  the card expands a link panel for each destination (see below).

---

## Copying Links

After a successful upload, each task item shows a collapsible link panel
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

When at least one task output has been uploaded, a **Copy all links** bar appears
above the tasks list. Use the dropdown to select a format and click **Copy All**
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
Also note that certain browsers support more video codecs natively, e.g.
Chrome, and they will have a higher rate of success generating thumbnails.
Animated WebP output requires the browser to support native video seeking, so
the same codec support rules apply

---

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
npm run preview    # preview the production build locally
```

See [RELEASE.md](./RELEASE.md) for deployment instructions

## Tech stack

- [Vite](https://vitejs.dev/) with TypeScript
- [React JS](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)
- [Lucide](https://lucide.dev/)
- [mediainfo.js](https://mediainfo.js.org/) — container/codec metadata
- [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) — animated WebP
  encoding via libwebp, and frame extraction fallback for natively unsupported formats
- [JSZip](https://github.com/Stuk/jszip) — compressing generated output for download
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — download helper
- HTML5 Canvas API — grid compositing and JPEG/PNG encoding
- HTML5 Video API — native frame seeking for supported formats

## License

See the LICENSE file for details.
