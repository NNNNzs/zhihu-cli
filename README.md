# zhihu-cli

面向人类与 AI Agent 的完整知乎 CLI：支持安全登录、内容检索与阅读、用户和话题研究、互动、Markdown 创作、多类型内容发布，以及受确认令牌保护的写操作。根目录 `SKILL.md` 可供 Codex、Hermes、OpenClaw 等支持 Agent Skills 的宿主使用。

> 本项目使用知乎未公开承诺稳定的 Web 接口，不是知乎官方 SDK。请遵守知乎服务条款、隐私政策和社区规范；项目不会绕过 CAPTCHA、访问控制、频率限制或风控。

## 安装

要求 Node.js `>=20.18.1`，推荐使用 npm。

```bash
# npm registry 发布后，全局安装
npm install -g zhihu-cli
zhihu --version

# 当前可用的源码安装方式（同样只使用 npm）
npm install -g github:NNNNzs/zhihu-cli
zhihu --version

# 源码安装
git clone https://github.com/NNNNzs/zhihu-cli.git
cd zhihu-cli
npm install
npm run zhihu -- --version
```

`zhihu-cli` 是 npm 包名与 Skill 名，`zhihu` 是唯一推荐的命令。`zhihu-cli` 可执行文件仅为向后兼容保留；文档、脚本和 Agent 指令均应使用 `zhihu`。本项目不需要也不会自动启动后台服务。

可以把下面这句话直接发给支持终端和 Agent Skills 的 Agent：

> 请安装 `NNNNzs/zhihu-cli` 中的 `zhihu-cli` Skill，并用 npm 安装 `zhihu-cli`；如需登录，让我在自己的本机终端粘贴 Cookie 后通过 stdin 导入，绝不要求我在聊天中发送 Cookie；任何写操作都先给我预览和确认令牌。

## 登录

推荐由用户在自己的本机终端粘贴 Cookie 后导入。Cookie 只能经标准输入传递，不能发进聊天、放入命令参数或提交到仓库。

```bash
# macOS：用户先在浏览器中复制 Cookie，再执行
pbpaste | zhihu auth import

# 已有本地文件
zhihu auth import < cookies.txt
```

当前知乎二维码登录接口会返回 HTTP 403，因此二维码不再作为推荐方案。保留 `zhihu auth login --qr` 与兼容别名 `zhihu login --qrcode` 仅供接口恢复后的人工排障；不要让 Agent 转发二维码、二维码 URL 或 token。

登录态保存在 `~/.zhihu-cli/config.json`，目录和文件权限分别为 `0700`、`0600`。旧 `~/.zhihu-creator/config.json` 与 `ZHIHU_CREATOR_CONFIG` 只做兼容读取；新覆盖变量为 `ZHIHU_CLI_CONFIG`。

```bash
zhihu auth status --offline
zhihu auth status
zhihu auth whoami
zhihu auth logout
```

## 查询命令

所有命令默认输出稳定 JSON：`{ "ok": true, "data": ..., "paging": ..., "warnings": ... }`。错误只写 stderr，并返回非零退出码。使用 `--format table` 可切换紧凑表格，使用 `--verbose` 可查看仅含方法、脱敏 URL、状态码、耗时和重试次数的日志。

```bash
zhihu search --query "React 性能" --type general --limit 10
zhihu search --query "产品经理" --type people
zhihu search --query "人工智能" --type topic
zhihu search --query "Node.js" --questions-only --answers 3

zhihu feed hot --limit 20 --answers 2
zhihu feed recommend --limit 10 --expand --comments 3
zhihu feeds --limit 10 --comment-limit 3

zhihu question 12345678
zhihu question answers 12345678 --limit 10 --sort default
zhihu answer 87654321
zhihu answer comments 87654321 --limit 20
zhihu answer comments 87654321 --all

zhihu user somebody
zhihu user answers somebody
zhihu user articles somebody
zhihu user followers somebody
zhihu user following somebody
zhihu topic 19550517
zhihu topic questions 19550517

zhihu account collections
zhihu account notifications --limit 10 --offset 0
```

公开内容在接口允许时支持匿名读取；收藏、通知、个性化推荐和所有写操作必须登录。列表命令限制单页数量，评论只有显式 `--all` 才会翻页，并受最大页数保护。

## 两阶段写操作

点赞、关注、图片上传、回答草稿、发布和删除都必须先预览。确认令牌绑定账户、操作、目标、远端状态、标题、正文、话题、设置和图片哈希；内容、账户或远端状态变化后必须重新预览。

