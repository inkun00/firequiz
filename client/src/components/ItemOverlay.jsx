import React, { useState, useEffect } from 'react';
import { Shield, Flame, AlertTriangle, Droplets } from 'lucide-react';

export default function ItemOverlay({ debuff, onClearDebuff }) {
  const [clearedTouches, setClearedTouches] = useState(0);

  useEffect(() => {
    if (debuff?.type === 'SMOKE') {
      setClearedTouches(0);
    }
  }, [debuff]);

  if (!debuff) return null;

  // 1. 연막탄 디버프: 화면을 문질러 닦아내야 함
  if (debuff.type === 'SMOKE') {
    const handleWipe = () => {
      const next = clearedTouches + 1;
      setClearedTouches(next);
      if (next >= 4) {
        onClearDebuff();
      }
    };

    const opacity = Math.max(0, 0.95 - clearedTouches * 0.25);

    return (
      <div 
        onClick={handleWipe}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 transition-opacity duration-200 cursor-pointer backdrop-blur-md"
        style={{ backgroundColor: `rgba(15, 15, 20, ${opacity})` }}
      >
        <div className="text-center p-6 bg-red-950/80 border-2 border-red-500 rounded-3xl animate-bounce-short shadow-2xl">
          <div className="text-6xl mb-3">🌫️</div>
          <h2 className="text-2xl md:text-3xl font-black text-red-400 mb-2 font-['Jua']">
            {debuff.from}님이 연막탄을 투척했습니다!
          </h2>
          <p className="text-lg text-white font-bold animate-pulse">
            화면을 4번 터치해서 연기를 닦아내세요! ({clearedTouches}/4)
          </p>
        </div>
      </div>
    );
  }

  // 2. 소화수 피격 디버프
  if (debuff.type === 'WATER') {
    return (
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 bg-blue-600 border-2 border-cyan-300 text-white rounded-full shadow-2xl animate-bounce">
        <Droplets className="w-8 h-8 text-cyan-200 animate-spin" />
        <span className="text-xl font-bold font-['Jua']">
          🌊 {debuff.from}님의 소화수 피격! (시간 3초 감소!)
        </span>
      </div>
    );
  }

  // 3. 사이렌 멘붕 디버프
  if (debuff.type === 'SHUFFLE') {
    return (
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 bg-amber-600 border-2 border-yellow-300 text-white rounded-full shadow-2xl animate-pulse">
        <AlertTriangle className="w-8 h-8 text-yellow-200 animate-spin" />
        <span className="text-xl font-bold font-['Jua']">
          🚨 {debuff.from}님의 사이렌 멘붕 공격! (보기가 섞였습니다!)
        </span>
      </div>
    );
  }

  return null;
}
