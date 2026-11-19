import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  LockKeyhole,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface NotificationPreferences {
  inAppDeadlines: boolean;
  inAppVerifications: boolean;
  inAppApplications: boolean;
  inAppSecurity: boolean;
  deadlineDaysBefore: number;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  inAppDeadlines: true,
  inAppVerifications: true,
  inAppApplications: true,
  inAppSecurity: true,
  deadlineDaysBefore: 14,
};

const cardClass =
  'rounded-2xl border border-[#E4E8E0] bg-white p-5 sm:p-6 dark:border-[#232D27] dark:bg-[#141B17]';
const inputClass =
  'mt-1.5 h-10 w-full rounded-lg border border-[#D7DDD0] bg-[#F7F7F0] px-3 text-sm text-[#101713] outline-none transition focus:border-[#71856D] focus:ring-2 focus:ring-[#C5F36A]/30 dark:border-[#303B33] dark:bg-[#0C110E] dark:text-[#F7F7F0]';

const notificationOptions: Array<{
  key: 'inAppDeadlines' | 'inAppVerifications' | 'inAppApplications' | 'inAppSecurity';
  label: string;
  description: string;
}> = [
  { key: 'inAppDeadlines', label: 'Application deadline reminders', description: 'Remind me before saved opportunity deadlines.' },
  { key: 'inAppVerifications', label: 'Verification updates', description: 'Notify me when a verification audit is completed.' },
  { key: 'inAppApplications', label: 'Application activity', description: 'Notify me about application-stage changes.' },
  { key: 'inAppSecurity', label: 'Security alerts', description: 'Notify me about important account security events.' },
];

