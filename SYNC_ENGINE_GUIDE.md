# Sync Engine — Developer Guide & Sample Implementation

## Overview

The SDK Sync Engine provides **offline-first data synchronization** between the mobile device and a module's backend API. It uses **vector clocks** for conflict detection and supports **pluggable conflict resolution strategies**.

**Current status:** The SyncEngine is wired into the SDK kernel. It is created during boot, exposed via `useSDKServices().syncEngine`, and automatically stopped/started on suspend/resume. This guide explains how it works, how it relates to the existing cache system, and provides a **complete sample backend implementation** that module developers can use as a starting point.

---

## Table of Contents

1. [How Sync Works](#how-sync-works)
2. [What is a Collection?](#what-is-a-collection)
3. [Sync vs Cache — How They Differ](#sync-vs-cache--how-they-differ)
4. [Push & Pull API Contract](#push--pull-api-contract)
5. [How a Module Uses Sync](#how-a-module-uses-sync)
6. [Conflict Scenarios](#conflict-scenarios)
7. [Sample Backend Implementation (Node.js/Express)](#sample-backend-implementation)
8. [Sample Backend Implementation (Fastify)](#sample-backend-implementation-fastify)
9. [Database Schema](#database-schema)
10. [Testing Your Sync Endpoints](#testing-your-sync-endpoints)
11. [How Sync Integrates with the Developer Portal](#how-sync-integrates-with-the-developer-portal)

---

## How Sync Works

```
  Phone (offline)                       Module API Server
       │                                       │
       │  User creates/edits data              │
       │  trackChange("appointments",          │
       │    "appt-123", {date, time, doctor})  │
       │         │                             │
       │   Saved to MMKV with vector clock     │
       │   Entry marked as "dirty"             │
       │         │                             │
       │         │   (device goes online)      │
       │         │                             │
       │  sync("appointments")                 │
       │  ┌──────┴──────────┐                  │
       │  │ 1. PUSH dirty   │─────────────────>│  POST /api/sync/appointments/push
       │  │    entries       │                  │  Server stores entries, merges clocks
       │  │    to server     │<─────────────────│  Returns { accepted: N }
       │  │                  │                  │
       │  │ 2. PULL remote   │─────────────────>│  POST /api/sync/appointments/pull
       │  │    changes       │                  │  Server returns entries modified since
       │  │    from server   │<─────────────────│  last sync timestamp
       │  └──────┬──────────┘                  │
       │         │                             │
       │  For each pulled entry:               │
       │  ┌──────────────────────────┐         │
       │  │ Compare vector clocks:    │         │
       │  │                          │         │
       │  │ equal      → skip        │         │
       │  │ remote newer → accept    │         │
       │  │ local newer  → keep      │         │
       │  │ concurrent → resolve     │         │
       │  │              conflict    │         │
       │  └──────────────────────────┘         │
       │                                       │
```

**Key concepts:**

- **Vector clock** — a map of `{ nodeId: counter }` that tracks which device made how many writes. Used to determine if two versions are sequential or concurrent (conflicting).
- **Dirty entry** — a locally modified entry that hasn't been pushed to the server yet.
- **Collection** — a logical group of entries (e.g. `"appointments"`, `"notes"`, `"cart-items"`). Each collection syncs independently.
- **Node ID** — unique identifier for this device (e.g. `"phone-abc123"`).

---

## What is a Collection?

A collection is a **name** you give to a group of related data entries. It's just a string — nothing more. It is not a database table name, not an API endpoint, not a schema type. It's a logical namespace the developer chooses.

```
collection = "appointments"   →  all appointment entries live under this name
collection = "notes"          →  all note entries live under this name
collection = "cart-items"     →  all cart items live under this name
```

### What it looks like inside the SyncEngine

The SyncEngine stores entries in a nested Map: `Map<collectionName, Map<entryId, SyncEntry>>`:

```
entries = {
  "appointments" → {
    "appt-001" → {
      id: "appt-001",
      data: { date: "2026-05-10", time: "14:00", doctor: "Dr. Smith" },
      vectorClock: { "phone-abc123": 3 },
      timestamp: 1715200000000,
      nodeId: "phone-abc123",
      dirty: true
    },
    "appt-002" → {
      id: "appt-002",
      data: { date: "2026-05-12", time: "09:30", doctor: "Dr. Jones" },
      vectorClock: { "phone-abc123": 1 },
      timestamp: 1715200500000,
      nodeId: "phone-abc123",
      dirty: false
    },
  },
  "notes" → {
    "note-001" → {
      id: "note-001",
      data: { title: "Meeting notes", body: "..." },
      vectorClock: { "phone-abc123": 1 },
      timestamp: 1715201000000,
      nodeId: "phone-abc123",
      dirty: true
    },
  },
}
```

### Where the collection name is used

| Usage | Example |
|-------|---------|
| In-memory Map key | `entries.get("appointments")` |
| MMKV storage key | `__sync__:appointments:appt-001` |
| API endpoint path | `POST /api/sync/appointments/push` |
| DataBus events | `{ collection: "appointments", result: {...} }` |

You call `syncEngine.trackChange("appointments", "appt-001", data)` — the first argument is the collection name. You call `syncEngine.sync("appointments")` — same name. The name connects the local entries to the remote API endpoints.

---

## Sync vs Cache — How They Differ

The SDK has two data storage mechanisms. They solve **completely different problems** and work independently.

### Cache (What Exists Today)

The cache (`ModuleCache`) is a **read-only, temporary, in-memory** store that avoids re-downloading the same API response within a short time window.

**How cache works with data sources today:**

```
Screen loads
    │
    ▼
Data source: GET /api/appointments
    │
    ▼
Is response in cache? ──yes──> Use cached response (skip network call)
    │no                        TTL not expired yet
    ▼
Fetch GET /api/appointments from server
    │
    ▼
Store response in cache (in-memory, TTL: e.g. 5 min)
    │
    ▼
$data.appointments = API response
    │
    ▼
Components render
```

**What cache does:**
- Stores the raw API response temporarily
- Returns it on repeated screen loads within the TTL
- Evicts after TTL expires
- Lost when the app restarts (in-memory only)

**What cache does NOT do:**
- It never writes data back to the server
- It doesn't work offline (if cache is empty and device is offline, `$data` is undefined)
- It doesn't track changes the user made
- It doesn't detect conflicts

```
Cache = "I downloaded this 30 seconds ago. Don't download it again yet."
```

### Sync (What We Just Wired In)

The SyncEngine is a **read-write, persistent, MMKV-backed** store that maintains a local copy of data, tracks changes, and reconciles with the server bidirectionally.

**How sync works:**

```
Screen loads
    │
    ▼
syncEngine.sync("appointments")
    │
    ├── PUSH: Send locally modified ("dirty") entries to server
    │   POST /api/sync/appointments/push
    │
    ├── PULL: Get entries the server changed since last sync
    │   POST /api/sync/appointments/pull
    │
    └── MERGE: Compare vector clocks for each entry
    │   - remote newer → accept
    │   - local newer → keep
    │   - concurrent → resolve conflict via strategy
    │
    ▼
All entries (local + pulled) in syncEngine's Map
    │
    ▼
$data.appointments = entries from sync engine
    │
    ▼
Components render
```

**What sync does:**
- Maintains a persistent local copy in MMKV (survives app restarts)
- Tracks every local change with a vector clock
- Pushes local changes to the server
- Pulls remote changes from the server
- Detects and resolves conflicts automatically
- Works fully offline (local data is always available)

```
Sync = "I have my own copy of this data. I can read and write it offline.
        When I'm online, I push my changes and pull theirs."
```

### Side-by-Side Comparison

| | Cache | Sync |
|---|---|---|
| **Purpose** | Avoid re-downloading the same response | Work offline + reconcile changes bidirectionally |
| **Storage** | In-memory (lost on app restart) | MMKV (persists across app restarts and crashes) |
| **Direction** | Read-only (server → device) | Read-write (server ↔ device) |
| **Writes to server** | Never | Yes — pushes dirty entries |
| **Offline behavior** | Returns stale cached data or fails | Returns local data, queues changes for later push |
| **Conflicts** | N/A (no writes) | Vector clocks + ConflictResolver |
| **What it stores** | Raw API response (one blob) | Individual entries with id, data, vectorClock, timestamp |
| **Lifetime** | Minutes (TTL-based) | Days (7-day prune for clean entries) |
| **Backend requirement** | Any normal REST API | Must implement push/pull sync endpoints |

### What Happens Offline?

**Without sync (cache only):**
```
Device goes offline
    │
    ▼
Screen loads → GET /api/appointments
    │
    ▼
Cache has data? ──yes──> Show stale cached data (read-only)
    │no
    ▼
Network request fails → $data.appointments = undefined → Empty screen

User creates appointment → POST /api/appointments → FAILS → Data lost
```

**With sync:**
```
Device goes offline
    │
    ▼
Screen loads → syncEngine.sync("appointments")
    │
    ├── PUSH fails (offline) → dirty entries stay queued
    ├── PULL fails (offline) → skip
    │
    ▼
$data.appointments = local entries from MMKV → Screen shows data!

User creates appointment → trackChange("appointments", "appt-new", {...})
    │
    ▼
Saved to MMKV as dirty entry → User sees it immediately

Device comes back online → syncEngine.sync("appointments")
    │
    ├── PUSH: dirty entries sent to server → server accepts
    ├── PULL: any server changes pulled in
    │
    ▼
Everything reconciled — no data lost
```

### Can They Work Together?

Yes. They don't interfere with each other. A data source could use cache for quick repeated reads **and** sync for persistent offline support:

1. **First load:** SyncEngine syncs (push/pull), populates `$data` from local store
2. **Quick re-render:** Cache returns the same `$data` without calling sync again
3. **User submits:** `trackChange()` saves locally + `api_submit` sends to server
4. **App restart:** Cache is empty (memory lost), but sync engine restores from MMKV

Cache is a performance optimization. Sync is a data integrity system. They serve different layers.

---

## Push & Pull API Contract

The SyncEngine expects **two endpoints per collection** on your module API.

### Push — `POST /api/sync/{collection}/push`

**When called:** The SDK sends all locally-modified entries to your server.

**Request body:**

```json
{
  "entries": [
    {
      "id": "appt-123",
      "data": {
        "date": "2026-05-10",
        "time": "14:00",
        "doctorId": "dr-55",
        "patientName": "Ahmed",
        "notes": "Follow-up visit",
        "status": "confirmed"
      },
      "vectorClock": {
        "phone-abc123": 3
      },
      "timestamp": 1715200000000,
      "nodeId": "phone-abc123",
      "dirty": true
    },
    {
      "id": "appt-456",
      "data": {
        "date": "2026-05-12",
        "time": "09:30",
        "doctorId": "dr-12",
        "patientName": "Ahmed",
        "notes": "New consultation",
        "status": "pending"
      },
      "vectorClock": {
        "phone-abc123": 1
      },
      "timestamp": 1715200500000,
      "nodeId": "phone-abc123",
      "dirty": true
    }
  ]
}
```

**Field descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique entry identifier |
| `data` | object | The actual data (your module's domain data) |
| `vectorClock` | `Record<string, number>` | Map of nodeId to write counter |
| `timestamp` | number | Unix timestamp (ms) of the last modification |
| `nodeId` | string | ID of the device that made this change |
| `dirty` | boolean | Always `true` for pushed entries |

**Expected response:**

```json
{
  "accepted": 2
}
```

Return `200 OK` if entries were accepted. The SDK marks them as clean (no longer dirty). If you return a non-2xx status, the SDK keeps them dirty and retries on the next sync.

### Pull — `POST /api/sync/{collection}/pull`

**When called:** After pushing, the SDK fetches all server-side changes since the last sync.

**Request body:**

```json
{
  "since": 1715100000000
}
```

`since` is the timestamp of the last successful pull. `null` on first sync (meaning "give me everything").

**Expected response:**

```json
{
  "entries": [
    {
      "id": "appt-123",
      "data": {
        "date": "2026-05-10",
        "time": "15:00",
        "doctorId": "dr-55",
        "patientName": "Ahmed",
        "notes": "Rescheduled by clinic",
        "status": "rescheduled"
      },
      "vectorClock": {
        "phone-abc123": 3,
        "server": 1
      },
      "timestamp": 1715200300000,
      "nodeId": "server"
    },
    {
      "id": "appt-800",
      "data": {
        "date": "2026-05-15",
        "time": "11:00",
        "doctorId": "dr-22",
        "patientName": "Ahmed",
        "notes": "Booked by reception",
        "status": "confirmed"
      },
      "vectorClock": {
        "server": 1
      },
      "timestamp": 1715200400000,
      "nodeId": "server"
    }
  ]
}
```

Return entries that were modified after the `since` timestamp. Include entries created by other devices/nodes and entries modified by the server itself.

---

## How a Module Uses Sync

### Real-World Example: Clinic Appointments Module

**Module:** `com.clinic.appointments`
**Module API:** `https://clinic-api.example.com`
**Problem:** Patients book/edit appointments on their phone. The clinic reschedules from their system. Both sides need to stay in sync, even when the phone is offline.

### Without Sync (Current Behavior)

1. Patient opens module -> data source fetches `GET /api/appointments` -> shows list
2. Patient books appointment -> `api_submit` sends `POST /api/appointments` -> server saves it
3. **If offline -> the request fails. The booking is lost.**
4. **If the clinic reschedules -> the patient doesn't know until they manually refresh**

### With Sync (When Wired Into Kernel)

```
┌─────────────────────────────────────────────────────┐
│                    Module Screen                     │
│                                                     │
│  User books appointment                             │
│       │                                             │
│       v                                             │
│  action: "api_submit"                               │
│       │                                             │
│       v                                             │
│  ┌──────────────────────┐                           │
│  │     SyncEngine       │                           │
│  │                      │                           │
│  │  trackChange(        │   Saved to MMKV locally   │
│  │    "appointments",   │   with vector clock.      │
│  │    "appt-123",       │   Works offline!          │
│  │    {date, time, ...} │                           │
│  │  )                   │                           │
│  └──────────┬───────────┘                           │
│             │                                       │
│             │  When online:                         │
│             │  sync("appointments")                 │
│             │                                       │
│             v                                       │
│  ┌──────────────────────┐                           │
│  │  PUSH to module API  │──> POST clinic-api.com    │
│  │  PULL from module API│<── /api/sync/             │
│  │                      │    appointments/push|pull │
│  └──────────────────────┘                           │
└─────────────────────────────────────────────────────┘
```

**Benefits:**
- Module works offline — changes queue up locally and sync when online
- No data loss — entries persist in MMKV even if the app crashes
- Conflicts are resolved automatically (or manually, depending on strategy)
- The patient always sees the latest state from both their own changes and the clinic's changes

---

## Conflict Scenarios

### Scenario: Patient and Clinic Both Edit the Same Appointment

1. **Patient** (offline) changes time to `2:00 PM`
   - `trackChange("appointments", "appt-123", { time: "14:00" })`
   - Vector clock: `{ "phone-A": 2 }`

2. **Clinic receptionist** (on server) reschedules to `3:00 PM`
   - Server vector clock: `{ "server": 2 }`

3. **Patient goes online** -> `sync("appointments")` runs:
   - Push sends `{ time: "14:00", vectorClock: { "phone-A": 2 } }`
   - Pull receives `{ time: "15:00", vectorClock: { "server": 2 } }`
   - `VectorClock.compare()` returns **`concurrent`** — neither side has seen the other's change
   - ConflictResolver runs with configured strategy

### Resolution Strategies

| Strategy | What Happens | Best For |
|----------|-------------|----------|
| `server-wins` | Clinic's `3:00 PM` wins | Appointments, balances, prices — server is authoritative |
| `client-wins` | Patient's `2:00 PM` wins | Drafts, notes, preferences — user's intent matters more |
| `latest-timestamp` | Whichever was modified more recently wins (ties go to server) | General purpose |
| `manual-resolution` | Both versions queued — user picks the winner | Critical data where both sides matter |

### Non-Conflict Cases

| Scenario | Vector Clock Result | What Happens |
|----------|-------------------|-------------|
| Only phone changed | `after` (local is newer) | Local version kept, pushed to server |
| Only server changed | `before` (remote is newer) | Remote version accepted, overwrites local |
| Both have same version | `equal` | Skip (no-op) |
| New entry from server | Not in local map | Accepted as new entry |

---

## Sample Backend Implementation

### Node.js + Express

A complete reference implementation for a module API with sync endpoints.

```javascript
// sync-routes.js
// Sample sync API for a custom module backend
// Copy and adapt this for your module's data model

const express = require('express');
const router = express.Router();

// ─── In-Memory Store (Replace with your database) ───────────────────────

const collections = new Map(); // collection -> Map<id, SyncEntry>

function getCollection(name) {
  if (!collections.has(name)) {
    collections.set(name, new Map());
  }
  return collections.get(name);
}

// ─── Vector Clock Helpers ───────────────────────────────────────────────

function mergeVectorClocks(clockA, clockB) {
  const merged = { ...clockA };
  for (const [nodeId, counter] of Object.entries(clockB)) {
    merged[nodeId] = Math.max(merged[nodeId] || 0, counter);
  }
  return merged;
}

function compareVectorClocks(clockA, clockB) {
  const allNodes = new Set([
    ...Object.keys(clockA || {}),
    ...Object.keys(clockB || {}),
  ]);

  let aGreater = false;
  let bGreater = false;

  for (const nodeId of allNodes) {
    const a = (clockA || {})[nodeId] || 0;
    const b = (clockB || {})[nodeId] || 0;
    if (a > b) aGreater = true;
    if (b > a) bGreater = true;
    if (aGreater && bGreater) return 'concurrent';
  }

  if (!aGreater && !bGreater) return 'equal';
  if (aGreater) return 'after';
  return 'before';
}

// ─── PUSH Endpoint ──────────────────────────────────────────────────────

router.post('/api/sync/:collection/push', (req, res) => {
  const { collection } = req.params;
  const { entries } = req.body;

  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'entries must be an array' });
  }

  const store = getCollection(collection);
  let accepted = 0;

  for (const entry of entries) {
    const { id, data, vectorClock, timestamp, nodeId } = entry;

    if (!id || !data || !vectorClock) {
      continue; // skip malformed entries
    }

    const existing = store.get(id);

    if (!existing) {
      // New entry — accept it
      store.set(id, {
        id,
        data,
        vectorClock,
        timestamp,
        nodeId,
        dirty: false,
      });
      accepted++;
      continue;
    }

    // Existing entry — compare vector clocks
    const ordering = compareVectorClocks(entry.vectorClock, existing.vectorClock);

    switch (ordering) {
      case 'after':
        // Incoming is newer — accept it
        store.set(id, {
          id,
          data,
          vectorClock: mergeVectorClocks(existing.vectorClock, vectorClock),
          timestamp,
          nodeId,
          dirty: false,
        });
        accepted++;
        break;

      case 'concurrent':
        // Conflict — server-wins strategy (merge clocks, keep server data but
        // record that we received the client's version)
        const merged = mergeVectorClocks(existing.vectorClock, vectorClock);
        // Increment server's own counter to indicate server resolved the conflict
        merged['server'] = (merged['server'] || 0) + 1;
        store.set(id, {
          id,
          data: existing.data,  // server-wins: keep server's data
          vectorClock: merged,
          timestamp: Date.now(),
          nodeId: 'server',
          dirty: false,
        });
        accepted++;
        break;

      case 'before':
      case 'equal':
        // Incoming is older or same — skip
        accepted++;
        break;
    }
  }

  res.json({ accepted });
});

// ─── PULL Endpoint ──────────────────────────────────────────────────────

router.post('/api/sync/:collection/pull', (req, res) => {
  const { collection } = req.params;
  const { since } = req.body;
  const sinceMs = since || 0;

  const store = getCollection(collection);
  const entries = [];

  for (const entry of store.values()) {
    if (entry.timestamp > sinceMs) {
      entries.push({
        id: entry.id,
        data: entry.data,
        vectorClock: entry.vectorClock,
        timestamp: entry.timestamp,
        nodeId: entry.nodeId,
      });
    }
  }

  // Sort by timestamp ascending (oldest first)
  entries.sort((a, b) => a.timestamp - b.timestamp);

  res.json({ entries });
});

// ─── Optional: Server-Side Data Mutation ────────────────────────────────
// When your server modifies data (e.g., admin reschedules an appointment),
// update the vector clock so the SDK detects the change on next pull.

function serverMutate(collection, id, newData) {
  const store = getCollection(collection);
  const existing = store.get(id);

  const vectorClock = existing
    ? { ...existing.vectorClock, server: (existing.vectorClock.server || 0) + 1 }
    : { server: 1 };

  store.set(id, {
    id,
    data: newData,
    vectorClock,
    timestamp: Date.now(),
    nodeId: 'server',
    dirty: false,
  });
}

module.exports = { router, serverMutate };
```

**Usage in your Express app:**

```javascript
const express = require('express');
const { router: syncRoutes, serverMutate } = require('./sync-routes');

const app = express();
app.use(express.json());
app.use(syncRoutes);

// Your regular module API endpoints can use serverMutate
// to update data in a sync-compatible way:
app.put('/api/appointments/:id/reschedule', (req, res) => {
  const { date, time } = req.body;
  serverMutate('appointments', req.params.id, {
    date,
    time,
    status: 'rescheduled',
    rescheduledAt: Date.now(),
  });
  res.json({ ok: true });
});

app.listen(4000, () => console.log('Module API on port 4000'));
```

---

## Sample Backend Implementation (Fastify)

For teams using Fastify (like the miniapps-backend):

```typescript
// sync-plugin.ts
// Fastify plugin for sync endpoints — copy into your module API

import { FastifyInstance, FastifyPluginOptions } from 'fastify';

interface VectorClockMap {
  [nodeId: string]: number;
}

interface SyncEntry {
  id: string;
  data: unknown;
  vectorClock: VectorClockMap;
  timestamp: number;
  nodeId: string;
  dirty: boolean;
}

// ─── Vector Clock Helpers ───────────────────────────────────────────────

function mergeClocks(a: VectorClockMap, b: VectorClockMap): VectorClockMap {
  const merged = { ...a };
  for (const [node, counter] of Object.entries(b)) {
    merged[node] = Math.max(merged[node] ?? 0, counter);
  }
  return merged;
}

function compareClocks(
  a: VectorClockMap,
  b: VectorClockMap,
): 'before' | 'after' | 'equal' | 'concurrent' {
  const allNodes = new Set([...Object.keys(a), ...Object.keys(b)]);
  let aGt = false;
  let bGt = false;
  for (const node of allNodes) {
    const va = a[node] ?? 0;
    const vb = b[node] ?? 0;
    if (va > vb) aGt = true;
    if (vb > va) bGt = true;
    if (aGt && bGt) return 'concurrent';
  }
  if (!aGt && !bGt) return 'equal';
  return aGt ? 'after' : 'before';
}

// ─── In-Memory Store (Replace with Prisma/MySQL/Postgres) ───────────────

const collections = new Map<string, Map<string, SyncEntry>>();

function getStore(name: string): Map<string, SyncEntry> {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name)!;
}

// ─── Plugin ─────────────────────────────────────────────────────────────

export async function syncPlugin(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // PUSH — receive dirty entries from the device
  app.post<{
    Params: { collection: string };
    Body: { entries: SyncEntry[] };
  }>('/api/sync/:collection/push', async (request, reply) => {
    const { collection } = request.params;
    const { entries } = request.body;
    const store = getStore(collection);
    let accepted = 0;

    for (const entry of entries) {
      const existing = store.get(entry.id);

      if (!existing) {
        store.set(entry.id, { ...entry, dirty: false });
        accepted++;
        continue;
      }

      const ordering = compareClocks(entry.vectorClock, existing.vectorClock);

      if (ordering === 'after') {
        store.set(entry.id, {
          ...entry,
          vectorClock: mergeClocks(existing.vectorClock, entry.vectorClock),
          dirty: false,
        });
        accepted++;
      } else if (ordering === 'concurrent') {
        // Server-wins: keep server data, merge clocks
        const merged = mergeClocks(existing.vectorClock, entry.vectorClock);
        merged['server'] = (merged['server'] ?? 0) + 1;
        store.set(entry.id, {
          ...existing,
          vectorClock: merged,
          timestamp: Date.now(),
          nodeId: 'server',
          dirty: false,
        });
        accepted++;
      } else {
        // 'before' or 'equal' — incoming is older, skip
        accepted++;
      }
    }

    return { accepted };
  });

  // PULL — send entries modified since last sync
  app.post<{
    Params: { collection: string };
    Body: { since: number | null };
  }>('/api/sync/:collection/pull', async (request, reply) => {
    const { collection } = request.params;
    const since = request.body.since ?? 0;
    const store = getStore(collection);

    const entries: Omit<SyncEntry, 'dirty'>[] = [];
    for (const entry of store.values()) {
      if (entry.timestamp > since) {
        entries.push({
          id: entry.id,
          data: entry.data,
          vectorClock: entry.vectorClock,
          timestamp: entry.timestamp,
          nodeId: entry.nodeId,
        });
      }
    }

    entries.sort((a, b) => a.timestamp - b.timestamp);
    return { entries };
  });
}

// ─── Helper: Server-Side Mutation ───────────────────────────────────────
// Call this when your server modifies data (admin actions, cron jobs, etc.)

export function serverMutate(
  collection: string,
  id: string,
  data: unknown,
): void {
  const store = getStore(collection);
  const existing = store.get(id);
  const vectorClock = existing
    ? { ...existing.vectorClock, server: (existing.vectorClock.server ?? 0) + 1 }
    : { server: 1 };

  store.set(id, {
    id,
    data,
    vectorClock,
    timestamp: Date.now(),
    nodeId: 'server',
    dirty: false,
  });
}
```

**Usage in your Fastify app:**

```typescript
import Fastify from 'fastify';
import { syncPlugin, serverMutate } from './sync-plugin';

const app = Fastify();
app.register(syncPlugin);

// Your regular endpoints use serverMutate for sync-compatible writes
app.put('/api/appointments/:id/reschedule', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { date, time } = request.body as { date: string; time: string };

  serverMutate('appointments', id, {
    date,
    time,
    status: 'rescheduled',
    rescheduledAt: Date.now(),
  });

  return { ok: true };
});

app.listen({ port: 4000 });
```

---

## Database Schema

When replacing the in-memory store with a real database, use this schema:

### MySQL (Prisma)

```prisma
model SyncEntry {
  id           String   @id
  collection   String
  data         Json
  vectorClock  Json                    // { "phone-abc": 3, "server": 2 }
  timestamp    BigInt                  // Unix ms
  nodeId       String                 // Which device/server wrote this
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([collection, timestamp])    // Fast pull queries
  @@index([collection, nodeId])
  @@map("sync_entries")
}
```

### PostgreSQL (SQL)

```sql
CREATE TABLE sync_entries (
  id           TEXT NOT NULL,
  collection   TEXT NOT NULL,
  data         JSONB NOT NULL,
  vector_clock JSONB NOT NULL DEFAULT '{}',
  timestamp    BIGINT NOT NULL,
  node_id      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection, id)
);

CREATE INDEX idx_sync_pull ON sync_entries (collection, timestamp);
```

### Push Query (Prisma Example)

```typescript
// Upsert an entry from push
await prisma.syncEntry.upsert({
  where: { id: entry.id },
  create: {
    id: entry.id,
    collection,
    data: entry.data,
    vectorClock: mergedClock,
    timestamp: entry.timestamp,
    nodeId: entry.nodeId,
  },
  update: {
    data: entry.data,
    vectorClock: mergedClock,
    timestamp: entry.timestamp,
    nodeId: entry.nodeId,
  },
});
```

### Pull Query (Prisma Example)

```typescript
// Fetch entries modified since last sync
const entries = await prisma.syncEntry.findMany({
  where: {
    collection,
    timestamp: { gt: since },
  },
  orderBy: { timestamp: 'asc' },
});
```

---

## Testing Your Sync Endpoints

Use these curl commands to verify your implementation:

### 1. Push Entries

```bash
curl -X POST http://localhost:4000/api/sync/appointments/push \
  -H 'Content-Type: application/json' \
  -d '{
    "entries": [
      {
        "id": "appt-001",
        "data": {"date": "2026-05-10", "time": "14:00", "doctor": "Dr. Smith"},
        "vectorClock": {"phone-A": 1},
        "timestamp": 1715200000000,
        "nodeId": "phone-A",
        "dirty": true
      },
      {
        "id": "appt-002",
        "data": {"date": "2026-05-12", "time": "09:30", "doctor": "Dr. Jones"},
        "vectorClock": {"phone-A": 1},
        "timestamp": 1715200500000,
        "nodeId": "phone-A",
        "dirty": true
      }
    ]
  }'

# Expected: { "accepted": 2 }
```

### 2. Pull Entries

```bash
# Pull all entries (first sync)
curl -X POST http://localhost:4000/api/sync/appointments/pull \
  -H 'Content-Type: application/json' \
  -d '{"since": null}'

# Expected: { "entries": [ ...all entries... ] }

# Pull entries since a timestamp
curl -X POST http://localhost:4000/api/sync/appointments/pull \
  -H 'Content-Type: application/json' \
  -d '{"since": 1715200000000}'

# Expected: { "entries": [ ...entries after that timestamp... ] }
```

### 3. Simulate a Conflict

```bash
# Step 1: Phone pushes version with phone clock at 2
curl -X POST http://localhost:4000/api/sync/appointments/push \
  -H 'Content-Type: application/json' \
  -d '{
    "entries": [{
      "id": "appt-001",
      "data": {"time": "14:00", "notes": "Patient changed time"},
      "vectorClock": {"phone-A": 2},
      "timestamp": 1715300000000,
      "nodeId": "phone-A",
      "dirty": true
    }]
  }'

# Step 2: Simulate server-side change (via your admin endpoint)
curl -X PUT http://localhost:4000/api/appointments/appt-001/reschedule \
  -H 'Content-Type: application/json' \
  -d '{"date": "2026-05-10", "time": "15:00"}'

# Step 3: Phone pushes again with phone clock still at 2
# but server clock is now 1 — this creates a concurrent conflict
curl -X POST http://localhost:4000/api/sync/appointments/push \
  -H 'Content-Type: application/json' \
  -d '{
    "entries": [{
      "id": "appt-001",
      "data": {"time": "14:30", "notes": "Patient changed again"},
      "vectorClock": {"phone-A": 2},
      "timestamp": 1715300500000,
      "nodeId": "phone-A",
      "dirty": true
    }]
  }'

# Step 4: Pull to see the resolved state
curl -X POST http://localhost:4000/api/sync/appointments/pull \
  -H 'Content-Type: application/json' \
  -d '{"since": 0}'

# The entry should have a merged vector clock like {"phone-A": 2, "server": 2}
# and the server's data wins (with server-wins strategy)
```

### 4. Verify Vector Clock Merging

After a conflict, the pulled entry should have a merged vector clock containing counters from both sides. This tells the SDK "both sides' changes have been accounted for" and prevents the same conflict from reappearing on the next sync.

```json
{
  "id": "appt-001",
  "vectorClock": {
    "phone-A": 2,
    "server": 2
  }
}
```

If the clock only had one side's counters, the SDK would detect another conflict on the next sync — so always merge clocks when resolving.

---

## How Sync Integrates with the Developer Portal

Sync configuration lives in **two places** in the Developer Portal: the **Manifest Editor** (module-level settings) and the **Screen Builder** (per-data-source and per-action settings). Together they give developers full control over what syncs, how conflicts are resolved, and when sync happens.

### Manifest Editor — Module-Level Sync Config

**Where:** `/developer/modules/[id]/manifest` → "Offline Sync" section

The manifest defines **which collections sync, the conflict strategy for each, and the auto-sync interval**. These are module-wide defaults that apply to all screens.

**What the developer sees in the manifest editor:**

```
─── Offline Sync ───────────────────────────────────────────────────────
☑ Enable Offline Sync for this module

Collections:
┌──────────────────┬────────────────────┬────────────────┐
│ Collection Name  │ Conflict Strategy  │ Sync Interval  │
├──────────────────┼────────────────────┼────────────────┤
│ appointments     │ server-wins     ▼  │ 30s            │
│ notes            │ client-wins     ▼  │ 60s            │
│ [+ Add Collection]                                     │
└──────────────────┴────────────────────┴────────────────┘

Per-Field Strategy Overrides (optional):
┌──────────────────┬─────────────┬─────────────────────┐
│ Collection       │ Field Name  │ Strategy Override    │
├──────────────────┼─────────────┼─────────────────────┤
│ appointments     │ balance     │ server-wins       ▼  │
│ notes            │ draft       │ client-wins       ▼  │
│ [+ Add Override]                                      │
└──────────────────┴─────────────┴─────────────────────┘
```

**What gets saved in the manifest JSON:**

```json
{
  "id": "com.clinic.appointments",
  "name": "Clinic Appointments",
  "version": "1.0.0",
  "entryScreen": "appointment-list",
  "sync": {
    "enabled": true,
    "collections": {
      "appointments": {
        "conflictStrategy": "server-wins",
        "syncIntervalMs": 30000,
        "fieldOverrides": {
          "balance": "server-wins"
        }
      },
      "notes": {
        "conflictStrategy": "client-wins",
        "syncIntervalMs": 60000,
        "fieldOverrides": {
          "draft": "client-wins"
        }
      }
    }
  }
}
```

**What the SDK runtime does with this config:**

1. Module loads → SDK reads `manifest.sync`
2. If `sync.enabled` is true → SDK configures the SyncEngine with these collections and strategies
3. Auto-sync starts for each collection at the specified interval
4. All screens in the module share this config — no per-screen conflicts

### Screen Builder — Per-Data-Source Sync Toggle

**Where:** `/developer/modules/[id]/screens/[screenId]` → Data Sources panel

Each data source gets a new **"Sync on Load"** toggle. This tells the SDK: "when this screen opens, sync this collection before showing data."

**What the developer sees in the data source panel:**

```
Data Source: appointments
├── API Endpoint: /api/appointments
├── Method: GET
├── Cache Policy: network-first
├── ☑ Sync on Load
│   └── Collection: appointments    (auto-filled from data source name)
```

**What gets saved in the screen schema JSON:**

```json
{
  "id": "appointment-list",
  "title": "My Appointments",
  "dataSources": {
    "appointments": {
      "url": "/api/appointments",
      "method": "GET",
      "cache": "network-first",
      "sync": {
        "syncOnLoad": true,
        "collection": "appointments"
      }
    }
  },
  "body": {
    "type": "column",
    "children": [...]
  }
}
```

**What the SDK runtime does:**

```
Screen opens
    │
    ▼
Data source "appointments" has sync.syncOnLoad = true?
    │
    ├── YES → syncEngine.sync("appointments")
    │         Push dirty entries, pull remote changes
    │         $data.appointments = entries from sync engine
    │
    └── NO  → Normal fetch: GET /api/appointments
              $data.appointments = API response
```

A screen WITHOUT `syncOnLoad` still benefits from sync — if another screen already synced the "appointments" collection, the data is available in the local store. But the screen won't trigger a sync itself on load.

### Screen Builder — Track Changes on API Submit

**Where:** `/developer/modules/[id]/screens/[screenId]` → Event configuration for `api_submit` actions

When a button's `onPress` is set to `api_submit`, a new **"Track for Sync"** toggle appears. This tells the SDK: "after submitting this data to the API, also save it locally so it syncs later."

**What the developer sees in the event config:**

```
Button: "Book Appointment"
├── Event: onPress
├── Action: API Submit
│   ├── API Path: /api/appointments
│   ├── Method: POST
│   ├── Body Template: {"date": "$state.date", "time": "$state.time"}
│   ├── Response Key: bookingResult
│   ├── ☑ Track for Sync
│   │   └── Collection: appointments
│   ├── On Success → Show Toast ("Appointment booked!")
│   └── On Error → Show Toast ("Failed to book")
```

**What gets saved in the screen schema JSON:**

```json
{
  "type": "button",
  "props": { "label": "Book Appointment" },
  "onPress": {
    "type": "api_submit",
    "api": "/api/appointments",
    "method": "POST",
    "bodyTemplate": {
      "date": "$state.date",
      "time": "$state.time"
    },
    "responseKey": "bookingResult",
    "sync": {
      "trackChanges": true,
      "collection": "appointments"
    },
    "onSuccess": [
      { "type": "show_toast", "message": "Appointment booked!", "variant": "success" }
    ],
    "onError": [
      { "type": "show_toast", "message": "Failed to book", "variant": "error" }
    ]
  }
}
```

**What the SDK runtime does:**

```
User taps "Book Appointment"
    │
    ▼
API Submit: POST /api/appointments { date, time }
    │
    ├── Server responds 200 OK, body: { id: "appt-789", ... }
    │
    ▼
sync.trackChanges = true?
    │
    ├── YES → syncEngine.trackChange("appointments", "appt-789", { date, time, ... })
    │         Entry saved to MMKV with vector clock
    │         If device goes offline later, this entry is preserved
    │
    └── NO  → Nothing extra happens (normal api_submit behavior)
    │
    ▼
On Success actions run → Show Toast
```

**Offline scenario with trackChanges:**

```
User taps "Book Appointment" while OFFLINE
    │
    ▼
API Submit: POST /api/appointments → NETWORK ERROR
    │
    ▼
sync.trackChanges = true?
    │
    ├── YES → syncEngine.trackChange("appointments", generateId(), { date, time })
    │         Entry saved locally as DIRTY
    │         On Error actions show toast: "Saved offline, will sync later"
    │
    │         ... later, device comes online ...
    │         syncEngine.sync("appointments") → pushes dirty entry to server
    │
    └── NO  → On Error actions run → "Failed to book" → Data lost
```

### Complete Flow — Manifest + Builder Working Together

Here's the full picture for a "Clinic Appointments" module:

**Step 1: Developer configures sync in the Manifest Editor**

```json
{
  "sync": {
    "enabled": true,
    "collections": {
      "appointments": {
        "conflictStrategy": "server-wins",
        "syncIntervalMs": 30000
      }
    }
  }
}
```

This means:
- The "appointments" collection is sync-enabled
- Server wins on conflicts (clinic's schedule is authoritative)
- Auto-sync every 30 seconds while the module is active

**Step 2: Developer configures screens in the Screen Builder**

**Screen A — Appointment List:**

```json
{
  "dataSources": {
    "appointments": {
      "url": "/api/appointments",
      "sync": { "syncOnLoad": true, "collection": "appointments" }
    }
  }
}
```

When this screen opens → sync runs → `$data.appointments` comes from local store.

**Screen B — Booking Form:**

```json
{
  "onPress": {
    "type": "api_submit",
    "api": "/api/appointments",
    "method": "POST",
    "sync": { "trackChanges": true, "collection": "appointments" }
  }
}
```

When user submits → data sent to API AND saved locally for sync.

**Screen C — Settings:**

```json
{
  "dataSources": {
    "preferences": {
      "url": "/api/preferences"
    }
  }
}
```

No sync config → normal API fetch. Preferences are not synced.

**Step 3: What happens at runtime**

```
Module opens
    │
    ▼
SDK reads manifest.sync → configures SyncEngine
    - collection "appointments", server-wins, auto-sync 30s
    - auto-sync timer starts
    │
    ▼
Screen A loads (appointment list)
    │
    ├── Data source "appointments" has syncOnLoad: true
    ├── syncEngine.sync("appointments")
    │   ├── PUSH dirty entries (if any)
    │   └── PULL new entries from server
    ├── $data.appointments = entries from sync engine
    └── Repeater renders appointment cards
    │
    ▼
User navigates to Screen B (booking form)
    │
    ├── User fills form and taps "Book"
    ├── api_submit: POST /api/appointments → server responds with new appointment
    ├── trackChanges: true → syncEngine.trackChange("appointments", newId, data)
    └── Entry saved in MMKV with vector clock
    │
    ▼
User navigates back to Screen A
    │
    ├── syncOnLoad: true → syncEngine.sync("appointments")
    ├── New booking is already in local store (just tracked it)
    ├── Pull brings any server-side changes (e.g., admin confirmed the booking)
    └── List shows updated data
    │
    ▼
30 seconds pass → auto-sync fires
    │
    ├── syncEngine.syncAll() runs in background
    ├── Any dirty entries pushed
    ├── Any server changes pulled
    └── Screen updates if data changed
    │
    ▼
User backgrounds the app → kernel.suspend()
    │
    ├── syncEngine.stop() → auto-sync timer cleared
    └── All data persisted in MMKV
    │
    ▼
User reopens app → kernel.resume()
    │
    ├── syncEngine.start() → auto-sync timer restarted
    ├── MMKV data loaded → entries available immediately
    └── Next sync pushes/pulls to reconcile
```

### What the Module Developer's Backend Must Implement

Regardless of the builder configuration, the module's own backend must implement two endpoints per collection:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/sync/appointments/push` | Receive entries from the device |
| `POST /api/sync/appointments/pull` | Return entries modified since a timestamp |

See the [Sample Backend Implementation](#sample-backend-implementation) section above for complete, copy-paste-ready code.

### Summary: Where Each Setting Lives

| Setting | Where | Stored In | Purpose |
|---------|-------|-----------|---------|
| `sync.enabled` | Manifest Editor | manifest JSON | Turn sync on/off for the whole module |
| `sync.collections.{name}.conflictStrategy` | Manifest Editor | manifest JSON | How conflicts are resolved for this collection |
| `sync.collections.{name}.syncIntervalMs` | Manifest Editor | manifest JSON | Auto-sync interval in milliseconds |
| `sync.collections.{name}.fieldOverrides` | Manifest Editor | manifest JSON | Per-field conflict strategy overrides |
| `dataSource.sync.syncOnLoad` | Screen Builder | screen schema JSON | Trigger sync when this screen loads |
| `dataSource.sync.collection` | Screen Builder | screen schema JSON | Which collection this data source maps to |
| `action.sync.trackChanges` | Screen Builder | screen schema JSON | Save submitted data locally for sync |
| `action.sync.collection` | Screen Builder | screen schema JSON | Which collection to track changes in |
