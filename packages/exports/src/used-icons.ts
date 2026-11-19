// graphics-icon/used-icons —— 只把代码里真正 import 的图标打进一个 webfont 的 Vite 插件(默认导出)。
//   虚拟模块:`virtual:used-icons.css`(样式)、`virtual:used-icons/<集合>/<图标>`(默认导出类名)。
//   类型声明:在 env.d.ts 里写 `/// <reference types="graphics-icon/used-icons/client" />`。
export { default } from 'used-icons'
export type { UsedIconsOptions } from 'used-icons'
