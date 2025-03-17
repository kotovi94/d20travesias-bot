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

const prefix = "!";
const queue = new Map(); // 🎵 Cola de reproducción global

// 🔄 Función para elegir una respuesta aleatoria
function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}

// 🎭 Mensaje de inicio
client.once('ready', async () => {
    console.log(`🎭 El bardo ${client.user.tag} está listo para tocar!`);
});

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

        const joinResponses = [
            "🎻 ¡Que resuenen las cuerdas y el espíritu se eleve! ¡Estoy listo para tocar!",
            "📯 ¡El bardo ha llegado! Preparad vuestros oídos para canciones épicas.",
            "🎶 Entra el trovador, listo para llenar este lugar de armonías mágicas."
        ];
        message.reply(getRandomResponse(joinResponses));
    }

    // 🎵 Añadir canción a la cola y reproducir si no hay nada sonando
    if (command === 'play') {
        if (!serverQueue || !serverQueue.connection) return message.reply("🎭 ¡Oh, noble alma! Primero debéis invitarme con `!join`.");
        if (!args[0]) return message.reply("📜 ¡Un bardo necesita su partitura! Proporcióname un enlace de YouTube.");

        const url = args[0].split("&")[0];
        serverQueue.songs.push(url);

        if (serverQueue.player.state.status !== AudioPlayerStatus.Playing) {
            playSong(guildId);
        }

        const playResponses = [
            "🎼 ¡Ah, esta melodía promete ser legendaria!",
            "🎶 ¡Una nueva canción para los anales de la historia!",
            "🎻 ¡Que comience el concierto! La música nos guiará."
        ];
        message.reply(getRandomResponse(playResponses));
    }

    // ⏸️ Pausar la música
    if (command === 'pause') {
        if (!serverQueue || !serverQueue.player) return message.reply("⚠️ ¡No hay melodía en el aire para pausar!");
        serverQueue.player.pause();

        const pauseResponses = [
            "⏸️ ¡Ah, un momento de respiro! Pero la música volverá.",
            "🎼 ¡El trovador se toma un descanso, mas la historia no ha acabado!",
            "📜 ¡La sinfonía espera! Pausando esta pieza con gracia."
        ];
        message.reply(getRandomResponse(pauseResponses));
    }

    // ▶️ Reanudar la música
    if (command === 'resume') {
        if (!serverQueue || !serverQueue.player) return message.reply("📜 ¡No hay canción en espera para continuar!");
        serverQueue.player.unpause();

        const resumeResponses = [
            "▶️ ¡La música regresa, como un héroe de leyenda!",
            "🎶 ¡El laúd vuelve a sonar! Preparaos para la siguiente estrofa.",
            "🎻 ¡Que la melodía siga! No hay descanso para un bardo."
        ];
        message.reply(getRandomResponse(resumeResponses));
    }

    // ⏭️ Saltar a la siguiente canción en la cola
    if (command === 'skip') {
        if (!serverQueue || serverQueue.songs.length === 0) return message.reply("⏭️ ¡No hay canción que saltar!");

        serverQueue.songs.shift();
        if (serverQueue.songs.length === 0) {
            serverQueue.songs.push(serverQueue.songs[0]);
        }
        serverQueue.player.stop();

        const skipResponses = [
            "⏭️ ¡Adelante con la próxima balada! Este cuento debe continuar.",
            "🎭 ¡Saltamos esta historia para llegar a un nuevo acto!",
            "🎼 ¡Siguiente canción! Que el festín de sonidos no termine."
        ];
        message.reply(getRandomResponse(skipResponses));
    }

    // 🛑 Detener la música y limpiar la cola
    if (command === 'stop') {
        if (!serverQueue) return message.reply("🎭 ¡No hay nada que detener!");

        serverQueue.songs = [];
        serverQueue.player.stop();

        const stopResponses = [
            "🛑 ¡El silencio cae como un telón en esta taberna!",
            "🎭 ¡La canción ha terminado, pero la historia continúa!",
            "🎻 Deteniendo la música... hasta que alguien pida otra ronda."
        ];
        message.reply(getRandomResponse(stopResponses));
    }

    // 🚪 Desconectar el bot del canal de voz
    if (command === 'leave') {
        if (!serverQueue || !serverQueue.connection) return message.reply("⚠️ No puedo salir de donde nunca estuve.");

        serverQueue.connection.destroy();
        queue.delete(guildId);

        const leaveResponses = [
            "👋 ¡El bardo se retira, pero volverá cuando la historia lo requiera!",
            "🎭 ¡Mi acto ha terminado! Que las melodías os acompañen hasta la próxima.",
            "📯 ¡El trovador parte en busca de nuevas canciones y viejas leyendas!"
        ];
        message.reply(getRandomResponse(leaveResponses));
    }
});

