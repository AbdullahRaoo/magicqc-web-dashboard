<?php

namespace App\GraphQL\Mutations;

use Illuminate\Support\Facades\DB;

class UpsertMeasurementResults
{
    public function __invoke($_, array $args): array
    {
        $results = $args['results'];

        try {
            // Ensure table exists with piece_session_id support
            if (!DB::getSchemaBuilder()->hasTable('measurement_results')) {
                DB::statement("CREATE TABLE IF NOT EXISTS measurement_results (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    piece_session_id CHAR(36),
                    purchase_order_article_id BIGINT UNSIGNED NOT NULL,
                    measurement_id BIGINT UNSIGNED NOT NULL,
                    size VARCHAR(50) NOT NULL,
                    article_style VARCHAR(255) NULL,
                    measured_value DECIMAL(10,2) NULL,
                    expected_value DECIMAL(10,2) NULL,
                    tol_plus DECIMAL(10,2) NULL,
                    tol_minus DECIMAL(10,2) NULL,
                    status ENUM('PASS','FAIL','PENDING') DEFAULT 'PENDING',
                    operator_id BIGINT UNSIGNED NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY mr_piece_unique (piece_session_id, purchase_order_article_id, measurement_id, size),
                    FOREIGN KEY (purchase_order_article_id) REFERENCES purchase_order_articles(id) ON DELETE CASCADE,
                    FOREIGN KEY (measurement_id) REFERENCES measurements(id),
                    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL
                )");
            }

            $hasPieceSessionId = DB::getSchemaBuilder()->hasColumn('measurement_results', 'piece_session_id');
            $hasArticleStyle = DB::getSchemaBuilder()->hasColumn('measurement_results', 'article_style');

            // CRITICAL: piece_session_id is required for correct piece tracking
            // If column missing, fail fast instead of silently falling back to old key
            if (!$hasPieceSessionId) {
                return [
                    'success' => false,
                    'message' => 'MIGRATION REQUIRED: piece_session_id column missing from measurement_results table. Run: php artisan migrate',
                    'count' => 0,
                ];
            }

            $rows = array_map(function ($r) use ($hasPieceSessionId, $hasArticleStyle) {
                $row = [
                    'piece_session_id' => $r['piece_session_id'] ?? null,  // REQUIRED for piece tracking
                    'purchase_order_article_id' => $r['purchase_order_article_id'],
                    'measurement_id' => $r['measurement_id'],
                    'size' => $r['size'],
                    'measured_value' => $r['measured_value'] ?? null,
                    'expected_value' => $r['expected_value'] ?? null,
                    'tol_plus' => $r['tol_plus'] ?? null,
                    'tol_minus' => $r['tol_minus'] ?? null,
                    'status' => $r['status'] ?? 'PENDING',
                    'operator_id' => $r['operator_id'] ?? null,
                ];

                if ($hasArticleStyle) {
                    $row['article_style'] = $r['article_style'] ?? null;
                }

                return $row;
            }, $results);

            $updateColumns = ['measured_value', 'expected_value', 'tol_plus', 'tol_minus', 'status', 'operator_id', 'updated_at'];
            if ($hasArticleStyle) {
                $updateColumns[] = 'article_style';
            }

            // ALWAYS scope by piece_session_id to prevent cross-piece overwrites
            $upsertKey = ['piece_session_id', 'purchase_order_article_id', 'measurement_id', 'size'];

            DB::table('measurement_results')->upsert(
                $rows,
                $upsertKey,
                $updateColumns
            );

            return [
                'success' => true,
                'message' => 'Measurement results saved successfully.',
                'count' => count($results),
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => 'Failed to save: ' . $e->getMessage(),
                'count' => 0,
            ];
        }
    }
}
