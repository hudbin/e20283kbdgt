import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export function generatePdfBuffer(transactions: any[], periodTitle: string): Buffer {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text("Shaxsiy Budjet Hisoboti", 14, 15)
  doc.setFontSize(10)
  doc.text(`Davr: ${periodTitle}`, 14, 22)

  const tableRows = transactions.map((t, idx) => [
    idx + 1,
    new Date(t.date).toLocaleDateString("uz-UZ"),
    t.type === "INCOME" ? "Kirim" : "Chiqim",
    t.category || t.categories?.name || "-",
    t.description || "-",
    `${Number(t.amount).toLocaleString()} so'm`
  ])

  autoTable(doc, {
    head: [["#", "Sana", "Turi", "Kategoriya", "Izoh", "Summa"]],
    body: tableRows,
    startY: 28,
  })

  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}

export function generateExcelBuffer(transactions: any[]): Buffer {
  const dataToExport = transactions.map((t, idx) => ({
    "№": idx + 1,
    "Sana": new Date(t.date).toLocaleDateString("uz-UZ"),
    "Turi": t.type === "INCOME" ? "Kirim" : "Chiqim",
    "Kategoriya": t.category || t.categories?.name || "",
    "Izoh": t.description || "",
    "Summa (so'm)": Number(t.amount)
  }))

  const worksheet = XLSX.utils.json_to_sheet(dataToExport)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hisobot")

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
