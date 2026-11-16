// 吉佳藥局官網｜雲端函式（選用，需要 Firebase Blaze 方案）
//  1) notifyInquiry：有新洽詢時，推播一則 LINE 訊息給門市
//  2) lineWebhook ：在 LINE 對官方帳號傳「ID」，會回覆這個聊天室的 ID（設定通知對象時用）
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { inquiryText, validSignature, sourceId } = require('./lib');

const LINE_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');
const LINE_SECRET = defineSecret('LINE_CHANNEL_SECRET');
const LINE_TARGET = defineString('LINE_TARGET_ID', { default: '' });   // 接收通知的 userId 或 groupId
const ADMIN_URL = defineString('ADMIN_URL', { default: '' });          // 例如 https://…github.io/jijia-pharmacy-web/admin.html
const REGION = 'asia-east1';

async function line(path, token, body) {
  const res = await fetch('https://api.line.me/v2/bot/message/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('LINE ' + path + ' ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

exports.notifyInquiry = onDocumentCreated(
  { document: 'inquiries/{id}', region: REGION, secrets: [LINE_TOKEN], retry: false },
  async (event) => {
    const data = event.data && event.data.data();
    const to = LINE_TARGET.value();
    if (!data) return;
    if (!to) { logger.warn('尚未設定 LINE_TARGET_ID，略過通知'); return; }
    try {
      await line('push', LINE_TOKEN.value(), { to, messages: [{ type: 'text', text: inquiryText(data, ADMIN_URL.value()) }] });
    } catch (e) {
      // 通知失敗不影響洽詢本身：資料已在後台，這裡只記錄錯誤
      logger.error('LINE 通知失敗', e.message);
    }
  }
);

exports.lineWebhook = onRequest(
  { region: REGION, secrets: [LINE_TOKEN, LINE_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    if (!validSignature(req.rawBody, LINE_SECRET.value(), req.get('x-line-signature'))) { res.status(401).end(); return; }
    const events = (req.body && req.body.events) || [];
    for (const ev of events) {
      const text = ev.type === 'message' && ev.message && ev.message.type === 'text' ? String(ev.message.text).trim().toUpperCase() : '';
      if (text !== 'ID' || !ev.replyToken) continue;
      try {
        await line('reply', LINE_TOKEN.value(), { replyToken: ev.replyToken, messages: [{ type: 'text', text: '這個聊天室的 ID：\n' + sourceId(ev.source) }] });
      } catch (e) { logger.error('LINE 回覆失敗', e.message); }
    }
    res.status(200).end();
  }
);
