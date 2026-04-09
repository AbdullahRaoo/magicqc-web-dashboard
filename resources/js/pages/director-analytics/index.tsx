import { Head, router, usePage } from '@inertiajs/react';
import { type SharedData, type BreadcrumbItem } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useState, useMemo, useCallback } from 'react';
import {
    BarChart3,
    Users,
    Package,
    ClipboardList,
    Filter,
    RefreshCw,
    Activity,
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Search,
} from 'lucide-react';

// Types for the analytics data
interface SummaryStats {
    total: number;
    pass: number;
    fail: number;
    passRate: number;
    failRate: number;
}

interface PieceArticleSummaryItem {
    article_style: string;
    brand_name: string;
    article_type_id?: number;
    article_type_name?: string;
    size?: string;
    total_pieces: number;
    completed_pieces: number;
    in_progress_pieces: number;
    pass_pieces: number;
    fail_pieces: number;
    pending_pieces: number;
    front_complete_pieces: number;
    back_complete_pieces: number;
    completion_rate: number;
    pass_rate: number;
}

interface PieceAnalyticsOverview {
    total_pieces: number;
    completed_pieces: number;
    in_progress_pieces: number;
    front_complete_pieces: number;
    back_complete_pieces: number;
    pass_pieces: number;
    fail_pieces: number;
    pending_pieces: number;
    completion_rate: number;
    pass_rate: number;
    front_completion_rate: number;
    back_completion_rate: number;
}

interface PieceAnalytics {
    overview: PieceAnalyticsOverview;
    byArticle: PieceArticleSummaryItem[];
}

interface QcHistoryItem {
    piece_session_id: string;
    piece_result: string;
    measurements_passed: number;
    measurements_failed: number;
    total_measurements: number;
    article_style: string;
    brand_name: string;
    article_type_id?: number;
    article_type_name?: string;
    size?: string;
    operator_name?: string;
    employee_id?: string;
    status?: string;
    created_at?: string;
    updated_at?: string;
}

interface OperatorPerformanceItem {
    operator_name: string;
    employee_id: string;
    total: number;
    pass: number;
    fail: number;
}

interface FilterOptions {
    brands: { id: number; name: string }[];
    articleTypes?: { id: number; name: string }[];
    articleStyles: string[];
    sizes?: string[];
    operators: { id: number; full_name: string; employee_id: string }[];
}

interface AppliedFilters {
    brand_id: string | null;
    article_type_id?: string | null;
    article_style: string | null;
    size?: string | null;
    operator_id: string | null;
    date_from: string | null;
    date_to: string | null;
    result: string | null;
}

interface ParameterFailure {
    parameter: string;
    label: string;
    times_checked: number;
    times_failed: number;
    failure_rate: number;
    avg_deviation: number;
}

interface ArticleFailure {
    article_style: string;
    total_measurement_failures: number;
    unique_params_failing: number;
    most_common_failure: string;
    most_common_failure_count: number;
    failing_params: { parameter: string; count: number }[];
}

interface ToleranceConcentration {
    parameter: string;
    label: string;
    violation_count: number;
    avg_deviation: number;
    max_deviation: number;
    over_tolerance_pct: number;
    under_tolerance_pct: number;
}

interface FailureAnalysis {
    parameterFailures: ParameterFailure[];
    articleFailures: ArticleFailure[];
    toleranceConcentration: ToleranceConcentration[];
    totalViolations: number;
}

interface Props {
    summary: SummaryStats;
    pieceAnalytics: PieceAnalytics;
    qcHistory: QcHistoryItem[];
    operatorPerformance: OperatorPerformanceItem[];
    failureAnalysis: FailureAnalysis;
    filterOptions: FilterOptions;
    appliedFilters: AppliedFilters;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Analytics Dashboard', href: '/analytics-dashboard' },
];

