const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, name }) => {
    socket.join(roomId);
    socket.data.name = name;
    socket.data.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        scores: { X: 0, O: 0 },
        streaks: { X: 0, O: 0 },
        board: Array(9).fill(''),
        turn: 'X'
      };
    }
    const room = rooms[roomId];
    if (room.players.length < 2) {
      const symbol = room.players.length === 0 ? 'X' : 'O';
      socket.data.symbol = symbol;
      room.players.push(socket.id);
      io.to(socket.id).emit('playerAssigned', { symbol, avatar: generateAvatar(name) });
    } else {
      return io.to(socket.id).emit('full');
    }

    io.to(roomId).emit('roomData', {
      players: room.players.map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, name: s.data.name, symbol: s.data.symbol };
      }),
      scores: room.scores,
      streaks: room.streaks,
      board: room.board,
      turn: room.turn
    });
  });

  socket.on('makeMove', (idx) => {
    const room = rooms[socket.data.roomId];
    if (!room || room.turn !== socket.data.symbol || room.board[idx]) return;
    room.board[idx] = room.turn;

    const wins = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6]
    ];
    let winner = null;
    for (let [a,b,c] of wins) {
      if (room.board[a] && room.board[a] === room.board[b] && room.board[b] === room.board[c]) {
        winner = room.turn; break;
      }
    }
    if (winner) {
      room.scores[winner]++;
      room.streaks[winner]++;
      room.streaks[room.turn === 'X' ? 'O' : 'X'] = 0;
    } else if (!room.board.includes('')) {
      winner = 'draw';
      room.streaks.X = room.streaks.O = 0;
    }

    if (winner) {
      io.to(roomId).emit('gameOver', {
        winner, scores: room.scores, streaks: room.streaks
      });
      room.board = Array(9).fill('');
      room.turn = 'X';
    } else {
      room.turn = room.turn === 'X' ? 'O' : 'X';
    }
    io.to(roomId).emit('moveMade', {
      board: room.board,
      turn: room.turn,
      scores: room.scores,
      streaks: room.streaks
    });
  });

  socket.on('sendChat', (msg) => {
    io.to(socket.data.roomId).emit('chatMessage', {
      name: socket.data.name,
      text: msg
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    room.players = room.players.filter(id => id !== socket.id);
    if (room.players.length === 0) delete rooms[roomId];
  });
});

function generateAvatar(name) {
  return `https://avatars.dicebear.com/api/bottts/${encodeURIComponent(name)}.svg`;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
