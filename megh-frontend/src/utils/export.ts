export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

// xlsx/jspdf are dynamically imported so their ~700KB doesn't load until someone actually
// clicks Export — the main bundle stays light for everyone else.

export async function exportToExcel<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const XLSX = await import("xlsx");
  const data = rows.map((row) => {
    const obj: Record<string, string | number> = {};
    columns.forEach((col) => {
      obj[col.header] = col.accessor(row);
    });
    return obj;
  });
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportToPdf<T>(filename: string, title: string, columns: ExportColumn<T>[], rows: T[]) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  autoTable(doc, {
    startY: 20,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(c.accessor(row)))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(`${filename}.pdf`);
}
