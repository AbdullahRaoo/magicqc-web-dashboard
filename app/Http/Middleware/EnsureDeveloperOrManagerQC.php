<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureDeveloperOrManagerQC
{
    /**
     * Allow access to developer accounts and manager_qc system role only.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (session('is_developer') || session('auth_role') === 'manager_qc') {
            return $next($request);
        }

        if ($request->wantsJson()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return redirect()->route('home');
    }
}
