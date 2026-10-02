const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ]
});

const CHANNEL_ID = '1553814727401144393';
const DATA_FILE = 'messages.json';
let messages = [];

function loadMessages() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
      messages = [];
    }
  }
}

function saveMessages() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
}

loadMessages();

client.on('ready', async () => {
  console.log('\n✅ البوت متصل بنجاح!');
  console.log(`📱 متصل كـ: ${client.user.username}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    console.log(`📍 القناة: #${channel.name}`);

    console.log('📥 جاري تحميل الرسائل...');
    const history = await channel.messages.fetch({ limit: 100 });

    history.reverse().forEach(msg => {
      if (!messages.find(m => m.id === msg.id) && !msg.author.bot) {
        messages.push({
          id: msg.id,
          author: msg.author.username,
          avatar: msg.author.displayAvatarURL({ dynamic: true }),
          content: msg.content,
          timestamp: msg.createdTimestamp,
          attachments: msg.attachments.map(att => ({
            name: att.name,
            url: att.url
          }))
        });
      }
    });

    saveMessages();
    console.log(`✨ تم حفظ ${messages.length} رسالة\n`);

  } catch (error) {
    console.error('❌ خطأ:', error.message);
  }
});

client.on('messageCreate', (msg) => {
  if (msg.author.bot || msg.channelId !== CHANNEL_ID) return;
  if (messages.find(m => m.id === msg.id)) return;

  const newMessage = {
    id: msg.id,
    author: msg.author.username,
    avatar: msg.author.displayAvatarURL({ dynamic: true }),
    content: msg.content,
    timestamp: msg.createdTimestamp,
    attachments: msg.attachments.map(att => ({
      name: att.name,
      url: att.url
    }))
  };

  messages.unshift(newMessage);
  saveMessages();
  console.log(`✏️ رسالة جديدة من ${msg.author.username}`);
});

client.on('error', error => {
  console.error('❌ خطأ:', error);
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.get('/api/stats', (req, res) => {
  res.json({
    totalMessages: messages.length,
    totalAuthors: new Set(messages.map(m => m.author)).size,
    status: client.isReady() ? 'connected' : 'disconnected'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌐 الموقع: http://localhost:${PORT}`);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token);
