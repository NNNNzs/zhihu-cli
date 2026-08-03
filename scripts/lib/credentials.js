import { mergeCookies } from './config.js';

function splitSetCookie(value) {
  return value ? value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g) : [];
}

export function setCookiePatch(headers) {
  const rawValues = typeof headers?.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers?.get?.('set-cookie')];
  const patch = {};
  for (const value of (rawValues || []).flatMap(splitSetCookie)) {
    const segments = value.split(';');
    const pair = segments[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const cookieValue = pair.slice(separator + 1).trim();
    const attributes = `;${segments.slice(1).join(';')}`;
    const expired = /(?:^|;)\s*max-age\s*=\s*0(?:;|$)/i.test(attributes)
      || /(?:^|;)\s*expires\s*=\s*Thu, 01 Jan 1970/i.test(attributes);
    patch[name] = !cookieValue || expired ? null : cookieValue;
  }
  return patch;
}

export function absorbSetCookies(headers, cookies) {
  const patch = setCookiePatch(headers);
  for (const [name, value] of Object.entries(patch)) {
    if (value === null) delete cookies[name];
    else cookies[name] = value;
  }
  return patch;
}

export function rollResponseCookies(config, response) {
  if (!config?.cookies || Object.keys(config.cookies).length === 0) return { changedCookieNames: [] };
  const patch = setCookiePatch(response?.headers);
  if (Object.keys(patch).length === 0) return { changedCookieNames: [] };
  const saved = mergeCookies(patch);
  absorbSetCookies(response.headers, config.cookies);
  return { changedCookieNames: [...new Set([...saved.addedCookieNames, ...saved.removedCookieNames, ...Object.keys(patch)])].sort() };
}
