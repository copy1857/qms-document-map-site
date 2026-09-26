(() => {
  'use strict';

  // ------------------------------------------------------------ 小工具
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  // 手機／觸控裝置：關閉毛玻璃、光暈濾鏡等耗記憶體的效果（iOS 上會讓整頁當掉）
  const SMALL = () => matchMedia('(max-width: 720px)').matches;
  const LITE = matchMedia('(max-width: 720px), (hover: none), (pointer: coarse)').matches;
  if (LITE) document.documentElement.classList.add('lite');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const normCode = s => String(s || '').toUpperCase().replace(/[\s]/g, '').replace(/[─\-–—－‐_]/g, '-');
  const codeOf = key => key.split('#')[1] || key;
  const LV = {
    1: { short: '一階', kind: '品質手冊', q: '公司為什麼、以什麼原則做品質？' },
    2: { short: '二階', kind: '程序書', q: '這件事由誰、依什麼流程做？' },
    3: { short: '三階', kind: '三階文件', q: '這個步驟具體要怎麼操作？' },
    4: { short: '紀錄', kind: '紀錄表單', q: '做完之後留下什麼證明？' },
  };
  const CHAPTERS = { 4: '4 品質管理系統（文件與紀錄）', 5: '5 管理責任', 6: '6 資源管理', 7: '7 產品實現', 8: '8 量測、分析與改進', 0: '其他' };
  const ISSUE_HELP = {
    '未列附錄': '本文有引用這張表單，但程序書第 7 章的附錄清單沒有列出。',
    '附錄未引用': '附錄有列這張表單，但本文沒有任何條文說明何時使用。',
    '上層未收錄': '表單的上層文件（多為三階）還沒放進 source 資料夾，無法核對。',
    '文件未收錄': '被引用的程序書不在 source 資料夾中。',
    '名稱不一致': '同一個編號，在不同地方的名稱寫法不同。',
    '編號跳號': '表單流水號中間有缺號，可能已刪除，請確認修訂紀錄。',
    '未列相關文件': '本文引用了其他文件，但第 4 章「相關文件」沒有列出。',
    '相關文件未引用': '第 4 章「相關文件」有列，但本文沒有引用。',
    '缺名稱': '只看到編號，找不到文件名稱。',
    '編號重複使用': '修訂紀錄已刪除的表單編號，又被新表單使用（違反 CP─01 6.1.10）。',
    '已刪除仍被引用': '修訂紀錄已刪除的表單，仍被其他文件引用。',
    'ISO對照不一致': '程序書第 1 條宣告的 ISO／QMS 條文，與品質手冊附錄A 的對照不同。',
    'ISO對照未列': '品質手冊附錄A 對應到此程序書的條文，程序書第 1 條沒有列出。',
    '保存期限未列': '附錄有這張表單，但保存期限表沒有列出。',
    '保存期限表多列': '保存期限表有這張表單，但附錄清單沒有。',
    '名稱簡寫': '引用時省略了部分字詞（非錯誤，建議統一用完整名稱）。',
    '已刪除表單': '缺號已在修訂紀錄中記載刪除，屬正常。',
    '部門代號未定義': '三階文件編號的部門代號不在 CP─01 表2，組織圖也對應不到單位。',
    '編號與總覽表不符': '程序書引用的三階編號不在文件總覽表，但總覽表有同名文件（編號已變更）。',
    '總覽表未列': '程序書引用的三階文件在文件總覽表中查無編號，也沒有同名文件。',
    '與總覽表不符': '原文封面的版次或施行日與文件總覽表不同。',
    '逾期未審視': '文件總覽表的屆期日期已過，仍未改版或更新審視。',
  };
  const SEV_ORDER = { '重要': 0, '注意': 1, '提示': 2 };
  // 公開唯讀版（tools/publish.py 產生）：不連伺服器、不顯示一致性檢查與上傳
  const PUBLISH = !!(window.QMS_GRAPH && window.QMS_GRAPH.publish);
  const LIVE = location.protocol.startsWith('http') && !PUBLISH;

  let G = null;
  const N = new Map();       // key -> node
  const KIDS = new Map();    // key -> [child keys]
  const PS = new Map();      // key -> 有效上層（存在於資料中）
  let ROOT = null;
  const recent = { added: new Set(), changed: new Set(), removed: [] };

  // ------------------------------------------------------------ 資料索引
  function index(graph) {
    G = graph;
    N.clear(); KIDS.clear(); PS.clear();
    for (const n of G.nodes) N.set(n.key, n);
    for (const gp of G.groups || []) N.set(gp.key, gp);
    const l1 = G.nodes.filter(n => n.level === 1);
    if (l1.length === 1) ROOT = l1[0].key;
    else {
      ROOT = 'QMS#__root';
      N.set(ROOT, { key: ROOT, code: 'QMS', name: '品質管理系統', level: 1, parents: [], status: 'virtual' });
    }
    for (const n of N.values()) {
      if (n.key === ROOT) continue;
      let ps = (n.parents || []).filter(p => N.has(p));
      if (!ps.length) ps = [ROOT];
      if (n.level === 1 && ROOT === 'QMS#__root') ps = [ROOT];
      PS.set(n.key, ps);
      for (const p of ps) { if (!KIDS.has(p)) KIDS.set(p, []); KIDS.get(p).push(n.key); }
    }
    for (const arr of KIDS.values()) arr.sort((a, b) => (N.get(a).level - N.get(b).level) || a.localeCompare(b));
  }
  const kidsOf = (key, lv) => (KIDS.get(key) || []).filter(k => !lv || N.get(k).level === lv);
  const issuesOf = key => (G.issues || []).filter(i => i.key === key || i.target === key);
  function chainOf(key) {
    const out = []; let k = key; const seen = new Set();
    while (k && !seen.has(k)) { seen.add(k); out.unshift(k); if (k === ROOT) break; k = (PS.get(k) || [])[0]; }
    return out;
  }
  const lvTag = lv => `<span class="tag lv${lv}">${LV[lv].short}</span>`;
  const nm = n => n ? (n.name || '（未解析名稱）') : '';

  // ------------------------------------------------------------ 頁首
  function renderHeader() {
    const c = G.counts;
    $('#counts').innerHTML = [1, 2, 3, 4].map(l =>
      `<button class="chip lv${l} ripple-host" data-lv="${l}" title="看全部${LV[l].short}文件"><i style="background:var(--c)"></i>${LV[l].short} <b>${c[l]}</b></button>`).join('');
    $$('#counts .chip').forEach(b => b.onclick = () => { allFilter.levels = new Set([+b.dataset.lv]); switchView('all'); });
    if ($('#issueBadge')) $('#issueBadge').textContent = (G.issues || []).filter(i => i.severity !== '提示').length;
    $('#changeBadge').textContent = (G.changes || []).length;
    const p = G.provenance || {};
    $('#prov').innerHTML = `資料產生 ${esc(p.generated_at)}｜${esc(p.producer?.provider)}｜解析程式 ${esc(p.producer?.model)}｜規則雜湊 <span class="code">${esc(p.rules_hash)}</span>｜程式版本 <span class="code">${esc(p.code_version)}</span>｜來源 ${(p.sources || []).length} 個檔案｜${esc(p.finalized_note)}`;
  }

  // ------------------------------------------------------------ 互動金字塔
  const PYR = (() => {
    const BANDS = [[22, 122], [132, 222], [232, 322], [332, 418]];
    const APEX = { x: 300, y: 22 }, BASE_Y = 418, BASE_HW = 262;
    const hw = y => (y - APEX.y) / (BASE_Y - APEX.y) * BASE_HW;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let sel = 2, preview = null, auto = !reduce && !SMALL(), timer = null, hovering = false, entered = false, leaveT = null;
    const TOUR_MS = 3600;

    function facts(lv) {
      const nodes = G.nodes.filter(n => n.level === lv);
      const c = G.counts;
      const forms = G.nodes.filter(n => n.level === 4);
      if (lv === 1) {
        const leaf = (G.iso_map || []).filter(r => r.clause.includes('.')).length;
        const arts = (G.iso_map || []).flatMap(r => (r.qms.match(/\d+/g) || []).map(Number));
        return { up: '最上層：訂定公司品質方針與系統架構', down: `規定 ${c[2]} 份程序書`, fact: `附錄A 對照 ISO 13485 共 ${leaf} 個條文${arts.length ? `、QMS 第 ${Math.min(...arts)}～${Math.max(...arts)} 條` : ''}` };
      }
      if (lv === 2) {
        const withForms = nodes.filter(n => kidsOf(n.key, 4).length);
        const avg = nodes.length ? (forms.length / nodes.length).toFixed(1) : 0;
        return { up: `依據《${nm(N.get(ROOT))}》（${N.get(ROOT).code}）`, down: `往下連到 ${c[3]} 份三階文件、${c[4]} 種紀錄表單`, fact: `平均每份程序書 ${avg} 種紀錄；${withForms.length} 份有自己的表單` };
      }
      if (lv === 3) {
        const strong = nodes.filter(n => n.parent_basis === '列於相關文件').length;
        const regOnly = nodes.filter(n => (PS.get(n.key) || []).some(k => N.get(k)?.group)).length;
        const citers = new Set(nodes.flatMap(n => PS.get(n.key) || []).filter(k => N.get(k)?.level === 2));
        const wf = forms.filter(f => N.get((PS.get(f.key) || [])[0])?.level === 3).length;
        return { up: `${citers.size} 份程序書引用了其中 ${nodes.length - regOnly} 份`, down: wf ? `附有 ${wf} 張自己的表單` : '多數直接依程序書的表單記錄',
          fact: regOnly ? `另有 ${regOnly} 份登錄於文件總覽表、尚未被程序書引用（${strong} 份列在「4 相關文件」）` : `${strong} 份列在程序書「4 相關文件」，其餘 ${nodes.length - strong} 份由本文提到` };
      }
      const owners = new Set(nodes.map(n => (PS.get(n.key) || [])[0]));
      const ret = nodes.filter(n => n.retention?.retention).length;
      const el = nodes.filter(n => n.electronic).length;
      return { up: `分屬 ${owners.size} 份上層文件（看編號就知道屬於誰）`, down: '最後成果：稽核時的證據', fact: `${ret} 張明訂保存期限；${el} 張為電子表單` };
    }
    function examples(lv) {
      let list = G.nodes.filter(n => n.level === lv);
      if (lv === 3) list = [...list].sort((a, b) => (a.parent_basis === '列於相關文件' ? 0 : 1) - (b.parent_basis === '列於相關文件' ? 0 : 1));
      if (lv === 4) list = [...list].sort((a, b) => (a.retention ? 0 : 1) - (b.retention ? 0 : 1));
      return list.slice(0, lv === 1 ? 1 : 5);
    }

    function build() {
      const svg = $('#pyramid');
      svg.innerHTML = '';
      // 手機：裁掉兩側流向箭頭，讓金字塔與層名放大到看得清楚
      svg.setAttribute('viewBox', SMALL() ? '66 14 468 424' : '0 0 600 450');
      const defs = svgEl('defs');
      let d = `<linearGradient id="pySheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="pyBlur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="8"/></filter>
        <marker id="pyArr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--ink-3)"/></marker>`;
      BANDS.forEach(([y0, y1], i) => {
        const lv = i + 1;
        d += `<linearGradient id="pyG${lv}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--l${lv});stop-opacity:.72"/><stop offset=".5" style="stop-color:var(--l${lv});stop-opacity:.95"/><stop offset="1" style="stop-color:var(--l${lv});stop-opacity:1"/></linearGradient>
          <clipPath id="pyC${lv}"><polygon points="${pts(y0, y1)}"/></clipPath>`;
      });
      defs.innerHTML = d;
      svg.appendChild(defs);
      // 地面陰影
      svg.appendChild(svgEl('ellipse', { class: 'py-shadow', cx: APEX.x, cy: BASE_Y + 20, rx: BASE_HW, ry: 12, filter: 'url(#pyBlur)' }));
      // 兩側流向箭頭
      const L = [[238, 64], [18, 400]], R = [[582, 400], [362, 64]];
      svg.insertAdjacentHTML('beforeend', `
        <g class="py-flow down"><path d="M${L[0]} L${L[1]}" marker-end="url(#pyArr)"/><circle r="4"><animateMotion dur="2.6s" repeatCount="indefinite" path="M${L[0]} L${L[1]}"/></circle>
          <text transform="translate(112 214) rotate(-56.6)" text-anchor="middle">上層規定下層</text></g>
        <g class="py-flow up"><path d="M${R[0]} L${R[1]}" marker-end="url(#pyArr)"/><circle r="4"><animateMotion dur="2.6s" repeatCount="indefinite" path="M${R[0]} L${R[1]}"/></circle>
          <text transform="translate(488 214) rotate(56.6)" text-anchor="middle">下層追溯上層</text></g>`);
      BANDS.forEach(([y0, y1], i) => {
        const lv = i + 1;
        const g = svgEl('g', { class: `py-layer lv${lv}`, 'data-lv': lv, tabindex: 0, role: 'button', 'aria-label': `${LV[lv].short} ${LV[lv].kind}，${G.counts[lv]} 份` });
        g.style.setProperty('--i', i);
        const xl1 = APEX.x - hw(y1), xr1 = APEX.x + hw(y1);
        // 感應區固定不動（含上下間隙的一半），浮起動畫只套在 .py-vis，避免滑鼠懸停時圖形移走造成來回觸發
        const hy0 = Math.max(APEX.y, y0 - 5), hy1 = y1 + 5;
        g.innerHTML = `
          <polygon class="py-hit" points="${pts(hy0, hy1)}"/>
          <g class="py-vis">
          <polygon class="py-edge" points="${xl1},${y1} ${xr1},${y1} ${xr1 - 5},${y1 + 8} ${xl1 + 5},${y1 + 8}"/>
          <polygon class="py-face" points="${pts(y0, y1)}" fill="url(#pyG${lv})"/>
          <polygon class="py-sheen" points="${pts(y0, y1)}" fill="url(#pySheen)"/>
          ${i ? `<line class="py-hl" x1="${APEX.x - hw(y0) + 2}" y1="${y0 + .8}" x2="${APEX.x + hw(y0) - 2}" y2="${y0 + .8}"/>` : ''}
          <g class="py-ripples" clip-path="url(#pyC${lv})"></g>
          <text class="py-t1" x="${APEX.x}" y="${i ? (y0 + y1) / 2 - 4 : 88}" text-anchor="middle">${i ? `${LV[lv].short}　${LV[lv].kind.split('／')[0]}` : LV[lv].short}</text>
          <text class="py-t2" x="${APEX.x}" y="${i ? (y0 + y1) / 2 + 20 : 108}" text-anchor="middle"><tspan class="cnt" data-to="${G.counts[lv]}">0</tspan> 份</text>
          </g>`;
        svg.appendChild(g);
      });
      bind();
    }
    const pts = (y0, y1) => [[APEX.x - hw(y0), y0], [APEX.x + hw(y0), y0], [APEX.x + hw(y1), y1], [APEX.x - hw(y1), y1]].map(p => p.map(v => +v.toFixed(1)).join(',')).join(' ');

    function paint() {
      const show = preview || sel;
      $$('#pyramid .py-layer').forEach(g => {
        const lv = +g.dataset.lv;
        g.classList.toggle('is-sel', lv === sel);
        g.classList.toggle('is-dim', lv !== show);
        g.classList.toggle('is-show', lv === show);
      });
      $$('#pyrSteps .pstep').forEach(b => b.classList.toggle('on', +b.dataset.lv === show));
      const on = $(`#pyrSteps .pstep[data-lv="${show}"]`), ind = $('#pyrSteps .pind');
      if (on && ind) { ind.style.width = `${on.offsetWidth}px`; ind.style.transform = `translateX(${on.offsetLeft}px)`; ind.style.background = `var(--l${show})`; }
      inspect(show);
    }
    let shown = null;
    function inspect(lv) {
      if (shown === lv) return;
      shown = lv;
      const f = facts(lv), lvDef = (G.levels || [])[lv - 1] || {};
      const box = $('#pyrInspect');
      box.innerHTML = `<div class="pi lv${lv}">
        <div class="pi-top"><span class="pi-badge">${LV[lv].short}</span><span class="pi-kind">${esc(lvDef.kind || LV[lv].kind)}</span>
          <span class="pi-count"><b class="cnt" data-to="${G.counts[lv]}">0</b><small>份</small></span></div>
        <div class="pi-q">${esc(LV[lv].q)}</div>
        <div class="pi-d">${esc(lvDef.desc || '')}　<span class="code muted">${esc(lvDef.code_pattern || '')}</span></div>
        <div class="pi-rel"><div><i>⬆</i>${esc(f.up)}</div><div><i>⬇</i>${esc(f.down)}</div><div><i>✦</i>${esc(f.fact)}</div></div>
        ${lv === 3 && (G.l3_categories || []).length ? `<div class="pi-ex-t">六類</div><div class="pi-cats">${G.l3_categories.map((c, k) => `<button class="pi-cat ripple-host" style="--k:${k}" data-cat="${esc(c)}"><b>${esc(c)}</b><span>${G.nodes.filter(n => n.level === 3 && n.kind === c).length}</span></button>`).join('')}</div>` : ''}
        <div class="pi-ex-t">例如</div>
        <div class="pi-ex">${examples(lv).map((n, k) => `<button class="pi-chip ripple-host" style="--k:${k}" data-key="${esc(n.key)}"><span class="code">${esc(n.code)}</span>${esc(nm(n))}</button>`).join('')}${G.counts[lv] > 5 ? `<span class="pi-more">…等 ${G.counts[lv]} 份</span>` : ''}</div>
        <div class="pi-cta"><button class="btn primary ripple-host" data-go="list">看全部 ${G.counts[lv]} 份 →</button><button class="btn ripple-host" data-go="map">🧭 在心智圖看</button></div>
      </div>`;
      $$('.pi-chip', box).forEach(b => b.onclick = () => { stopAuto(); openDetail(b.dataset.key); });
      $$('.pi-cat', box).forEach(b => b.onclick = () => { stopAuto(); allFilter.levels = new Set([3]); allFilter.cat = b.dataset.cat; switchView('all'); });
      $('[data-go=list]', box).onclick = () => { stopAuto(); allFilter.levels = new Set([lv]); switchView('all'); };
      $('[data-go=map]', box).onclick = () => { stopAuto(); switchView('mindmap'); setTimeout(() => $(`[data-mm="${lv <= 2 ? 'l2' : 'l3'}"]`)?.click(), 120); };
      countUp($('.pi-count .cnt', box), G.counts[lv], 700);
    }
    function select(lv, user) {
      sel = Math.max(1, Math.min(4, lv)); preview = null;
      if (user) stopAuto();
      paint();
    }
    function ripple(g, evt) {
      const svg = $('#pyramid');
      const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const c = svgEl('circle', { class: 'py-ripple', cx: p.x, cy: p.y, r: 4 });
      $('.py-ripples', g).appendChild(c);
      c.animate([{ r: 4, opacity: .55 }, { r: 320, opacity: 0 }], { duration: 750, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => c.remove();
    }

    // 自動導覽
    function tick() {
      if (!auto || hovering || !$('#view-guide').classList.contains('active')) return;
      sel = sel % 4 + 1; preview = null; paint(); restartProg();
    }
    function restartProg() {
      const bar = $('#pyrProg'); if (!bar) return;
      bar.style.animation = 'none'; void bar.offsetWidth;
      bar.style.animation = auto ? `pyprog ${TOUR_MS}ms linear` : 'none';
      bar.style.animationPlayState = hovering ? 'paused' : 'running';
    }
    function startAuto() {
      auto = true; clearInterval(timer); timer = setInterval(tick, TOUR_MS); restartProg(); autoBtn();
    }
    function stopAuto() {
      if (!auto) return;
      auto = false; clearInterval(timer); restartProg(); autoBtn();
    }
    function autoBtn() {
      const b = $('#pyrAuto'); if (b) b.innerHTML = auto ? '❚❚ 暫停自動導覽' : '▶ 自動導覽';
    }

    function bind() {
      const svg = $('#pyramid'), tilt = $('#pyrTilt');
      $$('.py-layer', svg).forEach(g => {
        const lv = +g.dataset.lv;
        g.addEventListener('pointerenter', () => { clearTimeout(leaveT); if (preview !== lv) { preview = lv; paint(); } });
        g.addEventListener('click', e => { ripple(g, e); select(lv, true); });
        g.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(lv, true); }
        });
      });
      svg.addEventListener('pointerleave', () => { clearTimeout(leaveT); leaveT = setTimeout(() => { if (preview !== null) { preview = null; paint(); } }, 150); });
      svg.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); select(sel + (e.key === 'ArrowDown' ? 1 : -1), true);
          $(`.py-layer[data-lv="${sel}"]`, svg)?.focus();
        }
      });
      // 滑鼠視差傾斜
      if (!reduce && matchMedia('(hover: hover)').matches) {
        tilt.addEventListener('pointermove', e => {
          const r = tilt.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
          tilt.style.transform = `perspective(1100px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg)`;
        });
        tilt.addEventListener('pointerleave', () => { tilt.style.transform = ''; });
      }
      const stage = $('#pyrStage');
      stage.onpointerenter = () => { hovering = true; const b = $('#pyrProg'); if (b) b.style.animationPlayState = 'paused'; };
      stage.onpointerleave = () => { hovering = false; if (auto) { clearInterval(timer); timer = setInterval(tick, TOUR_MS); restartProg(); } };
    }

    function render() {
      build();
      $('#pyrSteps').innerHTML = '<span class="pind"></span>' + [1, 2, 3, 4].map((lv, i) =>
        `${i ? '<span class="parr">→</span>' : ''}<button class="pstep lv${lv}" data-lv="${lv}"><b>${LV[lv].short}</b><small>${esc(LV[lv].kind.split('／')[0])}</small></button>`).join('');
      $$('#pyrSteps .pstep').forEach(b => {
        b.onclick = () => select(+b.dataset.lv, true);
        b.onpointerenter = () => { preview = +b.dataset.lv; paint(); };
        b.onpointerleave = () => { preview = null; paint(); };
      });
      $('#pyrAuto').onclick = () => (auto ? stopAuto() : (sel = sel % 4 + 1, paint(), startAuto()));
      shown = null;
      autoBtn();
      const go = () => {
        entered = true;
        $('#pyramid').classList.add('entered');
        $$('#pyramid .cnt').forEach(el => countUp(el, +el.dataset.to, 1200));
        paint();
        if (auto) setTimeout(startAuto, 1400);
      };
      if (entered) { $('#pyramid').classList.add('entered'); $$('#pyramid .cnt').forEach(el => { el.textContent = el.dataset.to; }); paint(); if (auto) startAuto(); }
      else onceVisible($('#pyramid'), go);
      paint();
    }
    addEventListener('resize', () => { if (G) paint(); });
    return { render };
  })();

  // ------------------------------------------------------------ ① 新人導覽
  function renderGuide() {
    $('#medKpis').innerHTML = [1, 2, 3, 4].map(l => `<button class="med-kpi lv${l}" data-lv="${l}"><i></i><span class="k-n"><b class="cnt" data-to="${G.counts[l]}">0</b><small>份</small></span><span class="k-l">${LV[l].short}・${esc(LV[l].kind.split('／')[0])}</span></button>`).join('')
      + `<div class="med-kpi std"><span class="k-n"><b>ISO 13485</b></span><span class="k-l">QMS 準則 第 4～77 條</span></div>`;
    $$('#medKpis .med-kpi[data-lv]').forEach(b => b.onclick = () => { allFilter.levels = new Set([+b.dataset.lv]); switchView('all'); });
    onceVisible($('#medKpis'), () => $$('#medKpis .cnt').forEach(el => countUp(el, +el.dataset.to, 1300)));
    PYR.render();

    // 實例走一遍
    const sel = $('#walkSelect');
    const cps = G.nodes.filter(n => n.level === 2);
    const prev = sel.value;
    sel.innerHTML = cps.map(n => `<option value="${esc(n.key)}">${esc(n.code)} ${esc(nm(n))}</option>`).join('');
    sel.value = prev && N.has(prev) ? prev : (cps.find(n => n.code === 'CP─08') || cps[0] || {}).key;
    sel.onchange = playWalk;
    $('#walkPlay').onclick = playWalk;
    onceVisible($('#walk'), playWalk);
    if (walkPlayed) playWalk();

    // 編號拆解
    const ex = ['QS─01', 'CP─08', 'CP─08─01', 'WI─D00321', 'WI─A00061─03'];
    $('#decExamples').innerHTML = ex.map(e => `<button class="chip code ripple-host" data-c="${e}">${e}</button>`).join('');
    $$('#decExamples .chip').forEach(b => b.onclick = () => { $('#decInput').value = b.dataset.c; decode(); });
    $('#decInput').oninput = decode;
    decode();

    // 部門
    const depts = [...new Set(cps.map(n => n.dept).filter(Boolean))];
    if (!depts.includes(deptSel)) deptSel = depts[0];
    $('#deptChips').innerHTML = depts.map(d => `<button class="chip ripple-host ${d === deptSel ? 'on' : ''}" data-d="${esc(d)}">${esc(d)} <b>${cps.filter(n => n.dept === d).length}</b></button>`).join('');
    $$('#deptChips .chip').forEach(b => b.onclick = () => { deptSel = b.dataset.d; renderDept(); $$('#deptChips .chip').forEach(x => x.classList.toggle('on', x === b)); });
    renderDept();
  }
  let deptSel = null, walkPlayed = false, walkTimer = [];
  function renderDept() {
    const list = G.nodes.filter(n => n.level === 2 && n.dept === deptSel);
    $('#deptCps').innerHTML = list.map((n, i) => cpCard(n, i)).join('');
    bindCards($('#deptCps'));
    observeReveals($('#deptCps'));
  }

  function playWalk() {
    walkPlayed = true;
    walkTimer.forEach(clearTimeout); walkTimer = [];
    const cp = N.get($('#walkSelect').value);
    if (!cp) return;
    const qs = N.get(ROOT);
    const isoRows = (G.iso_map || []).filter(r => (r.docs || []).includes(cp.key));
    const isoTxt = isoRows.filter(r => r.title).slice(0, 3).map(r => `${r.clause} ${r.title}`).join('、');
    const wis = kidsOf(cp.key, 3);
    const wi = wis.map(k => N.get(k)).sort((a, b) => (a.parent_basis === '列於相關文件' ? -1 : 1) - (b.parent_basis === '列於相關文件' ? -1 : 1))[0];
    const forms = kidsOf(cp.key, 4).map(k => N.get(k));
    const form = forms.find(f => f.in_appendix_of) || forms[0];
    const steps = [
      { lv: 1, n: qs, t: `${qs.code} ${nm(qs)}`, s: isoTxt ? `品質手冊對照 ISO 13485 條文「${isoTxt}」，規定公司必須做好這件事。` : '品質手冊訂出公司的品質方針與整體架構。' },
      { lv: 2, n: cp, t: `${cp.code} ${nm(cp)}`, s: `${cp.dept ? `由${cp.dept}制定，` : ''}規定流程與權責：${(cp.purpose || '').slice(0, 70)}${(cp.purpose || '').length > 70 ? '…' : ''}` },
      wi ? { lv: 3, n: wi, t: `${wi.code} ${nm(wi)}`, s: `操作細節寫在三階文件。這份程序書共連到 ${wis.length} 份三階文件。` }
        : { lv: 3, n: null, t: '（此程序書沒有引用三階文件）', s: '直接依照程序書的步驟執行即可。' },
      form ? { lv: 4, n: form, t: `${form.code} ${nm(form)}`, s: `做完之後填這張表單留存${form.retention?.retention ? `，保存期限「${form.retention.retention}」` : ''}。這份程序書共有 ${forms.length} 種紀錄表單。` }
        : { lv: 4, n: null, t: '（此程序書沒有紀錄表單）', s: '執行結果依程序書規定方式保存。' },
    ];
    $('#walk').innerHTML = steps.map((s, i) => `<div class="walk-step lv${s.lv}" data-i="${i}">
      <div class="bullet">${LV[s.lv].short}</div>
      <div class="walk-box ripple-host" ${s.n ? `data-key="${esc(s.n.key)}"` : ''}><div class="t">${esc(s.t)}</div><div class="s">${esc(s.s)}</div></div></div>`).join('');
    $$('#walk .walk-box[data-key]').forEach(b => b.onclick = () => openDetail(b.dataset.key));
    $$('#walk .walk-step').forEach((el, i) => walkTimer.push(setTimeout(() => el.classList.add('on'), 250 + i * 850)));
  }

  function decode() {
    const raw = normCode($('#decInput').value);
    const out = $('#decParts'), res = $('#decResult');
    const m = raw.match(/^(QS|CP|W[A-Z])-([A-Z0-9]{2,6})(?:-(\d{2,3}))?$/);
    if (!m) { out.innerHTML = ''; res.innerHTML = '<span class="muted">格式像 CP─08─01、WI─D00321 這樣。</span>'; return; }
    const [, pre, main, sub] = m;
    const parts = [];
    const lvl = sub ? 4 : pre === 'QS' ? 1 : pre === 'CP' ? 2 : 3;
    if (pre === 'QS') parts.push({ lv: 1, b: 'QS', s: '一階：品質手冊（Quality System）' });
    else if (pre === 'CP') parts.push({ lv: 2, b: 'CP', s: '二階：程序書（Control Procedure）' });
    else {
      parts.push({ lv: 3, b: 'W', s: '三階文件' });
      parts.push({ lv: 3, b: pre[1], s: `文件類別：${(G.w_doc_types || {})[pre[1]] || '—'}` });
    }
    if (pre[0] === 'W') {
      parts.push({ lv: 3, b: main[0], s: `部門：${(G.departments || {})[main[0]] || '（未列於部門代號表）'}` });
      parts.push({ lv: 3, b: main.slice(1), s: '部門自訂流水號' });
    } else {
      const ownerKey = `${G.dataset}#${pre}-${main}`;
      parts.push({ lv: pre === 'QS' ? 1 : 2, b: main, s: pre === 'QS' ? `第 ${+main} 份品質手冊` : `第 ${+main} 份程序書${N.get(ownerKey) ? `：${nm(N.get(ownerKey))}` : ''}` });
    }
    if (sub) parts.push({ lv: 4, b: sub, s: `這份文件底下的第 ${+sub} 張紀錄表單` });
    out.innerHTML = parts.map((p, i) => (i ? '<span class="dec-sep">·</span>' : '') +
      `<div class="dec-part lv${p.lv}" style="animation-delay:${i * 110}ms"><b>${esc(p.b)}</b><span>${esc(p.s)}</span></div>`).join('');
    const key = `${G.dataset}#${raw}`;
    const n = N.get(key);
    const owner = sub ? N.get(`${G.dataset}#${pre}-${main}`) : null;
    let txt = `這是 ${lvTag(lvl)} 文件。`;
    if (sub) txt += `它的上層是 <b>${esc(`${pre}─${main}`)}</b>${owner ? ` ${esc(nm(owner))}` : ''}——<b>表單編號＝上層文件編號＋兩碼流水號</b>，所以看編號就知道它屬於哪一份文件。`;
    res.innerHTML = txt + (n ? `<div style="margin-top:8px"><button class="btn small primary ripple-host" id="decOpen">看「${esc(nm(n))}」的詳細內容</button></div>` : '<div class="muted" style="margin-top:6px">目前資料中找不到這個編號。</div>');
    if (n) $('#decOpen').onclick = () => openDetail(key);
  }

  // ------------------------------------------------------------ ③ 程序書一覽
  function cpCard(n, i = 0, basis = '') {
    const w3 = kidsOf(n.key, 3).length, w4 = kidsOf(n.key, 4).length;
    const st = recent.added.has(n.key) ? 'is-added' : recent.changed.has(n.key) ? 'is-changed' : '';
    const iss = issuesOf(n.key).filter(x => x.severity !== '提示').length;
    return `<div class="cp-card reveal ${st}" style="--d:${(i % 8) * 60}ms" data-key="${esc(n.key)}">
      ${iss ? `<span class="flag" title="有 ${iss} 項需要注意的檢查結果">⚠ ${iss}</span>` : ''}
      <div class="c">${esc(n.code)}${n.status !== 'file' ? ' <span class="muted">（未收錄原文）</span>' : ''}</div>
      <div class="n">${esc(nm(n))}</div>
      <div class="m">${esc(n.dept || '')}${n.version ? ` · 第 ${esc(n.version)} 版` : ''}${n.effective ? ` · ${esc(n.effective)} 施行` : ''}</div>
      ${basis ? `<div class="basis">${esc(basis)}</div>` : ''}
      <div class="p">${esc(n.purpose || '')}</div>
      <div class="bars"><span class="lv3"><i style="background:var(--c)"></i>三階 <b>${w3}</b></span><span class="lv4"><i style="background:var(--c)"></i>紀錄 <b>${w4}</b></span></div>
    </div>`;
  }
  function bindCards(root) { $$('.cp-card', root).forEach(c => c.onclick = () => openDetail(c.dataset.key)); }
  // 條號清單壓縮成區間：22,23,24,68 → 22–24、68
  const ranges = nums => {
    const a = [...new Set(nums)].sort((x, y) => x - y); const out = [];
    for (let k = 0; k < a.length; k++) { let e = k; while (e + 1 < a.length && a[e + 1] === a[e] + 1) e++; out.push(e > k ? `${a[k]}–${a[e]}` : `${a[k]}`); k = e; }
    return out.join('、');
  };
  const qmsOf = key => [...new Set((G.iso_map || []).filter(r => (r.docs || []).includes(key)).flatMap(r => (r.qms.match(/\d+/g) || []).map(Number)))].sort((a, b) => a - b);
  const isoOf = key => (G.iso_map || []).filter(r => (r.docs || []).includes(key) && r.clause.includes('.')).map(r => r.clause);
  let procMode = (() => { try { return localStorage.getItem('qms.procMode') || 'iso'; } catch (e) { return 'iso'; } })();
  let procDept = null;

  // 程序書一覽專用卡片：CGM 品牌頁首、規格讀數、數量量表、心電圖線
  function procCard(n, i, basis, max) {
    const w3 = kidsOf(n.key, 3).length, w4 = kidsOf(n.key, 4).length;
    const st = recent.added.has(n.key) ? 'is-added' : recent.changed.has(n.key) ? 'is-changed' : '';
    const iss = issuesOf(n.key).filter(x => x.severity !== '提示').length;
    const pct = (v, m) => `${m ? Math.max(4, Math.round(v / m * 100)) : 0}%`;
    return `<article class="pc reveal ${st}" style="--d:${(i % 8) * 55}ms" data-key="${esc(n.key)}" tabindex="0">
      <header class="pc-head"><span class="pc-code">${esc(n.code)}</span><span class="pc-dept">${esc(n.dept || '—')}</span>${iss ? `<span class="pc-warn" title="${iss} 項需要注意的檢查結果">⚠ ${iss}</span>` : ''}</header>
      <div class="pc-body">
        <h4 class="pc-name">${esc(nm(n))}</h4>
        ${n.name_en ? `<div class="pc-en">${esc(n.name_en)}</div>` : ''}
        <div class="pc-spec"><span><i>版次</i><b>${n.version ? `V${esc(n.version)}` : '—'}</b></span><span><i>施行</i><b>${esc(n.effective || '—')}</b></span><span><i>頁數</i><b>${n.pages || '—'}</b></span></div>
        <p class="pc-purpose">${esc(n.purpose || (n.status !== 'file' ? '未收錄原文，僅由其他文件引用得知。' : ''))}</p>
        <div class="pc-meters">
          <div class="pm lv3"><span>三階</span><div class="bar"><i style="--w:${pct(w3, max.w3)}"></i></div><b>${w3}</b></div>
          <div class="pm lv4"><span>紀錄</span><div class="bar"><i style="--w:${pct(w4, max.w4)}"></i></div><b>${w4}</b></div>
        </div>
        ${basis ? `<div class="pc-basis">${esc(basis)}</div>` : ''}
      </div>
      <svg class="pc-ecg" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="M0 12 H110 L118 6 L126 12 H136 L142 2 L150 22 L156 12 H170 L180 8 L190 12 H300"/></svg>
    </article>`;
  }

  function renderProcs() {
    const all = G.nodes.filter(n => n.level === 2);
    // 指標列
    const depts = [...new Set(all.map(n => n.dept).filter(Boolean))];
    const formsN = all.reduce((a, n) => a + kidsOf(n.key, 4).length, 0);
    const latest = all.filter(n => n.effective).sort((a, b) => b.effective.localeCompare(a.effective));
    const newest = latest.length ? latest.filter(n => n.effective === latest[0].effective) : [];
    $('#procKpis').innerHTML = [
      ['程序書', all.length, '份', '二階文件'],
      ['制定單位', depts.length, '個', '依封面「制定」欄'],
      ['紀錄表單', formsN, '種', '屬於程序書的四階表單'],
      ['最新施行', newest[0]?.effective || '—', '', newest.map(n => n.code).join('、')],
    ].map(([t, v, u, sub], i) => `<div class="pk" style="--d:${i * 70}ms"><span class="pk-t">${t}</span><span class="pk-v">${typeof v === 'number' ? `<b class="cnt" data-to="${v}">0</b>` : `<b>${esc(v)}</b>`}<small>${u}</small></span><span class="pk-s">${esc(sub)}</span></div>`).join('');
    onceVisible($('#procKpis'), () => $$('#procKpis .cnt').forEach(el => countUp(el, +el.dataset.to, 900)));
    // 制定單位篩選
    if (procDept && !depts.includes(procDept)) procDept = null;
    $('#procDept').innerHTML = `<span class="pd-l">制定單位</span>` + [[null, '全部', all.length], ...depts.map(d => [d, d, all.filter(n => n.dept === d).length])]
      .map(([v, l, c]) => `<button class="pd ripple-host ${procDept === v ? 'on' : ''}" data-d="${esc(v || '')}">${esc(l)} <b>${c}</b></button>`).join('');
    $$('#procDept .pd').forEach(b => b.onclick = () => { procDept = b.dataset.d || null; renderProcs(); });
    const cps = all.filter(n => !procDept || n.dept === procDept);
    const max = { w3: Math.max(1, ...all.map(n => kidsOf(n.key, 3).length)), w4: Math.max(1, ...all.map(n => kidsOf(n.key, 4).length)) };
    // 章節名稱取自品質手冊附錄A 的大章節列（4 品質管理系統…）
    const top = {}; for (const r of G.iso_map || []) if (!r.clause.includes('.')) top[+r.clause] = r.title;
    // QMS 條號對應的大章節：同一列 ISO 條文的第一碼
    const artChap = {}; for (const r of G.iso_map || []) for (const a of (r.qms.match(/\d+/g) || []).map(Number)) artChap[a] = +r.clause.split('.')[0];
    const groups = {};
    const meta = {};
    for (const n of cps) {
      let g, sortKey;
      if (procMode === 'qms') {
        const arts = qmsOf(n.key);
        g = arts.length ? artChap[arts[0]] || 0 : 0; sortKey = arts[0] ?? 999;
        meta[n.key] = arts.length ? `QMS 第 ${ranges(arts)} 條` : 'QMS：品質手冊附錄A 未對照';
      } else {
        const cl = n.iso_map_clauses || [];
        const chs = cl.map(c => +c.split('.')[0]).filter(Boolean);
        g = chs.length ? Math.min(...chs) : 0;
        sortKey = cl.length ? cl.map(c => c.split('.').map(x => x.padStart(3, '0')).join('.')).sort()[0] : 'zzz';
        const leaf = isoOf(n.key);
        meta[n.key] = leaf.length ? `ISO ${leaf.slice(0, 6).join('、')}${leaf.length > 6 ? '…' : ''}` : 'ISO：品質手冊附錄A 未對照';
      }
      (groups[g] = groups[g] || []).push({ n, sortKey });
    }
    const artRange = ch => { const a = Object.entries(artChap).filter(([, c]) => c === ch).map(([x]) => +x); return a.length ? `第 ${Math.min(...a)}～${Math.max(...a)} 條` : ''; };
    const chName = ch => top[ch] || (CHAPTERS[ch] || '').replace(/^\d+ /, '');
    const head = (ch, n) => +ch === 0
      ? `<div class="pch"><div class="pch-num">—</div><div class="pch-t"><b>其他</b><small>品質手冊附錄A 未對照・${n} 份程序書</small></div><div class="pch-line"></div></div>`
      : procMode === 'qms'
        ? `<div class="pch"><div class="pch-num qms"><small>QMS</small>${esc(artRange(+ch).replace(/第 |條/g, ''))}</div><div class="pch-t"><b>${esc(chName(ch))}</b><small>醫療器材品質管理系統準則 ${esc(artRange(+ch))}・${n} 份程序書</small></div><div class="pch-line"></div></div>`
        : `<div class="pch"><div class="pch-num">${esc(ch)}</div><div class="pch-t"><b>${esc(chName(ch))}</b><small>ISO 13485 第 ${esc(ch)} 章・${n} 份程序書</small></div><div class="pch-line"></div></div>`;
    $('#procTitle').textContent = procMode === 'qms' ? '程序書一覽（依 QMS 條號排列）' : '程序書一覽（依 ISO 13485 章節排列）';
    $('#procLead').textContent = procMode === 'qms'
      ? '依《醫療器材品質管理系統準則》（QMS）條號排列，每份程序書放在它對應的最小條號所屬章節；卡片上列出全部對應條號（取自品質手冊 QS─01 附錄A）。'
      : '依 ISO 13485 章節排列，每份程序書放在它對應的最前面條文所屬章節；卡片上列出對應條文（取自品質手冊 QS─01 附錄A）。';
    $$('#procMode button').forEach(b => { b.classList.toggle('on', b.dataset.mode === procMode); b.setAttribute('aria-selected', b.dataset.mode === procMode); });
    $('#chapters').innerHTML = Object.keys(groups).sort((a, b) => (+a || 99) - (+b || 99)).map(ch => {
      const list = groups[ch].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.n.code.localeCompare(b.n.code)));
      return `<section class="chapter reveal">${head(ch, list.length)}<div class="pc-grid">${list.map((x, i) => procCard(x.n, i, meta[x.n.key], max)).join('')}</div></section>`;
    }).join('') || '<div class="empty">此單位沒有制定程序書</div>';
    $$('#chapters .pc').forEach(c => {
      c.onclick = () => openDetail(c.dataset.key);
      c.onkeydown = e => { if (e.key === 'Enter') openDetail(c.dataset.key); };
    });
    observeReveals($('#view-procs'));
  }

  // ------------------------------------------------------------ ④ 全部文件
  const allFilter = { levels: new Set([1, 2, 3, 4]), q: '', ret: false, elec: false, over: false, sort: 'code', cat: null, dept: '' };
  const NO_DEPT = '未對應部門';
  // 文件所屬部門：二階看封面「制定」、三階看編號部門代號、紀錄看所屬上層文件
  function deptOf(n) {
    if (n.dept) return n.dept;
    if (n.level === 4) { const o = N.get((PS.get(n.key) || [])[0]); if (o?.dept) return o.dept; }
    return NO_DEPT;
  }
  // 部門排序：依組織架構圖順序，其餘接在後面
  function deptOrder() {
    const units = (G.organization?.units || []).filter(u => u.docs?.length || u.wis?.length || u.dept_code);
    const names = [];
    for (const u of units) for (const d of [...(u.doc_dept || []), u.name]) if (!names.includes(d)) names.push(d);
    return names;
  }
  function renderAll() {
    const total = G.nodes.length;
    $('#allTiles').innerHTML = [1, 2, 3, 4].map((l, i) => `<button class="at lv${l} ${allFilter.levels.has(l) ? 'on' : ''}" data-lv="${l}" style="--d:${i * 60}ms" aria-pressed="${allFilter.levels.has(l)}">
        <span class="at-top"><span class="at-badge">${LV[l].short}</span><span class="at-kind">${esc(LV[l].kind)}</span><span class="at-chk">✓</span></span>
        <span class="at-n"><b>${G.counts[l]}</b><small>份</small></span>
        <span class="at-bar"><i style="--w:${Math.max(2, G.counts[l] / total * 100).toFixed(1)}%"></i></span>
        <span class="at-pct">占全部 ${(G.counts[l] / total * 100).toFixed(1)}%</span></button>`).join('')
      + `<button class="at at-all ${allFilter.levels.size === 4 ? 'on' : ''}" data-lv="all"><span class="at-top"><span class="at-kind">全部層級</span></span><span class="at-n"><b>${total}</b><small>份</small></span><span class="at-pct">重設層級篩選</span></button>`;
    $$('#allTiles .at').forEach(b => b.onclick = () => {
      if (b.dataset.lv === 'all') allFilter.levels = new Set([1, 2, 3, 4]);
      else {
        const l = +b.dataset.lv;
        if (allFilter.levels.size === 4) allFilter.levels = new Set([l]);
        else if (allFilter.levels.has(l)) { allFilter.levels.delete(l); if (!allFilter.levels.size) allFilter.levels = new Set([1, 2, 3, 4]); }
        else allFilter.levels.add(l);
      }
      renderAll();
    });
    // 三階六類篩選列（只在三階被選取時出現）
    const cats = G.l3_categories || [];
    const showCats = allFilter.levels.has(3) && cats.length;
    if (!showCats) allFilter.cat = null;
    $('#allCats').innerHTML = showCats ? `<span class="pd-l">三階分類</span>` + [[null, '全部', G.nodes.filter(n => n.level === 3).length], ...cats.map(c => [c, c, G.nodes.filter(n => n.level === 3 && n.kind === c).length])]
      .map(([v, l, c]) => `<button class="pd ripple-host ${allFilter.cat === v ? 'on' : ''}" data-cat="${esc(v || '')}">${esc(l)} <b>${c}</b></button>`).join('') : '';
    $('#allCats').hidden = !showCats;
    $$('#allCats .pd').forEach(b => b.onclick = () => { allFilter.cat = b.dataset.cat || null; renderAll(); });
    const qi = $('#allQ');
    if (qi.value !== allFilter.q) qi.value = allFilter.q;
    qi.oninput = () => { allFilter.q = qi.value; fillAll(); };
    $('#allRet').checked = allFilter.ret; $('#allRet').onchange = e => { allFilter.ret = e.target.checked; fillAll(); };
    $('#allElec').checked = allFilter.elec; $('#allElec').onchange = e => { allFilter.elec = e.target.checked; fillAll(); };
    $('#allOver').checked = allFilter.over; $('#allOver').onchange = e => { allFilter.over = e.target.checked; fillAll(); };
    $('#allSort').value = allFilter.sort; $('#allSort').onchange = e => { allFilter.sort = e.target.value; fillAll(); };
    fillAll();
  }
  function fillAll() {
    const q = allFilter.q.trim().toLowerCase(), qc = normCode(q);
    // 除了部門以外的條件
    const base = G.nodes.filter(n => allFilter.levels.has(n.level)
      && (!q || normCode(n.code).includes(qc) || (n.name || '').toLowerCase().includes(q) || deptOf(n).includes(q) || (n.retention?.retention || '').includes(q))
      && (!allFilter.ret || n.retention?.retention) && (!allFilter.elec || n.electronic) && (!allFilter.over || n.register?.overdue)
      && (!allFilter.cat || (n.level === 3 && n.kind === allFilter.cat)));
    // 部門選單：數量依目前其他篩選條件即時計算；勾選逾期時顯示各部門逾期數
    const cnt = {}; for (const n of base) { const d = deptOf(n); cnt[d] = (cnt[d] || 0) + 1; }
    const order = [...deptOrder().filter(d => cnt[d]), ...Object.keys(cnt).filter(d => !deptOrder().includes(d) && d !== NO_DEPT).sort(), ...(cnt[NO_DEPT] ? [NO_DEPT] : [])];
    if (allFilter.dept && !order.includes(allFilter.dept)) order.push(allFilter.dept);
    const sel = $('#allDept');
    const label = d => allFilter.over ? `${d}（逾期 ${cnt[d] || 0}）` : `${d}（${cnt[d] || 0}）`;
    sel.innerHTML = `<option value="">全部部門（${base.length}）</option>` + order.map(d => `<option value="${esc(d)}">${esc(label(d))}</option>`).join('');
    sel.value = allFilter.dept;
    sel.classList.toggle('on', !!allFilter.dept);
    sel.onchange = () => { allFilter.dept = sel.value; fillAll(); };
    let rows = allFilter.dept ? base.filter(n => deptOf(n) === allFilter.dept) : base;
    if (allFilter.sort === 'eff') rows = [...rows].sort((a, b) => (b.effective || b.effective_ym || '').localeCompare(a.effective || a.effective_ym || ''));
    if (allFilter.sort === 'cite') rows = [...rows].sort((a, b) => (b.cited_by || []).length - (a.cited_by || []).length);
    if (allFilter.sort === 'due') rows = [...rows].filter(n => n.register?.review_due).sort((a, b) => a.register.review_due.localeCompare(b.register.review_due));
    const maxCite = Math.max(1, ...G.nodes.map(n => (n.cited_by || []).length));
    $('#allCount').innerHTML = `顯示 <b>${rows.length}</b> / ${G.nodes.length} 筆`;
    // 分批繪製：一次畫上千列會讓手機瀏覽器記憶體不足而整頁當掉，先畫一批、按「顯示更多」再接續
    const rowHtml = (n, r) => {
      const p = (PS.get(n.key) || []).map(k => N.get(k)).filter(Boolean);
      const st = recent.added.has(n.key) ? ' is-added' : recent.changed.has(n.key) ? ' is-changed' : '';
      const sub = [n.level === 3 ? n.kind : null, n.register?.overdue ? `屆期 ${n.register.review_due}（已逾期）` : null, n.dept, n.electronic ? '電子表單' : null, n.appendix_label ? `${n.in_appendix_of} ${n.appendix_label}` : null, n.status !== 'file' && n.level <= 2 ? '未收錄原文' : null].filter(Boolean);
      const c = (n.cited_by || []).length;
      return `<tr data-key="${esc(n.key)}" class="lv${n.level}${st}" style="--r:${Math.min(r, 30)}">
        <td>${lvTag(n.level)}</td>
        <td class="code nw"><b>${esc(n.code)}</b></td>
        <td><div class="an">${esc(nm(n))}</div>${sub.length ? `<div class="as">${sub.map(esc).join('・')}</div>` : ''}</td>
        <td data-l="上層">${p.map(x => `<span class="pchip lv${x.level}">${esc(x.code)}</span>`).join('')}</td>
        <td class="nw" data-l="版次">${n.version ? `<span class="ver">V${esc(n.version)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="nw num" data-l="施行">${esc(n.effective || n.effective_ym || '') || '<span class="muted">—</span>'}</td>
        <td class="nw" data-l="保存">${n.retention?.retention ? `<span class="ret">${esc(n.retention.retention)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="nw" data-l="被引用">${c ? `<span class="cite"><i style="--w:${Math.max(8, c / maxCite * 100).toFixed(0)}%"></i><b>${c}</b></span>` : '<span class="muted">—</span>'}</td></tr>`;
    };
    const tbody = $('#allTable tbody');
    const PAGE = SMALL() ? 40 : 200;
    let shown = 0;
    const more = () => {
      $('#allMore')?.remove();
      const next = rows.slice(shown, shown + PAGE);
      tbody.insertAdjacentHTML('beforeend', next.map((n, i) => rowHtml(n, i)).join(''));
      shown += next.length;
      if (shown < rows.length) {
        tbody.insertAdjacentHTML('beforeend', `<tr id="allMore" class="all-more"><td colspan="8"><button class="btn primary ripple-host">顯示更多（已顯示 ${shown} / ${rows.length}，再 ${Math.min(PAGE, rows.length - shown)} 筆）</button></td></tr>`);
        $('#allMore button').onclick = e => { e.stopPropagation(); more(); };
      }
    };
    tbody.innerHTML = '';
    if (rows.length) more();
    else tbody.innerHTML = `<tr><td colspan="8"><div class="all-empty"><svg viewBox="0 0 64 64" width="56" height="56"><circle cx="28" cy="28" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="m40 40 12 12" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M20 28h5l2-5 3 10 3-8h3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><div>沒有符合條件的文件</div></div></td></tr>`;
    tbody.onclick = e => { const tr = e.target.closest('tr[data-key]'); if (tr) openDetail(tr.dataset.key); };
  }

  // ------------------------------------------------------------ ⑤ 檢查
  let issueType = null;
  function hlQuote(q, hl) {
    const s = esc(q || '');
    if (!hl) return s;
    const h = esc(hl);
    return s.split(h).join(`<mark>${h}</mark>`);
  }
  function evidenceHtml(list) {
    if (!list?.length) return '';
    return `<div class="evid">${list.map(e => `<div class="ev">
        <div class="ev-h">${e.role ? `<span class="ev-role">${esc(e.role)}</span>` : ''}<b class="code">${esc(e.doc)}</b> ${esc(e.where || '')}
          ${e.page ? `<a class="ev-pg" href="../${encodeURI(e.file)}#page=${e.page}" target="_blank" rel="noopener" title="開啟原始 PDF 第 ${e.page} 頁">PDF 第 ${e.page} 頁 ↗</a>` : ''}</div>
        <div class="ev-q">「${hlQuote(e.quote, e.hl)}」</div></div>`).join('')}</div>`;
  }
  // 每一類檢查：短標題、建議作法
  const ISSUE_HEAD = {
    '編號重複使用': c => `${c} 刪除後又被重新使用`,
    '已刪除仍被引用': c => `${c} 已刪除但仍被引用`,
    '名稱不一致': c => `${c} 在各文件中的名稱寫法不同`,
    '名稱簡寫': c => `${c} 被以簡寫名稱引用`,
    'ISO對照不一致': c => `${c} 宣告的依據條文與品質手冊對照不同`,
    'ISO對照未列': c => `${c} 第 1 條未列出全部對照條文`,
    '未列附錄': c => `${c} 被引用但未列在附錄清單`,
    '附錄未引用': c => `${c} 列在附錄但本文沒有提到`,
    '上層未收錄': c => `${c} 的上層文件尚未收錄`,
    '文件未收錄': c => `${c} 原文尚未收錄`,
    '缺名稱': c => `${c} 找不到文件名稱`,
    '未列相關文件': (c, t) => `${c} 引用了 ${t}，但相關文件未列`,
    '相關文件未引用': (c, t) => `${c} 相關文件列了 ${t}，本文未引用`,
    '編號跳號': c => `${c} 的表單編號有缺號`,
    '已刪除表單': c => `${c} 的缺號均已記錄刪除`,
    '保存期限未列': c => `${c} 不在保存期限表中`,
    '保存期限表多列': c => `${c} 不在附錄清單中`,
    '部門代號未定義': () => '三階文件使用了未定義的部門代號',
    '編號與總覽表不符': (c, t) => `${c} 已在文件總覽表改編為 ${t}`,
    '總覽表未列': c => `${c} 不在文件總覽表中`,
    '與總覽表不符': c => `${c} 的版次或施行日與文件總覽表不同`,
    '逾期未審視': c => `${c} 已超過屆期日期`,
  };
  const ISSUE_FIX = {
    '編號重複使用': '為新表單另編從未使用過的編號；若確需沿用，於修訂紀錄說明理由並經核准。',
    '已刪除仍被引用': '修訂引用端文件，改引用現行表單或刪除該段引用。',
    '名稱不一致': '引用端文件下次改版時，統一改為現行名稱。',
    '名稱簡寫': '引用時建議寫出完整名稱，避免誤認為不同表單。',
    'ISO對照不一致': '確認程序書第 1 條與品質手冊附錄A 何者正確，擇一修正使兩者一致。',
    'ISO對照未列': '視需要於程序書第 1 條補列依據條文。',
    '未列附錄': '於程序書第 7 章附錄清單補列此表單。',
    '附錄未引用': '於本文說明此表單的使用時機，或確認後自附錄移除。',
    '上層未收錄': '將上層文件（PDF／Word）放入 source/，網頁會自動核對。',
    '文件未收錄': '將該文件放入 source/，網頁會自動核對。',
    '缺名稱': '於 rules/overrides.json 補上名稱。',
    '未列相關文件': '於「4 相關文件」補列被引用的文件。',
    '相關文件未引用': '確認是否仍需列出；不需要則自「4 相關文件」移除。',
    '編號跳號': '查明缺號是否已刪除，並於修訂紀錄補記；若為漏列則補回附錄。',
    '已刪除表單': '無需處理，僅供查核參考。',
    '保存期限未列': '於「表單／紀錄之核准權限與保存期限」表補列核准權限與保存期限。',
    '保存期限表多列': '確認表單是否仍使用：仍使用則補列附錄，已停用則自保存期限表移除。',
    '部門代號未定義': '改編為現行部門代號，或於 CP─01 表2 增列此代號並說明所屬單位。',
    '編號與總覽表不符': '引用端程序書下次改版時，改為總覽表中的現行編號。',
    '總覽表未列': '確認文件是否已廢止：已廢止則修訂引用端程序書；仍使用則於文件總覽表補登錄。',
    '與總覽表不符': '以核准發行的版本為準，更正文件總覽表或重新放入最新原文。',
    '逾期未審視': '依《文件管制程序》於屆期前完成審視：需修訂則提出改版，不需修訂則更新審視日期。',
  };
  const SEV_ICON = {
    '重要': '<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 17.5v.01"/>',
    '注意': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
    '提示': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  };
  // 長句拆行、編號與引號名稱加上樣式
  function fmtMsg(msg) {
    const parts = String(msg || '').split(/(?<=[。；])|(?<=，)(?=但)|——/).map(x => x.trim()).filter(Boolean);
    const deco = s => esc(s)
      .replace(/((?:QS|CP|W[A-Z])─[0-9A-Z]{2,6}(?:─\d{2,3})?)/g, '<span class="icode">$1</span>')
      .replace(/「([^」]{1,60})」/g, '<q class="iq">$1</q>')
      .replace(/([〈《『])([^〉》』]{1,40})([〉》』])/g, '<span class="iname">$1$2$3</span>');
    return `<ul class="imsg">${parts.map((p, k) => `<li class="${k ? '' : 'first'}">${deco(p)}</li>`).join('')}</ul>`;
  }
  function issueHtml(i, open = false) {
    const n = (i.evidence || []).length;
    const c = codeOf(i.key).replace(/-/g, '─'), t = i.target ? codeOf(i.target).replace(/-/g, '─') : '';
    const node = N.get(i.key);
    const who = node && node.level ? `${c}${node.name && i.type !== '部門代號未定義' ? `〈${node.name}〉` : ''}` : c;
    const head = (ISSUE_HEAD[i.type] || (x => x))(who, t);
    return `<article class="issue sev-${i.severity}" data-key="${esc(i.key)}">
      <div class="is-rail"><svg viewBox="0 0 24 24" aria-hidden="true">${SEV_ICON[i.severity] || SEV_ICON['提示']}</svg></div>
      <div class="is-main">
        <div class="is-top"><span class="is-sev">${esc(i.severity)}</span><span class="is-type">${esc(i.type)}</span></div>
        <h5 class="is-head">${esc(head)}</h5>
        ${fmtMsg(i.msg)}
        ${ISSUE_FIX[i.type] ? `<div class="is-fix"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg><span><b>建議作法</b>${esc(ISSUE_FIX[i.type])}</span></div>` : ''}
        <div class="issue-actions">${n ? `<button class="btn small ev-toggle ripple-host"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>出處 ${n} 筆</button>` : ''}<button class="btn small go-doc ripple-host">查看文件 ›</button></div>
        <div class="ev-wrap" ${open ? '' : 'hidden'}>${evidenceHtml(i.evidence)}</div>
      </div></article>`;
  }
  function bindIssues(root) {
    $$('.issue', root).forEach(el => {
      $('.go-doc', el).onclick = e => { e.stopPropagation(); openDetail(el.dataset.key); };
      const t = $('.ev-toggle', el);
      if (t) t.onclick = e => { e.stopPropagation(); const w = $('.ev-wrap', el); w.hidden = !w.hidden; t.classList.toggle('on', !w.hidden); };
    });
  }
  let issueSev = null, issueQ = '';
  function renderIssues() {
    if (!$('#issueKpis')) return;
    const issues = [...(G.issues || [])].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    const types = {};
    for (const t of G.issue_types || Object.keys(ISSUE_HELP)) types[t] = { sev: null, n: 0 };
    for (const i of issues) { const v = types[i.type] = types[i.type] || { n: 0 }; v.sev = i.severity; v.n++; }
    const bySev = s => issues.filter(i => i.severity === s).length;
    const passed = Object.values(types).filter(v => !v.n).length;
    // 嚴重度指標
    $('#issueKpis').innerHTML = [['重要', bySev('重要'), '需優先處理'], ['注意', bySev('注意'), '建議改版時修正'], ['提示', bySev('提示'), '供覆核參考']]
      .map(([s, n, sub], k) => `<button class="ik sev-${s} ${issueSev === s ? 'on' : ''}" data-s="${s}" style="--d:${k * 70}ms"><span class="ik-ico"><svg viewBox="0 0 24 24">${SEV_ICON[s]}</svg></span><span class="ik-n"><b class="cnt" data-to="${n}">${n}</b><small>件</small></span><span class="ik-t">${s}</span><span class="ik-s">${sub}</span></button>`).join('')
      + `<div class="ik ik-ok" style="--d:210ms"><span class="ik-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg></span><span class="ik-n"><b>${passed}</b><small>類</small></span><span class="ik-t">通過</span><span class="ik-s">沒有發現問題的檢查</span></div>`;
    $$('#issueKpis .ik[data-s]').forEach(b => b.onclick = () => { issueSev = issueSev === b.dataset.s ? null : b.dataset.s; issueType = null; renderIssues(); });
    // 檢查類別
    const ordered = Object.entries(types).sort(([, a], [, b]) => (a.n ? SEV_ORDER[a.sev] : 3) - (b.n ? SEV_ORDER[b.sev] : 3));
    $('#issueSummary').innerHTML = ordered.map(([t, v]) => v.n
      ? `<button class="issue-type sev-${v.sev} ${issueType === t ? 'on' : ''}" data-t="${esc(t)}"><span class="it-n">${v.n}</span><span class="it-t">${esc(t)}</span><span class="it-h">${esc(ISSUE_HELP[t] || '')}</span></button>`
      : `<div class="issue-type pass"><span class="it-n">✓</span><span class="it-t">${esc(t)}</span><span class="it-h">${esc(ISSUE_HELP[t] || '')}</span></div>`).join('');
    $$('#issueSummary .issue-type[data-t]').forEach(el => el.onclick = () => { issueType = issueType === el.dataset.t ? null : el.dataset.t; renderIssues(); });
    // 篩選
    const qi = $('#issueQ');
    if (qi.value !== issueQ) qi.value = issueQ;
    qi.oninput = () => { issueQ = qi.value; fillIssues(issues); };
    fillIssues(issues);
  }
  function fillIssues(issues) {
    const q = normCode(issueQ.trim()), ql = issueQ.trim();
    const list = issues.filter(i => (!issueType || i.type === issueType) && (!issueSev || i.severity === issueSev)
      && (!ql || normCode(i.msg).includes(q) || i.msg.includes(ql) || normCode(codeOf(i.key)).includes(q)));
    $('#issueCount').innerHTML = `${issueType ? `<span class="ic-f">${esc(issueType)} <button data-clear="type">✕</button></span>` : ''}${issueSev ? `<span class="ic-f">${esc(issueSev)} <button data-clear="sev">✕</button></span>` : ''}顯示 <b>${list.length}</b> / ${issues.length} 件`;
    $$('#issueCount [data-clear]').forEach(b => b.onclick = () => { if (b.dataset.clear === 'type') issueType = null; else issueSev = null; renderIssues(); });
    const groups = [];
    for (const i of list) { let g = groups.find(x => x.t === i.type); if (!g) groups.push(g = { t: i.type, sev: i.severity, items: [] }); g.items.push(i); }
    const LIMIT = 40;
    $('#issueList').innerHTML = groups.map(g => `<section class="ig reveal">
        <header class="ig-h sev-${g.sev}"><span class="ig-dot"></span><b>${esc(g.t)}</b><span class="ig-n">${g.items.length} 件</span><span class="ig-help">${esc(ISSUE_HELP[g.t] || '')}</span></header>
        <div class="ig-list">${g.items.slice(0, LIMIT).map(i => issueHtml(i)).join('')}</div>
        ${g.items.length > LIMIT ? `<button class="btn small ig-more ripple-host" data-t="${esc(g.t)}">顯示其餘 ${g.items.length - LIMIT} 件</button>` : ''}
      </section>`).join('') || '<div class="empty">沒有符合條件的項目</div>';
    bindIssues($('#issueList'));
    $$('#issueList .ig-more').forEach(b => b.onclick = () => {
      const g = groups.find(x => x.t === b.dataset.t);
      const box = b.previousElementSibling;
      const tmp = document.createElement('div');
      tmp.innerHTML = g.items.slice(LIMIT).map(i => issueHtml(i)).join('');
      bindIssues(tmp); // 只綁定新加入的卡片，避免重複綁定
      box.append(...tmp.children); b.remove();
    });
    observeReveals($('#issueList'));
  }

  // ------------------------------------------------------------ ⑥ ISO
  function renderIso() {
    $('#isoTable tbody').innerHTML = (G.iso_map || []).map(r => {
      const top = !r.clause.includes('.');
      const docs = r.not_applicable ? '<span class="muted">暫不適用</span>' : (r.docs || []).map(k => {
        const n = N.get(k); return n ? `<button class="chip lv${n.level} dchip ripple-host" data-key="${esc(k)}"><span class="code">${esc(n.code)}</span> ${esc(nm(n))}</button>` : '';
      }).join('');
      if (top) return `<tr class="top"><td><span class="code">${esc(r.clause)}</span> ${esc(r.title)}</td><td>${esc(r.qms)}</td><td>${docs}</td></tr>`;
      return `<tr class="iso-row" data-c="${esc(r.clause)}" tabindex="0" aria-expanded="false"><td><span class="iso-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span><span class="code">${esc(r.clause)}</span> ${esc(CL.zhTitle(r.clause))}</td><td data-l="QMS">${esc(r.qms)}</td><td>${docs}</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="empty">尚未解析到品質手冊附錄A</td></tr>';
    $$('#isoTable .dchip').forEach(b => b.onclick = e => { e.stopPropagation(); openDetail(b.dataset.key); });
    // 點條文列展開：ISO 條號與英文標題、QMS 準則原文、品質手冊同條號內容
    const toggle = tr => {
      let det = tr.nextElementSibling?.classList.contains('iso-det') ? tr.nextElementSibling : null;
      if (!det) {
        const r = G.iso_map.find(x => x.clause === tr.dataset.c);
        const body = CL.isoBlock(r.clause) + CL.arts(r).map(CL.lawBlock).join('') + (CL.qsBlock(r.clause) || '<div class="cl-blk qs"><div class="cl-bh"><span class="cl-src-tag qs">品質手冊</span></div><div class="cl-txt muted">品質手冊此條只有標題，內容寫在下一層條文</div></div>');
        tr.insertAdjacentHTML('afterend', `<tr class="iso-det"><td colspan="3"><div class="cl-b"><div class="cl-bi">${body}</div></div></td></tr>`);
        det = tr.nextElementSibling; void det.offsetWidth;
      }
      const on = !tr.classList.contains('open');
      tr.classList.toggle('open', on); det.classList.toggle('open', on); tr.setAttribute('aria-expanded', on);
    };
    $$('#isoTable tr.iso-row').forEach(tr => {
      tr.onclick = e => { if (!e.target.closest('.dchip, a')) toggle(tr); };
      tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(tr); } };
    });
  }

  // ------------------------------------------------------------ ⑦ 異動紀錄
  function renderChanges() {
    const ch = G.changes || [];
    const pill = (x, cls) => `<span class="pill ${cls}" data-key="${esc(x.key)}" title="${esc(x.name || '')}">${esc(x.code)} ${esc((x.name || '').slice(0, 16))}</span>`;
    $('#timeline').innerHTML = ch.map(c => `<div class="tl-item reveal"><h4>${esc(c.at.replace('T', ' '))}　<span class="muted">第 ${c.revision} 版資料</span></h4>
      ${c.added.length ? `<div class="tl-row"><b style="color:var(--ok)">新增 ${c.added.length}</b>${c.added.map(x => pill(x, 'add')).join('')}</div>` : ''}
      ${c.removed.length ? `<div class="tl-row"><b style="color:var(--bad)">刪除 ${c.removed.length}</b>${c.removed.map(x => pill(x, 'del')).join('')}</div>` : ''}
      ${c.changed.length ? `<div class="tl-row"><b style="color:var(--warn)">變更 ${c.changed.length}</b>${c.changed.map(x => pill(x, 'chg') + `<span class="muted" style="font-size:12px">${esc(Object.entries(x.fields).map(([f, [a, b]]) => `${fieldName(f)}：${fmtVal(a)} → ${fmtVal(b)}`).join('；'))}</span>`).join('')}</div>` : ''}
    </div>`).join('') || '<div class="empty">尚無異動。之後把新版程序書放進 <code>source/</code> 資料夾（或用右上角「＋ 加入文件」），這裡會自動記錄。</div>';
    $$('#timeline .pill:not(.del)').forEach(p => p.onclick = () => N.has(p.dataset.key) && openDetail(p.dataset.key));
    observeReveals($('#timeline'));
  }
  const fieldName = f => ({ name: '名稱', version: '版次', effective: '施行日', effective_ym: '表單施行', parents: '上層', status: '狀態' }[f] || f);
  const fmtVal = v => Array.isArray(v) ? v.map(codeOf).join('、') || '—' : (v ?? '—');

  // ------------------------------------------------------------ 詳細抽屜
  let selKey = null;
  function relRow(k, meta = '') {
    const n = N.get(k); if (!n) return '';
    return `<div class="rel ripple-host" data-key="${esc(k)}">${lvTag(n.level)}<span class="code">${esc(n.code)}</span><span>${esc(nm(n))}</span><span class="meta">${meta}</span></div>`;
  }
  // 詳細面板：線條圖示取代表情符號，內容分段成卡片
  const DI = {
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    doc: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    clip: '<path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    swap: '<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-5a2 2 0 0 0-2 2"/><path d="M20 4v14h-6"/>',
    tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    warn: '<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 17.5v.01"/>',
    note: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    list: '<path d="M9 3h6v4H9z"/><path d="M8 5H5v16h14V5h-3M8 12h8M8 16h5"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  };
  const EMO = { '🎯': 'target', '📄': 'doc', '⬆': 'up', '⬇': 'down', '📎': 'clip', '🔗': 'link', '↔': 'swap', '📚': 'book', '📘': 'book', '📗': 'book', '🏷': 'tag', '⚠': 'warn', '📝': 'note', '📋': 'list', '🧭': 'compass' };
  const svgIco = k => `<svg class="di" viewBox="0 0 24 24" aria-hidden="true">${DI[k] || DI.doc}</svg>`;
  function enhanceDrawer() {
    const body = $('#drawerBody');
    $$('h4, .btn', body).forEach(h => {
      const m = h.innerHTML.match(/^\s*([^\s\w\u4e00-\u9fff（(<]+)\s*/u);
      if (!m) return;
      const k = Object.keys(EMO).find(e => m[1].includes(e));
      if (!k) return;
      h.innerHTML = (h.tagName === 'H4' ? `<span class="dh-ico">${svgIco(EMO[k])}</span>` : svgIco(EMO[k])) + h.innerHTML.slice(m[0].length);
    });
    const frag = document.createDocumentFragment();
    let cur = null, i = 0;
    for (const el of [...body.children]) {
      if (el.tagName === 'H4') { cur = document.createElement('section'); cur.className = 'dsec'; cur.style.setProperty('--i', i++); frag.appendChild(cur); }
      if (cur) cur.appendChild(el);
      else { el.classList.add('dlead'); el.style.setProperty('--i', i++); frag.appendChild(el); }
    }
    body.replaceChildren(frag);
    makeFoldable(body);
    CL.bind(body);
    $('#scrim').classList.add('on');
  }
  // 折疊動畫進行中暫停頁首收合判斷，避免高度變化觸發閃爍
  let foldBusy = false, foldTimer = null;
  const holdFold = () => { foldBusy = true; clearTimeout(foldTimer); foldTimer = setTimeout(() => { foldBusy = false; }, 450); };
  // 各段落改為折疊式：記住使用者常展開的段落
  const foldKey = h => h.textContent.replace(/（[^）]*）|\([^)]*\)|PDF 第 \d+ 頁 ↗|[\d↗]/g, '').trim();
  const foldPref = (() => { try { return JSON.parse(localStorage.getItem('qms.fold') || '{}'); } catch (e) { return {}; } })();
  const saveFold = () => { try { localStorage.setItem('qms.fold', JSON.stringify(foldPref)); } catch (e) { /* 無痕模式 */ } };
  function makeFoldable(body) {
    const secs = $$('.dsec', body);
    secs.forEach((sec, i) => {
      const h = $('h4', sec); if (!h) return;
      const key = h.dataset.fold || foldKey(h);
      const inner = document.createElement('div'); inner.className = 'dsec-in';
      while (h.nextSibling) inner.appendChild(h.nextSibling);
      const wrap = document.createElement('div'); wrap.className = 'dsec-body'; wrap.appendChild(inner);
      sec.appendChild(wrap);
      const cnt = key.length && h.textContent.match(/[（(](\d+)[）)]/);
      h.insertAdjacentHTML('beforeend', `<span class="dsec-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>`);
      h.classList.add('dsec-h');
      h.setAttribute('role', 'button'); h.tabIndex = 0;
      const open = key in foldPref ? foldPref[key] : i === 0;
      sec.classList.toggle('open', open); h.setAttribute('aria-expanded', open);
      if (cnt) sec.dataset.count = cnt[1];
      const toggle = () => {
        holdFold();
        const on = !sec.classList.contains('open');
        sec.classList.toggle('open', on); h.setAttribute('aria-expanded', on);
        foldPref[key] = on; saveFold();
      };
      h.addEventListener('click', e => { if (e.target.closest('a')) return; toggle(); });
      h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
    if (secs.length > 1) {
      body.insertAdjacentHTML('afterbegin', `<div class="fold-bar"><span>${secs.length} 個段落</span><button class="btn small" data-fold="1">全部展開</button><button class="btn small" data-fold="0">全部收合</button></div>`);
      $$('.fold-bar [data-fold]', body).forEach(b => b.onclick = () => {
        holdFold();
        const on = b.dataset.fold === '1';
        $$('.dsec', body).forEach(sec => { sec.classList.toggle('open', on); $('h4', sec)?.setAttribute('aria-expanded', on); });
      });
    }
  }
  // 文字易讀化：段落、條列、依據句分開呈現
  function setProcMode(m) {
    if (procMode === m) return;
    procMode = m;
    try { localStorage.setItem('qms.procMode', procMode); } catch (e) { /* 無痕模式 */ }
    renderProcs();
    CL.refresh();
  }

  // ------------------------------------------------------------ 對應條文（ISO 13485:2016／QMS 準則）
  // 對照關係取自品質手冊 QS─01 附錄A；QMS 條文原文取自全國法規資料庫；ISO 只列條號與標題（標準本文受著作權保護）；
  // 品質手冊內容取自 QS─01 同條號段落（公開版不含）。依「程序書一覽」的 ISO／QMS 切換顯示，點條文展開細項。
  const CL = (() => {
    const refs = () => G.refs || {};
    const arts = r => (r.qms || '').match(/\d+/g)?.map(Number) || [];
    const isoKey = c => c.split('.').map(x => x.padStart(3, '0')).join('.');
    function rows(key) {
      const all = (G.iso_map || []).filter(r => (r.docs || []).includes(key));
      // 已列出子條文時，省略只有標題的上層條（例如 7.4 採購 → 7.4.1、7.4.2）
      return all.filter(r => !all.some(x => x !== r && x.clause.startsWith(r.clause + '.')));
    }
    const zhTitle = c => {
      const r = (G.iso_map || []).find(x => x.clause === c);
      if (r?.title) return r.title;
      const up = c.split('.').slice(0, -1).join('.');
      return up ? `${zhTitle(up)}・第 ${c.split('.').pop()} 項` : '';
    };
    const enTitle = c => refs().iso?.titles?.[c] ?? '';
    const lawHtml = t => {
      const lines = String(t || '').split('\n').filter(Boolean);
      let html = '', list = [];
      const flush = () => { if (list.length) { html += `<ol class="rd-list law">${list.map(([m, x]) => `<li><span class="rd-m">${esc(m)}</span><span>${esc(x)}</span></li>`).join('')}</ol>`; list = []; } };
      for (const l of lines) {
        const m = l.match(/^([一二三四五六七八九十]+)、(.*)$/) || l.match(/^（([一二三四五六七八九十]+)）(.*)$/);
        if (m) { list.push([m[1], m[2]]); continue; }
        flush(); html += `<p class="rd-p">${esc(l)}</p>`;
      }
      flush();
      return html;
    };
    function qsBlock(c, qmsMode) {
      const t = G.qs_text?.[c];
      if (!t) return '';
      // ISO 沒有標題的條文（4.1.1～4.1.6），解析時第一行會被當成標題，接回本文
      const text = enTitle(c) === '' ? t.title + t.text : t.text;
      const where = qmsMode ? `QS─01 ${esc(enTitle(c) === '' ? '' : t.title)}` : `QS─01 ${esc(c)}`;
      return `<div class="cl-blk qs"><div class="cl-bh"><span class="cl-src-tag qs">品質手冊</span><b>${where}</b><span class="muted">第 ${t.page} 頁</span></div><div class="cl-txt">${readable(text)}</div></div>`;
    }
    // 準則條文沒有標題：取第一句當摘要
    const artGist = a => {
      if (!a) return '';
      const first = a.text.split('\n')[0].replace(/^製造業者(應|之)?/, '').split(/[。；：]/)[0];
      return first.length > 34 ? first.slice(0, 34) + '…' : first;
    };
    function lawBlock(no) {
      const a = refs().qms?.articles?.[no];
      if (!a) return `<div class="cl-blk law"><div class="cl-bh"><span class="cl-src-tag law">QMS 準則</span><b>第 ${no} 條</b></div><div class="cl-txt muted">尚未下載準則原文（執行 tools/fetch_refs.py）</div></div>`;
      return `<div class="cl-blk law"><div class="cl-bh"><span class="cl-src-tag law">QMS 準則</span><b>第 ${no} 條</b><span class="muted">${esc(a.chapter)}</span><a class="cl-ext" href="https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0030116&amp;flno=${no}" target="_blank" rel="noopener">法規原文 ↗</a></div><div class="cl-txt">${lawHtml(a.text)}</div></div>`;
    }
    function isoBlock(c) {
      const en = enTitle(c);
      return `<div class="cl-blk iso"><div class="cl-bh"><span class="cl-src-tag iso">ISO 13485:2016</span><b>${esc(c)}</b><span>${esc(zhTitle(c))}</span></div>
        <div class="cl-txt"><p class="rd-p">${en ? `英文標題：<i>${esc(en)}</i>` : '本條在標準中沒有標題（屬上層條文的一項要求）'}</p><p class="rd-p cl-note">標準本文受 ISO 著作權保護，不在此轉載；請見 <a href="https://www.iso.org/obp/ui/en/#iso:std:iso:13485:ed-3:v1:en" target="_blank" rel="noopener">ISO 線上瀏覽平台 ↗</a> 或公司購置的正式版本。</p></div></div>`;
    }
    function docsBlock(key, rs) {
      const others = [...new Set(rs.flatMap(r => r.docs || []))].filter(k => k !== key && N.get(k));
      const na = rs.some(r => r.not_applicable);
      return `${na ? '<div class="cl-na">品質手冊附錄A 標示本條「不適用」</div>' : ''}${others.length ? `<div class="cl-docs"><span>同條文的負責文件</span>${others.map(k => `<button class="pchip lv${N.get(k).level} cl-doc" data-key="${esc(k)}">${esc(N.get(k).code)} ${esc(nm(N.get(k)))}</button>`).join('')}</div>` : ''}`;
    }
    const chev = '<span class="cl-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>';
    function items(key) {
      const rs = rows(key).sort((a, b) => isoKey(a.clause).localeCompare(isoKey(b.clause)));
      if (procMode === 'qms') {
        const by = new Map();
        for (const r of rs) for (const a of arts(r)) { if (!by.has(a)) by.set(a, []); by.get(a).push(r); }
        const list = [...by.entries()].sort((a, b) => a[0] - b[0]);
        return { n: list.length, html: list.map(([no, rr]) => {
          const a = refs().qms?.articles?.[no];
          const ch = a?.chapter?.replace(/\s+/g, '') || '';
          return `<div class="cl-it" data-art="${no}" data-cls="${esc(rr.map(r => r.clause).join(','))}">
            <button class="cl-h" aria-expanded="false"><b class="cl-no">第 ${no} 條</b><span class="cl-t">${esc(artGist(a))}<small>${esc(ch)}</small></span>${chev}</button>
            <div class="cl-b"><div class="cl-bi"></div></div></div>`;
        }).join('') };
      }
      return { n: rs.length, html: rs.map(r => `<div class="cl-it" data-cls="${esc(r.clause)}">
          <button class="cl-h" aria-expanded="false"><b class="cl-no">${esc(r.clause)}</b><span class="cl-t">${esc(zhTitle(r.clause))}<small>${esc(enTitle(r.clause))}</small></span>${r.not_applicable ? '<span class="cl-tag na">不適用</span>' : ''}${chev}</button>
          <div class="cl-b"><div class="cl-bi"></div></div></div>`).join('') };
    }
    function detail(key, it) {
      const cls = it.dataset.cls.split(',');
      const rs = cls.map(c => (G.iso_map || []).find(r => r.clause === c)).filter(Boolean);
      if (it.dataset.art) return lawBlock(it.dataset.art) + cls.map(c => qsBlock(c, true)).join('') + docsBlock(key, rs);
      return isoBlock(cls[0]) + qsBlock(cls[0]) + docsBlock(key, rs);
    }
    const title = n => procMode === 'qms' ? `對應 QMS 準則條文（${n}）` : `對應 ISO 13485:2016 條文（${n}）`;
    const hint = () => procMode === 'qms'
      ? '點條文展開：《醫療器材品質管理系統準則》條文原文、品質手冊對應內容與同條文負責文件。'
      : '點條文展開：ISO 13485:2016 條文標題、品質手冊對應內容與同條文負責文件。';
    function srcNote() {
      const q = refs().qms, i = refs().iso;
      const lines = [];
      if (q && procMode === 'qms') lines.push(`QMS：《${esc(q.name)}》${esc(q.issued || '')}發布${q.amended ? `，${esc(q.amended)}修正` : '，未曾修正'}（<a href="${esc(q.provenance?.url || '')}" target="_blank" rel="noopener">全國法規資料庫</a>，${esc((q.provenance?.checked_at || '').slice(0, 10))} 查核為最新版）`);
      if (i && procMode !== 'qms') lines.push(`ISO：ISO 13485:2016 第 3 版（<a href="${esc(i.provenance?.status_url || '')}" target="_blank" rel="noopener">iso.org</a> 標示 2025 年複審確認為現行版，${esc(i.provenance?.status_checked_at || '')} 查核）`);
      lines.push(`對照關係：品質手冊 QS─01 附錄A${G.qs_text && Object.keys(G.qs_text).length ? '；手冊內容：QS─01 同條號段落' : ''}`);
      return `<div class="cl-foot">${lines.join('<br>')}</div>`;
    }
    function section(key) {
      const { n, html } = items(key);
      return `<h4 data-fold="對應條文" class="cl-head">⬆ ${title(n)}</h4><div class="cl-sec" data-key="${esc(key)}">
        <div class="seg cl-mode" role="tablist"><button data-m="iso">依 ISO 13485 章節</button><button data-m="qms">依 QMS 條號</button></div>
        <p class="cl-hint">${hint()}</p>
        <div class="cl-list">${html}</div>${srcNote()}</div>`;
    }
    function bind(body) {
      const sec = $('.cl-sec', body); if (!sec) return;
      $$('.cl-mode button', sec).forEach(b => { b.classList.toggle('on', b.dataset.m === procMode); b.onclick = e => { e.stopPropagation(); setProcMode(b.dataset.m); }; });
      $('.cl-list', sec).onclick = e => {
        const d = e.target.closest('.cl-doc'); if (d) { openDetail(d.dataset.key); return; }
        const h = e.target.closest('.cl-h'); if (!h) return;
        const it = h.parentElement, bi = $('.cl-bi', it);
        if (!bi.innerHTML) bi.innerHTML = detail(sec.dataset.key, it);
        holdFold();
        const on = !it.classList.contains('open');
        it.classList.toggle('open', on); h.setAttribute('aria-expanded', on);
      };
    }
    // 切換 ISO／QMS 時，就地更新已開啟面板的條文段落（保留捲動位置與段落展開狀態）
    function refresh() {
      const sec = $('#drawerBody .cl-sec'); if (!sec) return;
      const { n, html } = items(sec.dataset.key);
      $('.cl-list', sec).innerHTML = html;
      const h = sec.closest('.dsec')?.querySelector('h4');
      const t = h && [...h.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
      if (t) t.textContent = title(n);
      $$('.cl-mode button', sec).forEach(b => b.classList.toggle('on', b.dataset.m === procMode));
      $('.cl-hint', sec).textContent = hint();
      $('.cl-foot', sec).outerHTML = srcNote();
    }
    return { rows, section, bind, refresh, isoBlock, lawBlock, qsBlock, arts, zhTitle };
  })();

  function readable(text) {
    let t = String(text || '');
    if (!t.includes('\n')) { // 舊資料沒有段落資訊：在條列項目前、句末後自動換行
      t = t.replace(/(^|[\s。；：，])([a-z]|\d{1,2})\)\s*/g, (m, p, x) => `${p}\n${x}) `).replace(/([。；])(?=\S)/g, '$1\n');
    }
    const lines = t.split('\n').map(x => x.trim()).filter(Boolean);
    let html = '', list = [];
    const flush = () => { if (list.length) { html += `<ol class="rd-list">${list.map(([m, t]) => `<li><span class="rd-m">${esc(m)}</span><span>${esc(t)}</span></li>`).join('')}</ol>`; list = []; } };
    for (const l of lines) {
      const m = l.match(/^([a-z]|\d{1,2})\)\s*(.*)$/);
      if (m) { list.push([m[1], m[2]]); continue; }
      flush();
      if (/^本(程序|手冊|作業指導書)依.*訂定/.test(l)) { html += `<div class="rd-basis"><b>依據</b>${esc(l.replace(/。$/, ''))}</div>`; continue; }
      // 長串「、」列舉（例如產品清單）改為標籤
      const em = l.match(/^(.{0,24}?(?:有|包括|包含|如下|：))(.+)$/);
      if (em && (em[2].match(/、/g) || []).length >= 6) {
        let rest = em[2], suffix = '';
        const cut = rest.lastIndexOf('等');
        if (cut > 0) { suffix = rest.slice(cut); rest = rest.slice(0, cut); }
        html += `<p class="rd-p">${esc(em[1])}</p><div class="rd-chips">${rest.split('、').filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>${suffix ? `<p class="rd-p rd-suf">${esc(suffix)}</p>` : ''}`;
        continue;
      }
      html += `<p class="rd-p">${esc(l)}</p>`;
    }
    flush();
    return html;
  }
  function purposeHtml(n) {
    const parts = (n.purpose_parts || []).filter(x => x.text || x.title);
    if (!parts.length) return `<div class="rd">${readable(n.purpose)}</div>`;
    const sub = parts.filter(x => x.clause.includes('.'));
    if (!sub.length) return `<div class="rd">${readable(parts.map(x => x.text).join('\n'))}</div>`;
    const intro = parts.find(x => !x.clause.includes('.'));
    return `<div class="rd">${intro?.text ? readable(intro.text) : ''}${sub.map(x => `<div class="rd-sec"><div class="rd-h"><span class="rd-no">${esc(x.clause)}</span>${esc(x.title)}</div>${readable(x.text)}</div>`).join('')}</div>`;
  }
  function headStats(items) {
    const list = items.filter(([, v]) => v !== undefined && v !== null && v !== '' && !/^0 /.test(String(v))); // 0 的項目不顯示
    if (!list.length) return;
    $('#drawerHead').insertAdjacentHTML('beforeend', `<div class="dh-stats">${list.map(([l, v, org], i) => org
      ? `<button class="dh-st dh-link" data-org-unit="${esc(org)}" style="--i:${i}" title="在組織架構圖中查看"><i>${esc(l)}</i><b>${esc(String(v))}</b><span class="dh-go">↗</span></button>`
      : `<span class="dh-st" style="--i:${i}"><i>${esc(l)}</i><b>${esc(String(v))}</b></span>`).join('')}</div>`);
    $$('#drawerHead [data-org-unit]').forEach(b => b.onclick = () => { const uid = b.dataset.orgUnit; closeDetail(); switchView('org'); setTimeout(() => ORG.pick(uid), 200); });
  }

  function openDetail(key) {
    const n = N.get(key); if (!n) return;
    selKey = key;
    const d = $('#drawer');
    d.className = `drawer open lv${n.level}`;
    d.setAttribute('aria-hidden', 'false');
    const chain = chainOf(key);
    $('#drawerHead').innerHTML = `<div class="row1">${lvTag(n.level)}<span class="muted" style="font-size:13px">${esc(n.kind || LV[n.level].kind)}</span>
        ${n.group ? '' : n.status === 'register' ? '<span class="chip ok-chip" style="font-size:12px">已登錄文件總覽表・原文未收錄</span>' : n.status !== 'file' && n.level <= 3 ? '<span class="chip" style="font-size:12px">未收錄原文，僅由引用得知</span>' : ''}
        <button class="close" id="drawerClose" aria-label="關閉">×</button></div>
      <h2><span class="code">${esc(n.code)}</span>　${esc(nm(n))}</h2>${n.name_en ? `<div class="en">${esc(n.name_en)}</div>` : ''}
      <div class="crumbs">${chain.map((k, i) => `${i ? '›' : ''}<button class="tag lv${N.get(k).level}" data-key="${esc(k)}">${esc(N.get(k).code)}</button>`).join('')}</div>`;
    $('#drawerClose').onclick = closeDetail;
    $$('#drawerHead .crumbs button').forEach(b => b.onclick = () => openDetail(b.dataset.key));
    const deptUnit = n.dept ? (G.organization?.units || []).find(x => (x.doc_dept || []).includes(n.dept) || x.name === n.dept) : null;
    const deptStat = n.dept ? [['制定', n.dept, deptUnit?.id]] : [];
    headStats(n.level === 4
      ? [['保存期限', n.retention?.retention], ['施行', n.effective_ym], ['附錄', n.appendix_label], ['被引用', `${(n.cited_by || []).length} 份`]]
      : n.group
        ? [['份數', `${kidsOf(key, 3).length} 份`]]
      : n.level === 3
        ? [['類型', n.kind], ['版次', n.version && `V${n.version}`], ...deptStat, ['屆期', n.register?.review_due], ['被引用', `${(n.cited_by || []).length} 份`], ['表單', kidsOf(key, 4).length ? `${kidsOf(key, 4).length} 種` : null]]
        : [['版次', n.version && `V${n.version}`], ['施行', n.effective], ...deptStat, n.level === 1 ? ['程序書', `${kidsOf(key, 2).length} 份`] : ['三階', `${kidsOf(key, 3).length} 份`], n.level === 2 ? ['紀錄', `${kidsOf(key, 4).length} 種`] : ['頁數', n.pages && `${n.pages} 頁`]]);

    const parts = [];
    const plainLine = {
      1: '這是整個品質系統的最上層，所有程序書都依它而來。',
      2: (() => { const k3 = kidsOf(key, 3).map(k => N.get(k)); const strong = k3.filter(x => x.parent_basis === '列於相關文件').length;
        return `這是一份程序書，底下有 <b>${kidsOf(key, 4).length} 種紀錄表單</b>，以及 ${k3.length} 份三階文件${k3.length ? `（${strong} 份列在「4 相關文件」，${k3.length - strong} 份只在本文中提到，例如訓練教材或參考）` : ''}。`; })(),
      3: n.group
        ? `文件總覽表中「${esc(n.kind)}」類、目前沒有任何程序書引用的三階文件，共 ${kidsOf(key, 3).length} 份。`
        : `這是三階文件（${esc(n.kind || '')}），用來說明具體怎麼做。${(PS.get(key) || []).filter(k => N.get(k)?.level === 2).length > 1 ? `它被 ${(PS.get(key) || []).length} 份程序書共同使用。` : ''}${(PS.get(key) || []).some(k => N.get(k)?.group) ? '目前沒有程序書引用它，依文件總覽表分類歸組。' : ''}`,
      4: `這是一張紀錄表單，屬於 <b class="code">${esc(codeOf((PS.get(key) || [])[0] || ''))}</b>${N.get((PS.get(key) || [])[0]) ? ` ${esc(nm(N.get(PS.get(key)[0])))}` : ''}。執行工作後填寫留存，是稽核時的證據。`,
    }[n.level];
    parts.push(`<div class="plain">${plainLine}</div>`);
    if (n.purpose_parts?.length || n.purpose) parts.push(`<h4>🎯 ${n.level === 1 ? '文件概要' : '這份文件在做什麼'}</h4>${purposeHtml(n)}`);
    const facts = [];
    if (n.version) facts.push(['版次', `第 ${esc(n.version)} 版`]);
    if (n.effective) facts.push(['施行日', esc(n.effective)]);
    if (n.effective_ym) facts.push(['表單施行', esc(n.effective_ym)]);
    // 制定單位已移至頁首屬性欄
    if (n.appendix_label) facts.push(['附錄位置', `${esc(n.in_appendix_of)} ${esc(n.appendix_label)}`]);
    if (n.retention) facts.push(['審查／核准', `${esc(n.retention.review || '—')} ／ ${esc(n.retention.approve || '—')}`], ['保存期限', `<b>${esc(n.retention.retention || '—')}</b>`]);
    if (n.electronic) facts.push(['形式', '電子表單']);
    if (n.register) {
      const r = n.register;
      facts.push(['總覽表分類', esc(r.sheet)]);
      if (r.review_due) facts.push(['屆期日期', `${esc(r.review_due)}${r.overdue ? ' <span class="od-badge">已逾期</span>' : ''}`]);
      if (r.review_cycle) facts.push(['審視週期', `${r.review_cycle} 年`]);
      if (n.level === 3 && r.effective && r.effective !== n.effective) facts.push(['總覽表施行', esc(r.effective)]);
      if (r.pending?.length) facts.push(['待施行版本', r.pending.map(x => `V${esc(x.version || '—')}（${esc(x.effective || '—')} 施行）`).join('、')]);
    }
    if (n.pages) facts.push(['頁數', `${n.pages} 頁`]);
    if (n.file) facts.push(['原始檔', `<a href="../${encodeURI(n.file)}" target="_blank" rel="noopener">${esc(n.file.split('/').pop())}</a> <span class="muted code">${esc(n.sha256_16 || '')}</span>`]);
    if (n.superseded_files?.length) facts.push(['舊版檔案', n.superseded_files.map(f => `${esc(f.file)}（V${esc(f.version)}）`).join('、')]);
    const WIDE = ['原始檔', '舊版檔案', '附錄位置', '制定單位', '審查／核准'];
    if (facts.length) parts.push(`<h4>📄 基本資料</h4><div class="facts">${facts.map(([a, b]) => `<div class="fact${WIDE.includes(a) ? ' wide' : ''}"><span>${a}</span><b>${b}</b></div>`).join('')}</div>`);

    if (n.level <= 2 && CL.rows(key).length) parts.push(CL.section(key));
    const ps = (PS.get(key) || []).filter(k => k !== ROOT || n.level === 2);
    if (ps.length && n.level > 1) {
      parts.push(`<h4>⬆ 上層文件</h4><div class="why">判定依據：${esc(n.parent_basis || (n.level === 2 ? '二階程序書隸屬品質手冊' : '—'))}</div><div class="rel-list">${ps.map(k => relRow(k)).join('')}</div>`);
    }
    const k3 = kidsOf(key, 3), k4 = kidsOf(key, 4);
    if (k3.length) {
      const grp = {};
      for (const k of k3) (grp[N.get(k).parent_basis || '其他'] = grp[N.get(k).parent_basis || '其他'] || []).push(k);
      const order = ['列於相關文件', '本文引用', '附錄內引用', '其表單被引用', '其他'];
      parts.push(`<h4>⬇ 三階文件（${k3.length}）</h4>` + order.filter(b => grp[b]).map(b =>
        `<div class="why">${esc(b)}（${grp[b].length}）</div><div class="rel-list">${grp[b].map(k => relRow(k, (PS.get(k) || []).length > 1 ? `共用 ${(PS.get(k) || []).length} 份` : '')).join('')}</div>`).join(''));
    }
    if (k4.length) parts.push(`<h4>⬇ 紀錄表單（${k4.length}）</h4><div class="rel-list">${k4.map(k => { const f = N.get(k); return relRow(k, [f.retention?.retention ? `保存 ${esc(f.retention.retention)}` : '', f.electronic ? '電子' : ''].filter(Boolean).join('・')); }).join('')}</div>`);
    const noCode = (n.appendix || []).filter(a => !a.key);
    if (noCode.length) parts.push(`<h4>📎 其他附錄（非表單）</h4><div>${noCode.map(a => `<div style="font-size:14px">${esc(a.label)}：${esc(a.name)}</div>`).join('')}</div>`);
    const cb = (n.cited_by || []).filter(c => N.has(c.key));
    if (cb.length) parts.push(`<h4>🔗 被哪些文件引用（${cb.length}）</h4><div class="rel-list">${cb.map(c => relRow(c.key, c.clauses?.length ? `第 ${esc(c.clauses.slice(0, 4).join('、'))} 條${c.clauses.length > 4 ? '…' : ''}` : `${c.count} 次`)).join('')}</div>`);
    const ci = (n.cites || []).filter(c => N.has(c.key) && N.get(c.key).level <= 3 && !kidsOf(key).includes(c.key));
    if (ci.length) parts.push(`<h4>↔ 本文引用的其他文件（${ci.length}）</h4><div class="rel-list">${ci.map(c => relRow(c.key)).join('')}</div>`);
    if (n.related_uncoded?.length) parts.push(`<h4>📚 相關文件（無編號／外部法規）</h4><div style="font-size:14px">${n.related_uncoded.map(esc).join('、')}</div>`);
    if (n.aliases?.length) parts.push(`<h4>🏷 其他寫法</h4><div style="font-size:14px">${n.aliases.map(esc).join('、')}</div>`);
    const iss = issuesOf(key);
    if (iss.length) parts.push(`<h4>⚠ 檢查提示（${iss.length}）</h4><div class="issue-list" id="drawerIssues">${[...iss].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).map(i => issueHtml(i)).join('')}</div>`);
    if (n.notes?.length) parts.push(`<h4>📝 備註</h4><div style="font-size:14px">${n.notes.map(esc).join('<br>')}</div>`);
    parts.push(`<div style="margin-top:18px"><button class="btn primary ripple-host" id="showInMap">🧭 在心智圖中顯示</button></div>`);
    $('#drawerBody').innerHTML = parts.join('');
    $('#drawerBody').scrollTop = 0; $('#drawer').classList.remove('scrolled');
    $$('#drawerBody .rel').forEach(r => r.onclick = () => openDetail(r.dataset.key));
    if ($('#drawerIssues')) bindIssues($('#drawerIssues'));
    $$('#drawerBody [data-org-unit]').forEach(b => b.onclick = () => { const uid = b.dataset.orgUnit; closeDetail(); switchView('org'); setTimeout(() => ORG.pick(uid), 200); });
    $('#showInMap').onclick = () => { closeDetail(); switchView('mindmap'); setTimeout(() => MM.focus(key), 60); };
    enhanceDrawer();
    MM.select(key);
  }
  function closeDetail() { $('#scrim')?.classList.remove('on'); $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); selKey = null; MM.select(null); ORG.clearSel(); }

  // ------------------------------------------------------------ 搜尋
  function setupSearch() {
    const q = $('#q'), box = $('#results');
    let act = 0, hits = [];
    const run = () => {
      const s = q.value.trim(); const sc = normCode(s); const sl = s.toLowerCase();
      if (!s) { box.classList.remove('open'); return; }
      hits = G.nodes.filter(n => normCode(n.code).includes(sc) || (n.name || '').toLowerCase().includes(sl) || (n.aliases || []).some(a => a.includes(s)))
        .sort((a, b) => (normCode(a.code).startsWith(sc) ? -1 : 0) - (normCode(b.code).startsWith(sc) ? -1 : 0) || a.level - b.level).slice(0, 40);
      act = 0;
      box.innerHTML = hits.map((n, i) => `<button class="${i === act ? 'active' : ''}" data-key="${esc(n.key)}">${lvTag(n.level)}<span class="code">${esc(n.code)}</span><span>${esc(nm(n))}</span></button>`).join('') || '<div class="empty">找不到</div>';
      box.classList.add('open');
      $$('button', box).forEach(b => b.onmousedown = e => { e.preventDefault(); pick(b.dataset.key); });
    };
    const pick = k => { box.classList.remove('open'); q.blur(); openDetail(k); };
    q.addEventListener('input', run);
    q.addEventListener('focus', run);
    q.addEventListener('blur', () => setTimeout(() => box.classList.remove('open'), 150));
    q.addEventListener('keydown', e => {
      if (!hits.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
        $$('button', box).forEach((b, i) => b.classList.toggle('active', i === act)); $$('button', box)[act]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') pick(hits[act].key);
      else if (e.key === 'Escape') box.classList.remove('open');
    });
  }

  // ------------------------------------------------------------ ② 心智圖
  const MM = (() => {
    const COLX = [0, 280, 630, 980];
    const W = [240, 300, 300, 280];
    const H = 40, ROW = 48;
    const svg = $('#mindmap'), vp = $('#mmViewport'), gN = $('#mmNodes'), gL = $('#mmLinks');
    let expanded = new Set(), view = { tx: 60, ty: 60, k: 1 };
    const nodeEls = new Map(), linkEls = new Map(), pos = new Map();
    let colTitles = null, started = false, needFit = true, ghostTimer = null;
    const opt = { forms: true, shared: false };
    let sel = null, hoverId = null, focusSet = null, focusUnit = null;
    const BADGE = { 1: '一', 2: '二', 3: '三', 4: '紀' };

    const rootId = () => ROOT;
    function childInst(inst) {
      const out = [];
      for (const k of KIDS.get(inst.key) || []) {
        const n = N.get(k);
        if (n.level === 4 && !opt.forms) continue;
        if (n.level === 3 && !opt.shared && (PS.get(k) || [])[0] !== inst.key) continue;
        out.push({ id: `${inst.id}>${k}`, key: k, parentId: inst.id });
      }
      for (const r of recent.removed) {
        if ((r.parents || [])[0] === inst.key || (!r.parents?.length && inst.key === ROOT)) {
          if (r.level === 4 && !opt.forms) continue;
          out.push({ id: `${inst.id}>${r.key}~ghost`, key: r.key, parentId: inst.id, ghost: r });
        }
      }
      return out;
    }
    function layout() {
      const list = []; let y = 0;
      const visit = (inst, depth) => {
        inst.depth = Math.min(depth, 3); inst.x = COLX[inst.depth];
        const kids = !inst.ghost && expanded.has(inst.id) ? childInst(inst) : [];
        inst.nKids = inst.ghost ? 0 : childInst(inst).length;
        if (!kids.length) { inst.y = y; y += ROW; }
        else { kids.forEach(k => visit(k, depth + 1)); inst.y = (kids[0].y + kids[kids.length - 1].y) / 2; }
        list.push(inst);
      };
      visit({ id: rootId(), key: ROOT, parentId: null }, 0);
      return list;
    }
    const textFit = (s, px) => { let w = 0, out = ''; for (const ch of s || '') { const cw = /[\x00-\xff]/.test(ch) ? 7.2 : 13; if (w + cw > px) return out + '…'; w += cw; out += ch; } return out; };
    function nodeClass(inst) {
      const n = inst.ghost ? inst.ghost : N.get(inst.key);
      const c = ['mm-node', `lv${n.level}`];
      if (inst.ghost) c.push('is-removed');
      else {
        if (recent.added.has(inst.key)) c.push('is-added');
        else if (recent.changed.has(inst.key)) c.push('is-changed');
        if (n.level <= 2 && n.status !== 'file' && n.status !== 'virtual') c.push('missing');
        if (sel === inst.key) c.push('selected');
        if (focusSet) c.push(focusSet.has(inst.key) ? 'f-hit' : 'f-dim');
      }
      return c.join(' ');
    }
    function buildNode(inst) {
      const n = inst.ghost ? inst.ghost : N.get(inst.key);
      const w = W[inst.depth];
      const g = svgEl('g', { class: nodeClass(inst) });
      g.dataset.id = inst.id; g.dataset.key = inst.key;
      const body = svgEl('g', { class: 'body' });
      body.appendChild(svgEl('rect', { class: 'box', x: 0, y: -H / 2, width: w, height: H, rx: 11 }));
      body.appendChild(svgEl('rect', { class: 'shine', x: 1.5, y: -H / 2 + 1.5, width: w - 3, height: H / 2 - 2, rx: 9 }));
      body.appendChild(svgEl('circle', { class: 'badge', cx: 20, cy: 0, r: 12.5 }));
      const bt = svgEl('text', { class: 'badge-t', x: 20, y: 0.5 }); bt.textContent = BADGE[n.level];
      const t1 = svgEl('text', { class: 't1', x: 40, y: -4 });
      const extra = n.level === 4 ? (n.retention?.retention ? ` · 保存${n.retention.retention}` : '') : n.version ? ` · V${n.version}` : '';
      t1.textContent = textFit(`${n.code}${inst.ghost ? ' · 已刪除' : extra}`, w - 62);
      const t2 = svgEl('text', { class: 't2', x: 40, y: 12.5 });
      t2.textContent = textFit(n.name || '（未解析名稱）', w - 62);
      body.append(bt, t1, t2);
      g.appendChild(body);
      const tog = svgEl('g', { class: 'tog', transform: `translate(${w},0)` });
      tog.append(svgEl('circle', { r: 11, cx: 0, cy: 0 }), svgEl('text', { x: 0, y: 0 }));
      g.appendChild(tog);
      return g;
    }
    const nodeSig = inst => { const n = inst.ghost || N.get(inst.key) || {}; return JSON.stringify([n.code, n.name, n.version, n.retention?.retention, !!inst.ghost, inst.depth]); };
    function updateNode(g, inst) {
      const sig = nodeSig(inst);
      if (g.dataset.sig && g.dataset.sig !== sig) { const fresh = buildNode(inst); g.replaceChildren(...fresh.childNodes); }
      g.dataset.sig = sig;
      g.setAttribute('class', nodeClass(inst));
      const tog = g.querySelector('.tog');
      if (inst.nKids) { tog.style.display = ''; tog.querySelector('text').textContent = expanded.has(inst.id) ? '−' : inst.nKids; tog.classList.toggle('open', expanded.has(inst.id)); }
      else tog.style.display = 'none';
    }
    const linkD = (px, py, cx, cy) => { const mx = (px + cx) / 2; return `M${px},${py} C${mx},${py} ${mx},${cy} ${cx},${cy}`; };
    const setD = (el, d) => { el.style.d = `path("${d}")`; el.setAttribute('d', d); };

    function render(anchorId) {
      if (!G) return;
      const list = layout();
      const byId = new Map(list.map(i => [i.id, i]));
      let anchorBefore = null;
      if (anchorId && pos.has(anchorId)) anchorBefore = pos.get(anchorId);
      // 節點（新出現的依序彈出）
      let enter = 0;
      const delays = new Map();
      for (const inst of list) {
        let g = nodeEls.get(inst.id);
        if (!g) {
          g = buildNode(inst);
          const from = pos.get(inst.parentId) || byId.get(inst.parentId) || inst;
          const pw = inst.parentId && byId.get(inst.parentId) ? W[byId.get(inst.parentId).depth] : 0;
          g.style.transform = `translate(${from.x + pw - 20}px,${from.y}px) scale(.55)`;
          g.style.opacity = 0;
          const d = Math.min(enter++, 28) * 16;
          delays.set(inst.id, d);
          g.style.transitionDelay = `${d}ms`;
          setTimeout(() => { g.style.transitionDelay = ''; }, d + 700);
          gN.appendChild(g); nodeEls.set(inst.id, g);
          g.getBoundingClientRect();
        }
        updateNode(g, inst);
        g.style.transform = `translate(${inst.x}px,${inst.y}px) scale(1)`;
        g.style.opacity = 1;
      }
      for (const [id, g] of nodeEls) {
        if (byId.has(id)) continue;
        nodeEls.delete(id);
        let p = id; let to = null;
        while (p.includes('>') && !to) { p = p.slice(0, p.lastIndexOf('>')); to = byId.get(p); }
        if (to) g.style.transform = `translate(${to.x + W[to.depth] - 20}px,${to.y}px) scale(.55)`;
        g.style.opacity = 0;
        setTimeout(() => g.remove(), 520);
      }
      // 連線
      for (const inst of list) {
        if (!inst.parentId) continue;
        const p = byId.get(inst.parentId); if (!p) continue;
        let el = linkEls.get(inst.id);
        const n = inst.ghost || N.get(inst.key);
        const soft = n.level === 3 && !inst.ghost && n.parent_basis && n.parent_basis !== '列於相關文件';
        if (!el) {
          el = svgEl('path', { class: 'mm-link' });
          const pp = pos.get(p.id) || p;
          setD(el, linkD(pp.x + W[p.depth], pp.y, pp.x + W[p.depth], pp.y));
          el.style.opacity = 0;
          if (delays.has(inst.id)) { el.style.transitionDelay = `${delays.get(inst.id)}ms`; setTimeout(() => { el.style.transitionDelay = ''; }, delays.get(inst.id) + 700); }
          gL.appendChild(el); linkEls.set(inst.id, el);
          el.getBoundingClientRect();
        }
        el.setAttribute('class', `mm-link${soft ? ' soft' : ''}${focusSet && !focusSet.has(inst.key) ? ' f-dim' : ''}`);
        el.style.stroke = inst.ghost ? 'var(--bad)' : `var(--l${n.level})`;
        setD(el, linkD(p.x + W[p.depth] + 11, p.y, inst.x, inst.y));
        el.style.opacity = 1;
      }
      for (const [id, el] of linkEls) {
        if (byId.has(id) && byId.get(id).parentId) continue;
        linkEls.delete(id); el.style.opacity = 0; setTimeout(() => el.remove(), 520);
      }
      // 欄標題
      const minY = Math.min(...list.map(i => i.y)) - 56;
      const maxDepth = Math.max(...list.map(i => i.depth));
      if (!colTitles) { colTitles = svgEl('g'); vp.insertBefore(colTitles, gL); }
      const titles = ['一階　品質手冊', '二階　程序書', '三階文件／紀錄表單', '三階文件的紀錄表單'];
      colTitles.innerHTML = titles.slice(0, maxDepth + 1).map((t, i) => `<g class="mm-col lv${Math.min(i + 1, 4)}" transform="translate(${COLX[i]} ${minY})"><rect x="0" y="-17" rx="12" height="26" width="${t.length * 13.5 + 26}"/><text x="13" y="0.5">${t}</text></g>`).join('');
      pos.clear(); for (const i of list) pos.set(i.id, { x: i.x, y: i.y, depth: i.depth });
      markPath();
      if (anchorBefore && pos.has(anchorId)) {
        const a = pos.get(anchorId);
        view.tx += (anchorBefore.x - a.x) * view.k; view.ty += (anchorBefore.y - a.y) * view.k; applyView();
      }
    }
    // 滑過或選取時，把通往最上層的整條路徑點亮
    function markPath() {
      const hot = new Set(), onPath = new Set();
      const add = id => { let cur = id; while (cur) { onPath.add(cur); if (cur.includes('>')) hot.add(cur); cur = cur.includes('>') ? cur.slice(0, cur.lastIndexOf('>')) : null; } };
      if (hoverId) add(hoverId);
      if (sel) for (const id of nodeEls.keys()) if (id === sel || id.endsWith('>' + sel)) add(id);
      for (const [id, el] of linkEls) el.classList.toggle('hot', hot.has(id));
      for (const [id, g] of nodeEls) g.classList.toggle('on-path', onPath.has(id) && !g.classList.contains('selected'));
      svg.classList.toggle('has-path', onPath.size > 0);
    }
    function tipHtml(key, ghost) {
      const n = ghost || N.get(key); if (!n) return '';
      const rows = [];
      if (ghost) rows.push('<span style="color:var(--bad)">此項目已從資料中刪除</span>');
      else if (n.level <= 2) {
        rows.push([n.dept, n.version && `第 ${n.version} 版`, n.effective && `${n.effective} 施行`].filter(Boolean).join(' · '));
        if (n.level === 2) rows.push(`三階 ${kidsOf(key, 3).length} · 紀錄 ${kidsOf(key, 4).length}`);
      } else if (n.level === 3) {
        rows.push([n.kind, n.parent_basis && `依據：${n.parent_basis}`].filter(Boolean).join(' · '));
        rows.push(n.group ? `${kidsOf(key, 3).length} 份文件` : `被 ${(n.cited_by || []).length} 份文件引用${kidsOf(key, 4).length ? ` · 表單 ${kidsOf(key, 4).length}` : ''}`);
        if (n.register?.review_due) rows.push(`屆期 ${esc(n.register.review_due)}${n.register.overdue ? ' <span class="od-badge">已逾期</span>' : ''}`);
      } else {
        rows.push([n.retention?.retention && `保存 ${n.retention.retention}`, n.electronic && '電子表單', n.effective_ym && `${n.effective_ym} 施行`].filter(Boolean).join(' · ') || '紀錄表單');
        if (n.appendix_label) rows.push(`${n.in_appendix_of} ${n.appendix_label}`);
      }
      if (n.purpose) rows.push(`<span class="muted">${esc(n.purpose.slice(0, 58))}${n.purpose.length > 58 ? '…' : ''}</span>`);
      return `<div class="tt-h lv${n.level}"><span class="tag lv${n.level}">${LV[n.level].short}</span><b class="code">${esc(n.code)}</b></div><div class="tt-n">${esc(n.name || '')}</div>${rows.filter(Boolean).map(r => `<div class="tt-r">${r}</div>`).join('')}<div class="tt-hint">點一下：${(KIDS.get(key) || []).length ? '展開／收合並' : ''}看完整說明</div>`;
    }
    function applyView(animate = true) {
      svg.classList.toggle('nozoomanim', !animate);
      vp.style.transformOrigin = '0 0';
      vp.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.k})`;
    }
    function fit(tries = 0) {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) {
        if (tries < 20 && $('#view-mindmap').classList.contains('active')) setTimeout(() => fit(tries + 1), 120);
        else needFit = true;
        return;
      }
      const xs = [...pos.values()]; if (!xs.length) return;
      needFit = false;
      const minX = Math.min(...xs.map(p => p.x)), maxX = Math.max(...xs.map(p => p.x + W[p.depth] + 20));
      const minY = Math.min(...xs.map(p => p.y)) - 70, maxY = Math.max(...xs.map(p => p.y)) + 40;
      // 字要看得清楚：最小 0.55 倍；內容比畫面高時靠上對齊，往下拖曳即可
      const k = Math.max(0.55, Math.min(1.1, (r.width - 80) / (maxX - minX), (r.height - 120) / (maxY - minY)));
      view.k = k;
      view.tx = Math.max(24, (r.width - (maxX - minX) * k) / 2) - minX * k;
      const h = (maxY - minY) * k;
      view.ty = (h < r.height - 60 ? (r.height - h) / 2 : 60) - minY * k;
      applyView();
    }
    function center(id, k = Math.max(view.k, 0.9)) {
      const p = pos.get(id); const r = svg.getBoundingClientRect(); if (!p || !r.width) return;
      view.k = k; view.tx = r.width * 0.4 - (p.x + W[p.depth] / 2) * k; view.ty = r.height / 2 - p.y * k; applyView();
    }
    function burst(id) {
      const p = pos.get(id); if (!p) return;
      const c = svgEl('rect', { class: 'mm-burst', x: p.x - 4, y: p.y - H / 2 - 4, width: W[p.depth] + 8, height: H + 8, rx: 11 });
      c.style.transformOrigin = `${p.x + W[p.depth] / 2}px ${p.y}px`;
      gN.appendChild(c); setTimeout(() => c.remove(), 650);
    }
    function toggle(id) {
      if (expanded.has(id)) { for (const e of [...expanded]) if (e === id || e.startsWith(id + '>')) expanded.delete(e); }
      else expanded.add(id);
      render(id);
    }
    function pathIds(key) {
      // 依主要上層串出實例 id 路徑
      const chain = chainOf(key);
      if (chain[0] !== ROOT) chain.unshift(ROOT);
      const ids = []; let id = null;
      for (const k of chain) { id = id ? `${id}>${k}` : k; ids.push(id); }
      return ids;
    }
    function focus(key) {
      if (N.get(key)?.level === 4) opt.forms = $('#mmForms').checked = true;
      const ids = pathIds(key);
      ids.slice(0, -1).forEach(i => expanded.add(i));
      sel = key;
      render();
      const id = ids[ids.length - 1];
      setTimeout(() => { center(id, 1); setTimeout(() => burst(id), 300); }, 80);
    }
    // 由組織架構跳過來：展開並點亮某單位負責的文件
    function showUnit(u) {
      const keys = new Set([...u.docs, ...u.wis]);
      for (const k of [...keys]) for (const f of kidsOf(k, 4)) keys.add(f);
      focusSet = keys; focusUnit = u;
      opt.forms = $('#mmForms').checked = true;
      expanded = new Set([rootId()]);
      for (const k of keys) if (N.get(k)?.level <= 3) pathIds(k).forEach(i => expanded.add(i));
      for (const k of keys) if (N.get(k)?.level === 4) pathIds(k).slice(0, -1).forEach(i => expanded.add(i));
      sel = null;
      render();
      const nf = [...keys].filter(k => N.get(k)?.level === 4).length;
      $('#mmFocus').innerHTML = `<span class="mf-dot"></span>聚焦：<b>${esc(u.name)}</b>　程序書 ${u.docs.length}・三階 ${u.wis.length}・紀錄 ${nf}<button class="mf-x" title="取消聚焦">✕</button><button class="mf-org" title="回組織架構">組織圖 ↗</button>`;
      $('#mmFocus').classList.add('on');
      $('#mmFocus .mf-x').onclick = clearUnit;
      $('#mmFocus .mf-org').onclick = () => { switchView('org'); setTimeout(() => ORG.pick(u.id), 150); };
      setTimeout(() => fitTo(id => focusSet && focusSet.has(id.split('>').pop())), 120);
    }
    function clearUnit() {
      focusSet = null; focusUnit = null;
      $('#mmFocus').classList.remove('on');
      render();
    }
    function fitTo(pred) {
      const r = svg.getBoundingClientRect(); if (!r.width) return;
      const xs = [...pos.entries()].filter(([id]) => pred(id)).map(([, p]) => p);
      if (!xs.length) return fit();
      const minX = Math.min(...xs.map(p => p.x)) - 40, maxX = Math.max(...xs.map(p => p.x + W[p.depth])) + 40;
      const minY = Math.min(...xs.map(p => p.y)) - 60, maxY = Math.max(...xs.map(p => p.y)) + 50;
      const k = Math.max(0.45, Math.min(1.05, r.width / (maxX - minX), (r.height - 60) / (maxY - minY)));
      view.k = k;
      view.tx = (r.width - (maxX - minX) * k) / 2 - minX * k;
      view.ty = Math.max(60, (r.height - (maxY - minY) * k) / 2) - minY * k;
      applyView();
    }
    function revealRecent() {
      for (const k of [...recent.added, ...recent.changed]) pathIds(k).slice(0, -1).forEach(i => expanded.add(i));
      for (const r of recent.removed) { const p = (r.parents || [])[0]; if (p && N.has(p)) pathIds(p).forEach(i => expanded.add(i)); }
      render();
      clearTimeout(ghostTimer);
      if (recent.removed.length) ghostTimer = setTimeout(() => { recent.removed = []; render(); }, 20000);
    }
    function setup() {
      const defs = svgEl('defs');
      defs.innerHTML = `<pattern id="mmDots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" class="mm-dot"/></pattern>
        <filter id="mmShadow" x="-10%" y="-50%" width="120%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#0b1530" flood-opacity=".16"/></filter>`
        + [1, 2, 3, 4].map(l => `<linearGradient id="mmG${l}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--l${l}-bg)"/><stop offset=".85" style="stop-color:var(--panel)"/></linearGradient>`).join('');
      svg.prepend(defs);
      vp.prepend(svgEl('rect', { class: 'mm-bg', x: -60000, y: -60000, width: 120000, height: 120000, fill: 'url(#mmDots)' }));
      const tip = $('#mmTip'), shell = $('#mmShell');
      const placeTip = e => { const r = shell.getBoundingClientRect(); let x = e.clientX - r.left + 16, y = e.clientY - r.top + 18; if (x + 290 > r.width) x -= 310; if (y + 150 > r.height) y -= 170; tip.style.transform = `translate(${x}px,${y}px)`; };
      svg.addEventListener('pointerover', e => {
        const g = e.target.closest('.mm-node');
        if (!g || svg.classList.contains('dragging')) return;
        if (hoverId !== g.dataset.id) { hoverId = g.dataset.id; markPath(); }
        const ghost = g.dataset.id.endsWith('~ghost') ? recent.removed.find(r => r.key === g.dataset.key) : null;
        tip.innerHTML = tipHtml(g.dataset.key, ghost); tip.classList.add('on'); placeTip(e);
      });
      svg.addEventListener('pointerout', e => {
        const g = e.target.closest('.mm-node');
        if (g && !g.contains(e.relatedTarget)) { hoverId = null; markPath(); tip.classList.remove('on'); }
      });
      svg.addEventListener('pointermove', e => { if (tip.classList.contains('on')) placeTip(e); });
      // 拖曳／點擊
      let drag = null;
      svg.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, target: e.target.closest('.mm-node') };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; svg.classList.add('dragging'); $('#mmTip').classList.remove('on'); }
        if (drag.moved) { view.tx = drag.tx + dx; view.ty = drag.ty + dy; applyView(false); }
      });
      svg.addEventListener('pointerup', () => {
        if (drag && !drag.moved && drag.target) {
          const g = drag.target, id = g.dataset.id, key = g.dataset.key;
          g.classList.add('press'); setTimeout(() => g.classList.remove('press'), 300);
          burst(id);
          if (!id.endsWith('~ghost')) {
            if (N.get(key) && (KIDS.get(key) || []).length) toggle(id);
            openDetail(key);
          }
        }
        drag = null; svg.classList.remove('dragging');
      });
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const r = svg.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
        const k2 = Math.max(0.15, Math.min(2.5, view.k * Math.exp(-e.deltaY * 0.0015)));
        view.tx = cx - (cx - view.tx) * k2 / view.k; view.ty = cy - (cy - view.ty) * k2 / view.k; view.k = k2;
        applyView(false);
      }, { passive: false });
      $$('[data-mm]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.mm;
        if (a === 'fit') return fit();
        if (a === 'zin' || a === 'zout') { const r = svg.getBoundingClientRect(); const k2 = view.k * (a === 'zin' ? 1.25 : 0.8); view.tx = r.width / 2 - (r.width / 2 - view.tx) * k2 / view.k; view.ty = r.height / 2 - (r.height / 2 - view.ty) * k2 / view.k; view.k = k2; return applyView(); }
        if (focusSet) { focusSet = null; focusUnit = null; $('#mmFocus').classList.remove('on'); }
        expanded = new Set(a === 'collapse' ? [] : [rootId()]);
        if (a === 'l3' || a === 'all') for (const k of KIDS.get(ROOT) || []) expanded.add(`${ROOT}>${k}`);
        if (a === 'all') { const walk = inst => { for (const c of childInst(inst)) { if ((KIDS.get(c.key) || []).length) { expanded.add(c.id); walk(c); } } }; walk({ id: ROOT, key: ROOT }); }
        render(); setTimeout(fit, 80);
      }));
      $('#mmForms').onchange = e => { opt.forms = e.target.checked; render(); };
      $('#mmShared').onchange = e => { opt.shared = e.target.checked; render(); };
      $('#mmLegend').innerHTML = `<button class="lg-t" title="收合／展開圖例">圖例 <span>▾</span></button>` + [1, 2, 3, 4].map(l => `<div class="row lv${l}"><span class="sw"></span>${LV[l].short}　${LV[l].kind}</div>`).join('')
        + `<div class="row"><svg width="22" height="8"><path d="M0 4H22" stroke="var(--ink-3)" stroke-width="2"/></svg>確定從屬（編號／相關文件）</div>`
        + `<div class="row"><svg width="22" height="8"><path d="M0 4H22" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="5 4"/></svg>由本文引用推定</div>`
        + `<div class="row"><span class="sw" style="--c:var(--ok);--cb:transparent"></span>新增　<span class="sw" style="--c:var(--warn);--cb:transparent"></span>變更　<span class="sw" style="--c:var(--bad);--cb:transparent;border-style:dashed"></span>刪除</div>`;
    }
    document.addEventListener('click', e => { if (e.target.closest('#mmLegend .lg-t')) $('#mmLegend').classList.toggle('min'); });
    return {
      setup, render, fit, focus, revealRecent, showUnit, clearUnit,
      shown() { if (!started) { expanded = new Set([rootId()]); started = true; } render(); if (needFit) setTimeout(fit, 30); },
      reset() { for (const g of nodeEls.values()) g.remove(); for (const l of linkEls.values()) l.remove(); nodeEls.clear(); linkEls.clear(); },
      select(k) { sel = k; if ($('#view-mindmap').classList.contains('active')) render(); else markPath(); },
    };
  })();

  // ------------------------------------------------------------ ③ 組織架構
  const ORG = (() => {
    // 版面依 CP─28 圖1：中軸董事長→總經理；左側管理代表；右側總經理室及其下六單位；底部六個處
    const VW = 1200;
    const SZ = { top: [168, 58], staff: [196, 64], office: [176, 64], 'office-sub': [222, 76], dept: [186, 92] };
    const TIER_C = { top: 'l1', staff: 'l3', office: 'l2', 'office-sub': 'l2', dept: 'l4' };
    let units = [], byId = {}, sel = null, heat = false, played = false;
    const P = {};

    function layout() {
      const subs = units.filter(u => u.tier === 'office-sub');
      const depts = units.filter(u => u.tier === 'dept');
      const SUBX = 1078, SUBY0 = 170, SUBDY = 88;
      const subLast = SUBY0 + (subs.length - 1) * SUBDY;
      const BUSY = Math.max(subLast + 70, 640), DEPTY = BUSY + 92;
      for (const u of units) {
        if (u.id === 'chairman') P[u.id] = [600, 52];
        else if (u.id === 'gm') P[u.id] = [600, 150];
        else if (u.tier === 'staff') P[u.id] = [330, 278];
        else if (u.tier === 'office') P[u.id] = [800, 278];
      }
      subs.forEach((u, i) => { P[u.id] = [SUBX, SUBY0 + i * SUBDY]; });
      const x0 = 110, x1 = 1090;
      depts.forEach((u, i) => { P[u.id] = [depts.length > 1 ? x0 + i * (x1 - x0) / (depts.length - 1) : 600, DEPTY]; });
      return { subs, depts, SUBX, SUBY0, subLast, BUSY, DEPTY, VH: DEPTY + 70 };
    }
    // 連線：每條都記錄屬於哪些單位的路徑，用來高亮
    function connectors(L) {
      const c = [];
      const h = id => SZ[byId[id].tier][1] / 2, w = id => SZ[byId[id].tier][0] / 2;
      const line = (id, pts, owners) => c.push({ id, pts, owners });
      const gm = P.gm, ch = P.chairman, gmo = units.find(u => u.tier === 'office'), mr = units.find(u => u.tier === 'staff');
      if (ch && gm) line('top', [[600, ch[1] + h('chairman')], [600, gm[1] - h('gm')]], ['gm']);
      line('spineA', [[600, gm[1] + h('gm')], [600, 278]], ['mr', 'gmo', ...L.subs.map(u => u.id), ...L.depts.map(u => u.id)]);
      if (mr) line('mr', [[600, 278], [P[mr.id][0] + w(mr.id), 278]], [mr.id]);
      if (gmo) {
        line('gmo', [[600, 278], [P[gmo.id][0] - w(gmo.id), 278]], [gmo.id, ...L.subs.map(u => u.id)]);
        const bx = 928;
        line('bracketA', [[P[gmo.id][0] + w(gmo.id), 278], [bx, 278]], L.subs.map(u => u.id));
        L.subs.forEach(u => {
          const y = P[u.id][1];
          line(`v-${u.id}`, [[bx, 278], [bx, y]], [u.id]);
          line(`s-${u.id}`, [[bx, y], [P[u.id][0] - w(u.id), y]], [u.id]);
        });
      }
      line('spineB', [[600, 278], [600, L.BUSY]], L.depts.map(u => u.id));
      L.depts.forEach(u => {
        const x = P[u.id][0];
        line(`b-${u.id}`, [[600, L.BUSY], [x, L.BUSY]], [u.id]);
        line(`d-${u.id}`, [[x, L.BUSY], [x, P[u.id][1] - h(u.id)]], [u.id]);
      });
      return c;
    }
    const plen = pts => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

    function score(u) { return u.docs.length * 3 + u.wis.length + u.forms / 4; }
    function card(u, order) {
      const [cx, cy] = P[u.id], [w, h] = SZ[u.tier];
      const x = cx - w / 2, y = cy - h / 2;
      const c = TIER_C[u.tier];
      const max = Math.max(...units.map(score)) || 1;
      const heatA = heat ? Math.round(12 + 70 * score(u) / max) : 0;
      const badges = [];
      if (u.docs.length) badges.push(`程序書 ${u.docs.length}`);
      if (u.wis.length) badges.push(`三階 ${u.wis.length}`);
      if (u.forms) badges.push(`紀錄 ${u.forms}`);
      const subs = (u.subunits || []).length;
      const nameY = u.role || badges.length || subs ? y + 24 : cy + 1;
      return `<g class="org-card ${sel === u.id ? 'sel' : ''}" data-id="${u.id}" style="--c:var(--${c});--cb:var(--${c}-bg);--d:${order * 70}ms" tabindex="0" role="button" aria-label="${esc(u.name)}">
        <g class="org-in">
          <rect class="oc-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="14" ${heat ? `style="fill:color-mix(in srgb, var(--c) ${heatA}%, var(--panel))"` : ''}/>
          <rect class="oc-top" x="${x}" y="${y}" width="${w}" height="5" rx="2.5"/>
          <g class="oc-rip" clip-path="url(#ocClip-${u.id})"></g>
          <text class="oc-name" x="${cx}" y="${nameY}">${esc(u.name)}</text>
          ${u.role ? `<text class="oc-role" x="${cx}" y="${y + 42}">（${esc(u.role)}）</text>` : ''}
          ${badges.length ? `<text class="oc-badge" x="${cx}" y="${y + h - (u.role ? 12 : 16)}">${badges.join(' · ')}</text>` : ''}
          ${subs ? `<g class="oc-sub" transform="translate(${x + w - 14} ${y + 14})"><circle r="11"/><text>${subs}</text><title>下轄 ${subs} 個單位</title></g>` : ''}
          ${u.docs.length || u.wis.length ? `<g class="oc-go" transform="translate(${x + 16} ${y + 17})" role="button" aria-label="在心智圖看 ${esc(u.name)} 的文件"><circle r="11"/><path d="M-4 4 4 -4 M-1 -4 H4 V1"/><title>在心智圖看此單位的文件</title></g>` : ''}
          <path class="oc-corner" d="M${x - 5},${y + 9} V${y - 5} H${x + 9} M${x + w - 9},${y - 5} H${x + w + 5} V${y + 9} M${x + w + 5},${y + h - 9} V${y + h + 5} H${x + w - 9} M${x + 9},${y + h + 5} H${x - 5} V${y + h - 9}"/>
        </g>
      </g>`;
    }
    function render() {
      const org = G.organization;
      const svg = $('#orgChart');
      if (!org) { svg.innerHTML = ''; $('#orgNote').innerHTML = '<div class="empty">尚未建立組織架構（rules/organization.json）</div>'; return; }
      units = org.units; byId = Object.fromEntries(units.map(u => [u.id, u]));
      const L = layout();
      const cons = connectors(L);
      svg.setAttribute('viewBox', `0 0 ${VW} ${L.VH}`);
      const clips = units.map(u => { const [cx, cy] = P[u.id], [w, h] = SZ[u.tier]; return `<clipPath id="ocClip-${u.id}"><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="14"/></clipPath>`; }).join('');
      const order = ['chairman', 'gm', 'mr', 'gmo', ...L.subs.map(u => u.id), ...L.depts.map(u => u.id)];
      svg.innerHTML = `<defs>${clips}<filter id="ocShadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0b1530" flood-opacity=".14"/></filter></defs>
        <g class="org-lines">${cons.map((c, i) => `<path class="oc-line" data-id="${c.id}" data-owners="${c.owners.join(' ')}" d="M${c.pts.map(p => p.join(',')).join(' L')}" style="--len:${plen(c.pts).toFixed(1)};--d:${120 + i * 28}ms"/>`).join('')}</g>
        <g class="org-pulses">${cons.map((c, i) => `<path class="oc-pulse" data-owners="${c.owners.join(' ')}" d="M${c.pts.map(p => p.join(',')).join(' L')}" style="--len:${plen(c.pts).toFixed(1)};--pd:${((i * 0.37) % 2.6).toFixed(2)}s;--pt:${(1.2 + plen(c.pts) / 380).toFixed(2)}s"/>`).join('')}</g>
        <g class="org-cards">${units.map(u => card(u, Math.max(0, order.indexOf(u.id)))).join('')}</g>`;
      bind();
      const src = org.source || {};
      const unm = Object.entries(org.unmapped_codes || {});
      $('#orgNote').innerHTML = `
        ${units.filter(u => u.note).map(u => `<div>📌 ${esc(u.note)}</div>`).join('')}
        ${unm.length ? `<div class="org-warn">⚠ 部門代號 ${unm.map(([k, v]) => `「${esc(k)}」（${v.length} 份三階文件）`).join('、')} 無法對應到組織圖中的單位，詳見「一致性檢查」的「部門代號未定義」。</div>` : ''}
        ${src.warning ? `<div class="org-warn">⚠ ${esc(src.warning)}</div>` : ''}
        <div class="muted">來源：${esc(display(src.doc))} 第 ${esc(src.version)} 版 ${esc(src.clause)}「${esc(src.figure)}」${src.file ? `（<a href="../${encodeURI(src.file)}#page=${src.page}" target="_blank" rel="noopener">PDF 第 ${src.page} 頁 ↗</a>）` : ''}；圖面為${esc(src.transcribed_by)}，職責自 CP─28 6.2.2 條文自動擷取。</div>`;
      if (played) svg.classList.add('play');
    }
    const display = k => (k || '').replace(/-/g, '─');
    function highlight(id) {
      const svg = $('#orgChart');
      svg.classList.toggle('focus', !!id);
      $$('.oc-line, .oc-pulse', svg).forEach(l => l.classList.toggle('hot', !!id && l.dataset.owners.split(' ').includes(id)));
      const chain = new Set(); let cur = id;
      while (cur && byId[cur]) { chain.add(cur); cur = byId[cur].parent; }
      $$('.org-card', svg).forEach(g => g.classList.toggle('lit', chain.has(g.dataset.id)));
    }
    function ripple(g, e) {
      const svg = $('#orgChart'); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const c = svgEl('circle', { class: 'oc-ripple', cx: p.x, cy: p.y, r: 4 });
      $('.oc-rip', g).appendChild(c);
      c.animate([{ r: 4, opacity: .5 }, { r: 240, opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => c.remove();
    }
    function bind() {
      const svg = $('#orgChart');
      $$('.org-card', svg).forEach(g => {
        const id = g.dataset.id;
        g.addEventListener('pointerenter', () => highlight(id));
        g.addEventListener('pointerleave', () => highlight(sel));
        g.addEventListener('click', e => {
          if (e.target.closest('.oc-go')) { e.stopPropagation(); goMap(id); return; }
          ripple(g, e); select(id);
        });
        g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); } });
      });
    }
    function select(id) {
      sel = id;
      $$('#orgChart .org-card').forEach(g => g.classList.toggle('sel', g.dataset.id === id));
      highlight(id);
      openOrg(id);
    }
    function goMap(id) {
      const u = byId[id]; if (!u) return;
      closeDetail();
      switchView('mindmap');
      setTimeout(() => MM.showUnit(u), 80);
    }
    function play() {
      const svg = $('#orgChart');
      const wrap = svg.closest('.org-wrap');
      wrap.classList.remove('scan'); void wrap.offsetWidth; wrap.classList.add('scan');
      svg.classList.remove('play'); void svg.getBoundingClientRect();
      setTimeout(() => svg.classList.add('play'), 30); // 不依賴 requestAnimationFrame（背景分頁會暫停）
      played = true;
    }
    function shown() {
      render();
      if (!played) setTimeout(play, 60);
    }
    function setup() {
      $('#orgReplay').onclick = play;
      $('#orgHeat').onchange = e => { heat = e.target.checked; render(); $('#orgChart').classList.add('play'); };
    }
    function clearSel() { sel = null; highlight(null); $$('#orgChart .org-card').forEach(g => g.classList.remove('sel')); }
    function pick(id) { if (!byId[id]) render(); if (!played) play(); select(id); $(`#orgChart .org-card[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return { render, shown, setup, clearSel, pick, goMap };
  })();

  function openOrg(id) {
    const org = G.organization; if (!org) return;
    const byId = Object.fromEntries(org.units.map(u => [u.id, u]));
    const u = byId[id]; if (!u) return;
    selKey = null;
    const d = $('#drawer');
    const tierC = { top: 'lv1', staff: 'lv3', office: 'lv2', 'office-sub': 'lv2', dept: 'lv4' }[u.tier] || 'lv2';
    d.className = `drawer open ${tierC}`;
    d.setAttribute('aria-hidden', 'false');
    const chain = []; let cur = u;
    while (cur) { chain.unshift(cur); cur = byId[cur.parent]; }
    const src = org.source || {};
    const cp = N.get(`${G.dataset}#${src.doc || 'CP-28'}`);
    const pdf = page => cp?.file && page ? ` <a class="ev-pg" href="../${encodeURI(cp.file)}#page=${page}" target="_blank" rel="noopener">PDF 第 ${page} 頁 ↗</a>` : '';
    $('#drawerHead').innerHTML = `<div class="row1"><span class="tag ${tierC}">組織單位</span>${u.role ? `<span class="muted" style="font-size:13px">${esc(u.role)}</span>` : ''}<button class="close" id="drawerClose" aria-label="關閉">×</button></div>
      <h2>${esc(u.full || u.name)}</h2>
      <div class="crumbs">${chain.map((c, i) => `${i ? '›' : ''}<button class="tag ${tierC}" data-org="${c.id}">${esc(c.name)}</button>`).join('')}</div>`;
    $('#drawerClose').onclick = () => { closeDetail(); ORG.clearSel(); };
    $$('#drawerHead [data-org]').forEach(b => b.onclick = () => openOrg(b.dataset.org));
    headStats([['程序書', `${u.docs.length} 份`], ['三階', `${u.wis.length} 份`], ['紀錄', `${u.forms} 種`], ['職責', u.duties?.length ? `${u.duties.length} 項` : null], ['下轄', (u.subunits || []).length || org.units.filter(x => x.parent === id).length ? `${(u.subunits || []).length || org.units.filter(x => x.parent === id).length} 個` : null]]);
    const parts = [];
    const kids = org.units.filter(x => x.parent === id);
    parts.push(`<div class="plain">${u.docs.length || u.wis.length
      ? `此單位負責制定 <b>${u.docs.length}</b> 份程序書${u.forms ? `（含 ${u.forms} 種紀錄表單）` : ''}，編號代號「${esc(u.dept_code || '')}」的三階文件有 <b>${u.wis.length}</b> 份。`
      : kids.length ? `此單位下轄 ${kids.length} 個單位。` : '此單位依職責執行品質管理系統相關作業。'}</div>`);
    if (u.duties?.length) parts.push(`<h4>📋 職責（CP─28 ${esc(u.duty_clause)}）${pdf(u.duty_page)}</h4><ol class="duties">${u.duties.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`);
    else if (u.duty_intro) parts.push(`<h4>📋 職責（CP─28 ${esc(u.duty_clause)}）${pdf(u.duty_page)}</h4><div>${esc(u.duty_intro)}</div>`);
    if (kids.length) parts.push(`<h4>⬇ 下轄單位（${kids.length}）</h4><div class="rel-list">${kids.map(k => `<div class="rel ripple-host" data-org="${k.id}"><span class="tag ${tierC}">單位</span><span>${esc(k.name)}</span><span class="meta">${esc(k.role || '')}</span></div>`).join('')}</div>`);
    if (u.subunits?.length) parts.push(`<h4>⬇ 下轄（${u.subunits.length}）</h4>${u.subunits.map(su => `<details class="subu"><summary><b>${esc(su.name)}</b>${su.role ? `　<span class="muted">${esc(su.role)}</span>` : ''}${su.duties?.length ? `　<span class="muted">職責 ${su.duties.length} 項</span>` : ''}</summary>${su.duties?.length ? `<div class="why">CP─28 ${esc(su.duty_clause)}${pdf(su.duty_page)}</div><ol class="duties">${su.duties.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '<div class="why">組織圖註記，程序書未另列職責</div>'}</details>`).join('')}`);
    if (u.note) parts.push(`<div class="why" style="margin-top:8px">📌 ${esc(u.note)}</div>`);
    if (u.docs.length) parts.push(`<h4>📘 負責制定的程序書（${u.docs.length}）</h4><div class="rel-list">${u.docs.map(k => relRow(k, `${kidsOf(k, 4).length} 種紀錄`)).join('')}</div>`);
    if (u.wis.length) {
      const show = u.wis.slice(0, 12);
      parts.push(`<h4>📗 三階文件（部門代號 ${esc(u.dept_code)}，${u.wis.length} 份）</h4><div class="rel-list" id="orgWis">${show.map(k => relRow(k)).join('')}</div>${u.wis.length > 12 ? `<button class="btn small ripple-host" id="orgWisMore" style="margin-top:6px">顯示全部 ${u.wis.length} 份</button>` : ''}`);
    }
    if (u.docs.length || u.wis.length) parts.push(`<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary ripple-host" id="orgToMap">🧭 在心智圖看此單位的文件（${u.docs.length + u.wis.length}）</button><button class="btn ripple-host" id="orgToList">📋 在全部文件列出</button></div>`);
    parts.push(`<div class="why" style="margin-top:16px">組織圖來源：CP─28 ${esc(src.clause)} ${esc(src.figure)}${pdf(src.page)}（${esc(src.transcribed_by)}）</div>`);
    $('#drawerBody').innerHTML = parts.join('');
    $('#drawerBody').scrollTop = 0; $('#drawer').classList.remove('scrolled');
    $$('#drawerBody [data-org]').forEach(r => r.onclick = () => openOrg(r.dataset.org));
    $$('#drawerBody .rel[data-key]').forEach(r => r.onclick = () => openDetail(r.dataset.key));
    enhanceDrawer();
    if ($('#orgToMap')) $('#orgToMap').onclick = () => ORG.goMap(id);
    if ($('#orgToList')) $('#orgToList').onclick = () => {
      closeDetail();
      allFilter.levels = new Set([1, 2, 3, 4]); allFilter.cat = null;
      allFilter.dept = (u.doc_dept || [])[0] || u.name;
      switchView('all');
    };
    const more = $('#orgWisMore');
    if (more) more.onclick = () => { $('#orgWis').innerHTML = u.wis.map(k => relRow(k)).join(''); $$('#orgWis .rel').forEach(r => r.onclick = () => openDetail(r.dataset.key)); more.remove(); };
  }

  // ------------------------------------------------------------ 分頁
  function switchView(v) {
    if (PUBLISH && v === 'issues') v = 'guide';
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    // 窄螢幕分頁列可橫向捲動：把目前分頁捲到可見的中間位置
    { const nav = $('#tabs'), on = $('#tabs button.active'); if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' }); }
    $$('section.view').forEach(s => s.classList.toggle('active', s.id === `view-${v}`));
    $('#main').classList.toggle('full', v === 'mindmap');
    document.body.classList.toggle('guide-mode', v === 'guide');
    $('#prov').style.display = v === 'mindmap' ? 'none' : '';
    if (v === 'mindmap') MM.shown();
    if (v === 'org') ORG.shown();
    if (v === 'all') renderAll();
    window.dispatchEvent(new Event('resize'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    observeReveals($(`#view-${v}`));
    try { localStorage.setItem('qms.view', v); } catch (e) { /* 無痕模式 */ }
  }

  // ------------------------------------------------------------ 動畫：捲動浮現、數字跳動、點擊漣漪
  let io = null;
  function observeReveals(root = document) {
    if (!('IntersectionObserver' in window)) { $$('.reveal', root).forEach(e => e.classList.add('shown')); return; }
    io = io || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.shown)', root).forEach(e => io.observe(e));
  }
  function onceVisible(el, fn) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return fn();
    const o = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { o.disconnect(); fn(); } }, { threshold: 0.3 });
    o.observe(el);
  }
  function countUp(el, to, dur = 1100) {
    const t0 = performance.now();
    const step = t => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setTimeout(() => { el.textContent = to; }, dur + 150); // 背景分頁暫停動畫時仍顯示正確數字
  }
  function setupMotion() {
    const bar = $('#scrollProgress'), top = $('#toTop');
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = h > 0 ? `${(scrollY / h) * 100}%` : '0';
      top.classList.toggle('show', scrollY > 500);
    };
    addEventListener('scroll', onScroll, { passive: true });
    top.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });
    const SEL = '.ripple-host, .btn, .chip, .cp-card, .walk-box, .rel, .issue, .issue-type, .pill, nav.tabs button, table.list tbody tr';
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest(SEL);
      if (!el || el.closest('svg')) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'static') el.style.position = 'relative';
      // 不直接改按鈕的 overflow：在彈性排版（例如手機分頁列）中 overflow:hidden 會讓按鈕被壓縮到只剩編號，改用內層裁切容器
      const r = el.getBoundingClientRect(); const size = Math.max(r.width, r.height);
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      if (el.tagName === 'TR') { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      else { const clip = document.createElement('span'); clip.className = 'ripple-clip'; clip.appendChild(s); el.appendChild(clip); setTimeout(() => clip.remove(), 650); }
      el.classList.remove('press'); void el.offsetWidth; el.classList.add('press');
    });
    const fixTop = () => {
      const sticky = getComputedStyle($('header.top')).position === 'sticky';
      const h = sticky ? $('header.top').offsetHeight : 0;
      const navSticky = getComputedStyle($('#tabs')).position === 'sticky';
      $('#tabs').style.top = navSticky ? `${h}px` : '';
      $('#mmShell').style.height = sticky ? `calc(100vh - ${h + $('#tabs').offsetHeight}px)` : '75vh';
      const navH = $('#tabs').getBoundingClientRect().height;
      $$('table.list th').forEach(th => th.style.top = navSticky ? `${h + navH}px` : '');
    };
    // 表頭固定時，量測與分頁列的實際間隙並校正（避免不同縮放比例下的累積誤差）
    const snapHeads = () => {
      const nav = $('#tabs'); if (getComputedStyle(nav).position !== 'sticky') return;
      const want = nav.getBoundingClientRect().bottom;
      for (const tb of $$('table.list')) {
        const th = $('th', tb); if (!th || !tb.offsetParent) continue;
        const r = th.getBoundingClientRect(), t = tb.getBoundingClientRect();
        if (t.top < want && t.bottom > want + r.height && Math.abs(r.top - want) > 0.5) {
          const cur = parseFloat(th.style.top) || 0;
          $$('th', tb).forEach(x => x.style.top = `${cur - (r.top - want)}px`);
        }
      }
    };
    addEventListener('scroll', () => requestAnimationFrame(snapHeads), { passive: true });
    addEventListener('resize', fixTop); setTimeout(fixTop, 0);
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(fixTop); ro.observe($('header.top')); ro.observe($('#tabs')); } // 頁首或分頁列高度變動時同步修正表頭位置
  }

  // ------------------------------------------------------------ 提示訊息
  function toast(html, ms = 6000) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html;
    $('#toasts').appendChild(t); setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(() => t.remove(), 450); }, ms);
    return t;
  }

  // ------------------------------------------------------------ 載入與即時同步
  function renderAllViews() {
    renderHeader(); renderGuide(); renderProcs(); renderIssues(); renderIso(); renderChanges();
    if ($('#view-all').classList.contains('active')) renderAll();
    if ($('#view-mindmap').classList.contains('active')) MM.render();
    if ($('#view-org').classList.contains('active')) ORG.render();
    observeReveals();
  }
  function diffNodes(oldMap, graph) {
    const nw = new Map(graph.nodes.map(n => [n.key, n]));
    const sig = n => JSON.stringify([n.name, n.version, n.effective, n.effective_ym, (n.parents || []).join(','), n.status, n.retention?.retention]);
    const added = [], changed = [], removed = [];
    for (const [k, n] of nw) { if (!oldMap.has(k)) added.push(k); else if (sig(oldMap.get(k)) !== sig(n)) changed.push(k); }
    for (const [k, n] of oldMap) if (!nw.has(k) && n.status !== 'virtual') removed.push({ key: k, code: n.code, name: n.name, level: n.level, parents: (n.parents || []).filter(p => nw.has(p)) });
    return { added, changed, removed };
  }
  function load(graph, isUpdate) {
    const oldMap = new Map(N);
    index(graph);
    if (isUpdate) {
      const d = diffNodes(oldMap, graph);
      d.added.forEach(k => recent.added.add(k));
      d.changed.forEach(k => recent.changed.add(k));
      recent.removed = d.removed;
      renderAllViews();
      MM.revealRecent();
      const total = d.added.length + d.removed.length + d.changed.length;
      if (total) {
        const names = [...d.added.slice(0, 3).map(k => `＋${N.get(k).code}`), ...d.removed.slice(0, 3).map(r => `－${r.code}`), ...d.changed.slice(0, 2).map(k => `✎${N.get(k).code}`)].join(' ');
        const t = toast(`🔄 文件已更新：<b>新增 ${d.added.length}</b>、刪除 ${d.removed.length}、變更 ${d.changed.length}　${esc(names)}　<button class="btn small" style="margin-left:8px">在心智圖查看</button>`, 10000);
        $('button', t).onclick = () => { switchView('mindmap'); MM.revealRecent(); setTimeout(MM.fit, 120); };
      } else toast('🔄 已重新解析，文件結構沒有變化', 3500);
      if (selKey && N.has(selKey)) openDetail(selKey); else if (selKey) closeDetail();
    } else {
      renderAllViews();
    }
  }

  let polling = false, webRev = null, webToastShown = false;
  function setLive(cls, text) { const el = $('#live'); el.className = `live ${cls}`; $('#liveText').textContent = text; }
  async function poll() {
    if (polling) return; polling = true;
    try {
      const st = await fetch('/api/status', { cache: 'no-store' }).then(r => r.json());
      if (st.error) setLive('err', '解析錯誤（顯示上一版）');
      else if (st.building) setLive('busy', '解析中…');
      else setLive('on', `即時同步 · ${(st.generated_at || '').slice(11, 19)}`);
      if (st.web_rev) {
        if (!webRev) webRev = st.web_rev;
        else if (st.web_rev !== webRev && !webToastShown) {
          webToastShown = true;
          const t = toast('✨ 網頁已更新　<button class="btn small" style="margin-left:8px">按此重新整理</button>', 600000);
          $('button', t).onclick = () => location.reload();
        }
      }
      if (!st.building && st.revision && G && (st.revision !== G.revision || st.generated_at !== G.provenance?.generated_at)) {
        const g = await fetch('../data/graph.json', { cache: 'no-store' }).then(r => r.json());
        load(g, true);
      }
    } catch (e) {
      setLive('err', '伺服器未啟動');
    } finally { polling = false; }
  }

  function setupUpload() {
    if (PUBLISH) return;
    const dz = $('#dropzone');
    let depth = 0;
    const send = async files => {
      if (!LIVE) { toast('目前是離線快照。請執行 <b>start.bat</b> 開啟即時模式，或直接把檔案放進 <code>source</code> 資料夾。', 8000); return; }
      for (const f of files) {
        try {
          const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }).then(r => r.json());
          toast(r.ok ? `📥 已加入 <b>${esc(f.name)}</b>，正在重新解析…` : `⚠ ${esc(f.name)}：${esc(r.error)}`);
        } catch (e) { toast(`⚠ 上傳失敗：${esc(f.name)}`); }
      }
    };
    addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { depth++; dz.classList.add('on'); } });
    addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dz.classList.remove('on'); });
    addEventListener('dragover', e => e.preventDefault());
    addEventListener('drop', e => { e.preventDefault(); depth = 0; dz.classList.remove('on'); if (e.dataTransfer.files.length) send([...e.dataTransfer.files]); });
    $('#fileInput').onchange = e => { send([...e.target.files]); e.target.value = ''; };
  }

  // ------------------------------------------------------------ 啟動
  function start() {
    $$('#tabs button').forEach(b => b.onclick = () => switchView(b.dataset.view));
    $('#brandHome').onclick = e => { e.preventDefault(); switchView('guide'); };
    $$('#procMode button').forEach(b => b.onclick = () => setProcMode(b.dataset.mode));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
    $('#scrim').onclick = closeDetail;
    // 內容往下捲時，頁首收合成精簡列。
    // 防抖動：頁首縮小會讓內容區變高、捲動位置被拉回，若不加條件會在展開／收合之間來回閃爍。
    //   1) 上下門檻不同（>40 收合、<6 才展開）；2) 內容夠長、收合後仍可捲動才收合；3) 折疊動畫進行中不切換。
    let headFullH = 0;
    $('#drawerBody').addEventListener('scroll', e => {
      const b = e.target, d = $('#drawer');
      if (foldBusy) return;
      const compact = d.classList.contains('scrolled');
      if (!compact) headFullH = $('#drawerHead').offsetHeight;
      const room = b.scrollHeight - b.clientHeight;          // 目前可捲動的距離
      const delta = Math.max(0, headFullH - 70);             // 頁首收合後內容區增加的高度
      if (!compact && b.scrollTop > 40 && room > delta + 60) d.classList.add('scrolled');
      else if (compact && b.scrollTop < 6) d.classList.remove('scrolled');
    }, { passive: true });
    if (PUBLISH) {
      // 隱藏一致性檢查分頁、上傳按鈕，分頁重新編號
      $('#tabs button[data-view="issues"]')?.remove();
      $('#view-issues')?.remove();
      $('#uploadBtn')?.remove();
      const nums = '①②③④⑤⑥⑦⑧⑨';
      $$('#tabs button').forEach((b, i) => { const t = b.childNodes[0]; if (t && t.nodeType === 3) t.textContent = t.textContent.replace(/^[①-⑨]/, nums[i]); });
      document.body.classList.add('publish');
    }
    setupSearch(); setupMotion(); setupUpload(); MM.setup(); ORG.setup();
    const boot = g => {
      load(g, false);
      let v = 'guide'; try { v = localStorage.getItem('qms.view') || 'guide'; } catch (e) { /* 無痕模式 */ }
      if ($(`#view-${v}`)) switchView(v);
    };
    if (PUBLISH) {
      boot(window.QMS_GRAPH);
      setLive('pub', `公開唯讀版・資料日期 ${(window.QMS_GRAPH.provenance?.generated_at || '').slice(0, 10)}`);
    } else if (LIVE) {
      fetch('../data/graph.json', { cache: 'no-store' }).then(r => r.json()).then(boot).catch(() => window.QMS_GRAPH && boot(window.QMS_GRAPH));
      setInterval(poll, 2000); poll();
    } else if (window.QMS_GRAPH) {
      boot(window.QMS_GRAPH);
      setLive('', '離線快照（用 start.bat 開啟可即時同步）');
    } else {
      $('#main').innerHTML = '<div class="empty">找不到資料。請先執行 <code>python tools/build.py</code>。</div>';
    }
  }
  start();
  window.QMS_APP = { MM, openDetail, switchView, readable }; // 除錯用
})();
