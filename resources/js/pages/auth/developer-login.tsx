import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import InputError from '@/components/input-error';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { Code2, Lock, Eye, EyeOff, ArrowLeft, Terminal } from 'lucide-react';
import { useState } from 'react';

export default function DeveloperLogin() {
    const [showPassword, setShowPassword] = useState(false);
    const { data, setData, post, processing, errors } = useForm({
        password: '',
        remember: false,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post('/developer-login');
    };

    return (
        <>
            <Head title="Developer Login">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700,800&family=space-grotesk:400,500,600,700&family=jetbrains-mono:400,500" rel="stylesheet" />
                <style>{`
                    .font-display { font-family: 'Space Grotesk', 'Inter', sans-serif; }
                    .font-mono { font-family: 'JetBrains Mono', monospace; }
                    @keyframes pulse-glow { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
                    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-15px); } }
                    @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
                    .animate-slide-up { animation: slide-up 0.6s ease-out forwards; }
                    .animate-slide-up-delay { animation: slide-up 0.6s ease-out 0.15s forwards; opacity: 0; }
                    .animate-slide-up-delay-2 { animation: slide-up 0.6s ease-out 0.3s forwards; opacity: 0; }
                    .animate-blink { animation: blink 1s step-end infinite; }
                `}</style>
            </Head>

            <div className="flex min-h-screen items-center justify-center p-6 relative overflow-hidden" style={{ background: '#0a0f1a', fontFamily: "'Inter', sans-serif" }}>
                {/* Background effects — green/emerald tint for developer theme */}
                <div className="absolute inset-0">
                    <div className="absolute top-1/3 right-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/8 blur-[120px]" style={{ animation: 'pulse-glow 4s ease-in-out infinite' }} />
                    <div className="absolute bottom-1/3 left-1/4 h-[400px] w-[400px] rounded-full bg-cyan-500/6 blur-[100px]" style={{ animation: 'pulse-glow 4s ease-in-out 2s infinite' }} />
                    <div
                        className="absolute inset-0 opacity-[0.02]"
                        style={{
                            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                            backgroundSize: '60px 60px',
                        }}
                    />
                </div>

                {/* Floating shapes */}
                <div className="absolute top-24 right-[18%] w-10 h-10 border border-emerald-500/15 rounded-lg rotate-45" style={{ animation: 'float 6s ease-in-out infinite' }} />
                <div className="absolute bottom-28 left-[12%] w-14 h-14 border border-white/5 rounded-xl -rotate-12" style={{ animation: 'float 6s ease-in-out 2s infinite' }} />
                <div className="absolute top-1/3 left-[10%] w-6 h-6 bg-emerald-500/10 rounded-full" style={{ animation: 'float 5s ease-in-out 1s infinite' }} />

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
                        {/* Gradient accent — green for dev */}
                        <div className="h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500" />

                        {/* Terminal-style header */}
                        <div className="pt-10 pb-2 text-center px-8">
                            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/20">
                                <Terminal className="h-8 w-8 text-emerald-400" />
                            </div>
                            <h1 className="font-display text-2xl font-bold text-white">Developer Access</h1>
                            <p className="text-sm text-white/30 mt-2">
                                <span className="font-mono text-emerald-400/60 text-xs">$</span>{' '}
                                <span className="text-white/40 font-mono text-xs">authenticate --mode=dev</span>
                                <span className="animate-blink text-emerald-400 font-mono">_</span>
                            </p>
                        </div>

                        {/* Form */}
                        <div className="px-8 pb-8 pt-4">
                            <form onSubmit={submit} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-sm font-medium text-white/50">
                                        Access Key
                                    </Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                        <Input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={data.password}
                                            className="h-12 pl-11 pr-12 text-base bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-emerald-500/40 focus:ring-emerald-500/20 rounded-xl transition-all duration-300 hover:border-white/15 font-mono"
                                            placeholder="Enter developer password"
                                            onChange={(e) => setData('password', e.target.value)}
                                            required
                                            autoFocus
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
                                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30"
                                    />
                                    <Label htmlFor="remember" className="text-sm text-white/55">
                                        Keep me logged in
                                    </Label>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-12 text-base font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-600 hover:shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:scale-[1.02] rounded-xl border-0"
                                    disabled={processing}
                                >
                                    {processing ? (
                                        <span className="flex items-center gap-2 text-white">
                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            Verifying...
                                        </span>
                                    ) : (
                                        <>
                                            <Code2 className="mr-2 h-5 w-5 text-white" />
                                            <span className="text-white">Access Developer Mode</span>
                                        </>
                                    )}
                                </Button>
                            </form>
                        </div>
                    </div>

                    {/* Footer */}
                    <p className="animate-slide-up-delay-2 mt-6 text-center text-xs text-white/15">
                        Restricted access &bull; Authorized developers only
                    </p>
                </div>
            </div>
        </>
    );
}