```bash
# 赞同与关注
zhihu answer vote preview 87654321 --state up
zhihu answer vote apply 87654321 --state up --confirm <token>
zhihu question follow preview 12345678
zhihu question follow apply 12345678 --confirm <token>

# 兼容平铺别名：无 --confirm 时只预览
zhihu vote 87654321
zhihu vote 87654321 --confirm <token>
zhihu follow-question 12345678 --unfollow
```

重复执行已达到目标状态的点赞或关注会返回幂等成功，不会重复写入。

## Markdown、图片与发布

本地图片可直接写在 Markdown 中，也可重复传入 `--image`。预览只校验路径、格式、尺寸并计算 SHA-256；publish 阶段才上传图片并编译最终 HTML。发布内容禁止保留 `file:` URL。

```bash
zhihu answer compile --input answer.md

# 独立图片上传也是两阶段
zhihu image upload --file diagram.png
zhihu image upload --file diagram.png --confirm <token>

# 回答：draft 不带令牌时返回草稿预览
zhihu answer preview --question-id 12345678 --input answer.md --image diagram.png
zhihu answer publish --question-id 12345678 --input answer.md --image diagram.png --confirm <token>
zhihu answer draft --question-id 12345678 --input answer.md
zhihu answer draft --question-id 12345678 --input answer.md --confirm <token>

# 提问、想法、文章
zhihu question create preview --title "问题标题" --input question.md --topic 19550517 --image diagram.png
zhihu question create publish --title "问题标题" --input question.md --topic 19550517 --image diagram.png --confirm <token>
zhihu pin create preview --title "想法标题" --input pin.md --image photo.jpg
zhihu article create preview --title "文章标题" --input article.md --topic 19550517

# 删除自己的内容
zhihu question delete preview 12345678
zhihu question delete apply 12345678 --confirm <token>
zhihu pin delete preview 123
zhihu article delete preview 456
```

平铺兼容命令包括 `hot`、`answers`、`feed`、`feeds`、`user-answers`、`user-articles`、`followers`、`following`、`collections`、`notifications`、`ask`、`pin`、`article`、`delete-question`、`delete-pin`、`delete-article`。`ask`、`pin`、`article` 及删除别名无 `--confirm` 时只返回预览。

提问、想法和文章写接口来自 mock 验证及来源快照，尚未用真实账号自动发布验证；发布前应先阅读 [人工验证清单](docs/manual-write-validation.md)。自动测试不会真实发布、点赞、关注或删除。

## Agent 安装

仓库根 `SKILL.md` 是唯一源文件，包含与 npm 包版本一致的 Skill 元数据；`pnpm sync:skills` 生成 `dist/skills/zhihu-cli/` 的分发副本，`pnpm check:skills` 检查漂移。

```bash
# 安装到所有三个宿主（Skills CLI 当前支持 Codex、Hermes Agent、OpenClaw）
npx --yes skills add NNNNzs/zhihu-cli --skill zhihu-cli --global \
  --agent codex --agent hermes-agent --agent openclaw

# 安装当前运行时命令；npm registry 发布后可替换为 npm install -g zhihu-cli
npm install -g github:NNNNzs/zhihu-cli

# 只安装到一个宿主时，替换 --agent 的值：codex、hermes-agent 或 openclaw
npx --yes skills add NNNNzs/zhihu-cli --skill zhihu-cli --global --agent openclaw
```

OpenClaw 也可以不用 Skills CLI，直接从 Git 安装：

```bash
openclaw skills install git:NNNNzs/zhihu-cli
npm install -g github:NNNNzs/zhihu-cli
```

安装后开启新会话，或按宿主方式刷新 Skills。Agent 应要求用户在其本机终端执行粘贴导入命令，不能读取、回显、转发 Cookie 或二维码凭证。

升级源码安装：

```bash
npx --yes skills update zhihu-cli --global
npm install -g github:NNNNzs/zhihu-cli
```

全局安装升级：

```bash
npm update -g zhihu-cli # npm registry 发布后
```

## 开发与验证

```bash
pnpm install
pnpm test
pnpm check
pnpm pack --dry-run
pnpm verify:pack

# 只读真实接口，默认不会运行
ZHIHU_LIVE_TESTS=1 pnpm test:live
```

架构和目录索引见 [AGENTS.md](AGENTS.md)，接口约定见 [references/api.md](references/api.md)，Markdown 规则见 [references/markdown.md](references/markdown.md)，历史功能对比与设计决策见 [docs/competitive-analysis.md](docs/competitive-analysis.md)。

## 许可与来源

项目采用 [AGPL-3.0-only](LICENSE)。来源快照与许可证记录见 [references/provenance.md](references/provenance.md)。
