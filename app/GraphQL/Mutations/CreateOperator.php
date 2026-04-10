<?php

namespace App\GraphQL\Mutations;

use App\Models\Operator;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class CreateOperator
{
    public function __invoke($_, array $args): array
    {
        $validator = Validator::make($args, [
            'full_name' => ['required', 'string', 'max:255'],
            'employee_id' => ['required', 'string', 'max:255', 'unique:operators,employee_id'],
            'department' => ['nullable', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:20'],
            'login_pin' => ['required', 'regex:/^\d{4}$/'],
        ]);

        if ($validator->fails()) {
            return [
                'success' => false,
                'message' => $validator->errors()->first(),
                'operator' => null,
            ];
        }

        $payload = [
            'full_name' => $args['full_name'],
            'employee_id' => $args['employee_id'],
            'department' => $args['department'] ?? null,
            'contact_number' => $args['contact_number'] ?? null,
            'login_pin' => Hash::make($args['login_pin']),
        ];

        if (Schema::hasColumn('operators', 'is_active')) {
            $payload['is_active'] = true;
        }

        $operator = Operator::create($payload);

        return [
            'success' => true,
            'message' => 'Operator created successfully.',
            'operator' => $operator,
        ];
    }
}
