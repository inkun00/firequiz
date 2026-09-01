export function mergeLeaderboardUpdate(previousLeaderboard, leaderboardUpdate) {
  const previousById = new Map(
    (previousLeaderboard || []).map(player => [player.id, player])
  );

  return (leaderboardUpdate || []).map(update => ({
    ...(previousById.get(update.id) || {}),
    ...update
  }));
}
