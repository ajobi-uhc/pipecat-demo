import {ConnectButton} from './components/ConnectButton';
import {TransportProvider, useTransport} from './providers/TransportContext';
import {ConnectedParticipants} from './components/ConnectedParticipants';
import LandingScreen from "./components/LandingScreen.tsx";
import './App.css';


function AppContent() {
    const {aiState} = useTransport();
    const isConnected = ['connected', 'ready'].includes(aiState);
    return (
        <div className="app">
            {!isConnected ? (
                <LandingScreen/>
            ) : (
                <>
                    <ConnectButton/>
                    <ConnectedParticipants/>
                </>
            )}
        </div>
    );
}

function App() {
    return (
        <TransportProvider>
            <AppContent/>
        </TransportProvider>
    );
}

export default App;
