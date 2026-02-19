/**
 * IndexedDB 기반 파일 첨부 저장소
 * - Firestore 1MB 한계를 우회해 최대 2MB 파일을 로컬에 보관
 * - 파일은 디바이스별 저장 (다른 기기에서는 접근 불가)
 */

const DB_NAME = 'ai-todo-files';
const STORE = 'attachments';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 파일을 IndexedDB에 저장 */
export async function saveAttachment(id: string, file: File): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob: file, name: file.name, type: file.type }, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** IndexedDB에서 파일 Blob을 가져와 열기/다운로드 */
export async function openAttachment(id: string, fileName: string, mimeType: string): Promise<void> {
  const db = await openDB();
  const entry = await new Promise<{ blob: Blob; name: string; type: string } | null>(
    (resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    }
  );

  if (!entry) {
    alert('파일을 찾을 수 없습니다.\n(다른 기기에서 추가된 파일이거나 브라우저 데이터가 삭제되었을 수 있습니다)');
    return;
  }

  const blob = new Blob([entry.blob], { type: entry.type || mimeType });
  const url = URL.createObjectURL(blob);
  const viewable = ['image/', 'text/', 'application/pdf', 'video/', 'audio/'];

  if (viewable.some((t) => blob.type.startsWith(t))) {
    window.open(url, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.name || fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 여러 파일을 IndexedDB에서 삭제 */
export async function deleteAttachments(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
