<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CleanupPendingQcHistory extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'qc:cleanup-pending \
        {--dry-run : Show what would be deleted without deleting anything}';

    /**
     * The console command description.
     */
    protected $description = 'Remove pending QC pieces and their related measurement rows from the database';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        if (!DB::getSchemaBuilder()->hasTable('measurement_sessions')) {
            $this->error('measurement_sessions table not found.');
            return Command::FAILURE;
        }

        $pendingPieceIds = DB::table('measurement_sessions')
            ->select('piece_session_id')
            ->whereNotNull('piece_session_id')
            ->groupBy('piece_session_id')
            ->havingRaw("MAX(CASE WHEN front_qc_result = 'PASS' AND back_qc_result = 'PASS' THEN 1 WHEN front_qc_result = 'FAIL' OR back_qc_result = 'FAIL' THEN 2 ELSE 0 END) = 0")
            ->pluck('piece_session_id')
            ->filter()
            ->values()
            ->all();

        if (empty($pendingPieceIds)) {
            $this->info('No pending QC pieces found.');
            return Command::SUCCESS;
        }

        $sessionCount = DB::table('measurement_sessions')
            ->whereIn('piece_session_id', $pendingPieceIds)
            ->count();

        $resultsCount = DB::table('measurement_results')
            ->whereIn('piece_session_id', $pendingPieceIds)
            ->count();

        $detailedCount = DB::table('measurement_results_detailed')
            ->whereIn('piece_session_id', $pendingPieceIds)
            ->count();

        $this->line('Pending piece sessions found: ' . count($pendingPieceIds));
        $this->line('measurement_sessions rows: ' . $sessionCount);
        $this->line('measurement_results rows: ' . $resultsCount);
        $this->line('measurement_results_detailed rows: ' . $detailedCount);

        if ($this->option('dry-run')) {
            $this->warn('Dry run only. No rows deleted.');
            return Command::SUCCESS;
        }

        if (!$this->confirm('Delete all pending QC pieces and related rows? This cannot be undone.', false)) {
            $this->warn('Aborted.');
            return Command::SUCCESS;
        }

        DB::transaction(function () use ($pendingPieceIds) {
            DB::table('measurement_results_detailed')
                ->whereIn('piece_session_id', $pendingPieceIds)
                ->delete();

            DB::table('measurement_results')
                ->whereIn('piece_session_id', $pendingPieceIds)
                ->delete();

            DB::table('measurement_sessions')
                ->whereIn('piece_session_id', $pendingPieceIds)
                ->delete();
        });

        $this->info('Pending QC rows deleted successfully.');
        return Command::SUCCESS;
    }
}
