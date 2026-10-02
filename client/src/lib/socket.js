import { io } from 'socket.io-client';

let socket;
export function connectSocket() {
  if (socket) return socket;
  socket = io('/', { withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
  return socket;
}
export const getSocket = () => socket || connectSocket();
export function disconnectSocket() { socket?.disconnect(); socket = undefined; }
export function reconnectSocket() { disconnectSocket(); return connectSocket(); }
