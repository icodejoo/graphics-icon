// graphics-icon/used-icons 的虚拟模块类型。在项目的 env.d.ts 里引用:
//   /// <reference types="graphics-icon/used-icons/client" />

/** 样式:@font-face(字体以 data URI 内联)与每个图标的类。入口里 import 一次;之后模板里直接写 `lucide-sun` 即可。 */
declare module 'virtual:used-icons.css' {
  const css: string
  export default css
}
