import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Compass, ExternalLink, GraduationCap, Orbit, Search, ShieldCheck, Target, UserCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StudioPageHeader, StudioSourceNote } from '../components/ui/Studio';
import { CvResourceCenter } from '../components/resources/CvResourceCenter';
import { ACADEMIC_DISCIPLINES, FUNDING_PREFERENCES, OPPORTUNITY_GOALS, STUDENT_JOURNEYS, buildOpportunityFilterPath } from '../lib/pathfinder';

const wizardSteps = ['Your journey', 'Academic interests', 'Your goal', 'Funding', 'Destination', 'Your roadmap'];
const modalityPreferences = [
  { id: 'any', label: 'Any modality' },
  { id: 'on_campus', label: 'On campus' },
  { id: 'online', label: 'Online' },
  { id: 'hybrid', label: 'Hybrid' },
];

function getGoalIdsForJourney(journey: string): string[] {
  if (journey === 'high_school') return ['undergraduate_scholarship', 'competition', 'education_grant'];
  if (journey === 'undergraduate') return ['undergraduate_scholarship', 'internship', 'competition', 'education_grant', 'graduate_opportunity'];
  if (journey === 'phd_research') return ['phd_funding', 'research_fellowship', 'education_grant'];
  if (journey === 'early_career') return ['internship', 'research_fellowship', 'competition', 'education_grant'];
  return ['masters_scholarship', 'phd_funding', 'research_fellowship', 'education_grant', 'graduate_opportunity'];
}

