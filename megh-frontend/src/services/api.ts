import axios from "axios";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `http://${window.location.hostname}:8082`;

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const api = {
  login: (email: string, password: string) =>
    apiClient.post("/user/login", { email, password }),

  logout: () => apiClient.post("/user/logout"),

  getAllDevices: () => apiClient.get("/device"),

  getOnboardDevices: () => apiClient.get("/device/onboard"),

  assignDevice: (deviceId: string, organizationId?: string, userId?: string) =>
    apiClient.post("/device/assign", { deviceId, organizationId, userId }),

  unassignDevice: (deviceId: string) =>
    apiClient.post("/device/unassign", { deviceId }),

  getDeviceTelemetry: (id: string) => apiClient.get(`/device/${id}/telemetry`),

  getDeviceEvents: (id: string, limit = 50) =>
    apiClient.get(`/device/${id}/events`, { params: { limit } }),

  getDeviceStatus: (id: string) => apiClient.get(`/device/${id}/status`),

  getDeviceStatusHistory: (id: string, limit = 50) =>
    apiClient.get(`/device/${id}/status-history`, { params: { limit } }),

  sendCommand: (id: string, command: string, params = {}) =>
    apiClient.post(`/device/${id}/command`, { command, params }),

  fileTransfer: (id: string, data: Record<string, string>) =>
    apiClient.post(`/device/${id}/file-transfer`, data),

  getCommandStatus: (id: string, requestId: string) =>
    apiClient.get(`/device/${id}/command/${requestId}`),

  getVlans: (id: string) => apiClient.get(`/device/${id}/vlan`),

  createVlan: (id: string, vlanId: number, name?: string) =>
    apiClient.post(`/device/${id}/vlan`, { vlanId, name }),

  updateVlan: (id: string, vlanId: number, data: { name: string }) =>
    apiClient.patch(`/device/${id}/vlan/${vlanId}`, data),

  deleteVlan: (id: string, vlanId: number) =>
    apiClient.delete(`/device/${id}/vlan/${vlanId}`),

  getPorts: (id: string) => apiClient.get(`/device/${id}/ports`),

  updatePort: (
    id: string,
    name: string,
    data: { description?: string | null; portType?: "access" | "trunk"; vlanId?: number }
  ) => apiClient.patch(`/device/${id}/ports`, { name, ...data }),

  getAllOrgs: () => apiClient.get("/orgs/all"),

  createOrg: (name: string) => apiClient.post("/orgs/create-orgs", { name }),

  getOrgDetails: (orgId: string) => apiClient.get(`/orgs/${orgId}/details`),

  getOrgUsers: (orgId: string) => apiClient.get(`/orgs/${orgId}/users`),

  getAllDepts: () => apiClient.get("/orgs/getAllDepartment"),

  createDept: (name: string) => apiClient.post("/dept/create-dept", { name }),

  register: (data: Record<string, string>) =>
    apiClient.post("/user/register", data),

  getAllUsers: () => apiClient.get("/user/all"),

  getAllAlarms: (params?: { status?: string; severity?: string; limit?: number }) =>
    apiClient.get("/alarm", { params }),

  getAlarmSummary: () => apiClient.get("/alarm/summary"),

  getDeviceAlarms: (id: string, limit = 50) =>
    apiClient.get(`/alarm/device/${id}`, { params: { limit } }),

  acknowledgeAlarm: (id: string) =>
    apiClient.patch(`/alarm/${id}/acknowledge`),

  resolveAlarm: (id: string) => apiClient.patch(`/alarm/${id}/resolve`),
};

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "USER";
  orgs?: { id: string; name: string } | null;
  dept?: { id: string; name: string } | null;
}

export const getUser = (): UserInfo | null => {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  return JSON.parse(raw);
};

export const canSendCommands = (): boolean => {
  const user = getUser();
  return user?.role === "SUPERADMIN" || user?.role === "ADMIN";
};

export const canOnboard = (): boolean => {
  const user = getUser();
  return user?.role === "SUPERADMIN" || user?.role === "ADMIN";
};

export default apiClient;
