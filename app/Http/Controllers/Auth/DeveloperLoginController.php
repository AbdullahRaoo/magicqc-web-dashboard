<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\ArticleRegistrationSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;

class DeveloperLoginController extends Controller
{
    /**
     * Show the developer login form.
     */
    public function showLoginForm()
    {
        // If already logged in as developer, redirect to dashboard
        if (session('is_developer')) {
            return redirect()->route('dashboard');
        }

        return Inertia::render('auth/developer-login');
    }

    /**
     * Handle developer login attempt.
     */
    public function login(Request $request)
    {
        $request->validate([
            'password' => 'required|string',
            'remember' => 'nullable|boolean',
        ]);

        // Get the annotation password from settings
        $hashedPassword = ArticleRegistrationSetting::getValue('password');

        if (!$hashedPassword) {
            return back()->withErrors([
                'password' => 'Developer access has not been configured yet.',
            ]);
        }

        // Verify password
        if (!Hash::check($request->password, $hashedPassword)) {
            return back()->withErrors([
                'password' => 'Incorrect password.',
            ]);
        }

        // Set developer session flag
        session(['is_developer' => true]);

        if ($request->boolean('remember')) {
            $rememberMinutes = (int) env('REMEMBER_LOGIN_MINUTES', 43200);
            $rememberPayload = Crypt::encryptString(json_encode([
                'type' => 'developer',
            ]));

            Cookie::queue(Cookie::make(
                'magicqc_remember_login',
                $rememberPayload,
                $rememberMinutes,
                '/',
                null,
                (bool) config('session.secure'),
                true,
                false,
                config('session.same_site', 'lax')
            ));
        } else {
            Cookie::queue(Cookie::forget('magicqc_remember_login'));
        }

        return redirect()->route('dashboard');
    }

    /**
     * Log out from developer session.
     */
    public function logout(Request $request)
    {
        session()->forget('is_developer');
        Cookie::queue(Cookie::forget('magicqc_remember_login'));
        
        return redirect()->route('home');
    }
}
