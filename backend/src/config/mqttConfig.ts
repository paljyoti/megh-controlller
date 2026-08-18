import  mqtt  from "mqtt" ;
import { readFileSync } from "fs";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtts://172.16.0.23:8885";

const client = mqtt.connect(MQTT_BROKER_URL,{
    ca: readFileSync("./certs/ca.crt"),
    cert: readFileSync("./certs/client.crt"),
    key: readFileSync("./certs/client.key"),
});

client.on("connect",()=>{
    console.log("mqtt connect with Tls")
});

client.on("error",(error:Error)=>{
console.log("mqtt error",error.message);
});


export default client;
