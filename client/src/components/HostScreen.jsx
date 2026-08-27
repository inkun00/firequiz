import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Users, Sparkles, Play, Flame, Snowflake, ArrowUp, ArrowDown, Flag, StopCircle, RotateCcw, Timer } from 'lucide-react';
import { sounds } from '../utils/sound';
import KartTrack3D from './KartTrack3D';
import AvatarPortrait from './AvatarPortrait';

const PLAY_DURATION_OPTIONS = [2, 3, 5, 7, 10];

const formatRaceTime = (totalSeconds = 0) => {
  const safeSeconds = Math.max(0, totalSeconds);
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

export default function HostScreen({ socket, pin }) {
  const [gameState, setGameState] = useState('LOBBY'); // LOBBY, COUNTDOWN, RACING, FINAL
  const [players, setPlayers] = useState([]);
  const [countdown, setCountdown] = useState(3);
  const [recentBroadcast, setRecentBroadcast] = useState(null);
  const [finalData, setFinalData] = useState(null);
  const [playDurationSec, setPlayDurationSec] = useState(300);
  const [remainingSec, setRemainingSec] = useState(300);

  useEffect(() => {
    if (!socket) return;

    socket.on('lobby_players_updated', ({ players: list }) => {
      setPlayers(list);
    });

    socket.on('game_starting_countdown', ({ count, durationSec }) => {
      setGameState('COUNTDOWN');
      setCountdown(count);
      if (Number.isFinite(durationSec)) setRemainingSec(durationSec);
      sounds.playCountdown();
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            sounds.playGameStart();
            setGameState('RACING');
            return 0;
          }
          sounds.playCountdown();
          return prev - 1;
        });
      }, 1000);
    });

    socket.on('race_leaderboard_sync', ({ leaderboard, remainingSec: serverRemainingSec }) => {
      setPlayers(leaderboard);
      if (Number.isFinite(serverRemainingSec)) setRemainingSec(serverRemainingSec);
    });

    socket.on('item_effect_broadcast', (effect) => {
      setRecentBroadcast(effect.message);
      sounds.playItem();
      setTimeout(() => setRecentBroadcast(null), 3500);
    });

    socket.on('race_game_over', ({ finalLeaderboard, averageScore, top3, endReason, durationSec }) => {
      setGameState('FINAL');
      setRemainingSec(0);
      setFinalData({ finalLeaderboard, averageScore, top3, endReason, durationSec });
      confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
    });

    socket.on('game_reset_to_lobby', ({ players: list }) => {
      setGameState('LOBBY');
      setFinalData(null);
      setPlayers(list);
    });

    return () => {
      socket.off('lobby_players_updated');
      socket.off('game_starting_countdown');
      socket.off('race_leaderboard_sync');
      socket.off('item_effect_broadcast');
      socket.off('race_game_over');
      socket.off('game_reset_to_lobby');
    };
  }, [socket]);

  const handleFillBots = () => {
    socket.emit('host_fill_bots', { pin, targetCount: 30 });
  };

  const handleStartGame = () => {
    setRemainingSec(playDurationSec);
    socket.emit('host_start_game', { pin, durationSec: playDurationSec });
  };

  const handleEndRace = () => {
    socket.emit('host_end_race', { pin });
  };

  const handleResetToLobby = () => {
    socket.emit('host_reset_lobby', { pin });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 text-white flex flex-col p-4 md:p-6 font-['Noto_Sans_KR']">
      {/* 1. 아이템 사용 알림 배너 */}
      {recentBroadcast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-black text-base md:text-lg shadow-2xl animate-bounce border-2 border-yellow-300">
          {recentBroadcast}
        </div>
      )}

      {/* 2. 로비 대기실 */}
      {gameState === 'LOBBY' && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-6xl mx-auto w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-5 py-2 bg-red-600/30 border border-red-500 rounded-full text-red-400 font-bold mb-3">
              <Flame className="w-5 h-5 animate-pulse text-red-500" />
              불조심 어린이마당 3D 카트 레이싱 (학급 30인 실시간 개인전)
            </div>
            <h1 className="text-4xl md:text-6xl font-black font-['Jua'] tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-red-400 to-orange-400">
              불조심 배틀 119 : 3D 카트 서바이벌
            </h1>
          </div>

          <div className="bg-slate-900/90 border-4 border-yellow-400 rounded-3xl p-6 md:p-8 shadow-2xl text-center mb-6 w-full max-w-md backdrop-blur-xl">
            <p className="text-gray-300 text-base font-bold mb-1">학생 접속 PIN 코드</p>
            <div className="text-6xl md:text-7xl font-black tracking-widest text-yellow-300 font-['Jua']">
              {pin}
            </div>
            <p className="text-xs text-gray-400 mt-2">스마트폰/태블릿 브라우저에서 위 번호로 접속하세요!</p>
          </div>

          <div className="w-full bg-slate-900/70 border border-slate-800 rounded-3xl p-5 mb-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-lg font-bold font-['Jua'] text-cyan-300">
                <Users className="w-5 h-5" />
                출전 대기 중인 레이서 ({players.length}/30명)
              </div>
              {players.length < 30 && (
                <button
                  onClick={handleFillBots}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  우리 반 친구 30명 채우기 (AI 봇 추가)
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5 max-h-56 overflow-y-auto p-1">
              {players.map((p, idx) => (
                <div key={p.id || idx} className="flex items-center gap-2 p-2 bg-slate-800/80 border border-slate-700 rounded-2xl">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-yellow-400 shrink-0">
                    <AvatarPortrait avatar={p.avatar} alt={`${p.nickname} 캐릭터`} />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-xs truncate text-white">{p.nickname}</p>
                    {p.isBot && <span className="text-[9px] text-gray-400 bg-slate-700 px-1 py-0.2 rounded">봇</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5 w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl backdrop-blur-md">
            <div className="mb-3 flex items-center justify-center gap-2 text-cyan-200">
              <Timer className="h-5 w-5" />
              <span className="font-bold">플레이 시간 설정</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PLAY_DURATION_OPTIONS.map((minutes) => {
                const seconds = minutes * 60;
                const isSelected = playDurationSec === seconds;
                return (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => {
                      setPlayDurationSec(seconds);
                      setRemainingSec(seconds);
                    }}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition-all ${
                      isSelected
                        ? 'border-yellow-300 bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20'
                        : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-cyan-400 hover:bg-slate-700'
                    }`}
                    aria-pressed={isSelected}
                  >
                    {minutes}분
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={players.length === 0}
            className={`px-12 py-4 rounded-2xl font-black text-2xl font-['Jua'] shadow-2xl transition-all flex items-center gap-3 ${
              players.length > 0
                ? 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 hover:scale-105 active:scale-95 text-white cursor-pointer'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Play className="w-7 h-7 fill-current" />
            {playDurationSec / 60}분 레이스 출발!
          </button>
        </div>
      )}

      {/* 3. 카운트다운 */}
      {gameState === 'COUNTDOWN' && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-6xl mx-auto w-full">
          <h2 className="text-3xl md:text-5xl font-black text-yellow-300 font-['Jua'] mb-6 animate-pulse">
            🏁 READY... GET SET... 🏁
          </h2>
          <KartTrack3D
            leaderboard={players}
            mode="broadcast"
            racePhase="COUNTDOWN"
            countdown={countdown}
          />
        </div>
      )}

      {/* 4. 교사 대시보드: 전체 레이스 트랙 + 30인 실시간 순위판 */}
      {gameState === 'RACING' && (
        <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full">
          {/* 상단 컨트롤 바 */}
          <div className="flex items-center justify-between mb-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 bg-red-600 text-white rounded-full text-xs font-black font-['Jua'] animate-pulse flex items-center gap-1">
                🏎️ 실시간 30인 서킷 트랙 중계
              </span>
              <span className="text-sm font-bold text-gray-300">
                총 {players.length}대 카트 질주 중
              </span>
              <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${
                remainingSec <= 30
                  ? 'animate-pulse border-red-400 bg-red-600/30 text-red-200'
                  : 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200'
              }`}>
                <Timer className="h-4 w-4" /> {formatRaceTime(remainingSec)}
              </span>
            </div>
            <button
              onClick={handleEndRace}
              className="px-4 py-1.5 bg-red-800/80 hover:bg-red-700 text-white rounded-xl text-xs font-bold font-['Jua'] flex items-center gap-1.5"
            >
              <StopCircle className="w-4 h-4" /> 레이스 조기 종료
            </button>
          </div>

          {/* 실시간 순위 데이터에 연결된 WebGL 3D 서킷 중계 */}
          <KartTrack3D
            leaderboard={players}
            mode="broadcast"
            racePhase="RACING"
            raceTimeSec={remainingSec}
            className="mb-4"
          />

          {/* 30인 실시간 순위표 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-1 overflow-y-auto max-h-[420px]">
            {players.map((p, idx) => {
              const isTop1 = idx === 0;
              const isTop3 = idx < 3;

              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-300 ${
                    isTop1
                      ? 'bg-yellow-500/20 border-yellow-400 ring-2 ring-yellow-400/50'
                      : isTop3
                      ? 'bg-slate-800/90 border-slate-600'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs font-['Jua'] ${
                        idx === 0
                          ? 'bg-yellow-400 text-slate-950'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950'
                          : idx === 2
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-800 text-gray-400'
                      }`}
                    >
                      {idx + 1}
                    </span>

                    <div className="w-7 h-7 rounded-full overflow-hidden border border-yellow-400 shrink-0">
                      <AvatarPortrait avatar={p.avatar} alt={`${p.nickname} 캐릭터`} />
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs truncate text-white">{p.nickname}</span>
                        {p.isFrozen && <Snowflake className="w-3.5 h-3.5 text-cyan-300 animate-spin" />}
                        {p.isFever && <Flame className="w-3.5 h-3.5 text-red-500 animate-pulse" />}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        진행: <span className="text-cyan-300 font-bold">{p.progress || 0}/25</span> 완료
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-['Jua']">
                    {p.rankDelta > 0 && (
                      <span className="text-xs font-black text-emerald-400 flex items-center">
                        <ArrowUp className="w-3 h-3" />
                        {p.rankDelta}
                      </span>
                    )}
                    {p.rankDelta < 0 && (
                      <span className="text-xs font-black text-rose-400 flex items-center">
                        <ArrowDown className="w-3 h-3" />
                        {Math.abs(p.rankDelta)}
                      </span>
                    )}
                    <span className="text-sm font-black text-yellow-300">
                      {p.score?.toLocaleString()}점
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. 최종 시상식 & 로비 복귀 버튼 */}
      {gameState === 'FINAL' && finalData && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
          <div className="text-center mb-4">
            <h1 className="text-4xl md:text-6xl font-black text-yellow-300 font-['Jua'] mb-1">
              🏆 3D 카트 챔피언 시상대 🏆
            </h1>
            <p className="text-gray-300 text-sm font-bold">
              우리 반 평균 득점: <span className="text-yellow-400 text-xl font-black">{finalData.averageScore}점</span>
            </p>
            <p className="mt-1 text-sm font-bold text-cyan-200">
              {finalData.endReason === 'TIME_UP' ? '설정한 플레이 시간이 종료되었습니다.' : '레이스가 종료되었습니다.'}
            </p>
          </div>

          {/* 시상대 단상 */}
          <div className="flex items-end justify-center gap-4 md:gap-8 mb-4 w-full max-w-2xl px-4">
            {finalData.top3[1] && (
              <div className="flex-1 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-slate-300 mb-1 shadow-lg">
                  <AvatarPortrait avatar={finalData.top3[1].avatar} alt={`${finalData.top3[1].nickname} 캐릭터`} />
                </div>
                <span className="font-bold text-xs text-gray-200 truncate">{finalData.top3[1].nickname}</span>
                <span className="text-yellow-300 font-black text-[11px] font-['Jua'] mb-1">{finalData.top3[1].score?.toLocaleString()}점</span>
                <div className="w-full bg-gradient-to-t from-slate-600 to-slate-400 h-24 rounded-t-2xl flex items-center justify-center font-black text-xl font-['Jua'] shadow-xl">
                  🥈 2위
                </div>
              </div>
            )}

            {finalData.top3[0] && (
              <div className="flex-1 flex flex-col items-center scale-110 -translate-y-2">
                <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-yellow-300 mb-1 shadow-[0_0_20px_rgba(250,204,21,0.8)]">
                  <AvatarPortrait avatar={finalData.top3[0].avatar} alt={`${finalData.top3[0].nickname} 캐릭터`} />
                </div>
                <span className="font-black text-sm text-yellow-300 truncate">{finalData.top3[0].nickname}</span>
                <span className="text-yellow-400 font-black text-xs font-['Jua'] mb-1">{finalData.top3[0].score?.toLocaleString()}점</span>
                <div className="w-full bg-gradient-to-t from-amber-600 to-yellow-400 h-32 rounded-t-2xl flex items-center justify-center font-black text-2xl font-['Jua'] text-slate-950 shadow-2xl">
                  🥇 1위
                </div>
              </div>
            )}

            {finalData.top3[2] && (
              <div className="flex-1 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-amber-600 mb-1 shadow-lg">
                  <AvatarPortrait avatar={finalData.top3[2].avatar} alt={`${finalData.top3[2].nickname} 캐릭터`} />
                </div>
                <span className="font-bold text-xs text-gray-200 truncate">{finalData.top3[2].nickname}</span>
                <span className="text-yellow-300 font-black text-[11px] font-['Jua'] mb-1">{finalData.top3[2].score?.toLocaleString()}점</span>
                <div className="w-full bg-gradient-to-t from-amber-900 to-amber-700 h-16 rounded-t-2xl flex items-center justify-center font-black text-lg font-['Jua'] shadow-xl">
                  🥉 3위
                </div>
              </div>
            )}
          </div>

          {/* 전체 30인 완주 기록 */}
          <div className="w-full bg-slate-900/80 border border-slate-700 rounded-3xl p-3 backdrop-blur-md max-h-40 overflow-y-auto mb-4">
            <h3 className="text-xs font-bold font-['Jua'] text-cyan-300 mb-1.5">전체 30인 완주 기록</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {finalData.finalLeaderboard.map((p, idx) => (
                <div key={p.id} className="flex items-center justify-between p-1.5 bg-slate-800/60 rounded-xl text-[11px]">
                  <span className="font-bold text-gray-300 font-['Jua']">
                    {idx + 1}등 {p.nickname}
                  </span>
                  <span className="font-black text-yellow-400 font-['Jua']">{p.score?.toLocaleString()}점</span>
                </div>
              ))}
            </div>
          </div>

          {/* [핵심 기능] 게임 종료 후 로비로 돌아가기 (다시 하기) 버튼 */}
          <button
            onClick={handleResetToLobby}
            className="px-10 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:scale-105 active:scale-95 text-white font-black text-xl rounded-2xl font-['Jua'] shadow-2xl transition-all flex items-center gap-2 cursor-pointer border-2 border-yellow-300"
          >
            <RotateCcw className="w-6 h-6" />
            🔄 대기실(로비)로 돌아가기 (다음 판 준비)
          </button>
        </div>
      )}
    </div>
  );
}
