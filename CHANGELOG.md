# Changelog

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
