import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import App from "./App";
import Dashboard from "./pages/Dashboard";
import Organizations from "./pages/Organizations";
import Devices from "./pages/Devices";
import Users from "./pages/Users";
import OrganizationDetails from "./pages/OrganizationDetails";
import Login from "./pages/Login";
import SwitchDetails from "./pages/SwitchDetails";
import PlaceholderPage from "./pages/PlaceholderPage";
import { ThemeProvider } from "./context/ThemeContext";

import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "organizations", element: <Organizations /> },
      { path: "organizations/:id", element: <OrganizationDetails /> },
      { path: "organizations/:id/switch/:switchId", element: <SwitchDetails /> },
      { path: "devices", element: <Devices /> },
      { path: "devices/:switchId", element: <SwitchDetails /> },
      { path: "users", element: <Users /> },
      { path: "topology", element: <PlaceholderPage title="Topology" /> },
      { path: "monitoring/performance", element: <PlaceholderPage title="Performance Monitoring" /> },
      { path: "monitoring/traffic", element: <PlaceholderPage title="Traffic Monitoring" /> },
      { path: "alarms/active", element: <PlaceholderPage title="Active Alarms" /> },
      { path: "alarms/history", element: <PlaceholderPage title="Alarm History" /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
);
