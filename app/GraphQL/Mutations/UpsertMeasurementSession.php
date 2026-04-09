<?php

namespace App\GraphQL\Mutations;

use Illuminate\Support\Facades\DB;

class UpsertMeasurementSession
{
    public function __invoke($_, array $args): array
    {
        try {
            // piece_session_id is REQUIRED - it's the unique identifier for this physical piece
            $pieceSessionId = $args['piece_session_id'] ?? null;
            if (!$pieceSessionId) {
                return [
                    'success' => false,
                    'message' => 'piece_session_id is required to track individual pieces',
                ];
            }

            DB::table('measurement_sessions')->upsert(
                [[
                    'piece_session_id' => $pieceSessionId,
                    'purchase_order_article_id' => $args['purchase_order_article_id'],
                    'size' => $args['size'],
                    'article_style' => $args['article_style'] ?? null,
                    'article_id' => $args['article_id'] ?? null,
                    'purchase_order_id' => $args['purchase_order_id'] ?? null,
                    'operator_id' => $args['operator_id'] ?? null,
                    'status' => $args['status'] ?? 'in_progress',
                    'front_side_complete' => $args['front_side_complete'] ?? false,
                    'back_side_complete' => $args['back_side_complete'] ?? false,
                    'front_qc_result' => $args['front_qc_result'] ?? null,
                    'back_qc_result' => $args['back_qc_result'] ?? null,
                    'updated_at' => now(),
                ]],
                ['piece_session_id'],
                [
                    'purchase_order_article_id', 'size', 'article_style', 'article_id', 'purchase_order_id',
                    'operator_id', 'status', 'front_side_complete', 'back_side_complete',
                    'front_qc_result', 'back_qc_result', 'updated_at',
                ]
            );

            return [
                'success' => true,
                'message' => 'Session saved successfully.',
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => 'Failed to save session: ' . $e->getMessage(),
            ];
        }
    }
}
