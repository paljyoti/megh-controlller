import { useEffect, useState } from "react";
import { ArrowLeft, Server, Activity, AlertCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, canSendCommands } from "../services/api";

interface Device {
  id: string;
  name: string | null;
  serialNumber: string;
  model: string | null;
  ipAddress: string | null;
  status: string;
  assignedTo?: { id: string; name: string; email: string } | null;
}

interface OrgData {
  id: string;
  name: string;
  createdAt: string;
  devices: Device[];
  users: { id: string; name: string; email: string; role: string }[];
  _count: { devices: number; users: number };
}

const statusStyles: Record<string, string> = {
  online: "bg-green-100 text-green-700",
  offline: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-700",
};

const OrganizationDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrg = async () => {
    if (!id) return;
    try {
      const res = await api.getOrgDetails(id);
      setOrg(res.data.data.org);
    } catch {
      console.error("Failed to fetch org details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUnassign = async (deviceId: string) => {
    if (!confirm("Are you sure you want to unassign this device?")) return;
    try {
      await api.unassignDevice(deviceId);
      fetchOrg();
    } catch {
      alert("Failed to unassign device");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate("/organizations")}
          className="flex items-center gap-2 text-sm text-gray-600 mb-4"
        >
          <ArrowLeft size={16} />
          Back to Organizations
        </button>
        <p className="text-gray-500">Organization not found</p>
      </div>
    );
  }

  const onlineCount = org.devices.filter((d) => d.status === "online").length;
  const offlineCount = org.devices.length - onlineCount;

  return (
    <div className="p-6 space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/organizations")}
        className="flex items-center gap-2 text-sm text-gray-600"
      >
        <ArrowLeft size={16} />
        Back to Organizations
      </button>

      {/* Title */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <p className="text-gray-500 text-sm">
            {org._count.users} users | {org._count.devices} devices
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Created
          <div className="font-medium">
            {new Date(org.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 flex justify-between">
          <div>
            <p className="text-gray-500 text-sm">Total Devices</p>
            <h2 className="text-xl font-semibold">{org.devices.length}</h2>
          </div>
          <Server className="text-gray-400" />
        </div>

        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 flex justify-between">
          <div>
            <p className="text-gray-500 text-sm">Online Devices</p>
            <h2 className="text-green-600 text-xl font-semibold">
              {onlineCount}
            </h2>
          </div>
          <Activity className="text-gray-400" />
        </div>

        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 flex justify-between">
          <div>
            <p className="text-gray-500 text-sm">Offline</p>
            <h2 className="text-red-500 text-xl font-semibold">
              {offlineCount}
            </h2>
          </div>
          <AlertCircle className="text-gray-400" />
        </div>
      </div>

      {/* Devices */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
        <h2 className="font-semibold">Devices</h2>
        <p className="text-sm text-gray-500 mb-4">
          All network devices in this organization
        </p>

        {org.devices.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            No devices assigned to this organization
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left">Device</th>
                  <th className="px-4 py-3 text-left">Serial Number</th>
                  <th className="px-4 py-3 text-left">Model</th>
                  <th className="px-4 py-3 text-left">IP</th>
                  <th className="px-4 py-3 text-left">Assigned To</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  {canSendCommands() && (
                    <th className="px-4 py-3 text-left">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {org.devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                    <td
                      className="px-4 py-3 font-medium cursor-pointer text-blue-600 hover:underline"
                      onClick={() =>
                        navigate(`/organizations/${id}/switch/${device.id}`)
                      }
                    >
                      {device.name || device.serialNumber}
                    </td>
                    <td className="px-4 py-3">{device.serialNumber}</td>
                    <td className="px-4 py-3">{device.model || "-"}</td>
                    <td className="px-4 py-3">{device.ipAddress || "-"}</td>
                    <td className="px-4 py-3">
                      {device.assignedTo?.name || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                          statusStyles[device.status] || statusStyles.unknown
                        }`}
                      >
                        {device.status}
                      </span>
                    </td>
                    {canSendCommands() && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleUnassign(device.id)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100"
                        >
                          Unassign
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
        <h2 className="font-semibold">Users</h2>
        <p className="text-sm text-gray-500 mb-4">
          Users in this organization
        </p>

        {org.users.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No users</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {org.users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          u.role === "SUPERADMIN"
                            ? "bg-purple-100 text-purple-700"
                            : u.role === "ADMIN"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizationDetails;
