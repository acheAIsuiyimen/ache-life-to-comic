# Ache life-to-comic

把日常、照片、知识笔记、会议纪要、读书心得和长文，持续收进一本按月成册的漫画手帐。

## 仓库结构

- `dist/codex/ache-life-to-comic/`：可安装的完整 Skill 包
- `conformance/tests/`：确定性与回归测试
- `conformance/scripts/`：视觉选择器和检查脚本
- `platforms/`：WorkBuddy、TRAE 与通用平台适配契约
- `docs/verification.md`：当前版本验收证据

## 安装

把 `dist/codex/ache-life-to-comic` 目录复制到目标平台的个人 Skill 目录。Skill 不绑定图片供应商；优先使用平台原生图片能力，没有图片能力时提供轻插图或待补图流程。

## 当前基线

- 默认画风：02 雪色粉蜡
- 设计系统：`ache-design-system/1.0.0`
- 创刊流程：逐题四步
- 上下文：默认不超过 12,000 字符
- 页面底色：`#FFFFFF`
- 自动化：42 / 42

此仓库包含生成式视觉资产，仅用于本项目的 Skill 与个人连载。
