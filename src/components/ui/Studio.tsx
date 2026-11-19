import React from 'react';
import { ArrowUpRight, Orbit } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export interface StudioPageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  context?: React.ReactNode;
}

/** Shared editorial header used by the integrated product workspaces. */
export function StudioPageHeader({
  eyebrow,
  title,
  description,
  icon,
  action,
  context,
}: StudioPageHeaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.header
      className="pp-studio-header"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pp-studio-header-grid" aria-hidden="true" />
      <div className="pp-studio-header-copy">
        <p className="pp-studio-eyebrow">
          <span className="pp-studio-eyebrow-mark" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1>{title}</h1>
        <p className="pp-studio-description">{description}</p>
        {context && <div className="pp-studio-context">{context}</div>}
      </div>
      <div className="pp-studio-header-aside">
        {action && <div className="pp-studio-header-action">{action}</div>}
        <div className="pp-studio-mark" aria-hidden="true">
          <span className="pp-studio-mark-orbit pp-studio-mark-orbit-one" />
          <span className="pp-studio-mark-orbit pp-studio-mark-orbit-two" />
          <span className="pp-studio-mark-core">{icon || <Orbit className="h-5 w-5" />}</span>
        </div>
      </div>
    </motion.header>
  );
}

export function StudioSectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pp-studio-section-heading">
      <div>
        {eyebrow && <p className="pp-studio-section-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action && <div className="pp-studio-section-action">{action}</div>}
    </div>
  );
}

export function StudioMetric({
  label,
  value,
  detail,
  icon,
  action,
  tone = 'lime',
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'lime' | 'sage' | 'amber' | 'neutral';
}) {
  return (
    <article className={`pp-studio-metric is-${tone}`}>
      <div className="pp-studio-metric-top">
        <span>{label}</span>
        {icon && <span className="pp-studio-metric-icon" aria-hidden="true">{icon}</span>}
      </div>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
      {action && <div className="pp-studio-metric-action">{action}</div>}
    </article>
  );
}

export function StudioSurface({
  children,
  className = '',
  as: Element = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return <Element className={`pp-studio-surface ${className}`.trim()}>{children}</Element>;
}

export function StudioSourceNote({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'caution' | 'success';
}) {
  return (
    <div className={`pp-studio-source-note is-${tone}`}>
      <span className="pp-studio-source-note-dot" aria-hidden="true" />
      <p>{children}</p>
      <ArrowUpRight className="pp-studio-source-note-arrow" aria-hidden="true" />
    </div>
  );
}
