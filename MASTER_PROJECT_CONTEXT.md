# MASTER PROJECT CONTEXT — CDS Journey OTA

> **Read this file first** before making any code changes, answering architecture questions, or onboarding to this repository. It is the permanent memory of the project at `d:\1. Projects\CDS JOURNEY OTA`.

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
| **Video playback** | **Plyr** player (`CdsPlyrPlayer`), HTML5 local, Cloudinary CDN, Telegram stream, YouTube embed, screenshot notes, resume position, stall watchdog + retry, Telegram live-connection banner |
| **PDF / PYQ** | Inline viewer, course PDFs on disk, PYQ on Cloudinary, **AI question extract** (`POST /papers/:id/extract`), optional OCR via `ocrmypdf` on upload |
| **Progress** | Per-content completion, chapter stats, paper attempted tracking |
| **Dashboard** | Lazy course loading — subject stats from `/chapters/stats`; lesson rows fetched only when a subject is opened; library view paginated (`limit=20`) |
| **Vocabulary** | Vocabulary / Idioms / One-word substitution with SRS (`again`/`good`/`easy`), CSV/Excel/image OCR import |
| **Study tracker** | Daily minutes, per-subject targets, watch history, exam countdown, celebration overlays |
| **Daily Mission** (`/mission`) | Auto-generated daily plan: 1 English + 1 Maths + 1 GS video + reading; Sunday mock; AI briefing; discipline score; streaks |
| **Analytics** | Study intelligence (`/history/intelligence`), weekly charts, mock trends, video streak (60 min/day goal) |
| **Local PC library** | Download videos to `uploads/_local_library/` for smooth playback (local server only) |
| **Playback cache** | Server-side Telegram stream cache for smoother seeking |
| **Cloudinary multi-account** | Per-subject cloud mapping, **`/cloudinary` storage dashboard** (usage, remaining space, console links), automatic asset delete on content/paper removal, PYQ on dedicated cloud |
| **Telegram UX** | Live connection check on video refresh, “Check for updates” with progress overlay, optimized batch update scan (`fetchNewChannelMediaSince`) |
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
| AI | OpenAI Node SDK — paper extract/analysis, **video AI overview + Ask**, daily mission briefing |
| PDF | pdf-parse, optional ocrmypdf CLI |
| OCR | tesseract.js (vocab image import), `eng.traineddata` at `server/eng.traineddata` |
| Spreadsheet | xlsx (vocab import) |
| Security | helmet, cors, express-validator |
| Logging | morgan |
| Testing | Node.js built-in test runner — `npm test` in `server/` (auth, Cloudinary cleanup, mission scoring, Telegram helpers); GitHub Actions CI |

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
│   ├── vite.config.js            # Dev proxy: /api, /uploads → localhost:5000
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
│       ├── components/           # Reusable UI (Layout, CdsPlyrPlayer, TelegramConnectionStatus, modals, mission/*, streak/*)
│       ├── pages/                # Route-level pages (incl. CloudinaryStoragePage)
│       ├── styles/               # plyr-overrides.css (teal Plyr theme + screenshot button)
│       └── utils/                # media.js, videoScreenshot.js, uploadProgress, screenshotNotes, etc.
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
│       └── utils/                # Helpers (content, chapters, cloudinaryAsset, slugify, buckets)
│
└── uploads/                      # Local media root (sibling of server/, not inside it)
    ├── _tmp_videos/              # Multer scratch before YouTube→Cloudinary or delete
    ├── _tmp_papers/              # Multer scratch before PYQ→Cloudinary
    ├── _local_library/           # PC library downloads (meta.json + video files)
    ├── _playback_cache/          # Telegram stream cache files
    ├── CDS 2 2026/               # Default active cycle folder
    │   └── <BatchSlug>/subjects/<Subject>/pdfs/<file>.pdf
    └── papers/PYQ/<year>/        # Legacy on-disk PYQ (boot migration only)
```

### Important single files

| File | Role |
|------|------|
| `client/src/utils/media.js` | **`resolveContentSrc()`**, `preferSameOriginMediaUrl()`, `resolveVideoPlaybackUrl()` — canonical playback URLs (Vite proxy `/api`) |
| `client/src/utils/videoScreenshot.js` | Frame capture for Plyr; `applyVideoCrossOrigin`, `applyVideoSource`, `resolvePlyrVideoElement` |
| `client/src/components/CdsPlyrPlayer.jsx` | Plyr wrapper — imperative `<video>` (avoids React StrictMode DOM conflicts); stall watchdog |
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
| `server/src/services/uploadProgressBus.js` | In-memory upload job state (UUID `uploadId`); also Telegram update progress |
| `server/src/services/contentCleanupService.js` | Unified delete: Cloudinary (incl. thumbnails + URL fallback) + local files |
| `server/src/services/telegramService.js` | GramJS client, **`checkTelegramConnectionLive()`**, stream, **`fetchNewChannelMediaSince()`** |

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
  → Background syncAllAutoChannels() every TELEGRAM_SYNC_INTERVAL_MS
```

