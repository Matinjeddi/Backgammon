# Backgammon Game

A vanilla JavaScript implementation of the classic Backgammon board game for two players on the same computer.

## Features

- **Standard International Rules**: Full implementation of official backgammon rules
- **Two-Player Local Play**: Players alternate turns on the same computer
- **Dice Rolling**: Random dice generation with support for doubles (4 moves)
- **Move Validation**: Automatic validation of legal moves based on game state
- **Visual Feedback**: Highlighted valid moves and selected checkers
- **Hit and Bar Mechanics**: Checkers can be hit and must re-enter from the bar
- **Bearing Off**: Proper implementation of bearing off rules
- **Undo Functionality**: Undo moves within the current turn
- **Move History**: Complete history of all moves made in the game
- **Responsive Design**: Works on various screen sizes

## How to Play

### Starting the Game

1. Open `index.html` in a web browser
2. The game starts with the standard backgammon setup
3. Player 1 (white checkers) goes first

### Game Rules

#### Objective
- Move all 15 of your checkers into your home board and then bear them off
- Player 1 moves from point 24 to point 1
- Player 2 moves from point 1 to point 24

#### Taking a Turn

1. **Roll Dice**: Click "Roll Dice" to roll two six-sided dice
2. **Move Checkers**: 
   - Click on a checker to select it (valid moves will be highlighted in green)
   - Click on a highlighted destination to move the checker
   - Each die represents a separate move
   - If you roll doubles, you get 4 moves of that value

#### Movement Rules

- **Blocked Points**: You cannot move to a point occupied by 2 or more opponent checkers
- **Hitting**: Landing on a point with exactly 1 opponent checker sends it to the bar
- **Bar Re-entry**: If you have checkers on the bar, you must re-enter them before making other moves
  - Player 1 enters on points 1-6
  - Player 2 enters on points 19-24
- **Bearing Off**: Once all your checkers are in your home board, you can bear them off
  - Player 1 home board: points 1-6
  - Player 2 home board: points 19-24
  - You need the exact die value or higher to bear off a checker
  - With higher values, you can only bear off from the furthest point

#### Winning

- The first player to bear off all 15 checkers wins the game

### Controls

- **Roll Dice**: Roll the dice to start your turn
- **Undo Move**: Undo the last move made in the current turn
- **New Game**: Start a new game (current game will be lost)

### Visual Guide

- **White Checkers**: Player 1
- **Dark Brown Checkers**: Player 2
- **Green Highlight**: Valid destination for selected checker
- **Yellow Glow**: Currently selected checker
- **Bar (center)**: Holds hit checkers
- **Off Areas**: Displays borne-off checkers

## Technical Details

### Architecture

The application follows separation of concerns:

- **index.html**: Board structure and UI elements
- **styles.css**: Visual styling using Flexbox layouts
- **game.js**: Core game logic and state management (pure functions)
- **ui.js**: DOM manipulation and event handling

### Browser Compatibility

Works in all modern browsers that support:
- ES6 JavaScript
- CSS Flexbox
- DOM Level 2 Events

Reference: Standard web APIs from [MDN Web Docs](https://developer.mozilla.org/en-US/)

## Implementation Notes

### Starting Position

Following standard international backgammon rules:

**Player 1 (White)**:
- 2 checkers on point 1
- 5 checkers on point 12
- 3 checkers on point 17
- 5 checkers on point 19

**Player 2 (Brown)**:
- 2 checkers on point 24
- 5 checkers on point 13
- 3 checkers on point 8
- 5 checkers on point 6

### Move Validation

The game enforces all standard backgammon rules:
- Bar checkers must be entered first
- Cannot move to blocked points (2+ opponent checkers)
- Must use all available moves if possible
- Bearing off only when all checkers in home board
- Proper handling of doubles (4 moves)

### State Management

Game state is managed in a single object with immutability principles:
- Board positions (24 points)
- Bar state (hit checkers)
- Bearoff counts
- Current player
- Available dice moves
- Move history for undo

## Running Locally

### Option 1: Direct File Opening
Simply open `index.html` in your web browser

### Option 2: Local Server (Recommended)
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server package)
npx http-server

# Using PHP
php -S localhost:8000
```

Then navigate to `http://localhost:8000` in your browser.

## Development

All code follows:
- Standard JavaScript practices (ES6+)
- MDN Web Docs API references
- Separation of concerns architecture
- Event delegation for performance
- Pure functions for game logic

## License

This is a learning/demonstration project implementing the traditional game of Backgammon.

