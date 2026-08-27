export const AVATAR_OPTIONS = [
  { id: 'ember-captain', name: '엠버 대장', src: '/assets/racers/characters/01-ember-captain.png', kartSrc: '/assets/racers/karts/01-ember-engine-sheet.png', straightSrc: '/assets/racers/karts/01-ember-engine-straight.png' },
  { id: 'aqua-mechanic', name: '아쿠아 정비사', src: '/assets/racers/characters/02-aqua-mechanic.png', kartSrc: '/assets/racers/karts/02-aqua-hydrojet-sheet.png', straightSrc: '/assets/racers/karts/02-aqua-hydrojet-straight.png' },
  { id: 'volt-responder', name: '볼트 구조대', src: '/assets/racers/characters/03-volt-responder.png', kartSrc: '/assets/racers/karts/03-volt-flash-sheet.png', straightSrc: '/assets/racers/karts/03-volt-flash-straight.png' },
  { id: 'moss-guardian', name: '모스 수호대', src: '/assets/racers/characters/04-moss-guardian.png', kartSrc: '/assets/racers/karts/04-moss-canopy-sheet.png', straightSrc: '/assets/racers/karts/04-moss-canopy-straight.png' },
  { id: 'violet-medic', name: '바이올렛 메딕', src: '/assets/racers/characters/05-violet-medic.png', kartSrc: '/assets/racers/karts/05-violet-pulse-sheet.png', straightSrc: '/assets/racers/karts/05-violet-pulse-straight.png' },
  { id: 'blaze-fox', name: '블레이즈 폭스', src: '/assets/racers/characters/06-blaze-fox.png', kartSrc: '/assets/racers/karts/06-blaze-scout-sheet.png', straightSrc: '/assets/racers/karts/06-blaze-scout-straight.png' },
  { id: 'frost-penguin', name: '프로스트 펭귄', src: '/assets/racers/characters/07-frost-penguin.png', kartSrc: '/assets/racers/karts/07-frost-glider-sheet.png', straightSrc: '/assets/racers/karts/07-frost-glider-straight.png' },
  { id: 'signal-bunny', name: '시그널 버니', src: '/assets/racers/characters/08-signal-bunny.png', kartSrc: '/assets/racers/karts/08-signal-hopper-sheet.png', straightSrc: '/assets/racers/karts/08-signal-hopper-straight.png' },
  { id: 'patch-pup', name: '패치 퍼피', src: '/assets/racers/characters/09-patch-pup.png', kartSrc: '/assets/racers/karts/09-patch-patrol-sheet.png', straightSrc: '/assets/racers/karts/09-patch-patrol-straight.png' },
  { id: 'solar-lion', name: '솔라 라이언', src: '/assets/racers/characters/10-solar-lion.png', kartSrc: '/assets/racers/karts/10-solar-roar-sheet.png', straightSrc: '/assets/racers/karts/10-solar-roar-straight.png' }
];

export const DEFAULT_AVATAR = AVATAR_OPTIONS[0].src;
export const DEFAULT_KART_SHEET = AVATAR_OPTIONS[0].kartSrc;
export const DEFAULT_KART_STRAIGHT = AVATAR_OPTIONS[0].straightSrc;

export function getAvatarName(src) {
  return AVATAR_OPTIONS.find((avatar) => avatar.src === src)?.name || '소방 레이서';
}

export function getKartSheet(src) {
  return AVATAR_OPTIONS.find((avatar) => avatar.src === src)?.kartSrc || DEFAULT_KART_SHEET;
}

export function getKartStraight(src) {
  return AVATAR_OPTIONS.find((avatar) => avatar.src === src)?.straightSrc || DEFAULT_KART_STRAIGHT;
}
