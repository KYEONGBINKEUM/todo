'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, Timestamp, updateDoc } from 'firebase/firestore';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type TxType = 'income' | 'expense';
type ViewMode = 'list' | 'chart' | 'budget' | 'stats';

const EXPENSE_CATEGORIES = ['식비', '교통', '쇼핑', '여가/문화', '의료', '교육', '주거', '통신', '기타'];
const INCOME_CATEGORIES = ['급여', '부수입', '용돈', '투자수익', '기타'];
const CATEGORY_ICONS: Record<string, string> = {
  '식비': '🍽️', '교통': '🚌', '쇼핑': '🛍️', '여가/문화': '🎭', '의료': '💊',
  '교육': '📚', '주거': '🏠', '통신': '📱', '기타': '📦',
  '급여': '💼', '부수입': '💡', '용돈': '🎁', '투자수익': '📈',
};
const CATEGORY_COLORS = ['#e94560','#8b5cf6','#06b6d4','#22c55e','#f59e0b','#ec4899','#6366f1','#14b8a6','#f97316'];

interface Transaction {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  memo: string;
  date: string;
  recurring?: boolean;
  createdAt: Timestamp;
}

interface BudgetLimit {
  category: string;
  limit: number;
}

const db = getFirestore();
function txRef(uid: string) { return collection(db, 'users', uid, 'budget'); }
function budgetLimitRef(uid: string) { return collection(db, 'users', uid, 'budgetLimits'); }

