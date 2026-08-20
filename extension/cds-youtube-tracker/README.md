# CDS Journey — YouTube Study Tracker

Track study minutes while watching on **youtube.com**. You do **not** need to open videos in the CDS Journey app.

**Version:** 1.3.1 · **Manifest:** MV3 · **Folder:** `extension/cds-youtube-tracker/`

## Install once

1. Chrome/Brave → `chrome://extensions`
2. **Developer mode** ON → **Load unpacked**
3. Select this folder: `extension/cds-youtube-tracker`
4. Click the extension icon → log in with your CDS email/password  
   - Dev API default: `http://127.0.0.1:5001/api` (Express must be running)

## Every study session

1. Open any study video on **youtube.com**
2. **Hover the video player** so YouTube controls appear
3. Click **Track study time** (dark transparent pill on the player — same style as speed overlays)
4. **Drag** the pill anywhere on the player if you want (position is remembered)
5. Watch normally — **pauses when YouTube pauses**
6. Hover controls again → click **Stop** when finished

Only the video where you clicked **Track** is counted. Other YouTube tabs are ignored.

## Dashboard

- Minutes save to your CDS account via `POST /api/mission/session/heartbeat`
- Open **CDS Journey** dashboard anytime — **Today** updates from the server (auto-refresh ~20s)
- Extension icon **badge** shows today’s total video minutes after sync
- Keeping the app tab open gives instant updates via the bridge script

## Files

| File | Role |
|------|------|
| `popup.js` | Login → store JWT in `chrome.storage.local` (`cdsAuth`) |
| `youtube.js` | Overlay UI, drag, play/pause-aware tick, flush heartbeats |
| `youtube-ui.css` | Dark transparent pill styling |
| `background.js` | API heartbeats + notify open app tabs |
| `bridge.js` | Relays ticks to `localhost:5173` when CDS app is open |

## Reload after updates

`chrome://extensions` → **Reload** on this extension → refresh your YouTube tab.

See **`MASTER_PROJECT_CONTEXT.md`** → *YouTube external study tracking* for full architecture.
