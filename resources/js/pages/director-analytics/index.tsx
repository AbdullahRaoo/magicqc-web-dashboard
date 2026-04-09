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
    TrendingUp,
    TrendingDown,
    CheckCircle2,
    XCircle,
    ClipboardList,
    Users,
    Package,
    FileDown,
    FileSpreadsheet,
    Filter,
    RefreshCw,
    Activity,
    Target,
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Download,
    Search,
    AlertTriangle,
    Crosshair,
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

interface ArticleSummaryItem {
    article_style: string;
    brand_name: string;
    article_type_id?: number;
    article_type_name?: string;
    size?: string;
    total: number;
    pass: number;
    fail: number;
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
    articleSummary: ArticleSummaryItem[];
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
    articleSummary,
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
    const [articleSearch, setArticleSearch] = useState('');
    const [pieceSearch, setPieceSearch] = useState('');
    const [operatorSearch, setOperatorSearch] = useState('');
    const [reportType, setReportType] = useState<'all' | 'measurement' | 'article' | 'operator'>('all');

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

    // Export handlers
    const exportExcel = () => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.append(key, value);
        });
        params.append('report_type', reportType);
        window.location.href = `/analytics-dashboard/export/excel?${params.toString()}`;
    };

    const exportPdf = () => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.append(key, value);
        });
        params.append('report_type', reportType);
        window.location.href = `/analytics-dashboard/export/pdf?${params.toString()}`;
    };

    // Filter article summary by search
    const filteredArticles = useMemo(() => {
        if (!articleSearch) return articleSummary;
        const q = articleSearch.toLowerCase();
        return articleSummary.filter(
            a =>
                a.article_style.toLowerCase().includes(q) ||
                a.brand_name.toLowerCase().includes(q) ||
                (a.article_type_name || '').toLowerCase().includes(q) ||
                (a.size || '').toLowerCase().includes(q)
        );
    }, [articleSummary, articleSearch]);

    const filteredPieceArticles = useMemo(() => {
        if (!pieceSearch) return pieceAnalytics.byArticle;
        const q = pieceSearch.toLowerCase();
        return pieceAnalytics.byArticle.filter(
            p =>
                p.article_style.toLowerCase().includes(q) ||
                p.brand_name.toLowerCase().includes(q) ||
                (p.article_type_name || '').toLowerCase().includes(q) ||
                (p.size || '').toLowerCase().includes(q)
        );
    }, [pieceAnalytics.byArticle, pieceSearch]);

    // Filter operator performance by search
    const filteredOperators = useMemo(() => {
        if (!operatorSearch) return operatorPerformance;
        const q = operatorSearch.toLowerCase();
        return operatorPerformance.filter(
            o => o.operator_name.toLowerCase().includes(q) || o.employee_id.toLowerCase().includes(q)
        );
    }, [operatorPerformance, operatorSearch]);

    // Max values for progress bar scaling
    const maxArticleTotal = useMemo(() => Math.max(...articleSummary.map(a => a.total), 1), [articleSummary]);
    const maxOperatorTotal = useMemo(() => Math.max(...operatorPerformance.map(o => o.total), 1), [operatorPerformance]);
    const maxPieceTotal = useMemo(() => Math.max(...pieceAnalytics.byArticle.map(p => p.total_pieces), 1), [pieceAnalytics.byArticle]);
    const pieceOverview = pieceAnalytics.overview;

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
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                                    <Filter className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">Filters</CardTitle>
                                    {hasActiveFilters && (
                                        <p className="text-sm font-medium" style={{color: '#6C88C4'}}>Filters active</p>
                                    )}
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
                                        className="text-xs"
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

                {/* Summary KPI Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* Total Parameter Checks */}
                    <Card className="group relative overflow-hidden border shadow-md border-slate-200 dark:border-slate-700 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900" />
                        <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium text-slate-700 dark:text-slate-300">Total Parameter Checks</CardTitle>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-700 shadow-sm">
                                <ClipboardList className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                            </div>
                        </CardHeader>
                        <CardContent className="relative z-10">
                            <div className="text-4xl font-bold text-slate-800 dark:text-white">{summary.total.toLocaleString()}</div>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Measurement points analyzed</p>
                        </CardContent>
                        <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-slate-200/50 dark:bg-slate-600/20 blur-xl" />
                    </Card>

                    {/* Total Pass */}
                    <Card className="group relative overflow-hidden border shadow-md border-emerald-100 dark:border-emerald-900 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900" />
                        <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium text-emerald-800 dark:text-emerald-300">Total Pass</CardTitle>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-emerald-800 shadow-sm">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                        </CardHeader>
                        <CardContent className="relative z-10">
                            <div className="text-4xl font-bold text-emerald-700 dark:text-emerald-300">{summary.pass.toLocaleString()}</div>
                            <div className="mt-1 flex items-center gap-1.5">
                                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                <p className="text-sm text-emerald-600 dark:text-emerald-400">{summary.passRate}% pass rate</p>
                            </div>
                        </CardContent>
                        <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-emerald-200/40 dark:bg-emerald-700/20 blur-xl" />
                    </Card>

                    {/* Total Fail */}
                    <Card className="group relative overflow-hidden border shadow-md border-rose-100 dark:border-rose-900 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                        <div className="absolute inset-0 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900" />
                        <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium text-rose-800 dark:text-rose-300">Total Fail</CardTitle>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-rose-800 shadow-sm">
                                <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                            </div>
                        </CardHeader>
                        <CardContent className="relative z-10">
                            <div className="text-4xl font-bold text-rose-700 dark:text-rose-300">{summary.fail.toLocaleString()}</div>
                            <div className="mt-1 flex items-center gap-1.5">
                                <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                <p className="text-sm text-rose-600 dark:text-rose-400">{summary.failRate}% fail rate</p>
                            </div>
                        </CardContent>
                        <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-rose-200/40 dark:bg-rose-700/20 blur-xl" />
                    </Card>

                    {/* Pass Rate Gauge */}
                    <Card className="group relative overflow-hidden border shadow-md border-sky-200 dark:border-sky-800 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                        <div className="absolute inset-0 bg-gradient-to-br from-sky-50 to-white dark:from-slate-800 dark:to-slate-900" />
                        <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium text-slate-700 dark:text-slate-300">Quality Score</CardTitle>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-700 shadow-sm">
                                <Target className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                            </div>
                        </CardHeader>
                        <CardContent className="relative z-10 flex justify-center pt-2">
                            <RadialGauge value={summary.passRate} size={100} strokeWidth={8} />
                        </CardContent>
                    </Card>
                </div>

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
                                    <CardDescription className="text-sm">Per-piece progress, pass/fail, and side completeness</CardDescription>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-slate-500">Total Pieces</div>
                                    <div className="mt-1 text-3xl font-bold text-slate-800 dark:text-white">{pieceOverview.total_pieces.toLocaleString()}</div>
                                    <div className="text-xs text-slate-500 mt-1">Session rows across all article pieces</div>
                                </CardContent>
                            </Card>
                            <Card className="border-emerald-200 dark:border-emerald-900 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-emerald-700 dark:text-emerald-400">Completed Pieces</div>
                                    <div className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-300">{pieceOverview.completed_pieces.toLocaleString()}</div>
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{pieceOverview.completion_rate}% completed</div>
                                </CardContent>
                            </Card>
                            <Card className="border-sky-200 dark:border-sky-900 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-sky-700 dark:text-sky-400">Passing Pieces</div>
                                    <div className="mt-1 text-3xl font-bold text-sky-700 dark:text-sky-300">{pieceOverview.pass_pieces.toLocaleString()}</div>
                                    <div className="text-xs text-sky-600 dark:text-sky-400 mt-1">{pieceOverview.pass_rate}% pass rate</div>
                                </CardContent>
                            </Card>
                            <Card className="border-rose-200 dark:border-rose-900 shadow-sm">
                                <CardContent className="p-4">
                                    <div className="text-sm text-rose-700 dark:text-rose-400">Pending Pieces</div>
                                    <div className="mt-1 text-3xl font-bold text-rose-700 dark:text-rose-300">{pieceOverview.pending_pieces.toLocaleString()}</div>
                                    <div className="text-xs text-rose-600 dark:text-rose-400 mt-1">Requires final QC decision</div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card className="border-border/50 shadow-sm">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <CardTitle className="text-lg">Piece Completion by Article</CardTitle>
                                            <CardDescription className="text-sm">Which styles have the most completed QC pieces</CardDescription>
                                        </div>
                                    </div>
                                    <div className="relative mt-2">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            type="text"
                                            placeholder="Search piece stats..."
                                            value={pieceSearch}
                                            onChange={(e) => setPieceSearch(e.target.value)}
                                            className="h-10 pl-9 text-sm"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
                                        {filteredPieceArticles.length === 0 ? (
                                            <p className="text-center text-sm text-slate-400 py-8">No piece QC data available</p>
                                        ) : (
                                            filteredPieceArticles.map((piece, idx) => {
                                                return (
                                                    <div
                                                        key={`${piece.article_style}-${piece.brand_name}-${idx}`}
                                                        className="rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 p-3"
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="min-w-0">
                                                                <div className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{piece.article_style}</div>
                                                                <div className="text-[11px] text-slate-500">
                                                                    {piece.brand_name}
                                                                    {piece.article_type_name ? ` • ${piece.article_type_name}` : ''}
                                                                    {piece.size ? ` • ${piece.size}` : ''}
                                                                </div>
                                                            </div>
                                                            <div className="text-right text-xs text-slate-500">
                                                                <div>{piece.total_pieces} pieces</div>
                                                                <div>{piece.completed_pieces} completed</div>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-4 gap-2 mb-2 text-center">
                                                            <div className="rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{piece.pass_pieces}</div>
                                                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Pass</div>
                                                            </div>
                                                            <div className="rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{piece.fail_pieces}</div>
                                                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Fail</div>
                                                            </div>
                                                            <div className="rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{piece.in_progress_pieces}</div>
                                                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">In Progress</div>
                                                            </div>
                                                            <div className="rounded-md bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700">
                                                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{piece.pending_pieces}</div>
                                                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Pending</div>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <div>
                                                                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                                                                    <span>Completion</span>
                                                                    <span>{piece.completion_rate}%</span>
                                                                </div>
                                                                <ProgressBar value={piece.completed_pieces} max={maxPieceTotal} colorClass="bg-emerald-500" />
                                                            </div>
                                                            <div>
                                                                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                                                                    <span>Pass rate</span>
                                                                    <span>{piece.pass_rate}%</span>
                                                                </div>
                                                                <ProgressBar value={piece.pass_pieces} max={maxPieceTotal} colorClass="bg-sky-500" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/50 shadow-sm">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg">QC Completion Health</CardTitle>
                                    <CardDescription className="text-sm">How far the operator panel has advanced each piece</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="text-slate-600 dark:text-slate-300">Overall completion</span>
                                            <span className="font-medium">{pieceOverview.completion_rate}%</span>
                                        </div>
                                        <ProgressBar value={pieceOverview.completed_pieces} max={pieceOverview.total_pieces || 1} colorClass="bg-emerald-500" />
                                    </div>
                                    <div>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="text-slate-600 dark:text-slate-300">Front side completed</span>
                                            <span className="font-medium">{pieceOverview.front_completion_rate}%</span>
                                        </div>
                                        <ProgressBar value={pieceOverview.front_complete_pieces} max={pieceOverview.total_pieces || 1} colorClass="bg-sky-500" />
                                    </div>
                                    <div>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="text-slate-600 dark:text-slate-300">Back side completed</span>
                                            <span className="font-medium">{pieceOverview.back_completion_rate}%</span>
                                        </div>
                                        <ProgressBar value={pieceOverview.back_complete_pieces} max={pieceOverview.total_pieces || 1} colorClass="bg-indigo-500" />
                                    </div>
                                    <div>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="text-slate-600 dark:text-slate-300">Passing pieces</span>
                                            <span className="font-medium">{pieceOverview.pass_rate}%</span>
                                        </div>
                                        <ProgressBar value={pieceOverview.pass_pieces} max={pieceOverview.total_pieces || 1} colorClass="bg-emerald-500" />
                                    </div>
                                    <div>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="text-slate-600 dark:text-slate-300">Pending pieces</span>
                                            <span className="font-medium">{pieceOverview.pending_pieces}</span>
                                        </div>
                                        <ProgressBar value={pieceOverview.pending_pieces} max={pieceOverview.total_pieces || 1} colorClass="bg-amber-500" />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                </Card>

                {/* Export Buttons with Report Type Filter */}
                <Card className="border-border/50 shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{backgroundColor: '#AFDDD5'}}>
                                <Download className="h-5 w-5 text-white" />
                            </div>
                            <CardTitle className="text-lg">Export Reports</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                                <div className="space-y-2">
                                    <Label htmlFor="report-type" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Report Type
                                    </Label>
                                    <Select value={reportType} onValueChange={(value) => setReportType(value as any)}>
                                        <SelectTrigger
                                            id="report-type"
                                            className="h-11 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm hover:border-[#6C88C4] dark:hover:border-[#6C88C4] transition-all font-medium text-slate-700 dark:text-slate-200"
                                            style={{borderColor: '#6C88C4'}}
                                        >
                                            <SelectValue placeholder="Select report type" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-xl rounded-lg">
                                            <SelectItem
                                                value="all"
                                                className="cursor-pointer rounded-md data-[state=checked]:bg-[#AFDDD5]/30 data-[state=checked]:text-[#6C88C4] data-[state=checked]:font-semibold hover:!bg-slate-100 dark:hover:!bg-slate-700 focus:!bg-slate-100 dark:focus:!bg-slate-700 data-[state=checked]:hover:!bg-[#AFDDD5]/40 data-[state=checked]:focus:!bg-[#AFDDD5]/40"
                                            >
                                                Complete Report
                                            </SelectItem>
                                            <SelectItem
                                                value="measurement"
                                                className="cursor-pointer rounded-md data-[state=checked]:bg-[#AFDDD5]/30 data-[state=checked]:text-[#6C88C4] data-[state=checked]:font-semibold hover:!bg-slate-100 dark:hover:!bg-slate-700 focus:!bg-slate-100 dark:focus:!bg-slate-700 data-[state=checked]:hover:!bg-[#AFDDD5]/40 data-[state=checked]:focus:!bg-[#AFDDD5]/40"
                                            >
                                                Measurement Report
                                            </SelectItem>
                                            <SelectItem
                                                value="article"
                                                className="cursor-pointer rounded-md data-[state=checked]:bg-[#AFDDD5]/30 data-[state=checked]:text-[#6C88C4] data-[state=checked]:font-semibold hover:!bg-slate-100 dark:hover:!bg-slate-700 focus:!bg-slate-100 dark:focus:!bg-slate-700 data-[state=checked]:hover:!bg-[#AFDDD5]/40 data-[state=checked]:focus:!bg-[#AFDDD5]/40"
                                            >
                                                Article-wise Report
                                            </SelectItem>
                                            <SelectItem
                                                value="operator"
                                                className="cursor-pointer rounded-md data-[state=checked]:bg-[#AFDDD5]/30 data-[state=checked]:text-[#6C88C4] data-[state=checked]:font-semibold hover:!bg-slate-100 dark:hover:!bg-slate-700 focus:!bg-slate-100 dark:focus:!bg-slate-700 data-[state=checked]:hover:!bg-[#AFDDD5]/40 data-[state=checked]:focus:!bg-[#AFDDD5]/40"
                                            >
                                                Operators' Usage Report
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    onClick={exportExcel}
                                    className="bg-gradient-to-r text-white hover:opacity-90 shadow-md text-base px-6 py-5"
                                    style={{background: `linear-gradient(to right, #AFDDD5, ${reportType === 'all' ? '#6C88C4' : '#8A9BA7'})`}}
                                >
                                    <FileSpreadsheet className="mr-2 h-5 w-5" />
                                    Download Excel Report
                                </Button>
                                <Button
                                    onClick={exportPdf}
                                    className="bg-gradient-to-r text-white hover:opacity-90 shadow-md text-base px-6 py-5"
                                    style={{background: `linear-gradient(to right, #6C88C4, #8A9BA7)`}}
                                >
                                    <FileDown className="mr-2 h-5 w-5" />
                                    Download PDF Report
                                </Button>
                                {hasActiveFilters && (
                                    <span className="text-sm text-slate-500 italic ml-2">
                                        * Exports reflect currently applied filters
                                    </span>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Article-wise & Operator-wise Analytics */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Article-wise Pass/Fail Summary */}
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{backgroundColor: '#FFCD73'}}>
                                        <Package className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Article-wise Summary</CardTitle>
                                        <CardDescription className="text-sm">{articleSummary.length} articles inspected</CardDescription>
                                    </div>
                                </div>
                            </div>
                            <div className="relative mt-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Search articles..."
                                    value={articleSearch}
                                    onChange={(e) => setArticleSearch(e.target.value)}
                                    className="h-10 pl-9 text-sm"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
                                {filteredArticles.length === 0 ? (
                                    <p className="text-center text-sm text-slate-400 py-8">No article data available</p>
                                ) : (
                                    filteredArticles.map((article, idx) => {
                                        const passRate = article.total > 0 ? ((article.pass / article.total) * 100) : 0;
                                        return (
                                            <div
                                                key={`${article.article_style}-${idx}`}
                                                className="rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                                                            {article.article_style}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 text-[10px] font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">
                                                            {article.brand_name}
                                                        </span>
                                                        {(article.article_type_name || article.size) && (
                                                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">
                                                                {[article.article_type_name, article.size].filter(Boolean).join(' • ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-500 flex-shrink-0">
                                                        {article.total} total
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 mb-1.5">
                                                    <div className="flex items-center gap-1">
                                                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                                        <span className="text-xs text-slate-600 dark:text-slate-400">{article.pass} pass</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <div className="h-2 w-2 rounded-full bg-rose-500" />
                                                        <span className="text-xs text-slate-600 dark:text-slate-400">{article.fail} fail</span>
                                                    </div>
                                                    <span className={`ml-auto text-xs font-semibold ${passRate >= 80 ? 'text-emerald-600' : passRate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                        {passRate.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <div className="relative h-2 w-full rounded-full bg-rose-200 dark:bg-rose-900/30 overflow-hidden">
                                                    <div
                                                        className="absolute left-0 top-0 h-full rounded-full bg-emerald-500 transition-all duration-700"
                                                        style={{ width: `${passRate}%` }}
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

                {/* Measurement Failure Analysis Section */}
                {failureAnalysis.totalViolations > 0 && (
                    <>
                        {/* Section Header */}
                        <div className="relative overflow-hidden rounded-2xl p-8 shadow-md" style={{background: `linear-gradient(to bottom right, #8A9BA7, #6C88C4)`}}>
                            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                            <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-slate-300/20 blur-xl" />
                            <div className="relative z-10 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                                    <AlertTriangle className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-white">Non-Compliance Analysis</h2>
                                    <p className="text-base text-white/80">
                                        {failureAnalysis.totalViolations} Size Variation Detected across {failureAnalysis.parameterFailures.filter(p => p.times_failed > 0).length} measurement parameters
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Parameter Failure Ranking */}
                        <Card className="border-border/50 shadow-sm">
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{backgroundColor: '#8A9BA7'}}>
                                        <Crosshair className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Most Failing Measurement Parameters</CardTitle>
                                        <CardDescription className="text-sm">Which measurements fail most frequently</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="space-y-3">
                                    {failureAnalysis.parameterFailures
                                        .filter(p => p.times_failed > 0)
                                        .map((param, idx) => {
                                            const maxFailed = Math.max(...failureAnalysis.parameterFailures.map(p => p.times_failed), 1);
                                            const barWidth = (param.times_failed / maxFailed) * 100;
                                            return (
                                                <div
                                                    key={param.parameter}
                                                    className="rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                                                                param.failure_rate >= 30 
                                                                    ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' 
                                                                    : param.failure_rate >= 15 
                                                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                                            }`}>
                                                                {idx + 1}
                                                            </span>
                                                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                                                                {param.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-xs">
                                                            <span className="text-slate-500">
                                                                {param.times_failed}/{param.times_checked} checks failed
                                                            </span>
                                                            <span className={`font-bold ${param.failure_rate >= 30 ? 'text-rose-600 dark:text-rose-400' : param.failure_rate >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                                                {param.failure_rate}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                                            <div
                                                                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${
                                                                    param.failure_rate >= 30
                                                                        ? 'bg-gradient-to-r from-rose-400 to-rose-500'
                                                                        : param.failure_rate >= 15
                                                                        ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                                                                        : 'bg-gradient-to-r from-slate-400 to-slate-500'
                                                                }`}
                                                                style={{ width: `${barWidth}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                                            Avg dev: ±{param.avg_deviation}cm
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                                </div>
                            </CardContent>
                        </Card>

                        {/* Articles with Repeated Issues - Full Width */}
                            <Card className="border-border/50 shadow-sm">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{backgroundColor: '#FFCD73'}}>
                                            <Package className="h-5 w-5 text-white" />
                                        </div>
                                        <div>
                                        <CardTitle className="text-lg">Articles with Repeated Issues</CardTitle>
                                        <CardDescription className="text-sm">Top articles by measurement failures</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="max-h-[400px] overflow-y-auto pr-1 space-y-3">
                                        {failureAnalysis.articleFailures.length === 0 ? (
                                            <p className="text-center text-sm text-slate-400 py-8">No article failure data</p>
                                        ) : (
                                            failureAnalysis.articleFailures.map((article, idx) => (
                                                <div
                                                    key={`${article.article_style}-${idx}`}
                                                    className="rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 p-3"
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                                                            {article.article_style}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                                            {article.total_measurement_failures} failures
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mb-2">
                                                        {article.unique_params_failing} parameters affected · Most common: <span className="font-medium text-slate-700 dark:text-slate-300">{article.most_common_failure}</span> ({article.most_common_failure_count}×)
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {article.failing_params.slice(0, 5).map((fp) => (
                                                            <span
                                                                key={fp.parameter}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-[10px] text-slate-600 dark:text-slate-400"
                                                            >
                                                                {fp.parameter}
                                                                <span className="font-bold text-amber-700 dark:text-amber-400">×{fp.count}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
