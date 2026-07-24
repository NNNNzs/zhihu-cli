#!/usr/bin/env node

import { parseArgs, requiredOption, integerOption, booleanOption, UsageError } from './lib/args.js';
import { loadConfig, parseCookieHeader, readStdin, requireCookies, saveCookies } from './lib/config.js';
import { ANDROID_HEADERS, requestJson } from './lib/http.js';
import { success, fail } from './lib/output.js';
import { compileMarkdown, readMarkdownInput } from './lib/markdown.js';
import {
  createConfirmationToken,
  fetchAccount,
  fetchQuestion,
  findMyAnswerId,
  publishAnswer,
  saveDraft,
} from './lib/answer.js';
import { uploadImage } from './lib/image.js';

const HELP = `zhihu-creator

Usage:
  pnpm zhihu -- auth import --stdin
  pnpm zhihu -- auth status
  pnpm zhihu -- search --query <text> [--limit 10] [--offset 0] [--questions-only]
  pnpm zhihu -- feed <hot|recommend> [--limit 20]
  pnpm zhihu -- question show --id <question-id>
  pnpm zhihu -- question answers --id <question-id> [--limit 10] [--offset 0] [--sort default|updated]
  pnpm zhihu -- image upload --file <path>
  pnpm zhihu -- answer compile --input <markdown-file|->
  pnpm zhihu -- answer draft --question-id <id> --input <file> [--toc true|false]
  pnpm zhihu -- answer preview --question-id <id> --input <file> [--toc true|false]
  pnpm zhihu -- answer publish --question-id <id> --input <file> --confirm <sha256> [--toc true|false]
`;

export function questionFromSearchItem(item) {
  const object = item.object ?? item.target ?? item;
  const question = object.type === 'question' ? object : object.question;
  if (!question?.id) return null;
  return {
    id: String(question.id),
    title: question.title || item.highlight?.title || '',
    excerpt: question.excerpt || object.excerpt || item.highlight?.description || '',
    answerCount: question.answer_count ?? null,
    followerCount: question.follower_count ?? null,
    visitCount: question.visit_count ?? question.read_count ?? null,
    url: `https://www.zhihu.com/question/${question.id}`,
    matchedType: object.type || null,
  };
}

export function normalizeAnswer(target) {
  const answer = target?.target ?? target;
  if (!answer?.id) return null;
  return {
    id: String(answer.id),
    questionId: answer.question?.id ? String(answer.question.id) : null,
    questionTitle: answer.question?.title || '',
    author: answer.author ? {
      name: answer.author.name || '',
      urlToken: answer.author.url_token || null,
    } : null,
    excerpt: answer.excerpt || answer.excerpt_new || '',
    voteupCount: answer.voteup_count ?? null,
    commentCount: answer.comment_count ?? null,
    createdTime: answer.created_time ?? null,
    updatedTime: answer.updated_time ?? null,
    url: answer.question?.id ? `https://www.zhihu.com/question/${answer.question.id}/answer/${answer.id}` : null,
  };
}

export function normalizeFeedItem(item) {
  const target = item.target ?? item;
  const question = target.question ?? (target.type === 'question' ? target : null);
  const linkUrl = target.link?.url || target.url || null;
  const questionIdFromUrl = /\/question\/(\d+)/.exec(linkUrl || '')?.[1];
  const questionIdFromCard = /^Q_(\d+)$/.exec(item.card_id || '')?.[1];
  return {
    type: target.type || item.type || null,
    id: target.id === undefined ? null : String(target.id),
    title: target.title || question?.title || target.title_area?.text || '',
    excerpt: target.excerpt || target.description || target.excerpt_area?.text || '',
    questionId: question?.id ? String(question.id) : questionIdFromUrl || questionIdFromCard || null,
    voteupCount: target.voteup_count ?? target.vote_count ?? null,
    commentCount: target.comment_count ?? null,
    answerCount: question?.answer_count ?? target.answer_count ?? item.feed_specific?.answer_count ?? null,
    hotValue: target.metrics_area?.text || null,
    url: linkUrl || (question?.id ? `https://www.zhihu.com/question/${question.id}` : null),
  };
}

function childNodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...(Array.isArray(node.children) ? node.children : []),
    ...(Array.isArray(node.elements) ? node.elements : []),
    ...(node.tail_element ? [node.tail_element] : []),
  ];
}

function flattenCard(root) {
  const result = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    result.push(node);
    stack.push(...childNodes(node));
  }
  return result;
}