// 🎵 Función para reproducir una canción correctamente en loop
async function playSong(guildId) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const songUrl = serverQueue.songs[0];

    try {
        const process = spawn('yt-dlp', ['-f', 'bestaudio', '--no-playlist', '-o', '-', songUrl], { stdio: ['ignore', 'pipe', 'ignore'] });
        const resource = createAudioResource(process.stdout);
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            process.kill();

            if (serverQueue.songs.length > 1) {
                serverQueue.songs.push(serverQueue.songs.shift());
            }

            playSong(guildId);
        });

    } catch (error) {
        console.error(`❌ Error al reproducir: ${error.message}`);
    }
}

const CANAL_ORIGEN_ID = "1348784767629262921"; // 🏰 Canal donde los DMs escriben misiones
const CANAL_DESTINO_ID = "1181356950211022988"; // 🔥 Canal donde se publican las misiones
const DM_ROLE_ID = "1181336808907362405"; // 🎭 Rol del DM
const ROLES_MENCIONAR = ["1181336919087530074", "1181337096343011451"]; // 🎭 Roles a etiquetar

// Mensajes de introducción aleatorios
const MENSAJES_PUBLICACION = [
    "📜 ¡Una nueva misión ha sido publicada! Todo aquel valiente capaz de superar las pruebas será bienvenido. ⚔️",
    "🗺️ Se ha registrado una nueva expedición, ¿quién se atreve a emprender esta aventura?",
    "🔮 Los destinos han sido revelados, y una nueva historia está por escribirse.",
    "⚡ ¡Atención aventureros! Un nuevo desafío aguarda a aquellos lo suficientemente valientes para enfrentarlo."
];

// Escuchar mensajes para el comando !quest
client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    
    if (command === "quest") {
        // Verificar que está en el canal correcto
        if (message.channel.id !== CANAL_ORIGEN_ID) return message.reply("⚠️ Solo puedes escribir misiones en el canal designado.");

        // Verificar si el usuario tiene el rol de DM
        if (!message.member.roles.cache.has(DM_ROLE_ID)) return message.reply("⚠️ Solo los DMs pueden publicar misiones.");

        message.reply("📜 Escribe la misión en el siguiente mensaje. **Tienes 10 minutos** para escribirla antes de que el tiempo expire.");

        // Esperar el siguiente mensaje del DM
        const filter = response => response.author.id === message.author.id && response.channel.id === CANAL_ORIGEN_ID;
        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 600000, errors: ["time"] }).catch(() => null);
        
        if (!collected) {
            return message.reply("⏳ **Tiempo agotado.** No se ha publicado ninguna misión. Escribe `!quest` de nuevo si deseas intentarlo.");
        }

        const missionMessage = collected.first();
        const missionText = missionMessage.content;

        const canalDestino = await client.channels.fetch(CANAL_DESTINO_ID);
        if (!canalDestino) return message.reply("⚠️ No puedo encontrar el canal de misiones.");

        // Buscar enlaces en el mensaje
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        const enlaces = missionText.match(linkRegex);
        const mensajeEnlaces = enlaces ? `🔗 **Enlaces:** ${enlaces.join(" ")}` : "";

        // Crear la mención de roles
        const rolesMencionados = ROLES_MENCIONAR.map(id => `<@&${id}>`).join(" ");

        // Seleccionar un mensaje aleatorio
        const mensajeIntro = MENSAJES_PUBLICACION[Math.floor(Math.random() * MENSAJES_PUBLICACION.length)];

        // Construir el mensaje final
        const mensajeFinal = `${mensajeIntro}\n\n📜 **Misión publicada por <@${message.author.id}> (DM):**\n${missionText}\n\n${mensajeEnlaces}\n\n🎭 ${rolesMencionados}`;

        // Enviar la misión al canal de destino
        await canalDestino.send(mensajeFinal);

        // Confirmación al DM
        message.reply("✅ **¡Tu misión ha sido publicada en el tablón de anuncios!**");
    }
});

// 🔑 Iniciar bot
client.login(process.env.TOKEN);
