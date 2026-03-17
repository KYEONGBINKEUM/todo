'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import {
  getCalcHistory,
  addCalcHistory,
  deleteCalcHistory,
  clearCalcHistoryByMode,
} from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';
import FloatingAIBar from '@/components/ai/FloatingAIBar';
import { detectCrossPageAction, crossPageContext, handleCrossPageResult } from '@/lib/cross-page-ai';

type Mode = 'general' | 'scientific' | 'ratio' | 'unit' | 'color' | 'programmer' | 'tip';

interface HistItem { id: string; mode: Mode; expr: string; result: string; }

// ── History Panel ─────────────────────────────────────────────────────────────
function HistoryPanel({
  items,
  onUse,
  onDelete,
  onClearAll,
  currentMode,
}: {
  items: HistItem[];
  onUse?: (result: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  currentMode?: Mode;
}) {
  const [copied, setCopied] = useState('');
  const { t } = useI18n();

  const handleClick = (item: HistItem) => {
    if (onUse) {
      onUse(item.result);
    } else {
      navigator.clipboard.writeText(item.result).then(() => {
        setCopied(item.id);
        setTimeout(() => setCopied(''), 1200);
      });
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{t('calc.history')}</span>
        {items.length > 0 && (
          <button
            onClick={onClearAll}
            className="text-[10px] px-2 py-0.5 rounded-md border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
          >
            {t('calc.clearAll')}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-text-muted text-[11px] text-center">
          {t('calc.noHistory')}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {items.map((h) => {
            // 색상 모드일 때 expr에서 HEX 값 추출
            const colorHex = (currentMode === 'color' || h.mode === 'color') ? (h.expr.match(/#[0-9a-fA-F]{6}/)?.[0] ?? null) : null;
            return (
            <div key={h.id} className="group flex items-center gap-1">
              <button
                onClick={() => handleClick(h)}
                className="flex-1 min-w-0 text-right p-2.5 bg-background rounded-xl border border-border hover:border-[#e94560]/30 transition-colors"
              >
                <div className="flex items-center gap-2 justify-end">
                  {colorHex && (
                    <span className="w-5 h-5 rounded-md flex-shrink-0 border border-white/10 shadow-sm" style={{ backgroundColor: colorHex }} />
                  )}
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[10px] text-text-muted font-mono truncate">{h.expr}</p>
                    <p className="text-sm font-semibold text-text-primary group-hover:text-[#e94560] transition-colors truncate">
                      {copied === h.id ? t('calc.copied') : h.result}
                    </p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => onDelete(h.id)}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-[#e94560] hover:bg-[#e94560]/10 transition-all text-xs"
              >
                ×
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── General Calculator ────────────────────────────────────────────────────────
function GeneralCalc({
  onResult,
  externalValue,
  onExternalValueConsumed,
}: {
  onResult: (expr: string, result: string) => void;
  externalValue?: string | null;
  onExternalValueConsumed?: () => void;
}) {
  const [display, setDisplay] = useState('0');
  const [expr, setExpr] = useState('');
  const [justCalc, setJustCalc] = useState(false);

  useEffect(() => {
    if (externalValue) {
      setDisplay(externalValue);
      setExpr('');
      setJustCalc(true);
      onExternalValueConsumed?.();
    }
  }, [externalValue, onExternalValueConsumed]);

  const press = useCallback((val: string) => {
    if (val === 'C') { setDisplay('0'); setExpr(''); setJustCalc(false); return; }
    if (val === '⌫') { setDisplay(p => p.length > 1 ? p.slice(0, -1) : '0'); return; }
    if (val === '=') {
      try {
        const full = justCalc ? display : expr + display;
        const res = Function('"use strict"; return (' + full + ')')();
        const r = parseFloat(res.toFixed(10)).toString();
        if (full.trim() && full !== r) onResult(full + ' =', r);
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
      if (!display.includes('.')) { setDisplay(p => p + '.'); setJustCalc(false); }
      return;
    }
    if (val === '±') { setDisplay(p => p.startsWith('-') ? p.slice(1) : '-' + p); return; }
    setDisplay(p => justCalc ? val : p === '0' ? val : p + val);
    setJustCalc(false);
  }, [display, expr, justCalc, onResult]);

  const rows = [
    ['C', '±', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['⌫', '0', '.', '='],
  ];

  return (
    <div className="w-60 flex-shrink-0">
      <div className="bg-background rounded-2xl border border-border p-4 mb-3">
        <p className="text-xs text-text-muted h-5 text-right truncate font-mono">{expr || '\u00a0'}</p>
        <p className="text-4xl font-light text-text-primary text-right mt-1 truncate">{display}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {rows.flat().map((btn, i) => {
          const isEq = btn === '=';
          const isOp = ['+', '-', '×', '÷'].includes(btn);
          const isUtil = ['C', '±', '%', '⌫'].includes(btn);
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
  );
}

// ── Ratio Calculator ──────────────────────────────────────────────────────────
function RatioCalc({ onResult, t }: { onResult: (expr: string, result: string) => void; t: (key: string) => string }) {
  const [tab, setTab] = useState<'ab' | 'abc'>('ab');

  // A:B mode
  const [ra, setRa] = useState('1');
  const [rb, setRb] = useState('1');
  const [abKnown, setAbKnown] = useState<'total' | 'a' | 'b'>('total');
  const [abInput, setAbInput] = useState('');

  // A:B:C mode
  const [ra3, setRa3] = useState('1');
  const [rb3, setRb3] = useState('1');
  const [rc3, setRc3] = useState('1');
  const [abcKnown, setAbcKnown] = useState<'total' | 'a' | 'b' | 'c'>('total');
  const [abcInput, setAbcInput] = useState('');

  const fmt = (n: number) => parseFloat(n.toFixed(6)).toString();

  const abResult = (() => {
    const [a, b, inp] = [ra, rb, abInput].map(parseFloat);
    if ([a, b, inp].some(isNaN) || a <= 0 || b <= 0) return null;
    const sum = a + b;
    if (abKnown === 'total') {
      return { valA: fmt(inp * a / sum), valB: fmt(inp * b / sum), total: fmt(inp) };
    } else if (abKnown === 'a') {
      const valB = fmt(inp * b / a);
      return { valA: fmt(inp), valB, total: fmt(inp + parseFloat(valB)) };
    } else {
      const valA = fmt(inp * a / b);
      return { valA, valB: fmt(inp), total: fmt(parseFloat(valA) + inp) };
    }
  })();

  const abcResult = (() => {
    const [a, b, c, inp] = [ra3, rb3, rc3, abcInput].map(parseFloat);
    if ([a, b, c, inp].some(isNaN) || a <= 0 || b <= 0 || c <= 0) return null;
    const sum = a + b + c;
    const unit = abcKnown === 'total' ? inp / sum
      : abcKnown === 'a' ? inp / a
      : abcKnown === 'b' ? inp / b
      : inp / c;
    return {
      valA: fmt(unit * a),
      valB: fmt(unit * b),
      valC: fmt(unit * c),
      total: fmt(unit * sum),
    };
  })();

  const ic = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors";
  const icSm = "w-16 px-2 py-2.5 bg-background border border-border rounded-xl text-sm text-center text-text-primary outline-none focus:border-[#e94560] transition-colors";

  const ResultBox = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-col items-center px-3 py-2.5 bg-background rounded-xl border border-border">
      <span className="text-[10px] text-text-muted mb-0.5">{label}</span>
      <span className="text-sm font-bold text-[#e94560]">{value}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-1.5 p-1 bg-border/30 rounded-xl w-fit">
        {([['ab', 'A : B'], ['abc', 'A : B : C']] as const).map(([m, l]) => (
          <button key={m} onClick={() => setTab(m)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === m ? 'bg-[#e94560] text-white' : 'text-text-muted hover:text-text-primary'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'ab' ? (
        <div className="space-y-4 max-w-sm">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">비율</p>
            <div className="flex items-center gap-2">
              <input value={ra} onChange={e => setRa(e.target.value)} placeholder="A" className={icSm} />
              <span className="text-text-muted font-bold text-xl">:</span>
              <input value={rb} onChange={e => setRb(e.target.value)} placeholder="B" className={icSm} />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">알고 있는 값</p>
            <div className="flex gap-1.5 p-1 bg-border/30 rounded-xl w-fit">
              {([['total', '합계(T)'], ['a', 'A'], ['b', 'B']] as const).map(([k, l]) => (
                <button key={k} onClick={() => { setAbKnown(k); setAbInput(''); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${abKnown === k ? 'bg-background-card text-text-primary shadow-sm' : 'text-text-muted'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <input value={abInput} onChange={e => setAbInput(e.target.value)} placeholder="값 입력" className={ic} />
          {abResult && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <ResultBox label="A" value={abResult.valA} />
                <ResultBox label="B" value={abResult.valB} />
                <ResultBox label="합계" value={abResult.total} />
              </div>
              <button onClick={() => onResult(`${ra}:${rb} (${abKnown}=${abInput})`, `A=${abResult.valA} B=${abResult.valB}`)}
                className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors">
                {t('calc.save')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 max-w-sm">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">비율</p>
            <div className="flex items-center gap-2">
              <input value={ra3} onChange={e => setRa3(e.target.value)} placeholder="A" className={icSm} />
              <span className="text-text-muted font-bold text-lg">:</span>
              <input value={rb3} onChange={e => setRb3(e.target.value)} placeholder="B" className={icSm} />
              <span className="text-text-muted font-bold text-lg">:</span>
              <input value={rc3} onChange={e => setRc3(e.target.value)} placeholder="C" className={icSm} />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">알고 있는 값</p>
            <div className="flex gap-1.5 p-1 bg-border/30 rounded-xl w-fit">
              {([['total', '합계(T)'], ['a', 'A'], ['b', 'B'], ['c', 'C']] as const).map(([k, l]) => (
                <button key={k} onClick={() => { setAbcKnown(k); setAbcInput(''); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${abcKnown === k ? 'bg-background-card text-text-primary shadow-sm' : 'text-text-muted'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <input value={abcInput} onChange={e => setAbcInput(e.target.value)} placeholder="값 입력" className={ic} />
          {abcResult && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <ResultBox label="A" value={abcResult.valA} />
                <ResultBox label="B" value={abcResult.valB} />
                <ResultBox label="C" value={abcResult.valC} />
                <ResultBox label="합계" value={abcResult.total} />
              </div>
              <button onClick={() => onResult(`${ra3}:${rb3}:${rc3} (${abcKnown}=${abcInput})`, `A=${abcResult.valA} B=${abcResult.valB} C=${abcResult.valC}`)}
                className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors">
                {t('calc.save')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Unit Converter ────────────────────────────────────────────────────────────
type UnitCategory = 'length' | 'weight' | 'area' | 'temp';

const UNIT_DEFS: Record<UnitCategory, { labelKey: string; units: { id: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[] }> = {
  length: {
    labelKey: 'calc.length',
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
    labelKey: 'calc.weight',
    units: [
      { id: 'g', label: 'g', toBase: v => v, fromBase: v => v },
      { id: 'kg', label: 'kg', toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: 'lb', label: 'lb', toBase: v => v * 453.592, fromBase: v => v / 453.592 },
      { id: 'oz', label: 'oz', toBase: v => v * 28.3495, fromBase: v => v / 28.3495 },
    ],
  },
  area: {
    labelKey: 'calc.area',
    units: [
      { id: 'cm2', label: 'cm²', toBase: v => v, fromBase: v => v },
      { id: 'm2', label: 'm²', toBase: v => v * 10000, fromBase: v => v / 10000 },
      { id: 'pyeong', label: '평', toBase: v => v * 33057.85, fromBase: v => v / 33057.85 },
      { id: 'sqft', label: 'ft²', toBase: v => v * 929.03, fromBase: v => v / 929.03 },
    ],
  },
  temp: {
    labelKey: 'calc.temperature',
    units: [
      { id: 'c', label: '°C', toBase: v => v, fromBase: v => v },
      { id: 'f', label: '°F', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
      { id: 'k', label: 'K', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
    ],
  },
};

function UnitConv({ onResult, t }: { onResult: (expr: string, result: string) => void; t: (key: string) => string }) {
  const [cat, setCat] = useState<UnitCategory>('length');
  const [from, setFrom] = useState('');
  const [fromUnit, setFromUnit] = useState('mm');
  const [toUnit, setToUnit] = useState('cm');

  const def = UNIT_DEFS[cat];
  const fromDef = def.units.find(u => u.id === fromUnit) ?? def.units[0];
  const toDef = def.units.find(u => u.id === toUnit) ?? def.units[1];

  const result = (() => {
    const v = parseFloat(from);
    if (isNaN(v)) return '';
    return parseFloat(toDef.fromBase(fromDef.toBase(v)).toFixed(8)).toString();
  })();

  const swap = () => { setFromUnit(toUnit); setToUnit(fromUnit); };

  useEffect(() => {
    const units = UNIT_DEFS[cat].units;
    setFromUnit(units[0].id);
    setToUnit(units[1]?.id ?? units[0].id);
    setFrom('');
  }, [cat]);

  const handleSave = () => {
    if (result) onResult(`${from} ${fromDef.label}`, `${result} ${toDef.label}`);
  };

  return (
    <div className="max-w-md space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.entries(UNIT_DEFS) as [UnitCategory, typeof UNIT_DEFS[UnitCategory]][]).map(([id, { labelKey }]) => (
          <button key={id} onClick={() => setCat(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${cat === id ? 'bg-[#e94560] text-white' : 'bg-border/40 text-text-muted hover:text-text-primary'}`}>
            {t(labelKey)}
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

      {result && (
        <button onClick={handleSave}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors">
          {t('calc.saveToHistory')}
        </button>
      )}
    </div>
  );
}

// ── Color Converter ───────────────────────────────────────────────────────────
function ColorCalc({ onResult, t }: { onResult: (expr: string, result: string) => void; t: (key: string) => string }) {
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
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
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
    return { h: Math.round(hue * 360), s: Math.round(sat * 100), l: Math.round(lig * 100) };
  };
  const hslToRgb = (h: number, s: number, l: number) => {
    const hs = s / 100, ll = l / 100;
    const c = (1 - Math.abs(2 * ll - 1)) * hs;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = ll - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (h < 60) { rr = c; gg = x; } else if (h < 120) { rr = x; gg = c; } else if (h < 180) { gg = c; bb = x; } else if (h < 240) { gg = x; bb = c; } else if (h < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
    return { r: Math.round((rr + m) * 255), g: Math.round((gg + m) * 255), b: Math.round((bb + m) * 255) };
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
    const rv = parseInt(r), gv = parseInt(g), bv = parseInt(b);
    if ([rv, gv, bv].some(isNaN)) return;
    const hexVal = '#' + toHex(rv) + toHex(gv) + toHex(bv);
    setHex(hexVal);
    const hsl = rgbToHsl(rv, gv, bv);
    setH(String(hsl.h)); setS(String(hsl.s)); setL(String(hsl.l));
  };
  const fromHsl = () => {
    const hv = parseInt(h), sv = parseInt(s), lv = parseInt(l);
    if ([hv, sv, lv].some(isNaN)) return;
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
      {copied === label ? t('calc.copied') : t('calc.copy')}
    </button>
  );

  return (
    <div className="max-w-md space-y-4">
      {/* Preview */}
      <div className="flex items-center gap-4 p-4 bg-background rounded-2xl border border-border">
        <div className="w-16 h-16 rounded-2xl shadow-lg flex-shrink-0 border border-white/10" style={{ backgroundColor: hex }} />
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-text-primary font-mono">{hex.toUpperCase()}</p>
          <p className="text-xs text-text-muted mt-0.5">rgb({r}, {g}, {b})</p>
          <p className="text-xs text-text-muted">hsl({h}, {s}%, {l}%)</p>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <input type="color" value={hex} onChange={e => fromHex(e.target.value)}
            className="w-10 h-10 rounded-xl cursor-pointer border border-border p-0.5 bg-transparent" />
          <button
            onClick={() => onResult(hex.toUpperCase(), `rgb(${r},${g},${b})`)}
            className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors whitespace-nowrap">
            {t('calc.save')}
          </button>
        </div>
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
              <input value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} onBlur={fromRgb}
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
              <input value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} onBlur={fromHsl}
                className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary outline-none focus:border-[#e94560] text-center transition-colors" />
            </div>
          ))}
        </div>
      </div>

      {/* Color scale */}
      <div className="p-3.5 bg-background-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{t('calc.colorScale')}</p>
          <span className="text-[9px] text-text-muted">{t('calc.clickToSelect')}</span>
        </div>
        <div className="flex gap-1 mb-2">
          {[95, 85, 75, 65, 55, 45, 35, 25, 15, 5].map(lv => {
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
          <span className="text-[9px] text-text-muted">{t('calc.bright')}</span>
          <span className="text-[9px] text-text-muted">{t('calc.dark')}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// ── Scientific Calculator ─────────────────────────────────────────────────────
function ScientificCalc({ onResult }: { onResult: (expr: string, result: string) => void }) {
  const [display, setDisplay] = useState('0');
  const [expr, setExpr] = useState('');
  const [justCalc, setJustCalc] = useState(false);
  const [isDeg, setIsDeg] = useState(true);
  const toRad = (x: number) => isDeg ? x * Math.PI / 180 : x;

  const press = useCallback((val: string) => {
    if (val === 'C') { setDisplay('0'); setExpr(''); setJustCalc(false); return; }
    if (val === '⌫') { setDisplay(p => p.length > 1 ? p.slice(0, -1) : '0'); return; }
    if (val === '=') {
      try {
        const full = justCalc ? display : expr + display;
        const safeExpr = full.replace(/Math\.[a-zA-Z]+/g, (m) => m);
        const res = Function('"use strict"; const Math=window.Math; return (' + safeExpr + ')')();
        const r = parseFloat(res.toFixed(10)).toString();
        if (full.trim() && full !== r) onResult(full + ' =', r);
        setDisplay(r); setExpr(''); setJustCalc(true);
      } catch { setDisplay('Error'); setExpr(''); }
      return;
    }
    const funcs: Record<string, string> = {
      'sin': `Math.sin(${isDeg ? 'Math.PI/180*' : ''})`,
      'cos': `Math.cos(${isDeg ? 'Math.PI/180*' : ''})`,
      'tan': `Math.tan(${isDeg ? 'Math.PI/180*' : ''})`,
      'log': 'Math.log10(',
      'ln': 'Math.log(',
      '√': 'Math.sqrt(',
      'x²': '**2',
      'xⁿ': '**',
      '1/x': '1/',
      'π': String(Math.PI),
      'e': String(Math.E),
      '|x|': 'Math.abs(',
      '(': '(',
      ')': ')',
      '!': '!',
    };
    if (funcs[val]) {
      if (['x²', 'xⁿ', '!'].includes(val)) {
        setExpr(p => (justCalc ? display : p + display) + funcs[val]);
        setDisplay('0'); setJustCalc(false);
      } else if (['π', 'e'].includes(val)) {
        setDisplay(funcs[val]); setJustCalc(false);
      } else {
        setExpr(p => justCalc ? funcs[val] : p + display + (funcs[val].startsWith('Math') ? '+' + funcs[val] : funcs[val]));
        setDisplay('0'); setJustCalc(false);
      }
      return;
    }
    if (['+', '-', '×', '÷', '%'].includes(val)) {
      const op = val === '×' ? '*' : val === '÷' ? '/' : val;
      setExpr((justCalc ? display : expr + display) + op);
      setDisplay('0'); setJustCalc(false); return;
    }
    if (val === '.') { if (!display.includes('.')) { setDisplay(p => p + '.'); setJustCalc(false); } return; }
    if (val === '±') { setDisplay(p => p.startsWith('-') ? p.slice(1) : '-' + p); return; }
    setDisplay(p => justCalc ? val : p === '0' ? val : p + val);
    setJustCalc(false);
  }, [display, expr, justCalc, onResult, isDeg]);

  const btn = (v: string, cls = '') => (
    <button key={v} onClick={() => press(v)}
      className={`h-10 rounded-xl text-xs font-semibold transition-all active:scale-95 ${cls || 'bg-background-card border border-border text-text-primary hover:bg-border/30'}`}>
      {v}
    </button>
  );
  const opCls = 'bg-[#e94560]/15 text-[#e94560] hover:bg-[#e94560]/25';
  const fnCls = 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20';
  const eqCls = 'bg-[#e94560] text-white hover:bg-[#d63b55]';

  return (
    <div className="w-72 flex-shrink-0 space-y-2">
      <div className="bg-background rounded-2xl border border-border p-3 mb-2">
        <div className="flex justify-between items-center mb-1">
          <p className="text-[10px] text-text-muted font-mono truncate flex-1">{expr || '\u00a0'}</p>
          <button onClick={() => setIsDeg(p => !p)} className={`text-[10px] px-2 py-0.5 rounded-md border ${isDeg ? 'border-[#e94560]/40 text-[#e94560]' : 'border-border text-text-muted'}`}>
            {isDeg ? 'DEG' : 'RAD'}
          </button>
        </div>
        <p className="text-3xl font-light text-text-primary text-right truncate">{display}</p>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {[
          btn('sin', fnCls), btn('cos', fnCls), btn('tan', fnCls), btn('log', fnCls), btn('ln', fnCls),
          btn('√', fnCls), btn('x²', fnCls), btn('xⁿ', fnCls), btn('|x|', fnCls), btn('1/x', fnCls),
          btn('π', fnCls), btn('e', fnCls), btn('(', fnCls), btn(')', fnCls), btn('!', fnCls),
          btn('C', 'bg-border/60 text-text-secondary hover:bg-border'), btn('±', 'bg-border/60 text-text-secondary hover:bg-border'), btn('%', opCls), btn('⌫', 'bg-border/60 text-text-secondary hover:bg-border'), btn('÷', opCls),
          btn('7'), btn('8'), btn('9'), btn('×', opCls), btn('−', opCls),
          btn('4'), btn('5'), btn('6'), btn('+', opCls), btn('-', opCls),
          btn('1'), btn('2'), btn('3'), btn('.'),
          <button key="0" onClick={() => press('0')} className="col-span-1 h-10 rounded-xl text-xs font-semibold bg-background-card border border-border text-text-primary hover:bg-border/30">0</button>,
          <button key="=" onClick={() => press('=')} className="col-span-2 h-10 rounded-xl text-xs font-semibold bg-[#e94560] text-white hover:bg-[#d63b55]">=</button>,
        ]}
      </div>
    </div>
  );
}

// ── Programmer Calculator ──────────────────────────────────────────────────────
function ProgrammerCalc({ onResult }: { onResult: (expr: string, result: string) => void }) {
  const [value, setValue] = useState(0);
  const [inputBase, setInputBase] = useState<'DEC' | 'HEX' | 'BIN' | 'OCT'>('DEC');
  const [inputText, setInputText] = useState('0');

  const bases: ('DEC' | 'HEX' | 'BIN' | 'OCT')[] = ['DEC', 'HEX', 'OCT', 'BIN'];
  const baseNum: Record<string, number> = { DEC: 10, HEX: 16, OCT: 8, BIN: 2 };
  const baseLabel: Record<string, string> = { DEC: '10진수', HEX: '16진수', OCT: '8진수', BIN: '2진수' };

  const parse = (text: string, base: string) => {
    const n = parseInt(text, baseNum[base]);
    return isNaN(n) ? 0 : n;
  };

  const handleInput = (text: string) => {
    setInputText(text);
    setValue(parse(text, inputBase));
  };

  const handleBaseChange = (b: 'DEC' | 'HEX' | 'BIN' | 'OCT') => {
    const n = parse(inputText, inputBase);
    setValue(n);
    setInputBase(b);
    setInputText(n.toString(baseNum[b]).toUpperCase());
  };

  const hexBtns = ['A', 'B', 'C', 'D', 'E', 'F'];
  const bitOps = [
    { label: 'AND', fn: (a: number, b: number) => a & b },
    { label: 'OR', fn: (a: number, b: number) => a | b },
    { label: 'XOR', fn: (a: number, b: number) => a ^ b },
    { label: 'NOT', fn: (a: number) => ~a },
    { label: 'LSH', fn: (a: number) => a << 1 },
    { label: 'RSH', fn: (a: number) => a >> 1 },
  ];
  const [opA, setOpA] = useState('');
  const [opB, setOpB] = useState('');
  const [bitResult, setBitResult] = useState<number | null>(null);

  const runOp = (op: typeof bitOps[0]) => {
    const a = parseInt(opA || '0');
    const b = parseInt(opB || '0');
    const res = op.fn(a, b);
    setBitResult(res);
    onResult(`${a} ${op.label} ${b}`, res.toString());
  };

  return (
    <div className="w-full space-y-4">
      <div className="bg-background rounded-2xl border border-border p-4">
        <div className="flex gap-2 mb-3">
          {bases.map(b => (
            <button key={b} onClick={() => handleBaseChange(b)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${inputBase === b ? 'bg-[#e94560] text-white' : 'bg-border/30 text-text-muted hover:text-text-primary'}`}>
              {b}
            </button>
          ))}
        </div>
        <input value={inputText} onChange={e => handleInput(e.target.value)}
          className="w-full bg-transparent text-2xl font-mono text-text-primary text-right outline-none border-b border-border pb-2 mb-3" />
        <div className="grid grid-cols-2 gap-2">
          {bases.map(b => (
            <div key={b} className="bg-background-card rounded-lg px-3 py-2">
              <p className="text-[10px] text-text-muted mb-0.5">{baseLabel[b]}</p>
              <p className="text-sm font-mono text-text-primary truncate">{value.toString(baseNum[b]).toUpperCase()}</p>
            </div>
          ))}
        </div>
      </div>
      {inputBase === 'HEX' && (
        <div className="grid grid-cols-6 gap-1">
          {hexBtns.map(h => (
            <button key={h} onClick={() => handleInput(inputText === '0' ? h : inputText + h)}
              className="h-10 rounded-xl text-sm font-mono font-bold bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all">
              {h}
            </button>
          ))}
        </div>
      )}
      <div className="bg-background-card border border-border rounded-2xl p-4">
        <p className="text-xs font-semibold text-text-secondary mb-3">비트 연산</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-[10px] text-text-muted block mb-1">피연산자 A</label>
            <input value={opA} onChange={e => setOpA(e.target.value)} placeholder="정수" className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted block mb-1">피연산자 B</label>
            <input value={opB} onChange={e => setOpB(e.target.value)} placeholder="정수" className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {bitOps.map(op => (
            <button key={op.label} onClick={() => runOp(op)}
              className="py-2 rounded-xl text-xs font-bold bg-border/30 text-text-secondary hover:bg-[#e94560]/10 hover:text-[#e94560] transition-all">
              {op.label}
            </button>
          ))}
        </div>
        {bitResult !== null && (
          <div className="bg-background rounded-xl p-3 text-center">
            <p className="text-xs text-text-muted mb-1">결과</p>
            <p className="text-xl font-mono font-bold text-[#e94560]">{bitResult}</p>
            <p className="text-xs text-text-muted mt-1">{bitResult.toString(2)} (2진)</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tip Calculator ─────────────────────────────────────────────────────────────
function TipCalc({ onResult }: { onResult: (expr: string, result: string) => void }) {
  const [bill, setBill] = useState('');
  const [tip, setTip] = useState(10);
  const [people, setPeople] = useState(1);
  const [customTip, setCustomTip] = useState('');

  const billNum = parseFloat(bill) || 0;
  const tipPct = customTip ? parseFloat(customTip) : tip;
  const tipAmt = billNum * tipPct / 100;
  const total = billNum + tipAmt;
  const perPerson = people > 0 ? total / people : total;
  const tipPerPerson = people > 0 ? tipAmt / people : tipAmt;

  const presets = [0, 5, 10, 15, 18, 20, 25];

  const handleSave = () => {
    if (billNum > 0) {
      onResult(`${billNum.toLocaleString()}원 + ${tipPct}% 팁 (${people}명)`, `1인당 ${Math.round(perPerson).toLocaleString()}원`);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-4">
      <div>
        <label className="text-xs text-text-muted block mb-1">청구 금액</label>
        <div className="relative">
          <input type="number" value={bill} onChange={e => setBill(e.target.value)} placeholder="0"
            className="w-full bg-background border border-border rounded-xl px-3 py-3 text-lg font-bold text-text-primary pr-10 outline-none focus:border-[#e94560]" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">원</span>
        </div>
      </div>
      <div>
        <label className="text-xs text-text-muted block mb-2">팁 비율</label>
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          {presets.map(p => (
            <button key={p} onClick={() => { setTip(p); setCustomTip(''); }}
              className={`py-2 rounded-xl text-sm font-bold transition-all ${tip === p && !customTip ? 'bg-[#e94560] text-white' : 'bg-background-card border border-border text-text-secondary hover:text-text-primary'}`}>
              {p}%
            </button>
          ))}
          <input value={customTip} onChange={e => setCustomTip(e.target.value)} placeholder="직접" type="number"
            className={`py-2 rounded-xl text-sm text-center border outline-none transition-all ${customTip ? 'border-[#e94560] text-[#e94560]' : 'border-border text-text-secondary'} bg-background-card`} />
        </div>
      </div>
      <div>
        <label className="text-xs text-text-muted block mb-2">인원수</label>
        <div className="flex items-center gap-3">
          <button onClick={() => setPeople(p => Math.max(1, p - 1))} className="w-10 h-10 rounded-xl border border-border text-text-secondary hover:bg-border/30 text-lg">−</button>
          <span className="flex-1 text-center text-xl font-bold text-text-primary">{people}명</span>
          <button onClick={() => setPeople(p => p + 1)} className="w-10 h-10 rounded-xl border border-border text-text-secondary hover:bg-border/30 text-lg">+</button>
        </div>
      </div>
      <div className="bg-[#e94560]/5 border border-[#e94560]/20 rounded-2xl p-4 space-y-3">
        {[
          { label: '팁 금액', value: `${Math.round(tipAmt).toLocaleString()}원`, sub: `인당 ${Math.round(tipPerPerson).toLocaleString()}원` },
          { label: '합계', value: `${Math.round(total).toLocaleString()}원`, sub: '' },
          { label: '1인당', value: `${Math.round(perPerson).toLocaleString()}원`, sub: '', big: true },
        ].map(({ label, value, sub, big }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">{label}</span>
            <div className="text-right">
              <span className={`font-bold ${big ? 'text-xl text-[#e94560]' : 'text-base text-text-primary'}`}>{value}</span>
              {sub && <p className="text-[10px] text-text-muted">{sub}</p>}
            </div>
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={!billNum} className="w-full py-3 rounded-xl bg-[#e94560] text-white font-bold disabled:opacity-30">
        계산 기록에 저장
      </button>
    </div>
  );
}

const MODE_DEFS: { id: Mode; icon: string; labelKey: string; descKey: string }[] = [
  { id: 'general', icon: '🔢', labelKey: 'calc.general', descKey: 'calc.generalDesc' },
  { id: 'scientific', icon: '🔬', labelKey: 'calc.scientific', descKey: 'calc.scientificDesc' },
  { id: 'programmer', icon: '💻', labelKey: 'calc.programmer', descKey: 'calc.programmerDesc' },
  { id: 'tip', icon: '🍽️', labelKey: 'calc.tip', descKey: 'calc.tipDesc' },
  { id: 'ratio', icon: '📐', labelKey: 'calc.ratio', descKey: 'calc.ratioDesc' },
  { id: 'unit', icon: '📏', labelKey: 'calc.unit', descKey: 'calc.unitDesc' },
  { id: 'color', icon: '🎨', labelKey: 'calc.color', descKey: 'calc.colorDesc' },
];

export default function CalculatorPage() {
  const [mode, setMode] = useState<Mode>('general');
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const { calendarEvents } = useDataStore();
  const [history, setHistory] = useState<HistItem[]>([]);
  const [generalValue, setGeneralValue] = useState<string | null>(null);

  const activeMode = MODE_DEFS.find(m => m.id === mode)!;

  useEffect(() => {
    if (!user) return;
    getCalcHistory(user.uid).then(items => {
      setHistory(items.map(item => ({
        id: item.id,
        mode: item.mode as Mode,
        expr: item.expr,
        result: item.result,
      })));
    });
  }, [user]);

  const handleResult = useCallback(async (expr: string, result: string) => {
    const tempId = `temp_${Date.now()}`;
    const newItem: HistItem = { id: tempId, mode, expr, result };
    setHistory(prev => [newItem, ...prev].slice(0, 100));
    if (user) {
      const id = await addCalcHistory(user.uid, { mode, expr, result });
      setHistory(prev => prev.map(h => h.id === tempId ? { ...h, id } : h));
    }
  }, [mode, user]);

  const handleDelete = useCallback(async (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
    if (user && !id.startsWith('temp_')) await deleteCalcHistory(user.uid, id);
  }, [user]);

  const handleClearAll = useCallback(async () => {
    setHistory(prev => prev.filter(h => h.mode !== mode));
    if (user) await clearCalcHistoryByMode(user.uid, mode);
  }, [mode, user]);

  const modeHistory = history.filter(h => h.mode === mode);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="text-2xl">🧮</span>
          <h2 className="text-2xl font-extrabold text-text-primary">{t('calc.title')}</h2>
        </div>

        <div className="flex gap-5">
          {/* Left: mode nav */}
          <div className="w-36 flex-shrink-0">
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold px-1 mb-2">{t('calc.tools')}</p>
            <nav className="space-y-0.5">
              {MODE_DEFS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                    mode === m.id
                      ? 'bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20'
                      : 'hover:bg-border/30 text-text-secondary border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-4 text-center flex-shrink-0">{m.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${mode === m.id ? 'text-[#e94560]' : 'text-text-primary'}`}>{t(m.labelKey)}</p>
                      <p className="text-[10px] text-text-muted truncate">{t(m.descKey)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* Right: content card */}
          <div className="flex-1 min-w-0 bg-background-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <span>{activeMode.icon}</span>
              <h3 className="text-sm font-bold text-text-primary">{t(activeMode.labelKey)}</h3>
              <span className="text-[11px] text-text-muted ml-1">{t(activeMode.descKey)}</span>
            </div>
            <div className="p-5 flex gap-5">
              {/* Calc content */}
              <div className="flex-1 min-w-0">
                {mode === 'general' && (
                  <GeneralCalc
                    onResult={handleResult}
                    externalValue={generalValue}
                    onExternalValueConsumed={() => setGeneralValue(null)}
                  />
                )}
                {mode === 'scientific' && <ScientificCalc onResult={handleResult} />}
                {mode === 'programmer' && <ProgrammerCalc onResult={handleResult} />}
                {mode === 'tip' && <TipCalc onResult={handleResult} />}
                {mode === 'ratio' && <RatioCalc onResult={handleResult} t={t} />}
                {mode === 'unit' && <UnitConv onResult={handleResult} t={t} />}
                {mode === 'color' && <ColorCalc onResult={handleResult} t={t} />}
              </div>

              {/* History */}
              <HistoryPanel
                items={modeHistory}
                onUse={mode === 'general' ? (r) => setGeneralValue(r) : undefined}
                onDelete={handleDelete}
                onClearAll={handleClearAll}
                currentMode={mode}
              />
            </div>
          </div>
        </div>
      </div>

      <FloatingAIBar
        getAction={(text) => detectCrossPageAction(text) || 'chat'}
        getContext={(text) => {
          const crossAction = detectCrossPageAction(text);
          if (crossAction) return crossPageContext(text, calendarEvents || []);
          return {
            mode,
            recentHistory: history.slice(0, 5).map((h) => `${h.expr} = ${h.result}`),
            userMessage: text,
          };
        }}
        onResult={async (action, result) => {
          if (!user) return;
          await handleCrossPageResult(action, result, user.uid, (path) => router.push(path));
        }}
        placeholder="계산에 대해 AI에게 질문하세요 (예: 15% 세금 포함하면 얼마야?)..."
      />
    </div>
  );
}
