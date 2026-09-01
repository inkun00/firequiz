const assert = require('assert');
const { GameEngine, ITEMS, ITEM_DROP_RATE } = require('./src/gameEngine');
const {
  CHARACTER_ITEMS,
  getCharacterItem
} = require('./src/characterItems');

const AVATAR_KEYS = [
  '01-ember-captain', '02-aqua-mechanic', '03-volt-responder', '04-moss-guardian',
  '05-violet-medic', '06-blaze-fox', '07-frost-penguin', '08-signal-bunny',
  '09-patch-pup', '10-solar-lion', '11-cinder-scout', '12-foam-engineer',
  '13-rescue-raccoon', '14-ember-bear', '15-hydro-otter', '16-siren-cat',
  '17-ladder-giraffe', '18-spark-squirrel', '19-shield-rhino', '20-cloud-koala',
  '21-neon-dragon', '22-comet-hawk', '23-ruby-panda', '24-mint-turtle',
  '25-torch-tiger', '26-bubble-dolphin', '27-copper-robot', '28-luna-wolf',
  '29-coral-deer', '30-nova-unicorn'
];

const avatarPath = key => `/assets/racers/characters/${key}.webp`;

function createPlayer(id, avatar, score = 0) {
  return {
    id,
    nickname: id,
    avatar,
    score,
    progress: 0,
    correctCount: 0,
    consecutiveWrong: 0,
    streak: 0,
    isFever: false,
    rank: 1,
    itemSlots: [],
    freezeUntil: 0,
    iceFrozenUntil: 0,
    specialGuardUntil: 0
  };
}

