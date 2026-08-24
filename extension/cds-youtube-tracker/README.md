# CDS Journey — Study Video Tracker

Track study minutes on **any HTML5 video** — YouTube, course portals, embedded players, and other platforms. You do **not** need to open videos in the CDS Journey app.

**Version:** 1.6.0 · **Manifest:** MV3 · **Folder:** `extension/cds-youtube-tracker/`

## Install once

1. Chrome/Brave → `chrome://extensions`
2. **Developer mode** ON → **Load unpacked**
3. Select this folder: `extension/cds-youtube-tracker`
4. Approve **site access on all sites** when prompted (needed for course platforms)
5. Click the extension icon → log in with your CDS email/password  
   - Dev API default: `http://127.0.0.1:5001/api` (Express must be running)

## Every study session

1. Open any study video — **YouTube**, Unacademy-style portals, Vimeo embeds, etc.
2. **Hover the video player** so controls (or the tracker pill) appear
3. Click **Track study time** (dark transparent pill on the player)
4. **Drag** the pill if you want (YouTube remembers position; other sites follow the video)
5. Watch normally — **pauses when the video pauses** (ignores playback speed)
6. Click the pill again when finished to stop and sync

Only the video where you clicked **Track** is counted.

### Embedded / iframe players

The tracker runs inside video iframes too. If a course embeds the player in a frame, hover that player and use **Track study time** there.

### What is supported

- Any page with a standard HTML5 `<video>` element (most modern course platforms)
- YouTube (full native integration with their player chrome)

Not supported: DRM-protected streams, players that don't expose a `<video>` tag, or audio-only pages.

## Dashboard

- Minutes save to your CDS account via `POST /api/mission/session/heartbeat`
- Open **CDS Journey** dashboard anytime — **Today** updates from the server (auto-refresh ~20s)
- Extension icon **badge** shows today's total video minutes after sync
- Keeping the app tab open gives instant updates via the bridge script

## Files

| File | Role |
|------|------|
| `popup.js` | Login → store JWT in `chrome.storage.local` (`cdsAuth`) |
| `video-tracker.js` | Overlay UI, drag, play/pause-aware tick, YouTube + generic players |
| `video-tracker-ui.css` | Dark transparent pill styling |
| `background.js` | API heartbeats + notify open app tabs |
| `bridge.js` | Relays ticks to `localhost:5173` when CDS app is open |

## Reload after updates

`chrome://extensions` → **Reload** on this extension → refresh your video tab.

See **`MASTER_PROJECT_CONTEXT.md`** → *YouTube external study tracking* for full architecture.
