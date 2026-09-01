/**
 * 카트라이더 스타일 레이싱 게임 엔진
 * - 점수 보너스, 점수 뺏기, 얼음 폭탄(1턴 빙결)
 * - 오답 쿨다운 페널티 (틀릴수록 대기시간 증가)
 * - 개인별 독립 문제 진행 및 2칸 아이템 슬롯
 */

const {
  getAvatarKey,
  getCharacterItem
} = require('./characterItems');

const ITEM_DROP_RATE = 0.5;

const ITEMS = {
  BONUS: { id: 'BONUS', name: '점수 부스터', desc: '랜덤 보너스 점수(+300~800점)와 급가속!', icon: '🚀', color: 'from-amber-500 to-yellow-400' },
  STEAL: { id: 'STEAL', name: '점수 뺏기', desc: '앞 순위 친구의 점수를 뺏어옵니다(-400점/+400점)!', icon: '🧲', color: 'from-purple-600 to-indigo-600' },
  ICE_BOMB: { id: 'ICE_BOMB', name: '얼음 폭탄', desc: '나보다 앞선 플레이어 중 무작위 1명을 4초간 얼립니다!', icon: '🧊', color: 'from-cyan-500 to-blue-600' }
};

function normalizeShortAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s/gu, '')
    .replace(/[!！?？。]+$/gu, '')
    .replace(/[～〜]/gu, '~');
}

function isCorrectAnswer(question, submittedAnswer) {
  if (submittedAnswer === -1) return false;
  if (question.type !== 'short-answer') {
    return submittedAnswer === question.answerIndex;
  }

  const normalized = normalizeShortAnswer(submittedAnswer);
  return Boolean(normalized) && question.acceptedAnswers.some(
    (answer) => normalizeShortAnswer(answer) === normalized
  );
}

class GameEngine {
  constructor(room) {
    this.room = room;
  }

  /**
   * 개인별 답안 채점 및 오답 쿨다운 계산
   */
  processAnswer(player, currentQuestion, selectedAnswer, timeSpentMs) {
    const isTimeout = selectedAnswer === -1; // 시간초과
    const isCorrect = isCorrectAnswer(currentQuestion, selectedAnswer);
    const totalTimeMs = (currentQuestion.timeLimit || 20) * 1000;

    let pointsEarned = 0;
    let speedBonus = 0;
    let gainedItem = null;
    let penaltyCooldownMs = 0;

    if (isCorrect) {
      // 1. 기본 점수 1000점 + 남은 시간 비례 스피드 보너스 (최대 500점)
      const remainingTimeMs = Math.max(0, totalTimeMs - timeSpentMs);
      speedBonus = Math.round((remainingTimeMs / totalTimeMs) * 500);
      pointsEarned = 1000 + speedBonus;

      player.score += pointsEarned;
      player.correctCount += 1;
      player.consecutiveWrong = 0; // 오답 연속 횟수 리셋
      player.streak += 1;
      player.isFever = player.streak >= 3;

      // 2. 카트라이더 아이템 획득 (슬롯 최대 2개)
      // 연속 정답 횟수의 홀짝과 관계없이 정답마다 50% 확률로 아이템 획득
      if (player.itemSlots.length < 2 && Math.random() < ITEM_DROP_RATE) {
        const characterItem = getCharacterItem(player.avatar);
        const specialRateWithinDrop = characterItem
          ? Math.min(1, characterItem.dropRate / ITEM_DROP_RATE)
          : 0;
        const selectedItem = characterItem && Math.random() < specialRateWithinDrop
          ? characterItem
          : Object.values(ITEMS)[Math.floor(Math.random() * Object.keys(ITEMS).length)];
        gainedItem = { ...selectedItem, slotId: Date.now() + Math.random() };
        player.itemSlots.push(gainedItem);
      }
    } else {
      // 오답 또는 시간 초과
      player.streak = 0;
      player.isFever = false;
      player.consecutiveWrong += 1;

      // 틀릴수록 다음 문제 출제 간격(쿨다운) 증가
      // 1회 틀림: 2.5초, 2회 틀림: 4.5초, 3회 이상: 6.5초
      if (player.consecutiveWrong === 1) {
        penaltyCooldownMs = 2500;
      } else if (player.consecutiveWrong === 2) {
        penaltyCooldownMs = 4500;
      } else {
        penaltyCooldownMs = 6500;
      }

      player.freezeUntil = Date.now() + penaltyCooldownMs;
    }

    player.progress += 1; // 문제 진행도 증가

    return {
      isCorrect,
      isTimeout,
      pointsEarned,
      speedBonus,
      gainedItem,
      penaltyCooldownMs,
      consecutiveWrong: player.consecutiveWrong
    };
  }

