import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  Flame,
  Home,
  RotateCcw,
  ShieldCheck,
  Trophy,
  XCircle
} from 'lucide-react';
import { getImportanceLabel, STUDY_QUESTIONS } from '../data/studyQuizQuestions';

const STORAGE_KEY = 'firequiz_core_100_progress_v1';
const OPTION_LABELS = ['①', '②', '③', '④'];
const OPTION_STYLES = [
  'border-rose-400/50 hover:border-rose-300 hover:bg-rose-950/50',
  'border-amber-400/50 hover:border-amber-300 hover:bg-amber-950/50',
  'border-cyan-400/50 hover:border-cyan-300 hover:bg-cyan-950/50',
  'border-violet-400/50 hover:border-violet-300 hover:bg-violet-950/50'
];

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.totalQuestions !== STUDY_QUESTIONS.length) return null;
    return {
      answers: saved.answers || {},
      currentIndex: Math.min(Math.max(saved.currentIndex || 0, 0), STUDY_QUESTIONS.length - 1),
      finished: Boolean(saved.finished)
    };
  } catch {
    return null;
  }
}

export default function StudyQuiz({ onExit }) {
  const savedProgress = useMemo(loadProgress, []);
  const [answers, setAnswers] = useState(savedProgress?.answers || {});
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex || 0);
  const [finished, setFinished] = useState(savedProgress?.finished || false);
  const currentQuestion = STUDY_QUESTIONS[currentIndex];
  const selectedAnswer = answers[currentQuestion.id];
  const hasAnswered = Number.isInteger(selectedAnswer);
  const isCorrect = selectedAnswer === currentQuestion.answerIndex;

  const { answeredCount, correctCount, wrongQuestionIndexes } = useMemo(() => {
    let correct = 0;
    const wrong = [];

    STUDY_QUESTIONS.forEach((question, index) => {
      const answer = answers[question.id];
      if (!Number.isInteger(answer)) return;
      if (answer === question.answerIndex) correct += 1;
      else wrong.push(index);
    });

    return {
      answeredCount: Object.keys(answers).length,
      correctCount: correct,
      wrongQuestionIndexes: wrong
    };
  }, [answers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      answers,
      currentIndex,
      finished,
      totalQuestions: STUDY_QUESTIONS.length
    }));
  }, [answers, currentIndex, finished]);

  const selectAnswer = (optionIndex) => {
    if (hasAnswered) return;
    setAnswers(previous => ({ ...previous, [currentQuestion.id]: optionIndex }));
  };

  const goNext = () => {
    if (!hasAnswered) return;
    if (currentIndex === STUDY_QUESTIONS.length - 1) {
      setFinished(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setCurrentIndex(index => index + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetQuiz = () => {
    if (answeredCount > 0 && !window.confirm('저장된 학습 기록을 지우고 1번부터 다시 풀까요?')) return;
    setAnswers({});
    setCurrentIndex(0);
    setFinished(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const reviewWrongAnswers = () => {
    if (wrongQuestionIndexes.length === 0) return;
    setCurrentIndex(wrongQuestionIndexes[0]);
    setFinished(false);
  };

  if (finished) {
    const scorePercent = Math.round((correctCount / STUDY_QUESTIONS.length) * 100);
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-4 py-8 text-white">
        <section className="mx-auto max-w-2xl rounded-[2rem] border border-emerald-400/40 bg-slate-900/90 p-6 text-center shadow-2xl md:p-10">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-[0_0_35px_rgba(251,191,36,0.35)]">
            <Trophy className="h-10 w-10" />
          </div>
          <p className="mb-2 text-sm font-bold text-emerald-300">핵심 100 학습 완료</p>
          <h1 className="text-3xl font-black md:text-4xl">안전 실력이 한 단계 올랐어요!</h1>
          <div className="mx-auto my-7 grid max-w-lg grid-cols-3 gap-3">
            <ResultStat label="점수" value={`${scorePercent}점`} color="text-yellow-300" />
            <ResultStat label="정답" value={`${correctCount}개`} color="text-emerald-300" />
            <ResultStat label="오답" value={`${wrongQuestionIndexes.length}개`} color="text-rose-300" />
          </div>
          <p className="mb-7 text-sm leading-relaxed text-slate-300">
            {wrongQuestionIndexes.length > 0
              ? '틀린 문제의 정답과 해설을 다시 확인하면 중요한 행동 요령을 더 오래 기억할 수 있어요.'
              : '100개의 핵심 개념을 모두 정확히 익혔습니다. 완벽해요!'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {wrongQuestionIndexes.length > 0 && (
              <button
                type="button"
                onClick={reviewWrongAnswers}
                className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-4 font-black shadow-lg transition hover:scale-[1.01] active:scale-95"
              >
                <BookOpenCheck className="h-5 w-5" /> 오답 해설 다시 보기
              </button>
            )}
            <button
              type="button"
              onClick={resetQuiz}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-5 py-4 font-bold transition hover:bg-slate-700 active:scale-95"
            >
              <RotateCcw className="h-5 w-5" /> 처음부터 다시 풀기
            </button>
            <button
              type="button"
              onClick={onExit}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-5 py-4 font-bold text-slate-300 transition hover:border-slate-500 sm:col-span-2"
            >
              <Home className="h-5 w-5" /> 홈으로 돌아가기
            </button>
          </div>
        </section>
      </main>
    );
  }

  const progressPercent = ((currentIndex + 1) / STUDY_QUESTIONS.length) * 100;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 px-4 py-5 text-white md:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-bold text-slate-300 transition hover:border-slate-500"
          >
            <ArrowLeft className="h-4 w-4" /> 홈
          </button>
          <div className="text-center">
            <p className="text-xs font-bold text-orange-300">불조심 길라잡이</p>
            <h1 className="text-lg font-black md:text-xl">핵심 개념 100</h1>
          </div>
          <button
            type="button"
            onClick={resetQuiz}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-bold text-slate-400 transition hover:text-white"
            aria-label="학습 기록 초기화"
          >
            <RotateCcw className="h-4 w-4" /> 초기화
          </button>
        </header>

        <section className="mb-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-300">중요도 {currentQuestion.importanceRank}위 · {getImportanceLabel(currentQuestion.importanceRank)}</span>
            <span className="text-yellow-300">{currentIndex + 1} / {STUDY_QUESTIONS.length}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuenow={currentIndex + 1}
            aria-valuemin="1"
            aria-valuemax={STUDY_QUESTIONS.length}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-yellow-300 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-bold text-slate-500">
            <span>{currentQuestion.part.replace(/^Part\s\d+\.\s*/, '')}</span>
            <span>{answeredCount}문제 풀이 · {correctCount}문제 정답</span>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-700 bg-slate-900/95 p-5 shadow-2xl md:p-8">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 font-black shadow-lg">
              Q
            </div>
            <div>
              <span className="mb-1 inline-flex rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-cyan-300">
                {currentQuestion.category}
              </span>
              <h2 className="text-lg font-black leading-relaxed md:text-2xl">{currentQuestion.question}</h2>
            </div>
          </div>

          <div className="grid gap-3">
            {currentQuestion.options.map((option, optionIndex) => {
              const isSelected = selectedAnswer === optionIndex;
              const isAnswer = currentQuestion.answerIndex === optionIndex;
              let answerStyle = OPTION_STYLES[optionIndex];

              if (hasAnswered && isAnswer) answerStyle = 'border-emerald-400 bg-emerald-950/70 ring-2 ring-emerald-400/30';
              else if (hasAnswered && isSelected) answerStyle = 'border-rose-400 bg-rose-950/70 ring-2 ring-rose-400/30';
              else if (hasAnswered) answerStyle = 'border-slate-800 bg-slate-950/40 opacity-55';

              return (
                <button
                  type="button"
                  key={option}
                  onClick={() => selectAnswer(optionIndex)}
                  disabled={hasAnswered}
                  className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 bg-slate-950/70 p-4 text-left transition ${answerStyle} ${hasAnswered ? 'cursor-default' : 'active:scale-[0.99]'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-black">
                    {OPTION_LABELS[optionIndex]}
                  </span>
                  <span className="flex-1 text-sm font-bold leading-relaxed md:text-base">{option}</span>
                  {hasAnswered && isAnswer && <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />}
                  {hasAnswered && isSelected && !isAnswer && <XCircle className="h-6 w-6 shrink-0 text-rose-300" />}
                </button>
              );
            })}
          </div>

          {!hasAnswered ? (
            <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-950/60 px-4 py-3 text-center text-xs font-bold text-slate-400">
              <ShieldCheck className="h-4 w-4 text-cyan-400" /> 답을 고르면 정답과 해설을 바로 확인할 수 있어요.
            </div>
          ) : (
            <div className={`mt-5 rounded-2xl border p-4 ${isCorrect ? 'border-emerald-400/60 bg-emerald-950/50' : 'border-rose-400/60 bg-rose-950/50'}`} aria-live="polite">
              <div className={`mb-2 flex items-center gap-2 font-black ${isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                {isCorrect ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {isCorrect ? '정답이에요!' : '아쉬워요. 정답을 확인해 보세요.'}
              </div>
              <p className="mb-2 text-sm font-black text-white">
                정답: {OPTION_LABELS[currentQuestion.answerIndex]} {currentQuestion.options[currentQuestion.answerIndex]}
              </p>
              <div className="rounded-xl bg-slate-950/55 p-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs font-black text-yellow-300">
                    <Flame className="h-3.5 w-3.5" /> 핵심 해설
                  </p>
                  <span className="text-[11px] font-bold text-slate-500">
                    길라잡이 {currentQuestion.sourcePages.map(page => `${page}쪽`).join(', ')}
                  </span>
                </div>
                <p className="text-sm font-medium leading-relaxed text-slate-200">{currentQuestion.explanation}</p>
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentIndex(index => Math.max(0, index - 1))}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> 이전
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!hasAnswered}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-black shadow-lg transition hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {currentIndex === STUDY_QUESTIONS.length - 1 ? '결과 보기' : '다음 문제'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ResultStat({ label, value, color }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-4">
      <p className="mb-1 text-xs font-bold text-slate-500">{label}</p>
      <p className={`text-xl font-black md:text-2xl ${color}`}>{value}</p>
    </div>
  );
}
