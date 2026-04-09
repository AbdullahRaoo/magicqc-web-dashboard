# Piece Session ID Implementation Guide

**Date:** 2026-04-09  
**Priority:** Critical - Blocks stable dashboard display  
**Scope:** Operator Panel (Electron/Browser) → Backend GraphQL

---

## Problem (Root Cause)

Multiple physical pieces for the same `(purchase_order_article_id, size)` were **overwriting each other** in the database because:

1. **UpsertMeasurementSession** keyed on `(purchase_order_article_id, size)` only  
2. **UpsertMeasurementResults** keyed on `(purchase_order_article_id, measurement_id, size)` only  
3. **UpsertMeasurementResultsDetailed** **deleted all previous records** for `(purchase_order_article_id, size, side)` before inserting

Result: 
- Piece 1 → written to `measurement_sessions` with key `(poa, size)`
- Piece 2 → **overwrites** Piece 1 (same key)
- Dashboard counts piece 1 duplicate or misses it entirely
- Reload shows different data (whichever row happened to be "latest")

---

## Solution

**Add `piece_session_id` (UUID) to track each physical piece individually.**

### Client Behavior Contract

The **Operator Panel** (Electron/browser app) must:

1. **On "Start Measurement" button click:**
   ```
   generate new UUID for piece_session_id
   send with upsertMeasurementSession(piece_session_id, ...)
   ```

2. **On "Record Front Side" button click:**
   ```
   send same piece_session_id with upsertMeasurementResultsDetailed(piece_session_id, side: "front", ...)
   ```

3. **On "Record Back Side" button click:**
   ```
   send same piece_session_id with upsertMeasurementResultsDetailed(piece_session_id, side: "back", ...)
   ```

4. **On "Next Piece" / "Complete" button click:**
   ```
   generate NEW UUID for next physical piece
   send with new upsertMeasurementSession(new_piece_session_id, ...)
   ```

---

## Database Changes

### Migration Applied

[Database migration file created:](../database/migrations/2026_04_09_add_piece_session_id_to_measurements.php)
- Adds `piece_session_id CHAR(36)` column to all three tables
- Creates indexes on `piece_session_id`
- Updates unique constraints to include `piece_session_id`:
  - `measurement_sessions`: indexed on `(piece_session_id)` 
  - `measurement_results`: unique on `(piece_session_id, purchase_order_article_id, measurement_id, size)`
  - `measurement_results_detailed`: unique on `(piece_session_id, purchase_order_article_id, size, side, measurement_id)`

### Historic Data Backfill

Before deploying new client code, run:

```sql
-- Backfill existing rows with UUIDs (one unique UUID per logical piece key)
UPDATE measurement_sessions
SET piece_session_id = UUID()
WHERE piece_session_id IS NULL;

UPDATE measurement_results
SET piece_session_id = UUID()
WHERE piece_session_id IS NULL;

UPDATE measurement_results_detailed
SET piece_session_id = UUID()
WHERE piece_session_id IS NULL;
```

---

## GraphQL Schema Changes

### Mutations Updated

All three mutations now **require** `piece_session_id` as a mandatory string argument:

```graphql
mutation upsertMeasurementSession(
  $piece_session_id: String!        # ← NEW (required)
  $purchase_order_article_id: Int!
  $size: String!
  ...
) { ... }

mutation upsertMeasurementResults(
  $results: [MeasurementResultInput!]!
) { ... }
# Note: piece_session_id is included in each result object in $results

mutation upsertMeasurementResultsDetailed(
  $piece_session_id: String!        # ← NEW (required)
  $purchase_order_article_id: Int!
  $size: String!
  $side: String!
  $results: [DetailedResultInput!]!
) { ... }
```

### Input Types Updated

```graphql
input MeasurementResultInput {
  piece_session_id: String!         # ← NEW
  purchase_order_article_id: Int!
  measurement_id: Int!
  size: String!
  # ... rest of fields
}
```

---

## Backend Resolvers Updated

### UpsertMeasurementSession

[File: app/GraphQL/Mutations/UpsertMeasurementSession.php](../app/GraphQL/Mutations/UpsertMeasurementSession.php)

**Changes:**
- Validates `piece_session_id` is present; rejects if missing
- Upserts on `(piece_session_id)` as unique key (each piece gets one row)
- Updates `updated_at` on state transitions

**SQL Outcome:**
```sql
INSERT INTO measurement_sessions(..., piece_session_id, ...) 
VALUES(..., '550e8400-e29b-41d4-a716-446655440000', ...)
ON DUPLICATE KEY UPDATE status = ..., updated_at = NOW()
```

---

### UpsertMeasurementResults

[File: app/GraphQL/Mutations/UpsertMeasurementResults.php](../app/GraphQL/Mutations/UpsertMeasurementResults.php)

**Changes:**
- Detects if `piece_session_id` column exists; includes in row if present
- Upserts on `(piece_session_id, purchase_order_article_id, measurement_id, size)` if column exists
- Falls back to `(purchase_order_article_id, measurement_id, size)` for backward compat (during migration)

**SQL Outcome:**
```sql
INSERT INTO measurement_results(..., piece_session_id, purchase_order_article_id, measurement_id, size, ...)
VALUES(..., '550e8400-e29b-41d4-a716-446655440000', 1, 10, 'M', ...)
ON DUPLICATE KEY UPDATE measured_value = ..., updated_at = NOW()
```

---

### UpsertMeasurementResultsDetailed

[File: app/GraphQL/Mutations/UpsertMeasurementResultsDetailed.php](../app/GraphQL/Mutations/UpsertMeasurementResultsDetailed.php)

