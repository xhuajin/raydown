# cm/ — CodeMirror 6 live preview 编辑器

类 Obsidian 的 live preview：编辑对象永远是 markdown 源文本，渲染只是 Decoration/Widget 覆盖层。
插件体系见 `core/registry.ts`（每个功能一个 `MarkdownPlugin`，设置页可开关）。

## 列表渲染结构（nodes/list.ts + core/widgets.ts）

每个列表项行内前缀由**固定宽度元素**构成，宽度由 `core/metrics.ts` 按当前字体实测：

```
[cm-indent 缩进占位][cm-marker-box marker 盒子][文本]
```

- 缩进占位宽 = **父项文本列**（父缩进 + 父盒子宽，递归计算）：嵌套 marker/复选框与
  父项文本精确对齐（同 Obsidian），不按源码空格宽度渲染
- 行装饰：marker 行 `padding-left: W; text-indent: -W`（悬挂缩进，行内软折行对齐文本列），
  `W = 缩进宽 + 盒子宽`；独立续行（懒延续）不加装饰，按普通段落顶格渲染
- marker 显隐粒度是 **dash 字形本身**：隐藏态 = widget（`•` / checkbox，宽 = dash 实测 + 间隙）
  替换 dash，dash 后的空格是普通文本（光标可停在圆点与文本之间）；光标落在 dash 字形范围
  （双边界均算）时显示源码 `- `（可编辑）
- 缩进占位与隐藏 dash 占位以 `conceal(..., { force: true })` 隐藏（原子范围，见下）
- widget 内渲染隐藏的源码文本（`visibility: hidden` 的 dash/缩进 fill）撑行高与基线，
  使相邻光标高度与正文一致

## 代码块（nodes/code-block.ts）

- 围栏行显隐：光标不在该行时，内容以 mark 装饰 `visibility: hidden` 隐藏（行与背景保留，
  不折叠行高）；光标进入围栏行时源码显示，可编辑语言标注
- 隐藏态开栏行右侧渲染语言标注 widget（hover 反色显示 Copy，点击复制整块，见
  `FenceLabelWidget`）
- 内容行 `white-space: pre` 不折行 + `width: max-content; min-width: 100%`，
  scroller `overflow-x: auto` 提供横向滚动

## 修复记录 / 渲染陷阱（改动本目录前必读）

以下是列表调试中实际踩到并验证过的 Chromium / CM6 行为，相关 CSS 与
`widgets.ts` 中的 `editable`、宽度内联样式互为配套，改动任何一侧都要回归验证：

1. **`text-indent` 是可继承属性**。行上的负首行缩进会继承进 marker 盒子，
   把 bullet 字形拉出盒子（span 宽度被负缩进吃成 0，圆点贴到行首）。
   → `.cm-indent` / `.cm-marker-box` 必须重置 `text-indent: 0`。

2. **Widget 必须声明 `editable = false`**。默认 `editable: true` 时 CM 不加
   `contentEditable=false` 保护：光标可进入 inline-flex 盒内部（Chromium 不在其中
   渲染光标 → 光标"消失"）；空的 inline-block 占位 span 会被浏览器的编辑规范化折叠
   （缩进丢失）。`editable = false` 后 CM 自动加保护并插入 `cm-widgetBuffer`。

3. **显示态（光标会进入的）源码 mark 盒必须用 `inline-block`，不能用 inline-flex**。
   Chromium 在 contenteditable 的 flex 容器内不渲染光标插入符（光标进入 `- ` 内部
   即"消失"）。widget 态（contenteditable=false，内部无光标）可以安全用 inline-flex
   垂直居中 checkbox（类 `cm-marker-box-widget`）。

4. **固定宽度盒内要 `white-space: nowrap`**。marker 后随空格 + 显示态 600 字重
   会超出盒宽，空格在盒内折行 → 盒子变两行高，inline-block 基线取最后一行，
   后续文本掉到"第二行"。

