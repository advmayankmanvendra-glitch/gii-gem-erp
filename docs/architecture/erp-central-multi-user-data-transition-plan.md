# Central Multi-User Data Transition Plan

**Phase:** Stage 11  
**Date:** 2026-07-22  
**Status:** Planning document (no implementation)  

---

## 1. Current Local SQLite Limitations

The ERP currently uses an embedded SQLite database through `better-sqlite3`. This provides:

- Zero server infrastructure
- Single-file portability
- Fast local read/write
- Simple backup (file copy)

**Limitations that block shared multi-user operation:**

| Limitation | Impact |
|------------|--------|
| Single-writer concurrency | SQLite serializes writes; concurrent users queue |
| No network access | Each Electron instance owns its local file |
| File-level divergence | Two copies of the DB on separate machines diverge immediately |
| No user-level permissions | SQLite has no row/column-level access control |
| No audit identity | No connection-level user tracking |
| No real-time sync | No push/pull mechanism between instances |
| WAL mode helps readers but not writers | Readers can proceed during writes, but writers still serialize |

---

## 2. Why SQLite Must Not Be Directly Shared

A SQLite database file placed on a network share (SMB/NFS) is **not safe** for:

- Concurrent writes from multiple machines (corruption risk)
- Transaction isolation across connections
- Reliable WAL/SHM handling over network filesystems
- Performance under contention

Network filesystem locks are not equivalent to database-level transaction isolation. The SQLite documentation explicitly warns against using database files on network shares for write workloads.

---

## 3. Target Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Electron       │────▶│  ERP API         │────▶│  PostgreSQL          │
│  Client         │     │  (Node.js/HTTP)  │     │  (Central Database)  │
│  (SQLite        │     │                  │     │                      │
│   local cache)  │     │  - Auth/RBAC     │     │  - All ERP data      │
│                 │     │  - Business      │     │  - Multi-company     │
│  - UI rendering │     │    logic         │     │  - Multi-branch      │
│  - Offline      │     │  - Validation    │     │  - Audit trail       │
│    capability   │     │  - API version   │     │  - Backups           │
│  - Local cache  │     │    compatibility │     │                      │
│  - Print/export │     │  - Rate limiting │     │                      │
└─────────────────┘     └──────────────────┘     └──────────────────────┘
```

### Interim Phase: API-Owned SQLite

Before migrating to PostgreSQL, an intermediate architecture places SQLite behind a REST API:

```
Electron Client ────▶ Node.js API ────▶ SQLite (server-managed)
  (thin client)         (owns the DB)    (single file, single writer)
```

This eliminates multi-file divergence while keeping SQLite's simplicity. The API owns the database file; clients submit requests over HTTP.

### Target Phase: PostgreSQL

```
Electron Client ────▶ Node.js API ────▶ PostgreSQL
                                           │
                                     ┌─────┴─────┐
                                     │  Read      │
                                     │  Replica   │
                                     │  (reports) │
                                     └───────────┘
```

---

## 4. Authentication and RBAC Impact

Current:
- Local user table with password hashing
- `viewer` / `operator` / `admin` roles enforced in IPC handlers
- Single-instance, single-machine trust model

Target:
- OAuth2 / JWT-based authentication
- Server-enforced role-based access control
- Per-company and per-branch tenancy
- Session management with token refresh
- API key support for integration clients

---

## 5. Company and Branch Tenancy

All data must be scoped by:
- `company_id` (already present on most tables)
- `branch_id` (new, not yet implemented)

The API layer must enforce that a user authenticated for Company A cannot access Company B's data. The current renderer-side filtering provides UI convenience but is not a security boundary.

---

## 6. API Version Compatibility

The ERP API must support versioned endpoints:

```
/api/v1/accounts
/api/v2/accounts   (breaking change)
```

The Electron client declares its API version on every request. The server rejects incompatible versions with a clear upgrade message.

---

## 7. Offline Operation

The Electron client may maintain a local SQLite cache for:

- Reading reference data while offline
- Queueing transactions for sync when connectivity resumes
- Supporting field operations with intermittent connectivity

Conflict resolution strategy: **last-writer-wins** for independent fields, **manual reconciliation** for accounting-critical operations.

---

## 8. Migration Sequence from Local to Central

```
Phase 1: API-Owned SQLite
  Deploy Node.js API server
  Migrate local DB to API-managed SQLite
  Electron becomes thin client

Phase 2: PostgreSQL Migration
  Add PostgreSQL driver
  Run schema migration (SQLite → PostgreSQL)
  Dual-write during transition
  Cut over when verified

Phase 3: Read Replicas
  Add reporting replicas
  Offload analytical queries

Phase 4: Shard / Scale
  Add connection pooling
  Consider read replicas for reporting
```

---

## 9. UAT and Production Environment Separation

| Environment | Database | API URL | Purpose |
|-------------|----------|---------|---------|
| Development | Local SQLite | N/A | Developer testing |
| UAT | API SQLite | `uat-api.example.com` | Feature validation |
| Staging | PostgreSQL (staging) | `staging-api.example.com` | Pre-production |
| Production | PostgreSQL (production) | `api.example.com` | Live data |

Each environment must have separate database instances. No environment should share data.

---

## 10. Risks and Dependencies

| Risk | Mitigation |
|------|------------|
| API becomes bottleneck | Horizontal scaling, connection pooling |
| Network latency | Local cache, optimistic UI |
| Offline data conflicts | Clear conflict resolution policy |
| Migration data loss | Backup before any migration, verify row counts |
| Cost of server infrastructure | Start with single API + SQLite (low cost) |
| Development velocity | Maintain local SQLite mode for rapid development |

---

## 11. Recommendation

**Do not begin API/multi-user implementation** until:

1. Local update/release pipeline is certified (FSR lock complete)
2. Backup and restore are verified with production-scale data
3. The schema migration system has been tested with historical fixtures
4. A formal security review has been completed
5. Infrastructure requirements and hosting budget are approved

The current priority remains: **local single-user stability**, then **controlled team UAT**, then **central multi-user architecture**.
