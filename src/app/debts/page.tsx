"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  HandCoins,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Calendar,
  X,
  Trash2,
  AlertCircle
} from "lucide-react";

interface Debt {
  id: string;
  telegram_id: number;
  person_name: string;
  type: "LENT" | "BORROWED" | "LOAN";
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: "ACTIVE" | "PAID";
  description: string;
  created_at: string;
}

type TabType = "ALL" | "LENT" | "BORROWED" | "LOAN" | "PAID";

export default function DebtsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("ALL");

  // Yangi qarz modal holati
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newType, setNewType] = useState<"LENT" | "BORROWED" | "LOAN">("LENT");
  const [newPerson, setNewPerson] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAffectWallet, setNewAffectWallet] = useState(true);
  const [submittingNew, setSubmittingNew] = useState(false);

  // To'lov kiritish modal holati
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [submittingPay, setSubmittingPay] = useState(false);

  useEffect(() => {
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
        loadDebts(tg.initDataUnsafe.user.id);
      } else {
        loadDebts(123456789);
      }
    } else {
      loadDebts(123456789);
    }

    return () => {
      if (cleanupBackButton) {
        cleanupBackButton();
      }
    };
  }, [router]);

  const loadDebts = async (telegramId: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/debts?telegram_id=${telegramId}`);
      const data = await res.json();
      if (data.debts) {
        setDebts(data.debts);
      }
    } catch (e) {
      console.error("Qarzlarni yuklashda xatolik:", e);
    } finally {
      setLoading(false);
    }
  };

  // Yangi qarz/kredit qo'shish
  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerson.trim() || !newAmount || Number(newAmount) <= 0) return;

    try {
      setSubmittingNew(true);
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: user?.id || 123456789,
          person_name: newPerson.trim(),
          type: newType,
          amount: Number(newAmount),
          due_date: newDueDate || null,
          description: newDesc.trim(),
          affect_wallet: newAffectWallet
        })
      });

      const data = await res.json();
      if (data.debt) {
        setDebts([data.debt, ...debts]);
        setIsNewModalOpen(false);
        setNewPerson("");
        setNewAmount("");
        setNewDueDate("");
        setNewDesc("");
      }
    } catch (err) {
      console.error("Qarz qo'shishda xatolik:", err);
    } finally {
      setSubmittingNew(false);
    }
  };

  // To'lov kiritish (qisman yoki to'liq)
  const handleRepayDebt = async (markAsPaid = false) => {
    if (!selectedDebt) return;
    const amountVal = markAsPaid
      ? Number(selectedDebt.amount) - Number(selectedDebt.paid_amount)
      : Number(payAmount);

    if (amountVal <= 0) return;

    try {
      setSubmittingPay(true);
      const res = await fetch("/api/debts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedDebt.id,
          telegram_id: user?.id || 123456789,
          amount: amountVal,
          note: payNote.trim(),
          mark_as_paid: markAsPaid
        })
      });

      const data = await res.json();
      if (data.debt) {
        setDebts(debts.map((d) => (d.id === data.debt.id ? data.debt : d)));
        setIsPayModalOpen(false);
        setSelectedDebt(null);
        setPayAmount("");
        setPayNote("");
      }
    } catch (err) {
      console.error("To'lov kiritishda xatolik:", err);
    } finally {
      setSubmittingPay(false);
    }
  };

  // Qarzni o'chirish
  const handleDeleteDebt = async (debtId: string) => {
    if (!confirm("Haqiqatan ham ushbu yozuvni o'chirmoqchimisiz?")) return;

    try {
      const res = await fetch(
        `/api/debts?id=${debtId}&telegram_id=${user?.id || 123456789}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setDebts(debts.filter((d) => d.id !== debtId));
      }
    } catch (err) {
      console.error("O'chirishda xatolik:", err);
    }
  };

  // Balans hisob-kitoblari (faqat ACTIVE qarzlar bo'yicha)
  const activeDebts = debts.filter((d) => d.status === "ACTIVE");

  // Menga qaytishi kerak (LENT)
  const totalLentRemaining = activeDebts
    .filter((d) => d.type === "LENT")
    .reduce((acc, curr) => acc + (Number(curr.amount) - Number(curr.paid_amount)), 0);

  // Mening qarzlarim & Kreditlarim (BORROWED + LOAN)
  const totalBorrowedRemaining = activeDebts
    .filter((d) => d.type === "BORROWED" || d.type === "LOAN")
    .reduce((acc, curr) => acc + (Number(curr.amount) - Number(curr.paid_amount)), 0);

  // Tab bo'yicha filtrlash
  const filteredDebts = debts.filter((d) => {
    if (activeTab === "ALL") return d.status === "ACTIVE";
    if (activeTab === "PAID") return d.status === "PAID";
    return d.status === "ACTIVE" && d.type === activeTab;
  });

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 pb-12">
      {/* Header */}
      <header className="bg-white p-4 shadow-xs border-b border-gray-100 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 rounded-xl transition"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">Qarzlar va Kreditlar</h1>
            <p className="text-xs text-gray-400">
              {activeDebts.length} ta faol majburiyat
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDebts(user?.id || 123456789)}
            className="p-2 text-gray-500 hover:text-gray-800 transition active:scale-95"
            title="Yangilash"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
          >
            <Plus size={16} /> Qo'shish
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4">
        {/* Umumiy Balans Kartasi */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <HandCoins size={16} className="text-blue-600" />
            <span>Qarzlar balansi</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Menga qaytishi kerak */}
            <div className="bg-green-50/70 p-3 rounded-xl border border-green-100">
              <span className="text-[11px] text-green-700 font-medium flex items-center gap-1">
                <ArrowUpRight size={13} /> Menga berilishi kerak
              </span>
              <p className="font-bold text-sm text-green-600 mt-1">
                +{totalLentRemaining.toLocaleString()} so'm
              </p>
            </div>

            {/* Mening qarzlarim & Kreditlar */}
            <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-100">
              <span className="text-[11px] text-rose-700 font-medium flex items-center gap-1">
                <ArrowDownLeft size={13} /> Mening qarzlarim
              </span>
              <p className="font-bold text-sm text-rose-600 mt-1">
                -{totalBorrowedRemaining.toLocaleString()} so'm
              </p>
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex bg-white p-1 rounded-xl shadow-xs border border-gray-100 text-xs font-medium overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`flex-1 py-1.5 px-2.5 rounded-lg whitespace-nowrap transition ${
              activeTab === "ALL"
                ? "bg-gray-900 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Faollar ({activeDebts.length})
          </button>
          <button
            onClick={() => setActiveTab("LENT")}
            className={`flex-1 py-1.5 px-2.5 rounded-lg whitespace-nowrap transition ${
              activeTab === "LENT"
                ? "bg-green-600 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Bergan qarzlarim
          </button>
          <button
            onClick={() => setActiveTab("BORROWED")}
            className={`flex-1 py-1.5 px-2.5 rounded-lg whitespace-nowrap transition ${
              activeTab === "BORROWED"
                ? "bg-amber-600 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Olgan qarzlarim
          </button>
          <button
            onClick={() => setActiveTab("LOAN")}
            className={`flex-1 py-1.5 px-2.5 rounded-lg whitespace-nowrap transition ${
              activeTab === "LOAN"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Kreditlar
          </button>
          <button
            onClick={() => setActiveTab("PAID")}
            className={`flex-1 py-1.5 px-2.5 rounded-lg whitespace-nowrap transition ${
              activeTab === "PAID"
                ? "bg-gray-600 text-white shadow-xs font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Yopilganlar
          </button>
        </div>

        {/* Qarzlar Ro'yxati */}
        <div className="flex flex-col gap-2.5">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-xs">Yuklanmoqda...</div>
          ) : filteredDebts.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl text-center border border-gray-100 shadow-xs mt-2">
              <HandCoins className="mx-auto text-gray-300 mb-2" size={36} />
              <p className="text-gray-700 text-xs font-semibold">Qarzlar mavjud emas</p>
              <p className="text-gray-400 text-[11px] mt-1">
                Ushbu toifada hozircha hech qanday yozuv kiritilmagan.
              </p>
            </div>
          ) : (
            filteredDebts.map((item) => {
              const remaining = Number(item.amount) - Number(item.paid_amount);
              const progressPercent = Math.min(
                100,
                Math.round((Number(item.paid_amount) / Number(item.amount)) * 100)
              );

              const isLent = item.type === "LENT";
              const isLoan = item.type === "LOAN";
              const isPaid = item.status === "PAID";

              return (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-2xl shadow-xs border border-gray-100 flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2.5 rounded-xl ${
                          isPaid
                            ? "bg-gray-100 text-gray-600"
                            : isLent
                            ? "bg-green-50 text-green-600"
                            : isLoan
                            ? "bg-blue-50 text-blue-600"
                            : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {isPaid ? (
                          <CheckCircle2 size={18} />
                        ) : isLoan ? (
                          <Landmark size={18} />
                        ) : isLent ? (
                          <ArrowUpRight size={18} />
                        ) : (
                          <ArrowDownLeft size={18} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-xs text-gray-900 leading-tight">
                            {item.person_name}
                          </h4>
                          <span
                            className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${
                              isPaid
                                ? "bg-gray-100 text-gray-500"
                                : isLent
                                ? "bg-green-100 text-green-700"
                                : isLoan
                                ? "bg-blue-100 text-blue-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {isPaid
                              ? "Yopilgan"
                              : isLent
                              ? "Qarz berilgan"
                              : isLoan
                              ? "Bank krediti"
                              : "Qarz olingan"}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                            {item.description}
                          </p>
                        )}
                        {item.due_date && (
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Calendar size={11} /> Qaytarish muddati:{" "}
                            {new Date(item.due_date).toLocaleDateString("uz-UZ")}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteDebt(item.id)}
                      className="text-gray-300 hover:text-red-500 transition p-1"
                      title="O'chirish"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Summa va progress */}
                  <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">Jami summa:</span>
                      <span className="font-semibold text-gray-800">
                        {Number(item.amount).toLocaleString()} so'm
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">To'langan:</span>
                      <span className="font-semibold text-green-600">
                        {Number(item.paid_amount).toLocaleString()} so'm ({progressPercent}%)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden mt-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isPaid ? "bg-gray-400" : isLent ? "bg-green-500" : "bg-blue-600"
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    {!isPaid && (
                      <div className="flex items-center justify-between pt-1 border-t border-gray-200/60 mt-0.5">
                        <span className="text-[11px] font-medium text-gray-500">Qoldiq:</span>
                        <span
                          className={`font-bold ${
                            isLent ? "text-green-600" : "text-rose-600"
                          }`}
                        >
                          {remaining.toLocaleString()} so'm
                        </span>
                      </div>
                    )}
                  </div>

                  {/* To'lov kiritish tugmasi */}
                  {!isPaid && (
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => {
                          setSelectedDebt(item);
                          setPayAmount("");
                          setIsPayModalOpen(true);
                        }}
                        className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-2 px-3 rounded-xl text-xs font-semibold shadow-xs active:scale-98 transition flex items-center justify-center gap-1.5"
                      >
                        <HandCoins size={14} />
                        <span>To'lov kiritish</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDebt(item);
                          handleRepayDebt(true);
                        }}
                        className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 py-2 px-3 rounded-xl text-xs font-semibold active:scale-98 transition"
                      >
                        To'liq yopish
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* YANGI QARZ/KREDIT QO'SHISH MODAL OYNASI */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900">Yangi qarz yoki kredit kiritish</h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDebt} className="flex flex-col gap-3 text-xs">
              {/* Type tanlash */}
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Amaliyot turi
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewType("LENT")}
                    className={`py-2 px-1 rounded-xl text-center font-medium transition ${
                      newType === "LENT"
                        ? "bg-green-600 text-white shadow-xs font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Qarz berdim
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType("BORROWED")}
                    className={`py-2 px-1 rounded-xl text-center font-medium transition ${
                      newType === "BORROWED"
                        ? "bg-rose-600 text-white shadow-xs font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Qarz oldim
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType("LOAN")}
                    className={`py-2 px-1 rounded-xl text-center font-medium transition ${
                      newType === "LOAN"
                        ? "bg-blue-600 text-white shadow-xs font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Kredit
                  </button>
                </div>
              </div>

              {/* Shaxs yoki bank nomi */}
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  {newType === "LOAN" ? "Bank / Tashkilot nomi" : "Shaxsning ismi"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={newType === "LOAN" ? "Masalan: Ipoteka bank" : "Masalan: Alisher"}
                  value={newPerson}
                  onChange={(e) => setNewPerson(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* Summa */}
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Jami summa (so'm)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="Masalan: 500000"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-semibold"
                />
              </div>

              {/* Qaytarish muddati */}
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Qaytarish muddati (ixtiyoriy)
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* Izoh */}
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Izoh (ixtiyoriy)
                </label>
                <input
                  type="text"
                  placeholder="Qo'shimcha eslatma..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* Hamyonga ta'siri */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="affectWallet"
                  checked={newAffectWallet}
                  onChange={(e) => setNewAffectWallet(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="affectWallet" className="text-[11px] text-gray-600 cursor-pointer">
                  Hamyon balansi darhol o'zgarsin{" "}
                  <span className="text-gray-400">
                    ({newType === "LENT" ? "chiqim bo'ladi" : "kirim bo'ladi"})
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submittingNew}
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
              >
                {submittingNew ? "Saqlanmoqda..." : "Saqlash"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TO'LOV KIRITISH MODAL OYNASI */}
      {isPayModalOpen && selectedDebt && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-gray-900">To'lov kiritish</h3>
                <p className="text-[11px] text-gray-400">{selectedDebt.person_name}</p>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs flex justify-between items-center">
              <span className="text-gray-500">Qolgan summa:</span>
              <span className="font-bold text-gray-900">
                {(Number(selectedDebt.amount) - Number(selectedDebt.paid_amount)).toLocaleString()} so'm
              </span>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  To'lov summasi (so'm)
                </label>
                <input
                  type="number"
                  min="1"
                  max={Number(selectedDebt.amount) - Number(selectedDebt.paid_amount)}
                  placeholder="Masalan: 100000"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Izoh (ixtiyoriy)
                </label>
                <input
                  type="text"
                  placeholder="Karta orqali, naqd..."
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={submittingPay || !payAmount || Number(payAmount) <= 0}
                  onClick={() => handleRepayDebt(false)}
                  className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
                >
                  {submittingPay ? "To'lanmoqda..." : "To'lovni saqlash"}
                </button>
                <button
                  type="button"
                  disabled={submittingPay}
                  onClick={() => handleRepayDebt(true)}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
                >
                  To'liq yopish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
