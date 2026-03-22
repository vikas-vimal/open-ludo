import { InviteClient } from '../../../components/invite-client';

type PageProps = {
  params: {
    token: string;
  };
};

export default function InvitePage({ params }: PageProps): JSX.Element {
  return (
    <main className="stack">
      <InviteClient token={params.token} />
    </main>
  );
}
