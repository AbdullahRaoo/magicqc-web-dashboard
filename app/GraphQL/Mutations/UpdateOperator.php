<?php

namespace App\GraphQL\Mutations;

use App\Models\Operator;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class UpdateOperator
{
    public function __invoke($_, array $args): array
    {
        $operator = Operator::find($args['id']);

        if (!$operator) {
            return [
                'success' => false,
                'message' => 'Operator not found.',
                'operator' => null,
            ];
        }

        $validator = Validator::make($args, [
            'id' => ['required', 'integer', 'exists:operators,id'],
            'full_name' => ['nullable', 'string', 'max:255'],
            'employee_id' => ['nullable', 'string', 'max:255', Rule::unique('operators', 'employee_id')->ignore($operator->id)],
            'department' => ['nullable', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:20'],
        ]);

        if ($validator->fails()) {
            return [
                'success' => false,
                'message' => $validator->errors()->first(),
                'operator' => null,
            ];
        }

        $updateData = [];
        foreach (['full_name', 'employee_id', 'department', 'contact_number'] as $field) {
            if (array_key_exists($field, $args)) {
                $updateData[$field] = $args[$field];
            }
        }

        if (empty($updateData)) {
            return [
                'success' => false,
                'message' => 'No fields provided to update.',
                'operator' => null,
            ];
        }

        $operator->update($updateData);

        return [
            'success' => true,
            'message' => 'Operator updated successfully.',
            'operator' => $operator->fresh(),
        ];
    }
}
