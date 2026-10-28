import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const crontabPath = path.resolve(__dirname, '..', 'deploy', 'crontab.vps');
const crontab = readFileSync(crontabPath, 'utf8');

const cronLines = crontab.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && !/^[A-Z_]+=/.test(l.trim()));

describe('deploy/crontab.vps', () => {
  it('incluye auto-cancel-orders exactamente una vez', () => {
    const matches = crontab.match(/auto-cancel-orders/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('programa auto-cancel-orders cuatro veces por hora', () => {
    const lineMatch = crontab.match(/^7,22,37,52 \* \* \* \*.*$/m);
    expect(lineMatch).not.toBeNull();
    expect(lineMatch![0]).toContain('run-cron-endpoint.sh auto-cancel-orders');
  });

  it('SEC-2026-09: ninguna línea del crontab pone CRON_SECRET en argv de curl', () => {
    // El secreto viaja en un fichero 600 vía `curl -H @file` (scripts/run-cron-endpoint.sh).
    for (const line of cronLines) {
      expect(line).not.toContain('Authorization: Bearer');
      expect(line).not.toContain('curl ');
    }
  });

  it('los crons de API pasan por run-cron-endpoint.sh', () => {
    const apiLines = cronLines.filter((l) => !l.includes('run-bcv-cron.sh') && !l.includes('backup-postgres.sh'));
    expect(apiLines.length).toBeGreaterThan(0);
    for (const line of apiLines) {
      expect(line).toMatch(/run-cron-endpoint\.sh [a-z-]+ >>/);
    }
  });

  it('auto-cancel-orders escribe en el log operativo', () => {
    const line = crontab.split('\n').find((l) => l.includes('auto-cancel-orders'));
    expect(line).toBeDefined();
    expect(line).toContain('/var/log/$APP_SLUG-cron.log');
  });
});
