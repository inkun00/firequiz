import React from 'react';
import { Zap, Sparkles } from 'lucide-react';

export default function ItemSlots({ itemSlots = [], onUseItem, disabled = false }) {
  const slot1 = itemSlots[0] || null;
  const slot2 = itemSlots[1] || null;

  // 아이템별 3D 이미지 매핑
  const getItemImage = (itemId) => {
    if (itemId === 'ICE_BOMB') return '/assets/ice_bomb.webp';
    if (itemId === 'BONUS' || itemId === 'STEAL') return '/assets/item_box.webp';
    return null;
  };

  return (
    <div className="flex items-center gap-2 bg-slate-950/90 border-2 border-yellow-400/80 p-2 rounded-2xl shadow-[0_0_20px_rgba(250,204,21,0.3)] backdrop-blur-md">
      {/* 슬롯 1 (메인 아이템) */}
      <button
        onClick={() => slot1 && !disabled && onUseItem(0)}
        disabled={!slot1 || disabled}
        className={`relative w-14 h-14 md:w-16 md:h-16 rounded-2xl border-2 flex flex-col items-center justify-center overflow-hidden transition-all ${
          slot1
            ? 'bg-slate-900 border-yellow-300 shadow-xl hover:scale-105 active:scale-95 cursor-pointer ring-2 ring-yellow-400 animate-pulse'
            : 'bg-slate-900/60 border-slate-800 text-gray-600 cursor-not-allowed'
        }`}
      >
        {slot1 ? (
          <>
            <img 
              src={getItemImage(slot1.id)} 
              alt={slot1.name} 
              className="w-full h-full object-cover brightness-110" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1">
              <span className="text-[9px] font-black text-yellow-300 font-['Jua'] truncate">
                {slot1.name}
              </span>
            </div>
            <span className="absolute top-1 right-1 px-1.5 py-0.2 bg-red-600 text-[8px] font-black rounded-full font-['Jua'] text-white shadow">
              USE
            </span>
          </>
        ) : (
          <span className="text-[11px] font-bold text-gray-500 font-['Jua']">슬롯 1</span>
        )}
      </button>

      {/* 슬롯 2 (예비 아이템) */}
      <button
        onClick={() => slot2 && !disabled && onUseItem(1)}
        disabled={!slot2 || disabled}
        className={`relative w-14 h-14 md:w-16 md:h-16 rounded-2xl border-2 flex flex-col items-center justify-center overflow-hidden transition-all ${
          slot2
            ? 'bg-slate-900 border-cyan-300 shadow-xl hover:scale-105 active:scale-95 cursor-pointer ring-2 ring-cyan-400'
            : 'bg-slate-900/60 border-slate-800 text-gray-600 cursor-not-allowed'
        }`}
      >
        {slot2 ? (
          <>
            <img 
              src={getItemImage(slot2.id)} 
              alt={slot2.name} 
              className="w-full h-full object-cover brightness-110" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1">
              <span className="text-[9px] font-black text-cyan-300 font-['Jua'] truncate">
                {slot2.name}
              </span>
            </div>
            <span className="absolute top-1 right-1 px-1.5 py-0.2 bg-blue-600 text-[8px] font-black rounded-full font-['Jua'] text-white shadow">
              USE
            </span>
          </>
        ) : (
          <span className="text-[11px] font-bold text-gray-500 font-['Jua']">슬롯 2</span>
        )}
      </button>
    </div>
  );
}