  /**
   * 아이템 사용 처리
   */
  useItem(userPlayer, slotIndex, targetPlayerId = null) {
    if (slotIndex < 0 || slotIndex >= userPlayer.itemSlots.length) {
      return { success: false, message: '아이템이 없습니다.' };
    }

    const item = userPlayer.itemSlots[slotIndex];
    const now = Date.now();
    const lockedUntil = Math.max(userPlayer.freezeUntil || 0, userPlayer.iceFrozenUntil || 0);

    if (lockedUntil > now && item.effectType !== 'RECOVERY') {
      return { success: false, type: item.id, message: '잠금 중에는 회복형 전용 아이템만 사용할 수 있습니다.' };
    }

    if (item.isCharacterSpecial && item.ownerAvatar !== getAvatarKey(userPlayer.avatar)) {
      return { success: false, type: item.id, message: '현재 캐릭터의 전용 아이템이 아닙니다.' };
    }

    userPlayer.itemSlots.splice(slotIndex, 1); // 슬롯에서 제거

    let effectResult = {
      type: item.id,
      itemName: item.name,
      effectType: item.effectType || item.id,
      userId: userPlayer.id,
      userName: userPlayer.nickname,
      success: true
    };

    if (item.id === 'BONUS') {
      // 1. 점수 보너스 (+300~800점)
      const bonusScore = Math.floor(Math.random() * 500) + 300;
      userPlayer.score += bonusScore;
      effectResult.bonusScore = bonusScore;
      effectResult.message = `${userPlayer.nickname}님이 [점수 부스터] 발동! (+${bonusScore}점)`;
    } 
    else if (item.id === 'STEAL') {
      // 2. 점수 뺏기 (내 바로 앞 순위 또는 1위 유저)
      const leaderboard = this.calculateLeaderboard(Array.from(this.room.players.values()));
      const myIdx = leaderboard.findIndex(p => p.id === userPlayer.id);
      let target = null;

      if (myIdx > 0) {
        target = this.room.players.get(leaderboard[myIdx - 1].id);
      } else if (leaderboard.length > 1) {
        target = this.room.players.get(leaderboard[1].id);
      }

      if (target && target.score > 100) {
        if (this.consumeSpecialGuard(target)) {
          effectResult.targetName = target.nickname;
          effectResult.targetId = target.id;
          effectResult.blocked = true;
          effectResult.message = `${target.nickname}님의 전용 방패가 ${userPlayer.nickname}님의 [점수 뺏기]를 막았습니다! 🛡️`;
          return effectResult;
        }

        const stealAmount = Math.min(target.score, Math.floor(Math.random() * 300) + 300);
        target.score -= stealAmount;
        userPlayer.score += stealAmount;
        effectResult.targetName = target.nickname;
        effectResult.targetId = target.id;
        effectResult.stealAmount = stealAmount;
        effectResult.message = `${userPlayer.nickname}님이 ${target.nickname}님의 점수 ${stealAmount}점을 강탈했습니다! 🧲`;
      } else {
        const fallbackBonus = 400;
        userPlayer.score += fallbackBonus;
        effectResult.bonusScore = fallbackBonus;
        effectResult.message = `${userPlayer.nickname}님이 점수 뺏기 시도! (+${fallbackBonus}점)`;
      }
    } 
    else if (item.id === 'ICE_BOMB') {
      // 3. 얼음 폭탄 (내 현재 순위보다 앞선 플레이어 중 무작위 1명을 4초간 얼리기)
      const leaderboard = this.calculateLeaderboard(Array.from(this.room.players.values()));
      const myIdx = leaderboard.findIndex(p => p.id === userPlayer.id);
      const aheadPlayers = myIdx > 0 ? leaderboard.slice(0, myIdx) : [];

      if (aheadPlayers.length === 0) {
        // 1위는 공격할 대상이 없으므로 아이템을 소모하지 않습니다.
        userPlayer.itemSlots.splice(slotIndex, 0, item);
        effectResult.success = false;
        effectResult.message = `${userPlayer.nickname}님보다 앞선 플레이어가 없어 [얼음 폭탄]을 사용할 수 없습니다.`;
        return effectResult;
      }

      const randomTarget = aheadPlayers[Math.floor(Math.random() * aheadPlayers.length)];
      const target = this.room.players.get(randomTarget.id);

      if (this.consumeSpecialGuard(target)) {
        effectResult.targetName = target.nickname;
        effectResult.targetId = target.id;
        effectResult.blocked = true;
        effectResult.message = `${target.nickname}님의 전용 방패가 ${userPlayer.nickname}님의 [얼음 폭탄]을 막았습니다! 🛡️`;
        return effectResult;
      }

      const freezeDuration = 4000;
      target.iceFrozenUntil = Math.max(target.iceFrozenUntil || 0, Date.now() + freezeDuration);
      effectResult.targetName = target.nickname;
      effectResult.targetId = target.id;
      effectResult.freezeDuration = freezeDuration;
      effectResult.lockedUntil = target.iceFrozenUntil;
      effectResult.message = `${userPlayer.nickname}님이 ${target.nickname}님에게 [얼음 폭탄]을 투척하여 얼렸습니다! 🧊`;
    }
    else if (item.isCharacterSpecial) {
      effectResult = this.applyCharacterSpecial(userPlayer, item, effectResult);
    }

    return effectResult;
  }

