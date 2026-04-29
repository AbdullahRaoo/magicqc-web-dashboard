import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import {
    Lock,
    Eye,
    EyeOff,
    Upload,
    FileJson,
    Image,
    Trash2,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    Download
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ArticleStyle {
    id: number;
    article_style: string;
    brand_name: string;
}

interface UploadedAnnotation {
    id: number;
    article_id: number;
    article_style: string;
    brand_name: string | null;
    size: string;
    side: string;
    color: string | null;
    color_suffix: string;
    standardized_name: string;
    name: string;
    keypoints_count: number;
    target_distances_count: number;
    image_url: string;
    image_dimensions: string | null;
    annotation_date: string | null;
    created_at: string;
    updated_at: string;
}

interface Props {
    hasPassword: boolean;
    articleStyles: ArticleStyle[];
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Annotation Upload',
        href: '/annotation-upload',
    },
];

export default function AnnotationUploadIndex({ hasPassword, articleStyles }: Props) {
    // Get developer status from shared props
    const { isDeveloper } = usePage<SharedData>().props;

    // Password verification states - auto-verify if developer
    const [isVerified, setIsVerified] = useState(isDeveloper);
    const [verifyPassword, setVerifyPassword] = useState('');
    const [showVerifyPassword, setShowVerifyPassword] = useState(false);
    const [verifyError, setVerifyError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    // Upload form states
    const [selectedArticleId, setSelectedArticleId] = useState<string>('');
    const [availableSizes, setAvailableSizes] = useState<string[]>([]);
    const [isLoadingSizes, setIsLoadingSizes] = useState(false);
    const [selectedSize, setSelectedSize] = useState<string>('');
    const [selectedSide, setSelectedSide] = useState<string>('front');
    const [selectedColor, setSelectedColor] = useState<string>('');
    const [name, setName] = useState('');
    const [jsonFile, setJsonFile] = useState<File | null>(null);
    const [referenceImage, setReferenceImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [uploadSuccess, setUploadSuccess] = useState('');

    // Annotation list states
    const [annotations, setAnnotations] = useState<UploadedAnnotation[]>([]);
    const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    // Refs
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Auto-load annotations when already verified (developer auto-bypass)
    // This also keeps the session alive and refreshes the XSRF cookie
    useEffect(() => {
        if (isVerified) {
            loadAnnotations();
        }
    }, [isVerified]);

    // Get selected article info
    const selectedArticle = articleStyles.find(a => a.id.toString() === selectedArticleId);

    // Handle article selection - load available sizes
    const handleArticleChange = async (articleId: string) => {
        setSelectedArticleId(articleId);
        setSelectedSize('');
        setAvailableSizes([]);

        if (!articleId) return;

        setIsLoadingSizes(true);
        try {
            const response = await fetch(`/annotation-upload/articles/${articleId}/sizes`, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });
            const data = await response.json();
            if (data.success) {
                setAvailableSizes(data.sizes || []);
            }
        } catch (err) {
            console.error('Failed to load sizes:', err);
        } finally {
            setIsLoadingSizes(false);
        }
    };

    const handleVerifyPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifyError('');
        setIsVerifying(true);

        try {
            const response = await fetch('/annotation-upload/verify-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify({ password: verifyPassword }),
            });

            const data = await response.json();

            if (response.ok) {
                setIsVerified(true);
                setVerifyPassword('');
                loadAnnotations();
            } else {
                setVerifyError(data.message || 'Incorrect password.');
            }
        } catch {
            setVerifyError('An error occurred. Please try again.');
        } finally {
            setIsVerifying(false);
        }
    };

    const loadAnnotations = async () => {
        setIsLoadingAnnotations(true);
        try {
            const response = await fetch('/annotation-upload/annotations', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });
            const data = await response.json();
            if (data.success) {
                setAnnotations(data.annotations || []);
            }
        } catch (err) {
            console.error('Failed to load annotations:', err);
        } finally {
            setIsLoadingAnnotations(false);
        }
    };

    const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setJsonFile(file);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setReferenceImage(file);

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploadError('');
        setUploadSuccess('');

        if (!selectedArticleId) {
            setUploadError('Please select an Article Style.');
            return;
        }

        if (!selectedSize) {
            setUploadError('Please select a Size.');
            return;
        }

        if (!selectedColor) {
            setUploadError('Please select a Garment Color.');
            return;
        }

        if (!jsonFile) {
            setUploadError('JSON file is required.');
            return;
        }

        if (!referenceImage) {
            setUploadError('Reference image is required.');
            return;
        }

        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append('article_id', selectedArticleId);
            formData.append('size', selectedSize);
            formData.append('side', selectedSide);
            formData.append('color', selectedColor);
            formData.append('json_file', jsonFile);
            formData.append('reference_image', referenceImage);
            if (name.trim()) {
                formData.append('name', name.trim());
            }

            const response = await fetch('/annotation-upload/upload', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                    'Accept': 'application/json',
                },
                body: formData,
            });

            // Handle session expiry — CSRF token mismatch (419) or unauthenticated (401)
            if (response.status === 419 || response.status === 401) {
                setUploadError('Your session has expired. Please refresh the page and try again.');
                return;
            }

            let data;
            try {
                data = await response.json();
            } catch {
                setUploadError(`Server error (${response.status}). Please refresh the page and try again.`);
                return;
            }

            // Handle validation errors (422)
            if (response.status === 422 && data.errors) {
                const messages = Object.values(data.errors).flat().join(', ');
                setUploadError(messages || data.message || 'Validation failed.');
                return;
            }

            if (data.success) {
                setUploadSuccess(`Successfully uploaded ${selectedSide} annotation for ${selectedArticle?.article_style} - ${selectedSize}`);

                // Reset form
                setSelectedArticleId('');
                setSelectedSize('');
                setSelectedSide('front');
                setSelectedColor('');
                setAvailableSizes([]);
                setName('');
                setJsonFile(null);
                setReferenceImage(null);
                setImagePreview(null);
                if (jsonInputRef.current) jsonInputRef.current.value = '';
                if (imageInputRef.current) imageInputRef.current.value = '';

                // Reload annotations list
                loadAnnotations();
            } else {
                setUploadError(data.message || 'Upload failed.');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An error occurred during upload. Please try again.';
            setUploadError(message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDownload = async (articleStyle: string, size: string, side: string) => {
        try {
            // Fetch the annotation data
            const response = await fetch(`/api/uploaded-annotations/${encodeURIComponent(articleStyle)}/${encodeURIComponent(size)}/${encodeURIComponent(side)}`, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });

            const data = await response.json();

            if (data.success && data.annotation) {
                // Create a JSON file with the annotation data
                const jsonContent = JSON.stringify(data.annotation.annotation_data, null, 2);
                const blob = new Blob([jsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                // Create download link
                const link = document.createElement('a');
                link.href = url;
                link.download = `${articleStyle.replace(/[/\\]/g, '_')}_${size.replace(/[/\\]/g, '_')}_${side}_annotation.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                setDeleteError('Failed to download annotation.');
            }
        } catch {
            setDeleteError('An error occurred while downloading. Please try again.');
        }
    };

    const handleDelete = async (id: number, articleStyle: string, size: string, side: string) => {
        if (!confirm(`Are you sure you want to delete the ${side} side annotation for ${articleStyle} - ${size}?`)) {
            return;
        }

        setDeleteError('');

        try {
            const response = await fetch(`/annotation-upload/annotations/${id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });

            const data = await response.json();

            if (data.success) {
                loadAnnotations();
            } else {
                setDeleteError(data.message || 'Delete failed.');
            }
        } catch {
            setDeleteError('An error occurred. Please try again.');
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    // If no password is set, show setup message
    if (!hasPassword) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Annotation Upload" />
                <div className="flex h-full flex-1 flex-col gap-4 p-4">
                    <Card className="mx-auto w-full max-w-md">
                        <CardHeader className="text-center">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
                                <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                            </div>
                            <CardTitle>Password Required</CardTitle>
                            <CardDescription>
                                Please set up a password in Article Registration first to enable access to this feature.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                onClick={() => window.location.href = '/article-registration'}
                                className="w-full"
                            >
                                Go to Article Registration
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </AppLayout>
        );
    }

    // If password not verified, show password form
    if (!isVerified) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Annotation Upload" />
                <div className="flex h-full flex-1 items-center justify-center p-4">
                    <div className="w-full max-w-md">
                        {/* Decorative gradient card */}
                        <Card className="relative overflow-hidden border-0 shadow-2xl">
                            {/* Gradient header */}
                            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-[#264c59] via-[#3d6b7a] to-[#264c59]">
                                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#f7a536]/20 blur-2xl" />
                                <div className="absolute -left-4 bottom-0 h-16 w-16 rounded-full bg-white/10 blur-xl" />
                            </div>

                            <CardHeader className="relative z-10 pt-8 pb-4 text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg">
                                    <Lock className="h-8 w-8 text-[#264c59]" />
                                </div>
                                <CardTitle className="text-xl text-white">Annotation Upload</CardTitle>
                                <CardDescription className="text-white/80">
                                    Enter your password to access this feature
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="relative z-10 bg-white dark:bg-card rounded-t-3xl -mt-4 pt-8 pb-6">
                                <form onSubmit={handleVerifyPassword} className="space-y-5">
                                    <div className="space-y-2">
                                        <Label htmlFor="verifyPassword" className="text-sm font-medium text-slate-700 dark:text-foreground">
                                            Password
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                id="verifyPassword"
                                                type={showVerifyPassword ? 'text' : 'password'}
                                                value={verifyPassword}
                                                onChange={(e) => setVerifyPassword(e.target.value)}
                                                placeholder="Enter your password"
                                                className="h-12 pr-12 text-base border-slate-200 focus:border-[#264c59] focus:ring-[#264c59]"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                {showVerifyPassword ? (
                                                    <EyeOff className="h-5 w-5" />
                                                ) : (
                                                    <Eye className="h-5 w-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {verifyError && (
                                        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
                                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                            {verifyError}
                                        </div>
                                    )}

                                    <Button
                                        type="submit"
                                        className="w-full h-12 text-base font-medium bg-gradient-to-r from-[#264c59] to-[#3d6b7a] hover:from-[#1a3640] hover:to-[#264c59] transition-all duration-300"
                                        disabled={isVerifying}
                                    >
                                        {isVerifying ? (
                                            <>
                                                <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            <>
                                                <Lock className="mr-2 h-5 w-5" />
                                                Unlock Access
                                            </>
                                        )}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* Helper text below */}
                        <p className="mt-4 text-center text-sm text-muted-foreground">
                            Password is configured by your administrator
                        </p>
                    </div>
                </div>
            </AppLayout>
        );
    }

    // Main content - verified access
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Annotation Upload" />
            <div className="flex h-full flex-1 flex-col gap-6 p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Annotation Upload</h1>
                        <p className="text-muted-foreground">
                            Upload annotation JSON files and reference images for the Electron app.
                        </p>
                    </div>
                    <Button variant="outline" onClick={loadAnnotations} disabled={isLoadingAnnotations}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingAnnotations ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Upload Form */}
                    <Card className="border-2">
                        <CardHeader className="bg-muted/50">
                            <CardTitle className="flex items-center gap-2">
                                <Upload className="h-5 w-5 text-primary" />
                                Upload New Annotation
                            </CardTitle>
                            <CardDescription>
                                Select an article and size, then upload the annotation JSON and reference image.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={handleUpload} className="space-y-5">
                                {/* Article Style and Size Selection Row */}
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {/* Article Style Dropdown */}
                                    <div className="space-y-2">
                                        <Label htmlFor="articleStyle" className="font-medium">
                                            Article Style <span className="text-red-500">*</span>
                                        </Label>
                                        <Select value={selectedArticleId} onValueChange={handleArticleChange}>
                                            <SelectTrigger id="articleStyle" className="w-full">
                                                <SelectValue placeholder="Select article..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {articleStyles.length === 0 ? (
                                                    <SelectItem value="none" disabled>
                                                        No articles found
                                                    </SelectItem>
                                                ) : (
                                                    articleStyles.map((article) => (
                                                        <SelectItem key={article.id} value={article.id.toString()}>
                                                            {article.article_style} ({article.brand_name})
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Size Dropdown */}
                                    <div className="space-y-2">
                                        <Label htmlFor="size" className="font-medium">
                                            Size <span className="text-red-500">*</span>
                                        </Label>
                                        {!selectedArticleId ? (
                                            <Select disabled>
                                                <SelectTrigger id="size" className="w-full">
                                                    <SelectValue placeholder="Select article first..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none" disabled>Select article first</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : isLoadingSizes ? (
                                            <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                Loading sizes...
                                            </div>
                                        ) : availableSizes.length === 0 ? (
                                            <div className="flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                                <AlertCircle className="h-4 w-4" />
                                                No sizes found for this article
                                            </div>
                                        ) : (
                                            <Select value={selectedSize} onValueChange={setSelectedSize}>
                                                <SelectTrigger id="size" className="w-full">
                                                    <SelectValue placeholder="Select size..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableSizes.map((size) => (
                                                        <SelectItem key={size} value={size}>
                                                            {size}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>

                                {/* Side Selection */}
                                <div className="space-y-2">
                                    <Label htmlFor="side" className="font-medium">
                                        Side <span className="text-red-500">*</span>
                                    </Label>
                                    <Select value={selectedSide} onValueChange={setSelectedSide}>
                                        <SelectTrigger id="side" className="w-full">
                                            <SelectValue placeholder="Select side..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="front">
                                                <div className="flex items-center gap-2">
                                                    <span>Front Side</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="back">
                                                <div className="flex items-center gap-2">
                                                    <span>Back Side</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Choose whether this annotation is for the front or back side of the article.
                                    </p>
                                </div>

                                {/* Garment Color */}
                                <div className="space-y-2">
                                    <Label htmlFor="color" className="font-medium">
                                        Garment Color <span className="text-red-500">*</span>
                                    </Label>
                                    <Select value={selectedColor} onValueChange={setSelectedColor}>
                                        <SelectTrigger id="color" className="w-full">
                                            <SelectValue placeholder="Select garment color..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="black">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block h-3 w-3 rounded-full bg-gray-900 border border-gray-400" />
                                                    <span>Black</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="white">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block h-3 w-3 rounded-full bg-white border border-gray-400" />
                                                    <span>White</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="other">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block h-3 w-3 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 border border-gray-400" />
                                                    <span>Other Colors</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Select the garment color for this annotation. Files are saved with color suffix: Black (-b), White (-w), Other (-z).
                                    </p>
                                </div>

                                {/* Name (optional) */}
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="font-medium">
                                        Name <span className="text-muted-foreground text-xs">(optional)</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Descriptive name for this annotation"
                                    />
                                </div>

                                {/* File Upload Section */}
                                <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                                    <h4 className="text-sm font-medium text-muted-foreground">Files to Upload</h4>

                                    {/* JSON File */}
                                    <div className="space-y-2">
                                        <Label htmlFor="jsonFile" className="font-medium">
                                            JSON Annotation File <span className="text-red-500">*</span>
                                        </Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => jsonInputRef.current?.click()}
                                            className={`w-full justify-start ${jsonFile ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : ''}`}
                                        >
                                            <FileJson className={`mr-2 h-4 w-4 ${jsonFile ? 'text-green-600' : ''}`} />
                                            {jsonFile ? jsonFile.name : 'Select JSON file...'}
                                        </Button>
                                        <input
                                            ref={jsonInputRef}
                                            id="jsonFile"
                                            type="file"
                                            accept=".json"
                                            onChange={handleJsonFileChange}
                                            className="hidden"
                                        />
                                    </div>

                                    {/* Reference Image */}
                                    <div className="space-y-2">
                                        <Label htmlFor="referenceImage" className="font-medium">
                                            Reference Image <span className="text-red-500">*</span>
                                        </Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => imageInputRef.current?.click()}
                                            className={`w-full justify-start ${referenceImage ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : ''}`}
                                        >
                                            <Image className={`mr-2 h-4 w-4 ${referenceImage ? 'text-green-600' : ''}`} />
                                            {referenceImage ? referenceImage.name : 'Select image...'}
                                        </Button>
                                        <input
                                            ref={imageInputRef}
                                            id="referenceImage"
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </div>
                                </div>

                                {/* Image Preview */}
                                {imagePreview && (
                                    <div className="space-y-2">
                                        <Label className="font-medium">Image Preview</Label>
                                        <div className="relative overflow-hidden rounded-lg border-2 border-dashed bg-muted/30 p-2">
                                            <img
                                                src={imagePreview}
                                                alt="Preview"
                                                className="mx-auto h-auto max-h-40 w-auto rounded object-contain"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Error Message */}
                                {uploadError && (
                                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/50 dark:text-red-400">
                                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                        {uploadError}
                                    </div>
                                )}

                                {/* Success Message */}
                                {uploadSuccess && (
                                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600 dark:border-green-800 dark:bg-green-900/50 dark:text-green-400">
                                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                        {uploadSuccess}
                                    </div>
                                )}

                                {/* Submit Button */}
                                <Button
                                    type="submit"
                                    className="w-full"
                                    size="lg"
                                    disabled={isUploading || !selectedArticleId || !selectedSize || !selectedColor || !jsonFile || !referenceImage}
                                >
                                    {isUploading ? (
                                        <>
                                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="mr-2 h-4 w-4" />
                                            Upload Annotation
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Annotations List */}
                    <Card className="border-2">
                        <CardHeader className="bg-muted/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <FileJson className="h-5 w-5 text-primary" />
                                        Uploaded Annotations
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} uploaded
                                    </CardDescription>
                                </div>
                                <Button variant="ghost" size="sm" onClick={loadAnnotations} disabled={isLoadingAnnotations}>
                                    <RefreshCw className={`h-4 w-4 ${isLoadingAnnotations ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {deleteError && (
                                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/50 dark:text-red-400">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    {deleteError}
                                </div>
                            )}

                            {isLoadingAnnotations ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                                    <p className="mt-2 text-sm text-muted-foreground">Loading annotations...</p>
                                </div>
                            ) : annotations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <FileJson className="h-12 w-12 text-muted-foreground/50" />
                                    <p className="mt-2 font-medium text-muted-foreground">No annotations uploaded yet</p>
                                    <p className="text-sm text-muted-foreground">Upload your first annotation using the form.</p>
                                </div>
                            ) : (() => {
                                // Color display labels
                                const colorLabels: Record<string, string> = { black: 'Black', white: 'White', other: 'Other Colors' };
                                const colorBadgeClasses: Record<string, string> = {
                                    black: 'bg-gray-800 text-white dark:bg-gray-700',
                                    white: 'bg-white text-gray-700 border border-gray-300 dark:bg-gray-100',
                                    other: 'bg-gradient-to-r from-red-400 via-yellow-300 to-blue-400 text-white',
                                };

                                // Group annotations by article_style + size + color
                                const grouped = annotations.reduce((acc, annotation) => {
                                    const colorKey = annotation.color || 'none';
                                    const key = `${annotation.article_style}_${annotation.size}_${colorKey}`;
                                    if (!acc[key]) {
                                        acc[key] = {
                                            article_style: annotation.article_style,
                                            size: annotation.size,
                                            color: annotation.color,
                                            front: null as UploadedAnnotation | null,
                                            back: null as UploadedAnnotation | null,
                                        };
                                    }
                                    if (annotation.side === 'front') {
                                        acc[key].front = annotation;
                                    } else {
                                        acc[key].back = annotation;
                                    }
                                    return acc;
                                }, {} as Record<string, { article_style: string; size: string; color: string | null; front: UploadedAnnotation | null; back: UploadedAnnotation | null }>);

                                return (
                                    <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
                                        {Object.values(grouped).map((group, index) => (
                                            <div
                                                key={index}
                                                className="group rounded-lg border-2 p-4 transition-all hover:border-primary/30 hover:bg-muted/50"
                                            >
                                                {/* Header with article style, size, and color */}
                                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                                    <span className="font-semibold text-foreground">
                                                        {group.article_style}
                                                    </span>
                                                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                                        {group.size}
                                                    </span>
                                                    {group.color && (
                                                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${colorBadgeClasses[group.color] || 'bg-gray-100 text-gray-600'}`}>
                                                            {colorLabels[group.color] || group.color}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Front and Back side by side */}
                                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                    {/* Front Side */}
                                                    <div className={`rounded-lg border-2 p-3 ${group.front ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10' : 'border-dashed border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/10'}`}>
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300">
                                                                Front
                                                            </span>
                                                            {group.front && (
                                                                <div className="flex gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7"
                                                                        onClick={() => handleDownload(group.front!.article_style, group.front!.size, 'front')}
                                                                        title="Download JSON"
                                                                    >
                                                                        <Download className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/50"
                                                                        onClick={() => handleDelete(group.front!.id, group.front!.article_style, group.front!.size, 'front')}
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {group.front ? (
                                                            <div className="space-y-1.5">
                                                                <p className="text-sm font-medium text-foreground">
                                                                    {group.front.name}
                                                                </p>
                                                                {group.front.standardized_name && (
                                                                    <div className="text-xs font-mono text-primary/70">
                                                                        {group.front.standardized_name}
                                                                    </div>
                                                                )}
                                                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                                    <span>{group.front.keypoints_count} keypoints</span>
                                                                    <span>•</span>
                                                                    <span>{group.front.target_distances_count} distances</span>
                                                                </div>
                                                                {group.front.image_dimensions && (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {group.front.image_dimensions}
                                                                    </div>
                                                                )}
                                                                <div className="text-xs text-muted-foreground">
                                                                    Updated: {formatDate(group.front.updated_at)}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground">No front annotation</p>
                                                        )}
                                                    </div>

                                                    {/* Back Side */}
                                                    <div className={`rounded-lg border-2 p-3 ${group.back ? 'border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-900/10' : 'border-dashed border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/10'}`}>
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                                                                Back
                                                            </span>
                                                            {group.back && (
                                                                <div className="flex gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7"
                                                                        onClick={() => handleDownload(group.back!.article_style, group.back!.size, 'back')}
                                                                        title="Download JSON"
                                                                    >
                                                                        <Download className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/50"
                                                                        onClick={() => handleDelete(group.back!.id, group.back!.article_style, group.back!.size, 'back')}
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {group.back ? (
                                                            <div className="space-y-1.5">
                                                                <p className="text-sm font-medium text-foreground">
                                                                    {group.back.name}
                                                                </p>
                                                                {group.back.standardized_name && (
                                                                    <div className="text-xs font-mono text-primary/70">
                                                                        {group.back.standardized_name}
                                                                    </div>
                                                                )}
                                                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                                    <span>{group.back.keypoints_count} keypoints</span>
                                                                    <span>•</span>
                                                                    <span>{group.back.target_distances_count} distances</span>
                                                                </div>
                                                                {group.back.image_dimensions && (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {group.back.image_dimensions}
                                                                    </div>
                                                                )}
                                                                <div className="text-xs text-muted-foreground">
                                                                    Updated: {formatDate(group.back.updated_at)}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground">No back annotation</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
