import { LobbyClient } from '../../../components/lobby-client';

type PageProps = {
  params: {
    code: string;
  };
};

export default function RoomPage({ params }: PageProps): JSX.Element {
  return (
    <main className="stack">
      <LobbyClient roomCode={params.code.toUpperCase()} />
    </main>
  );
}
