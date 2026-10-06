"use client";

import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, FileTextIcon, RefreshCw } from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  description: string;
  date: string;
  categories?: { name: string } | null;
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
        fetchTransactions(tg.initDataUnsafe.user.id);
      } else {
        // Test fallback (brauzerda sinab ko'rish uchun)
        fetchTransactions(123456789);
      }
    } else {
      fetchTransactions(123456789);
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

  const totalIncome = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);

  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);

  const balance = totalIncome - totalExpense;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 pb-20">
      {/* Header */}
      <header className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold">Budjetingiz</h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => user?.id && fetchTransactions(user.id)}
            className="p-2 text-gray-500 hover:text-gray-700"
            title="Yangilash"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {user?.first_name?.[0] || "U"}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-5">
        {/* Balance Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <p className="text-gray-500 text-sm mb-1">Umumiy balans</p>
          <h2 className={`text-3xl font-extrabold ${balance >= 0 ? "text-gray-900" : "text-red-600"}`}>
            {balance.toLocaleString()} so'm
          </h2>

          <div className="grid grid-cols-2 gap-4 w-full mt-5 pt-4 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xs text-gray-400">Jami kirim</p>
              <p className="font-semibold text-green-600">+{totalIncome.toLocaleString()} so'm</p>
            </div>
            <div className="text-center border-l border-gray-100">
              <p className="text-xs text-gray-400">Jami chiqim</p>
              <p className="font-semibold text-red-600">-{totalExpense.toLocaleString()} so'm</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/income"
            className="bg-green-600 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
          >
            <div className="bg-white/20 p-2 rounded-full">
              <ArrowDownIcon size={24} />
            </div>
            <span className="font-semibold text-sm">Kirim qo'shish</span>
          </Link>
          <Link
            href="/expense"
            className="bg-red-600 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
          >
            <div className="bg-white/20 p-2 rounded-full">
              <ArrowUpIcon size={24} />
            </div>
            <span className="font-semibold text-sm">Chiqim qo'shish</span>
          </Link>
        </div>

        {/* Menu Items */}
        <div className="flex flex-col gap-3">
          <Link
            href="/reports"
            className="bg-white p-4 rounded-xl flex items-center gap-4 shadow-sm border border-gray-100 hover:bg-gray-50 transition"
          >
            <div className="bg-blue-100 text-blue-600 p-2.5 rounded-xl">
              <FileTextIcon size={20} />
            </div>
            <div className="flex-1">
              <span className="font-medium block text-sm">Hisobotlar</span>
              <span className="text-xs text-gray-400">PDF va Excel formatda yuklab olish</span>
            </div>
          </Link>
        </div>

        {/* Recent Transactions List */}
        <div className="mt-2">
          <h3 className="font-bold text-base mb-3 text-gray-700">Oxirgi amaliyotlar</h3>
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Yuklanmoqda...</div>
          ) : transactions.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl text-center border border-gray-100 shadow-sm">
              <p className="text-gray-400 text-sm">Hozircha hech qanday amaliyot yo'q.</p>
              <p className="text-gray-400 text-xs mt-1">Botga xabar yozing yoki yuqoridagi tugmalar orqali qo'shing.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {transactions.slice(0, 15).map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-3.5 rounded-xl flex items-center justify-between shadow-sm border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        item.type === "INCOME" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                      }`}
                    >
                      {item.type === "INCOME" ? <ArrowDownIcon size={18} /> : <ArrowUpIcon size={18} />}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        {item.categories?.name || item.description || (item.type === "INCOME" ? "Kirim" : "Chiqim")}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(item.date).toLocaleDateString("uz-UZ", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`font-bold text-sm ${
                      item.type === "INCOME" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {item.type === "INCOME" ? "+" : "-"}
                    {Number(item.amount).toLocaleString()} so'm
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
