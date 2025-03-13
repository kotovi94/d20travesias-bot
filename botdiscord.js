require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const prefix = "!";
const queue = new Map(); // 🎵 Cola de reproducción global

// 📡 Canal de YouTube y Discord para Shorts
const DISCORD_CHANNEL_ID = "1181358348726186015"; 
const YOUTUBE_CHANNEL_ID = "UCi61VqIS3WlPOhcBbmps7Sg";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 horas

// 📂 Almacenamiento temporal de Shorts
const SHORTS_FILE = path.join(__dirname, 'shorts_temp.json');
let postedVideos = new Set();

// 📂 Cargar Shorts guardados
if (fs.existsSync(SHORTS_FILE)) {
    postedVideos = new Set(JSON.parse(fs.readFileSync(SHORTS_FILE, 'utf8')));
}

// 📌 Limpiar Shorts antiguos
function cleanOldShorts() {
    postedVideos.clear();
    fs.writeFileSync(SHORTS_FILE, JSON.stringify([...postedVideos]), 'utf8');
    console.log("🗑️ Se han eliminado los Shorts antiguos.");
}

// 🔍 Revisar nuevos Shorts en YouTube
async function checkForNewShorts(client) {
    try {
        console.log("🔍 Buscando nuevos Shorts de Doble 20...");

        const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${YOUTUBE_CHANNEL_ID}&part=snippet,id&order=date&maxResults=10`;
        const response = await axios.get(url);

        if (!response.data.items || response.data.items.length === 0) {
            console.log("⏳ No hay nuevos Shorts en las últimas 24 horas.");
            return;
        }

        const shorts = response.data.items.filter(video => video.id.videoId && video.snippet.title.toLowerCase().includes("short"));

        if (shorts.length === 0) {
            console.log("⏳ No hay nuevos Shorts en las últimas 24 horas.");
            return;
        }

        const discordChannel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (!discordChannel) {
            console.error("⚠️ No se pudo encontrar el canal de Discord.");
            return;
        }

        for (const short of shorts) {
            const videoId = short.id.videoId;
            if (postedVideos.has(videoId)) continue;

            const videoTitle = short.snippet.title;
            const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

            await discordChannel.send(`📺 **¡Nuevo Short de D&D en Doble 20!** 🎲✨\n📜 **${videoTitle}**\n🔗 ${videoUrl}`);

            postedVideos.add(videoId);
        }

        fs.writeFileSync(SHORTS_FILE, JSON.stringify([...postedVideos]), 'utf8');

        console.log(`✅ Se han publicado ${shorts.length} Shorts en Discord.`);

    } catch (error) {
        console.error("⚠️ Error al verificar YouTube:", error);
    }
}

// ⏳ Revisar YouTube cada 24 horas
setInterval(() => {
    checkForNewShorts(client);
    cleanOldShorts();
}, CHECK_INTERVAL);

// 🎭 Mensaje de inicio
client.once('ready', async () => {
    console.log(`📡 Monitoreando YouTube cada 24 horas en ${client.user.tag}...`);
    checkForNewShorts(client);
    cleanOldShorts();
});

// 🔄 Función para respuestas aleatorias
function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}


// 🎤 Conectar el bot al canal de voz y manejar la cola de música
client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;
    if (!message.member.voice.channel) return message.reply("⚠️ ¡Debes estar en un canal de voz para usar los comandos de música!");

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    const guildId = message.guild.id;
    const voiceChannel = message.member.voice.channel;
    let serverQueue = queue.get(guildId);

    // 🔊 Conectar el bot al canal de voz
    if (command === 'join') {
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
        message.reply("🎶 ¡El bardo ha llegado! Preparad vuestros oídos para canciones épicas.");
    }

    // 🎵 Añadir canción a la cola y reproducir si no hay nada sonando
    if (command === 'play') {
        if (!serverQueue || !serverQueue.connection) return message.reply("🎭 ¡Oh, noble alma! Primero debéis invitarme con `!join`.");
        if (!args[0]) return message.reply("📜 ¡Un bardo necesita su partitura! Proporcióname un enlace de YouTube.");

        const url = args[0].split("&")[0];
        serverQueue.songs.push(url); // 🔄 Se agrega a la cola

        if (serverQueue.player.state.status !== AudioPlayerStatus.Playing) {
            playSong(guildId);
        }

        message.reply(`🎶 ¡Añadida a la cola! Usa \`!skip\` para avanzar.`);
    }

    // ⏸️ Pausar la música
    if (command === 'pause') {
        if (!serverQueue || !serverQueue.player) return message.reply("⚠️ ¡No hay melodía en el aire para pausar!");
        serverQueue.player.pause();
        message.reply("⏸️ ¡El trovador toma un descanso!");
    }

    // ▶️ Reanudar la música
    if (command === 'resume') {
        if (!serverQueue || !serverQueue.player) return message.reply("📜 ¡No hay canción en espera para continuar!");
        serverQueue.player.unpause();
        message.reply("▶️ ¡El laúd vuelve a sonar!");
    }

    // ⏭️ Saltar a la siguiente canción en la cola (corrige el loop infinito)
    if (command === 'skip') {
        if (!serverQueue || serverQueue.songs.length === 0) return message.reply("⏭️ ¡No hay canción que saltar!");

        serverQueue.songs.shift(); // ❗ Saca la canción actual de la cola
        if (serverQueue.songs.length === 0) {
            serverQueue.songs.push(serverQueue.songs[0]); // 🔄 Si no hay más canciones, vuelve a agregar la última para que el loop siga
        }
        serverQueue.player.stop(); // 🛑 Detiene la reproducción para forzar el cambio

        message.reply("⏭️ ¡Saltando a la siguiente canción!");
    }

    // 🛑 Detener la música y limpiar la cola (sin desconectar)
    if (command === 'stop') {
        if (!serverQueue) return message.reply("🎭 ¡No hay nada que detener!");

        serverQueue.songs = [];
        serverQueue.player.stop();
        message.reply("🛑 ¡El silencio cae como un telón en esta taberna!");
    }

    // 🚪 Desconectar el bot del canal de voz
    if (command === 'leave') {
        if (!serverQueue || !serverQueue.connection) return message.reply("⚠️ No puedo salir de donde nunca estuve.");

        serverQueue.connection.destroy();
        queue.delete(guildId);
        message.reply("📯 ¡El trovador parte en busca de nuevas canciones y viejas leyendas!");
    }

    // 📜 Mostrar la cola de canciones
    if (command === 'queue') {
        if (!serverQueue || serverQueue.songs.length === 0) return message.reply("📭 La cola está vacía, ¡añade una canción con `!play`!");

        const songList = serverQueue.songs.map((song, index) => `${index + 1}. ${song}`).join('\n');
        message.reply(`🎶 **Cola de reproducción:**\n${songList}`);
    }
});

