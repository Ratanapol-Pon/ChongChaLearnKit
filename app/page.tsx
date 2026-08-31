import { requireChatGPTUser } from './chatgpt-auth';
import StoreApp from './store-app';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <StoreApp displayName={user.displayName} />;
}
