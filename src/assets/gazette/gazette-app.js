
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
    var items = DATA.items, AI = DATA.aihot || {};
    /* v1.1 dateblock fill */
  try {
    var db = DATA.dateblock;
    if (db) {
      var g = document.querySelector('.m-dateblock .db-g');
      var l = document.querySelector('.m-dateblock .db-l');
      var c = document.querySelector('.m-dateblock .db-c');
      if (g) g.textContent = db.gregorian + ' · ' + db.weekday;
      if (l) l.textContent = db.lunar.replace(' (马年)', ' · ') + '年';
      if (c) c.textContent = db.chinese;
      var mdate = document.querySelector('.m-date span');
      if (mdate && db.gregorian) mdate.textContent = db.gregorian.replace(/ /g, '') + ' · ' + db.weekday;
    }
  } catch (e) {}

var main = document.getElementById('main');
    /* idempotent: remove previous dynamic sections + ai-extra + src-empty before re-render */
    if(__rendered){
      main.querySelectorAll('.ai-extra, section.vcol:not([id^="sec-aihot"]), .texgrid').forEach(function(el){ el.remove(); });
      var em = main.querySelector('.src-empty'); if(em) em.remove();
    }
    __rendered = true;

    /* group items by section */
    var groups = {};
    items.forEach(function(it){ (groups[it.section] = groups[it.section] || []).push(it); });

    /* ---- AI front: lead + briefsbox + ai-extra ---- */
    var aiItems = (groups.ai || []).slice().sort(function(a,b){ return (b.score||0)-(a.score||0); });
    var frontHtml = '', aiExtraHtml = '';
    if(aiItems.length){
      var lead = aiItems[0];
      var zhTitle = lead.title_zh || lead.title;
      var enLine = (lead.lang === 'en' && lead.title_zh) ? '<div class="lead-en">'+esc(lead.title)+'</div>' : '';
      var frontHtml = '';
      var more = [];
    }
    var front = document.getElementById('sec-ai');
    front.innerHTML = frontHtml;

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
                +'<div class="ct-src">'+esc(it.source)+'</div></div></a>';
            }).join('') + '</div></div></div>';
        var moreHtml = '';
        if(rest.length){
          moreHtml = '<div class="vmore"><span class="vm-h">文字快讯 · MORE BRIEFS</span><ol class="cols2">'
            + rest.map(function(it){
                var zh = it.title_zh || it.title;
                var tz = (it.lang === 'en' && it.title_zh) ? '<div class="tz-line">'+esc(it.title)+'</div>' : '';
                return '<li data-src="'+esc(it.source)+'"><a href="'+esc(it.url)+'" target="_blank" rel="noopener"><div class="t">'+esc(zh)+'</div>'+tz
                  +'<div class="m"><span class="src">'+esc(it.source)+'</span><span class="dt">'+esc(fmtDT(it.published))+'</span></div></a></li>';
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
                    +'<div class="li-m"><span>'+esc(it.source)+'</span>'+(it.published?' · <span>'+esc(fmtD(it.published))+'</span>':'')+'</div></a></li>';
                }).join('') + '</ol></div>';
          }).join('') + '</div>';
      }
    });
    /* insert: rail/texgrid sections after AIHOT modules (before </main>), ai-extra right after front */
    main.insertAdjacentHTML('beforeend', aiExtraHtml + html);

    /* ---- AIHOT modules ---- */
    renderFeed(AI); renderHot(AI); renderSelected(AI); renderDaily(AI);
    initAihotTabs();
    if(!document.body.getAttribute('data-aihot-view')) setAihotView('feed');

    /* ---- snav (dynamic) ---- */
    renderSnav(items, AI);

    /* ---- footer ---- */
    stampFooter(DATA, AI, items);

    /* ---- bind behaviors on freshly rendered DOM ---- */
    document.querySelectorAll('.rail').forEach(initRail);
    window.__rails = Array.from(document.querySelectorAll('.rail'));
    initScrollSpy();
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
        +'<span class="hr-sub">'+esc(src)+' · '+(h.signalCount||0)+' 信号 · '+(h.participantCount||0)+' 参与 · 最新 '+fmtDT(h.latestAt)+'</span></span>'
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
      var hi = (s.score||0)>=max-2 ? ' hi':'';
      var cat = s.category ? '<span class="cat">'+esc(s.category)+'</span>' : '';
      var reason = s.reason
        ? '<button type="button" class="sr-flag" aria-expanded="false">理由 ▾</button>'
          +'<div class="sr-reason">'+esc(s.reason)+'</div>' : '';
      return '<li><div class="sel-row" data-src="AIHOT">'
        +'<span class="sr-score'+hi+'">'+esc(s.score)+'</span>'
        +'<div class="sr-main"><a class="sr-title" href="'+esc(itemUrl(s))+'" target="_blank" rel="noopener">'+esc(s.title)+'</a>'
        +'<div class="sr-meta"><span>'+esc(srcName(s.source))+'</span>'+cat+'<span>'+fmtD(s.publishedAt)+'</span></div>'
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
      var scoreCls = (f.score||0) >= Math.max(maxScore-8, (maxScore||0)*0.85) ? '' : ' lo';
      var selTag = f.selected ? '<span class="tl-sel">精选</span>' : '';
      var cat = f.category ? '<span class="tl-cat">'+esc(f.category)+'</span>' : '';
      var flag = f.reason ? '<button type="button" class="tl-flag" aria-expanded="false">理由 ▾</button>' : '';
      return '<li class="tl-card'+selCls+dayBreak+'" data-src="AIHOT">'
        +'<div class="tl-when"><div class="d1">'+d1+'</div><div class="d2">'+esc(d2)+'</div></div>'
        +'<div class="tl-dot" aria-hidden="true"></div>'
        +'<div class="tl-body">'
          +'<div class="tl-head"><a class="tl-title" href="'+esc(itemUrl(f))+'" target="_blank" rel="noopener">'+esc(f.title)+'</a>'
          +(score!==''?'<span class="tl-score'+scoreCls+'">SCORE '+esc(score)+'</span>':'')+'</div>'
          +'<div class="tl-tags">'+selTag+cat+'<span class="tl-src">'+esc(srcName(f.source))+'</span>'+flag+'</div>'
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
  }

  /* ---- AIHOT sub-view switching (v1.2): feed / selected / daily ---- */
  function setAihotView(v){
    document.body.setAttribute('data-aihot-view', v||'');
    document.querySelectorAll('#ah-tabs .ah-tab').forEach(function(t){
      var on = t.getAttribute('data-ahview')===v;
      t.classList.toggle('on', on);
    });
    document.querySelectorAll('.snav-sub .snav-subitem').forEach(function(t){
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
            +'<span class="m">'+esc(srcName(it.source))+'</span></li>';
        }).join('') + '</ul></div>';
    }).join('') + '</div>';
    html += '<div class="yd-flashes"><span class="vm-h">快讯 · FLASHES</span><ol>'
      + D.flashes.map(function(f){
        return '<li data-src="AIHOT"><span class="f-d">'+fmtD(f.publishedAt)+'</span>'
          +'<a class="f-t" href="'+esc(itemUrl(f))+'" target="_blank" rel="noopener">'+esc(f.title)+'</a>'
          +'<span class="f-s">'+esc(srcName(f.source))+'</span></li>';
      }).join('') + '</ol></div>';
    box.innerHTML = html;
    var cnt = D.sections.reduce(function(a,s){return a+s.items.length;},0);
    var n=document.getElementById('ah-daily-n'); if(n) n.textContent = D.date+' · '+D.sections.length+' 栏 '+cnt+' 条 · 快讯 '+D.flashes.length+' 条';
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
    var badges = '<button class="snav-item on" data-filter="ALL" type="button" role="tab" aria-selected="true"><span class="sn-name">📰 全部 <em>整份报纸</em></span><span class="sn-badge">'+allN+'</span></button>';
    order.forEach(function(src){
      var display = zhNames[src] || src;
      var bN = (src==='AIHOT' && feedN0) ? feedN0 : counts[src];
      badges += '<button class="snav-item" data-filter="'+esc(src)+'" type="button" role="tab" aria-selected="false"><span class="sn-name">'+esc(display)+'<i>'+esc(src)+'</i></span><span class="sn-badge">'+bN+'</span></button>';
      /* v1.2: AIHOT second-level menu */
      if(src==='AIHOT'){
        var feedN = feedN0 || (AI.selected||[]).length;
        badges += '<div class="snav-sub">'
          +'<button class="snav-subitem on" data-ahview="feed" type="button"><span class="sb-n">全部动态</span><span class="sb-badge">'+feedN+'</span></button>'
          +'<button class="snav-subitem" data-ahview="selected" type="button"><span class="sb-n">精选</span><span class="sb-badge">'+(AI.selected||[]).length+'</span></button>'
          +'<button class="snav-subitem" data-ahview="daily" type="button"><span class="sb-n">日报</span><span class="sb-badge">'+(AI.daily?'1':'0')+'</span></button>'
          +'</div>';
      }
    });
    nav.innerHTML = '<div class="snav-h">SOURCES · 信源</div>' + badges;
    /* sub-item clicks: only switch AIHOT view, never the source filter */
    if(!nav.__subBound){
      nav.addEventListener('click', function(e){
        var sub = e.target.closest('.snav-subitem'); if(!sub) return;
        e.stopPropagation();
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
      f2.textContent = '数据更新于 '+ts+' · 共 '+items.length+' 条 · '+nImg+' 图文 · The Morning Tab 浅色版 v0.6 壳版 · 远程 JSON + 缓存 + seed 降级';
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
    /* 0. embedded seed snapshot (first-open offline content) */
    if(!window.DATA){
      var seedEl = document.getElementById('gazette-seed');
      if(seedEl){ try{ window.DATA = JSON.parse(seedEl.textContent); }catch(e){} }
    }
    /* 1. window.DATA (debug or seed) */
    if(window.DATA){ render(window.DATA); lsSet(window.DATA); idbSet(window.DATA); }
    /* 2. cache first-paint */
    var cached = lsGet();
    if(cached && !window.DATA){ render(cached); }
    else if(cached){ /* already rendered debug data */ }
    if(!cached && !window.DATA){
      idbGet().then(function(d){ if(d && !document.querySelector('.strip')){ render(d); } });
    }
    /* 3. fetch remote */
    fetch(REMOTE_URL, {cache:'no-cache'})
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
