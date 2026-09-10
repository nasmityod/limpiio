import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const crontabPath = path.resolve(__dirname, '..', 'deploy', 'crontab.vps');
const crontab = readFileSync(crontabPath, 'utf8');

describe('deploy/crontab.vps', () => {
  it('incluye auto-cancel-orders exactamente una vez', () => {
    const matches = crontab.match(/\/auto-cancel-orders/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('programa auto-cancel-orders cuatro veces por hora', () => {
    const lineMatch = crontab.match(/^7,22,37,52 \* \* \* \*.*$/m);
    expect(lineMatch).not.toBeNull();
    expect(lineMatch![0]).toContain('/api/cron/auto-cancel-orders');
  });

  it('protege auto-cancel-orders con CRON_SECRET', () => {
    const line = crontab.split('\n').find((l) => l.includes('auto-cancel-orders'));
    expect(line).toBeDefined();
    expect(line).toContain('Authorization: Bearer $CRON_SECRET');
  });

  it('auto-cancel-orders escribe en el log operativo', () => {
    const line = crontab.split('\n').find((l) => l.includes('auto-cancel-orders'));
    expect(line).toBeDefined();
    expect(line).toContain('/var/log/mundotech-cron.log');
  });
});
