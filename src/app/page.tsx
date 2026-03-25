"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPuzzle, type CubeState, type Language, type Puzzle, type PuzzleType } from "@/lib/puzzles";

type Progress = {
  stars: number;
  level: number;
  streak: number;
  attempts: number;
  solved: number;
  rewardCount: number;
  lastRewardLevel: number;
};

type AgeGroupId = "5-7" | "8-10" | "11-12";

const STORAGE_KEY = "logic-quest-kids-progress";
const PROGRESS_BY_TYPE_KEY = "logic-quest-kids-progress-by-type";
const PLAYERS_KEY = "logic-quest-kids-players-v1";
const CURRENT_PLAYER_KEY = "logic-quest-kids-current-player";
const LANGUAGE_KEY = "logic-quest-kids-language";
const AGE_GROUP_KEY = "logic-quest-kids-age-group";
const PUZZLE_TYPE_KEY = "logic-quest-kids-puzzle-type";

type ProgressKey = PuzzleType | "all";

type PlayerSettings = {
  language: Language;
  puzzleType: PuzzleType | "all";
  frontAgeGroup: AgeGroupId | null;
  activeAgeGroup: AgeGroupId | null;
};

type PlayerData = {
  progressByType: Partial<Record<ProgressKey, Progress>>;
  settings: PlayerSettings;
};

type PlayersMap = Record<string, PlayerData>;

const defaultProgress: Progress = {
  stars: 0,
  level: 1,
  streak: 0,
  attempts: 0,
  solved: 0,
  rewardCount: 0,
  lastRewardLevel: 0
};

const REWARD_EVERY_LEVELS = 3;

