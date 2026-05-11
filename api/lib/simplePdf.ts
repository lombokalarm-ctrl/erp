function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  const contentObjectNumbers: number[] = [];

  const catalogObj = 1;
  const pagesObj = 2;
  const fontObj = 3;

  for (let i = 0; i < pages.length; i += 1) {
    pageObjectNumbers.push(4 + i * 2);
    contentObjectNumbers.push(5 + i * 2);
  }

  objects[catalogObj] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[fontObj] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  const kids = pageObjectNumbers.map((n) => `${n} 0 R`).join(" ");
  objects[pagesObj] = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjectNumbers.length} >>`;

  for (let i = 0; i < pages.length; i += 1) {
    const pageObj = pageObjectNumbers[i];
    const contentObj = contentObjectNumbers[i];
    const pageLines = pages[i];
    const lineCommands = pageLines
      .map((line, idx) => {
        if (idx === 0) {
          return `50 790 Td (${escapePdfText(line)}) Tj`;
        }
        return `T* (${escapePdfText(line)}) Tj`;
      })
      .join("\n");
    const contentStream = `BT\n/F1 10 Tf\n14 TL\n${lineCommands}\nET`;
    const contentLength = Buffer.byteLength(contentStream, "utf8");

    objects[contentObj] = `<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream`;
    objects[pageObj] =
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`;
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