// Reusable progress bar component
function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${colorClass}`}
                style={{ width: `${percentage}%` }}
            />
        </div>
    );
}

// Radial gauge component for pass rate
function RadialGauge({ value, size = 120, strokeWidth = 10 }: { value: number; size?: number; strokeWidth?: number }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    const color = value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444';

    return (
        <div className="relative inline-flex items-center justify-center">
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-slate-100 dark:text-slate-700"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}%</span>
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Pass Rate</span>
            </div>
        </div>
    );
}

export default function DirectorAnalyticsDashboard({
    summary,
    pieceAnalytics,
    qcHistory,
    operatorPerformance,
    failureAnalysis,
    filterOptions,
    appliedFilters,
}: Props) {
    const { authUsername } = usePage<SharedData>().props;

    // Local filter state
    const [filters, setFilters] = useState({
        brand_id: appliedFilters.brand_id || '',
        article_type_id: appliedFilters.article_type_id || '',
        article_style: appliedFilters.article_style || '',
        size: appliedFilters.size || '',
        operator_id: appliedFilters.operator_id || '',
        date_from: appliedFilters.date_from || '',
        date_to: appliedFilters.date_to || '',
        result: appliedFilters.result || '',
        side: (appliedFilters as any).side || '',
    });

    const [showFilters, setShowFilters] = useState(false);
    const [operatorSearch, setOperatorSearch] = useState('');

    // Check if any filters are applied
    const hasActiveFilters = useMemo(() => {
        return Object.values(filters).some(v => v !== '');
    }, [filters]);

    // Apply filters via Inertia visit
    const applyFilters = useCallback(() => {
        const cleanFilters: Record<string, string> = {};
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== '') cleanFilters[key] = value;
        });

        router.get('/analytics-dashboard', cleanFilters, {
            preserveState: true,
            preserveScroll: true,
        });
    }, [filters]);

    // Reset filters
    const resetFilters = useCallback(() => {
        setFilters({
            brand_id: '',
            article_type_id: '',
            article_style: '',
            size: '',
            operator_id: '',
            date_from: '',
            date_to: '',
            result: '',
            side: '',
        });
        router.get('/analytics-dashboard', {}, {
            preserveState: true,
            preserveScroll: true,
        });
    }, []);

    // Filter operator performance by search
    const filteredOperators = useMemo(() => {
        if (!operatorSearch) return operatorPerformance;
        const q = operatorSearch.toLowerCase();
        return operatorPerformance.filter(
            o => o.operator_name.toLowerCase().includes(q) || o.employee_id.toLowerCase().includes(q)
        );
    }, [operatorPerformance, operatorSearch]);

    const maxOperatorTotal = useMemo(() => Math.max(...operatorPerformance.map(o => o.total), 1), [operatorPerformance]);
    const pieceOverview = pieceAnalytics.overview;

    const completedArticleStyles = useMemo(() => {
        const styles = new Set(
            pieceAnalytics.byArticle
                .filter((row) => row.completed_pieces > 0)
                .map((row) => row.article_style)
        );
        return styles.size;
    }, [pieceAnalytics.byArticle]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Analytics Dashboard" />

            <div className="flex h-full flex-1 flex-col gap-6 p-6">
                {/* Header Section */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#6C88C4] via-[#8A9BA7] to-[#6C88C4] p-8 shadow-lg">
                    <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl" />
                    <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
                    <div className="absolute right-20 bottom-0 h-24 w-24 rounded-full bg-sky-400/10 blur-xl" />

                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex-1">
                            <h1 className="text-4xl font-bold tracking-tight text-white">
                                Analytics Dashboard
                            </h1>
                            <p className="mt-2 text-lg text-white/70">
                                Piece-level QC performance and compliance insights
                            </p>
                        </div>
                        <div className="hidden md:flex items-center gap-3">
                            <RadialGauge value={summary.passRate} />
                        </div>
                    </div>
                </div>

                {/* Filter Section */}
                <Card className="border-border/50 shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                                    <ClipboardList className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Piece QC Overview</h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Piece-level pass, fail, and completion metrics</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.location.reload()}
                                    className="text-xs border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-600 dark:text-sky-400 dark:hover:bg-sky-900/20"
                                >
                                    <RefreshCw className="mr-1 h-3 w-3" />
                                    Refresh Data
                                </Button>
                                {hasActiveFilters && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={resetFilters}
                                        className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/20"
                                    >
                                        <RefreshCw className="mr-1 h-3 w-3" />
                                        Reset
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowFilters(!showFilters)}
                                    className="text-xs"
                                >
                                    {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    {showFilters && (
                        <CardContent className="pt-0">
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Brand</Label>
                                    <select
                                        value={filters.brand_id}
                                        onChange={(e) => setFilters({ ...filters, brand_id: e.target.value })}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All Brands</option>
                                        {filterOptions.brands.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Article Type</Label>
                                    <select
                                        value={filters.article_type_id}
                                        onChange={(e) => setFilters({ ...filters, article_type_id: e.target.value })}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All Types</option>
                                        {(filterOptions.articleTypes || []).map((type) => (
                                            <option key={type.id} value={type.id}>{type.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Article Style</Label>
                                    <select
                                        value={filters.article_style}
                                        onChange={(e) => setFilters({ ...filters, article_style: e.target.value })}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All Articles</option>
                                        {filterOptions.articleStyles.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Size</Label>
                                    <select
                                        value={filters.size}
                                        onChange={(e) => setFilters({ ...filters, size: e.target.value })}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All Sizes</option>
                                        {(filterOptions.sizes || []).map((size) => (
                                            <option key={size} value={size}>{size}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Operator</Label>
                                    <select
                                        value={filters.operator_id}
                                        onChange={(e) => setFilters({ ...filters, operator_id: e.target.value })}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All Operators</option>
                                        {filterOptions.operators.map((o) => (
                                            <option key={o.id} value={o.id}>
                                                {o.full_name} ({o.employee_id})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Date From</Label>
                                    <Input
                                        type="date"
                                        value={filters.date_from}
                                        onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                                        className="h-9 text-sm"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Date To</Label>
                                    <Input
                                        type="date"
                                        value={filters.date_to}
                                        onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                                        className="h-9 text-sm"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Status</Label>
                                    <select
                                        value={filters.result}
                                        onChange={(e) => setFilters({ ...filters, result: e.target.value })}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All Results</option>
                                        <option value="pass">Pass Only</option>
                                        <option value="fail">Fail Only</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-slate-600">Side</Label>
                                    <select
                                        value={filters.side}
                                        onChange={(e) => setFilters({ ...filters, side: e.target.value })}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All Sides</option>
                                        <option value="front">Front</option>
                                        <option value="back">Back</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mt-4 flex justify-end">
                                <Button
                                    onClick={applyFilters}
                                    className="bg-gradient-to-r from-slate-600 to-slate-700 text-white hover:from-slate-700 hover:to-slate-800 shadow-md"
                                >
                                    <Filter className="mr-2 h-4 w-4" />
                                    Apply Filters
                                </Button>
                            </div>
                        </CardContent>
                    )}
                </Card>

                {/* Piece QC Overview */}
                <Card className="border-border/50 shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                                    <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">Piece QC Overview</CardTitle>
                                    <CardDescription className="text-sm">Bulk QC counts by piece and article</CardDescription>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Card className="border-emerald-200 dark:border-emerald-900 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-emerald-700 dark:text-emerald-400">Total Pieces Done</div>
                                    <div className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-300">{pieceOverview.completed_pieces.toLocaleString()}</div>
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Completed out of {pieceOverview.total_pieces.toLocaleString()} started</div>
                                </CardContent>
                            </Card>
                            <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-slate-600 dark:text-slate-300">Total Articles Done</div>
                                    <div className="mt-1 text-3xl font-bold text-slate-800 dark:text-white">{completedArticleStyles.toLocaleString()}</div>
                                    <div className="text-xs text-slate-500 mt-1">Unique article styles with completed pieces</div>
                                </CardContent>
                            </Card>
                            <Card className="border-sky-200 dark:border-sky-900 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-sky-700 dark:text-sky-400">Pieces Passed</div>
                                    <div className="mt-1 text-3xl font-bold text-sky-700 dark:text-sky-300">{pieceOverview.pass_pieces.toLocaleString()}</div>
                                    <div className="text-xs text-sky-600 dark:text-sky-400 mt-1">{pieceOverview.pass_rate}% piece pass rate</div>
                                </CardContent>
                            </Card>
                            <Card className="border-rose-200 dark:border-rose-900 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-rose-700 dark:text-rose-400">Pieces Failed</div>
                                    <div className="mt-1 text-3xl font-bold text-rose-700 dark:text-rose-300">{pieceOverview.fail_pieces.toLocaleString()}</div>
                                    <div className="text-xs text-rose-600 dark:text-rose-400 mt-1">Requires investigation / rework</div>
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                </Card>

                {/* QC History & Operator-wise Analytics */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* QC History */}
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{backgroundColor: '#FFCD73'}}>
                                        <Package className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">QC history</CardTitle>
                                        <CardDescription className="text-sm">{qcHistory.length} piece entries shown</CardDescription>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
                                {qcHistory.length === 0 ? (
                                    <p className="text-center text-sm text-slate-400 py-8">No QC history available</p>
                                ) : (
                                    qcHistory.map((piece, idx) => {
                                        const passed = piece.measurements_passed;
                                        const failed = piece.measurements_failed;
                                        const total = piece.total_measurements || (passed + failed);
                                        const passRate = total > 0 ? (passed / total) * 100 : 0;
                                        const isPass = piece.piece_result === 'PASS';
                                        return (
                                            <div
                                                key={`${piece.piece_session_id}-${idx}`}
                                                className="rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                            >
                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                                                                {piece.article_style}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${isPass ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>
                                                                {piece.piece_result}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600">{piece.brand_name}</span>
                                                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">{[piece.article_type_name, piece.size].filter(Boolean).join(' • ')}</span>
                                                            {piece.employee_id && (
                                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">Op: {piece.employee_id}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-500 flex-shrink-0">
                                                        {total} measurements
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 mb-2">
                                                    <div className="text-center rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{passed}</div>
                                                        <div className="text-[9px] text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">Passed</div>
                                                    </div>
                                                    <div className="text-center rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                        <div className="text-xs font-bold text-rose-700 dark:text-rose-400">{failed}</div>
                                                        <div className="text-[9px] text-rose-600 dark:text-rose-500 uppercase tracking-wider">Failed</div>
                                                    </div>
                                                    <div className="text-center rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{passRate.toFixed(1)}%</div>
                                                        <div className="text-[9px] text-slate-500 uppercase tracking-wider">Pass Rate</div>
                                                    </div>
                                                </div>

                                                <div className="relative h-2 w-full rounded-full bg-rose-200 dark:bg-rose-900/30 overflow-hidden">
                                                    <div
                                                        className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${isPass ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                        style={{ width: `${Math.min(passRate, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Operator-wise Performance Analytics */}
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{backgroundColor: '#6C88C4'}}>
                                        <Users className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Operators' Usage Summary</CardTitle>
                                        <CardDescription className="text-sm">{operatorPerformance.length} operators tracked</CardDescription>
                                    </div>
                                </div>
                            </div>
                            <div className="relative mt-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Search operators..."
                                    value={operatorSearch}
                                    onChange={(e) => setOperatorSearch(e.target.value)}
                                    className="h-10 pl-9 text-sm"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
                                {filteredOperators.length === 0 ? (
                                    <p className="text-center text-sm text-slate-400 py-8">No operator data available</p>
                                ) : (
                                    filteredOperators.map((operator, idx) => {
                                        const passRate = operator.total > 0 ? ((operator.pass / operator.total) * 100) : 0;
                                        return (
                                            <div
                                                key={`${operator.employee_id}-${idx}`}
                                                className="rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-600 text-xs font-bold text-white shadow-sm">
                                                            {operator.operator_name?.charAt(0)?.toUpperCase() || '?'}
                                                        </div>
                                                        <div>
                                                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 block">
                                                                {operator.operator_name}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500">
                                                                ID: {operator.employee_id}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-500">
                                                        {operator.total} inspections
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 mb-2">
                                                    <div className="text-center rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{operator.total}</div>
                                                        <div className="text-[9px] text-slate-500 uppercase tracking-wider">Total</div>
                                                    </div>
                                                    <div className="text-center rounded-md bg-emerald-50 dark:bg-emerald-900/20 p-1.5 border border-emerald-100 dark:border-emerald-800/30">
                                                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{operator.pass}</div>
                                                        <div className="text-[9px] text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">Pass</div>
                                                    </div>
                                                    <div className="text-center rounded-md bg-rose-50 dark:bg-rose-900/20 p-1.5 border border-rose-100 dark:border-rose-800/30">
                                                        <div className="text-xs font-bold text-rose-700 dark:text-rose-400">{operator.fail}</div>
                                                        <div className="text-[9px] text-rose-600 dark:text-rose-500 uppercase tracking-wider">Fail</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <div className="relative h-2 flex-1 rounded-full bg-rose-200 dark:bg-rose-900/30 overflow-hidden">
                                                        <div
                                                            className="absolute left-0 top-0 h-full rounded-full bg-emerald-500 transition-all duration-700"
                                                            style={{ width: `${passRate}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-xs font-semibold min-w-[40px] text-right ${passRate >= 80 ? 'text-emerald-600' : passRate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                        {passRate.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </AppLayout>
    );
}
