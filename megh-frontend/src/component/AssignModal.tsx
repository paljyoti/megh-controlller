import React, { useEffect, useState } from "react";
import { api, getUser } from "../services/api";

interface AssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: { id: string; serialNumber: string; name: string | null };
  onAssigned: () => void;
}

interface Org {
  id: string;
  name: string;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
}

const AssignModal: React.FC<AssignModalProps> = ({
  isOpen,
  onClose,
  device,
  onAssigned,
}) => {
  const user = getUser();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedOrg("");
    setSelectedUser("");
    setError("");

    if (user?.role === "SUPERADMIN") {
      api.getAllOrgs().then((res) => setOrgs(res.data.data.orgs));
    } else if (user?.role === "ADMIN" && user.orgs?.id) {
      setSelectedOrg(user.orgs.id);
      api.getOrgUsers(user.orgs.id).then((res) => setUsers(res.data.data.users));
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedOrg && user?.role === "SUPERADMIN") {
      api.getOrgUsers(selectedOrg).then((res) => setUsers(res.data.data.users));
    }
  }, [selectedOrg]);

  const handleAssign = async () => {
    setLoading(true);
    setError("");
    try {
      const orgId = user?.role === "SUPERADMIN" ? selectedOrg : undefined;
      await api.assignDevice(device.id, orgId, selectedUser || undefined);
      onAssigned();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
          Assign Device: {device.name || device.serialNumber}
        </h2>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        {user?.role === "SUPERADMIN" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Organization
            </label>
            <select
              value={selectedOrg}
              onChange={(e) => {
                setSelectedOrg(e.target.value);
                setSelectedUser("");
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select Organization</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {user?.role === "ADMIN" && user.orgs && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Organization
            </label>
            <input
              value={user.orgs.name}
              disabled
              className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-100"
            />
          </div>
        )}

        {(selectedOrg || user?.role === "ADMIN") && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Assign to User (Optional)
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">No specific user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={loading || (user?.role === "SUPERADMIN" && !selectedOrg)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Assigning..." : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignModal;
