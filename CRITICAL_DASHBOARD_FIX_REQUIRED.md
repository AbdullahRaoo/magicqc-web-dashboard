# 🚨 CRITICAL: Dashboard Latest-Row Projections Need Piece-Session Scoping

**Issue Found**: Analytics dashboard uses old projection logic that collapses multiple pieces (different piece_session_id) into 1 row.

---

## Root Cause Analysis

### Current Dashboard Query Pattern (❌ WRONG)

```php
// DirectorAnalyticsController::latestMeasurementSessionsSubquery()
SELECT ms1.*
FROM measurement_sessions ms1
WHERE NOT EXISTS (
    SELECT 1
    FROM measurement_sessions ms2
    WHERE ms2.purchase_order_article_id = ms1.purchase_order_article_id
      AND ms2.size = ms1.size  // ← Groups by (poa_id, size) ONLY
      AND (ms2.updated_at > ms1.updated_at OR ...)
)
```

**Problem**: When you have 4 pieces all with same `(purchase_order_article_id=33, size='S')`:

```
Piece 1: piece_session_id='uuid-111', created
Piece 2: piece_session_id='uuid-222', replaces Piece 1 in projection
Piece 3: piece_session_id='uuid-333', replaces Piece 2 in projection
Piece 4: piece_session_id='uuid-444', replaces Piece 3 in projection

Dashboard shows: 1 piece (only Piece 4, the newest)
Expected: 4 pieces (all distinct piece_session_ids)
```

### Why Your Logs Show: `sessions: 1, detailed: 52, aggregate: 8`

- **Sessions**: ✗ 1 (should be 4) - Dashboard projection loses pieces
- **Detailed**: ✓ 52 (correct) - UpsertMeasurementResultsDetailed working
- **Aggregate**: ✗ 8 (should be different) - Same issue as sessions, also keyed on (poa, size, measurement_id)

---

## Clear Tables & Fresh Test

### Step 1: Clear all measurement tables (on production server)

```bash
docker-compose exec db mysql -u root -pmagicqc@123 magicqc << 'EOF'
TRUNCATE TABLE measurement_sessions;
TRUNCATE TABLE measurement_results;
TRUNCATE TABLE measurement_results_detailed;
EOF
```

### Step 2: Verify tables are empty

```bash
docker-compose exec db mysql -u root -pmagicqc@123 magicqc << 'EOF'
SELECT 
  (SELECT COUNT(*) FROM measurement_sessions) as sessions_count,
  (SELECT COUNT(*) FROM measurement_results) as results_count,
  (SELECT COUNT(*) FROM measurement_results_detailed) as detailed_count;
EOF
```

Expected output:
```
sessions_count | results_count | detailed_count
0              | 0             | 0
```

---

## Required Dashboard Fix

### Update Projection to Include piece_session_id

**File**: [app/Http/Controllers/DirectorAnalyticsController.php](app/Http/Controllers/DirectorAnalyticsController.php)

#### Current (❌ WRONG):
```php
private function latestMeasurementSessionsSubquery(): string
{
    return "
        SELECT ms1.*
        FROM measurement_sessions ms1
        WHERE NOT EXISTS (
            SELECT 1
            FROM measurement_sessions ms2
            WHERE ms2.purchase_order_article_id = ms1.purchase_order_article_id
              AND ms2.size = ms1.size
              AND (ms2.updated_at > ms1.updated_at OR (ms2.updated_at = ms1.updated_at AND ms2.id > ms1.id))
        )
    ";
}
```

#### Fixed (✅ CORRECT):
```php
private function latestMeasurementSessionsSubquery(): string
{
    return "
        SELECT ms1.*
        FROM measurement_sessions ms1
        WHERE NOT EXISTS (
            SELECT 1
            FROM measurement_sessions ms2
            WHERE ms2.piece_session_id = ms1.piece_session_id
              AND (ms2.updated_at > ms1.updated_at OR (ms2.updated_at = ms1.updated_at AND ms2.id > ms1.id))
        )
    ";
}
```

**Why**: Each piece_session_id is unique. Just get the latest row PER piece_session_id (not per PO article + size).

---

### Similar Fix for measurement_results

**Current** (❌ WRONG):
```php
private function latestMeasurementResultsSubquery(): string
{
    return "
        SELECT mr1.*
        FROM measurement_results mr1
        WHERE NOT EXISTS (
            SELECT 1
            FROM measurement_results mr2
            WHERE mr2.purchase_order_article_id = mr1.purchase_order_article_id
              AND mr2.measurement_id = mr1.measurement_id
              AND mr2.size = mr1.size
              AND (mr2.updated_at > mr1.updated_at OR ...)
        )
    ";
}
```

