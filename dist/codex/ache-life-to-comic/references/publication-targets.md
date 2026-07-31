# 连载载体

## 共同契约

每个适配器实现：

- `probe`
- `initializeSeries`
- `initializeMonth`
- `appendEpisode`
- `updateSeriesIndex`
- `readBack`
- `export`
- `reportWarnings`

适配器不负责改变正文、路由、画风和章节 UUID。

## 本地 HTML

- 系列书架：`books/<book-id>/index.html`
- 月册：`monthly-volumes/<yyyy-mm>/continuous-edition/index.html`
- 数据：`book-data.json`
- 原始章节与资产放内部目录

同月续更只更新月册和系列书架。断网可读已有内容。

## 飞书

- 一本书对应一个系列目录文档。
- 每个有内容月份对应一个持续追加文档。
- 保存 document ID、月册映射和 revision，不保存访问凭证。
- 写入后回读 block、图片、链接、warnings/degrade 和 revision。
- 达到平台限制时按月或季度切换，不按单章切换。

阿车项目只允许个人 `felix`：

1. 回读当前连接身份。
2. `identity.toLowerCase() === "felix"` 才能进入授权检查。
3. 身份未知或其他账号返回 `identity_confirmation_required`。
4. 即使是 `felix`，没有本次外部写入授权仍返回 `authorization_required`。

## GitHub

- 一本书使用一个仓库/站点或一个站点路径。
- 首页为系列书架。
- 每月一个连续阅读路由。
- 私密主版本与脱敏公开副本分离。
- 未授权时只准备本地发布包，不 push、不建仓库、不改权限。

## 先本地后同步

本地为主版本。镜像只接受已经通过本地 QA 的版本。镜像失败不回滚本地正式章节；记录同步失败并可重试。

## 多平台

平台安装包独立维护。只完成契约未实测时标 `adapter_spec_only`，不能宣称正式兼容。
