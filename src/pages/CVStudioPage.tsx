import React, { useMemo, useState } from 'react';
import { FileDown, ExternalLink, Sparkles } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';

type CvSectionId = 'summary' | 'education' | 'experience' | 'projects' | 'skills' | 'achievements' | 'certifications';
type CvValues = Record<CvSectionId, string>;

const sections: Array<{ id: CvSectionId; label: string; hint: string }> = [
  { id: 'summary', label: 'Profile summary', hint: '2–4 lines about your academic focus and next goal.' },
  { id: 'education', label: 'Education', hint: 'Degree, institution, dates, GPA or relevant courses, if you choose to include them.' },
  { id: 'experience', label: 'Experience', hint: 'Role, organization, dates, and specific responsibilities or outcomes.' },
  { id: 'projects', label: 'Research & projects', hint: 'Project or research title, your contribution, methods, and concrete outputs.' },
  { id: 'skills', label: 'Skills', hint: 'Group relevant technical, research, language, and communication skills.' },
  { id: 'achievements', label: 'Achievements', hint: 'Awards, leadership, publications, or measurable outcomes you can substantiate.' },
  { id: 'certifications', label: 'Certifications', hint: 'Credential name, issuing organization, and date.' },
];

const emptyValues: CvValues = {
  summary: '', education: '', experience: '', projects: '', skills: '', achievements: '', certifications: '',
};

