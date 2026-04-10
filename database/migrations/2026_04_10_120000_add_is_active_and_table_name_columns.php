<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('operators') && !Schema::hasColumn('operators', 'is_active')) {
            Schema::table('operators', function (Blueprint $table) {
                $table->boolean('is_active')->default(true)->after('login_pin');
            });
        }

        if (Schema::hasTable('measurement_sessions') && !Schema::hasColumn('measurement_sessions', 'table_name')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->string('table_name', 50)->nullable()->after('operator_id');
            });
        }

        if (Schema::hasTable('measurement_results') && !Schema::hasColumn('measurement_results', 'table_name')) {
            Schema::table('measurement_results', function (Blueprint $table) {
                $table->string('table_name', 50)->nullable()->after('operator_id');
            });
        }

        if (Schema::hasTable('measurement_results_detailed') && !Schema::hasColumn('measurement_results_detailed', 'table_name')) {
            Schema::table('measurement_results_detailed', function (Blueprint $table) {
                $table->string('table_name', 50)->nullable()->after('operator_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('measurement_results_detailed') && Schema::hasColumn('measurement_results_detailed', 'table_name')) {
            Schema::table('measurement_results_detailed', function (Blueprint $table) {
                $table->dropColumn('table_name');
            });
        }

        if (Schema::hasTable('measurement_results') && Schema::hasColumn('measurement_results', 'table_name')) {
            Schema::table('measurement_results', function (Blueprint $table) {
                $table->dropColumn('table_name');
            });
        }

        if (Schema::hasTable('measurement_sessions') && Schema::hasColumn('measurement_sessions', 'table_name')) {
            Schema::table('measurement_sessions', function (Blueprint $table) {
                $table->dropColumn('table_name');
            });
        }

        if (Schema::hasTable('operators') && Schema::hasColumn('operators', 'is_active')) {
            Schema::table('operators', function (Blueprint $table) {
                $table->dropColumn('is_active');
            });
        }
    }
};
