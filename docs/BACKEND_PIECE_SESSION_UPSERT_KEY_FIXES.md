# Backend Fix Required: piece_session_id Upsert Key Issues

**Date:** 2026-04-09  
**From:** Operator Panel Team  
**To:** Backend Team  
**Priority:** 🔴 CRITICAL - Blocking piece tracking  
**Status:** Requires immediate fixes before production deployment

---

## Summary

The backend resolvers for **UpsertMeasurementSession** and **UpsertMeasurementResults** are not using `piece_session_id` as the primary upsert key. This causes all pieces with the same `(purchase_order_article_id, size)` to **overwrite each other** instead of creating separate rows.

**Evidence:**
- Only **1 session row** exists instead of expected 3+
- `piece_session_id` values in `measurement_results` are **backfill UUIDs** (server-generated), NOT the values sent by operator panel
- Detailed results table **works correctly** (separate rows per piece_session_id)
- Operator-side null-filtering is masking the symptom but NOT fixing root cause

---

## Root Causes Identified

### Issue #1: UpsertMeasurementSession Uses Wrong Upsert Key

**Current Code:**
```php
DB::table('measurement_sessions')->upsert(
    [[ ... 'piece_session_id' => $pieceSessionId, ... ]],
    ['piece_session_id'],              // ← Looks correct in code
    ['purchase_order_article_id', 'size', ...] // ← Update columns
);
```

**Problem:**
- Code says use `piece_session_id` as upsert key ✓
- BUT if migration hasn't run, column doesn't exist in DB
- Laravel silently ignores non-existent columns → stores NULL
- All NULL values collapse to same key → only 1 row created

**Symptom:**
```
Expected: 3 rows (piece 1, 2, 3 with different piece_session_id)
Actual: 1 row (all pieces overwrite because piece_session_id = NULL in DB)
```

---

### Issue #2: UpsertMeasurementResults Falls Back to Old Key

**Current Code:**
```php
$hasPieceSessionId = DB::getSchemaBuilder()->hasColumn('measurement_results', 'piece_session_id');
// ... 

$upsertKey = $hasPieceSessionId 
    ? ['piece_session_id', 'purchase_order_article_id', 'measurement_id', 'size']
    : ['purchase_order_article_id', 'measurement_id', 'size'];  // ← Fallback
```

**Problem:**
- If column doesn't exist (migration not run), uses old key: `['purchase_order_article_id', 'measurement_id', 'size']`
- Old key doesn't include `piece_session_id` → all pieces overwrite same row
- Even if column exists, backfill UUIDs are different from operator-sent UUIDs
- Operator's piece_session_id never becomes the upsert key

**Symptom:**
```
Operator sends: piece_session_id = "uuid1", poa=1, measurement_id=10, size="M"
Backend inserts/updates: (poa=1, measurement_id=10, size="M") ← piece_session_id ignored
Next piece arrives with same poa/measurement/size but different uuid2 → overwrites previous
Result: Only 1 row exists per (poa, measurement_id, size), not per piece_session_id
```

---

### Issue #3: UpsertMeasurementResultsDetailed Works Correctly ✅

**Why it works:**
```php
// Correctly requires piece_session_id
$pieceSessionId = $args['piece_session_id'] ?? null;
if (!$pieceSessionId) {
    return ['success' => false, 'message' => 'piece_session_id is required'];
}

// Correctly scopes delete to this piece
DB::table('measurement_results_detailed')
    ->where('piece_session_id', $pieceSessionId)  // ← KEY: Uses piece_session_id
    ->where('purchase_order_article_id', $poArticleId)
    ->where('size', $size)
    ->where('side', $side)
    ->delete();

// Correctly includes in aggregation upsert
$upsertKey = $hasPieceSessionId 
    ? ['piece_session_id', 'purchase_order_article_id', 'measurement_id', 'size']
    : ['purchase_order_article_id', 'measurement_id', 'size'];
```

