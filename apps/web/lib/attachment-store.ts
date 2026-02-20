/**
 * 파일 첨부 저장소
 * - Firebase Storage 기반 (클라우드, 모든 기기에서 접근 가능)
 * - 구형 IndexedDB 첨부파일 하위 호환성 유지
 */

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import type { TaskAttachment } from './firestore';

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Firebase Storage ──────────────────────────────────────────────────────────

/** Firebase Storage에 파일 업로드 후 URL과 경로 반환 */
export async function uploadAttachment(
  uid: string,
  taskId: string,
  file: File,
  attachmentId: string,
): Promise<{ downloadURL: string; storagePath: string }> {
  const path = `users/${uid}/tasks/${taskId}/${attachmentId}/${file.name}`;
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytesResumable(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return { downloadURL, storagePath: path };
}

/** Firebase Storage 단일 파일 삭제 */
export async function deleteAttachmentFromStorage(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // 이미 삭제됐거나 존재하지 않는 파일 → 무시
  }
}

/** TaskAttachment 배열을 받아 Firebase Storage 파일 일괄 삭제 */
export async function deleteAttachmentsFromStorage(attachments: TaskAttachment[]): Promise<void> {
  await Promise.all(
    attachments.map((att) =>
      att.storagePath ? deleteAttachmentFromStorage(att.storagePath) : Promise.resolve()
    )
  );
}

/** Firebase Storage URL로 파일 열기 (새 탭 미리보기 또는 다운로드) */
export function openAttachmentByURL(downloadURL: string, fileName: string, mimeType: string): void {
  const previewable = ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];
  const isPreviewable = previewable.some((t) => mimeType.startsWith(t));

  if (isPreviewable) {
    const win = window.open(downloadURL, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = downloadURL;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } else {
    const a = document.createElement('a');
    a.href = downloadURL;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// ── 하위 호환: 구형 IndexedDB 첨부파일 ───────────────────────────────────────

const DB_NAME = 'ai-todo-files';
const STORE = 'attachments';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getMimeFromExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
    pdf: 'application/pdf',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html', xml: 'text/xml',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
    tar: 'application/x-tar', gz: 'application/gzip',
    json: 'application/json', js: 'text/javascript', ts: 'text/typescript',
    py: 'text/x-python', java: 'text/x-java-source', c: 'text/x-csrc', cpp: 'text/x-c++src',
  };
  return map[ext] || 'application/octet-stream';
}

/** 구형 IndexedDB 파일 열기 (하위 호환) */
export async function openAttachment(id: string, fileName: string, mimeType: string): Promise<void> {
  const db = await openDB();
  const entry = await new Promise<{ blob: Blob; name: string; type: string } | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });

  if (!entry) {
    alert('파일을 찾을 수 없습니다.\n(다른 기기에서 추가된 파일이거나 브라우저 데이터가 삭제되었을 수 있습니다)');
    return;
  }

  const name = entry.name || fileName;
  const resolvedType = entry.type || mimeType || getMimeFromExtension(name);
  const blob = new Blob([entry.blob], { type: resolvedType });
  const url = URL.createObjectURL(blob);

  const previewable = ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];
  const isPreviewable = previewable.some((t) => resolvedType.startsWith(t));

  if (isPreviewable) {
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

/** 구형 IndexedDB 파일 삭제 (하위 호환) */
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
