/* 吉佳藥局官網｜頁面互動
   資料來源順序：Google 試算表（config.js 有填網址時）→ data/fallback.js
   所有試算表文字一律用 textContent 寫入頁面，不會被當成 HTML 執行。 */
(function () {
  'use strict';
  var C = window.JijiaCore;
  if (!C) return;
  var CFG = window.JIJIA_CONFIG || { sheets: {}, defaults: {} };
  var FB = window.JIJIA_FALLBACK || { products: [], news: [], settings: {} };
  var params = new URLSearchParams(location.search);
  var PREVIEW = params.get('preview') === '1';
  var S = {}; // 設定（預設值 ＜ 備援檔 ＜ 試算表）
  var DATA = { products: [], news: [], productsError: false };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v; // 僅限程式內建的靜態字串
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  /* ---------- 圖示（程式內建、靜態） ---------- */
  var ICONS = {
    nutrition: '<rect x="86" y="22" width="68" height="22" rx="4"/><rect x="74" y="48" width="92" height="100" rx="16"/><path d="M74 79h92M74 123h92M105 101h30M120 86v30"/>',
    wellness: '<rect x="69" y="28" width="53" height="109" rx="5" transform="rotate(-12 95 82)"/><rect x="123" y="40" width="50" height="101" rx="5" transform="rotate(12 148 90)"/><path d="M83 58l26-5M80 77l34-7M134 67l24 5M130 85l24 5M87 111l24-5"/>',
    homecare: '<rect x="62" y="29" width="115" height="105" rx="17"/><rect x="80" y="46" width="78" height="44" rx="3"/><path d="M94 67h15l7-12 10 25 7-13h12"/><circle cx="121" cy="113" r="8"/>',
    enclosure: '<path d="M53 134V42h134v92ZM53 60h134M117 60v74M77 118l23-29 17 22 30-36 23 43M66 31h108"/><circle cx="157" cy="86" r="8"/>',
    boarding: '<path d="M63 133V65l57-42 57 42v68ZM51 74l69-51 69 51"/><path d="M100 134V93h40v41M81 77h13M147 77h13"/><circle cx="120" cy="62" r="8"/>',
    studio: '<rect x="67" y="20" width="106" height="124"/><path d="M120 54v66M120 73c-41-53-48 10-7 18M120 73c41-53 48 10 7 18M115 94c-35-4-28 37 3 20M125 94c35-4 28 37-3 20M115 58l-9-12M125 58l9-12"/>',
    lamp: '<path d="M120 20V40M86 78a34 34 0 0 1 68 0Z"/><circle cx="120" cy="96" r="12"/><path d="M96 124l-8 14M120 128v16M144 124l8 14"/>',
    substrate: '<rect x="62" y="30" width="116" height="106" rx="8"/><path d="M62 74c15-8 30 8 45 0s30-8 45 0 16 6 26 0M62 102c15-8 30 8 45 0s30-8 45 0 16 6 26 0"/><circle cx="92" cy="54" r="4"/><circle cx="142" cy="52" r="3"/>',
    insect: '<ellipse cx="120" cy="90" rx="26" ry="38"/><circle cx="120" cy="44" r="11"/><path d="M120 52v76M94 72l-26-12M94 92l-30 4M96 112l-24 18M146 72l26-12M146 92l30 4M144 112l24 18M114 35l-8-14M126 35l8-14"/>',
    box: '<rect x="62" y="40" width="116" height="92" rx="10"/><path d="M62 70h116M104 70v22h32V70"/>'
  };
  function iconKeyFor(p) {
    var t = p.category + ' ' + p.name;
    if (/寄宿/.test(t)) return 'boarding';
    if (/造景|標本/.test(t)) return /材料|底材/.test(t) ? 'substrate' : 'studio';
    if (/底材/.test(t)) return 'substrate';
    if (/UVB|加熱|燈|溫濕度/i.test(t)) return 'lamp';
    if (/昆蟲|節肢|餌/.test(t)) return 'insect';
    if (/醫材|量測|血壓|體溫|照護/.test(t)) return 'homecare';
    if (/生活保健|益生菌|魚油/.test(t)) return 'wellness';
    if (/保健|營養|維生素/.test(t)) return 'nutrition';
    if (/飼養|設備|缸|箱|爬蟲/.test(t)) return 'enclosure';
    return 'box';
  }
  function iconSvg(key) {
    var s = el('span', { class: 'ico', 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 240 160" focusable="false">' + (ICONS[key] || ICONS.box) + '</svg>';
    return s;
  }

  /* ---------- 讀取資料 ---------- */
  function fetchText(url) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, CFG.fetchTimeoutMs || 8000) : null;
    return fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { if (timer) clearTimeout(timer); return t; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function loadSource(key) {
    var url = C.safeUrl(CFG.sheets && CFG.sheets[key], { allowRelative: true, allowHttpLocal: true });
    if (!url) return Promise.resolve({ configured: false });
    return fetchText(url).then(
      function (t) { return { configured: true, ok: true, rows: C.parseCSV(t) }; },
      function () { return { configured: true, ok: false }; }
    );
  }
  /* ----- Firebase 後台（Firestore REST，不需載入 SDK） ----- */
  var FBASE = CFG.firebase || {};
  var HAS_FB = !!(FBASE.projectId && FBASE.apiKey);
  function fsUrl(path) {
    var base = C.safeUrl(FBASE.restBase, { allowHttpLocal: true }) || 'https://firestore.googleapis.com/v1';
    return base.replace(/\/$/, '') + '/projects/' + encodeURIComponent(FBASE.projectId) + '/databases/(default)/documents' + path +
      (path.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(FBASE.apiKey);
  }
  function fsFetch(path, opts) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, CFG.fetchTimeoutMs || 8000) : null;
    opts = opts || {};
    if (ctl) opts.signal = ctl.signal;
    return fetch(fsUrl(path), opts)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (timer) clearTimeout(timer); return j; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function fsPublished(collection) {
    return fsFetch(':runQuery', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } },
        limit: 500
      } })
    }).then(function (rows) {
      return (rows || []).filter(function (r) { return r.document; }).map(function (r) {
        return { id: C.docId(r.document.name), data: C.fsDecode(r.document.fields) };
      });
    });
  }
  function sendInquiry(q) {
    return fsFetch('/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: C.fsEncode(C.inquiryDoc(q)) })
    });
  }
  var CACHE_KEY = 'jijia-data-v1';
  function loadFirebase() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.pid === FBASE.projectId && Date.now() - c.t < 120000) { S = c.s; DATA = c.d; return Promise.resolve(); }
    } catch (e) { /* 忽略 */ }
    var soft = function (p) { return p.then(function (v) { return { ok: true, v: v }; }, function () { return { ok: false }; }); };
    return Promise.all([soft(fsFetch('/settings/site')), soft(fsPublished('products')), soft(fsPublished('news'))]).then(function (r) {
      S = Object.assign({}, CFG.defaults || {});
      if (r[0].ok) {
        var vals = C.fsDecode(r[0].v.fields).values || {};
        Object.keys(vals).forEach(function (k) { if (vals[k] !== '' && vals[k] != null) S[k] = String(vals[k]); });
      }
      if (r[1].ok) DATA.products = r[1].v.map(function (d) { return C.productDocToRaw(d.data, d.id); });
      else { DATA.products = []; DATA.productsError = true; }
      DATA.news = r[2].ok ? r[2].v.map(function (d) { return C.newsDocToRaw(d.data); }) : [];
      if (r[0].ok && r[1].ok && r[2].ok) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), pid: FBASE.projectId, s: S, d: DATA })); } catch (e) { /* 忽略 */ }
      }
    });
  }
  var imgObserver = null;
  function lazyBackendImage(media, p) {
    if (!HAS_FB || !p.hasImage || !p.docId || typeof IntersectionObserver !== 'function') return;
    if (!imgObserver) {
      imgObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          imgObserver.unobserve(en.target);
          var m = en.target, prod = m.__p;
          fsFetch('/productImages/' + encodeURIComponent(prod.docId)).then(function (doc) {
            var src = C.imageSrc(C.fsDecode(doc.fields).data);
            if (!src) return;
            m.textContent = '';
            m.appendChild(el('img', { src: src, alt: prod.name, width: '480', height: '320' }));
          }, function () { /* 讀不到就維持示意圖 */ });
        });
      }, { rootMargin: '200px' });
    }
    media.__p = p;
    imgObserver.observe(media);
  }

  function loadAll() {
    if (HAS_FB) return loadFirebase();
    return Promise.all([loadSource('settings'), loadSource('products'), loadSource('news')]).then(function (r) {
      S = Object.assign({}, CFG.defaults || {}, FB.settings || {});
      if (r[0].configured && r[0].ok) S = Object.assign(S, C.settingsFromRows(r[0].rows));
      if (!r[1].configured) DATA.products = FB.products || [];
      else if (r[1].ok) DATA.products = C.rowsToObjects(r[1].rows);
      else { DATA.products = []; DATA.productsError = true; }
      if (!r[2].configured) DATA.news = FB.news || [];
      else if (r[2].ok) DATA.news = C.rowsToObjects(r[2].rows);
      else DATA.news = [];
    });
  }

  /* ---------- 設定套用 ---------- */
  var BADGE_CLASS = { '已啟用': 'on', '洽詢中': 'ask', '規劃中': 'plan', '暫停': 'pause' };
  function siteState() { return C.siteState(S['營業狀態']) || '籌備中'; }

  function applySettings() {
    var state = siteState();
    document.documentElement.setAttribute('data-site-state', state);

    $$('[data-bind]').forEach(function (n) {
      var v = S[n.getAttribute('data-bind')];
      if (v) n.textContent = v;
    });
    $$('[data-hours-label]').forEach(function (n) { n.textContent = state === '籌備中' ? '預計營業時間' : '營業時間'; });

    $$('[data-href]').forEach(function (a) {
      var key = a.getAttribute('data-href'), href = '';
      if (key === '電話') href = C.telHref(S['電話']);
      else if (key === '地址') href = C.mapsHref(S['地址']);
      else href = C.safeUrl(S[key]);
      if (href) {
        a.setAttribute('href', href);
        if (/^https:/.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
        a.hidden = false;
      } else if (a.hasAttribute('data-hide-empty')) a.hidden = true;
    });
    $$('[data-show-when]').forEach(function (n) {
      n.hidden = n.getAttribute('data-show-when').split(',').indexOf(state) < 0;
    });
    $$('[data-has]').forEach(function (n) {
      var key = n.getAttribute('data-has');
      var ok = key === 'LINE連結' || /連結$/.test(key) ? !!C.safeUrl(S[key]) : !!S[key];
      n.hidden = !ok;
    });
    $$('[data-status]').forEach(function (n) {
      var st = C.status(S[n.getAttribute('data-status')]) || '規劃中';
      n.textContent = st;
      n.className = 'badge badge-' + BADGE_CLASS[st];
    });
    $$('iframe[data-map]').forEach(function (f) {
      var want = 'https://maps.google.com/maps?q=' + encodeURIComponent(S['地址'] || '') + '&output=embed';
      if (S['地址'] && f.getAttribute('src') !== want) f.setAttribute('src', want);
    });
    renderStatusBar(state);
    renderPaused();
  }

  function renderStatusBar(state) {
    var bar = $('#site-status');
    if (!bar) return;
    var hours = S['營業時間'] || '';
    var msg;
    if (state === '籌備中') {
      msg = '預計營業時間 ' + hours + '　·　' + (S['預計開幕日'] ? '預計 ' + S['預計開幕日'] + ' 開幕' : '開幕日期與服務項目確認後公告');
    } else if (state === '已開幕') {
      msg = '營業時間 ' + hours + (S['藥師服務時段'] ? '　·　藥師服務時段 ' + S['藥師服務時段'] : '');
    } else {
      msg = '目前暫停營業，恢復時間請見最新消息或來電洽詢';
    }
    if (S['全站公告']) msg += '　·　' + S['全站公告'];
    bar.textContent = '';
    bar.appendChild(el('span', { class: 'pill pill-' + (state === '籌備中' ? 'prep' : state === '已開幕' ? 'open' : 'closed'), text: state }));
    bar.appendChild(el('span', { class: 'txt', text: msg }));
  }

  function renderPaused() {
    var paused = C.status(S['特寵寄宿']) === '暫停';
    var box = $('#composer-paused'), fs = $('#composer fieldset');
    if (box) box.hidden = !paused;
    if (fs) fs.disabled = paused;
  }

  /* ---------- 小工具 ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function copyText(text) {
    function fallback() {
      var ta = el('textarea', { 'aria-hidden': 'true' }); ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta); return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  function fmtDate(d) { var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(d || ''); return m ? m[1] + '.' + ('0' + m[2]).slice(-2) + '.' + ('0' + m[3]).slice(-2) : d; }

  /* ---------- 商品 ---------- */
  function allProducts() {
    var list = DATA.products.map(function (raw, i) {
      var p = C.normalizeProduct(raw, i);
      p.docId = raw._id || ''; p.hasImage = raw._hasImage === true;
      return p;
    }).filter(function (p) { return p.name; });
    if (!PREVIEW) list = list.filter(function (p) { return p.publishable; });
    return C.sortProducts(list);
  }
  function productCard(p) {
    var media = el('div', { class: 'p-media ' + (p.floor === '2F' ? 'tone-nature' : 'tone-care') });
    if (p.image) {
      var img = el('img', { src: p.image, alt: p.name, loading: 'lazy', width: '480', height: '320' });
      img.addEventListener('error', function () { media.textContent = ''; media.appendChild(iconSvg(iconKeyFor(p))); media.appendChild(el('span', { class: 'p-ph', text: '圖片準備中' })); });
      media.appendChild(img);
    } else {
      media.appendChild(iconSvg(iconKeyFor(p)));
      media.appendChild(el('span', { class: 'p-ph', text: '類別示意' }));
      lazyBackendImage(media, p);
    }
    var meta = el('p', { class: 'p-meta' }, [
      p.floor ? el('span', { class: 'floor-tag', text: p.floor }) : null,
      el('span', { text: p.category })
    ]);
    var foot = el('div', { class: 'p-foot' }, [
      p.status ? el('span', { class: 'badge badge-' + BADGE_CLASS[p.status], text: p.status }) : null,
      p.price ? el('span', { class: 'price', text: p.price }) : null
    ]);
    var btn = el('button', { type: 'button', class: 'link-btn', 'aria-haspopup': 'dialog' }, ['查看與洽詢 ', el('span', { 'aria-hidden': 'true', text: '↗' })]);
    btn.addEventListener('click', function () { openItem(p, btn); });
    var body = el('div', { class: 'p-body' }, [
      meta,
      el('h3', { text: p.name }),
      p.brand ? el('p', { class: 'p-brand', text: p.brand }) : null,
      el('p', { class: 'p-sum', text: p.summary }),
      p.species.length ? el('ul', { class: 'tags', 'aria-label': '適用物種' }, p.species.map(function (s) { return el('li', { text: s }); })) : null,
      foot, btn
    ]);
    if (PREVIEW && p.issues.length) {
      body.insertBefore(el('p', { class: 'p-issue', text: '預覽提示：' + p.issues.join('；') + (p.publishable ? '' : '（公開頁面不會顯示）') }), body.firstChild);
    }
    var art = el('article', { class: 'p-card' + (PREVIEW && !p.publishable ? ' is-hidden-item' : '') }, [media, body]);
    return art;
  }

  function inquiryMessage(p) {
    return '您好，我想詢問「' + p.name + '」' + (p.id ? '（編號 ' + p.id + '）' : '') + '，想了解供貨情況與使用方式。';
  }

  function openItem(p, opener) {
    var dlg = $('#item-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') { location.href = '#contact'; return; }
    var box = $('#item-dialog-body', dlg);
    box.textContent = '';
    var rows = [];
    if (p.brand) rows.push(['品牌', p.brand]);
    if (p.spec) rows.push(['規格', p.spec]);
    if (p.species.length) rows.push(['適用物種', p.species.join('、')]);
    if (p.price) rows.push(['參考價格', p.price + '（以門市確認為準）']);
    var dl = el('dl', { class: 'spec' });
    rows.forEach(function (r) { dl.appendChild(el('div', null, [el('dt', { text: r[0] }), el('dd', { text: r[1] })])); });

    var msg = inquiryMessage(p);
    var actions = el('div', { class: 'dlg-actions' });
    var tel = C.telHref(S['電話']);
    if (tel) actions.appendChild(el('a', { class: 'btn btn-primary', href: tel, text: '撥打電話洽詢' }));
    var copyBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: '複製洽詢訊息' });
    copyBtn.addEventListener('click', function () { copyText(msg).then(function (ok) { toast(ok ? '已複製，可貼到 Instagram 或 LINE 傳給我們' : '複製失敗，請手動選取訊息文字'); }); });
    actions.appendChild(copyBtn);
    var ig = C.safeUrl(S['Instagram連結']); if (ig) actions.appendChild(el('a', { class: 'btn btn-ghost', href: ig, target: '_blank', rel: 'noopener noreferrer', text: 'Instagram 私訊' }));
    var line = C.safeUrl(S['LINE連結']); if (line) actions.appendChild(el('a', { class: 'btn btn-ghost', href: line, target: '_blank', rel: 'noopener noreferrer', text: 'LINE 洽詢' }));
    if (/寄宿/.test(p.name + p.category)) actions.appendChild(el('a', { class: 'btn btn-ghost', href: 'boarding.html', text: '前往寄宿洽詢' }));
    else if (HAS_FB) actions.appendChild(el('a', { class: 'btn btn-ghost', href: 'contact.html?item=' + encodeURIComponent(p.name + (p.id ? '（' + p.id + '）' : '')) + '#inquiry', text: '線上留言洽詢' }));

    [
      el('p', { class: 'p-meta' }, [p.floor ? el('span', { class: 'floor-tag', text: p.floor }) : null, el('span', { text: p.category })]),
      el('h2', { id: 'item-dialog-title', text: p.name }),
      p.status ? el('p', null, [el('span', { class: 'badge badge-' + BADGE_CLASS[p.status], text: p.status })]) : null,
      el('p', { class: 'dlg-sum', text: p.summary }),
      rows.length ? dl : null,
      p.notice ? el('div', { class: 'dlg-note' }, [el('strong', { text: '注意事項' }), el('p', { text: p.notice })]) : null,
      el('div', { class: 'dlg-msg' }, [el('span', { class: 'lbl', text: '洽詢訊息範例' }), el('p', { text: msg })]),
      actions,
      el('p', { class: 'fine', text: '本網站不提供線上購物與付款；實際品項、價格與供應情況以門市確認為準。' })
    ].forEach(function (n) { if (n) box.appendChild(n); });

    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', function () { if (opener && opener.focus) opener.focus(); }, { once: true });
  }

  function initDialog() {
    var dlg = $('#item-dialog');
    if (!dlg) return;
    $('#item-dialog-close', dlg).addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); }); // 點背景關閉
  }

  /* 首頁／藥局頁的精選與分區預覽 */
  function renderTeasers() {
    $$('[data-products]').forEach(function (box) {
      var mode = box.getAttribute('data-products');
      var max = parseInt(box.getAttribute('data-max') || '6', 10);
      var list = allProducts();
      if (mode === 'featured') {
        var f = list.filter(function (p) { return p.featured; });
        list = (f.length ? f : list).slice(0, max);
      } else if (/^floor:/.test(mode)) {
        var fl = mode.split(':')[1];
        list = list.filter(function (p) { return p.floor === fl; }).slice(0, max);
      }
      box.textContent = '';
      if (DATA.productsError) { box.appendChild(el('p', { class: 'empty', text: '商品資料暫時無法載入，歡迎直接電話洽詢。' })); return; }
      if (!list.length) { box.appendChild(el('p', { class: 'empty', text: '目前沒有可顯示的項目，歡迎直接洽詢門市。' })); return; }
      list.forEach(function (p) { box.appendChild(productCard(p)); });
    });
  }

  /* 商品導覽頁：篩選 */
  function initCatalog() {
    var root = $('#catalog');
    if (!root) return;
    var grid = $('#catalog-grid'), count = $('#catalog-count'), more = $('#catalog-more');
    var floorBox = $('#f-floor'), catBox = $('#f-cat'), spBox = $('#f-species'), q = $('#f-q');
    var items = allProducts();
    var st = { floor: params.get('floor') || 'all', cat: params.get('cat') || 'all', sp: 'all', q: '', limit: 24 };
    if (['all', '1F', '2F'].indexOf(st.floor) < 0) st.floor = 'all';

    function inFloor(p) { return st.floor === 'all' || p.floor === st.floor; }
    function uniq(arr) { var o = []; arr.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }

    function chip(label, value, current, onPick) {
      var b = el('button', { type: 'button', class: 'chip' + (value === current ? ' active' : ''), 'aria-pressed': String(value === current), text: label });
      b.addEventListener('click', function () { onPick(value); });
      return b;
    }
    function drawFilters() {
      floorBox.textContent = '';
      [['all', '全部'], ['1F', '1F 社區藥局'], ['2F', '2F 自然與特寵']].forEach(function (f) {
        floorBox.appendChild(chip(f[1], f[0], st.floor, function (v) { st.floor = v; st.cat = 'all'; st.sp = 'all'; st.limit = 24; update(); }));
      });
      var cats = uniq(items.filter(inFloor).map(function (p) { return p.category; }));
      if (cats.indexOf(st.cat) < 0) st.cat = 'all';
      catBox.textContent = '';
      if (cats.length > 1) {
        catBox.appendChild(chip('全部類別', 'all', st.cat, function (v) { st.cat = v; st.limit = 24; update(); }));
        cats.forEach(function (c) { catBox.appendChild(chip(c, c, st.cat, function (v) { st.cat = v; st.limit = 24; update(); })); });
      }
      catBox.hidden = cats.length <= 1;
      var sps = uniq([].concat.apply([], items.filter(inFloor).map(function (p) { return p.species; })));
      if (sps.indexOf(st.sp) < 0) st.sp = 'all';
      spBox.textContent = '';
      if (sps.length) {
        spBox.appendChild(el('span', { class: 'f-label', text: '依物種找' }));
        spBox.appendChild(chip('全部', 'all', st.sp, function (v) { st.sp = v; st.limit = 24; update(); }));
        sps.forEach(function (s) { spBox.appendChild(chip(s, s, st.sp, function (v) { st.sp = v; st.limit = 24; update(); })); });
      }
      spBox.hidden = !sps.length;
    }
    function matches(p) {
      if (!inFloor(p)) return false;
      if (st.cat !== 'all' && p.category !== st.cat) return false;
      if (st.sp !== 'all' && p.species.indexOf(st.sp) < 0) return false;
      if (st.q) {
        var hay = [p.name, p.brand, p.category, p.summary, p.species.join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(st.q) < 0) return false;
      }
      return true;
    }
    function drawGrid() {
      var list = items.filter(matches);
      grid.textContent = '';
      if (DATA.productsError) {
        grid.appendChild(el('p', { class: 'empty', text: '商品資料暫時無法載入，請稍後再試，或直接電話洽詢。' }));
        count.textContent = ''; more.hidden = true; return;
      }
      list.slice(0, st.limit).forEach(function (p) { grid.appendChild(productCard(p)); });
      if (!list.length) grid.appendChild(el('p', { class: 'empty', text: items.length ? '找不到符合的項目，換個條件試試，或直接洽詢門市。' : '目前沒有可顯示的項目，歡迎直接洽詢門市。' }));
      count.textContent = list.length ? '共 ' + list.length + ' 個項目' + (list.length > st.limit ? '，已顯示 ' + st.limit + ' 個' : '') : '';
      more.hidden = list.length <= st.limit;
    }
    function syncUrl() {
      var u = new URLSearchParams();
      if (PREVIEW) u.set('preview', '1');
      if (st.floor !== 'all') u.set('floor', st.floor);
      if (st.cat !== 'all') u.set('cat', st.cat);
      try { history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u.toString() : '')); } catch (e) { /* 忽略 */ }
    }
    function update() { drawFilters(); drawGrid(); syncUrl(); }
    q.addEventListener('input', function () { st.q = q.value.trim().toLowerCase(); st.limit = 24; drawGrid(); });
    more.addEventListener('click', function () { st.limit += 24; drawGrid(); });
    update();
  }

  /* ---------- 消息 ---------- */
  function renderNews() {
    $$('[data-news]').forEach(function (box) {
      var mode = box.getAttribute('data-news');
      var list = C.sortNews(DATA.news.map(C.normalizeNews).filter(function (n) { return n.publishable; }));
      if (/^latest:/.test(mode)) list = list.slice(0, parseInt(mode.split(':')[1], 10) || 3);
      box.textContent = '';
      if (!list.length) { box.appendChild(el('p', { class: 'empty', text: '目前沒有最新消息，有更新時會在這裡公告。' })); return; }
      list.forEach(function (n) {
        var body = el('div', { class: 'news-body' }, [
          el('h3', { text: n.title }),
          n.body ? el('p', { text: n.body }) : null,
          n.link ? el('a', { class: 'text-link', href: n.link, target: '_blank', rel: 'noopener noreferrer', text: '了解更多 ↗' }) : null
        ]);
        box.appendChild(el('article', { class: 'news-item' }, [
          el('time', { class: 'news-date', datetime: n.date, text: fmtDate(n.date) }),
          n.pinned ? el('span', { class: 'pin', text: '置頂' }) : null,
          body
        ]));
      });
    });
  }

  /* ---------- 寄宿洽詢訊息產生器（資料只在瀏覽器內處理，不上傳） ---------- */
  function initComposer() {
    var form = $('#composer');
    if (!form) return;
    var out = $('#composer-out'), result = $('#composer-result'), err = $('#composer-error');
    var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    var iso = today.toISOString().slice(0, 10);
    form.elements.checkin.min = iso; form.elements.checkout.min = iso;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      var d = new FormData(form);
      function v(k) { return String(d.get(k) || '').trim(); }
      if (!v('species')) { err.textContent = '請先填寫物種，我們才能評估是否可接待。'; form.elements.species.focus(); return; }
      if (v('checkin') && v('checkout') && v('checkout') < v('checkin')) { err.textContent = '接回日期不能早於入住日期。'; form.elements.checkout.focus(); return; }
      var lines = ['您好，我想洽詢特寵寄宿：'];
      [['稱呼', 'name'], ['物種', 'species'], ['數量', 'count'], ['體型／年齡階段', 'size'], ['希望入住', 'checkin'], ['希望接回', 'checkout'],
        ['飼養設備與餵食', 'feeding'], ['溫濕度／照護注意', 'care'], ['其他備註', 'note'], ['方便聯絡的方式', 'contact']
      ].forEach(function (f) { if (v(f[1])) lines.push(f[0] + '：' + v(f[1])); });
      lines.push('（此為網站洽詢訊息，尚非預約成立，請門市評估後回覆。）');
      out.value = lines.join('\n');
      result.hidden = false;
      result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      out.focus();
    });
    $('#composer-copy').addEventListener('click', function () {
      copyText(out.value).then(function (ok) { toast(ok ? '已複製訊息，請貼到下方管道送出' : '複製失敗，請手動選取訊息文字'); });
    });
    form.addEventListener('reset', function () { result.hidden = true; err.textContent = ''; });
  }

  /* ---------- 線上洽詢表單（接了後台才會出現） ---------- */
  function initInquiryForms() {
    $$('[data-needs-backend]').forEach(function (n) { n.hidden = !HAS_FB; });
    if (!HAS_FB) return;
    $$('form[data-inquiry]').forEach(function (form) {
      var status = $('.inq-status', form), done = form.parentNode.querySelector('.inq-done'), btn = $('button[type=submit]', form);
      var item = params.get('item');
      if (item && form.elements.item) {
        form.elements.item.value = item.slice(0, 120);
        if (form.elements.type && form.elements.type.tagName === 'SELECT') form.elements.type.value = '商品';
        if (form.elements.message && !form.elements.message.value) form.elements.message.value = '我想詢問「' + item.slice(0, 120) + '」：';
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var from = form.getAttribute('data-message-from');
        var q = {
          type: form.elements.type.value,
          name: form.elements.name ? form.elements.name.value : '',
          contact: form.elements.contact.value,
          message: from ? ($(from) || {}).value || '' : form.elements.message.value,
          item: form.elements.item ? form.elements.item.value : '',
          consent: form.elements.consent.checked
        };
        var errs = C.inquiryErrors(q);
        if (errs.length) { status.textContent = errs[0]; status.className = 'inq-status is-error'; return; }
        var finish = function () { form.hidden = true; if (done) { done.hidden = false; done.focus(); } };
        if (form.elements.website && form.elements.website.value) { finish(); return; } // 機器人陷阱欄位
        var last = 0; try { last = Number(localStorage.getItem('jijia-inq-last') || 0); } catch (e2) { /* 忽略 */ }
        if (Date.now() - last < 30000) { status.textContent = '剛剛已送出一則洽詢，請稍候 30 秒再送。'; status.className = 'inq-status is-error'; return; }
        btn.disabled = true; status.textContent = '送出中…'; status.className = 'inq-status';
        sendInquiry(q).then(function () {
          try { localStorage.setItem('jijia-inq-last', String(Date.now())); } catch (e3) { /* 忽略 */ }
          finish();
        }, function () {
          btn.disabled = false;
          status.textContent = '送出失敗，內容還在這裡沒有遺失。請再試一次，或改用電話聯絡。';
          status.className = 'inq-status is-error';
        });
      });
    });
  }

  /* ---------- 導覽、選單、嚕嚕 ---------- */
  function initChrome() {
    var btn = $('.menu-toggle'), nav = $('#nav');
    if (btn && nav) {
      var close = function () { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', '開啟導覽選單'); };
      btn.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-label', open ? '關閉導覽選單' : '開啟導覽選單');
      });
      $$('a', nav).forEach(function (a) { a.addEventListener('click', close); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { close(); btn.focus(); } });
      window.matchMedia('(min-width: 861px)').addEventListener('change', function (e) { if (e.matches) close(); });
    }
    var page = document.body.getAttribute('data-page');
    $$('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page'); });

    var lb = $('#lulu-button'), lm = $('#lulu-message');
    if (lb && lm) lb.addEventListener('click', function () { lm.hidden = !lm.hidden; lb.setAttribute('aria-expanded', String(!lm.hidden)); });

    $$('.year').forEach(function (n) { n.textContent = new Date().getFullYear(); });
    $$('img[data-fallback-hide]').forEach(function (img) {
      img.addEventListener('error', function () { img.hidden = true; var p = img.parentNode; if (p) p.classList.add('no-img'); });
      if (img.complete && img.naturalWidth === 0) { img.hidden = true; if (img.parentNode) img.parentNode.classList.add('no-img'); }
    });

    if (PREVIEW) {
      var bar = el('div', { class: 'preview-bar', role: 'status' }, [
        el('strong', { text: '預覽模式' }),
        ' 顯示試算表所有列（含「顯示＝否」「未審核」與被防呆規則擋下的項目），這不是訪客看到的樣子。'
      ]);
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  /* ---------- 啟動 ---------- */
  function start() {
    initChrome();
    initDialog();
    initComposer();
    initInquiryForms();
    loadAll().then(function () {
      applySettings();
      renderTeasers();
      initCatalog();
      renderNews();
      document.documentElement.classList.add('data-ready');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
