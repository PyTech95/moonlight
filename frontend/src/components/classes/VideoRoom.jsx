import { useState } from 'react';
import { MonitorPlay, PhoneOff, VideoOff } from 'lucide-react';
import { api, errorText } from '../../lib/api';

export const VideoRoom = ({ klass, connected }) => {
  const [room, setRoom] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.post(`/classes/${klass.id}/video/join`); setRoom(data); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  if (room) return (
    <div className="cl-video" data-testid={`video-room-${klass.id}`}>
      <iframe title={`${klass.title} video room`} src={`${room.room_url}?t=${room.token}`} allow="camera; microphone; fullscreen; display-capture; autoplay" />
      <button className="button outlined" onClick={() => setRoom(null)} data-testid={`video-leave-${klass.id}`}><PhoneOff size={15} /> Leave video room</button>
    </div>
  );
  return (
    <div className="cl-video-cta">
      {!connected && <p className="cl-not-connected" data-testid="video-not-connected"><VideoOff size={15} /> In-app video calling is not connected yet.</p>}
      <button className="button primary" disabled={busy} onClick={join} data-testid={`video-join-${klass.id}`}><MonitorPlay size={16} /> {busy ? 'Opening room…' : 'Join video class'}</button>
      {error && <p className="cl-error" role="alert" data-testid={`video-error-${klass.id}`}>{error}</p>}
    </div>
  );
};
