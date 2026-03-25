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

  // If provided, aligns 1:1 with `options` so the UI can render cube images.
  cube?: {
    state1: CubeState;
    state2: CubeState;
  };
  optionCubeStates?: CubeState[];
};

export type Language = "en" | "sv";
export type PuzzleType = "pattern" | "emoji" | "matrix" | "cube";

export type CubeFace = "up" | "down" | "left" | "right" | "front" | "back";
export type CubeState = Record<CubeFace, string>;

type CubeMove = "rollForward" | "rollBackward" | "rollLeft" | "rollRight";

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
  type PatternKind = "add" | "sub";

  const clampPositive = (n: number) => Math.max(1, n);

  const kind: PatternKind = (() => {
    // More difficult => more variety.
    return Math.random() < (difficulty <= 1 ? 0.7 : 0.5) ? "add" : "sub";
  })();

  const renderTokens = (tokens: (number | string)[]) => tokens.join(" , ");

  const step = Math.max(1, Math.min(4, difficulty));
  const sign = kind === "add" ? 1 : -1;
  // Keep values positive for kids.
  const start = kind === "add" ? Math.floor(Math.random() * 6) + 3 : Math.floor(Math.random() * 10) + 10;
  const a = start;
  const b = start + sign * step;
  const c = start + sign * step * 2;
  const d = start + sign * step * 3;

  const answer = String(clampPositive(d));
  const sequence = [a, b, c].map(clampPositive);
  const decoyA = String(clampPositive(Number(answer) + (Math.random() < 0.5 ? 1 : 2)));
  const decoyB = String(clampPositive(Number(answer) - (Math.random() < 0.5 ? 1 : 2)));

  const prompt =
    language === "sv"
      ? `Vad kommer härnäst? ${renderTokens(sequence)} , ?`
      : `What comes next? ${renderTokens(sequence)} , ?`;
  const hint =
    language === "sv"
      ? kind === "add"
        ? "Varje tal blir större med samma antal."
        : "Varje tal blir mindre med samma antal."
      : kind === "add"
        ? "Each number gets bigger by the same amount."
        : "Each number gets smaller by the same amount.";

  return {
    id: `pattern-${Date.now()}`,
    prompt,
    options: shuffle([answer, decoyA, decoyB].filter((v, i, arr) => arr.indexOf(v) === i)),
    answer,
    hint
  };
}

