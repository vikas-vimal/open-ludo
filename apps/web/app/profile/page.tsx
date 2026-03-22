import Link from 'next/link';
import { ProfileClient } from '../../components/profile-client';

export default function ProfilePage(): JSX.Element {
  return (
    <main className="stack">
      <section className="panel stack">
        <h1 style={{ fontSize: '2rem' }}>Your Profile</h1>
        <Link href="/">Back to Home</Link>
      </section>
      <ProfileClient />
    </main>
  );
}
