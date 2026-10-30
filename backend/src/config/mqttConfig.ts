import  mqtt  from "mqtt" ;
import { readFileSync } from "fs";
import { join } from "path";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtts://megh.techroutes.com:8883";
// Directory holding ca.crt, client.crt and client.key. In Docker it is mounted read-only at
// runtime (see docker-compose.yml) so the keys are never baked into the image; defaults to
// ./certs for local `npm run dev`.
const MQTT_CERT_DIR = process.env.MQTT_CERT_DIR || "./certs";

const client = mqtt.connect(MQTT_BROKER_URL,{
    ca: readFileSync(join(MQTT_CERT_DIR, "ca.crt")),
    cert: readFileSync(join(MQTT_CERT_DIR, "client.crt")),
    key: readFileSync(join(MQTT_CERT_DIR, "client.key")),
});

client.on("connect",()=>{
    console.log("mqtt connect with Tls")
});

client.on("error",(error:Error)=>{
console.log("mqtt error",error.message);
});


export default client;
