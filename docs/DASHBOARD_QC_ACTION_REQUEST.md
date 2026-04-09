# Action Required: Dashboard QC Consistency Fix

Date: 2026-04-09
Owner: Dashboard/Backend Team
Priority: High

## Current Production Status

- Operator writes are succeeding for:
  - `upsertMeasurementResults`
  - `upsertMeasurementResultsDetailed`
  - `upsertMeasurementSession`
- Remaining issue is dashboard read consistency:
  - duplicate first piece,
  - delayed appearance of later pieces,
  - data reversion/disappearance after reload.

## Required Changes

1. Piece count logic
- Source piece KPI from `measurement_sessions` only.
- Count only `status = 'completed'` sessions.
- Do not derive piece count from `measurement_results` row count.

2. Measurement table logic
- For current-state tables, select the latest row per logical key.
- Aggregate latest key: `(purchase_order_article_id, size, measurement_id)` by `updated_at DESC, id DESC`.
- Detailed latest key: `(purchase_order_article_id, size, side, measurement_id)` by `updated_at DESC, id DESC`.

3. Reload and live path parity
- Ensure initial load, manual refresh, and post-mutation refresh use the same query source and filters.
- Ensure identical status, date-window, and timezone handling across paths.

4. Cache invalidation
- Invalidate/refetch canonical QC query on mutation success.
- Confirm no stale cached query is used after full reload.

## SQL Checks to Run

Use the exact `(purchase_order_article_id, size)` where issue reproduces.

### Session stream check

```sql
SELECT
  id,
  purchase_order_article_id,
  size,
  status,
  updated_at,
  created_at
FROM measurement_sessions
WHERE purchase_order_article_id = :po_article_id
  AND size = :size
ORDER BY updated_at ASC, id ASC;
```

### Aggregate duplicate check

```sql
SELECT
  purchase_order_article_id,
  size,
  measurement_id,
  COUNT(*) AS row_count,
  MAX(updated_at) AS latest_update
FROM measurement_results
WHERE purchase_order_article_id = :po_article_id
  AND size = :size
GROUP BY purchase_order_article_id, size, measurement_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC, measurement_id;
```

### Detailed duplicate check

```sql
SELECT
  purchase_order_article_id,
  size,
  side,
  measurement_id,
  COUNT(*) AS row_count,
  MAX(updated_at) AS latest_update
FROM measurement_results_detailed
WHERE purchase_order_article_id = :po_article_id
  AND size = :size
GROUP BY purchase_order_article_id, size, side, measurement_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC, side, measurement_id;
```

## Required Deliverables Back

1. Exact query/SQL currently used for:
- Piece KPI card
- Piece details table
- Full page reload path

2. Patched query/SQL showing:
- completed-only piece counting
- latest-row dedupe logic

3. Verification evidence for one test case:
- piece 1/2/3 appear exactly once,
- no delayed arrival beyond refresh interval,
- no reversion after full reload.

## Acceptance Criteria

- Piece count increments by exactly +1 per completed piece.
- Piece rows are not duplicated for same logical piece.
- Data remains stable after hard reload.
- Live update and reload show identical values.

## Reference

Detailed technical handoff: `docs/DASHBOARD_QC_CONSISTENCY_HANDOFF.md`