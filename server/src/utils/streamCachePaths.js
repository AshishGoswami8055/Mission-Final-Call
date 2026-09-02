import fs from "node:fs";
import path from "node:path";
import { ensureLocalMediaDirs, getStreamCacheDir } from "../config/mediaStorage.js";

const INDEX_FILE = "_index.json";
const PENDING_SUBJECT = "Unsorted";
const STREAM_FILE_SUFFIXES = [
  ".meta.json",
  ".bin",
  ".web.mp4",
  ".web.part.mp4",
  ".part.mp4",
  ".mp4",
];

export const sanitizeStreamCacheSegment = (value, fallback = "Untitled") => {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  return cleaned || fallback;
};

export const buildStreamCacheLayout = ({ cacheKey, subjectName, title, fileName }) => {
  const storageRelDir = sanitizeStreamCacheSegment(subjectName, PENDING_SUBJECT);
  const titleSource = title || path.parse(String(fileName || "video.mp4")).name;
  const storageBaseName = `${sanitizeStreamCacheSegment(titleSource, "video")}__${cacheKey}`;
  return { storageRelDir, storageBaseName, cacheKey };
};

const indexFilePath = () => path.join(getStreamCacheDir(), INDEX_FILE);

export const loadStreamCacheIndex = () => {
  const file = indexFilePath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
};

export const saveStreamCacheIndex = (index) => {
  ensureLocalMediaDirs();
  fs.writeFileSync(indexFilePath(), JSON.stringify(index, null, 2));
};

export const updateStreamCacheIndexEntry = (cacheKey, layout) => {
  const index = loadStreamCacheIndex();
  index[cacheKey] = {
    storageRelDir: layout.storageRelDir,
    storageBaseName: layout.storageBaseName,
  };
  saveStreamCacheIndex(index);
};

export const removeStreamCacheIndexEntry = (cacheKey) => {
  const index = loadStreamCacheIndex();
  if (!index[cacheKey]) return;
  delete index[cacheKey];
  saveStreamCacheIndex(index);
};

export const pathsFromLayout = (layout) => {
  const dir = path.join(getStreamCacheDir(), layout.storageRelDir);
  const base = path.join(dir, layout.storageBaseName);
  return {
    dir,
    metaPath: `${base}.meta.json`,
    binPath: `${base}.bin`,
    mp4Path: `${base}.mp4`,
    webMp4Path: `${base}.web.mp4`,
    storageRelDir: layout.storageRelDir,
    storageBaseName: layout.storageBaseName,
  };
};

const legacyPaths = (cacheKey) => {
  const dir = getStreamCacheDir();
  return {
    dir,
    metaPath: path.join(dir, `${cacheKey}.meta.json`),
    binPath: path.join(dir, `${cacheKey}.bin`),
    mp4Path: path.join(dir, `${cacheKey}.mp4`),
    webMp4Path: path.join(dir, `${cacheKey}.web.mp4`),
    storageRelDir: "",
    storageBaseName: cacheKey,
  };
};

export const readMetaAtPath = (metaPath) => {
  if (!metaPath || !fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

/** Walk `_stream_cache` recursively and collect every `.meta.json` path. */
export const collectStreamCacheMetaFiles = (root = getStreamCacheDir()) => {
  const results = [];
  if (!fs.existsSync(root)) return results;

  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === INDEX_FILE) continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (name.endsWith(".meta.json")) results.push(full);
    }
  };

  walk(root);
  return results;
};

const cacheKeyFileKind = (fileName, cacheKey) => {
  for (const suffix of STREAM_FILE_SUFFIXES) {
    if (fileName === `${cacheKey}${suffix}` || fileName.endsWith(`__${cacheKey}${suffix}`)) {
      if (suffix === ".meta.json") return "meta";
      if (suffix === ".bin") return "bin";
      return "mp4";
    }
  }
  return null;
};

const layoutFromFile = (fullPath, cacheKey) => {
  const dir = path.dirname(fullPath);
  const name = path.basename(fullPath);
  const storageRelDir = path.relative(getStreamCacheDir(), dir) || "";
  const storageBaseName = name
    .replace(/\.meta\.json$/i, "")
    .replace(/\.(web\.part\.mp4|web\.mp4|part\.mp4|bin|mp4)$/i, "");
  return { storageRelDir, storageBaseName, cacheKey };
};

