import { AnimatePresence } from 'framer-motion';
import { Suspense, lazy, useEffect } from 'react';
import { audio } from './audio/engine';
import { Embers } from './components/fx/Embers';
import { SettingsModal } from './components/modals/InfoModals';
import { GameScreen } from './components/screens/GameScreen';
import { NewGameScreen } from './components/screens/NewGameScreen';
import { TitleScreen } from './components/screens/TitleScreen';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { liteEffects, prefersReducedMotion, useStore } from './state/store';

const RulebookModal = lazy(() => import('./components/modals/RulebookModal'));
const ArtBoard = lazy(() => import('./components/screens/ArtBoard'));

export function App() {
  const screen = useStore((s) => s.screen);
  const modal = useStore((s) => s.modal);
  const announce = useStore((s) => s.announce);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const lite = useStore((s) => liteEffects(s.settings));

  // Audio may only start after a user gesture (autoplay policy).
  useEffect(() => {
    const start = () => audio.unlock();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, []);

  if (import.meta.env.DEV && typeof location !== 'undefined' && location.hash.startsWith('#artboard')) {
    return (
      <Suspense fallback={null}>
        <ArtBoard />
      </Suspense>
    );
  }

  return (
    <div className={`relative min-h-screen ${reduce ? 'reduce-motion' : ''}`}>
      <div className="vignette" aria-hidden />
      <Embers disabled={reduce || lite} count={screen === 'game' ? 28 : 40} />
      <div className="relative z-10 min-h-screen">
        <ErrorBoundary onReset={() => useStore.getState().go('title')}>
          {screen === 'title' && <TitleScreen />}
          {screen === 'setup' && <NewGameScreen />}
          {screen === 'game' && <GameScreen />}
        </ErrorBoundary>
      </div>
      <AnimatePresence>
        {modal === 'settings' && <SettingsModal key="settings" />}
      </AnimatePresence>
      {modal === 'rules' && (
        <Suspense fallback={null}>
          <RulebookModal />
        </Suspense>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
}
