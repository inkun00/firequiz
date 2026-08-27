/**
 * 룸 매니저: 개인별 독립 퀴즈 레이싱 및 30인 동기화
 */
const quizData = require('./quizData');
const { GameEngine } = require('./gameEngine');

const BOT_NAMES = [
  "김민준", "이서연", "박도윤", "최서아", "정도현", "강지우", "조은우", "윤지아",
  "장예준", "임수아", "한시우", "오하은", "신주원", "서우진", "권지호", "황윤서",
  "안준우", "송채원", "전건우", "홍소율", "배우진", "유다은", "고선우", "문예린",
  "손연우", "양유나", "백정우", "허가은", "노현우"
];

const AVATARS = [
  '/assets/racers/characters/01-ember-captain.png',
  '/assets/racers/characters/02-aqua-mechanic.png',
  '/assets/racers/characters/03-volt-responder.png',
  '/assets/racers/characters/04-moss-guardian.png',
  '/assets/racers/characters/05-violet-medic.png',
  '/assets/racers/characters/06-blaze-fox.png',
  '/assets/racers/characters/07-frost-penguin.png',
  '/assets/racers/characters/08-signal-bunny.png',
  '/assets/racers/characters/09-patch-pup.png',
  '/assets/racers/characters/10-solar-lion.png'
];
const CAR_COLORS = ['RED', 'BLUE', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'CYAN', 'PINK'];

class Room {
  constructor(pin, hostSocketId) {
    this.pin = pin;
    this.hostSocketId = hostSocketId;
    this.players = new Map();
    this.status = 'LOBBY'; // LOBBY, RACING, FINAL
    this.questions = quizData;
    this.gameEngine = new GameEngine(this);
    this.botIntervals = [];
    this.raceStartTime = 0;
    this.raceDurationSec = 300;
    this.raceEndsAt = 0;
    this.raceEndTimeout = null;
  }

  addPlayer(socketId, nickname, avatar = AVATARS[0]) {
    if (this.players.size >= 30) {
      return { success: false, message: '방 인원(최대 30명)이 가득 찼습니다.' };
    }

    const shuffledQuestions = [...this.questions].sort(() => Math.random() - 0.5);

    const player = {
      id: socketId,
      nickname: nickname || `레이서_${this.players.size + 1}`,
      avatar: AVATARS.includes(avatar) ? avatar : AVATARS[this.players.size % AVATARS.length],
      carColor: CAR_COLORS[this.players.size % CAR_COLORS.length],
      score: 0,
      correctCount: 0,
      consecutiveWrong: 0,
      streak: 0,
      isFever: false,
      rank: this.players.size + 1,
      prevRank: this.players.size + 1,
      rankDelta: 0,
      itemSlots: [],
      freezeUntil: 0,
      iceFrozenUntil: 0,
      isBot: false,
      progress: 0,
      shuffledQuestions: shuffledQuestions,
      currentQuestion: null,
      questionStartTime: 0,
      isFinished: false
    };

    this.players.set(socketId, player);
    return { success: true, player };
  }

  fillWithBots(targetCount = 30) {
    const needCount = targetCount - this.players.size;
    if (needCount <= 0) return;

    for (let i = 0; i < needCount; i++) {
      const botId = `bot_${Date.now()}_${i}`;
      const name = BOT_NAMES[i % BOT_NAMES.length];
      const avatar = AVATARS[(this.players.size + i) % AVATARS.length];
      const shuffled = [...this.questions].sort(() => Math.random() - 0.5);

      const botPlayer = {
        id: botId,
        nickname: name,
        avatar: avatar,
        carColor: CAR_COLORS[(this.players.size + i) % CAR_COLORS.length],
        score: 0,
        correctCount: 0,
        consecutiveWrong: 0,
        streak: 0,
        isFever: false,
        rank: this.players.size + 1,
        prevRank: this.players.size + 1,
        rankDelta: 0,
        itemSlots: [],
        freezeUntil: 0,
        iceFrozenUntil: 0,
        isBot: true,
        progress: 0,
        shuffledQuestions: shuffled,
        currentQuestion: null,
        questionStartTime: 0,
        isFinished: false
      };

      this.players.set(botId, botPlayer);
    }
  }

  // 게임 종료 후 로비 상태로 리셋 (플레이어 유지)
  resetToLobby() {
    this.status = 'LOBBY';
    clearInterval(this.syncInterval);
    clearTimeout(this.raceEndTimeout);
    this.raceEndTimeout = null;
    this.raceEndsAt = 0;
    this.botIntervals.forEach(i => clearInterval(i));
    this.botIntervals = [];

    // 모든 플레이어 상태 초기화 및 새 문제 큐 배정
    for (const player of this.players.values()) {
      player.score = 0;
      player.correctCount = 0;
      player.consecutiveWrong = 0;
      player.streak = 0;
      player.isFever = false;
      player.rank = 1;
      player.prevRank = 1;
      player.rankDelta = 0;
      player.itemSlots = [];
      player.freezeUntil = 0;
      player.iceFrozenUntil = 0;
      player.progress = 0;
      player.shuffledQuestions = [...this.questions].sort(() => Math.random() - 0.5);
      player.currentQuestion = null;
      player.questionStartTime = 0;
      player.isFinished = false;
    }
  }

