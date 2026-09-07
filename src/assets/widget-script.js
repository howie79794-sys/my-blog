// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: heartbeat;
//
// 健康看板小组件 v3 — Howie（纸感配色 · 自适应宽度版）
// 数据源: https://my-blog-howie79.vercel.app/assets/widget.json
// 布局规则：所有元素宽度由 WW 常量统一推导，不写死超界像素

const URL_DATA = 'https://my-blog-howie79.vercel.app/assets/widget.json'
const URL_SITE = 'https://my-blog-howie79.vercel.app/health/'

const PAPER = '#F6F4ED', INK = '#1C1C1A', MUTED = '#6F6D63', FAINT = '#8A887E',
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
const kcal = d.kcal
const left = d.kcal_left
const prot = d.protein
const protPct = (prot == null || !d.protein_hi) ? 0 : prot / d.protein_hi
const protOk = d.protein_lo ? prot >= d.protein_lo : false
const kcalPct = kcal == null ? 0 : Math.min(1, kcal / (d.kcal_goal_hi || 1800))
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


// 7 日缺口柱状图（正=缺口绿向上，负=超支红向下，零轴偏下）
function drawBars(vals, w, h) {
  const vs = vals.slice(-7).map(v => v == null ? 0 : v)
  const lbls = (d.deficit14?.labels || []).slice(-7)
  if (vs.every(v => v === 0)) return { img: null, lbls }
  const ctx = new DrawContext()
  ctx.size = new Size(w, h)
  ctx.opaque = false
  ctx.respectsScreenScale = true
  const maxAbs = Math.max(...vs.map(v => Math.abs(v)), 100)
  const gap = 3, bw = (w - gap * 6) / 7
  const axis = h * 0.72          // 零轴位置
  const up = h * 0.66, down = h * 0.26
  // 零轴
  ctx.setLineWidth(1)
  ctx.setStrokeColor(new Color(FAINT))
  let p = new Path()
  p.addLine(new Point(0, axis), new Point(w, axis))
  ctx.addPath(p); ctx.strokePath()
  for (let i = 0; i < 7; i++) {
    const v = vs[i]
    if (!v) continue
    const bh = Math.max(2, Math.abs(v) / maxAbs * (v > 0 ? up : down))
    const x = i * (bw + gap)
    const y = v > 0 ? axis - bh : axis
    let rp = new Path()
    rp.addRoundedRect(new Rect(x, y, bw, bh), 1.5, 1.5)
    ctx.setFillColor(new Color(v > 0 ? GREEN : RED))
    ctx.addPath(rp); ctx.fillPath()
  }
  return { img: ctx.getImage(), lbls }
}

// ── 组装 ──
const w = new ListWidget()
w.backgroundColor = new Color(PAPER)
w.setPadding(12, 12, 10, 12)
w.url = URL_SITE

// 头部（全尺寸通用）
const head = hrow(w)
txt(head, '健康看板', { size: 13.5, bold: true })
head.addSpacer(5)
txt(head, '昨日 ' + (d.data_date || ''), { size: 11, color: MUTED })
head.addSpacer()
txt(head, (stale ? '⚠ ' : '') + (d.verdict || ''), { size: 11, bold: true, color: verdictColor })
w.addSpacer(7)
addImg(w, drawBar(0, PAPER, WW, 1), WW, 1)   // 分隔线
w.addSpacer(8)

