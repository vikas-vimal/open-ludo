import { LobbyClient } from '../../../components/lobby-client';

type PageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function RoomPage({ params }: PageProps) {
  const routeParams = await params;
  return (
    <main className="stack">
      <LobbyClient roomCode={routeParams.code.toUpperCase()} />
    </main>
  );
}
