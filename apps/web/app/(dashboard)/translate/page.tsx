'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import FloatingAIBar from '@/components/ai/FloatingAIBar';
import { detectCrossPageAction, crossPageContext, handleCrossPageResult } from '@/lib/cross-page-ai';

const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ภาษาไทย' },
  { code: 'ar', label: 'العربية' },
];

export default function TranslatePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { t, language } = useI18n();
  const { calendarEvents } = useDataStore();
  const [srcLang, setSrcLang] = useState('ko');
  const [tgtLang, setTgtLang] = useState('en');
  const [srcText, setSrcText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [srcCopied, setSrcCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translate = useCallback(async (text: string, from: string, to: string) => {
    if (!text.trim()) { setResult(''); setError(''); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
      );
      const data = await res.json();
      if (data.responseStatus === 200) {
        setResult(data.responseData.translatedText);
      } else {
        setError(t('translate.errorGeneric'));
      }
    } catch {
      setError(t('translate.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSrcChange = (text: string) => {
    setSrcText(text);
    setResult('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) return;
    debounceRef.current = setTimeout(() => translate(text, srcLang, tgtLang), 800);
  };

  const handleSwap = () => {
    setSrcLang(tgtLang);
    setTgtLang(srcLang);
    setSrcText(result);
    setResult('');
    if (result.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => translate(result, tgtLang, srcLang), 400);
    }
  };

  const handleLangChange = (type: 'src' | 'tgt', code: string) => {
    if (type === 'src') setSrcLang(code);
    else setTgtLang(code);
    setResult('');
    if (srcText.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const from = type === 'src' ? code : srcLang;
      const to = type === 'tgt' ? code : tgtLang;
      debounceRef.current = setTimeout(() => translate(srcText, from, to), 400);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleClear = () => {
    setSrcText('');
    setResult('');
    setError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const selectCls = "w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] cursor-pointer transition-colors";

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <h2 className="text-2xl font-bold text-text-primary">{t('nav.translate')}</h2>
        </div>

        {/* Lang selectors + swap */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <select value={srcLang} onChange={e => handleLangChange('src', e.target.value)} className={selectCls}>
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSwap}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-all text-base"
            title={t('translate.swapLangs')}
          >
            ⇄
          </button>

          <div className="flex-1">
            <select value={tgtLang} onChange={e => handleLangChange('tgt', e.target.value)} className={selectCls}>
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Translation panels */}
        <div className="grid grid-cols-2 gap-4">
          {/* Source */}
          <div className="bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold text-text-secondary">
                {LANGUAGES.find(l => l.code === srcLang)?.label}
              </span>
              <span className="text-[11px] text-text-muted">{srcText.length} {t('translate.chars')}</span>
            </div>
            <textarea
              value={srcText}
              onChange={e => handleSrcChange(e.target.value)}
              placeholder={t('translate.inputPlaceholder')}
              className="flex-1 resize-none p-4 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none leading-relaxed min-h-[260px]"
            />
            <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(srcText).then(() => { setSrcCopied(true); setTimeout(() => setSrcCopied(false), 1500); })}
                  disabled={!srcText}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  {srcCopied ? t('translate.copied') : t('translate.copy')}
                </button>
                {srcText && (
                  <button
                    onClick={handleClear}
                    className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-[#e94560] transition-colors"
                  >
                    {t('translate.clear')}
                  </button>
                )}
              </div>
              <button
                onClick={() => translate(srcText, srcLang, tgtLang)}
                disabled={!srcText.trim() || loading}
                className="px-4 py-1.5 bg-[#e94560] text-white rounded-xl text-xs font-bold hover:bg-[#d63b55] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? t('translate.translating') : t('translate.translate')}
              </button>
            </div>
          </div>

          {/* Target */}
          <div className="bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold text-text-secondary">
                {LANGUAGES.find(l => l.code === tgtLang)?.label}
              </span>
              <span className="text-[11px] text-text-muted">{result ? `${result.length} ${t('translate.chars')}` : ''}</span>
            </div>
            <div className="flex-1 p-4 min-h-[260px]">
              {loading ? (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#e94560]/60 animate-pulse" />
                  {t('translate.translating')}
                </div>
              ) : error ? (
                <p className="text-sm text-red-400">{error}</p>
              ) : result ? (
                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{result}</p>
              ) : (
                <p className="text-sm text-text-muted">{t('translate.resultPlaceholder')}</p>
              )}
            </div>
            <div className="px-4 py-2.5 border-t border-border">
              <button
                onClick={handleCopy}
                disabled={!result}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                {copied ? t('translate.copied') : t('translate.copy')}
              </button>
            </div>
          </div>
        </div>

        {/* Quick lang shortcuts */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mr-1">{t('translate.quickSelect')}</span>
          {[
            { src: 'ko', tgt: 'en', label: '한→영' },
            { src: 'en', tgt: 'ko', label: '영→한' },
            { src: 'ko', tgt: 'ja', label: '한→일' },
            { src: 'ja', tgt: 'ko', label: '일→한' },
            { src: 'ko', tgt: 'zh', label: '한→중' },
            { src: 'en', tgt: 'ja', label: '영→일' },
            { src: 'en', tgt: 'zh', label: '영→중' },
          ].map(({ src, tgt, label }) => (
            <button
              key={`${src}-${tgt}`}
              onClick={() => {
                setSrcLang(src);
                setTgtLang(tgt);
                setResult('');
                if (srcText.trim()) {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => translate(srcText, src, tgt), 300);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                srcLang === src && tgtLang === tgt
                  ? 'bg-[#e94560]/15 text-[#e94560] border border-[#e94560]/30'
                  : 'bg-border/40 text-text-muted hover:text-text-primary border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <FloatingAIBar
        getAction={(text) => detectCrossPageAction(text) || 'chat'}
        getContext={(text) => {
          const crossAction = detectCrossPageAction(text);
          if (crossAction) return crossPageContext(text, calendarEvents || []);
          return {
            srcLang,
            tgtLang,
            srcText,
            translatedText: result,
            userMessage: text,
          };
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
