"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileTextIcon,
  RefreshCw,
  Calendar,
  Layers,
  Clock,
  ArrowRight,
  TrendingDown,
  PieChart,
  HandCoins,
  Trash2,
} from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  description: string;
  date: string;
  categories?: { name: string } | null;
}

type PeriodFilter = "today" | "week" | "month" | "custom";

// Kategoriya kartochkalari uchun chiroyli ranglar palitrasi
const CATEGORY_COLORS = [
  { bg: "bg-blue-500", text: "text-blue-600", light: "bg-blue-50" },
  { bg: "bg-violet-500", text: "text-violet-600", light: "bg-violet-50" },
  { bg: "bg-amber-500", text: "text-amber-600", light: "bg-amber-50" },
  { bg: "bg-rose-500", text: "text-rose-600", light: "bg-rose-50" },
  { bg: "bg-emerald-500", text: "text-emerald-600", light: "bg-emerald-50" },
  { bg: "bg-cyan-500", text: "text-cyan-600", light: "bg-cyan-50" },
  { bg: "bg-indigo-500", text: "text-indigo-600", light: "bg-indigo-50" },
  { bg: "bg-orange-500", text: "text-orange-600", light: "bg-orange-50" },
];

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debtsSummary, setDebtsSummary] = useState<{ lent: number; borrowed: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Toggle davr filtri: Bugun, Hafta, Oy, Boshqa
  const [period, setPeriod] = useState<PeriodFilter>("today");

  // Boshqa tanlanganda sana oralig'i
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [mounted, setMounted] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const today = new Date().toISOString().split("T")[0];
    setCustomStart(today);
    setCustomEnd(today);

    if (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
        fetchTransactions(tg.initDataUnsafe.user.id);
        fetchDebtsSummary(tg.initDataUnsafe.user.id);
      } else {
        // Test fallback (brauzerda sinab ko'rish uchun)
        fetchTransactions(123456789);
        fetchDebtsSummary(123456789);
      }
    } else {
      fetchTransactions(123456789);
      fetchDebtsSummary(123456789);
    }
  }, []);

  const fetchTransactions = async (telegramId: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions?telegram_id=${telegramId}`);
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDebtsSummary = async (telegramId: number) => {
    try {
      const res = await fetch(`/api/debts?telegram_id=${telegramId}&status=ACTIVE`);
      const data = await res.json();
      if (data.debts) {
        const lent = data.debts
          .filter((d: any) => d.type === 'LENT')
          .reduce((acc: number, curr: any) => acc + (Number(curr.amount) - Number(curr.paid_amount)), 0);
        const borrowed = data.debts
          .filter((d: any) => d.type === 'BORROWED' || d.type === 'LOAN')
          .reduce((acc: number, curr: any) => acc + (Number(curr.amount) - Number(curr.paid_amount)), 0);
        setDebtsSummary({ lent, borrowed });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const confirmMessage = "Haqiqatan ham ushbu tranzaksiyani o'chirmoqchimisiz?";

    const executeDelete = async () => {
      try {
        setDeletingId(id);
        const telegramId = user?.id || 123456789;
        const res = await fetch(`/api/transactions?id=${id}&telegram_id=${telegramId}`, {
          method: "DELETE",
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setTransactions((prev) => prev.filter((t) => t.id !== id));
          if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
          }
        } else {
          alert(data.error || "O'chirishda xatolik yuz berdi");
        }
      } catch (err) {
        console.error("O'chirishda xatolik:", err);
        alert("Server bilan bog'lanishda xatolik yuz berdi");
      } finally {
        setDeletingId(null);
      }
    };

    if (typeof window !== "undefined" && window.Telegram?.WebApp?.showConfirm) {
      window.Telegram.WebApp.showConfirm(confirmMessage, (confirmed: boolean) => {
        if (confirmed) {
          executeDelete();
        }
      });
    } else {
      if (window.confirm(confirmMessage)) {
        executeDelete();
      }
    }
  };

  const handlePeriodChange = (newPeriod: PeriodFilter) => {
    setPeriod(newPeriod);
    if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
  };

  // Tanlangan davrga mos filtrlangan tranzaksiyalar
  const filteredTransactions = useMemo(() => {
    if (!mounted) return transactions;

    const now = new Date();

    if (period === "today") {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return transactions.filter((t) => {
        const d = new Date(t.date);
        return d >= startOfDay && d <= endOfDay;
      });
    }

    if (period === "week") {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() + diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      return transactions.filter((t) => {
        const d = new Date(t.date);
        return d >= startOfWeek && d <= endOfWeek;
      });
    }

    if (period === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      return transactions.filter((t) => {
        const d = new Date(t.date);
        return d >= startOfMonth && d <= endOfMonth;
      });
    }

    if (period === "custom") {
      const start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(0);
      const end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : new Date(8640000000000000);

      return transactions.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });
    }

    return transactions;
  }, [transactions, period, customStart, customEnd, mounted]);

  // Tanlangan davrdagi kirim va chiqimlar
  const periodIncome = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === "INCOME")
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
  }, [filteredTransactions]);

  const periodExpense = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
  }, [filteredTransactions]);

  // Umumiy hisob balansi (barcha vaqt uchun)
  const allTimeBalance = useMemo(() => {
    const inc = transactions
      .filter((t) => t.type === "INCOME")
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
    const exp = transactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
    return inc - exp;
  }, [transactions]);

  // Kategoriyalar bo'yicha jami sarflangan summalarni hisoblash (Chiqimlar)
  const categoryExpenses = useMemo(() => {
    const expenses = filteredTransactions.filter((t) => t.type === "EXPENSE");
    const map = new Map<string, { amount: number; count: number }>();

    expenses.forEach((t) => {
      const catName = t.categories?.name || t.description || "Boshqa xarajatlar";
      const existing = map.get(catName) || { amount: 0, count: 0 };
      map.set(catName, {
        amount: existing.amount + Number(t.amount),
        count: existing.count + 1,
      });
    });

    const list = Array.from(map.entries()).map(([name, data]) => ({
      name,
      amount: data.amount,
      count: data.count,
      percentage: periodExpense > 0 ? Math.round((data.amount / periodExpense) * 100) : 0,
    }));

    // Katta summadan kichigiga qarab saralash
    return list.sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, periodExpense]);

  // Oxirgi 10 ta tranzaksiya (filtrlangan davr bo'yicha)
  const recentTransactions = useMemo(() => {
    return filteredTransactions.slice(0, 10);
  }, [filteredTransactions]);

  // Filtr davri sarlavhasi matni
  const getPeriodLabel = () => {
    switch (period) {
      case "today":
        return "Bugungi";
      case "week":
        return "Haftalik";
      case "month":
        return "Oylik";
      case "custom":
        return "Tanlangan davr";
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 pb-20">
      {/* Header */}
      <header className="bg-white p-4 shadow-xs border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">Budjetingiz</h1>
          <p className="text-xs text-gray-400">
            {user?.first_name ? `Salom, ${user.first_name}` : "Boshqaruv paneli"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => user?.id && fetchTransactions(user.id)}
            className="p-2 text-gray-500 hover:text-gray-700 active:scale-95 transition"
            title="Yangilash"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs">
            {user?.first_name?.[0] || "U"}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4">
        {/* Toggle Filtr Tugmalari: Bugun, Hafta, Oy, Boshqa */}
        <div className="bg-white p-1 rounded-2xl shadow-xs border border-gray-100 flex items-center">
          <button
            onClick={() => handlePeriodChange("today")}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
              period === "today"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Bugun
          </button>
          <button
            onClick={() => handlePeriodChange("week")}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
              period === "week"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Hafta
          </button>
          <button
            onClick={() => handlePeriodChange("month")}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
              period === "month"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Oy
          </button>
          <button
            onClick={() => handlePeriodChange("custom")}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
              period === "custom"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Boshqa
          </button>
        </div>

        {/* Agar "Boshqa" tanlansa sana tanlash qutisi */}
        {period === "custom" && (
          <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-xs flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <Calendar size={14} className="text-blue-600" />
              <span>Sana oralig'ini kiriting</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Boshlanish</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Tugash</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Balans va Davriy Sarf/Kirim Kartasi */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <p className="text-gray-400 text-xs">Umumiy balans</p>
              <h2 className={`text-2xl font-extrabold ${allTimeBalance >= 0 ? "text-gray-900" : "text-red-600"}`}>
                {allTimeBalance.toLocaleString()} so'm
              </h2>
            </div>
            <span className="text-[11px] font-medium px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
              {getPeriodLabel()} holat
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3">
            <div className="bg-green-50/60 p-3 rounded-xl border border-green-100">
              <div className="flex items-center gap-1 text-[11px] text-green-700 font-medium">
                <ArrowDownIcon size={13} /> Kirim
              </div>
              <p className="font-bold text-sm text-green-600 mt-0.5">
                +{periodIncome.toLocaleString()} so'm
              </p>
            </div>
            <div className="bg-red-50/60 p-3 rounded-xl border border-red-100">
              <div className="flex items-center gap-1 text-[11px] text-red-700 font-medium">
                <ArrowUpIcon size={13} /> Chiqim (Sarf)
              </div>
              <p className="font-bold text-sm text-red-600 mt-0.5">
                -{periodExpense.toLocaleString()} so'm
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Kirim va Chiqim qo'shish */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/income"
            className="bg-green-600 hover:bg-green-700 text-white p-3.5 rounded-2xl flex items-center justify-center gap-2.5 shadow-xs active:scale-95 transition"
          >
            <div className="bg-white/20 p-1.5 rounded-xl">
              <ArrowDownIcon size={18} />
            </div>
            <span className="font-semibold text-xs">Kirim qo'shish</span>
          </Link>
          <Link
            href="/expense"
            className="bg-red-600 hover:bg-red-700 text-white p-3.5 rounded-2xl flex items-center justify-center gap-2.5 shadow-xs active:scale-95 transition"
          >
            <div className="bg-white/20 p-1.5 rounded-xl">
              <ArrowUpIcon size={18} />
            </div>
            <span className="font-semibold text-xs">Chiqim qo'shish</span>
          </Link>
        </div>

        {/* QARZLAR VA KREDITLAR VIDJETI */}
        <Link
          href="/debts"
          className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 hover:border-gray-200 transition flex flex-col gap-2.5 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <HandCoins size={16} />
              </div>
              <div>
                <h3 className="font-bold text-xs text-gray-900">Qarzlar va Kreditlar</h3>
                <p className="text-[10px] text-gray-400">Majburiyatlar va to'lovlar hisobi</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
              <span>Barchasi</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 text-xs">
            <div className="bg-green-50/50 p-2.5 rounded-xl border border-green-100/70">
              <span className="text-[10px] text-green-700 block font-medium">Menga qaytishi kerak</span>
              <span className="font-bold text-green-600">
                +{debtsSummary ? debtsSummary.lent.toLocaleString() : "0"} so'm
              </span>
            </div>
            <div className="bg-rose-50/50 p-2.5 rounded-xl border border-rose-100/70">
              <span className="text-[10px] text-rose-700 block font-medium">Mening qarzlarim</span>
              <span className="font-bold text-rose-600">
                -{debtsSummary ? debtsSummary.borrowed.toLocaleString() : "0"} so'm
              </span>
            </div>
          </div>
        </Link>

        {/* KATEGORIYALAR BO'YICHA JAMI SARFLANGAN SUMMALAR */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                <PieChart size={16} />
              </div>
              <div>
                <h3 className="font-bold text-xs text-gray-900">Kategoriyalar bo'yicha sarf</h3>
                <p className="text-[10px] text-gray-400">
                  {getPeriodLabel()} chiqimlar taqsimoti
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-red-600">
              {periodExpense > 0 ? `-${periodExpense.toLocaleString()} so'm` : "0 so'm"}
            </span>
          </div>

          {loading ? (
            <div className="text-center py-6 text-gray-400 text-xs">Yuklanmoqda...</div>
          ) : categoryExpenses.length === 0 ? (
            <div className="p-5 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <TrendingDown size={24} className="mx-auto text-gray-300 mb-1" />
              <p className="text-xs text-gray-500 font-medium">Bu davrda xarajatlar yo'q</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Boshqa davrni tanlang yoki yangi chiqim qo'shing.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pt-1">
              {categoryExpenses.map((cat, idx) => {
                const colorTheme = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div key={cat.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-lg ${colorTheme.light} ${colorTheme.text} flex items-center justify-center font-bold text-[10px]`}
                        >
                          {cat.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-800">{cat.name}</span>
                        <span className="text-[10px] text-gray-400">({cat.count} ta)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-gray-900 block">
                          {cat.amount.toLocaleString()} so'm
                        </span>
                        <span className="text-[10px] text-gray-400">{cat.percentage}%</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`${colorTheme.bg} h-1.5 rounded-full transition-all duration-500`}
                        style={{ width: `${Math.min(100, Math.max(4, cat.percentage))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* OXIRGI 10 TA TRANZAKSIYALAR */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Clock size={15} className="text-gray-500" />
              <h3 className="font-bold text-xs text-gray-800">
                Oxirgi tranzaksiyalar ({recentTransactions.length}/10)
              </h3>
            </div>
            <span className="text-[11px] text-gray-400">{getPeriodLabel()}</span>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-xs">Yuklanmoqda...</div>
          ) : recentTransactions.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center border border-gray-100 shadow-xs">
              <Layers className="mx-auto text-gray-300 mb-1" size={26} />
              <p className="text-gray-500 text-xs font-medium">Tranzaksiyalar topilmadi</p>
              <p className="text-gray-400 text-[10px] mt-0.5">
                Tanlangan davrda hech qanday kirim yoki chiqim amalga oshirilmagan.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentTransactions.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-3 rounded-xl flex items-center justify-between shadow-xs border border-gray-100 hover:border-gray-200 transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl ${
                        item.type === "INCOME"
                          ? "bg-green-50 text-green-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {item.type === "INCOME" ? <ArrowDownIcon size={16} /> : <ArrowUpIcon size={16} />}
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-gray-900 leading-tight">
                        {item.categories?.name || item.description || (item.type === "INCOME" ? "Kirim" : "Chiqim")}
                      </p>
                      {item.description && item.categories?.name && (
                        <p className="text-[10px] text-gray-500 line-clamp-1">{item.description}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(item.date).toLocaleDateString("uz-UZ", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p
                      className={`font-bold text-xs ${
                        item.type === "INCOME" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {item.type === "INCOME" ? "+" : "-"}
                      {Number(item.amount).toLocaleString()} so'm
                    </p>
                    <button
                      onClick={() => handleDeleteTransaction(item.id)}
                      disabled={deletingId === item.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition active:scale-90"
                      title="Tranzaksiyani o'chirish"
                    >
                      {deletingId === item.id ? (
                        <RefreshCw size={13} className="animate-spin text-red-500" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* BARCHASINI KO'RISH TUGMASI (Yangi sahifada ochadi) */}
          <Link
            href="/transactions"
            className="mt-1 w-full bg-white hover:bg-gray-50 active:scale-[0.99] border border-gray-200 text-gray-800 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition text-xs"
          >
            <span>Barcha tranzaksiyalarni ko'rish ({transactions.length})</span>
            <ArrowRight size={14} className="text-gray-500" />
          </Link>
        </div>

        {/* Hisobotlar Menyu Havolasi */}
        <div className="mt-1">
          <Link
            href="/reports"
            className="bg-white p-3.5 rounded-xl flex items-center gap-3 shadow-xs border border-gray-100 hover:bg-gray-50 transition"
          >
            <div className="bg-blue-50 text-blue-600 p-2 rounded-xl">
              <FileTextIcon size={18} />
            </div>
            <div className="flex-1">
              <span className="font-semibold block text-xs">Hisobotlar</span>
              <span className="text-[10px] text-gray-400">PDF va Excel shaklda botga yuborish</span>
            </div>
            <ArrowRight size={14} className="text-gray-400" />
          </Link>
        </div>
      </main>
    </div>
  );
}
