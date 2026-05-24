# CDS Journey OTA — Project Context (for AI assistants)

This document is the single source of truth for any AI model joining this project. Read it first before writing code, refactoring, or answering questions about the codebase. It captures purpose, architecture, environment split (local vs production), data model, APIs, file conventions, and feature-level behaviour of the monorepo at `d:\CDS JOURNEY OTA`.

---

## 1. Product Overview

**CDS Journey** is a single-admin, full-stack web app to manage and study UPSC CDS (Combined Defence Services) / OTA preparation material. It is a personal learning hub for one administrator who curates content across multiple coaching batches and CDS exam cycles. Some UI copy references **CDS · IMA** alongside the product name.

### Media strategy (important)

The app behaves differently depending on **`NODE_ENV`** on the server and whether the browser is on **localhost**:

| Context | Lesson videos | Course PDFs | PYQ PDFs |
|---------|---------------|-------------|----------|
| **Local dev** (`localhost` frontend + `NODE_ENV !== "production"`) | File upload → local `/uploads/...` (`videoSourceType: "local"`), or YouTube download → compress → **Cloudinary**, or Telegram link | Local disk under `uploads/<cycle>/<batch>/subjects/<Subject>/pdfs/` | Upload → OCR check → **Cloudinary** (`pdfUrl`) |
| **Production** (`NODE_ENV === "production"`, e.g. Vercel frontend) | **Telegram links only** (`videoSourceType: "telegram"`) or **Telegram import** (GramJS stream / optional Cloudinary cloudify) — no video file uploads | Same local or URL PDF flow as dev (PDF uploads still allowed) | Same Cloudinary flow |

MongoDB stores **metadata** (URLs, public IDs, Telegram message ids, duration) — not video bytes. Video screenshot **notes** live in the **browser** (IndexedDB + localStorage fallback), not on the server.

Primary use cases:

- Organise study material as **CDS cycle → coaching batch → subject → chapter → content (video / PDF)**.
- **Import from Telegram** coaching channels (forum topics or flat channels), with auto-sync, batch updates, and optional Cloudinary migration for smooth playback.
- Watch videos with screenshots, notes, resume position, dark mode, and custom playback controls (HTML5, Telegram stream proxy, YouTube embed, Cloudinary CDN).
- View PDFs inline; mark items completed; track per-chapter progress.
- Upload **Previous Year Question Papers (PYQ)** to Cloudinary; OCR scanned PDFs; mark papers as attempted.
- Build **Vocabulary / Idioms / One-word substitutions** with spaced repetition (SRS), CSV/Excel/image OCR import, and a daily practice card.
- Daily **study tracker** with per-subject targets, watch history, exam countdown, and a target-completed celebration overlay.
- **Daily Mission command center** (`/mission`) — AI-guided daily targets: 1 English + 1 Maths + 1 GS video, reading session, optional Sunday mock; discipline score, streaks, analytics (`/history/intelligence`).

There is only one logged-in admin (auto-seeded on first run). All routes (except `/login` and OAuth callbacks) are protected by JWT.

---

## 2. Tech Stack

### Frontend (`client/`)

- **React 19** + **Vite 7** (SPA).
- **TailwindCSS 4** via `@tailwindcss/vite` (design tokens in `src/index.css`).
- **React Router v7** (`BrowserRouter` in `src/main.jsx`).
- **Axios** for API calls (`src/api/client.js` — resolves `VITE_API_URL`, falls back to same-origin `/api` in production).
- **react-hot-toast**, **react-icons** (Feather `Fi*`), **jspdf**, **jwt-decode**, **clsx**, **date-fns**.
- **react-pdf** + **react-player** (installed; viewers primarily use `<iframe>` for PDFs and custom `<video>` / YouTube / Telegram stream URLs for video).
- Deployed to **Vercel** (`vercel.json` at repo root builds `client/dist`).

### Backend (`server/`)

