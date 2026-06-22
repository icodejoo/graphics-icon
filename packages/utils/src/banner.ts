/**
 * 「自动生成、请勿修改」头注释 —— 四引擎所有文本产物(js/ts/css/svg 等)统一在头部加。
 * 中英双语,各占一行;按目标文件的注释语法包裹。
 *
 * Auto-generated banner — prepended to every text product (js/ts/css/svg…) across the engines.
 * Bilingual, one line each; wrapped per the target file's comment syntax.
 */

/**
 * 注释语法:
 *   · line  —— `//` 行注释(js / ts)
 *   · block —— CSS 块注释(纯 CSS 不支持 `//`)
 *   · xml   —— `<!-- -->`(svg / xml)
 * Comment syntax: line (js/ts), block (css), xml (svg).
 */
export type CommentStyle = "line" | "block" | "xml"

/** 中文提示(一行)。 / Chinese line. */
const ZH = "该文件是自动生成的，请勿修改。"
/** 英文提示(一行)。 / English line. */
const EN = "This file is auto-generated. Do not edit."

/**
 * 返回中英双语「自动生成」头注释(中、英各一行,尾部带一个换行)。
 * Return the bilingual auto-generated banner (Chinese + English, one line each, trailing newline).
 */
export function autoGenBanner(style: CommentStyle): string {
  switch (style) {
    case "line":
      return `// ${ZH}\n// ${EN}\n`
    case "xml":
      return `<!-- ${ZH} -->\n<!-- ${EN} -->\n`
    default:
      return `/* ${ZH} */\n/* ${EN} */\n`
  }
}
