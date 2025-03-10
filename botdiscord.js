require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior
} = require('@discordjs/voice');
const { exec } = require('child_process'); // 🔹 Ejecutar `yt-dlp`
const fs = require('fs');
const path = require('path');

// 🔒 Cargar el token del bot desde el archivo .env
const TOKEN = process.env.DISCORD_TOKEN;

// Configuración del cliente
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Variables para la música
let songQueue = [];
let player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
let connection = null;

// 📂 **Crear carpeta temporal si no existe**
const tempFolder = './temp_audio';
if (!fs.existsSync(tempFolder)) {
    fs.mkdirSync(tempFolder);
}

// **🔹 Función para unirse a un canal de voz**
async function joinVoice(message) {
    if (!message.member.voice.channel) {
        return message.reply('❌ Debes estar en un canal de voz para invitarme.');
    }

    connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
    });

    message.reply('🎶 *El bardo ha entrado en la taberna y está listo para tocar!* 🎶');
}

// **🔹 Función para reproducir música con `yt-dlp`**
async function playNext(message) {
    if (songQueue.length === 0) {
        message.channel.send('🎶 *La lista de reproducción ha terminado.* 🎶');
        return;
    }

    const songUrl = songQueue.shift(); // Saca la primera canción de la cola
    const output = path.join(tempFolder, `audio_${Date.now()}.opus`); // Ruta del archivo descargado

    try {
        message.channel.send(`🎼 *El bardo estudia la partitura... Un momento, aventureros.* 🎸🎶`);

        // Descargar la canción con `yt-dlp`
        exec(`yt-dlp -x --audio-format opus -o "${output}" "${songUrl}"`, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Error al descargar:', error);
                message.channel.send('❌ Hubo un error al descargar la canción.');
                playNext(message); // Saltar a la siguiente canción
                return;
            }

            const resource = createAudioResource(fs.createReadStream(output));

            player.play(resource);
            connection.subscribe(player);

            message.channel.send(`🎶 *Tocando la balada de los héroes: ${songUrl}* 🎭`);

            // Esperar a que la canción termine para eliminar el archivo
            player.once(AudioPlayerStatus.Idle, () => {
                setTimeout(() => {
                    try {
                        if (fs.existsSync(output)) {
                            fs.unlinkSync(output); // Elimina el archivo descargado
                            console.log(`🗑️ Archivo eliminado: ${output}`);
                        }
                    } catch (err) {
                        console.error('⚠️ Error al eliminar el archivo:', err);
                    }
                }, 5000); // Espera 5 segundos antes de eliminar

                playNext(message);
            });
        });

    } catch (error) {
        console.error('❌ Error al reproducir la canción:', error);
        message.channel.send('❌ Hubo un error al reproducir la canción. Pasando a la siguiente...');
        playNext(message); // Salta a la siguiente canción en la cola
    }
}


// **Comando `!join` para que el bot entre al canal de voz**
client.on('messageCreate', async (message) => {
    if (message.content === '!join') {
        await joinVoice(message);
    }
});

// **Comando `!play` para agregar una canción a la cola y reproducirla**
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!play')) {
        if (!connection) {
            await joinVoice(message);
        }

        const args = message.content.split(' ');
        if (!args[1]) {
            return message.reply('❌ Debes proporcionar un enlace de YouTube.');
        }

        songQueue.push(args[1]);
        message.reply('🎵 *Canción agregada a la cola.* 🎵');

        if (player.state.status === AudioPlayerStatus.Idle) {
            playNext(message);
        }
    }
});

// **Comando `!stop` para detener la música y vaciar la cola**
client.on('messageCreate', async (message) => {
    if (message.content === '!stop') {
        songQueue = [];
        player.stop();
        message.reply('🎵 *El bardo baja su laúd, sus dedos descansan. La música ha terminado.* 🎵');
    }
});

// **Comando `!leave` para salir del canal de voz**
client.on('messageCreate', async (message) => {
    if (message.content === '!leave') {
        if (connection) {
            connection.destroy();
            connection = null;
            message.reply('🎶 *El bardo se retira a tierras lejanas, pero prometo volver cuando el viento susurre nuevas canciones...* 🎶');
        }
    }
});

// **Comando `!cola` para mostrar la lista de reproducción**
client.on('messageCreate', async (message) => {
    if (message.content === '!cola') {
        if (songQueue.length === 0) {
            return message.reply('🎵 *No hay canciones en la lista de reproducción. ¡Añade alguna con `!play <url>`!* 🎵');
        }

        let queueMessage = songQueue.map((song, index) => `${index + 1}. ${song}`).join('\n');
        message.reply(`🎶 **Lista de reproducción:**\n${queueMessage}`);
    }
});


// 📜 **Comando `!mision` para que los DMs publiquen misiones**
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!mision')) {
        const tienePermiso = message.member.roles.cache.some(role => role.name === DM_ROLE_NAME) || 
                             message.member.permissions.has('ADMINISTRATOR');

        if (!tienePermiso) {
            return message.reply('❌ *Solo los Maestros del Calabozo pueden otorgar misiones.* 🏰');
        }

        const misionTexto = message.content.slice(8).trim();
        if (!misionTexto) {
            return message.reply('📜 *¡Oh, gran narrador! Debes escribir una misión después de `!mision`.*');
        }

        const canalMisiones = client.channels.cache.get(MISIONES_CHANNEL_ID);
        if (!canalMisiones) {
            return message.reply('❌ *No encuentro el Salón de Misiones. ¿Acaso un hechizo oscuro lo ha ocultado?* 🏰');
        }

        const mensajesBardo = [
            `🏰 *Desde los rincones más oscuros del reino, un mensaje llega a vosotros...* 🏹\n\n📜 **Misión:** *"${misionTexto}"*\n\n🛡️ **¡El destino del reino está en juego!** ¿Quién se atreverá a aceptar este desafío?`,
            `⚔️ *El viento susurra relatos de una nueva misión...* 📜\n\n💬 *"${misionTexto}"*\n\n🎭 **¡Que los valientes den un paso al frente!** 🏰`,
            `📜 *Un pergamino sellado ha sido entregado al Salón de Misiones...* 🎭\n\n📖 **Misión:** *"${misionTexto}"*\n\n🛡️ **¡Es hora de hacer historia!**`,
            `🧙‍♂️ *El mago del pueblo murmura sobre una nueva tarea...* 🔮\n\n📜 **Misión:** *"${misionTexto}"*\n\n⚔️ **¡Solo los más valientes deben responder al llamado!**`
        ];

        const mensajeFinal = mensajesBardo[Math.floor(Math.random() * mensajesBardo.length)];
        canalMisiones.send(mensajeFinal);
        message.reply('✅ *La misión ha sido anunciada en el Salón de Misiones.* 🎭');
    }
});

// 📜 **Inicia el bot**
client.login(TOKEN);
