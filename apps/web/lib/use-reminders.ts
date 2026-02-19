'use client';

import { useEffect, useRef } from 'react';
import { TaskData } from './firestore';

const MAX_TIMEOUT = 2_147_483_647; // ~24.8일 (setTimeout 최대 안전 값)

/**
 * 할일의 reminder 필드를 기반으로 브라우저 알림을 예약합니다.
 * 페이지를 떠나거나 컴포넌트가 언마운트되면 타이머가 정리됩니다.
 */
export function useTaskReminders(tasks: TaskData[]) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    // 기존 타이머 전부 해제 후 재스케줄
    timers.current.forEach(clearTimeout);
    timers.current.clear();

    const now = Date.now();

    for (const task of tasks) {
      if (!task.reminder || !task.id) continue;
      const fireAt = new Date(task.reminder).getTime();
      const delay = fireAt - now;
      if (delay <= 0 || delay > MAX_TIMEOUT) continue;

      const timer = setTimeout(() => {
        try {
          new Notification(`⏰ ${task.title}`, {
            body: task.memo || '알림 시간이 되었습니다.',
            tag: `task-${task.id}`,
          });
        } catch (err) {
          console.warn('Notification 오류:', err);
        }
        timers.current.delete(task.id!);
      }, delay);

      timers.current.set(task.id, timer);
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, [tasks]);
}

/** 알림 권한을 요청합니다. 이미 granted이면 바로 true 반환. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
