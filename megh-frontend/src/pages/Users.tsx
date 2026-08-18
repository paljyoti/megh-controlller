import React, { useEffect, useMemo, useState } from "react";
import { Users, Search, Plus } from "lucide-react";
import { api, getUser } from "../services/api";

type Role = "SUPERADMIN" | "ADMIN" | "USER";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgs?: { id: string; name: string } | null;
  dept?: { id: string; name: string } | null;
  createdAt: string;
}

interface Org {
  id: string;
  name: string;
}

const roleStyles: Record<Role, string> = {
  SUPERADMIN: "bg-purple-100 text-purple-700",
  ADMIN: "bg-blue-100 text-blue-700",
  USER: "bg-green-100 text-green-700",
};

const UsersPage: React.FC = () => {
  const currentUser = getUser();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const [showCreate, setShowCreate] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "USER" as string,
    orgsId: "",
  });
  
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.getAllUsers();
      setUsers(res.data.data.users);
    } catch {
      console.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenCreate = async () => {
    setShowCreate(true);
    setCreateError("");
    setNewUser({ name: "", email: "", password: "", role: "USER", orgsId: "" });

    if (currentUser?.role === "SUPERADMIN") {
      try {
        const res = await api.getAllOrgs();
        setOrgs(res.data.data.orgs);
      } catch {
        // ignore
      }
    } else if (currentUser?.role === "ADMIN" && currentUser.orgs?.id) {
      setNewUser((prev) => ({ ...prev, orgsId: currentUser.orgs!.id }));
    }
  };

  const handleCreate = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      setCreateError("Name, email and password are required");
      return;
    }
    if ((newUser.role === "ADMIN" || newUser.role === "USER") && !newUser.orgsId) {
      setCreateError("Organization is required for ADMIN/USER");
      return;
    }

    setCreateLoading(true);
    setCreateError("");
    try {
      const data: Record<string, string> = {
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
      };
      if (newUser.orgsId) data.orgsId = newUser.orgsId;

      await api.register(data);
      setShowCreate(false);
      fetchUsers();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setCreateError(axiosErr.response?.data?.message || "Failed to create user");
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users size={24} /> Users
          </h1>
          <p className="text-gray-500 text-sm">
            Manage all users across organizations
          </p>
        </div>

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
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 w-48 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            <option value="SUPERADMIN">SUPERADMIN</option>
            <option value="ADMIN">ADMIN</option>
            <option value="USER">USER</option>
          </select>

          <button
            onClick={handleOpenCreate}
            className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            Add User
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
            <tr>
              <th className="text-left px-6 py-3">User</th>
              <th className="text-left px-6 py-3">Email</th>
              <th className="text-left px-6 py-3">Role</th>
              <th className="text-left px-6 py-3">Organization</th>
              <th className="text-left px-6 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="px-6 py-4 font-medium">{user.name}</td>
                  <td className="px-6 py-4 text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${roleStyles[user.role]}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.orgs?.name || "-"}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">Create User</h2>

            {createError && (
              <p className="text-red-500 text-sm mb-3">{createError}</p>
            )}

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
                className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
                className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="password"
                placeholder="Password (min 8 chars, uppercase, number, special)"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <select
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({ ...newUser, role: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {currentUser?.role === "SUPERADMIN" && (
                  <option value="ADMIN">ADMIN</option>
                )}
                <option value="USER">USER</option>
              </select>

              {currentUser?.role === "SUPERADMIN" && (
                <select
                  value={newUser.orgsId}
                  onChange={(e) =>
                    setNewUser({ ...newUser, orgsId: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select Organization</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}

              {currentUser?.role === "ADMIN" && currentUser.orgs && (
                <input
                  value={currentUser.orgs.name}
                  disabled
                  className="w-full border rounded-lg px-4 py-2 text-sm bg-gray-100"
                />
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createLoading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
