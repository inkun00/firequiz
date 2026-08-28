import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Flame, Users, ArrowRight, Sparkles } from 'lucide-react';
import HostScreen from './components/HostScreen';
import PlayerScreen from './components/PlayerScreen';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, getAvatarName } from './data/avatarOptions';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling']
});

const PLAYER_SESSION_COOKIE = 'firequiz_player_session';
const PLAYER_SESSION_MAX_AGE_SEC = 60 * 60 * 24;

function loadPlayerSession() {
  try {
    const prefix = `${PLAYER_SESSION_COOKIE}=`;
    const savedCookie = document.cookie
      .split('; ')
      .find(cookie => cookie.startsWith(prefix));

    if (!savedCookie) return null;
    return JSON.parse(decodeURIComponent(savedCookie.slice(prefix.length)));
  } catch {
    return null;
  }
}

function savePlayerSession(pin, player) {
  if (!player?.resumeToken) return;

  const session = encodeURIComponent(JSON.stringify({
    pin,
    nickname: player.nickname,
    resumeToken: player.resumeToken
  }));
  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${PLAYER_SESSION_COOKIE}=${session}; Path=/; Max-Age=${PLAYER_SESSION_MAX_AGE_SEC}; SameSite=Lax${secureAttribute}`;
}

function clearPlayerSession() {
  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${PLAYER_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secureAttribute}`;
}

