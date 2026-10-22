"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowLeftRight,
  Search,
  Calendar,
  Filter,
  RefreshCw,
  Trash2,
} from "lucide-react";

interface Transaction {
  id: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  currency?: string;
  exchange_rate?: number;
  description: string;
  date: string;
  categories?: { name: string } | null;
  accounts?: { name: string; type: string; color?: string } | null;
  to_accounts?: { name: string; type: string; color?: string } | null;
}

type PeriodType = "all" | "today" | "week" | "month" | "custom";
type FilterType = "ALL" | "INCOME" | "EXPENSE" | "TRANSFER";

export default function AllTransactionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [period, setPeriod] = useState<PeriodType>("all");
  const [typeFilter, setTypeFilter] = useState<FilterType>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [mounted, setMounted] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    let cleanupBackButton: (() => void) | null = null;

    if (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

      if (tg.BackButton) {
        tg.BackButton.show();
        const handleBack = () => {
          router.push("/");
        };
        tg.BackButton.onClick(handleBack);
        cleanupBackButton = () => {
          tg.BackButton?.offClick(handleBack);
          tg.BackButton?.hide();
        };
      }

      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
        loadTransactions(tg.initDataUnsafe.user.id);
      } else {
        loadTransactions(123456789);
      }
    } else {
      loadTransactions(123456789);
    }

    return () => {
      if (cleanupBackButton) {
        cleanupBackButton();
      }
    };
  }, [router]);

  const loadTransactions = async (telegramId: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions?telegram_id=${telegramId}`);
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (e) {
      console.error("Xatolik:", e);
    } finally {
      setLoading(false);
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

  const isWithinSelectedPeriod = (dateStr: string) => {
    if (!mounted || period === "all") return true;
    const date = new Date(dateStr);
    const now = new Date();

    if (period === "today") {
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    }

    if (period === "week") {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return date >= monday && date <= sunday;
    }

    if (period === "month") {
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    }

    if (period === "custom") {
      const start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(0);
      const end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : new Date(8640000000000000);
      return date >= start && date <= end;
    }

    return true;
  };

  const filteredTransactions = transactions.filter((t) => {
    // Type filter
    if (typeFilter !== "ALL" && t.type !== typeFilter) {
      return false;
    }

    // Period filter
    if (!isWithinSelectedPeriod(t.date)) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const title = (t.categories?.name || "").toLowerCase();
      const desc = (t.description || "").toLowerCase();
      if (!title.includes(query) && !desc.includes(query)) {
        return false;
      }
    }

    return true;
  });

  const totalIncome = filteredTransactions
    .filter((t) => t.type === "INCOME")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);

  const totalExpense = filteredTransactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 pb-10">
      {/* Header */}
      <header className="bg-white p-4 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 rounded-xl transition"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">Barcha tranzaksiyalar</h1>
            <p className="text-xs text-gray-400">
              {filteredTransactions.length} ta amaliyot topildi
            </p>
          </div>
        </div>

        <button
          onClick={() => loadTransactions(user?.id || 123456789)}
          className="p-2 text-gray-500 hover:text-gray-800 transition active:scale-95"
          title="Yangilash"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4">
        {/* Search input */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Qidirish (kategoriya yoki izoh)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs outline-none focus:border-blue-500 transition shadow-sm"
          />
        </div>

        {/* Type Toggle: Hammasi | Kirim | Chiqim | O'tkazma */}
        <div className="flex bg-gray-200/80 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setTypeFilter("ALL")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              typeFilter === "ALL"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Hammasi
          </button>
          <button
            onClick={() => setTypeFilter("EXPENSE")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              typeFilter === "EXPENSE"
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Chiqim
          </button>
          <button
            onClick={() => setTypeFilter("INCOME")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              typeFilter === "INCOME"
                ? "bg-green-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Kirim
          </button>
          <button
            onClick={() => setTypeFilter("TRANSFER")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              typeFilter === "TRANSFER"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            O'tkazma
          </button>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 text-xs font-medium">
          <button
            onClick={() => setPeriod("all")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              period === "all"
                ? "bg-gray-900 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Barchasi
          </button>
          <button
            onClick={() => setPeriod("today")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              period === "today"
                ? "bg-gray-900 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Bugun
          </button>
          <button
            onClick={() => setPeriod("week")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              period === "week"
                ? "bg-gray-900 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Hafta
          </button>
          <button
            onClick={() => setPeriod("month")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              period === "month"
                ? "bg-gray-900 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Oy
          </button>
          <button
            onClick={() => setPeriod("custom")}
            className={`flex-1 py-1.5 rounded-lg transition ${
              period === "custom"
                ? "bg-gray-900 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Boshqa
          </button>
        </div>

        {/* Custom date range picker if 'custom' is active */}
        {period === "custom" && (
          <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1.5">
              <Calendar size={13} /> Sana oralig'ini tanlang
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Boshlanish</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Tugash</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Summary Card for selected filter */}
        <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-400 block text-[11px]">Jami kirim</span>
            <span className="font-bold text-green-600">+{totalIncome.toLocaleString()} so'm</span>
          </div>
          <div className="border-l border-gray-100 pl-3">
            <span className="text-gray-400 block text-[11px]">Jami chiqim</span>
            <span className="font-bold text-red-600">-{totalExpense.toLocaleString()} so'm</span>
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex flex-col gap-2.5">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-xs">Yuklanmoqda...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl text-center border border-gray-100 shadow-sm mt-2">
              <Filter className="mx-auto text-gray-300 mb-2" size={32} />
              <p className="text-gray-700 text-xs font-semibold">Tranzaksiyalar topilmadi</p>
              <p className="text-gray-400 text-[11px] mt-1">
                Tanlangan filtr yoki qidiruv bo'yicha amaliyotlar mavjud emas.
              </p>
            </div>
          ) : (
            filteredTransactions.map((item) => (
              <div
                key={item.id}
                className="bg-white p-3.5 rounded-xl flex items-center justify-between shadow-sm border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl ${
                      item.type === "INCOME"
                        ? "bg-green-50 text-green-600"
                        : item.type === "TRANSFER"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {item.type === "INCOME" ? (
                      <ArrowDownIcon size={18} />
                    ) : item.type === "TRANSFER" ? (
                      <ArrowLeftRight size={18} />
                    ) : (
                      <ArrowUpIcon size={18} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-xs text-gray-900 leading-tight">
                        {item.type === "TRANSFER"
                          ? `O'tkazma: ${item.accounts?.name || 'Hisob'} ➡️ ${item.to_accounts?.name || 'Hisob'}`
                          : item.categories?.name || item.description || (item.type === "INCOME" ? "Kirim" : "Chiqim")}
                      </p>
                      {item.type !== "TRANSFER" && item.accounts?.name && (
                        <span className="text-[9px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          💳 {item.accounts.name}
                        </span>
                      )}
                    </div>
                    {item.description && item.type !== "TRANSFER" && item.categories?.name && (
                      <p className="text-[11px] text-gray-500 line-clamp-1">{item.description}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(item.date).toLocaleDateString("uz-UZ", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p
                      className={`font-bold text-xs ${
                        item.type === "INCOME"
                          ? "text-green-600"
                          : item.type === "TRANSFER"
                          ? "text-blue-600"
                          : "text-red-600"
                      }`}
                    >
                      {item.type === "INCOME" ? "+" : item.type === "TRANSFER" ? "⇄ " : "-"}
                      {item.currency === "USD"
                        ? `$${Number(item.amount).toLocaleString()}`
                        : `${Number(item.amount).toLocaleString()} so'm`}
                    </p>
                    {item.currency && item.currency !== "UZS" && item.exchange_rate && (
                      <p className="text-[9px] text-gray-400">
                        ≈{Math.round(item.amount * item.exchange_rate).toLocaleString()} so'm
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteTransaction(item.id)}
                    disabled={deletingId === item.id}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition active:scale-90"
                    title="Tranzaksiyani o'chirish"
                  >
                    {deletingId === item.id ? (
                      <RefreshCw size={14} className="animate-spin text-red-500" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
