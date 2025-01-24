import {
  RTVIClientAudio,
  useRTVIClientTransportState,
} from 'realtime-ai-react';
import { RTVIProvider } from './providers/RTVIProvider';
import { ConnectButton } from './components/ConnectButton';
import { StatusDisplay } from './components/StatusDisplay';
import { DebugDisplay } from './components/DebugDisplay';
import './App.css';


function AppContent() {
  return (
    <div className="app">
      <div className="status-bar">
        <StatusDisplay />
        <ConnectButton />
      </div>

      <DebugDisplay />
      <RTVIClientAudio />
    </div>
  );
}

function App() {
  return (
    <RTVIProvider>
      <AppContent />
    </RTVIProvider>
  );
}

export default App;
