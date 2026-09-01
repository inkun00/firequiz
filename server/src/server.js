const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const roomManager = require('./roomManager');

const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const originIsAllowed = origin => !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin);
const corsOptions = {
  origin(origin, callback) {
    if (originIsAllowed(origin)) return callback(null, true);
    return callback(new Error('허용되지 않은 클라이언트 출처입니다.'));
  },
  methods: ['GET', 'POST']
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  perMessageDeflate: {
    threshold: 512
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'firequiz-game-server', status: 'ok' });
});

io.on('connection', (socket) => {
  // 1. 호스트 방 생성
  socket.on('host_create_room', () => {
    const room = roomManager.createRoom(socket.id);
    socket.join(room.pin);
    console.log(`[Race Room Created] PIN: ${room.pin}`);
    socket.emit('room_created', { pin: room.pin, totalQuestions: room.questions.length });
  });

  // 2. 플레이어 방 입장
  socket.on('player_join_room', ({ pin, nickname, avatar }) => {
    const room = roomManager.getRoom(pin);
    if (!room) {
      return socket.emit('join_error', { message: '존재하지 않는 방 번호(PIN)입니다.' });
    }
    if (room.status !== 'LOBBY') {
      return socket.emit('join_error', { message: '이미 레이스가 진행 중입니다.' });
    }

    const res = room.addPlayer(socket.id, nickname, avatar);
    if (!res.success) {
      return socket.emit('join_error', { message: res.message });
    }

    socket.join(pin);
    socket.emit('joined_successfully', {
      player: room.getClientPlayer(res.player),
      pin: room.pin
    });

    io.to(pin).emit('lobby_players_updated', {
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        carColor: p.carColor,
        isBot: p.isBot
      })),
      count: room.players.size
    });
  });

  // 3. 연결이 끊긴 플레이어가 기존 레이스 상태로 복귀
  socket.on('player_resume_room', ({ pin, resumeToken }) => {
    const normalizedPin = String(pin || '').trim();
    const room = roomManager.getRoom(normalizedPin);
    if (!room) {
      return socket.emit('resume_error', { reason: 'ROOM_NOT_FOUND' });
    }

    const resumed = room.resumePlayer(socket.id, resumeToken);
    if (!resumed) {
      return socket.emit('resume_error', { reason: 'SESSION_NOT_FOUND' });
    }

    socket.join(normalizedPin);
    if (resumed.previousSocketId !== socket.id) {
      io.to(resumed.previousSocketId).emit('player_session_replaced');
    }

    socket.emit('resumed_successfully', {
      pin: normalizedPin,
      ...room.getPlayerSnapshot(resumed.player)
    });

    if (room.status === 'LOBBY') {
      io.to(normalizedPin).emit('lobby_players_updated', {
        players: Array.from(room.players.values()).map(player => ({
          id: player.id,
          nickname: player.nickname,
          avatar: player.avatar,
          carColor: player.carColor,
          isBot: player.isBot
        })),
        count: room.players.size
      });
    }
  });

  // 4. 호스트: 30명 AI 봇 채우기
  socket.on('host_fill_bots', ({ pin, targetCount = 30 }) => {
    const room = roomManager.getRoom(pin);
    if (!room) return;

    room.fillWithBots(targetCount);
    io.to(pin).emit('lobby_players_updated', {
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        carColor: p.carColor,
        isBot: p.isBot
      })),
      count: room.players.size
    });
  });

  // 5. 호스트: 레이스 시작
  socket.on('host_start_game', ({ pin, durationSec }) => {
    const room = roomManager.getRoom(pin);
    if (!room || room.hostSocketId !== socket.id || room.status !== 'LOBBY') return;
    room.startCountdown(io, durationSec);
  });

  // 6. 플레이어: 답안 제출
  socket.on('player_submit_answer', ({ pin, questionId, selectedAnswer, timeSpentMs }, acknowledge) => {
    const room = roomManager.getRoom(pin);
    if (!room || room.status !== 'RACING') {
      if (typeof acknowledge === 'function') {
        acknowledge({ accepted: false, reason: 'RACE_NOT_ACTIVE' });
      }
      return;
    }

    const result = room.handlePlayerAnswer(socket.id, questionId, selectedAnswer, timeSpentMs, io);
    if (typeof acknowledge === 'function') acknowledge(result);

    if (!result.accepted) {
      const player = room.players.get(socket.id);
      if (player) socket.emit('player_state_sync', room.getPlayerSnapshot(player));
    }
  });

  // 7. 플레이어: 아이템 사용
  socket.on('player_use_item', ({ pin, slotIndex }) => {
    const room = roomManager.getRoom(pin);
    if (!room || room.status !== 'RACING') return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const effect = room.usePlayerItem(socket.id, slotIndex, io);
    io.to(pin).emit('item_effect_broadcast', effect);
    socket.emit('item_slots_updated', {
      itemSlots: player.itemSlots,
      score: player.score,
      lockedUntil: Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0),
      lockType: player.iceFrozenUntil > Date.now() ? 'ICE_BOMB' : 'PENALTY',
      consecutiveWrong: player.consecutiveWrong,
      specialGuardUntil: player.specialGuardUntil || 0
    });
  });

  // 8. 호스트: 강제 레이스 종료
  socket.on('host_end_race', ({ pin }) => {
    const room = roomManager.getRoom(pin);
    if (!room) return;
    room.endRace(io, 'MANUAL');
  });

  // 9. 호스트: 게임 종료 후 로비로 돌아가기 (다시 하기)
  socket.on('host_reset_lobby', ({ pin }) => {
    const room = roomManager.getRoom(pin);
    if (!room) return;

    room.resetToLobby();
    const updatedPlayers = Array.from(room.players.values()).map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      carColor: p.carColor,
      isBot: p.isBot
    }));

    io.to(pin).emit('game_reset_to_lobby', {
      players: updatedPlayers,
      count: room.players.size
    });
  });

  socket.on('disconnect', () => {
    for (const room of roomManager.rooms.values()) {
      room.markPlayerDisconnected(socket.id);
    }
    console.log(`[Disconnected] ID: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🏎️ 불조심 배틀 119 카트 레이싱 서버 가동 중: http://localhost:${PORT}`);
});
