import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ============================================================================
// Simple in-memory cache to avoid redundant Firestore reads
// ============================================================================

const cache: Record<string, { data: unknown; ts: number }> = {};
const CACHE_TTL = 30_000; // 30 seconds

function getCached<T>(key: string): T | null {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown) {
  cache[key] = { data, ts: Date.now() };
}

export function invalidateCache(uid: string, type?: string) {
  if (type) {
    delete cache[`${uid}:${type}`];
  } else {
    Object.keys(cache).forEach((k) => { if (k.startsWith(uid)) delete cache[k]; });
  }
}

// ============================================================================
// Types
// ============================================================================

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  downloadURL?: string;  // Firebase Storage URL (신규)
  storagePath?: string;  // Storage 경로 (삭제 시 사용)
}

export interface TaskData {
  id?: string;
  title: string;
  status: 'todo' | 'in_progress' | 'completed';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  starred: boolean;
  listId: string;
  dueDate?: string | null;
  myDay: boolean;
  subTasks?: SubTask[];
  reminder?: string | null;
  memo?: string;
  attachments?: TaskAttachment[];
  tags?: string[];
  order?: number;
  completedDate?: string | null;
  linkedNoteIds?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface NoteData {
  id?: string;
  title: string;
  icon: string;
  blocks: NoteBlock[];
  pinned: boolean;
  tags: string[];
  folderId: string | null;
  linkedTaskId?: string | null;
  linkedTaskIds?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface NoteBlock {
  id: string;
  type: 'text' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'divider' | 'code' | 'link' | 'toggle';
  content: string;
  checked?: boolean;
  url?: string;
  children?: string;
}

export interface ListData {
  id?: string;
  label: string;
  color: string;
  createdAt?: Timestamp;
}

export interface FolderData {
  id?: string;
  name: string;
  color: string;
  icon: string;
  parentId?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: Timestamp;
}

// ============================================================================
// Tasks
// ============================================================================

function tasksRef(uid: string) {
  return collection(db, 'users', uid, 'tasks');
}

export async function getTasks(uid: string): Promise<TaskData[]> {
  const cached = getCached<TaskData[]>(`${uid}:tasks`);
  if (cached) return cached;
  const q = query(tasksRef(uid), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const result = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TaskData));
  setCache(`${uid}:tasks`, result);
  return result;
}

export async function getMyDayTasks(uid: string): Promise<TaskData[]> {
  const cached = getCached<TaskData[]>(`${uid}:myDayTasks`);
  if (cached) return cached;
  const q = query(tasksRef(uid), where('myDay', '==', true));
  const snapshot = await getDocs(q);
  const result = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as TaskData))
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis() ?? 0;
      const bTime = b.createdAt?.toMillis() ?? 0;
      return bTime - aTime;
    });
  setCache(`${uid}:myDayTasks`, result);
  return result;
}

