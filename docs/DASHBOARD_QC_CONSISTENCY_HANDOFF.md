# Dashboard Handoff: Duplicate/Delayed/Reverting Piece Records

Date: 2026-04-09
Project: MagicQC Operator + Dashboard consistency

## Summary

Operator writes are now succeeding on the live GraphQL endpoint, but dashboard behavior is still inconsistent:

- First piece can appear duplicated in dashboard counts/list.
- Later pieces can appear delayed or missing.
- After dashboard refresh/reload, displayed data can revert.

This strongly indicates a dashboard/read-model issue (query semantics, dedupe/grouping, cache, or stale read source), not a current write-mutation failure.

## What Operator Actually Writes Per Piece

For one physical piece, current operator flow can produce multiple write events:

1. During live capture (while polling is active):
   - Autosave every ~2 seconds to aggregate mutation `upsertMeasurementResults`.
2. On Next Piece:
   - `upsertMeasurementResultsDetailed` for front side.
   - `upsertMeasurementResults` for front side aggregate compatibility.
   - `upsertMeasurementResultsDetailed` for back side (if back exists).
   - `upsertMeasurementResults` for back side aggregate compatibility.
   - `upsertMeasurementSession` with status `completed`.
3. On Start Measurement:
   - `upsertMeasurementSession` with status `in_progress`.

Implication: if dashboard reads raw tables without selecting the latest logical row per key/state, duplicates are expected.

## Observed Symptoms Mapped to Probable Causes

1. Symptom: first piece counted twice
- Likely cause A: dashboard piece counter includes both `measurement_sessions.status = in_progress` and `completed` rows as separate pieces.
- Likely cause B: dashboard piece counter derives from `measurement_results` row counts (autosave/upsert stream), not session-level completion records.

2. Symptom: second/third piece appears late
- Likely cause A: dashboard reads from cache/read replica with lag.
- Likely cause B: polling refresh interval too slow or invalidation not triggered on mutation completion.
- Likely cause C: query filtering excludes rows until status transition/updated_at boundary is crossed.

3. Symptom: values visible, then disappear/revert after reload
- Likely cause A: local optimistic state is shown initially, then replaced by backend query using different grouping/filter rules.
- Likely cause B: reload query points to a different source/table/view than live subscription/in-memory updates.
- Likely cause C: timezone/window filter mismatch (shift/date boundaries) removes valid rows after reload.

## Priority Checks for Dashboard Team

## 1) Verify source of truth for piece count

Piece count should be derived from session-completed records, not raw measurement rows.

Recommended counting logic:
- Count only `measurement_sessions` rows where `status = 'completed'`.
- Ensure one logical piece per unique session key (server-defined key), not one row per transient state.

If both statuses are stored as separate rows, dedupe by latest state per logical session key.

## 2) Verify dedupe/grouping keys for measurement rows

If dashboard displays per-POM measurements from `measurement_results` or `measurement_results_detailed`, select latest row per logical key, not all historical upserts.

Suggested logical keys:
- For aggregate table: `(purchase_order_article_id, size, measurement_id)` + latest `updated_at`.
- For detailed table: `(purchase_order_article_id, size, side, measurement_id)` + latest `updated_at`.

If side is not shown, merge front/back intentionally (never implicitly).

## 3) Validate cache/read-path consistency

Ensure live UI updates and reload both use the same backend query and same filters.

Check specifically:
- Same table/view for initial load and refresh.
- Same status filter (`completed` only for piece counts).
- Same shift/date/timezone conversion.
- Cache TTL and invalidation behavior on mutation success.

## 4) Validate ordering

Any query rendering latest QC state should order by `updated_at DESC` (and stable tie-breaker) before dedupe.

## SQL Diagnostics (Run on Dashboard Data Source)

Use the same `(purchase_order_article_id, size)` that reproduced issue.

### A. Session status stream

```sql
SELECT
  id,
  purchase_order_article_id,
  size,
  status,
  front_side_complete,
  back_side_complete,
  front_qc_result,
  back_qc_result,
  updated_at,
  created_at
FROM measurement_sessions
WHERE purchase_order_article_id = :po_article_id
  AND size = :size
ORDER BY updated_at ASC, id ASC;
```

Expected for one piece lifecycle: in_progress -> completed transition for the same logical session, not duplicated completed entries per one operator click.

### B. Aggregate measurement row multiplicity

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

If many duplicates exist, dashboard must select latest row per key.

### C. Detailed row multiplicity by side

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

### D. Latest-only projection example (safe for UI)

```sql
WITH ranked AS (
  SELECT
    r.*,
    ROW_NUMBER() OVER (
      PARTITION BY r.purchase_order_article_id, r.size, r.measurement_id
      ORDER BY r.updated_at DESC, r.id DESC
    ) AS rn
  FROM measurement_results r
  WHERE r.purchase_order_article_id = :po_article_id
    AND r.size = :size
)
SELECT *
FROM ranked
WHERE rn = 1
ORDER BY measurement_id;
```

Apply equivalent logic for detailed rows with `side` included in partition key.

## Dashboard Contract Recommendations

1. Piece KPI contract
- Piece count = number of logical sessions in `completed` state.
- Never derive piece count from measurement row count.

2. Measurement display contract
- Show latest row per logical key.
- If history is needed, display it in a separate timeline view, not merged into current-state table.

3. Refresh contract
- Mutation acknowledgement should invalidate/refetch the exact query used by reload.
- Keep one canonical query for both initial load and manual refresh.

4. Time/window contract
- Normalize all dashboard filters to server timezone or UTC explicitly.
- Avoid local browser timezone drift around shift boundaries.

## Why This Is Likely Not Current Write Failure

- Direct endpoint probes now return success for both write mutations:
  - `upsertMeasurementResults`
  - `upsertMeasurementResultsDetailed`
- Operator logs show successful save responses during Next Piece.
- Remaining mismatch is between write stream shape (multiple upserts) and dashboard read interpretation.

## Requested Dashboard Deliverables

1. Confirm exact SQL/query used for:
- Piece count card.
- Piece detail table.
- Reload path after full page refresh.

2. Provide before/after query patch implementing latest-row dedupe and completed-only piece counting.

3. Provide a short validation screenshot/log for one `(purchase_order_article_id, size)` showing:
- piece 1, piece 2, piece 3 appear exactly once in completed view,
- no disappearance after reload.
