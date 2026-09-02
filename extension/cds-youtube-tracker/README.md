# CDS Journey — Study Video Tracker

Wall-clock study stopwatch for **YouTube, coaching portals, DRM/blob players, and any page**. Minutes sync to your CDS Journey dashboard.

**Version:** 1.9.2 · **Manifest:** MV3 · **Folder:** `extension/cds-youtube-tracker/`

## Install once

1. Chrome/Brave → `chrome://extensions`
2. **Developer mode** ON → **Load unpacked**
3. Select this folder: `extension/cds-youtube-tracker` (must contain `manifest.json`)
4. Click the extension icon → log in with your CDS email/password  
   - Dev API default: `http://127.0.0.1:5001/api` (Express must be running)

## Every study session

1. Open any study video — YouTube **or** a course/DRM platform
2. Click **Track study time** on the pill  
   - **YouTube:** dark pill on the player  
   - **Other sites:** floating pill (bottom-right) — drag to move; does **not** alter the player layout
3. Watch normally — timer is a **real stopwatch** (1× wall time even at 2× playback)
4. Pause the video → pill shows **Paused** (when `<video>` is readable)
5. Click the pill again to **stop** and sync

Only the frame where you clicked **Track** owns the stopwatch (prevents double counting).

### DRM / opaque players

If the page has no readable `<video>`, tracking still works in **wall-clock mode** while the tab is visible and tracking is on. Click the pill to stop when finished.

### What is supported

| Platform | Behavior |
|----------|----------|
| YouTube | In-player pill; pause-aware |
| HTML5 / most course players | Floating pill; pause-aware when video is accessible |
| DRM / blob / no `<video>` | Floating pill; wall-clock until you stop |

## Dashboard

- Live time pushes every **~5 seconds** while tracking (`TRACK_PROGRESS` → bridge → dashboard)
- Full minutes save via `POST /api/mission/session/heartbeat`
- **Today** = `max(local, server, liveExtensionStopwatch)` — no double-add
- Keep CDS Journey open (`localhost:5173` / `:5001` / LAN / tunnel) for live UI
- Extension badge shows today’s video minutes after sync

## Files

| File | Role |
|------|------|
| `popup.js` | Login → JWT in `chrome.storage.local` (`cdsAuth`) |
| `video-tracker.js` | Stopwatch, owner-frame lock, YouTube + floating UI |
| `video-tracker-ui.css` | Pill + fixed floating styles |
| `background.js` | Mutex heartbeats + 5s progress push + badge |
| `bridge.js` | Relays progress to the CDS app tab |
| `test-stopwatch.js` | `node test-stopwatch.js` — wall-clock math checks |

## Reload after updates

`chrome://extensions` → **Reload** (confirm version **1.9.2**) → hard-refresh video tab + dashboard.

See **`MASTER_PROJECT_CONTEXT.md`** → *Universal study video tracking* for full architecture.
