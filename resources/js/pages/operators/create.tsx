import { store } from '@/actions/App/Http/Controllers/OperatorController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import operatorRoutes from '@/routes/operators';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Operators',
        href: operatorRoutes.index().url,
    },
    {
        title: 'Add Operator',
        href: operatorRoutes.create().url,
    },
];

export default function Create() {
    const { data, setData, post, processing, errors, reset } = useForm({
        full_name: '',
        employee_id: '',
        department: '',
        contact_number: '',
        login_pin: '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(store().url, {
            preserveScroll: true,
            onSuccess: () => {
                console.log('Operator created successfully');
                reset();
            },
            onError: (errors) => {
                console.error('Validation errors:', errors);
            },
            onFinish: () => {
                console.log('Form submission finished');
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Add New Operator" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div>
                    <h1 className="text-2xl font-semibold">Add New Operator</h1>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Fill in the details to add a new operator
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

                            <div className="grid gap-2">
                                <Label htmlFor="login_pin">Login PIN *</Label>
                                <Input
                                    id="login_pin"
                                    type="password"
                                    value={data.login_pin}
                                    onChange={(e) => setData('login_pin', e.target.value)}
                                    required
                                    minLength={4}
                                    maxLength={4}
                                    inputMode="numeric"
                                />
                                <InputError message={errors.login_pin} />
                                <p className="text-xs text-neutral-500">
                                    PIN must be exactly 4 digits
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Creating...' : 'Add Operator'}
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
            </div>
        </AppLayout>
    );
}

