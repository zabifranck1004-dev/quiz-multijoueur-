const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

const questionsList = [
    { question: "Quelle est la capitale de la France ?", options: ["Londres", "Berlin", "Paris", "Madrid"], answer: 2, difficulty: "Facile" },
    { question: "Combien font 5 x 8 ?", options: ["35", "40", "45", "50"], answer: 1, difficulty: "Facile" },
    { question: "Quel animal est connu pour sa lenteur ?", options: ["Le guépard", "Le lièvre", "Le paresseux", "Le cheval"], answer: 2, difficulty: "Facile" },
    { question: "Quel langage est utilisé pour le web côté client ?", options: ["Python", "C++", "JavaScript", "Java"], answer: 2, difficulty: "Moyen" },
    { question: "Quel est l'océan le plus grand du monde ?", options: ["Océan Atlantique", "Océan Pacifique", "Océan Indien", "Océan Arctique"], answer: 1, difficulty: "Moyen" },
    { question: "Combien y a-t-il de continents sur Terre ?", options: ["5", "6", "7", "8"], answer: 2, difficulty: "Moyen" },
    { question: "En quelle année a eu lieu le premier pas sur la Lune ?", options: ["1965", "1969", "1971", "1973"], answer: 1, difficulty: "Difficile" },
    { question: "Quel est l'élément chimique dont le symbole est Au ?", options: ["Argent", "Cuivre", "Or", "Aluminium"], answer: 2, difficulty: "Difficile" },
    { question: "Qui a peint La Joconde ?", options: ["Van Gogh", "Picasso", "Léonard de Vinci", "Monet"], answer: 2, difficulty: "Difficile" }
];

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté :', socket.id);

    socket.on('createRoom', (data) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            players: {},
            host: socket.id,
            currentQuestion: 0,
            timer: null
        };
        rooms[roomCode].players[socket.id] = {
            name: data.username,
            avatar: data.avatar,
            score: 0,
            lives: 3,
            isEliminated: false
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
                lives: 3,
                isEliminated: false
            };
            socket.join(data.roomCode);
            socket.emit('joinedSuccessfully', { roomCode: data.roomCode, players: room.players });
            io.to(data.roomCode).emit('updateRoom', { players: room.players });
        }
    });

    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id) {
            room.currentQuestion = 0;
            sendNextQuestion(roomCode);
        }
    });

    socket.on('submitAnswer', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            const player = room.players[socket.id];
            if (player && !player.isEliminated) {
                const currentQ = questionsList[room.currentQuestion - 1];
                if (currentQ && data.index === currentQ.answer) {
                    let points = 10;
                    if (currentQ.difficulty === "Moyen") points = 15;
                    if (currentQ.difficulty === "Difficile") points = 20;
                    player.score += points;
                } else {
                    player.lives -= 1;
                    if (player.lives <= 0) {
                        player.isEliminated = true;
                    }
                }
                io.to(data.roomCode).emit('updateRoom', { players: room.players });
            }
        }
    });

    socket.on('useFiftyFifty', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            const currentQ = questionsList[room.currentQuestion - 1];
            if (currentQ) {
                let wrongIndices = [];
                currentQ.options.forEach((opt, idx) => {
                    if (idx !== currentQ.answer) wrongIndices.push(idx);
                });
                socket.emit('fiftyFiftyUsed', [wrongIndices[0]]);
            }
        }
    });

    socket.on('useExtraLife', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.players[socket.id]) {
            room.players[socket.id].lives += 1;
            socket.emit('extraLifeUsed');
            io.to(roomCode).emit('updateRoom', { players: room.players });
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

function sendNextQuestion(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.timer) clearTimeout(room.timer);

    if (room.currentQuestion < questionsList.length) {
        const q = questionsList[room.currentQuestion];
        io.to(roomCode).emit('newQuestion', {
            questionNumber: room.currentQuestion + 1,
            total: questionsList.length,
            question: q.question,
            options: q.options,
            difficulty: q.difficulty
        });
        room.currentQuestion++;

        room.timer = setTimeout(() => {
            sendNextQuestion(roomCode);
        }, 6000); // 6 secondes par question
    } else {
        io.to(roomCode).emit('gameOver', {
            players: room.players,
            stats: { accuracy: 85, fastestPlayer: "Zabi", fastestTime: 1100 }
        });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
