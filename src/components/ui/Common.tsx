import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Info,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import type { EligibilityStatus, VerificationStatus } from '../../types';
import { ELIGIBILITY_STATE_COPY } from '../../lib/eligibilityLabels';
import { useAuth } from '../../context/AuthContext';

export function VerificationStatusTag({ status }: { status: VerificationStatus }) {
  const config: Record<
    VerificationStatus,
    { label: string; icon: React.ReactNode; cls: string }
  > = {
    VERIFIED: {
      label: 'Verified',
      icon: <ShieldCheck className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-[#101713] bg-[#C5F36A]/45 border-[#9ECF42] dark:text-[#C5F36A] dark:bg-[#C5F36A]/10 dark:border-[#C5F36A]/40',
    },
    SUPPORTED: {
      label: 'Supported',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-[#1D2520] bg-[#EBF2E4] border-[#C6D5BC] dark:text-[#D5E6C8] dark:bg-[#1D2520] dark:border-[#344339]',
    },
    CONTRADICTED: {
      label: 'Contradicted',
      icon: <ShieldAlert className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-red-800 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/60 dark:border-red-800/80',
    },
    UNVERIFIED: {
      label: 'Unverified',
      icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/60 dark:border-amber-800/80',
    },
    INSUFFICIENT_EVIDENCE: {
      label: 'Insufficient Evidence',
      icon: <HelpCircle className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-[#4A554A] bg-[#F0F1EA] border-[#D7DDD0] dark:text-[#A9B5A6] dark:bg-[#1A221D] dark:border-[#2C3730]',
    },
    EXPIRED: {
      label: 'Expired',
      icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-[#5E6B5B] bg-[#F0F1EA] border-[#D7DDD0] dark:text-[#8C9A88] dark:bg-[#1A221D] dark:border-[#2C3730]',
    },
  };

  const c = config[status] || config.INSUFFICIENT_EVIDENCE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap shrink-0 ${c.cls}`}
    >
      {c.icon}
      <span>{c.label}</span>
    </span>
  );
}

export function EligibilityStatusTag({ status }: { status: EligibilityStatus }) {
  const map: Record<
    EligibilityStatus,
    { label: string; icon: React.ReactNode; cls: string }
  > = {
    ELIGIBLE: {
      label: 'Eligible',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-[#101713] bg-[#C5F36A]/45 border-[#9ECF42] dark:text-[#C5F36A] dark:bg-[#C5F36A]/10 dark:border-[#C5F36A]/40',
    },
    POTENTIALLY_ELIGIBLE: {
      label: ELIGIBILITY_STATE_COPY.POTENTIALLY_ELIGIBLE.label,
      icon: <Info className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-[#1D2520] bg-[#EBF2E4] border-[#C6D5BC] dark:text-[#D5E6C8] dark:bg-[#1D2520] dark:border-[#344339]',
    },
    NOT_ELIGIBLE: {
      label: ELIGIBILITY_STATE_COPY.NOT_ELIGIBLE.label,
      icon: <XCircle className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-red-800 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/60 dark:border-red-800',
    },
    MISSING_INFO: {
      label: ELIGIBILITY_STATE_COPY.MISSING_INFO.label,
      icon: <HelpCircle className="h-3.5 w-3.5 shrink-0" />,
      cls: 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/60 dark:border-amber-800',
    },
  };
  const c = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap shrink-0 ${c.cls}`}
    >
      {c.icon}
      <span>{c.label}</span>
    </span>
  );
}

export function SkeletonBlock({ className = 'h-6 w-full' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[#E4E8E0] dark:bg-[#1D2520] ${className}`}
      aria-hidden="true"
    />
  );
}

/** Scroll reveal that stays visible to assistive technology and skips motion when requested. */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.unobserve(element);
      },
      { threshold: 0.08, rootMargin: '0px 0px -5% 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={elementRef}
      className={`pp-reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{ '--reveal-delay': `${Math.max(0, Math.min(delay, 360))}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#CFD7C9] bg-white px-6 py-12 text-center dark:border-[#2C3730] dark:bg-[#141B17]">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] text-[#101713] dark:border-[#232D27] dark:bg-[#1D2520] dark:text-[#C5F36A]">
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold text-[#101713] dark:text-[#F7F7F0]">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-[#5E6B5B] dark:text-[#8C9A88]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101713]/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#E4E8E0] bg-white p-6 shadow-xl dark:border-[#232D27] dark:bg-[#141B17]">
        <h3 id="confirm-dialog-title" className="font-display text-base font-semibold text-[#101713] dark:text-[#F7F7F0]">
          {title}
        </h3>
        <p className="mt-2 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#E4E8E0] px-4 py-2 text-sm font-medium text-[#1D2520] hover:bg-[#F7F7F0] dark:border-[#232D27] dark:text-[#F7F7F0] dark:hover:bg-[#1D2520]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              destructive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-[#101713] text-[#F7F7F0] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713] dark:hover:bg-[#b5e458]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useAuth();
  if (!toasts.length) return null;
  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 rounded-xl border border-[#E4E8E0] bg-white p-4 shadow-lg dark:border-[#232D27] dark:bg-[#141B17]"
        >
          <div className="mt-0.5 shrink-0">
            {t.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-[#C5F36A]" />
            ) : t.type === 'error' ? (
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            ) : (
              <Info className="h-4 w-4 text-[#101713] dark:text-[#C5F36A]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">{t.title}</p>
            {t.description && (
              <p className="mt-0.5 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">{t.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="rounded p-1 text-[#8C9A88] hover:text-[#101713] dark:hover:text-[#F7F7F0]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-56 -translate-x-1/2 rounded-lg border border-[#232D27] bg-[#101713] px-2.5 py-1.5 text-xs text-[#F7F7F0] shadow-md group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Unexpected interface error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-12 max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center dark:border-red-900 dark:bg-[#141B17]">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
          <h2 className="mt-3 font-display text-lg font-semibold text-[#101713] dark:text-[#F7F7F0]">
            Something went wrong
          </h2>
          <p className="mt-1 text-sm text-[#5E6B5B] dark:text-[#8C9A88]">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-[#101713] px-4 py-2 text-sm font-medium text-[#F7F7F0] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
