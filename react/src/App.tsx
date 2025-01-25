import { ConnectButton } from './components/ConnectButton';
import { StatusDisplay } from './components/StatusDisplay';
import { DebugDisplay } from './components/DebugDisplay';
import { TransportProvider } from './providers/TransportContext';
import './App.css';
import { ConnectedParticipants } from './components/ConnectedParticipants';


function AppContent() {
  return (
    <div className="app">
      <div className="status-bar">
        <StatusDisplay />
        <ConnectButton />
        <ConnectedParticipants />
      </div>

      <DebugDisplay />
    </div>
  );
}

function App() {
  return (
    <TransportProvider>
      <AppContent />
    </TransportProvider>
  );
}

export default App;