**Changes:**
- Requires `piece_session_id` parameter (rejects if missing)
- **Deletes ONLY records for this specific piece_session_id + side**, preserving history for other pieces
- Inserts new records with `piece_session_id`
- Auto-aggregates to `measurement_results` using piece-level data (scoped to this piece_session_id)

**Before (Broken - deletes all history):**
```sql
DELETE FROM measurement_results_detailed 
WHERE purchase_order_article_id = 1 AND size = 'M' AND side = 'front'
```
*Result: Loses Piece 1 front data when Piece 2 arrives*

**After (Fixed - preserves history):**
```sql
DELETE FROM measurement_results_detailed 
WHERE piece_session_id = '550e8400-e29b-41d4-a716-446655440000' 
  AND purchase_order_article_id = 1 AND size = 'M' AND side = 'front'
```
*Result: Only current piece data is updated; Piece 1 history stays intact*

---

## Rollout Strategy

### Phase 1: Backend-Only (Backward Compatible)

1. Deploy migration:  
   ```bash
   php artisan migrate
   ```

2. Deploy updated mutations  
   *Mutations accept piece_session_id but don't require it during Phase 1*

3. Backfill historic data:  
   ```bash
   mysql -h$DB_HOST -u$DB_USER -p$DB_PASS $DB_NAME < backfill-piece-session-ids.sql
   ```

### Phase 2: Client Update

1. Update Electron/browser operator panel to:
   - Generate `piece_session_id` on app start or "New Piece" click
   - Send it with ALL three mutations

2. Verify via:
   ```bash
   ./scripts/verify-qc-graphql-writes.sh
   ```

---

## Implementation Checklist for Operator Panel Team

### Before Deploying Operator Panel Code

- [ ] Database migration applied (`php artisan migrate`)
- [ ] Backend mutations deployed
- [ ] Historic data backfilled with UUIDs
- [ ] Verification script passes: `./scripts/verify-qc-graphql-writes.sh`

### Operator Panel Code Changes Required

- [ ] Generate UUID on app init or per session:
  ```javascript
  // Example
  import { v4 as uuidv4 } from 'uuid';
  const pieceSessionId = uuidv4();  // e.g., '550e8400-e29b-41d4-...'
  ```

- [ ] Pass `piece_session_id` to mutation calls:
  ```javascript
  // upsertMeasurementSession
  upsertMeasurementSession(piece_session_id, poArticleId, size, ...)
  
  // upsertMeasurementResultsDetailed front
  upsertMeasurementResultsDetailed(piece_session_id, poArticleId, size, 'front', results)
  
  // upsertMeasurementResultsDetailed back
  upsertMeasurementResultsDetailed(piece_session_id, poArticleId, size, 'back', results)
  
  // upsertMeasurementResults (if direct call)
  upsertMeasurementResults([
    { piece_session_id, purchase_order_article_id, measurement_id, size, ... }
  ])
  ```

- [ ] On "Next Piece" click: generate NEW `piece_session_id`

- [ ] Test end-to-end:
  1. Start measurement → piece 1 inserted with `piece_session_id` UUID-1
  2. Save front side → measurement stored with UUID-1
  3. Save back side → measurement stored with UUID-1
  4. Click "Next Piece" → piece 2 inserted with `piece_session_id` UUID-2
  5. Reload dashboard → piece 1 AND piece 2 both visible (not duplicated, not lost)

---

## Expected Dashboard Outcomes (After Fix)

| Measurement | Before Fix | After Fix |
|---|---|---|
| Piece count | 1 (duplicated or missing) | 3 (one per physical piece) |
| Piece 1 rows | 0 or 2 (lost or overwritten) | 1 |
| Piece 2 rows | 0 or 2 (overwritten) | 1 |
| Piece 3 rows | 1 | 1 |
| Reload stability | ❌ Values change | ✅ Values stable |
| History preserved | ❌ No | ✅ Yes |

---

## SQL Queries to Validate Fix (Post-Deploy)

### Verify piece tracking

```sql
-- Count distinct piece_session_id for one PO article + size
SELECT 
  piece_session_id,
  COUNT(*) as record_count,
  MAX(updated_at) as latest_update
FROM measurement_sessions
WHERE purchase_order_article_id = 1 AND size = 'M'
GROUP BY piece_session_id
ORDER BY latest_update DESC;
```

**Expected:** One row per physical piece, each with distinct UUID

### Verify no cross-piece overwrites

```sql
SELECT 
  piece_session_id,
  measurement_id,
  COUNT(*) as row_count
FROM measurement_results
WHERE purchase_order_article_id = 1 AND size = 'M'
GROUP BY piece_session_id, measurement_id
HAVING COUNT(*) > 1;
```

**Expected:** No rows (each piece + measurement is unique)

### Verify aggregation works per-piece

```sql
SELECT 
  piece_session_id,
  COUNT(DISTINCT side) as sides_recorded,
  status
FROM measurement_results_detailed
WHERE purchase_order_article_id = 1 AND size = 'M'
GROUP BY piece_session_id, status
ORDER BY piece_session_id;
```

**Expected:** Multiple rows (one per piece per status), front and back both present

---

## References

- [GraphQL Schema Update](../graphql/schema.graphql)
- [Migration File](../database/migrations/2026_04_09_add_piece_session_id_to_measurements.php)
- [UpsertMeasurementSession Resolver](../app/GraphQL/Mutations/UpsertMeasurementSession.php)
- [UpsertMeasurementResults Resolver](../app/GraphQL/Mutations/UpsertMeasurementResults.php)
- [UpsertMeasurementResultsDetailed Resolver](../app/GraphQL/Mutations/UpsertMeasurementResultsDetailed.php)
- [Verification Script](../scripts/verify-qc-graphql-writes.sh)