**Fixed** (✅ CORRECT):
```php
private function latestMeasurementResultsSubquery(): string
{
    return "
        SELECT mr1.*
        FROM measurement_results mr1
        WHERE NOT EXISTS (
            SELECT 1
            FROM measurement_results mr2
            WHERE mr2.piece_session_id = mr1.piece_session_id
              AND mr2.measurement_id = mr1.measurement_id
              AND (mr2.updated_at > mr1.updated_at OR (mr2.updated_at = mr1.updated_at AND mr2.id > mr1.id))
        )
    ";
}
```

---

### Similar Fix for measurement_results_detailed

**Current** (❌ WRONG):
```php
private function latestMrdSubquery(): string
{
    return "
        SELECT mrd1.*
        FROM measurement_results_detailed mrd1
        WHERE NOT EXISTS (
            SELECT 1
            FROM measurement_results_detailed mrd2
            WHERE mrd2.purchase_order_article_id = mrd1.purchase_order_article_id
              AND mrd2.size = mrd1.size
              AND mrd2.side = mrd1.side
              AND mrd2.measurement_id = mrd1.measurement_id
              AND (...)
        )
    ";
}
```

**Fixed** (✅ CORRECT):
```php
private function latestMrdSubquery(): string
{
    return "
        SELECT mrd1.*
        FROM measurement_results_detailed mrd1
        WHERE NOT EXISTS (
            SELECT 1
            FROM measurement_results_detailed mrd2
            WHERE mrd2.piece_session_id = mrd1.piece_session_id
              AND mrd2.side = mrd1.side
              AND mrd2.measurement_id = mrd1.measurement_id
              AND (mrd2.updated_at > mrd1.updated_at OR (mrd2.updated_at = mrd1.updated_at AND mrd2.id > mrd1.id))
        )
    ";
}
```

---

## Complete Query Strategy After Fix

### OLD STRATEGY (Wrong for piece-tracking):
```
Group measurements by (purchase_order_article_id, size)
→ Gets latest row per article/size
→ Loses pieces when same article/size recorded multiple times
```

### NEW STRATEGY (Correct for piece-tracking):
```
Group measurements by (piece_session_id, measurement_id, side)
→ Gets latest row per unique piece
→ Preserves all 4 pieces recorded for same article/size
→ Dashboard shows accurate per-piece analytics
```

---

## Testing After Fix

### Expected Behavior (After dashboard fix)

Recording 4 pieces with same (PO article 33, size 'S'):

1. **Piece 1** (uuid-111): front+back measured, saved
   - `sessions: 1` ✓
   - `detailed: 8` (front 6 + back 2) ✓
   - `aggregate: 6` (front) + 2 (back) = 8 ✓

2. **Piece 2** (uuid-222): front+back measured, saved
   - `sessions: 2` ✓
   - `detailed: 16` (8 from piece 1 + 8 new) ✓
   - `aggregate: 8` (latest results for 8 measurements) ✓

3. **Piece 3** (uuid-333): front+back measured, saved
   - `sessions: 3` ✓
   - `detailed: 24` ✓
   - `aggregate: 8` ✓

4. **Piece 4** (uuid-444): front+back measured, saved
   - `sessions: 4` ✓
   - `detailed: 32` ✓
   - `aggregate: 8` ✓

Dashboard displays:
- **4 completed pieces** (not 1)
- All piece_session_id values visible
- Correct measurements per piece

---

## Implementation Checklist

- [ ] Clear measurement tables
- [ ] Update `latestMeasurementSessionsSubquery()` to use `piece_session_id` grouping
- [ ] Update `latestMeasurementResultsSubquery()` to use `piece_session_id` grouping
- [ ] Update `latestMrdSubquery()` to use `piece_session_id` grouping
- [ ] Clear Laravel cache: `php artisan cache:clear`
- [ ] Restart app container: `docker-compose restart app`
- [ ] Test 4-piece flow again
- [ ] Verify dashboard shows 4 pieces

---

## Success Validation

After the fix:

```bash
# Dashboard query should now return 4 rows (one per piece)
docker-compose exec db mysql -u root -pmagicqc@123 magicqc << 'EOF'
SELECT 
  piece_session_id,
  purchase_order_article_id,
  size,
  status,
  created_at
FROM measurement_sessions
ORDER BY created_at DESC;
EOF
```

Expected output:
```
piece_session_id          | purchase_order_article_id | size | status    | created_at
uuid-444                  | 33                        | S    | completed | 2026-04-09 XX:XX:XX
uuid-333                  | 33                        | S    | completed | 2026-04-09 XX:XX:XX
uuid-222                  | 33                        | S    | completed | 2026-04-09 XX:XX:XX
uuid-111                  | 33                        | S    | completed | 2026-04-09 XX:XX:XX
```

Dashboard aggregation should show all 4 pieces as distinct entries! 🎉