function buildEmojiPuzzle(difficulty: number, language: Language): Puzzle {
  const pickDistinctEmojis = (count: number) => shuffle(emojiOptions).slice(0, count);

  // Ensure at least 3 unique emojis exist in the pattern,
  // so we can always offer 3 choices drawn from the same cycle.
  const cycleLen = (() => {
    if (difficulty <= 1) return 3;
    if (difficulty === 2) return 3;
    if (difficulty === 3) return 4;
    return 5;
  })();

  // Higher levels = longer visible sequence (simple repeating cycle only).
  const displayLen = (() => {
    if (difficulty <= 1) return 5;
    if (difficulty === 2) return 7;
    if (difficulty === 3) return 9;
    return 12;
  })();
  const cycle = pickDistinctEmojis(cycleLen);

  const tokenAt = (index: number): string => cycle[index % cycle.length];

  const displayTokens = Array.from({ length: displayLen }, (_, i) => tokenAt(i));
  const answer = tokenAt(displayLen);

  // Always 3 options, all taken from the same cycle (so every option appears in the pattern).
  const decoyPool = shuffle(cycle.filter((e) => e !== answer));
  const decoy1 = decoyPool[0];
  const decoy2 = decoyPool[1];
  const options = shuffle([answer, decoy1, decoy2]);

  const prompt =
    language === "sv"
      ? `Hitta nästa vän: ${displayTokens.join(" ")} ?`
      : `Find the next friend: ${displayTokens.join(" ")} ?`;

  const hint =
    language === "sv"
      ? "Titta på mönstret som upprepas. Fortsätt i samma ordning."
      : "Spot the repeating pattern. Keep going in the same order.";
  return {
    id: `emoji-${Date.now()}`,
    prompt,
    options,
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

// Colorblind-friendly palette (Okabe–Ito), chosen to keep face colors distinct.
const cubeColors = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00"];

function cubeKey(state: CubeState): string {
  // Stable key for correctness + uniqueness.
  return [state.up, state.front, state.right, state.down, state.left, state.back].join("|");
}

function applyCubeMove(state: CubeState, move: CubeMove): CubeState {
  // Visible cube perspective is irrelevant for logic; we update all faces consistently.
  if (move === "rollForward") {
    // U -> B, F -> U, D -> F, B -> D, L/R unchanged.
    return {
      up: state.front,
      front: state.down,
      down: state.back,
      back: state.up,
      left: state.left,
      right: state.right
    };
  }
  if (move === "rollBackward") {
    // Inverse of rollForward.
    return {
      up: state.back,
      front: state.up,
      down: state.front,
      back: state.down,
      left: state.left,
      right: state.right
    };
  }
  if (move === "rollRight") {
    // R -> U, D -> R, L -> D, U -> L, F/B unchanged.
    return {
      up: state.right,
      right: state.down,
      down: state.left,
      left: state.up,
      front: state.front,
      back: state.back
    };
  }
  // rollLeft (inverse of rollRight)
  return {
    up: state.left,
    left: state.down,
    down: state.right,
    right: state.up,
    front: state.front,
    back: state.back
  };
}

function buildCubePuzzle(difficulty: number, language: Language): Puzzle {
  const moves: CubeMove[] = ["rollForward", "rollBackward", "rollLeft", "rollRight"];
  const ruleMove = moves[Math.floor(Math.random() * moves.length)];

  const chosen = shuffle(cubeColors).slice(0, 6);
  const state1: CubeState = {
    up: chosen[0],
    down: chosen[1],
    front: chosen[2],
    back: chosen[3],
    left: chosen[4],
    right: chosen[5]
  };

  const state2 = applyCubeMove(state1, ruleMove);
  // Core logic: apply the same rotation again.
  const state3 = applyCubeMove(state2, ruleMove);
  const answerKey = cubeKey(state3);

  // Two decoys are the results after applying other moves once to state2.
  const otherMoves = moves.filter((m) => m !== ruleMove);
  const decoyMoves = shuffle(otherMoves).slice(0, 2);
  const decoy1 = applyCubeMove(state2, decoyMoves[0]);
  const decoy2 = applyCubeMove(state2, decoyMoves[1]);

  const optionA = answerKey;
  const optionB = cubeKey(decoy1);
  const optionC = cubeKey(decoy2);

  const unique = new Set([optionA, optionB, optionC]);
  if (unique.size !== 3) {
    // Extremely unlikely due to distinct colors, but keep the puzzle valid.
    return buildCubePuzzle(difficulty, language);
  }

  const pairs = shuffle([
    { text: optionA, state: state3 },
    { text: optionB, state: decoy1 },
    { text: optionC, state: decoy2 }
  ]);

  const options = pairs.map((p) => p.text);
  const optionCubeStates = pairs.map((p) => p.state);

  const prompt =
    language === "sv"
      ? "3D-box: Den här rotationen händer från Box 1 till Box 2. Vilken blir Box 3 efter samma rotation en gång till?"
      : "3D box: The same rotation happens from Box 1 to Box 2. What does Box 3 look like after applying that rotation again?";

  const hint =
    language === "sv"
      ? "Titta på vilka färger som hamnar på topp, fram och höger. Upprepa samma rotation en gång till."
      : "Look at which colors end up on top, front, and right. Apply the exact same rotation one more time.";

  return {
    id: `cube-${Date.now()}`,
    prompt,
    options,
    answer: answerKey,
    hint,
    cube: { state1, state2 },
    optionCubeStates
  };
}

function pickType(allowed?: PuzzleType[]): PuzzleType {
  const allTypes: PuzzleType[] = ["pattern", "emoji", "matrix", "cube"];
  const effective = allowed && allowed.length > 0 ? allowed : allTypes;

  if (allowed === undefined) {
    // Keep a reasonable distribution when everything is enabled.
    const roll = Math.random();
    if (roll < 0.28) return "pattern";
    if (roll < 0.56) return "emoji";
    if (roll < 0.78) return "matrix";
    return "cube";
  }

  const idx = Math.floor(Math.random() * effective.length);
  return effective[idx];
}

export function createPuzzle(difficulty: number, language: Language, allowedTypes?: PuzzleType[]): Puzzle {
  const type = pickType(allowedTypes);
  if (type === "pattern") return buildPatternPuzzle(difficulty, language);
  if (type === "emoji") return buildEmojiPuzzle(difficulty, language);
  if (type === "matrix") return buildMatrixPuzzle(difficulty, language);
  return buildCubePuzzle(difficulty, language);
}
