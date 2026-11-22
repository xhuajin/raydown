/**
 * markdown 语言装配：commonmark + GFM 基础方言，外加可插拔插件注入的自定义方言
 * （数学 $…$ / 高亮 ==…== 等由各插件以 MarkdownConfig 贡献）。
 * 不用官方 markdownLanguage（它自带 Subscript/Superscript/Emoji 等不需要的方言），
 * 用裸 commonmarkLanguage 显式加 GFM。
 */
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import type { LanguageSupport } from '@codemirror/language'
import type { PluginBundle } from '../core/types'

export function buildMarkdownLanguage(bundle: PluginBundle): LanguageSupport {
    return markdown({
        base: commonmarkLanguage,
        extensions: [GFM, ...bundle.parse],
        codeLanguages: bundle.codeLanguages.length > 0 ? bundle.codeLanguages : undefined
    })
}
