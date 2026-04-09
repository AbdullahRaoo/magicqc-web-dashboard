<?php

namespace App\Http\Controllers;

use App\Models\Article;
use App\Models\Brand;
use App\Models\Operator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class DirectorAnalyticsController extends Controller
{
    /**
     * Latest-row projection for measurement_sessions by logical piece key.
     */
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
                  AND (
                        ms2.updated_at > ms1.updated_at
                        OR (ms2.updated_at = ms1.updated_at AND ms2.id > ms1.id)
                  )
            )
        ";
    }

    /**
     * Latest-row projection for measurement_results by logical measurement key.
     */
    private function latestMeasurementResultsSubquery(): string
    {
        return "
            SELECT mr1.*
            FROM measurement_results mr1
            WHERE NOT EXISTS (
                SELECT 1
                FROM measurement_results mr2
                WHERE mr2.purchase_order_article_id = mr1.purchase_order_article_id
                  AND mr2.size = mr1.size
                  AND mr2.measurement_id = mr1.measurement_id
                  AND (
                        mr2.updated_at > mr1.updated_at
                        OR (mr2.updated_at = mr1.updated_at AND mr2.id > mr1.id)
                  )
            )
        ";
    }

    /**
     * Latest-row projection for measurement_results_detailed by logical side key.
     */
    private function latestMeasurementResultsDetailedSubquery(): string
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
                  AND (
                        mrd2.updated_at > mrd1.updated_at
                        OR (mrd2.updated_at = mrd1.updated_at AND mrd2.id > mrd1.id)
                  )
            )
        ";
    }

    /**
     * Display the director analytics dashboard.
     *
        * Queries authoritative Operator Panel QC sources:
        *   - measurement_results
        *   - measurement_results_detailed
        *   - measurement_sessions
        *
     * Both are aggregated fresh on every request (no caching) so the dashboard
     * always reflects the latest committed measurements.
     */
    public function index(Request $request): Response
    {
        $filters = $this->extractFilters($request);

        $summary = $this->getSummaryStats($filters);
        $pieceAnalytics = $this->getPieceAnalytics($filters);
        $articleSummary = $this->getArticleSummary($filters);
        $operatorPerformance = $this->getOperatorPerformance($filters);
        $filterOptions = $this->getFilterOptions();
        $failureAnalysis = $this->getMeasurementFailureAnalysis($filters);

        return Inertia::render('director-analytics/index', [
            'summary' => $summary,
            'pieceAnalytics' => $pieceAnalytics,
            'articleSummary' => $articleSummary,
            'operatorPerformance' => $operatorPerformance,
            'failureAnalysis' => $failureAnalysis,
            'filterOptions' => $filterOptions,
            'appliedFilters' => $filters,
        ]);
    }

    /**
     * Export analytics data as Excel.
     */
    public function exportExcel(Request $request)
    {
        $filters = $this->extractFilters($request);
        $reportType = $filters['report_type'] ?? 'all';
        $data = $this->getExportData($filters, $reportType);

        $filename = 'MagicQC_Analytics_' . now()->format('Y-m-d_His') . '.csv';

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];

        $callback = function () use ($data) {
            $file = fopen('php://output', 'w');

            // BOM for Excel UTF-8 compatibility
            fwrite($file, "\xEF\xBB\xBF");

            // Summary Section
            $reportTitle = match($data['reportType']) {
                'measurement' => 'MEASUREMENT REPORT',
                'article' => 'ARTICLE & BRAND WISE REPORT',
                'operator' => 'OPERATORS\' USAGE SUMMARY',
                default => 'COMPLETE ANALYTICS REPORT'
            };
            fputcsv($file, ['MAGIC QC - ' . $reportTitle]);
            fputcsv($file, ['Generated: ' . now()->format('F d, Y h:i A')]);
            fputcsv($file, []);

            // Summary Stats (always included)
            fputcsv($file, ['=== SUMMARY STATISTICS ===']);
            fputcsv($file, ['Metric', 'Value']);
            fputcsv($file, ['Total Inspections', $data['summary']['total']]);
            fputcsv($file, ['Total Pass', $data['summary']['pass']]);
            fputcsv($file, ['Total Fail', $data['summary']['fail']]);
            fputcsv($file, ['Pass Rate (%)', $data['summary']['passRate']]);
            fputcsv($file, []);

            // Article Summary (for 'all' and 'article' reports)
            if (isset($data['articleSummary'])) {
                fputcsv($file, ['=== ARTICLE & BRAND WISE SUMMARY ===']);
                fputcsv($file, ['Article Style', 'Brand', 'Total', 'Pass', 'Fail', 'Pass Rate (%)']);
                foreach ($data['articleSummary'] as $row) {
                    fputcsv($file, [
                        $row['article_style'],
                        $row['brand_name'],
                        $row['total'],
                        $row['pass'],
                        $row['fail'],
                        $row['total'] > 0 ? round(($row['pass'] / $row['total']) * 100, 1) : 0,
                    ]);
                }
                fputcsv($file, []);
            }

            // Operator Performance (for 'all' and 'operator' reports)
            if (isset($data['operatorPerformance'])) {
                fputcsv($file, ['=== OPERATORS\' USAGE SUMMARY ===']);
                fputcsv($file, ['Operator', 'Employee ID', 'Total Inspections', 'Pass', 'Fail', 'Pass Rate (%)']);
                foreach ($data['operatorPerformance'] as $row) {
                    fputcsv($file, [
                        $row['operator_name'],
                        $row['employee_id'],
                        $row['total'],
                        $row['pass'],
                        $row['fail'],
                        $row['total'] > 0 ? round(($row['pass'] / $row['total']) * 100, 1) : 0,
                    ]);
                }
                fputcsv($file, []);
            }

            // Measurement Failure Analysis (for 'all' and 'measurement' reports)
            if (isset($data['failureAnalysis']) && !empty($data['failureAnalysis']) && $data['failureAnalysis']['totalViolations'] > 0) {
                fputcsv($file, []);
                fputcsv($file, ['=== MEASUREMENT FAILURE ANALYSIS ===']);
                fputcsv($file, ['Total Size Variations: ' . $data['failureAnalysis']['totalViolations']]);
                fputcsv($file, []);

                fputcsv($file, ['--- Most Failing Parameters ---']);
                fputcsv($file, ['Parameter', 'Times Checked', 'Times Failed', 'Failure Rate (%)', 'Avg Deviation (cm)']);
                foreach ($data['failureAnalysis']['parameterFailures'] as $param) {
                    if ($param['times_failed'] > 0) {
                        fputcsv($file, [
                            $param['label'],
                            $param['times_checked'],
                            $param['times_failed'],
                            $param['failure_rate'],
                            $param['avg_deviation'],
                        ]);
                    }
                }
                fputcsv($file, []);

                fputcsv($file, ['--- Articles with Repeated Issues ---']);
                fputcsv($file, ['Article Style', 'Total Measurement Failures', 'Params Affected', 'Most Common Failure']);
                foreach ($data['failureAnalysis']['articleFailures'] as $article) {
                    fputcsv($file, [
                        $article['article_style'],
                        $article['total_measurement_failures'],
                        $article['unique_params_failing'],
                        $article['most_common_failure'] . ' (' . $article['most_common_failure_count'] . 'x)',
                    ]);
                }
                fputcsv($file, []);

                fputcsv($file, ['--- Size Variation Concentration ---']);
                fputcsv($file, ['Parameter', 'Variations', 'Avg Deviation', 'Max Deviation', 'Over Tolerance %', 'Under Tolerance %']);
                foreach ($data['failureAnalysis']['toleranceConcentration'] as $tc) {
                    fputcsv($file, [
                        $tc['label'],
                        $tc['violation_count'],
                        $tc['avg_deviation'],
                        $tc['max_deviation'],
                        $tc['over_tolerance_pct'],
                        $tc['under_tolerance_pct'],
                    ]);
                }
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }

    /**
     * Export analytics data as PDF.
     */
    public function exportPdf(Request $request)
    {
        $filters = $this->extractFilters($request);
        $reportType = $filters['report_type'] ?? 'all';
        $data = $this->getExportData($filters, $reportType);
        $data['generatedAt'] = now()->format('F d, Y h:i A');
        $data['appliedFilters'] = $filters;

        $pdf = app('dompdf.wrapper');
        $pdf->loadView('exports.analytics-pdf', $data);
        $pdf->setPaper('a4', 'landscape');

        return $pdf->download('MagicQC_Analytics_' . now()->format('Y-m-d_His') . '.pdf');
    }

    /**
     * Extract and sanitize filter parameters from the request.
     */
    private function extractFilters(Request $request): array
    {
        return [
            'brand_id' => $request->input('brand_id'),
            'article_style' => $request->input('article_style'),
            'operator_id' => $request->input('operator_id'),
            'date_from' => $request->input('date_from'),
            'date_to' => $request->input('date_to'),
            'result' => $request->input('result'),
            'report_type' => $request->input('report_type', 'all'),
            'side' => $request->input('side'),
        ];
    }

    /**
     * Build the base query for session-level piece analytics.
     */
    private function buildPieceQuery(array $filters)
    {
        $latestSessions = $this->latestMeasurementSessionsSubquery();

        $query = DB::table(DB::raw("({$latestSessions}) as ms"))
            ->join('purchase_order_articles as poa', 'ms.purchase_order_article_id', '=', 'poa.id')
            ->join('purchase_orders as po', 'poa.purchase_order_id', '=', 'po.id')
            ->leftJoin('brands as b', 'po.brand_id', '=', 'b.id')
            ->leftJoin('operators as o', 'ms.operator_id', '=', 'o.id')
            ->selectRaw("\n                ms.purchase_order_article_id,\n                ms.size,\n                poa.article_style,\n                COALESCE(b.name, 'Unknown') as brand_name,\n                o.full_name as operator_name,\n                ms.status,\n                ms.front_side_complete,\n                ms.back_side_complete,\n                ms.front_qc_result,\n                ms.back_qc_result,\n                ms.created_at,\n                ms.updated_at\n            ");

        if (!empty($filters['brand_id'])) {
            $query->where('po.brand_id', $filters['brand_id']);
        }
        if (!empty($filters['article_style'])) {
            $query->where('poa.article_style', $filters['article_style']);
        }
        if (!empty($filters['operator_id'])) {
            $query->where('ms.operator_id', $filters['operator_id']);
        }
        if (!empty($filters['date_from'])) {
            $query->whereDate('ms.updated_at', '>=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $query->whereDate('ms.updated_at', '<=', $filters['date_to']);
        }
        if (!empty($filters['result'])) {
            $result = strtoupper($filters['result']);
            if ($result === 'PASS') {
                $query->whereRaw("ms.front_qc_result = 'PASS' AND ms.back_qc_result = 'PASS'");
            } elseif ($result === 'FAIL') {
                $query->whereRaw("ms.front_qc_result = 'FAIL' OR ms.back_qc_result = 'FAIL'");
            } elseif ($result === 'PENDING') {
                $query->whereRaw("(ms.front_qc_result IS NULL OR ms.back_qc_result IS NULL OR ms.front_qc_result = 'PENDING' OR ms.back_qc_result = 'PENDING') AND NOT (ms.front_qc_result = 'PASS' AND ms.back_qc_result = 'PASS') AND NOT (ms.front_qc_result = 'FAIL' OR ms.back_qc_result = 'FAIL')");
            }
        }

        return $query;
    }

    /**
     * Build piece-level QC analytics for article pieces.
     */
    private function getPieceAnalytics(array $filters): array
    {
        if (!Schema::hasTable('measurement_sessions')) {
            return [
                'overview' => [
                    'total_pieces' => 0,
                    'completed_pieces' => 0,
                    'in_progress_pieces' => 0,
                    'front_complete_pieces' => 0,
                    'back_complete_pieces' => 0,
                    'pass_pieces' => 0,
                    'fail_pieces' => 0,
                    'pending_pieces' => 0,
                    'completion_rate' => 0,
                    'pass_rate' => 0,
                    'front_completion_rate' => 0,
                    'back_completion_rate' => 0,
                ],
                'byArticle' => [],
            ];
        }

        $base = $this->buildPieceQuery($filters);

        try {
            $summary = (clone $base)
                ->selectRaw("\n                COUNT(*) as total_pieces,\n                SUM(CASE WHEN ms.status = 'completed' THEN 1 ELSE 0 END) as completed_pieces,\n                SUM(CASE WHEN ms.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_pieces,\n                SUM(CASE WHEN ms.front_side_complete = 1 THEN 1 ELSE 0 END) as front_complete_pieces,\n                SUM(CASE WHEN ms.back_side_complete = 1 THEN 1 ELSE 0 END) as back_complete_pieces,\n                SUM(CASE WHEN ms.front_qc_result = 'PASS' AND ms.back_qc_result = 'PASS' THEN 1 ELSE 0 END) as pass_pieces,\n                SUM(CASE WHEN ms.front_qc_result = 'FAIL' OR ms.back_qc_result = 'FAIL' THEN 1 ELSE 0 END) as fail_pieces\n            ")
                ->first();
        } catch (Throwable $e) {
            Log::warning('Piece analytics query failed', ['error' => $e->getMessage()]);

            return [
                'overview' => [
                    'total_pieces' => 0,
                    'completed_pieces' => 0,
                    'in_progress_pieces' => 0,
                    'front_complete_pieces' => 0,
                    'back_complete_pieces' => 0,
                    'pass_pieces' => 0,
                    'fail_pieces' => 0,
                    'pending_pieces' => 0,
                    'completion_rate' => 0,
                    'pass_rate' => 0,
                    'front_completion_rate' => 0,
                    'back_completion_rate' => 0,
                ],
                'byArticle' => [],
            ];
        }

        $totalPieces = (int) ($summary->total_pieces ?? 0);
        $completedPieces = (int) ($summary->completed_pieces ?? 0);
        $inProgressPieces = (int) ($summary->in_progress_pieces ?? 0);
        $frontCompletePieces = (int) ($summary->front_complete_pieces ?? 0);
        $backCompletePieces = (int) ($summary->back_complete_pieces ?? 0);
        $passPieces = (int) ($summary->pass_pieces ?? 0);
        $failPieces = (int) ($summary->fail_pieces ?? 0);
        $pendingPieces = max($totalPieces - $passPieces - $failPieces, 0);

        $articleRows = (clone $base)
            ->selectRaw("\n                poa.article_style,\n                COALESCE(b.name, 'Unknown') as brand_name,\n                COUNT(*) as total_pieces,\n                SUM(CASE WHEN ms.status = 'completed' THEN 1 ELSE 0 END) as completed_pieces,\n                SUM(CASE WHEN ms.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_pieces,\n                SUM(CASE WHEN ms.front_qc_result = 'PASS' AND ms.back_qc_result = 'PASS' THEN 1 ELSE 0 END) as pass_pieces,\n                SUM(CASE WHEN ms.front_qc_result = 'FAIL' OR ms.back_qc_result = 'FAIL' THEN 1 ELSE 0 END) as fail_pieces,\n                SUM(CASE WHEN ms.front_side_complete = 1 THEN 1 ELSE 0 END) as front_complete_pieces,\n                SUM(CASE WHEN ms.back_side_complete = 1 THEN 1 ELSE 0 END) as back_complete_pieces\n            ")
            ->groupBy('poa.article_style', 'b.name')
            ->orderByDesc('total_pieces')
            ->get()
            ->map(function ($row) {
                $total = (int) $row->total_pieces;
                $pass = (int) $row->pass_pieces;
                $fail = (int) $row->fail_pieces;

                return [
                    'article_style' => $row->article_style,
                    'brand_name' => $row->brand_name,
                    'total_pieces' => $total,
                    'completed_pieces' => (int) $row->completed_pieces,
                    'in_progress_pieces' => (int) $row->in_progress_pieces,
                    'pass_pieces' => $pass,
                    'fail_pieces' => $fail,
                    'pending_pieces' => max($total - $pass - $fail, 0),
                    'front_complete_pieces' => (int) $row->front_complete_pieces,
                    'back_complete_pieces' => (int) $row->back_complete_pieces,
                    'completion_rate' => $total > 0 ? round(((int) $row->completed_pieces / $total) * 100, 1) : 0,
                    'pass_rate' => $total > 0 ? round(($pass / $total) * 100, 1) : 0,
                ];
            })
            ->toArray();

        return [
            'overview' => [
                'total_pieces' => $totalPieces,
                'completed_pieces' => $completedPieces,
                'in_progress_pieces' => $inProgressPieces,
                'front_complete_pieces' => $frontCompletePieces,
                'back_complete_pieces' => $backCompletePieces,
                'pass_pieces' => $passPieces,
                'fail_pieces' => $failPieces,
                'pending_pieces' => $pendingPieces,
                'completion_rate' => $totalPieces > 0 ? round(($completedPieces / $totalPieces) * 100, 1) : 0,
                'pass_rate' => $totalPieces > 0 ? round(($passPieces / $totalPieces) * 100, 1) : 0,
                'front_completion_rate' => $totalPieces > 0 ? round(($frontCompletePieces / $totalPieces) * 100, 1) : 0,
                'back_completion_rate' => $totalPieces > 0 ? round(($backCompletePieces / $totalPieces) * 100, 1) : 0,
            ],
            'byArticle' => $articleRows,
        ];
    }

    // ──────────────────────────────────────────────────────────────
    //  UNIFIED QUERY HELPERS
    //  Operator Panel query helpers (measurement_results family).
    // ──────────────────────────────────────────────────────────────

    /**
     * Build WHERE clauses for the measurement_results-based query.
     * Returns [sql_fragments, bindings].
     */
    private function buildMrWhere(array $filters): array
    {
        $where = [];
        $bindings = [];

        if (!empty($filters['article_style'])) {
            $where[] = 'poa.article_style = ?';
            $bindings[] = $filters['article_style'];
        }
        if (!empty($filters['operator_id'])) {
            $where[] = 'mr.operator_id = ?';
            $bindings[] = $filters['operator_id'];
        }
        if (!empty($filters['date_from'])) {
            $where[] = 'DATE(mr.updated_at) >= ?';
            $bindings[] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[] = 'DATE(mr.updated_at) <= ?';
            $bindings[] = $filters['date_to'];
        }
        if (!empty($filters['result'])) {
            $where[] = 'mr.status = ?';
            $bindings[] = strtoupper($filters['result']);
        }
        if (!empty($filters['brand_id'])) {
            $where[] = 'po.brand_id = ?';
            $bindings[] = $filters['brand_id'];
        }

        $sql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        return [$sql, $bindings];
    }

    // ──────────────────────────────────────────────────────────────
    //  SUMMARY STATS  (Total Measurements, Pass, Fail, Rates)
    //  Source: measurement_results (Operator Panel)
    // ──────────────────────────────────────────────────────────────

    /**
     * Get summary statistics from measurement_results only.
     */
    private function getSummaryStats(array $filters): array
    {
        [$mrWhere, $mrBindings] = $this->buildMrWhere($filters);
        $latestMr = $this->latestMeasurementResultsSubquery();

        $mrStats = DB::selectOne("
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN mr.status = 'PASS' THEN 1 ELSE 0 END) as pass,
                SUM(CASE WHEN mr.status = 'FAIL' THEN 1 ELSE 0 END) as fail
            FROM ({$latestMr}) mr
            JOIN purchase_order_articles poa ON mr.purchase_order_article_id = poa.id
            JOIN purchase_orders po ON poa.purchase_order_id = po.id
            {$mrWhere}
        ", $mrBindings);

        $total = (int) ($mrStats->total ?? 0);
        $pass = (int) ($mrStats->pass ?? 0);
        $fail = (int) ($mrStats->fail ?? 0);

        return [
            'total' => $total,
            'pass' => $pass,
            'fail' => $fail,
            'passRate' => $total > 0 ? round(($pass / $total) * 100, 1) : 0,
            'failRate' => $total > 0 ? round(($fail / $total) * 100, 1) : 0,
        ];
    }

    // ──────────────────────────────────────────────────────────────
    //  ARTICLE SUMMARY
    // ──────────────────────────────────────────────────────────────

    private function getArticleSummary(array $filters): array
    {
        [$mrWhere, $mrBindings] = $this->buildMrWhere($filters);
        $latestMr = $this->latestMeasurementResultsSubquery();

        $mrRows = DB::select("
            SELECT
                poa.article_style,
                COALESCE(b.name, 'Unknown') as brand_name,
                COUNT(*) as total,
                SUM(CASE WHEN mr.status = 'PASS' THEN 1 ELSE 0 END) as pass,
                SUM(CASE WHEN mr.status = 'FAIL' THEN 1 ELSE 0 END) as fail
            FROM ({$latestMr}) mr
            JOIN purchase_order_articles poa ON mr.purchase_order_article_id = poa.id
            JOIN purchase_orders po ON poa.purchase_order_id = po.id
            LEFT JOIN brands b ON po.brand_id = b.id
            {$mrWhere}
            GROUP BY poa.article_style, b.name
            ORDER BY total DESC
        ", $mrBindings);

        return array_map(function ($row) {
            $row = (array) $row;
            return [
                ...$row,
                'total' => (int) ($row['total'] ?? 0),
                'pass' => (int) ($row['pass'] ?? 0),
                'fail' => (int) ($row['fail'] ?? 0),
            ];
        }, $mrRows);
    }

    // ──────────────────────────────────────────────────────────────
    //  OPERATOR PERFORMANCE
    // ──────────────────────────────────────────────────────────────

    private function getOperatorPerformance(array $filters): array
    {
        [$mrWhere, $mrBindings] = $this->buildMrWhere($filters);
        $latestMr = $this->latestMeasurementResultsSubquery();

        $mrRows = DB::select("
            SELECT
                o.full_name as operator_name,
                o.employee_id,
                COUNT(*) as total,
                SUM(CASE WHEN mr.status = 'PASS' THEN 1 ELSE 0 END) as pass,
                SUM(CASE WHEN mr.status = 'FAIL' THEN 1 ELSE 0 END) as fail
            FROM ({$latestMr}) mr
            JOIN operators o ON mr.operator_id = o.id
            JOIN purchase_order_articles poa ON mr.purchase_order_article_id = poa.id
            JOIN purchase_orders po ON poa.purchase_order_id = po.id
            {$mrWhere}
            GROUP BY o.full_name, o.employee_id
            ORDER BY total DESC
        ", $mrBindings);

        return array_map(function ($row) {
            $row = (array) $row;
            return [
                ...$row,
                'total' => (int) ($row['total'] ?? 0),
                'pass' => (int) ($row['pass'] ?? 0),
                'fail' => (int) ($row['fail'] ?? 0),
            ];
        }, $mrRows);
    }

    // ──────────────────────────────────────────────────────────────
    //  FILTER OPTIONS
    // ──────────────────────────────────────────────────────────────

    private function getFilterOptions(): array
    {
        $mrStyles = DB::table('measurement_results')
            ->join('purchase_order_articles', 'measurement_results.purchase_order_article_id', '=', 'purchase_order_articles.id')
            ->select('purchase_order_articles.article_style')
            ->distinct()->pluck('article_style')->toArray();

        $allStyles = collect($mrStyles)
            ->unique()->sort()->values()->toArray();

        return [
            'brands' => Brand::select('id', 'name')->orderBy('name')->get()->toArray(),
            'articleStyles' => $allStyles,
            'operators' => Operator::select('id', 'full_name', 'employee_id')
                ->orderBy('full_name')
                ->get()
                ->toArray(),
        ];
    }

    // ──────────────────────────────────────────────────────────────
    //  MEASUREMENT FAILURE ANALYSIS
    //  Uses measurement_results_detailed (authoritative per-POM per-side).
    // ──────────────────────────────────────────────────────────────

    private function getMeasurementFailureAnalysis(array $filters): array
    {
        if (!Schema::hasTable('measurement_results_detailed')) {
            return [
                'parameterFailures' => [],
                'articleFailures' => [],
                'toleranceConcentration' => [],
                'totalViolations' => 0,
            ];
        }

        $paramStats = [];
        $articleMeasurementFailures = [];
        $toleranceViolations = [];

        // --- Source 1: measurement_results_detailed (Operator Panel, per-POM per-side) ---
        $this->analyzeMrdRecords($filters, $paramStats, $articleMeasurementFailures, $toleranceViolations);

        // --- Build output arrays ---

        // 1. Parameter failure ranking
        $parameterFailures = [];
        foreach ($paramStats as $name => $stats) {
            $parameterFailures[] = [
                'parameter' => $name,
                'label' => ucwords(str_replace('_', ' ', $name)),
                'times_checked' => $stats['checked'],
                'times_failed' => $stats['failed'],
                'failure_rate' => $stats['checked'] > 0 ? round(($stats['failed'] / $stats['checked']) * 100, 1) : 0,
                'avg_deviation' => $stats['failed'] > 0 ? round($stats['total_deviation'] / $stats['failed'], 2) : 0,
            ];
        }
        usort($parameterFailures, fn($a, $b) => $b['times_failed'] <=> $a['times_failed']);

        // 2. Articles with most repeated measurement issues (top 10)
        $articleFailures = [];
        foreach ($articleMeasurementFailures as $articleStyle => $params) {
            $totalFails = array_sum($params);
            $topFailParam = array_keys($params, max($params))[0] ?? '';
            $articleFailures[] = [
                'article_style' => $articleStyle,
                'total_measurement_failures' => $totalFails,
                'unique_params_failing' => count($params),
                'most_common_failure' => ucwords(str_replace('_', ' ', $topFailParam)),
                'most_common_failure_count' => $params[$topFailParam] ?? 0,
                'failing_params' => collect($params)
                    ->map(fn($count, $param) => [
                        'parameter' => ucwords(str_replace('_', ' ', $param)),
                        'count' => $count,
                    ])
                    ->sortByDesc('count')
                    ->values()
                    ->toArray(),
            ];
        }
        usort($articleFailures, fn($a, $b) => $b['total_measurement_failures'] <=> $a['total_measurement_failures']);
        $articleFailures = array_slice($articleFailures, 0, 10);

        // 3. Tolerance concentration by parameter
        $violationsByParam = [];
        foreach ($toleranceViolations as $v) {
            $name = $v['parameter'];
            if (!isset($violationsByParam[$name])) {
                $violationsByParam[$name] = [
                    'count' => 0, 'total_abs_deviation' => 0,
                    'max_abs_deviation' => 0, 'over_count' => 0, 'under_count' => 0,
                ];
            }
            $vp = &$violationsByParam[$name];
            $vp['count']++;
            $absDev = abs($v['deviation']);
            $vp['total_abs_deviation'] += $absDev;
            if ($absDev > $vp['max_abs_deviation']) $vp['max_abs_deviation'] = $absDev;
            if ($v['deviation'] > 0) $vp['over_count']++; else $vp['under_count']++;
            unset($vp);
        }

        $toleranceConcentration = [];
        foreach ($violationsByParam as $name => $stats) {
            $toleranceConcentration[] = [
                'parameter' => $name,
                'label' => ucwords(str_replace('_', ' ', $name)),
                'violation_count' => $stats['count'],
                'avg_deviation' => $stats['count'] > 0 ? round($stats['total_abs_deviation'] / $stats['count'], 2) : 0,
                'max_deviation' => round($stats['max_abs_deviation'], 2),
                'over_tolerance_pct' => $stats['count'] > 0 ? round(($stats['over_count'] / $stats['count']) * 100, 0) : 0,
                'under_tolerance_pct' => $stats['count'] > 0 ? round(($stats['under_count'] / $stats['count']) * 100, 0) : 0,
            ];
        }
        usort($toleranceConcentration, fn($a, $b) => $b['violation_count'] <=> $a['violation_count']);

        return [
            'parameterFailures' => $parameterFailures,
            'articleFailures' => $articleFailures,
            'toleranceConcentration' => $toleranceConcentration,
            'totalViolations' => count($toleranceViolations),
        ];
    }

    /**
     * Analyze measurement_results_detailed for failure data.
     * This is the authoritative per-POM per-side source from the Operator Panel.
     */
    private function analyzeMrdRecords(array $filters, array &$paramStats, array &$articleMeasurementFailures, array &$toleranceViolations): void
    {
        $where = [];
        $bindings = [];

        if (!empty($filters['article_style'])) {
            $where[] = 'mrd.article_style = ?';
            $bindings[] = $filters['article_style'];
        }
        if (!empty($filters['operator_id'])) {
            $where[] = 'mrd.operator_id = ?';
            $bindings[] = $filters['operator_id'];
        }
        if (!empty($filters['date_from'])) {
            $where[] = 'DATE(mrd.created_at) >= ?';
            $bindings[] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[] = 'DATE(mrd.created_at) <= ?';
            $bindings[] = $filters['date_to'];
        }
        if (!empty($filters['result'])) {
            $where[] = 'mrd.status = ?';
            $bindings[] = strtoupper($filters['result']);
        }
        if (!empty($filters['side'])) {
            $where[] = 'mrd.side = ?';
            $bindings[] = $filters['side'];
        }
        if (!empty($filters['brand_id'])) {
            $where[] = 'po.brand_id = ?';
            $bindings[] = $filters['brand_id'];
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $latestMrd = $this->latestMeasurementResultsDetailedSubquery();

        try {
            $rows = DB::select("
                SELECT
                    m.measurement as param_name,
                    m.code as param_code,
                    mrd.article_style,
                    mrd.measured_value,
                    mrd.expected_value,
                    mrd.tol_plus,
                    mrd.tol_minus,
                    mrd.status,
                    mrd.side
                FROM ({$latestMrd}) mrd
                JOIN measurements m ON mrd.measurement_id = m.id
                JOIN purchase_order_articles poa ON mrd.purchase_order_article_id = poa.id
                JOIN purchase_orders po ON poa.purchase_order_id = po.id
                {$whereClause}
            ", $bindings);
        } catch (Throwable $e) {
            Log::warning('Measurement failure analysis query failed', ['error' => $e->getMessage()]);
            return;
        }

        foreach ($rows as $row) {
            $paramKey = strtolower(str_replace(' ', '_', $row->param_name));

            if (!isset($paramStats[$paramKey])) {
                $paramStats[$paramKey] = ['checked' => 0, 'failed' => 0, 'total_deviation' => 0];
            }
            $paramStats[$paramKey]['checked']++;

            if ($row->status === 'FAIL') {
                $deviation = $row->measured_value !== null && $row->expected_value !== null
                    ? (float) $row->measured_value - (float) $row->expected_value
                    : 0;

                $paramStats[$paramKey]['failed']++;
                $paramStats[$paramKey]['total_deviation'] += abs($deviation);

                $articleStyle = $row->article_style;
                if (!isset($articleMeasurementFailures[$articleStyle])) {
                    $articleMeasurementFailures[$articleStyle] = [];
                }
                if (!isset($articleMeasurementFailures[$articleStyle][$paramKey])) {
                    $articleMeasurementFailures[$articleStyle][$paramKey] = 0;
                }
                $articleMeasurementFailures[$articleStyle][$paramKey]++;

                $toleranceViolations[] = [
                    'parameter' => $paramKey,
                    'article_style' => $articleStyle,
                    'expected' => (float) ($row->expected_value ?? 0),
                    'actual' => (float) ($row->measured_value ?? 0),
                    'tolerance' => (float) ($row->tol_plus ?? 0),
                    'deviation' => $deviation,
                ];
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  EXPORT DATA
    // ──────────────────────────────────────────────────────────────

    private function getExportData(array $filters, string $reportType = 'all'): array
    {
        $data = [
            'reportType' => $reportType,
            'summary' => $this->getSummaryStats($filters),
        ];

        switch ($reportType) {
            case 'measurement':
                $data['failureAnalysis'] = $this->getMeasurementFailureAnalysis($filters);
                break;
            case 'article':
                $data['articleSummary'] = $this->getArticleSummary($filters);
                break;
            case 'operator':
                $data['operatorPerformance'] = $this->getOperatorPerformance($filters);
                break;
            case 'all':
            default:
                $data['articleSummary'] = $this->getArticleSummary($filters);
                $data['operatorPerformance'] = $this->getOperatorPerformance($filters);
                $data['failureAnalysis'] = $this->getMeasurementFailureAnalysis($filters);
                break;
        }

        return $data;
    }
}
