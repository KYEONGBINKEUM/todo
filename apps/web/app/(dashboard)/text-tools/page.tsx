'use client';

import { useState, useEffect, useRef } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Tab = 'analyze' | 'case' | 'findreplace' | 'regex' | 'transform' | 'diff';

// ── Text Analysis Tab ─────────────────────────────────────────────────────────
function AnalyzeTab() {
  const [text, setText] = useState('');
  const [realtime, setRealtime] = useState(true);
  const [stats, setStats] = useState<ReturnType<typeof analyzeText> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  function analyzeText(t: string) {
    const withSpaces = t.length;
    const withoutSpaces = t.replace(/\s/g, '').length;
    const words = t.trim() ? t.trim().split(/\s+/).length : 0;
    const sentences = t.trim() ? (t.match(/[^.!?]*[.!?]+/g) || []).length || (t.trim() ? 1 : 0) : 0;
    const lines = t ? t.split('\n').length : 0;
    const paragraphs = t.trim() ? t.split(/\n\s*\n/).filter(p => p.trim()).length : 0;
    const readTime = Math.max(1, Math.ceil(words / 200));
    const koreanChars = (t.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
    const englishChars = (t.match(/[a-zA-Z]/g) || []).length;
    const totalChars = withoutSpaces || 1;
    const koreanRatio = Math.round((koreanChars / totalChars) * 100);
    const englishRatio = Math.round((englishChars / totalChars) * 100);

    // Top 10 words
    const wordFreq: Record<string, number> = {};
    t.toLowerCase().match(/[\w\uAC00-\uD7AF]+/g)?.forEach(w => {
      if (w.length > 1) wordFreq[w] = (wordFreq[w] || 0) + 1;
    });
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return { withSpaces, withoutSpaces, words, sentences, lines, paragraphs, readTime, koreanRatio, englishRatio, topWords };
  }

  useEffect(() => {
    if (!realtime) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStats(analyzeText(text)), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text, realtime]);

  const compute = () => setStats(analyzeText(text));

  const copyStats = () => {
    if (!stats) return;
    const s = [
      `글자수(공백포함): ${stats.withSpaces}`,
      `글자수(공백제외): ${stats.withoutSpaces}`,
      `단어수: ${stats.words}`,
      `문장수: ${stats.sentences}`,
      `줄수: ${stats.lines}`,
      `단락수: ${stats.paragraphs}`,
      `읽는시간: 약 ${stats.readTime}분`,
      `한국어 비율: ${stats.koreanRatio}%`,
      `영어 비율: ${stats.englishRatio}%`,
    ].join('\n');
    navigator.clipboard.writeText(s);
  };

  const statItems = stats ? [
    { label: '글자수 (공백 포함)', value: stats.withSpaces.toLocaleString() },
    { label: '글자수 (공백 제외)', value: stats.withoutSpaces.toLocaleString() },
    { label: '단어수', value: stats.words.toLocaleString() },
    { label: '문장수', value: stats.sentences.toLocaleString() },
    { label: '줄수', value: stats.lines.toLocaleString() },
    { label: '단락수', value: stats.paragraphs.toLocaleString() },
    { label: '읽는 시간', value: `약 ${stats.readTime}분` },
    { label: '한국어 비율', value: `${stats.koreanRatio}%` },
    { label: '영어 비율', value: `${stats.englishRatio}%` },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">텍스트 분석</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={realtime} onChange={e => setRealtime(e.target.checked)}
              className="accent-[#e94560]" />
            <span className="text-sm text-text-secondary">실시간 분석</span>
          </label>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
          placeholder="분석할 텍스트를 입력하세요..."
          className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
        {!realtime && (
          <button onClick={compute}
            className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            분석
          </button>
        )}
      </div>

      {stats && (
        <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-secondary">분석 결과</h3>
            <button onClick={copyStats}
              className="text-xs px-3 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
              통계 복사
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {statItems.map(({ label, value }) => (
              <div key={label} className="bg-background rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-[#e94560]">{value}</p>
                <p className="text-xs text-text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>
          {stats.topWords.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-text-muted mb-2">자주 쓰인 단어 Top 10</h4>
              <div className="space-y-1">
                {stats.topWords.map(([word, count], i) => (
                  <div key={word} className="flex items-center gap-2">
                    <span className="text-xs text-text-muted w-5 text-right">{i + 1}.</span>
                    <div className="flex-1 bg-background rounded overflow-hidden h-5 relative">
                      <div className="absolute inset-y-0 left-0 bg-[#e94560]/20 rounded transition-all"
                        style={{ width: `${(count / stats.topWords[0][1]) * 100}%` }} />
                      <span className="absolute inset-y-0 left-2 text-xs text-text-primary flex items-center">{word}</span>
                    </div>
                    <span className="text-xs font-mono text-text-muted w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Case Conversion Tab ───────────────────────────────────────────────────────
function CaseTab() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  const toTitleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
  const toSentenceCase = (s: string) => s.replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase()).replace(/(^\s*\w|[.!?]\s+\w)/g, c => c);
  const toAlternating = (s: string) => Array.from(s).map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join('');
  const toReverse = (s: string) => s.split('').reverse().join('');
  const toCamel = (s: string) => s.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, c => c.toLowerCase());
  const toPascal = (s: string) => s.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, c => c.toUpperCase());
  const toSnake = (s: string) => s.replace(/([A-Z])/g, '_$1').replace(/[-\s]+/g, '_').toLowerCase().replace(/^_/, '');
  const toKebab = (s: string) => s.replace(/([A-Z])/g, '-$1').replace(/[_\s]+/g, '-').toLowerCase().replace(/^-/, '');
  const toConstant = (s: string) => toSnake(s).toUpperCase();

  const applyTransform = (fn: (s: string) => string) => setOutput(fn(input));
  const copy = () => navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  const buttons = [
    { label: '대문자', fn: (s: string) => s.toUpperCase() },
    { label: '소문자', fn: (s: string) => s.toLowerCase() },
    { label: '첫글자대문자 (Title Case)', fn: toTitleCase },
    { label: '문장 시작 대문자', fn: toSentenceCase },
    { label: '번갈아가며 (aLtErNaTiNg)', fn: toAlternating },
    { label: '역순 (tRsEvEr)', fn: toReverse },
    { label: 'camelCase', fn: toCamel },
    { label: 'PascalCase', fn: toPascal },
    { label: 'snake_case', fn: toSnake },
    { label: 'kebab-case', fn: toKebab },
    { label: 'CONSTANT_CASE', fn: toConstant },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">대소문자 / 케이스 변환</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">입력</label>
            <textarea value={input} onChange={e => setInput(e.target.value)} rows={8}
              placeholder="텍스트 입력..."
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-text-muted">결과</label>
              <div className="flex gap-2">
                <button onClick={() => { setInput(output); setOutput(''); }}
                  className="text-xs px-2 py-0.5 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
                  ⇄ 교환
                </button>
                <button onClick={copy}
                  className="text-xs px-2 py-0.5 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
                  {copied ? '복사됨!' : '복사'}
                </button>
              </div>
            </div>
            <textarea value={output} readOnly rows={8}
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary resize-none" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {buttons.map(({ label, fn }) => (
            <button key={label} onClick={() => applyTransform(fn)}
              className="px-3 py-1.5 rounded-lg text-sm bg-background border border-border text-text-secondary hover:border-[#e94560] hover:text-[#e94560] transition-colors">
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Find & Replace Tab ────────────────────────────────────────────────────────
function FindReplaceTab() {
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regexMode, setRegexMode] = useState(false);
  const [result, setResult] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  const buildRegex = (pattern: string, flags: string): RegExp => {
    let p = pattern;
    if (!regexMode) p = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) p = `\\b${p}\\b`;
    return new RegExp(p, flags);
  };

  const countMatches = () => {
    if (!find) return;
    try {
      const flags = `g${caseSensitive ? '' : 'i'}`;
      const re = buildRegex(find, flags);
      const matches = text.match(re);
      setMatchCount(matches ? matches.length : 0);
      setError('');
    } catch (e) { setError('잘못된 정규식: ' + String(e)); }
  };

  const replaceFirst = () => {
    if (!find) return;
    try {
      const flags = caseSensitive ? '' : 'i';
      const re = buildRegex(find, flags);
      setResult(text.replace(re, replace));
      setError('');
    } catch (e) { setError('잘못된 정규식: ' + String(e)); }
  };

  const replaceAll = () => {
    if (!find) return;
    try {
      const flags = `g${caseSensitive ? '' : 'i'}`;
      const re = buildRegex(find, flags);
      const newText = text.replace(re, replace);
      const matches = text.match(re);
      setResult(newText);
      setMatchCount(matches ? matches.length : 0);
      setError('');
    } catch (e) { setError('잘못된 정규식: ' + String(e)); }
  };

  useEffect(() => {
    if (!find) { setMatchCount(null); return; }
    try {
      const flags = `g${caseSensitive ? '' : 'i'}`;
      let p = find;
      if (!regexMode) p = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) p = `\\b${p}\\b`;
      const re = new RegExp(p, flags);
      const matches = text.match(re);
      setMatchCount(matches ? matches.length : 0);
      setError('');
    } catch (e) { setError('잘못된 정규식: ' + String(e)); }
  }, [text, find, caseSensitive, wholeWord, regexMode]);

  return (
    <div className="space-y-4">
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">찾기 / 바꾸기</h2>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
          placeholder="텍스트를 입력하세요..."
          className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">찾기</label>
            <input value={find} onChange={e => setFind(e.target.value)}
              placeholder="검색할 텍스트..."
              className="w-full bg-background border border-border rounded-lg p-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">바꾸기</label>
            <input value={replace} onChange={e => setReplace(e.target.value)}
              placeholder="바꿀 텍스트..."
              className="w-full bg-background border border-border rounded-lg p-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]" />
          </div>
        </div>
        <div className="flex gap-4 flex-wrap">
          {[
            { label: '대소문자 구분', value: caseSensitive, set: setCaseSensitive },
            { label: '전체 단어', value: wholeWord, set: setWholeWord },
            { label: '정규식 모드', value: regexMode, set: setRegexMode },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={value} onChange={e => set(e.target.checked)}
                className="accent-[#e94560]" />
              <span className="text-sm text-text-secondary">{label}</span>
            </label>
          ))}
        </div>
        {matchCount !== null && (
          <p className="text-sm text-[#e94560] font-medium">{matchCount}개 일치</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={replaceFirst}
            className="flex-1 bg-background border border-border hover:border-[#e94560] text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors">
            첫 번째 교체
          </button>
          <button onClick={replaceAll}
            className="flex-1 bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            전체 교체
          </button>
        </div>
        {result && (
          <div>
            <label className="text-xs text-text-muted mb-1 block">결과</label>
            <textarea value={result} readOnly rows={5}
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary resize-none" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Regex Tester Tab ──────────────────────────────────────────────────────────
interface RegexMatch {
  index: number;
  match: string;
  groups: string[];
}

function RegexTab() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState({ g: true, i: false, m: false, s: false });
  const [testStr, setTestStr] = useState('');
  const [matches, setMatches] = useState<RegexMatch[]>([]);
  const [error, setError] = useState('');

  const presets = [
    { label: '이메일', pattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}' },
    { label: '전화번호', pattern: '0\\d{1,2}[-\\s]?\\d{3,4}[-\\s]?\\d{4}' },
    { label: 'URL', pattern: 'https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)' },
    { label: '날짜', pattern: '\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}' },
    { label: 'IP주소', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' },
    { label: '한국어', pattern: '[\\uAC00-\\uD7AF]+' },
    { label: '숫자만', pattern: '\\d+' },
    { label: 'HTML태그', pattern: '<[^>]+>' },
  ];

  const flagStr = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join('');

  const highlightMatches = (): React.ReactNode => {
    if (!matches.length || !testStr) return testStr;
    const result: React.ReactNode[] = [];
    let lastIdx = 0;
    for (const m of matches) {
      if (m.index > lastIdx) result.push(testStr.slice(lastIdx, m.index));
      result.push(
        <mark key={m.index} className="bg-yellow-400/40 text-text-primary rounded px-0.5">{m.match}</mark>
      );
      lastIdx = m.index + m.match.length;
    }
    if (lastIdx < testStr.length) result.push(testStr.slice(lastIdx));
    return result;
  };

  useEffect(() => {
    if (!pattern || !testStr) { setMatches([]); setError(''); return; }
    try {
      const found: RegexMatch[] = [];
      if (flagStr.includes('g')) {
        let m: RegExpExecArray | null;
        const tempRe = new RegExp(pattern, flagStr);
        while ((m = tempRe.exec(testStr)) !== null) {
          found.push({ index: m.index, match: m[0], groups: m.slice(1) });
          if (m[0].length === 0) { tempRe.lastIndex++; }
        }
      } else {
        const re = new RegExp(pattern, flagStr || '');
        const m = re.exec(testStr);
        if (m) found.push({ index: m.index, match: m[0], groups: m.slice(1) });
      }
      setMatches(found);
      setError('');
    } catch (e) { setError(String(e)); setMatches([]); }
  }, [pattern, flagStr, testStr]);

  return (
    <div className="space-y-4">
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">정규식 테스터</h2>

        {/* Presets */}
        <div className="flex gap-2 flex-wrap">
          {presets.map(({ label, pattern: p }) => (
            <button key={label} onClick={() => setPattern(p)}
              className="px-2.5 py-1 rounded-lg text-xs bg-background border border-border text-text-secondary hover:border-[#e94560] hover:text-[#e94560] transition-colors">
              {label}
            </button>
          ))}
        </div>

        {/* Pattern input + flags */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg overflow-hidden focus-within:border-[#e94560]">
            <span className="pl-3 text-text-muted text-sm font-mono">/</span>
            <input value={pattern} onChange={e => setPattern(e.target.value)}
              placeholder="정규식 패턴..."
              className="flex-1 bg-transparent py-2 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none" />
            <span className="text-text-muted text-sm font-mono">/</span>
            <span className="pr-3 text-[#e94560] text-sm font-mono">{flagStr}</span>
          </div>
          <div className="flex gap-3">
            {(['g', 'i', 'm', 's'] as const).map(f => (
              <label key={f} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={flags[f]} onChange={e => setFlags(prev => ({ ...prev, [f]: e.target.checked }))}
                  className="accent-[#e94560]" />
                <span className="text-sm text-text-secondary font-mono">{f}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}

        {/* Test string */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">테스트 문자열</label>
          <textarea value={testStr} onChange={e => setTestStr(e.target.value)} rows={6}
            placeholder="테스트할 텍스트를 입력하세요..."
            className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
        </div>

        {/* Highlighted preview */}
        {testStr && (
          <div>
            <label className="text-xs text-text-muted mb-1 block">하이라이트 미리보기 ({matches.length}개 일치)</label>
            <div className="bg-background border border-border rounded-lg p-3 text-sm text-text-primary whitespace-pre-wrap break-all min-h-[60px]">
              {highlightMatches()}
            </div>
          </div>
        )}

        {/* Match list */}
        {matches.length > 0 && (
          <div>
            <label className="text-xs text-text-muted mb-2 block">매치 목록</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {matches.map((m, i) => (
                <div key={i} className="flex items-start gap-3 bg-background rounded-lg px-3 py-2">
                  <span className="text-xs text-text-muted font-mono w-8 shrink-0">#{i + 1}</span>
                  <span className="text-xs text-text-muted w-16 shrink-0">@{m.index}</span>
                  <span className="text-xs font-mono text-[#e94560] flex-1 break-all">{m.match}</span>
                  {m.groups.length > 0 && (
                    <span className="text-xs text-text-muted shrink-0">그룹: [{m.groups.join(', ')}]</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transform Tab ─────────────────────────────────────────────────────────────
function TransformTab() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loremCount, setLoremCount] = useState(3);
  const [copied, setCopied] = useState(false);

  const loremWords = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');

  const generateLorem = (sentences: number): string => {
    const result: string[] = [];
    for (let i = 0; i < sentences; i++) {
      const len = 8 + Math.floor(Math.random() * 12);
      const words: string[] = [];
      for (let j = 0; j < len; j++) words.push(loremWords[Math.floor(Math.random() * loremWords.length)]);
      const sentence = words.join(' ');
      result.push(sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.');
    }
    return result.join(' ');
  };

  const simpleMarkdownToHtml = (md: string): string => {
    return md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[h|u|l|p])(.+)$/gm, '<p>$1</p>');
  };

  const ops = [
    { label: '줄 정렬 A→Z', fn: (s: string) => s.split('\n').sort().join('\n') },
    { label: '줄 정렬 Z→A', fn: (s: string) => s.split('\n').sort().reverse().join('\n') },
    { label: '중복 제거', fn: (s: string) => [...new Set(s.split('\n'))].join('\n') },
    { label: '빈 줄 제거', fn: (s: string) => s.split('\n').filter(l => l.trim()).join('\n') },
    { label: '앞뒤 공백 제거', fn: (s: string) => s.split('\n').map(l => l.trim()).join('\n') },
    { label: '줄 번호 추가', fn: (s: string) => s.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n') },
    { label: '줄 역순', fn: (s: string) => s.split('\n').reverse().join('\n') },
    { label: '무작위 순서', fn: (s: string) => s.split('\n').sort(() => Math.random() - 0.5).join('\n') },
    { label: 'JSON 정렬 (포맷)', fn: (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return 'JSON 파싱 오류'; } } },
    { label: 'JSON 축소', fn: (s: string) => { try { return JSON.stringify(JSON.parse(s)); } catch { return 'JSON 파싱 오류'; } } },
    { label: 'Markdown → HTML', fn: simpleMarkdownToHtml },
  ];

  const copy = () => navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  return (
    <div className="space-y-4">
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">텍스트 변환</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">입력</label>
            <textarea value={input} onChange={e => setInput(e.target.value)} rows={10}
              placeholder="텍스트 입력..."
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-text-muted">결과</label>
              <button onClick={copy}
                className="text-xs px-2 py-0.5 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>
            <textarea value={output} readOnly rows={10}
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary resize-none" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ops.map(({ label, fn }) => (
            <button key={label} onClick={() => setOutput(fn(input))}
              className="px-3 py-1.5 rounded-lg text-sm bg-background border border-border text-text-secondary hover:border-[#e94560] hover:text-[#e94560] transition-colors">
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lorem ipsum generator */}
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-secondary">Lorem Ipsum 생성기</h3>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">문장 수</span>
            <input type="number" min={1} max={20} value={loremCount}
              onChange={e => setLoremCount(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="w-16 bg-background border border-border rounded-lg px-2 py-1 text-sm text-text-primary text-center" />
          </div>
          <button onClick={() => setOutput(generateLorem(loremCount))}
            className="flex-1 bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            Lorem Ipsum 생성
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diff Viewer Tab ───────────────────────────────────────────────────────────
interface DiffLine {
  type: 'added' | 'removed' | 'same';
  content: string;
}

function DiffTab() {
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const [diff, setDiff] = useState<DiffLine[]>([]);
  const [computed, setComputed] = useState(false);

  const computeDiff = () => {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const result: DiffLine[] = [];

    // LCS-based simple diff
    const m = linesA.length, n = linesB.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (linesA[i] === linesB[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    let i = 0, j = 0;
    while (i < m || j < n) {
      if (i < m && j < n && linesA[i] === linesB[j]) {
        result.push({ type: 'same', content: linesA[i] });
        i++; j++;
      } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
        result.push({ type: 'added', content: linesB[j] });
        j++;
      } else {
        result.push({ type: 'removed', content: linesA[i] });
        i++;
      }
    }

    setDiff(result);
    setComputed(true);
  };

  const added = diff.filter(d => d.type === 'added').length;
  const removed = diff.filter(d => d.type === 'removed').length;

  return (
    <div className="space-y-4">
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">텍스트 비교 (Diff)</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">텍스트 A</label>
            <textarea value={textA} onChange={e => setTextA(e.target.value)} rows={8}
              placeholder="원본 텍스트..."
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">텍스트 B</label>
            <textarea value={textB} onChange={e => setTextB(e.target.value)} rows={8}
              placeholder="비교할 텍스트..."
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
          </div>
        </div>
        <button onClick={computeDiff}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          비교하기
        </button>
      </div>

      {computed && (
        <div className="bg-background-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-500 font-medium">+{added}줄 추가됨</span>
            <span className="text-red-500 font-medium">-{removed}줄 삭제됨</span>
            <span className="text-text-muted">{diff.filter(d => d.type === 'same').length}줄 동일</span>
          </div>
          <div className="bg-background rounded-lg overflow-hidden border border-border font-mono text-sm max-h-96 overflow-y-auto">
            {diff.map((line, i) => (
              <div key={i} className={`flex items-start px-3 py-0.5 ${
                line.type === 'added' ? 'bg-green-500/10' :
                line.type === 'removed' ? 'bg-red-500/10' : ''
              }`}>
                <span className={`w-5 shrink-0 select-none ${
                  line.type === 'added' ? 'text-green-500' :
                  line.type === 'removed' ? 'text-red-500' : 'text-text-muted'
                }`}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className={`${
                  line.type === 'added' ? 'text-green-400' :
                  line.type === 'removed' ? 'text-red-400' : 'text-text-primary'
                } break-all`}>{line.content || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TextToolsPage() {
  const [tab, setTab] = useState<Tab>('analyze');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'analyze', label: '텍스트 분석' },
    { key: 'case', label: '케이스 변환' },
    { key: 'findreplace', label: '찾기/바꾸기' },
    { key: 'regex', label: '정규식 테스터' },
    { key: 'transform', label: '텍스트 변환' },
    { key: 'diff', label: '텍스트 비교' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-card px-6 py-4">
        <h1 className="text-2xl font-bold text-text-primary">✂️ 텍스트 도구</h1>
        <p className="text-sm text-text-muted mt-1">텍스트 분석, 변환, 비교, 정규식 테스터</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border bg-background-card px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === key
                  ? 'border-[#e94560] text-[#e94560]'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto">
        {tab === 'analyze' && <AnalyzeTab />}
        {tab === 'case' && <CaseTab />}
        {tab === 'findreplace' && <FindReplaceTab />}
        {tab === 'regex' && <RegexTab />}
        {tab === 'transform' && <TransformTab />}
        {tab === 'diff' && <DiffTab />}
      </div>

      <FloatingAIBar getContext={() => ({ page: "text-tools" })} getAction={() => "chat"} onResult={() => {}} placeholder="텍스트 도구에 대해 질문하세요..." />
    </div>
  );
}