export function FindPathPage({ navigate }: { navigate: (path: string) => void }) {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [journey, setJourney] = useState('undergraduate');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [funding, setFunding] = useState('unspecified');
  const [country, setCountry] = useState('all');
  const [region, setRegion] = useState('');
  const [modality, setModality] = useState('any');
  const [deadlineBefore, setDeadlineBefore] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<{ facets?: { countries?: string[] } }>('/api/opportunities?limit=1')
      .then((data) => {
        if (!active) return;
        setCountries(data.facets?.countries || []);
        setCatalogueError('');
      })
      .catch(() => {
        if (!active) return;
        setCountries([]);
        setCatalogueError('Country filters could not be loaded. You can continue with all catalogue countries.');
      })
      .finally(() => { if (active) setCatalogueLoading(false); });
    return () => { active = false; };
  }, []);

  const relevantGoalIds = getGoalIdsForJourney(journey);
  const relevantGoals = OPPORTUNITY_GOALS.filter((option) => relevantGoalIds.includes(option.id));
  const selectedGoal = OPPORTUNITY_GOALS.find((option) => option.id === goal);
  const selectedJourney = STUDENT_JOURNEYS.find((option) => option.id === journey) || STUDENT_JOURNEYS[1];
  const selectedFunding = FUNDING_PREFERENCES.find((option) => option.id === funding) || FUNDING_PREFERENCES[FUNDING_PREFERENCES.length - 1];

  useEffect(() => {
    if (goal && !relevantGoalIds.includes(goal)) setGoal('');
  }, [goal, journey]);

  const cataloguePath = useMemo(() => buildOpportunityFilterPath({
    category: selectedGoal?.category || 'all',
    educationLevel: selectedGoal?.educationLevel || selectedJourney.educationLevel,
    fundingType: selectedFunding.filter,
    country,
    deadlineBefore,
  }), [selectedGoal, selectedJourney.educationLevel, selectedFunding.filter, country, deadlineBefore]);

  const toggleField = (field: string) => {
    setSelectedFields((current) => current.includes(field) ? current.filter((value) => value !== field) : [...current, field]);
  };

  const toggleAllSubfields = (subfields: readonly string[]) => {
    const allSelected = subfields.every((subfield) => selectedFields.includes(subfield));
    setSelectedFields((current) => allSelected
      ? current.filter((value) => !subfields.includes(value))
      : Array.from(new Set([...current, ...subfields])));
  };

  const stepContent = [
    <div className="pp-path-choice-grid" key="journey">
      {STUDENT_JOURNEYS.map((item) => (
        <button key={item.id} type="button" aria-pressed={journey === item.id} onClick={() => setJourney(item.id)} className="pp-path-choice">
          <span className="pp-path-choice-icon"><GraduationCap aria-hidden="true" /></span>
          <span><strong>{item.label}</strong><small>{item.educationLevel === 'all' ? 'Early-career route' : `Catalogue level: ${item.educationLevel.replace('_', ' ')}`}</small></span>
          {journey === item.id && <Check className="pp-path-choice-check" aria-hidden="true" />}
        </button>
      ))}
    </div>,
    <div className="space-y-4" key="fields">
      <StudioSourceNote>Choose one or more subjects to keep in mind. The catalogue does not currently store searchable discipline metadata, so these interests do not filter opportunity records or imply a field match.</StudioSourceNote>
      <div className="pp-path-field-grid">
        {ACADEMIC_DISCIPLINES.map((discipline) => {
          const expanded = expandedField === discipline.id;
          const selectedCount = discipline.subfields.filter((field) => selectedFields.includes(field)).length;
          return (
            <article key={discipline.id} className="pp-path-discipline">
              <div className="pp-path-discipline-heading">
                <button type="button" aria-expanded={expanded} aria-controls={`field-${discipline.id}`} onClick={() => setExpandedField(expanded ? null : discipline.id)}>
                  <span>{discipline.label}</span><small>{selectedCount ? `${selectedCount} selected` : 'Explore subfields'}</small>
                </button>
                <button type="button" className="pp-path-select-all" onClick={() => toggleAllSubfields(discipline.subfields)} aria-label={`${discipline.subfields.every((field) => selectedFields.includes(field)) ? 'Clear' : 'Select'} all ${discipline.label} subfields`}>{discipline.subfields.every((field) => selectedFields.includes(field)) ? 'Clear' : 'Select all'}</button>
              </div>
              {expanded && (
                <div id={`field-${discipline.id}`} className="pp-path-subfields">
                  {discipline.subfields.map((field) => (
                    <button key={field} type="button" aria-pressed={selectedFields.includes(field)} onClick={() => toggleField(field)} className="pp-path-subfield">
                      <span className="pp-path-check" aria-hidden="true">{selectedFields.includes(field) && <Check />}</span>{field}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>,
    <div className="space-y-4" key="goal">
      <p className="text-sm leading-6 text-[#50604F] dark:text-[#A9B5A6]">Choose an outcome to apply the existing category and education-level filters. Goals that span several categories use only the education level and leave category unfiltered.</p>
      <div className="pp-path-choice-grid">
        {relevantGoals.map((item) => (
          <button key={item.id} type="button" aria-pressed={goal === item.id} onClick={() => setGoal(item.id)} className="pp-path-choice">
            <span className="pp-path-choice-icon"><Target aria-hidden="true" /></span>
            <span><strong>{item.label}</strong><small>{item.explanation}</small></span>
            {goal === item.id && <Check className="pp-path-choice-check" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>,
    <div className="pp-path-choice-grid" key="funding">
      {FUNDING_PREFERENCES.map((item) => (
        <button key={item.id} type="button" aria-pressed={funding === item.id} onClick={() => setFunding(item.id)} className="pp-path-choice">
          <span className="pp-path-choice-icon"><ShieldCheck aria-hidden="true" /></span>
          <span><strong>{item.label}</strong><small>{item.id === 'tuition' ? 'Uses the existing partial-funding filter; confirm coverage with the provider.' : item.id === 'unspecified' ? 'Leaves funding unfiltered so records with missing amounts remain visible.' : 'Uses the existing catalogue funding-type filter.'}</small></span>
          {funding === item.id && <Check className="pp-path-choice-check" aria-hidden="true" />}
        </button>
      ))}
    </div>,
    <div className="pp-path-destination-grid" key="destination">
      <label className="pp-path-control">Destination country
        <select value={country} onChange={(event) => setCountry(event.target.value)}>
          <option value="all">All catalogue countries</option>
          {countries.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <small role={catalogueError ? 'alert' : undefined}>{catalogueLoading ? 'Loading country values from the catalogue…' : catalogueError || (countries.length ? 'Options come from published catalogue records.' : 'No country values are currently available in the catalogue.')}</small>
      </label>
      <label className="pp-path-control">Region preference (optional)
        <input type="text" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Enter a region to keep in mind" />
        <small>Regional metadata is not available in the current opportunity API; this preference does not filter records.</small>
      </label>
      <label className="pp-path-control">Study modality preference
        <select value={modality} onChange={(event) => setModality(event.target.value)}>
          {modalityPreferences.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <small>Modality is not stored on current opportunity records and will not filter results.</small>
      </label>
      <label className="pp-path-control">Deadline on or before
        <input type="date" value={deadlineBefore} onChange={(event) => setDeadlineBefore(event.target.value)} />
        <small>Uses the existing deadline field. Confirm source time zones when the provider specifies one.</small>
      </label>
      {selectedFields.length > 0 && <p className="pp-path-selected-fields">Academic interests selected: {selectedFields.join(', ')}. Field fit remains not evaluated because the catalogue has no discipline metadata.</p>}
    </div>,
    <div className="space-y-5" key="roadmap">
      <div className="pp-path-summary">
        <div className="pp-path-summary-icon"><Orbit aria-hidden="true" /></div>
        <div><p className="pp-studio-eyebrow">Your selected direction</p><h3>{selectedGoal?.label || selectedJourney.label}</h3><p>{selectedGoal?.explanation || 'The current catalogue will be filtered by the selected education level.'}</p><p>Catalogue filters: {selectedGoal?.category === 'all' || !selectedGoal?.category ? 'all supported categories' : selectedGoal.category}; {selectedGoal?.educationLevel || selectedJourney.educationLevel.replace('_', ' ')}; {selectedFunding.label.toLowerCase()}; {country === 'all' ? 'all available countries' : country}{region.trim() ? ` · region preference: ${region.trim()} (guidance only)` : ''}{deadlineBefore ? ` · deadline on or before ${deadlineBefore}` : ''}.</p></div>
      </div>
      <div className="pp-path-guided-explanation"><p className="pp-studio-eyebrow">Why this path may be relevant</p><p>Your selected journey determines the catalogue education-level filter. Your goal adds a supported opportunity category where one exists; funding, country and deadline preferences use existing catalogue filters. Academic interest, region and study modality remain guidance-only because current catalogue data does not support those matches.</p><div><span><strong>Information that matters</strong>Education level and saved profile values can be compared with requirements on each record. Pathfinder selections are not read from or saved to your profile.</span><span><strong>Documents to prepare</strong>Required documents vary by opportunity. Open its official application page; this guide cannot infer a document list without a selected record.</span><span><strong>Unknowns to review</strong>Discipline fit, modality, region, field prerequisites and current programme terms may be missing. Treat missing information as unknown and confirm with the provider.</span></div></div>
      <StudioSourceNote tone="caution">This guide is deterministic and temporary in this tab. It does not save your selections or run an AI request. Academic field and study modality are not applied as catalogue filters because the current records do not contain those fields.</StudioSourceNote>
      <ol className="pp-path-roadmap">
        {[
          { title: 'Complete the profile details you want to use', detail: 'Education level, GPA, nationality, language qualifications, interests, and target countries can support existing eligibility checks.', path: user ? '/dashboard/eligibility' : '/register', icon: UserCheck },
          { title: 'Explore catalogue records', detail: 'The link applies only the selected category, level, funding, country, and deadline filters supported by the current API.', path: cataloguePath, icon: Search },
          { title: 'Review eligibility inputs and missing information', detail: 'The existing rules compare saved profile values with requirements on record; results are estimates.', path: user ? '/dashboard/eligibility' : '/register', icon: Check },
          { title: 'Inspect available evidence', detail: 'Check source links and the limits shown in each report. Reachability is not proof.', path: '/verify', icon: ShieldCheck },
          { title: 'Compare selected opportunities', detail: 'Choose two to four catalogue records and review supported fields side by side.', path: '/compare', icon: Compass },
          { title: 'Organize application tasks', detail: 'Use the existing application checklist and deadline views.', path: user ? '/dashboard/applications' : '/register', icon: CalendarDays },
        ].map(({ title, detail, path, icon: Icon }, index) => (
          <li key={title}>
            <span className="pp-path-roadmap-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="pp-path-roadmap-icon"><Icon aria-hidden="true" /></span>
            <span className="pp-path-roadmap-copy"><strong>{title}</strong><small>{detail}</small></span>
            <button type="button" onClick={() => navigate(path)} aria-label={`Open step ${index + 1}: ${title}`}><ArrowRight aria-hidden="true" /></button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => navigate(cataloguePath)} className="pp-path-primary-action">Explore these catalogue filters <ArrowRight aria-hidden="true" /></button>
        <a href="#cv-resources" className="pp-path-secondary-action">Review CV resources <ExternalLink aria-hidden="true" /></a>
      </div>
    </div>,
  ];

  return (
    <main className="pp-depth-page pp-pathfinder-page mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <StudioPageHeader
        eyebrow="Student Pathfinder · choose your next step"
        title="Find a Path That Fits Your Future."
        description="Tell us where you are today, what you want to achieve, and what kind of opportunity you are looking for. ProofPath helps organize your next steps."
        icon={<Compass className="h-5 w-5" />}
        context={<><span>Step {step + 1} of {wizardSteps.length}</span><span>Temporary in this tab · not saved</span><span>No admissions or funding predictions</span></>}
      />

      <section className="pp-path-wizard" aria-labelledby="path-step-heading">
        <nav className="pp-path-step-nav" aria-label="Pathfinder steps">
          {wizardSteps.map((label, index) => (
            <button key={label} type="button" onClick={() => setStep(index)} aria-current={index === step ? 'step' : undefined} className={index === step ? 'is-active' : index < step ? 'is-complete' : ''}>
              <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span><small>{label}</small>
            </button>
          ))}
        </nav>
        <motion.div key={step} className="pp-path-step-content" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
          <div className="pp-path-step-heading">
            <p className="pp-studio-eyebrow">Step {String(step + 1).padStart(2, '0')}</p>
            <h2 id="path-step-heading">{wizardSteps[step]}</h2>
          </div>
          {stepContent[step]}
          <div className="pp-path-step-actions">
            <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="pp-path-secondary-action"><ChevronLeft aria-hidden="true" /> Previous</button>
            {step < wizardSteps.length - 1 && <button type="button" onClick={() => setStep((current) => Math.min(wizardSteps.length - 1, current + 1))} className="pp-path-primary-action">Continue <ChevronRight aria-hidden="true" /></button>}
          </div>
        </motion.div>
      </section>

      <CvResourceCenter />
    </main>
  );
}

export function ResourcesPage() {
  return (
    <main className="pp-depth-page pp-depth-resources mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <StudioPageHeader
        eyebrow="Student Resources · application preparation"
        title="Practical tools for your next application."
        description="Use external CV resources and a preparation checklist to organize the information you may need. ProofPath does not build or store a CV."
        icon={<BookOpen className="h-5 w-5" />}
        context={<><span>Third-party resources are clearly labeled</span><span>Nothing is sent to them by ProofPath</span></>}
      />
      <CvResourceCenter />
    </main>
  );
}
