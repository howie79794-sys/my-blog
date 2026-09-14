// Variables used by Scriptable.
// icon-color: cyan; icon-glyph: newspaper;
//
// AIHOT 新闻小组件 v1 — Howie（大号 · 三页轮播）
// 数据源: https://my-blog-howie79.vercel.app/assets/aihot-widget.json
// 布局: 头部(源+时间) + 6条新闻(标题+摘要行) + 尾部(精选数+页码)
// 轮播: Timeline 多 entry，每 10s 翻页，点按跳当前页头条

const URL_DATA = 'https://my-blog-howie79.vercel.app/assets/aihot-widget.json'
const URL_SITE = 'https://aihot.news/all'

const INK = '#1C1C1A', MUTED = '#6F6D63', FAINT = '#9A988E',
      LINE = '#E4E1D4', PAPER = '#F6F4ED', CYAN = '#0E7490'

const W = new ListWidget()
W.backgroundColor = new Color(PAPER)
W.url = URL_SITE

;(async () => {
let data
try {
  const req = new Request(URL_DATA)
  req.timeoutInterval = 20
  data = await req.loadJSON()
} catch (e) {
  const err = W.addText('⚠️ 数据加载失败')
  err.font = Font.systemFont(13)
  err.textColor = new Color(MUTED)
  Script.setWidget(W)
  Script.complete()
  return
}

const pages = (data && data.pages) || []
const fam = config.widgetFamily
const isLarge = fam === 'large'

// 每页条数按组件型号自适应
const perPage = isLarge ? 6 : 3
// 把 pages 重新切成 perPage 条一屏
const flat = []
for (const p of pages) for (const it of p) flat.push(it)
const screenCount = Math.max(1, Math.min(6, Math.ceil(flat.length / perPage)))

function fmtScreen(idx) {
  const w = new ListWidget()
  w.backgroundColor = new Color(PAPER)
  const slice = flat.slice(idx * perPage, (idx + 1) * perPage)

  // ── 头部 ──
  const head = w.addStack()
  head.layoutHorizontally()
  head.bottomAlignContent()
  const badge = head.addText('⚡ AIHOT')
  badge.font = Font.mediumSystemFont(13)
  badge.textColor = new Color(CYAN)
  head.addSpacer(6)
  const sub = head.addText(data.source || '全部动态')
  sub.font = Font.systemFont(10)
  sub.textColor = new Color(FAINT)
  sub.lineLimit = 1
  head.addSpacer()
  const upd = head.addText((data.updated || '') + ' 更')
  upd.font = Font.systemFont(9)
  upd.textColor = new Color(FAINT)

  w.addSpacer(1)
  const hr = w.addStack()
  hr.size = new Size(0, 1)
  hr.backgroundColor = new Color(LINE)
  hr.cornerRadius = 0.5
  w.addSpacer(6)

  // ── 新闻列表 ──
  const first = slice[0]
  for (let i = 0; i < slice.length; i++) {
    const it = slice[i]
    const row = w.addStack()
    row.layoutHorizontally()
    row.topAlignContent()
    row.spacing = 5

    // 左侧标记列
    const mark = row.addText(it.sel ? '★' : (it.agg ? '◈' : '·'))
    mark.font = Font.systemFont(11)
    mark.textColor = new Color(it.sel ? CYAN : FAINT)

    const col = row.addStack()
    col.layoutVertically()
    col.spacing = 1

    const title = col.addText(it.title || '')
    title.font = (i === 0 && isLarge) ? Font.semiboldSystemFont(13) : Font.mediumSystemFont(12)
    title.textColor = new Color(INK)
    title.lineLimit = 2
    title.minimumScaleFactor = 0.85

    if (isLarge && it.sum) {
      const s = col.addText(it.sum)
      s.font = Font.systemFont(10)
      s.textColor = new Color(MUTED)
      s.lineLimit = 1
    }
    if (i < slice.length - 1) w.addSpacer(6)
  }

  // ── 尾部 ──
  w.addSpacer()
  const foot = w.addStack()
  foot.layoutHorizontally()
  const selCount = flat.filter(x => x.sel).length
  const f1 = foot.addText('★精选 ' + selCount)
  f1.font = Font.systemFont(9)
  f1.textColor = new Color(FAINT)
  foot.addSpacer()
  const f2 = foot.addText('● ' + (idx + 1) + '/' + screenCount)
  f2.font = Font.systemFont(9)
  f2.textColor = new Color(CYAN)

  w.url = (first && first.url) || URL_SITE
  return w
}

// ── 轮播 Timeline：每 10 秒一屏，共 screenCount 屏后保持末屏 ──
const timeline = new Timeline()
const present = new Date()
for (let i = 0; i < screenCount; i++) {
  const t = new Date(present.getTime() + i * 10000)
  timeline.insertEntry(fmtScreen(i), t)
}
// 末屏后留 30s 空档（系统会保持最后一帧或刷新）
Script.setWidget(timeline)
Script.complete()
})()