- **Node.js + Express 5** (ESM, `"type": "module"`).
- **Mongoose 9** on **MongoDB**.
- **JWT** auth (`jsonwebtoken` + `bcryptjs`).
- **Multer 2** disk storage — scratch dirs for videos/PYQ PDFs; course PDFs land in per-subject folders.
- **Cloudinary** v2 — multi-account registry for **videos** (subject mapping) and **PYQ PDFs** (`CLOUDINARY_PAPER_CLOUD`, default `cloud1`).
- **GramJS** (`telegram` npm) — Telegram channel login, media download, streaming.
- **googleapis** — YouTube OAuth upload service (implemented; **not wired** to content upload — see §12).
- **OpenAI Node SDK** — paper extraction / chapter analysis (services exist; HTTP routes not wired).
- **pdf-parse**, **tesseract.js**, **xlsx**, **helmet**, **cors**, **morgan**, **dotenv**, **express-validator**.
- Optional CLI: **ffmpeg** (video compress), **yt-dlp** + **ffmpeg** (YouTube download in dev), **ocrmypdf** (PDF OCR layer).
- `eng.traineddata` at `server/eng.traineddata` for Tesseract.

---

## 3. Repository Layout

```
d:/CDS JOURNEY OTA/
├── README.md                 # Short user-facing readme (partially stale vs this file)
├── PROJECT_CONTEXT.md        # THIS FILE
├── SETUP_YOUTUBE.md          # YouTube OAuth setup (service exists; upload path not wired)
├── vercel.json               # Frontend deploy config
├── package-lock.json         # Root lockfile (client + server have their own package.json)
├── client/                   # React frontend (Vite)
├── server/                   # Express backend (MVC)
│   └── scripts/purgeAllMedia.js  # One-shot wipe local + Cloudinary media records
└── uploads/                  # Local media (dev videos, course PDFs, temp scratch, legacy PYQ)
    ├── _tmp_videos/          # Multer scratch before YouTube→Cloudinary or delete
    ├── _tmp_papers/          # Multer scratch before PYQ→Cloudinary
    ├── CDS 2 2026/           # Default active cycle (`DEFAULT_UPLOAD_FOLDER`)
    │   └── <BatchSlug>/subjects/<Subject>/pdfs/<file>.pdf
    └── papers/PYQ/<year>/    # Legacy on-disk PYQ (boot migration); new uploads go to Cloudinary
```

Express serves `/uploads/*` statically (`server/src/app.js`). Vite dev proxies `/api` and `/uploads` to `http://localhost:5000`.

### 3.1 Media storage map

| Kind | Location | Notes |
|------|-----------|--------|
| Course PDFs | `uploads/<CDS X YYYY>/<batch>/subjects/<Subject>/pdfs/` | Multer → disk; URL `/uploads/...` |
| Dev lesson videos | Same tree or `_tmp_videos/` then local path | `sourceType: "upload"`, `videoSourceType: "local"` |
| Prod lesson videos | Telegram `t.me` link **or** GramJS stream via `/api/telegram/stream/...` **or** Cloudinary after import/cloudify | See `resolveContentSrc()` |
| PYQ PDFs (new) | **Cloudinary** raw asset | `Paper.pdfUrl`, `publicId`, `cloudType`; temp file deleted after upload |
| Legacy PYQ | `uploads/papers/PYQ/<year>/` | Boot migration only; prefer Cloudinary for new papers |
| YouTube → Cloudinary | Cloudinary CDN | Dev only: `sourceType: "youtube_download"` pipeline |
| Vocab import images | In-memory OCR | Not persisted |
| Screenshot notes | Browser IndexedDB `cds_screenshot_notes_db` | `client/src/utils/screenshotNotes.js` |

---

## 4. High-level Architecture

```
React (Vite, 5173 local / Vercel prod)
  │
  │  /api/*  Authorization: Bearer <JWT>
  │  Telegram stream: /api/telegram/stream/:messageId?channelId=&token=
  ▼
Express (5000)
  │
  ├─ MongoDB (cdsjourney-course-manager)
  │
  ├─ Local /uploads     → dev videos + course PDFs
  ├─ Cloudinary         → PYQ PDFs; dev YouTube/Telegram cloudify videos
  ├─ GramJS (Telegram)  → channel import, media download, byte-range stream
  ├─ OpenAI / Serper    → paper AI services (library-only HTTP)
  ├─ ffmpeg             → 720p H.264 compress before Cloudinary (≤100 MB)
  └─ yt-dlp             → dev YouTube download only
```

**Auth:** Single `Admin` auto-created from `.env`. `protect` middleware validates JWT; `protectStream` also accepts `?token=` for `<video>` elements. Frontend stores JWT in `localStorage` key `cds_token`.

