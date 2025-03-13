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

client.once('ready', () => {
    console.log(`🎭 El bardo está listo para tocar su laúd en tierras de ${client.user.tag}!`);
});

// 🔄 Función para elegir una respuesta aleatoria de un array
function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}

client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;
    if (message.channel.id !== '1295876800408322130') return; // Solo responde en este canal

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const guildId = message.guild.id;
    const voiceChannel = message.member.voice.channel;
    let serverQueue = queue.get(guildId);

    // 🎤 Conectar al canal de voz
    if (command === 'join') {
        if (!voiceChannel) return message.reply('⚠️ ¡Oh, viajero! Para escuchar mis melodías, debes estar en un salón de canto (canal de voz).');

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

    // 🎵 Reproducir una canción
    if (command === 'play') {
        if (!serverQueue || !serverQueue.connection) return message.reply("🎭 ¡Oh, noble alma! Primero debéis invitarme con `!join`.");
        if (!args[0]) return message.reply("📜 ¡Un bardo necesita su partitura! Proporcióname un enlace de YouTube.");

        const url = args[0].split("&")[0];
        serverQueue.songs.push(url);

        if (serverQueue.player.state.status !== AudioPlayerStatus.Playing) {
            playSong(guildId);
        }

        const playResponses = [
            `🎼 ¡Ah, esta melodía promete ser legendaria!`,
            `🎶 ¡Una nueva canción para los anales de la historia!`,
            `🎻 ¡Que comience el concierto! La música nos guiará.`
        ];

        message.reply(getRandomResponse(playResponses));
    }

    // 🎶 Controles para `!play`
    if (command === 'stop') {
        if (!serverQueue) return message.reply("🎭 ¡No hay nada que detener! No he comenzado a tocar aún.");
        
        serverQueue.songs = [];
        serverQueue.player.stop();

        const stopResponses = [
            "🛑 ¡El silencio cae como un telón en esta taberna!",
            "🎭 ¡La canción ha terminado, pero la historia continúa!",
            "🎻 Deteniendo la música... hasta que alguien pida otra ronda."
        ];

        message.reply(getRandomResponse(stopResponses));
    }

    if (command === 'pause') {
        if (!serverQueue || !serverQueue.player) return message.reply("⚠️ ¡No hay melodía en el aire para pausar, viajero!");
        serverQueue.player.pause();

        const pauseResponses = [
            "⏸️ ¡Ah, un momento de respiro! Pero la música volverá.",
            "🎼 ¡El trovador se toma un descanso, mas la historia no ha acabado!",
            "📜 ¡La sinfonía espera! Pausando esta pieza con gracia."
        ];

        message.reply(getRandomResponse(pauseResponses));
    }

    if (command === 'resume') {
        if (!serverQueue || !serverQueue.player) return message.reply("📜 ¡No hay canción en espera para continuar, noble caballero!");
        serverQueue.player.unpause();

        const resumeResponses = [
            "▶️ ¡La música regresa, como un héroe de leyenda!",
            "🎶 ¡El laúd vuelve a sonar! Preparaos para la siguiente estrofa.",
            "🎻 ¡Que la melodía siga! No hay descanso para un bardo."
        ];

        message.reply(getRandomResponse(resumeResponses));
    }

    if (command === 'skip') {
        if (!serverQueue || !serverQueue.player) return message.reply("⏭️ ¡No hay canción que saltar, viajero impaciente!");
        serverQueue.player.stop();

        const skipResponses = [
            "⏭️ ¡Adelante con la próxima balada! Este cuento debe continuar.",
            "🎭 ¡Saltamos esta historia para llegar a un nuevo acto!",
            "🎼 ¡Siguiente canción! Que el festín de sonidos no termine."
        ];

        message.reply(getRandomResponse(skipResponses));
    }

    // 🚪 Desconectar el bot manualmente del canal de voz
    if (command === 'leave') {
        if (!serverQueue || !serverQueue.connection) return message.reply("⚠️ No puedo salir de donde nunca estuve, noble guerrero.");
        
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

// 🔄 Reproducir una canción (Música en cola)
async function playSong(guildId) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) return;

    const songUrl = serverQueue.songs[0];

    try {
        const process = spawn('yt-dlp', ['-f', 'bestaudio', '--no-playlist', '-o', '-', songUrl], { stdio: ['ignore', 'pipe', 'ignore'] });
        const resource = createAudioResource(process.stdout);
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            process.kill();
            playSong(guildId);
        });

    } catch (error) {
        console.error(`❌ Error al reproducir: ${error.message}`);
    }
}
// ID de los canales
const INPUT_CHANNEL_ID = "1348784767629262921"; // 📥 Canal donde el DM escribe `!quest`
const OUTPUT_CHANNEL_ID = "1181356950211022988"; // 📜 Canal donde el bot publica la misión

// 🔄 Función para elegir un elemento aleatorio de una lista
function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// 📜 Elementos narrativos para generar misiones
const hooks = [
    "Un viajero herido llega a la taberna y os susurra una última petición...",
    "El rey ha enviado un mensajero en busca de valientes dispuestos a enfrentar un gran peligro...",
    "Un anciano os entrega un mapa cubierto de polvo y os dice: 'Solo vosotros podéis lograrlo...'",
    "La luna roja brilla sobre el castillo maldito, señal de que algo oscuro está por ocurrir...",
    "Un gremio de mercenarios busca aventureros para una misión de alto riesgo...",
];

