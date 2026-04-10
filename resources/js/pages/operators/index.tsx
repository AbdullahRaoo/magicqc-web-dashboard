import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import operatorRoutes from '@/routes/operators';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Plus, Eye, Pencil, UserCheck, UserX } from 'lucide-react';
import { type PaginatedData } from '@/types';

interface Operator {
    id: number;
    full_name: string;
    employee_id: string;
    department: string | null;
    contact_number: string | null;
    is_active?: boolean;
    created_at: string;
    updated_at: string;
}

interface Props {
    operators: PaginatedData<Operator>;
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Operators',
        href: operatorRoutes.index().url,
    },
];

export default function Index({ operators }: Props) {
    const handleDeactivate = (operator: Operator) => {
        if (!window.confirm(`Deactivate operator "${operator.full_name}"?`)) {
            return;
        }

        router.put(`/operators/${operator.id}/deactivate`);
    };

    const handleReactivate = (operator: Operator) => {
        if (!window.confirm(`Reactivate operator "${operator.full_name}"?`)) {
            return;
        }

        router.put(`/operators/${operator.id}/reactivate`);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Operators" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Operators</h1>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                            Manage your operators
                        </p>
                    </div>
                    <Link href={operatorRoutes.create().url}>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Operator
                        </Button>
                    </Link>
                </div>

                <div className="rounded-lg border border-sidebar-border bg-white dark:bg-neutral-900">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Full Name</TableHead>
                                <TableHead>Employee ID</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {operators.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-neutral-500">
                                        No operators found. Create your first one!
                                    </TableCell>
                                </TableRow>
                            ) : (
                                operators.data.map((operator) => (
                                    <TableRow key={operator.id}>
                                        <TableCell className="font-medium">{operator.full_name}</TableCell>
                                        <TableCell>{operator.employee_id}</TableCell>
                                        <TableCell>{operator.department || 'N/A'}</TableCell>
                                        <TableCell>
                                            {operator.is_active === false ? (
                                                <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                                    Inactive
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                                    Active
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Link href={operatorRoutes.show(operator.id).url}>
                                                    <Button variant="outline" size="sm">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <Link href={operatorRoutes.edit(operator.id).url}>
                                                    <Button variant="outline" size="sm">
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                {operator.is_active === false ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleReactivate(operator)}
                                                        title="Reactivate"
                                                    >
                                                        <UserCheck className="h-4 w-4 text-green-600" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleDeactivate(operator)}
                                                        title="Deactivate"
                                                    >
                                                        <UserX className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {operators.links && operators.links.length > 3 && (
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                            Showing {operators.from} to {operators.to} of {operators.total} results
                        </div>
                        <div className="flex gap-2">
                            {operators.links.map((link, index) => (
                                <Link
                                    key={index}
                                    href={link.url || '#'}
                                    className={`rounded px-3 py-1 text-sm ${link.active
                                            ? 'bg-sidebar-primary text-white'
                                            : 'bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                                        } ${!link.url ? 'pointer-events-none opacity-50' : ''}`}
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

