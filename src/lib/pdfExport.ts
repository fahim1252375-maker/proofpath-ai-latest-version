import { jsPDF } from 'jspdf';
import type { VerificationReport } from '../types';

export function exportVerificationReportPdf(report: VerificationReport): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 52;

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 48) {
      doc.addPage();
      y = 52;
    }
  };

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 74, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ProofPath AI — Opportunity Verification Report', margin, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Report ID: ${report.id}   |   Checked: ${new Date(report.createdAt).toLocaleString()}   |   Verdict: ${report.overallStatus}`,
    margin,
    54
  );

  y = 100;
  doc.setTextColor(15, 23, 42);

  // Title & Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(report.extractedInfo.title || report.submittedTitle || 'Verification Audit', maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 18 + 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const metaRows = [
    `Organization: ${report.extractedInfo.organization}`,
    `Country: ${report.extractedInfo.country}   |   Category: ${report.extractedInfo.category}`,
    `Deadline: ${report.extractedInfo.deadline}   |   Funding: ${report.extractedInfo.fundingAmount}`,
    `Fees Mentioned: ${report.extractedInfo.feesMentioned}`,
    `Submitted / Official URL: ${report.extractedInfo.officialUrl || report.submittedUrl || 'N/A'}`,
  ];
  for (const line of metaRows) {
    ensureSpace(16);
    const wrapped = doc.splitTextToSize(line, maxWidth);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 14;
  }

  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // Executive Summary
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('Executive Summary', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(report.summary, maxWidth);
  ensureSpace(summaryLines.length * 14 + 12);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 14 + 16;

  // Claim-by-claim analysis
  if (report.claims.length) {
    ensureSpace(32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(`Claim-by-Claim Analysis (${report.claims.length})`, margin, y);
    y += 16;

    report.claims.forEach((c, idx) => {
      const claimLines = doc.splitTextToSize(`${idx + 1}. [${c.verdict}] ${c.claim}`, maxWidth);
      const expLines = doc.splitTextToSize(`Explanation: ${c.explanation}`, maxWidth - 12);
      const srcLines = c.sourceUrl ? doc.splitTextToSize(`Source: ${c.sourceUrl}`, maxWidth - 12) : [];
      ensureSpace((claimLines.length + expLines.length + srcLines.length) * 14 + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(claimLines, margin, y);
      y += claimLines.length * 14;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(expLines, margin + 12, y);
      y += expLines.length * 14;

      if (srcLines.length) {
        doc.setTextColor(79, 70, 229);
        doc.text(srcLines, margin + 12, y);
        y += srcLines.length * 14;
      }
      y += 8;
    });
  }

  // Risk Indicators & Confidence Limitations
  if (report.riskIndicators.length) {
    ensureSpace(32);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('Risk Indicators', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const r of report.riskIndicators) {
      const lines = doc.splitTextToSize(`• [${r.severity.toUpperCase()}] ${r.flag}: ${r.detail}`, maxWidth);
      ensureSpace(lines.length * 14 + 6);
      doc.text(lines, margin, y);
      y += lines.length * 14 + 4;
    }
    y += 8;
  }

  ensureSpace(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Confidence & Methodology Limitations', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const limLines = doc.splitTextToSize(report.confidenceLimitations, maxWidth);
  doc.text(limLines, margin, y);

  const safeSlug = (report.extractedInfo.title || 'verification-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  doc.save(`proofpath-${safeSlug}.pdf`);
}
