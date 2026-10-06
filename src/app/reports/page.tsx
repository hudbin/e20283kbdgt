"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, FileText } from "lucide-react";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function ReportsPage() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"all" | "month" | "year">("month");

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const u = window.Telegram.WebApp.initDataUnsafe.user;
      setUser(u);
      loadData(u.id);
    } else {
      loadData(123456789);
    }
  }, []);

  const loadData = async (telegramId: number) => {
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

  const filteredTransactions = transactions.filter((t) => {
    if (period === "all") return true;
    const date = new Date(t.date);
    const now = new Date();
    if (period === "month") {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    if (period === "year") {
      return date.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Shaxsiy Budjet Hisoboti", 14, 15);
    doc.setFontSize(10);
    doc.text(`Davr: ${period === "month" ? "Joriy oy" : period === "year" ? "Joriy yil" : "Barchasi"}`, 14, 22);

    const tableRows = filteredTransactions.map((t, idx) => [
      idx + 1,
      new Date(t.date).toLocaleDateString("uz-UZ"),
      t.type === "INCOME" ? "Kirim" : "Chiqim",
      t.categories?.name || "-",
      t.description || "-",
      `${Number(t.amount).toLocaleString()} so'm`
    ]);

    autoTable(doc, {
      head: [["#", "Sana", "Turi", "Kategoriya", "Izoh", "Summa"]],
      body: tableRows,
      startY: 28,
    });

    doc.save(`budget_report_${period}.pdf`);
  };

  const exportExcel = () => {
    const dataToExport = filteredTransactions.map((t, idx) => ({
      "№": idx + 1,
      "Sana": new Date(t.date).toLocaleDateString("uz-UZ"),
      "Turi": t.type === "INCOME" ? "Kirim" : "Chiqim",
      "Kategoriya": t.categories?.name || "",
      "Izoh": t.description || "",
      "Summa (so'm)": Number(t.amount)
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Hisobot");
    XLSX.writeFile(workbook, `budget_report_${period}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-4">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="p-2 bg-white rounded-xl shadow-sm text-gray-700">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Hisobotlar</h1>
      </header>

      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <button
          onClick={() => setPeriod("month")}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
            period === "month" ? "bg-gray-900 text-white" : "text-gray-500"
          }`}
        >
          Oylik
        </button>
        <button
          onClick={() => setPeriod("year")}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
            period === "year" ? "bg-gray-900 text-white" : "text-gray-500"
          }`}
        >
          Yillik
        </button>
        <button
          onClick={() => setPeriod("all")}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
            period === "all" ? "bg-gray-900 text-white" : "text-gray-500"
          }`}
        >
          Hammasi
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={exportPDF}
          disabled={filteredTransactions.length === 0}
          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center gap-2 hover:bg-gray-50 active:scale-95 transition"
        >
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <FileText size={24} />
          </div>
          <span className="font-semibold text-xs text-gray-800">PDF yuklab olish</span>
        </button>

        <button
          onClick={exportExcel}
          disabled={filteredTransactions.length === 0}
          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center gap-2 hover:bg-gray-50 active:scale-95 transition"
        >
          <div className="p-3 bg-green-50 text-green-600 rounded-xl">
            <FileSpreadsheet size={24} />
          </div>
          <span className="font-semibold text-xs text-gray-800">Excel (XLSX) olish</span>
        </button>
      </div>

      <div className="flex-1">
        <h3 className="font-bold text-sm text-gray-700 mb-3">
          Tanlangan davrdagi amaliyotlar ({filteredTransactions.length} ta)
        </h3>
        {loading ? (
          <p className="text-center text-xs text-gray-400 py-6">Yuklanmoqda...</p>
        ) : filteredTransactions.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">Ushbu davrda ma'lumotlar yo'q</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredTransactions.map((t) => (
              <div
                key={t.id}
                className="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm text-xs"
              >
                <div>
                  <span className="font-medium text-gray-800">
                    {t.categories?.name || t.description || (t.type === "INCOME" ? "Kirim" : "Chiqim")}
                  </span>
                  <span className="text-gray-400 block text-[10px]">
                    {new Date(t.date).toLocaleDateString("uz-UZ")}
                  </span>
                </div>
                <span
                  className={`font-bold ${
                    t.type === "INCOME" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {t.type === "INCOME" ? "+" : "-"}
                  {Number(t.amount).toLocaleString()} so'm
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
