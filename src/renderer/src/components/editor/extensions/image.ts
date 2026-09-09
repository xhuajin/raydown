import Image from '@tiptap/extension-image'

/**
 * image 节点：包一层官方 @tiptap/extension-image，让 schema 包含 image 节点，
 * 供剪贴板粘贴（extensions/paste.ts）与 Markdown 产出的 <img> 解析落进去。
 *
 * - 块级（inline: false）：截图粘贴的图片独立成段，视觉上一张图一行。
 * - allowBase64: false：图片一律走 ray-down-image:// 协议落盘，不在文档里内嵌 base64，
 *   避免把二进制写进 JSONDoc 撑爆 note 内容。
 */
export const ImageNode = Image.configure({ inline: false, allowBase64: false })