const locations = [
    "las ruinas antiguas de Eldoria, donde la magia aún susurra en el viento",
    "la fortaleza maldita en las Montañas Sombrías, donde nadie ha regresado con vida",
    "el bosque encantado de Lirion, donde los árboles susurran secretos a los que se atreven a escuchar",
    "la ciudad prohibida de Karaz'dun, donde la alquimia prohibida ha tomado vida propia",
    "las catacumbas bajo la Catedral de la Llama Eterna, hogar de espíritus inquietos",
];

const dangers = [
    "una tormenta mágica impide el paso y los vientos cantan nombres olvidados",
    "las sombras parecen moverse por sí solas, susurrando palabras incomprensibles",
    "una horda de criaturas de pesadilla ha sido avistada en los alrededores",
    "los viajeros que se aventuran cerca desaparecen sin dejar rastro",
    "antiguas trampas aún protegen los secretos ocultos en el lugar",
];

const objectives = [
    "recuperar un artefacto legendario antes de que caiga en malas manos",
    "destruir un portal demoníaco que amenaza con desatar el caos",
    "rescatar a un noble desaparecido y descubrir qué le ha ocurrido",
    "asesinar a un traidor que planea vender los secretos del reino",
    "descifrar un enigma arcano que ha confundido a generaciones de sabios",
];

const enemies = [
    "un ejército de no-muertos liderados por un antiguo señor de la guerra",
    "un mago oscuro que busca la inmortalidad a cualquier precio",
    "una bestia legendaria que ha despertado después de mil años de letargo",
    "una secta de adoradores de un dios prohibido, dispuestos a todo por su causa",
    "un ladrón de almas que se oculta en las sombras y nunca deja sobrevivientes",
];

const resolutions = [
    "Si la misión tiene éxito, una nueva era de prosperidad comenzará.",
    "El fracaso significará la destrucción de un reino entero.",
    "El destino del mundo pende de un hilo, y solo vosotros podéis inclinar la balanza.",
    "Las antiguas profecías mencionaban este día... ¿seréis los héroes de la leyenda?",
    "Nada volverá a ser igual después de esta aventura.",
];

const rewards = [
    "un cofre lleno de oro, gemas y reliquias olvidadas",
    "una audiencia con el rey y un título nobiliario",
    "una antigua espada encantada que solo responde a los dignos",
    "el conocimiento secreto de los sabios de la Torre Arcana",
    "una tierra propia en la frontera, con la promesa de gloria y riqueza",
];

client.once('ready', () => {
    console.log(`🛡️ El bardo está listo para narrar aventuras en ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    // Ignorar mensajes de bots y verificar el canal de entrada
    if (message.author.bot || message.channel.id !== INPUT_CHANNEL_ID) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'quest') {
        const hook = getRandomElement(hooks);
        const location = getRandomElement(locations);
        const danger = getRandomElement(dangers);
        const objective = getRandomElement(objectives);
        const enemy = getRandomElement(enemies);
        const resolution = getRandomElement(resolutions);
        const reward = getRandomElement(rewards);

        const questMessage = `📜 **Nueva Misión**  
        🎭 *${hook}*  
        🏰 Lugar: ${location}  
        ⚠️ Peligro: ${danger}  
        🎯 Objetivo: ${objective}  
        ☠️ Enemigo Principal: ${enemy}  
        📖 Resolución: ${resolution}  
        💰 Recompensa: ${reward}  

        ¿Responderéis al llamado de la aventura? ⚔️`;

        const outputChannel = await client.channels.fetch(OUTPUT_CHANNEL_ID);
        if (!outputChannel) {
            console.error("⚠️ No se pudo encontrar el canal de salida.");
            return;
        }

        // Enviar la misión en el canal de misiones
        await outputChannel.send(questMessage);

        // Confirmación para el DM en el canal de entrada
        const confirmationMessages = [
            "📜 ¡El pergamino ha sido enviado! La misión ha sido publicada en el tablón de anuncios.",
            "🎭 ¡Los bardos cantarán sobre esta nueva misión! Ahora solo falta que los héroes la acepten.",
            "⚔️ El destino ha hablado. La misión ha sido entregada a los aventureros más valientes.",
            "📖 El libro de leyendas acaba de recibir una nueva historia. La misión ha sido enviada.",
            "🏹 La flecha ha sido disparada, la misión ha sido proclamada en el reino."
        ];

        message.reply(getRandomElement(confirmationMessages));
    }
});
client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'help') {
        const helpMessage = `🎭 **Comandos disponibles:**  
        
📜 **Misiones**  
\`!quest\` - Genera una misión aleatoria y la publica en el tablón de anuncios.  

🎶 **Música**  
\`!join\` - El bardo se une a tu canal de voz.  
\`!play <URL>\` - Añade una canción a la cola y comienza a tocar.  
\`!pause\` - Pausa la canción actual.  
\`!resume\` - Reanuda la música pausada.  
\`!skip\` - Salta la canción actual.  
\`!stop\` - Detiene la música y vacía la cola.  
\`!leave\` - El bardo se retira del canal de voz.  

*¡Que las melodías y las historias os guíen en vuestras aventuras!* 🎶⚔️`;

        try {
            // Enviar el mensaje privado al usuario
            await message.author.send(helpMessage);
            // Confirmar en el chat que el mensaje fue enviado por privado
            message.reply("📜 *He enviado un pergamino con la lista de comandos a tus mensajes privados.*");
        } catch (error) {
            console.error("⚠️ No pude enviar un mensaje privado al usuario:", error);
            message.reply("⚠️ *Parece que no puedo enviarte mensajes privados. Revisa tu configuración de privacidad.*");
        }
    }
});

client.login(process.env.TOKEN);
