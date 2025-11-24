/**
 * Backgammon UI Controller
 * Reference: DOM manipulation - https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model
 */

const BackgammonUI = (function() {
    'use strict';

    let elements = {};
    let aiMoveTimeout = null;
    let isAITurnInProgress = false;

    /**
     * Initialize UI and attach event listeners
     * Reference: addEventListener - https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
     */
    function init() {
        // Cache DOM elements
        elements = {
            board: document.querySelector('.board'),
            points: document.querySelectorAll('.point'),
            bar: document.getElementById('bar'),
            bearoffPlayer1: document.getElementById('bearoffPlayer1'),
            bearoffPlayer2: document.getElementById('bearoffPlayer2'),
            die1: document.getElementById('die1'),
            die2: document.getElementById('die2'),
            remainingMoves: document.getElementById('remainingMoves'),
            statusDisplay: document.getElementById('statusDisplay'),
            rollDiceBtn: document.getElementById('rollDiceBtn'),
            confirmBtn: document.getElementById('confirmBtn'),
            undoBtn: document.getElementById('undoBtn'),
            newGameBtn: document.getElementById('newGameBtn'),
            historyList: document.getElementById('historyList')
        };

        addPointLabels();

        // Attach event listeners
        elements.rollDiceBtn.addEventListener('click', handleRollDice);
        elements.confirmBtn.addEventListener('click', handleConfirm);
        elements.undoBtn.addEventListener('click', handleUndo);
        elements.newGameBtn.addEventListener('click', handleNewGame);

        // Event delegation for points
        // Reference: Event delegation - https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#event_delegation
        elements.board.addEventListener('click', handleBoardClick);
        elements.bar.addEventListener('click', handleBarClick);
        elements.bearoffPlayer1.addEventListener('click', handleBearoffClick);
        elements.bearoffPlayer2.addEventListener('click', handleBearoffClick);

        // Initial render
        render();
    }

    /**
     * Ensure every board point renders its number label
     */
    function addPointLabels() {
        elements.points.forEach(point => {
            let label = point.querySelector('.point-label');
            if (!label) {
                label = document.createElement('div');
                label.className = 'point-label';
                point.appendChild(label);
            }
            label.textContent = point.dataset.point;
        });
    }

    /**
     * Handle roll dice button click
     */
    function handleRollDice() {
        const result = BackgammonGame.rollDice();
        
        if (result.success) {
            if (result.isOpeningRoll) {
                if (result.tied) {
                    updateStatus(`Tied! Player 1 rolled ${result.player1Roll}, Player 2 rolled ${result.player2Roll}. Roll again.`);
                } else if (result.noMoves) {
                    updateStatus(`Player 1 rolled ${result.player1Roll}, Player 2 rolled ${result.player2Roll}. Player ${result.starter} starts but has no valid moves. Turn skipped.`);
                } else {
                    updateStatus(`Player 1 rolled ${result.player1Roll}, Player 2 rolled ${result.player2Roll}. Player ${result.starter} starts!`);
                }
            } else if (result.noMoves) {
                updateStatus(`Player ${BackgammonGame.getState().currentPlayer} rolled ${result.dice[0]}, ${result.dice[1]} but has no valid moves. Turn skipped.`);
            }
            render();
            
            // Check if it's Player 2's turn (AI) and trigger AI moves
            const state = BackgammonGame.getState();
            if (state.currentPlayer === 2 && state.phase === 'MOVE' && !result.noMoves && !result.tied) {
                scheduleAIMove();
            }
        }
    }

    /**
     * Handle confirm button click (End Turn)
     */
    function handleConfirm() {
        const state = BackgammonGame.getState();
        
        // Clear any staged move and selections
        BackgammonGame.clearStagedMove();
        BackgammonGame.deselectPoint();
        
        // End turn - switch to next player
        BackgammonGame.endTurn();
        
        render();
        
        // Check if it's now Player 2's turn (AI) and trigger AI
        const newState = BackgammonGame.getState();
        if (newState.currentPlayer === 2 && newState.phase === 'ROLL') {
            // Auto-roll dice for AI
            setTimeout(() => {
                const currentState = BackgammonGame.getState();
                if (currentState.currentPlayer === 2 && currentState.phase === 'ROLL') {
                    handleRollDice();
                }
            }, 500);
        }
    }

    /**
     * Handle undo button click
     */
    function handleUndo() {
        const result = BackgammonGame.undoMove();
        
        if (result.success) {
            BackgammonGame.clearStagedMove();
            render();
        }
    }

    /**
     * Handle new game button click
     */
    function handleNewGame() {
        if (confirm('Start a new game? Current game will be lost.')) {
            // Clear any pending AI moves
            if (aiMoveTimeout) {
                clearTimeout(aiMoveTimeout);
                aiMoveTimeout = null;
            }
            isAITurnInProgress = false;
            
            BackgammonGame.initializeGame();
            BackgammonGame.clearStagedMove();
            render();
        }
    }

    /**
     * Handle clicks on the board (points)
     */
    function handleBoardClick(event) {
        const point = event.target.closest('.point');
        if (!point) return;

        const pointNumber = parseInt(point.dataset.point);
        handlePointClick(pointNumber);
    }

    /**
     * Handle clicks on the bar
     */
    function handleBarClick() {
        handlePointClick('bar');
    }

    /**
     * Handle clicks on bearoff areas
     */
    function handleBearoffClick(event) {
        const bearoffArea = event.target.closest('.bearoff-area');
        if (!bearoffArea) return;

        // Can only click bearoff as a destination
        const state = BackgammonGame.getState();
        if (state.selectedPoint !== null) {
            handlePointClick('bearoff');
        }
    }

    /**
     * Handle point selection and moves
     */
    function handlePointClick(pointId) {
        const state = BackgammonGame.getState();

        // Ignore clicks during AI turn
        if (state.currentPlayer === 2 && isAITurnInProgress) {
            return;
        }

        if (state.phase !== 'MOVE') {
            return;
        }

        // If no point selected, select this point
        if (state.selectedPoint === null) {
            const validMoves = BackgammonGame.getValidMovesFromPoint(pointId);
            if (validMoves.length > 0) {
                BackgammonGame.selectPoint(pointId);
                render();
            }
        } 
        // If point already selected, try to execute move or deselect
        else {
            // If clicking the same point, deselect
            if (state.selectedPoint === pointId) {
                BackgammonGame.deselectPoint();
                render();
            }
            // Otherwise, try to execute this move
            else {
                const result = BackgammonGame.executeMove(state.selectedPoint, pointId);
                
                if (result.success) {
                    BackgammonGame.deselectPoint();
                    
                    if (result.gameOver) {
                        updateStatus(`Game Over! Player ${result.winner} wins!`);
                    }
                    
                    render();
                } else {
                    // Try selecting new point instead
                    const validMoves = BackgammonGame.getValidMovesFromPoint(pointId);
                    if (validMoves.length > 0) {
                        BackgammonGame.selectPoint(pointId);
                        render();
                    }
                }
            }
        }
    }

    /**
     * Main render function
     */
    function render() {
        const state = BackgammonGame.getState();
        
        renderBoard(state);
        renderBar(state);
        renderBearoff(state);
        renderDice(state);
        renderControls(state);
        renderHistory(state);
        renderStatus(state);
        
        // Check if it's Player 2's turn (AI) and trigger dice roll if needed
        if (state.currentPlayer === 2 && state.phase === 'ROLL' && !isAITurnInProgress) {
            // Auto-roll dice for AI with a small delay to allow UI to update
            setTimeout(() => {
                const currentState = BackgammonGame.getState();
                if (currentState.currentPlayer === 2 && currentState.phase === 'ROLL') {
                    handleRollDice();
                }
            }, 500);
        }
        
        // Check if it's Player 2's turn (AI) and trigger AI moves if needed
        // Only trigger if we're in MOVE phase and not already processing
        if (state.currentPlayer === 2 && state.phase === 'MOVE' && !isAITurnInProgress && state.availableMoves.length > 0) {
            scheduleAIMove();
        }
    }

    /**
     * Schedule AI move execution with delay
     */
    function scheduleAIMove() {
        if (isAITurnInProgress) {
            return; // Already processing
        }

        const state = BackgammonGame.getState();
        
        // Only proceed if it's Player 2's turn and we're in MOVE phase
        if (state.currentPlayer !== 2 || state.phase !== 'MOVE') {
            return;
        }

        // Check if there are moves available
        if (state.availableMoves.length === 0) {
            // No moves left, auto-end turn
            setTimeout(() => {
                BackgammonGame.endTurn();
                render();
                // Auto-roll for next turn if it's still Player 2
                const newState = BackgammonGame.getState();
                if (newState.currentPlayer === 2 && newState.phase === 'ROLL') {
                    setTimeout(() => handleRollDice(), 500);
                }
            }, 750);
            return;
        }

        isAITurnInProgress = true;
        updateStatus(`Player 2 (AI) is thinking...`);

        // Use setTimeout to allow UI to update before AI calculation
        setTimeout(() => {
            executeAIMoves();
        }, 100);
    }

    /**
     * Execute AI moves with delay between each move
     */
    function executeAIMoves() {
        const state = BackgammonGame.getState();
        
        // Safety check
        if (state.currentPlayer !== 2 || state.phase !== 'MOVE') {
            isAITurnInProgress = false;
            return;
        }

        // Get current game state for AI
        const gameState = {
            board: state.board.map(p => ({ ...p })),
            bar: { ...state.bar },
            bearoff: { ...state.bearoff },
            availableMoves: [...state.availableMoves],
            currentPlayer: state.currentPlayer
        };

        // Get best move sequence from AI
        const moveSequence = BackgammonAI.getBestMove(gameState);

        if (!moveSequence || moveSequence.length === 0) {
            // No moves available, end turn
            isAITurnInProgress = false;
            BackgammonGame.endTurn();
            render();
            const newState = BackgammonGame.getState();
            if (newState.currentPlayer === 2 && newState.phase === 'ROLL') {
                setTimeout(() => handleRollDice(), 500);
            }
            return;
        }

        // Execute moves one by one with delay
        let moveIndex = 0;
        
        function executeNextMove() {
            if (moveIndex >= moveSequence.length) {
                // All moves executed, check if more moves are available
                const currentState = BackgammonGame.getState();
                if (currentState.currentPlayer === 2 && currentState.phase === 'MOVE' && currentState.availableMoves.length > 0) {
                    // More moves available, continue
                    isAITurnInProgress = false;
                    scheduleAIMove();
                } else {
                    // No more moves, end turn
                    isAITurnInProgress = false;
                    BackgammonGame.endTurn();
                    render();
                    const newState = BackgammonGame.getState();
                    if (newState.currentPlayer === 2 && newState.phase === 'ROLL') {
                        setTimeout(() => handleRollDice(), 500);
                    }
                }
                return;
            }

            const move = moveSequence[moveIndex];
            const result = BackgammonGame.executeMove(move.from, move.to);

            if (result.success) {
                render();
                
                if (result.gameOver) {
                    isAITurnInProgress = false;
                    updateStatus(`Game Over! Player ${result.winner} wins!`);
                    return;
                }

                moveIndex++;
                
                // Schedule next move with 750ms delay
                aiMoveTimeout = setTimeout(executeNextMove, 750);
            } else {
                // Move failed, try to continue or end turn
                isAITurnInProgress = false;
                const currentState = BackgammonGame.getState();
                if (currentState.currentPlayer === 2 && currentState.phase === 'MOVE' && currentState.availableMoves.length > 0) {
                    scheduleAIMove();
                } else {
                    BackgammonGame.endTurn();
                    render();
                }
            }
        }

        // Start executing moves
        executeNextMove();
    }

    /**
     * Render the board points and checkers
     */
    function renderBoard(state) {
        // Clear all points
        elements.points.forEach(point => {
            const checkersContainer = point.querySelector('.checkers-container');
            if (!checkersContainer) {
                const container = document.createElement('div');
                container.className = 'checkers-container';
                point.appendChild(container);
            }
            point.querySelector('.checkers-container').innerHTML = '';
            point.classList.remove('valid-destination', 'selected');
        });

        // Render checkers on each point
        for (let i = 1; i <= 24; i++) {
            const pointData = state.board[i];
            if (pointData.count > 0) {
                const pointElement = document.querySelector(`.point[data-point="${i}"]`);
                const container = pointElement.querySelector('.checkers-container');
                
                renderCheckersOnPoint(container, pointData, i);
            }
        }

        // Highlight selected point
        if (state.selectedPoint !== null && state.selectedPoint !== 'bar') {
            const selectedElement = document.querySelector(`.point[data-point="${state.selectedPoint}"]`);
            if (selectedElement) {
                selectedElement.classList.add('selected');
            }
        }

        // Highlight valid destinations (points only - bearoff is handled in renderBearoff)
        if (state.selectedPoint !== null) {
            const validMoves = BackgammonGame.getValidMovesFromPoint(state.selectedPoint);
            validMoves.forEach(move => {
                if (move.to !== 'bearoff') {
                    const destElement = document.querySelector(`.point[data-point="${move.to}"]`);
                    if (destElement) {
                        destElement.classList.add('valid-destination');
                    }
                }
            });
        }
    }

    /**
     * Render checkers on a point
     */
    function renderCheckersOnPoint(container, pointData, pointNumber) {
        const maxVisible = 5;
        
        if (pointData.count <= maxVisible) {
            // Show all checkers
            for (let i = 0; i < pointData.count; i++) {
                const checker = createChecker(pointData.player, false);
                container.appendChild(checker);
            }
        } else {
            // Show stacked checkers with count
            for (let i = 0; i < maxVisible - 1; i++) {
                const checker = createChecker(pointData.player, false);
                container.appendChild(checker);
            }
            // Last checker shows count
            const checker = createChecker(pointData.player, true, pointData.count);
            container.appendChild(checker);
        }
    }

    /**
     * Create a checker element
     */
    function createChecker(player, showCount, count) {
        const checker = document.createElement('div');
        checker.className = `checker player${player}`;
        
        if (showCount) {
            checker.classList.add('stacked');
            checker.setAttribute('data-count', count);
        }
        
        return checker;
    }

    /**
     * Render bar
     */
    function renderBar(state) {
        const barContainer = elements.bar.querySelector('.checkers-container');
        barContainer.innerHTML = '';

        // Remove previous highlighting
        elements.bar.classList.remove('valid-destination', 'selected');

        // Render player 1 checkers on bar
        for (let i = 0; i < state.bar.player1; i++) {
            const checker = createChecker(1, false);
            barContainer.appendChild(checker);
        }

        // Render player 2 checkers on bar
        for (let i = 0; i < state.bar.player2; i++) {
            const checker = createChecker(2, false);
            barContainer.appendChild(checker);
        }

        // Highlight if selected
        if (state.selectedPoint === 'bar') {
            elements.bar.classList.add('selected');
        }
    }

    /**
     * Render bearoff areas
     * Reference: Player 1 home (19-24) is at top, Player 2 home (1-6) is at bottom
     * HTML layout has bearoffPlayer2 at top, bearoffPlayer1 at bottom
     * So we swap: Player 1 checkers → bearoffPlayer2 element, Player 2 checkers → bearoffPlayer1 element
     */
    function renderBearoff(state) {
        // Player 1 bearoff (renders in bearoffPlayer2 element which is at top)
        const bearoff1Container = elements.bearoffPlayer2.querySelector('.checkers-container');
        bearoff1Container.innerHTML = '';
        for (let i = 0; i < state.bearoff.player1; i++) {
            const checker = createChecker(1, false);
            bearoff1Container.appendChild(checker);
        }

        // Player 2 bearoff (renders in bearoffPlayer1 element which is at bottom)
        const bearoff2Container = elements.bearoffPlayer1.querySelector('.checkers-container');
        bearoff2Container.innerHTML = '';
        for (let i = 0; i < state.bearoff.player2; i++) {
            const checker = createChecker(2, false);
            bearoff2Container.appendChild(checker);
        }

        // Remove highlighting first
        elements.bearoffPlayer1.classList.remove('valid-destination');
        elements.bearoffPlayer2.classList.remove('valid-destination');

        // Add highlighting if bearoff is a valid destination
        if (state.selectedPoint !== null) {
            const validMoves = BackgammonGame.getValidMovesFromPoint(state.selectedPoint);
            const hasBearoffMove = validMoves.some(move => move.to === 'bearoff');
            if (hasBearoffMove) {
                // Reference: Player 1 uses bearoffPlayer2 element (top), Player 2 uses bearoffPlayer1 element (bottom)
                const bearoffElementId = state.currentPlayer === 1 ? 'bearoffPlayer2' : 'bearoffPlayer1';
                const bearoffElement = document.getElementById(bearoffElementId);
                bearoffElement.classList.add('valid-destination');
            }
        }
    }

    /**
     * Render dice
     * Reference: classList API - https://developer.mozilla.org/en-US/docs/Web/API/Element/classList
     */
    function renderDice(state) {
        // Remove previous player classes
        elements.die1.classList.remove('player1', 'player2');
        elements.die2.classList.remove('player1', 'player2');
        
        // Handle opening roll display (show each player's die)
        if (state.phase === 'OPENING_ROLL' && state.openingRoll.player1 !== null) {
            elements.die1.textContent = state.openingRoll.player1;
            elements.die2.textContent = state.openingRoll.player2;
            elements.die1.classList.remove('empty');
            elements.die2.classList.remove('empty');
            elements.die1.classList.add('player1');
            elements.die2.classList.add('player2');
            elements.remainingMoves.textContent = '';
            return;
        }
        
        if (state.dice.length === 0) {
            elements.die1.textContent = '';
            elements.die2.textContent = '';
            elements.die1.classList.add('empty');
            elements.die2.classList.add('empty');
            elements.remainingMoves.textContent = '';
        } else {
            elements.die1.textContent = state.dice[0];
            elements.die2.textContent = state.dice[1];
            elements.die1.classList.remove('empty');
            elements.die2.classList.remove('empty');
            
            // Add current player class to dice
            const playerClass = `player${state.currentPlayer}`;
            elements.die1.classList.add(playerClass);
            elements.die2.classList.add(playerClass);
            
            // Show remaining moves
            if (state.availableMoves.length > 0) {
                const movesText = state.availableMoves.join(', ');
                elements.remainingMoves.textContent = `Available: ${movesText}`;
            } else {
                elements.remainingMoves.textContent = 'No moves left';
            }
        }
    }

    /**
     * Render controls (enable/disable buttons)
     */
    function renderControls(state) {
        // Roll dice button (enabled for both OPENING_ROLL and ROLL phases, but disabled for Player 2 AI)
        elements.rollDiceBtn.disabled = (state.phase !== 'ROLL' && state.phase !== 'OPENING_ROLL') || 
                                       (state.currentPlayer === 2 && !isAITurnInProgress);

        // Confirm button (enabled only when all moves are exhausted or no valid moves remain, disabled for Player 2 AI)
        const noMovesLeft = state.availableMoves.length === 0;
        const noValidMoves = state.phase === 'MOVE' && state.availableMoves.length > 0 && !hasAnyValidMovesUI();
        elements.confirmBtn.disabled = state.phase !== 'MOVE' || 
                                       (!noMovesLeft && !noValidMoves) || 
                                       state.currentPlayer === 2;

        // Undo button - only enable if there are moves to undo from current player's turn, disabled for Player 2 AI
        const hasMovesToUndo = state.gameHistory.length > 0 && 
            state.moveHistory.length > 0 && 
            state.moveHistory[state.moveHistory.length - 1].player === state.currentPlayer;
        elements.undoBtn.disabled = !hasMovesToUndo || state.phase === 'GAME_OVER' || state.currentPlayer === 2;
    }
    
    /**
     * Check if player has any valid moves (UI helper)
     */
    function hasAnyValidMovesUI() {
        const state = BackgammonGame.getState();
        const player = state.currentPlayer;
        
        // If checkers on bar, must enter first
        if (state.bar[`player${player}`] > 0) {
            const uniqueMoves = [...new Set(state.availableMoves)];
            for (let move of uniqueMoves) {
                const entryPoint = player === 1 ? move : (25 - move);
                const validMoves = BackgammonGame.getValidMovesFromPoint('bar');
                if (validMoves.length > 0) {
                    return true;
                }
            }
            return false;
        }

        // Check all points for valid moves
        for (let point = 1; point <= 24; point++) {
            if (state.board[point].player === player && state.board[point].count > 0) {
                const validMoves = BackgammonGame.getValidMovesFromPoint(point);
                if (validMoves.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Render move history
     */
    function renderHistory(state) {
        elements.historyList.innerHTML = '';
        
        state.moveHistory.forEach((move, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = `history-item player${move.player}-move`;
            historyItem.textContent = `${index + 1}. Player ${move.player}: ${move.notation}`;
            elements.historyList.appendChild(historyItem);
        });

        // Scroll to bottom
        elements.historyList.scrollTop = elements.historyList.scrollHeight;
    }

    /**
     * Render status message
     */
    function renderStatus(state) {
        let message = '';

        if (state.phase === 'GAME_OVER') {
            const winner = state.bearoff.player1 === 15 ? 1 : 2;
            message = `Game Over! Player ${winner} wins! 🎉`;
        } else if (state.phase === 'OPENING_ROLL') {
            if (state.openingRoll.player1 === null) {
                message = 'Roll dice to determine who starts!';
            } else {
                // Message set by handleRollDice
                return;
            }
        } else if (state.phase === 'ROLL') {
            if (state.currentPlayer === 2) {
                message = `Player 2 (AI)'s turn - Rolling dice...`;
            } else {
                message = `Player ${state.currentPlayer}'s turn - Roll dice`;
            }
        } else if (state.phase === 'MOVE') {
            if (state.currentPlayer === 2) {
                if (isAITurnInProgress) {
                    message = `Player 2 (AI) is thinking...`;
                } else if (state.availableMoves.length === 0 || !hasAnyValidMovesUI()) {
                    message = `Player 2 (AI)'s turn - No more moves`;
                } else {
                    message = `Player 2 (AI)'s turn - Making moves...`;
                }
            } else {
                if (state.availableMoves.length === 0 || !hasAnyValidMovesUI()) {
                    message = `Player ${state.currentPlayer}'s turn - No more moves. Click "Confirm"`;
                } else {
                    message = `Player ${state.currentPlayer}'s turn - Make your moves`;
                }
            }
        }

        updateStatus(message);
    }

    /**
     * Update status display
     */
    function updateStatus(message) {
        elements.statusDisplay.textContent = message;
    }

    // Public API
    return {
        init
    };
})();

// Initialize UI when DOM is loaded
// Reference: DOMContentLoaded event - https://developer.mozilla.org/en-US/docs/Web/API/Document/DOMContentLoaded_event
window.addEventListener('DOMContentLoaded', function() {
    BackgammonUI.init();
});

