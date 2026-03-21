import { HomeClient } from '../components/home-client';

export default function HomePage(): JSX.Element {
  return (
    <main className="stack">
      <section className="panel stack">
        <h1 style={{ fontSize: '2rem' }}>Open Ludo</h1>
        <p>Instant room links, QR joining, and live lobby sync for 2-4 players.</p>
      </section>
      <HomeClient />
    </main>
  );
}