**CORS:** `server/src/config/cors.js` — allows `CLIENT_URL`, `CLIENT_URLS`, localhost, and `*.vercel.app`.

---

## 5. Environment & Local Setup

### `server/.env` (representative)

```env
PORT=5000
NODE_ENV=development          # "production" disables local video upload & YouTube download
MONGO_URI=mongodb://127.0.0.1:27017/cdsjourney-course-manager
JWT_SECRET=<long random>
JWT_EXPIRES_IN=1d
CLIENT_URL=http://localhost:5173
CLIENT_URLS=                    # comma-separated extra CORS origins

ADMIN_EMAIL=admin@gmail.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=CDS Admin

OPENAI_API_KEY=<key>
OPENAI_ANALYSIS_MODEL=gpt-4o-mini
SERPER_API_KEY=<optional>

# Cloudinary multi-account (videos + optional usage panel)
CLOUDINARY_CLOUDS=cloud1,cloud2
CLOUDINARY_DEFAULT_CLOUD=cloud1
CLOUDINARY_CLOUD1_NAME=...
CLOUDINARY_CLOUD1_API_KEY=...
CLOUDINARY_CLOUD1_API_SECRET=...
# Optional separate keys for Admin usage API (403 workaround):
# CLOUDINARY_CLOUD1_USAGE_API_KEY=...
# CLOUDINARY_CLOUD1_USAGE_API_SECRET=...

CLOUDINARY_PAPER_CLOUD=cloud1   # which account stores PYQ PDFs

# Telegram (GramJS) — required for import/sync/stream
TELEGRAM_API_ID=<integer from my.telegram.org>
TELEGRAM_API_HASH=<hash>
TELEGRAM_SYNC_INTERVAL_MS=900000   # auto-sync interval (default 15 min)
TELEGRAM_VIDEO_CLOUDIFY=1          # 0 = stream-only import (no Cloudinary push)
TELEGRAM_STREAM_CACHE=1
TELEGRAM_STREAM_CHUNK_KB=2048
TELEGRAM_STREAM_WAIT_MS=45000
TELEGRAM_STREAM_TAIL_MB=8

# Video compression (before Cloudinary)
VIDEO_COMPRESS_ALWAYS=1
VIDEO_COMPRESS_HEIGHT=720
VIDEO_COMPRESS_CRF=23
VIDEO_COMPRESS_PRESET=medium

# YouTube OAuth (implemented but not used by content upload — see SETUP_YOUTUBE.md)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/youtube/callback
```

### `client/.env`

```env
VITE_API_URL=http://localhost:5000/api
VITE_SERVER_URL=http://localhost:5000
```

On Vercel, set `VITE_API_URL` to your backend URL (or use a reverse proxy to `/api`).

### Commands

```bash
# Backend
cd server && npm install && npm run dev

# Frontend
cd client && npm install && npm run dev
```

### Server boot sequence (`server/src/server.js`)

1. Connect MongoDB; reload Cloudinary registry.
2. Drop legacy `Subject.name_1` unique index; backfill `courseId` → `cds-2-2026`.
3. `migrateProgrammesAndSubjects()` — default **Main** batch per CDS cycle.
4. Drop legacy `Vocabulary` `{userId, word}` index; `syncIndexes()`.
5. `ensureDefaultAdmin()`.
6. `cleanupBrokenYoutubeTempFiles()`.
7. `organizeContentUploadsBySubject()` — legacy file layout migration.
8. `organizePaperUploadsByYear()` — legacy PYQ folder migration.
9. Listen on `PORT`; start `startTelegramAutoSync()` background job.

---

## 6. Domain Hierarchy & On-disk Layout

```
CDS cycle ids: cds-1-2026 (April I), cds-2-2026 (September II). UI default: cds-2-2026.
└── Coaching batch (Programme)   e.g. "Main", "Golf Batch"
    └── Subject                  e.g. "History" (may link to Telegram topic via telegramTopicId)
        └── Chapter
            └── Content (video | pdf)
```

Helpers:

- `server/src/config/cdsCourses.js` — cycle id ↔ folder name (`CDS 2 2026`).
- `client/src/config/courses.js` — exam date **2026-09-13**, season start **2026-05-24**, UI exposes **CDS (II) 2026** only.
- `server/src/utils/slugifyFolder.js`, `server/src/middlewares/uploadMiddleware.js`.
- Filename parser: `"CHAPTER NAME 2025-12-16.mkv"` → chapter + title via `parseChapterAndTitleFromFilename()`.

