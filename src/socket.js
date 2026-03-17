import { io as socketIO } from 'socket.io-client';

const URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

export const socket = socketIO(URL, { autoConnect: true });
