"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPuzzle, type Language, type Puzzle } from "@/lib/puzzles";

type Progress = {
  stars: number;
  level: number;
  streak: number;
  attempts: number;
  solved: number;
};

type AgeGroupId = "5-7" | "8-10" | "11-12";

const STORAGE_KEY = "logic-quest-kids-progress";
const LANGUAGE_KEY = "logic-quest-kids-language";
const AGE_GROUP_KEY = "logic-quest-kids-age-group";

const defaultProgress: Progress = {
  stars: 0,
  level: 1,
  streak: 0,
  attempts: 0,
  solved: 0
};

function baseDifficultyFromLevel(level: number): number {
  if (level <= 2) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}

function ageOffset(group: AgeGroupId): number {
  if (group === "5-7") return -1;
  if (group === "8-10") return 0;
  return 1;
}

function difficultyFromLevel(level: number, group: AgeGroupId): number {
  const adjusted = baseDifficultyFromLevel(level) + ageOffset(group);
  return Math.max(1, Math.min(4, adjusted));
}

export default function HomePage() {
  const [language, setLanguage] = useState<Language>("en");
  const [ageGroup, setAgeGroup] = useState<AgeGroupId | null>(null);
  const [progress, setProgress] = useState<Progress>(defaultProgress);
  const [puzzle, setPuzzle] = useState<Puzzle>(() => createPuzzle(1, "en"));
  const [feedback, setFeedback] = useState("Welcome, Super Thinker! Ready for your first puzzle?");
  const [showHint, setShowHint] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const lastPuzzleKeyRef = useRef<string>(`${puzzle.prompt}|${puzzle.answer}`);
  const t = language === "sv" ? sv : en;

  const createFreshPuzzle = (difficulty: number, lang: Language) => {
    const lastKey = lastPuzzleKeyRef.current;
    let candidate = createPuzzle(difficulty, lang);
    let nextKey = `${candidate.prompt}|${candidate.answer}`;
    let retries = 0;
    while (nextKey === lastKey && retries < 8) {
      candidate = createPuzzle(difficulty, lang);
      nextKey = `${candidate.prompt}|${candidate.answer}`;
      retries += 1;
    }
    lastPuzzleKeyRef.current = nextKey;
    return candidate;
  };

  useEffect(() => {
    const rawLanguage = window.localStorage.getItem(LANGUAGE_KEY);
    if (rawLanguage === "en" || rawLanguage === "sv") {
      setLanguage(rawLanguage);
      setFeedback(rawLanguage === "sv" ? sv.welcome : en.welcome);
    }
    const rawAgeGroup = window.localStorage.getItem(AGE_GROUP_KEY);
    if (rawAgeGroup === "5-7" || rawAgeGroup === "8-10" || rawAgeGroup === "11-12") {
      setAgeGroup(rawAgeGroup);
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Progress;
      setProgress(parsed);
      const lang = rawLanguage === "sv" ? "sv" : "en";
      const group: AgeGroupId = rawAgeGroup === "5-7" || rawAgeGroup === "11-12" ? rawAgeGroup : "8-10";
      const loadedPuzzle = createFreshPuzzle(difficultyFromLevel(parsed.level, group), lang);
      setPuzzle(loadedPuzzle);
      setFeedback(lang === "sv" ? sv.welcomeBack : en.welcomeBack);
    } catch {
      setProgress(defaultProgress);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!ageGroup) return;
    window.localStorage.setItem(AGE_GROUP_KEY, ageGroup);
  }, [ageGroup]);

  const accuracy = useMemo(() => {
    if (progress.attempts === 0) return 0;
    return Math.round((progress.solved / progress.attempts) * 100);
  }, [progress.attempts, progress.solved]);

  const nextPuzzle = (level: number) => {
    if (!ageGroup) return;
    setSelected(null);
    setShowHint(false);
    setPuzzle(createFreshPuzzle(difficultyFromLevel(level, ageGroup), language));
  };

  const handleAnswer = (option: string) => {
    setSelected(option);
    const correct = option === puzzle.answer;
    setProgress((prev) => {
      const attempts = prev.attempts + 1;
      if (!correct) {
        const updated = { ...prev, attempts, streak: 0 };
        setFeedback(t.wrong);
        return updated;
      }

      const streak = prev.streak + 1;
      const solved = prev.solved + 1;
      const stars = prev.stars + 1;
      const level = 1 + Math.floor(stars / 3);
      const updated = { stars, level, streak, attempts, solved };
      setFeedback(streak >= 3 ? t.correctStreak : t.correct);
      return updated;
    });

    if (correct) {
      const nextLevel = 1 + Math.floor((progress.stars + 1) / 3);
      nextPuzzle(nextLevel);
    }
  };

  const handleNewRound = () => {
    setFeedback(t.newRound);
    nextPuzzle(progress.level);
  };

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    setFeedback(lang === "sv" ? sv.languageChanged : en.languageChanged);
    setSelected(null);
    setShowHint(false);
    if (ageGroup) {
      setPuzzle(createFreshPuzzle(difficultyFromLevel(progress.level, ageGroup), lang));
    }
  };

  const startQuest = (group: AgeGroupId) => {
    setAgeGroup(group);
    setProgress(defaultProgress);
    setSelected(null);
    setShowHint(false);
    const difficulty = difficultyFromLevel(1, group);
    setPuzzle(createFreshPuzzle(difficulty, language));
    setFeedback(language === "sv" ? sv.startQuest : en.startQuest);
  };

  const resetFrontPage = () => {
    setAgeGroup(null);
    setFeedback(language === "sv" ? sv.chooseAgeFirst : en.chooseAgeFirst);
  };

  if (!ageGroup) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
        <header className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-sky-100">
          <h1 className="text-3xl font-black tracking-tight text-sky-700 sm:text-4xl">Logic Quest Kids</h1>
          <p className="mt-2 text-slate-600">{t.frontSubtitle}</p>
          <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1">
            <button
              onClick={() => changeLanguage("en")}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                language === "en" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              English
            </button>
            <button
              onClick={() => changeLanguage("sv")}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                language === "sv" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Svenska
            </button>
          </div>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-fuchsia-100">
          <p className="text-sm font-semibold uppercase tracking-wide text-fuchsia-500">{t.chooseAgeTitle}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">{t.chooseAgeSubtitle}</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => startQuest("5-7")}
              className="rounded-2xl border-2 border-sky-200 bg-sky-50 px-4 py-4 text-left hover:border-sky-300"
            >
              <p className="text-xl font-black text-sky-800">{t.age57}</p>
              <p className="mt-1 text-sm text-slate-600">{t.age57Desc}</p>
            </button>
            <button
              onClick={() => startQuest("8-10")}
              className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-4 text-left hover:border-emerald-300"
            >
              <p className="text-xl font-black text-emerald-800">{t.age810}</p>
              <p className="mt-1 text-sm text-slate-600">{t.age810Desc}</p>
            </button>
            <button
              onClick={() => startQuest("11-12")}
              className="rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-4 text-left hover:border-violet-300"
            >
              <p className="text-xl font-black text-violet-800">{t.age1112}</p>
              <p className="mt-1 text-sm text-slate-600">{t.age1112Desc}</p>
            </button>
          </div>
        </section>

        <footer className="rounded-2xl bg-slate-900 p-4 text-sm font-medium text-white">{feedback}</footer>
      </main>
    );
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-sky-100">
        <h1 className="text-3xl font-black tracking-tight text-sky-700 sm:text-4xl">Logic Quest Kids</h1>
        <p className="mt-2 text-slate-600">{t.subtitle}</p>
        <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1">
          <button
            onClick={() => changeLanguage("en")}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              language === "en" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            English
          </button>
          <button
            onClick={() => changeLanguage("sv")}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              language === "sv" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            Svenska
          </button>
        </div>
        <div className="mt-4">
          <button
            onClick={resetFrontPage}
            className="rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-300"
          >
            {t.changeAgeGroup}
          </button>
        </div>
      </header>

      <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 sm:grid-cols-4">
        <ScoreCard label={t.stars} value={String(progress.stars)} />
        <ScoreCard label={t.level} value={String(progress.level)} />
        <ScoreCard label={t.streak} value={String(progress.streak)} />
        <ScoreCard label={t.accuracy} value={`${accuracy}%`} />
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-fuchsia-100">
        <p className="text-sm font-semibold uppercase tracking-wide text-fuchsia-500">{t.worldLabel}</p>
        {puzzle.matrix ? (
          <>
            <p className="mt-2 text-lg font-bold text-slate-800">{puzzle.prompt}</p>
            <div className="mt-4 flex flex-wrap items-start justify-center gap-6">
              <LabeledMatrixImage label={t.pattern1Label} grid={puzzle.matrix.pattern1} />
              <LabeledMatrixImage label={t.pattern2Label} grid={puzzle.matrix.pattern2} />
            </div>
          </>
        ) : (
          <pre className="mt-2 whitespace-pre-wrap text-2xl font-bold text-slate-800">{puzzle.prompt}</pre>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {puzzle.options.map((option, idx) => {
            const matrixGrid = puzzle.optionMatrixGrids?.[idx];
            return (
            <button
              key={option}
              onClick={() => handleAnswer(option)}
              className={`rounded-2xl border-2 px-4 py-3 text-xl font-bold transition ${
                selected === option
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300"
              }`}
            >
              {puzzle.matrix && matrixGrid ? (
                <img
                  src={matrixGridToSvgDataUri(matrixGrid)}
                  alt={option}
                  width={72}
                  height={72}
                  className="mx-auto select-none"
                />
              ) : (
                <span className="whitespace-pre font-mono text-base">{option}</span>
              )}
            </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowHint((prev) => !prev)}
            className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800"
          >
            {showHint ? t.hideHint : t.showHint}
          </button>
          <button
            onClick={handleNewRound}
            className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            {t.newPuzzle}
          </button>
          {showHint ? <p className="text-sm text-slate-600">{t.hintPrefix} {puzzle.hint}</p> : null}
        </div>
      </section>

      <footer className="rounded-2xl bg-slate-900 p-4 text-sm font-medium text-white">{feedback}</footer>
    </main>
  );
}

const en = {
  welcome: "Welcome, Super Thinker! Ready for your first puzzle?",
  welcomeBack: "Welcome back! Your quest is waiting.",
  subtitle: "Solve patterns, earn stars, and level up your Super Thinker powers.",
  frontSubtitle: "Start your quest by choosing the age group you want to practice.",
  chooseAgeTitle: "Quest Start",
  chooseAgeSubtitle: "Pick an age group to begin your adventure.",
  age57: "Ages 5-7",
  age57Desc: "Gentle patterns and starter challenges.",
  age810: "Ages 8-10",
  age810Desc: "Balanced logic puzzles and mixed patterns.",
  age1112: "Ages 11-12",
  age1112Desc: "Trickier patterns and harder logic jumps.",
  changeAgeGroup: "Change Age Group",
  stars: "Stars",
  level: "Level",
  streak: "Streak",
  accuracy: "Accuracy",
  worldLabel: "Forest World - Puzzle",
  showHint: "Show Hint",
  hideHint: "Hide Hint",
  newPuzzle: "New Puzzle",
  hintPrefix: "Hint:",
  wrong: "Great try! You are learning fast. Use the hint and try again.",
  correct: "Nice solve! You earned a star.",
  correctStreak: "Amazing streak! You unlocked a harder challenge.",
  newRound: "New challenge loaded. You can do this!",
  languageChanged: "Language switched to English.",
  startQuest: "Quest started! You are ready.",
  chooseAgeFirst: "Choose an age group to start your quest.",
  pattern1Label: "Pattern 1",
  pattern2Label: "Pattern 2"
};

const sv = {
  welcome: "Välkommen, supertänkare! Redo för ditt första pussel?",
  welcomeBack: "Välkommen tillbaka! Ditt uppdrag väntar.",
  subtitle: "Lös mönster, samla stjärnor och levla upp dina supertänkarkrafter.",
  frontSubtitle: "Starta ditt uppdrag genom att välja åldersgrupp att träna på.",
  chooseAgeTitle: "Uppdragsstart",
  chooseAgeSubtitle: "Välj en åldersgrupp för att börja äventyret.",
  age57: "Ålder 5-7",
  age57Desc: "Mjuka mönster och enkla startutmaningar.",
  age810: "Ålder 8-10",
  age810Desc: "Balanserade logikpussel och blandade mönster.",
  age1112: "Ålder 11-12",
  age1112Desc: "Klurigare mönster och svårare logiksprång.",
  changeAgeGroup: "Byt åldersgrupp",
  stars: "Stjärnor",
  level: "Nivå",
  streak: "Svit",
  accuracy: "Träffsäkerhet",
  worldLabel: "Skogsvärld - Pussel",
  showHint: "Visa ledtråd",
  hideHint: "Dölj ledtråd",
  newPuzzle: "Nytt pussel",
  hintPrefix: "Ledtråd:",
  wrong: "Bra försök! Du lär dig snabbt. Använd ledtråden och prova igen.",
  correct: "Snyggt löst! Du fick en stjärna.",
  correctStreak: "Fantastisk svit! Du låste upp en svårare utmaning.",
  newRound: "Ny utmaning laddad. Du klarar det!",
  languageChanged: "Språket är nu svenska.",
  startQuest: "Uppdraget har startat! Du är redo.",
  chooseAgeFirst: "Välj en åldersgrupp för att starta uppdraget.",
  pattern1Label: "Mönster 1",
  pattern2Label: "Mönster 2"
};

function ScoreCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl bg-gradient-to-b from-sky-50 to-emerald-50 p-3 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-800">{value}</p>
    </article>
  );
}

function matrixGridToSvgDataUri(grid: number[][]): string {
  const cell = 20;
  const pad = 2;
  const w = cell * 3;
  const h = cell * 3;
  const on = "#10b981";
  const off = "#f1f5f9";
  const stroke = "#94a3b8";

  const rects: string[] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const x = c * cell;
      const y = r * cell;
      const filled = grid[r]?.[c] === 1;
      rects.push(
        `<rect x="${x + pad}" y="${y + pad}" width="${cell - pad * 2}" height="${
          cell - pad * 2
        }" rx="4" fill="${filled ? on : off}" stroke="${stroke}" stroke-width="1" />`
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${rects.join("")}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function LabeledMatrixImage({ label, grid }: { label: string; grid: number[][] }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      <img
        src={matrixGridToSvgDataUri(grid)}
        alt={label}
        width={72}
        height={72}
        className="mt-2 mx-auto select-none"
      />
    </div>
  );
}
