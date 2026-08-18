import React, { useEffect, useMemo, useState } from "react";
import { Laptop, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, getUser, canOnboard } from "../services/api";
import AssignModal from "../component/AssignModal";

interface Device {
  id: string;
  name: string | null;
  serialNumber: string;
  model: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  status: string;
  hardwareVersion: string | null;
  softwareVersion: string | null;
  createdAt: string;
  orgs?: { id: string; name: string } | null;
  assignedTo?: { id: string; name: string; email: string } | null;
}

const statusStyles: Record<string, string> = {
  online: "bg-green-100 text-green-700",
  offline: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-700",
};

const ITEMS_PER_PAGE = 10;

const DevicesPage: React.FC = () => {
  const navigate = useNavigate();
  const user = getUser();
  const [activeTab, setActiveTab] = useState<"devices" | "onboard">("devices");
  const [devices, setDevices] = useState<Device[]>([]);
  const [onboardDevices, setOnboardDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState<Device | null>(null);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await api.getAllDevices();
      setDevices(res.data.data.devices);
    } catch {
      console.error("Failed to fetch devices");
    } finally {
      setLoading(false);
    }
  };

  const fetchOnboard = async () => {
    try {
      const res = await api.getOnboardDevices();
      setOnboardDevices(res.data.data.devices);
    } catch {
      console.error("Failed to fetch onboard devices");
    }
  };

  useEffect(() => {
    fetchDevices();
    if (canOnboard()) fetchOnboard();
  }, []);

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const matchesSearch =
        (device.name || "").toLowerCase().includes(search.toLowerCase()) ||
        device.serialNumber.toLowerCase().includes(search.toLowerCase()) ||
        (device.ipAddress || "").includes(search);

      const matchesStatus =
        statusFilter === "All" ||
        device.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [devices, search, statusFilter]);

  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE);
  const paginatedDevices = filteredDevices.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleAssigned = () => {
    fetchDevices();
    fetchOnboard();
  };

  return (
    <div className="p-6 min-h-screen space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Laptop size={24} /> Devices
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Manage and monitor all network devices
          </p>
        </div>

        {activeTab === "devices" && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-2.5 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-3 py-2 w-48 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option>All</option>
              <option>Online</option>
              <option>Offline</option>
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("devices")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "devices"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          My Devices ({devices.length})
        </button>
        {canOnboard() && (
          <button
            onClick={() => setActiveTab("onboard")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "onboard"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Onboard ({onboardDevices.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading...</div>
      ) : activeTab === "devices" ? (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-6 py-3 text-left">Device</th>
                  <th className="px-6 py-3 text-left">Serial Number</th>
                  <th className="px-6 py-3 text-left">IP</th>
                  <th className="px-6 py-3 text-left">Model</th>
                   <th className="px-6 py-3 text-left">MAC Address</th>
                     <th className="px-6 py-3 text-left">Last Checkin</th>
                      <th className="px-6 py-3 text-left">Uptime</th>
                       <th className="px-6 py-3 text-left">CPU Load</th>
                        <th className="px-6 py-3 text-left">Firmware version</th>
                         <th className="px-6 py-3 text-left">Upload</th>
                  {user?.role !== "USER" && (
                    <th className="px-6 py-3 text-left">Organization</th>
                  )}
                  <th className="px-6 py-3 text-left">Assigned To</th>
                  <th className="px-6 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedDevices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      No devices found
                    </td>
                  </tr>
                ) : (
                  paginatedDevices.map((device) => (
                    <tr
                      key={device.id}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                      onClick={() => navigate(`/devices/${device.id}`)}
                    >
                      <td className="px-6 py-4 font-medium">
                        {device.name || device.serialNumber}
                      </td>
                      <td className="px-6 py-4">{device.serialNumber}</td>
                      <td className="px-6 py-4">{device.ipAddress || "-"}</td>
                      <td className="px-6 py-4">{device.model || "-"}</td>
                      {user?.role !== "USER" && (
                        <td className="px-6 py-4">
                          {device.orgs?.name || "-"}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        {device.assignedTo?.name || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                            statusStyles[device.status] || statusStyles.unknown
                          }`}
                        >
                          {device.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-end gap-2">
              {[...Array(totalPages)].map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index + 1)}
                  className={`px-3 py-1 rounded-md border ${
                    currentPage === index + 1
                      ? "bg-indigo-600 text-white"
                      : "bg-white hover:bg-gray-100"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Onboard Tab */
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-6 py-3 text-left">Serial Number</th>
                <th className="px-6 py-3 text-left">Model</th>
                <th className="px-6 py-3 text-left">MAC Address</th>
                <th className="px-6 py-3 text-left">IP Address</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">First Seen</th>
                <th className="px-6 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {onboardDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    No unassigned devices
                  </td>
                </tr>
              ) : (
                onboardDevices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                    <td className="px-6 py-4 font-medium">
                      {device.serialNumber}
                    </td>
                    <td className="px-6 py-4">{device.model || "-"}</td>
                    <td className="px-6 py-4">{device.macAddress || "-"}</td>
                    <td className="px-6 py-4">{device.ipAddress || "-"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                          statusStyles[device.status] || statusStyles.unknown
                        }`}
                      >
                        {device.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(device.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setAssignModal(device)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {assignModal && (
        <AssignModal
          isOpen={!!assignModal}
          onClose={() => setAssignModal(null)}
          device={assignModal}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
};

export default DevicesPage;
