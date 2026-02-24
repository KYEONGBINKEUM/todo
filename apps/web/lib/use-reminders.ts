'use client';

import { useEffect, useRef } from 'react';
import { TaskData } from './firestore';

const MAX_TIMEOUT = 2_147_483_647; // ~24.8일 (setTimeout 최대 안전 값)

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && (
    '__TAURI__' in window ||
    '__TAURI_INTERNALS__' in window
  );
}

function showInAppAlert(title: string, body: string) {
  // 인앱 알림 표시 (Tauri 환경이거나 Notification API 사용 불가 시)
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 99999;
    background: #111128; border: 1px solid #e94560; border-radius: 12px;
    padding: 16px 20px; max-width: 360px; box-shadow: 0 8px 32px rgba(233,69,96,0.3);
    animation: slideIn 0.3s ease-out; color: #e2e8f0; font-family: system-ui, sans-serif;
  `;
  container.innerHTML = `
    <style>@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}</style>
    <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${title}</div>
    <div style="font-size:12px;color:#94a3b8;">${body}</div>
  `;
  document.body.appendChild(container);
  setTimeout(() => {
    container.style.transition = 'opacity 0.3s, transform 0.3s';
    container.style.opacity = '0';
    container.style.transform = 'translateX(100%)';
    setTimeout(() => container.remove(), 300);
  }, 5000);
}

function fireNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;

  // 브라우저 Notification API 사용 가능하면 사용
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: title });
      return;
    } catch {
      // fallback to in-app
    }
  }

  // Notification API 사용 불가 → 인앱 알림
  showInAppAlert(title, body);
}

/**
 * 할일의 reminder 필드를 기반으로 알림을 예약합니다.
 */
export function useTaskReminders(tasks: TaskData[]) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    timers.current.forEach(clearTimeout);
    timers.current.clear();

    const now = Date.now();

    for (const task of tasks) {
      if (!task.reminder || !task.id) continue;
      const fireAt = new Date(task.reminder).getTime();
      const delay = fireAt - now;
      if (delay <= 0 || delay > MAX_TIMEOUT) continue;

      const timer = setTimeout(() => {
        fireNotification(`⏰ ${task.title}`, task.memo || '알림 시간이 되었습니다.');
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

/** 알림 권한을 요청합니다. OS 알림 API를 사용합니다. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