function normalizeProgress(input: Partial<Progress> | undefined | null): Progress {
  const normalized: Progress = { ...defaultProgress, ...(input ?? {}) };

  // Backfill reward fields for existing saved progress.
  if (typeof input?.lastRewardLevel !== "number") {
    const last = Math.floor((normalized.level - 1) / REWARD_EVERY_LEVELS) * REWARD_EVERY_LEVELS;
    normalized.lastRewardLevel = last;
    normalized.rewardCount = Math.floor(last / REWARD_EVERY_LEVELS);
  }
  if (typeof input?.rewardCount !== "number") {
    normalized.rewardCount = Math.floor(normalized.lastRewardLevel / REWARD_EVERY_LEVELS);
  }
  return normalized;
}

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
  const [frontAgeGroup, setFrontAgeGroup] = useState<AgeGroupId | null>(null);
  const [puzzleType, setPuzzleType] = useState<PuzzleType | "all">("all");
  const [players, setPlayers] = useState<PlayersMap>({});
  const [currentPlayerName, setCurrentPlayerName] = useState<string>("");
  const [newPlayerName, setNewPlayerName] = useState<string>("");
  const [progress, setProgress] = useState<Progress>(defaultProgress);
  const [isHydrated, setIsHydrated] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle>(() =>
    createPuzzle(1, "en", undefined)
  );
  const [feedback, setFeedback] = useState("Welcome, Super Thinker! Ready for your first puzzle?");
  const [rewardBanner, setRewardBanner] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const lastPuzzleKeyRef = useRef<string>(`${puzzle.prompt}|${puzzle.answer}`);
  const t = language === "sv" ? sv : en;
  const progressByTypeRef = useRef<Partial<Record<ProgressKey, Progress>>>({});

  useEffect(() => {
    if (!rewardBanner) return;
    const id = window.setTimeout(() => setRewardBanner(null), 4500);
    return () => window.clearTimeout(id);
  }, [rewardBanner]);

  const allowedTypesForCurrentFilter = (filter: PuzzleType | "all"): PuzzleType[] | undefined => {
    if (filter === "all") return undefined;
    return [filter];
  };

  const createFreshPuzzle = (difficulty: number, lang: Language, allowedTypes?: PuzzleType[]) => {
    const lastKey = lastPuzzleKeyRef.current;
    let candidate = createPuzzle(difficulty, lang, allowedTypes);
    let nextKey = `${candidate.prompt}|${candidate.answer}`;
    let retries = 0;
    while (nextKey === lastKey && retries < 8) {
      candidate = createPuzzle(difficulty, lang, allowedTypes);
      nextKey = `${candidate.prompt}|${candidate.answer}`;
      retries += 1;
    }
    lastPuzzleKeyRef.current = nextKey;
    return candidate;
  };

  useEffect(() => {
    const rawPlayers = window.localStorage.getItem(PLAYERS_KEY);
    const rawCurrentPlayer = window.localStorage.getItem(CURRENT_PLAYER_KEY);

    const validLang = (raw: string | null): Language => (raw === "sv" ? "sv" : "en");
    const isValidPuzzleType = (v: string | null): v is PuzzleType => v === "pattern" || v === "emoji" || v === "matrix" || v === "cube";
    const parsePuzzleType = (raw: string | null): PuzzleType | "all" => {
      if (raw === "all") return "all";
      if (isValidPuzzleType(raw)) return raw;
      return "all";
    };
    const parseAgeGroup = (raw: string | null): AgeGroupId | null => {
      if (raw === "5-7" || raw === "8-10" || raw === "11-12") return raw;
      return null;
    };

    let playersMap: PlayersMap = {};
    if (rawPlayers) {
      try {
        playersMap = JSON.parse(rawPlayers) as PlayersMap;
      } catch {
        playersMap = {};
      }
    }

    // Migration / bootstrap: first time users may only have the old global progress key.
    if (!playersMap || Object.keys(playersMap).length === 0) {
      const rawLanguage = window.localStorage.getItem(LANGUAGE_KEY);
      const rawAgeGroup = window.localStorage.getItem(AGE_GROUP_KEY);
      const rawPuzzleType = window.localStorage.getItem(PUZZLE_TYPE_KEY);

      const lang = validLang(rawLanguage);
      const puzzleTypeSetting = parsePuzzleType(rawPuzzleType);
      const activeAgeGroup = parseAgeGroup(rawAgeGroup);
      const initialProgressKey: ProgressKey = puzzleTypeSetting;

      let progressMap: Partial<Record<ProgressKey, Progress>> = {};
      const rawProgressByType = window.localStorage.getItem(PROGRESS_BY_TYPE_KEY);
      if (rawProgressByType) {
        try {
          const parsedMap = JSON.parse(rawProgressByType) as Partial<Record<ProgressKey, Partial<Progress>>>;
          progressMap = Object.fromEntries(
            Object.entries(parsedMap).map(([k, v]) => [k, normalizeProgress(v)])
          ) as Partial<Record<ProgressKey, Progress>>;
        } catch {
          progressMap = {};
        }
      } else {
        const rawOld = window.localStorage.getItem(STORAGE_KEY);
        if (rawOld) {
          try {
            const parsedOld = JSON.parse(rawOld) as Partial<Progress>;
            progressMap = { [initialProgressKey]: normalizeProgress(parsedOld) };
          } catch {
            progressMap = {};
          }
        }
      }

      const name = rawCurrentPlayer && rawCurrentPlayer.trim() ? rawCurrentPlayer.trim().slice(0, 18) : "Player";
      playersMap = {
        [name]: {
          progressByType: progressMap,
          settings: {
            language: lang,
            puzzleType: puzzleTypeSetting,
            frontAgeGroup: null,
            activeAgeGroup
          }
        }
      };
      window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(playersMap));
      window.localStorage.setItem(CURRENT_PLAYER_KEY, name);
    }

    const fallbackName = Object.keys(playersMap)[0] ?? "Player";
    const currentName =
      rawCurrentPlayer && rawCurrentPlayer.trim() && playersMap[rawCurrentPlayer.trim()] ? rawCurrentPlayer.trim() : fallbackName;

    const player = playersMap[currentName] ?? {
      progressByType: {},
      settings: { language: "en", puzzleType: "all", frontAgeGroup: null, activeAgeGroup: null }
    };

    // Store in state for UI.
    setPlayers(playersMap);
    setCurrentPlayerName(currentName);

    // Load settings into UI state.
    const loadedLang = player.settings.language === "sv" ? "sv" : "en";
    setLanguage(loadedLang);
    setPuzzleType(player.settings.puzzleType);
    setFrontAgeGroup(player.settings.frontAgeGroup);
    setAgeGroup(player.settings.activeAgeGroup);

    progressByTypeRef.current = player.progressByType ?? {};

    const key: ProgressKey = player.settings.puzzleType;
    const initialProgress = player.progressByType?.[key] ?? defaultProgress;
    const normalized = normalizeProgress(initialProgress);
    setProgress(normalized);

    try {
      if (player.settings.activeAgeGroup) {
        const allowedTypes = allowedTypesForCurrentFilter(key);
        const loadedPuzzle = createFreshPuzzle(
          difficultyFromLevel(normalized.level, player.settings.activeAgeGroup),
          loadedLang,
          allowedTypes
        );
        setPuzzle(loadedPuzzle);
        setFeedback(loadedLang === "sv" ? sv.welcomeBack : en.welcomeBack);
      } else {
        setFeedback(loadedLang === "sv" ? sv.welcome : en.welcome);
      }
    } catch {
      setProgress(defaultProgress);
      setFeedback(loadedLang === "sv" ? sv.welcome : en.welcome);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!currentPlayerName) return;

    const key: ProgressKey = puzzleType;
    const nextMap = { ...(progressByTypeRef.current ?? {}), [key]: progress };
    progressByTypeRef.current = nextMap;

    setPlayers((prev) => {
      const existing: PlayerData =
        prev[currentPlayerName] ?? {
          progressByType: {},
          settings: { language, puzzleType: "all", frontAgeGroup: null, activeAgeGroup: null }
        };

      const nextPlayers: PlayersMap = {
        ...prev,
        [currentPlayerName]: { ...existing, progressByType: nextMap }
      };

      window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(nextPlayers));
      window.localStorage.setItem(CURRENT_PLAYER_KEY, currentPlayerName);
      return nextPlayers;
    });
  }, [progress, puzzleType, isHydrated, currentPlayerName, language]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!currentPlayerName) return;
    setPlayers((prev) => {
      const existing: PlayerData =
        prev[currentPlayerName] ?? {
          progressByType: {},
          settings: { language, puzzleType: "all", frontAgeGroup: null, activeAgeGroup: null }
        };

      const nextPlayers: PlayersMap = {
        ...prev,
        [currentPlayerName]: {
          ...existing,
          settings: { ...existing.settings, language }
        }
      };

      window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(nextPlayers));
      window.localStorage.setItem(CURRENT_PLAYER_KEY, currentPlayerName);
      return nextPlayers;
    });
  }, [language, isHydrated, currentPlayerName]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!currentPlayerName) return;
    setPlayers((prev) => {
      const existing: PlayerData =
        prev[currentPlayerName] ?? {
          progressByType: {},
          settings: { language, puzzleType: "all", frontAgeGroup: null, activeAgeGroup: null }
        };

      const nextPlayers: PlayersMap = {
        ...prev,
        [currentPlayerName]: {
          ...existing,
          settings: { ...existing.settings, activeAgeGroup: ageGroup }
        }
      };

      window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(nextPlayers));
      window.localStorage.setItem(CURRENT_PLAYER_KEY, currentPlayerName);
      return nextPlayers;
    });
  }, [ageGroup, isHydrated, currentPlayerName, language]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!currentPlayerName) return;
    setPlayers((prev) => {
      const existing: PlayerData =
        prev[currentPlayerName] ?? {
          progressByType: {},
          settings: { language, puzzleType: "all", frontAgeGroup: null, activeAgeGroup: null }
        };

      const nextPlayers: PlayersMap = {
        ...prev,
        [currentPlayerName]: {
          ...existing,
          settings: { ...existing.settings, puzzleType }
        }
      };

      window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(nextPlayers));
      window.localStorage.setItem(CURRENT_PLAYER_KEY, currentPlayerName);
      return nextPlayers;
    });
  }, [puzzleType, isHydrated, currentPlayerName, language]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!currentPlayerName) return;
    if (ageGroup) return; // only persist front selection while on the start screen

    setPlayers((prev) => {
      const existing: PlayerData =
        prev[currentPlayerName] ?? {
          progressByType: {},
          settings: { language, puzzleType: "all", frontAgeGroup: null, activeAgeGroup: null }
        };

      const nextPlayers: PlayersMap = {
        ...prev,
        [currentPlayerName]: {
          ...existing,
          settings: { ...existing.settings, frontAgeGroup }
        }
      };
      window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(nextPlayers));
      window.localStorage.setItem(CURRENT_PLAYER_KEY, currentPlayerName);
      return nextPlayers;
    });
  }, [frontAgeGroup, isHydrated, currentPlayerName, ageGroup, language]);

  const accuracy = useMemo(() => {
    if (progress.attempts === 0) return 0;
    return Math.round((progress.solved / progress.attempts) * 100);
  }, [progress.attempts, progress.solved]);

  const nextPuzzle = (level: number) => {
    if (!ageGroup) return;
    setSelected(null);
    setShowHint(false);
    const allowedTypes = allowedTypesForCurrentFilter(puzzleType);
    setPuzzle(createFreshPuzzle(difficultyFromLevel(level, ageGroup), language, allowedTypes));
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
      const nextProgressBase = { ...prev, stars, level, streak, attempts, solved };

      // Reward every few levels to keep kids motivated.
      const isRewardLevel = level % REWARD_EVERY_LEVELS === 0;
      const didRewardAlready = level <= prev.lastRewardLevel;
      if (isRewardLevel && !didRewardAlready) {
        const nextRewardCount = prev.rewardCount + 1;
        const rewardTextTemplate = t.rewardUnlocked;
        const rewardText = rewardTextTemplate.replace("{n}", String(nextRewardCount));
        setRewardBanner(rewardText);
        setFeedback(rewardText);
        return { ...nextProgressBase, rewardCount: nextRewardCount, lastRewardLevel: level };
      }

      setFeedback(streak >= 3 ? t.correctStreak : t.correct);
      return nextProgressBase;
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
      lastPuzzleKeyRef.current = "";
      const allowedTypes = allowedTypesForCurrentFilter(puzzleType);
      setPuzzle(createFreshPuzzle(difficultyFromLevel(progress.level, ageGroup), lang, allowedTypes));
    }
  };

  const startQuest = (group: AgeGroupId) => {
    setAgeGroup(group);
    const key: ProgressKey = puzzleType;
    const saved = progressByTypeRef.current[key] ?? defaultProgress;
    const normalized = normalizeProgress(saved);
    setProgress(normalized);
    setRewardBanner(null);
    setSelected(null);
    setShowHint(false);
    lastPuzzleKeyRef.current = "";
    const difficulty = difficultyFromLevel(normalized.level, group);
    const allowedTypes = allowedTypesForCurrentFilter(key);
    setPuzzle(createFreshPuzzle(difficulty, language, allowedTypes));
    setFeedback(language === "sv" ? sv.startQuest : en.startQuest);
  };

  const resetFrontPage = () => {
    // Keep the last chosen age group selected on the start screen.
    setFrontAgeGroup(ageGroup);
    setAgeGroup(null);
    setRewardBanner(null);
    setFeedback(language === "sv" ? sv.chooseAgeFirst : en.chooseAgeFirst);
  };

  const getTotalStarsForPlayer = (player: PlayerData): number => {
    const map = player.progressByType ?? {};
    return Object.values(map).reduce((sum, p) => sum + (p?.stars ?? 0), 0);
  };

  const selectPlayerForStart = (name: string) => {
    const player = players[name];
    if (!player) return;

    setCurrentPlayerName(name);
    window.localStorage.setItem(CURRENT_PLAYER_KEY, name);
    setRewardBanner(null);
    setSelected(null);
    setShowHint(false);

    // Load player settings into the start screen.
    const lang: Language = player.settings.language === "sv" ? "sv" : "en";
    setLanguage(lang);
    setPuzzleType(player.settings.puzzleType);
    setFrontAgeGroup(player.settings.frontAgeGroup);
    setAgeGroup(null);

    progressByTypeRef.current = player.progressByType ?? {};
    const key: ProgressKey = player.settings.puzzleType;
    const loadedProgress = normalizeProgress(progressByTypeRef.current[key] ?? defaultProgress);
    setProgress(loadedProgress);

    lastPuzzleKeyRef.current = "";
    setFeedback(lang === "sv" ? sv.welcome : en.welcome);
  };

  const createAndSelectPlayer = () => {
    const raw = newPlayerName.trim();
    if (!raw) return;
    const safeName = raw.slice(0, 18);
    if (players[safeName]) {
      selectPlayerForStart(safeName);
      setNewPlayerName("");
      return;
    }

    const lang: Language = language === "sv" ? "sv" : "en";
    const newPlayer: PlayerData = {
      progressByType: {},
      settings: { language: lang, puzzleType: "all", frontAgeGroup: null, activeAgeGroup: null }
    };

    const nextPlayers: PlayersMap = { ...players, [safeName]: newPlayer };
    setPlayers(nextPlayers);
    progressByTypeRef.current = newPlayer.progressByType;
    window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(nextPlayers));
    window.localStorage.setItem(CURRENT_PLAYER_KEY, safeName);
    setCurrentPlayerName(safeName);

    setNewPlayerName("");
    setPuzzleType("all");
    setFrontAgeGroup(null);
    setAgeGroup(null);
    setProgress(defaultProgress);
    setRewardBanner(null);
    setSelected(null);
    setShowHint(false);
    setFeedback(lang === "sv" ? sv.welcome : en.welcome);
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

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">{t.playerTitle}</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder={t.playerPlaceholder}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-800 outline-none focus:border-sky-300"
            />
            <button
              onClick={createAndSelectPlayer}
              className="rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {t.playerAddButton}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.keys(players).length === 0 ? (
              <p className="text-sm text-slate-600">{t.noPlayersYet}</p>
            ) : (
              Object.entries(players).map(([name, player]) => {
                const stars = getTotalStarsForPlayer(player);
                const isSelected = name === currentPlayerName;
                return (
                  <button
                    key={name}
                    onClick={() => selectPlayerForStart(name)}
                    className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                      isSelected
                        ? "border-sky-500 bg-sky-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <p className="text-lg font-black text-slate-800">{name}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      {stars} {t.stars}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-fuchsia-100">
          <p className="text-sm font-semibold uppercase tracking-wide text-fuchsia-500">{t.chooseAgeTitle}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">{t.chooseAgeSubtitle}</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => setFrontAgeGroup("5-7")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                frontAgeGroup === "5-7"
                  ? "border-sky-400 bg-sky-50 hover:border-sky-500"
                  : "border-sky-200 bg-sky-50 hover:border-sky-300"
              }`}
            >
              <p className="text-xl font-black text-sky-800">{t.age57}</p>
              <p className="mt-1 text-sm text-slate-600">{t.age57Desc}</p>
            </button>
            <button
              onClick={() => setFrontAgeGroup("8-10")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                frontAgeGroup === "8-10"
                  ? "border-emerald-400 bg-emerald-50 hover:border-emerald-500"
                  : "border-emerald-200 bg-emerald-50 hover:border-emerald-300"
              }`}
            >
              <p className="text-xl font-black text-emerald-800">{t.age810}</p>
              <p className="mt-1 text-sm text-slate-600">{t.age810Desc}</p>
            </button>
            <button
              onClick={() => setFrontAgeGroup("11-12")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                frontAgeGroup === "11-12"
                  ? "border-violet-400 bg-violet-50 hover:border-violet-500"
                  : "border-violet-200 bg-violet-50 hover:border-violet-300"
              }`}
            >
              <p className="text-xl font-black text-violet-800">{t.age1112}</p>
              <p className="mt-1 text-sm text-slate-600">{t.age1112Desc}</p>
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.choosePuzzleTypeTitle}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">{t.choosePuzzleTypeSubtitle}</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setPuzzleType("all")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                puzzleType === "all" ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <p className="text-xl font-black text-slate-800">{t.typeAll}</p>
            </button>
            <button
              onClick={() => setPuzzleType("pattern")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                puzzleType === "pattern" ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <p className="text-xl font-black text-slate-800">{t.typePattern}</p>
            </button>
            <button
              onClick={() => setPuzzleType("emoji")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                puzzleType === "emoji" ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <p className="text-xl font-black text-slate-800">{t.typeEmoji}</p>
            </button>
            <button
              onClick={() => setPuzzleType("matrix")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                puzzleType === "matrix" ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <p className="text-xl font-black text-slate-800">{t.typeMatrix}</p>
            </button>
            <button
              onClick={() => setPuzzleType("cube")}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
                puzzleType === "cube" ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <p className="text-xl font-black text-slate-800">{t.typeCube}</p>
            </button>
          </div>

          <div className="mt-6 flex justify-center">
            <button
              disabled={!frontAgeGroup}
              onClick={() => {
                if (!frontAgeGroup) {
                  setFeedback(language === "sv" ? sv.chooseAgeFirst : en.chooseAgeFirst);
                  return;
                }
                startQuest(frontAgeGroup);
              }}
              className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                frontAgeGroup
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              {t.startQuestButton}
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

      {rewardBanner ? (
        <div className="rounded-3xl bg-emerald-50 p-4 text-center text-sm font-extrabold text-emerald-900 ring-1 ring-emerald-100">
          {rewardBanner}
        </div>
      ) : null}

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-fuchsia-100">
        <p className="text-sm font-semibold uppercase tracking-wide text-fuchsia-500">{t.worldLabel}</p>
        {puzzle.cube ? (
          <>
            <p className="mt-2 text-lg font-bold text-slate-800">{puzzle.prompt}</p>
            <div className="mt-4 flex flex-wrap items-start justify-center gap-6">
              <LabeledCubeImage label={t.box1Label} state={puzzle.cube.state1} />
              <LabeledCubeImage label={t.box2Label} state={puzzle.cube.state2} />
            </div>
          </>
        ) : puzzle.matrix ? (
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
            const cubeState = puzzle.cube ? puzzle.optionCubeStates?.[idx] : undefined;
            const isEmojiOption = typeof option === "string" && /\p{Extended_Pictographic}/u.test(option);
            const isCubeOption = Boolean(puzzle.cube && cubeState);
            const paddingClass = isCubeOption ? "py-4" : isEmojiOption ? "py-5" : "py-3";
            return (
              <button
                key={option}
                onClick={() => handleAnswer(option)}
                className={`rounded-2xl border-2 px-4 ${paddingClass} text-xl font-bold transition ${
                  selected === option
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300"
                }`}
              >
                {puzzle.cube && cubeState ? (
                  <img
                    src={cubeStateToSvgDataUri(cubeState)}
                    alt={option}
                    width={96}
                    height={96}
                    className="mx-auto select-none"
                  />
                ) : puzzle.matrix && matrixGrid ? (
                  <img
                    src={matrixGridToSvgDataUri(matrixGrid)}
                    alt={option}
                    width={72}
                    height={72}
                    className="mx-auto select-none"
                  />
                ) : (
                  <span
                    className={`whitespace-pre ${
                      isEmojiOption ? "text-5xl leading-none" : "font-mono"
                    }`}
                  >
                    {option}
                  </span>
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
  frontSubtitle: "Start your quest by choosing your age group and puzzle type, then press Start.",
  chooseAgeTitle: "Quest Start",
  chooseAgeSubtitle: "Pick an age group to begin your adventure.",
  playerTitle: "Player",
  playerPlaceholder: "Enter name",
  playerAddButton: "Use Name",
  noPlayersYet: "Add a player to start!",
  age57: "Ages 5-7",
  age57Desc: "Gentle patterns and starter challenges.",
  age810: "Ages 8-10",
  age810Desc: "Balanced logic puzzles and mixed patterns.",
  age1112: "Ages 11-12",
  age1112Desc: "Trickier patterns and harder logic jumps.",
  changeAgeGroup: "Back to Start",
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
  pattern2Label: "Pattern 2",
  choosePuzzleTypeTitle: "Training Focus",
  choosePuzzleTypeSubtitle: "Choose which puzzle type you want to practice.",
  typeAll: "All Puzzles",
  typePattern: "Pattern",
  typeEmoji: "Emojis",
  typeMatrix: "Matrix",
  startQuestButton: "Start Quest",
  typeCube: "3D Boxes",
  box1Label: "Box 1",
  box2Label: "Box 2",
  rewardUnlocked: "Reward unlocked! Super Badge #{n}"
};

const sv = {
  welcome: "Välkommen, supertänkare! Redo för ditt första pussel?",
  welcomeBack: "Välkommen tillbaka! Ditt uppdrag väntar.",
  subtitle: "Lös mönster, samla stjärnor och levla upp dina supertänkarkrafter.",
  frontSubtitle: "Starta ditt uppdrag genom att välja ålder och pusseltyp, och tryck sedan Start.",
  chooseAgeTitle: "Uppdragsstart",
  chooseAgeSubtitle: "Välj en åldersgrupp för att börja äventyret.",
  playerTitle: "Spelare",
  playerPlaceholder: "Ange namn",
  playerAddButton: "Använd namn",
  noPlayersYet: "Lägg till en spelare för att börja!",
  age57: "Ålder 5-7",
  age57Desc: "Mjuka mönster och enkla startutmaningar.",
  age810: "Ålder 8-10",
  age810Desc: "Balanserade logikpussel och blandade mönster.",
  age1112: "Ålder 11-12",
  age1112Desc: "Klurigare mönster och svårare logiksprång.",
  changeAgeGroup: "Tillbaka till start",
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
  pattern2Label: "Mönster 2",
  choosePuzzleTypeTitle: "Träningsfokus",
  choosePuzzleTypeSubtitle: "Välj vilken pusseltyp du vill öva på.",
  typeAll: "Alla pussel",
  typePattern: "Mönster",
  typeEmoji: "Emojis",
  typeMatrix: "Matris",
  startQuestButton: "Starta uppdrag",
  typeCube: "3D-lådor",
  box1Label: "Låda 1",
  box2Label: "Låda 2",
  rewardUnlocked: "Belöning upplåst! Supermärke #{n}"
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

function cubeStateToSvgDataUri(state: CubeState): string {
  // Simple isometric cube with 3 visible faces:
  // - top  : up
  // - front: front
  // - right: right
  const top = state.up;
  const front = state.front;
  const right = state.right;
  const stroke = "#0f172a";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="110" viewBox="0 0 120 110">
  <defs>
    <pattern id="topHatch" width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M0,6 L6,0" stroke="#0f172a" stroke-width="2" opacity="0.25" />
    </pattern>
    <pattern id="frontHatch" width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M0,3 L6,3" stroke="#0f172a" stroke-width="2" opacity="0.25" />
    </pattern>
    <pattern id="rightHatch" width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M0,0 L6,6 M6,0 L0,6" stroke="#0f172a" stroke-width="2" opacity="0.18" />
    </pattern>
  </defs>

  <!-- Base colors -->
  <polygon points="60,10 95,30 60,50 25,30" fill="${top}" stroke="${stroke}" stroke-width="2" />
  <polygon points="25,30 60,50 60,95 25,75" fill="${front}" stroke="${stroke}" stroke-width="2" />
  <polygon points="95,30 60,50 60,95 95,75" fill="${right}" stroke="${stroke}" stroke-width="2" />

  <!-- Pattern overlays (important for color-blind accessibility) -->
  <polygon points="60,10 95,30 60,50 25,30" fill="url(#topHatch)" opacity="1" />
  <polygon points="25,30 60,50 60,95 25,75" fill="url(#frontHatch)" opacity="1" />
  <polygon points="95,30 60,50 60,95 95,75" fill="url(#rightHatch)" opacity="1" />

  <polyline points="25,30 60,50 95,30" fill="none" stroke="#334155" stroke-width="2" />
</svg>`.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function LabeledCubeImage({ label, state }: { label: string; state: CubeState }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      <img
        src={cubeStateToSvgDataUri(state)}
        alt={label}
        width={120}
        height={110}
        className="mt-2 mx-auto select-none"
      />
    </div>
  );
}
