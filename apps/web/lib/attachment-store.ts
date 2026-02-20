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

/** 파일 확장자로 MIME 타입 추정 */
function getMimeFromExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    // 이미지
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
    // 동영상
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    // 오디오
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
    // 문서
    pdf: 'application/pdf',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html', xml: 'text/xml',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    // 압축
    zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
    tar: 'application/x-tar', gz: 'application/gzip',
    // 기타
    json: 'application/json', js: 'text/javascript', ts: 'text/typescript',
    py: 'text/x-python', java: 'text/x-java-source', c: 'text/x-csrc', cpp: 'text/x-c++src',
  };
  return map[ext] || 'application/octet-stream';
}

/** IndexedDB에서 파일 Blob을 가져와 확장자에 맞는 기본 프로그램으로 열기 */
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

  const name = entry.name || fileName;
  // 저장된 type → 인자로 받은 type → 확장자 추론 순으로 MIME 결정
  const resolvedType = entry.type || mimeType || getMimeFromExtension(name);
  const blob = new Blob([entry.blob], { type: resolvedType });
  const url = URL.createObjectURL(blob);

  // 브라우저가 직접 렌더링할 수 있는 타입은 새 탭에서 미리보기
  const previewable = ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];
  const isPreviewable = previewable.some((t) => resolvedType.startsWith(t));

  if (isPreviewable) {
    const win = window.open(url, '_blank');
    // 팝업 차단 시 다운로드로 폴백
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } else {
    // Office 문서, 압축 파일 등 → 다운로드하면 OS가 기본 앱으로 열기
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setTimeout(() => URL.revokeObjectURL(url), 15_000);
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
