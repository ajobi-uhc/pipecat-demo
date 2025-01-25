import './ConnectedParticipants.css';
import { useTransport } from '../providers/TransportContext';

export function ConnectedParticipants() {
  const {participants} = useTransport();

  console.log("transportParticipants", participants);
  // If there is at least one participant also add You (Local)
  const participantsWithLocal = participants.length > 0 ? [...participants, {id: "local", username: "You (Local)"}] : [{id: "unknown", username: "Waiting for participants..."}];
  

  return (
    <div className="participants-container">
      <h3>Connected Participants</h3>
      <div className="participants-grid">
        {participantsWithLocal.map(participant => (
          <div key={participant.id} className="participant-box">
            <span>{participant.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
}