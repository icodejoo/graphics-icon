/**
 * 由裸词 classPrefix + classSeparator 派生 CSS 选择器与 HTML 类名(单一真相,各处复用)。
 * - baseName          = classPrefix                                  → 'icon'(HTML 基类名)
 * - baseSelector      = `.${classPrefix}`                            → '.icon'(基类选择器)
 * - className(name)   = `${classPrefix}${classSeparator}${name}`     → 'icon-home'(HTML 每图类名)
 * - perSelector(name) = `.${classPrefix}${classSeparator}${name}`    → '.icon-home'(每图 ::before 选择器)
 * Derives CSS selectors and HTML class names from the bare-word classPrefix + classSeparator (single source of truth).
 */
export function deriveClassNames(
  classPrefix: string,
  classSeparator: string,
): {
  baseSelector: string
  baseName: string
  perSelector: (name: string) => string
  className: (name: string) => string
} {
  return {
    baseSelector: `.${classPrefix}`,
    baseName: classPrefix,
    perSelector: (name: string) => `.${classPrefix}${classSeparator}${name}`,
    className: (name: string) => `${classPrefix}${classSeparator}${name}`,
  }
}
