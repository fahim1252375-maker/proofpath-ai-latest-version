import crypto from 'node:crypto';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const SCRYPT_KEYLEN = 64;

export function assertProductionSecurityConfiguration(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const sessionSecret = process.env.SESSION_SECRET?.trim() || '';
  if (
    sessionSecret.length < 32 ||
    sessionSecret === 'replace-with-32-char-random-secret' ||
    sessionSecret === 'proofpath-local-session-salt'
  ) {
    throw new Error('Production requires SESSION_SECRET to be a unique random value of at least 32 characters.');
  }

  assertProductionDatabasePath();
}

/**
 * Production must use an explicitly configured absolute database path.
 * Whether that path is actually backed by durable storage is a hosting-level
 * property and must still be verified in staging.
 */
export function assertProductionDatabasePath(): string {
  const configuredPath = process.env.DB_PATH?.trim() || '';
  if (!configuredPath) {
    throw new Error('Production requires DB_PATH to be set to an absolute path on durable persistent storage.');
  }
  if (configuredPath === ':memory:' || !path.isAbsolute(configuredPath)) {
    throw new Error('Production DB_PATH must be an absolute filesystem path on durable persistent storage.');
  }
  return configuredPath;
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length > 0 && leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  assertProductionSecurityConfiguration();
  const secret = process.env.SESSION_SECRET || 'proofpath-local-session-salt';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function sanitizeText(value: string, maxLength = 5000): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

interface RateBucket {
  timestamps: number[];
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as Request & { authUser?: { id: string } }).authUser?.id || 'anon';
    const key = `${options.keyPrefix}:${ip}:${userId}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const bucket = buckets.get(key) || { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

    if (bucket.timestamps.length >= options.maxRequests) {
      const retryAfterSec = Math.ceil((bucket.timestamps[0] + options.windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      res.status(429).json({
        error: 'Too many requests. Please wait before trying again.',
        retryAfterSeconds: Math.max(1, retryAfterSec),
      });
      return;
    }

    bucket.timestamps.push(now);
    buckets.set(key, bucket);

    if (buckets.size > 5000) {
      for (const [k, b] of buckets.entries()) {
        if (b.timestamps.every((ts) => ts <= cutoff)) {
          buckets.delete(k);
        }
      }
    }

    next();
  };
}
