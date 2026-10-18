import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { AuthScreen } from './components/AuthScreen';
import { JoinScreen } from './components/JoinScreen';
import { Logo } from './components/ui';
import { WorkspaceGate, rememberWorkspace } from './components/WorkspaceGate';
import { AppearanceContext, useAppearance } from './hooks';
import { Toaster } from './toast';

const readJoinToken = () => location.pathname.match(/^\/join\/([\w-]+)\/?$/)?.[1] ?? null;

export default function App() {
  const appearance = useAppearance();
  const [joinToken, setJoinToken] = useState(readJoinToken);
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false, staleTime: Infinity });

  const finishJoin = (workspaceId?: number) => {
    if (workspaceId) rememberWorkspace(workspaceId);
    history.replaceState(null, '', '/');
    setJoinToken(null);
  };

  let screen;
  if (me.isPending) {
    screen = (
      <div className="splash">
        <Logo pulse />
      </div>
    );
  } else if (joinToken) {
    screen = <JoinScreen token={joinToken} me={me.data ?? null} onDone={finishJoin} />;
  } else if (me.data) {
    screen = <WorkspaceGate me={me.data} />;
  } else {
    screen = <AuthScreen />;
  }

  return (
    <AppearanceContext.Provider value={appearance}>
      <div className="aurora" aria-hidden="true" />
      {screen}
      <Toaster />
    </AppearanceContext.Provider>
  );
}
