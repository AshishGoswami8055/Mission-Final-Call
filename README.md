# CDS Journey

Personal CDS / OTA study workspace: React (Vite) + Express + MongoDB.

| Doc | Use |
|-----|-----|
| [`DEMO.md`](./DEMO.md) | Friend copy — **her** MongoDB, **her** account, no owner secrets |
| [`MASTER_PROJECT_CONTEXT.md`](./MASTER_PROJECT_CONTEXT.md) | Full architecture (read this before changing code) |
| [`server/SETUP_YOUTUBE.md`](./server/SETUP_YOUTUBE.md) | Optional YouTube unlisted upload |

```text
client/      React app (:5173)
server/      API (:5001)
extension/   Study stopwatch (Chrome)
scripts/     npm run demo:env
uploads/     Local media (not in git)
```

## Run

```bash
npm run demo:env
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

Open http://localhost:5173 — create **your** account on **your** MongoDB. Never paste someone else’s `MONGO_URI`.

Study tracker: load unpacked `extension/cds-youtube-tracker`.
