import {
  RTVIClientAudio,
} from 'realtime-ai-react';
import { ConnectButton } from './components/ConnectButton';
import { TransportProvider } from './providers/TransportContext';
import './App.css';


function AppContent() {
  return (
    <div className="app">
      <div className="status-bar">
        <ConnectButton />
      </div>

      <RTVIClientAudio />
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
