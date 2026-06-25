# VidGrid-HTML

A fully **client-side** video thumbnail grid generator. Drop in one or more
video files and get a single JPG contact sheet or an **animated WebP** for
each video. No upload, no server processing, no account required.

---

## What it does

VidGrid-HTML analyzes each video, samples frames at evenly-spaced timestamps
or custom timestamps per file across the duration, and assembles them into
a configurable grid. Each cell can be annotated with a timecode overlay. An
optional header row shows the filename, resolution, duration, bitrate, FPS,
codec, and file size. The result is saved as a high-quality JPEG or animated
WebP you can preview, download, and/or upload to an image host.

---

## Privacy

**Nothing ever leaves your device** unless you explicitly upload to an image
host. All processing — metadata reading, frame extraction, canvas compositing,
JPEG/WebP encoding — happens entirely inside your browser. No file data, no
metadata, and no generated images are transmitted to any server unless you
trigger an upload.

---

## Table of Contents

- [Basic Usage](#basic-usage)
- [Features](#features)
- [Tasks Actions](#tasks-actions)
- [Generation Options](#generation-options)
- [Custom Grid Templates](#custom-grid-templates)
- [Custom Timestamps](#custom-timestamps)
- [Animated output](#animated-output)
- [Sequence mode - Video with audio](#sequence-mode---video-with-audio)
- [VR Video](#vr-video)
- [Presets](#presets)
- [Uploading](#uploading)
- [Settings](#settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [FFmpeg WASM Limitations](#ffmpeg-wasm--limitations-and-expectations)
- [Browser Compatibility](#browser-compatibility)
- [Development](#development)

---

## Basic Usage

1. **Add videos:** Drag and drop video files into the drop zone, or click it
   to select files from your filesystem.
2. **Review analysis:** Each video is immediately analyzed and added to the
   "Tasks" list with its detected properties. Add more files at any time.
3. **Customize options:** _(optional)_ Adjust grid size, style, animation,
   or VR settings as described in [Generation Options](#generation-options).
4. **Start processing:** Click "▶️ Start Processing" to generate thumbnail
   grids sequentially for all queued tasks.
5. **Download/Upload/Requeue:** After processing, use the "Download JPG" (or
   WebP) button to save the grid, or "Requeue" to process the same video
   again with different settings.
   If you have configured one or more [Upload destinations](#upload-destinations),
   a third button captioned "Upload" will appear.

> **Tip:** During long batches, if the options panel scrolls out of view, a
> compact progress bar appears at the top of the page with batch progress,
> item count, and quick-access buttons to cancel, requeue, or clear. Click the
> expand arrow to reveal the full controls again without having to scroll back
> to the top.

---

## Features

- **In-browser preview:** thumbnail previews of completed grids with a
  full-size modal viewer.
- **Universal metadata reading:** MediaInfo.js (WASM) accurately reads
  duration, resolution, bitrate, FPS, and codec from virtually any container
  format (MP4, MKV, AVI, MOV, WMV, WebM, TS, and many more) without decoding
  frames.
- **Native frame extraction** using the browser's built-in video decoder for
  all formats the browser supports — fast, with no extra memory overhead.
- **FFmpeg WASM fallback:** formats the browser cannot decode natively
  (e.g. AVI, WMV, certain MKV/H.265 files). A warning is shown on the file
  card during the analysis phase when this path will be taken.
- **Animated WebP/MP4 output:** generate an animated thumbnail grid or sequence
  of still frames/video where each cell plays a short clip from its sampled
  timestamp. See [Animated output](#animated-output).
- **Video with audio sequence:** generate an MP4 sequence that preserves the
  video's original audio track. See [Sequence mode - Video with audio](#sequence-mode---video-with-audio).
- **VR Video support:** crop one eye from Side-by-Side or Top-Bottom stereo
  VR video so thumbnails show a single, undoubled image. See
  [VR Video](#vr-video).
- **Custom grid templates:** design a free-form layout with any number of
  rows and any number of cells per row, instead of a uniform columns × rows
  grid. See [Custom Grid Templates](#custom-grid-templates).
- **Custom timestamps per file:** click **Edit Timestamps** on any task item
  to set exact frame positions using a built-in video player with marker pins. See
  [Custom Timestamps](#custom-timestamps).
- **Batch processing:** queue multiple tasks by adding video files and process
  them one after another with combined progress tracking.
- **Batch download:** completed tasks can be downloaded together as a
  ZIP archive.
- **Upload to image hosts:** upload generated grids to one or more configured
  Chevereto-compatible image hosts (e.g. ImgBB). See [Upload Destinations](#upload-destinations).
- **Copy links:** after uploading, copy links in multiple formats per task
  or for all tasks at once. See [Copying Links](#copying-links).
- **Configurable grid:** choose columns, rows, output width, cell spacing,
  and timecode position (or disable the overlay entirely).
- **Custom colors:** set the background and text color for the header and
  timecode overlays.
- **Optional metadata header:** toggle a header row showing file info above
  the grid.
- **Presets:** save and switch between named option sets stored in
  localStorage. See [Presets](#presets).
- **Cancel at any time:** interrupt a running batch cleanly after the current
  frame.

---

## Tasks Actions

When at least one file has been analyzed, a **Tasks Actions** panel appears
above the tasks list. Use the dropdown to select a format and click **Copy All**
to copy links/formatted text for all uploaded outputs at once, one per line.

At first only one format is available, no generation/upload is required, it's
**BBCode — Title & Resolution** which produces `[b]filename resolution[/b]` lines
ready to paste as a list of titles into a forum post for example.

To unlock the other formats, you need to generate the thumbnails by processing the
files, and then upload them to one or more destinations using the individual "Upload"
buttons or the "Upload All" button that appears in the Tasks Actions panel. The
formats are detailed under [Copying Links](#copying-links).

Additionally, once multiple tasks are completed, a "Download All" button appears
in this panel; when used, it offers you a compressed ZIP archive of all
the completed tasks.

---

## Generation Options

The controls are grouped into three collapsible fieldsets: **Grid**, **Output Modes**, and **Style**.

> **Tip:** Hold **Shift** while clicking any section header to expand or
> collapse all sections in the same group at once — useful when you want to
> quickly scan or adjust multiple settings. This works on Tasks sections too.

### Grid

| Option                   | Description                                                                            | Default |
| ------------------------ | -------------------------------------------------------------------------------------- | ------- |
| **Output width**         | Total pixel width of the generated image.                                              | 1920 px |
| **Cell spacing**         | Gap in pixels between cells.                                                           | 0       |
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
| **Sequence mode**        | Single-cell sequential playback instead of a grid. See [Sequence mode](#animation-settings)                             | Off      |
| **Output format**        | **WebP** for animated WebP; **MP4** for MP4 video output                                                                | WebP     |

### Style

| Option                 | Description                                                                  | Default        |
| ---------------------- | ---------------------------------------------------------------------------- | -------------- |
| **Background color**   | Canvas and header background.                                                | `#000000`      |
| **Text color**         | Header text and timecode label color.                                        | `#ffffff`      |
| **Font family**        | Typeface used for header text and timecode overlays.                         | System default |
| **Timecode font size** | Size of the timecode text in pixels. Toggle **Auto** to scale with the grid. | Auto           |
| **Header font size**   | Size of the header text in pixels. Toggle **Auto** to scale with the grid.   | Auto           |

---

## Custom Grid Templates

By default VidGrid-HTML arranges frames in a uniform columns × rows grid. The
**Custom grid template** checkbox in the Grid section replaces that with a
free-form layout: any number of rows, each with any number of cells.

### How it works

The template editor opens as a modal. Rows stack vertically on screen; within
each row, cells share the full output width equally; there is no manual width
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
  sized based on the non-custom columns/rows options.

### Grid Preview

A compact, numbered preview of your current grid layout appears in the Grid
section at all times. Cells are numbered in reading order — left-to-right
within each row and top-to-bottom across rows — so you can quickly verify
which timestamp will be sampled for each position without generating a grid.
The preview updates live as you adjust columns, rows, or edit a custom
template.

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
- **Keyboard shortcuts**:
  - `Space`: Play/Pause, `M`: Add Marker, `Esc`: Close
  - `Arrow Left`/`Arrow Right`: Seek 1 second. `Ctrl` modifier to go frame by
    frame, `Shift` to go by 5 seconds.
- **Mouse wheel seeking:** scroll over the video player or seekbar to scrub
  through the timeline — same speed as the arrow keys (you can use `Ctrl` and
  `Shift` modifiers; see [Keyboard Shortcuts](#keyboard-shortcuts)).
- **Mobile shortcuts**:
  - Double-tap seekbar: Add marker
  - Long-press marker: Delete marker
- **Live marker list:** click to seek, ✕ to delete individual markers
- **Interactive grid preview:** a numbered schematic of your active grid
  layout appears on the right side. Click any cell to instantly seek the
  video to the corresponding marker — useful for quickly checking each
  frame without scrolling through the marker list.
- **Smart counting:** shows how many markers fit your grid (total cell count
  from the active layout, uniform or custom), extras ignored, shortages use
  auto fallback
- **Reset:** restore evenly-spaced timestamps
- **Save Markers:** apply custom timestamps

### Smart behaviors

- **Auto seeding:** opens with evenly-spaced timestamps as starting point
- **Zero markers = auto:** saving empty list reverts to automatic mode
- **Works with animation:** custom timestamps apply to both static JPEG
  and animated WebP modes
- **Per-file:** each video keeps its own custom markers independently
  (but they are not preserved in presets).

---

## Animated output

When **Animated output** is enabled, VidGrid-HTML generates an animated output
instead of a static JPEG. The output is a short looping video clip
sampled from its timestamp (auto or custom), giving a quick visual overview
of the entire video in motion.

There are two modes for **Animated output**:

- **Animated grid** (default) shows multiple cells simultaneously, each playing
  its own clip from a different timestamp. This uses the grid/custom grid.
- **Sequence mode** (when this switch is enabled) shows one cell at a time,
  playing segments sequentially from start to end of the video — like a fast
  visual summary.

Both modes are affected by the timestamps defined for each file in their
respective [Timestamp Editor](#custom-timestamps).

### Animation settings

The **Animation settings** panel is shown below the main options whenever
**Animated output** is enabled.

Common options:

| Setting           | Description                                                                            | Default |
| ----------------- | -------------------------------------------------------------------------------------- | ------- |
| **Output format** | **WebP** for animated WebP output; **MP4** for MP4 video output                        | WebP    |
| **Duration (s)**  | Length of each cell/segment. The whole animation loops from the start                  | 3 s     |
| **FPS**           | Frame rate of the animated output. Higher values are smoother but produce larger files | 10 fps  |

Available for WEBP output format:

| Setting          | Description                                                                                         | Default |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------- |
| **WebP method**  | Compression effort (0 = fastest, 6 = smallest file). Higher values slow down encoding significantly | 5       |
| **WebP quality** | Output quality (5–100). Lower values produce smaller files with more visible artefacts              | 90      |

Available for Sequence Mode:

| Setting         | Description                                       | Default |
| --------------- | ------------------------------------------------- | ------- |
| **Segments**    | Number of segments to extract from the video      | 6       |
| **Render mode** | Defines the type of animation within the sequence | Video   |

Render modes for Sequence animations:

| Render Mode          | What it does                                             | Audio? |
| -------------------- | -------------------------------------------------------- | ------ |
| **Static**           | Holds one frame per segment for the duration             | No     |
| **Video**            | Plays each segment frame-by-frame via canvas composition | No     |
| **Video with audio** | Cuts and merges video segments with FFmpeg               | Yes    |

#### Requirements and limitations

- **Native browser decoding only:** Animated mode uses the browser's built-in
  `<video>` element to seek frames. Files that require the FFmpeg fallback
  (AVI, WMV, some MKV) are incompatible with animated mode. Disable animated
  mode and regenerate as a static JPEG if you need to cover those formats.
- **MP4 output** uses FFmpeg WASM for encoding and may be slower than WebP.
- **Memory usage** scales with the total frame count (segments × duration × FPS).
  Keep segments and duration reasonable to avoid exhausting browser memory.
- **Large output files:** Animated WebPs are significantly larger than static
  JPEGs or even animated MP4. A 3×4 grid at 3 s / 10 fps will composite 30 PNG
  frames before encoding. Reduce the output width, FPS, duration, or quality
  and increase the WebP method to keep file sizes manageable.
- **Encoding time:** libwebp encoding through FFmpeg WASM is single-threaded.
  High method values (5–6) combined with large frame counts can take many
  seconds, up to a couple minutes on slower devices.
- **Memory:** All composed PNG frames are held in browser memory before being
  handed to FFmpeg. Very high frame counts (long duration × high FPS) can
  exhaust available RAM.

---

## Sequence mode - Video with audio

When you select **Video with audio** as the render mode in Sequence mode,
VidGrid-HTML uses FFmpeg to cut short video segments directly from the source
file and merge them into a single MP4 — **preserving the original audio track**.
This is useful when you want a quick visual summary of a video that also
retains its sound, dialogue, or music.

Limitations:

- Certain codecs or encoding settings for source video simply cannot be cut
  reliably with FFmpeg and will either fail or partially fail. In this case
  using other **Render mode** options might help, but they do not include audio.

### Important notes

- **Disabled options**: Grid size/Custom grid, Cell spacing, Header metadata,
  and Timecode position are not available in this mode because FFmpeg cuts the
  raw video directly; there is no canvas to draw text on.
- **Output is always MP4.** WebP is not available for this mode.
- **Custom timestamps work:** if you've set custom markers in the Timestamp
  Editor, those positions are used as segment start points.

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

- **SBS (Side-by-Side):** the left and right eye views are placed next to each
  other horizontally. Each eye occupies half the frame width. Common in VR 180°
  content.
- **TB (Top-Bottom):** the left and right eye views are stacked vertically.
  Each eye occupies half the frame height. Common in VR 360° content.

### VR Video options

| Option                           | Description                                              |
| -------------------------------- | -------------------------------------------------------- |
| **Disabled**                     | No VR processing. The full frame is used as-is (default) |
| **SBS - Crop Left Eye**          | Crops the left half of a Side-by-Side frame              |
| **SBS - Crop Right Eye**         | Crops the right half of a Side-by-Side frame             |
| **TB - Crop Top (Left Eye)**     | Crops the top half of a Top-Bottom frame                 |
| **TB - Crop Bottom (Right Eye)** | Crops the bottom half of a Top-Bottom frame              |

### Limitations

- **Crop only, no projection correction:** The tool isolates one eye from the
  stereo pair but does not reproject the image (e.g. equirectangular to flat
  perspective). Thumbnails from 180° or 360° content will retain the
  characteristic barrel distortion of those formats.
- **Manual format selection:** VidGrid-HTML does not attempt to auto-detect
  whether a file is VR or which stereo layout it uses. Select the correct mode
  for your content.

---

## Presets

The 🗂️ dropdown at the top of the options panel lets you manage named presets:

- **Select a preset** from the dropdown to instantly apply its settings.
- **`<Default Preset>`** is a permanent, undeletable entry that resets all
  settings to the factory defaults.
- **💾 Save / Add preset:** opens an inline name field pre-filled with the current
  preset name (or blank when `<Default Preset>` is selected). Enter a name and
  confirm to create a new preset or overwrite an existing one with the same name.
- **🗑️ Delete preset:** removes the currently selected preset. Disabled when
  `<Default Preset>` is selected.

Presets are stored in the browser's `localStorage` and persist between sessions.
The last selected preset will also be restored when you return. All settings are
included in saved presets — grid options, style, output modes, animation
settings, VR mode, and any custom grid template. Custom timestamps are per-file
and are not stored in presets.

### Built-in Presets

On first launch, a set of ready-to-use presets is added for
common workflows. These are seeded only on a fresh install and can be
modified, saved under new names, or deleted like any other preset.

---

## Uploading

Once one or more destinations are added and enabled (see [Settings](#settings))
and processing is complete:

- Each task card shows a **☁️ Upload** button. Clicking it uploads that grid
  to all enabled destinations.
- The **☁️ Upload All** button in the tasks header uploads every completed
  grid to all enabled destinations in sequence, with a short delay between
  requests to respect rate limits.
  Upload progress is shown per-destination on each task card. Once complete,
  the card expands a link panel for each destination (see below).

### Copying Links

After a successful upload, each task item shows a collapsible link panel
(one per destination). Expand it with the destination name button to access the
following link formats:

| Format                     | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| **BBCode — full image**    | `[img]...[/img]` tag                                                   |
| **BBCode — medium**        | Medium-size image linking to the viewer page (when provided by host)   |
| **BBCode — thumbnail**     | Thumbnail linking to the viewer page                                   |
| **BBCode — Post Template** | Forum-style BBCode block with title and thumbnail (see Copy All below) |
| **Direct URL**             | Full-resolution image link                                             |
| **Viewer page**            | Host viewer/page URL                                                   |
| **Markdown**               | `![alt](url)`                                                          |
| **HTML img**               | `<img src="..." alt="..." />`                                          |

Each row has an individual **Copy** button. You can also **delete the image**
from the host using the **🗑 Delete** link in the panel header — this opens the
host's delete URL in a new tab.

This also enables more options in the [Task Actions](#tasks-actions) panel to
copy the same formats but for all the completed (and uploaded) tasks.

---

## Settings

A few app-wide settings are available through the **⚙️ Settings** icon in the header:

| Setting                 | Description                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Themes**              | Choose a visual style for the app (Dark, Light, Dimmed, or Classic). The change visually applies immediately to the UI but need to be saved to persist. |
| **Show Previews**       | Toggle visibility of thumbnail previews in the tasks list.                                                                                              |
| **Upload Destinations** | Button that opens a new dialog window to manage the upload destinations for the generated files. See [Upload Destinations](#upload-destinations).       |

These settings are independent of presets; they persist separately and affect only the application's appearance and behavior, not your grid generation options.

### Upload Destinations

VidGrid-HTML can upload completed grids to one or more image hosts compatible
with the Chevereto v1 API (including [ImgBB](https://imgbb.com)) as long as
they have enabled API uploads and provide you with an API key (often under
"Settings" in the hosting website dashboard).

#### CORS restrictions

Some image hosts do not send proper `Access-Control-Allow-Origin` headers on
their upload endpoints, which causes the browser to block the response with a
**CORS (Cross-Origin Resource Sharing)** error. When this happens, the upload
usually fails.

VidGrid-HTML features a **CORS Tunnel** userscript that works around this
limitation. The userscript runs inside your browser's userscript manager
(Tampermonkey, Violentmonkey, or Greasemonkey) and uses the manager's
`GM_xmlhttpRequest` feature, which is exempt from CORS restrictions.

**How it works:**

1. When an upload fails with a CORS error, VidGrid-HTML automatically detects
   the failure and attempts to retry through the tunnel.
2. If the userscript is installed, updated and active, the retried upload succeeds
   transparently — no manual intervention needed.
3. If the userscript is not installed or updated, you'll see an error message
   explaining the issue. A help modal appears on the first occurrence with
   instructions on how to install/update the userscript.

**Installing the userscript:**

1. Install a userscript manager addon/extension for your browser:
   - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)
   - [Violentmonkey](https://violentmonkey.github.io/) (Firefox, Chromium)
   - [Greasemonkey](https://www.greasespot.net/) (Firefox)
2. In VidGrid-HTML, when you encounter a CORS error, click **Download** in the help
   dialog to get the pre-configured `.user.js` file or use the **View Code** button
   and copy the code with the **Copy** button (top-right) in the
   modal window that opens.
3. If you have downloaded the file, open it in your browser, your userscript manager
   will prompt you to install it. If you have copied the code, create a new script
   in your userscript manager, paste the code, save it.
4. The userscript is now installed, refresh the VidGrid-HTML page and retry the upload.

The userscript is scoped to the origin where VidGrid-HTML is running and does
not interfere with other websites.

If you want to choose to ignore this error you can permanently dismiss the CORS help
modal by clicking **Don't show again**. This choice can be changed at any time in the
**Settings** (⚙️ icon top-right), you also can find the **Download** and **View Code**
buttons to install the **CORS Tunnel** at the same place.

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

---

## Keyboard Shortcuts

| Shortcut         | Action                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `Ctrl` + `Enter` | Start processing the current batch from anywhere on the page       |
| `Space`          | Play/pause video (inside the Timestamp Editor)                     |
| `M`              | Add a marker at the current position (inside the Timestamp Editor) |
| `Esc`            | Close the Timestamp Editor modal                                   |
| `←` / `→`        | Seek 1 second (inside the Timestamp Editor)                        |
| `Ctrl` + `←/→`   | Seek frame by frame (inside the Timestamp Editor)                  |
| `Shift` + `←/→`  | Seek 5 seconds (inside the Timestamp Editor)                       |

---

## Troubleshooting

### Corrupt or missing settings

VidGrid-HTML stores presets, destinations and app settings in the browser's
`localStorage`. In rare cases this data can become corrupt — for example after
an abrupt browser shutdown or a failed write. If the app behaves strangely
(presets disappear, settings don't save, options look wrong), try these steps:

1. **Reload the page** — settings are automatically validated on each load,
   and most issues self-repair.
2. **Clear localStorage** — open your browser's developer tools (F12), go to
   Application → Storage → Local Storage, and delete the `vidgrid-settings`
   entry. The app will restart with fresh defaults on the next load.
3. **Clear all site data** — as a last resort, clear all cookies and site data
   for the page in your browser settings.

### FFmpeg generations keep failing

See the [FFmpeg WASM](#ffmpeg-wasm--limitations-and-expectations) section for
detailed guidance on memory limits, codec support, and recovery steps.

---

## FFmpeg WASM — limitations and expectations

When a video cannot be decoded natively by the browser, VidGrid-HTML falls
back to **FFmpeg compiled to WebAssembly**. This is powerful but comes with
real trade-offs:

- **The entire file must be copied into the WASM memory heap:** For very large
  files this can be memory-intensive, though frames are processed
  individually (one at a time) to minimize peak memory usage.
- **Frame extraction is sequential and slow:** Each seek-and-decode operation
  runs single-threaded inside the WASM sandbox. A 12-frame grid from a large
  file can take several minutes.
- **Some codecs are not supported:** The bundled FFmpeg build covers common
  codecs (H.264, H.265/HEVC, VP8/VP9, AV1) but exotic, old, or proprietary
  codecs may fail silently or produce corrupted frames.
- **Out-of-memory errors are unrecoverable:** If the WASM heap runs out, the
  current file is skipped with an error. Reducing output width, columns, or
  rows lowers peak memory usage. Some browsers restrict the heap size
  heavily at first and will allocate more memory if you use it reasonably first,
  so the trick sometimes is to first process a 1x1 grid with success and then
  queue a larger grid.
- **Stalled processing:** In some cases FFmpeg can hang during frame
  extraction. When this happens, a **Kill** button appears in the
  collapsible "FFmpeg Logs" container on the task card. Clicking it
  terminates the current FFmpeg process immediately and moves on to the next
  file in the queue, or ends the batch if the queue is empty.
- **Reload the page:** Sometimes the last resort when your generations are failing
  is to reload the page completely; unfortunately, WASM modules like FFmpeg can fail
  in ways that are not recoverable otherwise, so sorry for the inconvenience.

If you regularly work with formats that require FFmpeg (AVI, WMV, older MKV),
consider re-muxing them to MP4/H.264 beforehand for the best experience.

---

## Browser compatibility

VidGrid-HTML requires a modern browser with WebAssembly support. Chrome 90+,
Firefox 90+, Edge 90+, and Safari 16.4+ are supported.
Also note that certain browsers support more video codecs natively, e.g.
Chrome, and they will have a higher rate of success generating thumbnails.
Animated WebP output requires the browser to support native video seeking, so
the same codec support rules apply.

---

## Development

```bash
npm install
npm run dev              # local dev server
npm run build            # production build → dist/
npm run preview          # preview the production build locally
npm run test             # run the test suite
npm run test:coverage    # generate the test coverage report
```

See [RELEASE.md](./RELEASE.md) for deployment instructions

## Tech stack

- [Vite](https://vitejs.dev/) with TypeScript
- [React JS](https://react.dev/)
- [Zustand/Immer](https://zustand.site/) — state management and middleware
- [Testing Library](https://testing-library.com/)/[vitest](https://vitest.dev/)/[happy-dom](https://github.com/capricorn86/happy-dom) — testing suite
- [TailwindCSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)
- [@formkit/auto-animate](https://github.com/formkit/auto-animate) — smooth layout transitions
- [Lucide](https://lucide.dev/)
- [mediainfo.js](https://mediainfo.js.org/) — container/codec metadata
- [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) — animated WebP
  encoding via libwebp, and frame extraction fallback for natively unsupported formats
- [JSZip](https://github.com/Stuk/jszip) — compressing generated output for download
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — download helper
- [color-picker](https://github.com/markoradak/color-picker)
- HTML5 Canvas API — grid compositing and JPEG/PNG encoding
- HTML5 Video API — native frame seeking for supported formats

## License

See the LICENSE file for details.
