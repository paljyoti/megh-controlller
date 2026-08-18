# MeghTechRoute — Enterprise Network Management System
### Architecture Document

**Audience:** Engineering Lead / Technical Lead review
**Author:** Solution Architecture (drafted with codebase inventory, 2026-07-29)
**Scope:** `backend/`, `frontend/` (legacy), `megh-frontend/` (reference UI), `docker-compose.yml`

---

## 1. Executive Summary

MeghTechRoute is a multi-tenant network management platform in the same product category as Cisco DNA Center or Aruba Central: it onboards network switches, ingests their telemetry and events over a persistent transport, raises alarms, issues remote commands/firmware transfers, and exposes all of this through an RBAC-scoped web console organized by **Organization → Department → User → Device**.

The backend implementation is further along than the frontend. The device/telemetry/alarm/command pipeline over MQTT is fully built and reasonably close to production-grade. The frontend, however, currently exists as **two divergent codebases**:

| | `frontend/` | `megh-frontend/` |
|---|---|---|
| Git status | Tracked, has Dockerfile | **Untracked**, no Dockerfile |
| Deployed via `docker-compose.yml` | Yes | No |
| Wired to real backend API/RBAC | Partially — dashboard is mock data | Yes — `services/api.ts` mirrors the full real API |
| Recommendation | Treat as legacy / retire | **Treat as the reference UI going forward** |

This document describes the system as it is today, calls out the gaps explicitly, and proposes the target-state architecture to reconcile them. It is written to be read top-down by a Tech Lead deciding what to invest in next.

---

## 2. High-Level Architecture

```
                        ┌───────────────────────────┐
                        │   Network Switches (N)     │
                        │  MQTT client, mTLS          │
                        └──────────────┬──────────────┘
                                       │ mqtts:// (mTLS, port 8885)
                                       │ topics: switch/<sn>/{first_seen,telemetry,event,status,response}
                                       ▼
                        ┌───────────────────────────┐
                        │   MQTT Broker (external)   │
                        └──────────────┬──────────────┘
                                       │ subscribe (mqttService.ts)
                                       ▼
                 ┌─────────────────────────────────────────┐
                 │            Backend (Node/Express 5)       │
                 │  ┌───────────────────────────────────┐   │
                 │  │ handlers/  (per-topic MQTT logic)   │   │
                 │  │  firstSeen → telemetry → event →    │   │
                 │  │  status → response                  │   │
                 │  └───────────────┬───────────────────┘   │
                 │                  ▼                        │
                 │  ┌───────────────────────────────────┐   │
                 │  │  Prisma ORM  →  PostgreSQL           │   │
                 │  └───────────────────────────────────┘   │
                 │  ┌───────────────────────────────────┐   │
                 │  │ REST API  /api/v1/*                 │   │
                 │  │  (JWT + role-scoped controllers)     │   │
                 │  └───────────────┬───────────────────┘   │
                 └──────────────────┼─────────────────────────┘
                                    │ HTTPS (axios, withCredentials)
                                    ▼
                 ┌─────────────────────────────────────────┐
                 │  Frontend SPA (React 19 + Vite)           │
                 │  megh-frontend/ — reference UI             │
                 │  role-aware Sidebar, Org/Device/Alarm views│
                 └─────────────────────────────────────────┘
```

**Transport choice:** MQTT over mTLS was chosen over SNMP/polling — appropriate for switches behind NAT/firewalls that need to push telemetry/events without the platform having inbound reachability to every device. This is the same rationale DNA Center/Aruba Central use gRPC/streaming telemetry for, rather than legacy SNMP polling.

---

## 3. Backend Architecture

### 3.1 Runtime & bootstrap

- Express 5, `backend/src/index.ts`. CORS validated dynamically against `CLIENT_URLS` (comma-separated allowlist), `credentials: true` for cookie-based auth. `cookie-parser`, JSON body limit `16kb`.
- Health check at `GET /health` (used by the Docker healthcheck).
- MQTT connection (`startMQTT()`) is started fire-and-forget alongside `app.listen(8082, "0.0.0.0")`.
- **Known issue:** the app listens on a **hardcoded `8082`**, while `PORT` env is only used in the startup log line — deploying on a different port currently requires a code change, not just an env var. Flag for cleanup.

