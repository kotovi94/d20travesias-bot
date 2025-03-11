require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const fs = require('fs');
const { spawn } = require('child_process');



const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const queue = new Map();
const prefix = "!"; // Prefijo de comandos

client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const guildId = message.guild.id;
    const voiceChannel = message.member.voice.channel;

    if (command === 'play') {
        if (!voiceChannel) return message.reply('❌ Debes estar en un canal de voz.');
        if (!args[0]) return message.reply('❌ Debes proporcionar un enlace de YouTube.');

        const url = args[0].split("&")[0]; // ✅ Elimina parámetros extra (&list=...)
        let serverQueue = queue.get(guildId);

        if (!serverQueue) {
            serverQueue = {
                songs: [],
                connection: null,
                player: createAudioPlayer()
            };
            queue.set(guildId, serverQueue);
        }

        serverQueue.songs.push(url);

        if (!serverQueue.connection) {
            serverQueue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: message.guild.voiceAdapterCreator
            });

            serverQueue.connection.subscribe(serverQueue.player);
            playSong(guildId);
        }

        message.reply(`🎵 Añadido a la cola: ${url}`);
    }

    if (command === 'pause') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue || !serverQueue.player) return message.reply('❌ No hay música reproduciéndose.');
        
        serverQueue.player.pause();
        message.reply('⏸️ Canción pausada.');
    }

    if (command === 'resume') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue || !serverQueue.player) return message.reply('❌ No hay música pausada.');
        
        serverQueue.player.unpause();
        message.reply('▶️ Canción reanudada.');
    }

    if (command === 'skip') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue || !serverQueue.player) return message.reply('❌ No hay música en reproducción.');
        
        serverQueue.player.stop(); // Salta la canción
        message.reply('⏭️ Canción saltada.');
    }

    if (command === 'stop') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue) return message.reply('❌ No hay música en reproducción.');
        
        serverQueue.songs = [];
        serverQueue.player.stop();

        if (serverQueue.connection) {
            serverQueue.connection.destroy(); // Sale del canal de voz
            queue.delete(guildId);
        }

        message.reply('🛑 Música detenida y cola vaciada.');
    }

    if (command === 'queue') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue || serverQueue.songs.length === 0) return message.reply('📭 La cola está vacía.');
        
        const songList = serverQueue.songs.map((song, index) => `${index + 1}. ${song}`).join('\n');
        message.reply(`🎶 **Cola de reproducción:**\n${songList}`);
    }
});

async function playSong(guildId) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const songUrl = serverQueue.songs.shift();

    try {
        // ✅ Corrige la reproducción de streaming con yt-dlp
        const process = spawn('yt-dlp', [
            '-f', 'bestaudio',
            '--no-playlist',
            '-o', '-',
            songUrl
        ], { stdio: ['ignore', 'pipe', 'ignore'] });

        const resource = createAudioResource(process.stdout);
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            process.kill(); // ✅ Cierra el proceso yt-dlp cuando termine la canción
            playSong(guildId);
        });

    } catch (error) {
        console.error(`❌ Error al reproducir la canción: ${error.message}`);
    }
}
client.login(process.env.TOKEN);