export function SettingsPage() {
  const { user, refreshSession, addToast, themePreference, setThemePreference } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'bn'>(
    user?.preferredLanguage || 'en'
  );
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const loadNotificationPreferences = async () => {
    setPreferencesLoading(true);
    setPreferencesError('');
    try {
      const result = await apiRequest<{ preferences: NotificationPreferences }>(
        '/api/notifications/preferences'
      );
      setPreferences(result.preferences);
    } catch (err) {
      setPreferencesError(err instanceof Error ? err.message : 'Could not load notification preferences.');
    } finally {
      setPreferencesLoading(false);
    }
  };

  useEffect(() => {
    void loadNotificationPreferences();
  }, []);

  const handleSaveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingAccount(true);
    try {
      await apiRequest('/api/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: fullName.trim(), preferredLanguage }),
      });
      await refreshSession();
      addToast({ type: 'success', title: 'Account preferences saved' });
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Could not save account preferences' });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveNotifications = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingNotifications(true);
    try {
      await apiRequest('/api/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
      });
      addToast({ type: 'success', title: 'Notification preferences saved' });
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Could not save notification preferences' });
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('The new password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Use at least 8 characters for your new password.');
      return;
    }
    setChangingPassword(true);
    try {
      const result = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast({ type: 'success', title: 'Password updated', description: result.message });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const themeOptions = [
    { value: 'system' as const, label: 'System', detail: 'Follow your device setting', icon: Monitor },
    { value: 'light' as const, label: 'Light', detail: 'Use the light appearance', icon: Sun },
    { value: 'dark' as const, label: 'Dark', detail: 'Use the dark appearance', icon: Moon },
  ];

  return (
    <div className="pp-depth-page pp-depth-settings mx-auto max-w-3xl space-y-6 pb-8">
      <header>
        <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
          Workspace Preferences
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-[#101713] sm:text-3xl dark:text-[#F7F7F0]">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5E6B5B] dark:text-[#8C9A88]">
          Manage your account, appearance, assistant language, notifications, and sign-in security.
        </p>
      </header>

      <section className={cardClass} aria-labelledby="appearance-heading">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#F0F3E9] p-2.5 text-[#40513D] dark:bg-[#202B22] dark:text-[#C5F36A]">
            <Sun className="h-5 w-5" />
          </div>
          <div>
            <h2 id="appearance-heading" className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">Appearance</h2>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">This setting is saved on this device and applies immediately.</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const selected = themePreference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setThemePreference(option.value)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8FA66A] ${
                  selected
                    ? 'border-[#879B64] bg-[#F5F7EE] dark:border-[#C5F36A] dark:bg-[#1D2920]'
                    : 'border-[#E4E8E0] hover:bg-[#F7F7F0] dark:border-[#303B33] dark:hover:bg-[#1D2520]'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0 text-[#5E6B5B] dark:text-[#C5F36A]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">{option.detail}</span>
                </span>
                {selected && <Check className="h-4 w-4 shrink-0 text-[#536F38] dark:text-[#C5F36A]" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className={cardClass} aria-labelledby="account-heading">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#F0F3E9] p-2.5 text-[#40513D] dark:bg-[#202B22] dark:text-[#C5F36A]">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h2 id="account-heading" className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">Account preferences</h2>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Update your workspace name and the language used by the AI assistant.</p>
          </div>
        </div>
        <form onSubmit={handleSaveAccount} className="mt-5 space-y-4">
          <div>
            <label htmlFor="settings-email" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Account email</label>
            <input id="settings-email" value={user?.email || ''} readOnly className={`${inputClass} cursor-not-allowed opacity-70`} />
            <p className="mt-1 text-[11px] text-[#788473] dark:text-[#8C9A88]">Email address is read-only here.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-name" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Full name</label>
              <input id="settings-name" type="text" minLength={2} maxLength={120} required value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} autoComplete="name" />
            </div>
            <div>
              <label htmlFor="settings-language" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">AI assistant language</label>
              <select id="settings-language" value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value as 'en' | 'bn')} className={inputClass}>
                <option value="en">English</option>
                <option value="bn">Bengali (বাংলা)</option>
              </select>
              <p className="mt-1 text-[11px] text-[#788473] dark:text-[#8C9A88]">This controls assistant responses, not every page in the interface.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingAccount || fullName.trim().length < 2} className="rounded-lg bg-[#101713] px-5 py-2.5 text-xs font-semibold text-[#C5F36A] transition hover:bg-[#1D2520] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713]">
              {savingAccount ? 'Saving…' : 'Save account preferences'}
            </button>
          </div>
        </form>
      </section>

      <section className={cardClass} aria-labelledby="notifications-heading">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#F0F3E9] p-2.5 text-[#40513D] dark:bg-[#202B22] dark:text-[#C5F36A]">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 id="notifications-heading" className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">Notifications</h2>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Choose which in-app events appear in your notification centre.</p>
          </div>
        </div>
        {preferencesLoading ? (
          <p className="mt-5 text-sm text-[#5E6B5B] dark:text-[#8C9A88]" role="status">Loading saved notification preferences…</p>
        ) : preferencesError ? (
          <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <p>{preferencesError}</p>
            <button type="button" onClick={() => void loadNotificationPreferences()} className="mt-2 font-semibold underline">Try again</button>
          </div>
        ) : (
          <form onSubmit={handleSaveNotifications} className="mt-5 space-y-4">
            <div className="divide-y divide-[#E4E8E0] dark:divide-[#303B33]">
              {notificationOptions.map((option) => (
                <label key={option.key} className="flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <input type="checkbox" checked={preferences[option.key]} onChange={(event) => setPreferences((previous) => ({ ...previous, [option.key]: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-[#B7C1B1] accent-[#536F38]" />
                  <span>
                    <span className="block text-sm font-medium text-[#101713] dark:text-[#F7F7F0]">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-[#5E6B5B] dark:text-[#8C9A88]">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-[#E4E8E0] pt-4 dark:border-[#303B33] sm:flex-row sm:items-end sm:justify-between">
              <div>
                <label htmlFor="deadline-days" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Deadline reminder window</label>
                <p className="mt-1 text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">Number of days before a deadline.</p>
                <input id="deadline-days" type="number" min={1} max={60} required value={preferences.deadlineDaysBefore} onChange={(event) => {
                  const value = Number(event.target.value);
                  setPreferences((previous) => ({ ...previous, deadlineDaysBefore: Number.isFinite(value) ? Math.min(60, Math.max(1, value)) : 14 }));
                }} className={`${inputClass} w-28 tabular-nums`} />
              </div>
              <button type="submit" disabled={savingNotifications} className="rounded-lg bg-[#101713] px-5 py-2.5 text-xs font-semibold text-[#C5F36A] transition hover:bg-[#1D2520] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713]">
                {savingNotifications ? 'Saving…' : 'Save notification preferences'}
              </button>
            </div>
            <p className="text-[11px] text-[#788473] dark:text-[#8C9A88]">Email and push delivery are not enabled in this deployment. These controls affect in-app notifications only.</p>
          </form>
        )}
      </section>

      <section className={cardClass} aria-labelledby="security-heading">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#F0F3E9] p-2.5 text-[#40513D] dark:bg-[#202B22] dark:text-[#C5F36A]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h2 id="security-heading" className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">Password &amp; account security</h2>
            <p className="mt-1 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">Change your password. Other active sessions will be signed out after the update.</p>
          </div>
        </div>
        <form onSubmit={handleChangePassword} className="mt-5 space-y-4">
          <div>
            <label htmlFor="current-password" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Current password</label>
            <input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Confirm new password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
            </div>
          </div>
          {passwordError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">{passwordError}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={changingPassword || !currentPassword || newPassword.length < 8 || !confirmPassword} className="rounded-lg border border-[#C9D2C2] px-5 py-2.5 text-xs font-semibold text-[#233021] transition hover:bg-[#F7F7F0] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#3A493D] dark:text-[#E7EDE2] dark:hover:bg-[#1D2520]">
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-4 dark:border-[#232D27] dark:bg-[#0C110E]">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#536F38] dark:text-[#C5F36A]" />
          <div>
            <p className="text-xs font-semibold text-[#101713] dark:text-[#F7F7F0]">Privacy and verification reports</p>
            <p className="mt-1 text-xs leading-relaxed text-[#5E6B5B] dark:text-[#8C9A88]">
              Reports created while signed in are private to your account. The public verification feed is limited to anonymous submissions and the platform showcase report.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
