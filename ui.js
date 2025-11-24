/**
 * Backgammon UI Controller
 * Reference: DOM manipulation - https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model
 */

const BackgammonUI = (function() {
    'use strict';

    let elements = {};

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
            undoBtn: document.getElementById('undoBtn'),
            newGameBtn: document.getElementById('newGameBtn'),
            historyList: document.getElementById('historyList')
        };

        // Attach event listeners
        elements.rollDiceBtn.addEventListener('click', handleRollDice);
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
        }
    }

    /**
     * Handle undo button click
     */
    function handleUndo() {
        const result = BackgammonGame.undoMove();
        
        if (result.success) {
            render();
        }
    }

    /**
     * Handle new game button click
     */
    function handleNewGame() {
        if (confirm('Start a new game? Current game will be lost.')) {
            BackgammonGame.initializeGame();
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
        // If point already selected, try to move or deselect
        else {
            // If clicking the same point, deselect
            if (state.selectedPoint === pointId) {
                BackgammonGame.deselectPoint();
                render();
            }
            // Otherwise, try to move to this point
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

        // Highlight valid destinations
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

            // Highlight bearoff if valid
            // Reference: Player 1 uses bearoffPlayer2 element (top), Player 2 uses bearoffPlayer1 element (bottom)
            const hasBearoffMove = validMoves.some(move => move.to === 'bearoff');
            if (hasBearoffMove) {
                const bearoffElementId = state.currentPlayer === 1 ? 'bearoffPlayer2' : 'bearoffPlayer1';
                const bearoffElement = document.getElementById(bearoffElementId);
                bearoffElement.classList.add('valid-destination');
            }
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

        // Remove highlighting
        elements.bearoffPlayer1.classList.remove('valid-destination');
        elements.bearoffPlayer2.classList.remove('valid-destination');
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
        // Roll dice button (enabled for both OPENING_ROLL and ROLL phases)
        elements.rollDiceBtn.disabled = state.phase !== 'ROLL' && state.phase !== 'OPENING_ROLL';

        // Undo button
        elements.undoBtn.disabled = state.gameHistory.length === 0 || state.phase === 'GAME_OVER';
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
            message = `Player ${state.currentPlayer}'s turn - Roll dice`;
        } else if (state.phase === 'MOVE') {
            message = `Player ${state.currentPlayer}'s turn - Make your moves`;
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

