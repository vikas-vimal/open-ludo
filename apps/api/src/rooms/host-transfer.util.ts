export type HostCandidate = {
  userId: string;
  joinedAt: Date;
  isConnected: boolean;
};

export function electNextHost(candidates: HostCandidate[]): string | null {
  const connected = candidates.filter((candidate) => candidate.isConnected);

  if (connected.length === 0) {
    return null;
  }

  connected.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  return connected[0]?.userId ?? null;
}
