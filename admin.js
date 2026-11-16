/* 吉佳藥局｜管理後台
   admin.html          → 連線 Firebase（需先在 config.js 填好 firebase 設定）
   admin.html?demo=1   → 示範模式：資料只存在這台瀏覽器，不會影響正式網站 */
const C = window.JijiaCore;
const CFG = window.JIJIA_CONFIG || {};
const FB = window.JIJIA_FALLBACK || {};
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const HAS_FB = !!(CFG.firebase && CFG.firebase.projectId && CFG.firebase.apiKey);

const $ = (s, r = document) => r.querySelector(s);
function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return n;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const nowIso = () => new Date().toISOString();
const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('zh-TW', { hour12: false }); };

/* ---------- 示範模式的資料層（localStorage） ---------- */
function demoBackend() {
  const KEY = 'jijia-admin-demo-v1';
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db) {
    db = { products: {}, productImages: {}, news: {}, settings: { site: { values: {} } }, inquiries: {} };
    (FB.products || []).forEach((raw, i) => { db.products['demo-p' + i] = C.productRawToDoc(raw); });
    (FB.news || []).forEach((raw, i) => {
      db.news['demo-n' + i] = { date: raw['日期'], published: C.yes(raw['顯示']), pinned: C.yes(raw['置頂']), title: raw['標題'], body: raw['內容'], link: raw['連結'] || '' };
    });
    db.inquiries['demo-q1'] = { type: '寄宿', name: '示範訪客', contact: 'LINE：demo-id（晚上方便）', message: '您好，我想洽詢特寵寄宿：\n物種：豹紋守宮\n數量：1 隻\n希望入住：2027-02-10\n希望接回：2027-02-15', item: '', consent: true, status: 'new', createdAt: nowIso() };
    db.inquiries['demo-q2'] = { type: '商品', name: '', contact: '0900-000-000', message: '我想詢問「飼養環境與設備（2F-01）」：60 公分的缸有現貨嗎？', item: '飼養環境與設備（2F-01）', consent: true, status: 'replied', note: '已電話回覆', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() };
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 空間不足時忽略 */ } };
  let cb = () => {};
  return {
    mode: 'demo',
    onAuth(f) { cb = f; f({ user: null, admin: false }); },
    async signIn() { cb({ user: { uid: 'demo', email: '示範帳號', name: '示範' }, admin: true }); },
    async signOut() { cb({ user: null, admin: false }); },
    async list(col) { return Object.entries(db[col] || {}).map(([id, d]) => ({ id, ...d })); },
    async get(col, id) { const d = (db[col] || {})[id]; return d ? { id, ...d } : null; },
    async set(col, id, data) {
      db[col] = db[col] || {};
      id = id || 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      db[col][id] = { ...(db[col][id] || {}), ...data }; save(); return id;
    },
    async remove(col, id) { if (db[col]) delete db[col][id]; save(); },
    reset() { localStorage.removeItem(KEY); },
  };
}

/* ---------- 圖片壓縮：存進資料庫前縮到約 640px、100KB 上下 ---------- */
async function compressImage(file, maxW = 640) {
  if (!/^image\//.test(file.type)) throw new Error('請選擇圖片檔（JPG、PNG 或 WebP）。');
  if (file.size > 15 * 1024 * 1024) throw new Error('圖片超過 15MB，請先縮小再上傳。');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * scale)); cv.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    let url = cv.toDataURL('image/webp', q);
    if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/jpeg', q);
    if (url.length < 600000) return url;
  }
  throw new Error('圖片壓縮後仍然太大，請換一張較小的圖片。');
}

/* ---------- 狀態 ---------- */
let backend = null;
let tab = 'products';
const view = () => $('#a-view');

function openDialog(...content) {
  const d = $('#a-dialog'), b = $('#a-dialog-body');
  b.replaceChildren(...content);
  if (!d.open) d.showModal();
}
const closeDialog = () => { const d = $('#a-dialog'); if (d.open) d.close(); };

