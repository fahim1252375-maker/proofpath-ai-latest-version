import { isIP } from 'node:net';

export interface SourceCredibilityAssessment {
  score: number;
  level: 'strong' | 'moderate' | 'limited';
  host: string;
  signals: string[];
  caveat: string;
}

function hostOf(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function scoreSourceCredibility(sourceUrl: string, officialUrl = ''): SourceCredibilityAssessment {
  const signals: string[] = [];
  const sourceHost = hostOf(sourceUrl);
  const officialHost = hostOf(officialUrl);
  if (!sourceHost) {
    return {
      score: 0,
      level: 'limited',
      host: 'invalid-url',
      signals: ['The source URL could not be parsed as HTTP or HTTPS.'],
      caveat: 'This is a URL-level signal assessment, not a reputation, identity, or accreditation check.',
    };
  }

  let score = 10;
  const sourceProtocol = new URL(sourceUrl).protocol;
  if (sourceProtocol === 'https:') {
    score += 25;
    signals.push('The connection URL uses HTTPS.');
  } else {
    signals.push('The source URL uses HTTP rather than HTTPS.');
  }

  if (officialHost && (sourceHost === officialHost || sourceHost.endsWith('.' + officialHost))) {
    score += 55;
    signals.push('The source host matches the listed official host or one of its subdomains.');
  } else if (officialHost) {
    signals.push('The source host differs from the opportunity’s listed official host.');
  } else {
    signals.push('No listed official host is available for comparison.');
  }

  if (sourceHost.split('.').length < 2 || isIP(sourceHost) !== 0) {
    score = Math.min(score, 15);
    signals.push('The host is not a conventional public domain name.');
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    level: score >= 75 ? 'strong' : score >= 40 ? 'moderate' : 'limited',
    host: sourceHost,
    signals,
    caveat: 'URL-level indicators only. HTTPS and host alignment do not prove ownership, legitimacy, nonprofit status, accreditation, or that the page content is accurate.',
  };
}
