import { SwipeNavigation } from './components/ui/SwipeNavigation';
import { ProjectsPage } from './pages/ProjectsPage';
import { HomePage } from './pages/HomePage';
import { ProgressPage } from './pages/ProgressPage';

export function App() {
  return (
    <SwipeNavigation
      pages={[
        <ProjectsPage />,
        <HomePage />,
        <ProgressPage />,
      ]}
      pageLabels={['Projects', 'Home', 'Progress']}
      initialPage={1}
    />
  );
}
