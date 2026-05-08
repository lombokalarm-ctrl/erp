import { useSettingsStore } from "@/stores/settingsStore";
import * as XLSX from "xlsx";

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.join(","),
    ...rows.map(e => e.map(cell => {
      const stringCell = String(cell);
      // Escape quotes
      const escaped = stringCell.replace(/"/g, '""');
      // Quote if contains comma, newline, or quote
      if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
        return `"${escaped}"`;
      }
      return escaped;
    }).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename.endsWith('.csv') ? filename : filename + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function exportToExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");

  const safeFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeFilename);
}

export function printTable(title: string, headers: string[], rows: (string | number)[][]) {
  const company = useSettingsStore.getState().company;
  const companyName = escapeHtml(company?.name || "PT. ERP DISTRIBUTOR F&B");
  const companyAddress = escapeHtml(company?.address || "Alamat belum diatur").replace(/\r?\n/g, "<br/>");
  const companyPhone = escapeHtml(company?.phone || "-");

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Cetak - ${title}</title>
        <style>
          @page { size: A4 portrait; margin: 0.5in; }
          body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; }
          .header { border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 14px; }
          .company-name { font-size: 14px; font-weight: 700; color: #000; }
          .company-meta { font-size: 11px; color: #555; margin-top: 2px; }
          h1 { text-align: center; margin-bottom: 20px; font-size: 18px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
          th { background-color: #f4f4f5; font-weight: bold; color: #000; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${companyName}</div>
          <div class="company-meta">${companyAddress}</div>
          <div class="company-meta">Telp: ${companyPhone}</div>
        </div>
        <h1>${title}</h1>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${row.map((cell) => {
                  const isNumber = !isNaN(Number(cell)) && cell !== '';
                  const alignClass = isNumber ? 'text-right' : '';
                  return `<td class="${alignClass}">${cell}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top: 20px; text-align: right; font-size: 10px; color: #888;">
          Dicetak pada: ${new Date().toLocaleString('id-ID')}
        </div>
      </body>
    </html>
  `);
  
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
