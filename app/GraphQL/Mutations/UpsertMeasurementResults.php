<?php

namespace App\GraphQL\Mutations;

use Illuminate\Support\Facades\DB;

class UpsertMeasurementResults
{
    public function __invoke($_, array $args): array
    {
        $results = $args['results'];

        try {
            // Ensure table exists
            if (!DB::getSchemaBuilder()->hasTable('measurement_results')) {
                DB::statement("CREATE TABLE IF NOT EXISTS measurement_results (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
                    UNIQUE KEY mr_unique (purchase_order_article_id, measurement_id, size),
                    FOREIGN KEY (purchase_order_article_id) REFERENCES purchase_order_articles(id) ON DELETE CASCADE,
                    FOREIGN KEY (measurement_id) REFERENCES measurements(id),
                    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL
                )");
            }

            $hasArticleStyle = DB::getSchemaBuilder()->hasColumn('measurement_results', 'article_style');

            $rows = array_map(function ($r) use ($hasArticleStyle) {
                $row = [
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

            $updateColumns = ['measured_value', 'expected_value', 'tol_plus', 'tol_minus', 'status', 'operator_id'];
            if ($hasArticleStyle) {
                $updateColumns[] = 'article_style';
            }

            DB::table('measurement_results')->upsert(
                $rows,
                ['purchase_order_article_id', 'measurement_id', 'size'],
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
