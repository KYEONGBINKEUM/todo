/**
 * Tauri-aware download utilities
 * - pickSaveFolder: opens a folder picker dialog
 * - saveToFolder: saves a URL/dataURL/blob to a chosen folder
 * - openSaveFolder: opens the saved folder in the system file explorer
 * Falls back gracefully when running in a plain browser.
 */

const STORAGE_KEY = 'noah_save_folder';

export function getSavedFolderPath(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function rememberFolderPath(path: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, path);
}

/** Open a native folder picker; returns the selected path or null. */
export async function pickSaveFolder(defaultPath?: string): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: '저장 폴더 선택',
      defaultPath: defaultPath || undefined,
    });
    if (typeof selected === 'string' && selected) {
      rememberFolderPath(selected);
      return selected;
    }
    return null;
  } catch {
    return null;
  }
}

/** Convert a data URL to Uint8Array */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Save a file to a specific folder.
 * Accepts HTTP URLs, blob: URLs, and data: URLs.
 * Returns true on success.
 */
export async function saveToFolder(
  urlOrDataUrl: string,
  filename: string,
  folderPath: string,
): Promise<boolean> {
  try {
    let bytes: Uint8Array;

    if (urlOrDataUrl.startsWith('data:')) {
      bytes = dataUrlToBytes(urlOrDataUrl);
    } else {
      let blob: Blob;
      if (urlOrDataUrl.startsWith('blob:')) {
        // blob: URLs are same-origin — plain fetch works
        blob = await fetch(urlOrDataUrl).then(r => r.blob());
      } else {
        // External URL — try tauri http plugin first (bypasses CORS)
        try {
          const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
          blob = await tauriFetch(urlOrDataUrl).then(r => r.blob());
        } catch {
          blob = await fetch(urlOrDataUrl).then(r => r.blob());
        }
      }
      bytes = new Uint8Array(await blob.arrayBuffer());
    }

    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const sep = folderPath.includes('\\') ? '\\' : '/';
    const filePath = folderPath.replace(/[\\/]+$/, '') + sep + filename;
    await writeFile(filePath, bytes);
    return true;
  } catch (e) {
    console.error('[saveToFolder]', e);
    return false;
  }
}

/** Open a folder in the system file explorer. */
export async function openSaveFolder(folderPath: string): Promise<void> {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(folderPath);
  } catch {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(folderPath);
    } catch { /* ignore */ }
  }
}

/** Check if we're running inside Tauri. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}
