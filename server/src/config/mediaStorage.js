import fs from "node:fs";
import path from "node:path";
import { statfs } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_UPLOADS_ROOT = path.resolve(__dirname, "..", "..", "..", "uploads");
const CONFIG_DIR = path.resolve(__dirname, "..", "..", "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "local-media-storage.json");

export const LOCAL_MEDIA_SUBDIRS = [
  "_local_library",
  "_merged_subjects",
  "_playback_cache",
  "_stream_cache",
];

let cachedRoot = null;

const readConfigFile = () => {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
};

const writeConfigFile = (payload) => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(payload, null, 2));
};

export const resetLocalMediaRootCache = () => {
  cachedRoot = null;
};

/** Root folder for PC library, merged full-course videos, and playback cache. */
export const getLocalMediaRoot = () => {
  if (cachedRoot) return cachedRoot;

  const envRoot = String(process.env.LOCAL_MEDIA_ROOT || "").trim();
  if (envRoot) {
    cachedRoot = path.resolve(envRoot);
    return cachedRoot;
  }

  const fileConfig = readConfigFile();
  if (fileConfig?.rootPath) {
    cachedRoot = path.resolve(fileConfig.rootPath);
    return cachedRoot;
  }

  cachedRoot = PROJECT_UPLOADS_ROOT;
  return cachedRoot;
};

export const isUsingCustomLocalMediaRoot = () =>
  path.resolve(getLocalMediaRoot()) !== path.resolve(PROJECT_UPLOADS_ROOT);

export const getLocalLibraryDir = () => path.join(getLocalMediaRoot(), "_local_library");
export const getMergedSubjectsDir = () => path.join(getLocalMediaRoot(), "_merged_subjects");
export const getMergedPartsDir = () => path.join(getMergedSubjectsDir(), "parts");
export const getPlaybackCacheDir = () => path.join(getLocalMediaRoot(), "_playback_cache");
/** Netscape cookies.txt for yt-dlp YouTube auth (bot check bypass). */
export const getYoutubeCookiesPath = () => path.join(getLocalMediaRoot(), "youtube_cookies.txt");
/** Progressive byte cache while streaming Telegram videos (rewind without re-fetch). */
export const getStreamCacheDir = () => path.join(getLocalMediaRoot(), "_stream_cache");

/** True when `targetPath` resolves inside the configured local media root. */
export const isPathUnderLocalMediaRoot = (targetPath) => {
  const root = path.resolve(getLocalMediaRoot());
  const resolved = path.resolve(String(targetPath || ""));
  if (resolved === root) return true;
  const rel = path.relative(root, resolved);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
};

export const ensureLocalMediaDirs = (root = getLocalMediaRoot()) => {
  fs.mkdirSync(root, { recursive: true });
  for (const subdir of LOCAL_MEDIA_SUBDIRS) {
    fs.mkdirSync(path.join(root, subdir), { recursive: true });
  }
  fs.mkdirSync(getMergedPartsDir(), { recursive: true });
};

export const isLocalMediaWebPath = (webPath = "") => {
  const clean = String(webPath).replace(/^\/uploads\/?/, "");
  return LOCAL_MEDIA_SUBDIRS.some((subdir) => clean === subdir || clean.startsWith(`${subdir}/`));
};

export const toMediaWebPath = (subdir, fileName = "") => {
  const safeSubdir = String(subdir || "").replace(/^\/+|\/+$/g, "");
  const safeName = String(fileName || "").replace(/^\/+/, "");
  return `/uploads/${safeSubdir}/${safeName}`.replace(/\/+/g, "/");
};

/** Resolve /uploads/... on the configured PC media drive or project uploads folder. */
export const resolveMediaAbsolutePath = (webPath = "") => {
  const clean = String(webPath || "").replace(/^\/uploads\/?/, "");
  if (isLocalMediaWebPath(`/uploads/${clean}`)) {
    return path.join(getLocalMediaRoot(), clean);
  }
  if (isUsingCustomLocalMediaRoot()) {
    const customAbsolute = path.join(getLocalMediaRoot(), clean);
    if (fs.existsSync(customAbsolute)) return customAbsolute;
  }
  return path.join(PROJECT_UPLOADS_ROOT, clean);
};

