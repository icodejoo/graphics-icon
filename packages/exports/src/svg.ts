// graphics-icon/svg —— SVG 雪碧图引擎 + CLI + 类型(Vite 能力请走 graphics-icon/vite)。
import { generateSvgSprites, runCli } from 'svg-icons'

// 主函数 generateSvgSprites 另以项目名 svgIcons 导出，并作为默认导出（三者同价）。
export { generateSvgSprites, generateSvgSprites as svgIcons, runCli }
export default generateSvgSprites
export type { SvgIconsOptions, SvgIconsCommon, SvgIconsItem, SvgIconsConfig, SvgIconsOutput, ColorOption, ColorFn, NormalizeOption } from 'svg-icons'