---

## 7. Data Model (Mongoose)

All schemas use `{ timestamps: true }` unless noted.

| Model | File | Key fields | Notes |
|---|---|---|---|
| `Admin` | `Admin.js` | `email`, `password`, `name` | Single seeded admin |
| `Programme` | `Programme.js` | `name`, `folderSlug`, `cdsCycleId` | Unique `{cdsCycleId, folderSlug}` |
| `Subject` | `Subject.js` | `name`, `programmeId`, `telegramTopicId`, `telegramSubjectKey`, `telegramChannelId` | Unique `{name, programmeId}`; Telegram linkage for imported subjects |
| `Chapter` | `Chapter.js` | `subjectId`, `chapterName` | Unique `{subjectId, chapterName}`; numeric collation on list |
| `Content` | `Content.js` | `type`, `sourceType` (`upload`\|`url`\|`cloudinary`\|`telegram`), `videoSourceType` (`local`\|`telegram`), `filePath`, `videoUrl`, `publicId`, `cloudType`, `duration`, `telegram*` fields, `importSortOrder` | See schema for full Telegram metadata |
| `SubjectCloudMapping` | `SubjectCloudMapping.js` | `subjectId`, `cloudType` | Per-subject Cloudinary account |
| `Progress` | `Progress.js` | `userId`, `contentId`, `chapterId`, `completed` | Unique `{userId, contentId}` |
| `Paper` | `Paper.js` | `year`, `title`, `sourceType`, `pdfUrl`, `publicId`, `cloudType`, `filePath`/`url` (legacy) | New uploads → Cloudinary |
| `PaperProgress` | `PaperProgress.js` | `userId`, `paperId`, `attempted` | |
| `PaperAnalysis` | `PaperAnalysis.js` | `paperId`, `status`, `questions[]`, `questionImages[]` | |
| `PaperChapterDetail` | `PaperChapterDetail.js` | `paperId`, `subjectName`, `chapterName`, AI fields | |
| `Vocabulary` | `Vocabulary.js` | `userId`, `type`, `word`, SRS fields | Unique `{userId, type, word}` |
| `DailyMission` | `DailyMission.js` | `userId`, `date`, `items[]`, `progressPercent`, `disciplineScore` | Unique `{userId, date}` |
| `StudySession` | `StudySession.js` | Server-side video/reading/mock logs | |
| `ReadingSession` | `ReadingSession.js` | Daily reading timer + minutes | Unique `{userId, date}` |
| `MockTestResult` | `MockTestResult.js` | Mock scores, accuracy, weak subjects | |
| `StudyAnalytics` | `StudyAnalytics.js` | Cached period snapshots | Unique `{userId, period, periodKey}` |
| `OAuthCredentials` | `OAuthCredentials.js` | `provider`, `refreshToken`, `accountChannelTitle`, … | YouTube OAuth (one row per provider) |
| `TelegramSession` | `TelegramSession.js` | `stringSession`, `phone`, `isActive` | GramJS session persistence |
| `TelegramChannelMapping` | `TelegramChannelMapping.js` | `channelId`, `programmeId`, `syncTopicIds[]`, `syncSubjectKeys[]`, `channelMode` (`forum`\|`flat`), `lastSyncedMessageId` | Auto-sync config per channel+batch |

---

## 8. Backend Internals (`server/src/`)

