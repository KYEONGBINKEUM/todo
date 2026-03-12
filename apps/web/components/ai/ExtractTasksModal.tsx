'use client';

import { useState } from 'react';
import { callNoahAI } from '@/lib/noah-ai';
import { useI18n } from '@/lib/i18n-context';
import { useNoahAI } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

interface ExtractedTask {
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  dueDate: string | null;
}

interface Props {
  onAdd: (tasks: Array<{ title: string; priority: string; dueDate?: string | null }>) => void;
  onClose: () => void;
}

export default function ExtractTasksModal({ onAdd, onClose }: Props) {
  const { language } = useI18n();
  const { canUseAI } = useNoahAI();
  const [text, setText] = useState('');
  const [extracted, setExtracted] = useState<ExtractedTask[]>([]);
  const [summary, setSummary] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const extract = async () => {
    if (!text.trim()) return;
    if (!canUseAI) { setShowUpgrade(true); return; }
    setLoading(true);
    try {
      const res = await callNoahAI('extract_tasks', { text }, language);
      if (res.result?.tasks) {
        setExtracted(res.result.tasks);
        setSummary(res.result.summary ?? '');
        setSelected(new Set(res.result.tasks.map((_: any, i: number) => i)));
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleAdd = () => {
    const tasks = extracted.filter((_, i) => selected.has(i));
    if (tasks.length === 0) return;
    onAdd(tasks);
    onClose();
  };

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: 'text-red-400 bg-red-500/10',
    high: 'text-orange-400 bg-orange-500/10',
    medium: 'text-yellow-400 bg-yellow-500/10',
    low: 'text-blue-400 bg-blue-500/10',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <img src="/symbol.svg" alt="AI" className="w-5 h-5" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">AI 문서 → 태스크 추출</h2>
            <p className="text-[10px] text-text-muted">회의록, 문서, 기사 등을 붙여넣으면 할일을 추출해드립니다</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {extracted.length === 0 ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="회의록, 요구사항 문서, 기사 등의 텍스트를 붙여넣으세요..."
                className="w-full h-48 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted resize-none outline-none focus:border-[#e94560] transition-colors leading-relaxed"
              />
              <button
                onClick={extract}
                disabled={loading || !text.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {loading ? 'AI가 분석하는 중...' : '태스크 추출하기'}
              </button>
            </>
          ) : (
            <>
              {summary && (
                <div className="p-3 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl">
                  <p className="text-xs text-text-secondary">{summary}</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    추출된 태스크 ({extracted.length}개)
                  </p>
                  <button
                    onClick={() => setSelected(selected.size === extracted.length ? new Set() : new Set(extracted.map((_, i) => i)))}
                    className="text-[10px] text-[#e94560] hover:underline"
                  >
                    {selected.size === extracted.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>

                {extracted.map((task, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selected.has(i)
                        ? 'border-[#e94560]/30 bg-[#e94560]/5'
                        : 'border-border bg-background hover:bg-border/20'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggle(i)}
                      className="mt-0.5 accent-[#e94560]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary leading-snug">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>
                          {task.priority}
                        </span>
                        {task.dueDate && (
                          <span className="text-[9px] text-text-muted">📅 {task.dueDate}</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <button
                onClick={() => { setExtracted([]); setSummary(''); setText(''); }}
                className="w-full py-2 border border-border rounded-xl text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                다시 입력하기
              </button>
            </>
          )}
        </div>

        {extracted.length > 0 && (
          <div className="px-6 py-4 border-t border-border">
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              className="w-full py-2.5 bg-[#e94560] hover:bg-[#d63b55] text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              선택한 {selected.size}개 할일 추가
            </button>
          </div>
        )}
      </div>

      {showUpgrade && <NoahAIUpgradePrompt onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
