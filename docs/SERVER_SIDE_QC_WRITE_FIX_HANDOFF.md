# Server-Side Fix Handoff: QC Measurement Writes Failing

Date: 2026-04-09
Project: MagicQC Operator Panel (Electron)

## Executive Summary

QC write failures are caused by a server-side schema mismatch.

- GraphQL mutations `upsertMeasurementResults` and `upsertMeasurementResultsDetailed` are generating SQL that writes `article_style` into `measurement_results`.
- The deployed MySQL table `measurement_results` does not contain an `article_style` column.
- Result: SQL error `1054 Unknown column 'article_style' in 'field list'`, causing Start-time autosave failures and Next Piece save failures.

This is not fixable from Electron alone once the server resolver insists on writing the missing column.

## Confirmed Evidence

Observed server response (from live run):

- `upsertMeasurementResults`: `success: false`
- `upsertMeasurementResultsDetailed`: `success: false`
- Error:
  - `SQLSTATE[42S22]: Column not found: 1054 Unknown column 'article_style' in 'field list'`
  - SQL includes `insert into measurement_results (article_style, expected_value, measured_value, ...)`

Independent confirmation:

- A minimal GraphQL mutation without `article_style` in input still fails with SQL that includes `article_style`.
- This confirms resolver-side behavior is injecting the column.

## Impact

- Frontend session can start and live polling can run.
- Any measurement persistence to DB fails.
- Operator sees:
  - `Failed to save measurements`
  - `Failed to save piece. Failed to save front side`

## Required Backend Fix (Preferred)

Update GraphQL mutation resolvers to stop writing `article_style` into `measurement_results`.

Mutations affected:

- `upsertMeasurementResults`
- `upsertMeasurementResultsDetailed` (if it also upserts/updates `measurement_results` aggregate rows)

Expected behavior:

- `measurement_results` writes should include only columns that exist in deployed schema.
- If `article_style` is needed for analytics, either:
  - store it in another table that has that column, or
  - add the column via migration (see alternative fix below).

## Alternative Backend Fix

If server behavior must keep `article_style`, align DB schema by adding the column.

Example migration SQL (use your migration framework in production):

```sql
ALTER TABLE measurement_results
ADD COLUMN article_style VARCHAR(255) NULL AFTER size;
```

Notes:

- Also review indexes/unique constraints and any update clauses that reference `article_style`.
- Ensure this does not conflict with historical records or reporting logic.

## Contract Gaps Also Observed

Read-back verification queries are not available on this deployment:

- `measurementSessions`
- `measurementResultsDetailed`
- `measurementResults`

This does not directly cause save failure, but prevents post-write verification from GraphQL on this environment.

## Reproduction Query (Server Team)

Run this mutation against the deployed GraphQL endpoint:

```graphql
mutation SaveTest($results: [MeasurementResultInput!]!) {
  upsertMeasurementResults(results: $results) {
    success
    message
    count
  }
}
```

Variables:

```json
{
  "results": [
    {
      "purchase_order_article_id": 33,
      "measurement_id": 31,
      "size": "S",
      "measured_value": 7.47,
      "status": "PASS",
      "operator_id": 2
    }
  ]
}
```

Current result on affected server: `success: false` with SQL unknown column `article_style`.

## Acceptance Criteria (Done = Fixed)

Server fix is complete when all checks pass:

1. `upsertMeasurementResults` returns `success: true` and no SQL unknown-column error.
2. `upsertMeasurementResultsDetailed` returns `success: true` and no SQL unknown-column error.
3. Live run in operator panel:
   - no `Failed to save measurements` after Start
   - no `Failed to save piece. Failed to save front side` on Next Piece
4. Rows are visible in DB for target `(purchase_order_article_id, size)`.

## Frontend Status

Frontend has already been hardened to:

- avoid premature save spam,
- prevent state reset during active measurement,
- provide clearer operator-facing error when schema mismatch is detected.

No further frontend-only change can make persistence succeed until backend schema/resolver mismatch is corrected.
