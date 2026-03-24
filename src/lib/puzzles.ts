export type Puzzle = {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  hint: string;
  // Optional visual data for special puzzle types
  matrix?: {
    pattern1: number[][];
    pattern2: number[][];
  };
  // If provided, aligns 1:1 with `options` so the UI can render images.
  optionMatrixGrids?: number[][][];
};

export type Language = "en" | "sv";

const emojiOptions = ["🐶", "🐱", "🦊", "🦄", "🐸", "🐼", "🦁", "🐵"];

function shuffle<T>(items: T[]): T[] {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function buildPatternPuzzle(difficulty: number, language: Language): Puzzle {
  const step = Math.max(1, Math.min(4, difficulty));
  const start = Math.floor(Math.random() * 4) + 1;
  const sequence = [start, start + step, start + step * 2];
  const answer = String(start + step * 3);
  const decoyA = String(Number(answer) + 1);
  const decoyB = String(Number(answer) - 1);

  const prompt =
    language === "sv"
      ? `Vad kommer härnäst? ${sequence.join(" , ")} , ?`
      : `What comes next? ${sequence.join(" , ")} , ?`;
  const hint =
    language === "sv"
      ? "Titta på hur mycket varje tal ökar i varje steg."
      : "Look at how much each number grows every step.";

  return {
    id: `pattern-${Date.now()}`,
    prompt,
    options: shuffle([answer, decoyA, decoyB]),
    answer,
    hint
  };
}

function buildEmojiPuzzle(difficulty: number, language: Language): Puzzle {
  const pool = shuffle(emojiOptions);
  const a = pool[0];
  const b = pool[1];
  const c = pool[2];
  const isEasy = difficulty <= 2;
  const answer = isEasy ? b : c;

  const prompt = isEasy
    ? language === "sv"
      ? `Hitta nästa vän: ${a} ${b} ${a} ${b} ${a} ?`
      : `Find the next friend: ${a} ${b} ${a} ${b} ${a} ?`
    : language === "sv"
      ? `Hitta nästa vän: ${a} ${b} ${c} ${a} ${b} ?`
      : `Find the next friend: ${a} ${b} ${c} ${a} ${b} ?`;

  const decoys = isEasy ? [a, c] : [a, b];
  const hint =
    language === "sv"
      ? "Läs mönstret från vänster till höger och upprepa mönstret."
      : "Read the pattern from left to right and repeat it.";
  return {
    id: `emoji-${Date.now()}`,
    prompt,
    options: shuffle([answer, ...decoys]),
    answer,
    hint
  };
}

type MatrixTransform = "right" | "down" | "rotate" | "mirror";

function shiftRight(grid: number[][]): number[][] {
  return grid.map((row) => [row[2], row[0], row[1]]);
}

function shiftDown(grid: number[][]): number[][] {
  return [grid[2], grid[0], grid[1]];
}

function rotateClockwise(grid: number[][]): number[][] {
  return [
    [grid[2][0], grid[1][0], grid[0][0]],
    [grid[2][1], grid[1][1], grid[0][1]],
    [grid[2][2], grid[1][2], grid[0][2]]
  ];
}

function mirrorHorizontal(grid: number[][]): number[][] {
  return grid.map((row) => [...row].reverse());
}

function applyTransform(grid: number[][], transform: MatrixTransform): number[][] {
  if (transform === "right") return shiftRight(grid);
  if (transform === "down") return shiftDown(grid);
  if (transform === "rotate") return rotateClockwise(grid);
  return mirrorHorizontal(grid);
}

function renderMatrix(grid: number[][]): string {
  return grid.map((row) => row.map((cell) => (cell === 1 ? "X" : ".")).join(" ")).join("\n");
}

function randomBaseMatrix(cellCount: number): number[][] {
  const grid = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const count = Math.max(1, Math.min(8, cellCount));
  const positions = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, count);
  positions.forEach((pos) => {
    const r = Math.floor(pos / 3);
    const c = pos % 3;
    grid[r][c] = 1;
  });
  return grid;
}

function buildMatrixPuzzle(difficulty: number, language: Language): Puzzle {
  const transforms: MatrixTransform[] = ["right", "down", "rotate", "mirror"];

  // More difficulty -> more filled cells to spot the movement.
  const cellCount = difficulty <= 1 ? 2 : difficulty === 2 ? 3 : difficulty === 3 ? 4 : 5;

  // Re-roll until we get 3 distinct visible options (to avoid symmetry collisions).
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const ruleMove = transforms[Math.floor(Math.random() * transforms.length)];

    const base = randomBaseMatrix(cellCount);
    const pattern2 = applyTransform(base, ruleMove);
    // Core logic: apply the same movement rule again.
    const pattern3 = applyTransform(pattern2, ruleMove);

    const decoyMoves = transforms.filter((t) => t !== ruleMove);
    const decoy1 = applyTransform(pattern2, decoyMoves[0]);
    const decoy2 = applyTransform(pattern2, decoyMoves[1]);

    const answer = renderMatrix(pattern3);
    const optionA = answer;
    const optionB = renderMatrix(decoy1);
    const optionC = renderMatrix(decoy2);

    const unique = new Set([optionA, optionB, optionC]);
    if (unique.size !== 3) continue;

    const pairs = shuffle([
      { text: optionA, grid: pattern3 },
      { text: optionB, grid: decoy1 },
      { text: optionC, grid: decoy2 }
    ]);

    const options = pairs.map((p) => p.text);
    const optionMatrixGrids = pairs.map((p) => p.grid);

    const prompt =
      language === "sv"
        ? "Matrisuppdrag 3x3: Följ samma flytt från Mönster 1 till Mönster 2, och använd den igen för att hitta Mönster 3."
        : "Matrix Quest 3x3: Follow the same move from Pattern 1 to Pattern 2, then use it again to find Pattern 3.";

    const hint =
      language === "sv"
        ? "Alla markerade rutor flyttas med samma regel. Upprepa exakt samma flytt en gång till."
        : "All checked boxes move by one consistent rule. Repeat that exact move one more time.";

    return {
      id: `matrix-${Date.now()}`,
      prompt,
      options,
      answer,
      hint,
      matrix: {
        pattern1: base,
        pattern2
      },
      optionMatrixGrids
    };
  }

  // Fallback (should be rare): return a non-visual textual matrix if we couldn't avoid symmetry.
  const base = randomBaseMatrix(cellCount);
  const pattern2 = applyTransform(base, "right");
  const pattern3 = applyTransform(pattern2, "down");
  return {
    id: `matrix-${Date.now()}`,
    prompt: language === "sv" ? "Matrisuppdrag 3x3" : "Matrix Quest 3x3",
    options: shuffle([renderMatrix(pattern3), renderMatrix(applyTransform(pattern2, "rotate")), renderMatrix(applyTransform(pattern2, "mirror"))]).slice(0, 3),
    answer: renderMatrix(pattern3),
    hint: language === "sv" ? "Titta på mönstret." : "Look at the pattern."
  };
}

export function createPuzzle(difficulty: number, language: Language): Puzzle {
  const roll = Math.random();
  if (roll < 0.34) return buildPatternPuzzle(difficulty, language);
  if (roll < 0.67) return buildEmojiPuzzle(difficulty, language);
  return buildMatrixPuzzle(difficulty, language);
}
