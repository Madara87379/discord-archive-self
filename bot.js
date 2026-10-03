const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = (process.env.CHANNEL_ID || '1553814727401144393').trim();
const DATA_FILE = 'messages.json';

const client = new Client({ checkUpdate: false, retryLimit: 5 });
let modsList = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// تحميل البيانات المحفوظة محلياً
try {
  if (fs.existsSync(DATA_FILE)) {
    modsList = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
} catch (e) {
  console.error('Error loading JSON:', e.message);
  modsList = [];
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(modsList, null, 2));
  } catch (e) {
    console.error('Error saving JSON:', e.message);
  }
}

// جلب منشورات المودات من قناة المنتدى (Forum Channel)
client.on('ready', async () => {
  console.log('Connected successfully as:', client.user.username);
  
  try {
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);

    if (!channel) {
      console.error(`CRITICAL: Forum channel ${CHANNEL_ID} not found! Check account access.`);
      return;
    }

    console.log(`Connected to Forum Channel: ${channel.name}`);

    // جلب المواضيع المفتوحة والقديمة في المنتدى (Active & Archived Threads)
    let threads = [];
    
    // 1. جلب المواضيع النشطة
    const activeThreads = await channel.threads.fetchActive().catch(() => null);
    if (activeThreads && activeThreads.threads) {
      threads.push(...activeThreads.threads.values());
    }

    // 2. جلب المواضيع المؤرشفة القديمة
    const archivedThreads = await channel.threads.fetchArchived({ limit: 100 }).catch(() => null);
    if (archivedThreads && archivedThreads.threads) {
      threads.push(...archivedThreads.threads.values());
    }

    console.log(`Found ${threads.length} mod posts/threads in this forum.`);

    for (const thread of threads) {
      // تجنب التكرار إذا كان المود مأرشف سابقاً
      if (modsList.find(x => x.id === thread.id)) continue;

      // جلب أول رسالة داخل موضوع المود (التي تحتوي التفاصيل والتحميل)
      const firstMessage = await thread.messages.fetchStarterMessage().catch(() => null);

      if (firstMessage) {
        modsList.push({
          id: thread.id,
          title: thread.name,
          author: firstMessage.author ? firstMessage.author.username : 'Unknown',
          avatar: firstMessage.author ? firstMessage.author.displayAvatarURL() : '',
          content: firstMessage.content || '',
          timestamp: thread.createdTimestamp,
          attachments: firstMessage.attachments ? [...firstMessage.attachments.values()].map(a => ({
            name: a.name,
            url: a.url
          })) : []
        });
        console.log(`Archived Mod: ${thread.name}`);
      }

      save();
      await sleep(1500); // تأخير لحماية الحساب من حظر الطلبات
    }

    modsList.sort((a, b) => b.timestamp - a.timestamp);
    save();
    console.log('Successfully archived total:', modsList.length, 'mods!');
  } catch (err) {
    console.error('Forum fetch error:', err.message);
  }
});

// الاستماع لأي مود جديد ينشر في المنتدى
client.on('threadCreate', async (thread) => {
  if (thread.parentId !== CHANNEL_ID) return;
  await sleep(2000);
  const firstMessage = await thread.messages.fetchStarterMessage().catch(() => null);
  
  if (firstMessage && !modsList.find(x => x.id === thread.id)) {
    modsList.unshift({
      id: thread.id,
      title: thread.name,
      author: firstMessage.author ? firstMessage.author.username : 'Unknown',
      avatar: firstMessage.author ? firstMessage.author.displayAvatarURL() : '',
      content: firstMessage.content || '',
      timestamp: thread.createdTimestamp,
      attachments: firstMessage.attachments ? [...firstMessage.attachments.values()].map(a => ({
        name: a.name,
        url: a.url
      })) : []
    });
    save();
    console.log(`New Mod Archived: ${thread.name}`);
  }
});

// سيرفر الويب Express
const app = express();
app.use(express.static('public'));

app.get('/api/messages', (req, res) => res.json(modsList));

app.get('/api/stats', (req, res) => {
  res.json({
    totalMods: modsList.length,
    status: client.isReady() ? 'connected' : 'disconnected'
  });
});

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>أرشيف المودات</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 50px; }
        a { color: #38bdf8; text-decoration: none; font-weight: bold; }
        .card { background: #1e293b; padding: 20px; border-radius: 10px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>أرشيف مودات الديسكورد</h1>
        <p>حالة الاتصال: <strong>${client.isReady() ? 'connected' : 'disconnected'}</strong></p>
        <p>عدد المودات المأرشفة حالياً: <strong>${modsList.length}</strong></p>
        <p><a href="/api/messages" target="_blank">عرض ملف بيانات المودات JSON</a></p>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));

const token = (process.env.DISCORD_TOKEN || '').trim();
if (token) {
  client.login(token).catch(err => console.error('Login error:', err.message));
}
