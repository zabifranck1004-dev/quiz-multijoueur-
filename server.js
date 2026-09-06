const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function checkBattleRoyale(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.state !== 'PLAYING') return false;

  const allPlayers = Object.values(room.players);
  const activePlayers = allPlayers.filter(p => !p.isEliminated);

  if (allPlayers.length > 1 && activePlayers.length <= 1) {
    room.state = 'LOBBY';
    if (activePlayers.length === 1) {
      activePlayers[0].score += 500;
    }
    
    const accuracy = room.stats.totalAnswers > 0 
      ? Math.round((room.stats.correctAnswers / room.stats.totalAnswers) * 100) 
      : 0;

    io.to(roomCode).emit('gameOver', { 
      players: room.players, 
      stats: { accuracy, fastestPlayer: room.stats.fastestPlayer, fastestTime: room.stats.fastestTime } 
    });
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ username, avatar }) => {
    const roomCode = generateRoomCode();
    socket.join(roomCode);
    rooms[roomCode] = {
      host: socket.id,
      players: { 
        [socket.id]: { name: username, avatar: avatar || '🦊', score: 0, lives: 3, isEliminated: false, jokers: { fiftyFifty: true, extraLife: true }, answered: false } 
      },
      questions: [],
      currentQuestion: 0,
      state: 'LOBBY',
      stats: { totalAnswers: 0, correctAnswers: 0, fastestTime: Infinity, fastestPlayer: null, questionStartTime: 0 }
    };
    socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players, isHost: true });
  });

  socket.on('joinRoom', ({ roomCode, username, avatar }) => {
    const code = roomCode.toUpperCase();
    if (!rooms[code]) return socket.emit('errorMsg', 'Salon introuvable !');

    socket.join(code);
    rooms[code].players[socket.id] = { 
      name: username, 
      avatar: avatar || '🦊', 
      score: 0, 
      lives: 3, 
      isEliminated: false, 
      jokers: { fiftyFifty: true, extraLife: true }, 
      answered: false 
    };

    io.to(code).emit('updateRoom', { roomCode: code, players: rooms[code].players });
    socket.emit('joinedSuccessfully', { roomCode: code, isHost: false });
  });

  socket.on('startGame', async (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;

    try {
      const response = await fetch('https://opentdb.com/api.php?amount=5&type=multiple');
      const data = await response.json();
      
      room.questions = data.results.map(q => {
        const options = [...q.incorrect_answers];
        const correctIndex = Math.floor(Math.random() * 4);
        options.splice(correctIndex, 0, q.correct_answer);
        return {
          question: q.question,
          options: options,
          answer: correctIndex
        };
      });

      room.currentQuestion = 0;
      room.state = 'PLAYING';
      sendQuestion(roomCode);
    } catch (e) {
      socket.emit('errorMsg', 'Erreur lors du chargement des questions.');
    }
  });

  socket.on('submitAnswer', ({ roomCode, index }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'PLAYING') return;

    const player = room.players[socket.id];
    if (!player || player.isEliminated || player.answered) return;

    player.answered = true;
    room.stats.totalAnswers += 1;
    const currentQ = room.questions[room.currentQuestion];
    const timeTaken = Date.now() - room.stats.questionStartTime;

    if (index === currentQ.answer) {
      player.score += 100;
      room.stats.correctAnswers += 1;
      if (timeTaken < room.stats.fastestTime) {
        room.stats.fastestTime = timeTaken;
        room.stats.fastestPlayer = player.name;
      }
    } else {
      player.lives -= 1;
      if (player.lives <= 0) {
        player.lives = 0;
        player.isEliminated = true;
      }
    }

    io.to(roomCode).emit('updateRoom', { roomCode, players: room.players });
    checkBattleRoyale(roomCode);
  });

  socket.on('useFiftyFifty', (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'PLAYING') return;
    const player = room.players[socket.id];
    if (!player || player.isEliminated || !player.jokers.fiftyFifty) return;

    player.jokers.fiftyFifty = false;
    const currentQ = room.questions[room.currentQuestion];
    const wrongIndices = [0, 1, 2, 3].filter(idx => idx !== currentQ.answer);
    wrongIndices.sort(() => Math.random() - 0.5);
    socket.emit('fiftyFiftyUsed', wrongIndices.slice(0, 2));
  });

  socket.on('useExtraLife', (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'PLAYING') return;
    const player = room.players[socket.id];
    if (!player || player.isEliminated || !player.jokers.extraLife) return;

    player.jokers.extraLife = false;
    player.lives += 1;
    socket.emit('extraLifeUsed');
    io.to(roomCode).emit('updateRoom', { roomCode, players: room.players });
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      if (rooms[code].players[socket.id]) {
        delete rooms[code].players[socket.id];
        if (Object.keys(rooms[code].players).length === 0) {
          delete rooms[code];
        } else {
          io.to(code).emit('updateRoom', { roomCode: code, players: rooms[code].players });
        }
      }
    }
  });
});

function sendQuestion(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  if (room.currentQuestion >= room.questions.length) {
    room.state = 'LOBBY';
    const accuracy = room.stats.totalAnswers > 0 
      ? Math.round((room.stats.correctAnswers / room.stats.totalAnswers) * 100) 
      : 0;

    io.to(roomCode).emit('gameOver', { 
      players: room.players, 
      stats: { accuracy, fastestPlayer: room.stats.fastestPlayer, fastestTime: room.stats.fastestTime } 
    });
    return;
  }

  Object.values(room.players).forEach(p => p.answered = false);
  room.stats.questionStartTime = Date.now();

  const q = room.questions[room.currentQuestion];
  io.to(roomCode).emit('newQuestion', {
    questionNumber: room.currentQuestion + 1,
    total: room.questions.length,
    question: q.question,
    options: q.options
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));