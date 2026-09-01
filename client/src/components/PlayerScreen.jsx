import React, { useState, useEffect, useRef } from 'react';
import { Timer, Snowflake, Flame, AlertOctagon, CheckCircle2, XCircle, Trophy, Sparkles } from 'lucide-react';
import KartTrack3D from './KartTrack3D';
import ItemSlots from './ItemSlots';
import { sounds } from '../utils/sound';
import AvatarPortrait from './AvatarPortrait';
import { mergeLeaderboardUpdate } from '../utils/leaderboard';

export default function PlayerScreen({ socket, pin, playerInfo, resumeState = null }) {
  const [gameState, setGameState] = useState('LOBBY'); // LOBBY, RACING, FINISHED
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [shortAnswer, setShortAnswer] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [leaderboard, setLeaderboard] = useState([]);
  const [itemSlots, setItemSlots] = useState([]);
  const [itemAlert, setItemAlert] = useState(null);
  const [remainingSec, setRemainingSec] = useState(null);
  const [raceEndReason, setRaceEndReason] = useState(null);
  const [raceCountdown, setRaceCountdown] = useState(3);
  
  const [freezeTimeLeft, setFreezeTimeLeft] = useState(0);
  const [isIceFrozen, setIsIceFrozen] = useState(false);
  const [consecutiveWrong, setConsecutiveWrong] = useState(0);

  const questionStartTimeRef = useRef(0);
  const timerRef = useRef(null);
  const raceCountdownTimerRef = useRef(null);
  const cooldownTimerRef = useRef(null);

  const stopCooldownTimer = () => {
    clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = null;
    setFreezeTimeLeft(0);
    setIsIceFrozen(false);
  };

  const startCooldownTimer = (lockedUntil, lockType = 'PENALTY') => {
    clearInterval(cooldownTimerRef.current);

    const updateRemainingTime = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setFreezeTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
        setIsIceFrozen(false);
      }
    };

    setIsIceFrozen(lockType === 'ICE_BOMB');
    updateRemainingTime();
    if (lockedUntil > Date.now()) {
      cooldownTimerRef.current = setInterval(updateRemainingTime, 250);
    }
  };

  const applyPlayerSnapshot = (snapshot) => {
    if (!snapshot) return;

    setLeaderboard(snapshot.leaderboard || []);
    setItemSlots(snapshot.itemSlots || []);
    setConsecutiveWrong(snapshot.consecutiveWrong || 0);
    if (Number.isFinite(snapshot.remainingSec)) setRemainingSec(snapshot.remainingSec);

    if (snapshot.lockedUntil > Date.now()) {
      startCooldownTimer(snapshot.lockedUntil, snapshot.lockType);
    } else {
      stopCooldownTimer();
    }

    if (snapshot.status === 'RACING' && snapshot.player?.isFinished) {
      setGameState('FINISHED');
      setCurrentQuestion(null);
      setSelectedOption(null);
      setShortAnswer('');
      setRaceEndReason('ALL_QUESTIONS_COMPLETE');
      return;
    }

    if (snapshot.status === 'RACING') {
      setGameState('RACING');
      setCurrentQuestion(snapshot.currentQuestion || null);
      setSelectedOption(snapshot.awaitingNextQuestion ? -2 : null);
      setShortAnswer('');
      setAnswerFeedback(null);
      setTimeLeft(snapshot.questionTimeLeftSec ?? snapshot.currentQuestion?.timeLimit ?? 20);
      questionStartTimeRef.current = Date.now() - (snapshot.questionElapsedMs || 0);
      return;
    }

    if (snapshot.status === 'FINAL') {
      setGameState('FINISHED');
      setCurrentQuestion(null);
      setSelectedOption(null);
      setShortAnswer('');
      setRemainingSec(0);
      setRaceEndReason(snapshot.endReason || 'MANUAL');
      return;
    }

    setGameState('LOBBY');
    setCurrentQuestion(null);
    setSelectedOption(null);
    setShortAnswer('');
    setAnswerFeedback(null);
    setRaceEndReason(null);
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('game_starting_countdown', ({ count = 3 }) => {
      clearInterval(raceCountdownTimerRef.current);
      setGameState('COUNTDOWN');
      setRaceCountdown(count);
      sounds.playCountdown();
      raceCountdownTimerRef.current = setInterval(() => {
        setRaceCountdown((previous) => {
          if (previous <= 1) {
            clearInterval(raceCountdownTimerRef.current);
            sounds.playGameStart();
            return 0;
          }
          sounds.playCountdown();
          return previous - 1;
        });
      }, 1000);
    });

    socket.on('new_question_received', ({
      question,
      itemSlots: slots,
      consecutiveWrong: wrongs,
      lockedUntil = 0,
      lockType = null
    }) => {
      setGameState('RACING');
      setCurrentQuestion(question);
      setSelectedOption(null);
      setShortAnswer('');
      setAnswerFeedback(null);
      setTimeLeft(question.timeLimit || 20);
      setItemSlots(slots || []);
      setConsecutiveWrong(wrongs || 0);
      questionStartTimeRef.current = Date.now();
      if (lockedUntil > Date.now()) {
        startCooldownTimer(lockedUntil, lockType);
      } else {
        stopCooldownTimer();
      }
      sounds.playCountdown();
    });

    socket.on('answer_result_feedback', (data) => {
      setAnswerFeedback(data);
      setItemSlots(data.itemSlots || []);
      setConsecutiveWrong(data.consecutiveWrong || 0);

      if (data.isCorrect) {
        sounds.playCorrect();
      } else {
        sounds.playWrong();
        if (data.lockedUntil > Date.now()) {
          startCooldownTimer(data.lockedUntil, data.lockType);
        }
      }
    });

    socket.on('race_roster_snapshot', ({ leaderboard: lb, remainingSec: serverRemainingSec }) => {
      setLeaderboard(lb || []);
      if (Number.isFinite(serverRemainingSec)) setRemainingSec(serverRemainingSec);
    });

    socket.on('race_leaderboard_sync', ({ leaderboard: lb, remainingSec: serverRemainingSec }) => {
      setLeaderboard(previous => mergeLeaderboardUpdate(previous, lb));
      if (Number.isFinite(serverRemainingSec)) setRemainingSec(serverRemainingSec);
    });

    socket.on('item_effect_broadcast', (effect) => {
      setItemAlert(effect.message);
      sounds.playItem();
      setTimeout(() => setItemAlert(null), 3000);

      if (effect.targetId === socket.id && effect.type === 'ICE_BOMB') {
        startCooldownTimer(effect.lockedUntil || Date.now() + (effect.freezeDuration || 4000), 'ICE_BOMB');
      }
    });

    socket.on('player_state_sync', applyPlayerSnapshot);

    socket.on('item_slots_updated', ({ itemSlots: slots }) => {
      setItemSlots(slots || []);
    });

    socket.on('player_race_finished', () => {
      setRaceEndReason('ALL_QUESTIONS_COMPLETE');
      setGameState('FINISHED');
    });

    socket.on('race_game_over', ({ finalLeaderboard, endReason }) => {
      setLeaderboard(finalLeaderboard || []);
      setRemainingSec(0);
      setRaceEndReason(endReason || 'MANUAL');
      setCurrentQuestion(null);
      setSelectedOption(null);
      setShortAnswer('');
      stopCooldownTimer();
      setGameState('FINISHED');
    });

    // 호스트가 로비로 리셋했을 때 초기화
    socket.on('game_reset_to_lobby', () => {
      setGameState('LOBBY');
      setCurrentQuestion(null);
      setSelectedOption(null);
      setShortAnswer('');
      setAnswerFeedback(null);
      setTimeLeft(20);
      setItemSlots([]);
      stopCooldownTimer();
      setConsecutiveWrong(0);
      setRemainingSec(null);
      setRaceEndReason(null);
      setRaceCountdown(3);
    });

    return () => {
      clearInterval(raceCountdownTimerRef.current);
      socket.off('game_starting_countdown');
      socket.off('new_question_received');
      socket.off('answer_result_feedback');
      socket.off('race_roster_snapshot');
      socket.off('race_leaderboard_sync');
      socket.off('item_effect_broadcast');
      socket.off('player_state_sync');
      socket.off('item_slots_updated');
      socket.off('player_race_finished');
      socket.off('race_game_over');
      socket.off('game_reset_to_lobby');
    };
  }, [socket]);

  useEffect(() => {
    applyPlayerSnapshot(resumeState);
  }, [resumeState]);

  useEffect(() => () => {
    clearInterval(cooldownTimerRef.current);
    clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (gameState !== 'RACING' || !currentQuestion || selectedOption !== null || freezeTimeLeft > 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [gameState, currentQuestion, selectedOption, freezeTimeLeft]);

  const handleTimeOut = () => {
    if (selectedOption !== null) return;
    setSelectedOption(-1);
    socket.timeout(5000).emit('player_submit_answer', {
      pin,
      questionId: currentQuestion?.id,
      selectedAnswer: -1,
      timeSpentMs: (currentQuestion?.timeLimit || 20) * 1000
    }, (error, response) => {
      if (!error && response?.accepted) return;
      if (response?.reason === 'ALREADY_ANSWERED') {
        setSelectedOption(-2);
        return;
      }
      setSelectedOption(null);
      if (response?.lockedUntil > Date.now()) {
        startCooldownTimer(response.lockedUntil, response.lockType);
      }
    });
  };

  const handleSelectOption = (index) => {
    if (selectedOption !== null || freezeTimeLeft > 0 || gameState !== 'RACING') return;

    const timeSpentMs = Date.now() - questionStartTimeRef.current;
    setSelectedOption(index);
    clearInterval(timerRef.current);

    socket.timeout(5000).emit('player_submit_answer', {
      pin,
      questionId: currentQuestion?.id,
      selectedAnswer: index,
      timeSpentMs
    }, (error, response) => {
      if (!error && response?.accepted) return;
      if (response?.reason === 'ALREADY_ANSWERED') {
        setSelectedOption(-2);
        return;
      }
      setSelectedOption(null);
      if (response?.lockedUntil > Date.now()) {
        startCooldownTimer(response.lockedUntil, response.lockType);
      }
    });
  };

  const handleSubmitShortAnswer = (event) => {
    event.preventDefault();
    const submittedAnswer = shortAnswer.trim();
    if (!submittedAnswer || selectedOption !== null || freezeTimeLeft > 0 || gameState !== 'RACING') return;

    const timeSpentMs = Date.now() - questionStartTimeRef.current;
    setSelectedOption(-3);
    clearInterval(timerRef.current);

    socket.timeout(5000).emit('player_submit_answer', {
      pin,
      questionId: currentQuestion?.id,
      selectedAnswer: submittedAnswer,
      timeSpentMs
    }, (error, response) => {
      if (!error && response?.accepted) return;
      if (response?.reason === 'ALREADY_ANSWERED') {
        setSelectedOption(-2);
        return;
      }
      setSelectedOption(null);
      if (response?.lockedUntil > Date.now()) {
        startCooldownTimer(response.lockedUntil, response.lockType);
      }
    });
  };

  const handleUseItem = (slotIndex) => {
    if (freezeTimeLeft > 0) return;
    socket.emit('player_use_item', {
      pin,
      slotIndex
    });
  };

  const OPTION_COLORS = [
    'from-red-500 to-rose-600 border-red-300 active:scale-95 shadow-red-900/50',
    'from-blue-500 to-cyan-600 border-blue-300 active:scale-95 shadow-blue-900/50',
    'from-amber-500 to-yellow-500 border-yellow-200 active:scale-95 shadow-amber-900/50 text-slate-950',
    'from-emerald-500 to-green-600 border-green-300 active:scale-95 shadow-green-900/50',
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-3 md:p-4 font-['Noto_Sans_KR'] select-none max-w-lg mx-auto">
      {/* 1. 상단 아이템 발동 배너 */}
      {itemAlert && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-bold text-sm shadow-2xl animate-bounce border border-yellow-300 max-w-sm text-center">
          {itemAlert}
        </div>
      )}

      {/* 2. 3D 넥슨 카트라이더 주행 뷰 (KartTrack3D) */}
      <div className="mb-3">
        <KartTrack3D
          myId={socket.id}
          myAvatar={playerInfo.avatar}
          leaderboard={leaderboard}
          racePhase={gameState}
          countdown={raceCountdown}
          isFever={leaderboard.find(p => p.id === socket.id)?.isFever || false}
          isFrozen={isIceFrozen}
          isPaused={freezeTimeLeft > 0}
          raceTimeSec={remainingSec}
        />
      </div>

      {/* 3. 대시보드 바: 내 정보 + 2칸 3D 아이템 슬롯 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-3 py-2 rounded-2xl flex-1 shadow-lg">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-yellow-400">
            <AvatarPortrait avatar={playerInfo.avatar} alt={`${playerInfo.nickname} 캐릭터`} />
          </div>
          <div className="truncate">
            <span className="font-bold text-sm truncate text-white block">{playerInfo.nickname}</span>
            <span className="text-xs text-yellow-400 font-bold font-['Jua']">
              {leaderboard.find(p => p.id === socket.id)?.score?.toLocaleString() || 0}점
            </span>
          </div>
        </div>

        {/* 2칸 3D 아이템 슬롯 */}
        <ItemSlots
          itemSlots={itemSlots}
          onUseItem={handleUseItem}
          disabled={freezeTimeLeft > 0 || gameState !== 'RACING'}
        />
      </div>

      {/* 4. 레이스 대기실 */}
      {gameState === 'LOBBY' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-900/80 rounded-3xl border border-slate-800 shadow-xl">
          <div className="w-24 h-24 mb-3 rounded-2xl overflow-hidden border-2 border-yellow-400 shadow-xl animate-bounce">
            <AvatarPortrait avatar={playerInfo.avatar} alt={`${playerInfo.nickname} 출전 캐릭터`} />
          </div>
          <h2 className="text-2xl font-black text-yellow-300 font-['Jua'] mb-2">
            3D 카트 레이스 출발 대기 중!
          </h2>
          <p className="text-gray-300 text-sm mb-4">
            선생님이 출발 신호를 보내면 각자 퀴즈 레이싱이 시작됩니다!
          </p>
          <div className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-gray-400 font-bold">
            방 번호(PIN): {pin}
          </div>
        </div>
      )}

      {gameState === 'COUNTDOWN' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-900/80 rounded-3xl border border-yellow-400/70 shadow-xl">
          <h2 className="text-2xl font-black text-yellow-300 font-['Jua'] mb-2">출발 준비!</h2>
          <p className="text-sm font-bold text-slate-300">카운트가 끝나면 퀴즈 레이스가 바로 시작됩니다.</p>
        </div>
      )}

      {gameState === 'RACING' && !currentQuestion && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-900/80 rounded-3xl border border-cyan-400/60 shadow-xl">
          <div className="text-5xl mb-3 animate-pulse">🔄</div>
          <h2 className="text-xl font-black text-cyan-300 font-['Jua'] mb-2">레이스 상태 복구 중</h2>
          <p className="text-sm font-bold text-slate-300">현재 문제를 불러오고 있습니다.</p>
        </div>
      )}

      {/* 5. 퀴즈 풀이 영역 */}
      {gameState === 'RACING' && currentQuestion && (
        <div className="flex-1 flex flex-col justify-between relative">
          {selectedOption === -2 && freezeTimeLeft <= 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-slate-950/70 backdrop-blur-sm">
              <div className="rounded-2xl border border-cyan-400 bg-slate-900 px-5 py-3 text-sm font-black text-cyan-200 shadow-xl">
                다음 문제 준비 중...
              </div>
            </div>
          )}
          {/* 빙결 / 오답 쿨다운 오버레이 */}
          {freezeTimeLeft > 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md rounded-3xl border-2 border-cyan-400 p-6 text-center animate-fade-in">
              {isIceFrozen ? (
                <>
                  <div className="w-20 h-20 mb-2 rounded-2xl overflow-hidden border-2 border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.8)] animate-spin">
                    <img src="/assets/ice_bomb.webp" alt="Frozen" className="w-full h-full object-cover" />
                  </div>
                  <h3 className="text-2xl font-black text-cyan-300 font-['Jua'] mb-1">
                    🧊 얼음 폭탄 피격!
                  </h3>
                  <p className="text-sm text-gray-200 font-bold mb-3">차가운 얼음에 갇혀 1턴 쉬어갑니다!</p>
                </>
              ) : (
                <>
                  <AlertOctagon className="w-16 h-16 text-red-500 animate-bounce mb-2" />
                  <h3 className="text-2xl font-black text-red-400 font-['Jua'] mb-1">
                    🚨 엔진 과열 쿨다운!
                  </h3>
                  <p className="text-sm text-gray-200 font-bold mb-1">
                    오답으로 인해 출발이 지연되고 있습니다! ({consecutiveWrong}회 연속 오답)
                  </p>
                  <p className="text-xs text-gray-400">문제를 신중하게 읽고 정답을 맞혀보세요!</p>
                </>
              )}
              <div className="text-4xl font-black text-yellow-300 font-['Jua'] animate-pulse mt-2">
                ⏱️ {freezeTimeLeft}초
              </div>
            </div>
          )}

          {/* 문제 카드 헤더 */}
          <div className="bg-slate-900/90 border-2 border-slate-700 rounded-2xl p-3.5 mb-3 shadow-xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-2.5 py-0.5 bg-red-600 text-white rounded-full text-xs font-black font-['Jua']">
                Q {currentQuestion.currentNumber} / {currentQuestion.totalQuestions}
              </span>
              <div className="flex items-center gap-1 font-black font-['Jua'] text-sm text-yellow-400">
                <Timer className="w-4 h-4" />
                <span className={timeLeft <= 3 ? 'text-red-500 animate-ping text-base' : ''}>
                  {timeLeft}초
                </span>
              </div>
            </div>

            <h3 className="text-base md:text-lg font-black text-white leading-snug font-['Jua']">
              {currentQuestion.question}
            </h3>
          </div>

          {currentQuestion.type === 'short-answer' ? (
            <form
              onSubmit={handleSubmitShortAnswer}
              className="flex flex-1 flex-col justify-center gap-3 rounded-2xl border-2 border-cyan-500/60 bg-slate-900/85 p-4 shadow-xl"
            >
              <label htmlFor="short-answer" className="text-center text-sm font-black text-cyan-200 font-['Jua']">
                정답을 짧게 입력하세요
              </label>
              <input
                id="short-answer"
                type="text"
                value={shortAnswer}
                onChange={(event) => setShortAnswer(event.target.value)}
                disabled={selectedOption !== null || freezeTimeLeft > 0}
                autoComplete="off"
                autoCapitalize="off"
                maxLength={40}
                className="w-full rounded-2xl border-2 border-slate-600 bg-slate-950 px-4 py-4 text-center text-xl font-black text-white outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 disabled:opacity-60"
                placeholder="정답 입력"
              />
              <button
                type="submit"
                disabled={!shortAnswer.trim() || selectedOption !== null || freezeTimeLeft > 0}
                className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-lg font-black text-white shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 font-['Jua']"
              >
                정답 제출
              </button>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 flex-1 max-h-[50vh]">
              {(currentQuestion.options || []).map((opt, idx) => (
                <button
                  key={idx}
                  disabled={selectedOption !== null || freezeTimeLeft > 0}
                  onClick={() => handleSelectOption(idx)}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 text-center transition-all bg-gradient-to-br shadow-xl ${
                    OPTION_COLORS[idx % 4]
                  } ${selectedOption === idx ? 'ring-4 ring-white scale-95' : ''}`}
                >
                  <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-lg font-['Jua'] mb-1">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-black leading-tight line-clamp-3">
                    {opt}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 답안 피드백 팝업 */}
          {answerFeedback && (
            <div className={`mt-2 p-2.5 rounded-xl border text-center animate-fade-in ${
              answerFeedback.isCorrect ? 'bg-emerald-950/80 border-emerald-500' : 'bg-red-950/80 border-red-500'
            }`}>
              <div className="flex items-center justify-center gap-2 font-black font-['Jua'] text-sm">
                {answerFeedback.isCorrect ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> 정답! +{answerFeedback.pointsEarned}점
                    {answerFeedback.gainedItem && ` (🎁 [${answerFeedback.gainedItem.name}] 획득!)`}
                  </span>
                ) : (
                  <span className="text-rose-400 flex flex-wrap items-center justify-center gap-1">
                    <XCircle className="w-4 h-4" /> {answerFeedback.isTimeout ? '시간 초과!' : '오답!'}
                    {answerFeedback.correctAnswer && <span>정답: {answerFeedback.correctAnswer}</span>}
                    <span>(엔진 쿨다운 발생)</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. 레이스 완주 화면 */}
      {gameState === 'FINISHED' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-900/90 rounded-3xl border-2 border-yellow-400 shadow-2xl">
          <div className="text-7xl mb-3 animate-bounce">🏁</div>
          <h2 className="text-3xl font-black text-yellow-300 font-['Jua'] mb-2">
            {raceEndReason === 'TIME_UP' ? 'TIME UP! 레이스 종료!' : 'GOAL IN! 레이스 완주!'}
          </h2>
          <p className="text-gray-300 text-sm font-bold mb-4">
            {raceEndReason === 'TIME_UP'
              ? '설정한 플레이 시간이 종료되어 현재 점수로 순위가 결정되었습니다.'
              : raceEndReason === 'MANUAL'
                ? '호스트가 레이스를 종료해 현재 점수로 순위가 결정되었습니다.'
                : '모든 퀴즈를 통과하고 결승선을 넘었습니다!'}
          </p>
          <div className="p-5 bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-xs">
            <span className="text-xs text-gray-400 font-bold">내 최종 랭킹</span>
            <div className="text-4xl font-black text-yellow-400 font-['Jua'] my-1">
              {leaderboard.find(p => p.id === socket.id)?.rank || 1}위
            </div>
            <div className="text-sm font-bold text-gray-200">
              총 득점: {leaderboard.find(p => p.id === socket.id)?.score?.toLocaleString() || 0}점
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