async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast('沒有成功：' + (e && e.code === 'permission-denied' ? '權限不足，請確認已完成管理員設定' : '請檢查網路後再試一次')); throw e; }
}

/* ---------- 商品 ---------- */
const STATUS_OPTS = ['', ...C.STATUSES];
async function renderProducts() {
  const list = (await guard(() => backend.list('products'))).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
  const rows = list.map((p) => {
    const issues = C.contentIssues(p);
    const sw = h('input', { type: 'checkbox', checked: p.published === true, 'aria-label': `在網站顯示「${p.name}」` });
    sw.addEventListener('change', async () => {
      if (sw.checked && issues.length) { sw.checked = false; toast('無法上架：' + issues[0]); return; }
      try {
        await guard(async () => {
          await backend.set('products', p.id, { published: sw.checked, updatedAt: nowIso() });
          if (p.hasImage) await backend.set('productImages', p.id, { published: sw.checked });
        }, sw.checked ? '已上架' : '已下架');
        p.published = sw.checked;
      } catch (e) { sw.checked = !sw.checked; }
    });
    return h('tr', {},
      h('td', { class: 'a-name' }, h('strong', {}, p.name || '（未命名）'), h('small', {}, [p.code, p.floor, p.category].filter(Boolean).join('・')),
        issues.length ? h('span', { class: 'a-warn' }, '⚠ ' + issues.join('；')) : null),
      h('td', {}, p.status || '—'),
      h('td', {}, p.price || '—'),
      h('td', {}, p.featured ? '精選' : ''),
      h('td', {}, String(p.order ?? '')),
      h('td', {}, h('label', { class: 'a-switch' }, sw, '顯示')),
      h('td', {}, h('button', { class: 'btn btn-ghost a-sm', type: 'button', onclick: () => editProduct(p) }, '編輯')));
  });
  view().replaceChildren(
    h('div', { class: 'a-bar' }, h('h2', {}, `商品（${list.length}）`),
      h('div', { class: 'a-actions' },
        !list.length && (FB.products || []).length ? h('button', { class: 'btn btn-ghost a-sm', type: 'button', onclick: importSamples }, '匯入範例類別') : null,
        h('button', { class: 'btn btn-primary a-sm', type: 'button', onclick: () => editProduct(null) }, '＋ 新增商品'))),
    h('p', { class: 'a-hint' }, '勾選「顯示」才會出現在網站。藥品類，以及文案含「治療、降血壓」等醫療效能字詞的項目無法上架。網站更新最多延遲約 2 分鐘。'),
    list.length ? h('div', { class: 'a-table-wrap' }, h('table', { class: 'a-table' },
      h('thead', {}, h('tr', {}, ...['名稱', '狀態', '價格', '首頁', '排序', '網站', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, rows))) : h('p', { class: 'a-empty' }, '還沒有商品。按「新增商品」開始建立。'));
}

async function importSamples() {
  await guard(async () => {
    for (const raw of FB.products || []) await backend.set('products', null, { ...C.productRawToDoc(raw), published: false, updatedAt: nowIso() });
  }, '已匯入範例類別（預設不顯示，確認後再逐一上架）');
  renderProducts();
}

function field(label, input, hint) { return h('label', {}, label, input, hint ? h('small', {}, hint) : null); }

async function editProduct(p) {
  const isNew = !p;
  p = p || { published: false, floor: '1F', order: 100, featured: false, hasImage: false };
  let newImage; // undefined＝不變、null＝移除、字串＝新圖
  const f = h('form', { class: 'a-form', novalidate: true });
  const inp = (name, attrs = {}) => h('input', { name, value: p[name] ?? '', autocomplete: 'off', ...attrs });
  const sel = (name, opts, labels) => { const s = h('select', { name }, ...opts.map((o, i) => h('option', { value: o }, labels ? labels[i] : (o || '不標示')))); s.value = p[name] ?? opts[0]; return s; };
  const err = h('p', { class: 'a-form-err', role: 'alert' });
  const imgBox = h('div', { class: 'a-img' });
  const drawImg = (src) => {
    imgBox.replaceChildren(
      src ? h('img', { src, alt: '商品圖片預覽' }) : h('span', { class: 'a-hint' }, '目前沒有圖片（網站顯示類別示意圖）'),
      src ? h('button', { class: 'btn btn-ghost a-sm', type: 'button', onclick: () => { newImage = null; drawImg(''); } }, '移除圖片') : null);
  };
  drawImg('');
  if (p.hasImage && p.id) backend.get('productImages', p.id).then((d) => { if (d && newImage === undefined) drawImg(C.imageSrc(d.data)); }, () => {});
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try { newImage = await compressImage(file.files[0]); drawImg(newImage); err.textContent = ''; }
    catch (e) { err.textContent = e.message; file.value = ''; }
  });
  const pub = h('input', { type: 'checkbox', name: 'published', checked: p.published === true });
  const feat = h('input', { type: 'checkbox', name: 'featured', checked: p.featured === true });

  f.append(
    h('h2', {}, isNew ? '新增商品' : '編輯商品'),
    h('div', { class: 'grid-2' },
      field('名稱（必填）', inp('name', { maxlength: 60, required: true })),
      field('編號', inp('code', { maxlength: 20 }), '例如 2F-07，會出現在訪客的洽詢訊息裡')),
    h('div', { class: 'grid-2' },
      field('樓層', sel('floor', ['1F', '2F'], ['1F 社區藥局', '2F 自然與特寵'])),
      field('類別', inp('category', { maxlength: 20, list: 'a-cats' }), '例如 保健食品、爬蟲飼養')),
    h('datalist', { id: 'a-cats' }, ...['保健食品', '居家醫材', '爬蟲飼養', 'UVB與加熱', '底材', '造景材料', '節肢與昆蟲', '服務'].map((c) => h('option', { value: c }))),
    field('簡介', h('textarea', { name: 'summary', rows: 2, maxlength: 200 }, p.summary || ''), '卡片上的一兩句說明。請勿寫療效或保證'),
    h('div', { class: 'grid-2' },
      field('品牌', inp('brand', { maxlength: 40 }), '未正式授權或合作前請留空'),
      field('規格', inp('spec', { maxlength: 80 }))),
    h('div', { class: 'grid-2' },
      field('適用物種', inp('species', { maxlength: 80 }), '用頓號分隔，例如 守宮、蜥蜴'),
      field('價格', inp('price', { maxlength: 30 }), '填數字會顯示 NT$；也可填「依規格洽詢」')),
    h('div', { class: 'grid-2' },
      field('供應狀態', sel('status', STATUS_OPTS)),
      field('排序', inp('order', { type: 'number', step: '1' }), '數字小的排前面')),
    field('注意事項', h('textarea', { name: 'notice', rows: 3, maxlength: 400 }, p.notice || '')),
    h('label', {}, '圖片', file, h('small', {}, '會自動縮小到寬 640px。請使用自己拍攝或已取得授權的圖片')),
    imgBox,
    h('div', { class: 'a-checks' }, h('label', { class: 'a-switch' }, pub, '在網站顯示'), h('label', { class: 'a-switch' }, feat, '放在首頁精選')),
    err,
    h('div', { class: 'a-form-actions' },
      h('div', { class: 'cta-row' }, h('button', { class: 'btn btn-primary', type: 'submit' }, '儲存'), h('button', { class: 'btn btn-text', type: 'button', onclick: closeDialog }, '取消')),
      isNew ? null : h('button', { class: 'btn a-danger', type: 'button', onclick: async () => {
        if (!confirm(`確定刪除「${p.name}」？刪除後無法復原。`)) return;
        await guard(async () => { await backend.remove('products', p.id); await backend.remove('productImages', p.id); }, '已刪除');
        closeDialog(); renderProducts();
      } }, '刪除')));

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (n) => String(f.elements[n].value || '').trim();
    const order = parseFloat(v('order'));
    const doc = {
      name: v('name'), code: v('code'), floor: v('floor'), category: v('category') || '其他', summary: v('summary'), brand: v('brand'),
      spec: v('spec'), species: v('species'), price: v('price'), status: v('status'), notice: v('notice'),
      order: isFinite(order) ? order : 9999, published: pub.checked, featured: feat.checked,
      hasImage: newImage === undefined ? p.hasImage === true : !!newImage, imageUrl: p.imageUrl || '', updatedAt: nowIso(),
    };
    if (!doc.name) { err.textContent = '請填寫名稱。'; f.elements.name.focus(); return; }
    const issues = C.contentIssues(doc);
    if (doc.published && issues.length) { err.textContent = '無法上架，請先修改：\n' + issues.join('\n') + '\n（或取消勾選「在網站顯示」先存成草稿）'; return; }
    try {
      await guard(async () => {
        const id = await backend.set('products', p.id || null, doc);
        if (newImage) await backend.set('productImages', id, { data: newImage, published: doc.published });
        else if (newImage === null) await backend.remove('productImages', id);
        else if (doc.hasImage) await backend.set('productImages', id, { published: doc.published });
      }, '已儲存');
      closeDialog(); renderProducts();
    } catch (e2) { err.textContent = '儲存失敗，內容還在表單裡，請再試一次。'; }
  });
  openDialog(f);
}

