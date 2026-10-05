export type StorageProvider = 'local' | 'google-drive';

export interface StorageSelection {
  provider: StorageProvider;
  label: string;
  folderName?: string;
  connectedAt: string;
}

const KEY = 'kz_storage_selection_v1';

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
  const picker = (window as Window & {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<{name:string}>;
  }).showDirectoryPicker;

  if (!picker) {
    throw new Error('Seu navegador não oferece seleção de pastas para este PWA. Use Arquivos para escolher documentos individualmente.');
  }

  const handle = await picker({ mode: 'readwrite' });
  return {
    provider: 'local',
    label: storageLabel('local'),
    folderName: handle.name,
    connectedAt: new Date().toISOString(),
  };
}

export async function connectCloudStorage(provider: 'google-drive'){const {connectCloud}=await import('./cloudStorage');return connectCloud()}
