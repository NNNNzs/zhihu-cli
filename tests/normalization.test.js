import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, normalizeArticle, normalizeComponentCard, normalizeFeedItem, normalizeHotSearchItem, questionFromSearchItem } from '../scripts/cli.js';

test('normalizes search questions without retaining huge raw response', () => {
  const result = questionFromSearchItem({ object: { type: 'answer', excerpt: '摘要', question: { id: 12, title: '标题', answer_count: 3 } } });
  assert.deepEqual(result, {
    id: '12', title: '标题', excerpt: '摘要', answerCount: 3, followerCount: null,
    visitCount: null, url: 'https://www.zhihu.com/question/12', matchedType: 'answer',
  });
});

test('normalizes hot search variants and safely rejects unknown cards', () => {
  assert.deepEqual(normalizeHotSearchItem({ query: 'AI', display_query: '人工智能', hot_value: 99 }, 2), {
    rank: 3, query: 'AI', displayQuery: '人工智能', hotValue: 99, url: 'https://www.zhihu.com/search?q=AI',
  });
  assert.equal(normalizeHotSearchItem({ type: 'activity', image: 'huge' }), null);
  assert.equal(normalizeHotSearchItem({ target: { keyword: '中文 热搜', search_action: { url: 'https://www.zhihu.com/search?q=x' } } }).url, 'https://www.zhihu.com/search?q=x');
});

test('normalizes complete article detail across snake and camel case fields', () => {
  const article = normalizeArticle({ id: 42, title: 'T', content: '<p>full</p>', author: { name: 'A' }, voteupCount: 3, comment_count: 4, createdTime: 5, updated_time: 6, topics: [{ id: 7, name: 'Topic', urlToken: 'topic' }] });
  assert.equal(article.content, '<p>full</p>');
  assert.equal(article.author.name, 'A');
  assert.equal(article.voteupCount, 3);
  assert.equal(article.commentCount, 4);
  assert.deepEqual(article.topics, [{ id: '7', name: 'Topic', urlToken: 'topic' }]);
});

test('normalizes feed and answer records', () => {
  assert.equal(normalizeFeedItem({ target: { id: 1, type: 'answer', question: { id: 2, title: 'Q' } } }).questionId, '2');
  assert.equal(normalizeAnswer({ target: { id: 3, question: { id: 2, title: 'Q' }, author: { name: 'A' } } }).url, 'https://www.zhihu.com/question/2/answer/3');
});

test('extracts hot-list question ids and ComponentCard answers', () => {
  const hot = normalizeFeedItem({
    card_id: 'Q_123',
    feed_specific: { answer_count: 7 },
    target: { title_area: { text: 'Hot' }, link: { url: 'https://www.zhihu.com/question/123' } },
  });
  assert.equal(hot.questionId, '123');
  assert.equal(hot.answerCount, 7);

  const card = normalizeComponentCard({
    type: 'ComponentCard',
    children: [
      { test_id: 'answer.456.title', text: 'Question', type: 'Text' },
      { test_id: 'answer.456.description', text: 'Excerpt', type: 'Text' },
      { elements: [{ text: '12 赞同 · 3 评论', type: 'Text' }] },
    ],
    extra: { contentToken: '456', contentType: 'ANSWER' },
    action: { parameter: `route_url=${encodeURIComponent('https://zhihu.com/question/123/answer/456?native=0')}` },
  });
  assert.equal(card.questionId, '123');
  assert.equal(card.id, '456');
  assert.equal(card.voteupCount, 12);
  assert.equal(card.commentCount, 3);
});
