/**
 * 카트라이더 스타일 레이싱 게임 엔진
 * - 점수 보너스, 점수 뺏기, 얼음 폭탄(1턴 빙결)
 * - 오답 쿨다운 페널티 (틀릴수록 대기시간 증가)
 * - 개인별 독립 문제 진행 및 2칸 아이템 슬롯
 */

const ITEMS = {
  BONUS: { id: 'BONUS', name: '점수 부스터', desc: '랜덤 보너스 점수(+300~800점)와 급가속!', icon: '🚀', color: 'from-amber-500 to-yellow-400' },
  STEAL: { id: 'STEAL', name: '점수 뺏기', desc: '앞 순위 친구의 점수를 뺏어옵니다(-400점/+400점)!', icon: '🧲', color: 'from-purple-600 to-indigo-600' },
  ICE_BOMB: { id: 'ICE_BOMB', name: '얼음 폭탄', desc: '나보다 앞선 플레이어 중 무작위 1명을 4초간 얼립니다!', icon: '🧊', color: 'from-cyan-500 to-blue-600' }
};

class GameEngine {
  constructor(room) {
    this.room = room;
  }

  /**
   * 개인별 답안 채점 및 오답 쿨다운 계산
   */
  processAnswer(player, currentQuestion, selectedAnswer, timeSpentMs) {
    const isCorrect = selectedAnswer === currentQuestion.answerIndex;
    const isTimeout = selectedAnswer === -1; // 시간초과
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
      // 정답 시 50% 확률 또는 2연속 정답 시 아이템 획득
      if (player.itemSlots.length < 2 && (Math.random() < 0.6 || player.streak % 2 === 0)) {
        const itemKeys = Object.keys(ITEMS);
        const randomKey = itemKeys[Math.floor(Math.random() * itemKeys.length)];
        gainedItem = { ...ITEMS[randomKey], slotId: Date.now() + Math.random() };
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
    userPlayer.itemSlots.splice(slotIndex, 1); // 슬롯에서 제거

    let effectResult = { type: item.id, userName: userPlayer.nickname, success: true };

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
      const freezeDuration = 4000;
      target.iceFrozenUntil = Math.max(target.iceFrozenUntil || 0, Date.now() + freezeDuration);
      effectResult.targetName = target.nickname;
      effectResult.targetId = target.id;
      effectResult.freezeDuration = freezeDuration;
      effectResult.message = `${userPlayer.nickname}님이 ${target.nickname}님에게 [얼음 폭탄]을 투척하여 얼렸습니다! 🧊`;
    }

    return effectResult;
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

module.exports = { GameEngine, ITEMS };
