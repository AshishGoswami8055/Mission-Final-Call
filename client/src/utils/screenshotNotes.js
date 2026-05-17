export const VIDEO_SCREENSHOT_NOTES_KEY = (contentId) => `cds_video_screenshot_notes_${contentId}`;
const SCREENSHOT_DB_NAME = "cds_screenshot_notes_db";
const SCREENSHOT_STORE = "notes_by_video";

const hasIndexedDb = typeof window !== "undefined" && "indexedDB" in window;

const openScreenshotDb = () =>
  new Promise((resolve, reject) => {
    if (!hasIndexedDb) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = window.indexedDB.open(SCREENSHOT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SCREENSHOT_STORE)) {
        db.createObjectStore(SCREENSHOT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open screenshot DB"));
  });

const readFromLocalStorage = (contentId) => {
  if (!contentId) return [];
  try {
    const raw = localStorage.getItem(VIDEO_SCREENSHOT_NOTES_KEY(contentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const writeToLocalStorage = (contentId, notes) => {
  if (!contentId) return;
  try {
    localStorage.setItem(VIDEO_SCREENSHOT_NOTES_KEY(contentId), JSON.stringify(notes));
  } catch {}
};

export const loadScreenshotNotes = async (contentId) => {
  if (!contentId) return [];

  if (!hasIndexedDb) return readFromLocalStorage(contentId);

  try {
    const db = await openScreenshotDb();
    const dbNotes = await new Promise((resolve, reject) => {
      const tx = db.transaction(SCREENSHOT_STORE, "readonly");
      const store = tx.objectStore(SCREENSHOT_STORE);
      const request = store.get(contentId);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error("Could not read screenshot notes"));
    });
    db.close();

    if (Array.isArray(dbNotes) && dbNotes.length > 0) return dbNotes;

    // One-time migration fallback from localStorage.
    const legacy = readFromLocalStorage(contentId);
    if (legacy.length) {
      await saveScreenshotNotes(contentId, legacy);
      return legacy;
    }
    return [];
  } catch {
    return readFromLocalStorage(contentId);
  }
};

export const saveScreenshotNotes = async (contentId, notes) => {
  if (!contentId) return;
  const safeNotes = Array.isArray(notes) ? notes : [];

  writeToLocalStorage(contentId, safeNotes.slice(0, 5));
  if (!hasIndexedDb) return;

  try {
    const db = await openScreenshotDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SCREENSHOT_STORE, "readwrite");
      const store = tx.objectStore(SCREENSHOT_STORE);
      const request = store.put(safeNotes, contentId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error("Could not save screenshot notes"));
    });
    db.close();
  } catch {
    // localStorage fallback already attempted
  }
};

export const downloadDataUrl = (dataUrl, filename = "screenshot-note.png") => {
  if (!dataUrl) return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
