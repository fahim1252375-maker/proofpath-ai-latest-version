import { describe, expect, it } from 'vitest';
import { getAdvisorWorkflows } from '../src/lib/advisorWorkflows.ts';

describe('guided AI advisor workflows', () => {
  it('provides four distinct, actionable English workflows', () => {
    const workflows = getAdvisorWorkflows('en');
    expect(workflows.map((workflow) => workflow.id)).toEqual(['roadmap', 'eligibility', 'statement', 'interview']);
    expect(workflows.every((workflow) => workflow.title.length > 0 && workflow.description.length > 0 && workflow.prompt.length > 80)).toBe(true);
  });

  it('provides localized Bengali workflow copy', () => {
    const workflows = getAdvisorWorkflows('bn');
    expect(workflows).toHaveLength(4);
    expect(workflows[0]?.title).toContain('৯০');
    expect(workflows[1]?.title).toContain('যোগ্যতার');
  });

  it('guards roadmap guidance against invented facts and deadlines', () => {
    const roadmap = getAdvisorWorkflows('en').find((workflow) => workflow.id === 'roadmap');
    expect(roadmap?.prompt).toContain('Do not invent');
    expect(roadmap?.prompt).toContain('deadlines explicitly present');
  });

  it('keeps eligibility uncertainty explicit', () => {
    const eligibility = getAdvisorWorkflows('en').find((workflow) => workflow.id === 'eligibility');
    expect(eligibility?.prompt).toContain('Treat missing information as unknown');
    expect(eligibility?.prompt).toContain('not an admission or scholarship decision');
  });

  it('prevents fabricated personal-statement claims', () => {
    const statement = getAdvisorWorkflows('en').find((workflow) => workflow.id === 'statement');
    expect(statement?.prompt).toContain('Do not invent awards');
  });

  it('separates generic interview practice from confirmed program requirements', () => {
    const interview = getAdvisorWorkflows('en').find((workflow) => workflow.id === 'interview');
    expect(interview?.prompt).toContain('Distinguish general practice questions');
    expect(interview?.prompt).toContain('unless the records support it');
  });
});