const layoutScore = (layout) => {
  let score = 0;
  if (fs.existsSync(layout.mp4Path)) score += 4;
  if (fs.existsSync(layout.binPath)) score += 3;
  if (fs.existsSync(layout.metaPath)) score += 1;
  if (layout.storageRelDir) score += 1;
  return score;
};

/** Find bin/mp4/meta for a cache key even when leftover root meta points at the old path. */
export const discoverStreamCachePaths = (cacheKey) => {
  const key = String(cacheKey || "").trim();
  const root = getStreamCacheDir();
  if (!key || !fs.existsSync(root)) return null;

  const layouts = new Map();
  const extraMetaPaths = [];

  const consider = (fullPath) => {
    const name = path.basename(fullPath);
    const kind = cacheKeyFileKind(name, key);
    if (!kind) return;
    const layout = pathsFromLayout(layoutFromFile(fullPath, key));
    const mapKey = `${layout.storageRelDir}::${layout.storageBaseName}`;
    if (!layouts.has(mapKey)) layouts.set(mapKey, layout);
    if (kind === "meta" && fullPath !== layout.metaPath) extraMetaPaths.push(fullPath);
  };

  const walk = (dir) => {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === INDEX_FILE) continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (stat.isFile()) consider(full);
    }
  };

  walk(root);
  if (!layouts.size) return null;

  const ranked = [...layouts.values()].sort((a, b) => layoutScore(b) - layoutScore(a));
  const best = ranked[0];
  if (layoutScore(best) <= 0) return null;

  if (!fs.existsSync(best.metaPath)) {
    const donor = extraMetaPaths.find((metaPath) => fs.existsSync(metaPath))
      || ranked.slice(1).map((layout) => layout.metaPath).find((metaPath) => fs.existsSync(metaPath));
    if (donor) {
      try {
        fs.mkdirSync(best.dir, { recursive: true });
        fs.copyFileSync(donor, best.metaPath);
      } catch {
        /* playback can still use bin/mp4 */
      }
    }
  }

  return best;
};

const rememberStreamCacheLayout = (cacheKey, layout) => {
  const index = loadStreamCacheIndex();
  if (
    index[cacheKey]?.storageRelDir === layout.storageRelDir &&
    index[cacheKey]?.storageBaseName === layout.storageBaseName
  ) {
    return;
  }
  updateStreamCacheIndexEntry(cacheKey, {
    storageRelDir: layout.storageRelDir,
    storageBaseName: layout.storageBaseName,
  });
};

export const resolveStreamCachePaths = (cacheKey) => {
  const key = String(cacheKey || "").trim();
  if (!key) return legacyPaths("");

  const index = loadStreamCacheIndex();
  if (index[key]) {
    const indexed = pathsFromLayout({ ...index[key], cacheKey: key });
    if (fs.existsSync(indexed.binPath) || fs.existsSync(indexed.mp4Path)) {
      return indexed;
    }
  }

  const discovered = discoverStreamCachePaths(key);
  if (discovered && (fs.existsSync(discovered.binPath) || fs.existsSync(discovered.mp4Path) || fs.existsSync(discovered.metaPath))) {
    rememberStreamCacheLayout(key, discovered);
    return discovered;
  }

  if (index[key]) {
    const indexed = pathsFromLayout({ ...index[key], cacheKey: key });
    if (fs.existsSync(indexed.metaPath)) return indexed;
  }

  const legacy = legacyPaths(key);
  if (fs.existsSync(legacy.metaPath) || fs.existsSync(legacy.binPath) || fs.existsSync(legacy.mp4Path)) {
    return legacy;
  }

  for (const metaPath of collectStreamCacheMetaFiles()) {
    const meta = readMetaAtPath(metaPath);
    const baseName = path.basename(metaPath, ".meta.json");
    if (meta?.cacheKey === key || baseName.endsWith(`__${key}`)) {
      const dir = path.dirname(metaPath);
      const storageRelDir = path.relative(getStreamCacheDir(), dir) || "";
      const layout = {
        storageRelDir,
        storageBaseName: baseName,
        cacheKey: key,
      };
      updateStreamCacheIndexEntry(key, layout);
      return pathsFromLayout(layout);
    }
  }

  return index[key] ? pathsFromLayout({ ...index[key], cacheKey: key }) : legacy;
};