/* ---------- 消息 ---------- */
async function renderNews() {
  const list = (await guard(() => backend.list('news'))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const rows = list.map((n) => {
    const sw = h('input', { type: 'checkbox', checked: n.published === true, 'aria-label': `在網站顯示「${n.title}」` });
    sw.addEventListener('change', async () => {
      try { await guard(() => backend.set('news', n.id, { published: sw.checked }), sw.checked ? '已發布' : '已隱藏'); } catch (e) { sw.checked = !sw.checked; }
    });
    return h('tr', {}, h('td', {}, n.date || ''), h('td', { class: 'a-name' }, h('strong', {}, n.title || '（無標題）'), n.pinned ? h('small', {}, '置頂') : null),
      h('td', {}, h('label', { class: 'a-switch' }, sw, '顯示')),
      h('td', {}, h('button', { class: 'btn btn-ghost a-sm', type: 'button', onclick: () => editNews(n) }, '編輯')));
  });
  view().replaceChildren(
    h('div', { class: 'a-bar' }, h('h2', {}, `消息（${list.length}）`), h('button', { class: 'btn btn-primary a-sm', type: 'button', onclick: () => editNews(null) }, '＋ 新增消息')),
    list.length ? h('div', { class: 'a-table-wrap' }, h('table', { class: 'a-table' },
      h('thead', {}, h('tr', {}, ...['日期', '標題', '網站', ''].map((t) => h('th', { scope: 'col' }, t)))), h('tbody', {}, rows)))
      : h('p', { class: 'a-empty' }, '還沒有消息。'));
}
function editNews(n) {
  const isNew = !n;
  n = n || { date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), published: true, pinned: false };
  const f = h('form', { class: 'a-form', novalidate: true });
  const err = h('p', { class: 'a-form-err', role: 'alert' });
  const pub = h('input', { type: 'checkbox', checked: n.published === true }), pin = h('input', { type: 'checkbox', checked: n.pinned === true });
  f.append(h('h2', {}, isNew ? '新增消息' : '編輯消息'),
    h('div', { class: 'grid-2' }, field('日期', h('input', { name: 'date', type: 'date', value: n.date || '' })), field('標題（必填）', h('input', { name: 'title', maxlength: 60, value: n.title || '' }))),
    field('內容', h('textarea', { name: 'body', rows: 5, maxlength: 1000 }, n.body || '')),
    field('連結（選填）', h('input', { name: 'link', type: 'url', maxlength: 300, value: n.link || '', placeholder: 'https://' }), '只接受 https:// 開頭的網址'),
    h('div', { class: 'a-checks' }, h('label', { class: 'a-switch' }, pub, '在網站顯示'), h('label', { class: 'a-switch' }, pin, '置頂')),
    err,
    h('div', { class: 'a-form-actions' },
      h('div', { class: 'cta-row' }, h('button', { class: 'btn btn-primary', type: 'submit' }, '儲存'), h('button', { class: 'btn btn-text', type: 'button', onclick: closeDialog }, '取消')),
      isNew ? null : h('button', { class: 'btn a-danger', type: 'button', onclick: async () => {
        if (!confirm(`確定刪除「${n.title}」？`)) return;
        await guard(() => backend.remove('news', n.id), '已刪除'); closeDialog(); renderNews();
      } }, '刪除')));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (k) => String(f.elements[k].value || '').trim();
    if (!v('title')) { err.textContent = '請填寫標題。'; return; }
    if (v('link') && !C.safeUrl(v('link'))) { err.textContent = '連結需要是 https:// 開頭的完整網址。'; return; }
    try {
      await guard(() => backend.set('news', n.id || null, { date: v('date'), title: v('title'), body: v('body'), link: v('link'), published: pub.checked, pinned: pin.checked, updatedAt: nowIso() }), '已儲存');
      closeDialog(); renderNews();
    } catch (e2) { err.textContent = '儲存失敗，請再試一次。'; }
  });
  openDialog(f);
}

