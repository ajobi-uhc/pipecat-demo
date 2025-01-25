import {RTVIClientAudio, useRTVIClientTransportState} from 'realtime-ai-react';
import { RTVIProvider } from './providers/RTVIProvider';
import { DebugDisplay } from './components/DebugDisplay';
import LandingScreen from './components/LandingScreen';
import './App.css';


function AppContent() {
  const transportState = useRTVIClientTransportState();
  const isConnected = ['connected', 'ready'].includes(transportState);

  return (
    <div className="app">
      {!isConnected ? (
        <LandingScreen />
      ) : (
        <>
          <DebugDisplay />
          <RTVIClientAudio />
        </>
      )}
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
