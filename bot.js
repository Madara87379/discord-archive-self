const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1553814727401144393';
const DATA_FILE = 'messages.json';
const MAX_HISTORY = 500;

const client = new Client({ checkUpdate: false });
let messages = [];

try {
  if (fs.existsSync(DATA_FILE)) {
    messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
} catch (e) {
  messages = [];
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages));
}

function toRecord(msg) {
  return {
    id: msg.id,
    author: msg.author.username,
    avatar: msg.author.displayAvatarURL(),
    content: msg.content,
    timestamp: msg.createdTimestamp,
    attachments: [...msg.attachments.values()].map(a => ({
      name: a.name,
      url: a.url
    }))
  };
}

client.on('ready', async () => {
  console.log('Connected as', client.user.username);
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
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
    console.error('History error:', err.message);
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
app.use(express.static('public'));

app.get('/api/messages', (req, res) => res.json(messages));

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

app.listen(process.env.PORT || 3000, () => console.log('Web server running'));

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('DISCORD_TOKEN missing');
  process.exit(1);
}
client.login(token);