```
src/
├── app.js                          # Express mount + static /uploads
├── server.js                       # Bootstrap + Telegram auto-sync
├── config/
│   ├── cdsCourses.js
│   ├── cloudinary.js               # Multi-account registry (env-driven)
│   ├── cors.js
│   └── db.js
├── controllers/
│   ├── authController.js           # login, me, YouTube OAuth
│   ├── chapterController.js
│   ├── cloudMappingController.js
│   ├── contentController.js        # upload, bulk, cloudify
│   ├── paperController.js          # PYQ → Cloudinary
│   ├── programmeController.js
│   ├── progressController.js
│   ├── subjectController.js
│   ├── telegramController.js
│   └── vocabularyController.js
├── middlewares/
│   ├── authMiddleware.js
│   ├── streamAuthMiddleware.js     # JWT via header or ?token=
│   ├── errorMiddleware.js
│   └── uploadMiddleware.js
├── models/ …
├── routes/
│   ├── authRoutes.js
│   ├── chapterRoutes.js
│   ├── cloudMappingRoutes.js
│   ├── contentRoutes.js
│   ├── paperRoutes.js
│   ├── programmeRoutes.js
│   ├── progressRoutes.js
│   ├── subjectRoutes.js
│   ├── telegramRoutes.js
│   └── vocabularyRoutes.js
├── services/
│   ├── chapterDetailService.js
│   ├── cloudinaryUploadService.js  # video + PDF upload/destroy
│   ├── cloudinaryUsageService.js   # Admin API usage snapshot
│   ├── contentCleanupService.js    # Unified local + Cloudinary delete
│   ├── paperAnalysisService.js
│   ├── paperExtractService.js
│   ├── paperOrganizationService.js # Legacy disk migration
│   ├── paperResearchService.js
│   ├── pdfDigitalizeService.js
│   ├── programmeCleanupService.js
│   ├── programmeMigrationService.js
│   ├── subjectCleanupService.js    # Cascade delete with asset cleanup
│   ├── telegramFlatChannelService.js
│   ├── telegramMappingService.js
│   ├── telegramPdfImportService.js
│   ├── telegramService.js          # GramJS client
│   ├── telegramStreamCacheService.js
│   ├── telegramSyncService.js      # Background auto-sync
│   ├── telegramVideoImportService.js  # Download → compress → Cloudinary
│   ├── uploadOrganizationService.js
│   ├── uploadProgressBus.js        # In-memory upload job state
│   ├── videoCloudPrepService.js    # ffmpeg compress gate
│   ├── videoCompressService.js
│   ├── youtubeDownloadService.js
│   └── youtubeUploadService.js     # Not wired to content create
└── utils/
    ├── chapterHelpers.js
    ├── contentHelpers.js           # MIME/URL detect, Telegram link helper
    ├── slugifyFolder.js
    └── telegramFlatChannel.js
```

### 8.1 Route mounts (summary)

All `/api/*` below except `POST /auth/login`, `GET /auth/youtube/callback` require JWT.

**Auth**
- `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/auth/youtube/status|connect`, `GET /api/auth/youtube/callback`, `DELETE /api/auth/youtube`

**Programmes / Subjects / Chapters / Progress** — standard CRUD + `GET /chapters/stats`, `POST /progress/toggle/:contentId`, `GET /progress/chapter/:chapterId`.

**Contents**
- `GET /api/contents` — filters: `subjectId`, `chapterId`, `type`, `search`, `sort` (`newest`|`oldest`|`chapter`), `page`, `limit`, `programmeId`
- `POST /api/contents` — multipart; `sourceType`: `upload` | `url` | `youtube_download` (dev); body fields include `uploadId`, `autoCreateChapters`, `videoSourceType: "telegram"` for prod links
- `POST /api/contents/bulk-upload` — up to 100 files; auto-create chapters from filenames
- `GET /api/contents/upload-progress/:uploadId` — poll compress/upload/download phases
- `POST /api/contents/:id/cloudify` — migrate Telegram-stream video to Cloudinary
- `GET|PUT|DELETE /api/contents/:id`

**Papers (PYQ)**
- `GET|POST /api/papers`, `POST /api/papers/bulk`, `GET|PUT|DELETE /api/papers/:id`, `POST /api/papers/:id/progress`
- Upload path: temp file → optional `ocrmypdf` → `uploadPdfToCloudinary` → delete temp; stores `sourceType: "cloudinary"`

**Cloud mappings**
- `GET /api/cloud-mappings`, `GET /api/cloud-mappings/clouds`, `GET /api/cloud-mappings/usage`
- `POST /api/cloud-mappings`, `PUT /api/cloud-mappings/bulk`, `DELETE /api/cloud-mappings/:subjectId`

**Telegram** (`/api/telegram/…`)
- Session: `POST /login`, `/verify-otp`, `/verify-password`, `GET /session`, `POST /logout`
- Browse: `GET /channels`, `GET /messages/:channelId`, `GET /forum-preview`, `GET /preview-batch`
- Import: `POST /import`, `POST /import-batch`, `POST /cleanup-import`
- Sync: `POST /sync/:channelId`, `POST /sync-all`; mappings: `GET /mappings`
- Updates: `GET /batch-updates`, `POST /update-subject`, `POST /update-batch`
- Stream: `GET /stream/:messageId?channelId=&token=` (uses `protectStream`)

