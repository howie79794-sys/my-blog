
/* ================= v0.6 shell: dynamic render layer ================= */
(function(){
  'use strict';
  var REMOTE_URL = location.protocol === 'https:' ? '/assets/gazette-news.json'
                 : 'https://my-blog-howie79.vercel.app/assets/gazette-news.json';
  var CACHE_KEY = 'gazette.data.v2';
  var LS_MAX = 4.5 * 1024 * 1024;

  var SEC_META = {
    ai:      {zh:'人工智能', en:'ARTIFICIAL INTELLIGENCE'},
    tech:    {zh:'技术与设备', en:'TECHNOLOGY & DEVICES'},
    music:   {zh:'音乐', en:'MUSIC'},
    football:{zh:'足球', en:'FOOTBALL'},
    fashion: {zh:'潮流', en:'STYLE & CULTURE'},
    finance: {zh:'金融', en:'FINANCE'},
    society: {zh:'社会', en:'SOCIETY'}
  };
  var SEC_ORDER = ['ai','fashion','music','football','tech','finance','society'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function p2(n){return (n<10?'0':'')+n;}
  function fmtDT(iso){ if(!iso) return ''; var d=new Date(iso); if(isNaN(d)) return '';
    return (d.getMonth()+1)+'/'+d.getDate()+' '+p2(d.getHours())+':'+p2(d.getMinutes()); }
  function fmtD(iso){ if(!iso) return ''; var d=new Date(iso); if(isNaN(d)) return '';
    return (d.getMonth()+1)+'/'+p2(d.getDate()); }
  /* v1.2: source field may be {name:...} or string; links.original/aihot preferred */
  function srcName(s){ if(!s) return ''; if(typeof s==='object') return s.name||''; return String(s); }
  function itemUrl(it){ if(!it) return '#';
    if(it.links){ if(it.links.original) return it.links.original; if(it.links.aihot) return it.links.aihot; }
    return it.url || (it.attribution && it.attribution.url) || '#'; }

  /* ============ P1-1: unified source metadata ============
     AIHOT source names arrive in several shapes.  Parse them into
     structured fields so every module prints the same three languages:
       "X：番茄 (@shao_meng)"   → 平台：X · 作者：番茄 (@shao_meng)
       "公众号：火山引擎"        → 公众号：火山引擎
       "IT之家·人工智能"        → 来源：IT之家
       "Hacker News：AI 热帖"   → 来源：Hacker News
     Returns {kind:'platform'|'wechat'|'source', platform, name, handle}. */
  function parseSource(raw){
    var s = srcName(raw);
    var out = {kind:'source', platform:'', name:'', handle:''};
    if(!s) return out;
    var m = s.match(/^公众号[：:]\s*(.+)$/);
    if(m){ out.kind='wechat'; out.platform='公众号'; out.name = m[1].trim(); return out; }
    m = s.match(/^[Xx][：:]\s*(.+)$/);
    if(m){
      out.kind='platform'; out.platform='X';
      var rest = m[1].trim();
      var h = rest.match(/[（(]\s*(@[^）)]+?)[）)]\s*$/);
      if(h){ out.name = rest.slice(0,h.index).trim(); out.handle = h[1]; }
      else out.name = rest;
      return out;
    }
    /* official media / blog / RSS — strip the trailing note and the
       section suffix, keep the outlet name */
    var name = s.replace(/[（(][^）)]*[）)]\s*$/,'').trim();
    var dot = name.split('·')[0].trim();  if(dot) name = dot;
    var col = name.split(/[：:]/)[0].trim(); if(col) name = col;
    var blog = name.replace(/博客$/,'').trim(); if(blog) name = blog;
    out.kind='source'; out.name = name;
    return out;
  }
  /* one meta line for every module — pure text, fields joined by · */
  function metaInner(raw){
    var p = parseSource(raw);
    if(p.kind === 'platform'){
      var who = p.name + (p.handle ? ' ('+p.handle+')' : '');
      return '<b>平台：</b>'+esc(p.platform)+'<span class="sep"> · </span><b>作者：</b>'+esc(who);
    }
    if(p.kind === 'wechat') return '<b>公众号：</b>'+esc(p.name);
    return '<b>来源：</b>'+esc(p.name);
  }

  /* ============ data cache (localStorage primary, IndexedDB mirror) ============ */
  function lsGet(){ try{ var s=localStorage.getItem(CACHE_KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
  /* MWG 优化 #1 (2026-11-12): fetch 超时保护 —— AbortController 8s 兜底。
     网络抖动时不再让新标签页干等，立即走缓存/seed 降级路径。 */
  function fetchT(url, opts, ms){
    ms = ms || 8000;
    if(typeof AbortController === 'undefined') return fetch(url, opts);
    var ctl = new AbortController();
    var timer = setTimeout(function(){ ctl.abort(); }, ms);
    opts = opts || {};
    opts.signal = ctl.signal;
    return fetch(url, opts).finally(function(){ clearTimeout(timer); });
  }
  function lsSet(d){ try{ var s=JSON.stringify(d); if(s.length<=LS_MAX) localStorage.setItem(CACHE_KEY,s); }catch(e){} }
  function idbOpen(){ return new Promise(function(res){ 
    if(!window.indexedDB) return res(null);
    try{ var rq=indexedDB.open('gazette',1);
      rq.onupgradeneeded=function(){ try{ rq.result.createObjectStore('kv'); }catch(e){} };
      rq.onsuccess=function(){ res(rq.result); }; rq.onerror=function(){ res(null); };
    }catch(e){ res(null); } });
  }
  /* MWG 优化 #3: async/await 改写（skill 军规 #5） */
  function idbGetRaw(db){ return new Promise(function(res){
    if(!db) return res(null);
    try{ var tx=db.transaction('kv','readonly').objectStore('kv').get('data');
      tx.onsuccess=function(){ res(tx.result||null); }; tx.onerror=function(){ res(null); };
    }catch(e){ res(null); } }); }
  async function idbGet(){ return idbGetRaw(await idbOpen()); }
  async function idbSet(d){ var db = await idbOpen(); if(!db) return;
    try{ db.transaction('kv','readwrite').objectStore('kv').put(d,'data'); }catch(e){} }

  /* ============ P1 已读记忆（v2.0.15）：localStorage gazette.read.v1 ============
     点开原文 = 已读；卡片降墨不重排；徽章显示未读数；窗口滚动自动清理。 */
  var READ_KEY = 'gazette.read.v1';
  var LASTVISIT_KEY = 'gazette.lastvisit.v1';
  function readGet(){
    try{ var o = JSON.parse(localStorage.getItem(READ_KEY)) || {}; return (o.ids && o.ids instanceof Array) ? o : {ids:[]}; }
    catch(e){ return {ids:[]}; }
  }
  function readSet(ids){ try{ localStorage.setItem(READ_KEY, JSON.stringify({ids:ids.slice(-5000), ts:Date.now()})); }catch(e){} }
  function readHas(id){ var o=readGet(); return o.ids.indexOf(id)>=0; }
  function readAdd(id){ var o=readGet(); if(o.ids.indexOf(id)<0){ o.ids.push(id); readSet(o.ids); } }
  function readDel(id){ var o=readGet(); o.ids = o.ids.filter(function(x){return x!==id;}); readSet(o.ids); }
  /* 条目稳定键：URL 优先（fin/fashion 都有 url；aihot 走 links.original→url→id） */
  function readKey(it){
    var u = itemUrl(it);
    if(u && u !== '#') return u;
    return (it.id || it.title || '').toString();
  }
  /* 启动时裁剪：不在当前数据里的已读 ID 清掉（跟 5 天窗口滚动） */
  function readPrune(DATA){
    var live = {};
    var collect = function(list){ (list||[]).forEach(function(x){ var k=readKey(x); if(k) live[k]=1; }); };
    if(DATA.aihot){ collect(DATA.aihot.feed); collect(DATA.aihot.selected); }
    if(DATA.finnews) collect(DATA.finnews.items);
    if(DATA.fashion) collect(DATA.fashion.items);
    var o = readGet();
    var keep = o.ids.filter(function(id){ return live[id]; });
    if(keep.length !== o.ids.length) readSet(keep);
  }
  function lastVisitGet(){ try{ return parseInt(localStorage.getItem(LASTVISIT_KEY))||0; }catch(e){ return 0; } }
  function lastVisitSet(){ try{ localStorage.setItem(LASTVISIT_KEY, String(Date.now())); }catch(e){} }

  /* ============ render(DATA) ============ */
  var __rendered = false;
  function render(DATA){
    /* v2.0.12 P2: 遗留 items 板块已从数据源剔除——guard 改为检查任一内容板块有货 */
    var hasContent = DATA && (
      (DATA.aihot && ((DATA.aihot.feed&&DATA.aihot.feed.length)||(DATA.aihot.selected&&DATA.aihot.selected.length)||(DATA.aihot.hot&&DATA.aihot.hot.length)))
      || (DATA.finnews && DATA.finnews.items && DATA.finnews.items.length)
      || (DATA.fashion && DATA.fashion.items && DATA.fashion.items.length)
    );
    if(!hasContent) return;
    /* v1.6: fetch 到的新数据同步回 window.DATA，保证子菜单切换等交互读到最新 */
    window.DATA = DATA;
    var items = DATA.items || [], AI = DATA.aihot || {};  /* v2.0.12: items 已剔除，空数组兜底 */
    /* v1.1 dateblock fill
       P0-4: the date block is exactly three designed lines —
         ① 公历 + 星期（黑，600） ② 农历（砖红） ③ 中文大写（浅灰）
       The old version mixed 公历+星期 / 农历 / 中文大写 with near-identical
       font sizes, so it read as debug output. */
  try {
    var db = DATA.dateblock;
    if (db) {
      var g = document.querySelector('.m-dateblock .db-g');
      var l = document.querySelector('.m-dateblock .db-l');
      var c = document.querySelector('.m-dateblock .db-c');
      if (g) g.innerHTML = esc(db.gregorian) + '<span class="wk">' + esc(db.weekday||'') + '</span>';
      if (l) {
        var rawL = db.lunar || '';
        var zod = /(鼠|牛|虎|兔|龙|蛇|马|羊|猴|鸡|狗|猪)年/.exec(rawL);
        var core = rawL.replace(/\s*\([^)]*\)/, '').replace(/^[二〇零一二三四五六七八九]+年\s*/, '');
        l.textContent = '农历' + core.replace(/\s+/, ' · ') + (zod ? ' · ' + zod[1] + '年' : '');
      }
      if (c) c.textContent = db.chinese;
      var mdate = document.querySelector('.m-date span');
      /* P0-4: the issue bar carries a natural-date issue number only.
         The weekday / lunar date already live in the top-left date block —
         printing them in both places made the corner read like debug output. */
      if (mdate && db.gregorian){
        /* v2.0.13 P0 fix: 期号恒定 8 位补零。gregorian 形如 "2026 年 11 月 6 日"，
           直接去非数字会得到 2026116（7位）；按 年/月/日 拆开逐段补零再拼。 */
        var mg = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(String(db.gregorian));
        var digits = mg ? (mg[1] + ('0'+mg[2]).slice(-2) + ('0'+mg[3]).slice(-2)) : String(db.gregorian).replace(/\D/g,'');
        mdate.textContent = db.gregorian.replace(/ /g,'') + ' · NO.' + digits;
      }
    }
  } catch (e) {}

var main = document.getElementById('main');
/* idempotent: remove previous dynamic sections before re-render.
   NOTE: .src-empty is owned by gazette-misc.js — never remove it here;
   just make sure it is hidden while real content exists (bug C ghost empty-state). */
main.querySelectorAll('.ai-extra, section.vcol:not([id^="sec-aihot"]), .texgrid').forEach(function(el){ el.remove(); });
__rendered = true;

    /* group items by section */
    var groups = {};
    items.forEach(function(it){ (groups[it.section] = groups[it.section] || []).push(it); });

    /* ---- sections after the AIHOT modules: rail sections (with images) + texgrids ----
       v1.8: 旧静态板块（music/football/tech/finance/society 等非 ai 的 items section）停用，
       数据里即使还有这些 items 也不渲染——页面只保留 AIHOT/FIN NEWS/FASHIONABLE LIFE */
    var html = '';
    SEC_ORDER.forEach(function(sec){
      if(sec !== 'ai' || !groups[sec]) return;
      var list = groups[sec];
      var meta = SEC_META[sec] || {zh:sec, en:sec.toUpperCase()};
      var withImg = list.filter(function(it){ return it.image_data; });
      if(withImg.length){
        var rest = list.filter(function(it){ return !it.image_data; });
        var head = '<div class="vhead"><span class="vh-zh">'+esc(meta.zh)+'</span><span class="vh-en">'+esc(meta.en)+'</span><span class="vh-n">'+list.length+' 条 · 图文 '+withImg.length+'</span></div>';
        var rail = '<div class="railwrap"><div class="rail" tabindex="0" role="group" aria-label="横向卡片轨，方向键切换"><div class="strip">'
          + withImg.map(function(it){
              var zh = it.title_zh || it.title;
              var en = (it.lang === 'en') ? '<div class="ct-en">'+esc(it.title)+'</div>' : '';
              return '<a class="card" data-src-extra="'+esc(it.source)+'" href="'+esc(it.url)+'" target="_blank" rel="noopener" draggable="false">'
                +'<div class="cimg"><img src="'+it.image_data+'" alt="'+esc(zh)+'" loading="lazy"></div>'
                +'<div class="cbody"><div class="ct-zh">'+esc(zh)+'</div>'+en
                +'<div class="ct-src">'+metaInner(it.source)+'</div></div></a>';
            }).join('') + '</div></div></div>';
        var moreHtml = '';
        if(rest.length){
          moreHtml = '<div class="vmore"><span class="vm-h">文字快讯 · MORE BRIEFS</span><ol class="cols2">'
            + rest.map(function(it){
                var zh = it.title_zh || it.title;
                var tz = (it.lang === 'en' && it.title_zh) ? '<div class="tz-line">'+esc(it.title)+'</div>' : '';
                return '<li data-src="'+esc(it.source)+'"><a href="'+esc(it.url)+'" target="_blank" rel="noopener"><div class="t">'+esc(zh)+'</div>'+tz
                  +'<div class="m"><span class="src">'+metaInner(it.source)+'</span><span class="sep"> · </span><span class="dt">'+esc(fmtDT(it.published))+'</span></div></a></li>';
              }).join('') + '</ol></div>';
        }
        html += '<section class="vcol" id="sec-'+sec+'">'+head+rail+moreHtml+'</section>';
      } else {
        /* text grid split into 2 columns */
        var half = Math.ceil(list.length/2);
        var cols = [list.slice(0,half), list.slice(half)];
        var roman = ['I','II'];
        html += '<div class="texgrid" id="sec-'+sec+'">' + cols.map(function(col,ci){
            return '<div class="catcol"><h4>'+esc(meta.zh)+'<span class="h4n">'+roman[ci]+'</span></h4><div class="cn">'+esc(meta.en)+'</div><ol>'
              + col.map(function(it){
                  var zh = it.title_zh || it.title;
                  var tz = (it.lang === 'en' && it.title_zh) ? '<div class="tz-line">'+esc(it.title)+'</div>' : '';
                  return '<li data-src="'+esc(it.source)+'"><a href="'+esc(it.url)+'" target="_blank" rel="noopener"><div class="t">'+esc(zh)+'</div>'+tz
                    +'<div class="li-m"><span>'+metaInner(it.source)+'</span>'+(it.published?'<span class="sep"> · </span><span>'+esc(fmtD(it.published))+'</span>':'')+'</div></a></li>';
                }).join('') + '</ol></div>';
          }).join('') + '</div>';
      }
    });
    /* insert: rail/texgrid sections after AIHOT modules (before </main>) */
    main.insertAdjacentHTML('beforeend', html);

    /* ---- AIHOT modules ---- */
    renderFeed(AI); renderHot(AI); renderSelected(AI); renderDaily(AI); renderFinnews(DATA); renderFashion(DATA);
    markLastReadLine(document.getElementById('ah-feedwrap'));
    markLastReadLine(document.getElementById('fn-feedwrap'));
    markLastReadLine(document.getElementById('fs-feedwrap'));
    addUnreadButtons();
    renderWeather(DATA);
    initAihotTabs();
    initFnTabs();
    if(!document.body.getAttribute('data-aihot-view')) setAihotView('feed');

    /* ---- snav (dynamic) ---- */
    renderSnav(items, AI);
    /* v1.6.4: 初始渲染后同步 FIN NEWS 子菜单选中态+标题（默认 flash 档） */
    try{ syncFnCatUI(document.body.getAttribute('data-fn-cat') || 'flash'); }catch(e){}


    /* ---- footer ---- */
    stampFooter(DATA, AI, items);

    /* ---- bind behaviors on freshly rendered DOM ---- */
    document.querySelectorAll('.rail').forEach(initRail);
    window.__rails = Array.from(document.querySelectorAll('.rail'));
    initScrollSpy();

    /* ---- re-run source filter so .src-empty visibility matches real count (bug C) ---- */
    if(typeof window.__applySourceFilter === 'function') window.__applySourceFilter(document.body.getAttribute('data-view') || 'AIHOT');
  }

  /* ---- AIHOT hot list ---- */
  function renderHot(AI){
    var ol = document.getElementById('ah-hot'); if(!ol || !AI.hot) return;
    ol.innerHTML = AI.hot.map(function(h){
      var t3 = h.rank<=3 ? ' top3':'';
      var names = (h.sourceNames||[]).map(function(n){ return srcName(n); }).join(' / ');
      var src = srcName(h.source);
      return '<li><a class="hot-row'+t3+'" data-src="AIHOT" href="'+esc(itemUrl(h))+'" target="_blank" rel="noopener" title="'+esc(names)+'">'
        +'<span class="hr-rank">'+(h.rank<10?'0':'')+h.rank+'</span>'
        +'<span class="hr-main"><span class="hr-title">'+esc(h.title)+'</span>'
        +'<span class="hr-sub">'+metaInner(h.source)+'<span class="sep"> · </span>'+(h.signalCount||0)+' 信号<span class="sep"> · </span>'+(h.participantCount||0)+' 参与<span class="sep"> · </span>最新 '+fmtDT(h.latestAt)+'</span></span>'
        +'<span class="hr-badge">'+(h.sourceCount||1)+' 家源</span></a></li>';
    }).join('');
    var n=document.getElementById('ah-hot-n'); if(n) n.textContent = AI.hot.length+' 条 · 前三加重';
  }

  /* ---- AIHOT selected ---- */
  function renderSelected(AI){
    var ol = document.getElementById('ah-sel'); if(!ol || !AI.selected) return;
    var sel = AI.selected;
    var max = sel.reduce(function(m,x){return Math.max(m,x.score||0);},0);
    ol.innerHTML = sel.map(function(s){
      /* P1-4: only the top scores keep the solid brick chip */
      var hi = (s.score||0)>=max-2 ? ' hi':'';
      var cat = s.category ? '<span class="cat">'+esc(s.category)+'</span>' : '';
      var reason = s.reason
        ? '<button type="button" class="sr-flag" aria-expanded="false">理由 ▾</button>'
          +'<div class="sr-reason">'+esc(s.reason)+'</div>' : '';
      /* P1-1: same structured meta language as the timeline cards */
      var meta = '<span>'+metaInner(s.source)+'</span>'
        + (cat ? '<span class="sep">·</span>'+cat : '')
        + '<span class="sep">·</span><span>'+fmtD(s.publishedAt)+'</span>';
      return '<li><div class="sel-row" data-src="AIHOT">'
        +'<span class="sr-score'+hi+'">'+esc(s.score)+'</span>'
        +'<div class="sr-main"><a class="sr-title" href="'+esc(itemUrl(s))+'" target="_blank" rel="noopener">'+esc(s.title)+'</a>'
        +'<div class="sr-meta">'+meta+'</div>'
        +reason+'</div></div></li>';
    }).join('');
    if(!ol.__flagBound){
      ol.addEventListener('click', function(e){
        var b = e.target.closest('.sr-flag'); if(!b) return;
        var row = b.closest('.sel-row');
        var open = row.classList.toggle('open');
        b.setAttribute('aria-expanded', open);
        b.textContent = open ? '理由 ▴' : '理由 ▾';
      });
      ol.__flagBound = true;
    }
    var n=document.getElementById('ah-sel-n'); if(n) n.textContent = sel.length+' 条 · 按 score 排序';
  }

  /* ---- AIHOT timeline card stream (v1.2) ---- */
  /* MWG 优化 #2 (2026-11-12): tlCards 拆出单卡模板；tlRenderChunked 分帧渲染 ——
     首屏 20 条同步出，其余按 rAF 批次追加（skill 军规 #6：大批 DOM 更新不阻塞主线程）。
     dayBreak 依赖前一张卡的日期，分片时由 prevDayKey 跨批传递。 */
  function tlSort(list){
    return list.slice().sort(function(a,b){
      var da=new Date(a.publishedAt||0), db=new Date(b.publishedAt||0);
      return db-da || (b.score||0)-(a.score||0); });
  }
  
  /* v2.2.4: tl 卡片（快讯/要闻/AIHOT动态）展开全文——复用妙想/公告同款交互 */
  function tlFullHtml(f){
    var paras = String(f.fulltext||'').split(/\n\n+/).filter(function(x){return x.trim();});
    var pHtml = paras.map(function(x){ return '<p>'+esc(x)+'</p>'; }).join('');
    return '<div class="mx-foot"><button type="button" class="dr-toggle" data-mx="1">展开全文 ▾</button></div>'
      + '<div class="mx-full" hidden>'
      + '<div class="mx-fulltop"><button type="button" class="dr-toggle" data-mxtop="1">▴ 收起全文</button></div>'
      + '<div class="mx-body">'+pHtml+'</div>'
      + '<div class="mx-fullend"><button type="button" class="dr-toggle" data-mxend="1">▴ 收起全文</button></div>'
      + '</div>';
  }
function tlCards(list, state){ /* state = {lastDay, maxScore}，跨批共享 */
    return list.map(function(f){
      var d = new Date(f.publishedAt||'');
      var ok = !isNaN(d);
      var d1 = ok ? p2(d.getDate()) : '—';
      var d2 = ok ? (d.getMonth()+1)+'月 '+p2(d.getHours())+':'+p2(d.getMinutes()) : '';
      var dayKey = ok ? d.toDateString() : '';
      var dayBreak = (dayKey && dayKey!==state.lastDay) ? ' tl-daybreak' : '';
      if(dayKey) state.lastDay = dayKey;
      var selCls = f.selected ? '' : ' tl-plain';
      var score = (f.score!=null) ? f.score : '';
      /* P1-4: only the top band keeps the solid brick fill; the rest is a
         quiet tint chip so the badge never outshouts the headline. */
      var scoreCls = (f.score||0) >= Math.max(state.maxScore-8, (state.maxScore||0)*0.85) ? ' hi' : '';
      var selTag = f.selected ? '<span class="tl-sel">精选</span>' : '';
      var cat = f.category ? '<span class="tl-cat">'+esc(f.category)+'</span>' : '';
      var flag = f.reason ? '<button type="button" class="tl-flag" aria-expanded="false">理由 ▾</button>' : '';
      /* P1-1 + P1-2 ③: source / platform / author are PLAIN TEXT (no second
         link — the headline already links out; a duplicate tab stop per card
         would triple the keyboard path through 112 cards). */
      var srcText = metaInner(f.source);
      var rk = readKey(f);
      return '<li class="tl-card'+selCls+dayBreak+(readHas(rk)?' tl-read':'')+'" data-src="AIHOT" data-rkey="'+esc(rk)+'">'
        +'<div class="tl-when"><div class="d1">'+d1+'</div><div class="d2">'+esc(d2)+'</div></div>'
        +'<div class="tl-dot" aria-hidden="true"></div>'
        +'<div class="tl-body">'
          +'<div class="tl-head"><a class="tl-title" href="'+esc(itemUrl(f))+'" target="_blank" rel="noopener">'+esc(f.title)+'</a>'
          +(score!==''?'<span class="tl-score'+scoreCls+'">SCORE '+esc(score)+'</span>':'')+'</div>'
          +'<div class="tl-tags">'+selTag+cat+'<span class="tl-src">'+srcText+'</span>'+flag+'</div>'
          +(f.summary?'<div class="tl-sum">'+esc(f.summary)+'</div>':'')
          +(f.reason?'<div class="tl-reason">'+esc(f.reason)+'</div>':'')
          +(f.fulltext && f.fulltext.length > 85 ? tlFullHtml(f) : '')   /* v2.2.4: >85字≈超过折叠态2行可见容量 */
        +'</div></li>';
    });
  }

  /* v2.2.5: 字体加载完成后再复测一次（首测时 webfont 未就绪，测量可能偏差） */
  function tlPruneAfterFonts(){
    if(document.__mxFontPrune) return;
    document.__mxFontPrune = true;
    var go = function(){ tlPruneExpandBtns(document); };
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(go).catch(go);
    else setTimeout(go, 800);
  }

  /* v2.2.5: 真实溢出检测——tl-sum 未被 CSS 截断且全文无增量的卡片，不显示展开钮 */
  function tlPruneExpandBtns(scope){
    var cards = (scope || document).querySelectorAll('.tl-card');
    for(var i = 0; i < cards.length; i++){
      var foot = cards[i].querySelector('.mx-foot');
      if(!foot) continue;
      var sum = cards[i].querySelector('.tl-sum');
      if(!sum){ foot.hidden = true; continue; }   /* 无摘要卡片 */
      var body = cards[i].querySelector('.mx-full .mx-body');
      var more = body ? body.textContent.length : 0;
      var sm = sum.textContent.length;
      if(!sum.textContent.trim()){ foot.hidden = true; continue; }
      /* 关键：.tl-sum 有 content-visibility:auto（未入视口时内容不渲染，scrollHeight 不可信）。
         测量时临时置 visible + 解除 line-clamp，再按行高算折叠态可见高度。 */
      var prevCV = sum.style.contentVisibility;
      var prevClamp = sum.style.webkitLineClamp;
      sum.style.contentVisibility = 'visible';
      sum.style.webkitLineClamp = 'none';
      var fullH = sum.scrollHeight;
      var lh = parseFloat(getComputedStyle(sum).lineHeight) || 22;
      sum.style.webkitLineClamp = prevClamp;
      sum.style.contentVisibility = prevCV;
      var clampedH = 2 * lh;                 /* 折叠态固定 2 行 */
      var clipped = fullH > clampedH + 1;    /* 实际需要 >2 行 */
      /* 保留按钮的条件：摘要被截断（看不全） 或 全文比摘要多出实质内容（还有更多没露出） */
      if(!clipped && more <= sm + 40) foot.hidden = true;
    }
  }
  function tlRenderChunked(ol, list, label){
    var FIRST = 20, BATCH = 30;
    var gen = (ol.__gen = (ol.__gen || 0) + 1);   /* 代际绑定到 ol 节点：同轮多列表互不干扰，重渲染换节点自然作废 */
    var state = { lastDay:'', maxScore: list.reduce(function(m,x){return Math.max(m,x.score||0);},0) };
    var cards = tlCards(list, state);
    ol.innerHTML = cards.slice(0, FIRST).join('');
    tlPruneExpandBtns(ol);
    var i = FIRST;
    (function next(){
      if(gen !== ol.__gen || !ol.isConnected) return;   /* 已被新渲染替换，丢弃 */
      if(i >= cards.length){
        var foot = document.createElement('div');
        foot.className = 'ah-more';
        foot.textContent = '— ' + label + ' · 共 ' + list.length + ' 条 · 按时间倒序 —';
        ol.parentNode.appendChild(foot);
        return;
      }
      requestAnimationFrame(function(){
        if(gen !== ol.__gen || !ol.isConnected) return;
        ol.insertAdjacentHTML('beforeend', cards.slice(i, i+BATCH).join(''));
        tlPruneExpandBtns(ol);
        i += BATCH;
        next();
      });
    })();
  }
  function tlHtml(list, label){
    if(!list || !list.length) return '';
    return '<ol class="ah-timeline" data-tllabel="'+esc(label)+'"></ol>';
  }
  function renderFeed(AI){
    var wrap = document.getElementById('ah-feedwrap'); if(!wrap) return;
    var feedList = (AI.feed && AI.feed.length) ? AI.feed : [];
    if(!feedList.length && AI.selected && AI.selected.length){
      feedList = AI.selected.map(function(s){ var c={}; for(var k in s) c[k]=s[k]; c.selected=true; return c; });
    }
    var selList = (AI.selected||[]).map(function(s){ var c={}; for(var k in s) c[k]=s[k]; c.selected=true; return c; });
    wrap.innerHTML = ''
      + '<div class="tl-group tl-group-feed">'+tlHtml(feedList,'AIHOT 时间线 · 全部动态')+'</div>'
      + '<div class="tl-group tl-group-sel">'+tlHtml(selList,'AIHOT 精选')+'</div>';
    /* MWG #2: 分帧填充两个 timeline（首屏 20 条同步，其余 rAF 批次） */
    var ols = wrap.querySelectorAll('ol.ah-timeline');
    if(ols[0]) tlRenderChunked(ols[0], tlSort(feedList), 'AIHOT 时间线 · 全部动态');
    if(ols[1]) tlRenderChunked(ols[1], tlSort(selList), 'AIHOT 精选');
    if(!wrap.__flagBound){
      wrap.addEventListener('click', function(e){
        var b = e.target.closest('.tl-flag'); if(!b) return;
        var card = b.closest('.tl-card');
        var open = card.classList.toggle('open');
        b.setAttribute('aria-expanded', open);
        b.textContent = open ? '理由 ▴' : '理由 ▾';
      });
      wrap.__flagBound = true;
    }
    /* P2-2: hovering a card lights up its timeline node + date/time.
       The CSS :hover rule covers the common case; this JS class makes the
       linkage explicit and survives engines that drop :hover on non-links. */
    if(!wrap.__linkBound){
      wrap.addEventListener('mouseover', function(e){
        var card = e.target.closest('.tl-card'); if(!card) return;
        if(card.__linked) return;
        card.__linked = true; card.classList.add('tl-linked');
      });
      wrap.addEventListener('mouseout', function(e){
        var card = e.target.closest('.tl-card'); if(!card) return;
        if(e.relatedTarget && card.contains(e.relatedTarget)) return;
        card.__linked = false; card.classList.remove('tl-linked');
      });
      wrap.__linkBound = true;
    }
  }

  /* ---- AIHOT sub-view switching (v1.2): feed / selected / daily ---- */
  function setAihotView(v){
    document.body.setAttribute('data-aihot-view', v||'');
    document.querySelectorAll('#ah-tabs .ah-tab').forEach(function(t){
      var on = t.getAttribute('data-ahview')===v;
      t.classList.toggle('on', on);
    });
    document.querySelectorAll('.snav-subitem[data-ahview]').forEach(function(t){
      var on = t.getAttribute('data-ahview')===v;
      t.classList.toggle('on', on);
    });
  }
  function initAihotTabs(){
    var tabs = document.getElementById('ah-tabs'); if(!tabs || tabs.__bound) return; tabs.__bound = true;
    tabs.addEventListener('click', function(e){
      var b = e.target.closest('.ah-tab'); if(!b) return;
      setAihotView(b.getAttribute('data-ahview'));
    });
  }

  /* ---- FIN NEWS category tabs (v1.8.1): mirror of ah-tabs, above the fn feed ---- */
  function initFnTabs(){
    var tabs = document.getElementById('fn-tabs'); if(!tabs || tabs.__bound) return; tabs.__bound = true;
    tabs.addEventListener('click', function(e){
      var b = e.target.closest('.ah-tab'); if(!b) return;
      setFnCat(b.getAttribute('data-fncat'));
    });
  }

  /* ---- WEATHER: 报头天气小栏（v1.9，数据来自 gazette-news.json p.weather，高德源）----
     图标为内联手绘风 SVG（单描边墨色，报纸版画语言；不使用 emoji）。 */
  var WX_ICONS = {
    sun:   '<circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="12" y1="2.4" x2="12" y2="4.6"/><line x1="12" y1="19.4" x2="12" y2="21.6"/><line x1="2.4" y1="12" x2="4.6" y2="12"/><line x1="19.4" y1="12" x2="21.6" y2="12"/><line x1="5.2" y1="5.2" x2="6.8" y2="6.8"/><line x1="17.2" y1="17.2" x2="18.8" y2="18.8"/><line x1="18.8" y1="5.2" x2="17.2" y2="6.8"/><line x1="6.8" y1="17.2" x2="5.2" y2="18.8"/></g>',
    partly:'<circle cx="8.2" cy="8.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="8.2" y1="1.6" x2="8.2" y2="3.2"/><line x1="1.6" y1="8.2" x2="3.2" y2="8.2"/><line x1="3.4" y1="3.4" x2="4.6" y2="4.6"/><line x1="13" y1="3.4" x2="11.8" y2="4.6"/></g><path d="M7 17.5a3.8 3.8 0 0 1 7.5-.9 3 3 0 1 1 .7 5.9H8a2.9 2.9 0 0 1-1-5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    cloud: '<path d="M6.5 18.5a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.2 3.4 3.4 0 1 1-.4 6.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    rain:  '<path d="M6.5 14.5a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.2 3.4 3.4 0 1 1-.4 6.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="8.4" y1="17.5" x2="7.4" y2="20.8"/><line x1="12.4" y1="17.5" x2="11.4" y2="20.8"/><line x1="16.4" y1="17.5" x2="15.4" y2="20.8"/></g>',
    snow:  '<path d="M6.5 14.5a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.2 3.4 3.4 0 1 1-.4 6.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="8.2" y1="18.2" x2="8.2" y2="20.6"/><line x1="7" y1="19.4" x2="9.4" y2="19.4"/><line x1="12.2" y1="18.2" x2="12.2" y2="20.6"/><line x1="11" y1="19.4" x2="13.4" y2="19.4"/><line x1="16.2" y1="18.2" x2="16.2" y2="20.6"/><line x1="15" y1="19.4" x2="17.4" y2="19.4"/></g>',
    thunder:'<path d="M6.5 14.5a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.2 3.4 3.4 0 1 1-.4 6.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12.8 15.5l-2.6 3.6h2.2l-1.4 3.7 4.4-4.8h-2.3l1.6-2.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    fog:   '<path d="M6.5 13a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.2A3.4 3.4 0 1 1 17.3 13z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6.5" y1="16.3" x2="17.5" y2="16.3"/><line x1="8.5" y1="19.3" x2="15.5" y2="19.3"/></g>'
  };
  function wxSvg(icon, cls){
    return '<svg class="'+(cls||'')+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(WX_ICONS[icon]||WX_ICONS.cloud)+'</svg>';
  }
  function renderWeather(DATA){
    var box = document.getElementById('wx-body'); if(!box) return;
    var W = (DATA && DATA.weather) || null;
    if(!W || !W.casts || !W.casts.length){
      box.innerHTML = '<div class="wx-now"><div class="c">天气数据暂缺 · 每日报纸随数据管线更新</div></div>';
      return;
    }
    renderWeatherData(W);
    /* v1.9.1 方案A预埋: 用户授权定位后，用 Open-Meteo 按用户实际位置覆盖管线数据
       (管线数据 = 作者城市兜底；定位数据 = 每个用户自己的城市)。静默失败保留兜底。 */
    enhanceWeatherWithGeo();
  }
  /* Open-Meteo weather_code (WMO) -> 管线 icon 键 */
  function wxIconFromCode(code){
    if(code === 0) return 'sun';
    if(code === 1 || code === 2) return 'partly';
    if(code === 3) return 'cloud';
    if(code >= 45 && code <= 48) return 'fog';
    if(code >= 51 && code <= 67) return 'rain';
    if(code >= 71 && code <= 77) return 'snow';
    if(code >= 80 && code <= 82) return 'rain';
    if(code >= 85 && code <= 86) return 'snow';
    if(code >= 95) return 'thunder';
    return 'cloud';
  }
  var WX_WEEK_ZH = ['周日','周一','周二','周三','周四','周五','周六'];
  function wxWeekZh(dateStr){
    var d = new Date(dateStr + 'T12:00:00');
    return isNaN(d.getTime()) ? '' : WX_WEEK_ZH[d.getDay()];
  }
  function enhanceWeatherWithGeo(){
    if(!navigator.geolocation) return;
    var done = false;
    navigator.geolocation.getCurrentPosition(function(pos){
      if(done) return; done = true;
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4';
      (async function(){
        var d;
        try{ var r0 = await fetchT(u); d = await r0.json(); }catch(e){ return; /* 静默: 保留管线兜底 */ }
        {
        if(!d || !d.daily || !d.daily.time || !d.daily.time.length) return;
        var casts = d.daily.time.map(function(t, i){
          var code = d.daily.weather_code[i];
          var zhMap = {0:'晴',1:'晴',2:'多云',3:'阴',45:'雾',48:'雾',51:'毛毛雨',53:'小雨',55:'大雨',
                       61:'小雨',63:'中雨',65:'大雨',66:'雨夹雪',67:'雨夹雪',71:'小雪',73:'中雪',75:'大雪',
                       80:'阵雨',81:'阵雨',82:'强阵雨',85:'小雪',86:'大雪',95:'雷阵雨',96:'雷阵雨',97:'雷阵雨'};
          return {
            date: t, week: '', week_zh: wxWeekZh(t),
            zh: zhMap[code] || '多云', day: '', night: '',
            daytemp: String(Math.round(d.daily.temperature_2m_max[i])),
            nighttemp: String(Math.round(d.daily.temperature_2m_min[i])),
            icon: wxIconFromCode(code)
          };
        });
        /* 城市名: bigdatacloud 反查（免 key），失败显示「本地」 */
        var gu = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat
               + '&longitude=' + lon + '&localityLanguage=zh';
        try{
          var rg = await fetchT(gu); var g = await rg.json();
          renderWeatherData({
            city: (g && (g.city || g.locality || g.principalSubdivision)) || '本地',
            casts: casts, src: 'geo'
          });
        }catch(e){
          renderWeatherData({city: '本地', casts: casts, src: 'geo'});
        }
      }
      })();
    }, function(){ /* 用户拒绝授权或超时: 保留管线兜底 */ },
    {timeout: 8000, maximumAge: 30 * 60 * 1000});
  }
  function renderWeatherData(W){
    var box = document.getElementById('wx-body'); if(!box) return;
    var t = W.casts[0];
    var todayHtml =
      '<div class="wx-today">'
        +wxSvg(t.icon)
        +'<div class="wx-now">'
          +'<div class="t"><span class="lo">'+esc(t.nighttemp)+'°</span>–'+esc(t.daytemp)+'<span class="dg">°C</span></div>'
          +'<div class="c">'+esc(t.zh)+' · '+esc(t.week_zh||'')+'</div>'
        +'</div>'
      +'</div>';
    var rowsHtml = W.casts.slice(1).map(function(c){
      return '<div class="wx-row">'
        +'<span class="d">'+esc(c.week_zh||c.date.slice(5))+'</span>'
        +wxSvg(c.icon)
        +'<span class="w">'+esc(c.zh)+'</span>'
        +'<span class="tp">'+esc(c.nighttemp)+'<i>–</i>'+esc(c.daytemp)+'°<i style="font-size:9px">C</i></span>'
      +'</div>';
    }).join('');
    box.innerHTML = todayHtml
      + (rowsHtml ? '<div class="wx-days">'+rowsHtml+'</div>' : '')
      + '<div class="wx-city"><span>'+esc(W.city||'')+'</span><span class="src">'+(W.src === 'geo' ? '已定位' : '高德天气')+'</span></div>';
  }

  /* ---- AIHOT yesterday's daily ---- */
  function renderDaily(AI){
    var box = document.getElementById('ah-daily'); if(!box || !AI.daily) return;
    var D = (AI.daily.report) ? AI.daily.report : AI.daily;   /* v1.2: schema nests under report */
    var html = '';
    html += '<div class="yd-datebar"><span>AIHOT DAILY · 昨日 AI 日报</span><span class="yd-d">'+esc(D.date)+'</span></div>';
    var dailyUrl = (D.links && D.links.aihot) || D.url || '';
    html += '<div class="yd-lead"><div class="yk">头条 · LEAD</div><h3>'
      +(dailyUrl?'<a href="'+esc(dailyUrl)+'" target="_blank" rel="noopener">'+esc(D.lead.title)+'</a>':esc(D.lead.title))
      +'</h3><p>'+esc(D.lead.leadParagraph)+'</p></div>';
    html += '<div class="yd-grid">' + D.sections.map(function(sec){
      return '<div class="yd-sec"><h5>'+esc(sec.label)+'<span class="n">'+sec.items.length+' 条</span></h5><ul>'
        + sec.items.map(function(it){
          return '<li data-src="AIHOT"><a class="t" href="'+esc(itemUrl(it))+'" target="_blank" rel="noopener">'+esc(it.title)+'</a>'
            +(it.summary?'<span class="s">'+esc(it.summary)+'</span>':'')
            +'<span class="m">'+metaInner(it.source)+'</span></li>';
        }).join('')+'</ul></div>';
    }).join('') + '</div>';
    html += '<div class="yd-flashes"><span class="vm-h">快讯 · FLASHES</span><ol>'
      + D.flashes.map(function(f){
        return '<li data-src="AIHOT"><span class="f-d">'+fmtD(f.publishedAt)+'</span>'
          +'<a class="f-t" href="'+esc(itemUrl(f))+'" target="_blank" rel="noopener">'+esc(f.title)+'</a>'
          +'<span class="f-s">'+metaInner(f.source)+'</span></li>';
      }).join('') + '</ol></div>';
    box.innerHTML = html;
    var cnt = D.sections.reduce(function(a,s){return a+s.items.length;},0);
    var n=document.getElementById('ah-daily-n'); if(n) n.textContent = D.date+' · '+D.sections.length+' 栏 '+cnt+' 条 · 快讯 '+D.flashes.length+' 条';
  }

  /* ---- FIN NEWS: 金融快讯时间瀑布（同花顺 flash + Wind 深度/公告）---- */
  /* v1.6: 4 档分类子菜单（快讯/要闻/公告/研究），照 AIHOT snav-sub 同构 */
  var FN_CATS = [
    {key:'flash',    zh:'快讯', en:'FLASH · REALTIME', hint:'同花顺 · 实时电报流'},
    {key:'headline', zh:'要闻', en:'HEADLINES · EDITORS', hint:'编辑精选 · 重大事件'},
    {key:'filing',   zh:'公告', en:'FILINGS · DISCLOSURE', hint:'披露文件 · 重组/要约'},
    {key:'research', zh:'研究', en:'RESEARCH · INSIGHT', hint:'研报 · 深度解读'}
  ];
  function syncFnCatUI(cat){
    /* v1.6.4: 侧栏子菜单选中态 + 内容区标题 随档位同步（setAihotView 同构）
       v1.8.1: 内容区顶部 ah-tabs 页签同步选中态（替代旧的 fn-subbar 死代码） */
    document.querySelectorAll('.snav-subitem[data-fncat]').forEach(function(t){
      t.classList.toggle('on', t.getAttribute('data-fncat')===cat);
    });
    document.querySelectorAll('#fn-tabs .ah-tab').forEach(function(t){
      t.classList.toggle('on', t.getAttribute('data-fncat')===cat);
    });
    var sec = document.getElementById('sec-finnews');
    if(sec){
      var zh = sec.querySelector('.vh-zh'), en = sec.querySelector('.vh-en');
      var meta = FN_CATS.filter(function(c){return c.key===cat;})[0];
      if(zh && meta) zh.textContent = '金融·' + meta.zh;
      if(en && meta) en.textContent = meta.en;
    }
  }
  function setFnCat(cat){
    document.body.setAttribute('data-fn-cat', cat);
    syncFnCatUI(cat);
    renderFinnews(window.DATA);
  }
  function renderFinnews(DATA){
    var wrap = document.getElementById('fn-feedwrap'); if(!wrap) return;
    if(!wrap.__flagBound){
      wrap.addEventListener('click', function(e){
        var b = e.target.closest('.tl-flag'); if(!b) return;
        var card = b.closest('.tl-card');
        var open = card.classList.toggle('open');
        b.setAttribute('aria-expanded', open);
        b.textContent = open ? '理由 ▴' : '理由 ▾';
      });
      wrap.__flagBound = true;
    }
    var FN = (DATA && DATA.finnews) || {};
    var list = FN.items || [];
    /* v1.6 分类过滤 + 子菜单条 */
    var curCat = document.body.getAttribute('data-fn-cat') || 'flash';
    var catCounts = {};
    list.forEach(function(f){ var c = f.category || 'headline'; catCounts[c] = (catCounts[c]||0)+1; });
    if(!FN_CATS.some(function(c){return c.key===curCat;})) curCat = 'flash';
    /* v1.6.6: 去掉空档自动回落——用户点哪档就显示哪档（含标题），空了显示空态提示 */
    if(!catCounts[curCat]) { /* 空档保持选择，renderFinnews 下方有空态分支 */ }
    var shown = list.filter(function(f){ return (f.category||'headline')===curCat; });
    var nEl = document.getElementById('fn-n');
    if(nEl) nEl.textContent = list.length ? (list.length + ' 条 · 三源聚合') : '今日安静，无快讯';
    if(typeof initFnTabs === 'function') initFnTabs();   /* v1.8.1: bind category tabs (idempotent) */
    if(!list.length){ wrap.innerHTML = '<div class="src-empty" style="display:block">金融快讯暂无数据</div>'; return; }
    if(!shown.length){ wrap.innerHTML = '<div class="src-empty" style="display:block">「'+esc((FN_CATS.filter(function(c){return c.key===curCat;})[0]||{}).zh||curCat)+'」暂无内容</div>'; return; }
    var lastDay = '';
    var html = '<ol class="tl-list">' + shown.map(function(f){
      var d = f.published ? new Date(f.published) : null;
      var ok = !!(d && !isNaN(d.getTime()));
      /* v1.6.2: 无精确时间（Wind 公告/研报只有日期）→ 降级用 dateHint 显示日期 */
      if(!ok && f.dateHint){
        var hd = new Date(String(f.dateHint).replace(/[-/年]/g,'-').replace(/月/g,'-').replace(/日/g,''));
        if(!isNaN(hd.getTime())){ d = hd; ok = true; }
      }
      var d1 = ok ? p2(d.getDate()) : '—';
      var d2 = ok ? (f.published ? (d.getMonth()+1)+'月 '+p2(d.getHours())+':'+p2(d.getMinutes()) : (d.getMonth()+1)+'月'+p2(d.getDate())+'日') : '';
      var dayKey = ok ? d.toDateString() : '';
      var dayBreak = (dayKey && dayKey!==lastDay) ? ' tl-daybreak' : '';
      if(dayKey) lastDay = dayKey;
      var kindTag = f.kind==='flash'
        ? '<span class="tl-cat">快讯</span>'
        : '<span class="tl-cat">深度</span>';
      var echoTag = f.echo >= 2
        ? '<span class="tl-cat tl-echo">' + (f.echo>=3?'三源共振':'多源共振') + '</span>'
        : '';
      var href = f.url || '';
      var titleHtml = href
        ? '<a class="tl-title" href="'+esc(href)+'" target="_blank" rel="noopener">'+esc(f.title)+'</a>'
        : '<span class="tl-title" style="cursor:default">'+esc(f.title)+'</span>';
      var flag = f.reason ? '<button type="button" class="tl-flag" aria-expanded="false">理由 ▾</button>' : '';
      /* v2.2.1: 妙想条目支持原位展开全文（深际阅读同款交互），fulltext 按 \n\n 分段 */
      /* v2.2.2: 妙想展开全文复刻 deepreads 交互——右下角按钮 + 展开后顶部 sticky 收起条 */
      var mxFull = '', mxBtn = '';
      if(f.fulltext){   /* v2.2.3: 任何带 fulltext 的条目都可展开（妙想研报/公告 + 东财补全的公告全文） */
        var paras = f.fulltext.split('\n\n').filter(function(x){ return x.trim(); });
        mxFull = '<div class="mx-full" hidden>'
          +'<div class="mx-fulltop"><button type="button" class="dr-toggle mx-toggle" aria-expanded="true">▴ 收起全文</button></div>'
          +'<div class="mx-body">' + paras.map(function(x){ return '<p>'+esc(x)+'</p>'; }).join('') + '</div>'
          +'</div>';
        mxBtn = '<button type="button" class="dr-toggle mx-toggle" aria-expanded="false">展开全文 ▾</button>';
      }
      var rk = readKey(f);
      return '<li class="tl-card tl-plain'+dayBreak+(readHas(rk)?' tl-read':'')+'" data-src="FIN NEWS" data-rkey="'+esc(rk)+'">'
        +'<div class="tl-when"><div class="d1">'+d1+'</div><div class="d2">'+esc(d2)+'</div></div>'
        +'<div class="tl-dot" aria-hidden="true"></div>'
        +'<div class="tl-body">'
          +'<div class="tl-head">'+titleHtml+'</div>'
          +'<div class="tl-tags">'+kindTag+echoTag+'<span class="tl-src"><b>来源：</b>'+esc(f.source||'')+'</span>'+flag+'</div>'
          +(f.reason?'<div class="tl-reason">'+esc(f.reason)+'</div>':'')
          +(mxFull
            ? (f.summary?'<div class="tl-sum" style="display:-webkit-box">'+esc(f.summary.slice(0,120))+'…</div>':'')
              + mxFull
              +'<div class="mx-foot"><span class="mx-actions">'+mxBtn+'</span></div>'
            : (f.summary?'<div class="tl-sum">'+esc(f.summary)+'</div>':''))
        +'</div></li>';
    }).join('') + '</ol>';
    html += '<div class="ah-more">— FIN NEWS · 共 '+list.length+' 条 · 当前「'+esc((FN_CATS.filter(function(c){return c.key===curCat;})[0]||{}).zh||'')+'」'+shown.length+' 条 · 同花顺快讯 + Wind 深度 + 东财要闻 · 按时间倒序 —</div>';
    wrap.innerHTML = html;
    tlPruneExpandBtns(wrap); tlPruneAfterFonts();   /* v2.2.5: 显示全的卡片不显示展开钮 */
    markLastReadLine(wrap); addUnreadButtons();
    /* v2.2.1: 妙想条目展开全文/收起（原位，deepreads 同款交互） */
    if(!wrap.__mxBound){
      wrap.__mxBound = true;
      wrap.addEventListener('click', function(e){
        var b = e.target.closest('.mx-toggle'); if(!b) return;
        var body = b.closest('.tl-body');
        var full = body.querySelector('.mx-full');
        if(!full) return;
        var nowOpen = !full.hidden;
        full.hidden = nowOpen;
        if(nowOpen){
          /* 收起：底部主按钮恢复"展开全文" */
          var foot = body.querySelector('.mx-foot .mx-toggle');
          if(foot) foot.textContent = '展开全文 ▾';
        }else{
          /* 展开：底部主按钮变"收起"（deepreads 同款联动），滚到全文头 */
          var foot2 = body.querySelector('.mx-foot .mx-toggle');
          if(foot2) foot2.textContent = '▴ 收起全文';
          full.scrollIntoView({block:'nearest', behavior:'smooth'});
        }
      });
    }
  }

/* ---- FASHIONABLE LIFE: 潮流生活时间瀑布（HYPEBEAST 全文 + 华丽志 + NOWRE现客）---- */
  /* v2: 五档主题分类（GLM 管线分类），交互与 FIN NEWS 四档同构 */
  var FS_CATS = [
    {key:'all',      zh:'全部动态', en:'ALL'},
    {key:'sneaker',  zh:'球鞋',     en:'SNEAKERS'},
    {key:'runway',   zh:'秀场服饰', en:'RUNWAY'},
    {key:'collab',   zh:'联名合作', en:'COLLABS'},
    {key:'brand',    zh:'品牌动态', en:'BRANDS'},
    {key:'culture',  zh:'生活方式', en:'CULTURE'},
  ];
  function syncFsCatUI(cat){
    document.querySelectorAll('.snav-subitem[data-fscat]').forEach(function(t){
      t.classList.toggle('on', t.getAttribute('data-fscat')===cat);
    });
    document.querySelectorAll('#fs-tabs .ah-tab').forEach(function(t){
      t.classList.toggle('on', t.getAttribute('data-fscat')===cat);
    });
  }
  function setFsCat(cat){
    document.body.setAttribute('data-fs-cat', cat||'all');
    syncFsCatUI(cat||'all');
    renderFashion(window.DATA);
  }
  window.setFsCat = setFsCat; /* v2.0.3: expose for gazette-misc.js level-1 FASHION click (reset to all) */
  function initFsTabs(){
    var tabs = document.getElementById('fs-tabs'); if(!tabs || tabs.__bound) return; tabs.__bound = true;
    tabs.addEventListener('click', function(e){
      var b = e.target.closest('.ah-tab'); if(!b) return;
      setFsCat(b.getAttribute('data-fscat'));
    });
  }
  function renderFashion(DATA){
    var wrap = document.getElementById('fs-feedwrap'); if(!wrap) return;
    if(!wrap.__flagBound){
      wrap.addEventListener('click', function(e){
        var b = e.target.closest('.tl-flag'); if(!b) return;
        var card = b.closest('.tl-card');
        var open = card.classList.toggle('open');
        b.setAttribute('aria-expanded', open);
        b.textContent = open ? '理由 ▴' : '理由 ▾';
      });
      wrap.__flagBound = true;
    }
    var FS = (DATA && DATA.fashion) || {};
    var list = FS.items || [];
    /* v2: 分类过滤（data-fs-cat，默认 all）+ 计数 */
    var curCat = document.body.getAttribute('data-fs-cat') || 'all';
    var catCounts = {};
    list.forEach(function(f){ var c = f.category || 'culture'; catCounts[c] = (catCounts[c]||0)+1; });
    var shown = (curCat === 'all') ? list : list.filter(function(f){ return (f.category || 'culture') === curCat; });
    if(!document.getElementById('fs-tabs')){
      /* 首次渲染写入页签（含计数徽标） */
      var tabsEl = document.createElement('div');
      tabsEl.className = 'ah-tabs'; tabsEl.id = 'fs-tabs';
      tabsEl.innerHTML = FS_CATS.map(function(c){
        var badge = c.key === 'all' ? list.length : (catCounts[c.key] || 0);
        return '<button type="button" class="ah-tab'+(curCat===c.key?' on':'')+'" data-fscat="'+c.key+'">'+c.zh+'<span class="tn">'+c.en+'</span></button>';
      }).join('');
      var vhead = wrap.parentElement.querySelector('.vhead');
      if(vhead) vhead.insertAdjacentElement('afterend', tabsEl); else wrap.parentElement.insertBefore(tabsEl, wrap);
      initFsTabs();
    } else {
      /* 已存在：刷新选中态与计数 */
      document.querySelectorAll('#fs-tabs .ah-tab').forEach(function(t){
        var k = t.getAttribute('data-fscat');
        t.classList.toggle('on', k === curCat);
      });
    }
    var nEl = document.getElementById('fs-n');
    if(nEl) nEl.textContent = list.length ? (list.length + ' 条 · 三源滚动池') : '今日安静，无更新';
    if(!list.length){ wrap.innerHTML = '<div class="src-empty" style="display:block">潮流生活暂无数据</div>'; return; }
    if(!shown.length){
      var zhName = (FS_CATS.filter(function(c){return c.key===curCat;})[0]||{}).zh || curCat;
      wrap.innerHTML = '<div class="src-empty" style="display:block">「'+esc(zhName)+'」暂无内容</div>'; return;
    }
    /* MWG #2 (2026-11-12): fashion 230 条改分帧渲染（首屏 20 + rAF 批 30） */
    var lastDay = '';
    var cards = shown.map(function(f){
      var d = f.published ? new Date(f.published) : null;
      var ok = !!(d && !isNaN(d.getTime()));
      var d1 = ok ? p2(d.getDate()) : '—';
      var d2 = ok ? (d.getMonth()+1)+'月 '+p2(d.getHours())+':'+p2(d.getMinutes()) : '';
      var dayKey = ok ? d.toDateString() : '';
      var dayBreak = (dayKey && dayKey!==lastDay) ? ' tl-daybreak' : '';
      if(dayKey) lastDay = dayKey;
      var kindTag = f.kind==='article'
        ? '<span class="tl-cat">全文</span>'
        : '<span class="tl-cat">简讯</span>';
      var href = f.url || '';
      var titleHtml = href
        ? '<a class="tl-title" href="'+esc(href)+'" target="_blank" rel="noopener">'+esc(f.title)+'</a>'
        : '<span class="tl-title" style="cursor:default">'+esc(f.title)+'</span>';
      /* HYPEBEAST 英文条目：中文标题下方展示英文原题（tz-line 同构样式） */
      var enLine = f.title_en ? '<div class="fs-en">'+esc(f.title_en)+'</div>' : '';
      /* v1.7.1: 头图（HYPEBEAST CDN / NOWRE 原文页抓取），点击同跳原文 */
      var imgHtml = f.image ? '<a class="fs-img" href="'+esc(href||'#')+'" target="_blank" rel="noopener"><img src="'+esc(f.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></a>' : '';
      var rk = readKey(f);
      return '<li class="tl-card tl-plain'+dayBreak+(readHas(rk)?' tl-read':'')+'" data-src="FASHION" data-rkey="'+esc(rk)+'">'
        +'<div class="tl-when"><div class="d1">'+d1+'</div><div class="d2">'+esc(d2)+'</div></div>'
        +'<div class="tl-dot" aria-hidden="true"></div>'
        +'<div class="tl-body">'
          +imgHtml
          +'<div class="tl-head">'+titleHtml+'</div>'+enLine
          +'<div class="tl-tags">'+kindTag+'<span class="tl-src"><b>来源：</b>'+esc(f.source||'')+'</span></div>'
          +(f.summary?'<div class="tl-sum">'+esc(f.summary)+'</div>':'')
        +'</div></li>';
    });
    var ol = document.createElement('ol');
    ol.className = 'tl-list';
    var gen = (ol.__gen = 1);
    wrap.innerHTML = '';
    wrap.appendChild(ol);
    var FIRST = 20, BATCH = 30, i = 0;
    ol.innerHTML = cards.slice(0, FIRST).join('');
    tlPruneExpandBtns(ol);
    i = FIRST;
    (function fsNext(){
      if(gen !== ol.__gen || !ol.isConnected) return;   /* 已被新渲染替换，丢弃 */
      if(i >= cards.length){
        var foot = document.createElement('div');
        foot.className = 'ah-more';
        foot.textContent = '— FASHIONABLE LIFE · 共 ' + list.length + ' 条（近 7 天滚动池）· 当前「' + ((FS_CATS.filter(function(c){return c.key===curCat;})[0]||{}).zh||'') + '」' + shown.length + ' 条 · 按时间倒序 —';
        wrap.appendChild(foot);
        markLastReadLine(wrap); addUnreadButtons();
        return;
      }
      requestAnimationFrame(function(){
        if(gen !== ol.__gen || !ol.isConnected) return;
        ol.insertAdjacentHTML('beforeend', cards.slice(i, i+BATCH).join(''));
        tlPruneExpandBtns(ol);
        i += BATCH;
        fsNext();
      });
    })();
  }

/* ---- sidebar source nav ---- */
  function renderSnav(items, AI){
    var nav = document.getElementById('snav'); if(!nav) return;
    var counts = {}, order = [];
    items.forEach(function(it){
      if(counts[it.source]==null){ counts[it.source]=0; order.push(it.source); }
      counts[it.source]++;
    });
    /* AIHOT first, then by count desc */
    order.sort(function(a,b){
      var A=(a==='AIHOT'), B=(b==='AIHOT');
      if(A&&!B) return -1; if(B&&!A) return 1;
      return counts[b]-counts[a] || order.indexOf(a)-order.indexOf(b);
    });
    /* v2.0.12: items 剔除后 order 可能为空——AIHOT 板块永远要出，兜底注入 */
    if(order.indexOf('AIHOT') < 0 && (AI.feed||[]).length) order.unshift('AIHOT');
    var zhNames = {'AIHOT':'AIHOT','Hacker News':'Hacker News','The Verge':'The Verge','sspai':'少数派','Pitchfork':'Pitchfork','BBC Football':'BBC Football','Sky Sports':'Sky Sports','Hypebeast':'Hypebeast','Highsnobiety':'Highsnobiety','FT中文网':'FT中文网','The Economist':'The Economist','BBC中文':'BBC中文'};
    var feedN0 = (AI.feed && AI.feed.length) ? AI.feed.length : 0;
    /* v1.8: 旧静态源（The Verge 等）不再计入"全部信源"——只有 AIHOT 精选 + FIN + FASHION */
    var aiSel = items.filter(function(it){return it.source==='AIHOT';}).length;
    var allN = aiSel + feedN0;
    var fnN = ((window.DATA && window.DATA.finnews && window.DATA.finnews.items) || []).length;
    var fsN2 = ((window.DATA && window.DATA.fashion && window.DATA.fashion.items) || []).length;
    allN += fnN + fsN2;
    /* preserve the currently selected source filter + AIHOT sub-view across re-renders */
    var curView = document.body.getAttribute('data-view') || 'AIHOT';   /* v1.9.3: ALL 视图移除，默认落在 AIHOT */
    var curAihot = document.body.getAttribute('data-aihot-view') || 'feed';
    /* v1.9.3: 「全部信源」菜单已移除（用户 2026-11-01）——三大板块直接从 AIHOT 开始 */
    var badges = '';
    /* v1.8: 精简为三大板块——只渲染 AIHOT（含 FIN NEWS/FASHION 的挂载），
       其余历史静态信源（The Verge/sspai/Pitchfork/BBC Football 等）不再出菜单 */
    order.forEach(function(src){
      if(src !== 'AIHOT') return;
      var display = zhNames[src] || src;
      /* P1 (v2.0.15): 徽章 = 未读数。AIHOT 按 feed+selected 计 */
      var bN;
      if(src === 'AIHOT'){
        var seen = {};
        var cntUnread = function(list){ var n=0; (list||[]).forEach(function(x){ var k=readKey(x); if(!seen[k]){ seen[k]=1; if(!readHas(k)) n++; } }); return n; };
        bN = cntUnread(AI.feed) + cntUnread(AI.selected);
      } else bN = counts[src];
      if(bN === 0) bN = '✓';
      badges += '<div class="snav-src">';   /* v2.0.10: DECO RAIL 三组廊柱包裹 */
      badges += '<button class="snav-item'+(src===curView?' on':'')+'" data-filter="'+esc(src)+'" type="button" role="tab" aria-selected="'+(src===curView)+'"><span class="sn-name">'+esc(display)+'<i>'+(src==='AIHOT' ? 'AI · 前沿情报' : esc(src))+'</i></span>   <!-- v2.0.11: AIHOT 副题去重 --><span class="sn-badge">'+bN+'</span></button>';
      /* v1.2: AIHOT second-level menu */
      if(src==='AIHOT'){
        var feedN = feedN0 || (AI.selected||[]).length;
        /* v1.8.2: AIHOT sub-items light up ONLY in AIHOT view (mutual exclusion) */
        var curAihotLit = (curView==='AIHOT') ? curAihot : null;
        badges += '<div class="snav-sub">'
          +'<button class="snav-subitem'+(curAihotLit==='feed'?' on':'')+'" data-ahview="feed" type="button"><span class="sb-n">全部动态</span><span class="sb-badge">'+feedN+'</span></button>'
          +'<button class="snav-subitem'+(curAihotLit==='selected'?' on':'')+'" data-ahview="selected" type="button"><span class="sb-n">精选</span><span class="sb-badge">'+(AI.selected||[]).length+'</span></button>'
          +'<button class="snav-subitem'+(curAihotLit==='daily'?' on':'')+'" data-ahview="daily" type="button"><span class="sb-n">日报</span><span class="sb-badge">'+(AI.daily?'1':'0')+'</span></button>'
          +'</div>';
        badges += '</div>';   /* v2.0.10: close AIHOT group */
        badges += '<div class="snav-src">';   /* v2.0.10: open FIN NEWS group */
        /* v1.4.1: FIN NEWS as a top-level rail item AFTER the AIHOT sub-menu
           (sibling of AIHOT, below 日报) — user-approved placement */
        var fnUnread = ((window.DATA && window.DATA.finnews && window.DATA.finnews.items) || []).filter(function(x){return !readHas(readKey(x));}).length;
      badges += '<button class="snav-item'+(curView==='FIN NEWS'?' on':'')+'" data-filter="FIN NEWS" type="button" role="tab" aria-selected="'+(curView==='FIN NEWS')+'"><span class="sn-name">💰 FIN NEWS<i>同花顺 · Wind · 东财</i></span><span class="sn-badge">'+(fnUnread || '✓')+'</span></button>';
        /* v1.6.1: FIN NEWS second-level sub-menu under the rail item
           (same pattern as AIHOT's 全部动态/精选/日报) — 快讯/要闻/公告/研究 */
        var fnItems = (window.DATA && window.DATA.finnews && window.DATA.finnews.items) || [];
        var fnCounts = {};
        fnItems.forEach(function(f){ var c = f.category || 'headline'; fnCounts[c] = (fnCounts[c]||0)+1; });
        /* v1.8.2: FIN NEWS sub-items light up ONLY in FIN NEWS view (mutual
           exclusion with AIHOT sub-menu — one lit group at a time) */
        var curFnCat = (curView==='FIN NEWS') ? (document.body.getAttribute('data-fn-cat') || 'flash') : null;
        badges += '<div class="snav-sub">'
          +'<button class="snav-subitem'+(curFnCat==='flash'?' on':'')+'" data-fncat="flash" type="button"><span class="sb-n">快讯</span><span class="sb-badge">'+(fnCounts.flash||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFnCat==='headline'?' on':'')+'" data-fncat="headline" type="button"><span class="sb-n">要闻</span><span class="sb-badge">'+(fnCounts.headline||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFnCat==='filing'?' on':'')+'" data-fncat="filing" type="button"><span class="sb-n">公告</span><span class="sb-badge">'+(fnCounts.filing||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFnCat==='research'?' on':'')+'" data-fncat="research" type="button"><span class="sb-n">研究</span><span class="sb-badge">'+(fnCounts.research||0)+'</span></button>'
          +'</div>';
        badges += '</div>';   /* v2.0.10: close FIN NEWS group */
        badges += '<div class="snav-src">';   /* v2.0.10: open FASHION group */
        /* v2: FASHIONABLE LIFE 一级菜单 + 五档主题二级菜单（与 FIN NEWS 同构） */
        var fsList = (window.DATA && window.DATA.fashion && window.DATA.fashion.items) || [];
        var fsN = fsList.length;
        var fsCounts = {all: fsN};
        fsList.forEach(function(f){ var c = f.category || 'culture'; fsCounts[c] = (fsCounts[c]||0)+1; });
        var curFsCat = (curView==='FASHION') ? (document.body.getAttribute('data-fs-cat') || 'all') : null;
        var fsUnread = ((window.DATA && window.DATA.fashion && window.DATA.fashion.items) || []).filter(function(x){return !readHas(readKey(x));}).length;
      badges += '<button class="snav-item'+(curView==='FASHION'?' on':'')+'" data-filter="FASHION" type="button" role="tab" aria-selected="'+(curView==='FASHION')+'"><span class="sn-name">👕 FASHIONABLE LIFE<i>HYPEBEAST · 华丽志 · NOWRE现客</i></span><span class="sn-badge">'+(fsUnread || '✓')+'</span></button>';
        badges += '<div class="snav-sub">'
          +'<button class="snav-subitem'+(curFsCat==='sneaker'?' on':'')+'" data-fscat="sneaker" type="button"><span class="sb-n">球鞋</span><span class="sb-badge">'+(fsCounts.sneaker||0)+'</span></button>'
          /* v2.0.3: 二级「全部动态」移除——一级 FASHION 按钮=全部内容（点一级时 fsCat 重置为 all，见 gazette-misc.js FASHION 分支）；页内 fs-tabs 的 ALL 页签保留 */
          +'<button class="snav-subitem'+(curFsCat==='runway'?' on':'')+'" data-fscat="runway" type="button"><span class="sb-n">秀场服饰</span><span class="sb-badge">'+(fsCounts.runway||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFsCat==='collab'?' on':'')+'" data-fscat="collab" type="button"><span class="sb-n">联名合作</span><span class="sb-badge">'+(fsCounts.collab||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFsCat==='brand'?' on':'')+'" data-fscat="brand" type="button"><span class="sb-n">品牌动态</span><span class="sb-badge">'+(fsCounts.brand||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFsCat==='culture'?' on':'')+'" data-fscat="culture" type="button"><span class="sb-n">生活方式</span><span class="sb-badge">'+(fsCounts.culture||0)+'</span></button>'
          +'</div>';
        badges += '</div>';   /* v2.0.10: close FASHION group */
        /* v2.1.1: 深度阅读一级菜单（与 AIHOT/FIN/FASHION 平级，FASHION 组之后；独立 JSON 按需拉取）
           徽章=文章总数（未读统计待数据加载后由 drUpdateBadge 补写） */
        var drN = (window.__drCount != null) ? window.__drCount : '…';
        badges += '<div class="snav-src">'
          +'<button class="snav-item'+(curView==='DEEPREADS'?' on':'')+'" data-filter="DEEPREADS" type="button" role="tab" aria-selected="'+(curView==='DEEPREADS')+'"><span class="sn-name">📚 深度阅读<i>六位大家 · 全文深读</i></span><span class="sn-badge" id="dr-snbadge">'+drN+'</span></button>'
          +'</div>';
      }
    });
    nav.innerHTML = '<div class="snav-h">SOURCES · 信源</div>' + badges;
    /* v2.0.10: DECO RAIL 初始组态——当前源所在组实心菱形 */
    nav.querySelectorAll('.snav-src').forEach(function(g){
      var srcBtn = g.querySelector('.snav-item');
      if(srcBtn && srcBtn.classList.contains('on')) g.classList.add('on');
    });
    /* sub-item clicks: AIHOT view switchers (data-ahview) or FIN NEWS
       category switchers (data-fncat) — never the source filter */
    if(!nav.__subBound){
      nav.addEventListener('click', function(e){
        var sub = e.target.closest('.snav-subitem'); if(!sub) return;
        e.stopPropagation();
        var fnCat = sub.getAttribute('data-fncat');
        if(fnCat){
          /* FIN NEWS sub-menu: make sure the FIN NEWS view is active, then switch category */
          var fnBtn = nav.querySelector('.snav-item[data-filter="FIN NEWS"]');
          if(fnBtn && !fnBtn.classList.contains('on')) fnBtn.click();
          setFnCat(fnCat);
          window.scrollTo({top:0,behavior:'smooth'});
          return;
        }
        var fsCat = sub.getAttribute('data-fscat');
        if(fsCat){
          /* v2: FASHION sub-menu — same pattern as FIN NEWS */
          var fsBtn = nav.querySelector('.snav-item[data-filter="FASHION"]');
          if(fsBtn && !fsBtn.classList.contains('on')) fsBtn.click();
          setFsCat(fsCat);
          window.scrollTo({top:0,behavior:'smooth'});
          return;
        }
        /* v2.1.1: 深度阅读已升级为一级菜单——旧子项路径删除（主按钮路径见 gazette-misc.js） */
        var aihotBtn = nav.querySelector('.snav-item[data-filter="AIHOT"]');
        /* make sure the AIHOT source filter is active so its sections are visible */
        if(aihotBtn && !aihotBtn.classList.contains('on')) aihotBtn.click();
        setAihotView(sub.getAttribute('data-ahview'));
        window.scrollTo({top:0,behavior:'smooth'});
      }, true);
      nav.__subBound = true;
    }
  }

  /* ---- footer ---- */
  function stampFooter(DATA, AI, items){
    /* v1.8: 只统计 AIHOT 精选 + FIN + FASHION 三板块条数/图文 */
    var aiItems = items.filter(function(i){return i.source==='AIHOT';});
    var fnS = ((window.DATA&&window.DATA.finnews&&window.DATA.finnews.items)||[]);
    var fsS = ((window.DATA&&window.DATA.fashion&&window.DATA.fashion.items)||[]);
    var count = aiItems.length + fnS.length + fsS.length;
    var nImg = aiItems.filter(function(i){return i.image_data;}).length + fsS.filter(function(i){return i.image;}).length;
    var f2 = document.getElementById('f-meta');
    if(f2){
      var t = DATA.generated_at ? new Date(DATA.generated_at) : null;
      function p(x){return (x<10?'0':'')+x;}
      var ts = (t && !isNaN(t)) ? t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate())+' '+p(t.getHours())+':'+p(t.getMinutes()) : '—';
      f2.textContent = '数据更新于 '+ts+' · 共 '+count+' 条 · '+nImg+' 图文 · The Morning Tab 浅色版 v1.8 · 远程 JSON + 缓存 + seed 降级';
    }
    var el = document.getElementById('aihot-ftime');
    if(el && AI.fetchedAt){ var d=new Date(AI.fetchedAt);
      function q(x){return (x<10?'0':'')+x;}
      el.textContent = 'AIHOT 数据更新时间 '+d.getFullYear()+'-'+q(d.getMonth()+1)+'-'+q(d.getDate())+' '+q(d.getHours())+':'+q(d.getMinutes())+' · 三模块（热点榜/精选/昨日日报）· 计划每 3 小时轮刷';
    }
    var fs = document.getElementById('f-sources');
    if(fs){
      /* v1.8: 只报三大板块的管线源，不再列旧静态源 */
      var set=[];
      items.forEach(function(i){ if(i.source==='AIHOT' && set.indexOf(i.source)<0) set.push(i.source); });
      var fnS = ((window.DATA&&window.DATA.finnews&&window.DATA.finnews.items)||[]);
      var fsS = ((window.DATA&&window.DATA.fashion&&window.DATA.fashion.items)||[]);
      var finSrc = []; fnS.forEach(function(i){ if(finSrc.indexOf(i.source)<0) finSrc.push(i.source); });
      var fsnSrc = []; fsS.forEach(function(i){ if(fsnSrc.indexOf(i.source)<0) fsnSrc.push(i.source); });
      var all = set.concat(finSrc).concat(fsnSrc);
      fs.textContent = '数据源（'+all.length+' 家）：'+all.join(' · ');
    }
  }

  /* ---- behaviors (from v0.6, wrapped for re-render) ---- */
  function initRail(rail){
    var wrap=rail.parentElement;
    var atEdge=function(){var max=rail.scrollWidth-rail.clientWidth;
      wrap.classList.toggle('at-start',rail.scrollLeft<=2);
      wrap.classList.toggle('at-end',rail.scrollLeft>=max-2);};
    rail.addEventListener('scroll',atEdge,{passive:true});atEdge();
    rail.addEventListener('wheel',function(e){
      if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){
        var max=rail.scrollWidth-rail.clientWidth,before=rail.scrollLeft;
        rail.scrollLeft+=e.deltaX;
        if((before<=0&&rail.scrollLeft<=0&&e.deltaX<0)||(before>=max&&rail.scrollLeft>=max&&e.deltaX>0)){
          rail.scrollLeft=before+e.deltaX*0.25;
        }
        e.preventDefault();
      }
    },{passive:false});
    var down=false,startX=0,startSL=0,moved=0;
    rail.addEventListener('mousedown',function(e){down=true;moved=0;startX=e.pageX;startSL=rail.scrollLeft;rail.classList.add('dragging');e.preventDefault();});
    window.addEventListener('mousemove',function(e){if(!down)return;var dx=e.pageX-startX;if(Math.abs(dx)>4)moved=1;rail.scrollLeft=startSL-dx;});
    window.addEventListener('mouseup',function(){if(!down)return;down=false;rail.classList.remove('dragging');});
    rail.addEventListener('click',function(e){if(moved){e.preventDefault();e.stopPropagation();moved=0;}},true);
    rail.addEventListener('keydown',function(e){
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
        var card=rail.querySelector('.card');var step=card?card.offsetWidth+16:288;
        rail.classList.add('snap');
        rail.scrollBy({left:(e.key==='ArrowRight'?1:-1)*step,behavior:'smooth'});
        e.preventDefault();
      }});
    rail.addEventListener('blur',function(){rail.classList.remove('snap');});
  }
  function initScrollSpy(){
    var tabs=document.querySelectorAll('.sections .tab');
    if(!tabs.length) return;
    var obs=new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){
        tabs.forEach(function(t){t.classList.toggle('on',t.dataset.sec===e.target.id.replace('sec-',''));});
      }});
    },{rootMargin:'-20% 0px -70% 0px'});
    document.querySelectorAll('.texgrid,.vcol').forEach(function(s){obs.observe(s);});
    if(tabs[0])tabs[0].classList.add('on');
  }

  /* ============ loader ============ */
  function boot(){
    applyTheme(localStorage.getItem('gazette.theme') || 'classic');
    window.addEventListener('error', function(e){
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#8a1c1c;color:#fff;font:12px monospace;padding:6px 10px;z-index:99999;white-space:pre-wrap;';
      d.textContent = 'JS ERROR: ' + (e.message||'') + ' @ ' + (e.filename||'').split('/').pop() + ':' + e.lineno;
      document.body && document.body.appendChild(d);
    });
    /* 0. seed snapshot: gazette-seed.js is an external file that assigns
       window.DATA directly (MV3 CSP forbids inline <script> JSON blocks),
       so nothing to parse here — window.DATA is either set or undefined. */
    /* 1. window.DATA (seed assignment or debug override) */
    /* P1: 记录本次访问时间（供「上次阅读」分隔线），先读旧值再覆盖 */
    window.__prevVisit = lastVisitGet(); lastVisitSet();
    if(window.DATA){ readPrune(window.DATA); render(window.DATA); lsSet(window.DATA); idbSet(window.DATA); bindReadOnce(); }
    /* 2. cache first-paint */
    var cached = lsGet();
    if(cached && !window.DATA){ render(cached); }
    else if(cached){ /* already rendered debug data */ }
    if(!cached && !window.DATA){
      idbGet().then(function(d){ if(d && !document.querySelector('.strip')){ render(d); } });
    }
    /* 3. fetch remote — cache-bust with seed's generated_at so a new deploy
       (new seed => new query param) always bypasses the browser disk cache */
    var bust = (window.DATA && window.DATA.generated_at) ? encodeURIComponent(window.DATA.generated_at) : '0';
    /* MWG 优化 #3: async/await 改写（skill 军规 #5） */
    (async function(){
      try{
        var r = await fetchT(REMOTE_URL + '?t=' + bust, {cache:'no-cache'});
        if(!r.ok) throw new Error('http '+r.status);
        var d = await r.json();
        /* v2.0.13a P2 fix: items 已从数据源剔除，payload 校验改为三板块任一有货
           （与 render() 的 hasContent 同口径；旧校验会把好数据误判为 bad payload） */
        var okPayload = d && (
          (d.aihot && ((d.aihot.feed||[]).length || (d.aihot.selected||[]).length || (d.aihot.hot||[]).length))
          || (d.finnews && (d.finnews.items||[]).length)
          || (d.fashion && (d.fashion.items||[]).length)
        );
        if(!okPayload) throw new Error('bad payload');
        readPrune(d);
        render(d);                       /* update cache + re-render */
        lsSet(d); idbSet(d);
        bindReadOnce();
        hideFail();
      }catch(e){
        /* silent: cache/seed already rendered */
        if(document.querySelector('.strip') || document.getElementById('ah-hot').children.length){
          showFail();
        } else {
          showFail(true);
        }
      }
    })();
  }
  /* P1 已读交互（v2.0.15）：document 级委托，绑一次。
     ① 点击 .tl-title（真链接）→ 标已读 + 卡片即时降墨
     ② 点击已读卡右上角 ● 恢复未读 */
  function bindReadOnce(){
    if(window.__readBound) return; window.__readBound = true;
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a.tl-title');
      if(a){
        var card = a.closest('.tl-card');
        if(card){
          var k = card.getAttribute('data-rkey');
          if(k && !readHas(k)){ readAdd(k); card.classList.add('tl-read'); addUnreadButtons(); refreshBadges(); }
        }
        return;
      }
      var undo = e.target.closest && e.target.closest('.tl-unread');
      if(undo){
        var c2 = undo.closest('.tl-card');
        if(c2){ var k2 = c2.getAttribute('data-rkey'); if(k2){ readDel(k2); c2.classList.remove('tl-read'); refreshBadges(); } }
      }
    }, true);
  }

  /* P1 (v2.0.15): 已读状态变化后即时刷新三徽章（不重渲染 snav） */
  function refreshBadges(){
    var d = window.DATA || {};
    var ai = d.aihot || {}, seen = {};
    var n = 0;
    [ai.feed, ai.selected].forEach(function(list){
      (list||[]).forEach(function(x){ var k=readKey(x); if(!seen[k]){ seen[k]=1; if(!readHas(k)) n++; } });
    });
    var nums = {};
    nums['AIHOT'] = n;
    nums['FIN NEWS'] = ((d.finnews||{}).items||[]).filter(function(x){return !readHas(readKey(x));}).length;
    nums['FASHION'] = ((d.fashion||{}).items||[]).filter(function(x){return !readHas(readKey(x));}).length;
    document.querySelectorAll('.snav-item .sn-badge').forEach(function(b){
      var item = b.closest('.snav-item'); if(!item) return;
      var f = item.getAttribute('data-filter');
      if(f in nums) b.textContent = nums[f] || '✓';
    });
  }

  /* P1 (v2.0.15): 已读卡统一补挂「恢复未读」角标（渲染后 DOM pass，一处覆盖三板块） */
  function addUnreadButtons(){
    document.querySelectorAll('.tl-card.tl-read').forEach(function(c){
      if(!c.querySelector('.tl-unread')){
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'tl-unread'; b.title = '恢复未读';
        b.setAttribute('aria-label', '恢复未读');
        b.textContent = '●';
        c.appendChild(b);
      }
    });
  }

  /* P1 (v2.0.15): 「上次阅读」分隔线——首个已读卡前插入；距上次访问>4h 才显示 */
  function markLastReadLine(wrap){
    if(!wrap) return;
    var prev = window.__prevVisit || 0;
    if(!prev || (Date.now() - prev) < 4*3600*1000) return;
    if(wrap.querySelector('.tl-lastread')) return;
    var first = wrap.querySelector('.tl-read');
    if(!first) return;
    var dt = new Date(prev);
    var label = (dt.getMonth()+1)+'月'+dt.getDate()+'日 '+p2(dt.getHours())+':'+p2(dt.getMinutes());
    first.insertAdjacentHTML('beforebegin',
      '<li class="tl-lastread" aria-hidden="true"><span>上次阅读 · '+label+'</span></li>');
  }

  function showFail(hard){
    var el = document.getElementById('load-status');
    if(!el) return;
    el.textContent = hard ? '数据加载失败，且无缓存可用' : '数据加载失败，显示缓存';
    el.style.display = 'block';
  }
  function hideFail(){ var el=document.getElementById('load-status'); if(el) el.style.display='none'; }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* ================= v2.0.17: 主题系统 ================= */