  consumeSpecialGuard(target) {
    if (!target || !target.specialGuardUntil || target.specialGuardUntil <= Date.now()) {
      return false;
    }

    target.specialGuardUntil = 0;
    return true;
  }

  applyCharacterSpecial(userPlayer, item, effectResult) {
    if (item.effectType === 'BOOST') {
      userPlayer.score += item.score;
      effectResult.bonusScore = item.score;
      effectResult.message = `${userPlayer.nickname}님의 [${item.name}] 발동! (+${item.score}점) ${item.icon}`;
      return effectResult;
    }

    if (item.effectType === 'RECOVERY') {
      const now = Date.now();
      const reduceLock = (lockedUntil = 0) => {
        if (lockedUntil <= now || item.fullRecovery) return 0;
        const reducedUntil = lockedUntil - (item.cooldownReductionMs || 0);
        return reducedUntil > now ? reducedUntil : 0;
      };

      userPlayer.score += item.score;
      userPlayer.freezeUntil = reduceLock(userPlayer.freezeUntil);
      userPlayer.iceFrozenUntil = reduceLock(userPlayer.iceFrozenUntil);
      userPlayer.consecutiveWrong = Math.max(
        0,
        userPlayer.consecutiveWrong - (item.wrongReduction || 0)
      );
      effectResult.bonusScore = item.score;
      effectResult.recoveryApplied = true;
      effectResult.lockedUntil = Math.max(userPlayer.freezeUntil || 0, userPlayer.iceFrozenUntil || 0);
      effectResult.clearLock = effectResult.lockedUntil <= now;
      effectResult.message = `${userPlayer.nickname}님의 [${item.name}] 발동! ${item.desc} ${item.icon}`;
      return effectResult;
    }

    if (item.effectType === 'GUARD') {
      userPlayer.score += item.score;
      userPlayer.specialGuardUntil = Date.now() + item.durationMs;
      effectResult.bonusScore = item.score;
      effectResult.guardUntil = userPlayer.specialGuardUntil;
      effectResult.message = `${userPlayer.nickname}님의 [${item.name}] 발동! ${item.desc} ${item.icon}`;
      return effectResult;
    }

    if (item.effectType === 'CONTROL') {
      const leaderboard = this.calculateLeaderboard(Array.from(this.room.players.values()));
      const myIdx = leaderboard.findIndex(player => player.id === userPlayer.id);
      const aheadPlayers = myIdx > 0 ? leaderboard.slice(0, myIdx) : [];

      if (aheadPlayers.length === 0) {
        userPlayer.score += item.fallbackScore;
        effectResult.bonusScore = item.fallbackScore;
        effectResult.message = `${userPlayer.nickname}님의 [${item.name}]은 대상이 없어 안전 가속으로 전환! (+${item.fallbackScore}점) ${item.icon}`;
        return effectResult;
      }

      const randomTarget = aheadPlayers[Math.floor(Math.random() * aheadPlayers.length)];
      const target = this.room.players.get(randomTarget.id);
      effectResult.targetName = target.nickname;
      effectResult.targetId = target.id;

      if (this.consumeSpecialGuard(target)) {
        effectResult.blocked = true;
        effectResult.message = `${target.nickname}님의 전용 방패가 ${userPlayer.nickname}님의 [${item.name}]을 막았습니다! 🛡️`;
        return effectResult;
      }

      target.iceFrozenUntil = Math.max(
        target.iceFrozenUntil || 0,
        Date.now() + item.durationMs
      );
      effectResult.freezeDuration = item.durationMs;
      effectResult.lockedUntil = target.iceFrozenUntil;
      effectResult.message = `${userPlayer.nickname}님의 [${item.name}]이 ${target.nickname}님을 ${item.durationMs / 1000}초간 늦췄습니다! ${item.icon}`;
      return effectResult;
    }

    return { ...effectResult, success: false, message: '지원하지 않는 전용 아이템입니다.' };
  }

  /**
   * 실시간 순위 리더보드 계산
   */
  calculateLeaderboard(players) {
    const sorted = [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.progress !== a.progress) return b.progress - a.progress;
      return b.correctCount - a.correctCount;
    });

    return sorted.map((p, index) => {
      const newRank = index + 1;
      const prevRank = p.rank || newRank;
      const rankDelta = prevRank - newRank;

      p.prevRank = prevRank;
      p.rank = newRank;
      p.rankDelta = rankDelta;

      return {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        carColor: p.carColor || 'RED',
        score: p.score,
        progress: p.progress,
        rank: newRank,
        prevRank: prevRank,
        rankDelta: rankDelta,
        streak: p.streak,
        isFever: p.isFever,
        isFrozen: Boolean(p.iceFrozenUntil && p.iceFrozenUntil > Date.now()),
        isBot: p.isBot || false,
        itemSlotsCount: p.itemSlots?.length || 0
      };
    });
  }
}

module.exports = { GameEngine, ITEMS, ITEM_DROP_RATE, isCorrectAnswer, normalizeShortAnswer };
