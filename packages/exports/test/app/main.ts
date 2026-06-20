// 真实消费:导入 colorfont「实物落盘」生成的 @font-face CSS(含 .icon class 规则 + 字体 url())。
// buildStart 时伞插件已把 .gen/AccIcons.css 与字体写好,故此处静态导入可被 vite 解析并打包。
import './.gen/AccIcons.css'

document.title = 'colorfont real-disk demo'
