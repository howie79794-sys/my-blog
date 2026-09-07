// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: heartbeat;
//
// 健康看板小组件 v2 — Howie（纸感奶油配色）
// 数据源: https://my-blog-howie79.vercel.app/assets/widget.json
// 拉取失败时显示上次缓存（日期旁 ⚠）；点卡片打开完整看板

const URL_DATA = 'https://my-blog-howie79.vercel.app/assets/widget.json'
const URL_SITE = 'https://my-blog-howie79.vercel.app/health/'

// 纸感配色（配博客 paper 主题）
const PAPER = '#F6F4ED', INK = '#1C1C1A', MUTED = '#8F8E88', FAINT = '#B8B5A9',
      LINE = '#E2DFD2', BAR_BG = '#E6E3D6',
      GREEN = '#2B8A3E', RED = '#D9480F', AMBER = '#E8590C'

const fam = config.widgetFamily

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

// ── 文本工具 ──
function txt(stack, s, { size = 12, color = INK, bold = false, alpha = 1 } = {}) {
  const t = stack.addText(String(s))
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size)
  t.textColor = new Color(color, alpha)
  t.minimumScaleFactor = 0.7
  return t
}
function hrow(w, spaceAfter = 0) {
  const r = w.addStack()
  r.layoutHorizontally()
  if (spaceAfter) r.addSpacer(spaceAfter)
  return r
}

// ── 画图工具（DrawContext：真圆角进度条 + 折线图）──
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
  // 零轴
  ctx.setLineWidth(1)
  ctx.setStrokeColor(new Color(FAINT))
  let p = new Path()
  p.addLine(new Point(0, Y(0)), new Point(w, Y(0)))
  ctx.addPath(p); ctx.strokePath()
  // 折线（缺口>0 绿，<0 红，分段画）
  for (let i = 1; i < vs.length; i++) {
    ctx.setLineWidth(2)
    ctx.setStrokeColor(new Color(vs[i] >= 0 ? GREEN : RED))
    p = new Path()
    p.move(new Point(X(i - 1), Y(vs[i - 1])))
    p.addLine(new Point(X(i), Y(vs[i])))
    ctx.addPath(p); ctx.strokePath()
  }
  // 末点
  ctx.setFillColor(new Color(vs[vs.length - 1] >= 0 ? GREEN : RED))
  p = new Path()
  p.addEllipse(new Rect(X(vs.length - 1) - 2.5, Y(vs[vs.length - 1]) - 2.5, 5, 5))
  ctx.addPath(p); ctx.fillPath()
  return ctx.getImage()
}
function img(stack, image, w, h, right) {
  if (!image) return
  if (right) stack.addSpacer()
  const i = stack.addImage(image)
  i.imageSize = new Size(w, h)
}

// ── 组装 ──
const w = new ListWidget()
w.backgroundColor = new Color(PAPER)
w.setPadding(14, 16, 12, 16)
w.url = URL_SITE

// 头部
const head = hrow(w)
txt(head, '健康看板', { size: 13, bold: true })
head.addSpacer(5)
txt(head, d.date || '', { size: 10.5, color: MUTED })
head.addSpacer()
txt(head, (stale ? '⚠ ' : '') + (d.verdict || ''), { size: 10.5, bold: true, color: verdictColor })

// 分隔线
img(w, drawBar(0, PAPER, 340, 1), 340, 1)
w.addSpacer(8)

