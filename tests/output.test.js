import test from 'node:test';
import assert from 'node:assert/strict';
import { configureOutput, success, tableText } from '../scripts/lib/output.js';

test('table schemas keep fixed columns, format nested values, and truncate wide text', () => {
  const rendered = tableText([{ id: 1, author: { name: '作者' }, content: '很长的中文正文'.repeat(20), ignored: 'secret' }], [
    { key: 'id', label: 'ID', width: 8 },
    { key: 'author', label: '作者', width: 12, format: (value) => value.name },
    { key: 'content', label: '正文', width: 20 },
  ]);
  assert.match(rendered, /ID/);
  assert.match(rendered, /作者/);
  assert.match(rendered, /…/);
  assert.doesNotMatch(rendered, /ignored|secret|\{"name"/);
  assert.equal(tableText([]), '（无数据）\n');
});

test('table success keeps warnings on stderr and omits the JSON envelope', () => {
  const stdout = [];
  const stderr = [];
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  process.stdout.write = (value) => { stdout.push(String(value)); return true; };
  process.stderr.write = (value) => { stderr.push(String(value)); return true; };
  try {
    configureOutput({ format: 'table' });
    success([{ id: 1 }], { table: [{ key: 'id', label: 'ID', width: 8 }], warnings: ['注意'] });
    assert.doesNotMatch(stdout.join(''), /"ok"/);
    assert.match(stdout.join(''), /ID/);
    assert.match(stderr.join(''), /警告: 注意/);
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
    configureOutput({ format: 'json' });
  }
});
