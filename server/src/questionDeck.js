const VARIANTS_PER_CONCEPT = 5;

function shuffle(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
  }
  return shuffled;
}

function groupByConcept(questions) {
  const groups = new Map();
  for (const question of questions) {
    if (!Number.isInteger(question.conceptId)) {
      throw new Error(`문항 ${question.id}에 conceptId가 없습니다.`);
    }
    if (!groups.has(question.conceptId)) groups.set(question.conceptId, []);
    groups.get(question.conceptId).push(question);
  }

  for (const [conceptId, variants] of groups) {
    if (variants.length !== VARIANTS_PER_CONCEPT) {
      throw new Error(`개념 ${conceptId}의 변형 문항은 ${VARIANTS_PER_CONCEPT}개여야 합니다.`);
    }
    variants.sort((a, b) => a.id - b.id);
  }
  return groups;
}

function createConceptQuestionDeck(
  questions,
  { variantRound = 0, variantSeed = 0, random = Math.random } = {}
) {
  const conceptGroups = groupByConcept(questions);
  const selectedQuestions = [...conceptGroups.entries()]
    .sort(([leftId], [rightId]) => leftId - rightId)
    .map(([conceptId, variants]) => {
      const variantIndex = (
        conceptId - 1 + variantSeed + variantRound
      ) % variants.length;
      return variants[variantIndex];
    });

  return shuffle(selectedQuestions, random);
}

module.exports = {
  VARIANTS_PER_CONCEPT,
  createConceptQuestionDeck,
  groupByConcept,
  shuffle
};