/* ---------- 洽詢 ---------- */
const INQ_LABEL = { new: '新洽詢', doing: '處理中', replied: '已回覆', closed: '已結案' };
let inqFilter = 'open';
async function renderInquiries() {
  const all = (await guard(() => backend.list('inquiries'))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  updateNewCount(all);
  const list = all.filter((q) => inqFilter === 'all' || (inqFilter === 'open' ? q.status !== 'closed' : q.status === inqFilter));
  const old = all.filter((q) => Date.now() - new Date(q.createdAt).getTime() > 183 * 86400000);
  const cards = list.map((q) => {
    const st = h('select', { 'aria-label': '處理狀態' }, ...C.INQUIRY_STATUSES.map((s) => h('option', { value: s }, INQ_LABEL[s])));
    st.value = C.INQUIRY_STATUSES.includes(q.status) ? q.status : 'new';
    const note = h('input', { value: q.note || '', maxlength: 200, placeholder: '內部備註（訪客看不到）', 'aria-label': '內部備註' });
    const saveBtn = h('button', { class: 'btn btn-ghost a-sm', type: 'button', onclick: async () => {
      await guard(() => backend.set('inquiries', q.id, { status: st.value, note: note.value.trim(), updatedAt: nowIso() }), '已更新'); renderInquiries();
    } }, '更新');
    return h('article', { class: 'a-inq' + (q.status === 'new' ? ' is-new' : '') },
      h('div', { class: 'a-inq-top' }, h('span', {}, h('b', {}, q.type || '其他'), q.name ? `　${q.name}` : ''), h('span', {}, fmtTime(q.createdAt))),
      h('p', { style: 'margin:8px 0 0;font-size:14.5px' }, '聯絡方式：', h('strong', {}, q.contact || '')),
      h('pre', {}, q.message || ''),
      h('div', { class: 'a-inq-row' }, st, note, saveBtn,
        h('button', { class: 'btn a-danger a-sm', type: 'button', onclick: async () => {
          if (!confirm('確定刪除這則洽詢？刪除後無法復原。')) return;
          await guard(() => backend.remove('inquiries', q.id), '已刪除'); renderInquiries();
        } }, '刪除')));
  });
  const filt = h('select', { 'aria-label': '篩選洽詢', onchange: (e) => { inqFilter = e.target.value; renderInquiries(); } },
    h('option', { value: 'open' }, '未結案'), ...C.INQUIRY_STATUSES.map((s) => h('option', { value: s }, INQ_LABEL[s])), h('option', { value: 'all' }, '全部'));
  filt.value = inqFilter;
  view().replaceChildren(
    h('div', { class: 'a-bar' }, h('h2', {}, `洽詢（${list.length}）`), h('div', { class: 'a-actions a-inq-row' }, filt,
      old.length ? h('button', { class: 'btn a-danger a-sm', type: 'button', onclick: async () => {
        if (!confirm(`刪除 ${old.length} 則超過 6 個月的洽詢？`)) return;
        await guard(async () => { for (const q of old) await backend.remove('inquiries', q.id); }, '已刪除'); renderInquiries();
      } }, `刪除超過 6 個月的（${old.length}）`) : null)),
    h('p', { class: 'a-hint' }, '這裡是訪客的個人資料。隱私權說明承諾處理完成後 6 個月內刪除，請定期清理，且不要截圖外流。'),
    list.length ? h('div', { class: 'a-cards' }, cards) : h('p', { class: 'a-empty' }, '目前沒有符合的洽詢。'));
}
function updateNewCount(all) {
  const n = all.filter((q) => q.status === 'new').length, b = $('#a-new-count');
  b.hidden = !n; b.textContent = n;
}

/* ---------- 營業與服務狀態 ---------- */
const SERVICE_KEYS = ['處方箋與慢箋', '用藥諮詢', '保健食品', '居家醫材', '特寵寄宿', '飼養設備與耗材', '生態造景', '生物標本', '參觀預約'];
const INFO_KEYS = [['預計開幕日', '例如 2027 年 1 月 15 日'], ['全站公告', '顯示在網站最上方的一行字'], ['營業時間', ''], ['藥師服務時段', ''], ['二樓開放時段', ''], ['電話', ''], ['地址', ''],
  ['LINE連結', 'https:// 開頭'], ['Instagram連結', 'https:// 開頭'], ['Threads連結', 'https:// 開頭'], ['一樓經營主體', '登記完成後填寫'], ['二樓經營主體', '登記完成後填寫']];
async function renderSettings() {
  const doc = await guard(() => backend.get('settings', 'site'));
  const cur = { ...(CFG.defaults || {}), ...((doc && doc.values) || {}) };
  const f = h('form', { class: 'a-form', novalidate: true });
  const err = h('p', { class: 'a-form-err', role: 'alert' });
  const mkSel = (key, opts) => { const s = h('select', { name: key }, ...opts.map((o) => h('option', { value: o }, o))); s.value = opts.includes(cur[key]) ? cur[key] : opts[0]; return s; };
  f.append(
    h('div', { class: 'a-set-grid' }, h('h3', {}, '營業狀態'),
      field('營業狀態', mkSel('營業狀態', C.SITE_STATES), '改成「已開幕」後，全站的籌備提示會消失。請確認已取得必要許可再切換'),
      ...INFO_KEYS.map(([k, hint]) => field(k, h('input', { name: k, value: cur[k] || '', maxlength: 200, autocomplete: 'off' }), hint))),
    h('div', { class: 'a-set-grid' }, h('h3', {}, '各項服務狀態'),
      ...SERVICE_KEYS.map((k) => field(k, mkSel(k, ['規劃中', '洽詢中', '已啟用', '暫停'])))),
    err, h('button', { class: 'btn btn-primary', type: 'submit' }, '儲存設定'));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    ['營業狀態', ...INFO_KEYS.map((x) => x[0]), ...SERVICE_KEYS].forEach((k) => { values[k] = String(f.elements[k].value || '').trim(); });
    const bad = ['LINE連結', 'Instagram連結', 'Threads連結'].filter((k) => values[k] && !C.safeUrl(values[k]));
    if (bad.length) { err.textContent = bad.join('、') + ' 需要是 https:// 開頭的完整網址。'; return; }
    try { await guard(() => backend.set('settings', 'site', { values, updatedAt: nowIso() }), '已儲存，網站約 2 分鐘內更新'); err.textContent = ''; }
    catch (e2) { err.textContent = '儲存失敗，請再試一次。'; }
  });
  view().replaceChildren(h('div', { class: 'a-bar' }, h('h2', {}, '營業與服務狀態')), f);
}

