<?php

namespace App\GraphQL\Mutations;

use App\Models\Operator;
use Illuminate\Support\Facades\Schema;

class ReactivateOperator
{
    public function __invoke($_, array $args): array
    {
        $operator = Operator::find($args['id']);
        if (!$operator) {
            return [
                'success' => false,
                'message' => 'Operator not found.',
                'count' => 0,
            ];
        }

        if (!Schema::hasColumn('operators', 'is_active')) {
            return [
                'success' => false,
                'message' => 'MIGRATION REQUIRED: is_active column missing from operators table. Run: php artisan migrate',
                'count' => 0,
            ];
        }

        $operator->update(['is_active' => true]);

        return [
            'success' => true,
            'message' => 'Operator reactivated successfully.',
            'count' => 1,
        ];
    }
}
