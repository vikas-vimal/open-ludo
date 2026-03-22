import { InviteClient } from '../../../components/invite-client';

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitePage({ params }: PageProps) {
  const routeParams = await params;
  return (
    <main className="stack">
      <InviteClient token={routeParams.token} />
    </main>
  );
}
