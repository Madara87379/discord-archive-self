const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = process.env.CHANNEL_ID || '1553814727401144393';
const DATA_FILE = 'messages.json';
const MAX_HISTORY = 500;

const client = new Client({ checkUpdate: false });
let messages = [];

// تحميل البيانات المحفوظة
try {
  if (fs.existsSync(DATA_FILE)) {
    messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
} catch (e) {
  console.error('Error loading JSON file:', e.message);
  messages = [];
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
  } catch (e) {
    console.error('Error saving messages:', e.message);
  }
}

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

client.on('ready', async () => {
  console.log('Connected as', client.user.username);
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error('Channel not found or bot lacks permission.');
      return;
    }
    let before;
    let fetched = 0;
    while (fetched < MAX_HISTORY) {
      const batch = await channel.messages.fetch({ limit: 100, before });
      if (batch.size === 0) break;
      batch.forEach(m => {
        if (!messages.find(x => x.id === m.id)) messages.push(toRecord(m));
      });
      fetched += batch.size;
      before = batch.last().id;
    }
    messages.sort((a, b) => b.timestamp - a.timestamp);
    save();
    console.log('Loaded', messages.length, 'messages');
  } catch (err) {
    console.error('History fetch error:', err.message);
  }
});

client.on('messageCreate', msg => {
  if (msg.channelId !== CHANNEL_ID) return;
  if (messages.find(x => x.id === msg.id)) return;
  messages.unshift(toRecord(msg));
  save();
});

client.on('messageUpdate', (oldMsg, newMsg) => {
  if (newMsg.channelId !== CHANNEL_ID) return;
  const m = messages.find(x => x.id === newMsg.id);
  if (m && newMsg.content != null) {
    m.content = newMsg.content;
    save();
  }
});

client.on('messageDelete', msg => {
  if (msg.channelId !== CHANNEL_ID) return;
  messages = messages.filter(x => x.id !== msg.id);
  save();
});

const app = express();

// إتاحة مجلد public إذا أردت استخدامه لاحقاً
app.use(express.static('public'));

// مسارات الـ API
app.get('/api/messages', (req, res) => res.json(messages));

app.get('/api/stats', (req, res) => {
  res.json({
    totalMessages: messages.length,
    totalAuthors: new Set(messages.map(m => m.author)).size,
    status: client.isReady() ? 'connected' : 'disconnected'
  });
});

// المسار الرئيسي للواجهة مباشرة لمنع مشكلة الشاشة الزرقاء
app.get('/', (req, res) => {
  // إذا كان هناك ملف index.html في public سيتم استخدامه، وإلا يعرض الصفحة المدمجة
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Discord Archive Dashboard</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
        .card { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 500px; width: 100%; }
        h1 { color: #38bdf8; margin-bottom: 10px; font-size: 24px; }
        .status { font-weight: bold; padding: 6px 12px; border-radius: 20px; display: inline-block; margin-top: 15px; }
        .online { background: #166534; color: #4ade80; }
        .offline { background: #991b1b; color: #fca5a5; }
        .stat-box { margin-top: 20px; text-align: left; background: #0f172a; padding: 15px; border-radius: 8px; }
        a { color: #38bdf8; text-decoration: none; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Discord Archive Status</h1>
        <p>البوت يعمل ويقوم بأرشفة الرسائل بنجاح.</p>
        <div class="status ${client.isReady() ? 'online' : 'offline'}">
          الحالة: ${client.isReady() ? 'متصل (Online)' : 'جاري الاتصال...'}
        </div>
        <div class="stat-box">
          <p>📌 <strong>الرسائل المؤرشفة:</strong> ${messages.length}</p>
          <p>🔗 <strong>مسار API الرسائل:</strong> <a href="/api/messages" target="_blank">/api/messages</a></p>
          <p>📊 <strong>مسار الإحصائيات:</strong> <a href="/api/stats" target="_blank">/api/stats</a></p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ضبط المنفذ لاستقبال طلبات Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web server listening on port ${PORT}`);
});

// تسجيل الدخول بالتوكن
const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('CRITICAL: DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('Failed to log in to Discord:', err.message);
});
