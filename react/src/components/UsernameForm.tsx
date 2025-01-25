import { useRTVIClient, useRTVIClientTransportState } from 'realtime-ai-react';
import { useState } from 'react';
import { RTVIMessage } from 'realtime-ai';

export function UsernameForm() {
  const [username, setUsername] = useState('');
  const client = useRTVIClient();
  const transportState = useRTVIClientTransportState();
  const isConnected = ['connected', 'ready'].includes(transportState);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !isConnected || !username.trim()) return;

    try {
      client.sendMessage(new RTVIMessage("set_username", { username: username.trim() }));
      console.log('Username sent:', username);
    } catch (error) {
      console.error('Error sending username:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="username-form">
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Enter username"
        disabled={!isConnected}
      />
      <button type="submit" disabled={!isConnected || !username.trim()}>
        Set Username
      </button>
    </form>
  );
}