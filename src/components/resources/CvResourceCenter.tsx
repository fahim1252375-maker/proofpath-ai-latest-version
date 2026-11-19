import React, { useState } from 'react';
import { ArrowUpRight, BookOpen, Check, FileText, Palette } from 'lucide-react';

const resources = [
  {
    name: 'Europass',
    description: 'Official European CV builder with structured profile information and multilingual CV creation.',
    use: 'Useful when an application asks for a structured Europass CV.',
    href: 'https://europass.europa.eu/en/create-europass-cv?lang=en',
    icon: FileText,
  },
  {
    name: 'Canva Resume Builder',
    description: 'Template-based resume creation and visual customization.',
    use: 'Useful when you want to compare visual layouts and templates.',
    href: 'https://www.canva.com/resumes/',
    icon: Palette,
  },
  {
    name: 'Harvard Resume and CV Guide',
    description: 'Professional guidance on clear, concise, fact-based resume writing.',
    use: 'Useful for reviewing content and improving concise descriptions.',
    href: 'https://careerservices.fas.harvard.edu/channels/create-a-resume-cv-or-cover-letter/',
    icon: BookOpen,
  },
];

const checklist = [
  'Contact information',
  'Education',
  'Academic achievements',
  'Work and internship experience',
  'Technical and professional skills',
  'Projects',
  'Research and publications, where applicable',
  'Certificates',
  'Awards',
  'Relevant extracurricular experience',
];

export function CvResourceCenter() {
  const [complete, setComplete] = useState<string[]>([]);

  const toggle = (item: string) => {
    setComplete((current) => current.includes(item)
      ? current.filter((entry) => entry !== item)
      : [...current, item]);
  };

  return (
    <section id="cv-resources" className="pp-resource-center" aria-labelledby="cv-resource-heading">
      <div className="pp-resource-heading">
        <div>
          <p className="pp-studio-eyebrow">Application preparation</p>
          <h2 id="cv-resource-heading">Build a Professional CV.</h2>
          <p>A clear, tailored CV can help you present your academic background, skills, experience and achievements professionally.</p>
        </div>
        <span className="pp-resource-check-count" aria-live="polite">{complete.length} of {checklist.length} preparation steps marked</span>
      </div>

      <div className="pp-resource-card-grid">
        {resources.map(({ name, description, use, href, icon: Icon }) => (
          <article key={name} className="pp-resource-card">
            <span className="pp-resource-icon"><Icon aria-hidden="true" /></span>
            <p className="pp-resource-external">External resource</p>
            <h3>{name}</h3>
            <p>{description}</p>
            <p className="pp-resource-recommended"><strong>Recommended use:</strong> {use}</p>
            <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name} external website (opens in a new tab)`}>
              Open external website <ArrowUpRight aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>

      <div className="pp-cv-checklist">
        <div className="pp-cv-checklist-heading">
          <div>
            <p className="pp-studio-eyebrow">Preparation checklist</p>
            <h3>Gather the details you may want to include.</h3>
          </div>
          <p>This checklist is temporary in this page session. It is not a CV builder and nothing is sent to the external websites.</p>
        </div>
        <div className="pp-cv-checklist-grid">
          {checklist.map((item) => {
            const selected = complete.includes(item);
            return (
              <button key={item} type="button" aria-pressed={selected} onClick={() => toggle(item)} className="pp-cv-check-item">
                <span className="pp-cv-check-box" aria-hidden="true">{selected && <Check />}</span>
                <span>{item}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="pp-resource-disclaimer">These tools are operated by their respective external providers. ProofPath AI does not own them or transfer your saved profile to them.</p>
    </section>
  );
}
