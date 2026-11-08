// IndexedDB veritabanı adı ve sürümü
const DB_NAME = 'LimeFaucetDB';
const DB_VERSION = 2;
const STORE_NAME = 'cookiesStore';
const TASKS_STORE = 'tasksStore';

/**
 * Veritabanını açar ve gerekli object store'ları oluşturur.
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const tasksStore = db.createObjectStore(TASKS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        tasksStore.createIndex('date', 'date', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveCookies(cookies) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = { cookies, timestamp: Date.now() };
    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getLatestCookieRecord() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor(null, 'prev');
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        resolve(cursor.value);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Görev kayıtları yardımcıları
// ---------------------------------------------------------------------------

/** Yerel saatle YYYY-MM-DD döndürür. */
function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function saveTaskRecord(payload) {
  const db = await openDB();
  const now = new Date();
  const record = {
    date: getLocalDateStr(now),
    timestamp: now.getTime(),
    taskText: payload.taskText || '',
    points: Number(payload.points) || 0,
    crypto: payload.crypto || '',
    cryptoReward: Number(payload.cryptoReward) || 0,
    completed: !!payload.completed,
    startedAt: payload.startedAt || now.getTime(),
    finishedAt: payload.finishedAt || now.getTime(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASKS_STORE, 'readwrite');
    const store = tx.objectStore(TASKS_STORE);
    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getTaskRecordsByDate(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASKS_STORE, 'readonly');
    const store = tx.objectStore(TASKS_STORE);
    const index = store.index('date');
    const request = index.getAll(dateStr);
    request.onsuccess = () => {
      const arr = (request.result || []).sort((a, b) => b.timestamp - a.timestamp);
      resolve(arr);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getAllTaskRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASKS_STORE, 'readonly');
    const store = tx.objectStore(TASKS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
