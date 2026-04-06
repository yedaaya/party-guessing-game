function calculateRoundScore(correctCount, totalPlayers, timeRemainingMs, timerEnabled, timerDurationMs) {
  const matchableCount = totalPlayers - 1; // can't match yourself
  const basePoints = correctCount * 100;

  let accuracyBonus = 0;
  if (matchableCount > 0) {
    const accuracy = correctCount / matchableCount;
    if (accuracy >= 1.0) {
      accuracyBonus = 100;
    } else if (accuracy >= 0.75) {
      accuracyBonus = 50;
    } else if (accuracy >= 0.5) {
      accuracyBonus = 25;
    }
  }

  let speedBonus = 0;
  if (timerEnabled && timerDurationMs > 0 && correctCount > 0) {
    const timeRatio = Math.max(0, timeRemainingMs / timerDurationMs);
    speedBonus = Math.round(correctCount * 50 * timeRatio);
  }

  return {
    basePoints,
    accuracyBonus,
    speedBonus,
    totalPoints: basePoints + accuracyBonus + speedBonus,
    correctCount,
    matchableCount
  };
}

module.exports = { calculateRoundScore };
