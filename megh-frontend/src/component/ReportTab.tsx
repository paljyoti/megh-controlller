import { useState } from "react";
import { FileDown } from "lucide-react";
import { api } from "../services/api";
import { REPORT_SECTIONS, RANGE_OPTIONS, resolvePeriod, type ReportSectionKey, type RangeKey, type SectionResult } from "../utils/deviceReport";
import { exportDeviceReportToPdf, exportDeviceReportToExcel } from "../utils/deviceReportExport";

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

// Device Details → Report tab. This is a report *selection and generation* screen, not a live
// dashboard — nothing is rendered here beyond the picker; selected sections are fetched and
// shaped only when the user clicks Generate Report, then handed straight to the PDF/Excel
// export (see utils/deviceReport.ts and utils/deviceReportExport.ts).
const ReportTab = ({ deviceId }: { deviceId?: string }) => {
  const [selected, setSelected] = useState<Set<ReportSectionKey>>(new Set());
  const [range, setRange] = useState<RangeKey>("24h");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const toggleSection = (key: ReportSectionKey) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectAll = () => setSelected(new Set(REPORT_SECTIONS.map((s) => s.key)));
  const clearAll = () => setSelected(new Set());

  const handleGenerate = async () => {
    setError("");
    if (!deviceId) {
      setError("No device selected");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one report section");
      return;
    }
    if (range === "custom" && customFrom > customTo) {
      setError("Custom range: from date must be before to date");
      return;
    }

    setGenerating(true);
    try {
      const period = resolvePeriod(range, customFrom, customTo);

      const devicesRes = await api.getAllDevices();
      const device = (devicesRes.data.data.devices ?? []).find((d: { id: string }) => d.id === deviceId);

      const sectionDefs = REPORT_SECTIONS.filter((s) => selected.has(s.key));
      const sections: SectionResult[] = await Promise.all(
        sectionDefs.map(async (def) => ({
          key: def.key,
          label: def.label,
          groups: await def.fetch(deviceId, period, range),
        }))
      );

      const meta = {
        name: device?.name || "device",
        ipAddress: device?.ipAddress,
        serialNumber: device?.serialNumber,
        model: device?.model,
      };

      if (format === "pdf") await exportDeviceReportToPdf(meta, period.label, sections);
      else await exportDeviceReportToExcel(meta, period.label, sections);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to generate report"));
    } finally {
      setGenerating(false);
    }
  };

  if (!deviceId) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Generate Device Report</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Pick the sections you need, a time period, and a format — the report is generated and downloaded directly.
        </p>
      </div>

      {/* Report sections */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Select Report Sections</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className="px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Clear All
            </button>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-slate-700 pt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2.5">
          {REPORT_SECTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(s.key)}
                onChange={() => toggleSection(s.key)}
                className="w-4 h-4 accent-blue-600"
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {/* Report period */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Report Period</h3>
        <div className="border-t border-gray-100 dark:border-slate-700 pt-3 flex flex-wrap items-center gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>

          {range === "custom" && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          Applies to time-based sections (Device Log). Other sections reflect the device's current state.
        </p>
      </div>

      {/* Export format */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Export Format</h3>
        <div className="border-t border-gray-100 dark:border-slate-700 pt-3 flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <input type="radio" name="report-format" checked={format === "pdf"} onChange={() => setFormat("pdf")} className="w-4 h-4 accent-blue-600" />
            PDF
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <input type="radio" name="report-format" checked={format === "excel"} onChange={() => setFormat("excel")} className="w-4 h-4 accent-blue-600" />
            Excel
          </label>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          <FileDown size={16} /> {generating ? "Generating..." : "Generate Report"}
        </button>
      </div>
    </div>
  );
};

export default ReportTab;
