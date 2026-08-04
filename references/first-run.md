# 首次创刊

只在新建书、找不到书级配置或用户明确说“重新创刊”时读取。

## 逐题选择

每次只展示一题。用户回答或选择默认值后才展示下一题；不得用一条消息罗列四组设置。

### 1. 画风

- 先展示 `assets/presets/style-selector.png`，五个候选在同一张图中可比较
- 按 `references/presentation-runtime.md` 获取并校验展示回执；没有 `displayed: true` 时不得继续询问
- 上传 1–5 张参考图（优先）
- 02 雪色粉蜡（默认，已验证）
- 01 云层水粉（可选候选）
- 03 白纸彩铅（可选候选）
- 04 双色线记（可选候选）
- 05 细墨轻彩（可选候选）

用户上传参考图时，分离：

- 媒介与笔触
- 配色与明度
- 人物画法
- 留白与构图
- 手帐材料
- 漫画镜头
- 题材和具体角色

只把前六类转译为画风。参考图里出现的人物、Logo、地点或具体构图不自动进入用户作品。

### 2. 持续角色

- 暂时没有（默认）
- 带上自己的 IP（人物、宠物、物件或品牌角色）
- 66 大王（内置示例角色）

角色是可穿插资源，不是每页必出现的主角。

### 3. 主载体

- 本地 HTML 月册（默认）
- 飞书月册
- GitHub 连载站
- 先本地后同步

远端载体只保存连接引用和同步策略，不把凭证写入书库。

### 4. 书

- 创建默认《我的漫画人生》
- 创建并命名
- 续更已有书

## 用户可见话术

依次使用：

1. “先为这本书挑一种呼吸感。”
2. “这一页里，要不要让一个熟悉的角色偶尔路过？”
3. “这本书准备放在哪里继续长大？”
4. “最后，给它一个名字。”

不要说“书库配置”“校准稿”“路线”“调用”“生成策略”。内部状态由
`scripts/onboarding.mjs` 保存，不需要用户理解。

## 配置

保存为 `publication-profile.json`：

```json
{
  "schemaVersion": "1.1.0",
  "onboardingVersion": "ache-onboarding/1.1.0",
  "designSystemVersion": "ache-design-system/1.5.0",
  "bookId": "stable-book-id",
  "title": "我的漫画人生",
  "style": {
    "id": "02-snow-pastel",
    "lifecycle": "validated_preset"
  },
  "character": {
    "mode": "none",
    "ids": []
  },
  "publication": {
    "primary": "local-html",
    "mirrors": []
  },
  "visualFallback": null,
  "continuity": "weak",
  "episodeCover": true,
  "budget": "standard"
}
```

候选画风首次启用后，把书级状态写为 `book_calibrated_candidate`，不要修改全局候选库。

## 不询问

- 要不要手帐
- 要不要漫画效果
- 每章要不要封面
- 是否按内容决定页数
- 是否持续保存

这些已经属于产品定义。
