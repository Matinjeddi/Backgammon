# Backgammon AI - Agent Instructions

## Project Overview
This is a backgammon game implementation with AI decision-making. The project uses vanilla JavaScript with no external dependencies (except Bootstrap for styling).

## Core Architecture

### Files
- **ai.js** - AI move evaluation and decision engine
- **game.js** - Game state management and rules enforcement
- **ui.js** - User interface and event handling
- **index.html** - HTML structure
- **styles.css** - Styling

### Key Concepts
- **Board State** - 24 points (0-23), each with player and checker count
- **Phases** - Opening, Midgame, Endgame (determined by checker position analysis)
- **Move Validation** - Legal moves based on dice rolls and board layout

## Code Style & Conventions

### Naming Conventions
- **Constants** - `UPPER_SNAKE_CASE` (e.g., `MAX_CHECKERS`)
- **Functions** - `camelCase` (e.g., `evaluatePosition`)
- **Variables** - `camelCase` (e.g., `currentScore`)
- **Objects/Classes** - `PascalCase` (e.g., `GameState`)
- **Private methods** - prefix with underscore `_privateMethod`

### Code Organization
- Logical grouping of related functions
- Clear separation of concerns (AI logic, UI, game rules)
- Comment blocks for complex sections
- One function per responsibility

### Documentation
- JSDoc comments for public functions
- Inline comments for non-obvious logic
- README files in markdown for high-level concepts

## AI System

### Decision Making
The AI evaluates moves using weighted heuristics:
- **Piece Safety** - Avoid leaving pieces vulnerable
- **Board Control** - Occupy key positions
- **Bearing Off** - Accelerate endgame progression
- **Blocking** - Create barriers against opponent

### Move Evaluation
```javascript
evaluatePosition(board, player) {
  // Returns numeric score (higher = better for player)
  // Considers multiple game phases with different weights
}
```

### Game Phases
1. **Opening** - Establish positions, minimal bearing off
2. **Midgame** - Build pip lead, tactical blocking
3. **Endgame** - Bearing off checkers, avoid giving doubles

See PHASE_DETECTION.md for phase detection logic.

## Game Rules Implementation

### Board Layout
- 24 points numbered 0-23
- Players move in opposite directions
- Points contain {player, count} objects
- Bar positions for captured checkers

### Move Validation
- Dice determines legal moves
- Cannot place pieces on opponent's blots (unless capturing)
- Blot (single checker) can be captured
- Bearing off requires all checkers in home board

## Testing

Run test suite:
```bash
npm test
```

Test files follow naming: `*.test.js`

Key test areas:
- Move legality validation
- AI heuristic scoring
- Game state transitions
- Phase detection accuracy

See TESTING.md for detailed test documentation.

## Common Commands

### Development
```bash
# Start local server
python -m http.server 8000

# View game in browser
http://localhost:8000
```

### Debugging
- Open browser DevTools (F12)
- Check console for game state logs
- Use `debugBoard()` to visualize current state

## Workflow for Changes

### Adding New Heuristics
1. Add calculation in `ai.js` evaluation function
2. Document reasoning in code comments
3. Add unit tests for new heuristic
4. Verify phase-specific weights are appropriate
5. Test against benchmark positions

### Modifying Game Rules
1. Update rule in `game.js` validation
2. Add corresponding test cases
3. Verify AI still makes legal moves
4. Test endgame scenarios

### UI Changes
1. Modify templates in `ui.js` and `index.html`
2. Add CSS rules to `styles.css`
3. Test responsive layout
4. Verify accessibility

## Performance Considerations

- AI evaluation must complete in <500ms for 6 dice permutations
- Avoid deep recursion in move generation
- Cache board state hashes when beneficial
- Profile before optimizing

## Known Limitations & TODO

See README.md for current known issues and future improvements.

## References
- OPENING_MOVES.md - Opening strategy analysis
- PHASE_DETECTION.md - Game phase classification
- TESTING.md - Test documentation
