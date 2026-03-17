'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type TxType = 'income' | 'expense';

const EXPENSE_CATEGORIES = ['식비', '교통', '쇼핑', '여가/문화', '의료', '교육', '주거', '통신', '기타'];
const INCOME_CATEGORIES = ['급여', '부수입', '용돈', '투자수익', '기타'];

interface Transaction {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  memo: string;
  date: string; // YYYY-MM-DD
  createdAt: Timestamp;
}

const db = getFirestore();

function txRef(uid: string) {
  return collection(db, 'users', uid, 'budget');
}

export default function BudgetPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // 폼 상태
  const [type, setType] = useState<TxType>('expense');
  const [category, setCategory] = useState('식비');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(todayStr);

  // 필터: 년/월
  const [filterYear, setFilterYear] = useState(today.getFullYear());
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(txRef(user.uid), orderBy('createdAt', 'desc')));
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    await addDoc(txRef(user.uid), {
      type, category, amount: Number(amount.replace(/,/g, '')),
      memo, date, createdAt: Timestamp.now(),
    });
    setAmount('');
    setMemo('');
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'budget', id));
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const filtered = transactions.filter((t) => {
    const [y, m] = t.date.split('-').map(Number);
    return y === filterYear && m === filterMonth;
  });

  const totalIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);

  // 카테고리별 집계
  const categoryTotals = filtered
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);
  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 md:px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-text-primary">💰 가계부</h1>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-[#e94560] text-white text-sm font-semibold rounded-xl hover:bg-[#d63651] transition-colors"
          >
            + 내역 추가
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 py-6 max-w-4xl mx-auto w-full space-y-4">
        {/* 월 선택 */}
        <div className="flex gap-2 items-center">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(Number(e.target.value))}
            className="bg-background-card border border-border text-text-primary text-sm rounded-xl px-3 py-2"
          >
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <div className="flex gap-1 flex-wrap">
            {months.map((m) => (
              <button
                key={m}
                onClick={() => setFilterMonth(m)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterMonth === m ? 'bg-[#e94560] text-white' : 'bg-background-card border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-background-card border border-border rounded-2xl p-4 text-center">
            <p className="text-xs text-text-muted mb-1">수입</p>
            <p className="text-lg font-bold text-green-500">+{fmt(totalIncome)}</p>
          </div>
          <div className="bg-background-card border border-border rounded-2xl p-4 text-center">
            <p className="text-xs text-text-muted mb-1">지출</p>
            <p className="text-lg font-bold text-[#e94560]">-{fmt(totalExpense)}</p>
          </div>
          <div className="bg-background-card border border-border rounded-2xl p-4 text-center">
            <p className="text-xs text-text-muted mb-1">잔액</p>
            <p className={`text-lg font-bold ${balance >= 0 ? 'text-text-primary' : 'text-orange-500'}`}>
              {balance >= 0 ? '+' : ''}{fmt(balance)}
            </p>
          </div>
        </div>

        {/* 카테고리 분석 */}
        {topCategories.length > 0 && (
          <div className="bg-background-card border border-border rounded-2xl p-4 space-y-2">
            <p className="text-sm font-medium text-text-primary mb-3">지출 분석</p>
            {topCategories.map(([cat, total]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-text-secondary w-16 shrink-0">{cat}</span>
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#e94560] rounded-full"
                    style={{ width: `${Math.min(100, (total / totalExpense) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted w-20 text-right">{fmt(total)}원</span>
              </div>
            ))}
          </div>
        )}

        {/* 거래 내역 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-secondary">{filterYear}년 {filterMonth}월 내역</p>
          {loading ? (
            <div className="text-center py-8 text-text-muted text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <p className="text-3xl mb-2">📒</p>
              <p className="text-sm">내역이 없습니다</p>
              <p className="text-xs mt-1">+ 내역 추가로 시작하세요</p>
            </div>
          ) : (
            filtered.map((tx) => (
              <div key={tx.id} className="bg-background-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 group">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  tx.type === 'income' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  {tx.type === 'income' ? '📈' : '📉'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-border/50 px-2 py-0.5 rounded-full text-text-muted">{tx.category}</span>
                    {tx.memo && <span className="text-xs text-text-secondary truncate">{tx.memo}</span>}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{tx.date}</p>
                </div>
                <span className={`font-bold text-sm ${tx.type === 'income' ? 'text-green-500' : 'text-[#e94560]'}`}>
                  {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                </span>
                <button
                  onClick={() => handleDelete(tx.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-[#e94560] text-sm transition-all"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">내역 추가</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>

            {/* 수입/지출 탭 */}
            <div className="flex gap-1 bg-border/20 rounded-xl p-1">
              {(['expense', 'income'] as TxType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setType(t);
                    setCategory(t === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    type === t
                      ? t === 'expense' ? 'bg-[#e94560] text-white' : 'bg-green-500 text-white'
                      : 'text-text-muted'
                  }`}
                >
                  {t === 'expense' ? '지출' : '수입'}
                </button>
              ))}
            </div>

            {/* 날짜 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">날짜</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
              />
            </div>

            {/* 카테고리 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">카테고리</label>
              <div className="flex flex-wrap gap-1.5">
                {(type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      category === c
                        ? type === 'expense' ? 'bg-[#e94560] text-white' : 'bg-green-500 text-white'
                        : 'bg-background-card border border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* 금액 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">금액</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">원</span>
              </div>
            </div>

            {/* 메모 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">메모 (선택)</label>
              <input
                type="text"
                placeholder="메모를 입력하세요"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <button
              onClick={handleAdd}
              disabled={!amount}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-40"
              style={{ backgroundColor: type === 'expense' ? '#e94560' : '#22c55e' }}
            >
              추가하기
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
          totalIncome,
          totalExpense,
          balance,
          topCategories: topCategories.slice(0, 5).map(([cat, amt]) => `${cat}: ${amt.toLocaleString()}원`).join(', '),
          recentTransactions: filtered.slice(0, 10).map(t =>
            `${t.date} ${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()}원 (${t.category}${t.memo ? ' ' + t.memo : ''})`
          ).join('\n'),
        })}
        onResult={() => {}}
        placeholder="가계부에 대해 질문하거나 내역을 추가해보세요..."
      />
    </div>
  );
}
