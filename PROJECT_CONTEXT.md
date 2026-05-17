# CDS Journey OTA — Project Context (for AI assistants)

This document is a single source of truth for any AI model joining this project. Read this first before writing code, refactoring, or answering questions about the codebase. It captures the purpose, architecture, data model, APIs, file conventions, and feature-level behaviour of the entire monorepo at `d:\CDS JOURNEY OTA`.

---

## 1. Product Overview

**CDS Journey** is a single-admin, full-stack web app to manage and study UPSC CDS (Combined Defence Services) / OTA preparation material. It is a personal learning hub for one administrator who curates content across multiple coaching batches and CDS exam cycles. Some UI copy (papers, login) references **CDS · IMA** alongside the product name.

**Storage model (current):** New videos are stored on **Cloudinary** across multiple accounts (cloud1, cloud2, …) chosen per-subject via an admin-controlled mapping. PDFs and any legacy `sourceType: "upload"` videos live on local disk under `uploads/` (served at `/uploads/*`). MongoDB stores **metadata** for videos (URLs, public IDs, duration) — not the video bytes. Video screenshot **notes** (canvas captures + timestamps) live in the **browser** (IndexedDB, with a small localStorage mirror), not on the server.

Primary use cases:

- Organise study material as **CDS cycle → coaching batch → subject → chapter → content (video / PDF)**.
- Watch videos with screenshots, notes, resume position, dark mode, and playback controls.
- View PDFs inline; mark items as completed; track per‑chapter progress.
- Upload **Previous Year Question Papers (PYQ)**, extract MCQs (number + 4 options) via OpenAI, OCR scanned PDFs, mark papers as attempted.
- Build **Vocabulary / Idioms / One-word substitutions** with spaced repetition (SRS), CSV/Excel/image OCR import, and a daily practice card.
- Daily **study tracker** with per-subject targets, watch history, exam countdown, and a target-completed celebration overlay.

There is only one logged-in admin (auto-seeded on first run). All routes (except `/login`) are protected by JWT.

---

## 2. Tech Stack

### Frontend (`client/`)

- **React 19** + **Vite 7** (SPA).
- **TailwindCSS 4** via `@tailwindcss/vite` plugin (utility-first styling, design tokens in `src/index.css`).
- **React Router v7** (`BrowserRouter` in `src/main.jsx`).
- **Axios** for API calls (`src/api/client.js`, base URL `VITE_API_URL`).
- **react-hot-toast** for toasts (mounted in `main.jsx`).
- **react-icons** (Feather set `Fi*`) for icons.
- **react-pdf** + **react-player** (installed; current viewers use plain `<iframe>` for PDFs and a custom `<video>` + YouTube embed pipeline for video).
- **jspdf** for exporting screenshot notes as PDF.
- **jwt-decode**, **clsx**, **date-fns** utilities.

### Backend (`server/`)

- **Node.js + Express 5** (ESM modules, `"type": "module"`).
- **Mongoose 9** on **MongoDB**.
- **JWT** auth via `jsonwebtoken` + `bcryptjs` for password hashing.
- **Multer 2** disk storage. Videos land in `uploads/_tmp_videos/` and are then pushed to Cloudinary; PDFs stay under `uploads/<course folder>/<batch>/subjects/<Subject>/pdfs/` (course folder from `cdsCourses.js`, e.g. `CDS 2 2026`).
- **Cloudinary** (`cloudinary` npm v2) for video storage. The server holds a *registry* of accounts (cloud1, cloud2, …) loaded from env vars and picks the destination account per subject using `SubjectCloudMapping` (admin-controlled).
- **helmet**, **cors**, **morgan**, **dotenv**, **express-validator**.
- **OpenAI Node SDK** for paper question extraction and chapter analysis (default model `gpt-4o-mini`).
- **pdf-parse** to extract text from PDFs.
- **tesseract.js** for OCR (vocabulary image imports).
- **xlsx** for Excel imports (vocabulary).
- Optional CLI tools shelled out by the server:
  - `ocrmypdf` (Python) to add OCR text layer to scanned PDFs.
  - `yt-dlp` + `ffmpeg` to download YouTube videos. Files are downloaded to `uploads/_tmp_videos/`, uploaded to Cloudinary, and the temp file is deleted.
- `eng.traineddata` at `server/eng.traineddata` is the Tesseract English language data file.

---

## 3. Repository Layout

```
d:/CDS JOURNEY OTA/
├── README.md                # Short user-facing readme
├── PROJECT_CONTEXT.md       # THIS FILE
├── package-lock.json        # root lockfile (root has no package.json; client + server have their own)
├── client/                  # React frontend (Vite)
├── server/                  # Express backend (MVC)
└── uploads/                 # Local media: PDFs, PYQ PDFs, temp video scratch, optional legacy videos
    ├── _tmp_videos/         # Multer scratch dir before pushing to Cloudinary (also yt-dlp temp files)
    ├── CDS 2 2026/         # Default active cycle folder (`DEFAULT_UPLOAD_FOLDER` in cdsCourses.js)
    │   └── <BatchFolderSlug>/subjects/<Subject_Name_safe>/pdfs/<file>.pdf
    ├── CDS 1 2026/         # Legacy / second-cycle folder if that cycle is still used on disk
    │   └── … (same batch/subjects/pdfs layout)
    └── papers/PYQ/<year>/   # Bulk-uploaded PYQ PDFs organised by year
```

`uploads/` is served as static files at `/uploads/...` by Express (`server/src/app.js`). Vite's dev server proxies both `/api` and `/uploads` to `http://localhost:5000` (see `client/vite.config.js`). New video uploads are uploaded to Cloudinary and play from the CDN; the temp file under `_tmp_videos` is removed after a successful upload.

### 3.1 Media storage map (where bytes actually live)