export default function App() {
  const [role, setRole] = useState(null);
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_AVATAR);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [resumeState, setResumeState] = useState(null);
  const resumeRequestedForSocketRef = useRef(null);

  useEffect(() => {
    const requestSavedSession = () => {
      setIsConnected(true);
      if (resumeRequestedForSocketRef.current === socket.id) return;

      const savedSession = loadPlayerSession();
      if (!savedSession?.pin || !savedSession?.resumeToken) return;

      resumeRequestedForSocketRef.current = socket.id;
      socket.emit('player_resume_room', savedSession);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      resumeRequestedForSocketRef.current = null;
    };

    socket.on('connect', requestSavedSession);
    socket.on('disconnect', handleDisconnect);

    socket.on('room_created', ({ pin }) => {
      setPin(pin);
      setRole('HOST');
    });

    socket.on('joined_successfully', ({ player, pin }) => {
      savePlayerSession(pin, player);
      setPlayerInfo(player);
      setPin(pin);
      setResumeState(null);
      setRole('PLAYER');
    });

    socket.on('resumed_successfully', (state) => {
      savePlayerSession(state.pin, state.player);
      setPlayerInfo(state.player);
      setPin(state.pin);
      setResumeState({ ...state, receivedAt: Date.now() });
      setErrorMsg('');
      setRole('PLAYER');
    });

    socket.on('resume_error', () => {
      clearPlayerSession();
      resumeRequestedForSocketRef.current = null;
    });

    socket.on('player_session_replaced', () => {
      clearPlayerSession();
      setPlayerInfo(null);
      setResumeState(null);
      setRole(null);
      setErrorMsg('다른 창에서 이 레이스에 다시 연결했습니다.');
    });

    socket.on('join_error', ({ message }) => {
      setErrorMsg(message);
    });

    if (socket.connected) requestSavedSession();

    return () => {
      socket.off('connect', requestSavedSession);
      socket.off('disconnect', handleDisconnect);
      socket.off('room_created');
      socket.off('joined_successfully');
      socket.off('resumed_successfully');
      socket.off('resume_error');
      socket.off('player_session_replaced');
      socket.off('join_error');
    };
  }, []);

  const handleCreateRoom = () => {
    socket.emit('host_create_room');
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!pin.trim() || !nickname.trim()) {
      setErrorMsg('PIN 번호와 이름을 모두 입력해주세요!');
      return;
    }
    socket.emit('player_join_room', {
      pin: pin.trim(),
      nickname: nickname.trim(),
      avatar: selectedAvatar
    });
  };

  if (role === 'HOST') {
    return <HostScreen socket={socket} pin={pin} />;
  }

  if (role === 'PLAYER' && playerInfo) {
    return (
      <PlayerScreen
        socket={socket}
        pin={pin}
        playerInfo={playerInfo}
        resumeState={resumeState}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 text-white flex flex-col items-center justify-center p-4">
      {/* 연결 상태 */}
      <div className="fixed top-4 right-4 flex items-center gap-2 px-3 py-1 bg-slate-900/80 border border-slate-800 rounded-full text-xs font-bold text-gray-400">
        <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
        {isConnected ? '서버 연결됨' : '서버 연결 중...'}
      </div>

      <div className="max-w-md w-full">
        {/* 메인 3D 카트 로고 & 타이틀 */}
        <div className="text-center mb-6">
          <div className="relative w-28 h-28 mx-auto mb-3 rounded-3xl overflow-hidden border-4 border-yellow-400 shadow-[0_0_35px_rgba(250,204,21,0.5)] animate-bounce-short">
            <img src="/assets/kart_red.webp" alt="Fire Kart 119" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black font-['Jua'] tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-red-400 to-orange-400">
            불조심 배틀 119
          </h1>
          <p className="text-gray-400 font-bold mt-1 text-sm">
            3D 카트라이더 레이싱 퀴즈 서바이벌
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/80 border border-red-500 rounded-2xl text-red-300 font-bold text-center text-sm">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* 학생 입장 폼 */}
        <div className="bg-slate-900/90 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl backdrop-blur-xl mb-4">
          <h2 className="text-xl font-black font-['Jua'] text-yellow-300 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            학생 참여 (PIN 입장)
          </h2>

          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">6자리 PIN 번호</label>
              <input
                type="text"
                placeholder="예: 971170"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full px-4 py-3.5 bg-slate-950 border-2 border-slate-700 rounded-2xl font-black text-center text-2xl tracking-widest text-yellow-300 placeholder:text-gray-600 focus:outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">내 이름 (닉네임)</label>
              <input
                type="text"
                placeholder="예: 4학년 1반 김소방"
                maxLength={10}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-4 py-3.5 bg-slate-950 border-2 border-slate-700 rounded-2xl font-bold text-base text-white placeholder:text-gray-600 focus:outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-xs font-bold text-gray-300">소방 캐릭터 선택</label>
                <span className="truncate text-xs font-bold text-yellow-300">{getAvatarName(selectedAvatar)}</span>
              </div>
              <div className="grid max-h-72 grid-cols-5 gap-2 overflow-y-auto px-1 py-1 scrollbar-thin">
                {AVATAR_OPTIONS.map((avatar) => (
                  <button
                    type="button"
                    key={avatar.id}
                    onClick={() => setSelectedAvatar(avatar.src)}
                    aria-label={`${avatar.name} 선택`}
                    aria-pressed={selectedAvatar === avatar.src}
                    title={avatar.name}
                    className={`relative aspect-square overflow-hidden rounded-xl transition-all ${
                      selectedAvatar === avatar.src
                        ? 'scale-105 border-2 border-yellow-300 ring-2 ring-yellow-400/40'
                        : 'border border-slate-700 opacity-80 hover:border-cyan-400 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={avatar.src}
                      alt=""
                      className="h-full w-full object-cover object-top"
                      loading="lazy"
                    />
                    {selectedAvatar === avatar.src && (
                      <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-300 text-xs font-black text-slate-950 shadow-lg">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-red-600 to-amber-500 hover:scale-[1.02] active:scale-95 text-white font-black text-xl rounded-2xl font-['Jua'] shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              레이스 출동하기 (START)
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* 호스트 생성 버튼 */}
        <div className="text-center">
          <button
            onClick={handleCreateRoom}
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-gray-200 border border-slate-600 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-yellow-400" />
            교사 대시보드 / 전자칠판용 새 방 만들기 (Host)
          </button>
        </div>
      </div>
    </div>
  );
}