**Operator confirms:** "The detailed results table is working correctly — it properly has separate rows per piece_session_id"

---

## Required Fixes

### Fix #1: Update UpsertMeasurementSession Upsert Key

**File:** `app/GraphQL/Mutations/UpsertMeasurementSession.php`

**Action:** Ensure migration is applied BEFORE resolver runs, OR use conditional logic:

**Option A (Recommended): Require Migration First**
```php
// No change needed IF migration is guaranteed to run
// Just verify migration is listed as required in deployment docs
```

**Option B: Add Conditional Column Check**
```php
$hasPieceSessionId = DB::getSchemaBuilder()->hasColumn('measurement_sessions', 'piece_session_id');

if ($hasPieceSessionId) {
    // Use new key that prevents overwrites
    $upsertKey = ['piece_session_id'];
} else {
    // Temporary fallback - but will cause overwrites
    // Log warning: migration not yet applied
    logger()->warning('piece_session_id column missing - using fallback key');
    $upsertKey = ['purchase_order_article_id', 'size'];
}

DB::table('measurement_sessions')->upsert(
    [[ ... 'piece_session_id' => $pieceSessionId, ... ]],
    $upsertKey,
    [...]
);
```

**Status:** Current code is correct IF migration runs. Likely issue: **migration not applied**.

---

### Fix #2: Update UpsertMeasurementResults Upsert Key

**File:** `app/GraphQL/Mutations/UpsertMeasurementResults.php`

**Current Issue:** Falls back to old key when column doesn't exist

**Change Required:**
```php
// CURRENT (Fallback causes overwrites):
$upsertKey = $hasPieceSessionId 
    ? ['piece_session_id', 'purchase_order_article_id', 'measurement_id', 'size']
    : ['purchase_order_article_id', 'measurement_id', 'size'];

// NEW (Require piece_session_id or reject):
if (!$hasPieceSessionId) {
    return [
        'success' => false,
        'message' => 'Migration not applied: piece_session_id column missing from measurement_results table. Run: php artisan migrate',
        'count' => 0,
    ];
}

$upsertKey = ['piece_session_id', 'purchase_order_article_id', 'measurement_id', 'size'];
```

**Why:** 
- Old fallback hides the problem
- Clear error message helps debug
- Ensures each piece gets separate row

---

### Fix #3: Verify Migration is Deployed

**Prerequisite before any resolver changes:**

```bash
# On server, verify migration was run:
php artisan migrate:status

# Should show:
# 2026_04_09_add_piece_session_id_to_measurements ... yes

# Verify columns exist:
mysql -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME='measurement_sessions' AND COLUMN_NAME='piece_session_id';" $DB_NAME

# If empty, migration hasn't run yet. Run it:
php artisan migrate
```

---

## Diagnosis Checklist

### Step 1: Check Migration Status
```bash
php artisan migrate:status | grep piece_session
```

**Expected Output:**
```
2026_04_09_add_piece_session_id_to_measurements     yes
```

**If Missing:** This is the problem. Run `php artisan migrate`.

### Step 2: Verify Columns Exist
```sql
SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE 
FROM information_schema.COLUMNS 
WHERE COLUMN_NAME = 'piece_session_id'
AND TABLE_NAME IN ('measurement_sessions', 'measurement_results', 'measurement_results_detailed');
```

**Expected:** 3 rows (one per table)

**If 0-2 rows:** Migration didn't complete. Check for errors:
```bash
php artisan migrate --force
php artisan migrate:rollback
php artisan migrate
```

### Step 3: Verify Data was Backfilled
```sql
SELECT COUNT(*) as total_rows,
       SUM(CASE WHEN piece_session_id IS NULL THEN 1 ELSE 0 END) as null_count
FROM measurement_sessions;
```

**Expected:** `total_rows > 0` AND `null_count = 0`

