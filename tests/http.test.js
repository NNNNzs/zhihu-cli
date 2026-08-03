import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requestAndroidJson, requestJson, requestWebJson, HttpError } from '../scripts/lib/http.js';
import { loadConfig, saveCookies } from '../scripts/lib/config.js';

const config = { cookies: {}, userAgent: 'test', zse93: '101_3_3.0', proxy: null };

test('mock search retries transient failures and preserves paging JSON', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response('{"message":"later"}', { status: 500 });
    return new Response('{"data":[],"paging":{"is_end":true}}', { status: 200 });
  };
  try {
    const result = await requestJson(config, 'https://www.zhihu.com/api/v4/search_v3?q=x');
    assert.equal(calls, 2);
    assert.equal(result.paging.is_end, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mock login failure reports 401 without retrying', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{"code":10001,"message":"login required","need_login":true}', { status: 401 });
  };
  try {
    await assert.rejects(
      requestJson(config, 'https://www.zhihu.com/api/v4/me'),
      (error) => error instanceof HttpError
        && error.status === 401
        && error.zhihuCode === 10001
        && !error.responseSnippet.includes('session'),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST does not retry and 403 is reported without request secrets', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{"code":403,"message":"risk control"}', { status: 403 });
  };
  try {
    await assert.rejects(
      requestJson(config, 'https://www.zhihu.com/api/v4/content/publish', { method: 'POST', retries: 99, body: { x: 1 } }),
      (error) => error instanceof HttpError && error.status === 403 && error.zhihuCode === 403,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects non-Zhihu origins before fetch', async () => {
  await assert.rejects(requestJson(config, 'https://example.com/data'), /非白名单/);
});

test('web and Android channels enforce isolated security headers', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response('{}');
  };
  const authenticated = { ...config, cookies: { z_c0: 'session', d_c0: 'device' } };
  try {
    await requestWebJson(authenticated, 'https://www.zhihu.com/api/v4/me', {
      signed: true,
      headers: { cookie: 'attacker=1', 'user-agent': 'attacker', 'x-app-version': 'attacker' },
    });
    await requestAndroidJson(authenticated, 'https://api.zhihu.com/topstory/hot-list', {
      signed: true,
      headers: { cookie: 'attacker=1', 'user-agent': 'attacker', 'x-zse-96': 'attacker' },
    });
    assert.equal(calls[0].headers.cookie, 'z_c0=session; d_c0=device');
    assert.equal(calls[0].headers['user-agent'], 'test');
    assert.equal(calls[0].headers['x-requested-with'], 'fetch');
    assert.ok(calls[0].headers['x-zse-96']);
    assert.equal(calls[0].headers['x-app-version'], undefined);
    assert.equal(calls[1].headers.cookie, undefined);
    assert.match(calls[1].headers['user-agent'], /^com\.zhihu\.android/);
    assert.equal(calls[1].headers['x-app-version'], '10.61.0');
    assert.equal(calls[1].headers['x-zse-96'], undefined);
    assert.equal(calls[1].headers['x-requested-with'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('web responses roll Set-Cookie updates on success and failure without replaying writes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-cookie-roll-'));
  const previousPath = process.env.ZHIHU_CLI_CONFIG;
  const originalFetch = globalThis.fetch;
  process.env.ZHIHU_CLI_CONFIG = path.join(directory, 'config.json');
  saveCookies({ z_c0: 'session', obsolete: 'old' });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    const headers = new Headers();
    headers.append('set-cookie', calls === 1 ? '_xsrf=new; Path=/' : 'obsolete=; Max-Age=0; Path=/');
    return calls === 1 ? new Response('{}', { headers }) : new Response('{"message":"expired"}', { status: 401, headers });
  };
  try {
    const active = loadConfig();
    await requestWebJson(active, 'https://www.zhihu.com/api/v4/me');
    await assert.rejects(
      requestWebJson(active, 'https://www.zhihu.com/api/v4/content/publish', { method: 'POST', retries: 9, body: {} }),
      (error) => error instanceof HttpError && error.status === 401 && /auth repair/.test(error.message),
    );
    assert.equal(calls, 2);
    assert.equal(loadConfig().cookies._xsrf, 'new');
    assert.equal(loadConfig().cookies.obsolete, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousPath === undefined) delete process.env.ZHIHU_CLI_CONFIG;
    else process.env.ZHIHU_CLI_CONFIG = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
