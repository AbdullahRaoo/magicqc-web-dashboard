# Electron QC Live Push — Quick Reference

This is a short reference for the desktop Electron app to ensure QC data is actually written and immediately visible in MagicQC.

## 1) API Endpoint + Auth

- Endpoint: `POST https://magicqc.online/graphql`
- Required header on every request: `X-API-Key: <api-key>`
- Content type: `application/json` (except file uploads)

---

## 2) Core Tables Used for Live QC

### `measurement_sessions` (piece/session state)
- Purpose: one row per `(purchase_order_article_id, size)` representing session progress.
- Updated by mutation: `upsertMeasurementSession`
- Key fields used by analytics page:
  - `purchase_order_article_id` (required)
  - `size` (required)
  - `status` (`in_progress` or `completed`)
  - `front_side_complete`, `back_side_complete` (boolean)
  - `front_qc_result`, `back_qc_result` (`PASS` / `FAIL` / `PENDING`)
  - `operator_id`, `article_style` (optional but recommended)

### `measurement_results_detailed` (per-side measurements)
- Purpose: detailed parameter values per side.
- Updated by mutation: `upsertMeasurementResultsDetailed`
- Required envelope fields:
  - `purchase_order_article_id`, `size`, `side`
- Required per-item field in `results`:
  - `measurement_id`
- Common per-item fields:
  - `measured_value`, `expected_value`, `tol_plus`, `tol_minus`, `status`, `operator_id`, `article_style`

### `measurement_results` (overall/aggregated per measurement)
- Purpose: aggregate status per `(purchase_order_article_id, measurement_id, size)`.
- Updated by:
  - direct mutation `upsertMeasurementResults`, or
  - **auto-updated** by `upsertMeasurementResultsDetailed` after each side save.

---

## 3) Recommended Write Sequence (per piece)

1. `upsertMeasurementSession` with `status: "in_progress"` when work starts.
2. `upsertMeasurementResultsDetailed` for `side: "front"`.
3. `upsertMeasurementResultsDetailed` for `side: "back"`.
4. `upsertMeasurementSession` with final flags/results, e.g.:
   - `front_side_complete: true`
   - `back_side_complete: true`
   - `front_qc_result`, `back_qc_result`
   - `status: "completed"`

This is the path the analytics dashboard expects.

---

## 4) Minimal Mutation Shapes

```graphql
mutation SaveSession($inputPoa: Int!, $inputSize: String!, $operatorId: Int) {
  upsertMeasurementSession(
    purchase_order_article_id: $inputPoa
    size: $inputSize
    operator_id: $operatorId
    status: "in_progress"
    front_side_complete: false
    back_side_complete: false
    front_qc_result: "PENDING"
    back_qc_result: "PENDING"
  ) {
    success
    message
  }
}
```

```graphql
mutation SaveDetailed($poa: Int!, $size: String!, $side: String!, $rows: [DetailedResultInput!]!) {
  upsertMeasurementResultsDetailed(
    purchase_order_article_id: $poa
    size: $size
    side: $side
    results: $rows
  ) {
    success
    message
    count
  }
}
```

---

## 5) Immediate Read-Back Check (must do)

After each write, query the same `(purchase_order_article_id, size)`:

```graphql
query Verify($poa: Int!, $size: String!) {
  measurementSessions(purchase_order_article_id: $poa, size: $size) {
    purchase_order_article_id
    size
    status
    front_side_complete
    back_side_complete
    front_qc_result
    back_qc_result
    updated_at
  }
  measurementResultsDetailed(purchase_order_article_id: $poa, size: $size) {
    measurement_id
    side
    status
    measured_value
    updated_at
  }
  measurementResults(purchase_order_article_id: $poa, size: $size) {
    measurement_id
    status
    updated_at
  }
}
```

If this query returns updated rows but UI is stale, the issue is frontend refresh/state, not DB write.

---

## 6) Why “Not Updating Live” Usually Happens

- Missing `X-API-Key` header.
- Mutation response ignored when `success: false`.
- Wrong IDs (`purchase_order_article_id` or `measurement_id`) so writes go to different records.
- Session status never set to `completed`, so analytics still shows in-progress/pending.
- Sending lowercase results (`pass`/`fail`) instead of expected values for QC fields (`PASS`/`FAIL`/`PENDING`).
- Writing only session OR only detailed rows, but not both.

---

## 7) Source of Truth in This Repo

- [graphql/schema.graphql](graphql/schema.graphql)
- [app/GraphQL/Mutations/UpsertMeasurementSession.php](app/GraphQL/Mutations/UpsertMeasurementSession.php)
- [app/GraphQL/Mutations/UpsertMeasurementResultsDetailed.php](app/GraphQL/Mutations/UpsertMeasurementResultsDetailed.php)
- [app/GraphQL/Mutations/UpsertMeasurementResults.php](app/GraphQL/Mutations/UpsertMeasurementResults.php)
- [app/GraphQL/Queries/MeasurementSessions.php](app/GraphQL/Queries/MeasurementSessions.php)
- [app/GraphQL/Queries/MeasurementResultsDetailed.php](app/GraphQL/Queries/MeasurementResultsDetailed.php)
- [app/GraphQL/Queries/MeasurementResults.php](app/GraphQL/Queries/MeasurementResults.php)

---

## 8) Current Electron App Status Check

The current [electron_annotation_manager.js](electron_annotation_manager.js) file:

- fetches annotations from the Laravel API
- reads calibration from MySQL
- writes local JSON files for the Python measurement pipeline
- updates `article_annotations.target_distances` directly in MySQL
- reads `measurement_results/live_measurements.json` from disk

It does **not** currently call the GraphQL mutations that live analytics depends on:

- `upsertMeasurementSession`
- `upsertMeasurementResultsDetailed`
- `upsertMeasurementResults`

So if the desktop app is expected to update the dashboard live, the missing piece is usually the Electron write step, not the dashboard read step.
