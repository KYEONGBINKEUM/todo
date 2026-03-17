'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import FloatingAIBar from '@/components/ai/FloatingAIBar';
import { detectCrossPageAction, crossPageContext, handleCrossPageResult } from '@/lib/cross-page-ai';

const LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', label: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
];

type ViewMode = 'translate' | 'history' | 'favorites' | 'multi';

interface HistoryItem {
  id: string;
  srcLang: string;
  tgtLang: string;
  srcText: string;
  result: string;
  timestamp: number;
  starred: boolean;
}

const HISTORY_KEY = 'translate_history';

function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 100)));
}

export default function TranslatePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { t, language } = useI18n();
  const { calendarEvents } = useDataStore();

  const [viewMode, setViewMode] = useState<ViewMode>('translate');
  const [srcLang, setSrcLang] = useState('ko');
  const [tgtLang, setTgtLang] = useState('en');
  const [srcText, setSrcText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [srcCopied, setSrcCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [multiResults, setMultiResults] = useState<{ lang: string; label: string; flag: string; text: string; loading: boolean }[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);

  const translate = useCallback(async (text: string, from: string, to: string): Promise<string> => {
    if (!text.trim()) { setResult(''); setError(''); return ''; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
      const data = await res.json();
      if (data.responseStatus === 200) {
        const translated = data.responseData.translatedText;
        setResult(translated);
        // Save to history
        const item: HistoryItem = {
          id: Date.now().toString(),
          srcLang: from, tgtLang: to, srcText: text, result: translated,
          timestamp: Date.now(), starred: false,
        };
        setHistory(prev => {
          const updated = [item, ...prev.filter(h => !(h.srcText === text && h.srcLang === from && h.tgtLang === to))];
          saveHistory(updated);
          return updated;
        });
        return translated;
      } else { setError(t('translate.errorGeneric')); return ''; }
    } catch { setError(t('translate.errorNetwork')); return ''; }
    finally { setLoading(false); }
  }, [t]);

  const handleSrcChange = (text: string) => {
    setSrcText(text); setResult('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) return;
    debounceRef.current = setTimeout(() => translate(text, srcLang, tgtLang), 800);
  };

  const handleSwap = () => {
    setSrcLang(tgtLang); setTgtLang(srcLang);
    setSrcText(result); setResult('');
    if (result.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => translate(result, tgtLang, srcLang), 400);
    }
  };

  const handleLangChange = (type: 'src' | 'tgt', code: string) => {
    if (type === 'src') setSrcLang(code); else setTgtLang(code);
    setResult('');
    if (srcText.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const from = type === 'src' ? code : srcLang;
      const to = type === 'tgt' ? code : tgtLang;
      debounceRef.current = setTimeout(() => translate(srcText, from, to), 400);
    }
  };

  const speak = (text: string, lang: string) => {
    if (!text || typeof window === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onstart = () => setTtsPlaying(true);
    utterance.onend = () => setTtsPlaying(false);
    utterance.onerror = () => setTtsPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleStar = (id: string) => {
    setHistory(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, starred: !h.starred } : h);
      saveHistory(updated);
      return updated;
    });
  };

  const deleteHistory = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      saveHistory(updated);
      return updated;
    });
  };

  const clearHistory = () => { setHistory([]); saveHistory([]); };

  const loadHistoryItem = (item: HistoryItem) => {
    setSrcLang(item.srcLang); setTgtLang(item.tgtLang);
    setSrcText(item.srcText); setResult(item.result);
    setViewMode('translate');
  };

  // Multi-language translation
  const handleMultiTranslate = async () => {
    if (!srcText.trim()) return;
    const targets = [
      { code: 'en', label: 'English', flag: '🇺🇸' },
      { code: 'ja', label: '日本語', flag: '🇯🇵' },
      { code: 'zh', label: '中文', flag: '🇨🇳' },
      { code: 'es', label: 'Español', flag: '🇪🇸' },
      { code: 'fr', label: 'Français', flag: '🇫🇷' },
      { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
      { code: 'ar', label: 'العربية', flag: '🇸🇦' },
      { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    ].filter(l => l.code !== srcLang);
    setMultiResults(targets.map(l => ({ lang: l.code, label: l.label, flag: l.flag, text: '', loading: true })));
    for (const tgt of targets) {
      try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(srcText)}&langpair=${srcLang}|${tgt.code}`);
        const data = await res.json();
        const text = data.responseStatus === 200 ? data.responseData.translatedText : '번역 실패';
        setMultiResults(prev => prev.map(r => r.lang === tgt.code ? { ...r, text, loading: false } : r));
      } catch {
        setMultiResults(prev => prev.map(r => r.lang === tgt.code ? { ...r, text: '오류', loading: false } : r));
      }
    }
  };

  const selectCls = "w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] cursor-pointer transition-colors";
  const favorites = history.filter(h => h.starred);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 pb-32">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌐</span>
            <h2 className="text-2xl font-bold text-text-primary">{t('nav.translate')}</h2>
          </div>
          <div className="flex gap-1">
            {([
              { key: 'translate', label: '번역', icon: '🌐' },
              { key: 'multi', label: '동시번역', icon: '🗺️' },
              { key: 'history', label: `기록 ${history.length}`, icon: '📋' },
              { key: 'favorites', label: `즐겨찾기 ${favorites.length}`, icon: '⭐' },
            ] as { key: ViewMode; label: string; icon: string }[]).map(tab => (
              <button key={tab.key} onClick={() => setViewMode(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${viewMode === tab.key ? 'bg-[#e94560] text-white' : 'bg-background-card border border-border text-text-muted hover:text-text-primary'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* TRANSLATE VIEW */}
        {viewMode === 'translate' && (
          <>
            {/* Lang selectors + swap */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1">
                <select value={srcLang} onChange={e => handleLangChange('src', e.target.value)} className={selectCls}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
              </div>
              <button onClick={handleSwap} className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-all text-base" title="언어 교체">⇄</button>
              <div className="flex-1">
                <select value={tgtLang} onChange={e => handleLangChange('tgt', e.target.value)} className={selectCls}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
              </div>
            </div>

            {/* Translation panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source */}
              <div className="bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-xs font-semibold text-text-secondary">{LANGUAGES.find(l => l.code === srcLang)?.flag} {LANGUAGES.find(l => l.code === srcLang)?.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${srcText.length > 4500 ? 'text-orange-400' : 'text-text-muted'}`}>{srcText.length} / 5000</span>
                    <button onClick={() => speak(srcText, srcLang)} disabled={!srcText} className="text-text-muted hover:text-[#e94560] disabled:opacity-30 transition-colors text-base" title="읽어주기">🔊</button>
                  </div>
                </div>
                <textarea
                  value={srcText} onChange={e => handleSrcChange(e.target.value.slice(0, 5000))}
                  placeholder={t('translate.inputPlaceholder')}
                  maxLength={5000}
                  className="flex-1 resize-none p-4 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none leading-relaxed min-h-[200px]"
                />
                <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(srcText); setSrcCopied(true); setTimeout(() => setSrcCopied(false), 1500); }}
                      disabled={!srcText} className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 disabled:opacity-30 transition-all">
                      {srcCopied ? '✅ 복사됨' : '복사'}
                    </button>
                    {srcText && <button onClick={() => { setSrcText(''); setResult(''); setError(''); }} className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-[#e94560] transition-colors">지우기</button>}
                  </div>
                  <button onClick={() => translate(srcText, srcLang, tgtLang)} disabled={!srcText.trim() || loading}
                    className="px-4 py-1.5 bg-[#e94560] text-white rounded-xl text-xs font-bold hover:bg-[#d63b55] disabled:opacity-40 transition-all">
                    {loading ? '번역 중...' : t('translate.translate')}
                  </button>
                </div>
              </div>

              {/* Target */}
              <div className="bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-xs font-semibold text-text-secondary">{LANGUAGES.find(l => l.code === tgtLang)?.flag} {LANGUAGES.find(l => l.code === tgtLang)?.label}</span>
                  <div className="flex items-center gap-2">
                    {result && <span className="text-[11px] text-text-muted">{result.length} 자</span>}
                    <button onClick={() => speak(result, tgtLang)} disabled={!result} className="text-text-muted hover:text-[#e94560] disabled:opacity-30 transition-colors text-base" title="읽어주기">
                      {ttsPlaying ? '⏸️' : '🔊'}
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-4 min-h-[200px]">
                  {loading ? (
                    <div className="flex items-center gap-2 text-text-muted text-sm">
                      <span className="inline-block w-3 h-3 rounded-full bg-[#e94560]/60 animate-pulse" />번역 중...
                    </div>
                  ) : error ? (
                    <p className="text-sm text-red-400">{error}</p>
                  ) : result ? (
                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{result}</p>
                  ) : (
                    <p className="text-sm text-text-muted">{t('translate.resultPlaceholder')}</p>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-border flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    disabled={!result} className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 disabled:opacity-30 transition-all">
                    {copied ? '✅ 복사됨' : t('translate.copy')}
                  </button>
                  {result && (
                    <button onClick={handleSwap} className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-[#e94560] transition-all">
                      ⇄ 언어 교체
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick lang shortcuts */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">빠른 선택</span>
              {[
                { src: 'ko', tgt: 'en', label: '한→영' },
                { src: 'en', tgt: 'ko', label: '영→한' },
                { src: 'ko', tgt: 'ja', label: '한→일' },
                { src: 'ja', tgt: 'ko', label: '일→한' },
                { src: 'ko', tgt: 'zh', label: '한→중' },
                { src: 'ko', tgt: 'es', label: '한→스' },
                { src: 'en', tgt: 'ja', label: '영→일' },
                { src: 'en', tgt: 'fr', label: '영→프' },
              ].map(({ src, tgt, label }) => (
                <button key={`${src}-${tgt}`} onClick={() => {
                  setSrcLang(src); setTgtLang(tgt); setResult('');
                  if (srcText.trim()) {
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    debounceRef.current = setTimeout(() => translate(srcText, src, tgt), 300);
                  }
                }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${srcLang === src && tgtLang === tgt ? 'bg-[#e94560]/15 text-[#e94560] border border-[#e94560]/30' : 'bg-border/40 text-text-muted hover:text-text-primary border border-transparent'}`}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* MULTI TRANSLATE VIEW */}
        {viewMode === 'multi' && (
          <div className="space-y-4">
            <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                <select value={srcLang} onChange={e => setSrcLang(e.target.value)} className="bg-transparent text-sm text-text-primary border-none outline-none cursor-pointer">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
                <span className="text-text-muted">→ 8개 언어 동시 번역</span>
              </div>
              <textarea value={srcText} onChange={e => setSrcText(e.target.value)} placeholder="번역할 텍스트를 입력하세요..."
                className="w-full resize-none p-4 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none leading-relaxed min-h-[120px]" />
              <div className="px-4 py-3 border-t border-border">
                <button onClick={handleMultiTranslate} disabled={!srcText.trim()} className="w-full py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all">
                  🗺️ 8개 언어로 동시 번역
                </button>
              </div>
            </div>
            {multiResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {multiResults.map(r => (
                  <div key={r.lang} className="bg-background-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-text-secondary">{r.flag} {r.label}</span>
                      <div className="flex gap-1">
                        <button onClick={() => navigator.clipboard.writeText(r.text)} disabled={!r.text || r.loading} className="text-xs text-text-muted hover:text-[#e94560] transition-colors">복사</button>
                        <button onClick={() => speak(r.text, r.lang)} disabled={!r.text || r.loading} className="text-xs text-text-muted hover:text-[#e94560] transition-colors">🔊</button>
                      </div>
                    </div>
                    {r.loading ? (
                      <div className="flex gap-1 items-center text-text-muted text-xs"><span className="w-2 h-2 rounded-full bg-[#e94560] animate-pulse" />번역 중...</div>
                    ) : (
                      <p className="text-sm text-text-primary leading-relaxed">{r.text}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HISTORY VIEW */}
        {viewMode === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary font-medium">번역 기록 ({history.length}건)</p>
              {history.length > 0 && <button onClick={clearHistory} className="text-xs text-text-muted hover:text-[#e94560] transition-colors">전체 삭제</button>}
            </div>
            {history.length === 0 ? (
              <div className="text-center py-16 text-text-muted"><p className="text-3xl mb-2">📋</p><p className="text-sm">번역 기록이 없습니다</p></div>
            ) : history.map(item => (
              <div key={item.id} className="bg-background-card border border-border rounded-xl p-4 group">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-[10px] text-text-muted">
                    <span>{LANGUAGES.find(l => l.code === item.srcLang)?.flag} {LANGUAGES.find(l => l.code === item.srcLang)?.label}</span>
                    <span>→</span>
                    <span>{LANGUAGES.find(l => l.code === item.tgtLang)?.flag} {LANGUAGES.find(l => l.code === item.tgtLang)?.label}</span>
                    <span>· {new Date(item.timestamp).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleStar(item.id)} className={`text-base transition-colors ${item.starred ? 'text-yellow-400' : 'text-text-muted hover:text-yellow-400'}`}>⭐</button>
                    <button onClick={() => loadHistoryItem(item)} className="text-xs text-text-muted hover:text-[#e94560] transition-colors">불러오기</button>
                    <button onClick={() => deleteHistory(item.id)} className="text-xs text-text-muted hover:text-[#e94560] transition-colors">✕</button>
                  </div>
                </div>
                <p className="text-sm text-text-secondary line-clamp-1 mb-1">{item.srcText}</p>
                <p className="text-sm font-medium text-text-primary line-clamp-2">{item.result}</p>
              </div>
            ))}
          </div>
        )}

        {/* FAVORITES VIEW */}
        {viewMode === 'favorites' && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary font-medium">즐겨찾기 ({favorites.length}건)</p>
            {favorites.length === 0 ? (
              <div className="text-center py-16 text-text-muted"><p className="text-3xl mb-2">⭐</p><p className="text-sm">즐겨찾기한 번역이 없습니다</p><p className="text-xs mt-1">기록에서 ⭐ 버튼을 눌러 추가하세요</p></div>
            ) : favorites.map(item => (
              <div key={item.id} className="bg-background-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-text-muted">{LANGUAGES.find(l => l.code === item.srcLang)?.flag} → {LANGUAGES.find(l => l.code === item.tgtLang)?.flag}</span>
                  <div className="flex gap-2">
                    <button onClick={() => speak(item.result, item.tgtLang)} className="text-text-muted hover:text-[#e94560] transition-colors">🔊</button>
                    <button onClick={() => loadHistoryItem(item)} className="text-xs text-[#e94560]">불러오기</button>
                    <button onClick={() => toggleStar(item.id)} className="text-yellow-400 hover:opacity-70">⭐</button>
                  </div>
                </div>
                <p className="text-xs text-text-muted mb-1">{item.srcText}</p>
                <p className="text-sm font-medium text-text-primary">{item.result}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <FloatingAIBar
        getAction={(text) => detectCrossPageAction(text) || 'chat'}
        getContext={(text) => {
          const crossAction = detectCrossPageAction(text);
          if (crossAction) return crossPageContext(text, calendarEvents || []);
          return { srcLang, tgtLang, srcText, translatedText: result, userMessage: text };
        }}
        onResult={async (action, result) => {
          if (!user) return;
          await handleCrossPageResult(action, result, user.uid, (path) => router.push(path));
        }}
        placeholder="번역에 대해 AI에게 질문하세요 (예: 더 자연스럽게 바꿔줘)..."
      />
    </div>
  );
}
