#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function printHelp() {
  process.stdout.write(`用法:
  pnpm release                              只运行发布前检查
  pnpm release -- --publish                 检查通过后发布到 npm
  pnpm release -- --publish --tag next      发布到 next dist-tag
  pnpm release -- --registry <url>         使用指定 npm registry 检查

选项:
  --publish                 执行实际发布；默认不会上传
  --tag <name>              npm dist-tag，默认 latest
  --registry <url>          npm registry，默认 https://registry.npmjs.org/
  --help                    显示帮助

发布脚本不会自动升级版本号。发布前请同步修改 package.json 的 version 与 SKILL.md 的 metadata.version，并完成 npm 登录或配置好双因素认证。
`);
}

function parseArgs(argv) {
  const options = {
    publish: false,
    tag: 'latest',
    registry: 'https://registry.npmjs.org/',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--publish') {
      options.publish = true;
      continue;
    }
    if (argument === '--tag' || argument === '--registry') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} 需要一个值`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--tag=')) {
      options.tag = argument.slice('--tag='.length);
      continue;
    }
    if (argument.startsWith('--registry=')) {
      options.registry = argument.slice('--registry='.length);
      continue;
    }
    throw new Error(`未知选项: ${argument}`);
  }

  return options;
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} 执行失败${output ? `\n${output}` : ''}`);
  }
  return result;
}

function normalizeRegistry(registry) {
  let parsed;
  try {
    parsed = new URL(registry);
  } catch {
    throw new Error(`registry 不是有效 URL: ${registry}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('registry 只支持 http 或 https URL');
  }
  if (parsed.username || parsed.password) {
    throw new Error('registry URL 不允许内嵌用户名或密码，请使用 npm 配置管理凭证');
  }
  return registry.replace(/\/+$/, '');
}

function assertValidOptions(options) {
  if (!options.tag || !/^[A-Za-z0-9._-]+$/.test(options.tag)) {
    throw new Error(`tag 无效: ${options.tag}`);
  }
  options.registry = normalizeRegistry(options.registry);
}

function assertVersionConsistency() {
  const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
  const match = skill.match(/^  version:\s*["']?([^"'\s]+)["']?\s*$/m);
  if (!match) throw new Error('SKILL.md 缺少 metadata.version');
  if (match[1] !== packageJson.version) {
    throw new Error(`版本不一致: package.json=${packageJson.version}, SKILL.md=${match[1]}`);
  }
}

function assertWorkingTree() {
  const result = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { capture: true });
  const changes = result.stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !line.startsWith('?? .codegraph/'));

  if (changes.length > 0) {
    throw new Error(`工作区存在未提交改动，请先提交后再发布:\n${changes.join('\n')}`);
  }
}

function assertVersionAvailable(options) {
  const packageVersion = `${packageJson.name}@${packageJson.version}`;
  const result = spawnSync('npm', ['view', packageVersion, 'version', '--registry', options.registry], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status === 0) {
    throw new Error(`${packageVersion} 已经存在于 ${options.registry}`);
  }

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (!/E404|404 Not Found|is not in this registry|not found/i.test(output)) {
    throw new Error(`无法确认 ${packageVersion} 是否已占用:\n${output.trim()}`);
  }
  process.stdout.write(`[release] ${packageVersion} 尚未占用\n`);
}

function runChecks(options) {
  process.stdout.write('[release] 检查 package.json 与 Skill 版本一致\n');
  assertVersionConsistency();
  process.stdout.write('[release] 检查 Git 工作区\n');
  assertWorkingTree();

  process.stdout.write('[release] 运行 pnpm check\n');
  run('pnpm', ['check']);
  process.stdout.write('[release] 运行 pnpm test\n');
  run('pnpm', ['test']);
  process.stdout.write('[release] 验证 npm tarball\n');
  run('pnpm', ['verify:pack']);
  process.stdout.write('[release] 预览 npm tarball 文件\n');
  run('pnpm', ['pack', '--dry-run']);
  assertVersionAvailable(options);
}

function publish(options) {
  process.stdout.write(`[release] 发布 ${packageJson.name}@${packageJson.version} 到 ${options.registry}，tag=${options.tag}\n`);
  run('pnpm', [
    'publish',
    '--access',
    'public',
    '--tag',
    options.tag,
    '--registry',
    options.registry,
    '--no-git-checks',
  ]);
  process.stdout.write('[release] 发布命令已完成；npm registry 可能需要短暂时间同步\n');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
  } else {
    assertValidOptions(options);
    runChecks(options);
    if (options.publish) {
      publish(options);
    } else {
      process.stdout.write('[release] 检查通过；未执行发布。需要上传时请追加 --publish\n');
    }
  }
} catch (error) {
  process.stderr.write(`[release] ${error.message}\n`);
  process.exitCode = 1;
}
