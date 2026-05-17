# CDSJourney Course Manager

Full-stack course content manager for CDS OTA prep, with subject/chapter organization, admin-only management, video/PDF support, upload + URL sources, and progress tracking.

## Tech Stack

- Frontend: React (Vite) + TailwindCSS
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Auth: JWT (admin login)
- Uploads: Multer local file storage

## Folder Structure

```text
client/    # React frontend
server/    # Express backend (MVC)
uploads/   # Local media storage
  videos/
  pdfs/
```

## Features Implemented

- Admin authentication with JWT
- Subject CRUD
- Chapter CRUD
- Content CRUD (video/pdf via file upload or URL)
- Auto-detect content type for URLs and uploads
- Sidebar subject > chapter navigation
- Chapter-wise content dashboard
- Video player page + PDF viewer page
- Search, subject/chapter filters, newest/oldest sorting
- Mark content completed
- Chapter progress and video/pdf totals
- **Previous Year Papers (PYQ)** – Upload or link original question paper PDFs by year; view in-app, filter by year, mark as attempted, optional duration/questions metadata
- **Extract questions** – From a paper PDF, click “Extract questions” to pull all questions and four options in the same order as the paper. View them as cards (question + options) with a **copy** button per question to copy question text and options to the clipboard.
- **PDF digitalization on upload** – When you upload a PDF, the app checks if it has copyable text. If it’s scanned (image-only), it tries to add an OCR text layer using **ocrmypdf** so the PDF becomes copyable. Optional: install `pip install ocrmypdf` and Tesseract OCR on the server; if not installed, you’ll see a warning and can still use text-based PDFs.
- Dark/light mode toggle

## Local Setup

### 1) Start MongoDB

Run MongoDB locally (default URI shown in `.env.example`).

### 2) Backend setup

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Server runs at `http://localhost:5000`.

### 3) Frontend setup

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Client runs at `http://localhost:5173`.

## API Overview

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/POST /api/subjects`
- `PUT/DELETE /api/subjects/:id`
- `GET/POST /api/chapters`
- `PUT/DELETE /api/chapters/:id`
- `GET/POST /api/contents`
- `GET/PUT/DELETE /api/contents/:id`
- `GET/POST /api/papers` (list, create with PDF upload or URL)
- `GET/PUT/DELETE /api/papers/:id`
- `GET /api/papers/:id/analysis` (get extracted questions list)
- `POST /api/papers/:id/extract` (extract questions + options from PDF)
- `POST /api/papers/:id/progress` (toggle attempted)
- `POST /api/progress/toggle/:contentId`
- `GET /api/progress/chapter/:chapterId`

## Notes

- Uploads are stored in root `uploads/videos` and `uploads/pdfs`.
- Static files are served from `/uploads`.
- On first server start, admin user is auto-created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`.
- For **Extract questions**, set `OPENAI_API_KEY` (and optionally `OPENAI_ANALYSIS_MODEL`, default `gpt-4o-mini`) in `server/.env`.
