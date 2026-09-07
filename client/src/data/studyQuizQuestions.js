import generatedQuestions from './studyQuizQuestions.generated.json';

export { STUDY_IMPORTANCE_ORDER } from './studyQuizImportance';
export const STUDY_QUESTIONS = generatedQuestions;

export function getImportanceLabel(rank) {
  if (rank <= 25) return '생명안전 최우선';
  if (rank <= 55) return '대응 필수';
  if (rank <= 80) return '예방 필수';
  return '기초 원리';
}
