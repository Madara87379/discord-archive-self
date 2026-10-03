const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
const fs = require('fs');
const path = require('path');

// إعدادات القناة والحد الأقصى للرسائل القديمة
const CHANNEL_ID = process.env.CHANNEL_ID || '1553814727401144393';
const DATA_FILE = 'messages.json';
const MAX_HISTORY = 2000; // تم زيادة حد جلب الرسائل القديمة إلى 2000

const client = new Client({ checkUpdate: false });
let messages = [];

// دالة تأخير زمني بالملي ثانية لتفادي حظر ديسكورد (Rate Limit)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// قراءة البيانات المحفوظة محلياً إن وجدت
try {
  if (fs.existsSync(DATA_FILE)) {
    messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
} catch (e) {
  console.error('Error loading JSON file:', e.message);
  messages = [];
}

// حفظ الرسائل في ملف محلي
function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
  } catch (e) {
    console.error('Error saving messages:', e.message);
  }
}

// تحويل كائن الرسالة إلى صيغة مبسطة للأرشيف
function toRecord(msg) {
  return {
    id: msg.id,
    author: msg.author ? msg.author.username : 'Unknown',
    avatar: msg.author ? msg.author.displayAvatarURL() : '',
    content: msg.content || '',
    timestamp: msg.createdTimestamp,
    attachments: msg.attachments ? [...msg.attachments.values()].map(a => ({
      name: a.name,
      url: a.url
    })) : []
  };
}

// دالة جلب الأرشيف والرسائل القديمة فور بدء تشغيل البوت
client.on('ready', async () => {
  console.log('Connected successfully as:', client.user.username);
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error('Channel not found! Check CHANNEL_ID or permissions.');
      return;
    }

    let before;
    let fetched = 0;
    console.log('Starting fetch of historical messages...');

    while (fetched < MAX_HISTORY) {
      const batch = await channel.messages.fetch({ limit: 100, before });
      if (batch.size === 0) break;

      batch.forEach(m => {
        if (!messages.find(x => x.id === m.id)) messages.push(toRecord(m));
      });

      fetched += batch.size;
      before = batch.last().id;
      console.log(`Fetched ${fetched} historical messages so far...`);

      // تأخير ثانيتين بين كل دفعة لحماية الحساب من التقييد وجلب الأرشيف كاملاً
      await sleep(2000);
    }

    messages.sort((a, b) => b.timestamp - a.timestamp);
    save();
    console.log('Successfully loaded total:', messages.length, 'messages');
  } catch (err) {
    console.error('History fetch error:', err.message);
  }
});

// استقبال واستماع الرسائل الجديدة مباشرة
client.on('messageCreate', msg => {
  if (msg.channelId !== CHANNEL_ID) return;
  if (messages.find(x => x.id === msg.id)) return;
  messages.unshift(toRecord(msg));
  save();
});

// تحديث الرسائل المعدلة
client.on('messageUpdate', (oldMsg, newMsg) => {
  if (newMsg.channelId !== CHANNEL_ID) return;
  const m = messages.find(x => x.id === newMsg.id);
  if (m && newMsg.content != null) {
    m.content = newMsg.content;
    save();
  }
});

// حذف الرسائل المحذوفة من الأرشيف
client.on('messageDelete', msg => {
  if (msg.channelId !== CHANNEL_ID) return;
  messages = messages.filter(x => x.id !== msg.id);
  save();
});

// إعداد سيرفر الويب Express
const app = express();
app.use(express.static('public'));

// مسارات الـ API للحصول على البيانات بصيغة JSON
app.get('/api/messages', (req, res) => res.json(messages));

app.get('/api/stats', (req, res) => {
  res.json({
    totalMessages: messages.length,
    totalAuthors: new Set(messages.map(m => m.author)).size,
    status: client.isReady() ? 'connected' : 'disconnected'
  });
});

// الواجهة الرئيسية لتفادي ظهور الشاشة الزرقاء عرض محتوى الأرشيف
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Discord Archive Dashboard</title>
      <style>
        body { font-family: system-ui, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .card { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 500px; width: 100%; text-align: center; }
        h1 { color: #38bdf8; font-size: 22px; margin-bottom: 10px; }
        .status { padding: 6px 12px; border-radius: 20px; display: inline-block; font-weight: bold; margin-top: 10px; font-size: 14px; }
        .online { background: #166534; color: #4ade80; }
        .offline { background: #991b1b; color: #fca5a5; }
        .stat-box { margin-top: 20px; text-align: right; background: #0f172a; padding: 15px; border-radius: 8px; line-height: 1.8; }
        a { color: #38bdf8; text-decoration: none; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>أرشيف رسائل الديسكورد</h1>
        <p>البوت يعمل بنجاح ويقوم بأرشفة الرسائل القديمة والجديدة.</p>
        <div class="status ${client.isReady() ? 'online' : 'offline'}">
          الحالة: ${client.isReady() ? 'متصل وجاري الأرشفة' : 'جاري الاتصال...'}
        </div>
        <div class="stat-box">
          <p>📌 <strong>عدد الرسائل الحالية:</strong> ${messages.length}</p>
          <p>🔗 <strong>مسار الرسائل (JSON):</strong> <a href="/api/messages" target="_blank">/api/messages</a></p>
          <p>📊 <strong>إحصائيات النظام:</strong> <a href="/api/stats" target="_blank">/api/stats</a></p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// استماع السيرفر على منفذ Railway المخصص
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web server running on port ${PORT}`);
});

// قراءة التوكن وتسجيل الدخول
const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('CRITICAL ERROR: DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('Failed to log in to Discord:', err.message);
});
