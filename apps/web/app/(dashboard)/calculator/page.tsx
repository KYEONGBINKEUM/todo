'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

type Mode = 'general' | 'ratio' | 'percent' | 'unit' | 'color';

// ── General Calculator ────────────────────────────────────────────────────────
interface CalcHistory { expr: string; result: string; }

function GeneralCalc() {
  const [display, setDisplay] = useState('0');
  const [expr, setExpr] = useState('');
  const [justCalc, setJustCalc] = useState(false);
  const [history, setHistory] = useState<CalcHistory[]>([]);

  const press = useCallback((val: string) => {
    if (val === 'C') { setDisplay('0'); setExpr(''); setJustCalc(false); return; }
    if (val === '⌫') {
      setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
      return;
    }
    if (val === '=') {
      try {
        const fullExpr = (justCalc ? display : expr + display);
        const result = Function('"use strict"; return (' + fullExpr + ')')();
        const r = parseFloat(result.toFixed(10)).toString();
        if (fullExpr.trim() && fullExpr !== r) {
          setHistory(prev => [{ expr: fullExpr + ' =', result: r }, ...prev].slice(0, 20));
        }
        setDisplay(r); setExpr(''); setJustCalc(true);
      } catch { setDisplay('Error'); setExpr(''); }
      return;
    }
    if (['+', '-', '×', '÷', '%'].includes(val)) {
      const op = val === '×' ? '*' : val === '÷' ? '/' : val;
      setExpr((justCalc ? display : expr + display) + op);
      setDisplay('0'); setJustCalc(false);
      return;
    }
    if (val === '.') {
      if (display.includes('.')) return;
      setDisplay(prev => prev + '.');
      setJustCalc(false);
      return;
    }
    if (val === '±') { setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev); return; }
    setDisplay(prev => justCalc ? val : prev === '0' ? val : prev + val);
    setJustCalc(false);
  }, [display, expr, justCalc]);

  const buttons = [
    ['C', '±', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['⌫', '0', '.', '='],
  ];

  return (
    <div className="flex gap-6">
      {/* Calculator */}
      <div className="w-64 flex-shrink-0">
        {/* Display */}
        <div className="bg-background rounded-2xl border border-border p-4 mb-3">
          <p className="text-xs text-text-muted h-5 text-right truncate font-mono">{expr || '\u00a0'}</p>
          <p className="text-4xl font-light text-text-primary text-right mt-1 truncate">{display}</p>
        </div>
        {/* Buttons */}
        <div className="grid grid-cols-4 gap-2">
          {buttons.flat().map((btn, i) => {
            const isOp = ['÷','×','-','+'].includes(btn);
            const isEq = btn === '=';
            const isUtil = ['C','±','%','⌫'].includes(btn);
            return (
              <button
                key={i}
                onClick={() => press(btn)}
                className={`h-12 rounded-xl text-base font-semibold transition-all active:scale-95 ${
                  isEq ? 'bg-[#e94560] text-white hover:bg-[#d63b55]' :
                  isOp ? 'bg-[#e94560]/15 text-[#e94560] hover:bg-[#e94560]/25' :
                  isUtil ? 'bg-border/60 text-text-secondary hover:bg-border' :
                  'bg-background-card border border-border text-text-primary hover:bg-border/30'
                }`}
              >
                {btn}
              </button>
            );
          })}
        </div>
      </div>

      {/* History */}
      <div className="w-56 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">계산 기록</span>
          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
            >
              지우기
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto space-y-2">
          {history.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-text-muted text-xs">계산 결과가 여기에 표시됩니다</div>
          ) : (
            history.map((h, i) => (
              <button
                key={i}
                onClick={() => { setDisplay(h.result); setExpr(''); setJustCalc(true); }}
                className="w-full text-right p-3 bg-background-card rounded-xl border border-border hover:border-[#e94560]/30 transition-colors group"
              >
                <p className="text-[11px] text-text-muted font-mono truncate">{h.expr}</p>
                <p className="text-lg font-semibold text-text-primary group-hover:text-[#e94560] transition-colors">{h.result}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ratio Calculator ──────────────────────────────────────────────────────────
function RatioCalc() {
  const [w1, setW1] = useState('');
  const [h1, setH1] = useState('');
  const [w2, setW2] = useState('');
  const [h2, setH2] = useState('');
  const [mode, setMode] = useState<'wh' | 'ratio'>('wh');

  const calcH2 = () => {
    const n = parseFloat(w2), ow = parseFloat(w1), oh = parseFloat(h1);
    if (!isNaN(n) && !isNaN(ow) && !isNaN(oh) && ow > 0)
      setH2(parseFloat(((n * oh) / ow).toFixed(4)).toString());
  };
  const calcW2 = () => {
    const n = parseFloat(h2), ow = parseFloat(w1), oh = parseFloat(h1);
    if (!isNaN(n) && !isNaN(ow) && !isNaN(oh) && oh > 0)
      setW2(parseFloat(((n * ow) / oh).toFixed(4)).toString());
  };

  const [r1, setR1] = useState('16');
  const [r2, setR2] = useState('9');
  const [rVal, setRVal] = useState('');
  const [rResult, setRResult] = useState('');
  const [rDir, setRDir] = useState<'w'|'h'>('w');
  const calcRatio = () => {
    const v = parseFloat(rVal), a = parseFloat(r1), b = parseFloat(r2);
    if (isNaN(v) || isNaN(a) || isNaN(b) || a === 0 || b === 0) return;
    if (rDir === 'w') setRResult(parseFloat(((v * b) / a).toFixed(4)).toString());
    else setRResult(parseFloat(((v * a) / b).toFixed(4)).toString());
  };

  return (
    <div className="space-y-5 max-w-lg">
      {/* Mode tabs */}
      <div className="flex gap-2 p-1 bg-border/30 rounded-xl w-fit">
        {([['wh','크기 비례'], ['ratio','비율→크기']] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === m ? 'bg-[#e94560] text-white' : 'text-text-muted hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'wh' ? (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">원본 크기를 입력하고 새 너비 또는 높이를 입력하면 비율에 맞는 값을 계산합니다.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">원본 너비</label>
              <input value={w1} onChange={e => setW1(e.target.value)} placeholder="1920" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">원본 높이</label>
              <input value={h1} onChange={e => setH1(e.target.value)} placeholder="1080" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-text-muted px-2 uppercase tracking-wider">변환</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">새 너비 → 높이 계산</label>
              <div className="flex gap-2">
                <input value={w2} onChange={e => setW2(e.target.value)} placeholder="1280"
                  className="flex-1 min-w-0 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
                  onKeyDown={e => e.key === 'Enter' && calcH2()} />
                <button onClick={calcH2} className="px-3 py-2 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors">→</button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">결과 높이</label>
              <div className="px-3 py-2.5 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl text-sm font-bold text-[#e94560] min-h-[42px]">{h2 || '—'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">새 높이 → 너비 계산</label>
              <div className="flex gap-2">
                <input value={h2} onChange={e => setH2(e.target.value)} placeholder="720"
                  className="flex-1 min-w-0 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
                  onKeyDown={e => e.key === 'Enter' && calcW2()} />
                <button onClick={calcW2} className="px-3 py-2 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors">→</button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">결과 너비</label>
              <div className="px-3 py-2.5 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl text-sm font-bold text-[#e94560] min-h-[42px]">{w2 && h2 ? w2 : '—'}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">비율(예: 16:9)을 입력하고 너비 또는 높이 중 하나를 입력하면 나머지를 계산합니다.</p>
          <div className="flex items-center gap-3">
            <input value={r1} onChange={e => setR1(e.target.value)} className="w-20 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-center text-text-primary outline-none focus:border-[#e94560] transition-colors" />
            <span className="text-text-muted font-bold text-xl">:</span>
            <input value={r2} onChange={e => setR2(e.target.value)} className="w-20 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-center text-text-primary outline-none focus:border-[#e94560] transition-colors" />
          </div>
          <div className="flex gap-2 p-1 bg-border/30 rounded-xl w-fit">
            {([['w','너비 → 높이'], ['h','높이 → 너비']] as const).map(([d, label]) => (
              <button key={d} onClick={() => setRDir(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rDir === d ? 'bg-background-card text-text-primary shadow-sm' : 'text-text-muted'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-end max-w-xs">
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">{rDir === 'w' ? '너비' : '높이'} 입력</label>
              <input value={rVal} onChange={e => setRVal(e.target.value)} placeholder="1920"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
                onKeyDown={e => e.key === 'Enter' && calcRatio()} />
            </div>
            <button onClick={calcRatio} className="px-4 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors">계산</button>
          </div>
          {rResult && (
            <div className="p-4 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl max-w-xs">
              <p className="text-xs text-text-muted mb-1">{rDir === 'w' ? '계산된 높이' : '계산된 너비'}</p>
              <p className="text-3xl font-bold text-[#e94560]">{rResult}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Percent Calculator ────────────────────────────────────────────────────────
function PercentCalc() {
  type SubMode = 'of' | 'change' | 'add' | 'remove' | 'reverse';
  const [sub, setSub] = useState<SubMode>('of');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const calc = () => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (isNaN(na) || isNaN(nb)) return;
    let r: number;
    switch (sub) {
      case 'of': r = (na / 100) * nb; break;
      case 'change': r = ((nb - na) / Math.abs(na)) * 100; break;
      case 'add': r = na * (1 + nb / 100); break;
      case 'remove': r = na * (1 - nb / 100); break;
      case 'reverse': r = na / (nb / 100); break;
    }
    setResult(parseFloat(r!.toFixed(6)).toString());
  };

  const SUBS: { id: SubMode; label: string; desc: string; aLabel: string; bLabel: string; rLabel: string }[] = [
    { id: 'of', label: 'A%의 B', desc: 'A%는 B의 얼마인가', aLabel: '퍼센트 (A%)', bLabel: '전체 값 (B)', rLabel: '결과' },
    { id: 'change', label: '변화율', desc: 'A → B의 증감률 (%)', aLabel: '이전 값 (A)', bLabel: '이후 값 (B)', rLabel: '변화율 (%)' },
    { id: 'add', label: '% 추가', desc: 'A에 B% 더한 값', aLabel: '원래 값 (A)', bLabel: '추가 % (B)', rLabel: '결과' },
    { id: 'remove', label: '% 제거', desc: 'A에서 B% 뺀 값', aLabel: '원래 값 (A)', bLabel: '제거 % (B)', rLabel: '결과' },
    { id: 'reverse', label: '역산', desc: 'A가 B%일 때 전체 값', aLabel: '부분 값 (A)', bLabel: '퍼센트 (B%)', rLabel: '전체 값' },
  ];
  const s = SUBS.find(x => x.id === sub)!;

  return (
    <div className="space-y-5 max-w-sm">
      <div className="flex flex-wrap gap-2">
        {SUBS.map(({ id, label }) => (
          <button key={id} onClick={() => { setSub(id); setResult(null); setA(''); setB(''); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sub === id ? 'bg-[#e94560] text-white' : 'bg-border/40 text-text-muted hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted">{s.desc}</p>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">{s.aLabel}</label>
          <input value={a} onChange={e => { setA(e.target.value); setResult(null); }} placeholder="0"
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors" />
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block font-medium">{s.bLabel}</label>
          <input value={b} onChange={e => { setB(e.target.value); setResult(null); }} placeholder="0"
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
            onKeyDown={e => e.key === 'Enter' && calc()} />
        </div>
        <button onClick={calc} className="w-full py-2.5 bg-[#e94560] text-white rounded-xl font-semibold hover:bg-[#d63b55] transition-colors">계산</button>
      </div>
      {result !== null && (
        <div className="p-4 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl">
          <p className="text-xs text-text-muted mb-1">{s.rLabel}</p>
          <p className="text-3xl font-bold text-[#e94560]">{result}{sub === 'change' ? '%' : ''}</p>
        </div>
      )}
    </div>
  );
}

// ── Unit Converter ────────────────────────────────────────────────────────────
type UnitCategory = 'length' | 'px' | 'weight' | 'area' | 'temp';

const UNIT_DEFS: Record<UnitCategory, { label: string; units: { id: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[] }> = {
  px: {
    label: 'CSS 단위',
    units: [
      { id: 'px', label: 'px', toBase: v => v, fromBase: v => v },
      { id: 'rem', label: 'rem (16px)', toBase: v => v * 16, fromBase: v => v / 16 },
      { id: 'em', label: 'em (16px)', toBase: v => v * 16, fromBase: v => v / 16 },
      { id: 'pt', label: 'pt', toBase: v => v * 1.3333, fromBase: v => v / 1.3333 },
      { id: 'vw', label: 'vw (1920px)', toBase: v => v * 19.2, fromBase: v => v / 19.2 },
      { id: 'percent', label: '% (1920px)', toBase: v => v * 19.2, fromBase: v => v / 19.2 },
    ],
  },
  length: {
    label: '길이',
    units: [
      { id: 'mm', label: 'mm', toBase: v => v, fromBase: v => v },
      { id: 'cm', label: 'cm', toBase: v => v * 10, fromBase: v => v / 10 },
      { id: 'm', label: 'm', toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: 'km', label: 'km', toBase: v => v * 1000000, fromBase: v => v / 1000000 },
      { id: 'inch', label: 'inch', toBase: v => v * 25.4, fromBase: v => v / 25.4 },
      { id: 'ft', label: 'ft', toBase: v => v * 304.8, fromBase: v => v / 304.8 },
    ],
  },
  weight: {
    label: '무게',
    units: [
      { id: 'g', label: 'g', toBase: v => v, fromBase: v => v },
      { id: 'kg', label: 'kg', toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: 'lb', label: 'lb', toBase: v => v * 453.592, fromBase: v => v / 453.592 },
      { id: 'oz', label: 'oz', toBase: v => v * 28.3495, fromBase: v => v / 28.3495 },
    ],
  },
  area: {
    label: '넓이',
    units: [
      { id: 'cm2', label: 'cm²', toBase: v => v, fromBase: v => v },
      { id: 'm2', label: 'm²', toBase: v => v * 10000, fromBase: v => v / 10000 },
      { id: 'pyeong', label: '평', toBase: v => v * 33057.85, fromBase: v => v / 33057.85 },
      { id: 'sqft', label: 'ft²', toBase: v => v * 929.03, fromBase: v => v / 929.03 },
    ],
  },
  temp: {
    label: '온도',
    units: [
      { id: 'c', label: '°C', toBase: v => v, fromBase: v => v },
      { id: 'f', label: '°F', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
      { id: 'k', label: 'K', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
    ],
  },
};

function UnitConv() {
  const [cat, setCat] = useState<UnitCategory>('px');
  const [from, setFrom] = useState('');
  const [fromUnit, setFromUnit] = useState('px');
  const [toUnit, setToUnit] = useState('rem');

  const def = UNIT_DEFS[cat];
  const fromDef = def.units.find(u => u.id === fromUnit) ?? def.units[0];
  const toDef = def.units.find(u => u.id === toUnit) ?? def.units[1];

  const result = (() => {
    const v = parseFloat(from);
    if (isNaN(v)) return '';
    const base = fromDef.toBase(v);
    return parseFloat(toDef.fromBase(base).toFixed(8)).toString();
  })();

  const swap = () => { setFromUnit(toUnit); setToUnit(fromUnit); };

  useEffect(() => {
    const units = UNIT_DEFS[cat].units;
    setFromUnit(units[0].id);
    setToUnit(units[1]?.id ?? units[0].id);
    setFrom('');
  }, [cat]);

  return (
    <div className="space-y-5 max-w-md">
      <div className="flex flex-wrap gap-2">
        {(Object.entries(UNIT_DEFS) as [UnitCategory, typeof UNIT_DEFS[UnitCategory]][]).map(([id, { label }]) => (
          <button key={id} onClick={() => setCat(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${cat === id ? 'bg-[#e94560] text-white' : 'bg-border/40 text-text-muted hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 space-y-2">
          <select value={fromUnit} onChange={e => setFromUnit(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] cursor-pointer transition-colors">
            {def.units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <input value={from} onChange={e => setFrom(e.target.value)} placeholder="0"
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors" />
        </div>

        <button onClick={swap}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-all text-lg">
          ⇄
        </button>

        <div className="flex-1 space-y-2">
          <select value={toUnit} onChange={e => setToUnit(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] cursor-pointer transition-colors">
            {def.units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <div className="px-3 py-2.5 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl text-sm font-bold text-[#e94560] min-h-[42px]">
            {result || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Color Converter ───────────────────────────────────────────────────────────
function ColorCalc() {
  const [hex, setHex] = useState('#e94560');
  const [r, setR] = useState('233');
  const [g, setG] = useState('69');
  const [b, setB] = useState('96');
  const [h, setH] = useState('348');
  const [s, setS] = useState('81');
  const [l, setL] = useState('59');

  const hexToRgb = (hex: string) => {
    const m = hex.replace('#', '').match(/.{2}/g);
    if (!m) return null;
    return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
  };
  const rgbToHsl = (r: number, g: number, b: number) => {
    const rr = r/255, gg = g/255, bb = b/255;
    const max = Math.max(rr,gg,bb), min = Math.min(rr,gg,bb);
    let hue = 0, sat = 0;
    const lig = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      sat = lig > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rr: hue = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6; break;
        case gg: hue = ((bb - rr) / d + 2) / 6; break;
        case bb: hue = ((rr - gg) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(hue*360), s: Math.round(sat*100), l: Math.round(lig*100) };
  };
  const hslToRgb = (h: number, s: number, l: number) => {
    const hs = s/100, ll = l/100;
    const c = (1 - Math.abs(2*ll - 1)) * hs;
    const x = c * (1 - Math.abs((h/60) % 2 - 1));
    const m = ll - c/2;
    let rr=0,gg=0,bb=0;
    if (h<60){rr=c;gg=x;}else if(h<120){rr=x;gg=c;}else if(h<180){gg=c;bb=x;}else if(h<240){gg=x;bb=c;}else if(h<300){rr=x;bb=c;}else{rr=c;bb=x;}
    return { r: Math.round((rr+m)*255), g: Math.round((gg+m)*255), b: Math.round((bb+m)*255) };
  };
  const toHex = (n: number) => n.toString(16).padStart(2, '0');

  const fromHex = (val: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(val)) return;
    setHex(val);
    const rgb = hexToRgb(val)!;
    setR(String(rgb.r)); setG(String(rgb.g)); setB(String(rgb.b));
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    setH(String(hsl.h)); setS(String(hsl.s)); setL(String(hsl.l));
  };
  const fromRgb = () => {
    const rv=parseInt(r), gv=parseInt(g), bv=parseInt(b);
    if ([rv,gv,bv].some(isNaN)) return;
    const hexVal = '#' + toHex(rv) + toHex(gv) + toHex(bv);
    setHex(hexVal);
    const hsl = rgbToHsl(rv, gv, bv);
    setH(String(hsl.h)); setS(String(hsl.s)); setL(String(hsl.l));
  };
  const fromHsl = () => {
    const hv=parseInt(h), sv=parseInt(s), lv=parseInt(l);
    if ([hv,sv,lv].some(isNaN)) return;
    const rgb = hslToRgb(hv, sv, lv);
    setR(String(rgb.r)); setG(String(rgb.g)); setB(String(rgb.b));
    const hexVal = '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
    setHex(hexVal);
  };

  const [copied, setCopied] = useState('');
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500); });
  };

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <button onClick={() => copy(text, label)}
      className="text-[10px] px-2.5 py-1 rounded-lg bg-border/40 hover:bg-[#e94560]/10 hover:text-[#e94560] text-text-muted transition-all font-medium">
      {copied === label ? '✓ 복사됨' : '복사'}
    </button>
  );

  return (
    <div className="space-y-4 max-w-md">
      {/* Preview */}
      <div className="flex items-center gap-4 p-4 bg-background rounded-2xl border border-border">
        <div className="w-16 h-16 rounded-2xl shadow-lg flex-shrink-0 border border-white/10" style={{ backgroundColor: hex }} />
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-text-primary font-mono">{hex.toUpperCase()}</p>
          <p className="text-xs text-text-muted mt-0.5">rgb({r}, {g}, {b})</p>
          <p className="text-xs text-text-muted">hsl({h}, {s}%, {l}%)</p>
        </div>
        <input type="color" value={hex} onChange={e => fromHex(e.target.value)}
          className="w-10 h-10 rounded-xl cursor-pointer border border-border p-0.5 bg-transparent" />
      </div>

      {/* HEX */}
      <div className="p-3.5 bg-background-card border border-border rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">HEX</p>
          <CopyBtn text={hex.toUpperCase()} label="hex" />
        </div>
        <input value={hex} onChange={e => setHex(e.target.value)} onBlur={e => fromHex(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm font-mono text-text-primary outline-none focus:border-[#e94560] transition-colors" />
      </div>

      {/* RGB */}
      <div className="p-3.5 bg-background-card border border-border rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">RGB</p>
          <CopyBtn text={`rgb(${r}, ${g}, ${b})`} label="rgb" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['R', r, setR, '#ef4444'], ['G', g, setG, '#22c55e'], ['B', b, setB, '#3b82f6']].map(([label, val, setter, color]) => (
            <div key={label as string}>
              <label className="text-[10px] mb-1.5 block font-bold" style={{ color: color as string }}>{label as string}</label>
              <input value={val as string} onChange={e => (setter as (v:string)=>void)(e.target.value)} onBlur={fromRgb}
                className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary outline-none focus:border-[#e94560] text-center transition-colors" />
            </div>
          ))}
        </div>
      </div>

      {/* HSL */}
      <div className="p-3.5 bg-background-card border border-border rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">HSL</p>
          <CopyBtn text={`hsl(${h}, ${s}%, ${l}%)`} label="hsl" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['H°', h, setH], ['S%', s, setS], ['L%', l, setL]].map(([label, val, setter]) => (
            <div key={label as string}>
              <label className="text-[10px] text-text-muted mb-1.5 block font-medium">{label as string}</label>
              <input value={val as string} onChange={e => (setter as (v:string)=>void)(e.target.value)} onBlur={fromHsl}
                className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary outline-none focus:border-[#e94560] text-center transition-colors" />
            </div>
          ))}
        </div>
      </div>

      {/* Tailwind-like shades */}
      <div className="p-3.5 bg-background-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">색상 스케일</p>
          <span className="text-[9px] text-text-muted">클릭하여 선택</span>
        </div>
        <div className="flex gap-1 mb-2">
          {[95,85,75,65,55,45,35,25,15,5].map(lv => {
            const rgb = hslToRgb(parseInt(h), parseInt(s), lv);
            const c = '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
            return (
              <button key={lv} onClick={() => fromHex(c)} title={c}
                className="flex-1 h-8 rounded-md transition-all hover:scale-110 hover:shadow-md"
                style={{ backgroundColor: c }} />
            );
          })}
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-text-muted">밝음</span>
          <span className="text-[9px] text-text-muted">어둠</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const MODES: { id: Mode; icon: string; label: string; desc: string }[] = [
  { id: 'general', icon: '🔢', label: '일반 계산기', desc: '사칙연산 + 기록' },
  { id: 'ratio', icon: '📐', label: '비율 계산기', desc: '크기·비율 변환' },
  { id: 'percent', icon: '%', label: '퍼센트', desc: '증감률·역산' },
  { id: 'unit', icon: '📏', label: '단위 변환', desc: 'px·rem·길이·무게' },
  { id: 'color', icon: '🎨', label: '색상 변환', desc: 'HEX·RGB·HSL' },
];

export default function CalculatorPage() {
  const [mode, setMode] = useState<Mode>('general');
  const activeMode = MODES.find(m => m.id === mode)!;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🧮</span>
          <h2 className="text-2xl font-extrabold text-text-primary">계산기</h2>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: mode selector */}
        <div className="w-44 flex-shrink-0">
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold px-1 mb-2">계산 도구</p>
          <nav className="space-y-0.5">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                  mode === m.id
                    ? 'bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20'
                    : 'hover:bg-border/30 text-text-secondary border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base w-5 text-center flex-shrink-0">{m.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${mode === m.id ? 'text-[#e94560]' : 'text-text-primary'}`}>{m.label}</p>
                    <p className="text-[10px] text-text-muted truncate">{m.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </nav>
        </div>

        {/* Right: calculator content */}
        <div className="flex-1 min-w-0 bg-background-card rounded-2xl border border-border flex flex-col overflow-hidden">
          {/* Content header */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
            <span className="text-xl">{activeMode.icon}</span>
            <div>
              <h3 className="text-sm font-bold text-text-primary">{activeMode.label}</h3>
              <p className="text-[11px] text-text-muted">{activeMode.desc}</p>
            </div>
          </div>
          {/* Content body */}
          <div className="p-6">
            {mode === 'general' && <GeneralCalc />}
            {mode === 'ratio' && <RatioCalc />}
            {mode === 'percent' && <PercentCalc />}
            {mode === 'unit' && <UnitConv />}
            {mode === 'color' && <ColorCalc />}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
