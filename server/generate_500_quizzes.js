/** 이전 파일명과의 호환을 위한 2026 퀴즈 생성 진입점 */
const { buildDataset, writeDataset } = require('./generate_2026_quizzes');
const dataset = buildDataset();
writeDataset(dataset);
console.log(`새 퀴즈 ${dataset.length}문항 생성 완료`);
