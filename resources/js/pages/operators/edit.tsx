import { update } from '@/actions/App/Http/Controllers/OperatorController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import operatorRoutes from '@/routes/operators';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';

interface Operator {
    id: number;
    full_name: string;
    employee_id: string;
    department: string | null;
    contact_number: string | null;
    created_at: string;
    updated_at: string;
}

interface Props {
    operator: Operator;
}

export default function Edit({ operator }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        full_name: operator.full_name,
        employee_id: operator.employee_id,
        department: operator.department || '',
        contact_number: operator.contact_number || '',
    });
    const [newPin, setNewPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [pinProcessing, setPinProcessing] = useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Operators',
            href: operatorRoutes.index().url,
        },
        {
            title: 'Edit Operator',
            href: operatorRoutes.edit(operator.id).url,
        },
    ];

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put(update(operator.id).url, {
            preserveScroll: true,
        });
    };

    const resetPin = (e: React.FormEvent) => {
        e.preventDefault();

        if (!/^\d{4}$/.test(newPin)) {
            setPinError('PIN must be exactly 4 digits.');
            return;
        }

        setPinError('');
        setPinProcessing(true);

        router.put(
            `/operators/${operator.id}/reset-pin`,
            { new_pin: newPin },
            {
                preserveScroll: true,
                onSuccess: () => setNewPin(''),
                onError: (serverErrors) => {
                    setPinError(serverErrors.new_pin || 'Failed to reset PIN.');
                },
                onFinish: () => setPinProcessing(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Edit Operator" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div>
                    <h1 className="text-2xl font-semibold">Edit Operator</h1>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Update the operator details
                    </p>
                </div>

                <form onSubmit={submit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Operator Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="full_name">Full Name *</Label>
                                <Input
                                    id="full_name"
                                    value={data.full_name}
                                    onChange={(e) => setData('full_name', e.target.value)}
                                    required
                                />
                                <InputError message={errors.full_name} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="employee_id">Employee ID *</Label>
                                <Input
                                    id="employee_id"
                                    value={data.employee_id}
                                    onChange={(e) => setData('employee_id', e.target.value)}
                                    required
                                />
                                <InputError message={errors.employee_id} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="department">Department</Label>
                                <Input
                                    id="department"
                                    value={data.department}
                                    onChange={(e) => setData('department', e.target.value)}
                                />
                                <InputError message={errors.department} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="contact_number">Contact Number</Label>
                                <Input
                                    id="contact_number"
                                    value={data.contact_number}
                                    onChange={(e) => setData('contact_number', e.target.value)}
                                    placeholder="e.g. +1234567890"
                                />
                                <InputError message={errors.contact_number} />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Updating...' : 'Update Operator'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.visit(operatorRoutes.index().url)}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>

                <form onSubmit={resetPin} className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reset PIN</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="new_pin">New PIN *</Label>
                                <Input
                                    id="new_pin"
                                    type="password"
                                    value={newPin}
                                    onChange={(e) => setNewPin(e.target.value)}
                                    minLength={4}
                                    maxLength={4}
                                    inputMode="numeric"
                                    required
                                />
                                {pinError ? <p className="text-sm text-red-600">{pinError}</p> : null}
                                <p className="text-xs text-neutral-500">PIN must be exactly 4 digits.</p>
                            </div>

                            <div className="flex items-center gap-4">
                                <Button type="submit" disabled={pinProcessing}>
                                    {pinProcessing ? 'Resetting...' : 'Reset PIN'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>
            </div>
        </AppLayout>
    );
}

