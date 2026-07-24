import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONFIG = Object.freeze({
  cookies: {},
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  zse93: '101_3_3.0',
  proxy: null,
  defaultStyle: {
    comment_permission: 'all',
    reshipment_settings: 'allowed',
    can_reward: false,
    table_of_contents_enabled: false,
  },
});

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.errorType = 'configuration_error';
  }
}

export class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.errorType = 'authentication_error';
  }
}

export function getConfigPath() {
  return process.env.ZHIHU_CREATOR_CONFIG || path.join(os.homedir(), '.zhihu-creator', 'config.json');
}

export function parseCookieHeader(input) {
  const skippedNames = new Set(['domain', 'path', 'expires', 'max-age', 'httponly', 'secure', 'samesite']);
  const cookies = {};

  for (const segment of input.split(';')) {
    const part = segment.trim();
    if (!part) continue;
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || skippedNames.has(name.toLowerCase())) continue;
    cookies[name] = value;
  }

  return cookies;
}

export function cookieHeader(cookies) {
  return Object.entries(cookies)
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function loadConfig({ required = false } = {}) {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    if (required) throw new ConfigError(`未找到配置文件 ${configPath}，请先执行 auth import --stdin`);
    return structuredClone(DEFAULT_CONFIG);
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...parsed,
    cookies: { ...(parsed.cookies || {}) },
    defaultStyle: {
      ...DEFAULT_CONFIG.defaultStyle,
      ...(parsed.defaultStyle || {}),
    },
  };
}

export function saveCookies(cookies) {
  if (Object.keys(cookies).length === 0) throw new Error('stdin 中没有解析到 Cookie');
  const configPath = getConfigPath();
  const configDirectory = path.dirname(configPath);
  const existing = loadConfig();
  const next = { ...existing, cookies: { ...existing.cookies, ...cookies } };
  const temporaryPath = `${configPath}.${process.pid}.tmp`;

  fs.mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(configDirectory, 0o700);
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporaryPath, 0o600);
  fs.renameSync(temporaryPath, configPath);
  fs.chmodSync(configPath, 0o600);
  return { configPath, cookieNames: Object.keys(next.cookies).sort() };
}

export function requireCookies(config, names, operation) {
  const missing = names.filter((name) => !config.cookies[name]);
  if (missing.length > 0) {
    throw new AuthenticationError(`${operation} 缺少 Cookie: ${missing.join(', ')}`);
  }
}

export async function readStdin() {
  if (process.stdin.isTTY) throw new Error('请通过 stdin 传入 Cookie，不要把 Cookie 放在命令行参数中');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}
