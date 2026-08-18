export interface DeviceInfo {
  id: string;
  name: string | null;
  serialNumber: string;
  model: string | null;
  macAddress: string | null;
  hardwareVersion: string | null;
  softwareVersion: string | null;
  ipAddress: string | null;
  status: string;
}

export interface TelemetryData {
  cpuUsage: string;
  memoryUsage: string;
  temperature: string;
  timestamp: string;
  interfaceStats: {
    port: string;
    status: string;
    macAddress: string | null;
    rxBytes: string;
    txBytes: string;
  }[];
}

export interface StatusData {
  currentStatus: string;
  latestRecord: { uptime: string; softwareVersion: string | null } | null;
}
