import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUSES,
  applicationProgress,
  canTransition,
  daysUntilDeadline,
  focusActions,
  isOverdue,
  transitionBlockReason,
  type WorkflowApplication,
} from '../src/lib/applicationWorkflow.ts';
// The page's own (now exported) deadline helper is pinned too — it must stay
// identical to the pure helper's math.
import { daysUntilDeadline as pageDaysUntilDeadline } from '../src/pages/ApplicationsPage.tsx';

const TODAY = new Date(2026, 10, 17, 12, 0, 0); // 2026-11-17 local noon

function app(overrides: Partial<WorkflowApplication> = {}): WorkflowApplication {
  return {
    id: 'app-1',
    title: 'DAAD EPOS Scholarship',
    status: 'preparing',
    deadline: '2027-01-15',
    checklist: [
      { label: 'Draft statement of purpose', done: false },
      { label: 'Request recommendation letters', done: true },
      { label: 'Upload transcripts', done: false },
    ],
    ...overrides,
  };
}

describe('daysUntilDeadline (regex fix pinned)', () => {
  it('parses a known ISO date against a known "today"', () => {
    // 2027-01-15 minus 2026-11-17 = 59 days
    expect(daysUntilDeadline('2027-01-15', TODAY)).toBe(59);
    expect(pageDaysUntilDeadline('2027-01-15', TODAY)).toBe(59);
  });

  it('returns 0 for a deadline due today and negative for a passed date', () => {
    expect(daysUntilDeadline('2026-11-17', TODAY)).toBe(0);
    expect(daysUntilDeadline('2026-11-16', TODAY)).toBe(-1);
  });

  it('returns null for anything that is not a date prefix (never a guess)', () => {
    expect(daysUntilDeadline('not-a-date', TODAY)).toBeNull();
    expect(daysUntilDeadline('', TODAY)).toBeNull();
  });

  it('the page helper and the pure helper agree exactly', () => {
    for (const deadline of ['2027-01-15', '2026-11-16', 'oops', '']) {
      expect(pageDaysUntilDeadline(deadline, TODAY)).toBe(daysUntilDeadline(deadline, TODAY));
    }
  });
});