// SVG Donut Chart
function DonutChart({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  const size = 180;
  const cx = size / 2, cy = size / 2, r = 70, sw = 28;
  let cumPct = 0;
  const slices = data.map((d) => {
    const pct = total > 0 ? d.value / total : 0;
    const startAngle = cumPct * 2 * Math.PI - Math.PI / 2;
    cumPct += pct;
    const endAngle = cumPct * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = pct > 0.5 ? 1 : 0;
    return { ...d, path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, pct };
  });
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={sw} />
        {slices.map((s, i) => s.pct > 0.001 && (
          <path key={i} d={s.path} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="butt" />
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-text-primary" fontSize="11" fontWeight="600">지출</text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-text-primary" fontSize="13" fontWeight="700">
          {(total / 10000).toFixed(0)}만원
        </text>
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {slices.filter(s => s.pct > 0).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-text-secondary truncate flex-1">{s.label}</span>
            <span className="text-xs font-medium text-text-primary">{(s.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mini bar chart for 6-month trend
function TrendChart({ months }: { months: { label: string; income: number; expense: number }[] }) {
  const max = Math.max(...months.flatMap(m => [m.income, m.expense]), 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {months.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex gap-0.5 items-end" style={{ height: 80 }}>
            <div className="flex-1 rounded-t-sm bg-green-500 opacity-80 transition-all"
              style={{ height: `${(m.income / max) * 100}%`, minHeight: m.income > 0 ? 2 : 0 }} />
            <div className="flex-1 rounded-t-sm bg-[#e94560] opacity-80 transition-all"
              style={{ height: `${(m.expense / max) * 100}%`, minHeight: m.expense > 0 ? 2 : 0 }} />
          </div>
          <span className="text-[9px] text-text-muted">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function BudgetPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetLimits, setBudgetLimits] = useState<BudgetLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showBudgetForm, setShowBudgetForm] = useState(false);

  // Form state
  const [type, setType] = useState<TxType>('expense');
  const [category, setCategory] = useState('식비');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [recurring, setRecurring] = useState(false);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(todayStr);

  // Budget limit form
  const [editLimitCat, setEditLimitCat] = useState('');
  const [editLimitVal, setEditLimitVal] = useState('');

  // Filter
  const [filterYear, setFilterYear] = useState(today.getFullYear());
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [txSnap, limSnap] = await Promise.all([
        getDocs(query(txRef(user.uid), orderBy('createdAt', 'desc'))),
        getDocs(budgetLimitRef(user.uid)),
      ]);
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setBudgetLimits(limSnap.docs.map(d => ({ ...(d.data() as BudgetLimit) })));
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    await addDoc(txRef(user.uid), {
      type, category, amount: Number(amount.replace(/,/g, '')),
      memo, date, recurring, createdAt: Timestamp.now(),
    });
    setAmount(''); setMemo(''); setRecurring(false); setShowForm(false); load();
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'budget', id));
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const handleSaveBudgetLimit = async () => {
    if (!user || !editLimitCat || !editLimitVal) return;
    const existing = await getDocs(budgetLimitRef(user.uid));
    const found = existing.docs.find(d => (d.data() as BudgetLimit).category === editLimitCat);
    if (found) {
      await updateDoc(doc(db, 'users', user.uid, 'budgetLimits', found.id), { limit: Number(editLimitVal) });
    } else {
      await addDoc(budgetLimitRef(user.uid), { category: editLimitCat, limit: Number(editLimitVal) });
    }
    setEditLimitCat(''); setEditLimitVal(''); setShowBudgetForm(false); load();
  };

  const filtered = useMemo(() => transactions.filter(t => {
    const [y, m] = t.date.split('-').map(Number);
    return y === filterYear && m === filterMonth;
  }), [transactions, filterYear, filterMonth]);

  const totalIncome = useMemo(() => filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [filtered]);
  const totalExpense = useMemo(() => filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [filtered]);
  const balance = totalIncome - totalExpense;

  const categoryTotals = useMemo(() => {
    const acc: Record<string, number> = {};
    filtered.filter(t => t.type === 'expense').forEach(t => { acc[t.category] = (acc[t.category] || 0) + t.amount; });
    return acc;
  }, [filtered]);

  const donutData = useMemo(() =>
    Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({
      label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]
    })), [categoryTotals]);

  // 6-month trend
  const trendData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      const month = transactions.filter(t => { const [ty, tm] = t.date.split('-').map(Number); return ty === y && tm === m; });
      return {
        label: `${m}월`,
        income: month.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: month.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [transactions]);

  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);

  // CSV Export
  const exportCSV = () => {
    const header = 'date,type,category,amount,memo,recurring';
    const rows = filtered.map(t =>
      `${t.date},${t.type === 'income' ? '수입' : '지출'},${t.category},${t.amount},"${t.memo || ''}",${t.recurring ? '반복' : ''}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `가계부_${filterYear}년_${filterMonth}월.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const VIEW_TABS: { key: ViewMode; label: string; icon: string }[] = [
    { key: 'list', label: '내역', icon: '📋' },
    { key: 'chart', label: '차트', icon: '📊' },
    { key: 'budget', label: '예산', icon: '🎯' },
    { key: 'stats', label: '통계', icon: '📈' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 md:px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-text-primary">💰 가계부</h1>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="px-3 py-1.5 text-xs rounded-xl border border-border text-text-secondary hover:text-text-primary transition-colors">
              CSV 내보내기
            </button>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-[#e94560] text-white text-sm font-semibold rounded-xl hover:bg-[#d63651] transition-colors">
              + 내역 추가
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 py-6 max-w-4xl mx-auto w-full space-y-4">
        {/* Month Selector */}
        <div className="flex gap-2 items-center flex-wrap">
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
            className="bg-background-card border border-border text-text-primary text-sm rounded-xl px-3 py-2">
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <div className="flex gap-1 flex-wrap">
            {months.map(m => (
              <button key={m} onClick={() => setFilterMonth(m)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterMonth === m ? 'bg-[#e94560] text-white' : 'bg-background-card border border-border text-text-secondary hover:text-text-primary'}`}>
                {m}월
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '수입', value: totalIncome, color: 'text-green-500', prefix: '+' },
            { label: '지출', value: totalExpense, color: 'text-[#e94560]', prefix: '-' },
            { label: '잔액', value: balance, color: balance >= 0 ? 'text-text-primary' : 'text-orange-500', prefix: balance >= 0 ? '+' : '' },
          ].map(({ label, value, color, prefix }) => (
            <div key={label} className="bg-background-card border border-border rounded-2xl p-4 text-center">
              <p className="text-xs text-text-muted mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{prefix}{fmt(value)}</p>
              <p className="text-[10px] text-text-muted mt-0.5">원</p>
            </div>
          ))}
        </div>

        {/* View Tabs */}
        <div className="flex gap-1 bg-background-card border border-border rounded-xl p-1">
          {VIEW_TABS.map(tab => (
            <button key={tab.key} onClick={() => setViewMode(tab.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${viewMode === tab.key ? 'bg-[#e94560] text-white' : 'text-text-muted hover:text-text-primary'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">{filterYear}년 {filterMonth}월 내역 ({filtered.length}건)</p>
            {loading ? (
              <div className="text-center py-8 text-text-muted text-sm">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-text-muted">
                <p className="text-3xl mb-2">📒</p>
                <p className="text-sm">내역이 없습니다</p>
              </div>
            ) : filtered.map(tx => (
              <div key={tx.id} className="bg-background-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 group">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${tx.type === 'income' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {CATEGORY_ICONS[tx.category] || (tx.type === 'income' ? '📈' : '📉')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-border/50 px-2 py-0.5 rounded-full text-text-muted">{tx.category}</span>
                    {tx.recurring && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">반복</span>}
                    {tx.memo && <span className="text-xs text-text-secondary truncate">{tx.memo}</span>}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{tx.date}</p>
                </div>
                <span className={`font-bold text-sm ${tx.type === 'income' ? 'text-green-500' : 'text-[#e94560]'}`}>
                  {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                </span>
                <button onClick={() => handleDelete(tx.id)} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-[#e94560] text-sm transition-all">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* CHART VIEW */}
        {viewMode === 'chart' && (
          <div className="space-y-4">
            <div className="bg-background-card border border-border rounded-2xl p-5">
              <p className="text-sm font-medium text-text-primary mb-4">지출 분포</p>
              {donutData.length > 0 ? (
                <DonutChart data={donutData} total={totalExpense} />
              ) : (
                <p className="text-sm text-text-muted text-center py-8">지출 내역이 없습니다</p>
              )}
            </div>
            <div className="bg-background-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-text-primary">6개월 추세</p>
                <div className="flex gap-3 text-[10px] text-text-muted">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />수입</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#e94560] inline-block" />지출</span>
                </div>
              </div>
              <TrendChart months={trendData} />
            </div>
            {/* Category breakdown bars */}
            {donutData.length > 0 && (
              <div className="bg-background-card border border-border rounded-2xl p-5">
                <p className="text-sm font-medium text-text-primary mb-3">카테고리별 지출</p>
                <div className="space-y-2.5">
                  {donutData.map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-sm w-4">{CATEGORY_ICONS[label] || '📦'}</span>
                      <span className="text-xs text-text-secondary w-16 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${totalExpense > 0 ? (value / totalExpense) * 100 : 0}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-xs text-text-muted w-20 text-right">{fmt(value)}원</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BUDGET LIMITS VIEW */}
        {viewMode === 'budget' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-secondary">카테고리별 예산 한도</p>
              <button onClick={() => setShowBudgetForm(true)} className="px-3 py-1.5 text-xs rounded-xl bg-[#e94560] text-white">+ 예산 설정</button>
            </div>
            {EXPENSE_CATEGORIES.map(cat => {
              const spent = categoryTotals[cat] || 0;
              const limit = budgetLimits.find(l => l.category === cat)?.limit;
              const pct = limit ? Math.min(100, (spent / limit) * 100) : 0;
              const over = limit && spent > limit;
              return (
                <div key={cat} className="bg-background-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{CATEGORY_ICONS[cat]}</span>
                      <span className="text-sm font-medium text-text-primary">{cat}</span>
                      {over && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">초과!</span>}
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold ${over ? 'text-[#e94560]' : 'text-text-primary'}`}>{fmt(spent)}원</span>
                      {limit && <span className="text-xs text-text-muted"> / {fmt(limit)}원</span>}
                    </div>
                  </div>
                  {limit ? (
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${over ? 'bg-[#e94560]' : pct > 80 ? 'bg-orange-400' : 'bg-[#22c55e]'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">예산 미설정 — 버튼을 눌러 한도를 설정하세요</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* STATS VIEW */}
        {viewMode === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background-card border border-border rounded-2xl p-4">
                <p className="text-xs text-text-muted mb-1">하루 평균 지출</p>
                <p className="text-lg font-bold text-text-primary">{fmt(Math.round(totalExpense / new Date(filterYear, filterMonth, 0).getDate()))}원</p>
              </div>
              <div className="bg-background-card border border-border rounded-2xl p-4">
                <p className="text-xs text-text-muted mb-1">저축률</p>
                <p className="text-lg font-bold text-green-500">
                  {totalIncome > 0 ? Math.max(0, Math.round((balance / totalIncome) * 100)) : 0}%
                </p>
              </div>
              <div className="bg-background-card border border-border rounded-2xl p-4">
                <p className="text-xs text-text-muted mb-1">반복 지출</p>
                <p className="text-lg font-bold text-purple-400">
                  {fmt(filtered.filter(t => t.recurring && t.type === 'expense').reduce((s, t) => s + t.amount, 0))}원
                </p>
              </div>
              <div className="bg-background-card border border-border rounded-2xl p-4">
                <p className="text-xs text-text-muted mb-1">거래 건수</p>
                <p className="text-lg font-bold text-text-primary">{filtered.length}건</p>
              </div>
            </div>
            <div className="bg-background-card border border-border rounded-2xl p-4">
              <p className="text-sm font-medium text-text-primary mb-3">최대 지출 항목 TOP 5</p>
              <div className="space-y-2">
                {filtered.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5).map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-text-muted w-4">{i + 1}</span>
                    <span>{CATEGORY_ICONS[t.category] || '📦'}</span>
                    <span className="flex-1 text-xs text-text-secondary truncate">{t.memo || t.category}</span>
                    <span className="text-sm font-bold text-[#e94560]">{fmt(t.amount)}원</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">내역 추가</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <div className="flex gap-1 bg-border/20 rounded-xl p-1">
              {(['expense', 'income'] as TxType[]).map(t => (
                <button key={t} onClick={() => { setType(t); setCategory(t === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${type === t ? (t === 'expense' ? 'bg-[#e94560] text-white' : 'bg-green-500 text-white') : 'text-text-muted'}`}>
                  {t === 'expense' ? '지출' : '수입'}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">날짜</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">카테고리</label>
              <div className="flex flex-wrap gap-1.5">
                {(type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${category === c ? (type === 'expense' ? 'bg-[#e94560] text-white' : 'bg-green-500 text-white') : 'bg-background-card border border-border text-text-secondary hover:text-text-primary'}`}>
                    {CATEGORY_ICONS[c]} {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">금액</label>
              <div className="relative">
                <input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary pr-8" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">원</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">메모 (선택)</label>
              <input type="text" placeholder="메모를 입력하세요" value={memo} onChange={e => setMemo(e.target.value)}
                className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="accent-[#e94560]" />
              <span className="text-sm text-text-secondary">반복 지출/수입 (매월)</span>
            </label>
            <button onClick={handleAdd} disabled={!amount} className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
              style={{ backgroundColor: type === 'expense' ? '#e94560' : '#22c55e' }}>
              추가하기
            </button>
          </div>
        </div>
      )}

      {/* Budget Limit Modal */}
      {showBudgetForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">예산 한도 설정</h2>
              <button onClick={() => setShowBudgetForm(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">카테고리</label>
              <select value={editLimitCat} onChange={e => setEditLimitCat(e.target.value)} className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary">
                <option value="">선택...</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">월 한도 (원)</label>
              <input type="number" placeholder="예: 300000" value={editLimitVal} onChange={e => setEditLimitVal(e.target.value)}
                className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary" />
            </div>
            <button onClick={handleSaveBudgetLimit} disabled={!editLimitCat || !editLimitVal} className="w-full py-3 rounded-xl bg-[#e94560] text-white font-semibold text-sm disabled:opacity-40">
              저장
            </button>
          </div>
        </div>
      )}

      <FloatingAIBar
        commands={[
          { label: '수입 추가', icon: '📈', desc: '수입 금액과 카테고리를 입력하세요' },
          { label: '지출 추가', icon: '📉', desc: '지출 금액과 카테고리를 입력하세요' },
          { label: '이번달 분석', icon: '📊', desc: 'AI가 지출 패턴을 분석해드립니다' },
          { label: '절약 팁', icon: '💡', desc: '지출 절약 방법 추천' },
        ]}
        getAction={() => 'chat'}
        getContext={() => ({
          page: 'budget',
          currentMonth: `${filterYear}년 ${filterMonth}월`,
          totalIncome, totalExpense, balance,
          topCategories: donutData.slice(0, 5).map(d => `${d.label}: ${d.value.toLocaleString()}원`).join(', '),
          recentTransactions: filtered.slice(0, 10).map(t =>
            `${t.date} ${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()}원 (${t.category}${t.memo ? ' ' + t.memo : ''})`
          ).join('\n'),
        })}
        directHandler={async (text: string) => {
          if (!user) return null;
          const isIncome = /수입|입금|받았|벌었|들어왔/.test(text);
          const isExpense = /지출|사용|썼|결제|구매|샀|나갔|소비/.test(text);
          if (!isIncome && !isExpense) return null;
          const manMatch = text.match(/(\d[\d,]*)\s*만\s*원/);
          const wonMatch = text.match(/(\d[\d,]*)\s*원/);
          if (!manMatch && !wonMatch) return null;
          const amount = manMatch
            ? parseFloat(manMatch[1].replace(/,/g, '')) * 10000
            : parseFloat(wonMatch![1].replace(/,/g, ''));
          if (!amount || isNaN(amount)) return null;
          const txType: TxType = isIncome ? 'income' : 'expense';
          let cat = txType === 'income' ? '기타' : '기타';
          if (txType === 'expense') {
            if (/식비|밥|점심|저녁|아침|카페|커피|음식|식사/.test(text)) cat = '식비';
            else if (/교통|버스|지하철|택시|주유|기름/.test(text)) cat = '교통';
            else if (/쇼핑|옷|의류|마트|편의점/.test(text)) cat = '쇼핑';
            else if (/영화|공연|게임|여가|문화|놀이/.test(text)) cat = '여가/문화';
            else if (/병원|약|의료|치료/.test(text)) cat = '의료';
            else if (/학원|교육|책|문구/.test(text)) cat = '교육';
            else if (/월세|관리비|전기|수도|가스|주거/.test(text)) cat = '주거';
            else if (/통신|핸드폰|인터넷|요금/.test(text)) cat = '통신';
          } else {
            if (/급여|월급|봉급/.test(text)) cat = '급여';
            else if (/용돈/.test(text)) cat = '용돈';
            else if (/투자|배당|이자/.test(text)) cat = '투자수익';
            else if (/부업|알바|프리/.test(text)) cat = '부수입';
          }
          await addDoc(txRef(user.uid), { type: txType, category: cat, amount, memo: text.slice(0, 50), date: todayStr, recurring: false, createdAt: Timestamp.now() });
          load();
          return `✅ ${txType === 'income' ? '수입' : '지출'} ${amount.toLocaleString()}원 (${cat}) 추가되었습니다.`;
        }}
        onResult={() => {}}
        placeholder="가계부에 대해 질문하거나 내역을 추가해보세요..."
      />
    </div>
  );
}
