"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowLeftRight,
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
  CheckCircle2,
  Target,
  SlidersHorizontal,
  PiggyBank,
  Repeat,
  Users,
  UserCheck,
  UserPlus,
  LogOut,
  Copy,
  Check
} from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  description: string;
  date: string;
  currency?: string;
  exchange_rate?: number;
  categories?: { name: string } | null;
  accounts?: { name: string; type: string; color?: string; currency?: string } | null;
  to_accounts?: { name: string; type: string; color?: string; currency?: string } | null;
}

interface AccountItem {
  id: string;
  name: string;
  type: string;
  currency?: string;
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

interface BudgetItem {
  id: string;
  category_id: string | null;
  category_name: string;
  amount: number;
  spent: number;
  remaining: number;
  percent: number;
  status: "NORMAL" | "WARNING" | "EXCEEDED";
  period: string;
}

interface GoalItem {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  deadline?: string | null;
  color?: string;
  percent: number;
  remaining: number;
  days_left?: number | null;
  monthly_needed?: number | null;
  status: "ACTIVE" | "COMPLETED";
}

interface SubscriptionItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billing_day: number;
  period: string;
  days_left: number;
  next_billing_date: string;
  categories?: { name: string } | null;
}

interface SpaceMember {
  telegram_id: number;
  role: string;
  joined_at: string;
  name: string;
  username?: string | null;
  is_me?: boolean;
}

interface SpaceItem {
  id: string;
  name: string;
  invite_code: string;
  owner_id: number;
  my_role: string;
  members_count: number;
  members: SpaceMember[];
}

interface AnalyticsSummary {
  net_worth: number;
  net_worth_usd?: number;
  exchange_rates?: { USD: number; EUR: number; RUB: number };
  total_assets: number;
  total_liabilities: number;
  total_receivables: number;
  accounts: AccountItem[];
  upcoming_payments: UpcomingPayment[];
  credit_cards: CreditCardItem[];
  budgets?: BudgetItem[];
  goals?: GoalItem[];
  subscriptions?: SubscriptionItem[];
  total_month_expense?: number;
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
  const [accCurrency, setAccCurrency] = useState<"UZS" | "USD">("UZS");
  const [accBalance, setAccBalance] = useState("");
  const [accLimit, setAccLimit] = useState("");
  const [accGraceDueDay, setAccGraceDueDay] = useState("20");
  const [submittingAcc, setSubmittingAcc] = useState(false);

