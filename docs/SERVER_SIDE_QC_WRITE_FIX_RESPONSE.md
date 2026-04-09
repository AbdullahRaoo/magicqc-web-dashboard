# Server Response: QC Live Write Failure (Fixed)

Date: 2026-04-09

## What was broken

The operator handoff was correct: GraphQL writes failed when `measurement_results` existed without `article_style`.

- Error: `SQLSTATE[42S22]: Column not found: 1054 Unknown column 'article_style' in 'field list'`
- Impacted mutations:
  - `upsertMeasurementResults`
  - `upsertMeasurementResultsDetailed` (during auto-aggregation into `measurement_results`)

## What has been fixed on server code

Patched both mutations to be schema-compatible:

1. `app/GraphQL/Mutations/UpsertMeasurementResults.php`
   - Detects whether `measurement_results.article_style` exists.
   - Includes `article_style` in insert/update only if the column exists.

2. `app/GraphQL/Mutations/UpsertMeasurementResultsDetailed.php`
   - Ensures `measurement_results` table exists before aggregation upsert.
   - Detects whether `measurement_results.article_style` exists.
   - Aggregation upsert updates `article_style` only if the column exists.

This removes the hard dependency on that column and prevents write failures on mixed/older production schemas.

## What to deploy now

From production repo path:

```bash
git pull
./deploy.sh
```

## Post-deploy validation

Run from operator flow or GraphQL test:

1. `upsertMeasurementResults` returns:
   - `success: true`
2. `upsertMeasurementResultsDetailed` returns:
   - `success: true`
3. Operator panel no longer shows:
   - `Failed to save measurements`
   - `Failed to save piece. Failed to save front side`
4. DB rows appear for target `(purchase_order_article_id, size)` in:
   - `measurement_results`
   - `measurement_results_detailed`

## Optional hardening (recommended)

Add a DB migration in production to align schema permanently:

```sql
ALTER TABLE measurement_results
ADD COLUMN article_style VARCHAR(255) NULL AFTER size;
```

The code fix already works without this, but migration keeps all environments consistent.

## Operator-team reported behavior after redeploy

If operator-side minimal probes still show:

- `Unknown column 'article_style' in 'field list'`

then the endpoint behind `https://magicqc.online/graphql` is still serving stale resolver code (deployment drift), regardless of local repo state.

## One-command post-deploy proof

Use the verification script in this repo to validate the **actual live endpoint** after deploy:

```bash
MAGICQC_API_KEY=<your_key> ./scripts/verify-qc-graphql-writes.sh
```

Note: This script defaults to local edge probing (`https://127.0.0.1/graphql` + `Host: magicqc.online`) to avoid DNS/network egress issues from the VPS shell.

Optional explicit endpoint form:

```bash
./scripts/verify-qc-graphql-writes.sh https://magicqc.online/graphql <your_key>
```

Expected output when fixed:

- `upsertMeasurementResults: success=true`
- `upsertMeasurementResultsDetailed: success=true`

If either fails, treat deployment as not complete and verify target environment/container routing.

## Post-Deploy QC Validation Checklist (Run Every Release)

1. Deploy and health-check

```bash
git pull
./deploy.sh
```

2. Run GraphQL write probe

```bash
MAGICQC_API_KEY=<your_key> ./scripts/verify-qc-graphql-writes.sh
```

3. Confirm probe passes both mutations

- `upsertMeasurementResults: success=true`
- `upsertMeasurementResultsDetailed: success=true`

4. Confirm operator workflow

- Start measurement does not show save error.
- Next Piece does not show `Failed to save piece`.

5. Spot-check DB rows for tested `(purchase_order_article_id, size)`

- `measurement_results`
- `measurement_results_detailed`
- `measurement_sessions`

6. If any check fails

- Re-run probe against explicit endpoint:  
   `./scripts/verify-qc-graphql-writes.sh https://magicqc.online/graphql <your_key>`
- Check active app container/image and restart stale services.
- Rotate API key if it was exposed in logs/chat.
