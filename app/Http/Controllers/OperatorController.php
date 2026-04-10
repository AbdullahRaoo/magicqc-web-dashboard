<?php

namespace App\Http\Controllers;

use App\Models\Operator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class OperatorController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): Response
    {
        $query = Operator::query();

        if (Schema::hasColumn('operators', 'is_active')) {
            $query->orderByDesc('is_active');
        }

        $operators = $query->latest()->paginate(15);

        return Inertia::render('operators/index', [
            'operators' => $operators,
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): Response
    {
        return Inertia::render('operators/create');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:255'],
            'employee_id' => ['required', 'string', 'max:255', 'unique:operators,employee_id'],
            'department' => ['nullable', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:20'],
            'login_pin' => ['required', 'regex:/^\d{4}$/'],
        ], [
            'full_name.required' => 'Full name is required.',
            'employee_id.required' => 'Employee ID is required.',
            'employee_id.unique' => 'This employee ID already exists.',
            'login_pin.required' => 'Login PIN is required.',
            'login_pin.regex' => 'Login PIN must be exactly 4 digits.',
        ]);

        $payload = [
            'full_name' => $validated['full_name'],
            'employee_id' => $validated['employee_id'],
            'department' => $validated['department'] ?? null,
            'contact_number' => $validated['contact_number'] ?? null,
            'login_pin' => Hash::make($validated['login_pin']),
        ];

        if (Schema::hasColumn('operators', 'is_active')) {
            $payload['is_active'] = true;
        }

        Operator::create($payload);

        return redirect()->route('operators.index')
            ->with('success', 'Operator created successfully.');
    }

    /**
     * Display the specified resource.
     */
    public function show(Operator $operator): Response
    {
        return Inertia::render('operators/show', [
            'operator' => $operator,
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Operator $operator): Response
    {
        return Inertia::render('operators/edit', [
            'operator' => $operator,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Operator $operator): RedirectResponse
    {
        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:255'],
            'employee_id' => ['required', 'string', 'max:255', 'unique:operators,employee_id,'.$operator->id],
            'department' => ['nullable', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:20'],
        ], [
            'full_name.required' => 'Full name is required.',
            'employee_id.required' => 'Employee ID is required.',
            'employee_id.unique' => 'This employee ID already exists.',
        ]);

        try {
            $updateData = [
                'full_name' => $validated['full_name'],
                'employee_id' => $validated['employee_id'],
                'department' => $validated['department'] ?? null,
                'contact_number' => $validated['contact_number'] ?? null,
            ];

            $operator->update($updateData);

            return redirect()->route('operators.index')
                ->with('success', 'Operator updated successfully.');
        } catch (\Exception $e) {
            Log::error('Failed to update operator', [
                'operator_id' => $operator->id,
                'error' => $e->getMessage(),
            ]);

            return redirect()->back()
                ->withInput()
                ->with('error', 'Failed to update operator. Please try again.');
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Operator $operator): RedirectResponse
    {
        return $this->deactivate($operator);
    }

    public function resetPin(Request $request, Operator $operator): RedirectResponse
    {
        $validated = $request->validate([
            'new_pin' => ['required', 'regex:/^\d{4}$/'],
        ], [
            'new_pin.required' => 'New PIN is required.',
            'new_pin.regex' => 'New PIN must be exactly 4 digits.',
        ]);

        try {
            $operator->update([
                'login_pin' => Hash::make($validated['new_pin']),
            ]);

            return redirect()->route('operators.index')
                ->with('success', 'Operator PIN reset successfully.');
        } catch (\Exception $e) {
            Log::error('Failed to reset operator PIN', [
                'operator_id' => $operator->id,
                'error' => $e->getMessage(),
            ]);

            return redirect()->back()
                ->with('error', 'Failed to reset operator PIN. Please try again.');
        }
    }

    public function deactivate(Operator $operator): RedirectResponse
    {
        if (!Schema::hasColumn('operators', 'is_active')) {
            return redirect()->route('operators.index')
                ->with('error', 'Migration required: is_active column is missing.');
        }

        try {
            $operator->update(['is_active' => false]);

            return redirect()->route('operators.index')
                ->with('success', 'Operator deactivated successfully.');
        } catch (\Exception $e) {
            Log::error('Failed to deactivate operator', [
                'operator_id' => $operator->id,
                'error' => $e->getMessage(),
            ]);

            return redirect()->route('operators.index')
                ->with('error', 'Failed to deactivate operator. Please try again.');
        }
    }

    public function reactivate(Operator $operator): RedirectResponse
    {
        if (!Schema::hasColumn('operators', 'is_active')) {
            return redirect()->route('operators.index')
                ->with('error', 'Migration required: is_active column is missing.');
        }

        try {
            $operator->update(['is_active' => true]);

            return redirect()->route('operators.index')
                ->with('success', 'Operator reactivated successfully.');
        } catch (\Exception $e) {
            Log::error('Failed to reactivate operator', [
                'operator_id' => $operator->id,
                'error' => $e->getMessage(),
            ]);

            return redirect()->route('operators.index')
                ->with('error', 'Failed to reactivate operator. Please try again.');
        }
    }
}
