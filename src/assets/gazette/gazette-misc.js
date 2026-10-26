/* ================= v0.4 source filter · v1.3 fix C/B ================= */
(function(){
  'use strict';
  var main = document.getElementById('main');
  var empty = document.createElement('div');
  empty.className='src-empty'; empty.textContent='此信源本日暂无更多内容 · NOTHING MORE HERE TODAY';
  main.appendChild(empty);

  function apply(filter){
    var count=0;
    document.body.classList.toggle('hide-others', filter!=='ALL');
    /* v1.2: re-query each time — AIHOT timeline/hot/daily items are rendered dynamically */
    var items = document.querySelectorAll('[data-src],[data-src-extra]');
    items.forEach(function(el){
      var s = el.getAttribute('data-src') || el.getAttribute('data-src-extra');
      var show = (filter==='ALL') || (s===filter);
      el.classList.toggle('dimmed', !show);
      if(show) count++;
    });
    // hide containers whose every item hidden: catcol ol, briefsbox ul, strip, vmore ol, front, sections
    document.querySelectorAll('.catcol ol, .briefsbox ul, .vmore ol, .strip').forEach(function(list){
      var vis = list.querySelector('li:not(.dimmed), a.card:not(.dimmed)');
      var host = list.closest('.catcol, .briefsbox, .vmore, .vcol') || list.parentElement;
      // mark list itself
      if(!vis){ list.style.display='none'; } else { list.style.display=''; }
    });
    // catcol hide if its ol empty
    document.querySelectorAll('.catcol').forEach(function(c){
      var vis = c.querySelector('li:not(.dimmed)');
      c.classList.toggle('sec-hidden', !vis);
    });
    // vmore: hide its vm-h too if empty
    document.querySelectorAll('.vmore').forEach(function(v){
      var vis = v.querySelector('li:not(.dimmed)');
      var head = v.querySelector('.vm-h');
      if(head) head.style.display = vis ? '' : 'none';
      if(!vis) v.style.borderTop='none'; else v.style.borderTop='';
    });
    // section-level: front / ai-extra / vcol / texgrid — hide if no visible item AND no visible lead
    document.querySelectorAll('.front,.ai-extra,.vcol,.texgrid').forEach(function(sec){
      var vis = sec.querySelector('[data-src]:not(.dimmed),[data-src-extra]:not(.dimmed)');
      sec.classList.toggle('sec-hidden', !vis);
    });
    // briefsbox box hide if empty
    document.querySelectorAll('.briefsbox').forEach(function(b){
      var vis = b.querySelector('li:not(.dimmed)');
      b.classList.toggle('sec-hidden', !vis);
    });
    // empty state (bug C: single source of truth, re-runs after every render via
    // window.__applySourceFilter so the ghost banner never survives real content)
    empty.style.display = count===0 ? 'block' : 'none';
  }
  window.__applySourceFilter = apply;   /* gazette-app.js render() calls this after each render */

  var nav = document.getElementById('snav');
  nav.addEventListener('click', function(e){
    var btn = e.target.closest('.snav-item'); if(!btn) return;
    nav.querySelectorAll('.snav-item').forEach(function(b){
      var on = b===btn; b.classList.toggle('on',on); b.setAttribute('aria-selected',on);
    });
    var f = btn.getAttribute('data-filter');
    document.body.setAttribute('data-view', f==='ALL' ? '' : f);
    /* bug B: leaving the AIHOT source filter resets the AIHOT sub-view to feed,
       otherwise stale [data-aihot-view=daily] CSS rules keep hiding the timeline */
    if(f!=='AIHOT' && document.body.getAttribute('data-aihot-view') && document.body.getAttribute('data-aihot-view')!=='feed'){
      document.body.setAttribute('data-aihot-view','feed');
      document.querySelectorAll('.ah-tab, .snav-subitem').forEach(function(t){
        t.classList.toggle('on', t.getAttribute('data-ahview')==='feed');
      });
    }
    apply(f);
    window.scrollTo({top:0,behavior:'smooth'});
  });
  apply('ALL');
})();
