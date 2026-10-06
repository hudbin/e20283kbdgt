"use client";

import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const [initDataUnsafe, setInitDataUnsafe] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      setInitDataUnsafe(tg.initDataUnsafe);
    }
  }, []);

  const user = initDataUnsafe?.user;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 pb-20">
      {/* Header */}
      <header className="bg-white p-4 shadow-sm flex items-center justify-between">
        <h1 className="text-xl font-bold">Budjetingiz</h1>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
            {user?.first_name?.[0] || "U"}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-6">
        {/* Balance Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <p className="text-gray-500 text-sm mb-1">Joriy oydagi balans</p>
          <h2 className="text-3xl font-bold">1 250 000 so'm</h2>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/income" className="bg-green-500 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform">
            <div className="bg-white/20 p-2 rounded-full">
              <ArrowDownIcon size={24} />
            </div>
            <span className="font-semibold">Kirim qoshish</span>
          </Link>
          <Link href="/expense" className="bg-red-500 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform">
            <div className="bg-white/20 p-2 rounded-full">
              <ArrowUpIcon size={24} />
            </div>
            <span className="font-semibold">Chiqim qoshish</span>
          </Link>
        </div>

        {/* Menu Items */}
        <div className="flex flex-col gap-3 mt-4">
          <Link href="/reports" className="bg-white p-4 rounded-xl flex items-center gap-4 shadow-sm border border-gray-100">
            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
              <FileTextIcon size={20} />
            </div>
            <span className="font-medium flex-1">Hisobotlar (PDF / Excel)</span>
          </Link>
        </div>

        {/* Recent Transactions List */}
        <div className="mt-4">
          <h3 className="font-semibold text-lg mb-3">Oxirgi xarajatlar</h3>
          <div className="flex flex-col gap-3">
            <div className="bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-red-100 text-red-600 p-2 rounded-lg">
                  <ArrowUpIcon size={20} />
                </div>
                <div>
                  <p className="font-medium">Oziq-ovqat</p>
                  <p className="text-xs text-gray-500">Bugun, 14:30</p>
                </div>
              </div>
              <p className="font-bold text-red-600">-50 000</p>
            </div>
            <div className="bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 text-green-600 p-2 rounded-lg">
                  <ArrowDownIcon size={20} />
                </div>
                <div>
                  <p className="font-medium">Oylik maosh</p>
                  <p className="text-xs text-gray-500">Kecha, 09:00</p>
                </div>
              </div>
              <p className="font-bold text-green-600">+1 300 000</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
