// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: heartbeat;
//
// 健康看板小组件 v3 — Howie（纸感配色 · 自适应宽度版）
// 数据源: https://my-blog-howie79.vercel.app/assets/widget.json
// 布局规则：所有元素宽度由 WW 常量统一推导，不写死超界像素

const URL_DATA = 'https://my-blog-howie79.vercel.app/assets/widget.json'
const URL_SITE = 'https://my-blog-howie79.vercel.app/health/'

const PAPER = '#F6F4ED', INK = '#1C1C1A', MUTED = '#8F8E88', FAINT = '#B8B5A9',
      BAR_BG = '#E6E3D6',
      GREEN = '#2B8A3E', RED = '#D9480F', AMBER = '#E8590C'

const fam = config.widgetFamily
// 可用内容宽度（pt）：small ~141，medium/large ~316（组件宽度减去左右 padding）
const WW = fam === 'small' ? 141 : 316
const COLW = Math.floor((WW - 16) / 2)   // 双栏时每栏宽

// ── 拉数据（失败回退缓存）──
let d = null, stale = false
try {
  const req = new Request(URL_DATA)
  req.timeoutInterval = 15
  d = await req.loadJSON()
  if (d) {
    const fm = FileManager.local()
    fm.writeString(fm.joinPath(fm.documentsDirectory(), 'health_widget.json'), JSON.stringify(d))
  }
} catch (e) {}
if (!d) {
  try {
    const fm = FileManager.local()
    d = JSON.parse(fm.readString(fm.joinPath(fm.documentsDirectory(), 'health_widget.json')))
    stale = true
  } catch (e) {}
}
if (!d) { fail('拉不到数据\n挂 VPN 后在 Scriptable 里点运行') ; }

// ── 派生值 ──
const kcal = d.kcal ?? 0
const left = d.kcal_left
const prot = d.protein ?? 0
const protPct = d.protein_hi ? prot / d.protein_hi : 0
const protOk = d.protein_lo ? prot >= d.protein_lo : false
const kcalPct = Math.min(1, kcal / (d.kcal_goal_hi || 1800))
const fmt = n => (n == null ? '—' : Math.round(n).toLocaleString('en-US'))
const verdictColor = d.verdict === '恢复良好' ? GREEN : (d.verdict === '恢复亏欠' ? RED : AMBER)

// ── 工具 ──
function txt(stack, s, { size = 12, color = INK, bold = false, line = 1 } = {}) {
  const t = stack.addText(String(s))
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size)
  t.textColor = new Color(color)
  t.lineLimit = line
  t.minimumScaleFactor = 0.62
  return t
}
function hrow(w) {
  const r = w.addStack()
  r.layoutHorizontally()
  return r
}
function vcol(parent) {
  const c = parent.addStack()
  c.layoutVertically()
  return c
}
function addImg(stack, image, w, h) {
  if (!image) return
  const i = stack.addImage(image)
  i.imageSize = new Size(w, h)
  return i
}

// DrawContext 真圆角进度条
function drawBar(pct, colorHex, w, h) {
  const ctx = new DrawContext()
  ctx.size = new Size(w, h)
  ctx.opaque = false
  ctx.respectsScreenScale = true
  let p = new Path()
  p.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2)
  ctx.setFillColor(new Color(BAR_BG))
  ctx.addPath(p); ctx.fillPath()
  const fw = Math.max(h, Math.max(0, Math.min(1, pct)) * w)
  if (fw > 0) {
    p = new Path()
    p.addRoundedRect(new Rect(0, 0, fw, h), h / 2, h / 2)
    ctx.setFillColor(new Color(colorHex))
    ctx.addPath(p); ctx.fillPath()
  }
  return ctx.getImage()
}
// 折线（缺口>0 绿 <0 红）
function drawSpark(vals, w, h) {
  const vs = vals.filter(v => v != null)
  if (vs.length < 2) return null
  const ctx = new DrawContext()
  ctx.size = new Size(w, h)
  ctx.opaque = false
  ctx.respectsScreenScale = true
  const lo = Math.min(...vs, 0), hi = Math.max(...vs, 200)
  const X = i => 3 + i * (w - 6) / (vs.length - 1)
  const Y = v => h - 3 - (v - lo) * (h - 6) / (hi - lo || 1)
  ctx.setLineWidth(1)
  ctx.setStrokeColor(new Color(FAINT))
  let p = new Path()
  p.addLine(new Point(0, Y(0)), new Point(w, Y(0)))
  ctx.addPath(p); ctx.strokePath()
  for (let i = 1; i < vs.length; i++) {
    ctx.setLineWidth(2)
    ctx.setStrokeColor(new Color(vs[i] >= 0 ? GREEN : RED))
    p = new Path()
    p.move(new Point(X(i - 1), Y(vs[i - 1])))
    p.addLine(new Point(X(i), Y(vs[i])))
    ctx.addPath(p); ctx.strokePath()
  }
  ctx.setFillColor(new Color(vs[vs.length - 1] >= 0 ? GREEN : RED))
  p = new Path()
  p.addEllipse(new Rect(X(vs.length - 1) - 2.5, Y(vs[vs.length - 1]) - 2.5, 5, 5))
  ctx.addPath(p); ctx.fillPath()
  return ctx.getImage()
}

