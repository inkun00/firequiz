const assert = require('assert');
const quizData = require('./src/quizData');
const { buildDataset, normalize } = require('./generate_2026_quizzes');
const { isCorrectAnswer } = require('./src/gameEngine');
const roomManager = require('./src/roomManager');

const rebuilt = buildDataset();
assert.deepStrictEqual(quizData, rebuilt, '저장된 데이터와 생성 결과가 다릅니다.');
assert.strictEqual(quizData.length, 500);
assert.strictEqual(quizData.filter((item) => item.type === 'multiple-choice').length, 400);
assert.strictEqual(quizData.filter((item) => item.type === 'short-answer').length, 100);

const questionKeys = quizData.map((item) => normalize(item.question));
assert.strictEqual(new Set(questionKeys).size, 500, '중복 문항이 있습니다.');

const answerDistribution = quizData
  .filter((item) => item.type === 'multiple-choice')
  .reduce((counts, item) => {
    counts[item.answerIndex] += 1;
    assert.strictEqual(item.options.length, 4);
    assert.strictEqual(new Set(item.options).size, 4);
    return counts;
  }, [0, 0, 0, 0]);
assert.deepStrictEqual(answerDistribution, [100, 100, 100, 100]);

const short119 = quizData.find(
  (item) => item.type === 'short-answer' && item.acceptedAnswers.includes('일일구')
);
assert(short119, '119 단답형 문항을 찾을 수 없습니다.');
assert.strictEqual(isCorrectAnswer(short119, ' 119! '), true);
assert.strictEqual(isCorrectAnswer(short119, '일일구'), true);
assert.strictEqual(isCorrectAnswer(short119, '112'), false);
assert.strictEqual(isCorrectAnswer(short119, -1), false);

const distanceQuestion = quizData.find(
  (item) => item.type === 'short-answer' && item.acceptedAnswers.includes('1.2m')
);
assert(distanceQuestion, '1.2m 거리 단답형 문항을 찾을 수 없습니다.');
assert.strictEqual(isCorrectAnswer(distanceQuestion, '1.2 m'), true);
assert.strictEqual(isCorrectAnswer(distanceQuestion, '12m'), false);

const multipleChoice = quizData[0];
assert.strictEqual(isCorrectAnswer(multipleChoice, multipleChoice.answerIndex), true);
assert.strictEqual(isCorrectAnswer(multipleChoice, (multipleChoice.answerIndex + 1) % 4), false);

const room = roomManager.createRoom('quiz-validation-host');
const { player } = room.addPlayer('quiz-validation-player', '검증 학생');
player.currentQuestion = short119;
const shortPayload = room.getQuestionPayload(player);
assert.strictEqual(shortPayload.type, 'short-answer');
assert.deepStrictEqual(shortPayload.options, []);
assert.strictEqual(shortPayload.timeLimit, 30);
assert.strictEqual('answer' in shortPayload, false, '정답이 클라이언트에 노출되었습니다.');
assert.strictEqual('acceptedAnswers' in shortPayload, false, '허용 정답이 클라이언트에 노출되었습니다.');

console.log('퀴즈 데이터 검증 완료');
console.log(`전체 ${quizData.length} / 객관식 400 / 단답형 100`);
console.log(`객관식 정답 위치 분포: ${answerDistribution.join(', ')}`);