// 🎵 Función para reproducir una canción correctamente en loop
async function playSong(guildId) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const songUrl = serverQueue.songs[0]; // ⏩ Siempre toma la primera de la cola

    try {
        const process = spawn('yt-dlp', ['-f', 'bestaudio', '--no-playlist', '-o', '-', songUrl], { stdio: ['ignore', 'pipe', 'ignore'] });
        const resource = createAudioResource(process.stdout);
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            process.kill();

            // 🔄 Si hay más canciones en la cola, avanzamos
            if (serverQueue.songs.length > 1) {
                serverQueue.songs.push(serverQueue.songs.shift()); // Mueve la canción actual al final
            }

            playSong(guildId);
        });

    } catch (error) {
        console.error(`❌ Error al reproducir: ${error.message}`);
    }
}
// 📜 Manejo de comandos
client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (command === 'commands') {
        const helpMessage = `🎭 **Lista de Comandos:**  
        
🎶 **Música**  
\`!join\` - El bardo se une al canal de voz.  
\`!play <URL>\` - Añade una canción a la cola.  
\`!pause\` - Pausa la música.  
\`!resume\` - Reanuda la música.  
\`!skip\` - Salta la canción actual.  
\`!stop\` - Detiene la música y vacía la cola.  
\`!leave\` - El bardo se retira del canal de voz.  
\`!queue\` - Muestra la lista de canciones en la cola.  

🔍 **YouTube Shorts**  
El bot revisa cada 24h y publica Shorts de D&D automáticamente en el canal designado.  

*🎶 ¡Deja que las melodías y las historias te guíen en tus aventuras! ⚔️*`;

        try {
            await message.author.send(helpMessage);
            message.reply("📜 *He enviado la lista de comandos a tus mensajes privados.*");
        } catch {
            message.reply("⚠️ *No puedo enviarte mensajes privados. Verifica tu configuración.*");
        }
    }
});
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const lowerContent = message.content.toLowerCase();

    const keywords = ["comando", "comandos", "ayuda", "musica", "música", "como usar", "que hacer", "qué hacer"];
    if (keywords.some(word => lowerContent.includes(word))) {
        message.reply(`📜 *Si buscas la lista de comandos, usa* \`!commands\` *🎶* - **${client.user.username}**, el trovador del reino.`);
    }
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    const validCommands = ["join", "play", "pause", "resume", "skip", "stop", "leave", "queue", "commands"];

    if (!validCommands.includes(command)) {
        message.reply(`⚠️ *Oh, viajero, ese conjuro no existe en mi grimorio. Prueba con* \`!commands\` *para descubrir mis melodías y secretos.* 🎶`);
    }
});


// 🔑 Iniciar bot
client.login(process.env.TOKEN);
