import { HttpError } from './http.js';

export function success(data, { paging, warnings = [] } = {}) {
  const result = { ok: true, data };
  if (paging !== undefined) result.paging = paging;
  if (warnings.length > 0) result.warnings = warnings;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
  process.exitCode = error.exitCode || 1;
}
