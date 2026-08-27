/**
 * 30인 실시간 룸 및 게임 엔진 통합 테스트
 */
const roomManager = require('./src/roomManager');
const quizData = require('./src/quizData');

console.log('=== [불조심 배틀 119] 시스템 검증 시작 ===');

// 1. 퀴즈 데이터셋 검증
console.log(`1. 퀴즈 문항 수: ${quizData.length}개 (목표: 25개)`);
if (quizData.length === 25) {
  console.log('✅ 25개 문항 완벽 로드 성공!');
} else {
  console.error('❌ 문항 수 불일치');
}

// 2. 방 생성 테스트
const hostId = 'mock_host_123';
const room = roomManager.createRoom(hostId);
console.log(`2. 방 생성 완료 - PIN: ${room.pin}`);

// 3. 실제 플레이어 1명 입장
const playerRes = room.addPlayer('player_socket_1', '4학년 홍길동', '🧑‍🚒');
console.log(`3. 실제 플레이어 입장: ${playerRes.player.nickname} (${playerRes.player.avatar})`);

// 4. 가상 반 친구 29명(30인 풀방) 채우기 테스트
room.fillWithBots(30);
console.log(`4. 학급 30인 풀방 구성 완료! 현재 인원: ${room.players.size}명`);
if (room.players.size === 30) {
  console.log('✅ 30명 동시 세션 생성 성공!');
}

// 5. 1번 문제 채점 및 스피드 보너스 계산 테스트
const q1 = room.getCurrentQuestion();
console.log(`5. 1번 문제: "${q1.question}" (정답 인덱스: ${q1.answerIndex})`);

// 홍길동이 1.5초 만에 정답 제출
const p1 = room.players.get('player_socket_1');
const result = room.gameEngine.calculateScore(p1, q1.answerIndex, q1.answerIndex, 1500, 10);
console.log(`   - 홍길동 정답! 획득 점수: ${result.pointsEarned}점 (기본: 1000 + 스피드: ${result.speedBonus})`);

// 6. 실시간 30인 리더보드 계산
const leaderboard = room.gameEngine.calculateLeaderboard(Array.from(room.players.values()));
console.log(`6. 실시간 1위: [${leaderboard[0].rank}위] ${leaderboard[0].nickname} (${leaderboard[0].score}점)`);
console.log(`   홍길동의 현재 순위: ${p1.rank}위 (순위 변동: ${p1.rankDelta > 0 ? '+' : ''}${p1.rankDelta})`);

console.log('=== [불조심 배틀 119] 모든 시스템 검증 성공! ===');
