/** Call backfill API on local running server (uses ADMIN_EMAIL/PASSWORD from .env). */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const apiBase = process.env.API_BASE || "http://127.0.0.1:5001/api";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const days = Number(process.argv[2]) || 4;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env");
  process.exit(1);
}

const loginRes = await fetch(`${apiBase}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const loginBody = await loginRes.json();
if (!loginRes.ok || !loginBody.token) {
  console.error("Login failed:", loginBody.message || loginRes.status);
  process.exit(1);
}

const backfillRes = await fetch(`${apiBase}/mission/streak/backfill`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${loginBody.token}`,
  },
  body: JSON.stringify({ days }),
});
const backfillBody = await backfillRes.json();
if (!backfillRes.ok) {
  console.error("Backfill failed:", backfillBody.message || backfillRes.status);
  process.exit(1);
}

console.log(backfillBody.message);
console.log("Streak:", backfillBody.streak?.streak, "days");
console.log("Recent:", backfillBody.streak?.recentDays?.map((d) => `${d.date}:${d.minutes}m`).join(", "));