**If `null_count > 0`:** Backfill didn't run. Execute:
```sql
UPDATE measurement_sessions SET piece_session_id = UUID() WHERE piece_session_id IS NULL;
UPDATE measurement_results SET piece_session_id = UUID() WHERE piece_session_id IS NULL;
UPDATE measurement_results_detailed SET piece_session_id = UUID() WHERE piece_session_id IS NULL;
```

### Step 4: Test with Operator Panel

**Record 3 pieces, then check:**
```sql
SELECT piece_session_id, COUNT(*) as session_count 
FROM measurement_sessions 
WHERE purchase_order_article_id = 1 AND size = 'M'
GROUP BY piece_session_id;
```

**Expected:** 3 rows (different piece_session_id for each piece)

**Actual (if broken):** Only 1 row, all with piece_session_id = NULL or same backfill UUID

---

## Immediate Actions

### For Backend DevOps Team:

1. **Verify migration applied:**
   ```bash
   ssh production
   cd /var/www
   php artisan migrate:status | grep piece_session
   ```

2. **If migration NOT applied, run it:**
   ```bash
   php artisan migrate
   ```

3. **Clear cache:**
   ```bash
   php artisan config:clear
   php artisan cache:clear
   ```

4. **Restart services:**
   ```bash
   docker-compose restart laravel-app
   ```

### For Backend Code Team:

1. **Add conditional check to UpsertMeasurementResults** (see Fix #2 above)

2. **Test locally:**
   ```bash
   # Record 3 pieces via operator panel
   # Check DB:
   SELECT COUNT(DISTINCT piece_session_id) as pieces FROM measurement_sessions;
   # Should return: 3
   ```

3. **Verify with test script:**
   ```bash
   MAGICQC_API_KEY=xxx ./scripts/verify-qc-graphql-writes.sh
   ```

---

## Long-Term Prevention

### Add Pre-Flight Checks in Resolvers

All measurement resolvers should validate required columns:

```php
// At start of resolver
private function validateSchema(): ?array
{
    $requiredColumns = [
        'measurement_sessions' => ['piece_session_id'],
        'measurement_results' => ['piece_session_id'],
        'measurement_results_detailed' => ['piece_session_id'],
    ];

    foreach ($requiredColumns as $table => $columns) {
        foreach ($columns as $column) {
            if (!DB::getSchemaBuilder()->hasColumn($table, $column)) {
                return [
                    'success' => false,
                    'message' => "Required column $column missing from $table. Run migrations.",
                    'count' => 0,
                ];
            }
        }
    }
    return null;  // All columns present
}

// In resolver:
public function __invoke($_, array $args): array
{
    $schemaCheck = $this->validateSchema();
    if ($schemaCheck) return $schemaCheck;
    
    // Rest of resolver...
}
```

---

## Operator Panel Status

**Current Workaround (Temporary):** Operator panel filtering nulls on client-side
- Prevents immediate symptom (pass count dropping)
- Does NOT fix root cause (overwrites still happening in DB)
- Must be removed once backend is fixed

**Next Steps After Backend Fix:**
1. Remove null-filtering workaround
2. Test 3-piece flow
3. Verify dashboard shows 3 distinct pieces
4. Confirm reload doesn't lose data

---

## Rollout Sequence

1. ✅ **Operator panel sends piece_session_id** (already done)
2. ⏳ **Backend migration runs** (pending)
3. ⏳ **Backend resolvers updated** (pending - see fixes above)
4. ⏳ **Cache cleared + services restarted** (pending)
5. ⏳ **Verification script passes** (pending)
6. ⏳ **Dashboard shows correct piece count** (pending)

---

## Contact & Questions

Backend team: If migration is successfully applied but rows are still overwriting, the issue is definitely in the resolver upsert keys. See Fixes #1 and #2.

Operator team: This explains why your piece_session_id values weren't being used - backend fallback to old keys. Once fixes applied, dashboard will show correct data.