**Health:** `GET /api/health`

**Daily Mission** (`/api/mission/…`)
- `GET /today` — get or auto-generate today's mission + reading + analytics snapshot
- `POST /today/regenerate` — force regenerate mission
- `POST /items/complete` — mark mission slot complete
- `GET|POST /reading/*` — start, pause, resume, complete reading; `PUT /reading/target`
- `POST /mock/submit`, `GET /mock/history`
- `GET /analytics/overview`, `GET /analytics/intelligence`
- `POST /session/log` — log video/reading session (used by video player on exit)

### 8.2 Content upload pipelines

#### Local dev — file upload (video)

1. Multer → `uploads/_tmp_videos/` or resolved subject path.
2. Video saved as `sourceType: "upload"`, `videoSourceType: "local"`, `filePath: "/uploads/..."`.
3. PDF saved locally under subject `pdfs/` folder.

#### Local dev — YouTube download

1. `yt-dlp` → temp MP4 in `_tmp_videos/`.
2. `prepareVideoForCloud()` — ffmpeg 720p H.264 if over size/format thresholds (`VIDEO_COMPRESS_*`).
3. `uploadVideoToCloudinary()` — subject's mapped cloud; progress via `uploadId`.
4. Temp files deleted; `sourceType: "cloudinary"`.

#### Production — Telegram video link

1. Client sends `sourceType: "url"`, `videoSourceType: "telegram"`, t.me URL.
2. `applyTelegramVideoLink()` sets `videoUrl` + `url`; player opens link or uses stream if imported.

#### Telegram import (forum or flat channel)

1. Admin connects Telegram session (phone + OTP + optional 2FA).
2. Maps channel → programme; selects forum topics or flat subject keys.
3. `importBatchByForumTopics` / `importBatchByFlatSubjects` creates/updates Subjects, Chapters, Content.
4. If `TELEGRAM_VIDEO_CLOUDIFY=1` and Cloudinary configured: download via GramJS → compress → Cloudinary (`sourceType: "cloudinary"`). Else: `sourceType: "telegram"` with stream playback.
5. PDFs from Telegram imported via `telegramPdfImportService`.
6. Background `syncAllAutoChannels()` every `TELEGRAM_SYNC_INTERVAL_MS`.

#### Cloudify existing content

`POST /api/contents/:id/cloudify` — `migrateTelegramVideoContentToCloudinary()` for videos still on Telegram stream.

### 8.3 Cloudinary multi-account

Registry in `config/cloudinary.js` reads `CLOUDINARY_CLOUDS` dynamically. `resolveCloudForSubject(subjectId)` checks `SubjectCloudMapping` then `CLOUDINARY_DEFAULT_CLOUD`. UI: `CloudMappingModal.jsx` + `GET /cloud-mappings/usage` for storage credits.

Deletion: `contentCleanupService.destroyContentAssets()` removes Cloudinary assets (video or raw PDF) and local files on content/subject/chapter delete.

### 8.4 Upload progress

`uploadProgressBus.js` holds in-memory state keyed by client-generated `uploadId` (UUID). Phases include `received`, `downloading`, `compressing`, `uploading`, `telegram-download`, `done`, `error`. Client polls `GET /contents/upload-progress/:uploadId` via `client/src/utils/uploadProgress.js`. UI: `UploadProgress.jsx`, `OperationProgressOverlay.jsx`.

### 8.5 Vocabulary SRS

Same as before: `again` / `good` / `easy` in `reviewVocabulary`; import via CSV/XLSX/image OCR or structured text paste.

---

## 9. Frontend Internals (`client/src/`)