function withRandomSequence(sequence, callback) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => sequence[Math.min(index++, sequence.length - 1)];
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function run() {
  assert.strictEqual(Object.keys(CHARACTER_ITEMS).length, 30, '캐릭터 전용 아이템은 정확히 30개여야 합니다.');
  assert.deepStrictEqual(Object.keys(CHARACTER_ITEMS), AVATAR_KEYS, '모든 캐릭터가 순서대로 매핑되어야 합니다.');
  assert.strictEqual(new Set(Object.values(CHARACTER_ITEMS).map(item => item.id)).size, 30, '아이템 ID가 중복되면 안 됩니다.');
  assert.strictEqual(new Set(Object.values(CHARACTER_ITEMS).map(item => item.name)).size, 30, '아이템 이름이 중복되면 안 됩니다.');
  const numericSignatures = Object.values(CHARACTER_ITEMS).map(item => JSON.stringify([
    item.effectType,
    item.score || 0,
    item.durationMs || 0,
    item.cooldownReductionMs || 0,
    item.wrongReduction || 0,
    Boolean(item.fullRecovery),
    item.dropRate
  ]));
  assert.strictEqual(new Set(numericSignatures).size, 30, '30개 아이템의 수치 조합이 모두 달라야 합니다.');

  for (const key of AVATAR_KEYS) {
    const item = getCharacterItem(avatarPath(key));
    assert(item, `${key} 전용 아이템이 필요합니다.`);
    assert.strictEqual(item.ownerAvatar, key);
    assert(['BOOST', 'RECOVERY', 'GUARD', 'CONTROL'].includes(item.effectType));
    assert(item.dropRate >= 0.05 && item.dropRate <= 0.18, '전용 아이템 실제 획득 확률은 5~18%여야 합니다.');
    assert(item.dropRate < ITEM_DROP_RATE, '전용 아이템 확률은 전체 아이템 획득 확률보다 낮아야 합니다.');
  }
  assert(new Set(Object.values(CHARACTER_ITEMS).map(item => item.dropRate)).size >= 10, '캐릭터별 확률 차이가 충분해야 합니다.');

  const boostItems = Object.values(CHARACTER_ITEMS)
    .filter(item => item.effectType === 'BOOST')
    .sort((a, b) => a.score - b.score);
  for (let index = 1; index < boostItems.length; index += 1) {
    assert(boostItems[index].dropRate < boostItems[index - 1].dropRate, '가속 효과가 클수록 획득 확률이 낮아야 합니다.');
  }
  for (const item of boostItems) {
    const expectedScorePerCorrect = item.score * item.dropRate;
    assert(expectedScorePerCorrect >= 49 && expectedScorePerCorrect <= 52.5, '가속형의 정답당 기대 점수는 비슷해야 합니다.');
  }

  const controlItems = Object.values(CHARACTER_ITEMS)
    .filter(item => item.effectType === 'CONTROL')
    .sort((a, b) => a.durationMs - b.durationMs);
  for (let index = 1; index < controlItems.length; index += 1) {
    assert(controlItems[index].dropRate < controlItems[index - 1].dropRate, '견제 시간이 길수록 획득 확률이 낮아야 합니다.');
  }
  assert.strictEqual(getCharacterItem('/assets/racers/characters/01-ember-captain.png').ownerAvatar, '01-ember-captain');

  const owner = createPlayer('owner', avatarPath('01-ember-captain'));
  const room = { players: new Map([[owner.id, owner]]) };
  const engine = new GameEngine(room);
  const question = { type: 'multiple-choice', answerIndex: 0, timeLimit: 20 };
  const answerResult = withRandomSequence([0.1, 0.19, 0.5], () => engine.processAnswer(owner, question, 0, 10000));
  assert.strictEqual(answerResult.gainedItem.id, CHARACTER_ITEMS['01-ember-captain'].id, '설정된 실제 확률로 전용 아이템을 획득해야 합니다.');

  owner.itemSlots = [];
  const genericResult = withRandomSequence([0.1, 0.21, 0, 0.5], () => engine.processAnswer(owner, question, 0, 10000));
  assert.strictEqual(genericResult.gainedItem.id, ITEMS.BONUS.id, '전용 아이템 확률 밖에서는 기존 아이템을 얻어야 합니다.');

  const forged = { ...CHARACTER_ITEMS['03-volt-responder'] };
  owner.itemSlots = [forged];
  const forgedResult = engine.useItem(owner, 0);
  assert.strictEqual(forgedResult.success, false, '다른 캐릭터 전용 아이템을 사용할 수 없어야 합니다.');
  assert.strictEqual(owner.itemSlots.length, 1, '거부한 아이템은 소모하면 안 됩니다.');

  owner.itemSlots = [{ ...ITEMS.BONUS }];
  owner.freezeUntil = Date.now() + 5000;
  const lockedResult = engine.useItem(owner, 0);
  assert.strictEqual(lockedResult.success, false, '잠금 중 일반 아이템 사용을 서버에서도 막아야 합니다.');
  assert.strictEqual(owner.itemSlots.length, 1);

  const medic = createPlayer('medic', avatarPath('05-violet-medic'), 1000);
  medic.freezeUntil = Date.now() + 5000;
  medic.iceFrozenUntil = Date.now() + 5000;
  medic.consecutiveWrong = 3;
  medic.itemSlots = [{ ...CHARACTER_ITEMS['05-violet-medic'] }];
  const medicEngine = new GameEngine({ players: new Map([[medic.id, medic]]) });
  const medicResult = medicEngine.useItem(medic, 0);
  assert.strictEqual(medicResult.clearLock, true);
  assert.strictEqual(medic.score, 1000 + CHARACTER_ITEMS['05-violet-medic'].score);
  assert.strictEqual(medic.freezeUntil, 0);
  assert.strictEqual(medic.iceFrozenUntil, 0);
  assert.strictEqual(medic.consecutiveWrong, 0);

  const mechanic = createPlayer('mechanic', avatarPath('02-aqua-mechanic'), 1000);
  const mechanicLockUntil = Date.now() + 5000;
  mechanic.freezeUntil = mechanicLockUntil;
  mechanic.consecutiveWrong = 3;
  mechanic.itemSlots = [{ ...CHARACTER_ITEMS['02-aqua-mechanic'] }];
  const mechanicEngine = new GameEngine({ players: new Map([[mechanic.id, mechanic]]) });
  const mechanicResult = mechanicEngine.useItem(mechanic, 0);
  assert.strictEqual(mechanicResult.recoveryApplied, true);
  assert(mechanic.freezeUntil <= mechanicLockUntil - 3000);
  assert.strictEqual(mechanic.consecutiveWrong, 2);

  const guard = createPlayer('guard', avatarPath('19-shield-rhino'), 2000);
  const attacker = createPlayer('attacker', avatarPath('01-ember-captain'), 1000);
  const combatRoom = { players: new Map([[guard.id, guard], [attacker.id, attacker]]) };
  const combatEngine = new GameEngine(combatRoom);
  guard.itemSlots = [{ ...CHARACTER_ITEMS['19-shield-rhino'] }];
  const guardResult = combatEngine.useItem(guard, 0);
  assert(guardResult.guardUntil >= Date.now() + CHARACTER_ITEMS['19-shield-rhino'].durationMs - 20);
  assert.strictEqual(guard.score, 2000 + CHARACTER_ITEMS['19-shield-rhino'].score);

  attacker.itemSlots = [{ ...ITEMS.STEAL }];
  const guardedScore = guard.score;
  const blockedResult = combatEngine.useItem(attacker, 0);
  assert.strictEqual(blockedResult.blocked, true, '방어는 공격 1회를 막아야 합니다.');
  assert.strictEqual(guard.score, guardedScore);
  assert.strictEqual(guard.specialGuardUntil, 0, '방어 성공 뒤에는 보호막을 소모해야 합니다.');

  const controller = createPlayer('controller', avatarPath('08-signal-bunny'), 1000);
  const leader = createPlayer('leader', avatarPath('10-solar-lion'), 2000);
  const controlEngine = new GameEngine({ players: new Map([[controller.id, controller], [leader.id, leader]]) });
  controller.itemSlots = [{ ...CHARACTER_ITEMS['08-signal-bunny'] }];
  const beforeControl = Date.now();
  const controlResult = withRandomSequence([0], () => controlEngine.useItem(controller, 0));
  assert.strictEqual(controlResult.freezeDuration, CHARACTER_ITEMS['08-signal-bunny'].durationMs);
  assert(leader.iceFrozenUntil >= beforeControl + CHARACTER_ITEMS['08-signal-bunny'].durationMs);

  const firstPlace = createPlayer('first', avatarPath('08-signal-bunny'), 3000);
  const secondPlace = createPlayer('second', avatarPath('10-solar-lion'), 1000);
  firstPlace.itemSlots = [{ ...CHARACTER_ITEMS['08-signal-bunny'] }];
  const fallbackEngine = new GameEngine({ players: new Map([[firstPlace.id, firstPlace], [secondPlace.id, secondPlace]]) });
  const fallbackResult = fallbackEngine.useItem(firstPlace, 0);
  assert.strictEqual(fallbackResult.bonusScore, CHARACTER_ITEMS['08-signal-bunny'].fallbackScore);

  console.log('캐릭터 전용 아이템 30종 및 공정성 규칙 검증 완료');
}

run();
