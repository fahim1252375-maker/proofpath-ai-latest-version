/**
 * Application workflow rules — pure, no DOM, no fetches.
 *
 * Transition rule (owner decision, Stage 4):
 *  - Open stages (researching, preparing, submitted, interview) may move to
 *    any other open stage, including staying where they are.
 *  - `accepted` is terminal: no transition out of it.
 *  - `rejected` may only move back to `researching` or `preparing` — never
 *    directly to `submitted`, `interview`, or `accepted`.
 */

export type ApplicationStatus =
  | 'researching'
  | 'preparing'
  | 'submitted'
  | 'interview'
  | 'accepted'
  | 'rejected';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'researching',
  'preparing',
  'submitted',
  'interview',
  'accepted',
  'rejected',
];

const OPEN_STATUSES: ApplicationStatus[] = ['researching', 'preparing', 'submitted', 'interview'];

const CLOSED_STATUSES: ApplicationStatus[] = ['submitted', 'accepted', 'rejected'];

export interface WorkflowApplication {
  id: string;
  title: string;
  status: string;
  deadline: string;
  checklist: Array<{ label?: string; done?: boolean }>;
}

export function canTransition(from: string, to: string): boolean {
  if (from === to) return true; // keeping the current stage is always allowed
  if (from === 'accepted') return false;
  if (from === 'rejected') return to === 'researching' || to === 'preparing';
  return OPEN_STATUSES.includes(to as ApplicationStatus);
}

/** One-line reason for a blocked transition, or null when allowed. */
export function transitionBlockReason(from: string, to: string): string | null {
  if (canTransition(from, to)) return null;
  if (from === 'accepted') {
    return 'Accepted is a final stage — no further stage changes.';
  }
  if (from === 'rejected') {
    return `From Rejected you can only return to Researching or Preparing — not directly to ${capitalize(to)}.`;
  }
  return 'This stage is closed; reopen tracking is not allowed from here.';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days until a YYYY-MM-DD deadline, measured from the start of `today`
 * (local time). 0 = due today; negative = the date has passed.
 */
export function daysUntilDeadline(deadline: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline || '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as unknown as [number, number, number, number];
  const due = new Date(year, month - 1, day);
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - startOfToday.getTime()) / DAY_MS);
}

/**
 * Overdue rule (owner decision): the deadline date has passed AND the status
 * is not one of submitted / accepted / rejected. A deadline due today is not
 * yet overdue.
 */
export function isOverdue(
  deadline: string,
  status: string,
  now: Date = new Date()
): boolean {
  if (CLOSED_STATUSES.includes(status as ApplicationStatus)) return false;
  const days = daysUntilDeadline(deadline, now);
  return days !== null && days < 0;
}

/**
 * Progress derived only from stored checklist state — never typed in.
 * Mirrors the page's existing computeReadiness checklist math.
 */
export function applicationProgress(app: {
  checklist: Array<{ done?: boolean }>;
}): { done: number; total: number; percent: number } {
  const list = app.checklist ?? [];
  const total = list.length;
  const done = list.filter((step) => step.done === true).length;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export interface FocusAction {
  applicationId: string;
  applicationTitle: string;
  kind: 'deadline' | 'checklist';
  /** Human-readable action line. */
  label: string;
  detail?: string;
  /** Days left for deadline actions (negative = overdue); null for checklist. */
  daysLeft: number | null;
}

/**
 * Focus Mode: at most `max` (default 3) actions.
 *  - Group 1 (first): deadline-based actions for every ACTIVE application
 *    (open statuses only), ordered by days left ascending — overdue first.
 *    Ties break deterministically by application id.
 *  - Group 2 (after all deadline actions): incomplete checklist items for each
 *    active application, applications ordered by deadline, items in stored
 *    order.
 * Total output is capped at `max` across both groups.
 */
export function focusActions(
  applications: readonly WorkflowApplication[],
  now: Date = new Date(),
  max: number = 3
): FocusAction[] {
  const active = applications.filter(
    (app) => app.status !== 'accepted' && app.status !== 'rejected'
  );

  const deadlineActions: Array<FocusAction & { sortDays: number }> = [];
  for (const app of active) {
    const days = daysUntilDeadline(app.deadline, now);
    if (days === null) continue;
    deadlineActions.push({
      applicationId: app.id,
      applicationTitle: app.title,
      kind: 'deadline',
      label:
        days < 0
          ? `Overdue — deadline was ${Math.abs(days)} day(s) ago`
          : days === 0
          ? 'Deadline is today'
          : `Deadline in ${days} day(s)`,
      detail: `Stage: ${app.status}`,
      daysLeft: days,
      sortDays: days,
    });
  }
  deadlineActions.sort((a, b) => a.sortDays - b.sortDays || a.applicationId.localeCompare(b.applicationId));

  const checklistActions: Array<FocusAction & { sortDays: number; order: number }> = [];
  for (const app of active) {
    const days = daysUntilDeadline(app.deadline, now);
    const sortDays = days === null ? Number.MAX_SAFE_INTEGER : days;
    (app.checklist ?? []).forEach((step, index) => {
      if (step.done === true) return;
      checklistActions.push({
        applicationId: app.id,
        applicationTitle: app.title,
        kind: 'checklist',
        label: step.label ? `Finish checklist step: ${step.label}` : 'Finish an unnamed checklist step',
        detail: `Stage: ${app.status}`,
        daysLeft: null,
        sortDays,
        order: index,
      });
    });
  }
  checklistActions.sort(
    (a, b) => a.sortDays - b.sortDays || a.applicationId.localeCompare(b.applicationId) || a.order - b.order
  );

  return [...deadlineActions, ...checklistActions]
    .slice(0, max)
    .map((item) => ({
      applicationId: item.applicationId,
      applicationTitle: item.applicationTitle,
      kind: item.kind,
      label: item.label,
      detail: item.detail,
      daysLeft: item.daysLeft,
    }));
}
