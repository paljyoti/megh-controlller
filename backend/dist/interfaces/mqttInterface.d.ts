export interface FirstSeenPayload {
    serial_number: string;
    mac_address: string;
    model: string;
    hardware_version: string;
    software_version: string;
    ip_address: string;
    timestamp: number;
}
export interface InterfaceStatPayload {
    port: string;
    status: string;
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
export interface EventPayload {
    event: string;
    timestamp: number;
    data: {
        port?: string;
        [key: string]: unknown;
    };
}
export interface StatusPayload {
    status: string;
    uptime: number;
    software_version?: string;
}
export type CommandMode = "exec" | "config";
export interface CommandRequestPayload {
    request_id: string;
    command: string;
    mode: CommandMode;
    params: Record<string, unknown>;
}
export interface CommandResponsePayload {
    request_id: string;
    status: number;
    message: string;
    data: unknown;
}
export type FileType = "firmware" | "backup_configuration" | "restore_configuration" | "restore_certificate" | "restore_privateKey";
export type ChecksumAlgorithm = "MD5" | "SHA1" | "SHA256" | "SHA512";
export interface FileTransferPayload {
    request_id: string;
    file_type: FileType;
    file_url: string;
    algorithm: ChecksumAlgorithm;
    checksum: string;
    version?: string | undefined;
}
export interface FileTransferProgressPayload {
    request_id: string;
    status: number;
    message: string;
    data: {
        progress?: number;
    };
}
//# sourceMappingURL=mqttInterface.d.ts.map