<?php

namespace App\GraphQL\Mutations;

use App\Models\Operator;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class ResetOperatorPin
{
    public function __invoke($_, array $args): array
    {
        $validator = Validator::make($args, [
            'id' => ['required', 'integer', 'exists:operators,id'],
            'new_pin' => ['required', 'regex:/^\d{4}$/'],
        ]);

        if ($validator->fails()) {
            return [
                'success' => false,
                'message' => $validator->errors()->first(),
                'count' => 0,
            ];
        }

        $operator = Operator::find($args['id']);
        if (!$operator) {
            return [
                'success' => false,
                'message' => 'Operator not found.',
                'count' => 0,
            ];
        }

        $operator->update([
            'login_pin' => Hash::make($args['new_pin']),
        ]);

        return [
            'success' => true,
            'message' => 'Operator PIN reset successfully.',
            'count' => 1,
        ];
    }
}
