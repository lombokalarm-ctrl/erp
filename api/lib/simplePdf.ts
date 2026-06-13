function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatPdfNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function estimateTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.5;
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 1)}...`;
}

function drawText(params: {
  x: number;
  y: number;
  text: string;
  font?: "F1" | "F2";
  size?: number;
}) {
  const { x, y, text, font = "F1", size = 10 } = params;
  return `BT\n/${font} ${size} Tf\n1 0 0 1 ${formatPdfNumber(x)} ${formatPdfNumber(y)} Tm\n(${escapePdfText(text)}) Tj\nET`;
}

function drawLine(x1: number, y1: number, x2: number, y2: number, width = 1) {
  return `${formatPdfNumber(width)} w\n${formatPdfNumber(x1)} ${formatPdfNumber(y1)} m\n${formatPdfNumber(x2)} ${formatPdfNumber(y2)} l\nS`;
}

function drawRect(x: number, y: number, width: number, height: number, strokeWidth = 1) {
  return `${formatPdfNumber(strokeWidth)} w\n${formatPdfNumber(x)} ${formatPdfNumber(y)} ${formatPdfNumber(width)} ${formatPdfNumber(height)} re\nS`;
}

function createPdfBufferFromPages(pageCommands: string[]) {
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  const contentObjectNumbers: number[] = [];

  const catalogObj = 1;
  const pagesObj = 2;
  const fontRegularObj = 3;
  const fontBoldObj = 4;

  for (let i = 0; i < pageCommands.length; i += 1) {
    pageObjectNumbers.push(5 + i * 2);
    contentObjectNumbers.push(6 + i * 2);
  }

  objects[catalogObj] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[fontRegularObj] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[fontBoldObj] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  const kids = pageObjectNumbers.map((n) => `${n} 0 R`).join(" ");
  objects[pagesObj] = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjectNumbers.length} >>`;

  for (let i = 0; i < pageCommands.length; i += 1) {
    const pageObj = pageObjectNumbers[i];
    const contentObj = contentObjectNumbers[i];
    const contentStream = pageCommands[i];
    const contentLength = Buffer.byteLength(contentStream, "utf8");

    objects[contentObj] = `<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream`;
    objects[pageObj] =
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R >> >> /Contents ${contentObj} 0 R >>`;
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogObj} 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function chunkLines(lines: string[], perPage: number) {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) {
    pages.push(lines.slice(i, i + perPage));
  }
  return pages.length ? pages : [["-"]];
}

function wrapLine(line: string, maxChars = 100) {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxChars) {
      if (current) out.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

export function createSimplePdfBuffer(title: string, rawLines: string[]) {
  const lines = rawLines.flatMap((line) => wrapLine(line, 96));
  const pages = chunkLines(lines, 48);
  const pageCommands = pages.map((pageLines) => {
    const lineCommands = pageLines
      .map((line, idx) => {
        if (idx === 0) {
          return `50 790 Td (${escapePdfText(line)}) Tj`;
        }
        return `T* (${escapePdfText(line)}) Tj`;
      })
      .join("\n");
    return `BT\n/F1 10 Tf\n14 TL\n${lineCommands}\nET`;
  });

  return createPdfBufferFromPages(pageCommands);
}

export function buildSimplePdfLines(args: {
  companyName: string;
  title: string;
  printedAt: string;
  sections: Array<{ title: string; headers: string[]; rows: Array<Array<string | number>> }>;
}) {
  const lines: string[] = [];
  lines.push(args.companyName || "PT ERP DISTRIBUTOR FNB");
  lines.push(args.title);
  lines.push(`Dicetak: ${args.printedAt}`);
  lines.push("=".repeat(95));

  for (const section of args.sections) {
    lines.push(`[${section.title}]`);
    lines.push(section.headers.join(" | "));
    lines.push("-".repeat(95));
    if (section.rows.length === 0) {
      lines.push("-");
    } else {
      for (const row of section.rows) {
        lines.push(row.map((v) => String(v)).join(" | "));
      }
    }
    lines.push("");
  }

  return lines;
}

export function createSalesOrderPdfBuffer(args: {
  companyName: string;
  title: string;
  printedAt: string;
  orderInfo: Array<[string, string]>;
  items: Array<{
    no: string;
    sku: string;
    productName: string;
    qty: string;
    uom: string;
    unitPrice: string;
    lineTotal: string;
  }>;
  summary: Array<[string, string]>;
}) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const infoTopY = 720;
  const infoHeaderHeight = 24;
  const infoRowHeight = 18;
  const tableHeaderHeight = 24;
  const tableRowHeight = 20;
  const firstPageTableTop = 565;
  const nextPageTableTop = 760;
  const pageBottomLimit = 170;
  const summaryWidth = 180;
  const summaryRowHeight = 20;
  const summaryTitleHeight = 24;

  const infoRows = args.orderInfo.map(([label, value]) => [label, value || "-"] as const);
  const infoBoxHeight = infoHeaderHeight + infoRows.length * infoRowHeight;
  const infoBoxBottomY = infoTopY - infoBoxHeight;
  const itemsSectionTitleY = infoBoxBottomY - 20;

  const firstPageCapacity = Math.max(
    1,
    Math.floor((firstPageTableTop - pageBottomLimit - tableHeaderHeight) / tableRowHeight),
  );
  const nextPageCapacity = Math.max(
    1,
    Math.floor((nextPageTableTop - pageBottomLimit - tableHeaderHeight) / tableRowHeight),
  );

  const itemPages: typeof args.items[] = [];
  let cursor = 0;
  let isFirstChunk = true;
  while (cursor < args.items.length) {
    const capacity = isFirstChunk ? firstPageCapacity : nextPageCapacity;
    itemPages.push(args.items.slice(cursor, cursor + capacity));
    cursor += capacity;
    isFirstChunk = false;
  }
  if (!itemPages.length) itemPages.push([]);

  const columnWidths = [28, 60, 160, 42, 55, 80, 90];
  const columnTitles = ["No", "SKU", "Produk", "Qty", "Satuan", "Harga", "Total"];
  const columnX: number[] = [margin];
  for (let i = 0; i < columnWidths.length; i += 1) {
    columnX.push(columnX[i] + columnWidths[i]);
  }

  const pageCommands = itemPages.map((pageItems, pageIndex) => {
    const commands: string[] = [];
    const tableTop = pageIndex === 0 ? firstPageTableTop : nextPageTableTop;

    commands.push(drawText({ x: margin, y: 802, text: args.companyName || "PT ERP DISTRIBUTOR FNB", font: "F2", size: 16 }));
    commands.push(drawText({ x: margin, y: 780, text: args.title, font: "F2", size: 13 }));
    commands.push(drawText({ x: margin, y: 764, text: `Dicetak: ${args.printedAt}`, size: 9 }));
    commands.push(drawText({ x: pageWidth - 120, y: 764, text: `Halaman ${pageIndex + 1}/${itemPages.length}`, size: 9 }));
    commands.push(drawLine(margin, 754, pageWidth - margin, 754, 1.2));

    if (pageIndex === 0) {
      commands.push(drawRect(margin, infoBoxBottomY, contentWidth, infoBoxHeight, 1));
      commands.push(drawLine(margin, infoTopY - infoHeaderHeight, pageWidth - margin, infoTopY - infoHeaderHeight, 1));
      commands.push(drawLine(margin + 105, infoBoxBottomY, margin + 105, infoTopY - infoHeaderHeight, 1));
      commands.push(drawText({ x: margin + 10, y: infoTopY - 16, text: "Informasi Order", font: "F2", size: 11 }));

      let rowTop = infoTopY - infoHeaderHeight;
      for (let i = 0; i < infoRows.length; i += 1) {
        const [label, value] = infoRows[i];
        const rowBottom = rowTop - infoRowHeight;
        if (i < infoRows.length - 1) {
          commands.push(drawLine(margin, rowBottom, pageWidth - margin, rowBottom, 0.8));
        }
        commands.push(drawText({ x: margin + 8, y: rowTop - 12, text: label, font: "F2", size: 9 }));
        commands.push(drawText({ x: margin + 112, y: rowTop - 12, text: truncateText(value, 68), size: 9 }));
        rowTop = rowBottom;
      }

      commands.push(drawText({ x: margin, y: itemsSectionTitleY, text: "Item Order", font: "F2", size: 11 }));
    } else {
      commands.push(drawText({ x: margin, y: 730, text: "Item Order (Lanjutan)", font: "F2", size: 11 }));
    }

    const tableHeight = tableHeaderHeight + Math.max(pageItems.length, 1) * tableRowHeight;
    const tableBottom = tableTop - tableHeight;
    commands.push(drawRect(margin, tableBottom, contentWidth, tableHeight, 1));

    for (let i = 1; i < columnX.length - 1; i += 1) {
      commands.push(drawLine(columnX[i], tableBottom, columnX[i], tableTop, 0.8));
    }
    commands.push(drawLine(margin, tableTop - tableHeaderHeight, pageWidth - margin, tableTop - tableHeaderHeight, 1));

    for (let i = 0; i < columnTitles.length; i += 1) {
      commands.push(drawText({ x: columnX[i] + 6, y: tableTop - 15, text: columnTitles[i], font: "F2", size: 9 }));
    }

    const rowsToRender =
      pageItems.length > 0
        ? pageItems
        : [
            {
              no: "-",
              sku: "-",
              productName: "Tidak ada item",
              qty: "-",
              uom: "-",
              unitPrice: "-",
              lineTotal: "-",
            },
          ];

    let rowTop = tableTop - tableHeaderHeight;
    for (let rowIndex = 0; rowIndex < rowsToRender.length; rowIndex += 1) {
      const row = rowsToRender[rowIndex];
      const rowBottom = rowTop - tableRowHeight;
      if (rowIndex < rowsToRender.length - 1) {
        commands.push(drawLine(margin, rowBottom, pageWidth - margin, rowBottom, 0.7));
      }

      const rowY = rowTop - 13;
      const values = [
        row.no,
        truncateText(row.sku, 12),
        truncateText(row.productName, 28),
        row.qty,
        truncateText(row.uom, 8),
        row.unitPrice,
        row.lineTotal,
      ];

      for (let colIndex = 0; colIndex < values.length; colIndex += 1) {
        const cellLeft = columnX[colIndex];
        const cellRight = columnX[colIndex + 1];
        const text = values[colIndex];
        const isRightAligned = colIndex >= 3;
        const x = isRightAligned
          ? cellRight - 6 - estimateTextWidth(text, 8.5)
          : cellLeft + 6;
        commands.push(
          drawText({
            x: Math.max(cellLeft + 4, x),
            y: rowY,
            text,
            size: 8.5,
          }),
        );
      }

      rowTop = rowBottom;
    }

    if (pageIndex === itemPages.length - 1) {
      const summaryTop = tableBottom - 24;
      const summaryHeight = summaryTitleHeight + args.summary.length * summaryRowHeight;
      const summaryX = pageWidth - margin - summaryWidth;
      const summaryBottom = summaryTop - summaryHeight;

      commands.push(drawRect(summaryX, summaryBottom, summaryWidth, summaryHeight, 1));
      commands.push(drawLine(summaryX, summaryTop - summaryTitleHeight, summaryX + summaryWidth, summaryTop - summaryTitleHeight, 1));
      commands.push(drawLine(summaryX + 90, summaryBottom, summaryX + 90, summaryTop - summaryTitleHeight, 0.8));
      commands.push(drawText({ x: summaryX + 8, y: summaryTop - 15, text: "Ringkasan Total", font: "F2", size: 10 }));

      let summaryRowTop = summaryTop - summaryTitleHeight;
      for (let i = 0; i < args.summary.length; i += 1) {
        const [label, value] = args.summary[i];
        const summaryRowBottom = summaryRowTop - summaryRowHeight;
        if (i < args.summary.length - 1) {
          commands.push(drawLine(summaryX, summaryRowBottom, summaryX + summaryWidth, summaryRowBottom, 0.7));
        }
        commands.push(drawText({ x: summaryX + 8, y: summaryRowTop - 13, text: label, font: i === args.summary.length - 1 ? "F2" : "F1", size: 9 }));
        const valueX = summaryX + summaryWidth - 8 - estimateTextWidth(value, 9);
        commands.push(drawText({ x: valueX, y: summaryRowTop - 13, text: value, font: i === args.summary.length - 1 ? "F2" : "F1", size: 9 }));
        summaryRowTop = summaryRowBottom;
      }
    }

    return commands.join("\n");
  });

  return createPdfBufferFromPages(pageCommands);
}