| Kind | Location | Notes |
|------|-----------|--------|
| Course PDFs | Repo `uploads/<CDS X YYYY>/<batch>/subjects/<Subject>/pdfs/` | Multer → move; URL path `/uploads/...` |
| PYQ PDFs | Repo `uploads/papers/PYQ/<year>/` | `paperOrganizationService` + static `/uploads` |
| New videos | **Cloudinary** (per-account, per-subject mapping) | Temp file `uploads/_tmp_videos/*` then deleted; `Content.videoUrl`, `publicId`, `cloudType` in MongoDB |
| Legacy / upload videos | Same `uploads/...` tree as PDFs if `sourceType === "upload"` | Older content; `resolveContentSrc` in `client/src/utils/media.js` |
| External / YouTube | Remote URL or YouTube embed | Metadata in MongoDB; optional `thumbnail` |
| Vocab import images | In-memory / request only | OCR via `tesseract.js`; nothing persisted as image files |
| Video screenshot notes | **Browser** IndexedDB `cds_screenshot_notes_db` / store `notes_by_video` | `client/src/utils/screenshotNotes.js`; includes data URLs for captures; localStorage holds a trimmed copy for fallback |
| Paper analysis images | MongoDB `PaperAnalysis.questionImages[].path` | Schema supports `/uploads/...` paths; no separate writer path is wired in services yet beyond the model |

---

## 4. High-level Architecture

```
React (Vite, 5173)
  │
  │  /api/* axios (Authorization: Bearer <JWT>)
  │  Videos: <video src="https://res.cloudinary.com/.../<publicId>.mp4">  ← direct from Cloudinary CDN
  ▼
Express (5000) ── Mongoose ── MongoDB (cdsjourney-course-manager)
  │
  ├─ Multer (PDF)         → uploads/<CDS X YYYY>/<batch>/subjects/<name>/pdfs/
  ├─ Multer (video)       → uploads/_tmp_videos/  ──┐
  │                                                  │ upload_large + chunk_size=20MB
  │                                                  ▼
  ├─ Cloudinary registry  → cloud1 / cloud2 / …  (per-subject mapping in SubjectCloudMapping)
  │                          └─ MongoDB stores videoUrl + publicId + cloudType + duration
  ├─ Static /uploads      → PDFs + legacy videos only
  ├─ OpenAI (paper extraction / chapter detail / vocab assistance)
  ├─ Serper (optional web search for paper research)
  ├─ ocrmypdf             (PDF digitalization on upload, optional)
  ├─ Tesseract.js         (vocab image OCR, in-process)
  └─ yt-dlp + ffmpeg      (YouTube → temp MP4 H.264/AAC → Cloudinary)
```

**Auth model:** A single `Admin` user is auto-created from `.env` on first boot. All protected routes use the `protect` middleware which validates `Authorization: Bearer <jwt>` and attaches `req.user` (`Admin` document minus password). The frontend stores the JWT in `localStorage` under the key `cds_token` and decorates every request via an axios interceptor.

---

## 5. Environment & Local Setup

### `server/.env`

```
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/cdsjourney-course-manager
JWT_SECRET=<long random>
JWT_EXPIRES_IN=1d
CLIENT_URL=http://localhost:5173

ADMIN_EMAIL=admin@gmail.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=CDS Admin

OPENAI_API_KEY=<openai key>     # required for paper extraction / chapter detail
OPENAI_ANALYSIS_MODEL=gpt-4o-mini  # optional override
SERPER_API_KEY=<serper key>     # optional, enables web-search-backed research
GEMINI_API_KEY=<gemini key>     # currently unused by routes; reserved

# --- Cloudinary multi-account video storage ---
CLOUDINARY_CLOUDS=cloud1,cloud2     # comma-separated list of cloud keys
CLOUDINARY_DEFAULT_CLOUD=cloud1     # used when a subject has no explicit mapping

CLOUDINARY_CLOUD1_NAME=<cloud1 cloud name>
CLOUDINARY_CLOUD1_API_KEY=<cloud1 api key>
CLOUDINARY_CLOUD1_API_SECRET=<cloud1 api secret>

CLOUDINARY_CLOUD2_NAME=<cloud2 cloud name>
CLOUDINARY_CLOUD2_API_KEY=<cloud2 api key>
CLOUDINARY_CLOUD2_API_SECRET=<cloud2 api secret>

# To add a third (or fourth, …) account at runtime:
#   1. Append the key to CLOUDINARY_CLOUDS, e.g. "cloud1,cloud2,cloud3"
#   2. Add CLOUDINARY_CLOUD3_NAME / _API_KEY / _API_SECRET
# No code changes required — the registry discovers new clouds dynamically.
```

### `client/.env`

```
VITE_API_URL=http://localhost:5000/api
VITE_SERVER_URL=http://localhost:5000
```

### Commands

```
# Backend
cd server && npm install && npm run dev    # nodemon src/server.js
# Frontend
cd client && npm install && npm run dev    # vite, default port 5173
```

Server boot (`server/src/server.js`) performs migrations and housekeeping:
1. Connect MongoDB.
2. Drop legacy `Subject.name_1` unique index.
3. Backfill `courseId` for legacy subjects (missing/empty → `cds-2-2026`; `nda-2026` → `cds-2-2026`).
4. Run `migrateProgrammesAndSubjects()` to create default `Main` coaching batches per CDS cycle and attach orphan subjects.
5. Drop legacy `Vocabulary` unique index and re-sync (uniqueness now scoped by `(userId, type, word)`).
6. `ensureDefaultAdmin()` seeds the admin if missing.
7. `cleanupBrokenYoutubeTempFiles()` deletes leftover `.fNNN.*`, `.part`, `.ytdl` files.
8. `organizeContentUploadsBySubject()` moves uploads into the `CDS X YYYY/<batch>/subjects/<Subject>/{videos|pdfs}/` layout and cleans up legacy `subjects/<ObjectId>/` folders.
9. `organizePaperUploadsByYear()` moves PYQ PDFs into `uploads/papers/PYQ/<year>/`.

