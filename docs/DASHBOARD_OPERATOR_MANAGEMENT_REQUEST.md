# Dashboard Request: Operator Management & Multi-Table Support

**Date:** 2026-04-10  
**From:** Operator Panel Dev  
**To:** Dashboard Dev  
**Priority:** High — blocks multi-operator factory deployment

---

## Summary

The operator panel now requires **username + PIN login** (instead of PIN-only) and supports **table/station identification** so multiple operators can work on multiple QC tables simultaneously. The operator panel changes are complete — we need the following from the dashboard side.

---

## 1. Operator Management CRUD UI

We need a minimal admin page (under the developer account role) to manage operator panel users.

### Required Fields

| Field | Type | Notes |
|-------|------|-------|
| `full_name` | string | Operator's display name |
| `employee_id` | string, unique | Used as login username (e.g. "2691", "OP-A1") |
| `department` | string, nullable | e.g. "QC", "Cutting" |
| `contact_number` | string, nullable | Optional phone |
| `login_pin` | string (4 digits) | Hashed/stored server-side, never returned in queries |
| `is_active` | boolean | Soft-delete / deactivation |

### Required Operations

1. **List operators** — table with full_name, employee_id, department, status (active/inactive)
2. **Create operator** — form with all fields above; PIN is set on creation
3. **Edit operator** — update name, department, contact; separate "Reset PIN" action
4. **Deactivate operator** — soft-delete (set `is_active = false`); prevents login but preserves audit trail
5. **Reactivate operator** — restore deactivated operators

### GraphQL Mutations Needed

```graphql
mutation createOperator(
  full_name: String!
  employee_id: String!
  department: String
  contact_number: String
  login_pin: String!
) {
  success
  message
  operator { id full_name employee_id department }
}

mutation updateOperator(
  id: Int!
  full_name: String
  employee_id: String
  department: String
  contact_number: String
) {
  success
  message
  operator { id full_name employee_id department }
}

mutation resetOperatorPin(
  id: Int!
  new_pin: String!
) {
  success
  message
}

mutation deactivateOperator(id: Int!) {
  success
  message
}

mutation reactivateOperator(id: Int!) {
  success
  message
}
```

### Existing Infrastructure

- The `operators` table already exists with `id, full_name, employee_id, department, contact_number, login_pin, created_at, updated_at`
- The `getOperators` query and `verifyPin` mutation already work
- You may need to add `is_active` column if it doesn't exist (default `true`)
- The `verifyPin` mutation should reject inactive operators

---

## 2. Accept `table_name` on Measurement Mutations

The operator panel now sends a `table_name` field (string, e.g. "1", "A", "Table-3") on all three write mutations to identify which physical QC station produced the data.

### Database Migration

Add a nullable column to these three tables:

```sql
ALTER TABLE measurement_sessions ADD COLUMN table_name VARCHAR(50) NULL;
ALTER TABLE measurement_results ADD COLUMN table_name VARCHAR(50) NULL;
ALTER TABLE measurement_results_detailed ADD COLUMN table_name VARCHAR(50) NULL;
```

### GraphQL Schema Updates

Update the input types for these mutations to accept `table_name`:

1. **`upsertMeasurementSession`** — accept `table_name: String` (nullable)
2. **`upsertMeasurementResults`** — accept `table_name: String` in each `MeasurementResultInput` (nullable)
3. **`upsertMeasurementResultsDetailed`** — accept `table_name: String` as a top-level parameter (nullable)

The resolvers should store whatever value is passed. No validation needed — it's a free-text label.

### Backward Compatibility

- The operator panel already uses the unknown-column retry logic, so it will gracefully degrade if the migration hasn't run yet (it strips unrecognized fields and retries)
- Older operator panel builds that don't send `table_name` will still work (column is nullable)

### Dashboard Display

Once the column exists, consider:
- Showing `table_name` in the QC session/results views
- Adding a table filter dropdown to the dashboard analytics
- Grouping measurements by table in reports

---

## 3. Future: Tables Management (Optional, Low Priority)

Once the string-based `table_name` approach is validated in production, we can upgrade to a proper entity:

```sql
CREATE TABLE qc_tables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  location VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

This would allow:
- Admin UI to manage tables (create, rename, deactivate)
- Convert `table_name` columns to `table_id` foreign keys
- Operator panel login dropdown populated from `qc_tables` query

**This is NOT needed for the initial release** — the string label approach works fine for now.

---

## 4. What's Already Done on the Operator Panel Side

- Login screen now has Employee ID + PIN + Table Number fields
- `verifyPin` mutation is called directly with `employee_id` + `pin` (no more iterating all operators)
- `table_name` is sent on all three measurement mutations (`upsertMeasurementSession`, `upsertMeasurementResults`, `upsertMeasurementResultsDetailed`)
- Table number shown in the app header next to operator name
- Table value persists in localStorage per-machine (pre-populated on next login)

---

## Timeline

| Item | Blocking? | Notes |
|------|-----------|-------|
| Operator CRUD UI | Yes — needed before we can create accounts for new operators | Currently operators are created directly in DB |
| `is_active` check in `verifyPin` | Yes — needed to prevent deactivated operators from logging in | |
| `table_name` migration | No — operator panel degrades gracefully without it | But needed for dashboard analytics |
| Tables management UI | No — future enhancement | String labels work for now |
