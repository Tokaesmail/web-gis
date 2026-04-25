import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

/**
 * Exports data to Excel format.
 * @param data Array of objects to export
 * @param fileName Desired filename
 */
export function exportToExcel(data: any[], fileName: string = 'export.xlsx') {
  if (!data || data.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Exports data to PDF format.
 * @param data Array of objects to export
 * @param title Document title
 * @param fileName Desired filename
 */
export function exportToPDF(data: any[], title: string = 'Data Export', fileName: string = 'export.pdf') {
  if (!data || data.length === 0) return;

  const doc = new jsPDF() as any;

  // Extract headers
  const headers = Object.keys(data[0]);
  const rows = data.map(obj => headers.map(header => obj[header]));

  doc.setFontSize(18);
  doc.text(title, 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 30);

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 35,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [6, 182, 212], textColor: 255 },
  });

  doc.save(fileName);
}
