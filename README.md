# zhihu-cli

面向人类与 AI Agent 的完整知乎 CLI：支持安全登录、内容检索与阅读、用户和话题研究、互动、Markdown 创作、多类型内容发布，以及受确认令牌保护的写操作。根目录 `SKILL.md` 可供 Codex、Hermes、OpenClaw 等支持 Agent Skills 的宿主使用。

> 本项目使用知乎未公开承诺稳定的 Web 接口，不是知乎官方 SDK。请遵守知乎服务条款、隐私政策和社区规范；项目不会绕过 CAPTCHA、访问控制、频率限制或风控。

## 安装

要求 Node.js `>=20.18.1`。全局安装使用 npm，本地开发使用 pnpm。

```bash
# 从 npm 安装
npm install -g zhihu-cli
zhihu-cli --version

# 从 GitHub 安装当前源码
npm install -g github:NNNNzs/zhihu-cli
zhihu-cli --version

# 本地开发
git clone https://github.com/NNNNzs/zhihu-cli.git
cd zhihu-cli
pnpm install
pnpm zhihu-cli -- --version
```

`zhihu-cli` 同时是 npm 包名、Skill 名和 CLI 命令。本项目不需要也不会自动启动后台服务。

可以把下面这句话直接发给支持终端和 Agent Skills 的 Agent：

> 请安装 `NNNNzs/zhihu-cli` 中的 `zhihu-cli` Skill，并用 npm 安装 `zhihu-cli`；如需登录，让我在自己的本机终端粘贴 Cookie 后通过 stdin 导入，绝不要求我在聊天中发送 Cookie；任何写操作都先给我预览和确认令牌。

## 登录

