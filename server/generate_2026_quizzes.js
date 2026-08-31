/**
 * 2026년 『불조심 길라잡이』 기반 500문항 생성기
 * - 객관식 400문항
 * - 단답형 100문항
 */

const fs = require('fs');
const path = require('path');
const concepts = require('./src/quizConcepts');

function rotateChoices(correct, distractors, seed) {
  const original = [correct, ...distractors];
  if (original.length !== 4 || new Set(original).size !== 4) {
    throw new Error(`선택지는 서로 다른 4개여야 합니다: ${original.join(' | ')}`);
  }

  const answerIndex = seed % 4;
  const options = Array(4);
  options[answerIndex] = correct;
  let cursor = 0;
  for (let index = 0; index < 4; index += 1) {
    if (index === answerIndex) continue;
    options[index] = distractors[cursor];
    cursor += 1;
  }
  return { options, answerIndex };
}

function addMultipleChoice(target, item, question, correct, distractors, variant) {
  const id = target.length + 1;
  const { options, answerIndex } = rotateChoices(correct, distractors, id + variant);
  target.push({
    id,
    type: 'multiple-choice',
    part: item.part,
    category: item.category,
    question,
    options,
    answerIndex,
    explanation: item.explanation,
    timeLimit: 20,
    sourcePages: item.sourcePages
  });
}

function normalize(value) {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s/gu, '')
    .replace(/[!！?？。]+$/gu, '')
    .replace(/[～〜]/gu, '~');
}

function buildDataset() {
  if (concepts.length !== 100) {
    throw new Error(`핵심 개념은 정확히 100개여야 합니다. 현재: ${concepts.length}`);
  }

  const multipleChoice = [];
  concepts.forEach((item, conceptIndex) => {
    addMultipleChoice(multipleChoice, item, item.directQuestion, item.answer, item.distractors, conceptIndex);
    addMultipleChoice(
      multipleChoice,
      item,
      `자료를 읽고 질문에 답하세요. ${item.clue} 질문: ${item.directQuestion}`,
      item.answer,
      item.distractors,
      conceptIndex + 1
    );
    addMultipleChoice(
      multipleChoice,
      item,
      `${item.category} 근거 적용 문제입니다. ${item.directQuestion} 판단 근거: ${item.clue}`,
      item.answer,
      item.distractors,
      conceptIndex + 2
    );
    addMultipleChoice(
      multipleChoice,
      item,
      item.scenarioQuestion,
      item.scenarioAnswer,
      item.scenarioDistractors,
      conceptIndex + 3
    );
  });

  const shortAnswer = concepts.map((item, index) => ({
    id: multipleChoice.length + index + 1,
    type: 'short-answer',
    part: item.part,
    category: item.category,
    question: item.shortQuestion,
    answer: item.acceptedAnswers[0],
    acceptedAnswers: [...new Set(item.acceptedAnswers)],
    explanation: item.explanation,
    timeLimit: 30,
    sourcePages: item.sourcePages
  }));

  const dataset = [...multipleChoice, ...shortAnswer];
  validateDataset(dataset);
  return dataset;
}

function validateDataset(dataset) {
  const multipleChoice = dataset.filter((item) => item.type === 'multiple-choice');
  const shortAnswer = dataset.filter((item) => item.type === 'short-answer');
  if (dataset.length !== 500 || multipleChoice.length !== 400 || shortAnswer.length !== 100) {
    throw new Error(`문항 수 오류: 전체 ${dataset.length}, 객관식 ${multipleChoice.length}, 단답형 ${shortAnswer.length}`);
  }

  dataset.forEach((item, index) => {
    if (item.id !== index + 1) throw new Error(`ID 순서 오류: ${item.id}`);
    if (!item.question || !item.explanation || !item.sourcePages?.length) {
      throw new Error(`필수 필드 누락: ${item.id}`);
    }
    if (item.type === 'multiple-choice') {
      if (item.options.length !== 4 || new Set(item.options).size !== 4) {
        throw new Error(`객관식 선택지 오류: ${item.id}`);
      }
      if (!Number.isInteger(item.answerIndex) || item.answerIndex < 0 || item.answerIndex > 3) {
        throw new Error(`정답 번호 오류: ${item.id}`);
      }
    } else if (!item.acceptedAnswers?.length || !item.acceptedAnswers.every(normalize)) {
      throw new Error(`단답형 정답 오류: ${item.id}`);
    }
  });

  const normalizedQuestions = dataset.map((item) => normalize(item.question));
  if (new Set(normalizedQuestions).size !== dataset.length) {
    throw new Error('중복된 문제 문장이 있습니다.');
  }
}

function writeDataset(dataset) {
  const json = `${JSON.stringify(dataset, null, 2)}\n`;
  const jsonOutputs = [
    path.join(__dirname, 'src', 'quizData.json'),
    path.join(__dirname, 'quizData_500.json')
  ];
  jsonOutputs.forEach((output) => fs.writeFileSync(output, json, 'utf8'));

  const loaderOutput = path.join(__dirname, 'src', 'quizData.js');
  fs.writeFileSync(
    loaderOutput,
    "/** 2026년 『불조심 길라잡이』 기반 500문항 데이터셋 */\nmodule.exports = require('./quizData.json');\n",
    'utf8'
  );

  const compatibilityOutput = path.join(__dirname, 'generate_500_quizzes.js');
  fs.writeFileSync(
    compatibilityOutput,
    [
      "/** 이전 파일명과의 호환을 위한 2026 퀴즈 생성 진입점 */",
      "const { buildDataset, writeDataset } = require('./generate_2026_quizzes');",
      "const dataset = buildDataset();",
      "writeDataset(dataset);",
      "console.log(`새 퀴즈 ${dataset.length}문항 생성 완료`);",
      ""
    ].join('\n'),
    'utf8'
  );

  return [...jsonOutputs, loaderOutput, compatibilityOutput];
}

if (require.main === module) {
  const dataset = buildDataset();
  const outputs = writeDataset(dataset);
  console.log(`새 퀴즈 ${dataset.length}문항 생성 완료`);
  console.log(`객관식: ${dataset.filter((item) => item.type === 'multiple-choice').length}`);
  console.log(`단답형: ${dataset.filter((item) => item.type === 'short-answer').length}`);
  outputs.forEach((output) => console.log(path.relative(process.cwd(), output)));
}

module.exports = { buildDataset, validateDataset, normalize, writeDataset };
