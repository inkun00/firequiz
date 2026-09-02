/**
 * 룸 매니저: 개인별 독립 퀴즈 레이싱 및 30인 동기화
 */
const quizData = require('./quizData');
const { GameEngine } = require('./gameEngine');
const { createConceptQuestionDeck } = require('./questionDeck');
const { randomUUID } = require('crypto');

const QUESTION_TIME_LIMIT_SEC = 20;
const LEADERBOARD_SYNC_INTERVAL_MS = 1000;

const BOT_NAMES = [
  "김민준", "이서연", "박도윤", "최서아", "정도현", "강지우", "조은우", "윤지아",
  "장예준", "임수아", "한시우", "오하은", "신주원", "서우진", "권지호", "황윤서",
  "안준우", "송채원", "전건우", "홍소율", "배우진", "유다은", "고선우", "문예린",
  "손연우", "양유나", "백정우", "허가은", "노현우"
];

const AVATAR_FILES = [
  '01-ember-captain', '02-aqua-mechanic', '03-volt-responder', '04-moss-guardian',
  '05-violet-medic', '06-blaze-fox', '07-frost-penguin', '08-signal-bunny',
  '09-patch-pup', '10-solar-lion', '11-cinder-scout', '12-foam-engineer',
  '13-rescue-raccoon', '14-ember-bear', '15-hydro-otter', '16-siren-cat',
  '17-ladder-giraffe', '18-spark-squirrel', '19-shield-rhino', '20-cloud-koala',
  '21-neon-dragon', '22-comet-hawk', '23-ruby-panda', '24-mint-turtle',
  '25-torch-tiger', '26-bubble-dolphin', '27-copper-robot', '28-luna-wolf',
  '29-coral-deer', '30-nova-unicorn'
];
const AVATARS = AVATAR_FILES.map(
  fileName => `/assets/racers/characters/${fileName}.webp`
);
const normalizeAvatarPath = avatar => typeof avatar === 'string'
  ? avatar.replace(/^(\/assets\/racers\/characters\/[^?#]+)\.png([?#].*)?$/i, '$1.webp$2')
  : avatar;
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
    this.raceStartTimeout = null;
    this.syncInterval = null;
    this.isSinglePlayer = false;
    this.finalEndReason = null;
  }

  addPlayer(socketId, nickname, avatar = AVATARS[0]) {
    if (this.players.size >= 30) {
      return { success: false, message: '방 인원(최대 30명)이 가득 찼습니다.' };
    }

    const questionVariantSeed = Math.floor(Math.random() * 5);
    const questionVariantRound = 0;
    const shuffledQuestions = createConceptQuestionDeck(this.questions, {
      variantSeed: questionVariantSeed,
      variantRound: questionVariantRound
    });
    const normalizedAvatar = normalizeAvatarPath(avatar);

    const player = {
      id: socketId,
      nickname: nickname || `레이서_${this.players.size + 1}`,
      avatar: AVATARS.includes(normalizedAvatar) ? normalizedAvatar : AVATARS[this.players.size % AVATARS.length],
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
      specialGuardUntil: 0,
      isBot: false,
      progress: 0,
      questionVariantSeed,
      questionVariantRound,
      shuffledQuestions: shuffledQuestions,
      currentQuestion: null,
      questionStartTime: 0,
      isFinished: false,
      sessionToken: randomUUID(),
      isConnected: true,
      answeredQuestionId: null,
      nextQuestionAt: 0,
      nextQuestionTimer: null
    };

    this.players.set(socketId, player);
    return { success: true, player };
  }

  getClientPlayer(player) {
    return {
      id: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      carColor: player.carColor,
      score: player.score,
      correctCount: player.correctCount,
      progress: player.progress,
      isFinished: player.isFinished,
      resumeToken: player.sessionToken
    };
  }

  getQuestionPayload(player) {
    const q = player.currentQuestion;
    if (!q) return null;

    return {
      id: q.id,
      type: q.type || 'multiple-choice',
      part: q.part,
      question: q.question,
      options: q.options || [],
      category: q.category,
      timeLimit: q.timeLimit || QUESTION_TIME_LIMIT_SEC,
      currentNumber: player.progress + 1,
      totalQuestions: player.shuffledQuestions.length
    };
  }

  getPlayerSnapshot(player) {
    const now = Date.now();
    const lockedUntil = Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0);
    const awaitingNextQuestion = Boolean(
      player.currentQuestion && player.answeredQuestionId === player.currentQuestion.id
    );
    const questionElapsedMs = player.questionStartTime
      ? Math.max(0, now - player.questionStartTime)
      : 0;

    return {
      status: this.status,
      player: this.getClientPlayer(player),
      leaderboard: this.gameEngine.calculateLeaderboard(Array.from(this.players.values())),
      currentQuestion: this.status === 'RACING' ? this.getQuestionPayload(player) : null,
      questionElapsedMs,
      questionTimeLeftSec: Math.max(
        0,
        Math.ceil((((player.currentQuestion?.timeLimit || QUESTION_TIME_LIMIT_SEC) * 1000) - questionElapsedMs) / 1000)
      ),
      awaitingNextQuestion,
      nextQuestionInMs: Math.max(0, (player.nextQuestionAt || 0) - now),
      itemSlots: player.itemSlots,
      consecutiveWrong: player.consecutiveWrong,
      specialGuardUntil: player.specialGuardUntil || 0,
      lockedUntil,
      lockType: player.iceFrozenUntil > now ? 'ICE_BOMB' : lockedUntil > now ? 'PENALTY' : null,
      remainingSec: this.status === 'RACING'
        ? Math.max(0, Math.ceil((this.raceEndsAt - now) / 1000))
        : this.status === 'FINAL' ? 0 : null,
      endReason: this.finalEndReason
    };
  }

  getLeaderboardUpdate(leaderboard) {
    return leaderboard.map(player => ({
      id: player.id,
      score: player.score,
      progress: player.progress,
      rank: player.rank,
      rankDelta: player.rankDelta,
      isFever: player.isFever,
      isFrozen: player.isFrozen,
      itemSlotsCount: player.itemSlotsCount
    }));
  }

  stopLeaderboardSync() {
    if (!this.syncInterval) return;
    clearInterval(this.syncInterval);
    this.syncInterval = null;
  }

  resumePlayer(socketId, sessionToken) {
    if (!sessionToken) return null;

    const player = Array.from(this.players.values()).find(
      candidate => !candidate.isBot && candidate.sessionToken === sessionToken
    );
    if (!player) return null;

    const previousSocketId = player.id;
    if (previousSocketId !== socketId) {
      this.players.delete(previousSocketId);
      player.id = socketId;
      this.players.set(socketId, player);
    }
    player.isConnected = true;

    return { player, previousSocketId };
  }

  markPlayerDisconnected(socketId) {
    const player = this.players.get(socketId);
    if (player && !player.isBot) player.isConnected = false;
  }

  fillWithBots(targetCount = 30) {
    const needCount = targetCount - this.players.size;
    if (needCount <= 0) return;

    for (let i = 0; i < needCount; i++) {
      const botId = `bot_${Date.now()}_${i}`;
      const name = BOT_NAMES[i % BOT_NAMES.length];
      const botIndex = this.players.size;
      const avatar = AVATARS[botIndex % AVATARS.length];
      const questionVariantSeed = Math.floor(Math.random() * 5);
      const questionVariantRound = 0;
      const shuffled = createConceptQuestionDeck(this.questions, {
        variantSeed: questionVariantSeed,
        variantRound: questionVariantRound
      });

      const botPlayer = {
        id: botId,
        nickname: name,
        avatar: avatar,
        carColor: CAR_COLORS[botIndex % CAR_COLORS.length],
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
        specialGuardUntil: 0,
        isBot: true,
        progress: 0,
        questionVariantSeed,
        questionVariantRound,
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
    this.stopLeaderboardSync();
    clearTimeout(this.raceEndTimeout);
    clearTimeout(this.raceStartTimeout);
    this.raceEndTimeout = null;
    this.raceStartTimeout = null;
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
      player.specialGuardUntil = 0;
      player.progress = 0;
      player.questionVariantRound = (player.questionVariantRound || 0) + 1;
      player.shuffledQuestions = createConceptQuestionDeck(this.questions, {
        variantSeed: player.questionVariantSeed || 0,
        variantRound: player.questionVariantRound
      });
      player.currentQuestion = null;
      player.questionStartTime = 0;
      player.isFinished = false;
      player.answeredQuestionId = null;
      player.nextQuestionAt = 0;
      clearTimeout(player.nextQuestionTimer);
      player.nextQuestionTimer = null;
    }
    this.finalEndReason = null;
  }

  startCountdown(io, durationSec = 300) {
    if (this.status !== 'LOBBY' || this.raceStartTimeout) return false;

    const requestedDuration = Number(durationSec);
    this.raceDurationSec = Number.isFinite(requestedDuration)
      ? Math.min(1800, Math.max(60, Math.round(requestedDuration)))
      : 300;

    io.to(this.pin).emit('game_starting_countdown', {
      count: 3,
      durationSec: this.raceDurationSec
    });

    this.raceStartTimeout = setTimeout(() => {
      this.raceStartTimeout = null;
      if (this.status === 'LOBBY') this.startRace(io);
    }, 3500);

    return true;
  }

  startRace(io) {
    if (this.status !== 'LOBBY') return false;

    clearTimeout(this.raceStartTimeout);
    this.raceStartTimeout = null;
    this.stopLeaderboardSync();
    this.status = 'RACING';
    this.finalEndReason = null;
    this.raceStartTime = Date.now();
    this.raceEndsAt = this.raceStartTime + (this.raceDurationSec * 1000);
    clearTimeout(this.raceEndTimeout);
    this.raceEndTimeout = setTimeout(() => {
      this.endRace(io, 'TIME_UP');
    }, this.raceDurationSec * 1000);

    const initialLeaderboard = this.gameEngine.calculateLeaderboard(Array.from(this.players.values()));
    io.to(this.pin).emit('race_roster_snapshot', {
      leaderboard: initialLeaderboard,
      remainingSec: this.raceDurationSec,
      durationSec: this.raceDurationSec
    });

    for (const player of this.players.values()) {
      this.sendNextQuestionToPlayer(player, io);
    }

    this.startBotRacerLoop(io);

    const syncInterval = setInterval(() => {
      if (this.status !== 'RACING') {
        clearInterval(syncInterval);
        if (this.syncInterval === syncInterval) this.syncInterval = null;
        return;
      }
      const leaderboard = this.gameEngine.calculateLeaderboard(Array.from(this.players.values()));
      const remainingSec = Math.max(0, Math.ceil((this.raceEndsAt - Date.now()) / 1000));
      io.to(this.pin).emit('race_leaderboard_sync', {
        leaderboard: this.getLeaderboardUpdate(leaderboard),
        remainingSec,
        durationSec: this.raceDurationSec
      });

      const allFinished = Array.from(this.players.values()).every(
        p => p.isFinished || p.progress >= p.shuffledQuestions.length
      );
      if (allFinished) {
        this.endRace(io, 'ALL_FINISHED');
      }
    }, LEADERBOARD_SYNC_INTERVAL_MS);
    this.syncInterval = syncInterval;
    return true;
  }

  sendNextQuestionToPlayer(player, io) {
    clearTimeout(player.nextQuestionTimer);
    player.nextQuestionTimer = null;
    player.nextQuestionAt = 0;
    player.answeredQuestionId = null;

    if (player.progress >= player.shuffledQuestions.length) {
      player.isFinished = true;
      player.currentQuestion = null;
      player.questionStartTime = 0;
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
        question: this.getQuestionPayload(player),
        itemSlots: player.itemSlots,
        score: player.score,
        consecutiveWrong: player.consecutiveWrong,
        lockedUntil: Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0),
        lockType: player.iceFrozenUntil > Date.now() ? 'ICE_BOMB' : null
      });
    }
  }

  usePlayerItem(socketId, slotIndex, io) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '플레이어를 찾을 수 없습니다.' };

    const effect = this.gameEngine.useItem(player, slotIndex);

    // 회복형 아이템의 잠금 단축량을 실제 다음 문제 대기에도 동일하게 반영합니다.
    if (
      effect.success &&
      effect.recoveryApplied &&
      player.currentQuestion &&
      player.answeredQuestionId === player.currentQuestion.id &&
      player.nextQuestionTimer
    ) {
      const now = Date.now();
      const recoveryDelayMs = Math.max(250, (effect.lockedUntil || 0) - now);
      if (player.nextQuestionAt > now + recoveryDelayMs) {
        clearTimeout(player.nextQuestionTimer);
        player.nextQuestionAt = now + recoveryDelayMs;
        player.nextQuestionTimer = setTimeout(() => {
          player.nextQuestionTimer = null;
          player.nextQuestionAt = 0;
          if (this.status === 'RACING') this.sendNextQuestionToPlayer(player, io);
        }, recoveryDelayMs);
        effect.nextQuestionInMs = recoveryDelayMs;
      }
    }

    return effect;
  }

  handlePlayerAnswer(socketId, questionId, selectedAnswer, timeSpentMs, io) {
    const player = this.players.get(socketId);
    if (!player) return { accepted: false, reason: 'PLAYER_NOT_FOUND' };
    if (!player.currentQuestion || player.isFinished) {
      return { accepted: false, reason: 'QUESTION_NOT_AVAILABLE' };
    }
    if (questionId != null && questionId !== player.currentQuestion.id) {
      return { accepted: false, reason: 'QUESTION_MISMATCH' };
    }
    if (player.answeredQuestionId === player.currentQuestion.id) {
      return {
        accepted: false,
        reason: 'ALREADY_ANSWERED',
        retryAfterMs: Math.max(0, (player.nextQuestionAt || 0) - Date.now())
      };
    }

    const lockedUntil = Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0);
    if (lockedUntil > Date.now()) {
      return {
        accepted: false,
        reason: 'LOCKED',
        lockedUntil,
        lockType: player.iceFrozenUntil > Date.now() ? 'ICE_BOMB' : 'PENALTY'
      };
    }

    const answeredQuestion = player.currentQuestion;
    player.answeredQuestionId = answeredQuestion.id;

    const result = this.gameEngine.processAnswer(
      player,
      answeredQuestion,
      selectedAnswer,
      timeSpentMs
    );

    const activeLockUntil = Math.max(player.freezeUntil || 0, player.iceFrozenUntil || 0);

    io.to(socketId).emit('answer_result_feedback', {
      ...result,
      score: player.score,
      correctAnswerIndex: answeredQuestion.answerIndex,
      correctAnswer: answeredQuestion.type === 'short-answer' ? answeredQuestion.answer : undefined,
      explanation: answeredQuestion.explanation,
      itemSlots: player.itemSlots,
      lockedUntil: activeLockUntil,
      lockType: player.iceFrozenUntil > Date.now() ? 'ICE_BOMB' : result.penaltyCooldownMs > 0 ? 'PENALTY' : null
    });

    const delay = result.penaltyCooldownMs > 0 ? result.penaltyCooldownMs : 800;
    clearTimeout(player.nextQuestionTimer);
    player.nextQuestionAt = Date.now() + delay;
    player.nextQuestionTimer = setTimeout(() => {
      player.nextQuestionTimer = null;
      player.nextQuestionAt = 0;
      if (this.status === 'RACING') {
        this.sendNextQuestionToPlayer(player, io);
      }
    }, delay);

    return { accepted: true, questionId: answeredQuestion.id };
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
          let ans;
          if (q.type === 'short-answer') {
            ans = isAccurate ? q.answer : '오답';
          } else {
            ans = q.answerIndex;
            if (!isAccurate) {
              const wrongOptions = [0, 1, 2, 3].filter(idx => idx !== q.answerIndex);
              ans = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
            }
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
    this.finalEndReason = endReason;
    this.stopLeaderboardSync();
    clearTimeout(this.raceEndTimeout);
    clearTimeout(this.raceStartTimeout);
    this.raceEndTimeout = null;
    this.raceStartTimeout = null;
    for (const player of this.players.values()) {
      clearTimeout(player.nextQuestionTimer);
      player.nextQuestionTimer = null;
      player.nextQuestionAt = 0;
    }

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

  markPlayerDisconnected(socketId) {
    for (const room of this.rooms.values()) {
      room.markPlayerDisconnected(socketId);
    }
  }

  removeSingleRoomsForSocket(socketId) {
    for (const [pin, room] of this.rooms.entries()) {
      if (room.isSinglePlayer && room.hostSocketId === socketId) {
        this.removeRoom(pin);
      }
    }
  }

  removeRoom(pin) {
    const room = this.rooms.get(pin);
    if (room) {
      room.stopLeaderboardSync();
      clearTimeout(room.raceEndTimeout);
      clearTimeout(room.raceStartTimeout);
      for (const player of room.players.values()) {
        clearTimeout(player.nextQuestionTimer);
      }
      this.rooms.delete(pin);
    }
  }
}

module.exports = new RoomManager();
