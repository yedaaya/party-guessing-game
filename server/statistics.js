function calculateStatistics(players, roundResults, questions) {
  const stats = {};
  const playerIds = Object.keys(players);

  // Per-player: how often they were guessed correctly
  const guessedCorrectly = {};   // targetId -> count of times guessed right
  const guessedTotal = {};       // targetId -> total guesses against them
  const correctGuesses = {};     // guesserId -> total correct guesses made
  const pairCorrect = {};        // "id1|id2" -> count

  playerIds.forEach(id => {
    guessedCorrectly[id] = 0;
    guessedTotal[id] = 0;
    correctGuesses[id] = 0;
  });

  // Per-question: how many people got it wrong (for "surprise of the night")
  const questionFoolCount = {};  // questionId -> { answerId, fooledCount }

  roundResults.forEach((round) => {
    const questionId = round.questionId;
    const answerFooled = {};

    Object.entries(round.guesses).forEach(([guesserId, matches]) => {
      Object.entries(matches).forEach(([answerId, guessedPlayerId]) => {
        const actualPlayerId = round.answerOwners[answerId];
        if (!actualPlayerId) return;

        guessedTotal[actualPlayerId] = (guessedTotal[actualPlayerId] || 0) + 1;

        if (guessedPlayerId === actualPlayerId) {
          guessedCorrectly[actualPlayerId] = (guessedCorrectly[actualPlayerId] || 0) + 1;
          correctGuesses[guesserId] = (correctGuesses[guesserId] || 0) + 1;

          // Track pair accuracy
          const pairKey = [guesserId, actualPlayerId].sort().join('|');
          pairCorrect[pairKey] = (pairCorrect[pairKey] || 0) + 1;
        } else {
          answerFooled[answerId] = (answerFooled[answerId] || 0) + 1;
        }
      });
    });

    Object.entries(answerFooled).forEach(([answerId, count]) => {
      if (!questionFoolCount[questionId] || count > questionFoolCount[questionId].fooledCount) {
        questionFoolCount[questionId] = {
          answerId,
          playerId: round.answerOwners[answerId],
          fooledCount: count,
          answerText: round.answers[answerId]?.text || ''
        };
      }
    });
  });

  // Mind Reader - most correct guesses
  let mindReader = null;
  let maxCorrect = 0;
  Object.entries(correctGuesses).forEach(([id, count]) => {
    if (count > maxCorrect) {
      maxCorrect = count;
      mindReader = id;
    }
  });
  stats.mindReader = mindReader ? {
    playerId: mindReader,
    name: players[mindReader]?.name,
    correctCount: maxCorrect
  } : null;

  // Mystery Person - hardest to guess (lowest correct %)
  let mysteryPerson = null;
  let lowestPct = Infinity;
  // Open Book - easiest to guess (highest correct %)
  let openBook = null;
  let highestPct = -1;

  playerIds.forEach(id => {
    const total = guessedTotal[id] || 0;
    if (total === 0) return;
    const pct = guessedCorrectly[id] / total;
    if (pct < lowestPct) {
      lowestPct = pct;
      mysteryPerson = id;
    }
    if (pct > highestPct) {
      highestPct = pct;
      openBook = id;
    }
  });

  stats.mysteryPerson = mysteryPerson ? {
    playerId: mysteryPerson,
    name: players[mysteryPerson]?.name,
    percentage: Math.round(lowestPct * 100)
  } : null;

  stats.openBook = openBook ? {
    playerId: openBook,
    name: players[openBook]?.name,
    percentage: Math.round(highestPct * 100)
  } : null;

  // Soulmates - pair that guessed each other most
  let soulmates = null;
  let maxPairScore = 0;
  Object.entries(pairCorrect).forEach(([key, count]) => {
    if (count > maxPairScore) {
      maxPairScore = count;
      const [id1, id2] = key.split('|');
      soulmates = { player1: id1, player2: id2, count };
    }
  });
  stats.soulmates = soulmates ? {
    player1: { id: soulmates.player1, name: players[soulmates.player1]?.name },
    player2: { id: soulmates.player2, name: players[soulmates.player2]?.name },
    count: soulmates.count
  } : null;

  // Surprise of the Night - single answer that fooled the most
  let surprise = null;
  let maxFooled = 0;
  Object.values(questionFoolCount).forEach(entry => {
    if (entry.fooledCount > maxFooled) {
      maxFooled = entry.fooledCount;
      surprise = entry;
    }
  });
  stats.surpriseOfTheNight = surprise ? {
    playerId: surprise.playerId,
    name: players[surprise.playerId]?.name,
    answerText: surprise.answerText,
    fooledCount: surprise.fooledCount
  } : null;

  // Per-player accuracy card
  stats.playerCards = {};
  playerIds.forEach(id => {
    const total = guessedTotal[id] || 0;
    const correct = guessedCorrectly[id] || 0;
    stats.playerCards[id] = {
      name: players[id]?.name,
      guessedCorrectPct: total > 0 ? Math.round((correct / total) * 100) : 0,
      totalCorrectGuesses: correctGuesses[id] || 0
    };
  });

  return stats;
}

function calculateRoundMicroStats(roundResult, players) {
  const { guesses, answerOwners } = roundResult;
  const correctPerTarget = {};
  const totalPerTarget = {};

  Object.values(answerOwners).forEach(pid => {
    correctPerTarget[pid] = 0;
    totalPerTarget[pid] = 0;
  });

  Object.entries(guesses).forEach(([guesserId, matches]) => {
    Object.entries(matches).forEach(([answerId, guessedPlayerId]) => {
      const actualPlayerId = answerOwners[answerId];
      if (!actualPlayerId) return;
      totalPerTarget[actualPlayerId] = (totalPerTarget[actualPlayerId] || 0) + 1;
      if (guessedPlayerId === actualPlayerId) {
        correctPerTarget[actualPlayerId] = (correctPerTarget[actualPlayerId] || 0) + 1;
      }
    });
  });

  let openBookId = null, maxPct = -1;
  let enigmaId = null, minPct = Infinity;

  Object.entries(totalPerTarget).forEach(([pid, total]) => {
    if (total === 0) return;
    const pct = correctPerTarget[pid] / total;
    if (pct > maxPct) { maxPct = pct; openBookId = pid; }
    if (pct < minPct) { minPct = pct; enigmaId = pid; }
  });

  return {
    openBook: openBookId ? { playerId: openBookId, name: players[openBookId]?.name, pct: Math.round(maxPct * 100) } : null,
    enigma: enigmaId ? { playerId: enigmaId, name: players[enigmaId]?.name, pct: Math.round(minPct * 100) } : null
  };
}

module.exports = { calculateStatistics, calculateRoundMicroStats };
