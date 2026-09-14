const fm = FileManager.local()
const CACHE = fm.joinPath(fm.documentsDirectory(), 'aihot-data.json')
const URL_SITE = 'https://aihot.news/all'
const INK = '#1C1C1A', MUTED = '#6F6D63', FAINT = '#9A988E',
      LINE = '#E4E1D4', PAPER = '#F6F4ED', CYAN = '#0E7490'

let data = null

// ── widget 模式：先试拉最新数据（4s 超时，失败静默回退缓存）──
if (config.runsInWidget) {
  try {
    async function fetchJSON(url) {
      const r = new Request(url)
      r.timeoutInterval = 4
      r.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData
      return await r.loadJSON()
    }
    const fresh = await fetchJSON('https://aihot.news/api/v1/items?mode=all&window=24h&limit=40')
    const items = (fresh && fresh.items) || []
    const norm = items.filter(i => (i.title || '').trim()).map(i => ({
      title: i.title.slice(0, 80),
      sum: (i.summary || '').slice(0, 120),
      url: (i.links && (i.links.aihot || i.links.original)) || 'https://aihot.news/all',
      score: i.score || 0,
      sel: !!i.selected,
      agg: false,
    }))
    if (norm.length) {
      const pool = norm.sort((a, b) => (a.sel === b.sel ? b.score - a.score : (a.sel ? -1 : 1)))
      const pages = []
      for (let i = 0; i < Math.min(pool.length, 18); i += 6) pages.push(pool.slice(i, i + 6))
      const now = new Date()
      data = {
        source: '全部动态 24h · 精选浮头',
        updated: (now.getMonth() + 1) + '-' + now.getDate() + ' ' +
          (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' +
          (now.getMinutes() < 10 ? '0' : '') + now.getMinutes(),
        pages: pages,
      }
      try { fm.writeString(CACHE, JSON.stringify(data)) } catch (e) {}
    }
  } catch (e) {}
}

if (!data) { try { data = JSON.parse(fm.readString(CACHE)) } catch (e) {} }

;(async () => {
// ── App 内运行：拉数据写缓存 ──
if (!config.runsInWidget) {
  const API = 'https://aihot.news/api/v1/items?mode=all&window=24h&limit=40'
  let msg = ''
  try {
    async function fetchJSON(url) {
      const r = new Request(url)
      r.timeoutInterval = 20
      return await r.loadJSON()
    }
    // 复用 v6 的 buildData：直接内联精简版
    const [all, sel] = await Promise.all([
      fetchJSON(API),
      fetchJSON(API.replace('mode=all', 'mode=selected').replace('limit=40', 'limit=10')).catch(() => null),
    ])
    const items = (all && all.items) || []
    const selIds = new Set(((sel && sel.items) || []).map(i => i.id))
    const norm = items.filter(i => (i.title || '').trim()).map(i => ({
      title: i.title.slice(0, 80),
      sum: (i.summary || '').slice(0, 120),
      url: (i.links && (i.links.aihot || i.links.original)) || 'https://aihot.news/all',
      score: i.score || 0,
      sel: !!i.selected || selIds.has(i.id),
      agg: false,
    }))
    const pool = norm.sort((a, b) => (a.sel === b.sel ? b.score - a.score : (a.sel ? -1 : 1)))
    const pages = []
    for (let i = 0; i < Math.min(pool.length, 18); i += 6) pages.push(pool.slice(i, i + 6))
    const now = new Date()
    const doc = {
      source: '全部动态 24h · 精选浮头',
      updated: (now.getMonth() + 1) + '-' + now.getDate() + ' ' +
        (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' +
        (now.getMinutes() < 10 ? '0' : '') + now.getMinutes(),
      pages: pages,
    }
    FileManager.local().writeString(CACHE, JSON.stringify(doc))
    msg = '成功 ' + pages.length + ' 屏'
  } catch (e) {
    msg = '失败: ' + (e.message || String(e)).slice(0, 80)
  }
  const n = new Notification()
  n.title = 'AIHOT 更新'
  n.body = msg
  n.schedule(new Date(Date.now() + 500))
  Script.complete()
  return
}

const w = new ListWidget()
w.backgroundColor = new Color(PAPER)

if (!data || !data.pages || !data.pages.length) {
  const t0 = w.addText('AIHOT 缓存为空\n打开 App 点 ▶️ 先拉一次数据')
  t0.font = Font.systemFont(11)
  t0.textColor = new Color(MUTED)
  w.url = URL_SITE
  if (config.runsInWidget) { Script.setWidget(w); Script.complete() } else { await w.present(); Script.complete() }
} else {
  const head = w.addStack()
  head.layoutHorizontally()
  const badge = head.addText('⚡ AIHOT')
  badge.font = Font.mediumSystemFont(13)
  badge.textColor = new Color(CYAN)
  head.addSpacer(6)
  const upd = head.addText((data.updated || '') + ' · ' + (data.pages.length) + '屏')
  upd.font = Font.systemFont(9)
  upd.textColor = new Color(FAINT)

  // 按分钟轮换屏：每 2 分钟换一屏（系统约 15 分钟刷一次，每次都换）
  const totalScreens = data.pages.length
  const idx = Math.floor(Date.now() / 120000) % Math.max(1, totalScreens)
  const items = data.pages[idx] || []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    w.addSpacer(6)
    const row = w.addStack()
    row.layoutHorizontally()
    row.spacing = 5
    const mark = row.addText(it.sel ? '★' : '·')
    mark.font = Font.systemFont(11)
    mark.textColor = new Color(it.sel ? CYAN : FAINT)
    const col = row.addStack()
    col.layoutVertically()
    const title = col.addText(it.title)
    title.font = i === 0 ? Font.semiboldSystemFont(13) : Font.mediumSystemFont(12)
    title.textColor = new Color(INK)
    title.lineLimit = 2
    if (it.sum) {
      const s = col.addText(it.sum)
      s.font = Font.systemFont(10)
      s.textColor = new Color(MUTED)
      s.lineLimit = 1
    }
  }
  w.addSpacer()
  const foot = w.addText('屏 ' + (idx + 1) + '/' + totalScreens + ' · 自动轮换')
  foot.font = Font.systemFont(9)
  foot.textColor = new Color(FAINT)
  w.url = (items[0] && items[0].url) || URL_SITE
  if (config.runsInWidget) { Script.setWidget(w); Script.complete() } else { await w.present(); Script.complete() }
}

})()
