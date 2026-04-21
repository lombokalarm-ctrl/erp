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

export function printTable(title: string, headers: string[], rows: (string | number)[][]) {
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
                ${row.map((cell, idx) => {
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
