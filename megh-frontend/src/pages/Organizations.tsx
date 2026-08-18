import {
  Plus,
  Building2,
  Calendar,
  Monitor,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "../services/api";

interface Organization {
  id: string;
  name: string;
  _count?: { devices: number; users: number };
  createdAt?: string;
}

const Organizations = () => {
  const navigate = useNavigate();
  const user = getUser();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [createError, setCreateError] = useState("");

  const fetchOrgs = async () => {
    try {
      const res = await api.getAllOrgs();
      setOrgs(res.data.data.orgs);
    } catch {
      // may fail for non-SUPERADMIN
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== "SUPERADMIN" && user?.role !== "ADMIN") {
      navigate("/dashboard");
      return;
    }
    fetchOrgs();
  }, [navigate, user?.role]);

  const handleCreate = async () => {
    if (!newOrgName.trim()) return;
    setCreateError("");
    try {
      await api.createOrg(newOrgName.trim());
      setNewOrgName("");
      setShowCreate(false);
      fetchOrgs();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setCreateError(axiosErr.response?.data?.message || "Failed to create");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold">
            Organizations
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm">
            Manage all organizations in the system
          </p>
        </div>

        {user?.role === "SUPERADMIN" && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 w-full sm:w-auto"
          >
            <Plus size={18} />
            Add Organization
          </button>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
              Create Organization
            </h2>
            {createError && (
              <p className="text-red-500 text-sm mb-3">{createError}</p>
            )}
            <input
              type="text"
              placeholder="Organization Name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewOrgName("");
                  setCreateError("");
                }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-6">
        {orgs.length === 0 ? (
          <p className="text-gray-400 col-span-full text-center py-10">
            No organizations yet
          </p>
        ) : (
          orgs.map((org) => (
            <div
              key={org.id}
              onClick={() => navigate(`/organizations/${org.id}`)}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md transition cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className="bg-purple-100 p-2 md:p-3 rounded-lg">
                  <Building2 size={20} />
                </div>
              </div>

              <h2 className="font-semibold mt-4 text-sm md:text-base">
                {org.name}
              </h2>

              <div className="mt-4 space-y-2">
                <div className="flex justify-between bg-gray-100 dark:bg-slate-700 p-2 rounded">
                  <span className="flex items-center gap-2 text-sm">
                    <Monitor size={14} /> Devices
                  </span>
                  <span>{org._count?.devices ?? "-"}</span>
                </div>
                <div className="flex justify-between bg-gray-100 dark:bg-slate-700 p-2 rounded">
                  <span className="flex items-center gap-2 text-sm">
                    <Users size={14} /> Users
                  </span>
                  <span>{org._count?.users ?? "-"}</span>
                </div>
              </div>

              {org.createdAt && (
                <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500 mt-4">
                  <Calendar size={16} />
                  Created: {new Date(org.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Organizations;
