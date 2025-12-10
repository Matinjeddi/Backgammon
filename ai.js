/**
 * Backgammon AI Module
 * Enhanced AI with GNU Backgammon-inspired features
 * Implements phase detection, improved evaluation, and minimax search
 * Reference: Backgammon strategy and evaluation principles
 */

const BackgammonAI = (function () {
  "use strict";

  // Configuration
  const MAX_SEARCH_DEPTH = 3; // Deeper lookahead for better decisions
  const MAX_SEQUENCES_TO_SEARCH = 20; // Limit search space for performance (reduced to evaluate better moves)
  const CACHE_SIZE = 2000; // Position evaluation cache (increased for deeper search)
  const PLAYER1_HOME_START_POINT = 1; // Player 1 home board spans points 6→1 (numeric range 1-6)
  const PLAYER1_HOME_END_POINT = 6;
  const HIGH_PRIORITY_HIT_BONUS = 20000; // Strongly prefer hitting outside Player 1 home
  const KEY_POINT_PRIORITIES = [
    { point: 5, weight: 1.0 }, // Highest priority
    { point: 20, weight: 0.9 },
    { point: 4, weight: 0.7 },
    { point: 21, weight: 0.65 },
    { point: 7, weight: 0.6 },
    { point: 18, weight: 0.55 },
  ];
  const KEY_POINT_STACK_BONUS = 1200; // Bonus when AI makes (2+) a key point
  const KEY_POINT_SINGLE_BONUS = 450; // Bonus for occupying with a single checker
  const KEY_POINT_OPPONENT_BLOCK_PENALTY = 1400; // Penalty when opponent locks the point
  const KEY_POINT_OPPONENT_BLOT_PENALTY = 700; // Penalty while opponent blot sits there (encourage hits)
  const NO_CONTACT_HOME_BOARD_BONUS = 5000; // High bonus for moving checkers into home board when no contact
  const NO_CONTACT_HOME_BOARD_MOVE_BONUS = 2000; // Bonus per checker moved into home board during no-contact
  const BEAROFF_BONUS = 15000; // High bonus for bearing off when all checkers are in home board

  // Opening moves lookup table - predefined moves for the opening roll
  // Format: key is sorted dice values (e.g., "1,2" for dice 1 and 2), value is array of moves
  const OPENING_MOVES = {
    "1,2": [
      { from: 24, to: 23, die: 1 },
      { from: 13, to: 11, die: 2 },
    ],
    "1,3": [
      { from: 8, to: 5, die: 3 },
      { from: 6, to: 5, die: 1 },
    ],
    "1,4": [
      { from: 13, to: 9, die: 4 },
      { from: 24, to: 23, die: 1 },
    ],
    "1,5": [
      { from: 13, to: 8, die: 5 },
      { from: 24, to: 23, die: 1 },
    ],
    "1,6": [
      { from: 13, to: 7, die: 6 },
      { from: 8, to: 7, die: 1 },
    ],
    "2,3": [
      { from: 13, to: 11, die: 2 },
      { from: 24, to: 21, die: 3 },
    ],
    "2,4": [
      { from: 8, to: 4, die: 4 },
      { from: 6, to: 4, die: 2 },
    ],
    "2,5": [
      { from: 13, to: 8, die: 5 },
      { from: 24, to: 22, die: 2 },
    ],
    "2,6": [
      { from: 24, to: 18, die: 6 },
      { from: 13, to: 11, die: 2 },
    ],
    "3,4": [
      { from: 24, to: 21, die: 3 },
      { from: 13, to: 9, die: 4 },
    ],
    "3,5": [
      { from: 8, to: 3, die: 5 },
      { from: 6, to: 3, die: 3 },
    ],
    "3,6": [
      { from: 24, to: 18, die: 6 },
      { from: 13, to: 10, die: 3 },
    ],
    "4,5": [
      { from: 24, to: 20, die: 4 },
      { from: 13, to: 8, die: 5 },
    ],
    "4,6": [
      { from: 24, to: 18, die: 6 },
      { from: 13, to: 9, die: 4 },
    ],
    "5,6": [
      { from: 24, to: 18, die: 6 },
      { from: 18, to: 13, die: 5 },
    ],
  };

  // Position evaluation cache
  let positionCache = new Map();
  let cacheHits = 0;
  let cacheMisses = 0;

  /**
   * Check if the board is in the opening position (starting position)
   * Player 2 opening position: 2 on 24, 5 on 13, 3 on 8, 5 on 6
   */
  function isOpeningPosition(gameState) {
    // Check Player 2 starting position
    return (
      gameState.board[24].player === 2 &&
      gameState.board[24].count === 2 &&
      gameState.board[13].player === 2 &&
      gameState.board[13].count === 5 &&
      gameState.board[8].player === 2 &&
      gameState.board[8].count === 3 &&
      gameState.board[6].player === 2 &&
      gameState.board[6].count === 5 &&
      gameState.bar.player2 === 0 &&
      gameState.bearoff.player2 === 0
    );
  }

  /**
   * Check if Player 1 is in the opening position (starting position)
   * Player 1 opening position: 2 on 1, 5 on 12, 3 on 17, 5 on 19
   * If Player 1 is still in opening position, it means Player 2 started the game
   */
  function isPlayer1OpeningPosition(gameState) {
    // Check Player 1 starting position
    return (
      gameState.board[1].player === 1 &&
      gameState.board[1].count === 2 &&
      gameState.board[12].player === 1 &&
      gameState.board[12].count === 5 &&
      gameState.board[17].player === 1 &&
      gameState.board[17].count === 3 &&
      gameState.board[19].player === 1 &&
      gameState.board[19].count === 5 &&
      gameState.bar.player1 === 0 &&
      gameState.bearoff.player1 === 0
    );
  }

  /**
   * Get opening moves for the given dice values
   * Returns null if no opening move is found
   */
  function getOpeningMove(availableMoves) {
    if (availableMoves.length !== 2) {
      return null; // Opening moves only apply to two dice
    }

    // Sort dice values to match lookup key format
    const sortedDice = [...availableMoves].sort((a, b) => a - b);
    const key = `${sortedDice[0]},${sortedDice[1]}`;

    const openingMove = OPENING_MOVES[key];
    if (!openingMove) {
      return null;
    }

    // Return a copy of the moves
    return openingMove.map((move) => ({ ...move }));
  }

  /**
   * Generate all possible move sequences from current position
   * This handles the complexity of backgammon moves where dice can be used in different orders
   */
  function generateAllMoveSequences(gameState, availableMoves, player) {
    const sequences = [];

    // If no moves available, return empty sequence
    if (availableMoves.length === 0) {
      return [[]];
    }

    // Get all possible source points (including bar)
    const sourcePoints = [];

    // If player has checkers on bar, must enter from bar
    if (gameState.bar[`player${player}`] > 0) {
      sourcePoints.push("bar");
    } else {
      // Get all points with player's checkers
      for (let i = 1; i <= 24; i++) {
        if (
          gameState.board[i].player === player &&
          gameState.board[i].count > 0
        ) {
          sourcePoints.push(i);
        }
      }
    }

    // Try each source point with each available die
    for (let source of sourcePoints) {
      const validMoves = getValidMovesForAI(
        gameState,
        source,
        availableMoves,
        player
      );

      for (let move of validMoves) {
        // Create new game state after this move
        const newState = simulateMove(
          gameState,
          source,
          move.to,
          move.die,
          player
        );
        const newAvailableMoves = [...availableMoves];
        const dieIndex = newAvailableMoves.indexOf(move.die);
        if (dieIndex !== -1) {
          newAvailableMoves.splice(dieIndex, 1);
        }

        // Recursively generate sequences for remaining moves
        const remainingSequences = generateAllMoveSequences(
          newState,
          newAvailableMoves,
          player
        );

        // Prepend this move to all remaining sequences
        for (let seq of remainingSequences) {
          sequences.push([
            { from: source, to: move.to, die: move.die },
            ...seq,
          ]);
        }
      }
    }

    // If no valid moves found, return empty sequence
    if (sequences.length === 0) {
      return [[]];
    }

    return sequences;
  }

  /**
   * Get valid moves from a point for AI evaluation
   * Similar to game.js getValidMovesFromPoint but works with a game state snapshot
   */
  function getValidMovesForAI(gameState, fromPoint, availableMoves, player) {
    const validMoves = [];

    // If on bar, can only move from bar
    if (gameState.bar[`player${player}`] > 0 && fromPoint !== "bar") {
      return [];
    }

    // Handle bar moves
    if (fromPoint === "bar") {
      if (gameState.bar[`player${player}`] === 0) {
        return [];
      }
      for (let move of availableMoves) {
        const entryPoint = player === 1 ? move : 25 - move;
        if (canMoveToPointForAI(gameState, entryPoint, player)) {
          validMoves.push({ to: entryPoint, die: move });
        }
      }
      return validMoves;
    }

    // Check if this point has player's checkers
    if (
      gameState.board[fromPoint].player !== player ||
      gameState.board[fromPoint].count === 0
    ) {
      return [];
    }

    // Try each available die
    for (let move of availableMoves) {
      const toPoint = player === 1 ? fromPoint + move : fromPoint - move;

      // Check for bearing off
      if ((player === 1 && toPoint >= 25) || (player === 2 && toPoint <= 0)) {
        if (canBearOffForAI(gameState, fromPoint, move, player)) {
          validMoves.push({ to: "bearoff", die: move });
        }
      } else if (toPoint >= 1 && toPoint <= 24) {
        if (canMoveToPointForAI(gameState, toPoint, player)) {
          validMoves.push({ to: toPoint, die: move });
        }
      }
    }

    return validMoves;
  }

  /**
   * Check if player can move to a point (AI helper)
   */
  function canMoveToPointForAI(gameState, toPoint, player) {
    if (toPoint < 1 || toPoint > 24) {
      return false;
    }

    const pointState = gameState.board[toPoint];
    if (!pointState) {
      return false;
    }

    // Empty point or own checker
    if (pointState.player === 0 || pointState.player === player) {
      return true;
    }

    // Opponent has only 1 checker (blot) - can hit
    if (pointState.player !== player && pointState.count === 1) {
      return true;
    }

    // Opponent has 2+ checkers (blocked)
    return false;
  }

  /**
   * Check if player can bear off (AI helper)
   */
  function canBearOffForAI(gameState, fromPoint, dieValue, player) {
    // Check if all checkers are in home board
    if (!allCheckersInHomeBoardForAI(gameState, player)) {
      return false;
    }

    const toPoint = player === 1 ? fromPoint + dieValue : fromPoint - dieValue;

    // Exact bear off
    if ((player === 1 && toPoint === 25) || (player === 2 && toPoint === 0)) {
      return true;
    }

    // Bear off with higher die than needed
    if ((player === 1 && toPoint > 25) || (player === 2 && toPoint < 0)) {
      // Check if this is the furthest checker
      if (player === 1) {
        for (let p = fromPoint - 1; p >= 19; p--) {
          if (gameState.board[p].player === 1 && gameState.board[p].count > 0) {
            return false;
          }
        }
      } else {
        for (let p = fromPoint + 1; p <= 6; p++) {
          if (gameState.board[p].player === 2 && gameState.board[p].count > 0) {
            return false;
          }
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Check if all checkers are in home board (AI helper)
   */
  function allCheckersInHomeBoardForAI(gameState, player) {
    if (gameState.bar[`player${player}`] > 0) {
      return false;
    }

    if (player === 1) {
      for (let p = 1; p <= 18; p++) {
        if (gameState.board[p].player === 1 && gameState.board[p].count > 0) {
          return false;
        }
      }
    } else {
      for (let p = 7; p <= 24; p++) {
        if (gameState.board[p].player === 2 && gameState.board[p].count > 0) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Clone a game state snapshot for safe manipulation
   */
  function cloneState(gameState) {
    return {
      board: gameState.board.map((p) => ({ ...p })),
      bar: { ...gameState.bar },
      bearoff: { ...gameState.bearoff },
      currentPlayer: gameState.currentPlayer,
      availableMoves: [...(gameState.availableMoves || [])],
    };
  }

  /**
   * Simulate a move and return new game state (deep copy)
   */
  function simulateMove(gameState, from, to, die, player) {
    const newState = cloneState(gameState);

    // Handle move from bar
    if (from === "bar") {
      newState.bar[`player${player}`]--;

      if (
        newState.board[to].player !== 0 &&
        newState.board[to].player !== player
      ) {
        const opponent = player === 1 ? 2 : 1;
        newState.bar[`player${opponent}`]++;
        newState.board[to] = { player: 0, count: 0 };
      }

      if (newState.board[to].player === player) {
        newState.board[to].count++;
      } else {
        newState.board[to] = { player: player, count: 1 };
      }
    }
    // Handle bear off
    else if (to === "bearoff") {
      newState.board[from].count--;
      if (newState.board[from].count === 0) {
        newState.board[from].player = 0;
      }
      newState.bearoff[`player${player}`]++;
    }
    // Normal move
    else {
      newState.board[from].count--;
      if (newState.board[from].count === 0) {
        newState.board[from].player = 0;
      }

      if (
        newState.board[to].player !== 0 &&
        newState.board[to].player !== player
      ) {
        const opponent = player === 1 ? 2 : 1;
        newState.bar[`player${opponent}`]++;
        newState.board[to] = { player: 0, count: 0 };
      }

      if (newState.board[to].player === player) {
        newState.board[to].count++;
      } else {
        newState.board[to] = { player: player, count: 1 };
      }
    }

    return newState;
  }

  /**
   * Determine if a move hits a blot outside Player 1's home board (points 18-24)
   * This is treated as the highest priority objective for the AI.
   */
  function isHighPriorityHit(gameState, move, player) {
    if (player !== 2) {
      return false;
    }
    if (typeof move.to !== "number") {
      return false;
    }
    if (move.to < 1 || move.to > 24) {
      return false;
    }
    if (
      move.to >= PLAYER1_HOME_START_POINT &&
      move.to <= PLAYER1_HOME_END_POINT
    ) {
      return false; // Inside Player 1 home, no special priority
    }

    const opponent = 1;
    const pointState = gameState.board[move.to];
    return (
      pointState && pointState.player === opponent && pointState.count === 1
    );
  }

  /**
   * Apply a full move sequence, tracking high-priority hits for scoring
   */
  function applySequenceAndScore(gameState, sequence, player) {
    let currentState = cloneState(gameState);
    let hitPriorityScore = 0;

    for (let move of sequence) {
      if (isHighPriorityHit(currentState, move, player)) {
        hitPriorityScore += HIGH_PRIORITY_HIT_BONUS;
      }

      currentState = simulateMove(
        currentState,
        move.from,
        move.to,
        move.die,
        player
      );
      const newAvailableMoves = [...currentState.availableMoves];
      const dieIndex = newAvailableMoves.indexOf(move.die);
      if (dieIndex !== -1) {
        newAvailableMoves.splice(dieIndex, 1);
      }
      currentState = { ...currentState, availableMoves: newAvailableMoves };
    }

    return { state: currentState, hitPriorityScore };
  }

  /**
   * Check if Player 2 leaves a blot in Player 1's home board (points 18-24)
   * after completing a move sequence. Used to enforce the "never leave singles"
   * constraint requested for the AI.
   */
  function hasPlayer2BlotInPlayer1Home(gameState) {
    for (
      let point = PLAYER1_HOME_START_POINT;
      point <= PLAYER1_HOME_END_POINT;
      point++
    ) {
      const pointState = gameState.board[point];
      if (pointState.player === 2 && pointState.count === 1) {
        return true;
      }
    }
    return false;
  }

  function sequenceLeavesPlayer2HomeBoardBlot(gameState, sequence, player) {
    if (player !== 2 || !sequence || sequence.length === 0) {
      return false;
    }
    const { state } = applySequenceAndScore(gameState, sequence, player);
    return hasPlayer2BlotInPlayer1Home(state);
  }

  function enforcePlayer2HomeBoardSafety(gameState, orderedSequences, player) {
    if (player !== 2) {
      return orderedSequences;
    }
    const safeSequences = orderedSequences.filter(
      (sequence) =>
        !sequenceLeavesPlayer2HomeBoardBlot(gameState, sequence, player)
    );
    return safeSequences.length > 0 ? safeSequences : orderedSequences;
  }

  /**
   * Check if a move sequence would result in more than 3 checkers on points 2 and 1
   * This prevents the AI from over-stacking these critical points
   */
  function sequenceExceedsStackLimit(gameState, sequence, player) {
    if (player !== 2 || !sequence || sequence.length === 0) {
      return false;
    }
    const { state } = applySequenceAndScore(gameState, sequence, player);
    // Check points 2 and 1 for Player 2 (AI)
    if (state.board[2].player === 2 && state.board[2].count > 3) {
      return true;
    }
    if (state.board[1].player === 2 && state.board[1].count > 3) {
      return true;
    }
    return false;
  }

  /**
   * Enforce the rule that AI cannot stack more than 3 checkers on points 2 and 1
   */
  function enforceStackLimitOnPoints2And1(gameState, orderedSequences, player) {
    if (player !== 2) {
      return orderedSequences;
    }
    const validSequences = orderedSequences.filter(
      (sequence) => !sequenceExceedsStackLimit(gameState, sequence, player)
    );
    return validSequences.length > 0 ? validSequences : orderedSequences;
  }

  /**
   * Count how many made points (2+ checkers) Player 2 has in their home board (points 1-6)
   */
  function countMadePointsInHomeBoard(gameState, player) {
    if (player !== 2) {
      return 0;
    }
    let madePoints = 0;
    for (let i = 1; i <= 6; i++) {
      if (gameState.board[i].player === 2 && gameState.board[i].count >= 2) {
        madePoints++;
      }
    }
    return madePoints;
  }

  /**
   * Check if a move sequence uses checkers from outside the home board (points 7-24)
   */
  function sequenceUsesCheckersOutsideHomeBoard(sequence, player) {
    if (player !== 2 || !sequence || sequence.length === 0) {
      return false;
    }
    for (let move of sequence) {
      // Check if move starts from outside home board (points 7-24) or from bar
      if (move.from === "bar") {
        return true; // Entering from bar counts as using checker outside home board
      }
      if (typeof move.from === "number" && move.from >= 7 && move.from <= 24) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a sequence leaves an overly concentrated position with stacks > 4 on any point
   * Used to enforce distribution quality and prevent crunching
   */
  function sequenceExceedsDistributionLimit(gameState, sequence, player) {
    if (player !== 2 || !sequence || sequence.length === 0) {
      return false;
    }
    const { state } = applySequenceAndScore(gameState, sequence, player);

    // Check all points for excessive stacking (>4 checkers)
    for (let i = 1; i <= 24; i++) {
      if (state.board[i].player === 2 && state.board[i].count > 4) {
        return true; // Exceeds distribution limit
      }
    }
    return false;
  }

  /**
   * Enforce distribution constraints to prevent crunching
   * Filters sequences that leave points with excessive stacking
   */
  function enforceDistribution(gameState, orderedSequences, player) {
    if (player !== 2) {
      return orderedSequences;
    }

    const validSequences = orderedSequences.filter(
      (sequence) =>
        !sequenceExceedsDistributionLimit(gameState, sequence, player)
    );
    return validSequences.length > 0 ? validSequences : orderedSequences;
  }

  /**
   * Enforce the rule that AI must play checkers from outside home board (7-24)
   * when they have made more than 2 points in their home board (1-6)
   */
  function enforcePlayCheckersOutsideHomeBoard(
    gameState,
    orderedSequences,
    player
  ) {
    if (player !== 2) {
      return orderedSequences;
    }

    const madePoints = countMadePointsInHomeBoard(gameState, player);

    // If more than 2 made points in home board, filter to only sequences using checkers outside
    if (madePoints > 2) {
      const validSequences = orderedSequences.filter((sequence) =>
        sequenceUsesCheckersOutsideHomeBoard(sequence, player)
      );
      return validSequences.length > 0 ? validSequences : orderedSequences;
    }

    return orderedSequences;
  }

  /**
   * Detect game phase: RACE, CONTACT, BACKGAME, PRIMING, or BLITZ
   *
   * PRIMING: Both players building consecutive points/primes to control movement
   * BLITZ: Aggressive attack focused on hitting blots and making points quickly
   * RACE: Both players bearing off (simple pip count race)
   * CONTACT: Mid-game with hitting opportunities
   * BACKGAME: One player significantly behind in pips
   */
  function detectGamePhase(gameState) {
    const player2Primes = evaluatePrimes(gameState, 2);
    const player1Primes = evaluatePrimes(gameState, 1);
    const player2Anchors = evaluateAnchors(gameState, 2);
    const player1Anchors = evaluateAnchors(gameState, 1);
    const player2BlotSafety = evaluateBlotSafety(gameState, 2);
    const player1BlotSafety = evaluateBlotSafety(gameState, 1);

    const player1InHome = allCheckersInHomeBoardForAI(gameState, 1);
    const player2InHome = allCheckersInHomeBoardForAI(gameState, 2);
    const player1Pips = calculatePipCount(gameState, 1);
    const player2Pips = calculatePipCount(gameState, 2);
    const pipDiff = Math.abs(player1Pips - player2Pips);

    // Check for BLITZ conditions (aggressive phase)
    // AI (Player 2) is blitzing if: many opponent blots, few of own blots, actively hitting
    const isBlitzingByAI = isPrimingOrBlitzing(gameState, 2) === "BLITZ";

    // Both players bearing off = RACE
    if (player1InHome && player2InHome) {
      return "RACE";
    }

    // One player significantly behind = BACKGAME
    if (pipDiff > 30) {
      return "BACKGAME";
    }

    // PRIMING: Both players have built 3+ point primes/anchors
    // Indicates both focused on point-making and blocking
    if (
      player2Primes.count >= 1 &&
      player1Primes.count >= 1 &&
      player2Primes.length >= 3 &&
      player1Primes.length >= 3
    ) {
      return "PRIMING";
    }

    // BLITZ: AI is attacking aggressively
    if (isBlitzingByAI) {
      return "BLITZ";
    }

    // Otherwise it's a CONTACT game
    return "CONTACT";
  }

  /**
   * Determine if player is in a priming or blitz position
   *
   * PRIMING: Building consecutive points to create barriers
   * BLITZ: Attacking opponent blots and making points aggressively
   */
  function isPrimingOrBlitzing(gameState, player) {
    const opponent = player === 1 ? 2 : 1;
    const primes = evaluatePrimes(gameState, player);
    const opponentBlots = evaluateBlotSafety(gameState, opponent);
    const ownBlots = evaluateBlotSafety(gameState, player);

    // Count checkers on bar (sign of active hitting/attacking)
    const opponentOnBar = gameState.bar[`player${opponent}`];

    // Blitz indicators:
    // 1. Opponent has multiple vulnerable blots
    // 2. Own blots are minimal (defensive)
    // 3. Building points quickly
    // 4. Some opponent checkers already hit (on bar)
    const vulnerableBlots = opponentBlots.count;
    const ownVulnerableBlots = ownBlots.count;

    // If actively hitting and building points
    if (opponentOnBar >= 1 && primes.count >= 1 && ownVulnerableBlots <= 2) {
      return "BLITZ";
    }

    // If focused on making and maintaining primes
    if (primes.length >= 3 && primes.count >= 2) {
      return "PRIMING";
    }

    return "CONTACT";
  }

  /**
   * Calculate race count (pip difference in race positions)
   */
  function calculateRaceCount(gameState, player) {
    const playerPips = calculatePipCount(gameState, player);
    const opponent = player === 1 ? 2 : 1;
    const opponentPips = calculatePipCount(gameState, opponent);
    return opponentPips - playerPips; // Positive = ahead in race
  }

  /**
   * Calculate checker distribution quality
   * Measures how well checkers are distributed (fewer gaps = better)
   */
  function calculateDistribution(gameState, player) {
    let distribution = 0;
    let occupiedPoints = 0;
    let gaps = 0;
    let lastOccupied = -1;

    for (let i = 1; i <= 24; i++) {
      if (
        gameState.board[i].player === player &&
        gameState.board[i].count > 0
      ) {
        occupiedPoints++;
        if (lastOccupied !== -1 && i - lastOccupied > 1) {
          gaps += i - lastOccupied - 1;
        }
        lastOccupied = i;
      }
    }

    // Better distribution = more occupied points, fewer gaps
    distribution = occupiedPoints * 2 - gaps;
    return distribution;
  }

  /**
   * Check if pieces can still hit each other (contact game indicator)
   */
  function isContactGame(gameState) {
    const player1Home = allCheckersInHomeBoardForAI(gameState, 1);
    const player2Home = allCheckersInHomeBoardForAI(gameState, 2);
    return !player1Home || !player2Home;
  }

  /**
   * Check if there's no contact on Player 2's side (points 12-1)
   * No contact means no opponent checkers on Player 2's side of the board
   */
  function hasNoContactOnPlayer2Side(gameState) {
    // Check points 12-1 for any Player 1 checkers
    for (let i = 1; i <= 12; i++) {
      if (gameState.board[i].player === 1 && gameState.board[i].count > 0) {
        return false; // Contact exists
      }
    }
    // Also check if Player 1 has checkers on bar (they could enter on Player 2's side)
    if (gameState.bar.player1 > 0) {
      return false; // Potential contact
    }
    return true; // No contact
  }

  /**
   * Enhanced pip count calculation
   */
  function calculatePipCount(gameState, player) {
    let pips = 0;

    // Checkers on board
    if (player === 1) {
      for (let i = 1; i <= 24; i++) {
        if (gameState.board[i].player === player) {
          pips += gameState.board[i].count * (25 - i); // Distance to bear off
        }
      }
    } else {
      for (let i = 1; i <= 24; i++) {
        if (gameState.board[i].player === player) {
          pips += gameState.board[i].count * i; // Distance to bear off
        }
      }
    }

    // Checkers on bar (must enter first) - add penalty
    pips += gameState.bar[`player${player}`] * 25;

    return pips;
  }

  /**
   * Enhanced prime detection - finds longest prime and evaluates quality
   */
  function evaluatePrimes(gameState, player) {
    let maxPrimeLength = 0;
    let primeCount = 0;
    let currentPrime = 0;
    let gaps = 0;

    for (let i = 1; i <= 24; i++) {
      if (
        gameState.board[i].player === player &&
        gameState.board[i].count >= 2
      ) {
        currentPrime++;
        maxPrimeLength = Math.max(maxPrimeLength, currentPrime);
        if (currentPrime === 1) {
          primeCount++;
        }
      } else {
        if (currentPrime > 0) {
          gaps++;
        }
        currentPrime = 0;
      }
    }

    // Score based on prime length (6-prime is very strong) and number of primes
    let primeScore = maxPrimeLength * maxPrimeLength * 10; // Quadratic bonus for longer primes
    primeScore += primeCount * 5;
    primeScore -= gaps * 2; // Penalty for gaps in primes

    return { length: maxPrimeLength, count: primeCount, score: primeScore };
  }

  /**
   * Evaluate anchor quality (not just count, but position and strength)
   */
  function evaluateAnchors(gameState, player) {
    let anchorScore = 0;
    let anchorCount = 0;
    const anchorPositions = [];

    if (player === 1) {
      // Player 1 anchors in Player 2's home (points 1-6)
      for (let i = 1; i <= 6; i++) {
        if (
          gameState.board[i].player === player &&
          gameState.board[i].count >= 2
        ) {
          anchorCount++;
          anchorPositions.push(i);
          // Higher points are more valuable (closer to opponent's home)
          anchorScore += (7 - i) * 5;
          // More checkers = stronger anchor
          anchorScore += gameState.board[i].count * 2;
        }
      }
    } else {
      // Player 2 anchors in Player 1's home (points 19-24)
      for (let i = 19; i <= 24; i++) {
        if (
          gameState.board[i].player === player &&
          gameState.board[i].count >= 2
        ) {
          anchorCount++;
          anchorPositions.push(i);
          // Lower points are more valuable (closer to opponent's home)
          anchorScore += (i - 18) * 5;
          // More checkers = stronger anchor
          anchorScore += gameState.board[i].count * 2;
        }
      }
    }

    return {
      count: anchorCount,
      score: anchorScore,
      positions: anchorPositions,
    };
  }

  /**
   * Evaluate control of critical points for Player 2 (AI).
   * Points 20, 21, and 19 are weighted (in that order) to encourage the AI to make and hold them.
   */
  function evaluateKeyPointControl(gameState) {
    let score = 0;

    for (const preference of KEY_POINT_PRIORITIES) {
      const pointState = gameState.board[preference.point];
      if (!pointState) {
        continue;
      }

      if (pointState.player === 2) {
        if (pointState.count >= 2) {
          score += KEY_POINT_STACK_BONUS * preference.weight;
        } else if (pointState.count === 1) {
          score += KEY_POINT_SINGLE_BONUS * preference.weight;
        }
      } else if (pointState.player === 1) {
        if (pointState.count >= 2) {
          score -= KEY_POINT_OPPONENT_BLOCK_PENALTY * preference.weight;
        } else if (pointState.count === 1) {
          score -= KEY_POINT_OPPONENT_BLOT_PENALTY * preference.weight;
        }
      }
    }

    return score;
  }

  /**
   * Evaluate blot safety - considers vulnerability based on opponent's position
   */
  function evaluateBlotSafety(gameState, player) {
    const opponent = player === 1 ? 2 : 1;
    let blotScore = 0;
    let vulnerableBlots = 0;

    // Count blots
    for (let i = 1; i <= 24; i++) {
      if (
        gameState.board[i].player === player &&
        gameState.board[i].count === 1
      ) {
        // Check if opponent can hit this blot
        let canBeHit = false;

        // Check if opponent has checkers that can reach this point
        for (let j = 1; j <= 24; j++) {
          if (
            gameState.board[j].player === opponent &&
            gameState.board[j].count > 0
          ) {
            const distance = player === 1 ? i - j : j - i;
            if (distance > 0 && distance <= 6) {
              canBeHit = true;
              break;
            }
          }
        }

        // Check if opponent has checkers on bar
        if (gameState.bar[`player${opponent}`] > 0) {
          const entryPoint = opponent === 1 ? 1 : 24;
          const distance = player === 1 ? i - entryPoint : entryPoint - i;
          if (distance >= 1 && distance <= 6) {
            canBeHit = true;
          }
        }

        if (canBeHit) {
          vulnerableBlots++;
          // Blots in opponent's home are more dangerous
          if ((player === 1 && i <= 6) || (player === 2 && i >= 19)) {
            blotScore -= 30;
          } else {
            blotScore -= 15;
          }
        } else {
          // Safe blots are less bad
          blotScore -= 5;
        }
      }
    }

    return { count: vulnerableBlots, score: blotScore };
  }

  /**
   * Evaluate home board structure quality
   */
  function evaluateHomeBoardStructure(gameState, player) {
    let structureScore = 0;
    let madePoints = 0;
    let gaps = 0;
    let lastPoint = -1;

    if (player === 1) {
      // Player 1 home is points 19-24
      for (let i = 19; i <= 24; i++) {
        if (
          gameState.board[i].player === player &&
          gameState.board[i].count >= 2
        ) {
          madePoints++;
          if (lastPoint !== -1 && i - lastPoint > 1) {
            gaps += i - lastPoint - 1;
          }
          lastPoint = i;
          // Points closer to bear off are more valuable
          structureScore += (i - 18) * 3;
        }
      }
    } else {
      // Player 2 home is points 1-6
      for (let i = 1; i <= 6; i++) {
        if (
          gameState.board[i].player === player &&
          gameState.board[i].count >= 2
        ) {
          madePoints++;
          if (lastPoint !== -1 && i - lastPoint > 1) {
            gaps += i - lastPoint - 1;
          }
          lastPoint = i;
          // Points closer to bear off are more valuable
          structureScore += (7 - i) * 3;
        }
      }
    }

    // Bonus for consecutive points, penalty for gaps
    structureScore += madePoints * 5;
    structureScore -= gaps * 3;

    return structureScore;
  }

  /**
   * Evaluate crunching - detects when checkers are overly concentrated
   * Crunching occurs when many checkers are stacked on few points, especially in home board
   * Reference: Backgammon crunching strategy - when forced to break down good points
   */
  function evaluateCrunching(gameState, player) {
    let crunchScore = 0;
    let totalCheckersOnBoard = 0;
    let occupiedPoints = 0;
    let maxStack = 0;
    let homeBoardCheckers = 0;
    let highPointCheckers = 0; // Checkers on points far from bearoff
    let consecutiveFullPoints = 0; // Clusters of 4+ checker points

    // Count checkers and analyze distribution
    if (player === 1) {
      // Player 1 home is points 19-24
      for (let i = 1; i <= 24; i++) {
        if (
          gameState.board[i].player === player &&
          gameState.board[i].count > 0
        ) {
          totalCheckersOnBoard += gameState.board[i].count;
          occupiedPoints++;
          maxStack = Math.max(maxStack, gameState.board[i].count);

          // Check home board (19-24)
          if (i >= 19 && i <= 24) {
            homeBoardCheckers += gameState.board[i].count;
            // High points (far from bearoff) are worse - points 19-21
            if (i <= 21) {
              highPointCheckers += gameState.board[i].count;
            }
            if (gameState.board[i].count >= 4) {
              consecutiveFullPoints++;
            }
          }
        }
      }
    } else {
      // Player 2 home is points 1-6
      for (let i = 1; i <= 24; i++) {
        if (
          gameState.board[i].player === player &&
          gameState.board[i].count > 0
        ) {
          totalCheckersOnBoard += gameState.board[i].count;
          occupiedPoints++;
          maxStack = Math.max(maxStack, gameState.board[i].count);

          // Check home board (1-6)
          if (i >= 1 && i <= 6) {
            homeBoardCheckers += gameState.board[i].count;
            // High points (far from bearoff) are worse - points 4-6
            if (i >= 4) {
              highPointCheckers += gameState.board[i].count;
            }
            if (gameState.board[i].count >= 4) {
              consecutiveFullPoints++;
            }
          }
        }
      }
    }

    // Penalize if all checkers are in home board (crunching scenario)
    if (allCheckersInHomeBoardForAI(gameState, player)) {
      // ENHANCED: Penalty for having many checkers on few points in home board
      const averageCheckersPerPoint =
        homeBoardCheckers / Math.max(occupiedPoints, 1);
      if (averageCheckersPerPoint > 2.0) {
        // Progressive penalty: worse as average increases
        crunchScore -= Math.pow(averageCheckersPerPoint - 2.0, 2) * 40;
      }

      // ENHANCED: Severe penalty for large stacks (4+ checkers on a single point)
      if (maxStack >= 4) {
        // Progressive penalty increases exponentially
        crunchScore -= Math.pow(maxStack - 3, 2) * 30;
      }

      // ENHANCED: Strong penalty for checkers on high points (far from bearoff)
      // This is especially bad during bearoff
      crunchScore -= highPointCheckers * 8;

      // ENHANCED: Penalty for having checkers concentrated on too few points
      // If we have many checkers but few occupied points, that's a severe crunch
      if (homeBoardCheckers > 0 && occupiedPoints < 5) {
        const concentrationRatio = homeBoardCheckers / occupiedPoints;
        if (concentrationRatio > 2.5) {
          crunchScore -= Math.pow(concentrationRatio - 2.5, 2) * 50;
        }
      }

      // NEW: Penalty for consecutive full points (clustering)
      if (consecutiveFullPoints > 0) {
        crunchScore -= consecutiveFullPoints * 25;
      }
    } else {
      // Not in home board yet, but still penalize excessive stacking
      if (maxStack >= 5) {
        crunchScore -= Math.pow(maxStack - 4, 2) * 20;
      }

      // ENHANCED: Penalize having many checkers on few points overall
      if (totalCheckersOnBoard > 0 && occupiedPoints < 7) {
        const concentrationRatio = totalCheckersOnBoard / occupiedPoints;
        if (concentrationRatio > 3.5) {
          crunchScore -= (concentrationRatio - 3.5) * 15;
        }
      }
    }

    return crunchScore;
  }

  /**
   * Generate a position hash for caching
   */
  function hashPosition(gameState) {
    let hash = "";
    for (let i = 1; i <= 24; i++) {
      hash += `${gameState.board[i].player}-${gameState.board[i].count}-`;
    }
    hash += `${gameState.bar.player1}-${gameState.bar.player2}-`;
    hash += `${gameState.bearoff.player1}-${gameState.bearoff.player2}`;
    return hash;
  }

  /**
   * Enhanced position evaluation with phase-aware weighting
   * Returns a score where higher is better for Player 2
   */
  function evaluatePosition(gameState) {
    const player = 2; // AI is always Player 2
    const opponent = 1;

    // Check cache
    const positionHash = hashPosition(gameState);
    if (positionCache.has(positionHash)) {
      cacheHits++;
      return positionCache.get(positionHash);
    }
    cacheMisses++;

    // Early termination for winning positions
    if (gameState.bearoff.player2 === 15) {
      const score = 100000;
      updateCache(positionHash, score);
      return score;
    }
    if (gameState.bearoff.player1 === 15) {
      const score = -100000;
      updateCache(positionHash, score);
      return score;
    }

    // Detect game phase
    const phase = detectGamePhase(gameState);

    let score = 0;

    // Phase-aware feature weights
    let pipWeight,
      bearoffWeight,
      barWeight,
      homeWeight,
      blotWeight,
      primeWeight,
      anchorWeight,
      distributionWeight,
      raceWeight,
      crunchWeight;

    if (phase === "RACE") {
      // In race, pip count and bearoff are most important
      // Crunching is very bad during bearoff
      pipWeight = calculateDynamicPipWeight(gameState, 0.5, phase);
      bearoffWeight = 100;
      barWeight = 200;
      homeWeight = 3;
      blotWeight = 10;
      primeWeight = 2;
      anchorWeight = 1;
      distributionWeight = 10; // Prioritize spreading checkers during race
      raceWeight = 2;
      crunchWeight = 200; // High penalty to prevent clustering during bearoff
    } else if (phase === "BACKGAME") {
      // In backgame, anchors and primes are important
      pipWeight = calculateDynamicPipWeight(gameState, 0.2, phase);
      bearoffWeight = 50;
      barWeight = 150;
      homeWeight = 5;
      blotWeight = 15;
      primeWeight = 15;
      anchorWeight = 20;
      distributionWeight = 9; // Encourage spreading checkers in backgame
      raceWeight = 0.5;
      crunchWeight = 180; // Strong penalty for crunching
    } else if (phase === "BLITZ") {
      // In blitz, hitting and making points are critical
      // Bar weight is high because we're actively hitting opponent
      // Blot weight (opponent's) is highly valued - we want them vulnerable
      pipWeight = calculateDynamicPipWeight(gameState, 0.1, phase);
      bearoffWeight = 40;
      barWeight = 250; // Hitting is priority - opponent on bar = good
      homeWeight = 6;
      blotWeight = 35; // Creating/maintaining opponent vulnerability
      primeWeight = 25; // Make points to close them out
      anchorWeight = 10;
      distributionWeight = 8; // Still discourage crunching even during blitz
      raceWeight = 0.5;
      crunchWeight = 150; // Penalty for crunching even during aggressive phase
    } else if (phase === "PRIMING") {
      // In priming game, making and maintaining primes is priority
      // Focus on building consecutive points and blocking opponent
      // Blot safety is secondary to prime building
      pipWeight = calculateDynamicPipWeight(gameState, 0.2, phase);
      bearoffWeight = 30;
      barWeight = 100;
      homeWeight = 5;
      blotWeight = 10; // Less focus on blots during priming
      primeWeight = 40; // Prime-building is king
      anchorWeight = 25; // Anchors support prime control
      distributionWeight = 8; // Encourage spreading to support primes
      raceWeight = 0.3;
      crunchWeight = 160; // Penalty to maintain prime structure
    } else {
      // CONTACT game - balanced weights with dynamic adjustment
      pipWeight = calculateDynamicPipWeight(gameState, 0.3, phase);
      bearoffWeight = 60;
      barWeight = 120;
      homeWeight = 8;
      blotWeight = 20;
      primeWeight = 12;
      anchorWeight = 15;
      distributionWeight = 10; // High weight to maintain good distribution
      raceWeight = 1;
      crunchWeight = 200; // Strong penalty for crunching in contact
    }

    // 1. Pip count (lower is better)
    const playerPips = calculatePipCount(gameState, player);
    const opponentPips = calculatePipCount(gameState, opponent);
    score += (opponentPips - playerPips) * pipWeight;

    // 2. Race count (in race positions)
    if (phase === "RACE") {
      const raceCount = calculateRaceCount(gameState, player);
      score += raceCount * raceWeight;
    }

    // 3. Bearing off progress
    score += gameState.bearoff.player2 * bearoffWeight;
    score -= gameState.bearoff.player1 * bearoffWeight;

    // 4. Checkers on bar (very bad)
    score -= gameState.bar.player2 * barWeight;
    score += gameState.bar.player1 * barWeight;

    // 5. Home board structure
    const playerHomeStructure = evaluateHomeBoardStructure(gameState, player);
    const opponentHomeStructure = evaluateHomeBoardStructure(
      gameState,
      opponent
    );
    score += (playerHomeStructure - opponentHomeStructure) * homeWeight;

    // 6. Blot safety
    const playerBlotSafety = evaluateBlotSafety(gameState, player);
    const opponentBlotSafety = evaluateBlotSafety(gameState, opponent);
    score += (playerBlotSafety.score - opponentBlotSafety.score) * blotWeight;

    // 7. Prime evaluation
    const playerPrimes = evaluatePrimes(gameState, player);
    const opponentPrimes = evaluatePrimes(gameState, opponent);
    score += (playerPrimes.score - opponentPrimes.score) * primeWeight;

    // 8. Anchor quality
    const playerAnchors = evaluateAnchors(gameState, player);
    const opponentAnchors = evaluateAnchors(gameState, opponent);
    score += (playerAnchors.score - opponentAnchors.score) * anchorWeight;

    // 9. Distribution quality
    const playerDistribution = calculateDistribution(gameState, player);
    const opponentDistribution = calculateDistribution(gameState, opponent);
    score += (playerDistribution - opponentDistribution) * distributionWeight;

    // 10. Crunching evaluation (penalty for overly concentrated checkers)
    const playerCrunch = evaluateCrunching(gameState, player);
    const opponentCrunch = evaluateCrunching(gameState, opponent);
    score += (playerCrunch - opponentCrunch) * crunchWeight;

    // 11. Key point control (Points 20, 21, 19 preference for AI)
    score += evaluateKeyPointControl(gameState);

    // 12. No-contact home board bonus (prioritize getting checkers into home board when no contact)
    if (hasNoContactOnPlayer2Side(gameState)) {
      // Count checkers in home board (points 6-1 for Player 2)
      let homeBoardCheckers = 0;
      for (let i = 1; i <= 6; i++) {
        if (gameState.board[i].player === 2 && gameState.board[i].count > 0) {
          homeBoardCheckers += gameState.board[i].count;
        }
      }
      // Bonus increases with more checkers in home board
      score += homeBoardCheckers * (NO_CONTACT_HOME_BOARD_BONUS / 15);
    }

    // Update cache
    updateCache(positionHash, score);

    return score;
  }

  /**
   * Update position cache with size limit
   */
  function updateCache(hash, score) {
    if (positionCache.size >= CACHE_SIZE) {
      // Remove oldest entry (simple FIFO)
      const firstKey = positionCache.keys().next().value;
      positionCache.delete(firstKey);
    }
    positionCache.set(hash, score);
  }

  /**
   * Calculate dynamic pip weight based on game state
   * Higher weight when opponent is close to bearing off or when we're significantly ahead
   * Lower weight when we're significantly behind (position matters more than raw pip count)
   */
  function calculateDynamicPipWeight(gameState, baseWeight, phase) {
    const player = 2;
    const opponent = 1;

    const playerPips = calculatePipCount(gameState, player);
    const opponentPips = calculatePipCount(gameState, opponent);
    const pipDifference = opponentPips - playerPips;

    // Count checkers bearing off or in home board
    const playerHomeCheckers =
      gameState.bearoff.player2 +
      [...Array(7)].reduce((sum, _, i) => {
        const p = i + 1;
        return (
          sum + (gameState.board[p].player === 2 ? gameState.board[p].count : 0)
        );
      }, 0);
    const opponentHomeCheckers =
      gameState.bearoff.player1 +
      [...Array(7)].reduce((sum, _, i) => {
        const p = i + 1;
        return (
          sum + (gameState.board[p].player === 1 ? gameState.board[p].count : 0)
        );
      }, 0);

    // Increase pip weight if opponent is close to bearing off (race situation)
    if (opponentHomeCheckers >= 10) {
      return baseWeight * 2.5; // Double or more weight in critical race
    }

    // If we're significantly ahead in pips, increase weight to press advantage
    if (pipDifference > 40) {
      return baseWeight * 2.0;
    }

    // If we're significantly behind, reduce pip weight (position more important)
    if (pipDifference < -50 && phase !== "RACE") {
      return baseWeight * 0.4;
    }

    // If we're slightly behind, moderate weight increase to climb back
    if (pipDifference < -20 && pipDifference >= -50) {
      return baseWeight * 1.3;
    }

    // When both players are in endgame, increase weight (every pip matters)
    if (playerHomeCheckers >= 8 && opponentHomeCheckers >= 8) {
      return baseWeight * 1.8;
    }

    return baseWeight;
  }

  /**
   * Calculate bonus for moving backmost checkers (points 18-24 for Player 2)
   */
  function calculateBackmostCheckerBonus(sequence, player) {
    if (player !== 2) {
      return 0;
    }

    let bonus = 0;
    for (let move of sequence) {
      // Points 18-24 are the backmost for Player 2
      if (typeof move.from === "number" && move.from >= 18 && move.from <= 24) {
        // Higher points (closer to 24) get more bonus
        const pointBonus = (move.from - 17) * 50; // 50 for 18, 100 for 19, ..., 350 for 24
        bonus += pointBonus;
      }
    }
    return bonus;
  }

  /**
   * Calculate bonus for moving checkers into home board when there's no contact
   * Player 2's home board is points 6-1
   */
  function calculateNoContactHomeBoardBonus(gameState, sequence, player) {
    if (player !== 2) {
      return 0;
    }

    // Check if there's no contact
    if (!hasNoContactOnPlayer2Side(gameState)) {
      return 0;
    }

    let bonus = 0;
    for (let move of sequence) {
      // Check if move brings a checker into home board (points 6-1)
      if (typeof move.to === "number" && move.to >= 1 && move.to <= 6) {
        // Check if the checker was moved from outside home board
        if (typeof move.from === "number" && move.from > 6) {
          // Higher bonus for moving from further away
          const distanceBonus =
            ((move.from - 6) * NO_CONTACT_HOME_BOARD_MOVE_BONUS) / 10;
          bonus += NO_CONTACT_HOME_BOARD_MOVE_BONUS + distanceBonus;
        } else if (move.from === "bar") {
          // Entering from bar into home board is also good
          bonus += NO_CONTACT_HOME_BOARD_MOVE_BONUS;
        }
      }
    }
    return bonus;
  }

  /**
   * Calculate bonus for bearing off when all checkers are in home board
   * This strongly prioritizes bearing off over other moves when ready
   */
  function calculateBearoffBonus(gameState, sequence, player) {
    if (player !== 2) {
      return 0;
    }

    // Check if all checkers are in home board
    if (!allCheckersInHomeBoardForAI(gameState, player)) {
      return 0;
    }

    // Count bearoff moves in the sequence
    let bearoffCount = 0;
    for (let move of sequence) {
      if (move.to === "bearoff") {
        bearoffCount++;
      }
    }

    // Return bonus proportional to number of checkers borne off
    // Higher bonus encourages bearing off over playing within home board
    return bearoffCount * BEAROFF_BONUS;
  }

  /**
   * Calculate blitz strategy bonus
   * Reward sequences that hit opponent blots and make points to close them out
   */
  function calculateBlitzBonus(gameState, sequence, player) {
    if (player !== 2) {
      return 0;
    }

    const phase = detectGamePhase(gameState);
    if (phase !== "BLITZ") {
      return 0; // Only apply in blitz phase
    }

    let blitzBonus = 0;
    const { state: resultingState } = applySequenceAndScore(
      gameState,
      sequence,
      player
    );

    // Bonus for hitting opponent blots in the sequence
    let hitsInSequence = 0;
    for (let move of sequence) {
      if (isHighPriorityHit(gameState, move, player)) {
        hitsInSequence++;
        blitzBonus += 5000; // Per hit bonus
      }
    }

    // Bonus for making new points in home board (closing out)
    for (let i = 1; i <= 6; i++) {
      const before =
        gameState.board[i].player === 2 && gameState.board[i].count >= 2;
      const after =
        resultingState.board[i].player === 2 &&
        resultingState.board[i].count >= 2;
      if (!before && after) {
        blitzBonus += 3000; // Per new point made
      }
    }

    return blitzBonus;
  }

  /**
   * Calculate priming strategy bonus
   * Reward sequences that build and extend primes (consecutive made points)
   */
  function calculatePrimingBonus(gameState, sequence, player) {
    if (player !== 2) {
      return 0;
    }

    const phase = detectGamePhase(gameState);
    if (phase !== "PRIMING") {
      return 0; // Only apply in priming phase
    }

    let primingBonus = 0;
    const { state: resultingState } = applySequenceAndScore(
      gameState,
      sequence,
      player
    );

    // Count made points before and after
    const beforePrimes = evaluatePrimes(gameState, player);
    const afterPrimes = evaluatePrimes(resultingState, player);

    // Bonus for extending prime length (most valuable)
    if (afterPrimes.length > beforePrimes.length) {
      primingBonus += (afterPrimes.length - beforePrimes.length) * 5000;
    }

    // Bonus for making new consecutive points
    if (afterPrimes.count > beforePrimes.count) {
      primingBonus += (afterPrimes.count - beforePrimes.count) * 2000;
    }

    // Major bonus for reaching 6-prime (unstoppable)
    if (afterPrimes.length >= 6) {
      primingBonus += 10000;
    }

    return primingBonus;
  }

  /**
   * Order moves by evaluation to improve alpha-beta pruning
   */
  function orderMovesByEvaluation(sequences, gameState, player) {
    const scoredSequences = sequences.map((sequence) => {
      if (sequence.length === 0) {
        return { sequence, score: -Infinity };
      }

      const { state: resultingState, hitPriorityScore } = applySequenceAndScore(
        gameState,
        sequence,
        player
      );
      const positionScore = evaluatePosition(resultingState);
      const backmostBonus = calculateBackmostCheckerBonus(sequence, player);
      const noContactHomeBonus = calculateNoContactHomeBoardBonus(
        gameState,
        sequence,
        player
      );
      const bearoffBonus = calculateBearoffBonus(gameState, sequence, player);
      const blitzBonus = calculateBlitzBonus(gameState, sequence, player);
      const primingBonus = calculatePrimingBonus(gameState, sequence, player);
      const score =
        positionScore +
        hitPriorityScore +
        backmostBonus +
        noContactHomeBonus +
        bearoffBonus +
        blitzBonus +
        primingBonus;
      return { sequence, score };
    });

    // Sort by score (descending)
    scoredSequences.sort((a, b) => b.score - a.score);
    return scoredSequences.map((item) => item.sequence);
  }

  /**
   * Enhanced evaluation with multi-move lookahead and alpha-beta pruning
   * Evaluates position after considering multiple move sequences with pruning for performance
   * This provides deeper evaluation without full minimax (which requires opponent dice simulation)
   */
  function evaluateWithLookahead(
    gameState,
    depth,
    player,
    alpha = -Infinity,
    beta = Infinity
  ) {
    // Base case: evaluate position
    if (depth === 0) {
      return evaluatePosition(gameState);
    }

    // Terminal conditions
    if (gameState.bearoff.player2 === 15) {
      return 100000;
    }
    if (gameState.bearoff.player1 === 15) {
      return -100000;
    }

    // If no moves available, evaluate current position
    if (!gameState.availableMoves || gameState.availableMoves.length === 0) {
      return evaluatePosition(gameState);
    }

    // Generate move sequences for current player
    const moveSequences = generateAllMoveSequences(
      gameState,
      gameState.availableMoves,
      player
    );

    if (
      moveSequences.length === 0 ||
      (moveSequences.length === 1 && moveSequences[0].length === 0)
    ) {
      return evaluatePosition(gameState);
    }

    // Limit search space for performance - reduce at deeper depths
    const seqLimit =
      depth > 2
        ? Math.min(15, MAX_SEQUENCES_TO_SEARCH)
        : MAX_SEQUENCES_TO_SEARCH;
    const sequencesToSearch =
      moveSequences.length > seqLimit
        ? moveSequences.slice(0, seqLimit)
        : moveSequences;

    const orderedSequences = orderMovesByEvaluation(
      sequencesToSearch,
      gameState,
      player
    );
    const safeSequences = enforcePlayCheckersOutsideHomeBoard(
      gameState,
      enforceDistribution(
        gameState,
        enforceStackLimitOnPoints2And1(
          gameState,
          enforcePlayer2HomeBoardSafety(gameState, orderedSequences, player),
          player
        ),
        player
      ),
      player
    );

    let bestScore = player === 2 ? -Infinity : Infinity;

    // Evaluate each sequence with lookahead and alpha-beta pruning
    for (let sequence of safeSequences) {
      if (sequence.length === 0) continue;

      const { state: resultingState, hitPriorityScore } = applySequenceAndScore(
        gameState,
        sequence,
        player
      );
      const score =
        evaluateWithLookahead(resultingState, depth - 1, player, alpha, beta) +
        hitPriorityScore;

      if (player === 2) {
        bestScore = Math.max(bestScore, score);
        alpha = Math.max(alpha, bestScore);
        // Alpha-beta cutoff
        if (beta <= alpha) break;
      } else {
        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, bestScore);
        // Alpha-beta cutoff
        if (beta <= alpha) break;
      }
    }

    return bestScore;
  }

  /**
   * Get the best move sequence for Player 2 (AI)
   * Uses minimax search with improved evaluation
   */
  function getBestMove(gameState) {
    const player = 2;
    const availableMoves = gameState.availableMoves;

    // Only use opening moves if Player 2 started the game
    // If Player 1 is still in opening position, it means Player 2 started
    if (isOpeningPosition(gameState) && isPlayer1OpeningPosition(gameState)) {
      const openingMove = getOpeningMove(availableMoves);
      if (openingMove) {
        return openingMove;
      }
      // If no opening move found for these dice, fall through to normal AI
    }

    // Generate all possible move sequences
    const moveSequences = generateAllMoveSequences(
      gameState,
      availableMoves,
      player
    );

    if (
      moveSequences.length === 0 ||
      (moveSequences.length === 1 && moveSequences[0].length === 0)
    ) {
      return []; // No moves available
    }

    // Limit search space for performance
    const sequencesToEvaluate =
      moveSequences.length > MAX_SEQUENCES_TO_SEARCH
        ? moveSequences.slice(0, MAX_SEQUENCES_TO_SEARCH)
        : moveSequences;

    // Order moves by quick evaluation for better pruning
    const orderedSequences = orderMovesByEvaluation(
      sequencesToEvaluate,
      gameState,
      player
    );
    const safeSequences = enforcePlayCheckersOutsideHomeBoard(
      gameState,
      enforceDistribution(
        gameState,
        enforceStackLimitOnPoints2And1(
          gameState,
          enforcePlayer2HomeBoardSafety(gameState, orderedSequences, player),
          player
        ),
        player
      ),
      player
    );

    let bestSequence = null;
    let bestScore = -Infinity;

    // Use minimax search if depth > 0, otherwise just evaluate
    const useSearch = MAX_SEARCH_DEPTH > 0 && sequencesToEvaluate.length < 30; // Only search if not too many sequences

    // Evaluate each sequence
    for (let sequence of safeSequences) {
      if (sequence.length === 0) continue;

      const { state: resultingState, hitPriorityScore } = applySequenceAndScore(
        gameState,
        sequence,
        player
      );
      const backmostBonus = calculateBackmostCheckerBonus(sequence, player);
      const noContactHomeBonus = calculateNoContactHomeBoardBonus(
        gameState,
        sequence,
        player
      );
      const bearoffBonus = calculateBearoffBonus(gameState, sequence, player);
      const blitzBonus = calculateBlitzBonus(gameState, sequence, player);
      const primingBonus = calculatePrimingBonus(gameState, sequence, player);

      let score;
      if (useSearch) {
        score =
          evaluateWithLookahead(resultingState, MAX_SEARCH_DEPTH, player) +
          hitPriorityScore +
          backmostBonus +
          noContactHomeBonus +
          bearoffBonus +
          blitzBonus +
          primingBonus;
      } else {
        score =
          evaluatePosition(resultingState) +
          hitPriorityScore +
          backmostBonus +
          noContactHomeBonus +
          bearoffBonus +
          blitzBonus +
          primingBonus;
      }

      if (score > bestScore) {
        bestScore = score;
        bestSequence = sequence;
      }

      // Early termination if we found a winning move
      if (score > 50000) {
        break;
      }
    }

    return bestSequence || [];
  }

  // Public API
  return {
    getBestMove,
  };
})();
