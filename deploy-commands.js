const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
    {
        name: 'play',
        description: 'Reproduce una canción de YouTube.',
        options: [
            {
                name: 'url',
                type: 3, // STRING
                description: 'URL del video de YouTube.',
                required: true
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('⌛ Registrando comandos slash...');
        await rest.put(Routes.applicationCommands('TU_CLIENT_ID'), { body: commands });
        console.log('✅ Comandos registrados.');
    } catch (error) {
        console.error(error);
    }
})();
