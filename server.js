io.on('connection', (socket) => {
    console.log(`Un joueur s'est connecté : ${socket.id}`);

    // Création d'un salon (et autres événements...)
    // ...

    // Démarrer la partie (par l'hôte)
    socket.on('startGame', () => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];

        if (!room || room.host !== socket.id) return;

        const alphabet = "ABCDEFGHIJKLMNOPRSTUV";
        const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];

        room.gameState = 'playing';
        room.currentLetter = randomLetter;

        io.to(roomCode).emit('gameStarted', {
            letter: randomLetter
        });

        console.log(`Partie lancée dans le salon ${roomCode} - Lettre : ${randomLetter}`);
    });

    // --- REÇU DES RÉPONSES (Doit être ici, au même niveau, PAS DANS startGame) ---
    socket.on('submitAnswers', (answers) => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];

        if (!room) return;

        room.answers[socket.id] = answers;
        console.log(`Réponses reçues de ${socket.id} dans le salon ${roomCode}`);

        if (Object.keys(room.answers).length === room.players.length) {
            room.gameState = 'results';
            
            io.to(roomCode).emit('gameOver', {
                answers: room.answers,
                players: room.players,
                letter: room.currentLetter
            });

            console.log(`Fin de manche pour le salon ${roomCode}`);
        } else {
            socket.emit('waitingForOthers');
        }
    });
});
