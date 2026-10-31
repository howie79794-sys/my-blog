
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
  function lsSet(d){ try{ var s=JSON.stringify(d); if(s.length<=LS_MAX) localStorage.setItem(CACHE_KEY,s); }catch(e){} }
  function idbOpen(){ return new Promise(function(res){ 
    if(!window.indexedDB) return res(null);
    try{ var rq=indexedDB.open('gazette',1);
      rq.onupgradeneeded=function(){ try{ rq.result.createObjectStore('kv'); }catch(e){} };
      rq.onsuccess=function(){ res(rq.result); }; rq.onerror=function(){ res(null); };
    }catch(e){ res(null); } });
  }
  function idbGet(){ return idbOpen().then(function(db){ return new Promise(function(res){
    if(!db) return res(null);
    try{ var tx=db.transaction('kv','readonly').objectStore('kv').get('data');
      tx.onsuccess=function(){ res(tx.result||null); }; tx.onerror=function(){ res(null); };
    }catch(e){ res(null); } }); }); }
  function idbSet(d){ idbOpen().then(function(db){ if(!db) return;
    try{ db.transaction('kv','readwrite').objectStore('kv').put(d,'data'); }catch(e){} }); }

  /* ============ render(DATA) ============ */
  var __rendered = false;
  function render(DATA){
    if(!DATA || !DATA.items || !DATA.items.length) return;
    /* v1.6: fetch 到的新数据同步回 window.DATA，保证子菜单切换等交互读到最新 */
    window.DATA = DATA;
    var items = DATA.items, AI = DATA.aihot || {};
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
      if (g) g.textContent = db.gregorian + ' · ' + db.weekday;
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
        var digits = String(db.gregorian).replace(/\D/g,'');
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

    /* ---- sections after the AIHOT modules: rail sections (with images) + texgrids ---- */
    var html = '';
    SEC_ORDER.forEach(function(sec){
      if(sec === 'ai' || !groups[sec]) return;
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
    renderFeed(AI); renderHot(AI); renderSelected(AI); renderDaily(AI); renderFinnews(DATA);
    initAihotTabs();
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
    if(typeof window.__applySourceFilter === 'function') window.__applySourceFilter(document.body.getAttribute('data-view') || 'ALL');
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
  function tlHtml(list, label){
    if(!list || !list.length) return '';
    list = list.slice().sort(function(a,b){
      var da=new Date(a.publishedAt||0), db=new Date(b.publishedAt||0);
      return db-da || (b.score||0)-(a.score||0); });
    var maxScore = list.reduce(function(m,x){return Math.max(m,x.score||0);},0);
    var lastDay = '';
    var html = '<ol class="ah-timeline">' + list.map(function(f){
      var d = new Date(f.publishedAt||'');
      var ok = !isNaN(d);
      var d1 = ok ? p2(d.getDate()) : '—';
      var d2 = ok ? (d.getMonth()+1)+'月 '+p2(d.getHours())+':'+p2(d.getMinutes()) : '';
      var dayKey = ok ? d.toDateString() : '';
      var dayBreak = (dayKey && dayKey!==lastDay) ? ' tl-daybreak' : '';
      if(dayKey) lastDay = dayKey;
      var selCls = f.selected ? '' : ' tl-plain';
      var score = (f.score!=null) ? f.score : '';
      /* P1-4: only the top band keeps the solid brick fill; the rest is a
         quiet tint chip so the badge never outshouts the headline. */
      var scoreCls = (f.score||0) >= Math.max(maxScore-8, (maxScore||0)*0.85) ? ' hi' : '';
      var selTag = f.selected ? '<span class="tl-sel">精选</span>' : '';
      var cat = f.category ? '<span class="tl-cat">'+esc(f.category)+'</span>' : '';
      var flag = f.reason ? '<button type="button" class="tl-flag" aria-expanded="false">理由 ▾</button>' : '';
      /* P1-1 + P1-2 ③: source / platform / author are PLAIN TEXT (no second
         link — the headline already links out; a duplicate tab stop per card
         would triple the keyboard path through 112 cards). */
      var srcText = metaInner(f.source);
      return '<li class="tl-card'+selCls+dayBreak+'" data-src="AIHOT">'
        +'<div class="tl-when"><div class="d1">'+d1+'</div><div class="d2">'+esc(d2)+'</div></div>'
        +'<div class="tl-dot" aria-hidden="true"></div>'
        +'<div class="tl-body">'
          +'<div class="tl-head"><a class="tl-title" href="'+esc(itemUrl(f))+'" target="_blank" rel="noopener">'+esc(f.title)+'</a>'
          +(score!==''?'<span class="tl-score'+scoreCls+'">SCORE '+esc(score)+'</span>':'')+'</div>'
          +'<div class="tl-tags">'+selTag+cat+'<span class="tl-src">'+srcText+'</span>'+flag+'</div>'
          +(f.summary?'<div class="tl-sum">'+esc(f.summary)+'</div>':'')
          +(f.reason?'<div class="tl-reason">'+esc(f.reason)+'</div>':'')
        +'</div></li>';
    }).join('') + '</ol>';
    html += '<div class="ah-more">— '+esc(label)+' · 共 '+list.length+' 条 · 按时间倒序 —</div>';
    return html;
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
    /* v1.6.4: 侧栏子菜单选中态 + 内容区标题 随档位同步（setAihotView 同构） */
    document.querySelectorAll('.snav-subitem[data-fncat]').forEach(function(t){
      t.classList.toggle('on', t.getAttribute('data-fncat')===cat);
    });
    var sec = document.getElementById('sec-finnews');
    if(sec){
      var zh = sec.querySelector('.vh-zh'), en = sec.querySelector('.vh-en');
      var meta = FN_CATS.filter(function(c){return c.key===cat;})[0];
      if(zh && meta) zh.textContent = '金融快讯 · ' + meta.zh;
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
    if(!catCounts[curCat]) { /* 当前档空则回落到第一档有数据的 */
      curCat = (FN_CATS.filter(function(c){return catCounts[c.key];})[0]||FN_CATS[0]).key;
      document.body.setAttribute('data-fn-cat', curCat);
      syncFnCatUI(curCat);
    }
    var shown = list.filter(function(f){ return (f.category||'headline')===curCat; });
    var nEl = document.getElementById('fn-n');
    if(nEl) nEl.textContent = list.length ? (list.length + ' 条 · 三源聚合') : '今日安静，无快讯';
    /* 子菜单条（放 feedwrap 顶部，独立于左侧栏） */
    var subBar = document.getElementById('fn-subbar');
    if(subBar){
      subBar.innerHTML = FN_CATS.map(function(c){
        return '<button class="snav-subitem'+(curCat===c.key?' on':'')+'" data-fncat="'+c.key+'" type="button" title="'+esc(c.zh+' · '+c.hint)+'"><span class="sb-n">'+c.zh+'</span><span class="sb-badge">'+(catCounts[c.key]||0)+'</span></button>';
      }).join('');
      if(!subBar.__bound){
        subBar.addEventListener('click', function(e){
          var b = e.target.closest('[data-fncat]'); if(!b) return;
          setFnCat(b.getAttribute('data-fncat'));
        });
        subBar.__bound = true;
      }
    }
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
      return '<li class="tl-card tl-plain'+dayBreak+'" data-src="FIN NEWS">'
        +'<div class="tl-when"><div class="d1">'+d1+'</div><div class="d2">'+esc(d2)+'</div></div>'
        +'<div class="tl-dot" aria-hidden="true"></div>'
        +'<div class="tl-body">'
          +'<div class="tl-head">'+titleHtml+'</div>'
          +'<div class="tl-tags">'+kindTag+echoTag+'<span class="tl-src"><b>来源：</b>'+esc(f.source||'')+'</span>'+flag+'</div>'
          +(f.reason?'<div class="tl-reason">'+esc(f.reason)+'</div>':'')
          +(f.summary?'<div class="tl-sum">'+esc(f.summary)+'</div>':'')
        +'</div></li>';
    }).join('') + '</ol>';
    html += '<div class="ah-more">— FIN NEWS · 共 '+list.length+' 条 · 当前「'+esc((FN_CATS.filter(function(c){return c.key===curCat;})[0]||{}).zh||'')+'」'+shown.length+' 条 · 同花顺快讯 + Wind 深度 + 东财要闻 · 按时间倒序 —</div>';
    wrap.innerHTML = html;
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
    var zhNames = {'AIHOT':'AIHOT','Hacker News':'Hacker News','The Verge':'The Verge','sspai':'少数派','Pitchfork':'Pitchfork','BBC Football':'BBC Football','Sky Sports':'Sky Sports','Hypebeast':'Hypebeast','Highsnobiety':'Highsnobiety','FT中文网':'FT中文网','The Economist':'The Economist','BBC中文':'BBC中文'};
    var feedN0 = (AI.feed && AI.feed.length) ? AI.feed.length : 0;
    var nonAi = items.filter(function(it){return it.source!=='AIHOT';}).length;
    var allN = nonAi + feedN0;
    var fnN = ((window.DATA && window.DATA.finnews && window.DATA.finnews.items) || []).length;
    allN += fnN;
    /* preserve the currently selected source filter + AIHOT sub-view across re-renders */
    var curView = document.body.getAttribute('data-view') || 'ALL';
    var curAihot = document.body.getAttribute('data-aihot-view') || 'feed';
    /* P2-4: the left rail's first row filters by *source* — it must not be
       called 全部动态, which is the AIHOT timeline tab.  全部信源 = "all
       outlets"; the AIHOT tab keeps 全部动态 untouched. */
    var badges = '<button class="snav-item'+(curView==='ALL'?' on':'')+'" data-filter="ALL" type="button" role="tab" aria-selected="'+(curView==='ALL')+'"><span class="sn-name">📰 全部信源 <em>整份报纸</em></span><span class="sn-badge">'+allN+'</span></button>';
    order.forEach(function(src){
      var display = zhNames[src] || src;
      var bN = (src==='AIHOT' && feedN0) ? feedN0 : counts[src];
      badges += '<button class="snav-item'+(src===curView?' on':'')+'" data-filter="'+esc(src)+'" type="button" role="tab" aria-selected="'+(src===curView)+'"><span class="sn-name">'+esc(display)+'<i>'+esc(src)+'</i></span><span class="sn-badge">'+bN+'</span></button>';
      /* v1.2: AIHOT second-level menu */
      if(src==='AIHOT'){
        var feedN = feedN0 || (AI.selected||[]).length;
        badges += '<div class="snav-sub">'
          +'<button class="snav-subitem'+(curAihot==='feed'?' on':'')+'" data-ahview="feed" type="button"><span class="sb-n">全部动态</span><span class="sb-badge">'+feedN+'</span></button>'
          +'<button class="snav-subitem'+(curAihot==='selected'?' on':'')+'" data-ahview="selected" type="button"><span class="sb-n">精选</span><span class="sb-badge">'+(AI.selected||[]).length+'</span></button>'
          +'<button class="snav-subitem'+(curAihot==='daily'?' on':'')+'" data-ahview="daily" type="button"><span class="sb-n">日报</span><span class="sb-badge">'+(AI.daily?'1':'0')+'</span></button>'
          +'</div>';
        /* v1.4.1: FIN NEWS as a top-level rail item AFTER the AIHOT sub-menu
           (sibling of AIHOT, below 日报) — user-approved placement */
        badges += '<button class="snav-item'+(curView==='FIN NEWS'?' on':'')+'" data-filter="FIN NEWS" type="button" role="tab" aria-selected="'+(curView==='FIN NEWS')+'"><span class="sn-name">💰 FIN NEWS<i>同花顺 · Wind · 东财</i></span><span class="sn-badge">'+fnN+'</span></button>';
        /* v1.6.1: FIN NEWS second-level sub-menu under the rail item
           (same pattern as AIHOT's 全部动态/精选/日报) — 快讯/要闻/公告/研究 */
        var fnItems = (window.DATA && window.DATA.finnews && window.DATA.finnews.items) || [];
        var fnCounts = {};
        fnItems.forEach(function(f){ var c = f.category || 'headline'; fnCounts[c] = (fnCounts[c]||0)+1; });
        var curFnCat = document.body.getAttribute('data-fn-cat') || 'flash';
        badges += '<div class="snav-sub">'
          +'<button class="snav-subitem'+(curFnCat==='flash'?' on':'')+'" data-fncat="flash" type="button"><span class="sb-n">快讯</span><span class="sb-badge">'+(fnCounts.flash||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFnCat==='headline'?' on':'')+'" data-fncat="headline" type="button"><span class="sb-n">要闻</span><span class="sb-badge">'+(fnCounts.headline||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFnCat==='filing'?' on':'')+'" data-fncat="filing" type="button"><span class="sb-n">公告</span><span class="sb-badge">'+(fnCounts.filing||0)+'</span></button>'
          +'<button class="snav-subitem'+(curFnCat==='research'?' on':'')+'" data-fncat="research" type="button"><span class="sb-n">研究</span><span class="sb-badge">'+(fnCounts.research||0)+'</span></button>'
          +'</div>';
      }
    });
    nav.innerHTML = '<div class="snav-h">SOURCES · 信源</div>' + badges;
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
    var nImg = items.filter(function(i){return i.image_data;}).length;
    var f2 = document.getElementById('f-meta');
    if(f2){
      var t = DATA.generated_at ? new Date(DATA.generated_at) : null;
      function p(x){return (x<10?'0':'')+x;}
      var ts = (t && !isNaN(t)) ? t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate())+' '+p(t.getHours())+':'+p(t.getMinutes()) : '—';
      f2.textContent = '数据更新于 '+ts+' · 共 '+items.length+' 条 · '+nImg+' 图文 · The Morning Tab 浅色版 v1.6.2 · 远程 JSON + 缓存 + seed 降级';
    }
    var el = document.getElementById('aihot-ftime');
    if(el && AI.fetchedAt){ var d=new Date(AI.fetchedAt);
      function q(x){return (x<10?'0':'')+x;}
      el.textContent = 'AIHOT 数据更新时间 '+d.getFullYear()+'-'+q(d.getMonth()+1)+'-'+q(d.getDate())+' '+q(d.getHours())+':'+q(d.getMinutes())+' · 三模块（热点榜/精选/昨日日报）· 计划每 3 小时轮刷';
    }
    var fs = document.getElementById('f-sources');
    if(fs){
      var set=[]; items.forEach(function(i){ if(set.indexOf(i.source)<0) set.push(i.source); });
      fs.textContent = '数据源（'+set.length+' 家）：'+set.join(' · ');
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
    if(window.DATA){ render(window.DATA); lsSet(window.DATA); idbSet(window.DATA); }
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
    fetch(REMOTE_URL + '?t=' + bust, {cache:'no-cache'})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
      .then(function(d){
        if(!d || !d.items || !d.items.length) throw new Error('bad payload');
        render(d);                       /* update cache + re-render */
        lsSet(d); idbSet(d);
        hideFail();
      })
      .catch(function(){
        /* silent: cache/seed already rendered */
        if(document.querySelector('.strip') || document.getElementById('ah-hot').children.length){
          showFail();
        } else {
          showFail(true);
        }
      });
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
