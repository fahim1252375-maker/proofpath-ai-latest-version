import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const sourcePath = path.resolve(process.env.DB_PATH || path.join(process.cwd(), 'data', 'proofpath.db'));
const requestedDestination = process.argv[2];

if (!requestedDestination) {
  throw new Error('Pass a new, private backup filename: npx tsx scripts/backup-sqlite.ts /secure/path/proofpath.db');
}

const destination = path.resolve(requestedDestination);
if (sourcePath === destination) throw new Error('Backup destination must not match DB_PATH.');
if (!fs.existsSync(sourcePath)) throw new Error('Source database does not exist. Check DB_PATH.');
if (!fs.existsSync(path.dirname(destination))) throw new Error('Backup destination directory must already exist.');
if (fs.existsSync(destination)) throw new Error('Backup destination already exists; choose a new filename.');

const source = new Database(sourcePath, { fileMustExist: true });
source.pragma('busy_timeout = 5000');
try {
  await source.backup(destination);
} finally {
  source.close();
}

fs.chmodSync(destination, 0o600);
const backup = new Database(destination, { readonly: true, fileMustExist: true });
try {
  const integrity = backup.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') {
    fs.rmSync(destination, { force: true });
    throw new Error('Backup integrity check failed; the incomplete backup was removed.');
  }
  const tableNames = ['users', 'student_profiles', 'opportunities', 'verification_reports', 'applications', 'conversations', 'messages'];
  const counts = Object.fromEntries(tableNames.map((name) => {
    const row = backup.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get() as { count: number };
    return [name, row.count];
  }));
  process.stdout.write(`${JSON.stringify({ status: 'backup_validated', destination, integrity, counts }, null, 2)}\n`);
} finally {
  backup.close();
}