---

## 6. Domain Hierarchy & On-disk Layout

Hierarchy is intentionally **hard-coded for CDS only**:

```
CDS cycle ids: cds-1-2026 = CDS I (April); cds-2-2026 = CDS II (September). Active default for uploads and UI: cds-2-2026 / folder `CDS 2 2026`.
└── Coaching batch (Programme)   e.g. "Main", "Golf Batch", "Arjuna Batch"
    └── Subject                  e.g. "History", "English"
        └── Chapter              e.g. "Modern India"
            └── Content (video | pdf; source = upload | url | youtube_download | cloudinary)
```

Disk paths under `uploads/` (PDFs and legacy videos only — new videos go to Cloudinary):

```
uploads/<CDS X YYYY>/<BatchFolderSlug>/subjects/<Subject_Name_safe>/pdfs/<file>.pdf
uploads/papers/PYQ/<year>/<paper>.pdf
uploads/_tmp_videos/<file>.mp4         # scratch dir for video upload pipeline
```

Cloudinary layout (created automatically when a video is uploaded):

```
<cloud_name>/cds-journey/<CDS X YYYY>/<BatchFolderSlug>/<Subject_Name_safe>/videos/<title>_<timestamp>
```

Key helpers:

- `server/src/config/cdsCourses.js` — maps `cdsCycleId` → folder name (`"CDS 1 2026"`, `"CDS 2 2026"`).
- `server/src/utils/slugifyFolder.js` — sanitises batch folder names (spaces → `_`, strips Windows-illegal chars).
- `server/src/middlewares/uploadMiddleware.js` — at upload time, resolves `Subject → Programme → cdsCycleId` and chooses the destination directory.
- `server/src/services/uploadOrganizationService.js` and `paperOrganizationService.js` — idempotent migrations on every boot.

Client config mirrors this in `client/src/config/courses.js` (exam dates, milestones, season window: 2026-03-01 to 2026-09-13). The UI currently exposes **CDS (II) 2026** only; default cycle id is `cds-2-2026` (matches `DEFAULT_COURSE_ID` in `cdsCourses.js`).

---

## 7. Data Model (Mongoose)

All schemas use `{ timestamps: true }` unless noted.

| Model | File | Key fields | Indexes & notes |
|---|---|---|---|
| `Admin` | `models/Admin.js` | `email` (unique, lowercased), `password` (bcrypt hash), `name` | Single seeded admin |
| `Programme` | `models/Programme.js` | `name`, `folderSlug`, `cdsCycleId`, `description` | Unique `{cdsCycleId, folderSlug}`. Mongoose still defaults `cdsCycleId` to `cds-1-2026` if omitted at create; boot migration seeds a **Main** programme per known cycle from `CDS_CYCLE_IDS`, and active uploads/UI default to **`cds-2-2026`**. |
| `Subject` | `models/Subject.js` | `name`, `programmeId` → Programme, `description` | Unique `{name, programmeId}` |
| `Chapter` | `models/Chapter.js` | `subjectId`, `chapterName` | Unique `{subjectId, chapterName}` |
| `Content` | `models/Content.js` | `subjectId`, `chapterId`, `title`, `type` (`video`/`pdf`), `sourceType` (`upload`/`url`/`cloudinary`), `filePath`, `url`, `thumbnail`, **`videoUrl`** (Cloudinary secure URL), **`publicId`**, **`cloudType`**, **`duration`** (s), **`uploadedAt`** | Cloudinary fields are populated only when `sourceType === "cloudinary"` |
| `SubjectCloudMapping` | `models/SubjectCloudMapping.js` | `subjectId` (unique), `cloudType` | Admin-controlled assignment of subjects to a Cloudinary account |
| `Progress` | `models/Progress.js` | `userId`, `contentId`, `chapterId`, `completed` | Unique `{userId, contentId}` |
| `Paper` | `models/Paper.js` | `year`, `title`, `examType` (default `CDS`), `description`, `sourceType`, `filePath`/`url`, `durationMinutes`, `totalQuestions` | Compound `{year:-1, createdAt:-1}` |
| `PaperProgress` | `models/PaperProgress.js` | `userId`, `paperId`, `attempted`, `attemptedAt` | Unique `{userId, paperId}` |
| `PaperAnalysis` | `models/PaperAnalysis.js` | `paperId`, `status` (`pending`/`processing`/`completed`/`failed`), `questions[{number,text,options[]}]`, `questionImages[{number,path}]` (paths typically under `/uploads/...` when used), `errorMessage` | Unique `{paperId}` |
| `PaperChapterDetail` | `models/PaperChapterDetail.js` | `paperId`, `subjectName`, `chapterName`, `topics[]`, `questions[]` (with `correctAnswer`, `explanation`, `subTopic`), `noQuestions`, `typicalTopics[]`, `examIdentifier` | Unique `{paperId, subjectName, chapterName}` |
| `Vocabulary` | `models/Vocabulary.js` | `userId`, `type` (`vocabulary`/`idiom`/`one_word`), `word`, `meaning`, `example`, `synonyms[]`, `tags[]`, `level` (`new`/`learning`/`mastered`), `easeFactor`, `intervalDays`, `reviewCount`, `lastReviewedAt`, `nextReviewAt` | Unique `{userId, type, word}` |

---

## 8. Backend Internals (`server/src/`)

