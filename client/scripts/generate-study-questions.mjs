import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { STUDY_IMPORTANCE_ORDER } from '../src/data/studyQuizImportance.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDirectory, '../../server/src/quizData.json');
const outputPath = resolve(scriptDirectory, '../src/data/studyQuizQuestions.generated.json');
const quizData = JSON.parse(await readFile(sourcePath, 'utf8'));
const firstMultipleChoiceByConcept = new Map();

for (const question of quizData) {
  if (question.type === 'multiple-choice' && !firstMultipleChoiceByConcept.has(question.conceptId)) {
    firstMultipleChoiceByConcept.set(question.conceptId, question);
  }
}

if (STUDY_IMPORTANCE_ORDER.length !== 100 || new Set(STUDY_IMPORTANCE_ORDER).size !== 100) {
  throw new Error('핵심 학습 중요도 목록은 서로 다른 100개 개념이어야 합니다.');
}

const selectedQuestions = STUDY_IMPORTANCE_ORDER.map((conceptId, index) => {
  const question = firstMultipleChoiceByConcept.get(conceptId);
  if (!question) throw new Error(`핵심 학습 문항을 찾을 수 없습니다: conceptId ${conceptId}`);

  return {
    id: question.id,
    conceptId: question.conceptId,
    part: question.part,
    category: question.category,
    question: question.question,
    options: question.options,
    answerIndex: question.answerIndex,
    explanation: question.explanation,
    sourcePages: question.sourcePages,
    importanceRank: index + 1
  };
});

await writeFile(outputPath, `${JSON.stringify(selectedQuestions, null, 2)}\n`, 'utf8');
console.log(`핵심 학습 문항 ${selectedQuestions.length}개 생성 완료`);
