import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const root = path.resolve(__dirname, '..');
const available = existsSync(bash);
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'limpio-vps-regression-'));
  mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
  mkdirSync(path.join(dir, 'mock-bin'));
  return dir;
}
function removeFixture(dir: string) {
  const target = path.resolve(dir);
  if (!target.startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(target).startsWith('limpio-vps-regression-')) throw new Error('Unsafe fixture cleanup');
  rmSync(target, { recursive: true, force: true });
}
function shell(dir: string, file: string, source: string) {
  writeFileSync(path.join(dir, file), '#!/usr/bin/env bash\n' + source + '\n', { mode: 0o755 });
}

it.skipIf(!available)('restores the former build after a start or directory-swap failure without real services', () => {
  for (const failure of ['start', 'swap']) {
    const dir = fixture();
    try {
      copyFileSync(path.join(root, 'scripts/deploy-vps.sh'), path.join(dir, 'scripts/deploy-vps.sh'));
      copyFileSync(path.join(root, 'scripts/lib/cloudflare-purge.sh'), path.join(dir, 'scripts/lib/cloudflare-purge.sh'));
      mkdirSync(path.join(dir, '.next/static'), { recursive: true });
      writeFileSync(path.join(dir, '.next/BUILD_ID'), 'old-build');
      writeFileSync(path.join(dir, 'test.env'), 'CHECKOUT_MODE=whatsapp\nCF_ZONE_ID=\nCF_API_TOKEN=\n');
      writeFileSync(path.join(dir, 'bash-env'), 'export PATH="$PWD/mock-bin:$PATH"\n');
      shell(dir, 'mock-bin/npm', 'mkdir -p .next-staging/static\nprintf new-build > .next-staging/BUILD_ID');
      shell(dir, 'mock-bin/flock', 'exit 0');
      shell(dir, 'mock-bin/curl', 'exit 0');
      shell(dir, 'mock-bin/sudo', '"$@"');
      shell(dir, 'mock-bin/systemctl', 'echo "$1" >> service-calls\nif [[ "$1" == start && "$WANT_FAILURE" == start && ! -f failed-start ]]; then touch failed-start; exit 1; fi\nexit 0');
      shell(dir, 'mock-bin/mv', 'if [[ "$1" == .next-staging && "$WANT_FAILURE" == swap ]]; then exit 1; fi\n/usr/bin/mv "$@"');
      const result = spawnSync(bash, ['scripts/deploy-vps.sh'], { cwd: dir, encoding: 'utf8', timeout: 15_000, env: { ...process.env, BASH_ENV: path.join(dir, 'bash-env').replace(/\\/g, '/'), APP_ENV_FILE: path.join(dir, 'test.env').replace(/\\/g, '/'), WANT_FAILURE: failure } });
      expect(result.status, result.stderr).toBe(1);
      expect(readFileSync(path.join(dir, '.next/BUILD_ID'), 'utf8')).toBe('old-build');
      expect(readFileSync(path.join(dir, 'service-calls'), 'utf8').trim().split('\n').at(-1)).toBe('start');
    } finally { removeFixture(dir); }
  }
}, 45_000);

it.skipIf(!available)('keeps other instance cron jobs and renders the managed instance idempotently', () => {
  const dir = fixture();
  try {
    copyFileSync(path.join(root, 'scripts/lib/render-crontab.sh'), path.join(dir, 'renderer.sh'));
    copyFileSync(path.join(root, 'deploy/crontab.vps'), path.join(dir, 'template'));
    const existing = 'APP_SLUG=other\n0 1 * * * /var/www/$APP_SLUG/scripts/run-cron-endpoint.sh abandoned-cart\n0 2 * * * /opt/report.sh\n';
    writeFileSync(path.join(dir, 'existing'), existing);
    const run = () => spawnSync(bash, ['renderer.sh', 'existing', 'template', 'shop', '/etc/shop/shop.env'], { cwd: dir, encoding: 'utf8', timeout: 5000 });
    const result = run(); expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(existing); expect(result.stdout).not.toContain('APP_SLUG=storefront');
    expect(result.stdout).toContain('APP_SLUG=shop APP_ENV_FILE=/etc/shop/shop.env');
    expect(result.stdout).toContain('/var/www/shop/scripts/run-cron-endpoint.sh cashea-reconcile');
    writeFileSync(path.join(dir, 'existing'), result.stdout);
    const second = run(); expect(second.status).toBe(0);
    expect(second.stdout.match(/run-cron-endpoint.sh cashea-reconcile/g)).toHaveLength(1);
    expect(second.stdout).toContain('/opt/report.sh');
  } finally { removeFixture(dir); }
});