## Progress toggle flow

```
ContentCard "Mark complete" → POST /api/progress/toggle/:contentId
  → progressController.toggleCompleted
  → Progress upsert { userId, contentId, chapterId, completed }
  → Dashboard refetches chapter stats via GET /api/chapters/stats
```

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
- `importSortOrder`, `uploadedAt`, `url`

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
- `userId`, `type` (`vocabulary`|`idiom`|`one_word`), `word`, `meaning`, `example`, `synonyms[]`, `tags[]`
- SRS: `level`, `easeFactor`, `intervalDays`, `reviewCount`, `lastReviewedAt`, `nextReviewAt`
- Unique: `{ userId, type, word }`

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
- `userId`, `date`, `type` (`video`|`reading`|`mock`|`mission`)
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

Base URL: `http://localhost:5000/api` (dev) or `VITE_API_URL` (prod).

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
| GET | `/:id/download-file` | Stream | Download content file (local library file) |
| GET | `/upload-progress/:uploadId` | Yes | Poll upload/compress/download progress |
| GET | `/playback-cache/storage` | Yes | Playback cache disk usage |
| GET | `/local-library/storage` | Yes | PC library disk usage (local only) |
| GET | `/` | Yes | List with filters: `subjectId`, `chapterId`, `type`, `search`, `sort`, `page`, `limit`, `programmeId` |
| POST | `/` | Yes | Create content (multipart `file` optional); `sourceType`: `upload`\|`url`\|`youtube_download`; optional `uploadDestination`: `local`\|`youtube` |
| POST | `/bulk-upload` | Yes | Up to 100 files; auto-create chapters from filenames |
| GET | `/:id/playback-cache` | Yes | Cache status for content |
| POST | `/:id/playback-cache` | Yes | Start Telegram playback cache download |
| DELETE | `/:id/playback-cache` | Yes | Remove cache |
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
| GET | `/chapter/:chapterId` | Chapter progress summary |

## Vocabulary (`/api/vocabulary`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/stats` | Counts by level |
| GET | `/practice` | Due cards for practice; query `type`, `limit` |
| POST | `/import` | CSV/Excel/image OCR import (multipart) |
| POST | `/import-text` | Structured text paste import |
| GET | `/` | List; query `type`, `search`, `level`, pagination |
| POST | `/` | Create entry |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |
| POST | `/:id/review` | SRS review: body `{ result: "again"|"good"|"easy" }` |

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
| GET | `/stream/:messageId` | **Stream auth** — byte-range video stream; query `channelId`, `token` |

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
- Used by: `/api/telegram/stream/:messageId`, `/api/contents/:id/download-file`
- Frontend appends token in `media.js` → `buildTelegramPreviewStreamUrl()`

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
- `telegramService.js` — GramJS client, login, channel list, media download, streaming, **`checkTelegramConnectionLive()`**, **`fetchNewChannelMediaSince()`** (fast update scan)
- `telegramMappingService.js` — forum topic import, **`getProgrammeSubjectUpdates()`** (optimized minId scan)
- `telegramFlatChannelService.js` — flat channel import (caption metadata grouping)
- `telegramVideoImportService.js` — download → compress → Cloudinary
- `telegramPdfImportService.js` — PDF import from channels
- `telegramSyncService.js` — background auto-sync interval
- `telegramStreamCacheService.js` — disk cache for smoother streaming
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

## Vocabulary SRS

Review outcomes:
- **again** → interval 1 day, ease −0.2, level `new`
- **good** → SM-2 style interval, ease +0.02
- **easy** → longer interval, ease +0.08, may reach `mastered`

Practice endpoint returns due items (`nextReviewAt <= now`) or recent fallback.

## Local PC library (`localLibraryService.js`)

- Only when `NODE_ENV !== "production"` OR `LOCAL_LIBRARY_ENABLED=1`
- Downloads Cloudinary, local, or Telegram-stream videos to `uploads/_local_library/`
- Metadata in `{contentId}.meta.json`
- Subject-level bulk download via `POST /subjects/:id/local-library`

## Playback cache (`videoPlaybackCacheService.js`)

- Server-side cache for Telegram streams under `uploads/_playback_cache/`
- `PLAYBACK_CACHE_MAX_MB` (default 512), warn ratio configurable

## Upload progress bus

