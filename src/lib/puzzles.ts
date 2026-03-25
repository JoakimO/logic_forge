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
  type EmojiRule = "repeat" | "rotateByStep" | "mirrorEveryOther";

  const pickDistinctEmojis = (count: number) => shuffle(emojiOptions).slice(0, count);

  const rotateLeft = (arr: string[], k: number) => {
    const shift = ((k % arr.length) + arr.length) % arr.length;
    return [...arr.slice(shift), ...arr.slice(0, shift)];
  };

  const mirror = (arr: string[]) => [...arr].reverse();

  // Ensure at least 3 unique emojis exist in the pattern,
  // so we can always offer 3 choices drawn from the same cycle.
  const cycleLen = (() => {
    if (difficulty <= 1) return 3;
    if (difficulty === 2) return Math.random() < 0.65 ? 3 : 4;
    // difficulty >= 3
    return Math.random() < 0.55 ? 4 : 3;
  })();
  // Keep the prompt short and consistent (<= 6 icons) so kids can spot patterns.
  const displayLen = difficulty <= 1 ? 4 : 6;

  const rule: EmojiRule = (() => {
    if (difficulty <= 2) return "repeat";
    if (difficulty === 3) return Math.random() < 0.55 ? "rotateByStep" : "mirrorEveryOther";
    // difficulty 4
    return Math.random() < 0.55 ? "mirrorEveryOther" : "rotateByStep";
  })();

  // Rotate amount for the rotate rule (adds variation without confusing the visible prompt).
  const rotStep = 1; // for cycleLen=3 this means a consistent shift; for cycleLen=2 it swaps ends.
  const cycle = pickDistinctEmojis(cycleLen);

  const tokenAt = (index: number, activeRule: EmojiRule): string => {
    const blockSize = cycle.length;
    const blockIndex = Math.floor(index / blockSize);
    const inBlock = index % blockSize;

    if (activeRule === "repeat") return cycle[inBlock];

    if (activeRule === "rotateByStep") {
      const rotated = rotateLeft(cycle, rotStep * blockIndex);
      return rotated[inBlock];
    }

    // mirrorEveryOther: odd blocks go backwards.
    const useMirrored = blockIndex % 2 === 0;
    const mapped = useMirrored ? cycle : mirror(cycle);
    return mapped[inBlock];
  };

  const displayTokens = Array.from({ length: displayLen }, (_, i) => tokenAt(i, rule));
  const answer = tokenAt(displayLen, rule);

  // Make options feel like “different plausible next steps” instead of random emojis.
  const altRepeat = tokenAt(displayLen, "repeat");
  const altRotate = tokenAt(displayLen, "rotateByStep");
  const altMirror = tokenAt(displayLen, "mirrorEveryOther");

  // Always return exactly 3 distinct options (so the UI is never missing choices).
  // Also: avoid “outsider” emojis that never appear in the prompt.
  const preferredUnique = Array.from(new Set([answer, altRepeat, altRotate, altMirror]));
  const decoys: string[] = preferredUnique.filter((v) => v !== answer).slice(0, 2);

  // Fill remaining decoys using only the cycle (so every option appears in the pattern).
  if (decoys.length < 2) {
    const pool = shuffle(cycle.filter((e) => e !== answer && !decoys.includes(e)));
    for (const e of pool) {
      if (decoys.length >= 2) break;
      decoys.push(e);
    }
  }

  const options = shuffle([answer, decoys[0], decoys[1]].slice(0, 3));

  const prompt =
    language === "sv"
      ? `Hitta nästa vän: ${displayTokens.join(" ")} ?`
      : `Find the next friend: ${displayTokens.join(" ")} ?`;

  const hint =
    language === "sv"
      ? rule === "repeat"
        ? "Titta på ett mönster som upprepas. Fortsätt i samma ordning."
        : rule === "rotateByStep"
          ? "Varje ny upprepning flyttar vännerna lite åt sidan."
          : "Varje andra upprepning går ordningen baklänges."
      : rule === "repeat"
        ? "Spot the repeating pattern. Keep going in the same order."
        : rule === "rotateByStep"
          ? "Each new repeat shifts the order a little."
          : "Every other repeat flips the order backwards.";
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