if (fam === 'small') {
  const big = left == null ? '—' : (left >= 0 ? '剩 ' + fmt(left) : '超 ' + fmt(-left))
  txt(w, big + ' kcal', { size: 19, bold: true, color: left != null && left < 0 ? RED : GREEN })
  txt(w, '摄入 ' + fmt(kcal) + ' kcal', { size: 10, color: MUTED })
  w.addSpacer(4)
  w.addImage(drawBar(kcalPct, kcalPct > 1 ? RED : GREEN, 150, 7)).imageSize = new Size(150, 7)
  w.addSpacer(7)
  txt(w, '蛋白 ' + Math.round(prot) + 'g' + (protOk ? ' ✓' : ''), { size: 11, bold: protOk, color: protOk ? INK : AMBER })
  w.addImage(drawBar(protPct, protOk ? GREEN : AMBER, 150, 7)).imageSize = new Size(150, 7)
  w.addSpacer(7)
  txt(w, '睡 ' + (d.sleep_h ?? '—') + 'h · 昨耗 ' + fmt(d.burn_last), { size: 9, color: MUTED })
} else {
  // 中/大号：双栏大数字
  const cols = w.addStack()
  cols.layoutHorizontally()
  cols.spacing = 14

  // 左栏 热量
  const L = cols.addStack(); L.layoutVertically()
  const lr = hrow(L)
  txt(lr, '热量 INTAKE', { size: 9, color: MUTED })
  L.addSpacer(2)
  const lv = hrow(L, 3)
  txt(lv, fmt(kcal), { size: 24, bold: true })
  txt(lv, ' kcal', { size: 10, color: MUTED })
  L.addSpacer(4)
  const lb = hrow(L)
  lb.addImage(drawBar(kcalPct, kcalPct > 1 ? RED : (left >= 0 ? GREEN : AMBER), 158, 8)).imageSize = new Size(158, 8)
  L.addSpacer(3)
  txt(L, left == null ? '目标 ' + (d.kcal_goal_hi || 1800) : (left >= 0 ? '还剩 ' + fmt(left) : '超 ' + fmt(-left)),
      { size: 10.5, bold: true, color: left >= 0 ? GREEN : RED })

  cols.addSpacer()

  // 右栏 蛋白
  const Rt = cols.addStack(); Rt.layoutVertically()
  const rr = hrow(Rt)
  txt(rr, '蛋白 PROTEIN', { size: 9, color: MUTED })
  Rt.addSpacer(2)
  const rv = hrow(Rt, 3)
  txt(rv, Math.round(prot) + '', { size: 24, bold: true })
  txt(rv, ' g', { size: 10, color: MUTED })
  Rt.addSpacer(4)
  Rt.addImage(drawBar(protPct, protOk ? GREEN : AMBER, 158, 8)).imageSize = new Size(158, 8)
  Rt.addSpacer(3)
  txt(Rt, protOk ? '✓ 达标 (' + (d.protein_lo || '—') + '–' + (d.protein_hi || '—') + 'g)'
        : '还差 ' + Math.max(0, Math.round((d.protein_lo || 0) - prot)) + 'g',
      { size: 10.5, bold: true, color: protOk ? GREEN : AMBER })

  // 信息行
  w.addSpacer(12)
  const info = hrow(w)
  const cell = (label, val, valColor) => {
    const c = info.addStack(); c.layoutVertically()
    txt(c, val, { size: 13, bold: true, color: valColor || INK })
    c.addSpacer(1)
    txt(c, label, { size: 8.5, color: MUTED })
  }
  cell('昨夜睡眠', (d.sleep_h ?? '—') + 'h', (d.sleep_h ?? 9) >= 7 ? GREEN : AMBER)
  info.addSpacer(16)
  cell('静息心率 ' + (d.rhr_base ?? ''), d.rhr ?? '—', (d.rhr ?? 99) <= (d.rhr_base ?? 63) ? GREEN : RED)
  info.addSpacer(16)
  cell('HRV ' + (d.hrv_base ?? ''), d.hrv ?? '—', (d.hrv ?? 0) >= (d.hrv_base ?? 1) ? GREEN : AMBER)
  info.addSpacer(16)
  cell('昨日消耗', fmt(d.burn_last))
  info.addSpacer(16)
  cell('体重(' + (d.weight_date || '周日') + ')', d.weight != null ? d.weight + 'kg' : '—')

  if (fam === 'large') {
    // 缺口趋势 14 天
    w.addSpacer(14)
    const t1 = hrow(w)
    txt(t1, '每日缺口 14 天', { size: 9, color: MUTED })
    t1.addSpacer()
    txt(t1, '本周 ' + fmt(d.week_deficit) + ' kcal', { size: 9, bold: true, color: (d.week_deficit || 0) >= 0 ? GREEN : RED })
    w.addSpacer(3)
    const sp = drawSpark(d.deficit14?.values || [], 340, 34)
    if (sp) w.addImage(sp).imageSize = new Size(340, 34)
    w.addSpacer(10)
    // 底部杂项
    const f2 = hrow(w)
    txt(f2, (d.steps ? '步数 ' + d.steps.date + ' ' + fmt(d.steps.n) : '步数 —') + '　·　'
        + (d.workout ? '锻炼 ' + d.workout.name + ' ' + d.workout.dur_min + '分(' + d.workout.zone + ')' : '锻炼 —')
        + '　·　体重目标 ' + (d.weight_goal || '—') + 'kg', { size: 9, color: MUTED })
    w.addSpacer(6)
    txt(w, '健康数据日 ' + (d.data_date || '—') + ' · 每日 10:30 更新 · 点开完整看板 →', { size: 8.5, color: FAINT })
  } else {
    w.addSpacer(4)
    txt(w, (d.steps ? '步 ' + fmt(d.steps.n) : '步 —') + ' · '
        + (d.workout ? d.workout.name + ' ' + d.workout.dur_min + '分' : '无锻炼记录') + ' · 点开看板 →',
        { size: 8.5, color: FAINT })
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
