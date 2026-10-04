/** Arena tournaments as the API lists them. */
export interface Tournament {
  id: string;
  name: string;
  timeControl: string;
  rated: boolean;
  startsAt: string;
  endsAt: string;
  players: number;
}

export type Phase = 'upcoming' | 'running' | 'finished';

export function phaseOf(
  { startsAt, endsAt }: Pick<Tournament, 'startsAt' | 'endsAt'>,
  now: number,
): Phase {
  if (now < Date.parse(startsAt)) return 'upcoming';
  return now < Date.parse(endsAt) ? 'running' : 'finished';
}

/** "2 h 5 min", "12 min", "40 s": the time until `iso`. */
export function countdown(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.round(hours / 24)} days`;
}

/** When a tournament starts or ends, relative to now. */
export function timing(tournament: Tournament, now: number): string {
  const phase = phaseOf(tournament, now);
  if (phase === 'upcoming') return `Starts in ${countdown(tournament.startsAt, now)}`;
  if (phase === 'running') return `Running · ends in ${countdown(tournament.endsAt, now)}`;
  return `Finished ${new Date(tournament.endsAt).toLocaleDateString()}`;
}
