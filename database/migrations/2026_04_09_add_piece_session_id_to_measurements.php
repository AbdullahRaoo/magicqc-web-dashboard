<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function indexExists(string $table, string $indexName): bool
    {
        $row = DB::selectOne(
            'SELECT COUNT(1) as aggregate FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
            [$table, $indexName]
        );

        return (int) ($row->aggregate ?? 0) > 0;
    }

    /**
     * Add piece_session_id to track individual pieces/cycles.
     * 
     * Problem: Multiple physical pieces for the same (purchase_order_article_id, size)
     * were overwriting each other because upsert keys didn't include a piece identifier.
     * 
     * Solution: Add piece_session_id (UUID) to all measurement tables to uniquely
     * identify each physical piece being measured.
     * 
     * Behavior:
     * - Operator panel generates piece_session_id on "Start Measurement"
     * - Reuses same ID for all writes of that physical piece
     * - Generates new ID when "Next Piece" is clicked
     * 
     * Database impact:
     * - New unique indexes on (piece_session_id, purchase_order_article_id, size, ...)
     * - Backfill existing rows with UUIDs (one per logical piece key)
     * - Dashboard now queries canonical latest-row-per-piece-session state
     */
    public function up(): void
    {
        // Add piece_session_id to measurement_sessions
        if (!Schema::hasColumn('measurement_sessions', 'piece_session_id')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->char('piece_session_id', 36)->nullable()->after('size')->comment('UUID: unique identifier for this physical piece');
                $table->index('piece_session_id');
            });
        }

        // Add piece_session_id to measurement_results
        if (!Schema::hasColumn('measurement_results', 'piece_session_id')) {
            Schema::table('measurement_results', function (Blueprint $table) {
                $table->char('piece_session_id', 36)->nullable()->after('size')->comment('UUID: unique identifier for this physical piece');
                $table->index('piece_session_id');
            });

            if ($this->indexExists('measurement_results', 'unique_measurement')) {
                Schema::table('measurement_results', function (Blueprint $table) {
                    $table->dropUnique('unique_measurement');
                });
            } elseif ($this->indexExists('measurement_results', 'measurement_results_purchase_order_article_id_measurement_id_size_unique')) {
                Schema::table('measurement_results', function (Blueprint $table) {
                    $table->dropUnique('measurement_results_purchase_order_article_id_measurement_id_size_unique');
                });
            }

            Schema::table('measurement_results', function (Blueprint $table) {
                // Add new unique key including piece_session_id
                $table->unique(['piece_session_id', 'purchase_order_article_id', 'measurement_id', 'size'], 'uq_mr_piece_session');
            });
        }

        // Add piece_session_id to measurement_results_detailed
        if (!Schema::hasColumn('measurement_results_detailed', 'piece_session_id')) {
            Schema::table('measurement_results_detailed', function (Blueprint $table) {
                $table->char('piece_session_id', 36)->nullable()->after('size')->comment('UUID: unique identifier for this physical piece');
                $table->index('piece_session_id');
                // Add new unique key including piece_session_id
                $table->unique(['piece_session_id', 'purchase_order_article_id', 'side', 'measurement_id', 'size'], 'uq_mrd_piece_session');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('measurement_sessions', 'piece_session_id')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->dropIndex(['piece_session_id']);
                $table->dropColumn('piece_session_id');
            });
        }

        if (Schema::hasColumn('measurement_results', 'piece_session_id')) {
            Schema::table('measurement_results', function (Blueprint $table) {
                $table->dropUnique('uq_mr_piece_session');
                $table->dropIndex(['piece_session_id']);
                $table->dropColumn('piece_session_id');
                // Restore old unique key
                $table->unique(['purchase_order_article_id', 'measurement_id', 'size']);
            });
        }

        if (Schema::hasColumn('measurement_results_detailed', 'piece_session_id')) {
            Schema::table('measurement_results_detailed', function (Blueprint $table) {
                $table->dropUnique('uq_mrd_piece_session');
                $table->dropIndex(['piece_session_id']);
                $table->dropColumn('piece_session_id');
            });
        }
    }
};
