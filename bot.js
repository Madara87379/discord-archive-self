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
