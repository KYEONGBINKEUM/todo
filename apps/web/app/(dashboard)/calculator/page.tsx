'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getCalcHistory,
  addCalcHistory,
  deleteCalcHistory,
  clearCalcHistoryByMode,
} from '@/lib/firestore';

type Mode = 'general' | 'ratio' | 'unit' | 'color';

interface HistItem { id: string; mode: Mode; expr: string; result: string; }

// ── History Panel ─────────────────────────────────────────────────────────────
function HistoryPanel({
  items,
  onUse,
  onDelete,
  onClearAll,
}: {
  items: HistItem[];
  onUse?: (result: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [copied, setCopied] = useState('');

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
    <div className="w-48 flex-shrink-0 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">기록</span>
        {items.length > 0 && (
          <button
            onClick={onClearAll}
            className="text-[10px] px-2 py-0.5 rounded-md border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
          >
            전체 삭제
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-text-muted text-[11px] text-center">
          기록 없음
        </div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {items.map((h) => (
            <div key={h.id} className="group flex items-center gap-1">
              <button
                onClick={() => handleClick(h)}
                className="flex-1 min-w-0 text-right p-2.5 bg-background rounded-xl border border-border hover:border-[#e94560]/30 transition-colors"
              >
                <p className="text-[10px] text-text-muted font-mono truncate">{h.expr}</p>
                <p className="text-sm font-semibold text-text-primary group-hover:text-[#e94560] transition-colors truncate">
                  {copied === h.id ? '✓ 복사됨' : h.result}
                </p>
              </button>
              <button
                onClick={() => onDelete(h.id)}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-text-muted opacity-0 group-hover:opacity-100 hover:text-[#e94560] hover:bg-[#e94560]/10 transition-all text-xs"
              >
                ×
              </button>
            </div>
          ))}
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
function RatioCalc({ onResult }: { onResult: (expr: string, result: string) => void }) {
  const [tab, setTab] = useState<'scale' | 'ratio'>('scale');

  // Scale mode
  const [ow, setOw] = useState(''); const [oh, setOh] = useState('');
  const [nw, setNw] = useState(''); const [nh, setNh] = useState('');
  const [resH, setResH] = useState(''); const [resW, setResW] = useState('');

  const scaleH = () => {
    const [a, b, c] = [ow, oh, nw].map(parseFloat);
    if ([a, b, c].some(isNaN) || a === 0) return;
    const r = parseFloat(((c * b) / a).toFixed(2)).toString();
    setResH(r); onResult(`${a}×${b} → W${c}`, `H = ${r}`);
  };
  const scaleW = () => {
    const [a, b, c] = [ow, oh, nh].map(parseFloat);
    if ([a, b, c].some(isNaN) || b === 0) return;
    const r = parseFloat(((c * a) / b).toFixed(2)).toString();
    setResW(r); onResult(`${a}×${b} → H${c}`, `W = ${r}`);
  };

  // Ratio mode
  const [r1, setR1] = useState('16'); const [r2, setR2] = useState('9');
  const [rIn, setRIn] = useState(''); const [rOut, setROut] = useState('');
  const [rDir, setRDir] = useState<'wh' | 'hw'>('wh');

  const calcRatio = () => {
    const [v, a, b] = [rIn, r1, r2].map(parseFloat);
    if ([v, a, b].some(isNaN) || a === 0 || b === 0) return;
    const r = rDir === 'wh'
      ? parseFloat(((v * b) / a).toFixed(2)).toString()
      : parseFloat(((v * a) / b).toFixed(2)).toString();
    setROut(r);
    onResult(
      rDir === 'wh' ? `${r1}:${r2}, W=${rIn}` : `${r1}:${r2}, H=${rIn}`,
      rDir === 'wh' ? `H = ${r}` : `W = ${r}`
    );
  };

  const ic = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors";
  const rc = "px-3 py-2.5 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl text-sm font-bold text-[#e94560] min-h-[42px] flex items-center";
  const calcBtn = "px-3 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors flex-shrink-0";

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 p-1 bg-border/30 rounded-xl w-fit">
        {([['scale', '크기 비례'], ['ratio', '비율 계산']] as const).map(([m, l]) => (
          <button key={m} onClick={() => setTab(m)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === m ? 'bg-[#e94560] text-white' : 'text-text-muted hover:text-text-primary'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'scale' ? (
        <div className="space-y-4 max-w-sm">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">원본 크기 (W × H)</p>
            <div className="flex items-center gap-2">
              <input value={ow} onChange={e => setOw(e.target.value)} placeholder="1920" className={ic} />
              <span className="text-text-muted font-bold text-lg">×</span>
              <input value={oh} onChange={e => setOh(e.target.value)} placeholder="1080" className={ic} />
            </div>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">너비로 높이 계산</p>
            <div className="flex items-center gap-2">
              <input value={nw} onChange={e => { setNw(e.target.value); setResH(''); }} placeholder="새 너비"
                className={ic} onKeyDown={e => e.key === 'Enter' && scaleH()} />
              <button onClick={scaleH} className={calcBtn}>→</button>
              <div className={`${rc} flex-1 min-w-0`}>{resH || '—'}</div>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">높이로 너비 계산</p>
            <div className="flex items-center gap-2">
              <input value={nh} onChange={e => { setNh(e.target.value); setResW(''); }} placeholder="새 높이"
                className={ic} onKeyDown={e => e.key === 'Enter' && scaleW()} />
              <button onClick={scaleW} className={calcBtn}>→</button>
              <div className={`${rc} flex-1 min-w-0`}>{resW || '—'}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-w-xs">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">비율 (예: 16 : 9)</p>
            <div className="flex items-center gap-3">
              <input value={r1} onChange={e => setR1(e.target.value)}
                className="w-20 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-center text-text-primary outline-none focus:border-[#e94560] transition-colors" />
              <span className="text-text-muted font-bold text-xl">:</span>
              <input value={r2} onChange={e => setR2(e.target.value)}
                className="w-20 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-center text-text-primary outline-none focus:border-[#e94560] transition-colors" />
            </div>
          </div>
          <div className="flex gap-1.5 p-1 bg-border/30 rounded-xl w-fit">
            {([['wh', '너비 → 높이'], ['hw', '높이 → 너비']] as const).map(([d, l]) => (
              <button key={d} onClick={() => { setRDir(d); setROut(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rDir === d ? 'bg-background-card text-text-primary shadow-sm' : 'text-text-muted'}`}>
                {l}
              </button>
            ))}
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
              {rDir === 'wh' ? '너비' : '높이'} 입력
            </p>
            <div className="flex gap-2">
              <input value={rIn} onChange={e => { setRIn(e.target.value); setROut(''); }} placeholder="값 입력"
                className={ic} onKeyDown={e => e.key === 'Enter' && calcRatio()} />
              <button onClick={calcRatio} className={calcBtn}>계산</button>
            </div>
            {rOut && (
              <div className={`mt-3 ${rc} gap-2`}>
                <span className="text-xs text-text-muted">{rDir === 'wh' ? '높이 =' : '너비 ='}</span>
                <span className="text-lg font-bold text-[#e94560]">{rOut}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Unit Converter ────────────────────────────────────────────────────────────
type UnitCategory = 'length' | 'weight' | 'area' | 'temp';

const UNIT_DEFS: Record<UnitCategory, { label: string; units: { id: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[] }> = {
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

function UnitConv({ onResult }: { onResult: (expr: string, result: string) => void }) {
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

      {result && (
        <button onClick={handleSave}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors">
          기록에 저장
        </button>
      )}
    </div>
  );
}

// ── Color Converter ───────────────────────────────────────────────────────────
function ColorCalc({ onResult }: { onResult: (expr: string, result: string) => void }) {
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
      {copied === label ? '✓ 복사됨' : '복사'}
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
            저장
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
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">색상 스케일</p>
          <span className="text-[9px] text-text-muted">클릭하여 선택</span>
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
          <span className="text-[9px] text-text-muted">밝음</span>
          <span className="text-[9px] text-text-muted">어둠</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const MODES: { id: Mode; icon: string; label: string; desc: string }[] = [
  { id: 'general', icon: '🔢', label: '일반', desc: '사칙연산' },
  { id: 'ratio', icon: '📐', label: '비율', desc: '크기 비례' },
  { id: 'unit', icon: '📏', label: '단위', desc: '길이·무게·온도' },
  { id: 'color', icon: '🎨', label: '색상', desc: 'HEX·RGB·HSL' },
];

export default function CalculatorPage() {
  const [mode, setMode] = useState<Mode>('general');
  const { user } = useAuth();
  const [history, setHistory] = useState<HistItem[]>([]);
  const [generalValue, setGeneralValue] = useState<string | null>(null);

  const activeMode = MODES.find(m => m.id === mode)!;

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
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="text-2xl">🧮</span>
          <h2 className="text-2xl font-extrabold text-text-primary">계산기</h2>
        </div>

        <div className="flex gap-5">
          {/* Left: mode nav */}
          <div className="w-36 flex-shrink-0">
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold px-1 mb-2">도구</p>
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-4 text-center flex-shrink-0">{m.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${mode === m.id ? 'text-[#e94560]' : 'text-text-primary'}`}>{m.label}</p>
                      <p className="text-[10px] text-text-muted truncate">{m.desc}</p>
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
              <h3 className="text-sm font-bold text-text-primary">{activeMode.label}</h3>
              <span className="text-[11px] text-text-muted ml-1">{activeMode.desc}</span>
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
                {mode === 'ratio' && <RatioCalc onResult={handleResult} />}
                {mode === 'unit' && <UnitConv onResult={handleResult} />}
                {mode === 'color' && <ColorCalc onResult={handleResult} />}
              </div>

              {/* History */}
              <HistoryPanel
                items={modeHistory}
                onUse={mode === 'general' ? (r) => setGeneralValue(r) : undefined}
                onDelete={handleDelete}
                onClearAll={handleClearAll}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
