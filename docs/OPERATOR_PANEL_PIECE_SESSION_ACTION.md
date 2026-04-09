# Action Required: Operator Panel — piece_session_id Implementation

**Date:** 2026-04-09
**Priority:** Critical — backend already enforces this field; old operator builds will fail writes
**Owner:** Operator Panel (Electron) Team

---

## Background

The backend now requires a `piece_session_id` UUID on every write mutation. Without it,
all three mutations (`upsertMeasurementSession`, `upsertMeasurementResults`,
`upsertMeasurementResultsDetailed`) will be rejected with a GraphQL schema error.

### Why this was introduced

Previously, the upsert unique key for sessions was `(purchase_order_article_id, size)`.
This meant that when an operator measured a second physical piece of the same article and
size, **it silently overwrote piece #1 in the database**. The dashboard would always show
only one piece regardless of how many were measured.

`piece_session_id` is a UUID generated per physical piece. It scopes every write to that
specific piece, so history is preserved and the dashboard piece count is accurate.

---

## Contract: How piece_session_id Must Be Used

| Event | Action |
|-------|--------|
| Operator clicks "Start Measurement" (new piece) | Generate a new UUID → store as `currentPieceSessionId` |
| Operator submits front-side measurements | Send `currentPieceSessionId` in all mutations |
| Operator submits back-side measurements | Reuse the **same** `currentPieceSessionId` |
| Operator clicks "Next Piece" | Generate a **new** UUID for `currentPieceSessionId` |
| Operator re-submits a side for the same piece | Reuse the **same** `currentPieceSessionId` (safe — backend upserts) |

The same UUID must be sent in **all three mutations** for a single piece. Never share a
UUID between two different physical pieces.

---

## Required Code Changes

### 1. Install UUID library (if not already present)

```bash
npm install uuid
# TypeScript types:
npm install --save-dev @types/uuid
```

### 2. Add piece_session_id state management

In the component/store that manages the current measurement session, add:

```typescript
import { v4 as uuidv4 } from 'uuid';

// State
let currentPieceSessionId: string = uuidv4(); // generate on module load / first piece

// Call this when operator starts a new piece
function startNewPiece(): void {
    currentPieceSessionId = uuidv4();
}
```

If using React state or Electron IPC state, store `currentPieceSessionId` in the same
place as `currentPurchaseOrderArticleId` and `currentSize`.

### 3. Update `upsertMeasurementSession` mutation

**Before:**
```graphql
mutation UpsertSession($purchase_order_article_id: Int!, $size: String!, ...) {
    upsertMeasurementSession(
        purchase_order_article_id: $purchase_order_article_id
        size: $size
        ...
    ) { success message }
}
```

**After:**
```graphql
mutation UpsertSession(
    $piece_session_id: String!
    $purchase_order_article_id: Int!
    $size: String!
    ...
) {
    upsertMeasurementSession(
        piece_session_id: $piece_session_id
        purchase_order_article_id: $purchase_order_article_id
        size: $size
        ...
    ) { success message }
}
```

**Variables — add `piece_session_id`:**
```typescript
const variables = {
    piece_session_id: currentPieceSessionId,   // ADD THIS
    purchase_order_article_id: currentPoArticleId,
    size: currentSize,
    operator_id: currentOperatorId,
    status: 'in_progress',
    front_side_complete: false,
    back_side_complete: false,
};
```

### 4. Update `upsertMeasurementResultsDetailed` mutation

**Before:**
```graphql
mutation UpsertDetailed(
    $purchase_order_article_id: Int!
    $size: String!
    $side: String!
    $results: [DetailedResultInput!]!
) {
    upsertMeasurementResultsDetailed(
        purchase_order_article_id: $purchase_order_article_id
        size: $size
        side: $side
        results: $results
    ) { success message count }
}
```

**After:**
```graphql
mutation UpsertDetailed(
    $piece_session_id: String!
    $purchase_order_article_id: Int!
    $size: String!
    $side: String!
    $results: [DetailedResultInput!]!
) {
    upsertMeasurementResultsDetailed(
        piece_session_id: $piece_session_id
        purchase_order_article_id: $purchase_order_article_id
        size: $size
        side: $side
        results: $results
    ) { success message count }
}
```

**Variables:**
```typescript
const variables = {
    piece_session_id: currentPieceSessionId,   // ADD THIS
    purchase_order_article_id: currentPoArticleId,
    size: currentSize,
    side: 'front',   // or 'back'
    results: measurements.map(m => ({
        measurement_id: m.id,
        measured_value: m.value,
        expected_value: m.expectedValue,
        tol_plus: m.tolPlus,
        tol_minus: m.tolMinus,
        status: m.status,
        operator_id: currentOperatorId,
    })),
};
```

