import { HttpError } from './http.js';
import Table from 'cli-table3';

let outputFormat = 'json';
let verboseEnabled = false;

export function configureOutput({ format = 'json', verbose = false } = {}) {
  if (!['json', 'table'].includes(format)) throw new Error('--format 仅支持 json 或 table');
  outputFormat = format;
  verboseEnabled = Boolean(verbose);
}

function displayWidth(value) {
  return [...value].reduce((width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0);
}

function truncate(value, maximum) {
  if (displayWidth(value) <= maximum) return value;
  let result = '';
  for (const character of value) {
    if (displayWidth(result) + displayWidth(character) > maximum - 1) break;
    result += character;
  }
  return `${result}…`;
}

function compact(value, maximum = 180) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return truncate(text.replace(/[\r\n\t]+/g, ' '), maximum);
}

function schemaValue(item, column) {
  const raw = typeof column.format === 'function' ? column.format(item?.[column.key], item) : item?.[column.key];
  return compact(raw, column.width || 40);
}

function fitWidths(columns) {
  const desired = columns.map((column) => column.width || 20);
  const available = Math.max(40, (process.stdout.columns || 120) - (columns.length * 3 + 1));
  const total = desired.reduce((sum, width) => sum + width, 0);
  if (total <= available) return desired;
  return desired.map((width) => Math.max(6, Math.floor(width * available / total)));
}

export function tableText(data, schema) {
  if (Array.isArray(data)) {
    if (data.length === 0) return '（无数据）\n';
    const columns = schema || [...new Set(data.flatMap((item) => item && typeof item === 'object' ? Object.keys(item) : ['value']))].slice(0, 8).map((key) => ({ key, label: key, width: 40 }));
    const widths = fitWidths(columns);
    const table = new Table({ head: columns.map((column) => column.label || column.key), colWidths: widths, wordWrap: false });
    for (const item of data) table.push(columns.map((column, index) => schemaValue(item && typeof item === 'object' ? item : { value: item }, { ...column, width: widths[index] - 2 })));
    return `${table.toString()}\n`;
  }
  if (data && typeof data === 'object') {
    const table = new Table();
    const entries = schema ? schema.map((column) => [column.label || column.key, schemaValue(data, column)]) : Object.entries(data).map(([key, value]) => [key, compact(value)]);
    for (const [key, value] of entries) table.push({ [key]: value });
    return `${table.toString()}\n`;
  }
  return `${compact(data)}\n`;
}

export function success(data, { paging, warnings = [], table } = {}) {
  if (outputFormat === 'table') {
    process.stdout.write(tableText(data, table));
    if (paging !== undefined) process.stdout.write(`分页: ${compact(paging)}\n`);
    for (const warning of warnings) process.stderr.write(`警告: ${warning}\n`);
    return;
  }
  const result = { ok: true, data };
  if (paging !== undefined) result.paging = paging;
  if (warnings.length > 0) result.warnings = warnings;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function progress(event, data = {}) {
  if (outputFormat === 'table') {
    process.stderr.write(`[${event}] ${compact(data)}\n`);
    return;
  }
  process.stderr.write(`${JSON.stringify({ ok: true, event, data })}\n`);
}

export function verbose(details) {
  if (!verboseEnabled) return;
  let safeUrl = details.url;
  try {
    const parsed = new URL(details.url);
    const names = [...new Set(parsed.searchParams.keys())];
    safeUrl = `${parsed.origin}${parsed.pathname}${names.length ? `?${names.map((name) => `${encodeURIComponent(name)}=…`).join('&')}` : ''}`;
  } catch {
    safeUrl = '[invalid url]';
  }
  const safe = {
    method: details.method,
    url: safeUrl,
    status: details.status,
    attempt: details.attempt,
    durationMs: details.durationMs,
    retrying: details.retrying,
    channel: details.channel,
  };
  process.stderr.write(outputFormat === 'table' ? `[http] ${compact(safe)}\n` : `${JSON.stringify({ debug: 'http', ...safe })}\n`);
}

export function serializeError(error) {
  if (error instanceof HttpError) {
    return {
      ok: false,
      error: {
        type: 'http_error',
        message: error.message,
        status: error.status,
        method: error.method,
        url: error.url,
        zhihuCode: error.zhihuCode,
        response: error.responseSnippet,
      },
    };
  }

  return {
    ok: false,
    error: {
      type: error.errorType || (error.name === 'UsageError' ? 'usage_error' : 'error'),
      message: error.message || String(error),
      ...(error.zhihuCode === undefined ? {} : { zhihuCode: error.zhihuCode }),
    },
  };
}

export function fail(error) {
  if (outputFormat === 'table') {
    process.stderr.write(`错误: ${error.message || String(error)}\n`);
    process.exitCode = error.exitCode || 1;
    return;
  }
  process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
  process.exitCode = error.exitCode || 1;
}