```
src/
├── app.js                 # Express app, middlewares, routes mount
├── server.js              # bootstrap + migrations + start
├── config/
│   ├── cdsCourses.js      # CDS cycle ↔ upload folder name mapping
│   ├── cloudinary.js      # Multi-account Cloudinary registry (lazy, env-driven)
│   └── db.js              # mongoose.connect
├── controllers/
│   ├── authController.js
│   ├── chapterController.js
│   ├── cloudMappingController.js # CRUD for SubjectCloudMapping + resolveCloudForSubject()
│   ├── contentController.js      # Now pushes videos to Cloudinary
│   ├── paperController.js
│   ├── programmeController.js
│   ├── progressController.js
│   ├── subjectController.js
│   └── vocabularyController.js
├── middlewares/
│   ├── authMiddleware.js  # JWT protect
│   ├── errorMiddleware.js # notFound + error handler
│   └── uploadMiddleware.js# Multer disk storage: videos→_tmp_videos, PDFs→subject folder
├── models/ ...            # (see §7)
├── routes/
│   ├── authRoutes.js
│   ├── chapterRoutes.js
│   ├── cloudMappingRoutes.js
│   ├── contentRoutes.js
│   ├── paperRoutes.js
│   ├── programmeRoutes.js
│   ├── progressRoutes.js
│   ├── subjectRoutes.js
│   └── vocabularyRoutes.js
├── services/
│   ├── chapterDetailService.js     # OpenAI sub-topics, explanations, answer-key fetch
│   ├── cloudinaryUploadService.js  # uploadVideoToCloudinary (upload_large) + destroy
│   ├── paperAnalysisService.js     # PDF→text, AI bifurcation by subject/chapter
│   ├── paperExtractService.js      # OpenAI MCQ extraction (number + 4 options)
│   ├── paperOrganizationService.js # Move PYQ PDFs to /papers/PYQ/<year>/
│   ├── paperResearchService.js     # Serper + OpenAI fallback when PDF text is poor
│   ├── pdfDigitalizeService.js     # Detect non-digital PDFs, run ocrmypdf
│   ├── programmeMigrationService.js# Ensure default "Main" Programme per cycle
│   ├── uploadOrganizationService.js# Move legacy local uploads into Subject-name folders
│   └── youtubeDownloadService.js   # yt-dlp + ffmpeg, supports custom targetDir
└── utils/
    ├── contentHelpers.js  # MIME/URL → "video"|"pdf", YouTube thumbnail builder
    └── slugifyFolder.js
```

### 8.1 `app.js` route mounts

```
POST /api/auth/login           authController.loginAdmin
GET  /api/auth/me              authController.me (protected)

# All below are protected by JWT middleware.
GET    /api/programmes          ?cdsCycleId=cds-2-2026 → list (optional filter)
POST   /api/programmes          { name, description, cdsCycleId }
PUT    /api/programmes/:id      rename / description
DELETE /api/programmes/:id      only if no subjects attached

GET    /api/subjects            ?programmeId=...
POST   /api/subjects            { name, description, programmeId }
PUT    /api/subjects/:id
DELETE /api/subjects/:id        cascades chapters/content/progress

GET    /api/chapters            ?subjectId=...   collation=numericOrdering
GET    /api/chapters/stats      per-chapter totals + user's completed count
POST   /api/chapters            { subjectId, chapterName }
PUT    /api/chapters/:id
DELETE /api/chapters/:id        cascades

GET    /api/contents            ?subjectId&chapterId&type&search&sort&page&limit&programmeId
POST   /api/contents            multipart (file?) + body
                                sourceType ∈ { upload, url, youtube_download }
POST   /api/contents/bulk-upload multipart (files[]) up to 100
GET    /api/contents/:id
PUT    /api/contents/:id        title / subjectId / chapterId
DELETE /api/contents/:id        deletes file if `upload`

GET    /api/papers              ?year&sort=yearDesc|oldest&page&limit&cdsSlot=1|2
POST   /api/papers              multipart (PDF) + body, runs PDF digitalize check
POST   /api/papers/bulk         multipart (files[] PDFs) — year & title parsed from filename
GET    /api/papers/:id
PUT    /api/papers/:id          multipart
DELETE /api/papers/:id          deletes file + analysis + progress
POST   /api/papers/:id/progress toggle attempted/unmarked

# Note: there is currently NO route file for the OpenAI extract/analyze endpoints
# even though the services exist (`paperExtractService`, `paperAnalysisService`,
# `chapterDetailService`). The README references /api/papers/:id/extract,
# /api/papers/:id/analysis — these are not yet wired into `paperRoutes.js`.

POST /api/progress/toggle/:contentId
GET  /api/progress/chapter/:chapterId

# Cloudinary multi-account routing (admin-only, same JWT auth as everything else).
GET    /api/cloud-mappings           list all subjects with their effective + assigned cloud
GET    /api/cloud-mappings/clouds    { available: ["cloud1","cloud2"], default: "cloud1" }
POST   /api/cloud-mappings           upsert one  { subjectId, cloudType }
PUT    /api/cloud-mappings/bulk      upsert many { items: [{ subjectId, cloudType }, ...] }
DELETE /api/cloud-mappings/:subjectId  clear mapping (subject falls back to default cloud)

GET  /api/vocabulary               ?type&search&level&dueOnly&sort&alpha&page&limit&all
GET  /api/vocabulary/stats         ?type
GET  /api/vocabulary/practice      ?type&limit  (due first, fallback to recent)
POST /api/vocabulary               { type, word, meaning, example, synonyms, tags, level }
POST /api/vocabulary/import        multipart file (CSV / XLSX / image via OCR)
POST /api/vocabulary/import-text   { type, text }   structured paste (Word:/Meaning Hindi:/...)
PUT  /api/vocabulary/:id
DELETE /api/vocabulary/:id
POST /api/vocabulary/:id/review    { result: "again"|"good"|"easy" }  → SRS update

GET  /api/health                   { status: "ok" }
GET  /uploads/...                  static files from /uploads
```

