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
  // No Desktop Web, prefira o seletor de diretório baseado em input.
  // Diferentemente de showDirectoryPicker(), ele não bloqueia uma pasta
  // apenas porque ela contém arquivos ocultos ou de sistema.
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
    document.body.appendChild(input);
    input.click();
    // Alguns navegadores não disparam change quando o usuário cancela.
    input.addEventListener('cancel', () => finish(null));
  });

  if (!files || files.length === 0) return null;

  const firstPath = files[0].webkitRelativePath || files[0].name;
  const folderName = firstPath.split('/')[0] || files[0].name;

  return {
    provider: 'local',
    label: storageLabel('local'),
    folderName,
    connectedAt: new Date().toISOString(),
  };
}

export async function connectCloudStorage(provider: 'google-drive'){const {connectCloud}=await import('./cloudStorage');return connectCloud()}