export function normalizeComponentCard(item) {
  const nodes = flattenCard(item);
  const title = nodes.find((node) => node.test_id?.endsWith('.title'))?.text || '';
  const excerpt = nodes.find((node) => node.test_id?.endsWith('.description'))?.text || '';
  const footer = nodes.find((node) => typeof node.text === 'string' && /赞同|评论/.test(node.text))?.text || '';
  const actionParameters = new URLSearchParams(item.action?.parameter || '');
  const route = actionParameters.get('route_url') || '';
  const routeMatch = /\/question\/(\d+)\/answer\/(\d+)/.exec(route);
  const answerId = item.extra?.contentToken || item.extra?.content_token || routeMatch?.[2] || null;
  const questionId = routeMatch?.[1] || null;
  const voteupCount = Number.parseInt(/(\d+)\s*赞同/.exec(footer)?.[1] || '', 10);
  const commentCount = Number.parseInt(/(\d+)\s*评论/.exec(footer)?.[1] || '', 10);
  return {
    type: (item.extra?.contentType || item.extra?.content_type || 'answer').toLowerCase(),
    id: answerId ? String(answerId) : null,
    title,
    excerpt,
    questionId,
    voteupCount: Number.isNaN(voteupCount) ? null : voteupCount,
    commentCount: Number.isNaN(commentCount) ? null : commentCount,
    answerCount: null,
    hotValue: null,
    url: route || (questionId && answerId ? `https://www.zhihu.com/question/${questionId}/answer/${answerId}` : null),
  };
}

function uniqueFeedItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.id || ''}:${item.questionId || ''}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function answerSettings(config, options) {
  return {
    ...config.defaultStyle,
    table_of_contents_enabled: booleanOption(
      options,
      'toc',
      Boolean(config.defaultStyle.table_of_contents_enabled),
    ),
  };
}

function positiveId(value, name) {
  if (!/^\d+$/.test(value) || value === '0') throw new UsageError(`${name} 必须是正整数 ID`);
  return value;
}

async function handleAuth(action, options) {
  if (action === 'import') {
    if (options.stdin !== true) throw new UsageError('auth import 仅接受 --stdin，避免 Cookie 进入命令历史');
    const cookies = parseCookieHeader(await readStdin());
    const result = saveCookies(cookies);
    success({ configPath: result.configPath, cookieNames: result.cookieNames, imported: true });
    return;
  }
  if (action === 'status') {
    const config = loadConfig({ required: true });
    const account = await fetchAccount(config);
    success({
      authenticated: true,
      account,
      cookieNames: Object.keys(config.cookies).sort(),
      hasRequired: {
        d_c0: Boolean(config.cookies.d_c0),
        z_c0: Boolean(config.cookies.z_c0),
        _xsrf: Boolean(config.cookies._xsrf),
      },
    });
    return;
  }
  throw new UsageError('auth 子命令必须是 import 或 status');
}

async function handleSearch(options) {
  const config = loadConfig();
  const query = requiredOption(options, 'query');
  const limit = integerOption(options, 'limit', 10, { min: 1, max: 50 });
  const offset = integerOption(options, 'offset', 0, { min: 0, max: 10_000 });
  const params = new URLSearchParams({
    gk_version: 'gz-gaokao', t: 'general', q: query, correction: '1', search_source: 'Normal',
    limit: String(limit), offset: String(offset),
  });
  const response = await requestJson(config, `https://www.zhihu.com/api/v4/search_v3?${params}`, { signed: true });
  const questionsOnly = booleanOption(options, 'questions-only');
  const data = (response.data || [])
    .map(questionFromSearchItem)
    .filter(Boolean)
    .filter((item) => !questionsOnly || item.id);
  success(data, { paging: response.paging ?? null });
}

async function handleFeed(action, options) {
  const config = loadConfig();
  const limit = integerOption(options, 'limit', action === 'hot' ? 20 : 10, { min: 1, max: 50 });
  const endpoint = action === 'hot'
    ? `https://api.zhihu.com/topstory/hot-list?limit=${limit}`
    : action === 'recommend'
      ? `https://api.zhihu.com/topstory/recommend?limit=${limit}`
      : null;
  if (!endpoint) throw new UsageError('feed 子命令必须是 hot 或 recommend');
  const response = await requestJson(config, endpoint, { headers: ANDROID_HEADERS });
  const normalized = (response.data || [])
    .map((item) => item.type === 'ComponentCard' ? normalizeComponentCard(item) : normalizeFeedItem(item))
    .filter((item) => item.title || item.url || item.id);
  success(uniqueFeedItems(normalized).slice(0, limit), { paging: response.paging ?? null });
}