```
src/
├── main.jsx              # Providers: Theme, Auth, Study; Toaster
├── App.jsx               # Routes + DocumentTitle + StudyCompleteCelebration
├── index.css             # Tailwind tokens, .btn-*, .input, .modal-*
├── api/client.js
├── config/courses.js
├── context/
│   ├── AuthContext.jsx
│   ├── StudyContext.jsx
│   └── ThemeContext.jsx
├── components/
│   ├── Layout.jsx        # Sidebar + Topbar + mobile drawer; page title in content area
│   ├── Sidebar.jsx       # Primary nav
│   ├── Topbar.jsx        # Search, theme, bell → history, user card
│   ├── MobileNav.jsx     # Slide-in sidebar on small screens
│   ├── CoachingBatchSection.jsx
│   ├── BatchCourseView.jsx       # Subject grid/list + lesson accordion (main dashboard UX)
│   ├── SubjectGridCard.jsx / SubjectListRow.jsx / SubjectLessonAccordion.jsx
│   ├── ContentCard.jsx / ContentModal.jsx / ContentEditModal.jsx
│   ├── CloudMappingModal.jsx
│   ├── TelegramImportModal.jsx   # Legacy modal (full page preferred)
│   ├── OperationProgressOverlay.jsx / UploadProgress.jsx / Loader.jsx
│   ├── ExamCountdown.jsx / StudyTracker.jsx / StudyTargetModal.jsx
│   ├── StudyCompleteCelebration.jsx / DocumentTitle.jsx
│   ├── PaperCard.jsx / PaperModal.jsx
│   └── LanguageLearningPage.jsx
├── pages/
│   ├── LoginPage.jsx
│   ├── DashboardPage.jsx         # / — batch/subject/content hub
│   ├── TelegramImportPage.jsx    # /import/telegram
│   ├── VideoPlayerPage.jsx       # /video/:id
│   ├── ScreenshotViewerPage.jsx
│   ├── PdfViewerPage.jsx
│   ├── PapersPage.jsx / PaperViewerPage.jsx
│   ├── HistoryPage.jsx
│   ├── VocabularyPage.jsx / IdiomsPage.jsx / OneWordSubstitutionPage.jsx
├── utils/
│   ├── media.js          # isLocalFrontend, resolveContentSrc, Telegram stream URLs
│   ├── uploadProgress.js
│   ├── screenshotNotes.js
│   ├── youtubeThumbnail.js
│   └── subjectThemes.js
```

### 9.1 Routes (`App.jsx`)

| Path | Page |
|---|---|
| `/login` | public |
| `/` | Dashboard |
| `/mission` | Today's Target — daily mission command center |
| `/import/telegram` | Telegram import wizard |
| `/video/:id`, `/video/:id/screenshot/:noteId` | Video + screenshot viewer |
| `/pdf/:id` | PDF viewer |
| `/papers`, `/paper/:id` | PYQ list + viewer |
| `/history` | Watch history |
| `/history/intelligence` | Study intelligence & analytics |
| `/vocabulary`, `/idioms`, `/one-word-substitution` | Language learning |

### 9.2 Local vs production UI (`ContentModal.jsx`)

- **`isLocalFrontend()`** — hostname `localhost` or `127.0.0.1`.
- **Local:** upload files, URL, YouTube download, Telegram link.
- **Production:** Telegram video link, PDF upload, PDF URL only (no video file upload).

### 9.3 Video playback (`VideoPlayerPage.jsx` + `media.js`)

Always use **`resolveContentSrc(item)`**:

1. Telegram GramJS stream → `/api/telegram/stream/...?token=`
2. Telegram t.me link → external URL
3. Cloudinary → `videoUrl`
4. Local upload → `/uploads/...` (proxied in dev)
5. YouTube → embed + thumbnail-based screenshot notes

AI Ask panel UI exists but **`canUseAiAsk = false`** (disabled).

### 9.4 Dashboard flow (`DashboardPage.jsx`)

- Persists filters in `cds_dashboard_filters` (cycle, programme, subject, chapter, search, sort, page).
- **BatchCourseView** — subject cards, expand to **SubjectLessonAccordion**, Telegram import button → `/import/telegram?programmeId=...`.
- Batch/subject **update from Telegram** via `/telegram/batch-updates`, `/update-batch`, `/update-subject`.
- Bulk uploads chunked (10 files); progress overlay for long operations.

### 9.5 LocalStorage keys

| Key | Purpose |
|---|---|
| `cds_token` | JWT |
| `cds_theme` | light/dark |
| `cds_dashboard_filters` | Dashboard selection state |
| `cds_study_*` | Study tracker targets + today's minutes |
| `cds_watch_history` | Last 50 videos |
| `cds_celebration_shown_date` | Daily target celebration |
| `cds_video_position_<id>` | Resume position |
| `cds_video_page_theme` | Video page theme override |
| `cds_journey_app_created_at` | Exam countdown anchor |
| `cds_remembered_login` | Login form |
| IndexedDB `cds_screenshot_notes_db` | Screenshot notes (primary) |

