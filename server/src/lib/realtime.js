import { Server } from 'socket.io';
import cookie from 'cookie';
import { config } from '../config.js';
import { userFromToken } from '../middleware/auth.js';
import { MODULES, hasPerm, isSuper, viewableModules, ENTITY_MODULE } from './permissions.js';

let io;
const presence = new Map(); // room -> Map(socketId -> {id,name})

export const getIO = () => io;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || '');
      const token = cookies[config.cookieName] || socket.handshake.auth?.token;
      const user = await userFromToken(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch (e) { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user._id}`);
    for (const m of viewableModules(user)) socket.join(`module:${m}`);
    if (isSuper(user)) socket.join('module:admins');

    // Presence — "who else is looking at / editing this right now"
    socket.on('presence:join', ({ room } = {}) => {
      if (typeof room !== 'string' || room.length > 80) return;
      const mod = room.startsWith('assessment:') ? 'assessments' : room;
      if (!(MODULES[mod] || mod === 'admins') || (mod === 'admins' ? !isSuper(user) : !hasPerm(user, `${mod}:view`))) return;
      socket.join(`presence:${room}`);
      if (mod === 'assessments' && room.startsWith('assessment:')) socket.join(room);
      if (!presence.has(room)) presence.set(room, new Map());
      presence.get(room).set(socket.id, { id: String(user._id), name: user.name });
      broadcastPresence(room);
    });
    socket.on('presence:leave', ({ room } = {}) => leave(socket, room));
    socket.on('disconnect', () => { for (const room of [...presence.keys()]) leave(socket, room); });
  });
  return io;
}

function leave(socket, room) {
  const m = presence.get(room);
  if (!m || !m.delete(socket.id)) return;
  socket.leave(`presence:${room}`);
  if (m.size === 0) presence.delete(room);
  broadcastPresence(room);
}

function broadcastPresence(room) {
  const m = presence.get(room);
  const users = m ? [...new Map([...m.values()].map((u) => [u.id, u])).values()] : [];
  io.to(`presence:${room}`).emit('presence:update', { room, users });
}

// Every create / update / delete goes through here → everyone with `<module>:view` sees it instantly.
export function emitChange({ entity, action, doc, id, actor, changes = [], module }) {
  if (!io) return;
  const mod = module || ENTITY_MODULE[entity] || entity;
  io.to(`module:${mod}`).emit('entity:change', {
    entity, action, id: String(id ?? doc?._id), doc: doc ?? null, changes, actor, at: new Date().toISOString(),
  });
}
// Bulk operations (Excel import) tell every viewer to reload the list instead of sending thousands of single events.
export function emitReload({ module, entity }) { io?.to(`module:${module}`).emit('entity:reload', { entity, at: new Date().toISOString() }); }
export const emitToUser = (userId, event, payload = {}) => io?.to(`user:${userId}`).emit(event, payload);
export const emitToRoom = (room, event, payload) => io?.to(room).emit(event, payload);
