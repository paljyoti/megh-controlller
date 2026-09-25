import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import deviceRoutes from "./routes/deviceRoutes.js";
import vlanRoutes from "./routes/vlanRoutes.js";
import portRoutes from "./routes/portRoutes.js";
import routeConfigRoutes from "./routes/routeConfigRoutes.js";
import portSecurityMacRoutes from "./routes/portSecurityMacRoutes.js";
import dhcpRoutes from "./routes/dhcpRoutes.js";
import linkAggregationRoutes from "./routes/linkAggregationRoutes.js";
import l3InterfaceRoutes from "./routes/l3InterfaceRoutes.js";
import poeRoutes from "./routes/poeRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import loopDetectRoutes from "./routes/loopDetectRoutes.js";
import stpRoutes from "./routes/stpRoutes.js";
import orgsRoutes from "./routes/orgsRoutes.js";
import deptsRoutes from "./routes/departmentRoutes.js";
import alarmRoutes from "./routes/alarmRoutes.js";
import topologyRoutes from "./routes/topologyRoutes.js";
import { verifyUser } from "./middlewares/authMiddleware.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import startMQTT from "./services/mqttService.js";
import { startTopologyPoller } from "./services/topology/topologyPoller.js";

dotenv.config();
const app = express();

const allowedOrigins = process.env.CLIENT_URLS?.split(",");
console.log("allowed url", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins?.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Health check
app.get("/health", (req, res) => {
  res.send(`<h1>perfectly fine!</h1>`);
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/orgs", orgsRoutes);
app.use("/api/v1/dept", deptsRoutes);
app.use("/api/v1/device", deviceRoutes);   // ← mounted (was missing before)
app.use("/api/v1/device/:id/vlan", vlanRoutes);
app.use("/api/v1/device/:id/ports", portRoutes);
app.use("/api/v1/device/:id/route-config", routeConfigRoutes);
app.use("/api/v1/device/:id/port-security-macs", portSecurityMacRoutes);
app.use("/api/v1/device/:id/dhcp-pool", dhcpRoutes);
app.use("/api/v1/device/:id/link-aggregation", linkAggregationRoutes);
app.use("/api/v1/device/:id/l3-interfaces", l3InterfaceRoutes);
app.use("/api/v1/device/:id/poe", poeRoutes);
app.use("/api/v1/device/:id/system", systemRoutes);
app.use("/api/v1/device/:id/loop-detect", loopDetectRoutes);
app.use("/api/v1/device/:id/stp", stpRoutes);
app.use("/api/v1/alarm", alarmRoutes);
app.use("/api/v1/topology", topologyRoutes);

// Must be registered after all routes — Express only treats a 4-arg middleware as an
// error handler when it comes last in the chain.
app.use(errorHandler);

// ─── Start MQTT Service ───────────────────────────────────────────────────────
startMQTT();
// Read-only MAC-table discovery for the Topology page (see services/topology/topologyPoller.ts).
startTopologyPoller();

const PORT = process.env.PORT || 8082;

app.listen(8082, "0.0.0.0", () => {
  console.log("server is successfully running on port", PORT);
});
