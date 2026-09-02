# Changelog

## [0.2.22] - 2026-09-03

### Changed
- 移动端顶栏第一行最终排布：汉堡 | PTC 模式 | 剩余表计 | 用量徽标 | 后台任务(jobs)，
  徽标倒数第二、jobs 最右，与抽屉图标同一水平且无重叠。徽标移动端去「tok」后缀并收紧 padding，
  actions 间距收紧到 5px，390px 宽一行四项完整可见；≤380px 自动换行且保持视觉顺序。
  桌面 ≥1024px 零变化。

## [0.2.21] - 2026-09-03

### Changed
- 移动端顶栏布局再调整：后台任务（job-list）回到第一行（与汉堡/抽屉图标同一水平，不再重叠）；
  用量徽标 absolute 挂到「对话/轨迹」tab 行右端（顶栏最后位置，可点击），移动端隐藏「tok」后缀保持紧凑。
  第一行仅剩 PTC 预设标签 + 剩余表计 + 后台任务三项，390/360 宽下完整可见无溢出；
  无 tabs 行（单视图）时回退折行左对齐且徽标排最后。桌面 ≥1024px 零变化。

## [0.2.20] - 2026-09-03

### Changed
- 移动端（≤1023px）厂商后台任务入口（job-list）改为挂在「对话/轨迹」tab 行右侧（header 右缘），
  不再独占一行；徽标拆出独立「tok」后缀并在移动端隐藏以给第一行腾位。
  无 tabs 行（单视图）时回退为 0.2.19 的折行左对齐布局。桌面 ≥1024px 零变化。

### Fixed
- 0.2.19 中 jobs 独占一行导致顶栏过高（140px）且布局拥挤；现顶栏恢复单行紧凑（76px）。

## [0.2.19] - 2026-09-03

### Changed
- 移动端（≤1023px）把厂商后台任务入口（job-list「N 个后台任务」）从顶栏 actions 第一行移到独立一行、
  左对齐贴顶栏左缘（汉堡/抽屉图标下方左侧），不再挤压第一行；顺带使第一行剩余项
  （用量徽标、agent 预设标签、dsh-litellm-key-usage 剩余表计）全部放得下、不再裁出视口。
  桌面 ≥1024px 布局零变化。

## [0.2.18] - 2026-09-03

### Fixed
- 修复移动端（≤1023px）会话顶栏用量徽标被挤出视口看不见的问题：
  header actions 行内厂商项（agent 预设标签、上下文占用表计）不收缩，整行溢出视口，
  排在末尾的徽标被 overflow:hidden 祖先裁出屏幕。现于移动断点内让徽标排到 actions 组最前
  （`order:-1`），保证始终可见、可点击；桌面 ≥1024px 布局零变化。

## [0.2.17] - 2026-09-01

### Fixed
- 兼容当前 DSH（0.1.2-alpha.3）：
  - 客户端静态模块 `@deepseek-ai/dsh-client-runtime/client` 已从平台静态模块中移除，
    改用 `@deepseek-ai/dsh-client-store`（`createSnapshotStore` API 一致），修复浏览器端加载失败。
  - Host 端不再依赖旧版 `installSettingsSection` / `settingsNamespace`（新版 dsh-settings
    0.1.2-alpha.3 已移除），改为直接经 `ctx.settings.register` 服务接口注册设置命名空间。
  - 清理 package.json：移除 `@deepseek-ai/dsh-client-runtime` client inject 与陈旧 peerDependencies。

## [0.2.16] - 2025-01-20

### Added
- 7-day trend chart
- Cache hit rate tracking

## [0.2.0] - 2025-01-15

### Added
- Token usage statistics by model
- Settings panel integration

## [0.1.0] - 2025-01-10

### Added
- Initial release
- Basic token tracking
