import React from 'react';
import { Flame, Snowflake, Zap, Trophy, ShieldAlert } from 'lucide-react';

// 카트 색상별 스타일
const CAR_STYLES = {
  RED: { bg: 'bg-red-500', border: 'border-red-300', text: 'text-red-400', shadow: 'shadow-red-500/50' },
  BLUE: { bg: 'bg-blue-500', border: 'border-blue-300', text: 'text-blue-400', shadow: 'shadow-blue-500/50' },
  YELLOW: { bg: 'bg-yellow-400', border: 'border-yellow-200', text: 'text-yellow-300', shadow: 'shadow-yellow-400/50' },
  GREEN: { bg: 'bg-emerald-500', border: 'border-emerald-300', text: 'text-emerald-400', shadow: 'shadow-emerald-500/50' },
  PURPLE: { bg: 'bg-purple-500', border: 'border-purple-300', text: 'text-purple-400', shadow: 'shadow-purple-500/50' },
  ORANGE: { bg: 'bg-orange-500', border: 'border-orange-300', text: 'text-orange-400', shadow: 'shadow-orange-500/50' },
  CYAN: { bg: 'bg-cyan-400', border: 'border-cyan-200', text: 'text-cyan-300', shadow: 'shadow-cyan-400/50' },
  PINK: { bg: 'bg-pink-500', border: 'border-pink-300', text: 'text-pink-400', shadow: 'shadow-pink-500/50' },
};

export default function KartTrack({ myId, leaderboard = [], isFever = false, isFrozen = false }) {
  const myIndex = leaderboard.findIndex(p => p.id === myId);
  const myPlayer = leaderboard[myIndex] || { nickname: '나', rank: 1, score: 0, avatar: '🧑‍🚒', carColor: 'RED' };

  // 내 주변 순위 플레이어 추출 (내 앞 2명, 내 뒤 2명)
  const nearbyRacers = [];
  if (myIndex !== -1) {
    const start = Math.max(0, myIndex - 2);
    const end = Math.min(leaderboard.length, myIndex + 3);
    for (let i = start; i < end; i++) {
      nearbyRacers.push(leaderboard[i]);
    }
  } else if (leaderboard.length > 0) {
    nearbyRacers.push(...leaderboard.slice(0, 5));
  }

  return (
    <div className="relative w-full h-44 md:h-52 bg-gradient-to-b from-slate-900 via-slate-800 to-zinc-900 rounded-3xl border-2 border-slate-700 overflow-hidden shadow-2xl flex flex-col justify-between">
      {/* 1. 도로 배경 & 질주 애니메이션 효과 */}
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-30" />
      
      {/* 트랙 차선 (흘러가는 효과) */}
      <div className="absolute top-1/2 left-0 right-0 h-1 bg-dashed flex gap-4 animate-pulse opacity-40">
        <div className="w-full border-t-2 border-dashed border-yellow-400" />
      </div>

      {/* 상단 레이스 현황 바 */}
      <div className="relative z-10 px-4 py-2 flex items-center justify-between bg-slate-950/60 backdrop-blur-sm border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black px-2.5 py-0.5 bg-red-600 rounded-full font-['Jua'] text-white">
            🏎️ LIVE RACE
          </span>
          <span className="text-xs font-bold text-gray-300">
            총 {leaderboard.length}명 경쟁 중
          </span>
        </div>
        <div className="flex items-center gap-2 font-['Jua']">
          <span className="text-xs text-gray-400">현재 내 순위:</span>
          <span className="text-xl font-black text-yellow-300 flex items-center gap-1">
            <Trophy className="w-4 h-4 text-yellow-400" />
            {myPlayer.rank}위
          </span>
          <span className="text-xs text-yellow-400 font-bold">({myPlayer.score?.toLocaleString()}점)</span>
        </div>
      </div>

      {/* 2. 카트라이더 레이싱 카트 필드 (주변 라이벌 배치) */}
      <div className="relative z-10 flex-1 flex items-center justify-around px-4 py-2">
        {nearbyRacers.map((racer) => {
          const isMe = racer.id === myId;
          const style = CAR_STYLES[racer.carColor] || CAR_STYLES.RED;
          const isRacerFrozen = racer.isFrozen;

          // 내 카트는 중앙에 약간 크게 강조
          return (
            <div
              key={racer.id}
              className={`flex flex-col items-center transition-all duration-500 relative ${
                isMe ? 'scale-110 z-20' : 'scale-90 opacity-85 z-10'
              }`}
            >
              {/* 순위 배지 & 닉네임 */}
              <div className="flex items-center gap-1 mb-1">
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-black font-['Jua'] ${
                    racer.rank === 1
                      ? 'bg-yellow-400 text-slate-950'
                      : racer.rank === 2
                      ? 'bg-slate-300 text-slate-950'
                      : racer.rank === 3
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-700 text-gray-300'
                  }`}
                >
                  {racer.rank}위
                </span>
                <span className={`text-xs font-bold truncate max-w-[65px] ${isMe ? 'text-yellow-300 font-black' : 'text-gray-300'}`}>
                  {isMe ? '나' : racer.nickname}
                </span>
              </div>

              {/* 카트 & 아바타 그래픽 */}
              <div className="relative">
                {/* 빙결 이펙트 */}
                {isRacerFrozen && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center bg-cyan-500/80 rounded-full p-1 border border-white animate-spin">
                    <Snowflake className="w-4 h-4 text-white" />
                  </div>
                )}

                {/* 부스터 불꽃 (피버 모드) */}
                {(racer.isFever || (isMe && isFever)) && !isRacerFrozen && (
                  <div className="absolute -bottom-2 -left-2 z-0 animate-bounce">
                    <Flame className="w-5 h-5 text-red-500 fill-current animate-pulse" />
                  </div>
                )}

                {/* 자동차 본체 */}
                <div
                  className={`w-14 h-11 md:w-16 md:h-12 rounded-2xl border-2 flex items-center justify-center text-2xl shadow-xl transition-transform ${
                    style.bg
                  } ${style.border} ${style.shadow} ${
                    isRacerFrozen ? 'grayscale brightness-75 animate-none' : 'animate-bounce-short'
                  } ${isMe ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`}
                >
                  <span className="filter drop-shadow">{racer.avatar}</span>
                </div>

                {/* 자동차 바퀴 2개 */}
                <div className="flex justify-between px-1 -mt-1.5 relative z-10">
                  <div className="w-3 h-2 bg-zinc-950 rounded-sm border border-slate-600" />
                  <div className="w-3 h-2 bg-zinc-950 rounded-sm border border-slate-600" />
                </div>
              </div>

              {/* 점수 */}
              <span className="text-[10px] text-gray-400 font-bold font-['Jua'] mt-1">
                {racer.score?.toLocaleString()}p
              </span>
            </div>
          );
        })}
      </div>

      {/* 하단 속도감 라인 */}
      <div className="relative z-10 h-1 bg-gradient-to-r from-red-500 via-yellow-400 to-cyan-400 opacity-60" />
    </div>
  );
}
