/**
 * Plain-language presentation of the deterministic eligibility engine's four
 * result states. The engine's result shape and enum values are unchanged;
 * this file only decides what users read.
 *
 * The engine (server/eligibility.ts) returns:
 *   ELIGIBLE             — no unmet criteria, no missing inputs, no advisories
 *   POTENTIALLY_ELIGIBLE — no unmet criteria, but one missing input or an advisory
 *   MISSING_INFO         — two or more missing inputs, so no conclusion was possible
 *   NOT_ELIGIBLE         — at least one criterion is unmet (or the deadline passed)
 */

export type EligibilityEngineStatus =
  | 'ELIGIBLE'
  | 'POTENTIALLY_ELIGIBLE'
  | 'MISSING_INFO'
  | 'NOT_ELIGIBLE';

export interface EligibilityStateCopy {
  status: EligibilityEngineStatus;
  /** Short user-facing label. */
  label: string;
  /** One sentence: what this result means. */
  meaning: string;
  /** One sentence: what the student can do next. */
  nextAction: string;
}

export const ELIGIBILITY_STATE_COPY: Record<EligibilityEngineStatus, EligibilityStateCopy> = {
  ELIGIBLE: {
    status: 'ELIGIBLE',
    label: 'Eligible',
    meaning:
      'Every published requirement we could check is satisfied by your saved profile.',
    nextAction:
      'Open the official source link to confirm current details, then start preparing your application.',
  },
  NOT_ELIGIBLE: {
    status: 'NOT_ELIGIBLE',
    label: 'Not eligible',
    meaning:
      'At least one published requirement is not met (or the deadline has passed), so an application is unlikely to succeed right now.',
    nextAction:
      'Read the unmet criteria below and focus on opportunities that match your current profile.',
  },
  POTENTIALLY_ELIGIBLE: {
    status: 'POTENTIALLY_ELIGIBLE',
    label: 'Needs more information',
    meaning:
      'No requirement is clearly failed, but one profile detail is missing or sits just below a published cutoff, so the check is incomplete.',
    nextAction:
      'Complete the missing field or review the advisory note below, then confirm on the official page.',
  },
  MISSING_INFO: {
    status: 'MISSING_INFO',
    label: 'Not evaluated yet',
    meaning:
      'Two or more profile details needed for the check are missing, so no eligibility conclusion was possible.',
    nextAction:
      'Fill in the missing profile fields and save to run the check again.',
  },
};

/** Shown with every eligibility result: an estimate, never an official decision. */
export const ELIGIBILITY_ESTIMATE_NOTICE =
  'Automated estimate from your saved profile and the published requirements on record — not an official admission or funding decision.';

/** Ordered list used for legends and filters. */
export const ELIGIBILITY_STATE_ORDER: EligibilityEngineStatus[] = [
  'ELIGIBLE',
  'POTENTIALLY_ELIGIBLE',
  'MISSING_INFO',
  'NOT_ELIGIBLE',
];

/**
 * Returns the presentation copy for an engine status value, or null for
 * anything that is not one of the four engine states (the engine enum is the
 * source of truth; unknown values are never given invented copy).
 */
export function eligibilityStateCopy(
  status: string | null | undefined
): EligibilityStateCopy | null {
  if (
    status === 'ELIGIBLE' ||
    status === 'POTENTIALLY_ELIGIBLE' ||
    status === 'MISSING_INFO' ||
    status === 'NOT_ELIGIBLE'
  ) {
    return ELIGIBILITY_STATE_COPY[status];
  }
  return null;
}