5. **原子前缀占位（列表缩进）的隐藏要 `conceal(..., { force: true })`**。
   `touches` 是闭区间判定：光标停在缩进范围终点（marker 左侧）会被算作"触碰"，
   安全网生效 → 占位消失 → 源码空格回退渲染；其实测宽度与占位有 ~1px 差异
   （canvas measureText vs DOM 布局），文本产生左右跳变。缩进是原子范围，
   光标无法进入其中，"触碰"只可能是边界位置，此时占位应保持不变。

6. **宽度禁止用 ch/em 估算，必须实测**（`core/metrics.ts`，隐藏 DOM 探针测量，
   与实际渲染同布局引擎）。空格宽度 ≠ `ch`（0 宽字形），估算误差在嵌套缩进下会被
   放大；且 canvas measureText 与 DOM 布局对空格推进宽度有 ~0.9px/4空格 的偏差，
   必须 DOM 实测。widget 的宽度也由 JS 内联设置（如 bullet 盒宽 = dash 实测 + 间隙），
   与测量口径保持一致。metrics 在 webfont 加载完成后自动清缓存重测。

7. **列表 Enter（`listEnter`）必须 `Prec.highest`**。空列表项的 Enter（嵌套减一层
   缩进 / 顶层退出列表）由 `listEnter` 接管，非空项交给官方
   `insertNewlineContinueMarkup`。官方对"嵌套空项"走的是"下移一行"分支而非减缩进，
   且实测 `Prec.high` 不足以保证 listEnter 先于官方命令被咨询（部分光标位置官方
   会抢先），必须 `Prec.highest`。空项时光标在行内任意位置（含 marker 原子盒两侧
   边界，方向键会停在那里）都执行减缩进。

8. **围栏行隐藏用 mark 装饰 + `visibility: hidden`**，不要用 color/opacity：
   语法高亮的颜色类（同优先级、样式表顺序不定）会反超 color/opacity，
   visibility 对子元素强制生效。行与背景保留不折叠（用户要求）；
   隐藏态在行右侧渲染语言标注 widget（hover 反色显示 Copy，点击复制整块，
   复制内容实时读取 view.state）。

9. **选区用浏览器原生绘制：不启用 `drawSelection`**。CM 的选区矩形层位于内容层
   **之下**，任何不透明的行背景（如代码块）都会把选区完全盖住，换颜色无效；
   且矩形选区是整行宽度的。原生选区（`::selection` 样式）按字形精确高亮、
   绘制在文本层之上。取舍：Ctrl+多光标的非主选区不可见。

10. **代码块内不折行**：`cm-code-line` 加 `white-space: pre`（覆盖全局 pre-wrap）+
    `width: max-content; min-width: 100%`（背景块随内容延伸、短行仍占满宽），
    scroller `overflow-x: auto` 提供横向滚动。

11. **占位元素必须 `line-height: normal`**。继承行的行高（1.625）会让
    CM `coordsAtPos` 在占位元素旁量出偏高的光标矩形（比正文光标高）。
    `.cm-indent` / `.cm-marker-box` 都要设置。

### 调试方法

这类"某元素宽度/位置不对"的问题，肉眼与理论推导都容易误判，有效路径是：
把真实 DOM（`view.dom.querySelectorAll('.cm-line')` 取目标行 `outerHTML`，可临时
在渲染器里 `console.log` + `ELECTRON_ENABLE_LOGGING=1 pnpm dev` 采集）放进独立
HTML 页，用 `getBoundingClientRect` 逐元素测量，与期望值对比定位塌陷/错位的元素。

另外注意：electron-vite 的 HMR 对 cm/ 内部 TS 模块链的传播不完整（改动可能只热更到
`note-editor.tsx` 而旧模块仍在运行），验证渲染改动前先确认日志里有对应的热更记录，
否则重启 `pnpm dev`。
