const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir les fichiers statiques du dossier "public"
app.use(express.static('public'));

// Structure pour stocker les salons
const rooms = {};

io.on('connection', (socket) => {
    console.log(`Un joueur s'est connecté : ${socket.id}`);

    // Création d'un salon
    socket.on('createRoom', (data) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        rooms[roomCode] = {
            host: socket.id,
            players: [{
                id: socket.id,
                username: data.username,
                avatar: data.avatar,
                score: 0
            }],
            gameState: 'waiting', // waiting, playing, results
            currentLetter: '',
            answers: {}
        };

        socket.join(roomCode);
        socket.roomCode = roomCode;

        // Confirmer au créateur que le salon est créé
        socket.emit('roomCreated', {
            roomCode: roomCode,
            players: rooms[roomCode].players
        });
        
        console.log(`Salon créé : ${roomCode} par ${data.username}`);
    });

    // Rejoindre un salon existant
    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomCode];

        if (!room) {
            socket.emit('errorMsg', "Ce salon n'existe pas !");
            return;
        }

        if (room.gameState !== 'waiting') {
            socket.emit('errorMsg', "La partie a déjà commencé !");
            return;
        }

        socket.join(data.roomCode);
        socket.roomCode = data.roomCode;

        room.players.push({
            id: socket.id,
            username: data.username,
            avatar: data.avatar,
            score: 0
        });

        // Informer tout le monde dans le salon qu'un joueur a rejoint
        io.to(data.roomCode).emit('updatePlayers', room.players);
        
        // Confirmer au joueur qu'il a rejoint
        socket.emit('roomJoined', {
            roomCode: data.roomCode,
            players: room.players
        });

        console.log(`${data.username} a rejoint le salon ${data.roomCode}`);
    });

    // Déconnexion d'un joueur
    socket.on('disconnect', () => {
        console.log(`Un joueur s'est déconnecté : ${socket.id}`);
        // Nettoyage basique des salons si besoin
        for (let code in rooms) {
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
            if (rooms[code].players.length === 0) {
                delete rooms[code]; // Supprimer le salon s'il est vide
                console.log(`Salon ${code} supprimé (vide).`);
            } else {
                io.to(code).emit('updatePlayers', rooms[code].players);
            }
        }
    });
});

// Lancer le serveur sur le port 3000 (ou celui de l'environnement)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur en écoute sur le port ${PORT}`);
});"Mise en place du serveur pour le Petit Bac"
