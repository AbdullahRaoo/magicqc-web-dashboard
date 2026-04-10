import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import InputError from '@/components/input-error';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { Shield, Lock, Eye, EyeOff, User, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

export default function SystemLogin() {
    const [showPassword, setShowPassword] = useState(false);
    const { data, setData, post, processing, errors } = useForm({
        username: '',
        password: '',
        remember: false,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post('/system-login');
    };

    return (
        <>
            <Head title="Login">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700,800&family=space-grotesk:400,500,600,700" rel="stylesheet" />
                <style>{`
                    .font-display { font-family: 'Space Grotesk', 'Inter', sans-serif; }
                    @keyframes pulse-glow { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
                    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-15px); } }
                    @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                    .animate-slide-up { animation: slide-up 0.6s ease-out forwards; }
                    .animate-slide-up-delay { animation: slide-up 0.6s ease-out 0.15s forwards; opacity: 0; }
                    .animate-slide-up-delay-2 { animation: slide-up 0.6s ease-out 0.3s forwards; opacity: 0; }
                `}</style>
            </Head>

            <div className="flex min-h-screen items-center justify-center p-6 relative overflow-hidden" style={{ background: '#0a0f1a', fontFamily: "'Inter', sans-serif" }}>
                {/* Background effects */}
                <div className="absolute inset-0">
                    <div className="absolute top-1/4 right-1/3 h-[500px] w-[500px] rounded-full bg-[#264c59]/15 blur-[120px]" style={{ animation: 'pulse-glow 4s ease-in-out infinite' }} />
                    <div className="absolute bottom-1/4 left-1/3 h-[400px] w-[400px] rounded-full bg-[#f7a536]/8 blur-[100px]" style={{ animation: 'pulse-glow 4s ease-in-out 2s infinite' }} />
                    <div
                        className="absolute inset-0 opacity-[0.02]"
                        style={{
                            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                            backgroundSize: '60px 60px',
                        }}
                    />
                </div>

                {/* Floating shapes */}
                <div className="absolute top-20 left-[15%] w-12 h-12 border border-[#f7a536]/15 rounded-lg rotate-12" style={{ animation: 'float 6s ease-in-out infinite' }} />
                <div className="absolute bottom-32 right-[15%] w-16 h-16 border border-white/5 rounded-2xl -rotate-12" style={{ animation: 'float 6s ease-in-out 3s infinite' }} />
                <div className="absolute top-1/2 left-[8%] w-8 h-8 bg-gradient-to-br from-[#f7a536]/10 to-transparent rounded-full" style={{ animation: 'float 5s ease-in-out 1s infinite' }} />

                <div className="relative w-full max-w-md">
                    {/* Back link */}
                    <div className="animate-slide-up mb-6">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 text-sm text-white/30 hover:text-white/60 transition-colors duration-300"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Home
                        </Link>
                    </div>

                    {/* Login Card */}
                    <div className="animate-slide-up-delay rounded-2xl border border-white/[0.08] overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)' }}>
                        {/* Gradient accent */}
                        <div className="h-1 bg-gradient-to-r from-[#f7a536] via-[#e8563f] to-[#f7a536]" />

                        {/* Header */}
                        <div className="pt-10 pb-2 text-center px-8">
                            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f7a536]/20 to-[#e8563f]/10 border border-[#f7a536]/20">
                                <Shield className="h-8 w-8 text-[#f7a536]" />
                            </div>
                            <h1 className="font-display text-2xl font-bold text-white">Welcome Back</h1>
                            <p className="text-sm text-white/30 mt-2">Sign in to your account</p>
                        </div>

                        {/* Form */}
                        <div className="px-8 pb-8 pt-4">
                            <form onSubmit={submit} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="username" className="text-sm font-medium text-white/50">
                                        Username
                                    </Label>
                                    <div className="relative">
                                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                        <Input
                                            id="username"
                                            type="text"
                                            name="username"
                                            value={data.username}
                                            className="h-12 pl-11 text-base bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-[#f7a536]/40 focus:ring-[#f7a536]/20 rounded-xl transition-all duration-300 hover:border-white/15"
                                            placeholder="Enter username"
                                            onChange={(e) => setData('username', e.target.value)}
                                            required
                                            autoFocus
                                            autoComplete="username"
                                        />
                                    </div>
                                    <InputError message={errors.username} className="mt-1" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-sm font-medium text-white/50">
                                        Password
                                    </Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                        <Input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={data.password}
                                            className="h-12 pl-11 pr-12 text-base bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-[#f7a536]/40 focus:ring-[#f7a536]/20 rounded-xl transition-all duration-300 hover:border-white/15"
                                            placeholder="Enter password"
                                            onChange={(e) => setData('password', e.target.value)}
                                            required
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors duration-300"
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-5 w-5" />
                                            ) : (
                                                <Eye className="h-5 w-5" />
                                            )}
                                        </button>
                                    </div>
                                    <InputError message={errors.password} className="mt-1" />
                                </div>

                                <div className="flex items-center gap-3">
                                    <input
                                        id="remember"
                                        type="checkbox"
                                        checked={data.remember}
                                        onChange={(e) => setData('remember', e.target.checked)}
                                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#f7a536] focus:ring-[#f7a536]/30"
                                    />
                                    <Label htmlFor="remember" className="text-sm text-white/55">
                                        Keep me logged in
                                    </Label>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-12 text-base font-semibold text-white bg-gradient-to-r from-[#f7a536] to-[#e8563f] hover:shadow-lg hover:shadow-[#f7a536]/25 transition-all duration-300 hover:scale-[1.02] rounded-xl border-0"
                                    disabled={processing}
                                >
                                    {processing ? (
                                        <span className="flex items-center gap-2 text-white">
                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            Authenticating...
                                        </span>
                                    ) : (
                                        <span className="text-white">Sign In</span>
                                    )}
                                </Button>
                            </form>
                        </div>
                    </div>

                    {/* Footer text */}
                    <p className="animate-slide-up-delay-2 mt-6 text-center text-xs text-white/15">
                        MagicQC Quality Control System &bull; Secured Access
                    </p>
                </div>
            </div>
        </>
    );
}