### 8.2 Content upload pipeline (single file via `POST /api/contents`)

1. **Multer destination**:
   - **Videos** → `uploads/_tmp_videos/` (scratch dir, deleted after Cloudinary push).
   - **PDFs** → existing per-subject folder (`uploads/<cycle>/<batch>/subjects/<Subject>/pdfs/`).
   - Filename = `<safe_originalname>_<timestamp><ext>`.
2. `contentController.createContent` detects `type` from MIME or URL.
3. For `sourceType === "upload"` with **video**:
   - Resolves the destination cloud via `resolveCloudForSubject(subject._id)` (mapping → default fallback).
   - Calls `cloudinaryUploadService.uploadVideoToCloudinary({ absoluteFilePath, cloudType, courseFolder, batchFolder, subjectName, titleHint, originalFilename })` which invokes `cloudinary.uploader.upload_large(...)` with **20 MB chunk size**, **30-minute timeout**, `resource_type: "video"`, and a Cloudinary `folder` of `cds-journey/<cycle>/<batch>/<subject>/videos`.
   - Deletes the temp file (success or failure).
   - Saves `Content` with `sourceType: "cloudinary"`, `videoUrl`, `publicId`, `cloudType`, `duration`, `uploadedAt`.
4. For `sourceType === "upload"` with **PDF**: unchanged — stored locally and served at `/uploads/...`.
5. For `sourceType === "url"`: unchanged — only the URL is stored.
6. For `sourceType === "youtube_download"`:
   - Calls `youtubeDownloadService.downloadYouTubeVideo({ url, targetDir: TEMP_VIDEO_UPLOAD_DIR, ... })` which now accepts an explicit `targetDir` so the download lands in `uploads/_tmp_videos/`.
   - Pushes the resulting MP4 to Cloudinary using the same flow as #3.
   - Deletes the temp file.
   - Saves `Content` with `sourceType: "cloudinary"`. The YouTube thumbnail URL is still stored in `thumbnail`.

### 8.2.5 Cloudinary multi-account architecture

This is the only place new clouds need to be plugged in. There is **no hard-coded list** anywhere else in the codebase.

#### Components

| Piece | File | Responsibility |
|---|---|---|
| Registry | `server/src/config/cloudinary.js` | Reads `CLOUDINARY_CLOUDS` env var, builds an in-memory map of `{ cloudKey → { cloud_name, api_key, api_secret, secure: true } }`. Lazy (built on first access) so it sees env vars loaded by `dotenv.config()`. Exposes `listAvailableClouds`, `getDefaultCloud`, `getCloudConfig`, `getCloudinaryFor`, `reloadCloudRegistry`. |
| Mapping store | `server/src/models/SubjectCloudMapping.js` | One document per subject: `{ subjectId (unique), cloudType }`. |
| Mapping API | `server/src/controllers/cloudMappingController.js` + `routes/cloudMappingRoutes.js` | CRUD + bulk upsert + `resolveCloudForSubject()` (returns mapped cloud, falls back to `CLOUDINARY_DEFAULT_CLOUD`). |
| Upload service | `server/src/services/cloudinaryUploadService.js` | `uploadVideoToCloudinary({ absoluteFilePath, cloudType, courseFolder, batchFolder, subjectName, titleHint, originalFilename })` → returns Cloudinary response. Uses `upload_large` with 20 MB chunks and a 30-minute timeout. `destroyCloudinaryVideo({ cloudType, publicId })` removes a remote asset; failures are logged but do not abort DB cleanup. |
| Frontend UI | `client/src/components/CloudMappingModal.jsx` (opened from `CoachingBatchSection`) | Lists all subjects with batch/cycle context; lets admin pick the cloud per subject; saves via `PUT /api/cloud-mappings/bulk` and `DELETE /api/cloud-mappings/:subjectId` (when reverting to default). |

#### Resolving the cloud for a subject

```
resolveCloudForSubject(subjectId)
  → SubjectCloudMapping.findOne({ subjectId })
    → if found and registered → use its cloudType
    → else → CLOUDINARY_DEFAULT_CLOUD (or first available cloud)
```

#### Adding a third (or fourth, …) Cloudinary account

No code change required:

1. Append the new key to `CLOUDINARY_CLOUDS`, e.g. `cloud1,cloud2,cloud3`.
2. Add `CLOUDINARY_CLOUD3_NAME`, `CLOUDINARY_CLOUD3_API_KEY`, `CLOUDINARY_CLOUD3_API_SECRET`.
3. Restart the server.
4. The `Cloud routing` modal in the dashboard now offers `cloud3` as an option.

The registry's key normalisation accepts arbitrary names (e.g. `bulk`, `main`, `cloud-x`), uppercased and stripped of non-alphanumerics for env-var lookup.

#### Deletion / cleanup

- `DELETE /api/contents/:id` for a Cloudinary video calls `destroyCloudinaryVideo` to remove the remote asset.
- `DELETE /api/subjects/:id` and `DELETE /api/chapters/:id` cascade-delete: any `sourceType: "cloudinary"` content under that subject/chapter is destroyed remotely before the local DB rows are removed. The `SubjectCloudMapping` row is also removed when its subject is deleted.

#### Stored metadata (MongoDB only — no binary content ever)

For each Cloudinary-hosted video the `Content` document stores:

```js
{
  title,           // string
  subjectId,       // ObjectId → Subject
  chapterId,       // ObjectId → Chapter
  type: "video",
  sourceType: "cloudinary",
  videoUrl,        // Cloudinary secure_url (browser plays this directly)
  publicId,        // Cloudinary asset id used for destroy()
  cloudType,       // "cloud1" | "cloud2" | ...
  duration,        // seconds, returned by Cloudinary
  thumbnail,       // optional YouTube thumb (when source was YouTube)
  uploadedAt,      // explicit upload timestamp
  createdAt, updatedAt  // mongoose timestamps
}
```

