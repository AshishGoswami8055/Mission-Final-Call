#!/usr/bin/env node
/**
 * Copy .env.example → .env for server and client if missing.
 * Generates JWT_SECRET when the placeholder is still present.
 *
 *   node scripts/setup-demo-env.js
 *   node scripts/setup-demo-env.js --force
 *   node scripts/setup-demo-env.js --email you@mail.com --password Secret123 --name Priya
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");

const argValue = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return "";
  return value;
};

const profile = {
  email: argValue("email"),
  password: argValue("password"),
  name: argValue("name"),
};

const copyEnv = (relDir) => {
  const example = path.join(root, relDir, ".env.example");
  const dest = path.join(root, relDir, ".env");
  if (!fs.existsSync(example)) {
    console.error(`Missing ${path.relative(root, example)}`);
    process.exit(1);
  }
  const existed = fs.existsSync(dest);
  if (existed && !force) {
    console.log(`keep  ${path.relative(root, dest)} (already exists; pass --force to overwrite)`);
    return dest;
  }
  fs.copyFileSync(example, dest);
  console.log(`${existed ? "overwrite" : "create"} ${path.relative(root, dest)}`);
  return dest;
};

const ensureJwtSecret = (envPath) => {
  let text = fs.readFileSync(envPath, "utf8");
  if (!/JWT_SECRET=CHANGE_ME_BEFORE_USE\b/.test(text)) return;
  const secret = crypto.randomBytes(48).toString("hex");
  text = text.replace(/JWT_SECRET=CHANGE_ME_BEFORE_USE\b/, `JWT_SECRET=${secret}`);
  fs.writeFileSync(envPath, text);
  console.log("set   JWT_SECRET (random)");
};

const setEnvLine = (text, key, value) => {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.trimEnd()}\n${line}\n`;
};

const applyProfile = (envPath) => {
  if (profile.email == null && profile.password == null && profile.name == null) return;
  let text = fs.readFileSync(envPath, "utf8");
  if (profile.email != null) text = setEnvLine(text, "ADMIN_EMAIL", profile.email);
  if (profile.password != null) text = setEnvLine(text, "ADMIN_PASSWORD", profile.password);
  if (profile.name != null) text = setEnvLine(text, "ADMIN_NAME", profile.name);
  fs.writeFileSync(envPath, text);
  console.log("set   ADMIN_* from --email / --password / --name (used only if you prefer env seed over the signup form)");
};

const serverEnv = copyEnv("server");
copyEnv("client");
ensureJwtSecret(serverEnv);
applyProfile(serverEnv);

console.log(`
Next:
  1. Start MongoDB (local) or put an Atlas URI in server/.env as MONGO_URI
  2. cd server && npm install && npm run dev     → http://localhost:5001
  3. cd client && npm install && npm run dev     → http://localhost:5173
  4. Open http://localhost:5173 → **Create your account** (HER email/password).
     Use HER MongoDB only (MONGO_URI in server/.env). Do not paste the owner's Atlas URI.

Do not copy the owner's server/.env, Mongo URI, Telegram session, or Cloudinary keys.
See DEMO.md
`);