---

## 10. Conventions & Gotchas

- **Production media gate:** `isProductionMediaMode()` = `NODE_ENV === "production"`. Never assume video file upload works in prod.
- **Frontend locality:** `isLocalFrontend()` is separate from server `NODE_ENV` — both matter for expected behaviour.
- **Always use `resolveContentSrc()`** for playable URLs; do not hard-code Cloudinary vs `/uploads`.
- **PYQ PDFs** are Cloudinary-first (`pdfUrl`); legacy `filePath` under `/uploads/papers/` may still exist until migrated.
- **Telegram stream auth:** `<video src>` cannot send headers — append `?token=` from `localStorage`.
- **Multer limit:** 5 GB per file; bulk content 100 files.
- **Cloudinary free tier:** compress targets ≤ ~95 MB (`CLOUDINARY_FREE_LIMIT_BYTES`); fails with clear error if still too large.
- **Chapter sort:** `.collation({ locale: "en", numericOrdering: true })` for "Chapter 2" before "Chapter 10".
- **Subject delete:** use `subjectCleanupService.deleteSubjectTree()` pattern — destroys Cloudinary + local assets, mappings, progress.
- **Exam dates:** update `client/src/config/courses.js` and `server/src/config/cdsCourses.js` for new cycles.

---

## 11. Where to make common changes

| Goal | Touch |
|---|---|
| Add CDS cycle | `client/src/config/courses.js`, `server/src/config/cdsCourses.js` |
| New page | `client/src/pages/`, `App.jsx`, `Sidebar.jsx` |
| Change local PDF layout | `uploadMiddleware.js`, `uploadOrganizationService.js` |
| Add Cloudinary account | `CLOUDINARY_CLOUDS` + env vars only |
| Telegram import behaviour | `telegramMappingService.js`, `telegramVideoImportService.js`, `TelegramImportPage.jsx` |
| Wire paper AI extract HTTP | `paperRoutes.js` + `paperExtractService` |
| Change SRS | `vocabularyController.js` → `reviewVocabulary` |
| Study time tracking | `useStudy().addStudyMinutes()` |
| Purge all media | `node server/scripts/purgeAllMedia.js` |

---

## 12. Known TODOs / Soft Spots

- **`/api/papers/:id/extract`**, **`/analysis`**, chapter detail routes — services exist, **not wired** in `paperRoutes.js` (README mentions them).
- **YouTube direct upload** — `youtubeUploadService.js` + OAuth routes exist; **`contentController` does not call it** (`SETUP_YOUTUBE.md` describes intended flow; `uploadDestination` not implemented). Dev uses `youtube_download` → Cloudinary instead.
- **AI Ask panel** in `VideoPlayerPage` — built but disabled.
- **`GEMINI_API_KEY`** — unused.
- **Legacy disk PYQ** — boot migration may move old files; new uploads skip local year folders.
- **PYQ filter `cdsSlot`** — title regex `/CDS\s*1\b/i` or `/CDS\s*2\b/i`.
- **In-memory upload progress** — lost on server restart; client should tolerate missing jobs.
- **Telegram auto-sync** — requires active session + mapped `syncTopicIds` / `syncSubjectKeys`; silently skips if no session.

---

## 13. Deployment notes

- **Frontend:** Vercel builds `client/` (`vercel.json`). Production hostname example in CORS defaults: `https://mission-final-call.vercel.app`.
- **Backend:** Must run separately (not in repo Vercel config) with `NODE_ENV=production`, MongoDB URI, Telegram + Cloudinary env, and CORS allowing the Vercel origin.
- Set client `VITE_API_URL` to the public backend `/api` base.

---

## 14. Glossary

- **CDS** — Combined Defence Services exam (UPSC); written twice yearly (I April, II September).
- **OTA** — Officers' Training Academy.
- **PYQ** — Previous Year Question paper.
- **Programme / coaching batch** — Named bucket inside a CDS cycle (e.g. "Main").
- **Cloudify** — Download Telegram video → compress → upload to Cloudinary for CDN playback.
- **SRS** — Spaced repetition for vocabulary practice.

---

When in doubt: prefer the file paths in this document; use `resolveContentSrc()` on the client; respect the **production vs local** media split; keep protected routes behind `protect`; update both client and server config when adding a CDS cycle.