var THEMES = ['classic','salmon','snow','midnight'];
var THEME_META = {
  classic:  {zh:'米黄原版', dot:'#EFE6CE'},
  salmon:   {zh:'FT 三文鱼粉', dot:'#FFF1E0'},
  snow:     {zh:'雪白冷调', dot:'#FAFAF7'},
  midnight: {zh:'夜刊暖黑', dot:'#1C1A17'}
};
function applyTheme(t){
  if(THEMES.indexOf(t) < 0) t = 'classic';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('gazette.theme', t);
  var btn = document.getElementById('themeToggle');
  if(btn){
    btn.title = '配色：' + THEME_META[t].zh + '（点击切换）';
    var dot = btn.querySelector('.th-dot');
    if(dot) dot.style.background = THEME_META[t].dot;
  }
}
(function(){
  document.addEventListener('click', function(e){
    var btn = e.target.closest('#themeToggle');
    if(!btn) return;
    var cur = localStorage.getItem('gazette.theme') || 'classic';
    var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next);
  });
})();

;(function(){

  /* v2.2.4: 展开全文全局委托——覆盖 finnews（妙想/公告）+ tl 卡片（快讯/要闻/AIHOT） */
  tlPruneAfterFonts();
  if(!document.__mxDelgBound){
    document.__mxDelgBound = true;
    document.addEventListener('click', function(e){
      var b = e.target.closest('.dr-toggle[data-mx], .dr-toggle[data-mxtop], .dr-toggle[data-mxend]');
      if(!b) return;
      var card = b.closest('.tl-card'); if(!card) return;
      var full = card.querySelector('.mx-full'); if(!full) return;
      var open = full.hidden;
      full.hidden = !open;
      var main = card.querySelector('.mx-foot .dr-toggle');
      if(main) main.textContent = open ? '▴ 收起全文' : '展开全文 ▾';
    });
  }
})();
