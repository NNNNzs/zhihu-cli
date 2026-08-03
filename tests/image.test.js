import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildOssSignatureString,
  decodeImageSize,
  detectImageType,
  hmacSha1Base64,
  notifyUploadingStatus,
  uploadImage,
} from '../scripts/lib/image.js';

function pngBytes(width = 3, height = 2) {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('detects formats and image dimensions', () => {
  const png = pngBytes(1280, 720);
  assert.deepEqual(detectImageType(png, 'x.bin'), { mimeType: 'image/png', extension: 'png' });
  assert.deepEqual(decodeImageSize(png), { width: 1280, height: 720 });

  const gif = Buffer.alloc(10);
  gif.write('GIF89a', 0, 'ascii');
  gif.writeUInt16LE(320, 6);
  gif.writeUInt16LE(240, 8);
  assert.deepEqual(decodeImageSize(gif), { width: 320, height: 240 });
});

test('OSS canonical string and HMAC remain deterministic', () => {
  const value = buildOssSignatureString({
    method: 'PUT',
    contentType: 'image/png',
    date: 'Thu, 24 Jul 2026 00:00:00 GMT',
    securityToken: 'token',
    imageHash: 'abc',
  });
  assert.match(value, /^PUT\n\nimage\/png\n/);
  assert.match(value, /\/zhihu-pics\/v2-abc$/);
  assert.equal(hmacSha1Base64('secret', 'value'), 'Mwty04TfQa30QOHYrrVDq3Puy4o=');
});

test('reused image skips OSS upload and returns publishable Markdown', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-image-test-'));
  const file = path.join(directory, 'diagram.png');
  fs.writeFileSync(file, pngBytes());
  let statusCalls = 0;
  try {
    const result = await uploadImage({}, file, {
      requestJson: async (config, url) => {
        if (url.endsWith('/images')) return { upload_file: { image_id: 'image-1', state: 1 } };
        statusCalls += 1;
        return { status: 'success', src: 'https://picx.zhimg.com/v2-test.png', watermark: 'none' };
      },
      requestRaw: async () => { throw new Error('should not upload'); },
      sleep: async () => {},
    });
    assert.equal(result.reused, true);
    assert.equal(statusCalls, 1);
    assert.match(result.markdown, /zhimg:w=3;h=2;wm=none/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('new PNG uses OSS HMAC upload and completion notification', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-png-test-'));
  const file = path.join(directory, 'diagram.png');
  fs.writeFileSync(file, pngBytes());
  const calls = [];
  try {
    const result = await uploadImage({}, file, {
      requestJson: async (config, url) => {
        if (url.endsWith('/images')) {
          calls.push('apply');
          return {
            upload_file: { image_id: 'image-2', state: 2 },
            upload_token: { access_id: 'id', access_key: 'key', access_token: 'token' },
          };
        }
        calls.push('poll');
        return { status: 'success', src: 'https://picx.zhimg.com/v2-new.png', watermark: 'none' };
      },
      requestRaw: async (config, url, options) => {
        calls.push(url.endsWith('/uploading_status') ? 'notify' : 'oss');
        calls.push({ url, options });
        return url.endsWith('/uploading_status') ? new Response(null, { status: 204 }) : new Response('');
      },
      sleep: async () => {},
    });
    const rawCalls = calls.filter((call) => typeof call === 'object');
    const upload = rawCalls.find((call) => call.url.startsWith('https://zhihu-pics-upload.zhimg.com/'));
    const notification = rawCalls.find((call) => call.url.endsWith('/uploading_status'));
    assert.equal(upload.options.method, 'PUT');
    assert.equal(upload.options.retries, 0);
    assert.match(upload.options.headers.authorization, /^OSS id:/);
    assert.equal(notification.options.method, 'PUT');
    assert.equal(notification.options.retries, 0);
    assert.deepEqual(calls.filter((call) => typeof call === 'string'), ['apply', 'oss', 'notify', 'poll']);
    assert.equal(result.reused, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('uploading status accepts 204, stays zero-retry, and stops before polling on failure', async () => {
  let options;
  await notifyUploadingStatus({}, 'image-204', async (config, url, requestOptions) => {
    options = requestOptions;
    return new Response(null, { status: 204 });
  });
  assert.equal(options.method, 'PUT');
  assert.equal(options.retries, 0);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-notify-test-'));
  const file = path.join(directory, 'diagram.png');
  fs.writeFileSync(file, pngBytes());
  let pollCalls = 0;
  try {
    await assert.rejects(uploadImage({}, file, {
      requestJson: async (config, url) => {
        if (url.endsWith('/images')) return {
          upload_file: { image_id: 'image-fail', state: 2 },
          upload_token: { access_id: 'id', access_key: 'key', access_token: 'token' },
        };
        pollCalls += 1;
        return { status: 'success' };
      },
      requestRaw: async (config, url) => url.endsWith('/uploading_status')
        ? new Response('', { status: 500 })
        : new Response(''),
      sleep: async () => {},
    }), /状态通知失败/);
    assert.equal(pollCalls, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('GIF uses multipart OSS flow and reports status timeout', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-gif-test-'));
  const file = path.join(directory, 'animation.gif');
  const gif = Buffer.alloc(32);
  gif.write('GIF89a', 0, 'ascii');
  gif.writeUInt16LE(10, 6);
  gif.writeUInt16LE(20, 8);
  fs.writeFileSync(file, gif);
  const rawCalls = [];
  try {
    await assert.rejects(uploadImage({}, file, {
      requestJson: async (config, url) => {
        if (url.endsWith('/images')) {
          return {
            upload_file: { image_id: 'image-2', state: 2 },
            upload_token: { access_id: 'id', access_key: 'key', access_token: 'token' },
          };
        }
        return { status: 'processing' };
      },
      requestRaw: async (config, url, options) => {
        rawCalls.push({ url, options });
        if (url.endsWith('?uploads')) return new Response('<UploadId>upload-1</UploadId>');
        if (url.includes('partNumber=')) return new Response('', { headers: { etag: 'etag-1' } });
        return new Response('');
      },
      sleep: async () => {},
    }), /轮询超时/);
    assert.ok(rawCalls.some((call) => call.url.endsWith('?uploads')));
    assert.ok(rawCalls.some((call) => call.url.includes('partNumber=1')));
    const completeIndex = rawCalls.findIndex((call) => /\?uploadId=/.test(call.url) && call.options.method === 'POST');
    const notificationIndex = rawCalls.findIndex((call) => call.url.includes('uploading_status'));
    assert.ok(completeIndex >= 0);
    assert.ok(notificationIndex > completeIndex);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
