import * as XLSX from "xlsx";
import { getCompanySettings } from "./settingService.js";
import { getProfitLossReport, getSalesReport, getStockReport } from "./reportService.js";
import { buildSimplePdfLines, createSimplePdfBuffer } from "../lib/simplePdf.js";

export type ExportFormat = "xlsx" | "pdf";

type ExportFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

function nowTag() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function num2(value: string | number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function makeWorkbookBuffer(sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number>> }>) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || "Laporan");
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function makePdfBuffer(args: {
  companyName: string;
  title: string;
  sections: Array<{ title: string; headers: string[]; rows: Array<Array<string | number>> }>;
}) {
  const lines = buildSimplePdfLines({
    companyName: args.companyName,
    title: args.title,
    printedAt: new Date().toLocaleString("id-ID"),
    sections: args.sections,
  });
  return createSimplePdfBuffer(args.title, lines);
}

export async function exportStockReport(params: { q?: string; format: ExportFormat }): Promise<ExportFile> {
  const [company, report] = await Promise.all([getCompanySettings(), getStockReport({ q: params.q })]);

  const rows = report.stock.map((row: any) => [
    row.sku,
    row.productName,
    (row.uomOrder ?? []).slice(0, 3).join(", ") || "-",
    num2(row.breakdown?.find((b: any) => b.uomCode === (row.uomOrder ?? [])[0])?.qty ?? 0),
    num2(row.breakdown?.find((b: any) => b.uomCode === (row.uomOrder ?? [])[1])?.qty ?? 0),
    num2(row.breakdown?.find((b: any) => b.uomCode === (row.uomOrder ?? [])[2])?.qty ?? 0),
    row.breakdownLabel ?? "-",
    num2(row.qty),
  ]);

  const sections = [
    {
      title: "Saldo Stok",
      headers: ["SKU", "Nama Produk", "Satuan", "Qty 1", "Qty 2", "Qty 3", "Breakdown Satuan", "Qty Base"],
      rows,
    },
  ];

  if (params.format === "xlsx") {
    return {
      fileName: `Laporan_Stok_${nowTag()}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: makeWorkbookBuffer([{ name: "Stok", headers: sections[0].headers, rows }]),
    };
  }

  return {
    fileName: `Laporan_Stok_${nowTag()}.pdf`,
    contentType: "application/pdf",
    buffer: makePdfBuffer({
      companyName: company.name,
      title: "Laporan Stok",
      sections,
    }),
  };
}

export async function exportSalesReport(params: {
  startDate?: string;
  endDate?: string;
  format: ExportFormat;
}): Promise<ExportFile> {
  const [company, report] = await Promise.all([
    getCompanySettings(),
    getSalesReport({ startDate: params.startDate, endDate: params.endDate }),
  ]);

  const rows = report.topProducts.map((p: any) => [
    p.sku,
    p.productName,
    (p.satuanLabel ?? (p.uomOrder ?? []).slice(0, 3).join(", ")) || "-",
    num2(p.qty1 ?? p.breakdown?.find((b: any) => b.uomCode === (p.uomOrder ?? [])[0])?.qty ?? 0),
    num2(p.qty2 ?? p.breakdown?.find((b: any) => b.uomCode === (p.uomOrder ?? [])[1])?.qty ?? 0),
    num2(p.qty3 ?? p.breakdown?.find((b: any) => b.uomCode === (p.uomOrder ?? [])[2])?.qty ?? 0),
    p.breakdownLabel ?? "-",
    num2(p.qtyBaseSold),
    num2(p.salesReturnQtyBase),
    num2(p.netQtyBaseSold),
    num2(p.revenue),
    Number(p.qtyBaseSold) > 0 ? num2(Number(p.revenue) / Number(p.qtyBaseSold)) : 0,
  ]);

  const sections = [
    {
      title: "Ringkasan Penjualan",
      headers: ["Komponen", "Nilai"],
      rows: [
        ["Total Transaksi", Number(report.summary.totalTransactions || 0)],
        ["Total Omzet", num2(report.summary.totalRevenue)],
        ["Gross Qty Base", num2(report.summary.grossQtyBaseSold)],
        ["Retur Qty Base", num2(report.summary.salesReturnQtyBase)],
        ["Net Qty Base", num2(report.summary.netQtyBaseSold)],
      ],
    },
    {
      title: "Penjualan Per SKU",
      headers: [
        "SKU",
        "Nama Produk",
        "Satuan",
        "Qty 1",
        "Qty 2",
        "Qty 3",
        "Breakdown Satuan",
        "Gross Qty Base",
        "Retur Qty Base",
        "Net Qty Base",
        "Omzet",
        "Harga Rata2/Base",
      ],
      rows,
    },
  ];

  if (params.format === "xlsx") {
    return {
      fileName: `Laporan_Penjualan_${nowTag()}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: makeWorkbookBuffer([
        { name: "Ringkasan", headers: sections[0].headers, rows: sections[0].rows },
        { name: "Per SKU", headers: sections[1].headers, rows: sections[1].rows },
      ]),
    };
  }

  return {
    fileName: `Laporan_Penjualan_${nowTag()}.pdf`,
    contentType: "application/pdf",
    buffer: makePdfBuffer({
      companyName: company.name,
      title: "Laporan Penjualan",
      sections,
    }),
  };
}

