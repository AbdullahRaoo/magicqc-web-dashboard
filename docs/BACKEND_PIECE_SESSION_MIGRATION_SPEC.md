# Backend Spec: Piece-Session Persistence and Query Contract

Date: 2026-04-09
Owner: Backend + Dashboard
Priority: Critical

## 1) Problem Statement

Current writes are successful but piece history is not preserved correctly for dashboard use.

Observed behavior:
- Multiple physical pieces for the same `(purchase_order_article_id, size)` are upserted into the same logical rows.
- Dashboard may show duplicates, late updates, or apparent non-updates because data is interpreted as history while storage behaves as current-state overwrite.

Root cause:
- Write payloads do not carry a unique piece/session key.
- Upsert uniqueness is currently tied to `(purchase_order_article_id, size, measurement_id[, side])`, which cannot distinguish piece #1 vs piece #2.

## 2) Design Goal

Separate two concepts:

1. Piece history (append-only at piece granularity)
- One completed piece must be uniquely identifiable and queryable.

2. Current state (latest projection)
- Fast dashboard/table reads can still use latest-only views.

## 3) Required Data Contract Changes

Add `piece_session_id` (UUID string) to all write flows:

- `upsertMeasurementSession`
- `upsertMeasurementResultsDetailed`
- `upsertMeasurementResults`

Client behavior contract:
- Generate `piece_session_id` at Start Measurement (or first write of a piece).
- Reuse same `piece_session_id` for all writes of that physical piece.
- On Next Piece completion, close current piece and generate a new `piece_session_id` for the next piece.

## 4) Database Migration

## 4.1 Add columns

```sql
ALTER TABLE measurement_sessions
  ADD COLUMN piece_session_id CHAR(36) NULL AFTER size;

ALTER TABLE measurement_results
  ADD COLUMN piece_session_id CHAR(36) NULL AFTER size;

ALTER TABLE measurement_results_detailed
  ADD COLUMN piece_session_id CHAR(36) NULL AFTER size;
```

## 4.2 Backfill existing rows (best effort)

```sql
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

Note: historical linkage across three tables cannot be perfectly reconstructed without prior key; this is acceptable for forward correctness.

## 4.3 Add indexes/constraints

Recommended uniqueness (history-safe while allowing per-piece updates):

```sql
-- Sessions: one logical session record per piece and status transition strategy
CREATE INDEX idx_sessions_piece_session
  ON measurement_sessions(piece_session_id);

-- Aggregate current rows per piece+measurement
CREATE UNIQUE INDEX uq_results_piece_measurement
  ON measurement_results(piece_session_id, purchase_order_article_id, size, measurement_id);

-- Detailed current rows per piece+side+measurement
CREATE UNIQUE INDEX uq_results_detailed_piece_side_measurement
  ON measurement_results_detailed(piece_session_id, purchase_order_article_id, size, side, measurement_id);

-- Helpful dashboard indexes
CREATE INDEX idx_sessions_lookup
  ON measurement_sessions(purchase_order_article_id, size, status, updated_at);

CREATE INDEX idx_results_lookup
  ON measurement_results(purchase_order_article_id, size, updated_at);

CREATE INDEX idx_results_detailed_lookup
  ON measurement_results_detailed(purchase_order_article_id, size, side, updated_at);
```

## 5) GraphQL Schema Changes

## 5.1 Input types

Add `piece_session_id` to relevant inputs:

- `MeasurementResultInput`
- `DetailedResultInput` OR top-level args in detailed mutation (preferred at top-level arg)
- `upsertMeasurementSession` args

Example:

```graphql
input MeasurementResultInput {
  purchase_order_article_id: Int!
  measurement_id: Int!
  size: String!
  piece_session_id: String!
  measured_value: Float
  expected_value: Float
  tol_plus: Float
  tol_minus: Float
  status: String!
  operator_id: Int
}
```

```graphql
mutation upsertMeasurementResultsDetailed(
  $purchase_order_article_id: Int!
  $size: String!
  $side: String!
  $piece_session_id: String!
  $results: [DetailedResultInput!]!
) { ... }
```

```graphql
mutation upsertMeasurementSession(
  purchase_order_article_id: Int!
  size: String!
  piece_session_id: String!
  status: String!
  ...
) { ... }
```

## 5.2 Query fields (must exist for verification/dashboard)

Expose (or restore) queries currently missing on target schema:

- `measurementSessions`
- `measurementResults`
- `measurementResultsDetailed`

Minimum filter args:

- `purchase_order_article_id`
- `size`
- optional `piece_session_id`
- optional pagination/sort

## 6) Resolver Behavior

## 6.1 Session mutation

- Upsert by `(piece_session_id)` as primary logical key.
- Preserve latest status (`in_progress`, `completed`) for that piece.
- Keep `updated_at` updated on each transition.

## 6.2 Detailed mutation

- Require `piece_session_id`.
- Upsert rows by `(piece_session_id, purchase_order_article_id, size, side, measurement_id)`.
- Never collapse rows across different piece sessions.

## 6.3 Aggregate mutation

- Require `piece_session_id`.
- Upsert rows by `(piece_session_id, purchase_order_article_id, size, measurement_id)`.
- Keep compatibility handling for optional columns (for example `article_style`) as already implemented.

## 7) Dashboard Query Contract

## 7.1 Piece KPI

Count completed pieces from sessions only:

```sql
SELECT COUNT(DISTINCT piece_session_id) AS completed_piece_count
FROM measurement_sessions
WHERE purchase_order_article_id = :po_article_id
  AND size = :size
  AND status = 'completed';
```

## 7.2 Latest piece list

```sql
SELECT s.*
FROM measurement_sessions s
WHERE s.purchase_order_article_id = :po_article_id
  AND s.size = :size
ORDER BY s.updated_at DESC, s.id DESC;
```

## 7.3 Current-state measurements for a specific piece

```sql
SELECT r.*
FROM measurement_results r
WHERE r.piece_session_id = :piece_session_id
ORDER BY r.measurement_id;
```

Use analogous query for detailed rows with side.

## 8) Backward Compatibility and Rollout

Phase 1: server-first compatibility
- Accept missing `piece_session_id` temporarily.
- If missing, generate one server-side and return it in mutation response.
- Log warning `missing_piece_session_id` for client telemetry.

Phase 2: client update
- Operator sends `piece_session_id` on all writes.

Phase 3: enforce contract
- Make `piece_session_id` required in schema.
- Reject writes without it once all clients are upgraded.

## 9) Acceptance Tests

Test case using one `(purchase_order_article_id, size)` with 3 physical pieces:

1. Piece 1 front+back+complete
2. Piece 2 front+back+complete
3. Piece 3 front+back+complete

Expected DB outcomes:
- 3 distinct `piece_session_id` values in `measurement_sessions` with `completed`.
- Measurement rows grouped by those same 3 session IDs.
- No cross-piece overwrites.

Expected dashboard outcomes:
- Piece KPI increments 1, 2, 3 exactly.
- Reload shows same values as live view.
- No duplicate piece rows.

## 10) Immediate Hotfix (Optional While Backend Work Is In Progress)

To reduce confusion before full contract migration:
- Disable post-completion autosave for 3-5 seconds after Next Piece success, or
- Freeze autosave while QC result popup is open.

This does not solve history modeling, but reduces near-term overwrite churn.

## 11) Deliverables Required from Backend Team

1. Migration PR with SQL + indexes.
2. GraphQL schema PR adding `piece_session_id` and read queries.
3. Resolver PR showing new upsert keys.
4. Proof output for 3-piece test with distinct `piece_session_id` values.
