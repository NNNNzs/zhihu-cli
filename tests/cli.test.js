import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CLI accepts the pnpm separator and compiles stdin', () => {
  const result = spawnSync(process.execPath, ['scripts/cli.js', '--', 'answer', 'compile', '--input', '-'], {
    cwd: projectDirectory,
    input: '# 标题\n',
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.match(output.data.html, /<h2>标题<\/h2>/);
});

test('pnpm command keeps failure stdout empty and stderr as JSON', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-cli-test-'));
  try {
    const result = spawnSync('pnpm', ['zhihu', '--', 'auth', 'status'], {
      cwd: projectDirectory,
      encoding: 'utf8',
      env: { ...process.env, ZHIHU_CREATOR_CONFIG: path.join(directory, 'missing.json') },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const output = JSON.parse(result.stderr);
    assert.equal(output.ok, false);
    assert.equal(output.error.type, 'configuration_error');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
