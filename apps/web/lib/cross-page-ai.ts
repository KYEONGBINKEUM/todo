/**
 * Cross-page AI helpers
 * Allows any FloatingAIBar to trigger actions on other pages
 */
import { addCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from './firestore';

export type CrossPageAction = 'calendar_add_event' | 'calendar_update_event' | 'calendar_delete_events' | 'smart_schedule';

/** Returns a cross-page action name if the text matches, null otherwise */
export function detectCrossPageAction(text: string): CrossPageAction | null {
  // Calendar delete (must check before update/add)
  if (/일정.*(삭제|지워|제거|없애)|삭제.*일정|(delete|remove).*event/i.test(text)) return 'calendar_delete_events';
  // Calendar update (must check before add — 변경 is more specific)
  if (/일정.*(변경|수정|바꿔|업데이트|고쳐|옮겨)|변경.*일정|수정.*일정/i.test(text)) return 'calendar_update_event';
  // Calendar add
  if (
    /일정.*(추가|등록|잡아|생성|만들어)|새.*일정|(add|create|schedule).*event/i.test(text) &&
    !/할일|task/i.test(text)
  ) return 'calendar_add_event';
  // Timebox schedule
  if (/일정.*짜줘|오늘.*일정.*짜|스케줄.*짜줘|타임박스.*일정.*짜/i.test(text)) return 'smart_schedule';
  return null;
}

/** Today string YYYY-MM-DD */
export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Extra context fields needed for cross-page AI calls */
export function crossPageContext(text: string, calendarEvents: any[]) {
  return {
    today: todayDateStr(),
    userMessage: text,
    existingEvents: calendarEvents.slice(0, 50).map((e: any) => ({
      id: e.id, title: e.title, date: e.date,
      startTime: e.startTime || null, endTime: e.endTime || null,
    })),
  };
}

/** Handle cross-page result: writes to Firestore and navigates. Returns true if handled. */
export async function handleCrossPageResult(
  action: string,
  result: any,
  uid: string,
  push: (path: string) => void,
): Promise<boolean> {
  if (action === 'calendar_add_event' && result?.title && result?.date) {
    await addCalendarEvent(uid, {
      title: result.title,
      date: result.date,
      startTime: result.startTime || undefined,
      endTime: result.endTime || undefined,
      allDay: result.allDay ?? !result.startTime,
      color: '#e94560',
    });
    push('/calendar');
    return true;
  }

  if (action === 'calendar_update_event' && result?.targetId) {
    const updates: Record<string, any> = {};
    if (result.newDate) updates.date = result.newDate;
    if (result.newStartTime != null) updates.startTime = result.newStartTime;
    if (result.newEndTime != null) updates.endTime = result.newEndTime;
    if (result.newTitle) updates.title = result.newTitle;
    if (typeof result.newAllDay === 'boolean') updates.allDay = result.newAllDay;
    if (Object.keys(updates).length > 0) {
      await updateCalendarEvent(uid, result.targetId, updates);
    }
    push('/calendar');
    return true;
  }

  if (action === 'calendar_delete_events' && result?.targetIds?.length) {
    await Promise.all(result.targetIds.map((id: string) => deleteCalendarEvent(uid, id)));
    push('/calendar');
    return true;
  }

  if (action === 'smart_schedule' && result?.schedule?.length) {
    sessionStorage.setItem('noah_pending_schedule', JSON.stringify(result.schedule));
    push('/timebox');
    return true;
  }

  return false;
}
