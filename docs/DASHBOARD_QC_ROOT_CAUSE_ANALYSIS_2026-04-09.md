# Dashboard QC Root-Cause Analysis (2026-04-09)

## Scope

Issue reported after successful operator writes:
- duplicate first piece,
- delayed appearance of later pieces,
- values reverting/disappearing after reload.

## Deep Analysis Findings

### 1) Piece analytics was reading raw session rows (no latest-state dedupe)

In analytics controller, piece KPIs/lists were based on direct reads from `measurement_sessions`.

Because operator flow can emit repeated state transitions for a logical piece key `(purchase_order_article_id, size)`, raw reads can overcount/duplicate when old rows coexist (or when historical rows remain after schema drift periods).

### 2) Summary/article/operator cards were reading raw `measurement_results` rows

These sections were counting/aggregating all rows in `measurement_results` directly.

When multiple writes exist for a logical key `(purchase_order_article_id, size, measurement_id)`, the dashboard showed inflated or inconsistent totals, especially after reload where backend full-query replaced any transient client view.

### 3) Failure analysis read path had the same risk on detailed rows

`measurement_results_detailed` was analyzed as full raw set without latest-row projection by `(purchase_order_article_id, size, side, measurement_id)`.

This can magnify repeated side-save events.

### 4) Date-window path mismatch risk

Filters were based on `created_at` in some QC query paths.

For live workflows where the latest state is represented by updates, `updated_at` is the correct timeline field for stable parity between live and reload views.

## Root Cause (Pinned)

Primary root cause is **read-model semantics**, not write mutation failure:

- analytics used **raw event-like rows** instead of **latest canonical row per logical key**,
- which caused duplicate counts, delayed stabilization, and reload reversion behavior.

## Server-Side Fix Applied

Updated [app/Http/Controllers/DirectorAnalyticsController.php](app/Http/Controllers/DirectorAnalyticsController.php):

1. Added latest-row projections (anti-join with `NOT EXISTS`) for:
- `measurement_sessions` by `(purchase_order_article_id, size)` using latest `updated_at`, tie-break `id`
- `measurement_results` by `(purchase_order_article_id, size, measurement_id)` using latest `updated_at`, tie-break `id`
- `measurement_results_detailed` by `(purchase_order_article_id, size, side, measurement_id)` using latest `updated_at`, tie-break `id`

2. Rewired analytics query paths to use those projections:
- piece analytics
- summary stats
- article summary
- operator performance
- measurement failure analysis

3. Standardized date filtering on QC-derived analytics paths to `updated_at`.

## Expected Outcome

After deploy, analytics should now show:
- one logical piece state per `(purchase_order_article_id, size)` in piece overview,
- stable summary/article/operator values without duplicate inflation,
- no reversion on hard reload caused by raw historical rows.

## Validation Checklist

1. Deploy latest backend code.
2. Reproduce on one `(purchase_order_article_id, size)` that previously duplicated.
3. Verify:
- first/second/third piece each appears once in completed flow,
- values remain stable after hard reload,
- totals do not jump unexpectedly after reload.

## Notes

This fix is intentionally backend-side so initial load, refresh, and reload use one canonical interpretation of QC state.
