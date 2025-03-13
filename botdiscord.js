require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
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
    let serverQueue = queue.get(guildId);

    // Comando !join (el bot entra al canal de voz)
    if (command === 'join') {
        if (!voiceChannel) return message.reply('❌ Debes estar en un canal de voz.');

        if (!serverQueue) {
            serverQueue = {
                songs: [],
                connection: joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: message.guild.voiceAdapterCreator
                }),
                player: createAudioPlayer()
            };
            queue.set(guildId, serverQueue);
            serverQueue.connection.subscribe(serverQueue.player);
        }

        message.reply('🔊 Me he unido al canal de voz.');
    }

    // Comando !play (agregar canciones en loop)
    if (command === 'play') {
        if (!serverQueue || !serverQueue.connection) return message.reply('❌ Usa `!join` primero para que el bot entre al canal.');
        if (!args[0]) return message.reply('❌ Debes proporcionar un enlace de YouTube.');

        const url = args[0].split("&")[0]; // ✅ Elimina parámetros extra (&list=...)
        serverQueue.songs.push(url); // ✅ Agrega la canción a la cola

        if (serverQueue.player.state.status !== AudioPlayerStatus.Playing) {
            playSong(guildId);
        }

        message.reply('🎵 Canción añadida a la cola en loop.');
    }

    // Comando !pause (pausar la canción)
    if (command === 'pause') {
        if (!serverQueue || !serverQueue.player) return message.reply('❌ No hay música reproduciéndose.');
        serverQueue.player.pause();
        message.reply('⏸️ Canción pausada.');
    }

    // Comando !resume (reanudar la canción)
    if (command === 'resume') {
        if (!serverQueue || !serverQueue.player) return message.reply('❌ No hay música pausada.');
        serverQueue.player.unpause();
        message.reply('▶️ Canción reanudada.');
    }

    // Comando !skip (saltar canción)
    if (command === 'skip') {
        if (!serverQueue || !serverQueue.player) return message.reply('❌ No hay música en reproducción.');
        serverQueue.player.stop(); // Salta la canción
        message.reply('⏭️ Canción saltada.');
    }

    // Comando !stop (detener y salir del canal)
    if (command === 'stop') {
        if (!serverQueue) return message.reply('❌ No hay música en reproducción.');
        
        serverQueue.songs = [];
        serverQueue.player.stop();

        if (serverQueue.connection) {
            serverQueue.connection.destroy(); // Sale del canal de voz
            queue.delete(guildId);
        }

        message.reply('🛑 Música detenida y bot desconectado.');
    }

    // Comando !queue (mostrar cola de canciones)
    if (command === 'queue') {
        if (!serverQueue || serverQueue.songs.length === 0) return message.reply('📭 La cola está vacía.');
        
        const songList = serverQueue.songs.map((song, index) => `${index + 1}. ${song}`).join('\n');
        message.reply(`🎶 **Cola de reproducción (Loop activado):**\n${songList}`);
    }
});

// 🔄 Función para reproducir canciones en loop
async function playSong(guildId) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const songUrl = serverQueue.songs[0]; // 🔁 Toma la primera canción sin eliminarla

    try {
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
            playSong(guildId); // 🔄 Reproduce la canción de nuevo
        });

        serverQueue.player.on('error', error => {
            console.error(`⚠️ Error en el reproductor: ${error.message}`);
            playSong(guildId);
        });

    } catch (error) {
        console.error(`❌ Error al reproducir la canción: ${error.message}`);
    }
}

client.login(process.env.TOKEN);
