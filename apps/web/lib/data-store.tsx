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
import type { TaskData, ListData, NoteData, FolderData } from './firestore';

interface DataStore {
  tasks: TaskData[];
  lists: ListData[];
  notes: NoteData[];
  folders: FolderData[];
  loading: boolean;
}

const DataStoreContext = createContext<DataStore>({
  tasks: [],
  lists: [],
  notes: [],
  folders: [],
  loading: true,
});

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // 기존 리스너 정리
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];

    if (!user) {
      setTasks([]); setLists([]); setNotes([]); setFolders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const uid = user.uid;
    let loadedCount = 0;
    const total = 4;
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

    unsubsRef.current = [unsubTasks, unsubLists, unsubNotes, unsubFolders];

    return () => {
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
    };
  }, [user]);

  return (
    <DataStoreContext.Provider value={{ tasks, lists, notes, folders, loading }}>
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore() {
  return useContext(DataStoreContext);
}
