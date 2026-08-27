/**
 * 500 Quiz Dataset Builder and Validator
 * Combines all 10 parts, shuffles options deterministically for balanced answer distribution,
 * validates integrity, and generates server/src/quizData.js and server/src/quizData.json
 */

const fs = require('fs');
const path = require('path');

const part1 = require('./part1_fire_basics');
const part2 = require('./part2_fire_causes');
const part3 = require('./part3_fire_evacuation');
const part4 = require('./part4_firstaid_cpr');
const part5 = require('./part5_fire_facilities');
const part6 = require('./part6_escape_facilities');
const part7 = require('./part7_fire_stats');
const part8 = require('./part8_situational_safety');
const part9 = require('./part9_natural_disaster');
const part10 = require('./part10_general_trivia');

// Simple deterministic PRNG based on linear congruential generator for reproducible option shuffle
function createRng(seed = 20260826) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function build() {
  const allParts = [
    { name: "Part 1 (불이란?)", data: part1, target: 40 },
    { name: "Part 2 (화재가 나는 원인)", data: part2, target: 75 },
    { name: "Part 3 (화재가 났어요. 어떻게 할까요?)", data: part3, target: 65 },
    { name: "Part 4 (화상, 심폐소생술, 압사사고)", data: part4, target: 55 },
    { name: "Part 5 (소방시설이란?)", data: part5, target: 50 },
    { name: "Part 6 (피난시설이란?)", data: part6, target: 50 },
    { name: "Part 7 (화재 통계 및 특성)", data: part7, target: 25 },
    { name: "Part 8 (상황별 안전수칙)", data: part8, target: 60 },
    { name: "Part 9 (자연재난 안전수칙)", data: part9, target: 45 },
    { name: "Part 10 (소방관, 화재보험, 가정안전)", data: part10, target: 35 }
  ];

  console.log("=== Part Breakdown ===");
  let rawList = [];
  allParts.forEach((p, idx) => {
    console.log(`- ${p.name}: ${p.data.length} items (Target: ${p.target})`);
    if (p.data.length !== p.target) {
      console.warn(`WARNING: Part ${idx+1} length mismatch! Expected ${p.target}, got ${p.data.length}`);
    }
    rawList = rawList.concat(p.data);
  });

  console.log(`\nTotal raw questions collected: ${rawList.length}`);

  const rng = createRng(2026);
  const seenQuestions = new Set();
  const answerCounts = [0, 0, 0, 0];

  const processedList = rawList.map((item, index) => {
    // Check duplicate
    if (seenQuestions.has(item.question)) {
      console.warn(`Duplicate question found at #${index + 1}: ${item.question}`);
    }
    seenQuestions.add(item.question);

    const originalAnswerText = item.options[item.answerIndex];
    
    // Deterministic shuffle of options
    const optionObjs = item.options.map((opt, i) => ({
      text: opt,
      isCorrect: i === item.answerIndex,
      rand: rng()
    }));
    optionObjs.sort((a, b) => a.rand - b.rand);

    const shuffledOptions = optionObjs.map(o => o.text);
    const newAnswerIndex = optionObjs.findIndex(o => o.isCorrect);

    if (newAnswerIndex < 0 || newAnswerIndex > 3) {
      throw new Error(`Invalid newAnswerIndex for question #${index + 1}`);
    }
    if (shuffledOptions[newAnswerIndex] !== originalAnswerText) {
      throw new Error(`Answer mismatch for question #${index + 1}`);
    }

    answerCounts[newAnswerIndex]++;

    return {
      id: index + 1,
      part: item.part,
      category: item.category || "안전상식",
      question: item.question,
      options: shuffledOptions,
      answerIndex: newAnswerIndex,
      explanation: item.explanation,
      timeLimit: item.timeLimit || 20
    };
  });

  console.log("\n=== Validation & Answer Distribution ===");
  console.log(`Option 1 (index 0): ${answerCounts[0]} (${((answerCounts[0]/processedList.length)*100).toFixed(1)}%)`);
  console.log(`Option 2 (index 1): ${answerCounts[1]} (${((answerCounts[1]/processedList.length)*100).toFixed(1)}%)`);
  console.log(`Option 3 (index 2): ${answerCounts[2]} (${((answerCounts[2]/processedList.length)*100).toFixed(1)}%)`);
  console.log(`Option 4 (index 3): ${answerCounts[3]} (${((answerCounts[3]/processedList.length)*100).toFixed(1)}%)`);

  // Output file paths
  const quizDataJsPath = path.join(__dirname, '..', 'quizData.js');
  const quizDataJsonPath = path.join(__dirname, '..', 'quizData.json');
  const rootQuizDataJsonPath = path.join(__dirname, '..', '..', 'quizData_500.json');

  // 1. Generate quizData.js
  const jsContent = `/**
 * 『2026 불조심 길라잡이』(초등학생용 교재 128p, 한국화재보험협회) 완벽 기반 500문항 데이터셋
 * 
 * Part 01. '불'이란? (40문항: 1~40)
 * Part 02. 화재가 나는 원인 (75문항: 41~115)
 * Part 03. 화재가 났어요. 어떻게 할까요? (65문항: 116~180)
 * Part 04. 화상, 심폐소생술 및 압사사고 (55문항: 181~235)
 * Part 05. '소방시설'이란? (50문항: 236~285)
 * Part 06. '피난시설'이란? (50문항: 286~335)
 * Part 07. '화재'는 언제 많이 일어날까요? (25문항: 336~360)
 * Part 08. 상황에 따라 지켜야 할 사항 (60문항: 361~420)
 * Part 09. 자연재난 안전수칙 (45문항: 421~465)
 * Part 10. 소방관, 한국화재보험협회, 가정안전 (35문항: 466~500)
 */

const quizData = ${JSON.stringify(processedList, null, 2)};

module.exports = quizData;
`;

  fs.writeFileSync(quizDataJsPath, jsContent, 'utf-8');
  console.log(`\nSuccessfully wrote quizData.js -> ${quizDataJsPath}`);

  // 2. Generate quizData.json
  fs.writeFileSync(quizDataJsonPath, JSON.stringify(processedList, null, 2), 'utf-8');
  console.log(`Successfully wrote quizData.json -> ${quizDataJsonPath}`);

  fs.writeFileSync(rootQuizDataJsonPath, JSON.stringify(processedList, null, 2), 'utf-8');
  console.log(`Successfully wrote root backup quizData_500.json -> ${rootQuizDataJsonPath}`);

  return processedList.length;
}

const total = build();
console.log(`\n🎉 All ${total} fire safety quiz questions successfully created and validated!`);