describe('transition rules (owner decision)', () => {
  const OPEN = ['researching', 'preparing', 'submitted', 'interview'] as const;

  it('lets every open stage move to every open stage, including staying', () => {
    for (const from of OPEN) {
      for (const to of OPEN) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it('treats accepted as terminal: nothing moves out of it', () => {
    for (const to of APPLICATION_STATUSES) {
      expect(canTransition('accepted', to === 'accepted' ? 'accepted' : to)).toBe(
        to === 'accepted' ? true : false
      );
    }
    expect(transitionBlockReason('accepted', 'preparing')).toContain('final stage');
  });

  it('lets rejected return only to researching or preparing', () => {
    expect(canTransition('rejected', 'researching')).toBe(true);
    expect(canTransition('rejected', 'preparing')).toBe(true);
    expect(canTransition('rejected', 'submitted')).toBe(false);
    expect(canTransition('rejected', 'interview')).toBe(false);
    expect(canTransition('rejected', 'accepted')).toBe(false);
    expect(transitionBlockReason('rejected', 'submitted')).toContain('Researching or Preparing');
  });

  it('documented rule: open stages may not jump to closed stages they are not on', () => {
    // Open → open only; 'submitted' is open, so this example targets nothing closed.
    // The rule that matters: from any open stage, closed-stage targets are only
    // reachable because submitted IS open; accepted/rejected are never targets
    // from open stages under this rule.
    expect(canTransition('preparing', 'accepted')).toBe(false);
    expect(canTransition('preparing', 'rejected')).toBe(false);
    expect(transitionBlockReason('preparing', 'accepted')).not.toBeNull();
  });

  it('blocks at least one transition and explains it in one line', () => {
    expect(canTransition('accepted', 'researching')).toBe(false);
    const reason = transitionBlockReason('accepted', 'researching');
    expect(reason).toBeTruthy();
    expect(reason?.split('\n').length).toBe(1);
  });
});

describe('overdue detection (owner rule)', () => {
  it('is true when the deadline passed and the status is open', () => {
    expect(isOverdue('2026-11-16', 'preparing', TODAY)).toBe(true);
    expect(isOverdue('2026-11-01', 'researching', TODAY)).toBe(true);
  });

  it('is false on the boundary: a deadline due today is not overdue', () => {
    expect(isOverdue('2026-11-17', 'preparing', TODAY)).toBe(false);
  });

  it('is false for closed statuses even when the deadline passed', () => {
    for (const status of ['submitted', 'accepted', 'rejected']) {
      expect(isOverdue('2026-11-01', status, TODAY)).toBe(false);
    }
  });

  it('is false for unparseable deadlines rather than guessing', () => {
    expect(isOverdue('', 'preparing', TODAY)).toBe(false);
  });
});

describe('progress from stored data only', () => {
  it('counts done checklist steps from the stored list', () => {
    expect(applicationProgress(app())).toEqual({ done: 1, total: 3, percent: 33 });
  });

  it('is zero percent — not null — when the checklist exists but nothing is done', () => {
    const result = applicationProgress({ checklist: [{ done: false }, { done: false }] });
    expect(result).toEqual({ done: 0, total: 2, percent: 0 });
  });

  it('is 0/0 percent when there is no checklist', () => {
    expect(applicationProgress({ checklist: [] })).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe('focus actions (max three, deadline items first)', () => {
  it('puts overdue and soonest deadlines first, then checklist steps', () => {
    const actions = focusActions(
      [
        app({ id: 'far', deadline: '2027-06-01' }),
        app({ id: 'overdue', deadline: '2026-11-01', checklist: [{ label: 'Recover submission', done: false }] }),
        app({ id: 'soon', deadline: '2026-11-25' }),
      ],
      TODAY
    );
    expect(actions).toHaveLength(3);
    expect(actions.every((a) => a.kind === 'deadline')).toBe(true);
    expect(actions.map((a) => a.applicationId)).toEqual(['overdue', 'soon', 'far']);
    expect(actions[0].label).toContain('Overdue');
  });

  it('fills remaining slots with checklist steps after deadline actions, grouped by application deadline', () => {
    const actions = focusActions(
      [
        app({ id: 'a', deadline: '2027-06-01', checklist: [{ label: 'Step A1', done: false }, { label: 'Step A2', done: false }] }),
        app({ id: 'b', deadline: '2026-11-20', checklist: [{ label: 'Step B1', done: false }] }),
      ],
      TODAY
    );
    expect(actions).toHaveLength(3);
    expect(actions[0].kind).toBe('deadline');
    expect(actions[0].applicationId).toBe('b');
    const checklist = actions.filter((a) => a.kind === 'checklist');
    // Max three total: two deadline actions (b first, then a) leave one slot.
    expect(checklist.map((a) => a.label)).toEqual(['Finish checklist step: Step B1']);
  });

  it('breaks deadline ties deterministically by application id', () => {
    const actions = focusActions(
      [
        app({ id: 'b', deadline: '2027-01-15', checklist: [] }),
        app({ id: 'a', deadline: '2027-01-15', checklist: [] }),
      ],
      TODAY
    );
    expect(actions.map((a) => a.applicationId)).toEqual(['a', 'b']);
  });

  it('excludes closed applications (accepted, rejected) entirely', () => {
    const actions = focusActions(
      [
        app({ id: 'done', status: 'accepted', deadline: '2026-11-01', checklist: [{ label: 'x', done: false }] }),
        app({ id: 'fail', status: 'rejected', deadline: '2026-11-01', checklist: [{ label: 'y', done: false }] }),
        app({ id: 'open', deadline: '2026-11-01', checklist: [] }),
      ],
      TODAY
    );
    expect(actions.map((a) => a.applicationId)).toEqual(['open']);
  });

  it('returns an empty list when there are no active applications', () => {
    expect(focusActions([], TODAY)).toEqual([]);
    expect(focusActions([app({ status: 'accepted' })], TODAY)).toEqual([]);
  });

  it('caps at three actions total even with many checklist items', () => {
    const actions = focusActions(
      [app({ checklist: Array.from({ length: 10 }, (_, i) => ({ label: `Step ${i}`, done: false })) })],
      TODAY
    );
    expect(actions).toHaveLength(3);
  });
});
