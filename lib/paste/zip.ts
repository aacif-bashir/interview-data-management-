/** Zipping split questions/answers into preview rows for reconciliation. */

export interface PreviewRow {
  index: number;
  question: string | null;
  answer: string | null;
}

/** Pair questions[i] with answers[i]; missing side is null. */
export function zipRows(
  questions: string[],
  answers: string[]
): PreviewRow[] {
  const len = Math.max(questions.length, answers.length);
  const rows: PreviewRow[] = [];
  for (let i = 0; i < len; i++) {
    rows.push({
      index: i,
      question: questions[i] ?? null,
      answer: answers[i] ?? null,
    });
  }
  return rows;
}

export function countMismatch(
  questions: string[],
  answers: string[]
): boolean {
  return questions.length !== answers.length;
}

/** Are all rows fully matched (no null cell)? */
export function allRowsMatched(rows: PreviewRow[]): boolean {
  return rows.every((r) => r.question !== null && r.answer !== null);
}
