# Changelog

## [1.2.1] - 2026-11-23

### Feature

- 编辑器整体迁移至 CodeMirror 6（live preview）：编辑对象始终是 markdown 源文本，渲染全部为 Decoration/Widget 覆盖层，源码绝不被改写；各功能插件化（`MarkdownPlugin`），可在设置页逐个开关。
- 独立标题：标题成为独立字段（不再取自正文首行），编辑态输入框 / 预览态展示，修改标题自动重命名笔记文件，空标题兜底 `Untitled`。
- 代码块增强：围栏行显隐、语法高亮、行右侧语言标注（hover 反色 + 一键 Copy）、块内不折行横向滚动。
- 列表体验优化：marker 支持 dash 级显隐、悬挂缩进按父文本列对齐、空项 Enter 减一层缩进 / 顶层退出列表。

### Changed

- 存储模型重构：笔记正文由 SQLite JSON 迁移为 `userData/notes/<标题>.md` markdown 文件（原子写入：临时文件 + rename），元数据（含独立 title）存入 SQLite `notes_meta` 表；旧 `notes` JSON 表只读保留，永不写入。
- 自动迁移（`user_version` 门控，旧数据无感升级）：v1 旧 JSON 表 → markdown 文件（`legacy_id` 幂等 + 文件缺失自愈）；v2 提取每条笔记首行为独立标题（首行为代码围栏时不提取）。
- 选区改为浏览器原生绘制（`::selection`），按字形精确高亮，代码块背景不遮挡。

### Removed

- 移除 Tiptap 编辑器（旧 Tiptap 代码暂时保留供参考，不再维护）。

## [1.2.0] - 2026-09-14

### Feature

- ctrl x 快捷键
- ctrl l
- alt + 上下
- ctrl s 强制保存
- motion panels
- 预览区域双击进入编辑
- Editor 左右两侧增加 padding
- 增加 sidebar 开关动画

### Bug Fix

- 粘贴markdown没解析
- 选多行文本转化为 code-blcok 有问题
- 关闭编辑器时，预览的note默认变成了第一个note

## [1.1.0] - 2026-09-09

### Feature

- 增加 workspace 系统，可以通过命令命令面板切换工作区.
- 增加 Title shimmer。
- Action Panel 增加 Label。
- 编辑器粘贴增强：粘贴 Markdown 源码自动转为富文本（标题/列表/代码块/链接/公式等）
- 编辑器粘贴图片（截图）自动落盘并插入，笔记内可直接显示图片。

### Bug Fixed

- 修复编辑页命令模板当前笔记标识位置错误问题。
- 修复顶部栏按钮提示文本不显示问题。

### Removed

- 隐藏 Action Panel > Share 功能。

### Changed

- 改用 Tiptap 编辑器。
- pin active 时，pin icon 改为修改线颜色。
- Note List Panel 改为命令面板。
- 隐藏顶部栏添加新笔记按钮。
