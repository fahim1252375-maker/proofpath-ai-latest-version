import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase } from '../server/db.ts';
import { assertProductionSecurityConfiguration, timingSafeEqualString } from '../server/security.ts';
import { assertSafePublicUrl, isBlockedIp } from '../server/ssrf.ts';

const originalNodeEnv = process.env.NODE_ENV;
const originalSessionSecret = process.env.SESSION_SECRET;
const originalDbPath = process.env.DB_PATH;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
  if (originalDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = originalDbPath;
});

describe('production security configuration', () => {
  it('requires a sufficiently long session secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PATH = path.join(os.tmpdir(), 'proofpath-production-security-test.db');
    delete process.env.SESSION_SECRET;
    expect(assertProductionSecurityConfiguration).toThrow(/SESSION_SECRET/);

    process.env.SESSION_SECRET = 'replace-with-32-char-random-secret';
    expect(assertProductionSecurityConfiguration).toThrow(/SESSION_SECRET/);

    process.env.SESSION_SECRET = 's'.repeat(40);
    expect(assertProductionSecurityConfiguration).not.toThrow();
  });

  it('requires an explicit absolute DB_PATH in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 's'.repeat(40);
    delete process.env.DB_PATH;
    expect(assertProductionSecurityConfiguration).toThrow(/DB_PATH/);
    expect(() => initDatabase()).toThrow(/DB_PATH/);

    process.env.DB_PATH = './data/proofpath.db';
    expect(assertProductionSecurityConfiguration).toThrow(/absolute filesystem path/);

    process.env.DB_PATH = ':memory:';
    expect(assertProductionSecurityConfiguration).toThrow(/absolute filesystem path/);

    process.env.DB_PATH = path.join(os.tmpdir(), 'proofpath-production.db');
    expect(assertProductionSecurityConfiguration).not.toThrow();
  });

  it('uses constant-time equality for CSRF tokens and rejects length mismatches', () => {
    expect(timingSafeEqualString('same-token', 'same-token')).toBe(true);
    expect(timingSafeEqualString('same-token', 'diff-token')).toBe(false);
    expect(timingSafeEqualString('short', 'longer')).toBe(false);
    expect(timingSafeEqualString('', '')).toBe(false);
  });

  it('does not seed demo opportunities or verification reports into a fresh production database', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDbPath = process.env.DB_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofpath-production-seed-test-'));
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'production-test-secret-'.padEnd(64, 'x');
    process.env.DB_PATH = path.join(tempDir, 'production.db');

    const db = initDatabase();
    try {
      const opportunities = db.prepare('SELECT COUNT(*) AS count FROM opportunities').get() as { count: number };
      const reports = db.prepare('SELECT COUNT(*) AS count FROM verification_reports').get() as { count: number };
      expect(opportunities.count).toBe(0);
      expect(reports.count).toBe(0);
    } finally {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
    }
  });
});

describe('public URL network boundaries', () => {
  it('blocks private, loopback, metadata, multicast, and mapped IPv6 ranges', () => {
    for (const ip of [
      '10.1.2.3',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.1.10',
      '192.168.1.2',
      '224.0.0.1',
      '198.18.0.1',
      '::1',
      '::ffff:127.0.0.1',
      '0:0:0:0:0:ffff:7f00:1',
      '2001:0::1',
      '2002:7f00:1::',
      '64:ff9b::a9fe:a9fe',
      'fc00::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public literals and rejects local or non-web URLs', async () => {
    await expect(assertSafePublicUrl('https://8.8.8.8/')).resolves.toBeInstanceOf(URL);
    await expect(assertSafePublicUrl('https://[2606:4700:4700::1111]/')).resolves.toBeInstanceOf(URL);
    await expect(assertSafePublicUrl('http://127.0.0.1/')).rejects.toThrow();
    await expect(assertSafePublicUrl('http://localhost/')).rejects.toThrow();
    await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertSafePublicUrl('https://user:pass@example.com/')).rejects.toThrow();
  });
});
