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
  Wallet,
  CreditCard,
  AlertTriangle,
  Plus,
  X,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  description: string;
  date: string;
  categories?: { name: string } | null;
  accounts?: { name: string; type: string; color?: string } | null;
}

interface AccountItem {
  id: string;
  name: string;
  type: string;
  balance: number;
  credit_limit?: number;
  grace_due_day?: number;
  color?: string;
  is_default?: boolean;
}

interface UpcomingPayment {
  id: string;
  person_name: string;
  type: string;
  is_credit_card: boolean;
  remaining_debt: number;
  payment_amount: number;
  due_date: string;
  days_left: number;
  account_name?: string | null;
}

interface CreditCardItem {
  id: string;
  name: string;
  credit_limit: number;
  spent_amount: number;
  available_limit: number;
  grace_due_day: number;
  days_left: number;
}

interface AnalyticsSummary {
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  total_receivables: number;
  accounts: AccountItem[];
  upcoming_payments: UpcomingPayment[];
  credit_cards: CreditCardItem[];
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
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Toggle davr filtri: Bugun, Hafta, Oy, Boshqa
  const [period, setPeriod] = useState<PeriodFilter>("today");

  // Boshqa tanlanganda sana oralig'i
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [mounted, setMounted] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Yangi hisob/karta qo'shish modal holati
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<"DEBIT_CARD" | "CREDIT_CARD" | "CASH">("DEBIT_CARD");
  const [accBalance, setAccBalance] = useState("");
  const [accLimit, setAccLimit] = useState("");
  const [accGraceDueDay, setAccGraceDueDay] = useState("20");
  const [submittingAcc, setSubmittingAcc] = useState(false);

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
        loadAllData(tg.initDataUnsafe.user.id);
      } else {
        // Test fallback (brauzerda sinab ko'rish uchun)
        loadAllData(123456789);
      }
    } else {
      loadAllData(123456789);
    }
  }, []);

  const loadAllData = (telegramId: number) => {
    fetchTransactions(telegramId);
    fetchSummary(telegramId);
  };

  const fetchSummary = async (telegramId: number) => {
    try {
      const res = await fetch(`/api/analytics/summary?telegram_id=${telegramId}`);
      const data = await res.json();
      if (data && !data.error) {
        setSummary(data);
      }
    } catch (e) {
      console.error("Summary yuklashda xatolik:", e);
    }
  };

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

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;

    try {
      setSubmittingAcc(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: telegramId,
          name: accName.trim(),
          type: accType,
          balance: Number(accBalance) || 0,
          credit_limit: Number(accLimit) || 0,
          grace_due_day: accGraceDueDay ? Number(accGraceDueDay) : null
        })
      });
      const data = await res.json();
      if (data.account) {
        setIsAddAccountModalOpen(false);
        setAccName("");
        setAccBalance("");
        setAccLimit("");
        fetchSummary(telegramId);
      }
    } catch (err) {
      console.error("Hisob qo'shishda xatolik:", err);
    } finally {
      setSubmittingAcc(false);
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
          fetchSummary(telegramId);
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
        {/* 1. SOF MOLIYAVIY HOLAT (NET WORTH) KARTASI */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-3xl p-5 shadow-md flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-300 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-blue-400" /> Sof Moliyaviy Holat (Net Worth)
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              (summary?.net_worth ?? 0) >= 0 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
            }`}>
              {(summary?.net_worth ?? 0) >= 0 ? "Musbat balans" : "Kredit yuki"}
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight">
              {summary ? `${summary.net_worth.toLocaleString()} so'm` : `${allTimeBalance.toLocaleString()} so'm`}
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Aktivlar (kartalar/naqd) minus barcha kredit va majburiyatlar
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/60 text-xs">
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-emerald-400 block font-medium flex items-center gap-1">
                💰 Jami pullar (Aktivlar)
              </span>
              <span className="font-bold text-sm text-white">
                +{summary ? summary.total_assets.toLocaleString() : "0"} so'm
              </span>
            </div>
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-rose-400 block font-medium flex items-center gap-1">
                💳 Jami qarzlar (Kreditlar)
              </span>
              <span className="font-bold text-sm text-white">
                -{summary ? summary.total_liabilities.toLocaleString() : "0"} so'm
              </span>
            </div>
          </div>
        </div>

        {/* 2. YAQINLASHIB KELAYOTGAN TO'LOVLAR (SMART PIPELINE) */}
        {summary && summary.upcoming_payments && summary.upcoming_payments.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock size={15} className="text-blue-600" />
                <h3 className="font-bold text-xs text-gray-900">
                  To'lovlar taqvimi ({summary.upcoming_payments.length})
                </h3>
              </div>
              <Link href="/debts" className="text-[11px] font-semibold text-blue-600 flex items-center gap-0.5">
                <span>Taqvim</span>
                <ArrowRight size={12} />
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              {summary.upcoming_payments.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-100 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${
                      item.is_credit_card ? "bg-indigo-50 text-indigo-600" : "bg-blue-50 text-blue-600"
                    }`}>
                      {item.is_credit_card ? <CreditCard size={15} /> : <Calendar size={15} />}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-[11px] leading-tight">
                        {item.person_name}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {item.is_credit_card ? "Grace period to'lovi" : "Oylik kredit to'lovi"}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-gray-900 text-xs">
                      {item.payment_amount.toLocaleString()} so'm
                    </p>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${
                      item.days_left <= 3
                        ? "bg-rose-100 text-rose-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {item.days_left <= 0 ? "Bugun to'lov!" : `${item.days_left} kun qoldi`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. MENING HISOB VA KREDIT KARTALARIM (WALLETS & CARDS) */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wallet size={15} className="text-gray-700" />
              <h3 className="font-bold text-xs text-gray-900">Hisoblar va Kartalar</h3>
            </div>
            <button
              onClick={() => setIsAddAccountModalOpen(true)}
              className="text-[11px] font-semibold text-blue-600 flex items-center gap-1 active:scale-95 transition"
            >
              <Plus size={13} /> Yangi hisob
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {summary?.accounts && summary.accounts.length > 0 ? (
              summary.accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col justify-between gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-800 line-clamp-1">
                      {acc.name}
                    </span>
                    {acc.type === "CREDIT_CARD" ? (
                      <CreditCard size={13} className="text-indigo-600 shrink-0" />
                    ) : (
                      <Wallet size={13} className="text-gray-400 shrink-0" />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">Balans:</span>
                    <span className="font-black text-xs text-gray-900">
                      {Number(acc.balance).toLocaleString()} so'm
                    </span>
                  </div>
                  {acc.type === "CREDIT_CARD" && acc.grace_due_day && (
                    <span className="text-[9px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5">
                      Grace: oyning {acc.grace_due_day}-kuni
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-2 text-center py-3 text-gray-400 text-xs">
                Hisoblar yuklanmoqda...
              </div>
            )}
          </div>
        </div>

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
                +{summary ? summary.total_receivables.toLocaleString() : "0"} so'm
              </span>
            </div>
            <div className="bg-rose-50/50 p-2.5 rounded-xl border border-rose-100/70">
              <span className="text-[10px] text-rose-700 block font-medium">Mening qarzlarim</span>
              <span className="font-bold text-rose-600">
                -{summary ? summary.total_liabilities.toLocaleString() : "0"} so'm
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

      {/* YANGI HISOB / KREDIT KARTA QO'SHISH MODAL OYNASI */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900">Yangi hisob yoki karta qo'shish</h3>
              <button
                onClick={() => setIsAddAccountModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Hisob turi
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAccType("DEBIT_CARD")}
                    className={`py-2 px-1 rounded-xl text-center font-medium transition ${
                      accType === "DEBIT_CARD"
                        ? "bg-blue-600 text-white shadow-xs font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Debet karta
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccType("CREDIT_CARD")}
                    className={`py-2 px-1 rounded-xl text-center font-medium transition ${
                      accType === "CREDIT_CARD"
                        ? "bg-indigo-600 text-white shadow-xs font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Kredit karta
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccType("CASH")}
                    className={`py-2 px-1 rounded-xl text-center font-medium transition ${
                      accType === "CASH"
                        ? "bg-emerald-600 text-white shadow-xs font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Naqd pul
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Hisob / Karta nomi
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    accType === "CREDIT_CARD"
                      ? "Masalan: Anorbank Kredit Karta"
                      : accType === "CASH"
                      ? "Masalan: Hamyondagi naqd"
                      : "Masalan: Uzcard Asosiy"
                  }
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500"
                />
              </div>

              {accType === "CREDIT_CARD" ? (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      Kredit kartasi umumiy limiti (so'm)
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="Masalan: 10000000"
                      value={accLimit}
                      onChange={(e) => setAccLimit(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                        Hozirgi mavjud qoldiq
                      </label>
                      <input
                        type="number"
                        placeholder="Masalan: 8000000"
                        value={accBalance}
                        onChange={(e) => setAccBalance(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                        Grace period to'lov kuni
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="Masalan: 20"
                        value={accGraceDueDay}
                        onChange={(e) => setAccGraceDueDay(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Joriy balans (so'm)
                  </label>
                  <input
                    type="number"
                    placeholder="Masalan: 1500000"
                    value={accBalance}
                    onChange={(e) => setAccBalance(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-semibold"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submittingAcc}
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
              >
                {submittingAcc ? "Saqlanmoqda..." : "Hisobni saqlash"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
