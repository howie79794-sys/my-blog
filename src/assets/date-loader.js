// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-brown; icon-glyph: clock;
// 日期条 · 加载器（完整脚本托管在博客，升级免重贴）
const fm = FileManager.local()
const path = fm.joinPath(fm.documentsDirectory(), 'date_widget_code.js')
let code = null
try {
  const req = new Request('https://my-blog-howie79.vercel.app/assets/date-widget.js')
  req.timeoutInterval = 15
  code = await req.loadString()
  if (code && code.length > 500) fm.writeString(path, code)
} catch (e) {}
if (!code || code.length < 500) code = fm.readString(path)
if (!code) {
  const ew = new ListWidget()
  const et = ew.addText('日期条：首次需联网拉脚本\n挂 VPN 后在 Scriptable 点 ▶')
  et.font = Font.systemFont(11)
  et.textColor = new Color('#6F6D63')
  Script.setWidget(ew)
  Script.complete()
}
eval(code)