  startRace(io) {
    this.status = 'RACING';
    this.raceStartTime = Date.now();
    this.raceEndsAt = this.raceStartTime + (this.raceDurationSec * 1000);
    clearTimeout(this.raceEndTimeout);
    this.raceEndTimeout = setTimeout(() => {
      this.endRace(io, 'TIME_UP');
    }, this.raceDurationSec * 1000);

    for (const player of this.players.values()) {
      this.sendNextQuestionToPlayer(player, io);
    }

    this.startBotRacerLoop(io);

    this.syncInterval = setInterval(() => {
      if (this.status !== 'RACING') {
        clearInterval(this.syncInterval);
        return;
      }
      const leaderboard = this.gameEngine.calculateLeaderboard(Array.from(this.players.values()));
      const remainingSec = Math.max(0, Math.ceil((this.raceEndsAt - Date.now()) / 1000));
      io.to(this.pin).emit('race_leaderboard_sync', {
        leaderboard,
        remainingSec,
        durationSec: this.raceDurationSec
      });

      const allFinished = Array.from(this.players.values()).every(
        p => p.isFinished || p.progress >= this.questions.length
      );
      if (allFinished) {
        this.endRace(io, 'ALL_FINISHED');
      }
    }, 500);
  }

  sendNextQuestionToPlayer(player, io) {
    if (player.progress >= player.shuffledQuestions.length) {
      player.isFinished = true;
      if (!player.isBot) {
        io.to(player.id).emit('player_race_finished', {
          score: player.score,
          correctCount: player.correctCount
        });
      }
      return;
    }

    const q = player.shuffledQuestions[player.progress];
    player.currentQuestion = q;
    player.questionStartTime = Date.now();

    if (!player.isBot) {
      io.to(player.id).emit('new_question_received', {
        question: {
          id: q.id,
          part: q.part,
          question: q.question,
          options: q.options,
          category: q.category,
          timeLimit: 20,
          currentNumber: player.progress + 1,
          totalQuestions: player.shuffledQuestions.length
        },
        itemSlots: player.itemSlots,
        score: player.score,
        consecutiveWrong: player.consecutiveWrong
      });
    }
  }

  handlePlayerAnswer(socketId, selectedAnswer, timeSpentMs, io) {
    const player = this.players.get(socketId);
    if (!player || !player.currentQuestion || player.isFinished) return;

    const lockedUntil = Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0);
    if (lockedUntil > Date.now()) return;

    const result = this.gameEngine.processAnswer(
      player,
      player.currentQuestion,
      selectedAnswer,
      timeSpentMs
    );

    io.to(socketId).emit('answer_result_feedback', {
      ...result,
      score: player.score,
      correctAnswerIndex: player.currentQuestion.answerIndex,
      explanation: player.currentQuestion.explanation,
      itemSlots: player.itemSlots,
      freezeUntil: player.freezeUntil
    });

    const delay = result.penaltyCooldownMs > 0 ? result.penaltyCooldownMs : 800;
    setTimeout(() => {
      if (this.status === 'RACING') {
        this.sendNextQuestionToPlayer(player, io);
      }
    }, delay);
  }

  startBotRacerLoop(io) {
    this.botIntervals.forEach(i => clearInterval(i));
    this.botIntervals = [];

    for (const player of this.players.values()) {
      if (!player.isBot) continue;

      const botLoop = () => {
        if (this.status !== 'RACING' || player.isFinished) return;

        const lockedUntil = Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0);
        if (lockedUntil > Date.now()) {
          const waitTime = lockedUntil - Date.now() + 500;
          setTimeout(botLoop, waitTime);
          return;
        }

        const thinkTimeMs = Math.floor(Math.random() * 6000) + 2500;

        setTimeout(() => {
          if (this.status !== 'RACING' || player.isFinished) return;
          if (Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0) > Date.now()) {
            botLoop();
            return;
          }

          const q = player.currentQuestion || player.shuffledQuestions[player.progress];
          if (!q) {
            player.isFinished = true;
            return;
          }

          const isAccurate = Math.random() < 0.76;
          let ans = q.answerIndex;
          if (!isAccurate) {
            const wrongOptions = [0, 1, 2, 3].filter(idx => idx !== q.answerIndex);
            ans = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
          }

          const res = this.gameEngine.processAnswer(player, q, ans, thinkTimeMs);

          const delay = res.penaltyCooldownMs > 0 ? res.penaltyCooldownMs + 500 : 1000;
          setTimeout(() => {
            this.sendNextQuestionToPlayer(player, io);
            botLoop();
          }, delay);

        }, thinkTimeMs);
      };

      botLoop();
    }
  }

  endRace(io, endReason = 'ALL_FINISHED') {
    if (this.status === 'FINAL') return;
    this.status = 'FINAL';
    clearInterval(this.syncInterval);
    clearTimeout(this.raceEndTimeout);
    this.raceEndTimeout = null;

    const finalLeaderboard = this.gameEngine.calculateLeaderboard(Array.from(this.players.values()));
    const averageScore = Math.round(
      finalLeaderboard.reduce((acc, p) => acc + p.score, 0) / finalLeaderboard.length
    );

    io.to(this.pin).emit('race_game_over', {
      finalLeaderboard,
      averageScore,
      top3: finalLeaderboard.slice(0, 3),
      endReason,
      durationSec: this.raceDurationSec
    });
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostSocketId) {
    let pin;
    do {
      pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.rooms.has(pin));

    const room = new Room(pin, hostSocketId);
    this.rooms.set(pin, room);
    return room;
  }

  getRoom(pin) {
    return this.rooms.get(pin);
  }

  removeRoom(pin) {
    const room = this.rooms.get(pin);
    if (room) {
      clearInterval(room.syncInterval);
      clearTimeout(room.raceEndTimeout);
      this.rooms.delete(pin);
    }
  }
}

module.exports = new RoomManager();