export const streamCacheWebRelPath = (paths, ext = ".mp4") => {
  const rel = paths.storageRelDir
    ? path.join(paths.storageRelDir, `${paths.storageBaseName}${ext}`)
    : `${paths.storageBaseName}${ext}`;
  return rel.replace(/\\/g, "/");
};

const moveFile = (from, to) => {
  if (!from || !to || from === to || !fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    if (fs.existsSync(to)) fs.unlinkSync(to);
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
};

/** Move cache files into `{subject}/{title}__{cacheKey}.*` when content metadata is known. */
export const ensureStreamCacheLayout = (cacheKey, meta, contentMeta = null) => {
  const desired = buildStreamCacheLayout({
    cacheKey,
    subjectName: contentMeta?.subjectName || meta?.subjectName,
    title: contentMeta?.title || meta?.title,
    fileName: meta?.fileName,
  });
  const current = resolveStreamCachePaths(cacheKey);
  const target = pathsFromLayout(desired);

  if (current.metaPath !== target.metaPath || !fs.existsSync(target.metaPath)) {
    fs.mkdirSync(target.dir, { recursive: true });
    for (const kind of ["metaPath", "binPath", "mp4Path", "webMp4Path"]) {
      moveFile(current[kind], target[kind]);
    }
  }

  const metaPath = target.metaPath;
  if (fs.existsSync(metaPath)) {
    const existing = readMetaAtPath(metaPath) || {};
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        ...existing,
        storageRelDir: desired.storageRelDir,
        storageBaseName: desired.storageBaseName,
        subjectName: contentMeta?.subjectName || existing.subjectName || null,
        title: contentMeta?.title || existing.title || null,
        contentId: contentMeta?.contentId || existing.contentId || null,
      })
    );
  }

  updateStreamCacheIndexEntry(cacheKey, desired);
  return target;
};

const forceRemoveFile = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    /* Windows often locks files that are still being streamed — rename frees the original path. */
  }
  try {
    const grave = `${filePath}.${Date.now()}.deleted`;
    fs.renameSync(filePath, grave);
    try {
      fs.unlinkSync(grave);
    } catch {
      /* grave is removed when the reader closes */
    }
    return true;
  } catch {
    return false;
  }
};

const fileBelongsToCacheKey = (fileName, cacheKey) =>
  Boolean(cacheKeyFileKind(fileName, cacheKey)) ||
  (/\.deleted$/i.test(fileName) && fileName.includes(cacheKey));

export const removeStreamCacheFiles = (cacheKey) => {
  const key = String(cacheKey || "").trim();
  if (!key) return;

  const root = getStreamCacheDir();
  if (fs.existsSync(root)) {
    const walk = (dir) => {
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (name === INDEX_FILE) continue;
        const full = path.join(dir, name);
        let stat;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          walk(full);
          continue;
        }
        if (stat.isFile() && fileBelongsToCacheKey(name, key)) {
          forceRemoveFile(full);
        }
      }
    };
    walk(root);
  }

  removeEmptyDirs(root);
  removeStreamCacheIndexEntry(key);
};

const metaKeysOnDisk = () => {
  const keys = new Set();
  for (const metaPath of collectStreamCacheMetaFiles()) {
    const meta = readMetaAtPath(metaPath);
    if (meta?.cacheKey) keys.add(meta.cacheKey);
    else {
      const base = path.basename(metaPath, ".meta.json");
      const match = /__(.+)$/.exec(base);
      if (match) keys.add(match[1]);
      else keys.add(base);
    }
  }
  return keys;
};

const removeEmptyDirs = (root) => {
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
      removeEmptyDirs(full);
      if (!fs.readdirSync(full).length) fs.rmdirSync(full);
    } catch {
      /* ignore */
    }
  }
};