async function handleQuestion(action, options) {
  const config = loadConfig();
  const id = positiveId(requiredOption(options, 'id'), '--id');
  if (action === 'show') {
    success(await fetchQuestion(config, id));
    return;
  }
  if (action === 'answers') {
    const limit = integerOption(options, 'limit', 10, { min: 1, max: 50 });
    const offset = integerOption(options, 'offset', 0, { min: 0, max: 10_000 });
    const sort = options.sort || 'default';
    if (!['default', 'updated'].includes(sort)) throw new UsageError('--sort 仅支持 default 或 updated');
    const endpoint = `https://www.zhihu.com/api/v4/questions/${id}/feeds?limit=${limit}&offset=${offset}&order=${sort}`;
    const response = await requestJson(config, endpoint, { signed: true });
    success((response.data || []).map(normalizeAnswer).filter(Boolean), { paging: response.paging ?? null });
    return;
  }
  throw new UsageError('question 子命令必须是 show 或 answers');
}

async function prepareAnswer(options, { includeRemote = false } = {}) {
  const questionId = positiveId(requiredOption(options, 'question-id'), '--question-id');
  const markdown = readMarkdownInput(requiredOption(options, 'input'));
  const compiled = compileMarkdown(markdown);
  if (!includeRemote) return { questionId, markdown, compiled };
  const config = loadConfig({ required: true });
  requireCookies(config, ['d_c0', 'z_c0'], '回答预览');
  const settings = answerSettings(config, options);
  const [account, question, answerId] = await Promise.all([
    fetchAccount(config),
    fetchQuestion(config, questionId),
    findMyAnswerId(config, questionId),
  ]);
  const context = { questionId, answerId, html: compiled.html, settings };
  return { config, markdown, compiled, account, question, context };
}

async function handleAnswer(action, options) {
  if (action === 'compile') {
    const markdown = readMarkdownInput(requiredOption(options, 'input'));
    const compiled = compileMarkdown(markdown);
    success({ html: compiled.html, stats: compiled.stats }, { warnings: compiled.warnings });
    return;
  }
  if (action === 'preview') {
    const prepared = await prepareAnswer(options, { includeRemote: true });
    const token = createConfirmationToken(prepared.context);
    success({
      account: prepared.account,
      question: prepared.question,
      mode: prepared.context.answerId ? 'update' : 'create',
      existingAnswerId: prepared.context.answerId,
      contentSummary: prepared.markdown.replace(/\s+/g, ' ').trim().slice(0, 280),
      stats: prepared.compiled.stats,
      html: prepared.compiled.html,
      settings: prepared.context.settings,
      confirmationToken: token,
    }, { warnings: prepared.compiled.warnings });
    return;
  }
  if (action === 'draft') {
    const prepared = await prepareAnswer(options, { includeRemote: true });
    requireCookies(prepared.config, ['d_c0', 'z_c0', '_xsrf'], '保存回答草稿');
    const result = await saveDraft(prepared.config, prepared.context);
    success({ ...result, question: prepared.question, stats: prepared.compiled.stats }, { warnings: prepared.compiled.warnings });
    return;
  }
  if (action === 'publish') {
    const confirm = requiredOption(options, 'confirm');
    const prepared = await prepareAnswer(options, { includeRemote: true });
    requireCookies(prepared.config, ['d_c0', 'z_c0', '_xsrf'], '发布回答');
    const expected = createConfirmationToken(prepared.context);
    if (confirm !== expected) {
      throw new Error('确认令牌不匹配：内容、目标、回答状态或设置已变化，请重新执行 answer preview');
    }
    const result = await publishAnswer(prepared.config, prepared.context);
    success({ ...result, question: prepared.question });
    return;
  }
  throw new UsageError('answer 子命令必须是 compile、draft、preview 或 publish');
}

async function handleImage(action, options) {
  if (action !== 'upload') throw new UsageError('image 子命令仅支持 upload');
  const config = loadConfig({ required: true });
  requireCookies(config, ['z_c0'], '上传图片');
  success(await uploadImage(config, requiredOption(options, 'file')));
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--') argv = argv.slice(1);
  const [command, action, ...rest] = argv;
  const { options } = parseArgs(rest);
  if (!command || command === 'help' || options.help === true) {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'auth') return handleAuth(action, options);
  if (command === 'search') return handleSearch(parseArgs(argv.slice(1)).options);
  if (command === 'feed') return handleFeed(action, options);
  if (command === 'question') return handleQuestion(action, options);
  if (command === 'answer') return handleAnswer(action, options);
  if (command === 'image') return handleImage(action, options);
  throw new UsageError(`未知命令: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(fail);
}
