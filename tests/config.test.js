import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cookieHeader, loadConfig, parseCookieHeader, saveCookies } from '../scripts/lib/config.js';

test('cookie parser preserves equals signs and skips attributes', () => {
  const cookies = parseCookieHeader('d_c0=abc==; z_c0=secret; Path=/; Secure; _xsrf=x');
  assert.deepEqual(cookies, { d_c0: 'abc==', z_c0: 'secret', _xsrf: 'x' });
  assert.equal(cookieHeader(cookies), 'd_c0=abc==; z_c0=secret; _xsrf=x');
});

test('saved config is private and loadable without exposing values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-config-test-'));
  const previous = process.env.ZHIHU_CREATOR_CONFIG;
  process.env.ZHIHU_CREATOR_CONFIG = path.join(directory, 'nested', 'config.json');
  try {
    const saved = saveCookies({ d_c0: 'private', z_c0: 'session' });
    assert.deepEqual(saved.cookieNames, ['d_c0', 'z_c0']);
    assert.equal(fs.statSync(saved.configPath).mode & 0o777, 0o600);
    assert.equal(loadConfig({ required: true }).cookies.d_c0, 'private');
  } finally {
    if (previous === undefined) delete process.env.ZHIHU_CREATOR_CONFIG;
    else process.env.ZHIHU_CREATOR_CONFIG = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