### 5. Update `upsertMeasurementResults` mutation (aggregate results)

The `MeasurementResultInput` input type now requires `piece_session_id`:

**Before — each result object:**
```typescript
{
    purchase_order_article_id: 33,
    measurement_id: 31,
    size: 'S',
    measured_value: 7.47,
    status: 'PASS',
    operator_id: 2,
}
```

**After:**
```typescript
{
    piece_session_id: currentPieceSessionId,   // ADD THIS
    purchase_order_article_id: 33,
    measurement_id: 31,
    size: 'S',
    measured_value: 7.47,
    status: 'PASS',
    operator_id: 2,
}
```

### 6. Hook up "Next Piece" button

Find the handler for the "Next Piece" / "New Piece" action and call `startNewPiece()`:

```typescript
function handleNextPiece(): void {
    startNewPiece();                  // generates fresh UUID
    resetMeasurementForm();           // existing reset logic
    // ... other reset actions
}
```

---

## Full Example Flow (TypeScript)

```typescript
import { v4 as uuidv4 } from 'uuid';

class MeasurementSession {
    private pieceSessionId: string;
    private poArticleId: number;
    private size: string;
    private operatorId: number;

    constructor(poArticleId: number, size: string, operatorId: number) {
        this.pieceSessionId = uuidv4();  // new UUID for each piece
        this.poArticleId = poArticleId;
        this.size = size;
        this.operatorId = operatorId;
    }

    nextPiece(): void {
        this.pieceSessionId = uuidv4();  // rotate UUID
    }

    async startSession(): Promise<void> {
        await graphqlClient.mutate({
            mutation: UPSERT_SESSION,
            variables: {
                piece_session_id: this.pieceSessionId,
                purchase_order_article_id: this.poArticleId,
                size: this.size,
                operator_id: this.operatorId,
                status: 'in_progress',
                front_side_complete: false,
                back_side_complete: false,
            },
        });
    }

    async submitSide(side: 'front' | 'back', results: DetailedResult[]): Promise<void> {
        await graphqlClient.mutate({
            mutation: UPSERT_DETAILED,
            variables: {
                piece_session_id: this.pieceSessionId,
                purchase_order_article_id: this.poArticleId,
                size: this.size,
                side,
                results,
            },
        });
    }

    async completeSession(frontResult: string, backResult: string): Promise<void> {
        await graphqlClient.mutate({
            mutation: UPSERT_SESSION,
            variables: {
                piece_session_id: this.pieceSessionId,
                purchase_order_article_id: this.poArticleId,
                size: this.size,
                operator_id: this.operatorId,
                status: 'completed',
                front_side_complete: true,
                back_side_complete: true,
                front_qc_result: frontResult,
                back_qc_result: backResult,
            },
        });
    }
}
```

---

## Testing Checklist

Run this checklist for one article + size combination before releasing:

- [ ] **Piece 1:** Start measurement → submit front → submit back → complete
  - Dashboard shows piece count: **1**
- [ ] **Piece 2:** Click "Next Piece" → submit front → submit back → complete
  - Dashboard shows piece count: **2** (not still 1)
- [ ] **Piece 3:** Click "Next Piece" → submit front → submit back → complete
  - Dashboard shows piece count: **3**
- [ ] **Hard reload** the dashboard — count remains **3**, no reversion
- [ ] **Re-submit piece 2 front** (same `piece_session_id`) — data updates, count stays **3**
- [ ] Run `scripts/verify-qc-graphql-writes.sh` against backend — all `✅`

---

## GraphQL Errors You Will See If piece_session_id Is Missing

If the operator panel sends a mutation without `piece_session_id`, you will see:

```
Unknown argument "piece_session_id" is not defined...
```
or
```
Field "piece_session_id" is not defined by type "MeasurementResultInput"
```

These mean the field is **absent from your mutation definition** (not just the variables).
Check that your mutation string includes `$piece_session_id: String!` in both the
argument list and the field call.

---

## Backend Reference

- Schema definition: `graphql/schema.graphql` lines 328, 337, 364
- Session resolver: `app/GraphQL/Mutations/UpsertMeasurementSession.php`
- Results resolver: `app/GraphQL/Mutations/UpsertMeasurementResults.php`
- Detailed resolver: `app/GraphQL/Mutations/UpsertMeasurementResultsDetailed.php`
- Technical spec: `docs/PIECE_SESSION_ID_IMPLEMENTATION.md`
