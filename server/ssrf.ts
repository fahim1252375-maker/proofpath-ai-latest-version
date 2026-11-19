import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import type { IncomingMessage } from 'node:http';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'metadata.google.internal',
  'metadata',
]);

export class UnsafePublicUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafePublicUrlError';
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // Link local and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 192 && b === 2) return true; // Documentation
  if (a === 192 && b === 88 && c === 99) return true; // Deprecated relay range
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true; // Benchmarking and documentation
  if (a === 203 && b === 0 && c === 113) return true; // Documentation
  if (a >= 224) return true; // Multicast and reserved
  return false;
}

function isRestrictedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().split('%')[0] || '';
  const dottedAddress = lower.includes('.') ? lower.slice(lower.lastIndexOf(':') + 1) : '';
  let normalized = lower;
  if (dottedAddress) {
    if (!net.isIPv4(dottedAddress)) return true;
    const octets = dottedAddress.split('.').map(Number);
    const high = ((octets[0] || 0) << 8) | (octets[1] || 0);
    const low = ((octets[2] || 0) << 8) | (octets[3] || 0);
    normalized = `${lower.slice(0, lower.lastIndexOf(':'))}:${high.toString(16)}:${low.toString(16)}`;
  }

  const parts = normalized.split('::');
  if (parts.length > 2) return true;
  const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (parts.length === 1 && missing !== 0)) return true;
  const words = [...left, ...Array(missing).fill('0'), ...right].map((part) => Number.parseInt(part, 16));
  if (words.length !== 8 || words.some((word) => Number.isNaN(word) || word < 0 || word > 0xffff)) return true;

  // Block unspecified, loopback, IPv4-compatible, and IPv4-mapped address forms.
  if (words.slice(0, 5).every((word) => word === 0)) return true;
  const firstSegment = words[0] || 0;
  const secondSegment = words[1] || 0;
  // Permit only global-unicast space. This also excludes NAT64, 6to4, and
  // other transition ranges that can encode an IPv4 destination.
  if ((firstSegment & 0xe000) !== 0x2000) return true;
  if ((firstSegment & 0xfe00) === 0xfc00) return true; // Unique local fc00::/7
  if ((firstSegment & 0xffc0) === 0xfe80) return true; // Link local fe80::/10
  if ((firstSegment & 0xff00) === 0xff00) return true; // Multicast ff00::/8
  if (firstSegment === 0x2001 && secondSegment <= 0x01ff) return true; // IETF special-purpose and Teredo ranges
  if (firstSegment === 0x2001 && secondSegment === 0x0db8) return true; // Documentation
  if (firstSegment === 0x2002) return true; // 6to4 embeds an IPv4 destination
  if (firstSegment === 0x0100 && secondSegment === 0) return true; // Discard-only 100::/64
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isRestrictedIPv6(ip);
  return true;
}

interface SafeTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

function parsePublicUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new UnsafePublicUrlError('Invalid URL format. Provide a full http:// or https:// URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafePublicUrlError('Only HTTP and HTTPS protocols are allowed.');
  }
  if (parsed.username || parsed.password) {
    throw new UnsafePublicUrlError('URLs containing embedded credentials are not permitted.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new UnsafePublicUrlError('Access to internal, loopback, or local hostnames is blocked.');
  }
  return parsed;
}

async function resolveSafeTarget(rawUrl: string): Promise<SafeTarget> {
  const url = parsePublicUrl(rawUrl);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const literalFamily = net.isIP(hostname);

  if (literalFamily) {
    if (isBlockedIp(hostname)) {
      throw new UnsafePublicUrlError('Access to private, loopback, or metadata IP ranges is blocked.');
    }
    return { url, address: hostname, family: literalFamily as 4 | 6 };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Could not resolve the target domain.');
  }
  if (!records.length) throw new Error('Could not resolve the target domain.');
  if (records.some((record) => isBlockedIp(record.address))) {
    throw new UnsafePublicUrlError('Target domain resolves to a restricted private IP address.');
  }

  const record = records[0];
  if (!record || (record.family !== 4 && record.family !== 6)) {
    throw new Error('Could not resolve a public target address.');
  }
  return { url, address: record.address, family: record.family };
}

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  return (await resolveSafeTarget(rawUrl)).url;
}

function requestPinned(target: SafeTarget, signal: AbortSignal): Promise<IncomingMessage> {
  const client = target.url.protocol === 'https:' ? https : http;
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: target.address, family: target.family }]);
    } else {
      callback(null, target.address, target.family);
    }
  };

  return new Promise((resolve, reject) => {
    const request = client.request(
      target.url,
      {
        method: 'GET',
        signal,
        lookup,
        headers: {
          'User-Agent': 'ProofPathAI-Verifier/1.0 (+https://proofpath.ai)',
          Accept: 'text/html,application/xhtml+xml,text/plain,application/json',
        },
      },
      resolve
    );
    request.setTimeout(7000, () => request.destroy(new Error('The target server timed out.')));
    request.once('error', reject);
    request.end();
  });
}

function readTextLimited(response: IncomingMessage, byteLimit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    };

    response.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = byteLimit - totalBytes;
      if (remaining > 0) {
        const slice = buffer.subarray(0, remaining);
        chunks.push(slice);
        totalBytes += slice.length;
      }
      if (totalBytes >= byteLimit) {
        response.destroy();
        finish();
      }
    });
    response.once('end', finish);
    response.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    response.once('aborted', () => {
      if (settled) return;
      settled = true;
      reject(new Error('The target server ended the response early.'));
    });
  });
}

export async function fetchPublicUrlSnippet(safeUrl: URL): Promise<{
  reachable: boolean;
  statusCode: number | null;
  finalUrl: string;
  pageTitle: string;
  textExcerpt: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    let currentTarget = await resolveSafeTarget(safeUrl.toString());
    let response: IncomingMessage | null = null;
    const redirectStatuses = new Set([301, 302, 303, 307, 308]);

    for (let redirects = 0; redirects <= 5; redirects += 1) {
      response = await requestPinned(currentTarget, controller.signal);
      if (!response.statusCode || !redirectStatuses.has(response.statusCode)) break;

      const location = response.headers.location;
      if (!location) break;
      if (redirects === 5) throw new Error('The page exceeded the redirect limit.');
      response.destroy();
      const redirectUrl = new URL(location, currentTarget.url);
      currentTarget = await resolveSafeTarget(redirectUrl.toString());
    }

    if (!response) throw new Error('No response was received.');
    const statusCode = response.statusCode || 0;
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('text') && !contentType.includes('html') && !contentType.includes('json')) {
      response.destroy();
      return {
        reachable: statusCode >= 200 && statusCode < 400,
        statusCode,
        finalUrl: currentTarget.url.toString(),
        pageTitle: '',
        textExcerpt: `Non-HTML resource (${contentType || 'unknown content type'})`,
      };
    }

    const html = await readTextLimited(response, 120_000);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);

    return {
      reachable: statusCode >= 200 && statusCode < 400,
      statusCode,
      finalUrl: currentTarget.url.toString(),
      pageTitle,
      textExcerpt: stripped,
    };
  } catch (error) {
    if (error instanceof UnsafePublicUrlError) throw error;
    return {
      reachable: false,
      statusCode: null,
      finalUrl: safeUrl.toString(),
      pageTitle: '',
      textExcerpt: '',
    };
  } finally {
    clearTimeout(timeout);
  }
}
