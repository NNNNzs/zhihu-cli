# zhihu-creator — 知乎内容创作 Skill

## 项目简介

Hermes Agent 的知乎内容创作技能，支持搜索选题、撰写回答、保存草稿、发布内容。

基于 [zhihu-plus-plus](https://github.com/zly2006/zhihu-plus-plus) 项目的认证体系和 API 实现，
以及 [iteng007/zhihu-mcp-server](https://github.com/iteng007/zhihu-mcp-server) 的 zse96 签名器。

## 技术架构

```
zhihu-creator/
├── SKILL.md                    # Skill 主文件（工作流编排）
├── scripts/
│   ├── lib/
│   │   ├── zse-signer.js       # zse96 v2 签名器（移植自 zhihu-plus-plus）
│   │   ├── zhihu-api.js        # 通用 API 请求封装
│   │   └── markdown-compiler.js # Markdown → 知乎 HTML 转换
│   ├── auth.js                 # Cookie 管理 & 登录态校验
│   ├── feed.js                 # 推荐 feed 获取
│   ├── draft.js                # 草稿管理（保存/列出/删除）
│   ├── publish.js              # 发布回答
│   ├── image-upload.js         # 图片上传
│   └── search.js               # 搜索问题
├── templates/
│   └── answer-style.md         # 回答写作风格指南
└── references/
    └── zhihu-api-reference.md  # 知乎 API 参考文档
```

## 功能清单

### P0 — 核心功能

#### 1. 认证模块 (`auth.js`)

**来源：** zhihu-mcp-server/zse-signer.js + zhihu-plus-plus

- 加载 `~/.zhihu-creator/config.json` 中的 Cookie
- 必需 Cookie：`d_c0`、`_xsrf`
- 生成 `x-zse-96` 签名（zse96 v2 算法）
- 登录态校验：调用 `/api/v4/me` 检查是否有效

**签名算法核心逻辑（移植自 zse-signer.js）：**

```javascript
// 1. 拼接签名源：zse93 + pathname + d_c0 + body（用 + 连接）
// 2. MD5 哈希签名源
// 3. 用自定义加密算法（ZK/ZB 表 + 自定义 Base64）加密 MD5 结果
// 4. 返回 "2.0_" + 加密结果
```

**需要移植的依赖：**
- `zse-signer.js`（187 行，纯 JS，无外部依赖）
- 自定义 ALPHABET 和 ZK/ZB 查找表

#### 2. 通用 API 封装 (`lib/zhihu-api.js`)

**来源：** zhihu-mcp-server/index.js 的 `zhihuRequest()`

```javascript
// 封装：
// - 自动添加 Cookie
// - 自动签名（x-zse-96、x-zse-93）
// - 自动设置 User-Agent
// - 统一错误处理
// - 代理支持（HTTP_PROXY）
```

**请求头模板：**

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
x-zse-93: 101_3_3.0
x-zse-96: <signRequest(url, dc0, body, zse93)>
x-requested-with: fetch
Cookie: d_c0=xxx; _xsrf=xxx
```

#### 3. Markdown → 知乎 HTML 转换 (`lib/markdown-compiler.js`)

**来源：** zhihu-plus-plus/ZhihuMarkdownCompiler.kt

知乎编辑器使用自定义 HTML 格式，不是标准 Markdown。需要转换以下元素：

| Markdown 元素 | 知乎 HTML 格式 |
|--------------|----------------|
| `# 标题` | `<h2>标题</h2>` |
| `**加粗**` | `<b>加粗</b>` |
| `*斜体*` | `<i>斜体</i>` |
| `` `代码` `` | `<code>代码</code>` |
| `> 引用` | `<blockquote>引用</blockquote>` |
| `- 列表` | `<ul><li>列表</li></ul>` |
| `1. 列表` | `<ol><li>列表</li></ol>` |
| `[链接](url)` | `<a href="url">链接</a>` |
| `![alt](url)` | `<img src="url" alt="alt"/>` |
| `---` | `<hr/>` |
| 代码块 | `<pre><code>代码</code></pre>` |
| `==高亮==` | `<b>高亮</b>`（知乎不支持原生高亮） |
| `~~删除线~~` | `<s>删除线</s>` |
| 数学公式 | `<span class="ztext-math">公式</span>` |

**实现方案：**
- 使用现成的 Markdown parser（如 `marked`、`markdown-it`）
- 自定义 renderer 输出知乎兼容 HTML
- 或参考 zhihu-plus-plus 的 Kotlin 实现用 JS 重写

#### 4. 保存回答草稿 (`draft.js`)

**API：** `POST https://www.zhihu.com/api/v4/questions/{questionId}/draft`

**请求体（来自 zhihu-plus-plus）：**

```json
{
  "content": "<html>回答内容</html>",
  "draft_type": "normal",
  "delta_time": 30,
  "settings": {
    "reshipment_settings": "allowed",
    "comment_permission": "all",
    "can_reward": false,
    "tagline": "",
    "disclaimer_status": "close",
    "disclaimer_type": "none",
    "commercial_report_info": { "is_report": true },
    "push_activity": false,
    "table_of_contents_enabled": false,
    "thank_inviter_status": "close",
    "thank_inviter": ""
  }
}
```

**必需 Header：**
- `x-xsrftoken: {Cookie._xsrf}`
- `Referer: https://www.zhihu.com/question/{questionId}/answer/{answerId}`

#### 5. 发布回答 (`publish.js`)

**API：** `POST https://www.zhihu.com/api/v4/content/publish`

**请求体（来自 zhihu-plus-plus）：**

```json
{
  "action": "answer",
  "data": {
    "publish": {
      "traceId": "{timestamp},{uuid-v4}"
    },
    "hybridInfo": {},
    "draft": {
      "disabled": 1,
      "isPublished": false,
      "contentId": null
    },
    "extra_info": {
      "question_id": "{questionId}",
      "publisher": "pc",
      "include": "is_visible,paid_info,...",
      "pc_business_params": "{json-string}"
    },
    "hybrid": {
      "html": "<html>回答内容</html>"
    },
    "reprint": { "reshipment_settings": "allowed" },
    "commentsPermission": { "comment_permission": "all" },
    "appreciate": { "can_reward": false },
    "publishSwitch": { "draft_type": "normal" },
    "creationStatement": { "disclaimer_status": "close", "disclaimer_type": "none" },
    "commercialReportInfo": { "is_report": 0 },
    "toFollower": {},
    "contentsTables": { "table_of_contents_enabled": false },
    "thanksInvitation": { "thank_inviter_status": "close", "thank_inviter": "" }
  }
}
```

**traceId 生成规则：**
```javascript
function newPublishTraceId() {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  return `${timestamp},${uuid}`;
}
```

**pc_business_params（JSON 字符串）：**
```json
{
  "reshipment_settings": "allowed",
  "comment_permission": "all",
  "reward_setting": { "can_reward": false },
  "disclaimer_status": "close",
  "disclaimer_type": "none",
  "commercial_report_info": { "is_report": false },
  "commercial_zhitask_bind_info": null,
  "is_report": false,
  "table_of_contents_enabled": false,
  "thank_inviter_status": "close",
  "thank_inviter": ""
}
```

**响应处理：**
- `message === "success"` → 解析 `data.result` 中的 JSON 字符串获取 answerId
- `code === 103003` → 已回答过该问题
- 其他 → 抛出错误

#### 6. 图片上传 (`image-upload.js`)

**来源：** zhihu-plus-plus/ZhihuImageUpload.kt

**三步流程：**

```
Step 1: POST https://api.zhihu.com/images
  Body: { "md5": "<md5-hex>", "source": "normal" }
  Response: { "upload_file": { "image_id": "...", "state": 2 }, "upload_token": "..." }

Step 2: PUT https://zhihu-pics-upload.zhimg.com/v2-{hash}
  Body: 二进制图片数据
  Header: Authorization: "UpToken {upload_token}"

Step 3: GET https://api.zhihu.com/images/{image_id}
  轮询直到 status === "success"
  Response: { "original_src": "...", "watermark_src": "..." }
```

**支持格式：** jpg, png, gif, webp
**GIF 特殊处理：** 需要分片上传（参考 zhihu-plus-plus 实现）

### P1 — 增强功能

#### 7. 获取推荐 Feed (`feed.js`)

**API：** `GET https://api.zhihu.com/topstory/recommend?desktop=true`

**响应结构：**
```json
{
  "data": [
    {
      "target": {
        "id": "...",
        "title": "问题标题",
        "question": { "id": "...", "title": "..." },
        "excerpt": "摘要...",
        "voteup_count": 123,
        "comment_count": 45,
        "answer_count": 67
      },
      "type": "answer"
    }
  ],
  "paging": { "is_end": false, "next": "..." }
}
```

**用途：**
- 获取个性化推荐问题用于选题
- 分析高赞回答风格
- 发现热门话题

#### 8. 草稿管理 (`draft.js` 扩展)

**API：** `GET https://api.zhihu.com/content/drafts`

**功能：**
- 列出所有草稿
- 查看草稿详情
- 删除草稿

#### 9. 搜索问题 (`search.js`)

**API：** `GET https://www.zhihu.com/api/v4/search_v3?q={query}&t=general`

**功能：**
- 按关键词搜索问题
- 按回答数/浏览量排序
- 筛选适合回答的问题（回答数 < 50，浏览量 > 1000）

---

## Skill 工作流设计

### 流程一：选题 → 写回答 → 发布

```
用户: "帮我回答一个关于 React 的问题"
  ↓
1. search.js: 搜索 "React" 相关问题
2. feed.js: 获取推荐 feed 中的相关问题
3. 合并去重，按热度排序
4. 展示 Top 5 问题给用户选择
  ↓
用户: 选择第 2 个问题
  ↓
5. 获取问题详情 + 现有高赞回答
6. 参考高赞回答风格，撰写回答
7. markdown-compiler.js: Markdown → 知乎 HTML
8. 展示回答草稿给用户审阅
  ↓
用户: "可以，发布吧"
  ↓
9. draft.js: 保存草稿
10. publish.js: 发布回答
11. 返回发布结果（回答链接）
```

### 流程二：直接发布文章

```
用户: "把这个发到知乎"
  ↓
1. markdown-compiler.js: 转换内容
2. draft.js: 保存草稿
3. publish.js: 发布
4. 返回结果
```

### 流程三：管理草稿

```
用户: "看看我的知乎草稿"
  ↓
1. draft.js: 列出草稿
2. 展示草稿列表
  ↓
用户: "第一个发布"
  ↓
3. publish.js: 发布
```

---

## 数据存储

### 配置文件

**路径：** `~/.zhihu-creator/config.json`

```json
{
  "cookies": {
    "d_c0": "xxx",
    "_xsrf": "xxx"
  },
  "userAgent": "Mozilla/5.0 ...",
  "zse93": "101_3_3.0",
  "proxy": "http://127.0.0.1:7890",
  "defaultStyle": {
    "comment_permission": "all",
    "reshipment_settings": "allowed",
    "can_reward": false,
    "table_of_contents_enabled": false
  }
}
```

### 风格模板

**路径：** `templates/answer-style.md`

```markdown
# 回答风格指南

## 结构
- 开头：直接回答问题，不要绕弯子
- 中间：展开论述，分点说明
- 结尾：总结观点，可以加个人见解

## 语气
- 专业但不学术
- 口语化但不随意
- 有观点但不偏激

## 格式
- 用 ## 小标题分段
- 关键观点加粗
- 适当使用列表
- 引用别人的观点用 blockquote
- 代码用 code 标记

## 长度
- 一般回答：500-2000 字
- 深度回答：2000-5000 字
- 简短回答：200-500 字
```

---

## 依赖说明

### 运行时依赖

| 依赖 | 用途 | 来源 |
|------|------|------|
| `zse-signer.js` | zse96 v2 签名 | zhihu-plus-plus |
| Node.js crypto | MD5/UUID 生成 | 内置 |
| Node.js fetch | HTTP 请求 | Node.js 18+ 内置 |

### 开发时依赖（可选）

| 依赖 | 用途 |
|------|------|
| `marked` / `markdown-it` | Markdown 解析（可选，也可自写简单解析器） |

---

## 实现顺序

### Phase 1：基础设施（预计 1-2 小时）

1. [ ] 项目结构搭建
2. [ ] 移植 zse-signer.js
3. [ ] 实现 zhihu-api.js（通用请求封装）
4. [ ] 实现 auth.js（Cookie 管理 & 登录态校验）
5. [ ] 编写 SKILL.md 主文件

### Phase 2：P0 核心功能（预计 2-3 小时）

6. [ ] 实现 markdown-compiler.js
7. [ ] 实现 draft.js（保存草稿）
8. [ ] 实现 publish.js（发布回答）
9. [ ] 实现 image-upload.js
10. [ ] 端到端测试：搜索 → 写回答 → 保存草稿 → 发布

### Phase 3：P1 增强功能（预计 1-2 小时）

11. [ ] 实现 feed.js（推荐 feed）
12. [ ] 扩展 draft.js（草稿管理）
13. [ ] 实现 search.js（搜索问题）
14. [ ] 完善 SKILL.md 工作流编排

### Phase 4：打磨（预计 1 小时）

15. [ ] 错误处理完善
16. [ ] 编写回答风格模板
17. [ ] 编写 API 参考文档
18. [ ] README 更新

---

## 风控注意事项

1. **发布频率限制**
   - 建议每次发布间隔 > 60 秒
   - 每小时发布不超过 5 篇
   - 避免短时间内大量发布

2. **内容安全**
   - 避免敏感词
   - 不要直接复制粘贴（会被检测为 AIGC）
   - 建议人工审阅后再发布

3. **Cookie 过期**
   - Cookie 有效期约 1-3 个月
   - 过期后需要重新获取
   - 建议定期校验登录态

4. **代理配置**
   - 国内访问知乎通常不需要代理
   - 如果使用代理，确保代理稳定

---

## 测试计划

### 单元测试

- [ ] 签名器生成的签名是否正确
- [ ] Markdown 转换结果是否符合知乎格式
- [ ] traceId 生成是否符合格式
- [ ] pc_business_params 序列化是否正确

### 集成测试

- [ ] 登录态校验
- [ ] 搜索问题
- [ ] 获取推荐 feed
- [ ] 保存草稿
- [ ] 发布回答（测试账号）
- [ ] 图片上传

### 端到端测试

- [ ] 完整工作流：搜索 → 选择 → 撰写 → 草稿 → 发布
- [ ] 错误恢复：网络中断后重试
- [ ] 并发安全：同时保存多个草稿

---

## 参考资源

- [zhihu-plus-plus](https://github.com/zly2006/zhihu-plus-plus) — 认证体系 & API 实现
- [zhihu-mcp-server](https://github.com/iteng007/zhihu-mcp-server) — zse96 签名器
- [zhihu_obsidian](https://github.com/zly2006/zhihu_obsidian) — 原始 API 参考
- [ZhihuMCP](https://github.com/WloBy-Labs/ZhihuMCP) — 写回答 API 参考
