export type StorageProvider = 'local' | 'google-drive';

export interface StorageSelection {
  provider: StorageProvider;
  label: string;
  folderName?: string;
  connectedAt: string;
}

export interface StoredLocalFile {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  lastModified: number;
  file: File;
}

const KEY = 'kz_storage_selection_v1';
const DB_NAME = 'korczak-nexus-local-files';
const STORE_NAME = 'files';

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Este navegador não oferece armazenamento local persistente.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('path', 'path', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento local.'));
  });
}

async function withLocalStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  const db = await openLocalDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    run(tx.objectStore(STORE_NAME), resolve, reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Falha no armazenamento local.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Operação local cancelada.')); };
  });
}

export async function listLocalFiles(): Promise<StoredLocalFile[]> {
  return withLocalStore<StoredLocalFile[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result || []) as StoredLocalFile[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalFile(id: string): Promise<StoredLocalFile | null> {
  return withLocalStore<StoredLocalFile | null>('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result || null) as StoredLocalFile | null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLocalFile(id: string): Promise<void> {
  await withLocalStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function getStorageSelection(): StorageSelection | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as StorageSelection : null;
  } catch {
    return null;
  }
}

export function saveStorageSelection(selection: StorageSelection): void {
  localStorage.setItem(KEY, JSON.stringify(selection));
}

export function clearStorageSelection(): void {
  localStorage.removeItem(KEY);
}

export function storageLabel(provider: StorageProvider): string {
  if (provider === 'local') return 'Pasta deste dispositivo';
  return 'Google Drive';
}

export async function chooseLocalFolder(): Promise<StorageSelection | null> {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    const {pickIOSFiles} = await import('./iosFiles');
    const files = await pickIOSFiles();
    if (!files.length) return null;
    return {
      provider: 'local',
      label: 'Arquivos neste iPhone/iPad',
      folderName: files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`,
      connectedAt: new Date().toISOString(),
    };
  }

  // O input de diretório lista também arquivos ocultos/de sistema sem bloquear a seleção.
  const input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('webkitdirectory', '');
  input.setAttribute('directory', '');
  input.multiple = true;
  input.style.display = 'none';

  const files = await new Promise<FileList | null>((resolve) => {
    let settled = false;
    const finish = (value: FileList | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => finish(input.files));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });

  if (!files || files.length === 0) return null;

  const firstPath = files[0].webkitRelativePath || files[0].name;
  const folderName = firstPath.split('/')[0] || files[0].name;
  const records: StoredLocalFile[] = Array.from(files).map((file) => {
    const path = file.webkitRelativePath || file.name;
    return {
      id: path,
      name: file.name,
      path,
      type: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified || Date.now(),
      file,
    };
  });

  // Substitui o conjunto anterior pela pasta recém-selecionada, mantendo o conteúdo no próprio navegador.
  await withLocalStore<void>('readwrite', (store, resolve, reject) => {
    const clear = store.clear();
    clear.onerror = () => reject(clear.error);
    clear.onsuccess = () => {
      for (const record of records) {
        const request = store.put(record);
        request.onerror = () => reject(request.error);
      }
      resolve();
    };
  });

  return {
    provider: 'local',
    label: storageLabel('local'),
    folderName,
    connectedAt: new Date().toISOString(),
  };
}

export async function connectCloudStorage(provider: 'google-drive') {
  const {connectCloud} = await import('./cloudStorage');
  return connectCloud();
}
