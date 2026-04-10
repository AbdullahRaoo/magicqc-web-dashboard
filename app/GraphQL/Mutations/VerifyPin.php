<?php

namespace App\GraphQL\Mutations;

use App\Models\Operator;
use Illuminate\Support\Facades\Hash;

class VerifyPin
{
    public function __invoke($_, array $args): array
    {
        $operator = Operator::where('employee_id', $args['employee_id'])->first();

        if (!$operator) {
            return [
                'success' => false,
                'message' => 'Operator not found.',
                'operator' => null,
            ];
        }

        if (
            \Illuminate\Support\Facades\Schema::hasColumn('operators', 'is_active')
            && !$operator->is_active
        ) {
            return [
                'success' => false,
                'message' => 'Operator account is inactive.',
                'operator' => null,
            ];
        }

        // Support both bcrypt-hashed and plain-text PINs
        $storedPin = $operator->login_pin;
        $pinMatch = false;

        if (str_starts_with($storedPin, '$2y$') || str_starts_with($storedPin, '$2a$')) {
            $pinMatch = Hash::check($args['pin'], $storedPin);
        } else {
            $pinMatch = $storedPin === $args['pin'];
        }

        if (!$pinMatch) {
            return [
                'success' => false,
                'message' => 'Invalid PIN.',
                'operator' => null,
            ];
        }

        return [
            'success' => true,
            'message' => 'PIN verified successfully.',
            'operator' => [
                'id' => $operator->id,
                'full_name' => $operator->full_name,
                'employee_id' => $operator->employee_id,
                'department' => $operator->department,
            ],
        ];
    }
}
