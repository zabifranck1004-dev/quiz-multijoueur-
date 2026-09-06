const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir les fichiers statiques du dossier public
app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    console.log(`Un joueur s'est connecté : ${socket.id}`);

    // Créer un salon
    socket.on('createRoom', (data) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            host: socket.id,
            players: [{ id: socket.id, username: data.username, avatar: data.avatar }],
            gameState: 'waiting',
            currentLetter: '',
            answers: {}
        };

        socket.roomCode = roomCode;
        socket.join(roomCode);

        socket.emit('roomCreated', {
            roomCode,
            players: rooms[roomCode].players
        });
        console.log(`Salon créé : ${roomCode} par ${data.username}`);
    });

    // Rejoindre un salon
    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomCode];
        if (!room) {
            socket.emit('errorMsg', "Ce salon n'existe pas !");
            return;
        }

        room.players.push({ id: socket.id, username: data.username, avatar: data.avatar });
        socket.roomCode = data.roomCode;
        socket.join(data.roomCode);

        socket.emit('roomJoined', {
            roomCode: data.roomCode,
            players: room.players
        });

        io.to(data.roomCode).emit('updatePlayers', room.players);
        console.log(`${data.username} a rejoint le salon ${data.roomCode}`);
    });

    // Démarrer la partie
    socket.on('startGame', () => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];

        if (!room || room.host !== socket.id) return;

        const alphabet = "ABCDEFGHIJKLMNOPRSTUV";
        const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];

        room.gameState = 'playing';
        room.currentLetter = randomLetter;
        room.answers = {};

        io.to(roomCode).emit('gameStarted', {
            letter: randomLetter
        });

        console.log(`Partie lancée dans le salon ${roomCode} - Lettre : ${randomLetter}`);
    });

    // Réception des réponses d'un joueur
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

    socket.on('disconnect', () => {
        console.log(`Utilisateur déconnecté : ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur en écoute sur le port ${PORT}`);
});