export async function exportProfitLossReport(params: {
  startDate?: string;
  endDate?: string;
  format: ExportFormat;
}): Promise<ExportFile> {
  const [company, report] = await Promise.all([
    getCompanySettings(),
    getProfitLossReport({ startDate: params.startDate, endDate: params.endDate }),
  ]);

  const waterfallRows: Array<Array<string | number>> = [
    ["Gross Sales", num2(report.summary.grossSales)],
    ["Diskon", num2(report.summary.totalDiscounts)],
    ["Retur Penjualan (Net)", num2(report.summary.salesReturnAmount)],
    ["Net Sales", num2(report.summary.netSales)],
    ["HPP Sales", num2(report.summary.hppSales)],
    ["HPP Retur", num2(report.summary.hppReturn)],
    ["HPP Net", num2(report.summary.hppNet)],
    ["Gross Profit", num2(report.summary.grossProfit)],
    ["Margin Laba Kotor (%)", num2(report.summary.marginPercentage)],
  ];

  const categoryRows = report.byCategory.map((r: any) => [
    r.categoryName,
    num2(r.netSales),
    num2(r.cogs),
    num2(r.grossProfit),
  ]);

  const topSkuRows = report.topProducts.map((p: any) => [
    p.sku,
    p.productName,
    num2(p.grossQtyBaseSold),
    num2(p.returnQtyBase),
    num2(p.netQtyBaseSold),
    num2(p.netSales),
    num2(p.cogs),
    num2(p.grossProfit),
  ]);

  const sections = [
    { title: "Waterfall Laba Kotor", headers: ["Komponen", "Nilai"], rows: waterfallRows },
    {
      title: "Laba Kotor Per Kategori",
      headers: ["Kategori Produk", "Penjualan Bersih", "HPP Net", "Laba Kotor"],
      rows: categoryRows,
    },
    {
      title: "Top SKU",
      headers: [
        "SKU",
        "Nama Produk",
        "Gross Qty Base",
        "Retur Qty Base",
        "Net Qty Base",
        "Net Sales",
        "HPP Net",
        "Gross Profit",
      ],
      rows: topSkuRows,
    },
  ];

  if (params.format === "xlsx") {
    return {
      fileName: `Laporan_Rugi_Laba_${nowTag()}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: makeWorkbookBuffer([
        { name: "Waterfall", headers: sections[0].headers, rows: sections[0].rows },
        { name: "Per Kategori", headers: sections[1].headers, rows: sections[1].rows },
        { name: "Top SKU", headers: sections[2].headers, rows: sections[2].rows },
      ]),
    };
  }

  return {
    fileName: `Laporan_Rugi_Laba_${nowTag()}.pdf`,
    contentType: "application/pdf",
    buffer: makePdfBuffer({
      companyName: company.name,
      title: "Laporan Rugi Laba",
      sections,
    }),
  };
}
