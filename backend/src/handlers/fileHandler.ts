import type { CommandResponsePayload } from "../interfaces/mqttInterface.js";
import responseHandler from "./responseHandler.js";

/*
  Handles switch/<sn>/file_transfer responses
 
  Per spec, file transfer results arrive on switch/<sn>/response (not /file_transfer).
  This handler handles any direct file_transfer topic messages (e.g. progress notifications).
  The actual response/completion is handled by responseHandler.
 */
const fileHandler = async (serialNumber: string, data: CommandResponsePayload) => {
  try {
    console.log(`[fileHandler] File transfer message from ${serialNumber}:`, data);
    // Delegate to responseHandler since file_transfer responses share the same format
    await responseHandler(serialNumber, data);
  } catch (err) {
    console.error(`[fileHandler] Error handling file transfer message for ${serialNumber}:`, err);
  }
};

export default fileHandler;