- In-memory `Map` keyed by client UUID `uploadId`
- Phases: `received`, `downloading`, `compressing`, `uploading`, `telegram-download`, `done`, `error`
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
| `OPENAI_API_KEY` | OpenAI for extract, analysis, AI briefing |
| `OPENAI_ANALYSIS_MODEL` | Model name (default `gpt-4o-mini`) |
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
| `TELEGRAM_STREAM_CACHE` | `0` disables stream disk cache |
| `TELEGRAM_STREAM_CHUNK_KB` | Stream chunk size (default 2048 KB) |
| `TELEGRAM_STREAM_WAIT_MS` | Stream wait timeout (default 45000) |
| `TELEGRAM_STREAM_TAIL_MB` | Tail buffer for seeking (default 8 MB) |
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
| `GOOGLE_CLIENT_ID` | YouTube OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | YouTube OAuth secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `RENDER` / `RENDER_SERVICE_ID` | Detect Render deployment for Telegram key |
| `TUNNEL_MODE` | PM2 tunnel: `quick` (default) or `named` |

## Client environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API base (e.g. `http://localhost:5000/api` or production backend `/api`) |
| `VITE_SERVER_URL` | Server origin for absolute media URLs (e.g. `http://localhost:5000`) |

**Resolution (`api/client.js`):**
- `VITE_API_URL` wins if set
- Dev without env → `http://localhost:5000/api`
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

# Deployment

## Local development

```bash
# Terminal 1 — MongoDB running locally
cd server && npm install && npm run dev    # → http://localhost:5000

# Terminal 2
cd client && npm install && npm run dev    # → http://localhost:5173
```

Copy/configure `server/.env` and `client/.env` with variables above.

Vite proxies `/api` and `/uploads` to port 5000.

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
# Runs cds-api + cloudflared tunnel to localhost:5000
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
- **In-memory upload progress** — lost on server restart
- **Telegram auto-sync** — requires active session + mapped `syncTopicIds`/`syncSubjectKeys`; silently skips if no session
- **Legacy disk PYQ** — boot migration may move old files; new uploads go to Cloudinary only
- **PYQ `cdsSlot` filter** — title regex `/CDS\s*1\b/i` or `/CDS\s*2\b/i`
- **README.md** — partially stale vs actual architecture (mentions local-only uploads, missing mission/Telegram features)
- **Subject model** — server boot still backfills legacy `courseId` field though schema uses `programmeId` hierarchy
- **Production video** — file upload blocked; must use Telegram links or pre-imported stream/Cloudinary content

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
2. **Always use `resolveContentSrc(item)`** on the client for playable URLs — use **`preferSameOriginMediaUrl()`** / **`resolveVideoPlaybackUrl()`** in dev so Vite proxies `/api` (required for screenshots + Telegram streams).
3. **Video player** — use `CdsPlyrPlayer` (imperative video DOM); do not let React reconcile nodes Plyr moves.
4. **Respect production media gate** — `NODE_ENV === "production"` blocks video file upload and YouTube download.
5. **Telegram stream auth** — append `?token=` from `localStorage` for `<video src>`.
6. **Telegram stream playback** — check `GET /telegram/session` `live` before starting player; show `TelegramConnectionStatus` banner.
7. **Chapter sorting** — use `.collation({ locale: "en", numericOrdering: true })` for natural chapter order.
8. **Subject delete** — must use cleanup services to avoid orphaned Cloudinary assets (URL-only legacy rows now parsed via `cloudinaryAsset.js`).
9. **Adding CDS cycle** — update both `client/src/config/courses.js` and `server/src/config/cdsCourses.js`.
10. **Custom hooks** — live in `client/src/hooks/`; prefer extracting from mega-pages when adding features.
11. **Multer limit** — 5 GB per file; bulk content max 100 files per request.
12. **Cloudinary usage dashboard** — needs Admin API read or `CLOUDINARY_<KEY>_USAGE_*` env vars per account.

## Frontend routes (`App.jsx`)

| Path | Page |
|------|------|
| `/login` | Public login |
| `/` | Dashboard (batch/subject/content hub; lazy course content load) |
| `/cloudinary` | **Cloudinary storage** — usage, remaining space, console links |
| `/mission` | Daily mission command center |
| `/import/telegram` | Telegram import wizard |
| `/video/:id` | Video player (Plyr + Telegram status banner + stall retry) |
| `/video/:id/screenshot/:noteId` | Screenshot note viewer |
| `/pdf/:id` | PDF viewer |
| `/papers`, `/paper/:id` | PYQ list + viewer |
| `/history` | Watch history |
| `/history/intelligence` | Study intelligence & analytics |
| `/vocabulary`, `/idioms`, `/one-word-substitution` | Language learning (shared `LanguageLearningPage` pattern) |

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
| Telegram import / updates | `telegramMappingService.js`, `telegramVideoImportService.js`, `TelegramImportPage.jsx` |
| Wire paper chapter detail | `paperRoutes.js` + `chapterDetailService.js` |
| Change SRS algorithm | `vocabularyController.js` → `reviewVocabulary` |
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

---

# Recent Changes Log (chat sessions — 2026-07-01)

| Area | Change |
|------|--------|
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

*Last comprehensive audit: 2026-07-01 (includes video/Telegram/Cloudinary session changes). Repository path: `d:\1. Projects\CDS JOURNEY OTA`.*
