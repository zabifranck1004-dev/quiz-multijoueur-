const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté :', socket.id);

    socket.on('createRoom', (data) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            players: {},
            host: socket.id
        };
        rooms[roomCode].players[socket.id] = {
            name: data.username,
            avatar: data.avatar,
            score: 0,
            lives: 3
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players });
    });

    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            room.players[socket.id] = {
                name: data.username,
                avatar: data.avatar,
                score: 0,
                lives: 3
            };
            socket.join(data.roomCode);
            socket.emit('joinedSuccessfully', { roomCode: data.roomCode, players: room.players });
            io.to(data.roomCode).emit('updateRoom', { players: room.players });
        }
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté :', socket.id);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                delete rooms[roomCode].players[socket.id];
                io.to(roomCode).emit('updateRoom', { players: rooms[roomCode].players });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
