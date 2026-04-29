<?php

namespace App\Http\Controllers;

use App\Models\Article;
use App\Models\UploadedAnnotation;
use App\Models\ArticleRegistrationSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class AnnotationUploadController extends Controller
{
    /**
     * Display the annotation upload page.
     */
    public function index(): InertiaResponse
    {
        $hasPassword = ArticleRegistrationSetting::getValue('password') !== null;
        
        // Get article styles for dropdown
        $articleStyles = Article::with('brand')
            ->orderBy('article_style')
            ->get()
            ->map(fn($article) => [
                'id' => $article->id,
                'article_style' => $article->article_style,
                'brand_name' => $article->brand?->name ?? 'Unknown',
            ]);
        
        return Inertia::render('annotation-upload/index', [
            'hasPassword' => $hasPassword,
            'articleStyles' => $articleStyles,
        ]);
    }

    /**
     * Verify password for access.
     */
    public function verifyPassword(Request $request): JsonResponse
    {
        $request->validate([
            'password' => ['required', 'string'],
        ]);

        $storedPassword = ArticleRegistrationSetting::getValue('password');

        if (!$storedPassword || !Hash::check($request->password, $storedPassword)) {
            return response()->json([
                'success' => false,
                'message' => 'Incorrect password.',
            ], 401);
        }

        return response()->json([
            'success' => true,
            'message' => 'Password verified.',
        ]);
    }

    /**
     * Get available sizes for an article.
     * Returns sizes from MeasurementSize table for this article.
     */
    public function getSizes(int $articleId): JsonResponse
    {
        $article = Article::findOrFail($articleId);
        
        // Get sizes from measurement sizes for this article
        $sizes = \App\Models\MeasurementSize::whereHas('measurement', function ($query) use ($articleId) {
            $query->where('article_id', $articleId);
        })
        ->distinct()
        ->pluck('size')
        ->filter()
        ->sort()
        ->values();

        return response()->json([
            'success' => true,
            'sizes' => $sizes,
            'article_style' => $article->article_style,
        ]);
    }

    /**
     * Upload annotation JSON and reference image.
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'article_id' => ['required', 'integer', 'exists:articles,id'],
            'size' => ['required', 'string', 'max:50'],
            'side' => ['required', 'string', 'in:front,back'],
            'color' => ['required', 'string', 'in:black,white,other'],
            'json_file' => ['required', 'file', 'mimes:json,txt', 'max:10240'], // 10MB max
            'reference_image' => ['required', 'file', 'mimes:jpg,jpeg,png,gif,webp', 'max:102400'], // 100MB max
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            // Get the article
            $article = Article::findOrFail($request->article_id);
            $articleStyle = $article->article_style;
            
            // Read and parse JSON file
            $jsonContent = file_get_contents($request->file('json_file')->getRealPath());
            $annotationData = json_decode($jsonContent, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid JSON file: ' . json_last_error_msg(),
                ], 422);
            }

            // Validate required JSON fields
            if (!isset($annotationData['keypoints']) || !is_array($annotationData['keypoints'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'JSON must contain a "keypoints" array.',
                ], 422);
            }

            // Process reference image
            $image = $request->file('reference_image');
            $size = $request->size;
            $side = $request->side;
            $color = $request->color;
            
            // Color suffix: black=-b, white=-w, other=-z
            $colorSuffix = UploadedAnnotation::colorSuffix($color);
            
            // Create storage directory
            $storageDir = 'uploaded-annotations';
            Storage::disk('public')->makeDirectory($storageDir);

            // Generate standardized filename: STYLE_SIZE_SIDE-suffix.ext
            // e.g., T-SHIRT_S_FRONT-w.jpg
            $extension = $image->getClientOriginalExtension();
            $styleClean = strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '_', $articleStyle));
            $sizeClean = strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '_', $size));
            $sideClean = strtoupper($side);
            $standardizedBase = "{$styleClean}_{$sizeClean}_{$sideClean}{$colorSuffix}";
            $filename = $standardizedBase . '.' . $extension;
            $imagePath = $storageDir . '/' . $filename;

            // Check for existing annotation and delete old image
            $existing = UploadedAnnotation::findByArticleIdAndSize($article->id, $size, $side, $color);
            if ($existing && $existing->reference_image_path) {
                Storage::disk('public')->delete($existing->reference_image_path);
            }

            // Store the image file on disk (original quality, for serving)
            Storage::disk('public')->put($imagePath, file_get_contents($image->getRealPath()));

            // Get image dimensions
            $imageInfo = getimagesize($image->getRealPath());
            $imageWidth = $imageInfo[0] ?? null;
            $imageHeight = $imageInfo[1] ?? null;

            // Generate API URL for Electron app
            $apiImageUrl = '/api/uploaded-annotations/' . $articleStyle . '/' . $size . '/' . $side . '/image?color=' . $color;

            // Extract annotation date if present in JSON
            $annotationDate = null;
            if (isset($annotationData['annotation_date'])) {
                try {
                    $annotationDate = \Carbon\Carbon::parse($annotationData['annotation_date']);
                } catch (\Exception $e) {
                    // Ignore invalid date
                }
            }

            // Also save JSON file to disk with standardized name
            $jsonFilename = $standardizedBase . '.json';
            $jsonPath = $storageDir . '/' . $jsonFilename;
            Storage::disk('public')->put($jsonPath, json_encode($annotationData, JSON_PRETTY_PRINT));

            // Create or update annotation record — keyed by article_id + size + side + color
            $annotation = UploadedAnnotation::updateOrCreate(
                [
                    'article_id' => $article->id,
                    'size' => $size,
                    'side' => $side,
                    'color' => $color,
                ],
                [
                    'article_style' => $articleStyle,
                    'name' => $request->name ?? 'Annotation for ' . $articleStyle . ' - ' . $size . ' (' . ucfirst($side) . ', ' . ucfirst($color) . ')',
                    'annotation_data' => $annotationData,
                    'reference_image_path' => $imagePath,
                    'reference_image_data' => null,
                    'reference_image_filename' => $filename,
                    'reference_image_mime_type' => $image->getMimeType(),
                    'reference_image_size' => $image->getSize(),
                    'image_width' => $imageWidth,
                    'image_height' => $imageHeight,
                    'original_json_filename' => $request->file('json_file')->getClientOriginalName(),
                    'api_image_url' => $apiImageUrl,
                    'upload_source' => 'manual',
                    'annotation_date' => $annotationDate,
                ]
            );

            return response()->json([
                'success' => true,
                'message' => 'Annotation and reference image uploaded successfully.',
                'annotation' => [
                    'id' => $annotation->id,
                    'article_id' => $annotation->article_id,
                    'article_style' => $annotation->article_style,
                    'size' => $annotation->size,
                    'name' => $annotation->name,
                    'keypoints_count' => count($annotationData['keypoints']),
                    'target_distances_count' => count($annotationData['target_distances'] ?? []),
                    'image_url' => $annotation->api_image_url,
                    'image_dimensions' => $imageWidth . 'x' . $imageHeight,
                    'has_image_data' => !empty($imageBase64),
                ],
            ]);

        } catch (\Exception $e) {
            \Log::error('Annotation upload failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Upload failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get all uploaded annotations (for management).
     */
    public function getAnnotations(): JsonResponse
    {
        $annotations = UploadedAnnotation::with('article.brand')
            ->orderBy('updated_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'annotations' => $annotations->map(function ($a) {
                return [
                    'id' => $a->id,
                    'article_id' => $a->article_id,
                    'article_style' => $a->article_style,
                    'brand_name' => $a->article?->brand?->name,
                    'size' => $a->size,
                    'side' => $a->side,
                    'color' => $a->color,
                    'color_suffix' => $a->getColorSuffix(),
                    'standardized_name' => $a->getStandardizedBaseName(),
                    'name' => $a->name,
                    'keypoints_count' => count($a->getKeypoints()),
                    'target_distances_count' => count($a->getTargetDistances()),
                    'image_url' => $a->api_image_url,
                    'image_dimensions' => ($a->image_width && $a->image_height) 
                        ? $a->image_width . 'x' . $a->image_height 
                        : null,
                    'annotation_date' => $a->annotation_date?->toIso8601String(),
                    'created_at' => $a->created_at->toIso8601String(),
                    'updated_at' => $a->updated_at->toIso8601String(),
                ];
            }),
        ]);
    }

    /**
     * Delete an uploaded annotation.
     */
    public function delete(int $id): JsonResponse
    {
        $annotation = UploadedAnnotation::findOrFail($id);

        // Delete the reference image from disk
        if ($annotation->reference_image_path) {
            Storage::disk('public')->delete($annotation->reference_image_path);
        }

        $annotation->delete();

        return response()->json([
            'success' => true,
            'message' => 'Annotation deleted successfully.',
        ]);
    }

    // ===== API ENDPOINTS FOR ELECTRON APP =====

    /**
     * API: Get all uploaded annotations.
     */
    public function apiGetAnnotations(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'annotations' => UploadedAnnotation::getAllForElectron(),
        ]);
    }

    /**
     * API: Get a single annotation by article style, size, and side.
     */
    public function apiGetAnnotation(string $articleStyle, string $size, string $side = 'front'): JsonResponse
    {
        // Support color via query param for backward compat
        $color = request()->query('color');
        $annotation = UploadedAnnotation::findByStyleAndSize($articleStyle, $size, $side, $color);

        if (!$annotation) {
            return response()->json([
                'success' => false,
                'message' => 'Annotation not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'annotation' => [
                'id' => $annotation->id,
                'article_style' => $annotation->article_style,
                'size' => $annotation->size,
                'side' => $annotation->side,
                'color' => $annotation->color,
                'color_suffix' => $annotation->getColorSuffix(),
                'standardized_name' => $annotation->getStandardizedBaseName(),
                'name' => $annotation->name,
                'annotation_data' => $annotation->annotation_data,
                'reference_image_url' => $annotation->api_image_url,
                'image_width' => $annotation->image_width,
                'image_height' => $annotation->image_height,
                'annotation_date' => $annotation->annotation_date?->toIso8601String(),
                'created_at' => $annotation->created_at->toIso8601String(),
                'updated_at' => $annotation->updated_at->toIso8601String(),
            ],
        ]);
    }

    /**
     * API: Get the reference image for an annotation.
     */
    public function apiGetImage(string $articleStyle, string $size, string $side = 'front'): \Symfony\Component\HttpFoundation\BinaryFileResponse|JsonResponse|Response
    {
        $color = request()->query('color');
        $annotation = UploadedAnnotation::findByStyleAndSize($articleStyle, $size, $side, $color);

        if (!$annotation) {
            return response()->json([
                'success' => false,
                'message' => 'Image not found.',
            ], 404);
        }

        // Try disk file first (full quality)
        $path = $annotation->getStoragePath();
        if ($path && file_exists($path)) {
            return response()->file($path, [
                'Content-Type' => $annotation->reference_image_mime_type ?? 'image/jpeg',
                'Cache-Control' => 'public, max-age=31536000',
            ]);
        }

        // Fallback: serve from DB base64 data (handles missing disk files)
        if ($annotation->reference_image_data) {
            $imageData = base64_decode($annotation->reference_image_data);
            $mimeType = $annotation->reference_image_mime_type ?? 'image/jpeg';
            return response($imageData, 200, [
                'Content-Type' => $mimeType,
                'Content-Length' => strlen($imageData),
                'Cache-Control' => 'public, max-age=31536000',
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => 'Image not found on disk or in database.',
        ], 404);
    }

    /**
     * API: Get the reference image as base64.
     */
    public function apiGetImageBase64(string $articleStyle, string $size, string $side = 'front'): JsonResponse
    {
        $color = request()->query('color');
        $annotation = UploadedAnnotation::findByStyleAndSize($articleStyle, $size, $side, $color);

        if (!$annotation) {
            return response()->json([
                'success' => false,
                'message' => 'Image not found.',
            ], 404);
        }

        $base64 = null;
        $mimeType = $annotation->reference_image_mime_type ?? 'image/jpeg';

        // Primary: disk file (always present after upload, no DB size limits)
        $path = $annotation->getStoragePath();
        if ($path && file_exists($path)) {
            $base64 = base64_encode(file_get_contents($path));
        } elseif ($annotation->reference_image_data) {
            // Fallback: DB column (backward compat for older records)
            $base64 = $annotation->reference_image_data;
        }

        if (!$base64) {
            return response()->json([
                'success' => false,
                'message' => 'Reference image not found in database or on disk.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'image' => [
                'data' => $base64,
                'mime_type' => $mimeType,
                'data_url' => "data:{$mimeType};base64,{$base64}",
                'width' => $annotation->image_width,
                'height' => $annotation->image_height,
            ],
        ]);
    }
    /**
     * API: Get the reference image as base64 using query parameters.
     * Prevents issues with URL encoding of slashes in size.
     */
    public function apiGetImageBase64Query(Request $request): JsonResponse
    {
        $articleStyle = $request->query('article_style');
        $size = $request->query('size');
        $side = $request->query('side', 'front');

        if (!$articleStyle || !$size) {
            return response()->json([
                'success' => false,
                'message' => 'article_style and size parameters are required.',
            ], 400);
        }

        return $this->apiGetImageBase64($articleStyle, $size, $side);
    }

    /**
     * API: Operator Panel - Get annotation + reference image for measurement.
     * 
     * FETCH PRIORITY:
     *   1. uploaded_annotations (manually uploaded reference image + annotation)
     *      — matched by article_style + size + side + color
     *   2. article_annotations (camera-captured annotation) — fallback only
     * 
     * This ensures the operator panel always gets the correct, manually-curated
     * reference image and annotation data for QC measurement, and never
     * mistakenly pulls generic article images.
     *
     * Query params: article_style, size, side (default: front), color (optional)
     */
    public function apiOperatorFetch(Request $request): JsonResponse
    {
        $articleStyle = $request->query('article_style');
        $size = $request->query('size');
        $side = $request->query('side', 'front');
        $color = $request->query('color');

        if (!$articleStyle || !$size) {
            return response()->json([
                'success' => false,
                'message' => 'article_style and size parameters are required.',
            ], 400);
        }

        // Priority 1: Uploaded annotation with exact color match
        $uploaded = null;
        if ($color) {
            $uploaded = UploadedAnnotation::findByStyleAndSize($articleStyle, $size, $side, $color);
        }

        // Priority 1b: If no color-specific match, try any-color fallback
        if (!$uploaded) {
            $uploaded = UploadedAnnotation::findByStyleAndSizeAnyColor($articleStyle, $size, $side);
        }

        if ($uploaded) {
            $imageBase64 = null;
            $imageMimeType = null;

            // Primary source: MySQL database column (reference_image_data)
            // Fallback: disk file (for backward compat with records missing DB data)
            if ($uploaded->reference_image_data) {
                $imageBase64 = $uploaded->reference_image_data;
                $imageMimeType = $uploaded->reference_image_mime_type ?? 'image/jpeg';
            } else {
                // DB column empty — fall back to disk file
                $diskPath = $uploaded->getStoragePath();
                if ($diskPath && file_exists($diskPath)) {
                    $imageBase64 = base64_encode(file_get_contents($diskPath));
                    $imageMimeType = $uploaded->reference_image_mime_type ?? 'image/jpeg';
                }
            }

            return response()->json([
                'success' => true,
                'source' => 'uploaded_annotation',
                'annotation' => [
                    'id' => $uploaded->id,
                    'article_style' => $uploaded->article_style,
                    'size' => $uploaded->size,
                    'side' => $uploaded->side,
                    'color' => $uploaded->color,
                    'color_suffix' => $uploaded->getColorSuffix(),
                    'standardized_name' => $uploaded->getStandardizedBaseName(),
                    'name' => $uploaded->name,
                    'annotation_data' => $uploaded->annotation_data,
                    'image_width' => $uploaded->image_width,
                    'image_height' => $uploaded->image_height,
                    'annotation_date' => $uploaded->annotation_date?->toIso8601String(),
                ],
                'reference_image' => $imageBase64 ? [
                    'data' => $imageBase64,
                    'mime_type' => $imageMimeType,
                    'data_url' => "data:{$imageMimeType};base64,{$imageBase64}",
                    'width' => $uploaded->image_width,
                    'height' => $uploaded->image_height,
                ] : null,
            ]);
        }

        // Priority 2: Article annotation (from camera capture + in-browser annotation)
        $articleAnnotation = \App\Models\ArticleAnnotation::where('article_style', $articleStyle)
            ->where('size', $size)
            ->first();

        if ($articleAnnotation) {
            return response()->json([
                'success' => true,
                'source' => 'article_annotation',
                'annotation' => [
                    'id' => $articleAnnotation->id,
                    'article_style' => $articleAnnotation->article_style,
                    'size' => $articleAnnotation->size,
                    'side' => $side,
                    'name' => $articleAnnotation->name,
                    'annotation_data' => [
                        'keypoints' => $articleAnnotation->keypoints_pixels ?? [],
                        'target_distances' => $articleAnnotation->target_distances ?? [],
                        'placement_box' => $articleAnnotation->placement_box ?? [],
                    ],
                    'image_width' => $articleAnnotation->image_width,
                    'image_height' => $articleAnnotation->image_height,
                    'annotation_date' => $articleAnnotation->updated_at?->toIso8601String(),
                ],
                'reference_image' => $articleAnnotation->image_data ? [
                    'data' => $articleAnnotation->image_data,
                    'mime_type' => $articleAnnotation->image_mime_type ?? 'image/jpeg',
                    'data_url' => 'data:' . ($articleAnnotation->image_mime_type ?? 'image/jpeg') . ';base64,' . $articleAnnotation->image_data,
                    'width' => $articleAnnotation->image_width,
                    'height' => $articleAnnotation->image_height,
                ] : null,
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => "No annotation found for {$articleStyle} / {$size} / {$side}.",
            'source' => null,
        ], 404);
    }

    /**
     * Compress an image for MySQL base64 storage.
     * Resizes large images to max 1920px wide and compresses JPEG to 75% quality.
     * Keeps the DB payload under ~2MB base64 even for 5000+ pixel originals.
     * The original full-resolution file is always preserved on disk.
     */
    private function compressImageForDb(string $sourcePath, string $mimeType): string
    {
        $maxWidth = 1920;
        $maxDbBytes = 16 * 1024 * 1024; // 16MB raw limit before base64

        $imageContent = file_get_contents($sourcePath);

        // If the file is already small enough, store as-is
        if (strlen($imageContent) < $maxDbBytes / 2) {
            return base64_encode($imageContent);
        }

        // Try to create a GD image for resizing/compressing
        $srcImage = null;
        switch (strtolower($mimeType)) {
            case 'image/jpeg':
            case 'image/jpg':
                $srcImage = @imagecreatefromjpeg($sourcePath);
                break;
            case 'image/png':
                $srcImage = @imagecreatefrompng($sourcePath);
                break;
            case 'image/webp':
                $srcImage = @imagecreatefromwebp($sourcePath);
                break;
            case 'image/gif':
                $srcImage = @imagecreatefromgif($sourcePath);
                break;
        }

        if (!$srcImage) {
            // GD failed — store raw but truncate if too large
            return base64_encode($imageContent);
        }

        $origW = imagesx($srcImage);
        $origH = imagesy($srcImage);

        // Resize if wider than maxWidth
        if ($origW > $maxWidth) {
            $newW = $maxWidth;
            $newH = (int) round($origH * ($maxWidth / $origW));
            $resized = imagecreatetruecolor($newW, $newH);
            imagecopyresampled($resized, $srcImage, 0, 0, 0, 0, $newW, $newH, $origW, $origH);
            imagedestroy($srcImage);
            $srcImage = $resized;
        }

        // Encode as JPEG at 75% quality into a buffer
        ob_start();
        imagejpeg($srcImage, null, 75);
        $compressed = ob_get_clean();
        imagedestroy($srcImage);

        return base64_encode($compressed);
    }
}
