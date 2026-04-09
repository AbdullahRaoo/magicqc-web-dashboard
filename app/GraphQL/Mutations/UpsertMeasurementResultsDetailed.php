<?php

namespace App\GraphQL\Mutations;

use Illuminate\Support\Facades\DB;

class UpsertMeasurementResultsDetailed
{
    public function __invoke($_, array $args): array
    {
        $poArticleId = $args['purchase_order_article_id'];
        $size = $args['size'];
        $side = $args['side'];
        $results = $args['results'];

        try {
            DB::beginTransaction();

            // Delete existing results for this combination
            DB::table('measurement_results_detailed')
                ->where('purchase_order_article_id', $poArticleId)
                ->where('size', $size)
                ->where('side', $side)
                ->delete();

            // Insert new results
            $rows = array_map(function ($r) use ($poArticleId, $size, $side) {
                return [
                    'purchase_order_article_id' => $poArticleId,
                    'measurement_id' => $r['measurement_id'],
                    'size' => $size,
                    'side' => $side,
                    'article_style' => $r['article_style'] ?? null,
                    'measured_value' => $r['measured_value'] ?? null,
                    'expected_value' => $r['expected_value'] ?? null,
                    'tol_plus' => $r['tol_plus'] ?? null,
                    'tol_minus' => $r['tol_minus'] ?? null,
                    'status' => $r['status'] ?? 'PENDING',
                    'operator_id' => $r['operator_id'] ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }, $results);

            DB::table('measurement_results_detailed')->insert($rows);

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

            // --- AUTO-AGGREGATION FOR OVERALL DASHBOARD ---
            // Group all side measurements for this article/size by measurement_id
            $allDetailed = DB::table('measurement_results_detailed')
                ->where('purchase_order_article_id', $poArticleId)
                ->where('size', $size)
                ->get();

            $grouped = [];
            foreach ($allDetailed as $row) {
                if (!isset($grouped[$row->measurement_id])) {
                    $grouped[$row->measurement_id] = [
                        'purchase_order_article_id' => $poArticleId,
                        'measurement_id' => $row->measurement_id,
                        'size' => $size,
                        'measured_value' => null,
                        'expected_value' => null,
                        'tol_plus' => null,
                        'tol_minus' => null,
                        'status' => 'PENDING',
                        'operator_id' => $row->operator_id,
                        'sides' => []
                    ];

                    if ($hasArticleStyle) {
                        $grouped[$row->measurement_id]['article_style'] = $row->article_style;
                    }
                }
                $grouped[$row->measurement_id]['sides'][] = $row->status;
            }

            $overallRows = [];
            foreach ($grouped as $mId => $data) {
                $sides = $data['sides'];
                $status = 'PENDING';
                
                if (in_array('FAIL', $sides)) {
                    $status = 'FAIL';
                } elseif (in_array('PASS', $sides)) {
                    $status = 'PASS';
                }

                $data['status'] = $status;
                unset($data['sides']);
                $overallRows[] = $data;
            }

            if (!empty($overallRows)) {
                // Make sure the measurement_results table exists first, if not this should just work
                // assuming the CREATE TABLE has run (which it has).
                DB::table('measurement_results')->upsert(
                    $overallRows,
                    ['purchase_order_article_id', 'measurement_id', 'size'],
                    $hasArticleStyle
                        ? ['status', 'operator_id', 'article_style']
                        : ['status', 'operator_id']
                );
            }
            // --- END AUTO-AGGREGATION ---

            DB::commit();

            return [
                'success' => true,
                'message' => 'Detailed results saved successfully.',
                'count' => count($rows),
            ];
        } catch (\Exception $e) {
            DB::rollBack();
            return [
                'success' => false,
                'message' => 'Failed to save: ' . $e->getMessage(),
                'count' => 0,
            ];
        }
    }
}
