/* 吉佳藥局官網｜核心資料處理（純函式，無 DOM）
   負責：解析試算表 CSV、整理欄位、套用「顯示／審核／法規防呆」規則。
   這個檔案可以在瀏覽器與 Node 測試中共用。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JijiaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], field = '', i = 0, quoted = false;
    while (i < text.length) {
      var c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { quoted = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (s) { return String(s).trim(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (k, i) { if (k) o[k] = String(r[i] == null ? '' : r[i]).trim(); });
      return o;
    });
  }

  function settingsFromRows(rows) {
    var out = {};
    rowsToObjects(rows).forEach(function (o) {
      var key = o['項目'];
      if (key && o['值'] !== undefined && o['值'] !== '') out[key] = o['值'];
    });
    return out;
  }

  /* ---------- 欄位正規化 ---------- */
  var STATUSES = ['已啟用', '洽詢中', '規劃中', '暫停'];
  var SITE_STATES = ['籌備中', '已開幕', '暫停營業'];

  function yes(v) {
    return /^(是|y|yes|true|1|✓|✔|v|顯示|已審核|ok)$/i.test(String(v == null ? '' : v).trim());
  }
  function status(v) {
    v = String(v == null ? '' : v).trim();
    return STATUSES.indexOf(v) >= 0 ? v : '';
  }
  function siteState(v) {
    v = String(v == null ? '' : v).trim();
    return SITE_STATES.indexOf(v) >= 0 ? v : '';
  }
  function floor(v) {
    v = String(v == null ? '' : v).trim().toUpperCase();
    if (/^(1F|1|一樓|1樓)$/.test(v)) return '1F';
    if (/^(2F|2|二樓|2樓)$/.test(v)) return '2F';
    return '';
  }

  /* 只允許 https:// 網址（或站內相對路徑），避免 javascript: 之類的連結 */
  function safeUrl(v, opts) {
    v = String(v == null ? '' : v).trim();
    if (!v) return '';
    opts = opts || {};
    if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
    if (opts.allowHttpLocal && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(v)) return v;
    if (opts.allowRelative && /^[A-Za-z0-9_\-][A-Za-z0-9_\-./%]*$/.test(v) && v.indexOf('..') < 0) return v;
    return '';
  }

  /* 商品圖片：https 網址，或放在 assets/products/ 的檔名 */
  function imageSrc(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return '';
    if (/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+\/=]+$/.test(v)) return v; // 後台上傳的壓縮圖
    if (/^https:\/\//i.test(v)) return safeUrl(v);
    var rel = safeUrl(v, { allowRelative: true });
    if (!rel) return '';
    return /^assets\//.test(rel) ? rel : 'assets/products/' + rel;
  }

  function priceText(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return '';
    if (/^\d+(\.\d+)?$/.test(v)) return 'NT$ ' + Number(v).toLocaleString('en-US');
    return v.slice(0, 30);
  }

  function telHref(phone) {
    var d = String(phone || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.indexOf('+') === 0) return 'tel:' + d;
    if (d.indexOf('0') === 0) return 'tel:+886' + d.slice(1);
    return 'tel:' + d;
  }

  function mapsHref(addr) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr || '');
  }

  /* ---------- 法規防呆（對應企劃書第 9 章） ---------- */
  // 藥品／處方：不可作為商品目錄項目展示（避免被視為藥品網購或藥物廣告）
  var DRUG_PATTERN = /(處方|成藥|西藥|指示藥|管制藥|藥品|藥物|醫師開立)/;
  // 疑似醫療效能或誇大宣稱：公開頁面不顯示，預覽模式標紅提示
  var CLAIM_TERMS = ['治療', '治癒', '根治', '療效', '神效', '特效', '包治', '抗癌', '防癌',
    '降血壓', '降血糖', '降血脂', '降膽固醇', '三高', '消炎', '退燒', '保證有效', '100%有效'];

  function findClaims(texts) {
    var hit = [];
    var joined = texts.join('\n');
    CLAIM_TERMS.forEach(function (t) { if (joined.indexOf(t) >= 0) hit.push(t); });
    return hit;
  }

  function normalizeProduct(raw, index) {
    var p = {
      id: raw['編號'] || ('item-' + (index + 1)),
      show: yes(raw['顯示']),
      reviewed: yes(raw['已審核']),
      floor: floor(raw['樓層']),
      category: raw['類別'] || '其他',
      name: raw['名稱'] || '',
      brand: raw['品牌'] || '',
      summary: raw['簡介'] || '',
      spec: raw['規格'] || '',
      species: (raw['適用物種'] || '').split(/[、,，;；\/]+/).map(function (s) { return s.trim(); }).filter(Boolean),
      status: status(raw['狀態']),
      price: priceText(raw['價格']),
      image: imageSrc(raw['圖片']),
      featured: yes(raw['精選']),
      order: isFinite(parseFloat(raw['排序'])) ? parseFloat(raw['排序']) : 9999,
      notice: raw['注意事項'] || '',
      index: index
    };
    p.issues = [];
    if (!p.name) p.issues.push('缺少名稱');
    if (!p.show) p.issues.push('顯示欄為「否」');
    if (!p.reviewed) p.issues.push('尚未審核（已審核欄不是「是」）');
    if (DRUG_PATTERN.test(p.category + ' ' + p.name)) p.issues.push('類別／名稱含藥品相關字詞，不可列入商品目錄');
    var claims = findClaims([p.name, p.brand, p.summary, p.spec, p.notice]);
    if (claims.length) p.issues.push('文案含疑似醫療效能字詞：' + claims.join('、'));
    p.publishable = !p.issues.length;
    return p;
  }

  function sortProducts(list) {
    return list.slice().sort(function (a, b) {
      return (a.order - b.order) || (a.index - b.index);
    });
  }

  function normalizeNews(raw, index) {
    var date = raw['日期'] || '';
    var n = {
      date: date,
      show: yes(raw['顯示']),
      pinned: yes(raw['置頂']),
      title: raw['標題'] || '',
      body: raw['內容'] || '',
      link: safeUrl(raw['連結']),
      index: index
    };
    n.publishable = n.show && !!n.title;
    return n;
  }

  function sortNews(list) {
    return list.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.index - b.index;
    });
  }

  /* ---------- Firestore（REST 格式）與後台文件 ---------- */
  function fsDecodeValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return fsDecode(v.mapValue.fields);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDecodeValue);
    return null;
  }
  function fsDecode(fields) {
    var o = {};
    Object.keys(fields || {}).forEach(function (k) { o[k] = fsDecodeValue(fields[k]); });
    return o;
  }
  function fsEncode(obj) {
    var f = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null || v === '') return;
      if (v instanceof Date) f[k] = { timestampValue: v.toISOString() };
      else if (typeof v === 'boolean') f[k] = { booleanValue: v };
      else if (typeof v === 'number') f[k] = { doubleValue: v };
      else f[k] = { stringValue: String(v) };
    });
    return f;
  }
  function docId(name) { return String(name || '').split('/').pop(); }
  function str(v) { return v == null ? '' : String(v); }

  /* 後台商品文件 ⇄ 與試算表相同的欄位，讓前台只需要一套顯示邏輯 */
  function productDocToRaw(d, id) {
    var pub = d.published === true ? '是' : '否';
    return {
      '編號': str(d.code), '顯示': pub, '已審核': pub, '樓層': str(d.floor), '類別': str(d.category),
      '名稱': str(d.name), '品牌': str(d.brand), '簡介': str(d.summary), '規格': str(d.spec),
      '適用物種': str(d.species), '狀態': str(d.status), '價格': str(d.price), '圖片': str(d.imageUrl),
      '精選': d.featured === true ? '是' : '', '排序': d.order == null ? '' : str(d.order), '注意事項': str(d.notice),
      _id: id || '', _hasImage: d.hasImage === true
    };
  }
  function productRawToDoc(raw) {
    var order = parseFloat(raw['排序']);
    return {
      code: str(raw['編號']), published: yes(raw['顯示']) && yes(raw['已審核']), floor: floor(raw['樓層']),
      category: str(raw['類別']), name: str(raw['名稱']), brand: str(raw['品牌']), summary: str(raw['簡介']),
      spec: str(raw['規格']), species: str(raw['適用物種']), status: status(raw['狀態']), price: str(raw['價格']),
      imageUrl: str(raw['圖片']), featured: yes(raw['精選']), order: isFinite(order) ? order : 9999,
      notice: str(raw['注意事項']), hasImage: false
    };
  }
  /* 只回傳「內容」問題（藥品字詞、醫療效能字詞、缺名稱），不含顯示開關 */
  function contentIssues(doc) {
    var p = normalizeProduct(productDocToRaw(Object.assign({}, doc, { published: true })), 0);
    return p.issues;
  }
  function newsDocToRaw(d) {
    return { '日期': str(d.date), '顯示': d.published === true ? '是' : '否', '置頂': d.pinned === true ? '是' : '',
      '標題': str(d.title), '內容': str(d.body), '連結': str(d.link) };
  }

  /* ---------- 線上洽詢 ---------- */
  var INQUIRY_TYPES = ['寄宿', '商品', '造景與標本', '參觀', '其他'];
  var INQUIRY_STATUSES = ['new', 'doing', 'replied', 'closed'];
  function inquiryErrors(q) {
    var e = [];
    if (INQUIRY_TYPES.indexOf(q.type) < 0) e.push('請選擇洽詢類型。');
    if (!str(q.contact).trim()) e.push('請填寫聯絡方式，我們才能回覆你。');
    else if (str(q.contact).length > 80) e.push('聯絡方式請在 80 字以內。');
    if (!str(q.message).trim()) e.push('請填寫洽詢內容。');
    else if (str(q.message).length > 2000) e.push('洽詢內容請在 2000 字以內。');
    if (str(q.name).length > 40) e.push('稱呼請在 40 字以內。');
    if (q.consent !== true) e.push('請先勾選同意個人資料使用說明。');
    return e;
  }
  function inquiryDoc(q, now) {
    return {
      type: q.type, name: str(q.name).trim(), contact: str(q.contact).trim(), message: str(q.message).trim(),
      item: str(q.item).trim().slice(0, 120), consent: true, status: 'new', createdAt: now || new Date()
    };
  }

  return {
    fsDecode: fsDecode, fsEncode: fsEncode, docId: docId,
    productDocToRaw: productDocToRaw, productRawToDoc: productRawToDoc, contentIssues: contentIssues, newsDocToRaw: newsDocToRaw,
    INQUIRY_TYPES: INQUIRY_TYPES, INQUIRY_STATUSES: INQUIRY_STATUSES, inquiryErrors: inquiryErrors, inquiryDoc: inquiryDoc,
    parseCSV: parseCSV, rowsToObjects: rowsToObjects, settingsFromRows: settingsFromRows,
    yes: yes, status: status, siteState: siteState, floor: floor,
    safeUrl: safeUrl, imageSrc: imageSrc, priceText: priceText, telHref: telHref, mapsHref: mapsHref,
    findClaims: findClaims, normalizeProduct: normalizeProduct, sortProducts: sortProducts,
    normalizeNews: normalizeNews, sortNews: sortNews,
    STATUSES: STATUSES, SITE_STATES: SITE_STATES, DRUG_PATTERN: DRUG_PATTERN
  };
});
