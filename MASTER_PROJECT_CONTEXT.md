# MASTER PROJECT CONTEXT — CDS Journey OTA

> **Read this file first** before making any code changes, answering architecture questions, or onboarding to this repository. It is the permanent memory of the project at `d:\1. Projects\CDS JOURNEY OTA`.
>
> **Moving to another PC?** Jump to **[Backup & migration to another PC](#backup--migration-to-another-pc)** — copy source + `server/.env` + MongoDB dump + `LOCAL_MEDIA_ROOT` / `uploads/`.

A shorter companion exists at `PROJECT_CONTEXT.md`; this document is the authoritative, expanded version.

---

# Project Overview

## Purpose

**CDS Journey** (also referenced as **CDSJourney Course Manager**) is a single-admin, full-stack web application for managing and studying **UPSC Combined Defence Services (CDS) / OTA** exam preparation material. It is a personal learning hub for one administrator who curates content from multiple coaching batches, Telegram channels, local uploads, YouTube (dev), and Cloudinary CDN.

The app stores **metadata** in MongoDB (URLs, Telegram message IDs, durations, progress) — not video bytes. Media files live on local disk (`uploads/`), Cloudinary, or are streamed from Telegram.

## Main Features

| Area | Capabilities |
|------|----------------|
| **Course organization** | CDS cycle → coaching batch (Programme) → Subject → Chapter → Content (video/PDF) |
| **Content ingestion** | File upload, URL, YouTube download→Cloudinary (dev), Telegram import (forum/flat channels), Telegram video links (prod) |
| **Telegram** | GramJS login, channel browse, batch import, auto-sync, stream proxy, optional cloudify to Cloudinary |
| **Video playback** | **Plyr** player (`CdsPlyrPlayer`, sky-blue theme), HTML5 local, Cloudinary CDN, Telegram stream, YouTube embed **or localhost CDS Plyr** (yt-dlp cache), screenshot notes, resume position, stall watchdog + retry, Telegram live-connection banner, **timeline scrub previews** when fully cached, PC-library downloaded, or **YouTube playback cache** (disabled on full-course stream page) |
| **PDF / PYQ** | Inline viewer, course PDFs on disk, PYQ on Cloudinary, **AI question extract** (`POST /papers/:id/extract`), optional OCR via `ocrmypdf` on upload |
| **Progress** | Per-content completion, chapter stats, paper attempted tracking, **mark entire subject complete** (bulk toggle-all) |
| **Dashboard** | Lazy course loading — subject stats from `/chapters/stats`; lesson rows fetched only when a subject is opened; library view paginated (`limit=20`); **↑↓ lesson reorder**; mark-as-done on lesson rows; **mark entire subject complete** (bulk progress); **subject total watch time** (sum of video `duration` in subject header + Videos tab) |
| **Full course video** | Per-subject **linked MP4** (manual edit, no auto-stitch); **Link from path** for 20GB+ files; **Play full course** via byte-range stream API; **Locate in Explorer**; no quality loss (direct file stream) |
| **CDS Vocabulary Arena** | Active-practice dashboard; **CDS PYQ (AI)** paper-style MCQs (default practice mode); mixed/MCQ/reverse/typing/context/weak/root/exam drills; deterministic SRS; session analytics; root families; CSV/Excel/OCR/text preview import; idioms + one-word substitution share the same corpus |
| **Telegram Import UX** | Dedicated **`/import/telegram`** page; channel search; curated topic media; lesson plans with clean titles from bot captions; **video thumbnails** in lesson list; thumbnail click → **Play video** or **Preview thumbnail** (lightbox); PDF **View** (new tab) + **Save** (full PC download); import progress with **Cancel**; batch GramJS metadata fetch; PDF filenames from Telegram document name; filename search; full-height lesson workspace |
| **PC Media Storage** | Configure `LOCAL_MEDIA_ROOT`; stream-cache inventory (**videos only**); **Locate / Show in folder** via File Explorer (localhost PowerShell reveal) |
| **Study tracker** | Daily minutes, per-subject targets, watch history, exam countdown, celebration overlays |
| **Daily Mission** (`/mission`) | Auto-generated daily plan: 1 English + 1 Maths + 1 GS video + reading; Sunday mock; AI briefing; discipline score; streaks |
| **Analytics** | Study intelligence (`/history/intelligence`), weekly charts, mock trends, video streak (60 min/day goal) |
| **Local PC library** | Download videos to `{LOCAL_MEDIA_ROOT}/_local_library/` for smooth playback (local server only) |
| **Stream cache** | Auto disk cache while streaming Telegram on localhost (`{LOCAL_MEDIA_ROOT}/_stream_cache/`, `TELEGRAM_STREAM_CACHE=1`, play-first — no blocking on cache miss) |
| **Playback cache** | Server-side Telegram stream cache for smoother seeking (`_playback_cache/`); **YouTube localhost cache** (`{id}_youtube.webm`) for CDS Plyr on URL-only YouTube lessons |
| **YouTube CDS player (localhost)** | URL-only YouTube lessons: one-time **1080p** download via yt-dlp → stream through **`CdsPlyrPlayer`**; requires **`youtube_cookies.txt`** (bot check); falls back to ReactPlayer embed if prepare fails |
| **Cloudinary multi-account** | Per-subject cloud mapping, **`/cloudinary` storage dashboard** (usage, remaining space, console links), automatic asset delete on content/paper removal, PYQ on dedicated cloud |
| **Telegram UX** | Live connection check on video refresh, “Check for updates” with progress overlay, optimized batch update scan (`fetchNewChannelMediaSince`), **curated import** (pick lessons per topic), **duplicate/skip-aware updates** (no false “N new” for intentionally skipped duplicates) |
| **Admin auth** | Single JWT-protected admin (auto-seeded from env) |

## Target Users

- **Primary:** One administrator / CDS aspirant who owns and curates all content.
- **Implicit:** No multi-user roles, no student accounts — the `Admin` model is the only user type. All protected routes assume this single admin.

---

# Tech Stack

## Frontend (`client/`)

| Layer | Technology |
|-------|------------|
| Framework | React 19 + Vite 7 (SPA, ESM) |
| Styling | TailwindCSS 4 via `@tailwindcss/vite` (design tokens in `src/index.css`) |
| Routing | React Router v7 (`BrowserRouter` in `main.jsx`) |
| HTTP | Axios (`src/api/client.js`) |
| UI libs | react-hot-toast, react-icons (Feather `Fi*`), clsx, date-fns |
| Media | **Plyr** (`plyr` npm), react-pdf, react-player (installed; PDF uses `<iframe>`; video uses `CdsPlyrPlayer`) |
| Export | jspdf (screenshot notes export) |
| Auth client | jwt-decode (available), JWT in `localStorage` key `cds_token` |

## Backend (`server/`)

| Layer | Technology |
|-------|------------|
| Runtime | Node.js, ESM (`"type": "module"`) |
| Framework | Express 5 |
| Database | MongoDB + Mongoose 9 |
| Auth | JWT (`jsonwebtoken`) + bcryptjs |
| Uploads | Multer 2 (disk storage, 5 GB/file limit) |
| CDN | Cloudinary v2 (multi-account registry) |
| Telegram | GramJS (`telegram` npm package) |
| Google | googleapis — YouTube OAuth + **direct upload** (`uploadDestination: "youtube"` when OAuth connected) |
| AI | OpenAI Node SDK — paper extract/analysis, **video AI overview + Ask**, daily mission briefing, **CDS Vocabulary PYQ MCQ generation** (`vocabularyCdsPyqService`) |
| PDF | pdf-parse, optional ocrmypdf CLI |
| OCR | tesseract.js (vocab image import), `eng.traineddata` at `server/eng.traineddata` |
| Spreadsheet | xlsx (vocab import) |
| Security | helmet, cors, express-validator |
| Logging | morgan |
| Testing | Node.js built-in test runner — `npm test` in `server/` (auth, Cloudinary cleanup, mission scoring, Telegram helpers + **telegramMedia**, **telegramImportFilters**, **contentSort**, **vocabularyQuestions**, **vocabularyCdsPyq**); GitHub Actions CI |

## Database

- **MongoDB** database name from `MONGO_URI` (default pattern: `cdsjourney-course-manager`)
- **18 Mongoose models** — see Database section

## Deployment Targets

| Component | Platform |
|-----------|----------|
| Frontend | Vercel (`vercel.json` — builds `client/dist`, SPA rewrites) |
| Backend | Self-hosted (local, PM2, Render, etc.) — **not** in Vercel config |
| Tunnel | Cloudflare Tunnel via PM2 (`ecosystem.config.cjs`) or `npm run tunnel:*` scripts |
| Combined | `npm run start:home` builds client and serves `client/dist` from Express when `SERVE_CLIENT` allows |

---

# Folder Structure

```
d:\1. Projects\CDS JOURNEY OTA\
├── MASTER_PROJECT_CONTEXT.md     # THIS FILE — read before any code change
├── PROJECT_CONTEXT.md            # Shorter AI context (subset of this doc)
├── README.md                     # User-facing readme (partially stale)
├── SETUP_YOUTUBE.md              # YouTube OAuth + direct upload via ContentModal
├── vercel.json                   # Vercel: build client, output client/dist
│
├── client/                       # React frontend
│   ├── package.json
│   ├── vite.config.js            # Dev proxy: /api, /uploads → localhost:5001
│   ├── vercel.json               # Client-specific Vercel config
│   ├── index.html
│   ├── public/                   # favicon.svg, vite.svg
│   ├── dist/                     # Production build output (committed or generated)
│   └── src/
│       ├── main.jsx              # Providers: Theme → Auth → Study; Toaster; Router
│       ├── App.jsx               # Route definitions + celebrations
│       ├── App.css / index.css   # Global styles + Tailwind tokens
│       ├── api/client.js         # Axios instance + JWT interceptor
│       ├── config/courses.js     # CDS cycle UI config, exam dates
│       ├── constants/streak.js   # VIDEO_STREAK_GOAL_MINUTES = 60
│       ├── context/              # AuthContext, StudyContext, ThemeContext
│       ├── hooks/                # useDashboardCourseContents, useTelegramPlaybackStatus, useWorkspaceCapabilities
│       ├── components/           # Reusable UI (Layout, CdsPlyrPlayer, SubjectPlayAllPremium, SubjectLessonAccordion, …)
│       ├── pages/                # Route-level pages (incl. SubjectFullVideoPage, CloudinaryStoragePage, LocalMediaStoragePage)
│       ├── config/navItems.js    # Sidebar nav (incl. PC Media Storage — localOnly)
│       ├── styles/               # plyr-overrides.css (sky-blue Plyr theme), telegram-import.css
│       └── utils/                # media.js, contentSort.js, subjectFullCourse.js, telegramLessonPlan.js, videoScreenshot.js, timelineScrubPreview.js, …
│
├── server/                       # Express backend (MVC)
│   ├── package.json
│   ├── ecosystem.config.cjs      # PM2: cds-api + cloudflare-tunnel
│   ├── eng.traineddata           # Tesseract English model
│   ├── cloudflare/               # Tunnel config example + PowerShell scripts
│   ├── scripts/
│   │   └── purgeAllMedia.js      # Wipe media (local + Cloudinary + DB records)
│   └── tests/                    # Unit tests (node --test tests/**/*.test.js)
│   └── src/
│       ├── server.js             # Bootstrap, migrations, Telegram auto-sync
│       ├── app.js                # Express app, route mounts, static /uploads, optional SPA
│       ├── config/               # db, cors, cloudinary, cdsCourses
│       ├── controllers/          # Request handlers
│       ├── middlewares/          # auth, streamAuth, upload, error
│       ├── models/               # Mongoose schemas
│       ├── routes/               # Express routers
│       ├── services/             # Business logic (Telegram, Cloudinary, mission, cleanup, etc.)
│       └── utils/                # Helpers (content, contentSort, telegramImportFilters, telegramMediaMeta, telegramFlatChannel, pickVideoFileDialog, chapters, cloudinaryAsset, slugify, buckets)
│
└── uploads/                      # Default local media root (override with LOCAL_MEDIA_ROOT env)
    ├── _tmp_videos/              # Multer scratch before YouTube→Cloudinary or delete
    ├── _tmp_papers/              # Multer scratch before PYQ→Cloudinary
    ├── _local_library/           # PC library downloads (meta.json + video files)
    ├── _merged_subjects/         # Full-course link meta ({subjectId}.meta.json); linked MP4 may live anywhere under LOCAL_MEDIA_ROOT
    ├── _stream_cache/            # Auto Telegram stream cache while watching (localhost)
    ├── _playback_cache/          # Manual/on-demand Telegram playback cache files
    ├── CDS 2 2026/               # Default active cycle folder
    │   └── <BatchSlug>/subjects/<Subject>/pdfs/<file>.pdf
    └── papers/PYQ/<year>/        # Legacy on-disk PYQ (boot migration only)
```

### Important single files

| File | Role |
|------|------|
| `client/src/utils/contentSort.js` | **`sortSubjectContents()`** — shared lesson order (dashboard, Play all, player playlist); uses `importSortOrder` then `telegramMessageId` |
| `client/src/utils/timelineScrubPreview.js` | YouTube-style hover thumbnails on progress bar when video is fully stream-cached, PC-library downloaded, or **YouTube playback cache** active |
| `client/src/components/SubjectPlayAllPremium.jsx` | Subject banner — **Link from path**, Replace (≤8 GB), Locate, Play full course, mark subject complete |
| `client/src/pages/SubjectFullVideoPage.jsx` | Full-subject single-file player (`/subject/:subjectId/full-video`) — streams linked MP4 via API |
| `client/src/api/client.js` | Axios + **`getStreamBackendBaseUrl()`** — full-course `<video>` must hit Express, not Vite :5173 |
| `client/src/utils/subjectFullCourse.js` | `getFullCourseStreamUrl()` (always backend stream API), link/replace/status helpers |
| `server/src/controllers/subjectDownloadController.js` | Full-course status, stream, link-local, replace, reveal handlers |
| `server/src/services/subjectFullCourseService.js` | Link meta (`linkedSourcePath`), reveal in Explorer, stream path resolution — **no ffmpeg merge** |
| `server/src/middlewares/mediaStaticMiddleware.js` | Subdir handlers + **`createLocalMediaRootStaticHandler`** (files at CDS UPLOAD root, e.g. `Complete Indian Geography.mp4`) |
| `server/src/utils/streamLocalFile.js` | HTTP Range streaming incl. **suffix ranges** (`bytes=-N`) for huge MP4 metadata |
| `client/src/components/SubjectLessonAccordion.jsx` | Subject lesson list — Videos/PDFs tabs, mark done, rename, delete, **↑↓ reorder** |
| `client/src/pages/LocalMediaStoragePage.jsx` | `/settings/pc-media` — LOCAL_MEDIA_ROOT path, disk usage for library/stream/playback caches |
| `server/src/utils/contentSort.js` | Server mirror of client sort (reorder API) |
| `server/src/utils/telegramImportFilters.js` | Duplicate title detection, user-skipped Telegram message IDs, update-count filtering |
| `server/src/config/mediaStorage.js` | `LOCAL_MEDIA_ROOT`, paths for `_local_library`, `_merged_subjects`, `_stream_cache`, `_playback_cache`, **`getYoutubeCookiesPath()`** |
| `server/src/services/youtubePlaybackCacheService.js` | Localhost YouTube → CDS Plyr: cache to `_playback_cache/{contentId}_youtube.*`, quality version gate, prepare/status/stream |
| `server/src/services/youtubeDownloadService.js` | yt-dlp wrapper — **`qualityProfile: max|upload`**, Node JS runtime (`--js-runtimes node`), cookies file, post-download **ffprobe** ≥720p validation |
| `client/src/utils/youtubePlaybackApi.js` | Poll `GET/POST /contents/:id/youtube-playback` for prepare status |
| `client/src/utils/youtubeCookiesApi.js` | Upload **`youtube_cookies.txt`** via `POST /settings/youtube-cookies` |
| `client/src/utils/media.js` | **`resolveContentSrc()`**, `buildTelegramPreviewStreamUrl()`, **`buildYoutubePlaybackStreamUrl()`**, **`buildTelegramThumbnailUrl()`**, **`formatTotalStudyDuration()`**, **`sumVideoDurationSeconds()`**, **`downloadTelegramMediaToPc()`** — canonical playback/download/thumbnail URLs |
| `client/src/utils/telegramLessonPlan.js` | Telegram import lesson titles, selection plans, caption parsing, `buildSelectedItemsFromPlans()` |
| `client/src/styles/telegram-import.css` | Telegram import page — subject chips, lesson cards, thumbnails, thumb menu/lightbox |
| `client/src/utils/videoScreenshot.js` | Frame capture for Plyr; `applyVideoCrossOrigin`, `applyVideoSource`, `resolvePlyrVideoElement` |
| `client/src/components/CdsPlyrPlayer.jsx` | Plyr wrapper — sky-blue theme, imperative `<video>` (avoids React StrictMode DOM conflicts); stall watchdog; scrub preview attach |
| `client/src/components/FullCoursePlaybackPanel.jsx` | Full-course link/status UI panel (subject banner flow) |
| `server/src/utils/telegramMediaMeta.js` | Classify Telegram documents as video/PDF (mime, extension, video attribute; GramJS has no `MessageMediaVideo` type) |
| `server/src/utils/pickVideoFileDialog.js` | Localhost Windows file picker for linking full-course MP4 by path |
| `client/src/utils/vocabularyArena.js` | Practice mode catalog — **`cds_pyq` first**; timed duration helpers |
| `client/src/components/vocabulary/CdsPyqBody.jsx` | Paper-style stems: underlined sentences, match lists, confusable word sets |
| `server/src/services/vocabularyCdsPyqService.js` | OpenAI CDS English PYQ MCQ generator + deterministic fallback (7 formats) |
| `server/src/utils/revealInFileManager.js` | Localhost **Locate** — PowerShell `Start-Process explorer.exe` for spaced paths |
| `client/src/hooks/useDashboardCourseContents.js` | Lazy per-subject course content + `subjectStats` from chapter stats |
| `client/src/hooks/useTelegramPlaybackStatus.js` | Telegram session polling for stream playback |
| `client/src/hooks/useWorkspaceCapabilities.js` | Feature flags from `GET /workspace/capabilities` |
| `client/src/pages/CloudinaryStoragePage.jsx` | `/cloudinary` — storage usage, remaining space, console links |
| `server/src/utils/cloudinaryAsset.js` | Parse `publicId` from Cloudinary URLs for legacy rows; resolve cloud type by cloud name |
| `server/src/services/cloudinaryUsageService.js` | Admin API usage fetch, 60s cache, Free-plan 25 GB limit fallback, console URLs |
| `server/src/services/paperCleanupService.js` | Cloudinary + local cleanup for PYQ delete/replace |
| `server/src/utils/contentHelpers.js` | MIME/URL detection, Telegram link helper, filename parser |
| `server/src/utils/subjectBuckets.js` | Mission slot classification (english/maths/gs) |
| `server/src/config/cdsCourses.js` | Cycle id ↔ disk folder name |
| `server/src/services/uploadProgressBus.js` | In-memory upload job state (UUID `uploadId`); Telegram import/update progress; **active jobs TTL 60 min**, terminal 10 min |
| `server/src/services/contentCleanupService.js` | Unified delete: Cloudinary (incl. thumbnails + URL fallback) + local files |
| `server/src/services/telegramService.js` | GramJS client, **`fetchTelegramThumbnail()`**, **`resolveTelegramImportMessageMetas()`**, **`checkTelegramConnectionLive()`**, stream, **`fetchNewChannelMediaSince()`** |

---

# Architecture

## Pattern

Classic **MVC monorepo**:

```
React SPA (client)
    │  HTTP /api/*  (Authorization: Bearer JWT)
    │  Stream: ?token= for <video> elements
    ▼
Express (server/src/app.js)
    ├── Routes → Controllers → Services → Models
    ├── Middlewares (auth, upload, errors)
    └── Static: /uploads/*, optional client/dist SPA fallback
    ▼
MongoDB
```

## Provider tree (frontend)

```
BrowserRouter
  └── ThemeProvider (cds_theme in localStorage)
        └── AuthProvider (cds_token, /auth/me bootstrap)
              └── StudyProvider (study targets, watch history, streaks)
                    └── App (routes)
```

## Layout shell

`Layout.jsx` wraps most pages with `Sidebar` + `Topbar` + `MobileNav` drawer. Login page is standalone.

## Media strategy (critical)

Behavior depends on **server `NODE_ENV`** AND **browser hostname** (`isLocalFrontend()`):

| Context | Lesson videos | Course PDFs | PYQ PDFs |
|---------|---------------|-------------|----------|
| **Local dev** (`localhost` + `NODE_ENV !== "production"`) | Upload → `/uploads` (`videoSourceType: "local"`), YouTube download → compress → Cloudinary, Telegram link/stream | Local disk under subject `pdfs/` | Upload → OCR check → Cloudinary |
| **Production** (`NODE_ENV === "production"`) | Telegram links only OR GramJS stream OR Cloudinary after import | PDF upload/URL still allowed | Cloudinary |

- `isProductionMediaMode()` = `process.env.NODE_ENV === "production"` (server)
- `isLocalFrontend()` = hostname `localhost` or `127.0.0.1` (client)
- **Both** matter for expected UI in `ContentModal.jsx`

## Boot sequence (`server/src/server.js`)

1. `reloadCloudRegistry()` — load Cloudinary accounts from env
2. Connect MongoDB
3. Drop legacy `Subject.name_1` index; backfill `courseId` → `cds-2-2026`
4. `migrateProgrammesAndSubjects()` — ensure default **Main** batch per CDS cycle
5. Drop legacy `Vocabulary` `{userId, word}` index; `syncIndexes()`
6. `ensureDefaultAdmin()` from env credentials
7. `cleanupBrokenYoutubeTempFiles()`
8. `organizeContentUploadsBySubject()` — legacy file layout migration
9. `organizePaperUploadsByYear()` — legacy PYQ folder migration
10. Deactivate legacy Telegram sessions without `deploymentKey`
11. Listen on `HOST:PORT`
12. If `TELEGRAM_AUTO_SYNC !== "false"`: prune orphaned sync topics, repair Telegram links, `startTelegramAutoSync()`

---

# Data Flow

## Typical CRUD flow

```
User action (React page/modal)
  → api.post/get/put/delete (Axios + JWT header)
  → Express route (protect middleware)
  → Controller (validation, orchestration)
  → Service (optional — complex logic)
  → Mongoose model → MongoDB
  → JSON response → React state update → UI re-render
```

## Content upload flow (video, dev — local file)

```
ContentModal → FormData with file + subjectId + sourceType=upload
  → POST /api/contents (Multer → uploads/_tmp_videos/ or subject path)
  → contentController.createContent
  → Content document: sourceType=upload, videoSourceType=local, filePath=/uploads/...
  → Served statically at GET /uploads/...
  → VideoPlayerPage: resolveContentSrc() → /uploads/... (Vite proxies in dev)
```

## Content upload flow (YouTube download, dev only)

```
ContentModal sourceType=youtube_download + YouTube URL
  → initProgress(uploadId) — client polls GET /contents/upload-progress/:uploadId
  → yt-dlp download → _tmp_videos/
  → ffmpeg compress (prepareVideoForCloud) if over thresholds
  → uploadVideoToCloudinary (subject's mapped cloud account)
  → Content: sourceType=cloudinary, videoUrl, publicId, cloudType
  → Temp files deleted
```

## Telegram import flow

```
TelegramImportPage: phone → OTP → optional 2FA
  → POST /api/telegram/login, /verify-otp, /verify-password
  → Session stored in TelegramSession (stringSession + deploymentKey)
  → User maps channel → programme, selects forum topics or flat subject keys
  → POST /api/telegram/import-batch
  → telegramMappingService / telegramFlatChannelService
  → Creates/updates Subject, Chapter, Content
  → If TELEGRAM_VIDEO_CLOUDIFY=1: GramJS download → compress → Cloudinary
     Else: sourceType=telegram with telegramMessageId for stream playback
  → **Curated import:** client sends `selectedItems[]`; unselected topic media → `Subject.telegramSkippedMessageIds`
  → **Metadata batch:** `resolveTelegramImportMessageMetas()` — one GramJS lock, batched message IDs (avoids N×500-message topic scans)
  → **Progress:** client polls `GET /contents/upload-progress/:uploadId` (no-cache headers + cache-bust query); optional **Cancel** → `POST /telegram/progress/:uploadId/cancel`
  → **Update check:** `getProgrammeSubjectUpdates()` filters skipped IDs + duplicate titles (same lesson uploaded twice)
  → Background syncAllAutoChannels() every TELEGRAM_SYNC_INTERVAL_MS
```

## Lesson reorder flow

```
SubjectLessonAccordion ↑/↓ button
  → PATCH /api/contents/reorder { subjectId, contentId, direction }
  → contentController.reorderContent — sort siblings via sortSubjectContents(), swap, bulkWrite importSortOrder 0..n
  → Dashboard refetches subject contents; order applies to Play all + video player playlist
```

## Progress toggle flow

```
ContentCard "Mark complete" → POST /api/progress/toggle/:contentId
  → progressController.toggleCompleted
  → Progress upsert { userId, contentId, chapterId, completed }
  → Dashboard refetches chapter stats via GET /api/chapters/stats
```

## Subject bulk-complete flow

```
SubjectPlayAllPremium "Mark entire subject complete"
  → POST /api/progress/subject/:subjectId/toggle-all
  → progressController.toggleSubjectCompleted — marks all Content in subject (or clears all if already 100%)
  → Dashboard patches local course contents + chapter stats
```

## Full course video flow (linked MP4 — no merge)

```
User links edited full-subject MP4:
  Option A — Link from path (recommended for 20GB+): paste Windows path
    → POST /api/subjects/:id/merged-video/link-local { filePath }
    → subjectFullCourseService.linkSubjectFullCourseFromPath
    → Writes {subjectId}.meta.json with linkedSourcePath (no copy unless Replace upload)
  Option B — Replace full course (browser upload, max ~8 GB Multer limit)
    → POST /api/subjects/:id/merged-video/replace (multipart)
    → Saves to {LOCAL_MEDIA_ROOT}/_merged_subjects/{subjectId}_full_course.mp4

Play full course:
  SubjectPlayAllPremium → navigate /subject/:subjectId/full-video
  → GET /api/subjects/:id/merged-video (status: ready, sizeBytes, originalFileName)
  → getFullCourseStreamUrl(subjectId) → http://127.0.0.1:5001/api/subjects/:id/merged-video/stream?token=
     (MUST hit backend directly — NOT Vite :5173; NOT broken /uploads/ path for root-level CDS UPLOAD files)
  → protectStream + streamLocalFile with HTTP Range (incl. suffix ranges for moov on huge files)
  → CdsPlyrPlayer crossOriginMode=none, preload=metadata, scrub preview off

Locate:
  → POST /api/subjects/:id/merged-video/reveal → revealInFileManager(linkedSourcePath)
```

**Removed (2026-08-10):** ffmpeg chapter stitch/merge, virtual multi-chapter playlist player, "Download full video" build button — too slow; user supplies one edited MP4 instead.

## Mission daily flow

```
MissionPage mount → GET /api/mission/today
  → missionGenerationService.getOrCreateTodayMission (auto-picks videos by bucket scoring)
  → aiBriefingService.getOrCreateAiBriefing (OpenAI or rule-based fallback)
  → User completes item → POST /api/mission/items/complete
  → Video exit → POST /api/mission/session/log (duration, contentId)
  → streakService updates video streak from StudySession aggregates
```

## Screenshot notes (client-only)

```
VideoPlayerPage → CdsPlyrPlayer screenshot button (or S key)
  → videoScreenshot.captureVideoFrameDataUrl (crossOrigin only when cross-origin)
  → screenshotNotes.js → IndexedDB cds_screenshot_notes_db
  → ScreenshotViewerPage reads same store (never hits server)
```

## Video playback flow (Telegram stream)

```
VideoPlayerPage loads content → resolveContentSrc() → /api/telegram/stream/:messageId?channelId=&token=
  → GET /api/telegram/session on mount + window focus + visibilitychange (TelegramConnectionStatus banner)
  → CdsPlyrPlayer (ready=false until Telegram live OR PC library cache)
  → applyVideoSource() after imperative video mount (fixes refresh race / infinite buffer)
  → Stall watchdog: 18s timeout, max 2 auto-retries, then Retry playback UI
  → protectStream middleware validates JWT from ?token=
  → telegramService.streamTelegramMediaDirect (byte-range)
```

## Video playback flow (YouTube URL → CDS Plyr, localhost only)

```
VideoPlayerPage detects isYouTubeUrl(resolveContentSrc(item))
  → isLocalFrontend(): prepare via GET/POST /api/contents/:id/youtube-playback
  → youtubePlaybackCacheService.ensureYoutubePlaybackCache()
       → youtubeDownloadService (yt-dlp qualityProfile=max, cookies, Node JS runtime)
       → saves {LOCAL_MEDIA_ROOT}/_playback_cache/{contentId}_youtube.webm (1080p AV1, stream-copy)
       → rejects download if ffprobe height < 720p (qualityVersion gate)
  → stream: GET /api/contents/:id/youtube-playback/stream?token= (protectStream)
  → CdsPlyrPlayer with scrubPreviewEnabled=true
  → On bot/cookies failure: upload panel for youtube_cookies.txt (POST /api/settings/youtube-cookies)
  → Fallback: ReactPlayer YouTube embed (same quality as YouTube.com, no CDS controls)
```

**Requirements (dev PC):** `pip install "yt-dlp[default]"`, **ffmpeg**, **`{LOCAL_MEDIA_ROOT}/youtube_cookies.txt`** (export while logged into YouTube — extension *Get cookies.txt LOCALLY*). Optional env: `YT_DLP_COOKIES_FILE`, `YT_DLP_JS_RUNTIMES`, `YT_DLP_COOKIES_FROM_BROWSER`.

## Cloudinary storage dashboard flow

```
CloudinaryStoragePage → GET /api/cloud-mappings/usage (?refresh=1 bypasses 60s cache)
  → cloudinaryUsageService.fetchAllCloudinaryUsage()
  → Per cloud: storage used, limit (API or Free-plan 25 GB fallback), remaining, %, console URLs
  → Auto-refresh every 60s (silent background poll)
```

## Content / paper delete → Cloudinary cleanup

```
DELETE /api/contents/:id or /api/papers/:id
  → destroyContentAssets / destroyPaperAssets
  → resolveCloudinaryAssetRefs() — uses publicId+cloudType OR parses delivery URL
  → destroyCloudinaryAsset() with one retry; thumbnails (image) deleted separately
  → Local upload file removed from uploads/
  → DB row deleted
```

---

# Database

All schemas use `{ timestamps: true }` unless noted. Relationships are via ObjectId refs.

## Entity hierarchy

```
Admin (single user)
Programme (coaching batch, per cdsCycleId)
  └── Subject (unique name per programme)
        └── Chapter (unique chapterName per subject)
              └── Content (video | pdf)
Progress (userId + contentId) — completion
SubjectCloudMapping (subjectId → cloudType)
TelegramChannelMapping (channelId + programmeId — sync config)
```

## Model reference

### Admin (`Admin.js`)
- `email` (unique), `password` (bcrypt hash), `name`
- Seeded once from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if no row exists

### Programme (`Programme.js`)
- `name`, `folderSlug` (disk segment), `cdsCycleId`, `description`
- Unique index: `{ cdsCycleId, folderSlug }`

### Subject (`Subject.js`)
- `name`, `programmeId`, `description`
- Telegram: `telegramTopicId`, `telegramSubjectKey`, `telegramChannelId`
- Import prefs: `telegramImportVideos`, `telegramImportPdfs` (default true)
- **`telegramSkippedMessageIds[]`** — Telegram message IDs intentionally skipped during curated import (never re-offered as updates)
- Unique: `{ name, programmeId }`

### Chapter (`Chapter.js`)
- `subjectId`, `chapterName`
- Unique: `{ subjectId, chapterName }`
- Listed with numeric collation (`Chapter 2` before `Chapter 10`)

### Content (`Content.js`)
- `subjectId`, `chapterId`, `title`
- `type`: `video` | `pdf`
- `sourceType`: `upload` | `url` | `cloudinary` | `telegram`
- Video fields: `filePath`, `videoUrl`, `videoSourceType` (`local`|`telegram`), `publicId`, `cloudType`, `duration`, `thumbnail`
- Telegram metadata: `telegramSource`, `telegramChannelId`, `telegramMessageId`, `telegramFileName`, `telegramMimeType`, `telegramFileSize`, `telegramTopicId`
- **`importSortOrder`** — manual lesson order (dashboard ↑↓ reorder, Play all, video player playlist); falls back to `telegramMessageId` when null
- `uploadedAt`, `url`

### SubjectCloudMapping (`SubjectCloudMapping.js`)
- `subjectId` (unique), `cloudType` (e.g. `cloud1`)

### Progress (`Progress.js`)
- `userId`, `contentId`, `chapterId`, `completed`
- Unique: `{ userId, contentId }`

### Paper (`Paper.js`)
- `year`, `title`, `examType`, `description`
- `sourceType`: `upload` | `url` | `cloudinary`
- `filePath`, `url` (legacy), `pdfUrl`, `publicId`, `cloudType`
- `durationMinutes`, `totalQuestions`

### PaperProgress (`PaperProgress.js`)
- `userId`, `paperId`, `attempted`, `attemptedAt`
- Unique: `{ userId, paperId }`

### PaperAnalysis (`PaperAnalysis.js`)
- `paperId` (unique), `status` (`pending`|`processing`|`completed`|`failed`)
- `questions[]`: `{ number, text, options[] }`
- `questionImages[]`, `errorMessage`
- **Wired:** `GET /api/papers/:id/analysis`, `POST /api/papers/:id/extract`

### PaperChapterDetail (`PaperChapterDetail.js`)
- `paperId`, `subjectName`, `chapterName`
- `topics[]`, `questions[]` (AI detail), `noQuestions`, `typicalTopics`, `examIdentifier`
- Unique: `{ paperId, subjectName, chapterName }`
- **Service exists; HTTP routes not wired**

### Vocabulary (`Vocabulary.js`)
- Core: `userId`, `type` (`vocabulary`|`idiom`|`one_word`), `word`, `meaning`, `example`, `synonyms[]`, `antonyms[]`, `relatedWords[]`, `tags[]`
- CDS enrichment: `rootWord`, `rootMeaning`, `partOfSpeech`, `mnemonic`, `examTag`, `difficulty`, `clozeSentence`, `source`, `origin`, `frequencyHint`
- Organization: `archived`, `favorite`
- SRS: `level`, `easeFactor`, `intervalDays`, `reviewCount`, `correctCount`, `wrongCount`, `confidence`, `lastReviewedAt`, `lastWrongAt`, `masteredAt`, `nextReviewAt`, `updatedByMode`, `lastPracticeMode`
- Unique: `{ userId, type, word }`

### VocabularyReviewLog (`VocabularyReviewLog.js`)
- One row per answer/review: `userId`, `vocabularyId`, optional `sessionId`, `mode`, `questionType`, `result`, `correct`, `responseTimeMs`, `selectedAnswer`
- Powers accuracy trends, mode performance, category strength and daily vocabulary streak

### VocabularyPracticeSession (`VocabularyPracticeSession.js`)
- Persistent drill: `userId`, `mode` (includes **`cds_pyq`**), `type`, timing/exam flags, private question snapshots, answers, counters, weak words and SRS update count
- Answer `vocabularyId` is **optional** (AI PYQ items may invent confusable pairs not in the bank; SRS applies only when a linked word exists)
- Status: `active` | `completed` | `abandoned`; supports reload/resume and server-authoritative answer validation

### DailyMission (`DailyMission.js`)
- `userId`, `date` (YYYY-MM-DD string), `missionType` (`daily`|`sunday_mock`), `status`
- `items[]`: slots `english`|`maths`|`gs`|`reading`|`mock_test`|`custom` + contentId, paperId, completion, reason
- `progressPercent`, `disciplineScore`, `studyStartedAt`, `generationMeta`
- Unique: `{ userId, date }`

### ReadingSession (`ReadingSession.js`)
- `userId`, `date`, `targetMinutes`, `actualMinutes`
- `status`: `idle`|`running`|`paused`|`completed`
- Timer: `startedAt`, `pausedAt`, `accumulatedSeconds`, `completedAt`
- Unique: `{ userId, date }`

### StudySession (`StudySession.js`)
- `userId`, `date`, `type` (`video`|`reading`|`mock`|`mission`|`vocabulary`)
- `contentId`, `paperId`, `missionId`, `subjectId`, `subjectName`, `slot`
- `durationMinutes`, `startedAt`, `endedAt`, `meta`

### MockTestResult (`MockTestResult.js`)
- `userId`, `paperId`, `missionId`, `date`, `title`
- `score`, `totalQuestions`, `attemptedQuestions`, `correctAnswers`, `accuracyPercent`, `timeTakenMinutes`, `weakSubjects[]`

### StudyAnalytics (`StudyAnalytics.js`)
- `userId`, `period` (`daily`|`weekly`|`monthly`), `periodKey`
- Aggregated metrics + `data` (mixed JSON cache)
- Unique: `{ userId, period, periodKey }`

### OAuthCredentials (`OAuthCredentials.js`)
- `provider` (unique, e.g. `youtube`), `refreshToken`, `accessToken`, `expiryDate`
- `accountEmail`, `accountChannelId`, `accountChannelTitle`

### TelegramSession (`TelegramSession.js`)
- `stringSession`, `phone`, `isActive`, `deploymentKey` (isolates local vs Render)

### TelegramChannelMapping (`TelegramChannelMapping.js`)
- `channelId`, `channelTitle`, `programmeId`, `autoSync`
- `syncTopicIds[]`, `syncSubjectKeys[]`, `channelMode` (`forum`|`flat`)
- `blockedTopicIds[]`, `blockedSubjectKeys[]` (user-deleted — never auto-recreated)
- `lastSyncedMessageId`, `lastSyncedAt`, `totalImported`
- Unique: `{ channelId, programmeId }`

---

# API Documentation

Base URL: `/api` via Vite proxy in dev (→ `http://127.0.0.1:5001`), or `VITE_API_URL` / same-origin `/api` in prod.

**Note:** `server.js` defaults `PORT` to **5000**; this repo's `vite.config.js` proxies to **5001** — set `PORT=5001` in `server/.env` so dev proxy and `getStreamBackendBaseUrl()` stay aligned.

**Auth:** Unless noted, routes require `Authorization: Bearer <JWT>`.

**Stream auth:** `protectStream` accepts Bearer header OR `?token=<JWT>` (for `<video src>`).

## Health & Public

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | No | `{ status: "ok" }` |
| GET | `/api/workspace/public-stats` | No | Exam countdown, video/pdf counts for login page |

## Auth (`/api/auth`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/login` | No | Admin login → `{ token, admin }` |
| GET | `/me` | Yes | Current admin profile |
| GET | `/youtube/status` | Yes | YouTube OAuth connection status |
| GET | `/youtube/connect` | Yes | Returns Google consent URL |
| GET | `/youtube/callback` | No | Google OAuth redirect handler |
| DELETE | `/youtube` | Yes | Disconnect YouTube OAuth |

## Programmes (`/api/programmes`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List batches; query `cdsCycleId` |
| POST | `/` | Create coaching batch |
| PUT | `/:id` | Update name/description |
| DELETE | `/:id` | Delete batch; `cascade=true` deletes all subjects/content |
| POST | `/:id/clear-course` | Clear all subjects/chapters/content under batch |

## Subjects (`/api/subjects`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List subjects; query `programmeId` |
| POST | `/` | Create subject |
| PUT | `/:id` | Update subject |
| DELETE | `/:id` | Cascade delete with asset cleanup |
| GET | `/:id/download-pack` | JSON manifest of downloadable videos for subject |
| GET | `/:id/local-library` | PC library status for subject (local server only) |
| GET | `/:id/local-library/cached` | Cached content IDs in local library |
| POST | `/:id/local-library` | Start bulk download to PC library |
| GET | `/:id/merged-video` | Full-course link status (`ready`, `linkedSourcePath` meta, `sizeBytes`, `originalFileName`) |
| GET | `/:id/merged-video/stream` | **Stream auth** — byte-range stream of linked full-course MP4; query `token` |
| POST | `/:id/merged-video/reveal` | Localhost — open linked file or `_merged_subjects` folder in Explorer |
| POST | `/:id/merged-video/replace` | Localhost — browser upload link (Multer; ≤8 GB default limit) |
| POST | `/:id/merged-video/link-local` | Localhost — link existing file by absolute path (any size; no upload) |

## Chapters (`/api/chapters`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/stats` | Chapter progress aggregates |
| GET | `/` | List; query `subjectId` |
| POST | `/` | Create chapter |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete (cascade content) |

## Contents (`/api/contents`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/:id/browser-playable/stream` | Stream | PC-library browser-playable remux (localhost) |
| GET | `/:id/youtube-playback/stream` | Stream | **YouTube CDS cache stream** (localhost; `protectStream`) |
| GET | `/:id/stream-cache/play` | Stream | Play from completed Telegram stream cache on disk |
| GET | `/upload-progress/:uploadId` | Yes | Poll upload/compress/download/import progress (**`Cache-Control: no-store`** — do not rely on browser 304) |
| GET | `/playback-cache/storage` | Yes | Playback cache disk usage |
| GET | `/local-library/storage` | Yes | PC library disk usage (local only) |
| GET | `/` | Yes | List with filters: `subjectId`, `chapterId`, `type`, `search`, `sort`, `page`, `limit`, `programmeId` |
| POST | `/` | Yes | Create content (multipart `file` optional); `sourceType`: `upload`\|`url`\|`youtube_download`; optional `uploadDestination`: `local`\|`youtube` |
| POST | `/bulk-upload` | Yes | Up to 100 files; auto-create chapters from filenames |
| PATCH | `/reorder` | Yes | Move lesson up/down within subject; body `{ subjectId, contentId, direction: "up"|"down" }` — sets `importSortOrder` on all siblings of same type |
| GET | `/:id/stream-cache` | Yes | Stream cache status (localhost; `assertLocalLibrary`) |
| GET | `/:id/playback-cache` | Yes | Cache status for content |
| POST | `/:id/playback-cache` | Yes | Start Telegram playback cache download |
| DELETE | `/:id/playback-cache` | Yes | Remove cache |
| GET | `/:id/youtube-playback` | Yes | **YouTube CDS cache status** (localhost) |
| POST | `/:id/youtube-playback` | Yes | **Start YouTube → CDS prepare** (async download) |
| DELETE | `/:id/youtube-playback` | Yes | Clear YouTube playback cache for one lesson |
| GET | `/:id/local-library` | Yes | PC library status for one video |
| POST | `/:id/local-library` | Yes | Download video to PC library |
| DELETE | `/:id/local-library` | Yes | Remove from PC library |
| POST | `/:id/cloudify` | Yes | Migrate Telegram-stream video to Cloudinary |
| GET | `/:id` | Yes | Single content with completion flag |
| PUT | `/:id` | Yes | Update metadata |
| DELETE | `/:id` | Yes | Delete + asset cleanup; response includes `destroyedCloudinary` |

## Papers / PYQ (`/api/papers`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List; filters: `year`, `cdsSlot` (1\|2), `sort`, `page`, `limit` |
| POST | `/` | Create with PDF upload or URL |
| POST | `/bulk` | Bulk PDF upload (up to 100) |
| GET | `/:id` | Single paper |
| GET | `/:id/analysis` | Get extracted questions / analysis status |
| POST | `/:id/extract` | Extract questions from PDF via OpenAI |
| POST | `/:id/progress` | Toggle attempted |
| PUT | `/:id` | Update (optional new file) |
| DELETE | `/:id` | Delete + Cloudinary cleanup (`destroyPaperAssets`); response includes `destroyedCloudinary` |

## Workspace (`/api/workspace`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/capabilities` | Feature flags: `youtubeUpload`, `paperExtract` (based on env + OAuth state) |

## Progress (`/api/progress`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/toggle/:contentId` | Toggle content completed |
| POST | `/subject/:subjectId/toggle-all` | Mark all lessons in subject complete (or clear all if already 100%) |
| GET | `/chapter/:chapterId` | Chapter progress summary |

## Vocabulary (`/api/vocabulary`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dashboard` | Arena counts, due/weak/mastered, consistency and recent sessions |
| GET | `/analytics` | 90-day trends, mode/category performance, misses and queue health |
| GET | `/weak-words` | Priority-ranked weak words; query `type`, `limit` |
| GET | `/root-families` | Root family groups; query `search`, `limit` |
| POST | `/session/start` | Start persistent practice session; body includes `mode` (`cds_pyq`\|mixed\|mcq\|…), `type`, `questionCount`, timing/root options; **`cds_pyq`** generates AI (or fallback) paper-style MCQs |
| GET | `/session/:sessionId` | Resume active session (answers remain server-private) |
| POST | `/session/:sessionId/reveal` | Reveal answer for reverse recall |
| POST | `/session/:sessionId/answer` | Validate answer, apply SRS, write review log, return explanation + next question |
| POST | `/session/:sessionId/finish` | Final report + StudySession mission/analytics log |
| POST | `/import-preview` | Parse CSV/Excel/OCR/text and return row statuses/errors without writing |
| POST | `/import-commit` | Commit valid preview rows; case-insensitive upsert |
| GET | `/stats` | Legacy-compatible counts by level |
| GET | `/practice` | Legacy-compatible due cards; query `type`, `limit` |
| POST | `/import` | Legacy-compatible direct CSV/Excel/image OCR import (uses Arena parser) |
| POST | `/import-text` | Legacy-compatible direct structured text import |
| GET | `/` | Search/list; filters include type, text, level/status, due, root, difficulty, exam tag, favorite, recently wrong |
| POST | `/` | Create entry |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |
| POST | `/:id/review` | Legacy-compatible SRS review; now also logs mode/response time |

## Cloud Mappings (`/api/cloud-mappings`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/clouds` | List configured Cloudinary account keys |
| GET | `/usage` | Storage/credits per cloud; query `refresh=1` bypasses 60s server cache |
| GET | `/` | List subject→cloud mappings |
| POST | `/` | Upsert single mapping |
| PUT | `/bulk` | Bulk upsert mappings |
| DELETE | `/:subjectId` | Remove mapping |

## Telegram (`/api/telegram`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/login` | Start phone login |
| POST | `/verify-otp` | Submit OTP |
| POST | `/verify-password` | Submit 2FA password |
| GET | `/session` | Session status + **`live`** GramJS ping (`checkTelegramConnectionLive`: connected, live, phone, error) |
| POST | `/logout` | Deactivate session |
| POST | `/reset-session` | Clear session data |
| GET | `/channels` | List joined channels |
| GET | `/messages/:channelId` | Channel messages |
| GET | `/forum-preview` | Forum topic preview |
| GET | `/topic-media` | Media in a forum topic |
| POST | `/cleanup-import` | Remove failed/partial import artifacts |
| GET | `/preview-batch` | Preview batch import counts |
| GET | `/mappings` | Channel→programme mappings |
| POST | `/import` | Single import |
| POST | `/import-batch` | Batch import by topics/subjects |
| POST | `/sync/:channelId` | Manual sync one channel |
| POST | `/sync-all` | Sync all auto-sync mappings |
| GET | `/batch-updates` | Pending Telegram updates for dashboard |
| POST | `/update-subject` | Apply Telegram updates to one subject |
| POST | `/update-batch` | Apply batch updates |
| POST | `/progress/:uploadId/cancel` | Request cancel of in-flight Telegram import/update (checks `cancelRequested` in progress bus) |
| GET | `/stream/:messageId` | **Stream auth** — byte-range video/PDF stream; query `channelId`, `token`; **`download=1`** → full attachment (bypasses 8 MB stream-fetch cap) |
| GET | `/thumbnail/:messageId` | **Stream auth** — JPEG thumbnail from Telegram document thumb; query `channelId`, `token` (import UI + lightbox) |

## Settings / local media (`/api/settings`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/local-media` | Current `LOCAL_MEDIA_ROOT`, disk usage breakdown |
| PUT | `/local-media` | Update media root path |
| GET | `/stream-cache` | Stream cache inventory (`_stream_cache`; UI lists **videos only**) |
| POST | `/stream-cache/reveal-folder` | Localhost — open `_stream_cache` in File Explorer |
| POST | `/stream-cache/:cacheKey/reveal` | Localhost — select one cache file in Explorer |
| DELETE | `/stream-cache` | Clear stream cache |
| GET | `/youtube-cookies` | YouTube cookies file status (`youtube_cookies.txt` path, configured flag) |
| POST | `/youtube-cookies` | Upload **`cookies.txt`** multipart (localhost; for yt-dlp bot bypass) |

## Mission (`/api/mission`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/today` | Today's mission + reading + AI briefing + analytics; `?refreshBriefing=1` |
| POST | `/today/regenerate` | Force regenerate mission |
| POST | `/study/start` | Mark study session started |
| POST | `/ai-briefing/refresh` | Regenerate AI briefing |
| POST | `/items/complete` | Mark mission slot complete |
| GET | `/videos/picker/subjects` | Subjects for manual video picker |
| GET | `/videos/picker` | Videos for picker; query `slot`, `subjectId` |
| PUT | `/items/update` | Replace slot video or edit manual item |
| POST | `/items/manual` | Add custom mission task |
| DELETE | `/items/:itemId` | Remove manual/custom item |
| GET | `/reading/today` | Today's reading session |
| POST | `/reading/start` | Start reading timer |
| POST | `/reading/pause` | Pause timer |
| POST | `/reading/resume` | Resume timer |
| POST | `/reading/complete` | Complete reading |
| PUT | `/reading/target` | Update daily reading target minutes |
| POST | `/mock/submit` | Submit Sunday mock result |
| GET | `/mock/history` | Mock test history |
| GET | `/analytics/overview` | Analytics dashboard data |
| GET | `/analytics/intelligence` | Full intelligence report |
| GET | `/streak/video` | Video watch streak status |
| POST | `/session/heartbeat` | Video session heartbeat (active watching) |
| POST | `/session/log` | Log video/reading session on exit |

## Static files

| Path | Purpose |
|------|---------|
| `/uploads/*` | Local videos, PDFs, library, cache |
| `/*` (if `SERVE_CLIENT`) | SPA fallback to `client/dist/index.html` |

---

# Authentication Flow

## Model

- **Single admin** — no registration endpoint; account created on first server boot from env.
- Passwords stored bcrypt-hashed in `Admin` collection.

## Login

1. `POST /api/auth/login` with `{ email, password }`
2. Server validates, returns JWT signed with `JWT_SECRET`, expiry `JWT_EXPIRES_IN` (default `1d`)
3. Client stores token in `localStorage` key `cds_token`
4. `AuthContext` calls `GET /api/auth/me` on boot to validate token

## Protected routes

- `protect` middleware: requires `Authorization: Bearer <token>`
- Invalid/expired → `401 Unauthorized`
- `req.user` = Admin document (password excluded)

## Stream routes

- `protectStream`: Bearer OR `?token=` query param
- Used by: `/api/telegram/stream/:messageId`, **`/api/telegram/thumbnail/:messageId`**, `/api/contents/:id/download-file`, **`/api/subjects/:id/merged-video/stream`**
- Frontend appends token in `media.js` → `buildTelegramPreviewStreamUrl()`; full course uses `subjectFullCourse.js` → `getFullCourseStreamUrl()`

## Frontend route guard

- `PrivateRoute` in `App.jsx`: redirects to `/login` if not authenticated
- `/login` redirects to `/` if already authenticated

## YouTube OAuth (separate from login)

- Google OAuth for YouTube Data API — stores refresh token in `OAuthCredentials`
- **Not connected to content upload pipeline** (see Known Issues)

## Roles & permissions

- **None** — single admin has full access to all protected endpoints.

---

# Business Logic

## Domain hierarchy

```
CDS cycle (cds-1-2026, cds-2-2026)
└── Programme / coaching batch (e.g. "Main", "Golf_Batch")
    └── Subject (e.g. "History") — may link to Telegram topic
        └── Chapter
            └── Content (video | pdf)
```

**Active UI cycle:** CDS (II) 2026 — exam **2026-09-13**, season start **2026-05-24**.

**Subject bucket classification** (`subjectBuckets.js`): subject names matched by regex into `english`, `maths`, `gs` for mission video slots.

## Content management

### Filename parser
`"CHAPTER NAME 2025-12-16.mkv"` → chapter name + title via `parseChapterAndTitleFromFilename()`.

### Source types
- **upload** — local file (video dev only; PDF always local)
- **url** — external URL (YouTube embed, PDF link, Telegram t.me link)
- **cloudinary** — CDN-hosted video after YouTube download or Telegram cloudify
- **telegram** — imported from Telegram with stream metadata

### Bulk upload
- Up to 100 files per request
- `autoCreateChapters=1` creates chapters from filenames
- Client chunks large batches (10 files) with `OperationProgressOverlay`

### Deletion cascade
- `subjectCleanupService`, `programmeCleanupService`, `contentCleanupService`, **`paperCleanupService`**
- Removes Cloudinary assets via **`destroyCloudinaryAsset()`** (video/raw/image, invalidate CDN, **1 retry**)
- **`cloudinaryAsset.js`** resolves `publicId` from delivery URL when legacy rows lack metadata
- Deletes Cloudinary **thumbnails** (image resource) with lesson content
- Removes local files under `uploads/`, progress rows, mappings
- Cascade: chapter → subject → programme clear/delete all call `deleteContentsWithAssets`

## Telegram subsystem

### Services
- `telegramService.js` — GramJS client, login, channel list, media download, streaming, **`fetchTelegramThumbnail()`** (in-memory 1h cache), **`resolveTelegramImportMessageMetas()`**, **`checkTelegramConnectionLive()`**, **`fetchNewChannelMediaSince()`** (fast update scan)
- `telegramMappingService.js` — forum topic import, **`getProgrammeSubjectUpdates()`** (minId scan + skip/duplicate filter), **`importSelectedForumMessages()`** (curated import with batched metadata)
- `telegramFlatChannelService.js` — flat channel import (caption metadata grouping via `telegramFlatChannel.js`; virtual topic IDs ≥ `900_000_000`)
- `telegramMediaMeta.js` (utils) — **`classifyTelegramMediaType()`** — video detection for bot-uploaded documents (mime + extension + `DocumentAttributeVideo`)
- `telegramImportFilters.js` (utils) — **`normalizeLessonTitleKey()`**, duplicate detection, **`telegramSkippedMessageIds`** persistence
- `telegramImportMediaPrefs.js` (utils) — per-topic video/PDF import toggles
- `telegramVideoImportService.js` — download → compress → Cloudinary
- `telegramPdfImportService.js` — PDF import from channels
- `telegramSyncService.js` — background auto-sync interval
- `telegramStreamCacheService.js` — **`_stream_cache`** disk cache; play-first streaming (direct on miss, background warmup)
- `telegramSubjectBlocklist.js` — blocked topics/keys after user delete

### Deployment isolation
- `deploymentKey` on sessions prevents `AUTH_KEY_DUPLICATED` between local and Render
- Legacy sessions without key deactivated on boot

### Cloudify
- `POST /contents/:id/cloudify` — `migrateTelegramVideoContentToCloudinary()`
- Controlled by `TELEGRAM_VIDEO_CLOUDIFY` env (default on)

## Cloudinary

### Multi-account registry (`config/cloudinary.js`)
- `CLOUDINARY_CLOUDS=cloud1,cloud2,...`
- Per-key: `CLOUDINARY_<KEY>_NAME`, `_API_KEY`, `_API_SECRET`
- Optional usage keys: `_USAGE_API_KEY`, `_USAGE_API_SECRET`, `_USAGE_DISABLED`
- `resolveCloudForSubject(subjectId)` → `SubjectCloudMapping` or `CLOUDINARY_DEFAULT_CLOUD`
- PYQ uses `CLOUDINARY_PAPER_CLOUD` (default `cloud1`)

### Storage dashboard (`/cloudinary`)
- **Frontend:** `CloudinaryStoragePage.jsx` — sidebar + dashboard **Storage** button
- **API:** `GET /api/cloud-mappings/usage` → `fetchAllCloudinaryUsage()`
- **Caching:** 60s in-memory TTL; `?refresh=1` for manual refresh
- **Limits:** Parses Admin API limits; **Free plan fallback = 25 GB** when API omits byte limit
- **Console links:** Media library, usage settings, dashboard per cloud name
- **Env for usage panel:** If upload keys get 403 on `/usage`, add `CLOUDINARY_<KEY>_USAGE_API_KEY` + `_USAGE_API_SECRET` (master-capable pair)

### Upload / destroy (`cloudinaryUploadService.js`)
- Chunked upload for videos (20 MB chunks, 30 min timeout) and raw PDFs
- **`destroyCloudinaryAsset({ cloudType, publicId, resourceType })`** — unified destroy with retry
- Wrappers: `destroyCloudinaryVideo`, `destroyCloudinaryRaw`, `destroyCloudinaryImage`

### Upload limits
- Compress targets ≤ ~95 MB for free tier (`CLOUDINARY_FREE_LIMIT_BYTES` in services)
- Chunked upload for large videos (20 MB chunks, 30 min timeout)

## PDF digitalization
- `pdfDigitalizeService.js` — on PYQ upload, checks extractable text; if scanned, runs `ocrmypdf` CLI if installed
- Graceful fallback with warning if OCR tools missing

## Paper AI (library only — routes not exposed)
- `paperExtractService.js` — extract MCQ questions via OpenAI
- `paperAnalysisService.js` — full bifurcation by subject/chapter
- `paperResearchService.js` — Serper web search + OpenAI for breakdown
- `chapterDetailService.js` — per-chapter question detail with answer keys

## Mission system

### Generation (`missionGenerationService.js`)
- Daily: pick 1 video each for english, maths, gs buckets using scoring (unwatched, weak subject, backlog, revision)
- Sunday: `sunday_mock` mission type with mock test slot
- Avoids recently watched (last 3 days)

### Plan editing (`missionPlanService.js`)
- Manual items, video picker, replace slot videos, reading target

### AI briefing (`aiBriefingService.js`)
- OpenAI when `OPENAI_API_KEY` set; else rule-based briefing from mission/analytics

### Streaks (`streakService.js`)
- **Discipline streak:** consecutive days with mission ≥75% or reading complete
- **Reading streak:** consecutive reading-complete days
- **Video streak:** 60 min/day video watch (`StudySession` type=video aggregates)

## CDS Vocabulary Arena

### Frontend
- Default `/vocabulary` is `VocabularyDashboardPage` (active practice first); old library CRUD is secondary at `/vocabulary/learn`
- Practice default mode: **`cds_pyq`** (CDS PYQ AI) — paper-cream card UI via `QuestionCard` + `CdsPyqBody`
- Pages: dashboard, practice setup, persistent session, roots, import preview, analytics, weak words
- Reusable UI under `client/src/components/vocabulary/`; data hooks under `client/src/hooks/useVocabulary*.js`
- Keyboard: MCQ `1–4`, Enter submit, Space reveal, `N` next, `R` Again
- Legacy `/idioms` and `/one-word-substitution` remain compatible via `LanguageLearningPage`

### CDS PYQ (AI) — `mode: "cds_pyq"`
- Service: `vocabularyCdsPyqService.js` — OpenAI (`OPENAI_VOCAB_MODEL` / `OPENAI_ANALYSIS_MODEL` / `gpt-4o-mini`) using the learner word bank as seeds; **deterministic fallback** if no API key or AI fails
- Formats (UPSC CDS English paper style):
  1. `similar_sounding` — confusable trio + 3 underlined sentences + combination options (`1 and 2 only`, …)
  2. `idiom_mcq` — idiom / phrase + 4 meanings
  3. `antonym_context` — sentence with underlined word + opposite meaning
  4. `word_meaning` — headword + 4 definitions
  5. `word_pair` — pair definitions (affect/effect style)
  6. `synonym_context` — sentence + nearest meaning
  7. `match_list` — List I (A–D) ↔ List II (1–4) + code options (`3 1 4 2`)
- Session start sets `examMode` + timed budget (`SECONDS_PER_QUESTION`); start response may include `pyqSource: "ai"|"fallback"`
- Requires vocabulary items in the bank; invents classic confusable pairs when needed; SRS updates only when `vocabularyId` resolves

### Question/session services
- `vocabularyQuestionService.js`: Arena modes + types; balanced distractors; definition↔word, synonym, antonym, idiom, one-word, context, root, homonym/confusing-word; exports `PRACTICE_MODES` including **`cds_pyq`**
- `vocabularySessionService.js`: branches `cds_pyq` → `generateCdsPyqQuestions`; server-private answers; optional vocab link for AI items; timed drills; final weak-category/review recommendations
- `vocabularyCdsPyqService.js`: AI + fallback PYQ generation / normalization
- `vocabularyArenaService.js`: dashboard, weak scoring, root groups, analytics
- `vocabularyImportService.js`: shared parser/validator/upsert for both new preview flow and legacy import endpoints

### Explainable SRS (`vocabularySrsService.js`)
- **Again / wrong** → interval 1 day, ease −0.25, confidence −24, level `new`, weak priority increases
- **Good** → deterministic interval × ease (minimum +1 day), ease +0.02, confidence +8/+12 based on response time
- **Easy** → longer interval × (ease +0.35), ease +0.08, confidence +15/+20; mastered at ≥14 days and ≥70 confidence
- Limits: ease `1.3–3.0`, interval `1–180` days, confidence `0–100`
- Weak rank combines mistakes, error rate, low confidence, overdue days and recent misses
- Every Arena answer updates the item immediately and writes `VocabularyReviewLog`; completed drills write `StudySession(type=vocabulary)` and surface in Today's Target

## Local PC library (`localLibraryService.js`)

- Only when `NODE_ENV !== "production"` OR `LOCAL_LIBRARY_ENABLED=1`
- Downloads Cloudinary, local, or Telegram-stream videos to `{LOCAL_MEDIA_ROOT}/_local_library/`
- Metadata in `{contentId}.meta.json`
- Subject-level bulk download via `POST /subjects/:id/local-library`
- Replacing a lesson file does **not** invalidate full-course link (removed old merge invalidation)

## Full course video (`subjectFullCourseService.js`)

- **Localhost / `LOCAL_LIBRARY_ENABLED=1` only** for link/replace/reveal routes
- One linked MP4 per subject — metadata in `{LOCAL_MEDIA_ROOT}/_merged_subjects/{subjectId}.meta.json`
- **`linkedSourcePath`** — absolute path to user's file (may be anywhere under `LOCAL_MEDIA_ROOT`, e.g. root-level `Complete Indian Geography.mp4`)
- **No transcode, no stitch, no quality loss** — playback streams original bytes via `streamLocalFile`
- **Link from path** — instant registration for multi-GB files (no browser upload)
- **Replace full course** — Multer upload to `{subjectId}_full_course.mp4` (8 GB middleware cap)
- **Playback URL** — always `GET /api/subjects/:id/merged-video/stream?token=` via `getStreamBackendBaseUrl()` (port **5001** in dev, not Vite **5173**)
- **Static `/uploads/` pitfall** — files at CDS UPLOAD root are NOT in project `uploads/`; `createLocalMediaRootStaticHandler` serves them when path matches; full-course player uses stream API regardless
- **Range requests** — `streamLocalFile.parseRangeHeader` supports suffix ranges (`bytes=-65536`) required for 20GB+ MP4 duration probing
- Purge legacy `{subjectId}_{hash}.mp4` auto-stitch files on new link

## Stream cache (`telegramStreamCacheService.js`)

- Localhost / `LOCAL_LIBRARY_ENABLED=1` only; dir `{LOCAL_MEDIA_ROOT}/_stream_cache/`
- Enabled via `TELEGRAM_STREAM_CACHE=1` (default on when local media enabled)
- **Play-first:** streams directly from Telegram on cache miss; background warmup deferred (~20s)
- Preview/stream responses may cap a single fetch (`TELEGRAM_STREAM_FETCH_MB`, default **8 MB** on localhost) — OK for video scrubbing
- **PC Save / `?download=1`:** `streamTelegramAttachmentDownload()` always serves the **full** file (complete disk cache or full Telegram stream) — prevents truncated/corrupt PDFs
- Client `downloadTelegramMediaToPc()` rejects HTTP 206, size mismatches, and non-`%PDF` headers
- Per-content status: `GET /api/contents/:id/stream-cache`
- Global stats/clear: `GET|DELETE /api/settings/stream-cache`; **Locate** via `POST .../reveal` (PowerShell explorer)

## Playback cache (`videoPlaybackCacheService.js` + `youtubePlaybackCacheService.js`)

- Server-side cache under `{LOCAL_MEDIA_ROOT}/_playback_cache/`
- **Telegram:** `videoPlaybackCacheService.js` — manual/on-demand stream download; `PLAYBACK_CACHE_MAX_MB` (default 512), warn ratio configurable
- **YouTube (localhost):** `youtubePlaybackCacheService.js` — `{contentId}_youtube.webm` + `.meta.json`; **`YOUTUBE_PLAYBACK_CACHE_VERSION`** invalidates stale low-quality files; requires valid **`youtube_cookies.txt`**

## Upload progress bus

- In-memory `Map` keyed by client UUID `uploadId`
- Phases: `pending`, `received`, `downloading`, `compressing`, `uploading`, `importing`, `syncing`, `telegram-download`, `done`, `error`
- **TTL:** terminal states swept after **10 min**; active imports/updates kept up to **60 min**
- **Polling:** `GET /contents/upload-progress/:uploadId` sends **`Cache-Control: no-store`**; client adds `?_t=` cache-bust — avoids stuck UI at 5% from browser **304 Not Modified**
- **Cancel:** `POST /telegram/progress/:uploadId/cancel` sets `cancelRequested`; import loops call `throwIfCancelled()`
- **Lost on server restart**

## Study context (client)

- `StudyContext.jsx` — localStorage-backed daily minutes, targets, watch history (50 max)
- Syncs video streak with server via `GET /mission/streak/video`
- Celebrations: `StudyCompleteCelebration`, `StreakFireCelebration`

---

# Configuration

## Server environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `5000`) |
| `HOST` | Bind address (default `0.0.0.0`) |
| `NODE_ENV` | `production` disables local video upload & YouTube download |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | Token expiry (default `1d`) |
| `ADMIN_EMAIL` | Default admin email (seed) |
| `ADMIN_PASSWORD` | Default admin password (seed) |
| `ADMIN_NAME` | Default admin display name |
| `CLIENT_URL` | Primary CORS origin |
| `CLIENT_URLS` | Comma-separated extra CORS origins |
| `PUBLIC_CLIENT_URL` | Additional CORS origin |
| `PUBLIC_API_URL` | Logged at startup; used for tunnel CORS matching |
| `API_PUBLIC_URL` | Base URL for subject download pack links |
| `TRUST_PROXY` | `true`/`1` → Express `trust proxy` |
| `SERVE_CLIENT` | `true` force serve `client/dist`; `false` disable; default auto if dist exists |
| `CORS_ALLOW_IP_ORIGINS` | Allow LAN IP origins |
| `CORS_ALLOW_CLOUDFLARE_TUNNEL` | Allow trycloudflare.com origins |
| `CLOUDFLARE_TUNNEL_URL` | Tunnel base URL for CORS |
| `OPENAI_API_KEY` | OpenAI for extract, analysis, AI briefing, **CDS PYQ vocab MCQs** |
| `OPENAI_ANALYSIS_MODEL` | Model name (default `gpt-4o-mini`) |
| `OPENAI_VOCAB_MODEL` | Optional override for CDS PYQ generation (falls back to `OPENAI_ANALYSIS_MODEL`) |
| `SERPER_API_KEY` | Web search for paper research (optional) |
| `CLOUDINARY_CLOUDS` | Comma-separated cloud keys (default `cloud1,cloud2`) |
| `CLOUDINARY_DEFAULT_CLOUD` | Fallback cloud key |
| `CLOUDINARY_<KEY>_NAME` | Cloudinary cloud name per key |
| `CLOUDINARY_<KEY>_API_KEY` | API key per key |
| `CLOUDINARY_<KEY>_API_SECRET` | API secret per key |
| `CLOUDINARY_<KEY>_USAGE_API_KEY` | Optional Admin API key for usage dashboard |
| `CLOUDINARY_<KEY>_USAGE_API_SECRET` | Optional Admin API secret for usage |
| `CLOUDINARY_<KEY>_USAGE_DISABLED` | Skip usage fetch for this cloud |
| `CLOUDINARY_PAPER_CLOUD` | Which cloud stores PYQ PDFs (default `cloud1`) |
| `TELEGRAM_API_ID` | GramJS API ID (from my.telegram.org) |
| `TELEGRAM_API_HASH` | GramJS API hash |
| `TELEGRAM_DEPLOYMENT_KEY` | Session isolation key (auto: `render`, `production`, `local`) |
| `TELEGRAM_SYNC_INTERVAL_MS` | Auto-sync interval (default 900000 = 15 min) |
| `TELEGRAM_AUTO_SYNC` | `false` to disable background sync |
| `TELEGRAM_VIDEO_CLOUDIFY` | `0` = stream-only import (no Cloudinary push) |
| `TELEGRAM_STREAM_CACHE` | `0` disables `_stream_cache` auto caching |
| `TELEGRAM_STREAM_CHUNK_KB` | Stream chunk size (default 2048 KB) |
| `TELEGRAM_STREAM_WAIT_MS` | Stream wait timeout (default 45000) |
| `TELEGRAM_STREAM_TAIL_MB` | Tail buffer for seeking (default 8 MB) |
| `TELEGRAM_STREAM_WARMUP_DEFER_MS` | Delay before background cache warmup after play starts (default ~20000) |
| `LOCAL_MEDIA_ROOT` | Override media root (e.g. `C:\Users\...\CDS UPLOAD`); holds `_local_library`, `_merged_subjects`, `_stream_cache`, `_playback_cache`, and optionally root-level linked MP4s |
| `VIDEO_COMPRESS_ALWAYS` | `0` skips compression when not needed |
| `VIDEO_COMPRESS_HEIGHT` | Target height (default 720) |
| `VIDEO_COMPRESS_CRF` | ffmpeg CRF (default 23) |
| `VIDEO_COMPRESS_PRESET` | ffmpeg preset (default `medium`) |
| `VIDEO_COMPRESS_AUDIO_BITRATE` | Audio bitrate (default `128k`) |
| `VIDEO_COMPRESS_SKIP_BELOW_MB` | Skip compress if smaller (default 80 MB) |
| `LOCAL_LIBRARY_ENABLED` | `1` enables PC library on production |
| `LOCAL_LIBRARY_MAX_MB` | Max library size (default 102400 MB) |
| `LOCAL_LIBRARY_WARN_RATIO` | Warn threshold ratio (default 0.8) |
| `PLAYBACK_CACHE_MAX_MB` | Max playback cache (default 512 MB) |
| `PLAYBACK_CACHE_WARN_RATIO` | Cache warn ratio (default 0.8) |
| `YT_DLP_COOKIES_FILE` | Optional absolute path to Netscape **`cookies.txt`** for YouTube downloads |
| `YT_DLP_COOKIES_FROM_BROWSER` | Optional `edge`/`chrome`/… for `--cookies-from-browser` (often blocked on Windows DPAPI) |
| `YT_DLP_JS_RUNTIMES` | Optional yt-dlp JS runtime (default: auto-detect Node via `process.execPath`) |
| `GOOGLE_CLIENT_ID` | YouTube OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | YouTube OAuth secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `RENDER` / `RENDER_SERVICE_ID` | Detect Render deployment for Telegram key |
| `TUNNEL_MODE` | PM2 tunnel: `quick` (default) or `named` |

## Client environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API base (e.g. `http://localhost:5001/api` or production backend `/api`) |
| `VITE_SERVER_URL` | Server origin for absolute media URLs (e.g. `http://localhost:5001`) |

**Full course streaming (`subjectFullCourse.js`):**
- Uses **`getStreamBackendBaseUrl()`** — always Express backend (`127.0.0.1:5001` in dev), never `window.location.origin` (Vite :5173 breaks range requests on huge MP4s)

**Resolution (`api/client.js`):**
- `VITE_API_URL` wins if set
- Dev without env → `/api` (Vite proxy to 5001)
- Prod without env → same-origin `/api`

---

# External Integrations

| Service | Usage |
|---------|-------|
| **MongoDB** | Primary database |
| **Cloudinary** | Video CDN (dev YouTube/Telegram cloudify), PYQ PDF storage, multi-account |
| **Telegram (GramJS)** | Channel import, media download, byte-range streaming |
| **OpenAI** | Paper extract/analysis, AI daily briefing, chapter detail |
| **Serper** | Web search for paper research (optional) |
| **Google YouTube Data API** | OAuth implemented; direct upload **not wired** to content create |
| **ffmpeg** | Video compression before Cloudinary |
| **yt-dlp** | YouTube download (dev only) |
| **ocrmypdf + Tesseract** | PDF OCR layer on PYQ upload (optional CLI) |
| **Vercel** | Frontend hosting |
| **Cloudflare Tunnel** | Expose local/production API publicly (PM2 scripts) |

---

# Backup & migration to another PC

Use this checklist when copying the project folder to a new machine. **No feature changes required** — restore env, database, and media paths.

## What to copy

| Item | Required? | Notes |
|------|-----------|--------|
| **Entire repo** (source) | Yes | `client/`, `server/`, root docs — exclude `node_modules/` (reinstall) |
| **`server/.env`** | **Yes** | Secrets: `MONGO_URI`, `JWT_SECRET`, `ADMIN_*`, Telegram, Cloudinary, OpenAI, Google OAuth — **not in git** |
| **`client/.env`** | If used | Usually optional in dev; set `VITE_API_URL` / `VITE_SERVER_URL` for split deploy |
| **MongoDB data** | **Yes** | Export/import database (see below) — course structure, progress, vocab, Telegram mappings live here |
| **`uploads/`** or **`LOCAL_MEDIA_ROOT`** | If local media | PDFs on disk, `_local_library/`, `_merged_subjects/`, `_stream_cache/`, `_playback_cache/`, **`youtube_cookies.txt`**, linked full-course MP4s |
| **`server/eng.traineddata`** | If vocab OCR | Tesseract model (in repo) |
| **`server/cloudflare/`** | If using tunnel | Named tunnel credentials (`config.yml` is gitignored) |

## What NOT to copy (rebuild instead)

- `client/node_modules/`, `server/node_modules/` → run `npm install` in each
- `client/dist/` → run `npm run build` in `client/` if serving combined from Express
- Browser `localStorage` (JWT, theme, resume positions) — log in again on new PC

## Step-by-step on the new PC

### 1. Prerequisites

- **Node.js ≥ 20**, **npm ≥ 10**
- **MongoDB** running locally or **MongoDB Atlas** URI in `.env`
- Optional (dev): **ffmpeg**, **yt-dlp** (`pip install "yt-dlp[default]"` + **Node.js ≥22** for EJS), **ocrmypdf** (PYQ OCR)
- Export **`youtube_cookies.txt`** to `{LOCAL_MEDIA_ROOT}/` for YouTube CDS player (logged-in YouTube session)
- Windows: PowerShell for **Locate in Explorer** / full-course path picker

### 2. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 3. Environment files

Copy `server/.env` from old PC (create if missing — see Configuration section for all variables).

**Critical for dev alignment:**

```env
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/cdsjourney-course-manager
JWT_SECRET=<same-or-new-secret>
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
```

If `LOCAL_MEDIA_ROOT` pointed to e.g. `C:\Users\...\CDS UPLOAD` on the old PC, **update the path** on the new PC or copy that folder too.

### 4. MongoDB backup & restore

**Export on old PC:**

```bash
mongodump --uri="mongodb://127.0.0.1:27017/cdsjourney-course-manager" --out=./mongo-backup
```

Copy the `mongo-backup/` folder to the new PC.

**Import on new PC:**

```bash
mongorestore --uri="mongodb://127.0.0.1:27017/cdsjourney-course-manager" --drop ./mongo-backup/cdsjourney-course-manager
```

For Atlas: use `mongodump` / `mongorestore` with your Atlas connection string, or Atlas UI backup/restore.

### 5. Local media files

If not using only Cloudinary/Telegram streams:

1. Copy the **`uploads/`** folder inside the repo **or** the external folder set in `LOCAL_MEDIA_ROOT`.
2. Keep subfolders: `_local_library/`, `_merged_subjects/`, `_stream_cache/`, `_playback_cache/`, cycle/batch PDF paths.
3. Update `LOCAL_MEDIA_ROOT` in `server/.env` if the drive letter or username changed.

### 6. Telegram session

- **`TelegramSession`** is stored in MongoDB but is tied to **`deploymentKey`** (`local` vs `render`).
- On a **new PC**, expect to **log in to Telegram again** in the app (Settings or Import page) — OTP + optional 2FA.
- **Do not** run the same GramJS session on two machines simultaneously (`AUTH_KEY_DUPLICATED`).

### 7. Cloudinary & OpenAI

- No file copy needed — credentials in `.env` / MongoDB mappings (`SubjectCloudMapping`, `TelegramChannelMapping`) restore from DB dump.
- Re-verify `/cloudinary` storage dashboard after first boot.

### 8. Run & verify

```bash
# Terminal 1
cd server && npm run dev    # → http://localhost:5001

# Terminal 2
cd client && npm run dev    # → http://localhost:5173
```

**Smoke test:** login → open batch → open subject (watch time + lessons) → play one Telegram video → Telegram import page loads channels.

### 9. Optional: combined home server

```bash
cd server && npm run start:home
```

Serves API + built client from one port (set `PORT` and `SERVE_CLIENT` as needed).

## Git note

If copying via **zip/USB** instead of `git clone`, you get working tree + untracked files. If using **git**, run `git status` on the new PC — uncommitted work from the old machine must be copied separately or committed/pushed first.

---

# Deployment

## Local development

```bash
# Terminal 1 — MongoDB running locally
cd server && npm install && npm run dev    # → http://localhost:5001 (or PORT from .env)

# Terminal 2
cd client && npm install && npm run dev    # → http://localhost:5173
```

Copy/configure `server/.env` and `client/.env` with variables above.

Vite proxies `/api` and `/uploads` to port **5001**. **Full course video** bypasses Vite and streams directly from backend — see `getStreamBackendBaseUrl()`.

## Production patterns

### Split deploy (recommended)
1. **Frontend:** Vercel — set `VITE_API_URL` to public backend URL
2. **Backend:** VPS/Render/local with `NODE_ENV=production`, MongoDB Atlas URI, Telegram + Cloudinary env
3. **CORS:** Add Vercel URL to `CLIENT_URL` or rely on `*.vercel.app` auto-allow

### Single-server deploy
```bash
cd server
npm run start:home   # builds client + serves dist from Express
```
Set `SERVE_CLIENT=true` explicitly if needed.

### PM2 + Cloudflare Tunnel
```bash
cd server
pm2 start ecosystem.config.cjs
# Runs cds-api + cloudflared tunnel to localhost:${PORT} (match server PORT, e.g. 5001)
npm run tunnel:url   # get public URL
```

Named tunnel: copy `cloudflare/config.yml.example`, set credentials, `TUNNEL_MODE=named`.

## Scripts

| Command | Location | Purpose |
|---------|----------|---------|
| `npm test` | server | Run unit tests (`node --test tests/**/*.test.js`) |
| `npm run dev` | server | Start API |
| `npm start` | server | Production API |
| `npm run start:home` | server | Build client + serve combined |
| `npm run dev` | client | Vite dev server |
| `npm run build` | client | Production build → `dist/` |
| `node scripts/purgeAllMedia.js` | server | Nuclear media wipe |

---

# Known Issues

## Unwired / incomplete features

| Item | Status |
|------|--------|
| Paper chapter detail HTTP API | `chapterDetailService.js` exists; **no routes** |
| `GEMINI_API_KEY` | Referenced in old docs; **unused in codebase** |

## Recently wired (8.5+ hardening)

| Item | Status |
|------|--------|
| `POST /api/papers/:id/extract` + `GET /api/papers/:id/analysis` | Wired in `paperRoutes.js`; UI in `PaperViewerPage` |
| YouTube direct upload | `uploadDestination: "youtube"` in `contentController`; radio in `ContentModal` when OAuth connected |
| Dashboard course view | Lazy load via `useDashboardCourseContents` — stats from `/chapters/stats`, contents on subject open |
| Unit tests + CI | `server/tests/*.test.js`, `.github/workflows/ci.yml` |

## Behavioral caveats

- **Legacy Cloudinary rows without `publicId`** — now handled by parsing delivery URL in `cloudinaryAsset.js`; edge cases may still warn if URL is malformed
- **Destroy failures** — retried once; DB delete still proceeds if Cloudinary API fails (check server logs)
- **Upload-then-DB-fail orphans** — Cloudinary asset not rolled back if DB save fails after upload (rare)
- **Telegram GramJS TIMEOUT** — benign update loop timeouts; client configured to suppress; use **Reset session** if streams stall
- **Cloudinary Free plan usage API** — may omit byte limit; server uses **25 GB fallback** for progress bar %
- **In-memory upload progress** — lost on server restart; poll uses no-cache (fixed 304 stuck-at-5% bug in browser)
- **Long Telegram import** — first run may take minutes for large subjects; use Cancel on overlay; progress shows `Reading Telegram files (n/m)…`
- **Telegram auto-sync** — requires active session + mapped `syncTopicIds`/`syncSubjectKeys`; silently skips if no session
- **Telegram duplicate “N new”** — if titles differ between duplicate uploads, may still show updates; use curated import skip list or rename lessons for match
- **Legacy disk PYQ** — boot migration may move old files; new uploads go to Cloudinary only
- **PYQ `cdsSlot` filter** — title regex `/CDS\s*1\b/i` or `/CDS\s*2\b/i`
- **README.md** — partially stale vs actual architecture (mentions local-only uploads, missing mission/Telegram features)
- **Subject model** — server boot still backfills legacy `courseId` field though schema uses `programmeId` hierarchy
- **Production video** — file upload blocked; must use Telegram links or pre-imported stream/Cloudinary content
- **Huge linked MP4 (20GB+)** — timeline may stay at 00:00 until suffix range requests succeed; ensure `streamLocalFile` suffix-range support; moov-at-end files may seek slowly until metadata is read

---

# Future Improvements

1. **Paper chapter detail routes** — expose `chapterDetailService.js` via HTTP
2. **Persist upload progress** — Redis or MongoDB job documents for multi-instance deploys
3. **Multi-admin / roles** — if product scope expands beyond single user
4. **Integration tests** — supertest for auth-protected routes with test DB
5. **`.env.example` files** — document required vars without committing secrets
6. **CDN for course PDFs in production** — currently local disk even in prod
7. **Webhook notifications** — Telegram sync completion, mission reminders
8. **Offline PWA** — cache mission plan and vocab for spotty connectivity
9. **Code-split VideoPlayerPage** — further component extraction beyond hooks
10. **Remove committed `client/dist/`** — rely on CI build only

---

# Important Notes

## Conventions for developers

1. **Always read this file first** before coding.
2. **Always use `resolveContentSrc(item)`** on the client for per-lesson playable URLs — use **`preferSameOriginMediaUrl()`** / **`resolveVideoPlaybackUrl()`** in dev so Vite proxies `/api` (required for screenshots + Telegram streams).
3. **Full course video** — use **`getFullCourseStreamUrl(subjectId)`** only; never point `<video src>` at `/uploads/...` for linked root-level CDS UPLOAD files; always backend stream API + `?token=`.
4. **Video player** — use `CdsPlyrPlayer` (imperative video DOM); do not let React reconcile nodes Plyr moves.
5. **Respect production media gate** — `NODE_ENV === "production"` blocks video file upload and YouTube download.
6. **Telegram stream playback** — check `GET /telegram/session` `live` before starting player; show `TelegramConnectionStatus` banner.
7. **Chapter sorting** — use `.collation({ locale: "en", numericOrdering: true })` for natural chapter order.
8. **Subject delete** — must use cleanup services to avoid orphaned Cloudinary assets (URL-only legacy rows now parsed via `cloudinaryAsset.js`).
9. **Adding CDS cycle** — update both `client/src/config/courses.js` and `server/src/config/cdsCourses.js`.
10. **Custom hooks** — live in `client/src/hooks/`; prefer extracting from mega-pages when adding features.
11. **Lesson order** — use `sortSubjectContents()` everywhere; persist via `importSortOrder` (`PATCH /contents/reorder`).
12. **Telegram curated import** — unselected messages → `Subject.telegramSkippedMessageIds`; duplicates filtered by title in update checks.
13. **Multer limit** — 5 GB per file; bulk content max 100 files per request.
14. **Cloudinary usage dashboard** — needs Admin API read or `CLOUDINARY_<KEY>_USAGE_*` env vars per account.
15. **Backup / new PC** — follow **Backup & migration** section: `server/.env`, MongoDB dump, media root; re-login Telegram on new machine.

## Frontend routes (`App.jsx`)

| Path | Page |
|------|------|
| `/login` | Public login |
| `/` | Dashboard (batch/subject/content hub; lazy course content load) |
| `/cloudinary` | **Cloudinary storage** — usage, remaining space, console links |
| `/settings/pc-media` | **PC Media Storage** — `LOCAL_MEDIA_ROOT`, library/stream/playback cache usage (localhost only) |
| `/mission` | Daily mission command center |
| `/import/telegram` | Telegram import wizard |
| `/video/:id` | Video player (Plyr + Telegram status banner + stall retry) |
| `/subject/:subjectId/full-video` | **Full course** — single linked MP4 player (byte-range stream via backend API) |
| `/video/:id/screenshot/:noteId` | Screenshot note viewer |
| `/pdf/:id` | PDF viewer |
| `/papers`, `/paper/:id` | PYQ list + viewer |
| `/history` | Watch history |
| `/history/intelligence` | Study intelligence & analytics |
| `/vocabulary` | **CDS Vocabulary Arena** dashboard (active-practice default) |
| `/vocabulary/practice` | Drill mode/type/count selector |
| `/vocabulary/session/:sessionId` | Persistent active/timed drill + explanation + report |
| `/vocabulary/roots` | Root word family explorer and mini-drills |
| `/vocabulary/analytics` | Accuracy, modes, categories, misses, review queue |
| `/vocabulary/import` | CSV/Excel/OCR/text preview + row-safe commit |
| `/vocabulary/learn` | Secondary vocabulary library CRUD/search/filter |
| `/idioms`, `/one-word-substitution` | Legacy-compatible focused libraries; Arena includes both types in mixed/exam drills |

## localStorage keys (client)

| Key | Purpose |
|-----|---------|
| `cds_token` | JWT |
| `cds_theme` | `light` / `dark` |
| `cds_dashboard_filters` | Dashboard filter state |
| `cds_study_*` | Study tracker (today minutes, targets) |
| `cds_watch_history` | Last 50 watched videos |
| `cds_celebration_shown_date` | Daily target celebration guard |
| `cds_streak_celebration_shown_date` | Video streak celebration guard |
| `cds_video_position_<id>` | Resume playback position |
| `cds_video_page_theme` | Video page theme override |
| `cds_journey_app_created_at` | Exam countdown anchor |
| `cds_remembered_login` | Login form remember |
| `cds_video_screenshot_notes_<id>` | Screenshot notes fallback |
| IndexedDB `cds_screenshot_notes_db` | Screenshot notes primary store |

## Where to make common changes

| Goal | Files |
|------|-------|
| Add CDS cycle | `client/src/config/courses.js`, `server/src/config/cdsCourses.js` |
| New page | `client/src/pages/`, `App.jsx`, `Sidebar.jsx` |
| Video player / Plyr | `CdsPlyrPlayer.jsx`, `plyr-overrides.css`, `VideoPlayerPage.jsx`, `videoScreenshot.js` |
| Telegram stream reliability | `VideoPlayerPage.jsx`, `TelegramConnectionStatus.jsx`, `telegramService.js` (`checkTelegramConnectionLive`) |
| Cloudinary storage UI | `CloudinaryStoragePage.jsx`, `cloudinaryUsageService.js`, `CoachingBatchSection.jsx` |
| Cloudinary delete on remove | `contentCleanupService.js`, `paperCleanupService.js`, `cloudinaryAsset.js`, `cloudinaryUploadService.js` |
| Change PDF disk layout | `uploadMiddleware.js`, `uploadOrganizationService.js` |
| Add Cloudinary account | Env vars only (`CLOUDINARY_CLOUDS` + per-key vars) |
| Telegram import / updates | `telegramMappingService.js`, `telegramImportFilters.js`, `telegramMediaMeta.js`, `telegramFlatChannel.js`, `TelegramImportPage.jsx`, `telegram-import.css`, `telegramLessonPlan.js` |
| Subject watch time (total duration) | `BatchCourseView.jsx`, `SubjectLessonAccordion.jsx`, `media.js` (`sumVideoDurationSeconds`, `formatTotalStudyDuration`) |
| Telegram thumbnails (import UI) | `fetchTelegramThumbnail()` in `telegramService.js`, `GET /telegram/thumbnail/:messageId`, `buildTelegramThumbnailUrl()` in `media.js` |
| Lesson order / reorder | `SubjectLessonAccordion.jsx`, `contentSort.js` (client + server), `PATCH /contents/reorder` |
| **Full course video (link + play)** | `SubjectPlayAllPremium.jsx`, `SubjectFullVideoPage.jsx`, `subjectFullCourse.js`, `subjectFullCourseService.js`, `subjectDownloadController.js`, `streamLocalFile.js`, `getStreamBackendBaseUrl()` |
| **Mark entire subject complete** | `SubjectPlayAllPremium.jsx`, `POST /api/progress/subject/:subjectId/toggle-all`, `progressController.js` |
| PC media / stream cache | `LocalMediaStoragePage.jsx`, `mediaStorage.js`, `telegramStreamCacheService.js`, `mediaStorageController.js` |
| Vocabulary Arena UI | `Vocabulary*Page.jsx`, `components/vocabulary/*` (incl. `CdsPyqBody.jsx`), `hooks/useVocabulary*.js`, `utils/vocabularyArena.js` |
| Vocabulary questions/sessions | `vocabularyQuestionService.js`, `vocabularySessionService.js`, `VocabularyPracticeSession.js`, `VocabularyReviewLog.js` |
| **CDS PYQ (AI) MCQs** | `vocabularyCdsPyqService.js`, mode `cds_pyq` in session start, `QuestionCard` / `CdsPyqBody`, tests `vocabularyCdsPyq.test.js` |
| Vocabulary SRS/weak rank | `vocabularySrsService.js` (legacy review controller delegates here) |
| Vocabulary import | `vocabularyImportService.js`, `VocabularyImportPage.jsx` |
| Telegram PDF Save / full download | `media.js` (`downloadTelegramMediaToPc`), `telegramStreamCacheService.js` (`download=1`), `TelegramImportPage.jsx` |
| Stream-cache Locate in Explorer | `revealInFileManager.js`, `LocalMediaStoragePage.jsx`, settings reveal routes |
| Wire paper chapter detail | `paperRoutes.js` + `chapterDetailService.js` |
| Change Vocabulary Arena analytics | `vocabularyArenaService.js`, `VocabularyAnalyticsPage.jsx` |
| Study time tracking | `useStudy().addStudyMinutes()` in `StudyContext.jsx` |
| Purge all media | `node server/scripts/purgeAllMedia.js` |
| Mission scoring | `missionGenerationService.js` → `scoreVideo` |
| CORS for new frontend URL | `server/src/config/cors.js` or `CLIENT_URLS` env |

## Glossary

| Term | Meaning |
|------|---------|
| **CDS** | Combined Defence Services exam (UPSC); written twice yearly (I April, II September) |
| **OTA** | Officers' Training Academy |
| **PYQ** | Previous Year Question paper |
| **Programme** | Coaching batch folder inside a CDS cycle |
| **Cloudify** | Download Telegram video → compress → upload to Cloudinary |
| **SRS** | Spaced repetition system for vocabulary |
| **GramJS** | JavaScript Telegram client library (`telegram` npm package) |
| **PC library** | Local smooth-playback download feature (`_local_library/`) |
| **Full course video** | One user-linked MP4 per subject (`linkedSourcePath` in `_merged_subjects/{id}.meta.json`); no ffmpeg stitch; stream via `/merged-video/stream` |
| **Link from path** | Register an existing Windows file path as full course (no browser upload — for 20GB+ MP4s) |
| **Stream cache** | Auto disk cache while watching Telegram streams (`_stream_cache/`) |
| **Curated import** | Pick specific Telegram lessons; unselected → `telegramSkippedMessageIds` |
| **importSortOrder** | Numeric lesson order; set by import or manual ↑↓ reorder |
| **Subject watch time** | Sum of `Content.duration` (seconds) for videos in a subject — shown in dashboard subject header |
| **CDS PYQ (AI)** | Practice mode that generates UPSC CDS English paper-style vocabulary MCQs via OpenAI (with local fallback) |
| **YouTube CDS player** | Localhost: yt-dlp downloads full-quality YouTube → `_playback_cache` → **CdsPlyrPlayer** (not embed) |
| **youtube_cookies.txt** | Netscape cookie file at `{LOCAL_MEDIA_ROOT}/youtube_cookies.txt` — required for YouTube bot bypass on dev server |

---

# Recent Changes Log (chat sessions — 2026-08-14 / 2026-08-16)

| Area | Change |
|------|--------|
| **YouTube → CDS Plyr (localhost)** | `youtubePlaybackCacheService.js` + API `GET/POST/DELETE /contents/:id/youtube-playback`, stream route; `VideoPlayerPage` prepares cache then plays via `CdsPlyrPlayer`; ReactPlayer embed fallback |
| **Full-quality download** | `qualityProfile: max` — `bestvideo*+bestaudio`, webm stream-copy; **ffprobe ≥720p** validation; cache version gate rejects stale 360p files |
| **yt-dlp auth** | Node `--js-runtimes`, `yt-dlp[default]` EJS; **`youtube_cookies.txt`** (full-file scan — not just first 4KB); upload via **`POST /settings/youtube-cookies`**; in-player cookies panel on bot error |
| **Scrub preview (YouTube cache)** | `scrubPreviewEnabled` when `useYoutubePlyr` — timeline hover thumbnails on cached YouTube files |
| **Plyr speed menu UI** | Centered radio dots in settings menu (`plyr-overrides.css`) — fixes misaligned blue selection indicator |
| **ReactPlayer YouTube embed** | Stable resume (no dynamic `config.start`); `onSeeked` position save; used when CDS prepare fails or non-localhost |

# Recent Changes Log (chat sessions — 2026-08-13 / 2026-08-14)

| Area | Change |
|------|--------|
| **Telegram flat-channel video detection** | `telegramMediaMeta.js` — classify videos by mime, extension, `DocumentAttributeVideo`; removed invalid `MessageMediaVideo` instanceof (GramJS crash) |
| **Telegram import UI** | `TelegramImportPage.jsx` + `telegram-import.css` — channel search, taller workspace, clean lesson titles from captions, professional lesson cards |
| **Video thumbnails (import)** | `GET /telegram/thumbnail/:messageId`; lazy 16:9 thumbs; click → **Play video** or **Preview thumbnail** lightbox |
| **Import progress reliability** | No-cache progress API; client cache-bust polling; batched `resolveTelegramImportMessageMetas()`; Cancel button; 60 min active progress TTL |
| **Plyr player** | Sky-blue theme (`plyr-overrides.css`); control layout (volume hover, auto-hide, no seek tooltip); scrub preview fixes |
| **Subject watch time** | Total video duration in `BatchCourseView` header + Videos tab (`formatTotalStudyDuration`) |
| **Tests** | `server/tests/telegramMedia.test.js` for media classification |

# Recent Changes Log (chat sessions — 2026-08-10)

| Area | Change |
|------|--------|
| **Full course video (link-only)** | Replaced ffmpeg stitch/merge with **`subjectFullCourseService.js`** — link one edited MP4 per subject; meta in `_merged_subjects/{subjectId}.meta.json` with `linkedSourcePath` |
| **Link from path** | `POST /merged-video/link-local` — paste Windows path for 20GB+ files (no upload); **Replace full course** still browser upload (Multer ~8 GB cap) |
| **Playback fix** | `getStreamBackendBaseUrl()` + `getFullCourseStreamUrl()` — always Express stream API (`127.0.0.1:5001`), not Vite :5173; suffix HTTP ranges (`bytes=-N`) in `streamLocalFile.js` for huge MP4 moov |
| **Static root files** | `createLocalMediaRootStaticHandler` serves files at CDS UPLOAD root; full-course player still uses stream API (not broken `/uploads/` paths) |
| **UI** | `SubjectPlayAllPremium` — Link from path, Replace, Locate, Play full course; `SubjectFullVideoPage` at `/subject/:subjectId/full-video` |
| **Bulk progress** | `POST /api/progress/subject/:subjectId/toggle-all` — mark entire subject complete (or clear if already 100%) |
| **Removed** | `subjectMergeService.js`, virtual multi-chapter playlist, stitch/merge/download-full-video routes — user supplies one edited file instead |
| **CDS PYQ (AI) mode** | New Arena mode `cds_pyq` — AI paper-style MCQs (confusables, idioms, antonyms, word pairs, match lists); default on Practice page; cream paper UI |
| **PYQ fallback** | Works without OpenAI using bank-seeded templates; tests in `vocabularyCdsPyq.test.js` |
| **Telegram PDF Save** | `?download=1` bypasses 8 MB stream cap; client validates size + `%PDF` header (fixes ~8.8 MB → 8 MB corrupt downloads) |
| **Telegram Import PDF UX** | View in new tab; Save to PC with Telegram filename; title defaults from Telegram file name; filename search; layout scroll fix |
| **PC Media Locate** | PowerShell Explorer reveal for `_stream_cache` items/folder; stream-cache table shows **videos only** (hides PDFs) |

# Recent Changes Log (chat sessions — 2026-08-06)

| Area | Change |
|------|--------|
| **CDS Vocabulary Arena** | Replaced `/vocabulary` flashcard-first screen with premium dashboard and active mixed/MCQ/reverse/typing/context/weak/root/exam drills |
| **Vocabulary sessions** | Persistent server-authoritative sessions + review logs; timer, keyboard controls, explanations, final accuracy/weak-category/review report |
| **Exam SRS** | Shared deterministic `vocabularySrsService`; confidence + correct/wrong history + overdue/recent-miss weak ranking; legacy review remains compatible |
| **Vocabulary analytics** | 14-day accuracy, practice modes, category strengths/weaknesses, most missed and queue health |
| **Vocabulary import** | CSV/Excel/OCR/text preview, extended CDS fields, row errors, duplicate detection and safe valid-row commit |
| **Root explorer** | Searchable root families + family mini-practice |
| **Mission integration** | Today's Target displays due/weak Vocabulary directive; completed drills log `StudySession(type=vocabulary)` |
| **Telegram updates (duplicate fix)** | `telegramImportFilters.js` — skip duplicate titles + user-skipped message IDs; no false “N new” badges; update import won't re-add duplicates |
| **Lesson reorder** | `PATCH /api/contents/reorder`; ↑↓ buttons in `SubjectLessonAccordion`; shared `contentSort.js` (client + server) |
| **Stream cache (localhost)** | `telegramStreamCacheService` wired to stream route; play-first (no block on cache miss); `_stream_cache` under `LOCAL_MEDIA_ROOT` |
| **PC Media Storage page** | `/settings/pc-media` — configure root path, view library/stream/playback cache usage |
| **Timeline scrub preview** | Hover thumbnails on progress bar when fully cached or PC-library downloaded (`timelineScrubPreview.js`) |
| **Video player** | Replaced custom controls with **Plyr** (`CdsPlyrPlayer.jsx`); F=fullscreen, arrows ±5s, screenshot button + S key |
| **React crash fix** | Imperative `<video>` inside Plyr wrapper — avoids StrictMode `removeChild` errors |
| **Screenshot** | `videoScreenshot.js` — conditional `crossOrigin`, same-origin `/api` URLs via Vite proxy |
| **Infinite buffering** | `applyVideoSource` rAF race fix; stall watchdog (18s, 2 retries); player remount on retry; Telegram stream loader overlay |
| **Telegram status UX** | `TelegramConnectionStatus` banner; `checkTelegramConnectionLive()` on `GET /telegram/session`; recheck on focus/visibility |
| **Telegram updates speed** | `fetchNewChannelMediaSince()` — single GramJS call with `minId` per channel vs per-topic scans |
| **Telegram update UI** | Check for updates button, progress overlay, cancel, error toasts |
| **Cloudinary dashboard** | New `/cloudinary` page — storage used/remaining, progress bars, console links, 60s auto-refresh |
| **Cloudinary delete** | `cloudinaryAsset.js` URL parsing; `paperCleanupService.js`; thumbnail delete; destroy retry |
| **Usage API** | 60s cache, `?refresh=1`, Free plan 25 GB limit fallback, `storageLimitFromPlan` flag |
| **Bug fixes** | `getCloudConfig` import in `cloudinaryUsageService.js`; empty cloud progress bar (no fake 8% fill) |

---

*Last comprehensive audit: 2026-08-16 (includes YouTube CDS Plyr player, full-quality yt-dlp cache, youtube_cookies.txt, scrub preview + speed menu fixes). Repository path: `d:\1. Projects\CDS JOURNEY OTA`.*
