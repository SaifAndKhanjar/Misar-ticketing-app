import { io as socketIO } from 'socket.io-client';
import { useState, useEffect } from 'react';

const URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

export const socket = socketIO(URL, { autoConnect: true });

/** Connection status: 'connected' | 'connecting' | 'disconnected' */
export function useSocketStatus() {
  const [status, setStatus] = useState(socket.connected ? 'connected' : 'disconnected');

  useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onConnectError = () => setStatus('disconnected');

    if (socket.connected) setStatus('connected');
    else if (socket.connecting) setStatus('connecting');
    else setStatus('disconnected');

    socket.io.on('reconnect_attempt', () => setStatus('connecting'));
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.io.off('reconnect_attempt');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  return status;
}
