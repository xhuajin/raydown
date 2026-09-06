# 编辑器四项增强实施计划

## 结论先行：remark / turndown 都不需要

- **Markdown → ProseMirror**（粘贴方向）：用官方 `prosemirror-markdown`（内部基于 markdown-it），把 markdown-it 的 token 直接映射到本项目自定义 schema，与 remark 相比少一层 AST 转换、且是 ProseMirror 生态标准做法。
- **复制 → Markdown**：直接用 `MarkdownSerializer` 从 PM 文档序列化（保真度最高）；turndown（HTML→MD）只在"粘贴网页时把 HTML 降级为 markdown"场景才有用，本方案不需要。
- **粘贴策略（按来源智能处理）**：剪贴板 HTML 带 `data-pm-slice`（本编辑器内部复制）→ 走原生解析保真粘贴；`text/plain` 看起来像 markdown（标题/列表/任务/代码围栏/加粗/链接等启发式打分）→ 解析为 markdown；否则维持现有默认（HTML 或纯文本）。

## 公式库版本说明

npm 的 `prosemirror-math` 现为 ProseKit 作者维护的重写版（0.2.2，兼容 prosemirror-model ^1.25，纯 ESM 带类型，API 为独立导出：`mathInlineSpec`/`mathBlockSpec`/`createMathInlineView`/`createMathBlockView`/`createMathInlineInputRule`/`mathBlockEnterRule`/`createCursorInsidePlugin`），渲染函数由我们接 KaTeX（`throwOnError: false`）。benrbray 原版已停更（2021 CJS 包，npm 名 `@benrbray/prosemirror-math`）。

## 依赖（pnpm add）

`prosemirror-markdown`、`markdown-it`（v14 自带类型）、`@vscode/markdown-it-katex`（VS Code 官方插件，产出 `math_inline`/`math_block` token，含 pandoc 风格防误判）、`prosemirror-math`、`prosemirror-enter-rules`（math 块级 Enter 规则需要，pnpm 严格模式下需显式声明）、`katex`。

## 文件改动

1. **`pm/schema.ts`**
   - `list_item` 增加 `checked: { default: null }` 属性：`null`=普通列表项（完全向后兼容旧数据）；`true/false`=任务项。toDOM 输出 `li[data-checked]` + 内嵌 `span.task-checkbox`（contenteditable=false）；parseDOM 从 `data-checked` 读取。
   - 追加 `math_inline`（inline, atom, content text*, tag `math-inline`）与 `math_display`（block, atom, code, content text*, tag `math-display`）节点，spec 取自 prosemirror-math 导出。

2. **新增 `pm/markdown.ts`**（核心新模块）
   - 共享 markdown-it 实例（default 预设、`html:false`）+ `@vscode/markdown-it-katex` + 自写 tasklist core 规则（识别 `- [ ] `/`- [x] `，把 `data-checked` 写到 `list_item_open` token 并剥离前缀文本）。
   - `markdownParser = new MarkdownParser(pmSchema, tokens, md)`：映射 heading/paragraph/blockquote/lists/code_block(fence→language)/hard_break/softbreak/strike(s)/link/math_inline/math_block；list_item 通过 getAttrs 还原 checked。
   - `markdownSerializer`：复用 `defaultMarkdownSerializer` 处理器并覆盖/新增——自定义 `renderList` 变体使首行分隔符能读取子项 checked（`- `/`- [ ] `/`- [x] `、有序列表用 `order` attr），code_block 用 `language` attr，math_inline→`$...$`、math_display→`$$\n…\n$$`，strike→`~~`。
   - `looksLikeMarkdown(text)` 启发式打分（围栏/ATX 标题/任务项权重高，列表/粗体/链接/引用/行内公式次之，多行阈值 2、单行 3）。
   - `markdownToSlice(text)`：单段落结果以 open 端 Slice 返回（并入当前段落），块级结果闭合插入。

3. **`pm/plugins.ts`**
   - 新增 `pasteHandlerPlugin`：`handlePaste` 按"结论先行"的策略拦截，内部粘贴（data-pm-slice）放行，markdown 文本经 `markdownToSlice` + `replaceSelection` 插入。
   - 新增 `taskCheckboxPlugin`：mousedown 命中 `li[data-checked] > .task-checkbox` 时 `setNodeMarkup` 取反 checked。
   - 追加 prosemirror-math 的 `createCursorInsidePlugin()`、`createEnterRulePlugin({ rules: [mathBlockEnterRule] })`。

4. **`pm/inputrules.ts`**
   - 追加 `createMathInlineInputRule('math_inline')`（`$...$` → 行内公式）。
   - 追加任务项规则：在列表项内输入 `[ ] `/`[x] `（含首字符时）→ 删除前缀并设置 checked（配 `- ` 列表规则组合出 `- [ ] `）。

5. **`pm/commands.ts`**：新增 `toggleTaskList()` —— 任务项→lift 退出；普通列表项→置 checked=false；非列表→wrapInList(bullet_list) 后对包裹项置 checked=false（通过自定义 dispatch 捕获 tr，映射原 block range 避免误改相邻已合并列表）。

6. **`pm/plugins.ts` 的 keymap**：`Enter` 前置 `splitListItem`（列表项正确拆分/空项退出）；`Tab/Shift-Tab` 仅在列表内 sink/lift（守卫，避免影响焦点导航）。

7. **`note-editor.tsx`**
   - EditorView 注册 `nodeViews: { math_inline: createMathInlineView(katex 渲染), math_display: createMathBlockView(...) }`，渲染回调 `katex.render(text, el, { throwOnError: false, displayMode })`。
   - 工具栏新增"任务列表"按钮（lucide `ListTodo`，active 态判断选中项 checked!==null）。

8. **`pm/editor.css`**：任务项（去 list-style、checkbox 绝对定位到 marker 区、选中态 ✓、hover/checked 主题变量）+ math 节点样式（对齐 prosemirror-math 的 math-node 编辑态/渲染态、溢出滚动）。

9. **顶部 import CSS**（editor.css 或 note-editor.tsx）：`katex/dist/katex.min.css`（字体随 vite 本地打包，离线可用）；prosemirror-math 0.2.2 无独立 CSS 文件。

## 复制行为（需求 4）

`clipboardTextSerializer: (slice) => markdownSerializer.serialize(slice)` —— 复制列表即输出 `- xxx` / `1. xxx` / `- [ ] xxx`，标题 `#`、代码围栏、公式 `$…$` 同理。同时保留 PM 默认 HTML flavor（内部粘贴保真 + 粘贴到其他富文本编辑器可用）。

## 验证

- `pnpm typecheck` + `pnpm lint`。
- 启动 `pnpm dev` 用桌面自动化做端到端冒烟：写剪贴板 markdown → 粘贴 → 截图验证（任务列表勾选、公式渲染）；编辑器内全选复制 → 读剪贴板验证是 markdown 文本。
- 兼容性：`checked: null` 默认值保证旧 localStorage JSONDoc 不受影响；ProseMirror JSON 存储格式不变（仍符合 CLAUDE.md 约定）。