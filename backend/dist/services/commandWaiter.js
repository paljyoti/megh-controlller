import { EventEmitter } from "events";
/*
  Bridges the async MQTT request/response cycle back into a Promise so an
  HTTP handler can await a switch's reply to a specific request_id instead
  of returning immediately. responseHandler.ts calls notifyResponse() once
  the switch's response lands on switch/<sn>/response.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(100);
const waitForResponse = (requestId, timeoutMs = 15000) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            emitter.removeListener(requestId, onResponse);
            reject(new Error("Timed out waiting for device response"));
        }, timeoutMs);
        function onResponse(data) {
            clearTimeout(timer);
            resolve(data);
        }
        emitter.once(requestId, onResponse);
    });
};
const notifyResponse = (requestId, data) => {
    emitter.emit(requestId, data);
};
export { waitForResponse, notifyResponse };
//# sourceMappingURL=commandWaiter.js.map