if (fam === 'small') {
  const big = left == null ? '—' : (left >= 0 ? '剩 ' + fmt(left) : '超 ' + fmt(-left))
  txt(w, big + ' kcal', { size: 20, bold: true, color: left != null && left < 0 ? RED : GREEN })
  txt(w, '摄入 ' + fmt(kcal) + ' kcal', { size: 10.5, color: MUTED })
  w.addSpacer(4)
  addImg(w, drawBar(kcalPct, kcalPct > 1 ? RED : GREEN, WW, 7), WW, 7)
  w.addSpacer(6)
  txt(w, '蛋白 ' + Math.round(prot) + 'g' + (protOk ? ' ✓' : ''), { size: 11.5, bold: protOk, color: protOk ? INK : AMBER })
  w.addSpacer(2)
  addImg(w, drawBar(protPct, protOk ? GREEN : AMBER, WW, 7), WW, 7)
  w.addSpacer(6)
  txt(w, '睡 ' + (d.sleep_h ?? '—') + 'h · 昨耗 ' + fmt(d.burn_last), { size: 10, color: MUTED })
} else {
  // ── 双栏：热量 | 蛋白 ──
  const cols = w.addStack()
  cols.layoutHorizontally()
  cols.spacing = 16

  const L = vcol(cols)
  txt(L, '摄入 ' + (d.data_date || ''), { size: 10.5, color: MUTED })
  L.addSpacer(2)
  const lv = hrow(L)
  lv.spacing = 3
  txt(lv, kcal == null ? '—' : fmt(kcal), { size: 24, bold: true, color: kcal == null ? MUTED : INK })
  txt(lv, kcal == null ? '' : 'kcal', { size: 10.5, color: MUTED })
  L.addSpacer(4)
  addImg(L, drawBar(kcalPct, kcalPct > 1 ? RED : (left >= 0 ? GREEN : AMBER), COLW, 8), COLW, 8)
  L.addSpacer(3)
  txt(L, kcal == null ? '未记录'
        : (left >= 0 ? '剩余 ' + fmt(left) : '超 ' + fmt(-left)),
      { size: 11, bold: true, color: kcal == null ? MUTED : left >= 0 ? GREEN : RED })

  const Rt = vcol(cols)
  txt(Rt, '蛋白 ' + (d.data_date || ''), { size: 10.5, color: MUTED })
  Rt.addSpacer(2)
  const rv = hrow(Rt)
  rv.spacing = 3
  txt(rv, prot == null ? '—' : String(Math.round(prot)), { size: 24, bold: true, color: prot == null ? MUTED : INK })
  txt(rv, prot == null ? '' : 'g', { size: 10.5, color: MUTED })
  Rt.addSpacer(4)
  addImg(Rt, drawBar(protPct, protOk ? GREEN : AMBER, COLW, 8), COLW, 8)
  Rt.addSpacer(3)
  txt(Rt, prot == null ? '未记录'
        : (protOk ? '✓ 达标' : '差 ' + Math.max(0, Math.round((d.protein_lo || 0) - prot)) + 'g'),
      { size: 11, bold: true, color: prot == null ? MUTED : protOk ? GREEN : AMBER })

  // ── 指标行：全部是昨日(数据日)身体指标，标注清楚 ──
  w.addSpacer(10)
  txt(w, '身体指标 · ' + (d.data_date || '—'), { size: 9, color: MUTED })
  w.addSpacer(3)
  const info = hrow(w)
  const cell = (label, val, valColor) => {
    const c = info.addStack(); c.layoutVertically()
    txt(c, String(val), { size: 13.5, bold: true, color: valColor || INK })
    c.addSpacer(1)
    txt(c, label, { size: 9, color: MUTED })
  }
  cell('睡眠', (d.sleep_h ?? '—') + 'h', (d.sleep_h ?? 9) >= 7 ? GREEN : AMBER)
  info.addSpacer(10)
  cell('静息', d.rhr ?? '—', (d.rhr ?? 99) <= (d.rhr_base ?? 63) ? GREEN : RED)
  info.addSpacer(10)
  cell('HRV', d.hrv ?? '—', (d.hrv ?? 0) >= (d.hrv_base ?? 1) ? GREEN : AMBER)
  info.addSpacer(10)
  cell('消耗', fmt(d.burn_last))
  info.addSpacer(10)
  cell('体重', d.weight != null ? d.weight + 'kg' : '—')
  info.addSpacer()

  if (fam === 'large') {
    // ── 7 日缺口柱状图 ──
    w.addSpacer(12)
    const t1 = hrow(w)
    txt(t1, '近 7 日缺口', { size: 10.5, color: MUTED })
    t1.addSpacer()
    if (d.deficit != null) {
      txt(t1, '昨日 ' + (d.deficit >= 0 ? '+' : '') + fmt(d.deficit), { size: 9.5, bold: true, color: d.deficit >= 0 ? GREEN : RED })
    } else if ((d.week_days || 0) > 0) {
      txt(t1, '本周 ' + fmt(d.week_deficit) + ' · ' + d.week_days + '天', { size: 9.5, bold: true, color: (d.week_deficit || 0) >= 0 ? GREEN : RED })
    } else {
      txt(t1, '记录中', { size: 10.5, color: MUTED })
    }
    w.addSpacer(3)
    const bars = drawBars(d.deficit14?.values || [], WW, 44)
    if (bars.img) {
      addImg(w, bars.img, WW, 44)
      w.addSpacer(1)
      const bl = hrow(w)
      bl.spacing = 3
      const bw2 = Math.floor((WW - 3 * 6) / 7)
      bars.lbls.forEach(l => { txt(bl, l, { size: 8, color: MUTED }); bl.addSpacer(5) })
    } else {
      txt(w, '记录积累中 · 明日起每日 10:30 长出一根柱', { size: 9, color: MUTED })
    }

    // ── 减脂进度条 ──
    w.addSpacer(6); w.addSpacer()
    const wt = hrow(w)
    txt(wt, '减脂进度 ' + (d.weight_start || 73) + ' → ' + (d.weight_goal || 67) + 'kg', { size: 10.5, color: MUTED })
    wt.addSpacer()
    const prog = d.weight != null && d.weight_start ? Math.max(0, Math.min(1, (d.weight_start - d.weight) / (d.weight_start - (d.weight_goal || 67)))) : 0
    txt(wt, d.weight != null ? (d.weight_start - d.weight).toFixed(1) + 'kg · ' + Math.round(prog * 100) + '%' : '待首次称重', { size: 9.5, bold: true, color: d.weight != null ? GREEN : MUTED })
    w.addSpacer(3)
    addImg(w, drawBar(prog, GREEN, WW, 8), WW, 8)
    w.addSpacer(2)
    txt(w, (d.weight != null ? '当前 ' + d.weight + 'kg (' + (d.weight_date || '') + ')' : '每周日晨称重入健康 App · 周一 10:30 上板') + ' · 日目标缺口 ' + (d.target_daily || 400) + ' kcal', { size: 8.5, color: MUTED })

    // ── 底部 ──
    w.addSpacer(6); w.addSpacer()
    txt(w, '步 ' + (d.steps ? d.steps.date + ' ' + fmt(d.steps.n) : '—') + ' · ' + (d.workout ? d.workout.name + ' ' + d.workout.dur_min + '分' : '无锻炼') + ' · 全部指标为 ' + (d.data_date || '—') + ' · →', { size: 9, color: MUTED })
  } else {
    w.addSpacer()
    txt(w, (d.steps ? '步 ' + fmt(d.steps.n) : '步 —') + ' · '
        + (d.workout ? d.workout.name + ' ' + d.workout.dur_min + '分' : '无锻炼') + ' · →',
        { size: 9.5, color: MUTED, line: 1 })
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
