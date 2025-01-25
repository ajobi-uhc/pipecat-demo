import { useRTVIClient, useRTVIClientTransportState } from 'realtime-ai-react';
// Vite's asset handling imports
import landingImage from '../../media/landingpage.png';

const LandingScreen = () => {
  const client = useRTVIClient();
  const transportState = useRTVIClientTransportState();
  const isConnected = ['connected', 'ready'].includes(transportState);

  const handleClick = async () => {
    if (!client) {
      console.error('RTVI client is not initialized');
      return;
    }

    try {
      if (isConnected) {
        await client.disconnect();
      } else {
        await client.connect();
      }
    } catch (error) {
      console.error('Connection error:', error);
    }
  };

  return (
    <div className="landing-container">
      <div className="logo">
        <img src={landingImage} alt="RIZZTRAL" className="logo-image" />
      </div>
      <button
        onClick={handleClick}
        disabled={!client || ['connecting', 'disconnecting'].includes(transportState)}
        className="connect-button"
      >
        {isConnected ? 'DISCONNECT' : 'START'}
      </button>
    </div>
  );
};

export default LandingScreen;
