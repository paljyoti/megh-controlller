import { useState, useRef, useEffect } from "react";
import { Download } from "lucide-react";
import { exportToExcel, exportToPdf } from "../utils/export";
import type { ExportColumn } from "../utils/export";

// Either pass `rows` directly (data already fully loaded, e.g. client-side-paginated lists),
// or `fetchRows` (async — for server-paginated lists, where only the current page is in state
// and export needs to pull every row matching the active filters first).
function ExportButton<T>({
  filename,
  title,
  columns,
  rows,
  fetchRows,
}: {
  filename: string;
  title: string;
  columns: ExportColumn<T>[];
  rows?: T[];
  fetchRows?: () => Promise<T[]>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const runExport = async (kind: "excel" | "pdf") => {
    setError("");
    setLoading(true);
    try {
      const data = fetchRows ? await fetchRows() : rows ?? [];
      if (kind === "excel") await exportToExcel(filename, columns, data);
      else await exportToPdf(filename, title, columns, data);
      setOpen(false);
    } catch {
      setError("Export failed — try again");
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || (rows !== undefined && rows.length === 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40"
      >
        <Download size={15} /> {loading ? "Preparing..." : "Export"}
      </button>
      {open && !loading && (
        <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-10 overflow-hidden">
          <button
            onClick={() => runExport("excel")}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            Export Excel
          </button>
          <button
            onClick={() => runExport("pdf")}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            Export PDF
          </button>
        </div>
      )}
      {error && (
        <p className="absolute right-0 mt-1 w-48 text-xs text-red-500 bg-white dark:bg-slate-800 px-2 py-1 rounded shadow">
          {error}
        </p>
      )}
    </div>
  );
}

export default ExportButton;
