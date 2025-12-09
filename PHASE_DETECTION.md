# Backgammon AI Phase Detection System

## Overview
The AI now detects five distinct game phases and adjusts strategy accordingly. This enhances decision-making by focusing on the most appropriate tactics for each phase.

## Phases

### 1. **BLITZ** (Aggressive Attacking)
**Definition**: An aggressive assault on opponent checkers with the aim of hitting blots and rapidly making points to close them out completely.

**Characteristics**:
- AI has hit opponent checkers (some on bar)
- AI is building points quickly in home board
- Own blots are minimal and well-protected
- Goal: Close out opponent completely or gain decisive material advantage

**AI Behavior**:
- **High bar weight (250)**: Reward hitting opponent
- **High blot weight (35)**: Maintain opponent vulnerability
- **High prime weight (25)**: Build points to trap opponent
- **Focus**: Turn hitting opportunities into concrete point-making
- **Bonus**: +5,000 per hit in sequence, +3,000 per new home board point

**Historical Context**: Blitzing is considered a risky but rewarding strategy. Success often leads to gammon wins. Must maintain strong home board to support the attack.

---

### 2. **PRIMING** (Prime Building & Blocking)
**Definition**: Building a series of consecutive made points (2+ checkers per point) to create an impenetrable barrier and block opponent movement.

**Characteristics**:
- Both players have 3+ consecutive made points
- Both building and maintaining prime walls
- Strategic focus on long-term control
- Ideal goal: Construct a 6-prime (unstoppable)

**AI Behavior**:
- **Highest prime weight (40)**: Prime-building is king
- **High anchor weight (25)**: Anchors support prime control
- **Lower blot weight (10)**: Safety secondary to prime expansion
- **Focus**: Build longer primes, trap opponent checkers behind barriers
- **Bonus**: +5,000 per point of prime extension, +10,000 for reaching 6-prime

**Historical Context**: Priming is considered the most powerful long-term strategy. The key principle is: **whoever maintains their prime longest wins**. A 6-prime is completely unbreakable.

---

### 3. **RACE** (Pure Pip Count)
**Definition**: Both players' all checkers are in home board; the game becomes a simple race to bear off first.

**Characteristics**:
- Both players have all checkers in home board
- No hitting possible
- Victory determined by pip count (distance to bear off)

**AI Behavior**:
- **Highest bearoff weight (100)**: Bearing off is priority
- **High bar weight (200)**: Minimizing opponent's bearoff
- **Moderate pip weight (0.5)**: Focus on raw numbers
- **Low prime/anchor weights**: Not relevant in race
- **Focus**: Optimize checker placement for maximum bearoff efficiency

---

### 4. **BACKGAME** (Playing from Behind)
**Definition**: One player is significantly behind in pip count but maintains strategic anchors to hit the opponent late in the game.

**Characteristics**:
- Pip count difference > 30 points
- Trailing player holds 2+ anchors in opponent's home
- Focus on defensive positioning and timing

**AI Behavior**:
- **High anchor weight (20)**: Anchors are defensive key
- **High prime weight (15)**: Build barriers with limited material
- **High blot weight (15)**: Create hitting opportunities
- **Lower pip weight (0.2)**: Don't sacrifice position for pip gain
- **Focus**: Maintain strategic positions, wait for opponent mistakes

---

### 5. **CONTACT** (Mid-Game Balanced)
**Definition**: Normal mid-game play with balanced attacking and defensive opportunities.

**Characteristics**:
- Neither player clearly ahead
- Both have hitting opportunities
- Still moving checkers out of home
- Mix of offensive and defensive play

**AI Behavior**:
- **Balanced weights**: All factors considered equally
- **Moderate all weights**: No single strategy dominates
- **Focus**: Flexibility and adaptation to dice rolls

---

## Phase Detection Algorithm

```javascript
detectGamePhase(gameState) {
  1. Check if both players bearing off → RACE
  2. Check if pip difference > 30 → BACKGAME
  3. Check if both have 3+ consecutive points → PRIMING
  4. Check if AI is actively hitting with defensive structure → BLITZ
  5. Default → CONTACT
}
```

## Strategy Examples

### Blitz Example
```
AI rolls good hitting numbers → Hits opponent blot
Opponent hit → Stuck on bar
AI makes points 1-4 → Closing home board
AI closes all 6 points → Opponent locked out
Opponent cannot re-enter → Automatic win
```

### Priming Example
```
AI makes points 6 and 8 → Creates 2-prime
Opponent tries to escape → Blocked
AI builds points 5, 7 → Extends to 3-prime, then 4-prime
Eventually → 6-prime (unbeatable)
Result → Opponent trapped, AI bears off freely
```

## AI Weights Summary

| Factor | Blitz | Priming | Race | Backgame | Contact |
|--------|-------|---------|------|----------|---------|
| Pip Count | 0.1 | 0.2 | 0.5 | 0.2 | 0.3 |
| Bearoff | 40 | 30 | 100 | 50 | 60 |
| Bar (Opponent) | 250 | 100 | 200 | 150 | 120 |
| Blot Safety | 35 | 10 | 10 | 15 | 20 |
| Prime Building | 25 | 40 | 2 | 15 | 12 |
| Anchor Control | 10 | 25 | 1 | 20 | 15 |

---

## References
- **Blitz**: A high-risk, high-reward strategy requiring strong material advantage and excellent timing
- **Priming**: The most strategic phase; success depends on maintaining prime length and forcing opponent to break first
- **Five Basic Strategies**: Backgammon theory recognizes 5 core strategies (Race, Running, Holding, Priming, Back Game)
