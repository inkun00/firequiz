const assert = require('assert');
const quizData = require('./src/quizData');
const { buildDataset, normalize } = require('./generate_2026_quizzes');
const { isCorrectAnswer } = require('./src/gameEngine');
const roomManager = require('./src/roomManager');
const { createConceptQuestionDeck } = require('./src/questionDeck');
const conceptCount = new Set(quizData.map((item) => item.conceptId)).size;

const rebuilt = buildDataset();
assert.deepStrictEqual(quizData, rebuilt, '저장된 데이터와 생성 결과가 다릅니다.');
assert.strictEqual(quizData.length, conceptCount * 5);
assert.strictEqual(quizData.filter((item) => item.type === 'multiple-choice').length, conceptCount * 4);
assert.strictEqual(quizData.filter((item) => item.type === 'short-answer').length, conceptCount);

const questionKeys = quizData.map((item) => normalize(item.question));
assert.strictEqual(new Set(questionKeys).size, conceptCount * 5, '중복 문항이 있습니다.');

const conceptCounts = quizData.reduce((counts, item) => {
  counts.set(item.conceptId, (counts.get(item.conceptId) || 0) + 1);
  return counts;
}, new Map());
assert(conceptCounts.size > 100, '추가 PDF 개념이 포함되어야 합니다.');
assert([...conceptCounts.values()].every(count => count === 5), '개념마다 변형 문항이 5개여야 합니다.');
for (const part of ['Part 14. 대형 화재사례', 'Part 15. 불조심 포스터', 'Part 16. 만화로 알아보는 대피방법']) {
  assert(quizData.some(item => item.part === part), `${part} 개념이 포함되어야 합니다.`);
}
assert(Math.max(...quizData.flatMap(item => item.sourcePages)) >= 126, 'PDF 후반부 페이지가 반영되어야 합니다.');

const variantDecks = Array.from({ length: 5 }, (_, variantRound) => (
  createConceptQuestionDeck(quizData, {
    variantSeed: 0,
    variantRound,
    random: () => 0.5
  })
));
for (const deck of variantDecks) {
  assert.strictEqual(deck.length, conceptCount, '한 게임은 개념당 한 문제씩 출제되어야 합니다.');
  assert.strictEqual(new Set(deck.map(item => item.conceptId)).size, conceptCount, '한 게임에서 같은 개념이 반복되면 안 됩니다.');
  const multipleChoiceCount = deck.filter(item => item.type === 'multiple-choice').length;
  const shortAnswerCount = deck.filter(item => item.type === 'short-answer').length;
  assert(multipleChoiceCount === Math.floor(conceptCount * 4 / 5) || multipleChoiceCount === Math.ceil(conceptCount * 4 / 5));
  assert.strictEqual(shortAnswerCount, conceptCount - multipleChoiceCount);
}
for (let conceptId = 1; conceptId <= conceptCount; conceptId += 1) {
  const questionIds = variantDecks.map(deck => deck.find(item => item.conceptId === conceptId).id);
  assert.strictEqual(new Set(questionIds).size, 5, `개념 ${conceptId}가 5회 재경기 동안 같은 변형을 반복합니다.`);
}

const answerDistribution = quizData
  .filter((item) => item.type === 'multiple-choice')
  .reduce((counts, item) => {
    counts[item.answerIndex] += 1;
    assert.strictEqual(item.options.length, 4);
    assert.strictEqual(new Set(item.options).size, 4);
    return counts;
  }, [0, 0, 0, 0]);
assert.deepStrictEqual(answerDistribution, Array(4).fill(conceptCount));

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
assert.strictEqual(shortPayload.totalQuestions, conceptCount);
assert.strictEqual('answer' in shortPayload, false, '정답이 클라이언트에 노출되었습니다.');
assert.strictEqual('acceptedAnswers' in shortPayload, false, '허용 정답이 클라이언트에 노출되었습니다.');

const firstRoundVariants = new Map(
  player.shuffledQuestions.map(item => [item.conceptId, item.id])
);
room.resetToLobby();
assert.strictEqual(player.questionVariantRound, 1);
assert.strictEqual(player.shuffledQuestions.length, conceptCount);
for (const item of player.shuffledQuestions) {
  assert.notStrictEqual(
    item.id,
    firstRoundVariants.get(item.conceptId),
    `재경기에서 개념 ${item.conceptId}의 같은 변형이 반복되었습니다.`
  );
}
roomManager.removeRoom(room.pin);

console.log('퀴즈 데이터 검증 완료');
console.log(`전체 ${quizData.length} / 객관식 ${conceptCount * 4} / 단답형 ${conceptCount}`);
console.log(`객관식 정답 위치 분포: ${answerDistribution.join(', ')}`);