`filePath` and `url` stay `null` for Cloudinary-hosted videos.

### 8.3 PYQ paper upload pipeline (`POST /api/papers`)

1. Multer (same middleware) initially saves PDFs.
2. `paperController.createPaper` validates year/title, moves the PDF into `uploads/papers/PYQ/<year>/` via `movePaperFileToYearFolder`.
3. `pdfDigitalizeService.ensurePdfDigitalized(absolutePath)`:
   - Reads first text via `pdf-parse`. If `length >= 200` chars, it's already digital.
   - Otherwise runs `ocrmypdf -l eng+hin --output-type pdf <in> <tmp>`; if the binary is missing it tries `python -m ocrmypdf`; finally returns `{ digitalized:false, warning }`.
   - The response includes `pdfDigitalized` and optional `pdfDigitalizeWarning` so the UI toasts a clear message.
4. Bulk upload `POST /api/papers/bulk` parses **year (4-digit 19xx/20xx, last in name)** and **title (filename minus `.pdf`, `_-` → space)** from each filename and inserts each as a separate Paper.

### 8.4 AI services (currently library-only — not all wired to routes)

- `paperExtractService.extractQuestionsFromPaper(paperId)` — pulls the PDF text via `paperAnalysisService.extractTextFromPaper`, sends up to 120k chars to OpenAI with a strict JSON schema (`{ questions: [{ number, text, options[4] }] }`), English-only when both English/Hindi appear, with a fallback prompt if first pass returns zero.
- `paperAnalysisService.runAIBifurcation` / `runFullAnalysis` — classifies each question into one of the existing **subjects + chapters** in the DB. If PDF parsing fails, it falls back to research via `paperResearchService.runResearchBreakdown` (Serper + OpenAI synthesis of typical subject/chapter distribution).
- `chapterDetailService.getOrCreateChapterDetail(paperId, subjectName, chapterName)` — caches a `PaperChapterDetail` with AI-generated sub-topics, optional answer key fetched from web search, and full per-question explanations (3–6 sentences each).
- These services already exist and are tested independently but their **HTTP routes are not in `paperRoutes.js` yet**. When asked to enable “Extract questions” or “Analyse paper”, wire them through new routes.

### 8.5 Vocabulary import / SRS

- File upload (`/api/vocabulary/import`) accepts CSV, XLSX, or image. Images go through `tesseract.js` OCR (in-process) and are parsed with multiple heuristics in `vocabularyController.js` (`extractEntriesFromOcrText`, `parseSimpleLineBlocks`, `parsePastedStructuredText`).
- Text import (`/api/vocabulary/import-text`) accepts the structured paste format used by the UI:

  ```
  Word: Alibi
  Meaning Hindi: ...
  Meaning English: ...
  Synonyms: a, b, c
  Sentence: ...
  ```

- SRS in `reviewVocabulary`:
  - `again` → interval=1, easeFactor -= 0.2 (clamp 1.3–2.8), level = `new`.
  - `good`  → interval = max(2, round(prev*ease)), ease += 0.02, may promote to `learning`.
  - `easy`  → interval = max(4, round(prev*(ease+0.35))), ease += 0.08, may promote to `mastered`.
  - `nextReviewAt = now + clamp(intervalDays, 1, 180) days`.

---

## 9. Frontend Internals (`client/src/`)

```
src/
├── main.jsx           # ReactDOM root, BrowserRouter, Theme/Auth/Study providers, Toaster
├── App.jsx            # Routes + <DocumentTitle/> + <StudyCompleteCelebration/>
├── index.css          # Tailwind + design tokens, .btn-primary, .btn-secondary, .input, .modal-*
├── api/client.js      # axios instance, Authorization header injection, serverBaseUrl export
├── config/courses.js  # CDS cycle metadata (id, exam date, upload folder, accent), milestones, defaults
├── context/
│   ├── AuthContext.jsx   # /auth/me bootstrap, login(email,pwd), logout(), localStorage key cds_token
│   ├── StudyContext.jsx  # Today minutes (total + per-subject), targets, watch history, celebration flag (localStorage)
│   └── ThemeContext.jsx  # light/dark toggle, html.dark class, key cds_theme
├── components/
│   ├── Layout.jsx
│   ├── Sidebar.jsx              # Syllabus tree (subjects + chapters + per-chapter stats)
│   ├── Topbar.jsx               # Navigation, theme toggle, logout menu, compact ExamCountdown + StudyTracker
│   ├── CoachingBatchSection.jsx # CDS cycle picker + Programme (batch) selector
│   ├── ExamCountdown.jsx        # Big countdown + compact mode for topbar
│   ├── StudyTracker.jsx         # Total + per-subject minutes/targets
│   ├── StudyTargetModal.jsx
│   ├── StudyCompleteCelebration.jsx # Confetti overlay when daily target hit
│   ├── DocumentTitle.jsx        # Updates document.title with "N days to exam"
│   ├── ContentCard.jsx          # Video/PDF card, duration probe, completed toggle
│   ├── ContentModal.jsx         # Add content (Upload / URL / YouTube Direct Download)
│   ├── ContentEditModal.jsx
│   ├── SubjectModal.jsx
│   ├── ChapterModal.jsx
│   ├── ProgrammeModal.jsx
│   ├── PaperCard.jsx
│   ├── PaperModal.jsx
│   └── LanguageLearningPage.jsx # Reusable page for vocabulary/idioms/one_word (filters, SRS, import)
├── pages/
│   ├── LoginPage.jsx
│   ├── DashboardPage.jsx        # /  — main hub
│   ├── VideoPlayerPage.jsx      # /video/:id — custom controls, screenshots, study time
│   ├── ScreenshotViewerPage.jsx # /video/:id/screenshot/:noteId
│   ├── PdfViewerPage.jsx        # /pdf/:id — iframe
│   ├── PapersPage.jsx           # /papers — list/add/bulk/edit/delete PYQs
│   ├── PaperViewerPage.jsx      # /paper/:id — iframe + mark attempted
│   ├── HistoryPage.jsx          # /history — watch history (localStorage)
│   ├── VocabularyPage.jsx       # /vocabulary
│   ├── IdiomsPage.jsx           # /idioms
│   └── OneWordSubstitutionPage.jsx # /one-word-substitution
├── utils/
│   ├── media.js              # toAbsoluteMediaUrl, isYouTubeUrl, resolveContentSrc (cloudinary vs /uploads vs external)
│   ├── screenshotNotes.js    # IndexedDB store cds_screenshot_notes_db / notes_by_video (+ localStorage fallback)
│   └── youtubeThumbnail.js   # YouTube thumb → canvas with timestamp overlay (for note "screenshots")
└── assets/                   # static images (logo etc.)
```

