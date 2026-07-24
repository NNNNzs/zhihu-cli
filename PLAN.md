# zhihu-creator 实现说明

## 目标

将当前仓库交付为可被 Codex 发现的知乎内容创作 Skill，覆盖选题研究、Markdown 转换、回答图片上传、回答草稿保存，以及回答的新建和更新。

首版只实现参考源码可以确认的能力：

- 认证状态检查与安全 Cookie 导入。
- 搜索、推荐、热榜、问题详情和回答列表。
- Markdown 到知乎 HTML 的本地编译。
- PNG、JPEG、GIF、WebP 图片上传。
- 回答草稿保存、正式发布和已有回答更新。

首版不实现知乎文章发布，也不实现回答草稿列表或删除。

## 交付结构

```text
zhihu-creator/
├── SKILL.md
├── agents/openai.yaml
├── scripts/
│   ├── cli.js
│   └── lib/
├── references/
├── tests/
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── LICENSE
```

统一入口为 `pnpm zhihu -- <command>`。所有命令在 stdout 返回 JSON，错误在 stderr 返回脱敏 JSON。

## 已确认的接口规则

- zse96 签名源为 `zse93 + pathname及query + d_c0 + 原始请求体`。
- 图片申请使用 `image_hash`，普通图片与 GIF 都使用阿里云 OSS HMAC 鉴权；GIF 使用分片上传。
- 数学公式编译为 `www.zhihu.com/equation` 图片。
- 回答草稿使用 `/api/v4/questions/{questionId}/draft`。
- 回答新建和更新都使用 `/api/v4/content/publish`，已有回答通过 `relationship.my_answer` 探测。
- 正式发布必须使用绑定目标、已有回答状态、HTML 和设置的 SHA-256 确认令牌。

## 安全边界

- Cookie 只能通过 stdin 导入并存放在 `~/.zhihu-creator/config.json`，权限为 `0600`。
- HTTP 客户端只访问代码中固定允许的知乎域名。
- GET、图片状态和 OSS 分片 PUT 可以有限重试；草稿和发布 POST 不重试。
- 图片、草稿和发布都必须来自用户明确指令；正式发布还必须先展示预览并取得确认。
- 不处理 CAPTCHA，不绕过访问控制、频率限制或风险控制。

## 验证

- `pnpm test`：签名、配置、Markdown、图片、payload、确认令牌、HTTP 重试与脱敏错误。
- `pnpm check`：Node.js 语法检查。
- `skill-creator/scripts/quick_validate.py`：Skill 结构和 frontmatter 校验。
- 独立代理前向测试只覆盖搜索研究、复杂 Markdown 编译和回答预览，不进行真实外部写入。

## 来源与许可

项目采用 AGPL-3.0-only：

- `iteng007/zhihu-mcp-server`：`0475902fd52472a9484a56cadd6183d01048118a`
- `zly2006/zhihu-plus-plus`：`41308e08e85015cd7b3f97b2328b24e2524970ae`

详细来源记录见 `references/provenance.md`。
