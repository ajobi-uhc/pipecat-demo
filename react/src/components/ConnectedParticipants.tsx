import { useEffect, useState } from 'react';
import { Participant, RTVIEvent } from 'realtime-ai';
import { useRTVIClient, useRTVIClientEvent, useRTVIClientTransportState } from 'realtime-ai-react';
import './ConnectedParticipants.css';

interface ConnectedParticipant {
  id: string;
  name: string;
}

export function ConnectedParticipants() {
  const [participants, setParticipants] = useState<ConnectedParticipant[]>([]);
  const client = useRTVIClient();
  const transportState = useRTVIClientTransportState();


  useEffect(() => {
    if (transportState === 'connected') {
      setParticipants(prev => [
        ...prev,
        { id: 'local', name: 'You (Local)', isLocal: true }
      ]);
    } else if (transportState === 'disconnected') {
      setParticipants([]);
    }
  }, [transportState]);

  // Handle participant joined events
  useRTVIClientEvent(
    RTVIEvent.ParticipantConnected,
    (participant: Participant) => {
      console.log("Participant connected:", participant);
      setParticipants(prev => [
        ...prev,
        { id: participant.id, name: participant.name || 'Unknown' }
      ]);
    }
  );

  // Handle participant left events
  useRTVIClientEvent(
    RTVIEvent.ParticipantLeft,
    (participant: Participant) => {
      console.log("Participant left:", participant);
      setParticipants(prev => 
        prev.filter(p => p.id !== participant.id)
      );
    }
  );

  return (
    <div className="participants-container">
      <h3>Connected Participants</h3>
      <div className="participants-grid">
        {participants.map(participant => (
          <div key={participant.id} className="participant-box">
            <span>{participant.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
