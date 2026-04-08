<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

// System Login Routes (Fixed Credentials: ManagerQC / MEB)
Route::get('system-login', [\App\Http\Controllers\Auth\FixedCredentialLoginController::class, 'showLoginForm'])
    ->name('system.login');
Route::post('system-login', [\App\Http\Controllers\Auth\FixedCredentialLoginController::class, 'login'])
    ->name('system.login.submit');
Route::post('system-logout', [\App\Http\Controllers\Auth\FixedCredentialLoginController::class, 'logout'])
    ->name('system.logout');

// Developer Login Routes
Route::get('developer-login', [\App\Http\Controllers\Auth\DeveloperLoginController::class, 'showLoginForm'])
    ->name('developer.login');
Route::post('developer-login', [\App\Http\Controllers\Auth\DeveloperLoginController::class, 'login'])
    ->name('developer.login.submit');
Route::post('developer-logout', [\App\Http\Controllers\Auth\DeveloperLoginController::class, 'logout'])
    ->name('developer.logout');

// Handle GET requests to Boost browser-logs route (browser prefetch, extensions, etc.)
// Returns 405 Method Not Allowed with Allow header indicating POST is supported
Route::get('/_boost/browser-logs', function () {
    return response()->json([
        'status' => 'error',
        'message' => 'Method not allowed. Use POST method to submit logs.'
    ], 405)->header('Allow', 'POST');
})->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class);

Route::middleware([\App\Http\Middleware\EnsureAuthenticatedOrDeveloper::class])->group(function () {
    Route::get('dashboard', function () {
        $totalBrands = \App\Models\Brand::count();
        $totalArticles = \App\Models\Article::count();
        $totalArticleTypes = \App\Models\ArticleType::count();
        $totalMeasurements = \App\Models\Measurement::count();
        $totalOperators = \App\Models\Operator::count();
        $totalPurchaseOrders = \App\Models\PurchaseOrder::count();
        
        return Inertia::render('dashboard', [
            'totalBrands' => $totalBrands,
            'totalArticles' => $totalArticles,
            'totalArticleTypes' => $totalArticleTypes,
            'totalMeasurements' => $totalMeasurements,
            'totalOperators' => $totalOperators,
            'totalPurchaseOrders' => $totalPurchaseOrders,
        ]);
    })->name('dashboard');

    Route::resource('operators', \App\Http\Controllers\OperatorController::class);
    Route::resource('brands', \App\Http\Controllers\BrandController::class);
    Route::resource('purchase-orders', \App\Http\Controllers\PurchaseOrderController::class);
    
    // Article Registration
    Route::prefix('article-registration')->group(function () {
        Route::get('/', [\App\Http\Controllers\ArticleRegistrationController::class, 'index'])
            ->name('article-registration.index');
        Route::post('/set-password', [\App\Http\Controllers\ArticleRegistrationController::class, 'setPassword'])
            ->name('article-registration.set-password');
        Route::post('/verify-password', [\App\Http\Controllers\ArticleRegistrationController::class, 'verifyPassword'])
            ->name('article-registration.verify-password');
        Route::get('/articles/{articleId}/sizes', [\App\Http\Controllers\ArticleRegistrationController::class, 'getSizes'])
            ->name('article-registration.get-sizes');
        Route::get('/articles/{articleId}/sizes/{size}/images', [\App\Http\Controllers\ArticleRegistrationController::class, 'getImages'])
            ->name('article-registration.get-images');
        
        // Calibration routes
        Route::get('/calibration', [\App\Http\Controllers\ArticleRegistrationController::class, 'getCalibration'])
            ->name('article-registration.get-calibration');
        Route::post('/calibration', [\App\Http\Controllers\ArticleRegistrationController::class, 'saveCalibration'])
            ->name('article-registration.save-calibration');
        Route::get('/calibrations', [\App\Http\Controllers\ArticleRegistrationController::class, 'getCalibrations'])
            ->name('article-registration.get-calibrations');
        Route::post('/calibrations/{calibrationId}/activate', [\App\Http\Controllers\ArticleRegistrationController::class, 'setActiveCalibration'])
            ->name('article-registration.set-active-calibration');
        Route::delete('/calibrations/{calibrationId}', [\App\Http\Controllers\ArticleRegistrationController::class, 'deleteCalibration'])
            ->name('article-registration.delete-calibration');
        
        // Annotation routes
        Route::post('/annotations', [\App\Http\Controllers\ArticleRegistrationController::class, 'saveAnnotation'])
            ->name('article-registration.save-annotation');
        Route::get('/annotations/{articleImageId}', [\App\Http\Controllers\ArticleRegistrationController::class, 'getAnnotation'])
            ->name('article-registration.get-annotation');
        Route::delete('/annotations/{annotationId}', [\App\Http\Controllers\ArticleRegistrationController::class, 'deleteAnnotation'])
            ->name('article-registration.delete-annotation');
    });
    
    // Articles nested under brands
    Route::prefix('brands/{brand}')->group(function () {
        // Get articles for a brand (for auto-populating in purchase orders)
        Route::get('articles-for-po', [\App\Http\Controllers\PurchaseOrderController::class, 'getBrandArticles'])
            ->name('brands.articles.for-po');
        
        Route::get('articles', [\App\Http\Controllers\ArticleController::class, 'index'])
            ->name('brands.articles.index');
        Route::get('articles/create', [\App\Http\Controllers\ArticleController::class, 'create'])
            ->name('brands.articles.create');
        Route::post('articles', [\App\Http\Controllers\ArticleController::class, 'store'])
            ->name('brands.articles.store');
        Route::get('articles/{article}', [\App\Http\Controllers\ArticleController::class, 'show'])
            ->name('brands.articles.show');
        Route::get('articles/{article}/edit', [\App\Http\Controllers\ArticleController::class, 'edit'])
            ->name('brands.articles.edit');
        Route::put('articles/{article}', [\App\Http\Controllers\ArticleController::class, 'update'])
            ->name('brands.articles.update');
        Route::delete('articles/{article}', [\App\Http\Controllers\ArticleController::class, 'destroy'])
            ->name('brands.articles.destroy');

        // Measurements nested under articles
        Route::prefix('articles/{article}')->group(function () {

            // Article Images routes
            Route::get('images', [\App\Http\Controllers\ArticleImageController::class, 'index'])
                ->name('brands.articles.images.index');
            Route::post('images', [\App\Http\Controllers\ArticleImageController::class, 'store'])
                ->name('brands.articles.images.store');
            Route::delete('images/{image}', [\App\Http\Controllers\ArticleImageController::class, 'destroy'])
                ->name('brands.articles.images.destroy');

            Route::get('measurements', [\App\Http\Controllers\MeasurementController::class, 'index'])
                ->name('brands.articles.measurements.index');
            Route::get('measurements/create', [\App\Http\Controllers\MeasurementController::class, 'create'])
                ->name('brands.articles.measurements.create');
            Route::post('measurements', [\App\Http\Controllers\MeasurementController::class, 'store'])
                ->name('brands.articles.measurements.store');
            Route::get('measurements/{measurement}', [\App\Http\Controllers\MeasurementController::class, 'show'])
                ->name('brands.articles.measurements.show');
            Route::get('measurements/{measurement}/edit', [\App\Http\Controllers\MeasurementController::class, 'edit'])
                ->name('brands.articles.measurements.edit');
            Route::put('measurements/{measurement}', [\App\Http\Controllers\MeasurementController::class, 'update'])
                ->name('brands.articles.measurements.update');
            Route::delete('measurements/{measurement}', [\App\Http\Controllers\MeasurementController::class, 'destroy'])
                ->name('brands.articles.measurements.destroy');
        });
    });

    // Annotation Upload (with password protection)
    Route::prefix('annotation-upload')->group(function () {
        Route::get('/', [\App\Http\Controllers\AnnotationUploadController::class, 'index'])
            ->name('annotation-upload.index');
        Route::post('/verify-password', [\App\Http\Controllers\AnnotationUploadController::class, 'verifyPassword'])
            ->name('annotation-upload.verify-password');
        Route::get('/articles/{articleId}/sizes', [\App\Http\Controllers\AnnotationUploadController::class, 'getSizes'])
            ->name('annotation-upload.get-sizes');
        Route::post('/upload', [\App\Http\Controllers\AnnotationUploadController::class, 'upload'])
            ->name('annotation-upload.upload');
        Route::get('/annotations', [\App\Http\Controllers\AnnotationUploadController::class, 'getAnnotations'])
            ->name('annotation-upload.get-annotations');
        Route::delete('/annotations/{id}', [\App\Http\Controllers\AnnotationUploadController::class, 'delete'])
            ->name('annotation-upload.delete');
    });
});

