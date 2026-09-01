const assert = require('assert');
const zlib = require('zlib');
const roomManager = require('./src/roomManager');

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function createCapturingIo() {
  const events = [];
  return {
    events,
    to(target) {
      return {
        emit(name, payload) {
          events.push({ target, name, payload });
        }
      };
    }
  };
}

async function run() {
  const io = createCapturingIo();
  const room = roomManager.createRoom('network-test-host');
  for (let index = 0; index < 20; index += 1) {
    room.addPlayer(`network-test-player-${index}`, `학생${index + 1}`);
  }

  assert.strictEqual(room.startCountdown(io, 60), true);
  const countdownTimer = room.raceStartTimeout;
  assert.strictEqual(room.startCountdown(io, 60), false, '중복 카운트다운 요청을 거부해야 합니다.');
  assert.strictEqual(room.raceStartTimeout, countdownTimer, '기존 카운트다운 타이머를 유지해야 합니다.');

  assert.strictEqual(room.startRace(io), true);
  assert.strictEqual(room.startRace(io), false, '진행 중인 레이스를 다시 시작하면 안 됩니다.');
  assert.strictEqual(io.events.filter(event => event.name === 'race_roster_snapshot').length, 1);
  assert.strictEqual(io.events.filter(event => event.name === 'new_question_received').length, 20);

  await wait(1150);
  const syncEvents = io.events.filter(event => event.name === 'race_leaderboard_sync');
  assert.strictEqual(syncEvents.length, 1, '순위 동기화는 1초에 한 번이어야 합니다.');

  const update = syncEvents[0].payload.leaderboard;
  assert.strictEqual(update.length, 20);
  assert.strictEqual('nickname' in update[0], false, '고정 닉네임을 반복 전송하면 안 됩니다.');
  assert.strictEqual('avatar' in update[0], false, '고정 아바타 경로를 반복 전송하면 안 됩니다.');
  assert.strictEqual('carColor' in update[0], false, '고정 차량 색상을 반복 전송하면 안 됩니다.');

  const packet = Buffer.from(`42${JSON.stringify(['race_leaderboard_sync', syncEvents[0].payload])}`);
  const compressedPacket = zlib.gzipSync(packet);
  room.endRace(io, 'MANUAL');
  const syncCountAfterEnd = io.events.filter(event => event.name === 'race_leaderboard_sync').length;
  await wait(1100);
  assert.strictEqual(
    io.events.filter(event => event.name === 'race_leaderboard_sync').length,
    syncCountAfterEnd,
    '레이스 종료 후 순위 타이머가 남으면 안 됩니다.'
  );

  room.resetToLobby();
  assert.strictEqual(room.startCountdown(io, 60), true);
  assert.strictEqual(room.startRace(io), true);
  await wait(1150);
  assert.strictEqual(
    io.events.filter(event => event.name === 'race_leaderboard_sync').length,
    syncCountAfterEnd + 1,
    '재경기에서도 순위 타이머는 하나만 실행되어야 합니다.'
  );
  room.endRace(io, 'MANUAL');

  roomManager.removeRoom(room.pin);
  console.log('네트워크 최적화 검증 완료');
  console.log(`20명 동적 순위 패킷: ${packet.length} bytes (gzip ${compressedPacket.length} bytes)`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
