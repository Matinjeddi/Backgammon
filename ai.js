/**
 * Backgammon AI Module
 * Enhanced AI with GNU Backgammon-inspired features
 * Implements phase detection, improved evaluation, and minimax search
 * Reference: Backgammon strategy and evaluation principles
 */

const BackgammonAI = (function() {
    'use strict';

    // Configuration
    const MAX_SEARCH_DEPTH = 2; // Keep shallow for speed
    const MAX_SEQUENCES_TO_SEARCH = 50; // Limit search space
    const CACHE_SIZE = 1000; // Position evaluation cache
    const PLAYER1_HOME_START_POINT = 1; // Player 1 home board spans points 6→1 (numeric range 1-6)
    const PLAYER1_HOME_END_POINT = 6;
    const HIGH_PRIORITY_HIT_BONUS = 20000; // Strongly prefer hitting outside Player 1 home
    const KEY_POINT_PRIORITIES = [
        { point: 5, weight: 1.0 },   // Highest priority
        { point: 20, weight: 0.9 },
        { point: 4, weight: 0.7 },
        { point: 21, weight: 0.65 },
        { point: 7, weight: 0.6 },
        { point: 18, weight: 0.55 }
    ];
    const KEY_POINT_STACK_BONUS = 1200; // Bonus when AI makes (2+) a key point
    const KEY_POINT_SINGLE_BONUS = 450; // Bonus for occupying with a single checker
    const KEY_POINT_OPPONENT_BLOCK_PENALTY = 1400; // Penalty when opponent locks the point
    const KEY_POINT_OPPONENT_BLOT_PENALTY = 700; // Penalty while opponent blot sits there (encourage hits)
    const NO_CONTACT_HOME_BOARD_BONUS = 5000; // High bonus for moving checkers into home board when no contact
    const NO_CONTACT_HOME_BOARD_MOVE_BONUS = 2000; // Bonus per checker moved into home board during no-contact
    const BEAROFF_BONUS = 15000; // High bonus for bearing off when all checkers are in home board

    // Position evaluation cache
    let positionCache = new Map();
    let cacheHits = 0;
    let cacheMisses = 0;

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
            sourcePoints.push('bar');
        } else {
            // Get all points with player's checkers
            for (let i = 1; i <= 24; i++) {
                if (gameState.board[i].player === player && gameState.board[i].count > 0) {
                    sourcePoints.push(i);
                }
            }
        }

        // Try each source point with each available die
        for (let source of sourcePoints) {
            const validMoves = getValidMovesForAI(gameState, source, availableMoves, player);
            
            for (let move of validMoves) {
                // Create new game state after this move
                const newState = simulateMove(gameState, source, move.to, move.die, player);
                const newAvailableMoves = [...availableMoves];
                const dieIndex = newAvailableMoves.indexOf(move.die);
                if (dieIndex !== -1) {
                    newAvailableMoves.splice(dieIndex, 1);
                }

                // Recursively generate sequences for remaining moves
                const remainingSequences = generateAllMoveSequences(newState, newAvailableMoves, player);
                
                // Prepend this move to all remaining sequences
                for (let seq of remainingSequences) {
                    sequences.push([{ from: source, to: move.to, die: move.die }, ...seq]);
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
        if (gameState.bar[`player${player}`] > 0 && fromPoint !== 'bar') {
            return [];
        }

        // Handle bar moves
        if (fromPoint === 'bar') {
            if (gameState.bar[`player${player}`] === 0) {
                return [];
            }
            for (let move of availableMoves) {
                const entryPoint = player === 1 ? move : (25 - move);
                if (canMoveToPointForAI(gameState, entryPoint, player)) {
                    validMoves.push({ to: entryPoint, die: move });
                }
            }
            return validMoves;
        }

        // Check if this point has player's checkers
        if (gameState.board[fromPoint].player !== player || gameState.board[fromPoint].count === 0) {
            return [];
        }

        // Try each available die
        for (let move of availableMoves) {
            const toPoint = player === 1 ? fromPoint + move : fromPoint - move;

            // Check for bearing off
            if ((player === 1 && toPoint >= 25) || (player === 2 && toPoint <= 0)) {
                if (canBearOffForAI(gameState, fromPoint, move, player)) {
                    validMoves.push({ to: 'bearoff', die: move });
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
            board: gameState.board.map(p => ({ ...p })),
            bar: { ...gameState.bar },
            bearoff: { ...gameState.bearoff },
            currentPlayer: gameState.currentPlayer,
            availableMoves: [...(gameState.availableMoves || [])]
        };
    }

    /**
     * Simulate a move and return new game state (deep copy)
     */
    function simulateMove(gameState, from, to, die, player) {
        const newState = cloneState(gameState);

        // Handle move from bar
        if (from === 'bar') {
            newState.bar[`player${player}`]--;
            
            if (newState.board[to].player !== 0 && newState.board[to].player !== player) {
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
        else if (to === 'bearoff') {
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

            if (newState.board[to].player !== 0 && newState.board[to].player !== player) {
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
        if (typeof move.to !== 'number') {
            return false;
        }
        if (move.to < 1 || move.to > 24) {
            return false;
        }
        if (move.to >= PLAYER1_HOME_START_POINT && move.to <= PLAYER1_HOME_END_POINT) {
            return false; // Inside Player 1 home, no special priority
        }

        const opponent = 1;
        const pointState = gameState.board[move.to];
        return pointState && pointState.player === opponent && pointState.count === 1;
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

            currentState = simulateMove(currentState, move.from, move.to, move.die, player);
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
        for (let point = PLAYER1_HOME_START_POINT; point <= PLAYER1_HOME_END_POINT; point++) {
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
        const safeSequences = orderedSequences.filter(sequence => 
            !sequenceLeavesPlayer2HomeBoardBlot(gameState, sequence, player)
        );
        return safeSequences.length > 0 ? safeSequences : orderedSequences;
    }

    /**
     * Detect game phase: RACE, CONTACT, or BACKGAME
     */
    function detectGamePhase(gameState) {
        const player1InHome = allCheckersInHomeBoardForAI(gameState, 1);
        const player2InHome = allCheckersInHomeBoardForAI(gameState, 2);
        const player1Pips = calculatePipCount(gameState, 1);
        const player2Pips = calculatePipCount(gameState, 2);
        const pipDiff = Math.abs(player1Pips - player2Pips);

        // Both players bearing off = race
        if (player1InHome && player2InHome) {
            return 'RACE';
        }

        // One player significantly behind = backgame
        if (pipDiff > 30) {
            return 'BACKGAME';
        }

        // Otherwise it's a contact game
        return 'CONTACT';
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
            if (gameState.board[i].player === player && gameState.board[i].count > 0) {
                occupiedPoints++;
                if (lastOccupied !== -1 && i - lastOccupied > 1) {
                    gaps += (i - lastOccupied - 1);
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
            if (gameState.board[i].player === player && gameState.board[i].count >= 2) {
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
                if (gameState.board[i].player === player && gameState.board[i].count >= 2) {
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
                if (gameState.board[i].player === player && gameState.board[i].count >= 2) {
                    anchorCount++;
                    anchorPositions.push(i);
                    // Lower points are more valuable (closer to opponent's home)
                    anchorScore += (i - 18) * 5;
                    // More checkers = stronger anchor
                    anchorScore += gameState.board[i].count * 2;
                }
            }
        }

        return { count: anchorCount, score: anchorScore, positions: anchorPositions };
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
            if (gameState.board[i].player === player && gameState.board[i].count === 1) {
                // Check if opponent can hit this blot
                let canBeHit = false;
                
                // Check if opponent has checkers that can reach this point
                for (let j = 1; j <= 24; j++) {
                    if (gameState.board[j].player === opponent && gameState.board[j].count > 0) {
                        const distance = player === 1 ? (i - j) : (j - i);
                        if (distance > 0 && distance <= 6) {
                            canBeHit = true;
                            break;
                        }
                    }
                }
                
                // Check if opponent has checkers on bar
                if (gameState.bar[`player${opponent}`] > 0) {
                    const entryPoint = opponent === 1 ? 1 : 24;
                    const distance = player === 1 ? (i - entryPoint) : (entryPoint - i);
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
                if (gameState.board[i].player === player && gameState.board[i].count >= 2) {
                    madePoints++;
                    if (lastPoint !== -1 && i - lastPoint > 1) {
                        gaps += (i - lastPoint - 1);
                    }
                    lastPoint = i;
                    // Points closer to bear off are more valuable
                    structureScore += (i - 18) * 3;
                }
            }
        } else {
            // Player 2 home is points 1-6
            for (let i = 1; i <= 6; i++) {
                if (gameState.board[i].player === player && gameState.board[i].count >= 2) {
                    madePoints++;
                    if (lastPoint !== -1 && i - lastPoint > 1) {
                        gaps += (i - lastPoint - 1);
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

        // Count checkers and analyze distribution
        if (player === 1) {
            // Player 1 home is points 19-24
            for (let i = 1; i <= 24; i++) {
                if (gameState.board[i].player === player && gameState.board[i].count > 0) {
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
                    }
                }
            }
        } else {
            // Player 2 home is points 1-6
            for (let i = 1; i <= 24; i++) {
                if (gameState.board[i].player === player && gameState.board[i].count > 0) {
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
                    }
                }
            }
        }

        // Penalize if all checkers are in home board (crunching scenario)
        if (allCheckersInHomeBoardForAI(gameState, player)) {
            // Penalty for having many checkers on few points in home board
            const averageCheckersPerPoint = homeBoardCheckers / Math.max(occupiedPoints, 1);
            if (averageCheckersPerPoint > 2.5) {
                // Heavy concentration - significant crunch
                crunchScore -= (averageCheckersPerPoint - 2.5) * 20;
            }
            
            // Penalty for large stacks (5+ checkers on a single point)
            if (maxStack >= 5) {
                crunchScore -= (maxStack - 4) * 15;
            }
            
            // Penalty for checkers on high points (far from bearoff)
            // This is especially bad during bearoff
            crunchScore -= highPointCheckers * 3;
            
            // Penalty for having checkers concentrated on too few points
            // If we have many checkers but few occupied points, that's a crunch
            if (homeBoardCheckers > 0 && occupiedPoints < 4) {
                const concentrationRatio = homeBoardCheckers / occupiedPoints;
                if (concentrationRatio > 3) {
                    crunchScore -= (concentrationRatio - 3) * 10;
                }
            }
        } else {
            // Not in home board yet, but still penalize excessive stacking
            if (maxStack >= 6) {
                crunchScore -= (maxStack - 5) * 8;
            }
            
            // Penalize having many checkers on few points overall
            if (totalCheckersOnBoard > 0 && occupiedPoints < 6) {
                const concentrationRatio = totalCheckersOnBoard / occupiedPoints;
                if (concentrationRatio > 4) {
                    crunchScore -= (concentrationRatio - 4) * 5;
                }
            }
        }

        return crunchScore;
    }

    /**
     * Generate a position hash for caching
     */
    function hashPosition(gameState) {
        let hash = '';
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
        let pipWeight, bearoffWeight, barWeight, homeWeight, blotWeight, primeWeight, anchorWeight, distributionWeight, raceWeight, crunchWeight;

        if (phase === 'RACE') {
            // In race, pip count and bearoff are most important
            // Crunching is very bad during bearoff
            pipWeight = 0.5;
            bearoffWeight = 100;
            barWeight = 200;
            homeWeight = 3;
            blotWeight = 10;
            primeWeight = 2;
            anchorWeight = 1;
            distributionWeight = 1;
            raceWeight = 2;
            crunchWeight = 0; // Never crunch - disabled
        } else if (phase === 'BACKGAME') {
            // In backgame, anchors and primes are important
            pipWeight = 0.2;
            bearoffWeight = 50;
            barWeight = 150;
            homeWeight = 5;
            blotWeight = 15;
            primeWeight = 15;
            anchorWeight = 20;
            distributionWeight = 2;
            raceWeight = 0.5;
            crunchWeight = 0; // Never crunch - disabled
        } else {
            // CONTACT game - balanced weights
            pipWeight = 0.3;
            bearoffWeight = 60;
            barWeight = 120;
            homeWeight = 8;
            blotWeight = 20;
            primeWeight = 12;
            anchorWeight = 15;
            distributionWeight = 3;
            raceWeight = 1;
            crunchWeight = 0; // Never crunch - disabled
        }

        // 1. Pip count (lower is better)
        const playerPips = calculatePipCount(gameState, player);
        const opponentPips = calculatePipCount(gameState, opponent);
        score += (opponentPips - playerPips) * pipWeight;

        // 2. Race count (in race positions)
        if (phase === 'RACE') {
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
        const opponentHomeStructure = evaluateHomeBoardStructure(gameState, opponent);
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
     * Calculate bonus for moving backmost checkers (points 18-24 for Player 2)
     */
    function calculateBackmostCheckerBonus(sequence, player) {
        if (player !== 2) {
            return 0;
        }
        
        let bonus = 0;
        for (let move of sequence) {
            // Points 18-24 are the backmost for Player 2
            if (typeof move.from === 'number' && move.from >= 18 && move.from <= 24) {
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
            if (typeof move.to === 'number' && move.to >= 1 && move.to <= 6) {
                // Check if the checker was moved from outside home board
                if (typeof move.from === 'number' && move.from > 6) {
                    // Higher bonus for moving from further away
                    const distanceBonus = (move.from - 6) * NO_CONTACT_HOME_BOARD_MOVE_BONUS / 10;
                    bonus += NO_CONTACT_HOME_BOARD_MOVE_BONUS + distanceBonus;
                } else if (move.from === 'bar') {
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
            if (move.to === 'bearoff') {
                bearoffCount++;
            }
        }

        // Return bonus proportional to number of checkers borne off
        // Higher bonus encourages bearing off over playing within home board
        return bearoffCount * BEAROFF_BONUS;
    }

    /**
     * Order moves by evaluation to improve alpha-beta pruning
     */
    function orderMovesByEvaluation(sequences, gameState, player) {
        const scoredSequences = sequences.map(sequence => {
            if (sequence.length === 0) {
                return { sequence, score: -Infinity };
            }

            const { state: resultingState, hitPriorityScore } = applySequenceAndScore(gameState, sequence, player);
            const positionScore = evaluatePosition(resultingState);
            const backmostBonus = calculateBackmostCheckerBonus(sequence, player);
            const noContactHomeBonus = calculateNoContactHomeBoardBonus(gameState, sequence, player);
            const bearoffBonus = calculateBearoffBonus(gameState, sequence, player);
            const score = positionScore + hitPriorityScore + backmostBonus + noContactHomeBonus + bearoffBonus;
            return { sequence, score };
        });

        // Sort by score (descending)
        scoredSequences.sort((a, b) => b.score - a.score);
        return scoredSequences.map(item => item.sequence);
    }

    /**
     * Enhanced evaluation with multi-move lookahead
     * Evaluates position after considering multiple move sequences
     * This provides deeper evaluation without full minimax (which requires opponent dice simulation)
     */
    function evaluateWithLookahead(gameState, depth, player) {
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
        const moveSequences = generateAllMoveSequences(gameState, gameState.availableMoves, player);
        
        if (moveSequences.length === 0 || (moveSequences.length === 1 && moveSequences[0].length === 0)) {
            return evaluatePosition(gameState);
        }

        // Limit search space for performance
        const sequencesToSearch = moveSequences.slice(0, MAX_SEQUENCES_TO_SEARCH);
        const orderedSequences = orderMovesByEvaluation(sequencesToSearch, gameState, player);
        const safeSequences = enforcePlayer2HomeBoardSafety(gameState, orderedSequences, player);

        let bestScore = player === 2 ? -Infinity : Infinity;

        // Evaluate each sequence with lookahead
        for (let sequence of safeSequences) {
            if (sequence.length === 0) continue;

            const { state: resultingState, hitPriorityScore } = applySequenceAndScore(gameState, sequence, player);
            const score = evaluateWithLookahead(resultingState, depth - 1, player) + hitPriorityScore;
            
            if (player === 2) {
                bestScore = Math.max(bestScore, score);
            } else {
                bestScore = Math.min(bestScore, score);
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
        
        // Generate all possible move sequences
        const moveSequences = generateAllMoveSequences(gameState, availableMoves, player);
        
        if (moveSequences.length === 0 || (moveSequences.length === 1 && moveSequences[0].length === 0)) {
            return []; // No moves available
        }

        // Limit search space for performance
        const sequencesToEvaluate = moveSequences.length > MAX_SEQUENCES_TO_SEARCH
            ? moveSequences.slice(0, MAX_SEQUENCES_TO_SEARCH)
            : moveSequences;

        // Order moves by quick evaluation for better pruning
        const orderedSequences = orderMovesByEvaluation(sequencesToEvaluate, gameState, player);
        const safeSequences = enforcePlayer2HomeBoardSafety(gameState, orderedSequences, player);

        let bestSequence = null;
        let bestScore = -Infinity;

        // Use minimax search if depth > 0, otherwise just evaluate
        const useSearch = MAX_SEARCH_DEPTH > 0 && sequencesToEvaluate.length < 30; // Only search if not too many sequences

        // Evaluate each sequence
        for (let sequence of safeSequences) {
            if (sequence.length === 0) continue;

            const { state: resultingState, hitPriorityScore } = applySequenceAndScore(gameState, sequence, player);
            const backmostBonus = calculateBackmostCheckerBonus(sequence, player);
            const noContactHomeBonus = calculateNoContactHomeBoardBonus(gameState, sequence, player);
            const bearoffBonus = calculateBearoffBonus(gameState, sequence, player);

            let score;
            if (useSearch) {
                score = evaluateWithLookahead(resultingState, MAX_SEARCH_DEPTH, player) + hitPriorityScore + backmostBonus + noContactHomeBonus + bearoffBonus;
            } else {
                score = evaluatePosition(resultingState) + hitPriorityScore + backmostBonus + noContactHomeBonus + bearoffBonus;
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
        getBestMove
    };
})();
