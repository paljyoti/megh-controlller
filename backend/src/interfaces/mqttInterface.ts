// MQTT payload interfaces matching the client MQTT Interface Specification
// First Seen (Device Discovery)
// Topic: switch/<sn>/first_seen   Direction: Switch → Platform


export interface FirstSeenPayload {
  serial_number: string;
  mac_address: string;
  model: string;
  hardware_version: string;
  software_version: string;
  ip_address: string;
  timestamp: number;
}

// Telemetry 
// Topic: switch/<sn>/telemetry   Direction: Switch → Platform (every ~30s)
export interface InterfaceStatPayload {
  port: string;
  status: string;        // "up" | "down"
  mac_address?: string;
  ip_address?: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
}

export interface TelemetryPayload {
  timestamp: number;
  cpu_usage: number;
  memory_usage: number;
  temperature: number;
  serial_number: string;
  software_version: string;
  interfaces: InterfaceStatPayload[];
}

// Event Notification 
// Topic: switch/<sn>/event   Direction: Switch → Platform
export interface EventPayload {
  event: string;          // e.g. "port_up" | "port_down"
  timestamp: number;
  data: {
    port?: string;
    [key: string]: unknown;
  };
}

// Status Reporting 
// Topic: switch/<sn>/status   Direction: Switch → Platform
// Offline is implemented via MQTT LWT (uptime = 0)
export interface StatusPayload {
  status: string;         // "online" | "offline" | "rebooting"
  uptime: number;
  software_version?: string;
}

// Command Request
// Topic: switch/<sn>/request OR switch/all/request   Direction: Platform → Switch
export type CommandMode = "exec" | "config";

export interface CommandRequestPayload {
  request_id: string;
  command: string;
  mode: CommandMode;
  params: Record<string, unknown>;
}

// Command Response
// Topic: switch/<sn>/response   Direction: Switch → Platform
// Status codes: 0=Success, 1=Invalid cmd, 2=Invalid params, 3=Exec failed, 4=Busy, 5=Internal error
export interface CommandResponsePayload {
  request_id: string;
  status: number;
  message: string;
  data: unknown;
}

// File Transfer Request 
// Topic: switch/<sn>/file_transfer   Direction: Platform → Switch
// Response comes back on switch/<sn>/response
export type FileType =
  | "firmware"
  | "backup_configuration"
  | "restore_configuration"
  | "restore_certificate"
  | "restore_privateKey";

export type ChecksumAlgorithm = "MD5" | "SHA1" | "SHA256" | "SHA512";

export interface FileTransferPayload {
  request_id: string;
  file_type: FileType;
  file_url: string;
  algorithm: ChecksumAlgorithm;
  checksum: string;
  version?: string | undefined;
}

// File Transfer Progress (progress reply on /response)
export interface FileTransferProgressPayload {
  request_id: string;
  status: number;       // 4 = busy / in-progress
  message: string;
  data: {
    progress?: number; // 0-100 percentage
  };
}