### 3.2 Layered structure

```
routes/        → thin HTTP-to-controller mapping, declares which endpoints require verifyUser/requireRole
controllers/   → request validation (zod), Prisma queries, RBAC scoping, response shaping
middlewares/   → authMiddleware (JWT verify + role gate)
handlers/      → MQTT message processors (one per topic), independent of HTTP request/response cycle
services/      → mqttService (subscribe/dispatch); deviceService.ts is currently an empty stub
db/            → Prisma client singleton; openSearchClient.ts is defined but unused (dead dependency)
schema/        → zod validators + shared TS types
utils/         → ApiError/ApiResponse envelope, asyncHandler wrapper, MQTT topic parser
```

This is a standard layered monolith — appropriate at current scale. The main structural gap is that **handlers/ and controllers/ both write to the same tables independently** with no shared domain/service layer between them (e.g., alarm-creation logic is duplicated across `eventHandler.ts`, `statusHandler.ts`, and `telemetryHandler.ts` rather than centralized in one `AlarmService`). Worth consolidating as the alarm rule set grows.

### 3.3 Authentication & session model

- Login (`UserController.login`) verifies bcrypt password hash, issues **access + refresh JWTs** as httpOnly cookies (and the access token is also returned for `Authorization: Bearer` use — `megh-frontend` uses the header form, storing the token in `localStorage`).
- `authMiddleware.verifyUser` accepts either the cookie or the bearer header, verifies against `ACCESS_TOKEN_SECRET`, and loads the user (id, name, email, org, dept, role) onto `req.user` on every request.
- `authMiddleware.requireRole(...roles)` is a simple allowlist gate used on sensitive routes (org creation, device commands, file transfer).
- **Gap:** no refresh-token rotation endpoint exists yet — the refresh token is persisted on `User.refreshToken` but there's no `/refresh` route to actually use it, so expired access tokens currently force a full re-login rather than a silent refresh.

---

## 4. Organization Hierarchy & RBAC

### 4.1 Data model

```
Organization 1───* Department 1───* User
Organization 1───* Device *───1 User (assignedTo, optional)
```

- **Organization** — top-level tenant boundary. Unique `name`.
- **Department** — sub-unit of an Organization, unique per org.
- **User** — has a `Role` (`SUPERADMIN | ADMIN | USER`), optionally belongs to one `Organization` and one `Department`, and can have `Device[]` assigned directly.
- **Device** — belongs to an `Organization` (nullable until onboarded/assigned) and optionally to one `User` (`assignedTo`).

This mirrors DNAC's "Site Hierarchy" concept but flattened to two tenant levels (Org → Department) rather than an arbitrary-depth site tree. That's a reasonable simplification for the current scale — revisit only if a customer requires nested regional hierarchies (Org → Region → Site → Floor).

### 4.2 Role scoping (current implementation)

| Role | Scope | Enforced in |
|---|---|---|
| `SUPERADMIN` | All organizations, all devices, org creation | per-controller checks |
| `ADMIN` | Own organization only — users, departments, devices, commands | per-controller checks (`organizationId` filter) |
| `USER` | Only devices where `assignedToId === self` | per-controller checks |

**Architectural note for the Tech Lead:** RBAC is currently enforced **ad hoc, inline, per controller** rather than through a central policy/authorization layer. This works at 3 roles and the current controller count, but it's the first thing that will rot as the role matrix grows (e.g., adding a read-only "Auditor" role, or per-department scoping within an org). Recommended target state: extract a single `authorize(user, action, resource)` policy function (or adopt a lightweight CASL/OPA-style policy layer) that every controller calls, so scoping rules live in one place and are unit-testable independent of HTTP.

### 4.3 What's missing today

- No generic **audit trail** wired up — the `audit` Prisma model exists (`action`, `performedBy`, `entity`, `entityId`, `timestamp`) but no controller writes to it. For an enterprise NMS this matters (who acknowledged that alarm, who pushed that firmware command) — should be prioritized before broader rollout.
- No self-service password reset / MFA — out of scope for current phase but worth flagging for a security review before GA.

---

## 5. Device Onboarding Flow