/* ---------- 分頁與登入 ---------- */
const RENDER = { products: renderProducts, news: renderNews, inquiries: renderInquiries, settings: renderSettings };
async function show(t) {
  tab = t;
  document.querySelectorAll('.a-tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  view().replaceChildren(h('p', { class: 'a-empty' }, '載入中…'));
  try { await RENDER[t](); } catch (e) { view().replaceChildren(h('p', { class: 'a-empty' }, '載入失敗，請重新整理頁面再試一次。')); }
}

function gate(msg, ...actions) {
  $('#a-app').hidden = true; $('#a-gate').hidden = false;
  const m = $('#a-gate-msg'); m.replaceChildren(...(Array.isArray(msg) ? msg : [msg]));
  $('#a-gate-actions').replaceChildren(...actions);
}

async function start() {
  document.querySelectorAll('.a-tabs [role=tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  $('#a-dialog').addEventListener('click', (e) => { if (e.target === $('#a-dialog')) closeDialog(); });
  const demoBtn = h('a', { class: 'btn btn-ghost', href: 'admin.html?demo=1' }, '先看示範模式');

  if (DEMO) {
    backend = demoBackend();
    const b = $('#a-banner'); b.hidden = false;
    b.replaceChildren('示範模式：資料只存在這台瀏覽器，不會影響正式網站。 ',
      h('button', { class: 'btn btn-text a-sm', type: 'button', onclick: () => { backend.reset(); location.reload(); } }, '重設示範資料'));
  } else if (!HAS_FB) {
    gate('尚未連接 Firebase。請依「後台設定指南.md」建立專案，並把 projectId 與 apiKey 填進 config.js。', demoBtn);
    return;
  } else {
    try { backend = await (await import('./admin-firebase.js')).create(CFG.firebase); }
    catch (e) { console.error(e); gate('無法載入 Firebase，請檢查網路連線後重新整理。', demoBtn); return; }
  }

  $('#a-signout').addEventListener('click', () => backend.signOut());
  const signInBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
    try { await backend.signIn(); } catch (e) { toast('登入沒有完成，請再試一次（若瀏覽器擋了彈出視窗，請允許）'); }
  } }, DEMO ? '進入示範後台' : '使用 Google 帳號登入');

  backend.onAuth(({ user, admin }) => {
    $('#a-user').hidden = !user; $('#a-email').textContent = user ? user.email : '';
    if (!user) { gate(DEMO ? '這是示範模式，不需要帳號。' : '請用管理員的 Google 帳號登入。', signInBtn); return; }
    if (!admin) {
      gate([h('strong', {}, '這個帳號還不是管理員。'), h('p', {}, '請到 Firebase 控制台 → Firestore Database，建立集合 admins，文件 ID 填下面這串，內容可加一個欄位 note 寫上你的名字：'),
        h('code', {}, user.uid), h('p', {}, '建立後回到這裡重新整理。')],
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => location.reload() }, '重新整理'));
      return;
    }
    $('#a-gate').hidden = true; $('#a-app').hidden = false;
    show(tab);
    backend.list('inquiries').then(updateNewCount, () => {});
  });
}

window.__admin = { compressImage }; // 供測試使用
start();
