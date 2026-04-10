<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Symfony\Component\HttpFoundation\Response;

class RestoreRememberedLogin
{
    /**
     * Restore remembered login from encrypted cookie when session has expired.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (
            !session('is_developer')
            && !session('auth_role')
            && $request->hasCookie('magicqc_remember_login')
        ) {
            try {
                $payload = json_decode(Crypt::decryptString((string) $request->cookie('magicqc_remember_login')), true);

                if (($payload['type'] ?? null) === 'developer') {
                    session(['is_developer' => true]);
                }

                if (($payload['type'] ?? null) === 'system') {
                    if (in_array($payload['role'] ?? null, ['manager_qc', 'meb'], true)) {
                        session([
                            'auth_role' => $payload['role'],
                            'auth_username' => $payload['username'] ?? null,
                        ]);
                    }
                }
            } catch (\Throwable $e) {
                // Ignore invalid/expired remember cookie payloads silently.
            }
        }

        return $next($request);
    }
}
