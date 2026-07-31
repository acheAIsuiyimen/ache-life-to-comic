# 展示能力与首屏交付

适用于创刊画风选择图、章节预览、月册和验收稿。它解决的是“文件已经存在，但用户没有真正看到”的问题。

## 先展示，再询问

画风选择必须先展示 `assets/presets/style-selector.png`。只有平台回执确认 `displayed: true`，才可以继续询问用户选择 01–05 或上传参考图。

调用 `scripts/presentation.mjs` 生成展示计划，按当前环境真实能力依次选择：

1. 原生图片附件；
2. 原生文件预览；
3. HTML artifact；
4. 本地预览。

核心层只输出展示意图，不猜测平台工具名。平台适配层必须绑定一个真实存在的能力，不能自行创造 `present_files`、`show_asset` 一类调用。

## 阻塞处理

如果没有任何展示能力：

- 不得把内部工具 JSON、文件路径或调用参数当作图片交给用户；
- 不得假装选择图已经出现；
- 清楚说明“选择图还没有成功显示”，再引导启用当前环境可用的附件、文件预览或浏览器能力；
- 保留创刊状态，恢复后仍从画风选择开始。

## 展示回执

每次必要视觉至少保存：

```json
{
  "schemaVersion": "1.0.0",
  "assetPath": "assets/presets/style-selector.png",
  "mode": "native-image-attachment",
  "status": "displayed",
  "displayed": true,
  "adapter": "platform-provided",
  "warnings": []
}
```

`ready` 只表示文件存在；`displayed` 才表示用户已经看到。
