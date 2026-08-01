export type PersistentWorkbookHandle = {
  name: string;
  getFile(): Promise<File>;
  queryPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
};

const DATABASE_NAME = "3d-intelligence-local-workbook-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "workbook-handles";
const LAST_HANDLE_KEY = "last-connected-workbook";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("Local workbook reconnection is unavailable."));
      return;
    }
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Workbook storage could not be opened."));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Workbook storage request failed."));
  });
}

export function supportsPersistentWorkbookHandles(): boolean {
  return (
    typeof window !== "undefined" &&
    "indexedDB" in window &&
    "showOpenFilePicker" in window
  );
}

export async function savePersistentWorkbookHandle(
  handle: PersistentWorkbookHandle,
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await runRequest(transaction.objectStore(STORE_NAME).put(handle, LAST_HANDLE_KEY));
  } finally {
    database.close();
  }
}

export async function loadPersistentWorkbookHandle(): Promise<PersistentWorkbookHandle | null> {
  if (!supportsPersistentWorkbookHandles()) return null;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await runRequest(
      transaction.objectStore(STORE_NAME).get(LAST_HANDLE_KEY),
    );
    return value && typeof value === "object"
      ? (value as PersistentWorkbookHandle)
      : null;
  } finally {
    database.close();
  }
}

export async function clearPersistentWorkbookHandle(): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await runRequest(transaction.objectStore(STORE_NAME).delete(LAST_HANDLE_KEY));
  } finally {
    database.close();
  }
}

export async function ensureWorkbookReadPermission(
  handle: PersistentWorkbookHandle,
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const current = await handle.queryPermission({ mode: "read" });
  if (current === "granted") return true;
  return (await handle.requestPermission({ mode: "read" })) === "granted";
}