### 9.1 Routes (from `App.jsx`)

| Path | Page | Auth |
|---|---|---|
| `/login` | `LoginPage` | public (redirects authed users to `/`) |
| `/` | `DashboardPage` | private |
| `/video/:id` | `VideoPlayerPage` | private |
| `/video/:id/screenshot/:noteId` | `ScreenshotViewerPage` | private |
| `/pdf/:id` | `PdfViewerPage` | private |
| `/papers` | `PapersPage` | private |
| `/paper/:id` | `PaperViewerPage` | private |
| `/history` | `HistoryPage` | private |
| `/vocabulary` | `VocabularyPage` | private |
| `/idioms` | `IdiomsPage` | private |
| `/one-word-substitution` | `OneWordSubstitutionPage` | private |

`PrivateRoute` reads `useAuth()` and renders `<Navigate to="/login" replace />` if not authenticated.

### 9.2 LocalStorage keys (client-side state)

| Key | Set by | Purpose |
|---|---|---|
| `cds_token` | `AuthContext` | JWT access token (axios bearer) |
| `cds_theme` | `ThemeContext` | `"light"` / `"dark"` |
| `cds_dashboard_filters` | `DashboardPage` (+ broadcast event `cds-dashboard-filters-updated`) | Persists selected CDS cycle, programme, subject, chapter, search, sort, page, expanded subject |
| `cds_study_today_date` / `cds_study_today_minutes` / `cds_study_today_by_subject` | `StudyContext` | Today's study totals & per-subject minutes; reset when date changes |
| `cds_study_target_minutes` / `cds_study_target_by_subject` | `StudyContext` | User-defined daily targets |
| `cds_watch_history` | `StudyContext` | Last 50 watched videos |
| `cds_celebration_shown_date` | `StudyContext` | Avoid re-showing celebration same day |
| `cds_video_position_<contentId>` | `VideoPlayerPage` | Resume position |
| `cds_video_page_theme` | `VideoPlayerPage` | Video page dark/light independent of global theme |
| `cds_journey_app_created_at` | `ExamCountdown` | First-run anchor for "previous days" dots |
| `cds_remembered_login` | `LoginPage` | "Remember me" credentials |
| `cds_video_screenshot_notes_<id>` | `screenshotNotes.js` | localStorage fallback (last 5) — primary store is **IndexedDB** `cds_screenshot_notes_db.notes_by_video` |

### 9.3 Video player highlights (`VideoPlayerPage.jsx`)

- Custom HTML5 `<video>` controls (play/pause, seek bar with thumbnail preview at hover, volume, mute, fullscreen, playback rate, settings popover).
- For YouTube URLs (`isYouTubeUrl`): embeds YouTube iframe + uses `youtubeThumbnail.js` to compose "screenshots" from thumbnails when capturing notes (browser cannot read iframe pixels).
- Screenshots saved to IndexedDB (`utils/screenshotNotes.js`) per `contentId`; viewable at `/video/:id/screenshot/:noteId`; export as PDF using `jsPDF` (`exportingPdf` flow).
- Resume: stores `currentTime` every 5 s, minimum resume threshold 5 s.
- Per-video page theme is independent of global (`pageDark`).
- Tracks study time via `useStudy().addStudyMinutes(mins, subjectId)`; adds to watch history (`addToWatchHistory`).
- Has hooks ready for an AI Ask panel (`askMessages`, `processingStartedAt`) but `canUseAiAsk` / `showAskPanel` are currently `false` — UI is hidden until the backend route is wired.

### 9.4 Dashboard data flow (`DashboardPage.jsx`)

1. On mount it reads filters from `cds_dashboard_filters` and broadcasts changes via `window` event `cds-dashboard-filters-updated` (used by `Topbar` + `DocumentTitle`).
2. Loads `Programmes` filtered by `cdsCycleId`, then `Subjects` for the selected programme, then global `Chapters` and `/chapters/stats`.
3. Fetches paginated contents via `/contents` with `programmeId`, `subjectId`, `chapterId`, `search`, `sort`, `page`. The server scopes contents by `programmeId` (resolves to allowed subject IDs).
4. Per-chapter progress comes from `/progress/chapter/:chapterId`.
5. Single & bulk uploads: bulk uploads are chunked into batches of 10 files, with weighted percent in `uploadState`. YouTube Direct Download uses `/api/contents` with `sourceType: "youtube_download"`.

### 9.5 Vocabulary / Idioms / One-word

