/**
 * Backgammon Game Logic
 * Reference: Standard JavaScript practices from MDN Web Docs
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript
 */

const BackgammonGame = (function() {
    'use strict';

    // Game state
    let state = {
        // Board representation: index 0 is unused, 1-24 are points, 25 is bar
        // Each point contains: { player: 0/1/2, count: number }
        board: [],
        bar: { player1: 0, player2: 0 },
        bearoff: { player1: 0, player2: 0 },
        currentPlayer: 1,
        dice: [],
        availableMoves: [],
        phase: 'OPENING_ROLL', // OPENING_ROLL, ROLL, MOVE, GAME_OVER
        moveHistory: [],
        selectedPoint: null,
        gameHistory: [], // For undo functionality
        openingRoll: { player1: null, player2: null }, // For initial roll
        stagedMove: { from: null, to: null } // For confirm button feature
    };

    /**
     * Initialize a new game with standard backgammon starting position
     * Reference: Standard backgammon rules
     */
    function initializeGame() {
        // Reset state
        state.board = new Array(25).fill(null).map(() => ({ player: 0, count: 0 }));
        state.bar = { player1: 0, player2: 0 };
        state.bearoff = { player1: 0, player2: 0 };
        state.currentPlayer = 1;
        state.dice = [];
        state.availableMoves = [];
        state.phase = 'OPENING_ROLL';
        state.moveHistory = [];
        state.selectedPoint = null;
        state.gameHistory = [];
        state.openingRoll = { player1: null, player2: null };
        state.stagedMove = { from: null, to: null };

        // Standard backgammon starting position
        // Player 1 moves from 1 to 24, Player 2 moves from 24 to 1
        
        // Player 1 checkers (15 total)
        state.board[1] = { player: 1, count: 2 };   // 2 on point 1
        state.board[12] = { player: 1, count: 5 };  // 5 on point 12
        state.board[17] = { player: 1, count: 3 };  // 3 on point 17
        state.board[19] = { player: 1, count: 5 };  // 5 on point 19

        // Player 2 checkers (15 total)
        state.board[24] = { player: 2, count: 2 };  // 2 on point 24
        state.board[13] = { player: 2, count: 5 };  // 5 on point 13
        state.board[8] = { player: 2, count: 3 };   // 3 on point 8
        state.board[6] = { player: 2, count: 5 };   // 5 on point 6

        return state;
    }

    /**
     * Roll two dice (1-6 each)
     * Reference: Math.random() - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
     * Reference: Standard backgammon opening roll rules
     */
    function rollDice() {
        // Handle opening roll (each player rolls one die)
        if (state.phase === 'OPENING_ROLL') {
            const player1Roll = Math.floor(Math.random() * 6) + 1;
            const player2Roll = Math.floor(Math.random() * 6) + 1;
            
            state.openingRoll = { player1: player1Roll, player2: player2Roll };
            
            // If tied, roll again
            if (player1Roll === player2Roll) {
                return { 
                    success: true, 
                    isOpeningRoll: true, 
                    tied: true,
                    player1Roll: player1Roll,
                    player2Roll: player2Roll
                };
            }
            
            // Determine starting player and set up first move
            if (player1Roll > player2Roll) {
                state.currentPlayer = 1;
            } else {
                state.currentPlayer = 2;
            }
            
            // Winner uses both dice for first move
            state.dice = [player1Roll, player2Roll];
            state.availableMoves = [player1Roll, player2Roll];
            state.phase = 'MOVE';
            
            // Save state for undo
            saveStateForUndo();
            
            // Check if player has any valid moves
            if (!hasAnyValidMoves()) {
                // No valid moves, switch player
                switchPlayer();
                return { 
                    success: true, 
                    isOpeningRoll: true,
                    player1Roll: player1Roll,
                    player2Roll: player2Roll,
                    starter: state.currentPlayer === 1 ? 2 : 1,
                    noMoves: true 
                };
            }
            
            return { 
                success: true, 
                isOpeningRoll: true,
                player1Roll: player1Roll,
                player2Roll: player2Roll,
                starter: state.currentPlayer
            };
        }
        
        // Regular roll
        if (state.phase !== 'ROLL') {
            return { success: false, message: 'Cannot roll dice now' };
        }

        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;

        // If doubles, player gets 4 moves of that value
        if (die1 === die2) {
            state.dice = [die1, die1, die1, die1];
            state.availableMoves = [die1, die1, die1, die1];
        } else {
            state.dice = [die1, die2];
            state.availableMoves = [die1, die2];
        }

        state.phase = 'MOVE';
        
        // Save state for undo
        saveStateForUndo();

        // Check if player has any valid moves
        if (!hasAnyValidMoves()) {
            // No valid moves, switch player
            switchPlayer();
            return { success: true, dice: [die1, die2], noMoves: true };
        }

        return { success: true, dice: [die1, die2] };
    }

    /**
     * Save current state for undo functionality
     */
    function saveStateForUndo() {
        state.gameHistory.push({
            board: state.board.map(p => ({ ...p })),
            bar: { ...state.bar },
            bearoff: { ...state.bearoff },
            availableMoves: [...state.availableMoves],
            currentPlayer: state.currentPlayer,
            phase: state.phase
        });
    }

    /**
     * Check if player has any valid moves
     */
    function hasAnyValidMoves() {
        const player = state.currentPlayer;
        
        // If checkers on bar, must enter first
        // Reference: Set for unique values - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
        if (state.bar[`player${player}`] > 0) {
            // Check unique die values for entry points
            const uniqueMoves = [...new Set(state.availableMoves)];
            for (let move of uniqueMoves) {
                const entryPoint = player === 1 ? move : (25 - move);
                if (canMoveToPoint(entryPoint, player)) {
                    return true;
                }
            }
            return false;
        }

        // Check all points for valid moves
        for (let point = 1; point <= 24; point++) {
            if (state.board[point].player === player && state.board[point].count > 0) {
                const validMoves = getValidMovesFromPoint(point);
                if (validMoves.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get valid destination points from a given point
     * Reference: Standard backgammon rules - Player 1 moves from low to high (1→24), Player 2 moves from high to low (24→1)
     */
    function getValidMovesFromPoint(fromPoint) {
        const player = state.currentPlayer;
        const validMoves = [];

        // If on bar, can only move from bar
        if (state.bar[`player${player}`] > 0 && fromPoint !== 'bar') {
            return [];
        }

        // Handle bar moves
        if (fromPoint === 'bar') {
            if (state.bar[`player${player}`] === 0) {
                return [];
            }
            for (let move of state.availableMoves) {
                const entryPoint = player === 1 ? move : (25 - move);
                if (canMoveToPoint(entryPoint, player)) {
                    validMoves.push({ to: entryPoint, die: move });
                }
            }
            return validMoves;
        }

        // Check if this point has player's checkers
        if (state.board[fromPoint].player !== player || state.board[fromPoint].count === 0) {
            return [];
        }

        // Try each available die
        for (let move of state.availableMoves) {
            const toPoint = player === 1 ? fromPoint + move : fromPoint - move;

            // Check for bearing off
            if ((player === 1 && toPoint >= 25) || (player === 2 && toPoint <= 0)) {
                if (canBearOff(fromPoint, move)) {
                    validMoves.push({ to: 'bearoff', die: move });
                }
            } else if (toPoint >= 1 && toPoint <= 24) {
                if (canMoveToPoint(toPoint, player)) {
                    validMoves.push({ to: toPoint, die: move });
                }
            }
        }

        return validMoves;
    }

    /**
     * Check if player can bear off from a point
     * Reference: Standard backgammon bearing off rules
     */
    function canBearOff(fromPoint, dieValue) {
        const player = state.currentPlayer;

        // Check if all checkers are in home board
        if (!allCheckersInHomeBoard(player)) {
            return false;
        }

        // Calculate destination
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
                    if (state.board[p].player === 1 && state.board[p].count > 0) {
                        return false; // There's a checker further back
                    }
                }
            } else {
                for (let p = fromPoint + 1; p <= 6; p++) {
                    if (state.board[p].player === 2 && state.board[p].count > 0) {
                        return false; // There's a checker further back
                    }
                }
            }
            return true;
        }

        return false;
    }

    /**
     * Check if all player's checkers are in their home board
     * Reference: Standard backgammon rules - Player 1 home: points 19-24, Player 2 home: points 1-6
     */
    function allCheckersInHomeBoard(player) {
        // Check bar
        if (state.bar[`player${player}`] > 0) {
            return false;
        }

        // Check outside home board
        if (player === 1) {
            // Player 1 home is points 19-24, so check if any checkers on 1-18
            for (let p = 1; p <= 18; p++) {
                if (state.board[p].player === 1 && state.board[p].count > 0) {
                    return false;
                }
            }
        } else {
            // Player 2 home is points 1-6, so check if any checkers on 7-24
            for (let p = 7; p <= 24; p++) {
                if (state.board[p].player === 2 && state.board[p].count > 0) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Check if a player can move to a specific point
     */
    function canMoveToPoint(toPoint, player) {
        if (toPoint < 1 || toPoint > 24) {
            return false;
        }

        const pointState = state.board[toPoint];
        
        // Safety check for undefined point
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
     * Stage a move for confirmation
     */
    function stageMove(from, to) {
        const validMoves = getValidMovesFromPoint(from);
        const validMove = validMoves.find(m => m.to === to);

        if (!validMove) {
            return { success: false, message: 'Invalid move' };
        }

        state.stagedMove = { from: from, to: to };
        return { success: true };
    }

    /**
     * Clear the staged move
     */
    function clearStagedMove() {
        state.stagedMove = { from: null, to: null };
    }

    /**
     * Confirm and execute the staged move
     */
    function confirmMove() {
        if (state.stagedMove.from === null || state.stagedMove.to === null) {
            return { success: false, message: 'No move to confirm' };
        }

        const result = executeMove(state.stagedMove.from, state.stagedMove.to);
        
        if (result.success) {
            clearStagedMove();
        }
        
        return result;
    }

    /**
     * Execute a move
     */
    function executeMove(from, to) {
        const player = state.currentPlayer;

        // Find which die to use
        let dieUsed = null;
        const validMoves = getValidMovesFromPoint(from);
        const validMove = validMoves.find(m => m.to === to);

        if (!validMove) {
            return { success: false, message: 'Invalid move' };
        }

        dieUsed = validMove.die;

        // Save state for undo
        saveStateForUndo();

        // Handle move from bar
        if (from === 'bar') {
            state.bar[`player${player}`]--;
            
            // Check for hit
            if (state.board[to].player !== 0 && state.board[to].player !== player) {
                const opponent = player === 1 ? 2 : 1;
                state.bar[`player${opponent}`]++;
                state.board[to] = { player: 0, count: 0 };
            }

            // Place checker
            if (state.board[to].player === player) {
                state.board[to].count++;
            } else {
                state.board[to] = { player: player, count: 1 };
            }
        }
        // Handle bear off
        else if (to === 'bearoff') {
            state.board[from].count--;
            if (state.board[from].count === 0) {
                state.board[from].player = 0;
            }
            state.bearoff[`player${player}`]++;
        }
        // Normal move
        else {
            // Remove from source
            state.board[from].count--;
            if (state.board[from].count === 0) {
                state.board[from].player = 0;
            }

            // Check for hit
            if (state.board[to].player !== 0 && state.board[to].player !== player) {
                const opponent = player === 1 ? 2 : 1;
                state.bar[`player${opponent}`]++;
                state.board[to] = { player: 0, count: 0 };
            }

            // Place on destination
            if (state.board[to].player === player) {
                state.board[to].count++;
            } else {
                state.board[to] = { player: player, count: 1 };
            }
        }

        // Remove used die from available moves
        const dieIndex = state.availableMoves.indexOf(dieUsed);
        if (dieIndex !== -1) {
            state.availableMoves.splice(dieIndex, 1);
        }

        // Record move in history
        const moveNotation = formatMoveNotation(from, to, dieUsed);
        state.moveHistory.push({
            player: player,
            from: from,
            to: to,
            die: dieUsed,
            notation: moveNotation
        });

        // Check win condition
        if (state.bearoff[`player${player}`] === 15) {
            state.phase = 'GAME_OVER';
            return { success: true, gameOver: true, winner: player };
        }

        // Don't auto-switch - player must confirm end of turn
        return { success: true };
    }

    /**
     * Format move notation for display
     */
    function formatMoveNotation(from, to, die) {
        const fromStr = from === 'bar' ? 'Bar' : from;
        const toStr = to === 'bearoff' ? 'Off' : to;
        return `${fromStr}→${toStr} (${die})`;
    }

    /**
     * Switch to the other player
     */
    function switchPlayer() {
        state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
        state.dice = [];
        state.availableMoves = [];
        state.phase = 'ROLL';
        state.selectedPoint = null;
        clearStagedMove();
        
        // Clear undo history when switching players
        state.gameHistory = [];
    }

    /**
     * End current player's turn and switch to next player
     */
    function endTurn() {
        switchPlayer();
        return { success: true };
    }

    /**
     * Undo the last move
     */
    function undoMove() {
        if (state.gameHistory.length === 0) {
            return { success: false, message: 'No moves to undo' };
        }

        // Get previous state
        const previousState = state.gameHistory.pop();

        // Restore state
        state.board = previousState.board;
        state.bar = previousState.bar;
        state.bearoff = previousState.bearoff;
        state.availableMoves = previousState.availableMoves;
        state.currentPlayer = previousState.currentPlayer;
        state.phase = previousState.phase;

        // Remove last move from history
        state.moveHistory.pop();

        state.selectedPoint = null;

        return { success: true };
    }

    /**
     * Get current game state
     */
    function getState() {
        return state;
    }

    /**
     * Select a point (for UI)
     */
    function selectPoint(point) {
        state.selectedPoint = point;
    }

    /**
     * Deselect point
     */
    function deselectPoint() {
        state.selectedPoint = null;
    }

    // Public API
    return {
        initializeGame,
        rollDice,
        executeMove,
        stageMove,
        confirmMove,
        clearStagedMove,
        undoMove,
        getState,
        getValidMovesFromPoint,
        selectPoint,
        deselectPoint,
        endTurn
    };
})();

// Initialize game on load
// Reference: Window load event - https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function() {
        BackgammonGame.initializeGame();
    });
}