// ── 组装 ──
const w = new ListWidget()
w.backgroundColor = new Color(PAPER)
w.setPadding(12, 12, 10, 12)
w.url = URL_SITE

// 头部（全尺寸通用）
const head = hrow(w)
txt(head, '健康看板', { size: 12.5, bold: true })
head.addSpacer(5)
txt(head, d.date || '', { size: 10, color: MUTED })
head.addSpacer()
txt(head, (stale ? '⚠ ' : '') + (d.verdict || ''), { size: 10, bold: true, color: verdictColor })
w.addSpacer(7)
addImg(w, drawBar(0, PAPER, WW, 1), WW, 1)   // 分隔线
w.addSpacer(8)

if (fam === 'small') {
  const big = left == null ? '—' : (left >= 0 ? '剩 ' + fmt(left) : '超 ' + fmt(-left))
  txt(w, big + ' kcal', { size: 18, bold: true, color: left != null && left < 0 ? RED : GREEN })
  txt(w, '摄入 ' + fmt(kcal) + ' kcal', { size: 9.5, color: MUTED })
  w.addSpacer(4)
  addImg(w, drawBar(kcalPct, kcalPct > 1 ? RED : GREEN, WW, 7), WW, 7)
  w.addSpacer(6)
  txt(w, '蛋白 ' + Math.round(prot) + 'g' + (protOk ? ' ✓' : ''), { size: 10.5, bold: protOk, color: protOk ? INK : AMBER })
  w.addSpacer(2)
  addImg(w, drawBar(protPct, protOk ? GREEN : AMBER, WW, 7), WW, 7)
  w.addSpacer(6)
  txt(w, '睡 ' + (d.sleep_h ?? '—') + 'h · 昨耗 ' + fmt(d.burn_last), { size: 9, color: MUTED })
} else {
  // ── 双栏：热量 | 蛋白 ──
  const cols = w.addStack()
  cols.layoutHorizontally()
  cols.spacing = 16

  const L = vcol(cols)
  txt(L, '今日摄入 ' + (d.date || ''), { size: 8.5, color: MUTED })
  L.addSpacer(2)
  const lv = hrow(L)
  lv.spacing = 3
  txt(lv, fmt(kcal), { size: 22, bold: true })
  txt(lv, 'kcal', { size: 9.5, color: MUTED })
  L.addSpacer(4)
  addImg(L, drawBar(kcalPct, kcalPct > 1 ? RED : (left >= 0 ? GREEN : AMBER), COLW, 8), COLW, 8)
  L.addSpacer(3)
  txt(L, left == null ? '目标 ≤' + (d.kcal_goal_hi || 1800)
        : (left >= 0 ? '还剩 ' + fmt(left) : '超 ' + fmt(-left)),
      { size: 10, bold: true, color: left >= 0 ? GREEN : RED })

  const Rt = vcol(cols)
  txt(Rt, '今日蛋白 ' + (d.date || ''), { size: 8.5, color: MUTED })
  Rt.addSpacer(2)
  const rv = hrow(Rt)
  rv.spacing = 3
  txt(rv, String(Math.round(prot)), { size: 22, bold: true })
  txt(rv, 'g', { size: 9.5, color: MUTED })
  Rt.addSpacer(4)
  addImg(Rt, drawBar(protPct, protOk ? GREEN : AMBER, COLW, 8), COLW, 8)
  Rt.addSpacer(3)
  txt(Rt, protOk ? '✓ 达标 ' + (d.protein_lo || '—') + '–' + (d.protein_hi || '—') + 'g'
        : '还差 ' + Math.max(0, Math.round((d.protein_lo || 0) - prot)) + 'g',
      { size: 10, bold: true, color: protOk ? GREEN : AMBER })

  // ── 指标行：全部是昨日(数据日)身体指标，标注清楚 ──
  w.addSpacer(10)
  txt(w, '昨日身体 · ' + (d.data_date || '—'), { size: 8, color: FAINT })
  w.addSpacer(3)
  const info = hrow(w)
  const cell = (label, val, valColor) => {
    const c = info.addStack(); c.layoutVertically()
    txt(c, String(val), { size: 12.5, bold: true, color: valColor || INK })
    c.addSpacer(1)
    txt(c, label, { size: 8, color: MUTED })
  }
  cell('睡眠', (d.sleep_h ?? '—') + 'h', (d.sleep_h ?? 9) >= 7 ? GREEN : AMBER)
  info.addSpacer(11)
  cell('静息', d.rhr ?? '—', (d.rhr ?? 99) <= (d.rhr_base ?? 63) ? GREEN : RED)
  info.addSpacer(11)
  cell('HRV', d.hrv ?? '—', (d.hrv ?? 0) >= (d.hrv_base ?? 1) ? GREEN : AMBER)
  info.addSpacer(11)
  cell('消耗', fmt(d.burn_last))
  info.addSpacer(11)
  cell('体重', d.weight != null ? d.weight + 'kg' : '—')
  info.addSpacer()

  if (fam === 'large') {
    // 缺口折线
    w.addSpacer(12)
    const t1 = hrow(w)
    txt(t1, '每日缺口 14 天', { size: 8.5, color: MUTED })
    t1.addSpacer()
    if ((d.week_days || 0) > 0) {
      txt(t1, '本周 ' + fmt(d.week_deficit) + ' kcal · ' + d.week_days + '天', { size: 8.5, bold: true, color: (d.week_deficit || 0) >= 0 ? GREEN : RED })
    } else {
      txt(t1, '自 ' + (d.date || '') + ' 起记录', { size: 8.5, color: MUTED })
    }
    w.addSpacer(3)
    const sp1 = drawSpark(d.deficit14?.values || [], WW, 32)
    if (sp1) addImg(w, sp1, WW, 32)
    else txt(w, '记录积累中 · 每日 10:30 补齐当日缺口', { size: 8, color: FAINT })
    w.addSpacer(10)
    // 底部两行，不再挤一行
    txt(w, (d.steps ? '步数 ' + d.steps.date + ' ' + fmt(d.steps.n) : '步数 —')
        + '　·　' + (d.workout ? d.workout.name + ' ' + d.workout.dur_min + '分' : '无锻炼'),
        { size: 8.5, color: MUTED })
    w.addSpacer(3)
    txt(w, '健康数据 ' + (d.data_date || '—') + ' · 摄入记录 ' + (d.date || '—') + ' 起 · 体重目标 ' + (d.weight_goal || '—') + 'kg · →',
        { size: 8.5, color: FAINT })
  } else {
    w.addSpacer(4)
    txt(w, (d.steps ? '步 ' + fmt(d.steps.n) : '步 —') + ' · '
        + (d.workout ? d.workout.name + ' ' + d.workout.dur_min + '分' : '无锻炼') + ' · →',
        { size: 8.5, color: FAINT, line: 1 })
  }
}

if (!config.runsInWidget) {
  try {
    const nf = new Notification()
    nf.title = '健康看板'
    nf.body = (d.date || '') + ' · ' + (d.verdict || '') + ' · 摄入 ' + fmt(kcal) + ' kcal · 蛋白 ' + Math.round(prot) + 'g'
    nf.schedule()
  } catch (e) {}
}
Script.setWidget(w)
Script.complete()

function fail(msg) {
  const fw = new ListWidget()
  fw.backgroundColor = new Color(PAPER)
  const t = fw.addText(msg)
  t.textColor = new Color(RED); t.font = Font.systemFont(11)
  Script.setWidget(fw)
  Script.complete()
  throw new Error('done')
}