// Developer Settings (available to developer access only)
Route::middleware([\App\Http\Middleware\EnsureDeveloper::class])->group(function () {
    Route::get('developer-settings', [\App\Http\Controllers\DeveloperSettingsController::class, 'index'])
        ->name('developer.settings');
    Route::put('developer-settings/password', [\App\Http\Controllers\DeveloperSettingsController::class, 'updatePassword'])
        ->name('developer.settings.password');
});

// Analytics Dashboard (MEB only)
Route::middleware([\App\Http\Middleware\EnsureMEB::class])->group(function () {
    Route::get('analytics-dashboard', [\App\Http\Controllers\DirectorAnalyticsController::class, 'index'])
        ->name('director.analytics.dashboard');
    Route::get('analytics-dashboard/export/excel', [\App\Http\Controllers\DirectorAnalyticsController::class, 'exportExcel'])
        ->name('director.analytics.export.excel');
    Route::get('analytics-dashboard/export/pdf', [\App\Http\Controllers\DirectorAnalyticsController::class, 'exportPdf'])
        ->name('director.analytics.export.pdf');

    // Backward-compatible redirects
    Route::redirect('director-analytics-dashboard', '/analytics-dashboard');
    Route::redirect('director-analytics-dashboard/export/excel', '/analytics-dashboard/export/excel');
    Route::redirect('director-analytics-dashboard/export/pdf', '/analytics-dashboard/export/pdf');
});

// System Settings (available to both ManagerQC and MEB roles)
Route::middleware([\App\Http\Middleware\EnsureSystemRole::class])->group(function () {
    Route::get('system-settings', [\App\Http\Controllers\SystemSettingsController::class, 'index'])
        ->name('system.settings');
    Route::put('system-settings/username', [\App\Http\Controllers\SystemSettingsController::class, 'updateUsername'])
        ->name('system.settings.username');
    Route::put('system-settings/password', [\App\Http\Controllers\SystemSettingsController::class, 'updatePassword'])
        ->name('system.settings.password');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
