"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";

export default function AddExpense() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const u = window.Telegram.WebApp.initDataUnsafe.user;
      setUser(u);
      loadCategories(u.id);
    } else {
      loadCategories(123456789);
    }
  }, []);

  const loadCategories = async (telegramId: number) => {
    try {
      const res = await fetch(`/api/categories?telegram_id=${telegramId}&type=EXPENSE`);
      const data = await res.json();
      if (data.categories) {
        setCategories(data.categories);
        if (data.categories.length > 0) setCategoryId(data.categories[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: user?.id || 123456789,
          name: newCatName.trim(),
          type: "EXPENSE"
        })
      });
      const data = await res.json();
      if (data.category) {
        setCategories([...categories, data.category]);
        setCategoryId(data.category.id);
        setNewCatName("");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    try {
      setLoading(true);
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: user?.id || 123456789,
          amount: Number(amount),
          type: "EXPENSE",
          category_id: categoryId || null,
          description: description
        })
      });

      if (res.ok) {
        router.push("/");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-4">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="p-2 bg-white rounded-xl shadow-sm text-gray-700">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Chiqim qo'shish</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500">SUMMA (SO'M)</label>
          <input
            type="number"
            placeholder="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-3xl font-extrabold text-red-600 outline-none w-full bg-transparent"
          />
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3">
          <label className="text-xs font-semibold text-gray-500">KATEGORIYA</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                  categoryId === c.id
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
            <input
              type="text"
              placeholder="+ Yangi kategoriya (masalan: Transport)..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="flex-1 text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="px-3 py-2 bg-gray-800 text-white text-xs font-medium rounded-xl"
            >
              Qo'shish
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500">IZOH (IXTIYORIY)</label>
          <input
            type="text"
            placeholder="Masalan: Yandex taksi, Oziq-ovqat..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm outline-none w-full bg-transparent text-gray-800"
          />
        </div>

        <div className="mt-auto pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl shadow-sm flex items-center justify-center gap-2 active:scale-95 transition"
          >
            <Check size={20} />
            {loading ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </form>
    </div>
  );
}