  // O'tkazma (Transfer) modal holati
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDesc, setTransferDesc] = useState("");
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // Byudjet (Budget) modal holati
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [submittingBudget, setSubmittingBudget] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; name: string }>>([]);

  // Jamg'arma Maqsadlari (Goals) modal holatlari
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrency, setGoalCurrency] = useState<"UZS" | "USD">("UZS");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [submittingGoal, setSubmittingGoal] = useState(false);

  // Maqsadga pul qo'shish (Top-up) modal
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalItem | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [submittingTopup, setSubmittingTopup] = useState(false);

  // Obuna (Subscription) modal holati
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subName, setSubName] = useState("");
  const [subAmount, setSubAmount] = useState("");
  const [subCurrency, setSubCurrency] = useState<"UZS" | "USD">("UZS");
  const [subBillingDay, setSubBillingDay] = useState("1");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [submittingSub, setSubmittingSub] = useState(false);

  // Oilaviy / Jamoaviy bo'shliqlar (Spaces) holatlari
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("personal"); // "personal" yoki space UUID
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [spaceModalTab, setSpaceModalTab] = useState<"list" | "create" | "join">("list");
  const [newSpaceName, setNewSpaceName] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [submittingSpace, setSubmittingSpace] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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

  // Telegram initData sarlavhasi bilan xavfsiz so'rov yuborish
  const getAuthHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (typeof window !== "undefined" && window.Telegram?.WebApp?.initData) {
      headers["x-telegram-init-data"] = window.Telegram.WebApp.initData;
    }
    return headers;
  };

  const loadAllData = (telegramId: number) => {
    fetchTransactions(telegramId, selectedSpaceId);
    fetchSummary(telegramId);
    fetchCategories(telegramId);
    fetchSpaces(telegramId);
  };

  const fetchSpaces = async (telegramId: number) => {
    try {
      const res = await fetch(`/api/spaces?telegram_id=${telegramId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data && data.spaces) {
        setSpaces(data.spaces);
      }
    } catch (e) {
      console.error("Spaces yuklashda xatolik:", e);
    }
  };

  const fetchCategories = async (telegramId: number) => {
    try {
      const res = await fetch(`/api/categories?telegram_id=${telegramId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data && data.categories) {
        setAvailableCategories(data.categories.filter((c: any) => c.type === "EXPENSE"));
      }
    } catch (_) {}
  };

  const fetchSummary = async (telegramId: number) => {
    try {
      const res = await fetch(`/api/analytics/summary?telegram_id=${telegramId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data && !data.error) {
        setSummary(data);
      }
    } catch (e) {
      console.error("Summary yuklashda xatolik:", e);
    }
  };

  const fetchTransactions = async (telegramId: number, spaceId: string = selectedSpaceId) => {
    try {
      setLoading(true);
      const url = spaceId && spaceId !== "personal"
        ? `/api/transactions?telegram_id=${telegramId}&space_id=${spaceId}`
        : `/api/transactions?telegram_id=${telegramId}`;
      const res = await fetch(url, {
        headers: getAuthHeaders()
      });
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
          currency: accCurrency,
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

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId || !transferAmount) return;
    if (transferFromId === transferToId) {
      alert("Chiqim va kirim hisoblari bir xil bo'lishi mumkin emas!");
      return;
    }

    try {
      setSubmittingTransfer(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: telegramId,
          type: "TRANSFER",
          account_id: transferFromId,
          to_account_id: transferToId,
          amount: Number(transferAmount),
          description: transferDesc.trim() || "Hisoblararo o'tkazma"
        })
      });
      const data = await res.json();
      if (data.transaction) {
        setIsTransferModalOpen(false);
        setTransferAmount("");
        setTransferDesc("");
        loadAllData(telegramId);
        if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } else {
        alert(data.error || "O'tkazishda xatolik yuz berdi");
      }
    } catch (err) {
      console.error("O'tkazmada xatolik:", err);
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetAmount) return;

    try {
      setSubmittingBudget(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: telegramId,
          category_id: budgetCategoryId || null,
          amount: Number(budgetAmount),
          period: "MONTHLY"
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsBudgetModalOpen(false);
        setBudgetAmount("");
        setBudgetCategoryId("");
        fetchSummary(telegramId);
        if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } else {
        alert(data.error || "Byudjet saqlashda xatolik");
      }
    } catch (err) {
      console.error("Byudjet saqlashda xatolik:", err);
    } finally {
      setSubmittingBudget(false);
    }
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (!confirm("Ushbu byudjet limitini o'chirmoqchimisiz?")) return;
    try {
      const telegramId = user?.id || 123456789;
      const res = await fetch(`/api/budgets?id=${budgetId}&telegram_id=${telegramId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        fetchSummary(telegramId);
      }
    } catch (err) {
      console.error("Byudjetni o'chirishda xatolik:", err);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim() || !goalTarget) return;

    try {
      setSubmittingGoal(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: telegramId,
          name: goalName.trim(),
          target_amount: Number(goalTarget),
          currency: goalCurrency,
          deadline: goalDeadline ? new Date(goalDeadline).toISOString() : null
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsGoalModalOpen(false);
        setGoalName("");
        setGoalTarget("");
        setGoalDeadline("");
        fetchSummary(telegramId);
        if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } else {
        alert(data.error || "Maqsad yaratishda xatolik");
      }
    } catch (err) {
      console.error("Maqsad yaratishda xatolik:", err);
    } finally {
      setSubmittingGoal(false);
    }
  };

  const handleDepositGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal || !topupAmount) return;

    try {
      setSubmittingTopup(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: telegramId,
          goal_id: selectedGoal.id,
          action: "DEPOSIT",
          amount: Number(topupAmount)
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsTopupModalOpen(false);
        setSelectedGoal(null);
        setTopupAmount("");
        fetchSummary(telegramId);
        if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } else {
        alert(data.error || "Mablag' qo'shishda xatolik");
      }
    } catch (err) {
      console.error("Mablag' qo'shishda xatolik:", err);
    } finally {
      setSubmittingTopup(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm("Ushbu maqsadni o'chirmoqchimisiz?")) return;
    try {
      const telegramId = user?.id || 123456789;
      const res = await fetch(`/api/goals?id=${goalId}&telegram_id=${telegramId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        fetchSummary(telegramId);
      }
    } catch (err) {
      console.error("Maqsadni o'chirishda xatolik:", err);
    }
  };

  const handleCreateSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !subAmount || !subBillingDay) return;

    try {
      setSubmittingSub(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: telegramId,
          name: subName.trim(),
          amount: Number(subAmount),
          currency: subCurrency,
          billing_day: Number(subBillingDay),
          category_id: subCategoryId || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsSubModalOpen(false);
        setSubName("");
        setSubAmount("");
        setSubBillingDay("1");
        setSubCategoryId("");
        fetchSummary(telegramId);
        if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } else {
        alert(data.error || "Obuna qo'shishda xatolik");
      }
    } catch (err) {
      console.error("Obuna qo'shishda xatolik:", err);
    } finally {
      setSubmittingSub(false);
    }
  };

  const handleDeleteSub = async (subId: string) => {
    if (!confirm("Ushbu obunani o'chirmoqchimisiz?")) return;
    try {
      const telegramId = user?.id || 123456789;
      const res = await fetch(`/api/subscriptions?id=${subId}&telegram_id=${telegramId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        fetchSummary(telegramId);
      }
    } catch (err) {
      console.error("Obunani o'chirishda xatolik:", err);
    }
  };

  // Oilaviy guruh boshqaruvi funksiyalari
  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpaceName.trim()) return;

    try {
      setSubmittingSpace(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          telegram_id: telegramId,
          action: "CREATE",
          name: newSpaceName.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.space) {
        setNewSpaceName("");
        setSpaceModalTab("list");
        fetchSpaces(telegramId);
        setSelectedSpaceId(data.space.id);
        fetchTransactions(telegramId, data.space.id);
        if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } else {
        alert(data.error || "Guruh yaratishda xatolik");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingSpace(false);
    }
  };

  const handleJoinSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInviteCode.trim()) return;

    try {
      setSubmittingSpace(true);
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          telegram_id: telegramId,
          action: "JOIN",
          invite_code: joinInviteCode.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.space) {
        setJoinInviteCode("");
        setSpaceModalTab("list");
        fetchSpaces(telegramId);
        setSelectedSpaceId(data.space.id);
        fetchTransactions(telegramId, data.space.id);
        if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } else {
        alert(data.error || "Guruhga qo'shilishda xatolik");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingSpace(false);
    }
  };

  const handleLeaveSpace = async (spaceId: string) => {
    if (!confirm("Haqiqatan ham ushbu oilaviy guruhdan chiqmoqchimisiz?")) return;
    try {
      const telegramId = user?.id || 123456789;
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          telegram_id: telegramId,
          action: "LEAVE",
          space_id: spaceId
        })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedSpaceId("personal");
        fetchSpaces(telegramId);
        fetchTransactions(telegramId, "personal");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectSpace = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    const telegramId = user?.id || 123456789;
    fetchTransactions(telegramId, spaceId);
    if (typeof window !== "undefined" && window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.selectionChanged();
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
          {/* Bo'shliq (Space) almashtirish tugmasi */}
          <button
            onClick={() => {
              setSpaceModalTab("list");
              setIsSpaceModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 transition active:scale-95"
          >
            <Users size={14} />
            <span>
              {selectedSpaceId === "personal"
                ? "Shaxsiy"
                : spaces.find((s) => s.id === selectedSpaceId)?.name || "Guruh"}
            </span>
          </button>

          <button
            onClick={() => {
              const tgId = user?.id || 123456789;
              fetchTransactions(tgId, selectedSpaceId);
              fetchSummary(tgId);
              fetchSpaces(tgId);
            }}
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
            <div className="flex items-center gap-2 mt-1">
              {summary?.net_worth_usd !== undefined && (
                <span className="text-[11px] font-semibold text-emerald-400 bg-white/10 px-2 py-0.5 rounded-lg">
                  ≈ ${summary.net_worth_usd.toLocaleString()} USD
                </span>
              )}
              {summary?.exchange_rates?.USD && (
                <span className="text-[10px] text-gray-400">
                  CBU: 1$ = {Number(summary.exchange_rates.USD).toLocaleString()} so'm
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
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
                      {acc.currency === "USD"
                        ? `$${Number(acc.balance).toLocaleString()}`
                        : `${Number(acc.balance).toLocaleString()} so'm`}
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

        {/* Action Buttons: Kirim, Chiqim va O'tkazma */}
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/income"
            className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-xs active:scale-95 transition"
          >
            <ArrowDownIcon size={18} />
            <span className="font-semibold text-[11px]">Kirim</span>
          </Link>
          <Link
            href="/expense"
            className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-xs active:scale-95 transition"
          >
            <ArrowUpIcon size={18} />
            <span className="font-semibold text-[11px]">Chiqim</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              if (summary?.accounts && summary.accounts.length >= 2) {
                setTransferFromId(summary.accounts[0].id);
                setTransferToId(summary.accounts[1].id);
              }
              setIsTransferModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-xs active:scale-95 transition"
          >
            <ArrowLeftRight size={18} />
            <span className="font-semibold text-[11px]">O'tkazma</span>
          </button>
        </div>

        {/* OYLIK BYUDJETLAR VA LIMITLAR NAZORATI */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <Target size={16} />
              </div>
              <div>
                <h3 className="font-bold text-xs text-gray-900">Oylik Byudjetlar nazorati</h3>
                <p className="text-[10px] text-gray-400">Har bir kategoriya bo'yicha limitlar</p>
              </div>
            </div>
            <button
              onClick={() => setIsBudgetModalOpen(true)}
              className="text-[11px] font-semibold text-amber-600 flex items-center gap-1 active:scale-95 transition"
            >
              <Plus size={13} /> Limit qo'yish
            </button>
          </div>

          {summary?.budgets && summary.budgets.length > 0 ? (
            <div className="flex flex-col gap-3 pt-1">
              {summary.budgets.map((b) => (
                <div key={b.id} className="flex flex-col gap-1.5 p-2.5 bg-gray-50/80 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-900">{b.category_name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        b.status === 'EXCEEDED'
                          ? 'bg-rose-100 text-rose-700'
                          : b.status === 'WARNING'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {b.percent}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="font-extrabold text-[11px] text-gray-900 block">
                          {b.spent.toLocaleString()} / {b.amount.toLocaleString()} so'm
                        </span>
                        <span className={`text-[10px] font-medium ${b.remaining >= 0 ? 'text-gray-400' : 'text-rose-600'}`}>
                          {b.remaining >= 0 ? `Qoldi: ${b.remaining.toLocaleString()} so'm` : `Oshdi: ${Math.abs(b.remaining).toLocaleString()} so'm`}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteBudget(b.id)}
                        className="text-gray-300 hover:text-rose-500 p-1 transition"
                        title="Byudjetni o'chirish"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200/80 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        b.status === 'EXCEEDED'
                          ? 'bg-rose-500'
                          : b.status === 'WARNING'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, b.percent))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-200 flex flex-col items-center gap-1.5">
              <SlidersHorizontal size={20} className="text-gray-400" />
              <p className="text-xs text-gray-600 font-medium">Hali byudjet limitlari belgilanmagan</p>
              <p className="text-[10px] text-gray-400">
                Kafelar yoki boshqa xarajatlarga oylik limit qo'yib, ortiqcha sarfning oldini oling.
              </p>
              <button
                onClick={() => setIsBudgetModalOpen(true)}
                className="mt-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition shadow-xs"
              >
                + Oylik limit belgilash
              </button>
            </div>
          )}
        </div>

        {/* JAMG'ARMA MAQSADLARI VIDJETI (GOALS / PIGGY BANK) */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <PiggyBank size={16} />
              </div>
              <div>
                <h3 className="font-bold text-xs text-gray-900">Jamg'arma Maqsadlari</h3>
                <p className="text-[10px] text-gray-400">Orzular va maqsadlar uchun jamg'arma</p>
              </div>
            </div>
            <button
              onClick={() => setIsGoalModalOpen(true)}
              className="text-[11px] font-semibold text-amber-600 flex items-center gap-1 active:scale-95 transition"
            >
              <Plus size={13} /> Yangi maqsad
            </button>
          </div>

          {summary?.goals && summary.goals.length > 0 ? (
            <div className="flex flex-col gap-3 pt-1">
              {summary.goals.map((g) => (
                <div key={g.id} className="p-3 bg-gradient-to-r from-amber-50/40 to-orange-50/30 rounded-xl border border-amber-100/70 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-gray-900">{g.name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          g.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {g.percent}%
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {g.currency === 'USD' ? `$${g.current_amount.toLocaleString()}` : `${g.current_amount.toLocaleString()} so'm`} / {g.currency === 'USD' ? `$${g.target_amount.toLocaleString()}` : `${g.target_amount.toLocaleString()} so'm`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedGoal(g);
                          setIsTopupModalOpen(true);
                        }}
                        className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg transition shadow-2xs"
                      >
                        + Qo'shish
                      </button>
                      <button
                        onClick={() => handleDeleteGoal(g.id)}
                        className="text-gray-300 hover:text-rose-500 p-1 transition"
                        title="Maqsadni o'chirish"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200/80 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(3, g.percent))}%` }}
                    />
                  </div>

                  {(g.days_left !== undefined && g.days_left !== null) && (
                    <div className="flex items-center justify-between text-[10px] text-gray-500 pt-0.5">
                      <span>📅 {g.days_left > 0 ? `${g.days_left} kun qoldi` : "Muddat yetdi"}</span>
                      {g.monthly_needed && g.days_left > 0 && (
                        <span className="font-medium text-amber-700">Oyiga: ~{g.currency === 'USD' ? `$${g.monthly_needed.toLocaleString()}` : `${g.monthly_needed.toLocaleString()} so'm`}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-200 flex flex-col items-center gap-1">
              <PiggyBank size={20} className="text-gray-400" />
              <p className="text-xs text-gray-600 font-medium">Hali jamg'arma maqsadi ochilmagan</p>
              <p className="text-[10px] text-gray-400">
                Mashina, sayohat yoki favqulodda jamg'arma uchun maqsad belgilang.
              </p>
            </div>
          )}
        </div>

        {/* MUNTAZAM TO'LOVLAR VA OBUNALAR VIDJETI (SUBSCRIPTIONS) */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-violet-50 text-violet-600 rounded-lg">
                <Repeat size={16} />
              </div>
              <div>
                <h3 className="font-bold text-xs text-gray-900">Muntazam to'lovlar & Obunalar</h3>
                <p className="text-[10px] text-gray-400">Kommunal, internet, ijara va obunalar</p>
              </div>
            </div>
            <button
              onClick={() => setIsSubModalOpen(true)}
              className="text-[11px] font-semibold text-violet-600 flex items-center gap-1 active:scale-95 transition"
            >
              <Plus size={13} /> Yangi obuna
            </button>
          </div>

          {summary?.subscriptions && summary.subscriptions.length > 0 ? (
            <div className="flex flex-col gap-2 pt-1">
              {summary.subscriptions.map((s) => (
                <div key={s.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center font-bold text-xs">
                      {s.billing_day}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-[11px] leading-tight">{s.name}</p>
                      <p className="text-[10px] text-gray-400">Har oyning {s.billing_day}-kuni</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-extrabold text-xs text-gray-900">
                        {s.currency === 'USD' ? `$${s.amount.toLocaleString()}` : `${s.amount.toLocaleString()} so'm`}
                      </p>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                        s.days_left <= 3 ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700"
                      }`}>
                        {s.days_left <= 0 ? "Bugun to'lov!" : `${s.days_left} kun qoldi`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteSub(s.id)}
                      className="text-gray-300 hover:text-rose-500 p-1 transition"
                      title="Obunani o'chirish"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-200 flex flex-col items-center gap-1">
              <Repeat size={20} className="text-gray-400" />
              <p className="text-xs text-gray-600 font-medium">Obunalar mavjud emas</p>
              <p className="text-[10px] text-gray-400">
                Internet, uy ijarasi yoki Telegram Premium obunalaringizni kiriting.
              </p>
            </div>
          )}
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
                          : item.type === "TRANSFER"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {item.type === "INCOME" ? (
                        <ArrowDownIcon size={16} />
                      ) : item.type === "TRANSFER" ? (
                        <ArrowLeftRight size={16} />
                      ) : (
                        <ArrowUpIcon size={16} />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-gray-900 leading-tight">
                        {item.type === "TRANSFER"
                          ? `O'tkazma: ${item.accounts?.name || 'Hisob'} ➡️ ${item.to_accounts?.name || 'Hisob'}`
                          : item.categories?.name || item.description || (item.type === "INCOME" ? "Kirim" : "Chiqim")}
                      </p>
                      {item.description && item.type !== "TRANSFER" && item.categories?.name && (
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
                    <div>
                      <p
                        className={`font-bold text-xs text-right ${
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
                        <p className="text-[9px] text-gray-400 text-right">
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
                  Valyuta
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccCurrency("UZS")}
                    className={`py-2 rounded-xl text-center font-medium transition ${
                      accCurrency === "UZS"
                        ? "bg-gray-900 text-white font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    UZS (So'm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccCurrency("USD")}
                    className={`py-2 rounded-xl text-center font-medium transition ${
                      accCurrency === "USD"
                        ? "bg-emerald-600 text-white font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    USD (Dollar $)
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

      {/* HISOBLARARO O'TKAZMA (TRANSFER) MODAL OYNASI */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <ArrowLeftRight size={16} />
                </div>
                <h3 className="font-bold text-sm text-gray-900">Hisoblararo o'tkazma</h3>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  📤 Chiqim hisobi (Qayerdan)
                </label>
                <select
                  required
                  value={transferFromId}
                  onChange={(e) => setTransferFromId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Hisobni tanlang</option>
                  {summary?.accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({Number(acc.balance).toLocaleString()} so'm)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  📥 Kirim hisobi (Qayerga)
                </label>
                <select
                  required
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Hisobni tanlang</option>
                  {summary?.accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id} disabled={acc.id === transferFromId}>
                      {acc.name} ({Number(acc.balance).toLocaleString()} so'm)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  O'tkazma summasi (so'm)
                </label>
                <input
                  type="number"
                  required
                  placeholder="Masalan: 200000"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Izoh (ixtiyoriy)
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Bankomatdan naqd yechish"
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingTransfer}
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
              >
                {submittingTransfer ? "O'tkazilmoqda..." : "O'tkazmani tasdiqlash"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BYUDJET LIMITI BELGILASH (BUDGET MODAL) */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                  <Target size={16} />
                </div>
                <h3 className="font-bold text-sm text-gray-900">Oylik Byudjet chegarasi</h3>
              </div>
              <button
                onClick={() => setIsBudgetModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Kategoriya
                </label>
                <select
                  value={budgetCategoryId}
                  onChange={(e) => setBudgetCategoryId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500 font-medium"
                >
                  <option value="">🎯 Umumiy oylik byudjet (Barcha xarajatlar)</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      📁 {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Muayyan bitta kategoriya yoki barcha chiqimlar uchun limit tanlang.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Oylik limit summasi (so'm)
                </label>
                <input
                  type="number"
                  required
                  placeholder="Masalan: 1500000"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200 text-amber-800 text-[10px]">
                💡 <b>Aqlli ogohlantirish:</b> Xarajat ushbu limitning 80% yoki 100% idan oshganda, Telegram bot sizni avtomatik ogohlantiradi.
              </div>

              <button
                type="submit"
                disabled={submittingBudget}
                className="mt-2 w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
              >
                {submittingBudget ? "Saqlanmoqda..." : "Byudjet limitini saqlash"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* YANGI MAQSAD YARATISH (GOAL MODAL) */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                  <PiggyBank size={16} />
                </div>
                <h3 className="font-bold text-sm text-gray-900">Yangi Jamg'arma maqsadi</h3>
              </div>
              <button
                onClick={() => setIsGoalModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Maqsad nomi
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Yangi mashina yoki Umra safari"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500 font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Valyuta
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGoalCurrency("UZS")}
                    className={`py-2 rounded-xl text-center font-medium transition ${
                      goalCurrency === "UZS"
                        ? "bg-gray-900 text-white font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    UZS (So'm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoalCurrency("USD")}
                    className={`py-2 rounded-xl text-center font-medium transition ${
                      goalCurrency === "USD"
                        ? "bg-emerald-600 text-white font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    USD (Dollar $)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Maqsad summasi ({goalCurrency === "USD" ? "$" : "so'm"})
                </label>
                <input
                  type="number"
                  required
                  placeholder={goalCurrency === "USD" ? "Masalan: 5000" : "Masalan: 50000000"}
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Rejalashtirilgan sana (Deadline - ixtiyoriy)
                </label>
                <input
                  type="date"
                  value={goalDeadline}
                  onChange={(e) => setGoalDeadline(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingGoal}
                className="mt-2 w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
              >
                {submittingGoal ? "Saqlanmoqda..." : "Maqsadni yaratish"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MAQSADGA PUL QO'SHISH (TOP-UP MODAL) */}
      {isTopupModalOpen && selectedGoal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                  <PiggyBank size={16} />
                </div>
                <h3 className="font-bold text-sm text-gray-900">"{selectedGoal.name}" ga mablag' qo'shish</h3>
              </div>
              <button
                onClick={() => {
                  setIsTopupModalOpen(false);
                  setSelectedGoal(null);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDepositGoal} className="flex flex-col gap-3 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                <p className="font-semibold">{selectedGoal.name}</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Hozirgi qoldiq: <b>{selectedGoal.currency === 'USD' ? `$${selectedGoal.current_amount.toLocaleString()}` : `${selectedGoal.current_amount.toLocaleString()} so'm`}</b> / {selectedGoal.currency === 'USD' ? `$${selectedGoal.target_amount.toLocaleString()}` : `${selectedGoal.target_amount.toLocaleString()} so'm`} ({selectedGoal.percent}%)
                </p>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Qo'shiladigan summa ({selectedGoal.currency === 'USD' ? "$" : "so'm"})
                </label>
                <input
                  type="number"
                  required
                  placeholder="Summani kiriting"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <button
                type="submit"
                disabled={submittingTopup}
                className="mt-2 w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
              >
                {submittingTopup ? "Qo'shilmoqda..." : "Mablag'ni qo'shish"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* YANGI OBUNA QO'SHISH (SUBSCRIPTION MODAL) */}
      {isSubModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-violet-50 text-violet-600 rounded-lg">
                  <Repeat size={16} />
                </div>
                <h3 className="font-bold text-sm text-gray-900">Yangi Obuna yoki To'lov</h3>
              </div>
              <button
                onClick={() => setIsSubModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSub} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  To'lov / Obuna nomi
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Uy ijarasi, Wi-Fi, Telegram Premium"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Summa
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Masalan: 150000"
                    value={subAmount}
                    onChange={(e) => setSubAmount(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Har oyning qaysi kuni
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    placeholder="1-31"
                    value={subBillingDay}
                    onChange={(e) => setSubBillingDay(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Valyuta
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSubCurrency("UZS")}
                    className={`py-2 rounded-xl text-center font-medium transition ${
                      subCurrency === "UZS"
                        ? "bg-gray-900 text-white font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    UZS (So'm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubCurrency("USD")}
                    className={`py-2 rounded-xl text-center font-medium transition ${
                      subCurrency === "USD"
                        ? "bg-emerald-600 text-white font-semibold"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    USD (Dollar $)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Kategoriya (ixtiyoriy)
                </label>
                <select
                  value={subCategoryId}
                  onChange={(e) => setSubCategoryId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 font-medium"
                >
                  <option value="">Kategoriya tanlang</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submittingSub}
                className="mt-2 w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
              >
                {submittingSub ? "Saqlanmoqda..." : "Obunani saqlash"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. OILAVIY GURUH (SPACES) MODAL OYNASI */}
      {isSpaceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Users size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Oilaviy & Jamoaviy Byudjet</h3>
                  <p className="text-[10px] text-gray-400">Umumiy xarajatlarni birgalikda boshqaring</p>
                </div>
              </div>
              <button
                onClick={() => setIsSpaceModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab tanlash */}
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setSpaceModalTab("list")}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  spaceModalTab === "list" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Guruhlarim
              </button>
              <button
                onClick={() => setSpaceModalTab("create")}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  spaceModalTab === "create" ? "bg-white text-blue-600 shadow-xs" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                + Yangi guruh
              </button>
              <button
                onClick={() => setSpaceModalTab("join")}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  spaceModalTab === "join" ? "bg-white text-emerald-600 shadow-xs" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Kodni kiritish
              </button>
            </div>

            {/* TAB 1: Guruhlar ro'yxati */}
            {spaceModalTab === "list" && (
              <div className="flex flex-col gap-2.5">
                {/* Shaxsiy byudjet tanlovi */}
                <div
                  onClick={() => {
                    handleSelectSpace("personal");
                    setIsSpaceModalOpen(false);
                  }}
                  className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                    selectedSpaceId === "personal"
                      ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20"
                      : "bg-white border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 font-bold text-xs">
                      👤
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">Shaxsiy Byudjet</h4>
                      <p className="text-[10px] text-gray-400">Faqat sizning o'zingizga tegishli amallar</p>
                    </div>
                  </div>
                  {selectedSpaceId === "personal" && <UserCheck size={18} className="text-blue-600" />}
                </div>

                {spaces.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <p className="text-xs font-medium">Sizda hali oilaviy guruhlar yo'q</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Yangi guruh oching yoki turmush o'rtog'ingiz bergan kodni kiriting.
                    </p>
                  </div>
                ) : (
                  spaces.map((s) => (
                    <div
                      key={s.id}
                      className={`p-3.5 rounded-2xl border transition flex flex-col gap-2 ${
                        selectedSpaceId === s.id
                          ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20"
                          : "bg-white border-gray-100 hover:bg-gray-50"
                      }`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => {
                          handleSelectSpace(s.id);
                          setIsSpaceModalOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-xs">
                            👨‍👩‍👧
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold text-gray-900">{s.name}</h4>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-violet-50 text-violet-600 border border-violet-200 rounded-md">
                                {s.my_role === "OWNER" ? "Egasiz" : "A'zo"}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {s.members_count} nafar a'zo
                            </p>
                          </div>
                        </div>
                        {selectedSpaceId === s.id && <UserCheck size={18} className="text-blue-600" />}
                      </div>

                      {/* Taklif kodi va A'zolar ro'yxati */}
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-200">
                          <span className="text-gray-400 text-[10px]">Kod:</span>
                          <span className="font-mono font-bold text-gray-800">{s.invite_code}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(s.invite_code);
                              setCopiedCode(true);
                              setTimeout(() => setCopiedCode(false), 2000);
                            }}
                            className="text-gray-400 hover:text-gray-600"
                            title="Nusxalash"
                          >
                            {copiedCode ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLeaveSpace(s.id);
                          }}
                          className="text-rose-500 hover:text-rose-700 font-medium text-[10px] flex items-center gap-1"
                        >
                          <LogOut size={11} /> Chiqish
                        </button>
                      </div>

                      {/* A'zolar ro'yxati chiplari */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.members.map((m) => (
                          <span
                            key={m.telegram_id}
                            className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-medium"
                          >
                            {m.name} {m.is_me ? "(siz)" : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: Yangi oilaviy guruh yaratish */}
            {spaceModalTab === "create" && (
              <form onSubmit={handleCreateSpace} className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Guruh nomi
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Oilamiz byudjeti, Biznes sheriklar"
                    value={newSpaceName}
                    onChange={(e) => setNewSpaceName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Guruh yaratilgandan so'ng, uning maxsus taklif kodi chiqadi va siz uni oila a'zolaringizga berishingiz mumkin.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submittingSpace}
                  className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
                >
                  {submittingSpace ? "Yaratilmoqda..." : "Guruh yaratish"}
                </button>
              </form>
            )}

            {/* TAB 3: Taklif kodi orqali qo'shilish */}
            {spaceModalTab === "join" && (
              <form onSubmit={handleJoinSpace} className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Taklif kodi (Invite Code)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: FAM-9A8B"
                    value={joinInviteCode}
                    onChange={(e) => setJoinInviteCode(e.target.value.toUpperCase())}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500 font-mono tracking-wider font-bold uppercase"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Oila a'zongiz Telegram'dagi /family buyrug'i yoki ushbu bo'lim orqali olgan kodini kiriting.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submittingSpace}
                  className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs active:scale-98 transition disabled:opacity-50"
                >
                  {submittingSpace ? "Qo'shilmoqda..." : "Guruhga a'zo bo'lish"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
