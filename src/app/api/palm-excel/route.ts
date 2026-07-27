// app/api/palm-excel/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Palm Trees — Excel Export
//
// الفكرة: Palm Detection endpoint (/gis/palm-detection) بيرجع csv_url بس
// (رابط CSV خام على webgiss.duckdns.org). لحد دلوقتي PalmTreesPanel.tsx كان
// بيعمل <a href={csv_url}> عادي — يعني اليوزر بيفتح/يحمّل CSV خام بلا أي
// تنسيق. الراوت ده بيعمل بالظبط نفس فكرة palm-heatmap/route.ts: بيجيب الـ
// CSV من السيرفر (مفيش CORS)، وبدل ما يرجعه زي ما هو، بيحوله لملف Excel
// (.xlsx) حقيقي منسّق — نفس أعمدة الـ CSV الأصلية بالحرف الواحد (Palm ID,
// Location, Crown Diameter (m), Crown Area (m2), NDVI Value, NDVI Zone,
// NDMI Value, NDMI Zone, Stress Score, Risk Level) — بس بشكل جاهز للقراءة:
// هيدر ملوّن، أعمدة بعرض مناسب، فلتر تلقائي، وتلوين شرطي لعمود Risk Level
// (Critical/High/Medium/Low) زي أي تقرير GIS احترافي.
//
// المعادلة (expression) نفسها بيبعتها اليوزر من الفرونت لـ /gis/palm-detection
// مباشرة (شوفي submitToBackend في PalmTreesPanel.tsx) — الباك إند الخارجي هو
// اللي بيطبّقها ويحسب النتائج. الراوت ده مسؤوليته الوحيدة: ياخد النتيجة
// الجاهزة (csv_url) ويطلعها Excel.
//
// Usage:
//   GET /api/palm-excel
//       ?csvUrl=<csv_url من رد /gis/palm-detection>
//       &filename=palm_analysis.xlsx   ← اختياري
//
// الرد: ملف .xlsx (attachment) جاهز للتحميل مباشرة من المتصفح.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

// ── تلوين شرطي لعمود Risk Level — نفس منطق أي GIS report عادي ──────────────
const RISK_FILL: Record<string, string> = {
  Critical: "FFF8D7DA", // أحمر فاتح
  High: "FFFDE2CC", // برتقالي فاتح
  Medium: "FFFFF3CD", // أصفر فاتح
  Low: "FFD4EDDA", // أخضر فاتح
};
const RISK_FONT: Record<string, string> = {
  Critical: "FF842029",
  High: "FF9C4A0B",
  Medium: "FF856404",
  Low: "FF155724",
};

// أعمدة رقمية معروفة مسبقًا من شكل الـ CSV الحقيقي — لو اتغيّر اسم عمود من
// الباك إند مستقبلًا، بيرجع نص عادي تلقائيًا (مفيش كسر) لأن الفحص بيبقى
// isNaN-safe تحت في buildRow
const NUMERIC_COLUMNS = new Set([
  "Palm ID",
  "Crown Diameter (m)",
  "Crown Area (m2)",
  "NDVI Value",
  "NDMI Value",
  "Stress Score",
]);

/** CSV parser بسيط بيحترم الحقول المتحاطة بـ "..." (زي عمود Location اللي
 *  فيه فاصلة جوا القيمة نفسها: "29.082247, 25.657749") — split(",") عادي
 *  كان هيكسّر العمود ده. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // تجاهل — بننتظر \n أو نهاية الملف
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // آخر سطر (لو الملف مش منتهي بسطر فاضي)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const csvUrl = searchParams.get("csvUrl");
  const filenameParam = searchParams.get("filename");
  const filename =
    filenameParam && filenameParam.trim().length > 0
      ? filenameParam.trim().endsWith(".xlsx")
        ? filenameParam.trim()
        : `${filenameParam.trim()}.xlsx`
      : "palm_analysis.xlsx";

  if (!csvUrl) {
    return NextResponse.json({ error: "Missing csvUrl param" }, { status: 400 });
  }

  // ── 1. هات الـ CSV من السيرفر (مفيش CORS)، مش من المتصفح ────────────────
  let csvText: string;
  try {
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) throw new Error(`CSV fetch failed (${csvRes.status})`);
    csvText = await csvRes.text();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch csvUrl: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  const rows = parseCSV(csvText);
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV is empty or unreadable" }, { status: 422 });
  }

  const [header, ...dataRows] = rows;
  if (header.length === 0) {
    return NextResponse.json({ error: "CSV has no header row" }, { status: 422 });
  }

  // ── 2. ابني الـ workbook ──────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Palm GIS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Palm Analysis", {
    views: [{ state: "frozen", ySplit: 1 }], // تجميد صف الهيدر
  });

  sheet.columns = header.map((h) => ({
    header: h,
    key: h,
    width: h === "Location" ? 24 : Math.max(12, h.length + 4),
  }));

  const riskColIndex = header.indexOf("Risk Level") + 1; // 1-based، 0 لو العمود مش موجود

  for (const r of dataRows) {
    // صف فاضي كامل (سطر زيادة في آخر الملف مثلًا) — تجاهله
    if (r.every((v) => v.trim() === "")) continue;

    const rowValues: Record<string, string | number> = {};
    header.forEach((h, idx) => {
      const raw = (r[idx] ?? "").trim();
      const isNumericCol = NUMERIC_COLUMNS.has(h);
      const asNumber = Number(raw);
      rowValues[h] = isNumericCol && raw !== "" && Number.isFinite(asNumber) ? asNumber : raw;
    });

    const addedRow = sheet.addRow(rowValues);

    // تلوين شرطي لعمود Risk Level لكل صف
    if (riskColIndex > 0) {
      const cell = addedRow.getCell(riskColIndex);
      const val = String(cell.value ?? "");
      const fillArgb = RISK_FILL[val];
      if (fillArgb) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
        cell.font = { bold: true, color: { argb: RISK_FONT[val] ?? "FF000000" } };
        cell.alignment = { horizontal: "center" };
      }
    }
  }

  // ── 3. شكل الهيدر ─────────────────────────────────────────────────────────
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3D91" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0B3D91" } },
      bottom: { style: "thin", color: { argb: "FF0B3D91" } },
    };
  });

  // خطوط رفيعة حوالين كل الخلايا + محاذاة الأرقام لليمين
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      cell.border = {
        ...cell.border,
        left: { style: "hair", color: { argb: "FFDDDDDD" } },
        right: { style: "hair", color: { argb: "FFDDDDDD" } },
        bottom: cell.border?.bottom ?? { style: "hair", color: { argb: "FFDDDDDD" } },
      };
      if (rowNumber > 1 && NUMERIC_COLUMNS.has(header[colNumber - 1])) {
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      }
    });
  });

  // فلتر تلقائي على كل الأعمدة
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: header.length },
  };

  // ── 4. رجّع الملف كـ attachment ──────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Row-Count": String(dataRows.length),
    },
  });
}