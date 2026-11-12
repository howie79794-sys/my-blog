/* Gazette · Deep Reads 板块（v2.1.0 新增）
   数据：独立 JSON /assets/gazette-deepreads.json（按需拉取，主文件不带全文）
   结构：作者墙 + 搜索栏 + 单列时间线（原位展开全文） */
(function(){
  'use strict';
  var DR_STATE = { loaded:false, data:null, kw:'', src:null, openIds:{} };

  function drUrl(){
    return location.protocol === 'https:'
      ? '/assets/gazette-deepreads.json'
      : 'https://my-blog-howie79.vercel.app/assets/gazette-deepreads.json';
  }

  /* MWG 优化 #1: fetch 超时保护（8s），超时走空态降级 */
  function fetchT(url, opts, ms){
    ms = ms || 8000;
    if(typeof AbortController === 'undefined') return fetch(url, opts);
    var ctl = new AbortController();
    var timer = setTimeout(function(){ ctl.abort(); }, ms);
    opts = opts || {};
    opts.signal = ctl.signal;
    return fetch(url, opts).finally(function(){ clearTimeout(timer); });
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /* MWG 优化 #3: async/await 改写（skill 军规 #5） */
  async function drLoad(cb){
    if(DR_STATE.loaded) { cb && cb(); return; }
    var bust = Date.now();
    try{
      var r = await fetchT(drUrl() + '?t=' + bust, {cache:'no-cache'});
      var d = await r.json();
      DR_STATE.data = d; DR_STATE.loaded = true; drUpdateBadge(d); cb && cb();
    }catch(e){ /* 降级：留空态提示 */ cb && cb(true); }
  }

  /* v2.1.1: 数据到位后回写侧栏一级菜单徽章（renderSnav 渲染时可能数据未到） */
  function drUpdateBadge(d){
    var n = d && d.items ? d.items.length : 0;
    window.__drCount = n;
    var b = document.getElementById('dr-snbadge');
    if(b) b.textContent = n || '✓';
  }

  function fmtDate(iso){
    var d = new Date(iso); if(isNaN(d.getTime())) return '';
    function p(x){return (x<10?'0':'')+x;}
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }

  function drRender(){
    var wrap = document.getElementById('dr-feedwrap'); if(!wrap) return;
    var D = DR_STATE.data;
    if(!D || !D.items){ wrap.innerHTML = '<div class="src-empty" style="display:block">深度阅读数据加载失败</div>'; return; }

    /* 作者墙 */
    var wall = (D.authors||[]).map(function(a){
      return '<button type="button" class="dr-author'+(DR_STATE.src===a.key?' on':'')+'" data-drsrc="'+esc(a.key)+'">'
        +'<span class="dra-name">'+esc(a.zh)+'</span>'
        +'<span class="dra-en">'+esc(a.en)+'</span>'
        +'<span class="dra-bio">'+esc(a.bio)+'</span>'
        +'<span class="dra-cat">'+esc(a.cat)+'</span>'
        +'<span class="dra-n">'+a.n+' 篇</span></button>';
    }).join('');

    /* 过滤 */
    var kw = DR_STATE.kw.trim().toLowerCase();
    var items = D.items.filter(function(it){
      var okSrc = !DR_STATE.src || it.source === DR_STATE.src;
      var okKw = !kw || (it.title+' '+it.author+' '+it.excerpt).toLowerCase().indexOf(kw) >= 0;
      return okSrc && okKw;
    });

    /* 按月分组时间线 */
    var byMonth = {}, months = [];
    items.forEach(function(it){
      var m = (it.published||'').slice(0,7);
      if(!m) return;
      if(!byMonth[m]){ byMonth[m] = []; months.push(m); }
      byMonth[m].push(it);
    });
    months.sort().reverse();

    var tl = months.map(function(m){
      var cards = byMonth[m].map(function(it){
        var open = !!DR_STATE.openIds[it.id];
        return '<article class="dr-card'+(open?' open':'')+'" data-drid="'+esc(it.id)+'">'
          +'<div class="dr-card-head"><span class="dr-cat">'+esc(it.cat)+'</span>'
          +'<span class="dr-date">'+fmtDate(it.published)+' · '+it.words+'词 · '+it.imgs+'图</span></div>'
          +'<h3 class="dr-title">'+esc(it.title)+'</h3>'
          +'<p class="dr-lead">'+esc(it.excerpt)+'…</p>'
          +'<div class="dr-full"'+(open?' style="display:block"':'')+'>'
          /* v2.1.1: 正文顶部收起按钮——长文读到顶就能收，不用滚回底部（与底部按钮同 data-drid 联动） */
          +'<div class="dr-fulltop"><button type="button" class="dr-toggle dr-toggle-top" data-drid="'+esc(it.id)+'">▴ 收起全文</button></div>'
          +it.body_html
          +'</div>'
          +'<div class="dr-foot"><span class="dr-author-badge">'+esc(it.author)+'</span>'
          +'<span class="dr-actions">'
          +'<button type="button" class="dr-toggle" data-drid="'+esc(it.id)+'">'+(open?'▴ 收起全文':'▾ 展开全文')+'</button>'
          /* v2.1.5: 独立打开——跳转 Vercel 渲染页 /gazette/read/{id}/（浏览器级翻译工具可用） */
          +'<a class="dr-src-link" href="https://my-blog-howie79.vercel.app/gazette/read/'+encodeURIComponent(it.id)+'/" target="_blank" rel="noopener">独立打开 ↗</a>'
          +'<a class="dr-src-link" href="'+esc(it.url)+'" target="_blank" rel="noopener">原文 ↗</a>'
          +'</span></div></article>';
      }).join('');
      return '<div class="dr-month"><div class="dr-mnode"><span class="dr-mdate">'+m+'</span><span class="dr-mcount">'+byMonth[m].length+' 篇</span></div>'+cards+'</div>';
    }).join('');

    var nEl = document.getElementById('dr-n');
    if(nEl) nEl.textContent = D.items.length + ' 篇 · 六位作者 · 近三个月';

    wrap.innerHTML =
      '<div class="dr-wall">'+wall+'</div>'
      +'<div class="dr-search"><span class="dr-sicon">⌕</span>'
      +'<input id="dr-q" type="text" placeholder="搜索文章：标题、关键词、作者名…" value="'+esc(DR_STATE.kw)+'">'
      +'<span class="dr-shint">'+items.length+' 篇可见</span></div>'
      +(tl || '<div class="src-empty" style="display:block">没有匹配的文章 — 换个关键词试试</div>');
    drBind(wrap);
  }

  function drBind(wrap){
    if(!wrap.__bound){
      wrap.addEventListener('click', function(e){
        var tg = e.target.closest('.dr-toggle');
        if(tg){
          var id = tg.getAttribute('data-drid');
          DR_STATE.openIds[id] = !DR_STATE.openIds[id];
          var card = wrap.querySelector('.dr-card[data-drid="'+id+'"]');
          if(card){
            var full = card.querySelector('.dr-full');
            var nowOpen = DR_STATE.openIds[id];
            card.classList.toggle('open', nowOpen);
            full.style.display = nowOpen ? 'block' : 'none';
            /* v2.1.1: 卡内全部 toggle 同步（顶部+底部按钮状态一致） */
            card.querySelectorAll('.dr-toggle').forEach(function(b){
              b.textContent = nowOpen ? '▴ 收起全文' : '▾ 展开全文';
            });
          }
          return;
        }
        var ab = e.target.closest('.dr-author');
        if(ab){
          var k = ab.getAttribute('data-drsrc');
          DR_STATE.src = (DR_STATE.src === k) ? null : k;
          drRender();
          return;
        }
      });
      wrap.addEventListener('input', function(e){
        if(e.target.id === 'dr-q'){
          DR_STATE.kw = e.target.value;
          var pos = e.target.selectionStart;
          drRender();
          var inp = document.getElementById('dr-q');
          if(inp){ inp.focus(); inp.setSelectionRange(pos, pos); }
        }
      });
      wrap.__bound = true;
    }
  }

  /* 暴露给主流程：侧栏点击时调用 */
  window.drEnter = function(){
    drLoad(function(){ drRender(); });
  };
  /* 预取：空闲时后台拉一次，点进板块秒开 */
  window.addEventListener('load', function(){
    setTimeout(function(){ drLoad(); }, 2500);
  });
})();
