'use client';

import { useState, useCallback } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'password' | 'hash' | 'encoding' | 'uuid' | 'jwt';

// ── MD5 Implementation ────────────────────────────────────────────────────────
function md5(input: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function md5blks(s: string): number[] {
    const nblk = ((s.length + 8) >> 6) + 1;
    const blks: number[] = new Array(nblk * 16).fill(0);
    for (let i = 0; i < s.length; i++) blks[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8);
    blks[s.length >> 2] |= 0x80 << ((s.length % 4) * 8);
    blks[nblk * 16 - 2] = s.length * 8;
    return blks;
  }
  function md5Run(m: number[]): number[] {
    let [a, b, c, d] = [1732584193, -271733879, -1732584194, 271733878];
    for (let i = 0; i < m.length; i += 16) {
      const [aa, bb, cc, dd] = [a, b, c, d];
      a = md5ff(a, b, c, d, m[i], 7, -680876936); d = md5ff(d, a, b, c, m[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, m[i + 2], 17, 606105819); b = md5ff(b, c, d, a, m[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, m[i + 4], 7, -176418897); d = md5ff(d, a, b, c, m[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, m[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, m[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, m[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, m[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, m[i + 10], 17, -42063); b = md5ff(b, c, d, a, m[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, m[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, m[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, m[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, m[i + 15], 22, 1236535329);
      a = md5gg(a, b, c, d, m[i + 1], 5, -165796510); d = md5gg(d, a, b, c, m[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, m[i + 11], 14, 643717713); b = md5gg(b, c, d, a, m[i], 20, -373897302);
      a = md5gg(a, b, c, d, m[i + 5], 5, -701558691); d = md5gg(d, a, b, c, m[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, m[i + 15], 14, -660478335); b = md5gg(b, c, d, a, m[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, m[i + 9], 5, 568446438); d = md5gg(d, a, b, c, m[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, m[i + 3], 14, -187363961); b = md5gg(b, c, d, a, m[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, m[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, m[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, m[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, m[i + 12], 20, -1926607734);
      a = md5hh(a, b, c, d, m[i + 5], 4, -378558); d = md5hh(d, a, b, c, m[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, m[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, m[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, m[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, m[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, m[i + 7], 16, -155497632); b = md5hh(b, c, d, a, m[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, m[i + 13], 4, 681279174); d = md5hh(d, a, b, c, m[i], 11, -358537222);
      c = md5hh(c, d, a, b, m[i + 3], 16, -722521979); b = md5hh(b, c, d, a, m[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, m[i + 9], 4, -640364487); d = md5hh(d, a, b, c, m[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, m[i + 15], 16, 530742520); b = md5hh(b, c, d, a, m[i + 2], 23, -995338651);
      a = md5ii(a, b, c, d, m[i], 6, -198630844); d = md5ii(d, a, b, c, m[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, m[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, m[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, m[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, m[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, m[i + 10], 15, -1051523); b = md5ii(b, c, d, a, m[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, m[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, m[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, m[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, m[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, m[i + 4], 6, -145523070); d = md5ii(d, a, b, c, m[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, m[i + 2], 15, 718787259); b = md5ii(b, c, d, a, m[i + 9], 21, -343485551);
      a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
    }
    return [a, b, c, d];
  }
  function rhex(n: number): string {
    let s = '';
    for (let j = 0; j < 4; j++) s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16);
    return s;
  }
  // Convert string to latin1 byte string for MD5
  const encoded = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const result = md5Run(md5blks(encoded));
  return result.map(rhex).join('');
}

// ── Password Generator Tab ────────────────────────────────────────────────────
function PasswordGeneratorTab() {
  const [length, setLength] = useState(16);
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(false);
  const [pronounceable, setPronounceable] = useState(false);
  const [count, setCount] = useState(1);
  const [passwords, setPasswords] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState('');

  const generatePassword = useCallback((): string => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const upperFull = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const lowerFull = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '23456789';
    const numbersFull = '0123456789';
    const symbols = '!@#$%^&*';

    let chars = '';
    if (pronounceable) {
      if (useUpper) chars += upper;
      if (useLower) chars += lower;
      if (useNumbers) chars += numbers;
      if (useSymbols) chars += symbols;
    } else {
      if (useUpper) chars += upperFull;
      if (useLower) chars += lowerFull;
      if (useNumbers) chars += numbersFull;
      if (useSymbols) chars += symbols;
    }
    if (!chars) chars = lowerFull;

    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(v => chars[v % chars.length]).join('');
  }, [length, useUpper, useLower, useNumbers, useSymbols, pronounceable]);

  const generate = () => {
    const newPasswords = Array.from({ length: count }, () => generatePassword());
    setPasswords(newPasswords);
    setHistory(prev => [...newPasswords, ...prev].slice(0, 10));
  };

  const getStrength = (pwd: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (pwd.length >= 20) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { score, label: '매우 약함', color: '#ef4444' };
    if (score <= 2) return { score, label: '약함', color: '#f97316' };
    if (score <= 3) return { score, label: '보통', color: '#eab308' };
    if (score <= 5) return { score, label: '강함', color: '#22c55e' };
    return { score, label: '매우 강함', color: '#16a34a' };
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-text-primary">비밀번호 생성기</h2>

        {/* Length */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm text-text-secondary">길이</span>
            <span className="text-sm font-mono font-bold text-[#e94560]">{length}</span>
          </div>
          <input type="range" min={8} max={128} value={length}
            onChange={e => setLength(Number(e.target.value))}
            className="w-full accent-[#e94560]" />
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>8</span><span>128</span>
          </div>
        </div>

        {/* Checkboxes */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: '대문자 (A-Z)', value: useUpper, set: setUseUpper },
            { label: '소문자 (a-z)', value: useLower, set: setUseLower },
            { label: '숫자 (0-9)', value: useNumbers, set: setUseNumbers },
            { label: '특수문자 (!@#$%^&*)', value: useSymbols, set: setUseSymbols },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={value} onChange={e => set(e.target.checked)}
                className="accent-[#e94560] w-4 h-4" />
              <span className="text-sm text-text-secondary">{label}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 cursor-pointer col-span-2">
            <input type="checkbox" checked={pronounceable} onChange={e => setPronounceable(e.target.checked)}
              className="accent-[#e94560] w-4 h-4" />
            <span className="text-sm text-text-secondary">발음 가능 (혼동 문자 제외: 0,O,l,1,I)</span>
          </label>
        </div>

        {/* Count + Generate */}
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">개수</span>
            <input type="number" min={1} max={20} value={count}
              onChange={e => setCount(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="w-16 bg-background border border-border rounded-lg px-2 py-1 text-sm text-text-primary text-center" />
          </div>
          <button onClick={generate}
            className="flex-1 bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            생성하기
          </button>
        </div>
      </div>

      {/* Results */}
      {passwords.length > 0 && (
        <div className="bg-background-card border border-border rounded-xl p-6 space-y-3">
          <h3 className="text-sm font-semibold text-text-secondary">생성된 비밀번호</h3>
          {passwords.map((pwd, i) => {
            const { score, label, color } = getStrength(pwd);
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2 bg-background rounded-lg p-3">
                  <span className="flex-1 font-mono text-sm text-text-primary break-all">{pwd}</span>
                  <button onClick={() => copy(pwd, `pwd-${i}`)}
                    className="text-xs px-2 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors shrink-0">
                    {copied === `pwd-${i}` ? '복사됨!' : '복사'}
                  </button>
                </div>
                {/* Strength meter */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${(score / 7) * 100}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs font-medium" style={{ color }}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-background-card border border-border rounded-xl p-6 space-y-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-text-secondary">최근 생성 기록 (최대 10개)</h3>
            <button onClick={() => setHistory([])} className="text-xs text-[#e94560] hover:underline">지우기</button>
          </div>
          {history.map((pwd, i) => (
            <div key={i} className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
              <span className="flex-1 font-mono text-xs text-text-muted break-all">{pwd}</span>
              <button onClick={() => copy(pwd, `hist-${i}`)}
                className="text-xs px-2 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors shrink-0">
                {copied === `hist-${i}` ? '복사됨!' : '복사'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hash Calculator Tab ───────────────────────────────────────────────────────
function HashTab() {
  const [input, setInput] = useState('');
  const [algorithm, setAlgorithm] = useState<'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'>('SHA-256');
  const [hashResult, setHashResult] = useState('');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  const computeHash = useCallback(async (text: string, algo: string): Promise<string> => {
    if (algo === 'MD5') return md5(text);
    const hash = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  const handleCompute = async () => {
    const result = await computeHash(input, algorithm);
    setHashResult(result);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    if (algorithm === 'MD5') {
      const text = await file.text();
      setHashResult(md5(text));
    } else {
      const hash = await crypto.subtle.digest(algorithm, buf);
      setHashResult(Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const copy = () => {
    navigator.clipboard.writeText(hashResult).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const compareResult = compareA && compareB
    ? compareA.trim().toLowerCase() === compareB.trim().toLowerCase()
    : null;

  return (
    <div className="space-y-6">
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">해시 계산</h2>

        {/* Algorithm */}
        <div className="flex gap-2 flex-wrap">
          {(['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const).map(a => (
            <button key={a} onClick={() => setAlgorithm(a)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                algorithm === a ? 'bg-[#e94560] text-white' : 'bg-background border border-border text-text-secondary hover:text-text-primary'
              }`}>{a}</button>
          ))}
        </div>

        {/* Input */}
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={4}
          placeholder="해시할 텍스트를 입력하세요..."
          className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />

        {/* File drag & drop */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
            isDragging ? 'border-[#e94560] bg-[#e94560]/5' : 'border-border'
          }`}
          onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFile(file);
            };
            inp.click();
          }}>
          <p className="text-sm text-text-muted">
            {fileName ? `파일: ${fileName}` : '파일 드래그 & 드롭 또는 클릭하여 파일 해시 계산'}
          </p>
        </div>

        <button onClick={handleCompute}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          해시 계산
        </button>

        {/* Result */}
        {hashResult && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{algorithm} 해시</span>
              <button onClick={copy} className="text-xs px-2 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>
            <div className="bg-background rounded-lg p-3 font-mono text-sm text-text-primary break-all">{hashResult}</div>
          </div>
        )}
      </div>

      {/* Compare mode */}
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-secondary">해시 비교</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)}
              className="accent-[#e94560]" />
            <span className="text-sm text-text-secondary">비교 모드 활성화</span>
          </label>
        </div>
        {compareMode && (
          <div className="space-y-3">
            <input type="text" value={compareA} onChange={e => setCompareA(e.target.value)}
              placeholder="해시 A 붙여넣기..."
              className="w-full bg-background border border-border rounded-lg p-3 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]" />
            <input type="text" value={compareB} onChange={e => setCompareB(e.target.value)}
              placeholder="해시 B 붙여넣기..."
              className="w-full bg-background border border-border rounded-lg p-3 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]" />
            {compareResult !== null && (
              <div className={`p-3 rounded-lg text-sm font-semibold text-center ${
                compareResult ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
              }`}>
                {compareResult ? '✅ 일치합니다' : '❌ 불일치합니다'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Encoding/Decoding Tab ─────────────────────────────────────────────────────
type EncodingFormat = 'base64' | 'url' | 'html' | 'unicode' | 'hex';

function EncodingTab() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [format, setFormat] = useState<EncodingFormat>('base64');
  const [copied, setCopied] = useState(false);
  const [autoDetectResult, setAutoDetectResult] = useState('');

  const encode = (text: string, fmt: EncodingFormat): string => {
    switch (fmt) {
      case 'base64':
        try {
          const latin1 = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          return btoa(latin1);
        } catch { return 'Error: invalid input'; }
      case 'url':
        return encodeURIComponent(text);
      case 'html':
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      case 'unicode':
        return Array.from(text).map(c => c.codePointAt(0)! > 127 ? `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}` : c).join('');
      case 'hex':
        return Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    }
  };

  const decode = (text: string, fmt: EncodingFormat): string => {
    try {
      switch (fmt) {
        case 'base64': {
          const binary = atob(text);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new TextDecoder().decode(bytes);
        }
        case 'url':
          return decodeURIComponent(text);
        case 'html':
          return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        case 'unicode':
          return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
        case 'hex': {
          const hexBytes = text.trim().split(/\s+/).map(h => parseInt(h, 16));
          return new TextDecoder().decode(new Uint8Array(hexBytes));
        }
      }
    } catch {
      return 'Error: decoding failed';
    }
  };

  const autoDetect = () => {
    const fmts: EncodingFormat[] = ['base64', 'url', 'html', 'unicode', 'hex'];
    const results: string[] = [];
    for (const fmt of fmts) {
      try {
        const decoded = decode(input, fmt);
        if (decoded && !decoded.startsWith('Error')) {
          results.push(`${fmt.toUpperCase()}: "${decoded.slice(0, 50)}${decoded.length > 50 ? '...' : ''}"`);
        }
      } catch {}
    }
    setAutoDetectResult(results.length ? results.join('\n') : '자동 감지 실패');
  };

  const copy = () => {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const formats: { key: EncodingFormat; label: string }[] = [
    { key: 'base64', label: 'Base64' },
    { key: 'url', label: 'URL Encode' },
    { key: 'html', label: 'HTML Entities' },
    { key: 'unicode', label: 'Unicode Escape' },
    { key: 'hex', label: 'Hex' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">인코딩 / 디코딩</h2>

        {/* Format tabs */}
        <div className="flex gap-2 flex-wrap">
          {formats.map(({ key, label }) => (
            <button key={key} onClick={() => setFormat(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                format === key ? 'bg-[#e94560] text-white' : 'bg-background border border-border text-text-secondary hover:text-text-primary'
              }`}>{label}</button>
          ))}
        </div>

        {/* Input */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">입력</label>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={5}
            placeholder="텍스트를 입력하세요..."
            className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={() => setOutput(encode(input, format))}
            className="flex-1 bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            인코딩
          </button>
          <button onClick={() => setOutput(decode(input, format))}
            className="flex-1 bg-background border border-border hover:border-[#e94560] text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors">
            디코딩
          </button>
          <button onClick={autoDetect}
            className="px-4 py-2 rounded-lg bg-background border border-border text-text-secondary hover:text-text-primary text-sm transition-colors">
            자동 감지
          </button>
        </div>

        {/* Output */}
        {output && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted">결과</label>
              <button onClick={copy} className="text-xs px-2 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
                {copied ? '복사됨!' : '복사'}
              </button>
            </div>
            <div className="bg-background rounded-lg p-3 font-mono text-sm text-text-primary break-all whitespace-pre-wrap">{output}</div>
          </div>
        )}

        {/* Auto detect result */}
        {autoDetectResult && (
          <div className="bg-background rounded-lg p-3 text-sm text-text-secondary whitespace-pre-wrap">
            <p className="text-xs text-text-muted mb-1">자동 감지 결과</p>
            {autoDetectResult}
          </div>
        )}
      </div>
    </div>
  );
}

// ── UUID / Random Tab ─────────────────────────────────────────────────────────
type RandomType = 'uuid' | 'number' | 'string' | 'email';

function UUIDTab() {
  const [uuidCount, setUuidCount] = useState(5);
  const [uuids, setUuids] = useState<string[]>([]);
  const [randomType, setRandomType] = useState<RandomType>('uuid');
  const [randomCount, setRandomCount] = useState(5);
  const [randomResults, setRandomResults] = useState<string[]>([]);
  const [copied, setCopied] = useState('');

  const generateUUID = (): string => crypto.randomUUID();

  const generateRandom = (type: RandomType): string => {
    switch (type) {
      case 'uuid': return crypto.randomUUID();
      case 'number': {
        const arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return String(arr[0]);
      }
      case 'string': {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(v => chars[v % chars.length]).join('');
      }
      case 'email': {
        const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com', 'test.org'];
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const arr = new Uint8Array(8);
        crypto.getRandomValues(arr);
        const name = Array.from(arr).map(v => chars[v % chars.length]).join('');
        const domArr = new Uint8Array(1);
        crypto.getRandomValues(domArr);
        return `${name}@${domains[domArr[0] % domains.length]}`;
      }
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const copyAll = (items: string[]) => {
    navigator.clipboard.writeText(items.join('\n')).then(() => {
      setCopied('all');
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const typeLabels: Record<RandomType, string> = {
    uuid: 'UUID v4',
    number: '랜덤 숫자',
    string: '랜덤 문자열',
    email: '랜덤 이메일',
  };

  return (
    <div className="space-y-6">
      {/* UUID section */}
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">UUID v4 생성</h2>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">개수</span>
            <input type="number" min={1} max={100} value={uuidCount}
              onChange={e => setUuidCount(Math.max(1, Math.min(100, Number(e.target.value))))}
              className="w-16 bg-background border border-border rounded-lg px-2 py-1 text-sm text-text-primary text-center" />
          </div>
          <button onClick={() => setUuids(Array.from({ length: uuidCount }, generateUUID))}
            className="flex-1 bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            UUID 생성
          </button>
        </div>
        {uuids.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button onClick={() => copyAll(uuids)}
                className="text-xs px-3 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
                {copied === 'all' ? '복사됨!' : '전체 복사'}
              </button>
            </div>
            <div className="bg-background rounded-lg p-3 space-y-1 max-h-60 overflow-y-auto">
              {uuids.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs text-text-primary">{u}</span>
                  <button onClick={() => copy(u, `uuid-${i}`)}
                    className="text-xs px-1.5 py-0.5 rounded bg-border text-text-muted hover:text-text-primary transition-colors shrink-0">
                    {copied === `uuid-${i}` ? '✓' : '복사'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bulk random */}
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">랜덤 값 생성</h2>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(typeLabels) as RandomType[]).map(t => (
            <button key={t} onClick={() => setRandomType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                randomType === t ? 'bg-[#e94560] text-white' : 'bg-background border border-border text-text-secondary hover:text-text-primary'
              }`}>{typeLabels[t]}</button>
          ))}
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">개수</span>
            <input type="number" min={1} max={100} value={randomCount}
              onChange={e => setRandomCount(Math.max(1, Math.min(100, Number(e.target.value))))}
              className="w-16 bg-background border border-border rounded-lg px-2 py-1 text-sm text-text-primary text-center" />
          </div>
          <button onClick={() => setRandomResults(Array.from({ length: randomCount }, () => generateRandom(randomType)))}
            className="flex-1 bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            생성
          </button>
        </div>
        {randomResults.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button onClick={() => copyAll(randomResults)}
                className="text-xs px-3 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors">
                {copied === 'all' ? '복사됨!' : '전체 복사'}
              </button>
            </div>
            <div className="bg-background rounded-lg p-3 space-y-1 max-h-60 overflow-y-auto">
              {randomResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs text-text-primary break-all">{r}</span>
                  <button onClick={() => copy(r, `rand-${i}`)}
                    className="text-xs px-1.5 py-0.5 rounded bg-border text-text-muted hover:text-text-primary transition-colors shrink-0">
                    {copied === `rand-${i}` ? '✓' : '복사'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── JWT Decoder Tab ───────────────────────────────────────────────────────────
function JWTTab() {
  const [token, setToken] = useState('');
  const [header, setHeader] = useState<Record<string, unknown> | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const decode = () => {
    try {
      const parts = token.trim().split('.');
      if (parts.length !== 3) { setError('유효하지 않은 JWT 형식입니다 (3개 파트 필요)'); return; }
      const padBase64 = (s: string) => s + '='.repeat((4 - s.length % 4) % 4);
      const h = JSON.parse(atob(padBase64(parts[0].replace(/-/g, '+').replace(/_/g, '/'))));
      const p = JSON.parse(atob(padBase64(parts[1].replace(/-/g, '+').replace(/_/g, '/'))));
      setHeader(h);
      setPayload(p);
      setSignature(parts[2]);
      setError('');
    } catch (e) {
      setError('디코딩 실패: ' + String(e));
      setHeader(null);
      setPayload(null);
    }
  };

  const isExpired = (): boolean | null => {
    if (!payload || typeof payload.exp !== 'number') return null;
    return payload.exp * 1000 < Date.now();
  };

  const formatDate = (ts: unknown): string => {
    if (typeof ts !== 'number') return 'N/A';
    return new Date(ts * 1000).toLocaleString('ko-KR');
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const JsonDisplay = ({ data, label }: { data: Record<string, unknown>; label: string }) => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">{label}</h3>
      <div className="bg-background rounded-lg p-3 font-mono text-xs overflow-x-auto">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-[#e94560] shrink-0">&quot;{k}&quot;</span>
            <span className="text-text-muted">:</span>
            <span className="text-green-400">{typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const expired = isExpired();

  return (
    <div className="space-y-6">
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">JWT 디코더</h2>
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-600 dark:text-yellow-400">
          ⚠️ 서명(Signature)은 검증하지 않습니다. 헤더와 페이로드만 디코딩합니다.
        </div>
        <textarea value={token} onChange={e => setToken(e.target.value)} rows={5}
          placeholder="JWT 토큰을 붙여넣으세요... (eyJhbGci...)"
          className="w-full bg-background border border-border rounded-lg p-3 text-sm font-mono text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-[#e94560]" />
        <button onClick={decode}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          디코딩
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      {(header || payload) && (
        <div className="bg-background-card border border-border rounded-xl p-6 space-y-5">
          {/* Expiry status */}
          {expired !== null && (
            <div className={`p-3 rounded-lg text-sm font-semibold text-center ${
              expired ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
            }`}>
              {expired ? '❌ 만료된 토큰' : '✅ 유효한 토큰'}
            </div>
          )}

          {/* Meta info */}
          {payload && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {typeof payload.iat === 'number' && (
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">발급 시각 (iat)</p>
                  <p className="text-text-primary font-medium">{formatDate(payload.iat)}</p>
                </div>
              )}
              {typeof payload.exp === 'number' && (
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">만료 시각 (exp)</p>
                  <p className="text-text-primary font-medium">{formatDate(payload.exp)}</p>
                </div>
              )}
              {payload.sub != null && (
                <div className="bg-background rounded-lg p-3 col-span-2">
                  <p className="text-xs text-text-muted mb-1">Subject (sub)</p>
                  <p className="text-text-primary font-medium font-mono">{String(payload.sub)}</p>
                </div>
              )}
            </div>
          )}

          {header && <JsonDisplay data={header} label="Header" />}
          {payload && <JsonDisplay data={payload} label="Payload" />}

          {/* Signature */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Signature (검증 불가)</h3>
            <div className="flex items-center gap-2 bg-background rounded-lg p-3">
              <span className="flex-1 font-mono text-xs text-text-muted break-all">{signature}</span>
              <button onClick={() => copy(signature, 'sig')}
                className="text-xs px-2 py-1 rounded bg-border text-text-secondary hover:text-text-primary transition-colors shrink-0">
                {copied === 'sig' ? '복사됨!' : '복사'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SecurityPage() {
  const [tab, setTab] = useState<Tab>('password');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'password', label: '비밀번호 생성기', icon: '🔑' },
    { key: 'hash', label: '해시 계산', icon: '#' },
    { key: 'encoding', label: '인코딩/디코딩', icon: '⇄' },
    { key: 'uuid', label: 'UUID / 랜덤', icon: '🎲' },
    { key: 'jwt', label: 'JWT 디코더', icon: '🪙' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-card px-6 py-4">
        <h1 className="text-2xl font-bold text-text-primary">🔐 보안 도구</h1>
        <p className="text-sm text-text-muted mt-1">비밀번호 생성, 해시 계산, 인코딩, UUID, JWT 디코더</p>
      </div>

      <div className="flex h-[calc(100vh-81px)]">
        {/* Sidebar tabs */}
        <div className="w-52 shrink-0 border-r border-border bg-background-card p-3 space-y-1">
          {tabs.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                tab === key
                  ? 'bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20'
                  : 'text-text-secondary hover:bg-background hover:text-text-primary'
              }`}>
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {tab === 'password' && <PasswordGeneratorTab />}
          {tab === 'hash' && <HashTab />}
          {tab === 'encoding' && <EncodingTab />}
          {tab === 'uuid' && <UUIDTab />}
          {tab === 'jwt' && <JWTTab />}
        </div>
      </div>

      <FloatingAIBar getContext={() => ({ page: 'security' })} getAction={() => 'chat'} onResult={() => {}} placeholder="보안 도구에 대해 질문하세요..." />
    </div>
  );
}