推荐先在[知乎网页版](https://www.zhihu.com/)登录，再把该浏览器会话的 Cookie 粘贴到本机终端。CLI 直接扫码可能被知乎拒绝。

### 从浏览器复制 Cookie

1. 在 Chrome 或 Edge 打开知乎首页，确认已登录自己的账号。
2. 打开开发者工具，进入 **Network（网络）**，点 **Doc（文档）** 筛选，再刷新知乎页面。
3. 选中知乎主页面的请求。在 **Headers（标头）** 的 **General（常规）** 中确认 **Request URL（请求网址）** 的域名是 `www.zhihu.com`。
4. 在 **Request Headers（请求标头）** 下找到 `cookie`，复制它的完整值。保留分号分隔的各个 `名称=值`，从第一个名称开始复制。**Response Headers（响应标头）** 中的 `set-cookie` 不用于导入。

如果请求列表为空，保持 Network 面板打开后再刷新一次。若只看到临时标头，勾选 **Disable cache（停用缓存）** 后刷新。参见 [Chrome 开发者工具的网络面板说明](https://developer.chrome.com/docs/devtools/network/reference/#headers)。

### 在终端粘贴并导入

```bash
zhihu-cli auth import
```

看到「请粘贴 Cookie 后按回车（输入不显示）」后，把刚才复制的完整值粘贴进去，然后按 **回车**。粘贴时终端不会显示任何字符。输出中 `imported: true` 表示已保存，可运行 `zhihu-cli auth whoami` 在线确认当前账号。

Cookie 相当于网页登录凭证。只把它粘贴到自己的终端提示中，避免放入命令参数、Shell 历史、日志或聊天。

### 其他导入方式

也可以从标准输入管道或文件重定向导入。

```bash
pbpaste | zhihu-cli auth import # macOS
zhihu-cli auth import < cookies.txt
```

CLI 扫码入口 `zhihu-cli auth login --qr --format table` 供人工排障使用，兼容别名为 `zhihu-cli login --qrcode`。即使二维码已生成，知乎仍可能拒绝状态查询。若返回 HTTP 403，请在 [知乎登录页](https://www.zhihu.com/signup) 扫码，再运行 `zhihu-cli auth import` 导入浏览器中的 Cookie。二维码、二维码 URL 和 token 只在本次登录中使用。

`auth import` 默认尝试访问知乎初始化页补全 `_xsrf`、`d_c0` 等 Cookie；失败时保留已导入值并返回 warning。可用 `--no-repair` 跳过联网补全。Web 响应中的 Cookie 会原子滚动回写；没有可靠的 Web refresh-token 协议，401 后请先 `auth repair`，仍失败则重新登录并导入。

登录态保存在 `~/.zhihu-cli/config.json`，目录和文件权限分别为 `0700`、`0600`。旧 `~/.zhihu-creator/config.json` 与 `ZHIHU_CREATOR_CONFIG` 只做兼容读取；新覆盖变量为 `ZHIHU_CLI_CONFIG`。

```bash
zhihu-cli auth status --offline
zhihu-cli auth status
zhihu-cli auth whoami
zhihu-cli auth logout
```

## 查询命令

所有命令默认输出稳定 JSON：`{ "ok": true, "data": ..., "paging": ..., "warnings": ... }`。错误只写 stderr，并返回非零退出码。使用 `--format table` 可切换紧凑表格，使用 `--verbose` 可查看仅含方法、脱敏 URL、状态码、耗时和重试次数的日志。

```bash
zhihu-cli search --query "React 性能" --type general --limit 10
zhihu-cli search --query "产品经理" --type people
zhihu-cli search --query "人工智能" --type topic
zhihu-cli search --query "Node.js" --questions-only --answers 3

zhihu-cli feed hot --limit 20 --answers 2
zhihu-cli feed hot-search --limit 20
zhihu-cli hot-search --limit 20
zhihu-cli feed recommend --limit 10 --expand --comments 3
zhihu-cli feeds --limit 10 --comment-limit 3

zhihu-cli question 12345678
zhihu-cli question answers 12345678 --limit 10 --sort default
zhihu-cli answer 87654321
zhihu-cli answer comments 87654321 --limit 20
zhihu-cli answer comments 87654321 --all
zhihu-cli article show 123456

zhihu-cli user somebody
zhihu-cli user answers somebody
zhihu-cli user articles somebody
zhihu-cli user followers somebody
zhihu-cli user following somebody
zhihu-cli topic 19550517
zhihu-cli topic questions 19550517

zhihu-cli account collections
zhihu-cli account notifications --limit 10 --offset 0
```

公开内容在接口允许时支持匿名读取；收藏、通知、个性化推荐和所有写操作必须登录。列表命令限制单页数量，评论只有显式 `--all` 才会翻页，并受最大页数保护。

## 两阶段写操作

点赞、关注、图片上传、回答草稿、发布和删除都必须先预览。确认令牌绑定账户、操作、目标、远端状态、标题、正文、话题、设置和图片哈希；内容、账户或远端状态变化后必须重新预览。

```bash
# 赞同与关注
zhihu-cli answer vote preview 87654321 --state up
zhihu-cli answer vote apply 87654321 --state up --confirm <token>
zhihu-cli question follow preview 12345678
zhihu-cli question follow apply 12345678 --confirm <token>

# 兼容平铺别名：无 --confirm 时只预览
zhihu-cli vote 87654321
zhihu-cli vote 87654321 --confirm <token>
zhihu-cli follow-question 12345678 --unfollow
```

重复执行已达到目标状态的点赞或关注会返回幂等成功，不会重复写入。

## Markdown、图片与发布

本地图片可直接写在 Markdown 中，也可重复传入 `--image`。预览只校验路径、格式、尺寸并计算 SHA-256；publish 阶段才上传图片并编译最终 HTML。发布内容禁止保留 `file:` URL。

```bash
zhihu-cli answer compile --input answer.md

# 独立图片上传也是两阶段
zhihu-cli image upload --file diagram.png
zhihu-cli image upload --file diagram.png --confirm <token>

# 回答：draft 不带令牌时返回草稿预览
zhihu-cli answer preview --question-id 12345678 --input answer.md --image diagram.png
zhihu-cli answer publish --question-id 12345678 --input answer.md --image diagram.png --confirm <token>
zhihu-cli answer draft --question-id 12345678 --input answer.md
zhihu-cli answer draft --question-id 12345678 --input answer.md --confirm <token>

# 提问、想法、文章
zhihu-cli question create preview --title "问题标题" --input question.md --topic 19550517 --image diagram.png
zhihu-cli question create publish --title "问题标题" --input question.md --topic 19550517 --image diagram.png --confirm <token>
zhihu-cli pin create preview --title "想法标题" --input pin.md --image photo.jpg
zhihu-cli article create preview --title "文章标题" --input article.md --topic 19550517

# 删除自己的内容
zhihu-cli question delete preview 12345678
zhihu-cli question delete apply 12345678 --confirm <token>
zhihu-cli pin delete preview 123
zhihu-cli article delete preview 456
```

平铺兼容命令包括 `hot`、`answers`、`feed`、`feeds`、`user-answers`、`user-articles`、`followers`、`following`、`collections`、`notifications`、`ask`、`pin`、`article`、`delete-question`、`delete-pin`、`delete-article`。`ask`、`pin`、`article` 及删除别名无 `--confirm` 时只返回预览。

提问、想法和文章写接口来自 mock 验证及来源快照，尚未用真实账号自动发布验证；发布前应先阅读 [人工验证清单](docs/manual-write-validation.md)。自动测试不会真实发布、点赞、关注或删除。

## Agent 安装

Skill 直接从仓库根目录的 `SKILL.md` 安装。`references/` 和 `docs/` 随仓库和 npm 包一起分发。

```bash
# 安装到所有三个宿主（Skills CLI 当前支持 Codex、Hermes Agent、OpenClaw）
npx --yes skills add NNNNzs/zhihu-cli --skill zhihu-cli --global \
  --agent codex --agent hermes-agent --agent openclaw

# 安装运行时命令
npm install -g zhihu-cli

# 只安装到一个宿主时，替换 --agent 的值：codex、hermes-agent 或 openclaw
npx --yes skills add NNNNzs/zhihu-cli --skill zhihu-cli --global --agent openclaw
```

OpenClaw 也可以不用 Skills CLI，直接从 Git 安装：

```bash
openclaw skills install git:NNNNzs/zhihu-cli
npm install -g zhihu-cli
```

安装后开启新会话，或按宿主方式刷新 Skills。Agent 应要求用户在其本机终端执行粘贴导入命令，不能读取、回显、转发 Cookie 或二维码凭证。

升级源码安装：

```bash
npx --yes skills update zhihu-cli --global
npm install -g github:NNNNzs/zhihu-cli
```

全局安装升级：

```bash
npm update -g zhihu-cli
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

## 发布到 npm

同时更新 `package.json` 的 `version` 和根目录 `SKILL.md` 的 `metadata.version`，并提交发布改动。发布需要干净的 Git 工作区以及可发布该包的 npm 账号。

```bash
pnpm release                  # 本地检查、验证安装包、检查版本是否已被占用
pnpm release -- --publish     # 检查通过后发布
```

默认发布到官方 npm registry，使用 `latest` 标签。可追加 `--tag next` 发布到 `next`。脚本不会自动升级版本号。

## 许可与来源

项目采用 [AGPL-3.0-only](LICENSE)。来源快照与许可证记录见 [references/provenance.md](references/provenance.md)。
