import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function LoginPage({ navigate }: { navigate: (path: string) => void }) {
  const { refreshSession, addToast } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await apiRequest<{ user: { role: string; fullName: string } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await refreshSession();
      addToast({ type: 'success', title: `Welcome back, ${data.user.fullName}` });
      navigate(data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pp-depth-page pp-depth-auth mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-[#E4E8E0] bg-white p-8 dark:border-[#232D27] dark:bg-[#141B17]">
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
          <ShieldCheck className="h-4 w-4" />
          <span>Encrypted Session Access</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">
          Sign in to ProofPath AI
        </h1>
        <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
          Access your verification audits, eligibility matrix, and application pipeline.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
                Password
              </label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs font-medium text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="h-10 w-full rounded-lg bg-[#101713] text-sm font-semibold text-[#F7F7F0] transition-colors hover:bg-[#1D2520] disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713] dark:hover:bg-[#b5e458]"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 border-t border-[#E4E8E0] pt-4 text-center text-xs text-[#5E6B5B] dark:border-[#232D27] dark:text-[#8C9A88]">
          New student?{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            Create a student account
          </button>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage({ navigate }: { navigate: (path: string) => void }) {
  const { refreshSession, addToast } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'bn'>('en');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, preferredLanguage }),
      });
      await refreshSession();
      addToast({ type: 'success', title: 'Account created', description: 'Welcome to ProofPath AI.' });
      navigate('/dashboard/eligibility');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pp-depth-page pp-depth-auth mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-[#E4E8E0] bg-white p-8 dark:border-[#232D27] dark:bg-[#141B17]">
        <h1 className="font-display text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">
          Create Student Account
        </h1>
        <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">
          Save verification reports, calculate your Opportunity Intelligence Score, and track deadlines.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
              Full Name
            </label>
            <input
              id="reg-name"
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
              Password (minimum 8 characters)
            </label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
            />
          </div>

          <div>
            <label htmlFor="reg-lang" className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
              Preferred AI Assistant Language
            </label>
            <select
              id="reg-lang"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value as 'en' | 'bn')}
              className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
            >
              <option value="en">English</option>
              <option value="bn">Bengali (বাংলা)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="h-10 w-full rounded-lg bg-[#101713] text-sm font-semibold text-[#F7F7F0] hover:bg-[#1D2520] disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713] dark:hover:bg-[#b5e458]"
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
          Already registered?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 underline-offset-4 dark:text-[#C5F36A]"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

export function ForgotPasswordPage({ navigate }: { navigate: (path: string) => void }) {
  const { addToast } = useAuth();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [infoMsg, setInfoMsg] = useState('');
  const [error, setError] = useState('');

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest<{ message: string; devResetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfoMsg(res.message);
      if (res.devResetToken) {
        setToken(res.devResetToken);
      }
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      addToast({ type: 'success', title: 'Password updated', description: 'You may now sign in.' });
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  return (
    <div className="pp-depth-page pp-depth-auth mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-[#E4E8E0] bg-white p-8 dark:border-[#232D27] dark:bg-[#141B17]">
        <h1 className="font-display text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">
          Reset Password
        </h1>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {infoMsg && (
          <div className="mt-4 rounded-lg border border-[#C5F36A] bg-[#C5F36A]/20 px-3 py-2 text-xs text-[#101713] dark:text-[#F7F7F0]">
            {infoMsg}
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
                Account Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
            <button
              type="submit"
              className="h-10 w-full rounded-lg bg-[#101713] text-sm font-semibold text-[#F7F7F0] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
            >
              Generate Reset Token
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
                Reset Token
              </label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 font-mono text-xs dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1D2520] dark:text-[#D5DDD2]">
                New Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm dark:border-[#232D27] dark:bg-[#0C110E]"
              />
            </div>
            <button
              type="submit"
              className="h-10 w-full rounded-lg bg-[#101713] text-sm font-semibold text-[#F7F7F0] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
            >
              Confirm New Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
