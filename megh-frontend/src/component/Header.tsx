import { Menu, User, LogOut, Sun, Moon, Bell } from "lucide-react";
import logo from "../assets/logo_blue.png";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "../services/api";
import { useTheme } from "../context/ThemeContext";

type Props = {
  setOpen: (value: boolean) => void;
};

const roleBadgeStyles: Record<string, string> = {
  SUPERADMIN: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  USER: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const Header = ({ setOpen }: Props) => {
  const navigate = useNavigate();
  const user = getUser();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // proceed even if API fails
    }
    localStorage.clear();
    navigate("/login");
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center px-4 md:px-6 z-50 transition-colors duration-200">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="md:hidden text-gray-600 dark:text-gray-300"
        >
          <Menu size={22} />
        </button>
        <img src={logo} alt="logo" className="h-12 object-contain" />
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* Notification Bell */}
        <button className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            5
          </span>
        </button>

        {/* Role Badge */}
        <span
          className={`hidden md:block px-2.5 py-1 rounded text-xs font-medium ${
            roleBadgeStyles[user?.role || "USER"] || roleBadgeStyles.USER
          }`}
        >
          {user?.role || "USER"}
        </span>

        {/* User */}
        <div className="hidden sm:flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
          <User size={16} />
          <span className="max-w-[120px] truncate">{user?.name || "User"}</span>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition text-sm font-medium"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Header;
