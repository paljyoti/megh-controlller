import { useState } from "react";
import {
  LayoutDashboard,
  Building,
  Cpu,
  Users,
  Network,
  // Activity,
  // Bell,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUser } from "../services/api";

type Props = {
  open: boolean;
  setOpen: (value: boolean) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
};

type MenuItem = {
  label: string;
  icon: React.ReactNode;
  path?: string;
  adminOnly?: boolean;
  children?: { label: string; path: string }[];
};

const menuItems: MenuItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard size={18} />, path: "/dashboard" },
  { label: "Devices", icon: <Cpu size={18} />, path: "/devices" },
  { label: "Topology", icon: <Network size={18} />, path: "/topology" },

  // {
  //   label: "Monitoring",
  //   icon: <Activity size={18} />,
  //   children: [
  //     { label: "Performance", path: "/monitoring/performance" },
  //     { label: "Traffic", path: "/monitoring/traffic" },
  //   ],
  // },
  // {
  //   label: "Alarms",
  //   icon: <Bell size={18} />,
  //   children: [
  //     { label: "Active", path: "/alarms/active" },
  //     { label: "History", path: "/alarms/history" },
  //   ],
  // },

  { label: "Organizations", icon: <Building size={18} />, path: "/organizations", adminOnly: true },
  { label: "Users", icon: <Users size={18} />, path: "/users", adminOnly: true },
];

const Sidebar = ({ open, setOpen, collapsed, setCollapsed }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const isAdminOrAbove = user?.role === "SUPERADMIN" || user?.role === "ADMIN";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const isActive = (item: MenuItem): boolean => {
    if (item.path) return location.pathname === item.path;
    if (item.children) return item.children.some((c) => location.pathname.startsWith(c.path));
    return false;
  };

  const toggleExpand = (label: string) => {
    if (collapsed) {
      setCollapsed(false);
    }
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const sidebarWidth = collapsed ? "w-16" : "w-60";

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/40 md:hidden z-40"
        />
      )}

      <div
        className={`
          fixed top-16 left-0 h-[calc(100vh-64px)] ${sidebarWidth} z-50
          bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700
          transition-all duration-200 overflow-y-auto overflow-x-hidden
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Collapse toggle - desktop only */}
        <div className="hidden md:flex justify-end p-2 border-b border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className={`p-2 space-y-1 ${collapsed ? "px-1.5" : ""}`}>
          {menuItems.map((item) => {
            if (item.adminOnly && !isAdminOrAbove) return null;

            const active = isActive(item);
            const isExpanded = expanded[item.label] || false;

            if (item.children) {
              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleExpand(item.label)}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center ${collapsed ? "justify-center" : "justify-between"} px-3 py-2.5 rounded-lg text-sm transition-colors
                      ${active
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      {!collapsed && <span>{item.label}</span>}
                    </div>
                    {!collapsed && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      />
                    )}
                  </button>
                  {!collapsed && (
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        isExpanded ? "max-h-96" : "max-h-0"
                      }`}
                    >
                      <div className="ml-8 mt-1 space-y-1">
                        {item.children.map((child) => (
                          <button
                            key={child.path}
                            onClick={() => handleNav(child.path)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                              ${location.pathname === child.path
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                              }`}
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={item.label}
                onClick={() => handleNav(item.path!)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center ${collapsed ? "justify-center" : ""} gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                  ${active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                  }`}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
