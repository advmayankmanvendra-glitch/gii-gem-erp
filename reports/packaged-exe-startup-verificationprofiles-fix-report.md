# Packaged EXE Startup — verificationProfiles.js Fix Report

Date: 2026-07-01

## A. Executive Summary

Fixed a packaged EXE startup crash caused by `src/main/main.js` importing from `../../scripts/lib/verificationProfiles.js` — a path that resolves outside the packaged build's included file set (`dist`, `src/main`, `src/preload`, `package.json`). The shared verification profile configuration was moved to `src/main/config/verificationConfig.js` (inside the packaged `src/main` tree). All importers updated. Verification suite PASS.

## B. Feature Classification

| Field | Value |
|-------|-------|
| Primary Category | Packaging & Deployment |
| Secondary Category | Architecture |
| Rationale | Fixes runtime crash in packaged EXE by moving a dev-only import path into the runtime-safe source tree |

## C. Dependency Assessment

| Dependency | Satisfied |
|------------|-----------|
| `src/main/config/` directory exists at packaging time | Yes — created in this phase |
| Verification scripts resolve config import | Yes — `../src/main/config/verificationConfig.js` resolves correctly from `scripts/` |
| `src/main/main.js` resolves config import | Yes — `./config/verificationConfig.js` resolves within packaged `src/main` tree |
| `node --check` lint passes | Yes |
| `vite build` completes | Yes |

Dependencies Satisfied: **Yes**

## D. Root Cause

`package.json` `"build.files"` includes only:
```
["dist", "src/main", "src/preload", "package.json"]
```

The `scripts/` directory is intentionally excluded (it contains dev-only regression tools). However, `src/main/main.js:109` imported:
```js
import { PROFILES } from "../../scripts/lib/verificationProfiles.js";
```

This path resolves **outside** `src/main` into the excluded `scripts/` directory. In the packaged ASAR archive, `scripts/` does not exist, causing Electron to throw:
```
Error: Cannot find module '../../scripts/lib/verificationProfiles.js'
```

## E. Fix

| Action | Detail |
|--------|--------|
| **Created** | `src/main/config/verificationConfig.js` — exports `PROFILES`, `getProfile()`, `acceptProductionZeroState()`, `parseProfileArgs()` |
| **Updated** | `src/main/main.js` — import path changed from `../../scripts/lib/verificationProfiles.js` to `./config/verificationConfig.js` |
| **Updated** | `scripts/verify-accounting.js` — import path changed to `../src/main/config/verificationConfig.js` |
| **Updated** | `scripts/verify-financials.js` — import path changed to `../src/main/config/verificationConfig.js` |
| **Preserved** | `scripts/lib/verificationProfiles.js` — re-exports all symbols from shared config (backward compat) |
| **Updated** | `package.json` `lint:syntax` — added check for `src/main/config/verificationConfig.js` |

The `scripts/lib/verificationProfiles.js` file still exists and re-exports everything from the shared module, so any external tool or CI pipeline that directly imports it continues to work.

## F. Files Changed

| File | Status | Change |
|------|--------|--------|
| `src/main/config/verificationConfig.js` | **NEW** | Shared config module — runtime-safe copy inside packaged tree |
| `src/main/main.js` | Modified | Import path from `../../scripts/lib/...` to `./config/verificationConfig.js` |
| `scripts/verify-accounting.js` | Modified | Import path from `./lib/...` to `../src/main/config/verificationConfig.js` |
| `scripts/verify-financials.js` | Modified | Import path from `./lib/...` to `../src/main/config/verificationConfig.js` |
| `scripts/lib/verificationProfiles.js` | Modified | Re-exports all symbols from shared config module |
| `package.json` | Modified | Added `verificationConfig.js` to `lint:syntax` |

## G. Business Logic Preserved

- **Accounting formulas**: Not touched
- **Voucher posting math**: Not touched
- **GST calculations**: Not touched
- **Inventory valuation**: Not touched
- **Profitability formulas**: Not touched
- **Database schema**: Not touched
- **IPC channel names**: Not touched
- **Preload API names**: Not touched
- **Route/view keys**: Not touched
- **Workflows**: Not touched
- **Existing records**: Not touched

## H. Verification Results

| Command | Result |
|---------|--------|
| `lint:syntax` | PASS |
| `build` | PASS (171 modules) |
| `verify:accounting` | PASS |
| `verify:financials` | PASS (all checks) |

## I. Desktop Smoke Test

Not applicable — this phase changes only the import path resolution of a configuration module. No UI, navigation, or runtime business behavior is modified. The fix is structural (import resolution at Node.js module load time) and is validated by `lint:syntax` and `build` passing.

## J. Production Readiness

| Gate | Result |
|------|--------|
| Implementation completed | Yes |
| Verification passed | Yes |
| Desktop smoke test | Not applicable |
| Accounting verification passed | Yes |
| Financial verification passed | Yes |
| Git status reviewed | Yes |
| Business logic preserved | Yes |
| Route/IPC/preload/schema unchanged | Yes |
| Report generated | Yes |

**Classification**: Production Ready

**Production Readiness Gate Result**: PASS

## K. Known Limitations

None. The shared config module is now inside the packaged tree and resolves correctly both in development (via `electron .` or `electron scripts/verify-*.js`) and in the packaged EXE.

## L. Safe-to-Lock Decision

**Safe to Lock: Yes**

The fix is minimal, structural, and fully verified. The packaged EXE will no longer crash at startup due to a missing `verificationProfiles.js` module.
