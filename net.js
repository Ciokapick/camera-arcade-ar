// Camere de joc între telefoane, fără server propriu: PeerJS (WebRTC) cu serverul public gratuit
// doar pentru „prezentări”, apoi date direct între telefoane (sau prin TURN-ul public PeerJS).
// Gazda ține starea (game.js) și o trimite tuturor după fiecare acțiune; ceilalți trimit doar acțiuni.
// Fără rețea (online: false) aceeași cameră merge local: joci singur sau cu calculatorul.
import { newRoom, reduce, hostTimers } from './game.js';

const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm';
const PREFIX = 'camera-arcade-v1-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // fără I și O, se confundă cu 1 și 0
export const HOST_ID = 'host';

const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

async function openPeer(id) {
  const { Peer } = await import(PEER_URL);
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    peer.once('open', () => resolve(peer));
    peer.once('error', error => { peer.destroy(); reject(error); });
  });
}

export async function hostRoom({ name, online, onState }) {
  let state = newRoom({ id: HOST_ID, name });
  const conns = new Map();
  let peer = null, code = null, onVisible = null;

  function dispatchFrom(action, from) {
    const next = reduce(state, action, from);
    if (next === state) return;
    state = next;
    for (const conn of conns.values()) if (conn.open) conn.send({ type: 'state', state });
    onState(state);
  }

  if (online) {
    for (let attempt = 0; attempt < 5 && !peer; attempt++) {
      code = randomCode();
      try {
        peer = await openPeer(PREFIX + code);
      } catch (error) {
        if (error.type !== 'unavailable-id') throw error; // cod ocupat → încercăm altul
      }
    }
    if (!peer) throw new Error('Nu am putut crea camera');
    peer.on('connection', conn => {
      conn.on('open', () => {
        conns.set(conn.peer, conn);
        conn.send({ type: 'state', state });
      });
      conn.on('data', action => {
        if (!action || typeof action.type !== 'string') return;
        dispatchFrom(action, conn.peer);
        // camera plină sau partidă de „Nu te supăra” în desfășurare: îi spunem clar și închidem
        if (action.type === 'join' && !state.players.some(p => p.id === conn.peer)) {
          conn.send({ type: 'refused', reason: state.game === 'ludo' ? 'Partida a început deja.' : 'Camera e plină.' });
          setTimeout(() => conn.close(), 500);
        }
      });
      conn.on('close', () => {
        conns.delete(conn.peer);
        dispatchFrom({ type: 'leave' }, conn.peer);
      });
    });
    // dacă pică legătura cu serverul de prezentări, conexiunile existente rămân; ne reconectăm pentru alții noi
    peer.on('disconnected', () => !peer.destroyed && peer.reconnect());
    // pe iPhone, când ieși din Safari (ex.: ca să trimiți codul pe WhatsApp) pagina e suspendată; la întoarcere
    // ne reconectăm imediat, ca cine intră să ne găsească
    onVisible = () => { if (document.visibilityState === 'visible' && peer && !peer.destroyed && peer.disconnected) peer.reconnect(); };
    document.addEventListener('visibilitychange', onVisible);
  }

  const memo = {};
  const timer = setInterval(() => {
    for (const { action, from } of hostTimers(state, Date.now(), memo)) dispatchFrom(action, from);
  }, 200);
  onState(state);

  return {
    code,
    selfId: HOST_ID,
    isHost: true,
    online: !!online,
    get state() { return state; },
    dispatch: action => dispatchFrom(action, HOST_ID),
    leave() {
      clearInterval(timer);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
      peer?.destroy();
    },
  };
}

// o încercare de legătură cu gazda; peer-unavailable = codul nu există (sau gazda a ieșit din aplicație)
function connectOnce(peer, code, ms) {
  const conn = peer.connect(PREFIX + code, { reliable: true });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { conn.close(); reject(new Error('timeout')); }, ms);
    conn.once('open', () => { clearTimeout(timeout); resolve(conn); });
    peer.once('error', error => { clearTimeout(timeout); reject(error); });
  });
}

export async function joinRoom({ code, name, onState, onClose, onProgress = () => {} }) {
  code = String(code).trim().toUpperCase();
  const peer = await openPeer();
  let state = null, conn;
  // două încercări: pe date mobile legătura directă poate dura (sau prima cade)
  try {
    try {
      conn = await connectOnce(peer, code, 9000);
    } catch (error) {
      if (error.type === 'peer-unavailable') throw new Error(`Nu găsesc camera ${code}. Verifică codul și ca gazda să aibă aplicația deschisă pe ecran.`);
      onProgress('Mai încerc o dată…');
      conn = await connectOnce(peer, code, 12000).catch(e => {
        throw new Error(e.type === 'peer-unavailable' ? `Nu găsesc camera ${code}. Verifică codul și ca gazda să aibă aplicația deschisă pe ecran.` : 'Nu mă pot lega de gazdă. Încercați amândoi pe aceeași rețea Wi-Fi sau pe date mobile.');
      });
    }
  } catch (error) {
    peer.destroy();
    throw error;
  }
  let left = false;
  // intrăm „de-adevăratelea” abia când gazda ne trimite o stare în care suntem printre jucători
  const welcomed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Gazda nu răspunde')), 12000);
    conn.on('data', message => {
      if (message?.type === 'refused') { clearTimeout(timeout); reject(new Error(message.reason || 'Gazda te-a refuzat')); return; }
      if (message?.type !== 'state' || !message.state.players.some(p => p.id === peer.id)) return;
      clearTimeout(timeout);
      state = message.state;
      resolve();
      onState(state);
    });
  });
  conn.on('close', () => { if (!left) onClose?.(); });
  conn.send({ type: 'join', name });
  try {
    await welcomed;
  } catch (error) {
    left = true;
    peer.destroy();
    throw error;
  }
  return {
    code,
    selfId: peer.id,
    isHost: false,
    online: true,
    get state() { return state; },
    dispatch: action => conn.open && conn.send(action),
    leave() {
      left = true;
      peer.destroy();
    },
  };
}
