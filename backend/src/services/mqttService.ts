import client from "../config/mqttConfig.js";
import { parseTopic } from "../utils/topicParser.js";
import telemetryHandler from "../handlers/telemetryHandler.js";
import eventHandler from "../handlers/eventHandler.js";
import statusHandler from "../handlers/statusHandler.js";
import fileHandler from "../handlers/fileHandler.js";
import firstSeenHandler from "../handlers/firstSeenHandler.js";
import responseHandler from "../handlers/responseHandler.js";

import type {
  TelemetryPayload,
  EventPayload,
  StatusPayload,
  FirstSeenPayload,
  CommandResponsePayload,
} from "../interfaces/mqttInterface.js";

/*
  startMQTT - subscribes to all MQTT topics defined in the spec and routes
  incoming messages to the correct handler.
 
  Topics (Switch → Platform):
    switch/<sn>/first_seen   - device discovery / boot
    switch/<sn>/telemetry    - system + interface metrics (every ~30s)
    switch/<sn>/event        - async notifications (port_up, port_down, etc.)
    switch/<sn>/status       - lifecycle state (online/offline/rebooting)
    switch/<sn>/response     - command + file_transfer responses
 
  Topics (Platform → Switch) - published by deviceController:
    switch/<sn>/request      - command requests
    switch/<sn>/file_transfer - firmware / config file operations
    switch/all/request       - broadcast command to all switches
 */


    
const startMQTT = () => {
  client.on("connect", () => {
    console.log("[MQTT] Connected to broker");

    // Subscribe using MQTT wildcard '+' to catch all device serial numbers
    client.subscribe("switch/+/first_seen", { qos: 1 });
    client.subscribe("switch/+/telemetry", { qos: 1 });
    client.subscribe("switch/+/event", { qos: 1 });
    client.subscribe("switch/+/status", { qos: 1 });
    client.subscribe("switch/+/response", { qos: 1 });

    console.log("[MQTT] Subscribed to all spec topics");
  });

  client.on("message", async (topic: string, message: Buffer) => {
    let data: unknown;

    try {
      data = JSON.parse(message.toString());
      console.log("data of switch",data);
    } catch {
      console.error(`[MQTT] Failed to parse JSON on topic ${topic}: ${message.toString()}`);
      return;
    }

    // Parse topic to extract serialNumber and message type
    const parsed = parseTopic(topic);
    if (!parsed) {
      console.warn(`[MQTT] Could not parse topic: ${topic}`);
      return;
    }

    const { serialNumber, type } = parsed;

    console.log(`[MQTT] Message on ${topic} from ${serialNumber}`);

    switch (type) {
      case "first_seen":
        await firstSeenHandler(serialNumber, data as FirstSeenPayload);
        break;

      case "telemetry":
        await telemetryHandler(serialNumber, data as TelemetryPayload);
        break;

      case "event":
        await eventHandler(serialNumber, data as EventPayload);
        break;

      case "status":
        await statusHandler(serialNumber, data as StatusPayload);
        break;

      case "response":
        await responseHandler(serialNumber, data as CommandResponsePayload);
        break;

      default:
        console.warn(`[MQTT] Unhandled topic type "${type}" on topic ${topic}`);
    }
  });

  client.on("error", (error: Error) => {
    console.error("[MQTT] Client error:", error.message);
  });

  client.on("disconnect", () => {
    console.warn("[MQTT] Disconnected from broker");
  });

};

export default startMQTT;