const dirSizeBytes = (dirPath, { recursive = false } = {}) => {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(dirPath)) {
    const full = path.join(dirPath, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) total += stat.size;
      else if (recursive && stat.isDirectory()) total += dirSizeBytes(full, { recursive: true });
    } catch {
      /* ignore */
    }
  }
  return total;
};

export const getLocalMediaUsageStats = () => {
  const root = getLocalMediaRoot();
  ensureLocalMediaDirs(root);
  const libraryBytes = dirSizeBytes(getLocalLibraryDir());
  const mergedBytes = dirSizeBytes(getMergedSubjectsDir(), { recursive: true });
  const cacheBytes = dirSizeBytes(getPlaybackCacheDir());
  const streamCacheBytes = dirSizeBytes(getStreamCacheDir());
  const usedBytes = libraryBytes + mergedBytes + cacheBytes + streamCacheBytes;
  return {
    rootPath: root,
    libraryBytes,
    mergedBytes,
    cacheBytes,
    streamCacheBytes,
    usedBytes,
    usingCustomRoot: isUsingCustomLocalMediaRoot(),
    defaultRootPath: PROJECT_UPLOADS_ROOT,
  };
};

export const getVolumeStats = async (dirPath = getLocalMediaRoot()) => {
  try {
    const stats = await statfs(dirPath);
    const blockSize = stats.bsize || 0;
    const totalBytes = (stats.blocks || 0) * blockSize;
    const freeBytes = (stats.bfree || 0) * blockSize;
    return { totalBytes, freeBytes };
  } catch {
    return { totalBytes: null, freeBytes: null };
  }
};

const copyDirFiles = (fromDir, toDir) => {
  if (!fs.existsSync(fromDir)) return { files: 0, bytes: 0 };
  fs.mkdirSync(toDir, { recursive: true });
  let files = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(fromDir)) {
    const src = path.join(fromDir, name);
    const dest = path.join(toDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      const nested = copyDirFiles(src, dest);
      files += nested.files;
      bytes += nested.bytes;
      continue;
    }
    if (fs.existsSync(dest)) continue;
    fs.copyFileSync(src, dest);
    files += 1;
    bytes += stat.size;
  }
  return { files, bytes };
};

export const migrateLocalMediaRoot = (fromRoot, toRoot) => {
  ensureLocalMediaDirs(toRoot);
  let files = 0;
  let bytes = 0;
  for (const subdir of LOCAL_MEDIA_SUBDIRS) {
    const result = copyDirFiles(path.join(fromRoot, subdir), path.join(toRoot, subdir));
    files += result.files;
    bytes += result.bytes;
  }
  const partsResult = copyDirFiles(
    path.join(fromRoot, "_merged_subjects", "parts"),
    path.join(toRoot, "_merged_subjects", "parts")
  );
  files += partsResult.files;
  bytes += partsResult.bytes;
  return { files, bytes };
};

export const setLocalMediaRoot = ({ rootPath, migrate = false }) => {
  const nextRoot = path.resolve(String(rootPath || "").trim());
  if (!nextRoot) throw new Error("Enter a folder path, e.g. E:\\CDS Journey Media");

  const previousRoot = getLocalMediaRoot();
  if (path.resolve(previousRoot) === nextRoot) {
    return getLocalMediaStorageStatus();
  }

  ensureLocalMediaDirs(nextRoot);

  let migration = null;
  if (migrate && path.resolve(previousRoot) !== nextRoot) {
    migration = migrateLocalMediaRoot(previousRoot, nextRoot);
  }

  writeConfigFile({
    rootPath: nextRoot,
    updatedAt: new Date().toISOString(),
    previousRoot: previousRoot !== PROJECT_UPLOADS_ROOT ? previousRoot : null,
    migratedFiles: migration?.files || 0,
  });

  resetLocalMediaRootCache();
  return {
    ...getLocalMediaStorageStatus(),
    migration,
  };
};

export const getLocalMediaStorageStatus = () => {
  const usage = getLocalMediaUsageStats();
  return {
    ...usage,
    configPath: CONFIG_PATH,
    envOverride: Boolean(String(process.env.LOCAL_MEDIA_ROOT || "").trim()),
  };
};

export const getLocalMediaStorageStatusAsync = async () => {
  const status = getLocalMediaStorageStatus();
  const volume = await getVolumeStats(status.rootPath);
  return {
    ...status,
    envOverride: Boolean(String(process.env.LOCAL_MEDIA_ROOT || "").trim()),
    volume,
  };
};
