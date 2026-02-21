'use client';

/**
 * 글로벌 실시간 데이터 스토어
 * - onSnapshot 리스너를 앱 전체에서 단 1회 설정
 * - 모든 페이지가 동일한 인메모리 데이터를 공유 (페이지 이동 시 재요청 없음)
 * - Firestore 쓰기 직후 로컬 캐시에서 즉시 반영 (오프라인 캐시 모드)
 */

import {
  createContext, useContext, useEffect, useState, useRef,
  type ReactNode,
} from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth-context';
import type { TaskData, ListData, NoteData, FolderData, MindMapData } from './firestore';

interface DataStore {
  tasks: TaskData[];
  lists: ListData[];
  notes: NoteData[];
  folders: FolderData[];
  mindmaps: MindMapData[];
  loading: boolean;
  storageUsed: number; // bytes — 텍스트 + 파일 총 사용량
}

const DataStoreContext = createContext<DataStore>({
  tasks: [],
  lists: [],
  notes: [],
  folders: [],
  mindmaps: [],
  loading: true,
  storageUsed: 0,
});

/** 텍스트의 UTF-8 바이트 크기 추정 */
function estimateTextBytes(text: string): number {
  return new Blob([text]).size;
}

/** 모든 데이터의 실사용량 계산 (텍스트 + 첨부파일) */
function calcStorageUsed(tasks: TaskData[], notes: NoteData[]): number {
  let total = 0;
  for (const t of tasks) {
    total += estimateTextBytes(t.title || '');
    total += estimateTextBytes(t.memo || '');
    for (const st of t.subTasks ?? []) total += estimateTextBytes(st.title || '');
    for (const att of t.attachments ?? []) total += att.size;
  }
  for (const n of notes) {
    total += estimateTextBytes(n.title || '');
    for (const b of n.blocks ?? []) {
      total += estimateTextBytes(b.content || '');
      total += estimateTextBytes(b.children || '');
    }
  }
  return total;
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [mindmaps, setMindmaps] = useState<MindMapData[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Auth 아직 로딩 중이면 대기 (loading=true 유지)
    // → user=null 인데 authLoading=true인 경우 setLoading(false) 조기 호출 방지
    if (authLoading) return;

    // 기존 리스너 정리
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];

    if (!user) {
      setTasks([]); setLists([]); setNotes([]); setFolders([]); setMindmaps([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const uid = user.uid;
    let loadedCount = 0;
    const total = 5;
    const markLoaded = () => { if (++loadedCount >= total) setLoading(false); };

    // Tasks — 생성순 desc
    const unsubTasks = onSnapshot(
      query(collection(db, 'users', uid, 'tasks'), orderBy('createdAt', 'desc')),
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskData)));
        markLoaded();
      },
      () => markLoaded() // error: 권한 문제 시 로딩 해제
    );

    // Lists
    const unsubLists = onSnapshot(
      collection(db, 'users', uid, 'lists'),
      (snap) => {
        setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ListData)));
        markLoaded();
      },
      () => markLoaded()
    );

    // Notes — 생성순 desc
    const unsubNotes = onSnapshot(
      query(collection(db, 'users', uid, 'notes'), orderBy('createdAt', 'desc')),
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NoteData)));
        markLoaded();
      },
      () => markLoaded()
    );

    // Folders
    const unsubFolders = onSnapshot(
      collection(db, 'users', uid, 'folders'),
      (snap) => {
        setFolders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FolderData)));
        markLoaded();
      },
      () => markLoaded()
    );

    // Mind Maps — 생성순 desc
    const unsubMindmaps = onSnapshot(
      query(collection(db, 'users', uid, 'mindmaps'), orderBy('createdAt', 'desc')),
      (snap) => {
        setMindmaps(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MindMapData)));
        markLoaded();
      },
      () => markLoaded()
    );

    unsubsRef.current = [unsubTasks, unsubLists, unsubNotes, unsubFolders, unsubMindmaps];

    return () => {
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
    };
  }, [user, authLoading]);

  const storageUsed = calcStorageUsed(tasks, notes);

  return (
    <DataStoreContext.Provider value={{ tasks, lists, notes, folders, mindmaps, loading, storageUsed }}>
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore() {
  return useContext(DataStoreContext);
}
