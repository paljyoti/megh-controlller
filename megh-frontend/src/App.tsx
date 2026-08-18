import Header from "./component/Header";
import Sidebar from "./component/Sidebar";
import { Outlet, Navigate } from "react-router-dom";
import { useState } from "react";

function App() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hasAuth =
    localStorage.getItem("isLoggedIn") === "true" &&
    localStorage.getItem("user");

  if (!hasAuth) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="bg-gray-50 dark:bg-slate-900 min-h-screen text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <Header setOpen={setOpen} />
      <Sidebar open={open} setOpen={setOpen} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className={`pt-16 transition-all duration-200 ${collapsed ? "md:ml-16" : "md:ml-60"}`}>
        <div className="p-4 pt-3">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default App;
