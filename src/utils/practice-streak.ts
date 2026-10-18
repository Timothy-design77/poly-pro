/** Yesterday's streak remains active until the user has had today to practice. */
export function getPracticeStreak(dates: string[], now = new Date()): number {
  const days = new Set(dates.map((date) => new Date(date).toDateString()));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(cursor.toDateString())) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
