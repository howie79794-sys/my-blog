// HOWIE 日期条 v2 — 横向一行版（纸感配色）
// 数据源: 无（纯本地时间）· 托管地址: /assets/date-widget.js
// 布局: [19] [10月] · [21:33] 单行底对齐，按 widgetFamily 自适应字号

const PAPER = '#F6F4ED', INK = '#1C1C1A', MUTED = '#6F6D63', FAINT = '#9A988E'
const fam = config.widgetFamily

// accessory（锁屏小条）更窄，字号整体缩一档
const acc = fam === 'accessoryRectangular' || fam === 'accessoryInline' || fam === 'accessoryCircular'
const S_BIG  = acc ? 22 : (fam === 'small' ? 30 : 36)
const S_MID  = acc ? 11 : (fam === 'small' ? 14 : 16)
const S_TIME = acc ? 12 : (fam === 'small' ? 15 : 17)

const now = new Date()
const d = String(now.getDate())
const mo = (now.getMonth() + 1) + '月'
const pad = n => (n < 10 ? '0' : '') + n
const tm = pad(now.getHours()) + ':' + pad(now.getMinutes())

const w = new ListWidget()
w.backgroundColor = new Color(PAPER)

const row = w.addStack()
row.layoutHorizontally()
row.bottomAlignContent()
row.spacing = acc ? 3 : 6

const tD = row.addText(d)
tD.font = Font.boldSystemFont(S_BIG)
tD.textColor = new Color(INK)
tD.minimumScaleFactor = 0.7

const tM = row.addText(mo)
tM.font = Font.mediumSystemFont(S_MID)
tM.textColor = new Color(INK)
tM.minimumScaleFactor = 0.7

const sep = row.addText('·')
sep.font = Font.systemFont(S_MID)
sep.textColor = new Color(FAINT)

const tT = row.addText(tm)
tT.font = Font.monospacedDigitSystemFont(S_TIME)
tT.textColor = new Color(MUTED)
tT.minimumScaleFactor = 0.7

// 时间类组件：登记下一分钟刷新（系统按预算调度，锁屏 accessory 通常能到分钟级）
const next = new Date(now.getTime() + 60000)
w.refreshAfterDate = next

if (config.runsInWidget) {
  Script.setWidget(w)
} else {
  await w.present()
}
Script.complete()
