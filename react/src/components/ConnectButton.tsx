import { useTransport } from "../providers/TransportContext";


export function ConnectButton() {
  const { connectToAi, disconnectAi, aiState } = useTransport();
  const isConnected = ['connected', 'ready'].includes(aiState);

  const handleClick = async () => {
    try {
      if (isConnected) {
        await disconnectAi();
      } else {
        await connectToAi();
      }
    } catch (error) {
      console.error('Connection error:', error);
    }
  };

  return (
    <div className="controls">
      <button
        className={isConnected ? 'disconnect-btn' : 'connect-btn'}
        onClick={handleClick}
        disabled={
        ['connecting', 'disconnecting'].includes(aiState)
        }>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
}
