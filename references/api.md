# 知乎 API 与命令约定

## 输出约定

成功输出：

```json
{"ok":true,"data":{},"paging":null,"warnings":[]}
```

失败时 stdout 不输出成功对象，stderr 输出不含 Cookie 的 JSON 错误，进程退出码非零。

## 认证

- 配置路径：`~/.zhihu-creator/config.json`，权限 `0600`。
- `d_c0`：生成网页 API 的 zse96 签名。
- `z_c0`：常见完整登录态 Cookie；`auth status` 会报告是否存在，但最终以 `/api/v4/me` 响应为准。
- `_xsrf`：保存草稿和发布回答时作为 `x-xsrftoken` 请求头。
- Cookie 应通过 stdin 导入，不能作为命令行参数或写入仓库文件。

## 配置

- `userAgent` 与 `zse93` 提供请求头和签名版本，默认值适用于当前参考源码快照。
- `proxy` 默认为 `null`，即直接连接；只有用户在配置中显式写入代理 URL 时才启用代理。
- `defaultStyle` 保存评论权限、转载设置、赞赏开关和目录开关，预览令牌会绑定最终设置。
- 不要把配置文件复制进项目；`auth status` 只输出账号摘要、Cookie 名称及必需项是否存在。

## 已实现端点

- `GET https://www.zhihu.com/api/v4/me`
- `GET https://www.zhihu.com/api/v4/search_v3`
- `GET https://api.zhihu.com/topstory/recommend`
- `GET https://api.zhihu.com/topstory/hot-list`
- `GET https://www.zhihu.com/api/v4/questions/{id}`
- `GET https://www.zhihu.com/api/v4/questions/{id}/feeds`
- `GET https://api.zhihu.com/questions/{id}?include=relationship,relationship.my_answer`
- `POST https://www.zhihu.com/api/v4/questions/{id}/draft`
- `POST https://www.zhihu.com/api/v4/content/publish`
- `POST/GET/PUT https://api.zhihu.com/images...` 与 `https://zhihu-pics-upload.zhimg.com/...`

`search`、`feed` 和 `question` 返回适合模型读取的精简字段；响应里的 `paging.next` 只作为信息返回，不会请求任意用户提供的 URL。

## 重试与失败

- 仅 GET、图片状态查询和幂等的 OSS 分片 PUT 可进行有限重试。
- 草稿和正式发布请求绝不自动重试。
- 401 表示登录态失效；403 通常是权限或风控；429 表示频率限制。CLI 原样报告状态、知乎错误码和安全截断后的响应，不尝试绕过。
- 图片状态最多轮询 10 次，每次间隔 2 秒；超时会返回明确错误。

## 未实现能力

- 知乎文章发布。
- 回答草稿列表和删除。
- CAPTCHA、二维码登录、风控绕过和自动刷新凭据。
