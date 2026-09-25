import mqtt from "mqtt";
import { readFileSync } from "fs";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtts://mosquitto:8883";
const client = mqtt.connect(MQTT_BROKER_URL, {
    ca: readFileSync("./certs/ca.crt"),
    cert: readFileSync("./certs/client.crt"),
    key: readFileSync("./certs/client.key"),
});
client.on("connect", () => {
    console.log("mqtt connect with Tls");
});
client.on("error", (error) => {
    console.log("mqtt error", error.message);
});
export default client;
//# sourceMappingURL=mqttConfig.js.map