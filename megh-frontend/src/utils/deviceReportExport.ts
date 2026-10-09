// Builds the downloadable Device Report file (PDF or Excel) from the sections the user picked
// in the Report tab. jspdf/jspdf-autotable/xlsx are dynamically imported, same as
// utils/export.ts, so their weight only loads when a report is actually generated.
import type { SectionResult } from "./deviceReport";

export interface DeviceReportMeta {
  name: string;
  ipAddress?: string | null;
  serialNumber?: string | null;
  model?: string | null;
}

const sanitizeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";

export async function exportDeviceReportToPdf(
  device: DeviceReportMeta,
  periodLabel: string,
  sections: SectionResult[]
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage();
      y = 18;
    }
  };

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("DEVICE REPORT", marginLeft, y);
  y += 9;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const infoLines = [
    `Device Name: ${device.name || "-"}`,
    `IP Address: ${device.ipAddress || "-"}`,
    device.serialNumber ? `Serial Number: ${device.serialNumber}` : null,
    device.model ? `Model: ${device.model}` : null,
    `Generated On: ${new Date().toLocaleString()}`,
    `Report Period: ${periodLabel}`,
  ].filter(Boolean) as string[];
  for (const line of infoLines) {
    doc.text(line, marginLeft, y);
    y += 5.5;
  }
  y += 3;

  for (const section of sections) {
    ensureSpace(12);
    doc.setFillColor(37, 99, 235);
    doc.rect(marginLeft, y - 5, pageWidth - marginLeft - marginRight, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(section.label.toUpperCase(), marginLeft + 2, y);
    doc.setTextColor(0, 0, 0);
    y += 8;

    for (const group of section.groups) {
      if (group.title) {
        ensureSpace(8);
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "bold");
        doc.text(group.title, marginLeft, y);
        doc.setFont("helvetica", "normal");
        y += 5;
      }
      if (group.rows.length === 0) {
        ensureSpace(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.text("No data for this period.", marginLeft, y);
        doc.setFont("helvetica", "normal");
        y += 7;
        continue;
      }
      autoTable(doc, {
        startY: y,
        head: [group.headers],
        body: group.rows,
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [99, 102, 241] },
        margin: { left: marginLeft, right: marginRight },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    y += 2;
  }

  doc.save(`${sanitizeSheetName(device.name || "device")}-report.pdf`);
}

export async function exportDeviceReportToExcel(
  device: DeviceReportMeta,
  periodLabel: string,
  sections: SectionResult[]
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  for (const section of sections) {
    const aoa: (string | number)[][] = [
      [`${section.label}`],
      [`Device: ${device.name || "-"}`, `Period: ${periodLabel}`, `Generated: ${new Date().toLocaleString()}`],
      [],
    ];
    for (const group of section.groups) {
      if (group.title) {
        aoa.push([group.title]);
      }
      aoa.push(group.headers);
      if (group.rows.length === 0) {
        aoa.push(["No data for this period."]);
      } else {
        for (const row of group.rows) aoa.push(row);
      }
      aoa.push([]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(section.label));
  }

  XLSX.writeFile(workbook, `${sanitizeSheetName(device.name || "device")}-report.xlsx`);
}