export function CVStudioPage({ navigate }: { navigate: (path: string) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.fullName || '');
  const [values, setValues] = useState<CvValues>(emptyValues);
  const [template, setTemplate] = useState<'academic' | 'modern'>('academic');
  const [exportError, setExportError] = useState('');
  const hasContent = Boolean(name.trim() || Object.values(values).some((value) => value.trim()));
  const completion = useMemo(() => Math.round((sections.filter((section) => values[section.id].trim()).length / sections.length) * 100), [values]);

  const exportPdf = () => {
    setExportError('');
    try {
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 48;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - margin * 2;
      let y = margin;
      const nextPageIfNeeded = (height: number) => {
        if (y + height > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      const displayName = name.trim() || 'Student CV';
      pdf.text(displayName, margin, y);
      y += 25;
      pdf.setDrawColor(125, 160, 68);
      pdf.setLineWidth(2);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 22;

      sections.forEach((section) => {
        const text = values[section.id].trim();
        if (!text) return;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        nextPageIfNeeded(34);
        pdf.text(section.label.toUpperCase(), margin, y);
        y += 16;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        const lines = pdf.splitTextToSize(text, contentWidth) as string[];
        const lineHeight = 14;
        lines.forEach((line) => {
          nextPageIfNeeded(lineHeight);
          pdf.text(line, margin, y);
          y += lineHeight;
        });
        y += 13;
      });

      const safeName = (name.trim() || 'student-cv').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'student-cv';
      pdf.save(`${safeName}.pdf`);
    } catch {
      setExportError('Your browser could not export the PDF. You can still use the on-screen preview.');
    }
  };

  return (
    <div className="pp-depth-page pp-depth-cv space-y-5">
      <header className="pp-dashboard-hero relative overflow-hidden rounded-2xl border border-[#344339] p-5 text-[#F7F7F0] sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border border-[#C5F36A]/20 [transform:rotateX(66deg)_rotateZ(-25deg)]" />
        <div className="relative z-10 max-w-2xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-[#C5F36A]">Application Studio · CV</p>
          <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Build a student CV from your real experience</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#A9B5A6]">Draft locally, preview your sections, and export a PDF. Nothing on this page is saved to your account or sent to an AI provider.</p>
        </div>
        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[#C5F36A]/30 bg-[#C5F36A]/10 px-3 py-1.5 font-mono text-[10px] font-semibold text-[#C5F36A]">Draft completeness · {completion}%</span>
          <button type="button" onClick={exportPdf} disabled={!hasContent} className="inline-flex items-center gap-2 rounded-lg bg-[#C5F36A] px-4 py-2 text-xs font-bold text-[#101713] hover:bg-[#b5e458] disabled:cursor-not-allowed disabled:opacity-40"><FileDown className="h-4 w-4" /> Export PDF</button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="space-y-4 xl:col-span-7" aria-label="CV editor">
          <div className="rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
            <label className="block text-xs font-semibold text-[#243329] dark:text-[#D5DDD2]">Name for this document
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Your name" className="mt-1.5 h-10 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] outline-none focus:border-[#668A38] dark:border-[#354139] dark:bg-[#0C110E] dark:text-[#F7F7F0]" />
            </label>
            <p className="mt-2 text-[10px] text-[#71806E] dark:text-[#8C9A88]">The name starts from your account name for convenience. Edit or clear it before export.</p>
          </div>

          {sections.map((section) => (
            <label key={section.id} className="block rounded-xl border border-[#E4E8E0] bg-white p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-[#232D27] dark:bg-[#141B17]">
              <span className="text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">{section.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-[#71806E] dark:text-[#8C9A88]">{section.hint}</span>
              <textarea value={values[section.id]} onChange={(event) => setValues((current) => ({ ...current, [section.id]: event.target.value }))} maxLength={3500} rows={section.id === 'summary' ? 3 : 4} className="mt-3 w-full resize-y rounded-lg border border-[#E4E8E0] bg-[#FBFBF7] p-3 text-sm leading-relaxed text-[#101713] outline-none focus:border-[#668A38] dark:border-[#354139] dark:bg-[#0C110E] dark:text-[#F7F7F0]" placeholder="Write only details you can stand behind." />
            </label>
          ))}
        </section>

        <aside className="space-y-4 xl:col-span-5">
          <section className="sticky top-20 rounded-xl border border-[#DCE5D3] bg-white p-4 shadow-xl shadow-[#101713]/5 dark:border-[#2C3730] dark:bg-[#141B17]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#668A38] dark:text-[#C5F36A]">Live preview</p>
                <h2 className="mt-1 font-display text-lg font-bold text-[#101713] dark:text-[#F7F7F0]">{name.trim() || 'Your name'}</h2>
              </div>
              <select value={template} onChange={(event) => setTemplate(event.target.value as typeof template)} aria-label="Choose CV preview style" className="h-9 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-2 text-xs font-semibold text-[#243329] dark:border-[#354139] dark:bg-[#0C110E] dark:text-[#D5DDD2]">
                <option value="academic">Academic</option>
                <option value="modern">Modern</option>
              </select>
            </div>
            <div className={`mt-4 min-h-64 rounded-lg border bg-white p-5 text-[#101713] shadow-inner ${template === 'academic' ? 'border-t-4 border-t-[#668A38]' : 'border-l-4 border-l-[#101713]'} dark:bg-[#F7F7F0]`}>
              {sections.filter((section) => values[section.id].trim()).length ? sections.filter((section) => values[section.id].trim()).map((section) => (
                <section key={section.id} className="mb-4">
                  <h3 className="border-b border-[#DCE5D3] pb-1 font-mono text-[9px] font-bold uppercase tracking-wider">{section.label}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed">{values[section.id]}</p>
                </section>
              )) : <p className="py-16 text-center text-xs text-[#71806E]">Your entries will preview here.</p>}
            </div>
            {exportError && <p role="alert" className="mt-3 text-xs text-red-700">{exportError}</p>}
          </section>

          <section className="rounded-xl border border-[#E4E8E0] bg-[#F7F7F0] p-4 dark:border-[#232D27] dark:bg-[#101713]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]"><Sparkles className="h-4 w-4 text-[#668A38] dark:text-[#C5F36A]" />Improve your draft</div>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[#455044] dark:text-[#A9B5A6]">
              <li>Use action verbs and describe your specific contribution.</li>
              <li>Add numbers only when you can verify them.</li>
              <li>Tailor education, research, and skills to the opportunity criteria.</li>
              <li>Keep headings simple and review the exported PDF before sending.</li>
            </ul>
            <button type="button" onClick={() => navigate('/dashboard/assistant')} className="mt-4 rounded-lg border border-[#C5F36A]/60 px-3 py-2 text-xs font-semibold text-[#243329] hover:bg-[#C5F36A]/20 dark:text-[#D5DDD2]">Open JARVIS for general CV advice</button>
            <p className="mt-2 text-[10px] leading-relaxed text-[#71806E] dark:text-[#8C9A88]">Your CV draft is not carried into chat. Paste only the details you choose to share, and review the provider selection and privacy panel first.</p>
          </section>

          <section className="rounded-xl border border-[#E4E8E0] bg-white p-4 dark:border-[#232D27] dark:bg-[#141B17]">
            <h2 className="text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">External CV resources</h2>
            <ul className="mt-3 space-y-2 text-xs">
              <li><a href="https://europass.europa.eu/en/create-europass-cv?lang=en" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[#243329] underline dark:text-[#C5F36A]">Europass CV builder <ExternalLink className="h-3 w-3" /></a></li>
              <li><a href="https://careerservices.fas.harvard.edu/channels/create-a-resume-cv-or-cover-letter/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[#243329] underline dark:text-[#C5F36A]">Harvard Resume and CV guide <ExternalLink className="h-3 w-3" /></a></li>
              <li><a href="https://www.canva.com/resumes/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[#243329] underline dark:text-[#C5F36A]">Canva Resume Builder <ExternalLink className="h-3 w-3" /></a></li>
            </ul>
            <p className="mt-3 text-[10px] text-[#71806E] dark:text-[#8C9A88]">These are external websites. ProofPath does not endorse or control their services.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
