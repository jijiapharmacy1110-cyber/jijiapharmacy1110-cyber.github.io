// 純函式：方便單獨測試，不依賴 Firebase 或網路
const crypto = require('crypto');

// LINE 通知文字：刻意不放訪客的聯絡方式，要看完整內容請登入後台
function inquiryText(d, adminUrl) {
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const lines = ['【吉佳官網】新洽詢', '類型：' + clip(d.type || '其他', 20)];
  if (d.name) lines.push('稱呼：' + clip(d.name, 40));
  if (d.item) lines.push('項目：' + clip(d.item, 60));
  lines.push('內容：' + clip(d.message, 120));
  lines.push('聯絡方式與完整內容請登入後台查看' + (adminUrl ? '：\n' + adminUrl : '。'));
  return lines.join('\n');
}

// 驗證 LINE webhook 簽章（HMAC-SHA256，base64）
function validSignature(rawBody, channelSecret, signature) {
  if (!rawBody || !channelSecret || !signature) return false;
  const expect = crypto.createHmac('sha256', channelSecret).update(rawBody).digest();
  let got;
  try { got = Buffer.from(String(signature), 'base64'); } catch (e) { return false; }
  return got.length === expect.length && crypto.timingSafeEqual(got, expect);
}

function sourceId(source) {
  if (!source) return '';
  return source.groupId || source.roomId || source.userId || '';
}

module.exports = { inquiryText, validSignature, sourceId };