All three pages are thin wrappers over `LanguageLearningPage.jsx` with `itemType ∈ { vocabulary, idiom, one_word }`. The same component renders stats cards, a daily practice card, filters (search, level, sort, alpha A–Z, due-only), grouped list by first letter, import modal (file + paste-text), and create/edit modal.

---

## 10. Conventions & Gotchas

- **Single admin model**: Authorization is "logged in" or not — there are no roles. `progressController` and `vocabularyController` use `req.user._id` for ownership.
- **Subjects are programme-scoped**, not cycle-scoped directly. Cycle is derived through `Subject → Programme → cdsCycleId`.
- **Two kinds of video URLs** in the DB:
  - `sourceType: "cloudinary"` — `videoUrl` is an absolute Cloudinary `https://res.cloudinary.com/...` URL, played directly by the browser.
  - `sourceType: "upload"` (legacy only) — `filePath` begins with `/uploads/`, resolved via `toAbsoluteMediaUrl()`.
  Always use `resolveContentSrc(item)` from `client/src/utils/media.js` to pick the right one.
- **PDF paths** still begin with `/uploads/`. PDFs were intentionally left local (they are tiny compared to videos, and the user request only asked for video migration). When that needs to change, the same multi-account pattern can be applied to PDFs.
- **Multer size limit**: 5 GB per file (videos). Bulk content upload accepts up to 100 files; bulk paper upload accepts up to 100 PDFs.
- **OCR is best-effort**: missing `ocrmypdf` or `tesseract` does **not** fail the upload — it returns a warning that the UI surfaces.
- **YouTube downloader is optional**: missing `yt-dlp`/`ffmpeg` causes `POST /api/contents` with `sourceType=youtube_download` to return a 400 with a clear error message.
- **Numeric chapter sort**: chapters list uses `.collation({ locale: "en", numericOrdering: true })` so chapter names like "Chapter 2" sort before "Chapter 10".
- **Indexes**: any change in unique fields needs `syncIndexes()` — already done for `Subject` and `Vocabulary` in `server.js` and migration services.
- **Subject delete cascades** chapters, contents, and progress (and the controller removes related files only for contents, not for the subject itself). When designing new features, follow that pattern.
- **Hard-coded exam dates** live in `client/src/config/courses.js` (`EXAM_MILESTONES`, `SEASON_START`, `SEASON_END`). Update for new cycles.

---

## 11. Where to make common changes

| Goal | Touch |
|---|---|
| Add a new CDS cycle | `client/src/config/courses.js` (`COURSES`, `EXAM_MILESTONES`) and `server/src/config/cdsCourses.js` (`COURSE_UPLOAD_FOLDERS`, `CDS_CYCLE_IDS`). |
| Add a new top-level page | New file in `client/src/pages/`, register in `App.jsx`, add nav link in `Topbar.jsx`. |
| Change upload directory layout | `server/src/middlewares/uploadMiddleware.js` and the matching migration in `server/src/services/uploadOrganizationService.js`. |
| Add a 3rd, 4th, … Cloudinary account | Edit only `server/.env`: append the key to `CLOUDINARY_CLOUDS`, add 3 matching env vars, restart. No code change needed. |
| Change subject→cloud mapping at runtime | Open the dashboard → *Cloud routing* button, or call `PUT /api/cloud-mappings/bulk`. |
| Move PDFs to Cloudinary too | Extend `cloudinaryUploadService` with a PDF resource type and switch the PDF branch in `contentController.createContent`. The mapping system already works for arbitrary content. |
| Expose OpenAI question extraction over HTTP | Add a route in `server/src/routes/paperRoutes.js`, call `paperExtractService.extractQuestionsFromPaper` and persist into `PaperAnalysis`. |
| Add a new vocabulary import format | `server/src/controllers/vocabularyController.js` — add a new parser, plug into `importVocabulary` or `importVocabularyText`. |
| Modify SRS algorithm | `reviewVocabulary` in `vocabularyController.js`. |
| Track new study activity | Use `useStudy().addStudyMinutes(minutes, subjectId)` from any page. |

---

## 12. Known TODOs / Soft Spots (read before promising features)

- `/api/papers/:id/extract`, `/api/papers/:id/analysis`, and per-chapter detail endpoints are **not wired** even though services exist. The README still mentions them.
- The AI Ask panel inside `VideoPlayerPage` is built but disabled (`canUseAiAsk = false`).
- `Vocabulary` schema indexes had a legacy `{userId,word}` unique; this is dropped at boot and replaced by `{userId,type,word}` — be careful if recreating the database from old dumps.
- `GEMINI_API_KEY` is present in `.env` but no code currently consumes it.
- Subject delete does **not** remove the on-disk folder (only DB rows and file paths of contents). Cleanup is deferred to migrations on next boot. Cloudinary assets, however, *are* destroyed on subject/chapter/content delete.
- The PYQ filter `cdsSlot` matches by title regex (`/CDS\s*1\b/i` or `/CDS\s*2\b/i`); papers without that token won't match.
- `client/src/assets/` is committed but unused by current pages — safe to leave.

---

## 13. Glossary

- **CDS** — Combined Defence Services exam by UPSC; written paper twice a year (cycle I in April, II in September).
- **OTA** — Officers' Training Academy (one of the academies CDS qualifies for).
- **PYQ** — Previous Year Question paper.
- **Coaching batch / Programme** — A named bucket inside a CDS cycle (e.g. "Golf Batch", "Arjuna Batch", or the default "Main"). Mostly used to separate content folders on disk.
- **SRS** — Spaced Repetition System used for vocabulary practice.

---

When in doubt: prefer the file paths in this document over guesses; keep new uploads under the `uploads/<cycle>/<batch>/subjects/<Subject>/{videos|pdfs}/` convention; keep all protected routes behind the `protect` middleware; and update both client and server config files when adding a new CDS cycle.
