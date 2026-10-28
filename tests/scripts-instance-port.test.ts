import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const bashPath = (p: string) => p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
const nodePath = (p: string) => process.platform === 'win32' ? p.replace(/^\/([a-z])\//, (_, drive: string) => `${drive.toUpperCase()}:/`) : p;
const sourceRoot = path.resolve('.');

function run(script: string, config: string) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'audit-instance-port-'));
  const sourceScript = path.join(directory, 'scripts', script);
  const argsFile = path.join(directory, 'curl-args.txt');
  const chmodFile = path.join(directory, 'chmod-args.txt');
  const headerCapture = path.join(directory, 'header-capture.txt');
  const envCapture = path.join(directory, 'curl-env.txt');
  try {
    mkdirSync(path.join(directory, 'scripts', 'lib'), { recursive: true });
    mkdirSync(path.join(directory, 'tmp'));
    mkdirSync(path.join(directory, 'locks'));
    // The only source substitution confines the absolute cron lock path to
    // this invocation's sandbox. Actual URL/env/token logic is unchanged.
    const contents = readFileSync(path.join(sourceRoot, 'scripts', script), 'utf8').replaceAll('\r\n', '\n').replaceAll('/var/lock/', `${bashPath(directory)}/locks/`);
    writeFileSync(sourceScript, contents, 'utf8');
    writeFileSync(path.join(directory, 'scripts', 'lib', 'cloudflare-purge.sh'), 'should_purge_cloudflare_cache() { return 1; }\ncloudflare_purge_decision() { printf "mock purge skipped\\n"; }\n');
    const envFile = path.join(directory, 'fixture.env');
    writeFileSync(envFile, `${config}\nCHECKOUT_MODE=full\nCRON_SECRET='audit-secret-only-fixture'\nUNRELATED_SECRET=do-not-export\n`, 'utf8');
    const harness = path.join(directory, 'harness.sh');
    writeFileSync(harness, `#!/usr/bin/env bash
set -euo pipefail
flock() { return 0; }
sudo() {
  case "$1" in
    test) shift; test "$@" ;;
    cat) shift; cat "$@" ;;
    systemctl) return 0 ;;
    *) return 90 ;;
  esac
}
npm() { mkdir -p "$NEXT_BUILD_DIR/static"; printf 'audit-build\\n' > "$NEXT_BUILD_DIR/BUILD_ID"; }
chmod() { printf '%s\\n' "$@" >> "$AUDIT_CHMOD"; command chmod "$@"; }
jq() { return 0; }
curl() {
  printf '%s\\n' "$@" >> "$AUDIT_ARGS"
  printf 'cron=%s unrelated=%s\\n' "\${CRON_SECRET-unset}" "\${UNRELATED_SECRET-unset}" >> "$AUDIT_ENV"
  local previous='' argument response=''
  for argument in "$@"; do
    if [[ "$previous" == '-o' ]]; then response="$argument"; fi
    if [[ "$previous" == '-H' && "$argument" == @* ]]; then
      cat "\${argument:1}" >> "$AUDIT_HEADER"
    fi
    previous="$argument"
  done
  if [[ -n "$response" ]]; then printf '{"ok":true}\\n' > "$response"; fi
  printf '200'
}
export -f flock sudo npm chmod jq curl
exec bash "$AUDIT_SCRIPT" "\${AUDIT_ENDPOINT_NAME:-}"
`, 'utf8');
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      TMPDIR: bashPath(path.join(directory, 'tmp')),
      APP_SLUG: 'audit-instance',
      APP_ENV_FILE: bashPath(envFile),
      AUDIT_SCRIPT: bashPath(sourceScript),
      AUDIT_ENDPOINT_NAME: 'cashea-reconcile',
      AUDIT_ARGS: bashPath(argsFile),
      AUDIT_CHMOD: bashPath(chmodFile),
      AUDIT_HEADER: bashPath(headerCapture),
      AUDIT_ENV: bashPath(envCapture),
    };
    execFileSync(bash, [bashPath(harness)], { cwd: directory, env: environment, encoding: 'utf8', timeout: 15_000 });
    const args = readFileSync(argsFile, 'utf8').trim().split('\n');
    return {
      args,
      token: existsSync(headerCapture) ? readFileSync(headerCapture, 'utf8') : '',
      chmod: existsSync(chmodFile) ? readFileSync(chmodFile, 'utf8').trim().split('\n') : [],
      curlEnvironment: readFileSync(envCapture, 'utf8'),
      headerWasRemoved: args.filter((a) => a.startsWith('@')).every((a) => !existsSync(nodePath(a.slice(1)))),
    };
  } finally {
    const resolved = path.resolve(directory);
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('audit-instance-port-')) throw new Error('Unexpected test cleanup path.');
    rmSync(resolved, { recursive: true, force: true });
  }
}

describe.skipIf(!existsSync(bash))('instance scripts: hermetic Bash execution', () => {
  it.each([
    ['PORT=3001', 'http://127.0.0.1:3001/api/health'],
    ['PORT=3001\nAPP_BASE_URL="http://127.0.0.1:4200/"', 'http://127.0.0.1:4200/api/health'],
    ['', 'http://127.0.0.1:3000/api/health'],
  ])('deploy health reads the loaded instance environment: %s', (config, url) => {
    expect(run('deploy-vps.sh', config).args).toContain(url);
  });

  it.each([
    ['run-cron-endpoint.sh', 'PORT=3001', 'http://127.0.0.1:3001/api/cron/cashea-reconcile'],
    ['run-cron-endpoint.sh', 'PORT=3001\nAPP_BASE_URL="http://127.0.0.1:4200/"', 'http://127.0.0.1:4200/api/cron/cashea-reconcile'],
    ['run-cron-endpoint.sh', '', 'http://127.0.0.1:3000/api/cron/cashea-reconcile'],
    ['run-bcv-cron.sh', 'PORT=3001', 'http://127.0.0.1:3001/api/cron/update-bcv-rate'],
    ['run-bcv-cron.sh', 'PORT=3001\nAPP_BASE_URL="http://127.0.0.1:4200/"', 'http://127.0.0.1:4200/api/cron/update-bcv-rate'],
    ['run-bcv-cron.sh', 'PORT=3001\nAPP_BASE_URL=http://127.0.0.1:4200\nAPP_BCV_ENDPOINT="http://127.0.0.1:4300/custom-bcv"', 'http://127.0.0.1:4300/custom-bcv'],
    ['run-bcv-cron.sh', '', 'http://127.0.0.1:3000/api/cron/update-bcv-rate'],
  ])('%s uses %s without exposing the Bearer in argv/environment', (script, config, url) => {
    const result = run(script, config);
    expect(result.args).toContain(url);
    expect(result.args.join(' ')).not.toContain('audit-secret-only-fixture');
    expect(result.token).toBe('Authorization: Bearer audit-secret-only-fixture\n');
    expect(result.chmod[0]).toBe('600');
    expect(result.headerWasRemoved).toBe(true);
    expect(result.curlEnvironment).toContain('cron=unset');
    if (script === 'run-cron-endpoint.sh') expect(result.curlEnvironment).toContain('unrelated=unset');
  });
});