/** Remove orphan cache files and rebuild the index from disk. */
export const reconcileStreamCacheFolder = () => {
  ensureLocalMediaDirs();
  const root = getStreamCacheDir();
  if (!fs.existsSync(root)) return { removedFiles: 0, freedBytes: 0, migrated: 0 };

  const validKeys = metaKeysOnDisk();
  let removedFiles = 0;
  let freedBytes = 0;

  const walkFiles = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === INDEX_FILE) continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walkFiles(full);
        continue;
      }
      if (!stat.isFile()) continue;

      let shouldRemove = false;
      if (name.endsWith(".meta.json")) {
        const meta = readMetaAtPath(full);
        shouldRemove = !meta?.cacheKey && !/__.+\.meta\.json$/.test(name) && !validKeys.has(name.slice(0, -".meta.json".length));
      } else if (name.endsWith(".bin") || name.endsWith(".mp4") || name.endsWith(".deleted")) {
        const base = name
          .replace(/\.\d+\.deleted$/i, "")
          .replace(/\.(web\.part\.mp4|web\.mp4|part\.mp4|bin|mp4)$/i, "");
        const keyMatch = /__(.+)$/.exec(base);
        const cacheKey = keyMatch ? keyMatch[1] : base;
        shouldRemove = !validKeys.has(cacheKey) || name.endsWith(".deleted");
      } else {
        shouldRemove = true;
      }

      if (!shouldRemove) continue;
      try {
        freedBytes += stat.size;
        fs.unlinkSync(full);
        removedFiles += 1;
      } catch {
        /* ignore */
      }
    }
  };

  walkFiles(root);
  removeEmptyDirs(root);

  const rebuilt = {};
  for (const metaPath of collectStreamCacheMetaFiles()) {
    const meta = readMetaAtPath(metaPath);
    if (!meta?.cacheKey) continue;
    rebuilt[meta.cacheKey] = {
      storageRelDir: meta.storageRelDir || path.relative(root, path.dirname(metaPath)) || "",
      storageBaseName: meta.storageBaseName || path.basename(metaPath, ".meta.json"),
    };
  }
  saveStreamCacheIndex(rebuilt);

  return { removedFiles, freedBytes };
};

export const measureStreamCacheUsedBytes = (root = getStreamCacheDir()) => {
  if (!fs.existsSync(root)) return 0;

  let total = 0;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === INDEX_FILE) continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!stat.isFile()) continue;
      if (name.endsWith(".mp4")) {
        const binPath = full.slice(0, -4) + ".bin";
        if (fs.existsSync(binPath)) continue;
      }
      total += stat.size;
    }
  };

  walk(root);
  return total;
};

export const migrateStreamCacheLayouts = async () => {
  const Content = (await import("../models/Content.js")).default;
  const metaPaths = collectStreamCacheMetaFiles();
  if (!metaPaths.length) return { migrated: 0 };

  const metas = metaPaths
    .map((metaPath) => ({ metaPath, meta: readMetaAtPath(metaPath) }))
    .filter(({ meta }) => meta?.cacheKey);

  const messageIds = [...new Set(metas.map(({ meta }) => Number(meta.messageId)).filter(Boolean))];
  const contents = messageIds.length
    ? await Content.find({ telegramMessageId: { $in: messageIds } })
        .select("_id title telegramMessageId telegramChannelId subjectId")
        .populate("subjectId", "name")
        .lean()
    : [];

  const contentByMessage = new Map(
    contents.map((row) => [
      `${row.telegramChannelId}_${row.telegramMessageId}`,
      {
        contentId: String(row._id),
        title: row.title,
        subjectName: row.subjectId?.name || null,
      },
    ])
  );

  let migrated = 0;
  for (const { meta } of metas) {
    const linked = contentByMessage.get(`${meta.channelId}_${meta.messageId}`);
    const desired = buildStreamCacheLayout({
      cacheKey: meta.cacheKey,
      subjectName: linked?.subjectName,
      title: linked?.title,
      fileName: meta.fileName,
    });
    const current = resolveStreamCachePaths(meta.cacheKey);
    if (
      current.storageRelDir === desired.storageRelDir &&
      current.storageBaseName === desired.storageBaseName &&
      fs.existsSync(current.metaPath)
    ) {
      continue;
    }
    ensureStreamCacheLayout(meta.cacheKey, meta, linked);
    migrated += 1;
  }

  reconcileStreamCacheFolder();
  return { migrated };
};