This is the most "DNAC-like" workflow in the system and is already functionally complete:

1. **Discovery** — a switch boots, connects to the MQTT broker over mTLS, and publishes to `switch/<sn>/first_seen`.
2. **Auto-registration** — `firstSeenHandler.ts` creates a `Device` row with `organizationId: null` (i.e., the device exists in inventory but is **unassigned/unclaimed**), capturing whatever identity fields the payload provides (serial, model, MAC, versions).
3. **Identity backfill** — if `model`/`macAddress`/`hardwareVersion` are still missing after first-seen (common if the switch's first packet is minimal), `telemetryHandler.ts` proactively issues a `show version` command over MQTT (throttled to once per 10 minutes per device) and `responseHandler.ts` parses the free-text reply to backfill the fields. This is a pragmatic workaround for switches with an incomplete first-seen payload.
4. **Claiming** — an `ADMIN`/`SUPERADMIN` calls `GET /api/v1/device/onboard` (lists unassigned devices) then `POST /api/v1/device/assign` to attach the device to an `Organization` and optionally a `User`. `POST /api/v1/device/unassign` reverses this.
5. **Steady state** — once assigned, the device shows up in that org's inventory, dashboards, and alarm feeds.

This flow correctly separates **network-level discovery** (zero-touch, driven by the device itself) from **business-level claiming** (an explicit admin action) — the same separation DNAC/Aruba Central use for zero-touch provisioning.

---

## 6. Telemetry & Alarm Architecture

### 6.1 Telemetry ingestion

- Switches publish periodic telemetry to `switch/<sn>/telemetry`; `telemetryHandler.ts` writes:
  - A `Telemetry` row (append-only time series — one row per sample, `InterfaceStat[]` children for per-port counters)
  - An upsert into `Master` (one row per device, `serialNumber` unique) — a "latest known snapshot" table for fast dashboard reads without scanning the time-series table.
- **Design note:** metric fields (`cpuUsage`, `memoryUsage`, `temperature`, byte/packet counters) are stored as `String @db.Text` rather than numeric types. This works today because the API layer round-trips them as strings, but it means **no DB-level numeric queries or indexes** (e.g., "average CPU over last hour" requires reading and casting every row in application code). Worth revisiting if historical analytics/charting becomes a priority — either cast at write time or add computed numeric columns.
- **Scale note:** `Telemetry` is unbounded/append-only with no retention policy or partitioning visible in the schema. At even moderate device counts (hundreds of switches reporting every few minutes), this table will grow fast. Recommend either a retention job (roll up/delete rows older than N days) or moving raw telemetry to a time-series-optimized store (the `@opensearch-project/opensearch` dependency is already present but unused — likely the intended target, just not wired up yet).

### 6.2 Alarm engine

Two triggers, both already implemented:

- **Event-driven** (`eventHandler.ts`, `statusHandler.ts`): specific MQTT events map directly to alarms — e.g. `port_down` → warning, `device_reboot` → critical, `device_offline` (derived from a status transition) → critical. Alarms **auto-resolve**: a matching `port_up` event resolves the open `port_down` alarm for the same device+port via a lookup on `(deviceId, type, port, status=active)`.
- **Threshold-driven** (`telemetryHandler.ts`): CPU > 90%, memory > 85%, temperature > 70°C raise `cpu_high`/`memory_high`/`temperature_high` alarms on ingestion of each telemetry sample.

Alarm lifecycle: `active → acknowledged → resolved`, exposed via `PATCH /api/v1/alarm/:id/acknowledge` and `/resolve`, with `acknowledgedBy` captured on the row. `GET /api/v1/alarm/summary` gives counts by severity for dashboard tiles.

**Gap:** thresholds are hardcoded constants in `telemetryHandler.ts` rather than configurable per-device or per-org. If different customer sites need different tolerance (e.g., outdoor enclosures running hotter), this will need to move into config (a `Device`/`Organization`-level threshold override) rather than a code constant.

---

## 7. Configuration Management & Remote Commands

- `POST /api/v1/device/:id/command` (ADMIN+) publishes to `switch/<sn>/request`; `POST /api/v1/device/:id/file-transfer` (ADMIN+) handles firmware/file pushes over `switch/<sn>/file_transfer`; `POST /api/v1/device/broadcast` (ADMIN+) fans out to `switch/all/request`.
- Every command is tracked in `CommandLog` — `requestId` (unique, correlates the async MQTT response), `command`, `params (Json)`, and on response: `responseStatus` (0=Success…5=Internal error), `responseMessage`, `responseData`, plus file-transfer-specific fields (`fileType`, `fileUrl`, `algorithm`, `checksum`, `version`, `progress`).
- `GET /api/v1/device/:id/command/:requestId` lets the frontend poll for the async result — this is a request/response pattern layered on top of MQTT's pub/sub, which is the correct approach given devices reply on a separate topic (`switch/<sn>/response`) asynchronously.

**Not yet built (schema exists, no API):** `Vlan` and `Port` Prisma models are defined but have no controller or route — VLAN/port-level configuration management (create/modify VLANs, toggle port state) is scaffolded in the data model but not implemented. This is likely the next major feature area, matching the extensive VLAN/QoS/ACL/PoE config UI already sketched out in `frontend/pages/ConfigurationPages` (currently mock-data-only).

---

## 8. REST API Surface (current)

Base path: `/api/v1`, JSON envelope via `ApiResponse`/`ApiError` utils.

| Resource | Routes |
|---|---|
| Auth (`/user`) | `POST /login`, `POST /register`, `POST /logout` 🔒, `GET /all` 🔒 |
| Orgs (`/orgs`) | `GET /all`, `POST /create-orgs`, `GET /getAllDepartment`, `GET /:orgId/details`, `GET /:orgId/users` |
| Departments (`/dept`) | `POST /create-dept` |
| Devices (`/device`) | `GET /`, `GET /onboard`, `POST /assign`, `POST /unassign`, `POST /broadcast` 🔒A, `GET /:id/telemetry`, `GET /:id/events`, `GET /:id/status`, `GET /:id/status-history`, `POST /:id/command` 🔒A, `POST /:id/file-transfer` 🔒A, `GET /:id/command/:requestId` |
| Alarms (`/alarm`) | `GET /`, `GET /summary`, `GET /device/:id`, `PATCH /:id/acknowledge`, `PATCH /:id/resolve` |
| Dashboard (`/dashboard`) | `GET /get-all-switch-list` — **legacy, mock data, no auth — candidate for removal** |

🔒 = `verifyUser` required · 🔒A = `verifyUser` + `requireRole(ADMIN, SUPERADMIN)`

All device/alarm routes require authentication; org/dept mutation routes are additionally role-gated inside the controller body.

---

## 9. Frontend Architecture

### 9.1 Two codebases — recommendation

As found during inventory, `frontend/` and `megh-frontend/` are not a shared codebase with a branch difference — they are **structurally different apps**:

- `frontend/` — deployed via `docker-compose.yml`, but its `/dashboard` route (`App.tsx`) is a ~1000-line component built around a hardcoded mock `switchData` object, including a dead client-side call to the Gemini API with an empty key. Its real value is the extensive `pages/ConfigurationPages` tree (VLAN/STP/ERPS/PoE/ACL/QoS/LLDP/IGMP/SNMP forms) — useful as a UI reference for building out VLAN/Port config screens once those APIs exist (§7), but not wired to the real backend today.
- `megh-frontend/` — **not tracked in git, no Dockerfile, not in docker-compose** — yet it is the one whose `services/api.ts` actually calls the real, current backend API (auth, org/device/alarm CRUD, RBAC-aware role helpers). Its routing (`main.tsx`) already reflects the intended IA: `/organizations`, `/organizations/:id`, `/devices`, `/devices/:switchId`, `/users`, plus placeholders for `/topology` and `/monitoring/*`.

**Recommendation:** commit `megh-frontend/` to git, give it a Dockerfile, and wire it into `docker-compose.yml` as the primary UI; port over the config-page forms from `frontend/` incrementally as the VLAN/Port backend APIs are built; then retire `frontend/`. Running two frontends in parallel indefinitely will cause the same drift that already exists today.

### 9.2 `megh-frontend/` structure

```
src/
├── App.tsx            → auth guard, Header/Sidebar shell, <Outlet/>
├── main.tsx            → createBrowserRouter (routes listed above)
├── context/
│   ├── ThemeContext.tsx
│   └── AuthContext.tsx  → EMPTY — auth state currently lives ad hoc in localStorage/api.ts
├── services/api.ts     → single axios client, mirrors full backend API, role helpers (canOnboard, canSendCommands)
├── component/          → Header, Sidebar (role-aware menu), Card, StatCard, AssignModal, PortIcon, TemperatureGauge
└── pages/               → Login, Dashboard, Organizations, OrganizationDetails, CreateOrganization,
                            Devices, SwitchDetails, Users, PlaceholderPage
```

- **Auth flow:** `Login.tsx` → `api.login()` → stores `accessToken`/`user`/`isLoggedIn` in `localStorage` → `Header.tsx` reads role for a color-coded badge and calls `api.logout()`. On any `401`, `api.ts` clears `localStorage` and redirects to `/login`.
- **Gap:** `AuthContext.tsx` is empty despite being the natural place for this — auth state should move from ad hoc `localStorage` reads scattered across components into a real React context (or a small store) so components re-render consistently on login/logout instead of relying on full-page navigation.
- **No state/data-fetching library** in either frontend (no React Query/SWR/Redux) — all data fetching is manual `useEffect` + `axios`. Fine at current page count; worth introducing React Query specifically for the telemetry/alarm views once polling intervals are added (§10), to get caching/dedup/refetch-on-interval for free instead of hand-rolling it.

### 9.3 API interaction pattern

`services/api.ts` → axios instance, `baseURL` from `VITE_API_BASE_URL` (falls back to `http://<hostname>:8082`), `withCredentials: true`, attaches `Authorization: Bearer <token>` from `localStorage` on every request. This is a standard SPA-to-REST pattern; the one structural gap is **no live-push channel** (see §10).

---

## 10. Real-Time Data Gap (important for Tech Lead awareness)

The backend has no WebSocket server, and the `@opensearch-project/opensearch` dependency is present but unused. This means:

- Telemetry/alarm/status updates land in Postgres in real time (via MQTT), but the **frontend has no way to receive them in real time** — it can only poll REST endpoints (`GET /:id/telemetry`, `GET /alarm/summary`, etc.) on an interval.
- For a monitoring dashboard, this is a meaningful product gap versus DNAC/Aruba Central, which push live updates to the UI.

**Two viable target-state options**, in order of recommended effort/impact:

1. **Add a WebSocket/SSE layer to the existing Express backend** — when a handler (`eventHandler`, `statusHandler`, `telemetryHandler`) writes an alarm or status change, also emit it over a socket to subscribed clients (scoped by org, respecting the same RBAC rules). Lower lift, reuses the existing Postgres-as-source-of-truth model.
2. **Stand up the OpenSearch pipeline** the dependency already hints at — index telemetry/events there for fast time-range queries and use it as the backing store for historical charts, while keeping Postgres for transactional/RBAC data. Higher lift, but solves both the real-time gap (via OpenSearch's own subscription patterns or a companion push layer) and the telemetry-retention/query-performance concern from §6.1 at once.

Given current scale, **option 1 first** is the pragmatic recommendation; revisit option 2 once device/telemetry volume actually strains Postgres.

---

## 11. Database Design Summary

PostgreSQL via Prisma. Full model list (see `backend/prisma/schema.prisma` for authoritative field types):

| Model | Purpose |
|---|---|
| `Organization` | Tenant root |
| `Department` | Org sub-unit |
| `User` | Login identity, `Role` enum (`SUPERADMIN/ADMIN/USER`), org/dept membership |
| `Device` | Switch inventory, org/user assignment, current `status` |
| `Telemetry` | Append-only time-series sample per device |
| `Master` | Latest-snapshot upsert per device (fast dashboard reads) |
| `InterfaceStat` | Per-port counters, child of `Telemetry`/`Master` |
| `DeviceEvent` | Discrete events (port up/down, reboot, etc.) |
| `DeviceStatus` | Status transition history (online/offline/rebooting) |
| `CommandLog` | Async command/file-transfer request+response tracking |
| `Alarm` | Event- or threshold-triggered, full lifecycle |
| `Vlan`, `Port` | **Schema only, no API** — config-management scaffolding |
| `audit` | **Schema only, no API** — audit-log scaffolding |

Entity relationship, simplified:

```
Organization ──< Department ──< User >── Device >── Organization
                                            │
                             ┌──────────────┼──────────────┐
                             ▼              ▼              ▼
                        Telemetry      DeviceEvent      Alarm
                        (+InterfaceStat)  DeviceStatus    CommandLog
                             │
                             ▼
                           Master (1:1 latest snapshot)
```

---

## 12. Deployment & Infrastructure

```
docker-compose.yml
├── postgres   (postgres:15-alpine, volume: postgres-data)
├── backend    (image thetypo36/techroute-backend, port ${BACKEND_PORT:-8082}, healthcheck: /health)
└── frontend   (image thetypo36/techroute-frontend, port ${FRONTEND}:80, nginx-served build)
              network: techroute-networks (bridge)
```

- `backend/Dockerfile`: multi-stage Node 20-alpine → `prisma generate` + `prisma migrate deploy` on container start → runs as non-root `app` user. This is good practice (non-root, migrations-on-boot).
- `frontend/Dockerfile`: Node build → nginx:alpine static serve.
- **`megh-frontend` has no Dockerfile and is not in `docker-compose.yml`** — reiterating §9.1's recommendation, this needs to be closed before it can replace `frontend/` in deployment.

### 12.1 Security/hygiene items to resolve before broader rollout

These were surfaced during inventory and should go on the backlog regardless of the architecture decisions above:

1. **`backend/certs/` (CA + server + client cert/key pairs for MQTT mTLS) is committed to the repo.** Certificates and especially private keys should not live in version control — move to a secrets manager or at minimum `.gitignore` + inject at deploy time.
2. **`backend/.env.prod` and `backend/.env.staging` are explicitly un-ignored in `.gitignore`** (i.e., committed) — production/staging secrets (DB credentials, JWT signing secrets) should never be in git history. Rotate these secrets and move to environment injection via the deployment platform.
3. **MQTT broker address is hardcoded** in `config/mqttConfig.ts` (`mqtts://172.16.0.23:8885`) rather than env-driven — blocks promoting the same image across dev/staging/prod without a code change.
4. **`docker-compose.yml`'s frontend port var is `${FRONTEND}`**, but the `.env` defines `FRONTEND_PORT`/`FRONTEND_PORT_PROD`/`FRONTEND_PORT_STAGING` — likely means the frontend port is silently falling back to compose's default rather than the intended env value. Worth a quick fix.
5. **`PORT` env var is read but not actually used to bind the server** (§3.1) — same class of "looks configurable, isn't" issue.

None of these are architecturally significant on their own, but as a set they indicate the deploy/config story hasn't had a hardening pass yet — worth a dedicated short cycle before any external-facing or multi-customer rollout.

---

## 13. Recommended Roadmap (priority order)

1. **Consolidate the frontend** — commit `megh-frontend`, add its Dockerfile, wire into compose, retire `frontend/` (reuse its config-page UI as a reference when building VLAN/Port screens).
2. **Close the security/hygiene items in §12.1** — remove committed certs/secrets from git, env-driven MQTT broker address.
3. **Real-time push layer (§10, option 1)** — WebSocket/SSE for alarms and status, since the backend already generates these events, it's a matter of also emitting them live.
4. **Wire up the audit log** — every alarm ack/resolve, command issuance, and org/device assignment should write an `audit` row; currently silent.
5. **Build VLAN/Port config APIs** — the schema and (mock) UI both already anticipate this; it's the largest functional gap versus a DNAC/Aruba-Central-equivalent feature set.
6. **Centralize RBAC into a policy layer** (§4.2) — before adding more roles or finer-grained scoping.
7. **Telemetry retention/typing** (§6.1) — numeric columns or a retention job before data volume becomes a performance problem.
8. **Refresh-token rotation endpoint** (§3.3) — currently the field exists but there's no route using it.

---

*This document reflects the codebase state as inventoried on 2026-07-29. Re-verify specific file/route references against the current branch before treating them as authoritative, as the codebase evolves.*
