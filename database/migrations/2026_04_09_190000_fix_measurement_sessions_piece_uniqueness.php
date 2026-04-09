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

    public function up(): void
    {
        if (!Schema::hasTable('measurement_sessions')) {
            return;
        }

        // MySQL requires an index for FK columns; the legacy unique index may currently
        // be satisfying that requirement. Ensure a replacement index exists first.
        if (!$this->indexExists('measurement_sessions', 'ms_purchase_order_article_idx')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->index(['purchase_order_article_id'], 'ms_purchase_order_article_idx');
            });
        }

        if ($this->indexExists('measurement_sessions', 'ms_poa_size_unique')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->dropUnique('ms_poa_size_unique');
            });
        }

        if ($this->indexExists('measurement_sessions', 'measurement_sessions_purchase_order_article_id_size_unique')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->dropUnique('measurement_sessions_purchase_order_article_id_size_unique');
            });
        }

        if (!$this->indexExists('measurement_sessions', 'uq_ms_piece_session_id')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->unique(['piece_session_id'], 'uq_ms_piece_session_id');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('measurement_sessions')) {
            return;
        }

        if ($this->indexExists('measurement_sessions', 'uq_ms_piece_session_id')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->dropUnique('uq_ms_piece_session_id');
            });
        }

        if (!$this->indexExists('measurement_sessions', 'ms_poa_size_unique')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->unique(['purchase_order_article_id', 'size'], 'ms_poa_size_unique');
            });
        }

        if ($this->indexExists('measurement_sessions', 'ms_purchase_order_article_idx')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->dropIndex('ms_purchase_order_article_idx');
            });
        }
    }
};