export async function addTask(uid: string, task: Omit<TaskData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  invalidateCache(uid, 'tasks');
  invalidateCache(uid, 'myDayTasks');
  const docRef = await addDoc(tasksRef(uid), {
    ...task,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateTask(uid: string, taskId: string, updates: Partial<TaskData>): Promise<void> {
  invalidateCache(uid, 'tasks');
  invalidateCache(uid, 'myDayTasks');
  await updateDoc(doc(db, 'users', uid, 'tasks', taskId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTask(uid: string, taskId: string): Promise<void> {
  invalidateCache(uid, 'tasks');
  invalidateCache(uid, 'myDayTasks');
  await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
}

// ============================================================================
// Notes
// ============================================================================

function notesRef(uid: string) {
  return collection(db, 'users', uid, 'notes');
}

export async function getNotes(uid: string): Promise<NoteData[]> {
  const cached = getCached<NoteData[]>(`${uid}:notes`);
  if (cached) return cached;
  const q = query(notesRef(uid), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const result = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as NoteData));
  setCache(`${uid}:notes`, result);
  return result;
}

export async function addNote(uid: string, note: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  invalidateCache(uid, 'notes');
  const docRef = await addDoc(notesRef(uid), {
    ...note,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateNote(uid: string, noteId: string, updates: Partial<NoteData>): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'notes', noteId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteNote(uid: string, noteId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'notes', noteId));
}

// ============================================================================
// Lists
// ============================================================================

function listsRef(uid: string) {
  return collection(db, 'users', uid, 'lists');
}

export async function getLists(uid: string): Promise<ListData[]> {
  const cached = getCached<ListData[]>(`${uid}:lists`);
  if (cached) return cached;
  const snapshot = await getDocs(listsRef(uid));
  const result = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ListData));
  setCache(`${uid}:lists`, result);
  return result;
}

export async function updateList(uid: string, listId: string, updates: Partial<ListData>): Promise<void> {
  invalidateCache(uid, 'lists');
  await updateDoc(doc(db, 'users', uid, 'lists', listId), {
    ...updates,
  });
}

export async function addList(uid: string, list: Omit<ListData, 'id' | 'createdAt'>): Promise<string> {
  invalidateCache(uid, 'lists');
  const docRef = await addDoc(listsRef(uid), {
    ...list,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteList(uid: string, listId: string): Promise<void> {
  invalidateCache(uid, 'lists');
  await deleteDoc(doc(db, 'users', uid, 'lists', listId));
}

// ============================================================================
// Folders (for notes)
// ============================================================================

function foldersRef(uid: string) {
  return collection(db, 'users', uid, 'folders');
}

export async function getFolders(uid: string): Promise<FolderData[]> {
  const cached = getCached<FolderData[]>(`${uid}:folders`);
  if (cached) return cached;
  const snapshot = await getDocs(foldersRef(uid));
  const result = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FolderData));
  setCache(`${uid}:folders`, result);
  return result;
}

export async function addFolder(uid: string, folder: Omit<FolderData, 'id' | 'createdAt'>): Promise<string> {
  invalidateCache(uid, 'folders');
  const docRef = await addDoc(foldersRef(uid), {
    ...folder,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateFolder(uid: string, folderId: string, updates: Partial<FolderData>): Promise<void> {
  invalidateCache(uid, 'folders');
  await updateDoc(doc(db, 'users', uid, 'folders', folderId), { ...updates });
}

/** 소프트 삭제 — 휴지통으로 이동 */
export async function deleteFolder(uid: string, folderId: string): Promise<void> {
  invalidateCache(uid, 'folders');
  await updateDoc(doc(db, 'users', uid, 'folders', folderId), {
    deleted: true,
    deletedAt: new Date().toISOString(),
  });
}

/** 휴지통에서 복원 */
export async function restoreFolder(uid: string, folderId: string): Promise<void> {
  invalidateCache(uid, 'folders');
  await updateDoc(doc(db, 'users', uid, 'folders', folderId), {
    deleted: false,
    deletedAt: null,
  });
}

/** 영구 삭제 */
export async function permanentDeleteFolder(uid: string, folderId: string): Promise<void> {
  invalidateCache(uid, 'folders');
  await deleteDoc(doc(db, 'users', uid, 'folders', folderId));
}

// ============================================================================
// Shared Lists
// ============================================================================

export interface SharedListData {
  id?: string;
  name: string;
  color: string;
  icon: string;
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  members: SharedMember[];
  createdAt?: Timestamp;
}

export interface SharedMember {
  uid: string;
  email: string;
  name: string;
  permission: 'view' | 'edit' | 'admin';
  joinedAt?: string;
}

function sharedListsRef() {
  return collection(db, 'sharedLists');
}

export async function getSharedLists(uid: string): Promise<SharedListData[]> {
  const cached = getCached<SharedListData[]>(`${uid}:sharedLists`);
  if (cached) return cached;
  // ownerUid는 항상 memberUids에 포함되므로 단일 쿼리로 소유+멤버 목록 모두 조회
  const q = query(sharedListsRef(), where('memberUids', 'array-contains', uid));
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SharedListData));
  setCache(`${uid}:sharedLists`, all);
  return all;
}

export async function createSharedList(uid: string, data: { name: string; color: string; icon: string; ownerName: string; ownerEmail: string }): Promise<string> {
  invalidateCache(uid, 'sharedLists');
  const docRef = await addDoc(sharedListsRef(), {
    name: data.name,
    color: data.color,
    icon: data.icon,
    ownerUid: uid,
    ownerName: data.ownerName,
    ownerEmail: data.ownerEmail,
    members: [],
    memberUids: [uid],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateSharedList(listId: string, updates: Partial<SharedListData>): Promise<void> {
  Object.keys(cache).forEach((k) => { if (k.includes('sharedLists')) delete cache[k]; });
  await updateDoc(doc(db, 'sharedLists', listId), { ...updates });
}

export async function deleteSharedList(listId: string): Promise<void> {
  Object.keys(cache).forEach((k) => { if (k.includes('sharedLists')) delete cache[k]; });
  await deleteDoc(doc(db, 'sharedLists', listId));
}

export async function inviteToSharedList(listId: string, member: SharedMember): Promise<void> {
  Object.keys(cache).forEach((k) => { if (k.includes('sharedLists')) delete cache[k]; });
  const ref = doc(db, 'sharedLists', listId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as SharedListData & { memberUids: string[] };
  const members = [...(data.members || []), member];
  const memberUids = [...(data.memberUids || []), member.uid];
  await updateDoc(ref, { members, memberUids });
}

// Shared Tasks (within shared lists)
export async function getSharedTasks(listId: string): Promise<TaskData[]> {
  const ref = collection(db, 'sharedLists', listId, 'tasks');
  const q = query(ref, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TaskData));
}

export async function addSharedTask(listId: string, task: Omit<TaskData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = collection(db, 'sharedLists', listId, 'tasks');
  const docRef = await addDoc(ref, { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function updateSharedTask(listId: string, taskId: string, updates: Partial<TaskData>): Promise<void> {
  await updateDoc(doc(db, 'sharedLists', listId, 'tasks', taskId), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteSharedTask(listId: string, taskId: string): Promise<void> {
  await deleteDoc(doc(db, 'sharedLists', listId, 'tasks', taskId));
}

// ============================================================================
// User Settings
// ============================================================================

export type Theme = 'system' | 'light' | 'dark';

export type FontSize = 'small' | 'medium' | 'large';

export type Language = 'ko' | 'en' | 'ja' | 'es' | 'pt' | 'fr';

export type Plan = 'free' | 'pro' | 'team';

export interface UserSettings {
  theme: Theme;
  fontSize?: FontSize;
  language?: Language;
  plan?: Plan;
  isAdmin?: boolean;
}

export async function getUserSettings(uid: string): Promise<UserSettings> {
  const ref = doc(db, 'users', uid, 'settings', 'app');
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as UserSettings;
  return { theme: 'system' };
}

export async function updateUserSettings(uid: string, settings: Partial<UserSettings>): Promise<void> {
  const ref = doc(db, 'users', uid, 'settings', 'app');
  await setDoc(ref, settings, { merge: true });
}

// ============================================================================
// Initial data seeding (for new users)
// ============================================================================

export async function seedDefaultData(uid: string): Promise<void> {
  // Check if user already has lists
  const existingLists = await getLists(uid);
  if (existingLists.length > 0) return;

  // Create default lists
  await addList(uid, { label: 'My Tasks', color: '#e94560' });
  await addList(uid, { label: '업무', color: '#8b5cf6' });
  await addList(uid, { label: '개인', color: '#06b6d4' });

  // Create default folders
  await addFolder(uid, { name: '업무', color: '#8b5cf6', icon: '💼' });
  await addFolder(uid, { name: '개인', color: '#06b6d4', icon: '🏠' });
  await addFolder(uid, { name: '아이디어', color: '#f59e0b', icon: '💡' });
}
