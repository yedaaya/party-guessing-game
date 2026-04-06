const Socket = (() => {
  const socket = io();
  const listeners = {};

  function _save() {
    try {
      const data = { roomCode: _roomCode, playerName: _playerName, isHost: _isHost };
      sessionStorage.setItem('game_session', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function _load() {
    try {
      const raw = sessionStorage.getItem('game_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _clear() {
    try { sessionStorage.removeItem('game_session'); } catch (e) { /* ignore */ }
  }

  let _roomCode = null;
  let _playerName = null;
  let _isHost = false;
  let _previousId = null;
  let _hasRejoined = false;

  // Load saved session on init
  const saved = _load();
  if (saved) {
    _roomCode = saved.roomCode;
    _playerName = saved.playerName;
    _isHost = saved.isHost;
  }

  socket.on('connect', () => {
    if (_roomCode && _playerName && !_hasRejoined) {
      _hasRejoined = true;
      socket.emit('rejoin-room', {
        code: _roomCode,
        name: _playerName,
        oldSocketId: _previousId,
        isHost: _isHost
      }, (res) => {
        if (res?.success && res.gameState) {
          if (typeof App !== 'undefined' && App.handleRejoin) {
            App.handleRejoin(res.gameState);
          }
        } else {
          _clear();
          _roomCode = null;
          _playerName = null;
          _isHost = false;
          if (typeof App !== 'undefined' && App.showHome) {
            App.showHome();
          }
        }
      });
    } else if (_roomCode && _playerName && _previousId) {
      socket.emit('rejoin-room', {
        code: _roomCode,
        name: _playerName,
        oldSocketId: _previousId,
        isHost: _isHost
      });
    }
  });

  socket.on('disconnect', () => {
    _previousId = socket.id;
    _hasRejoined = false;
  });

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    socket.on(event, callback);
  }

  function off(event, callback) {
    socket.off(event, callback);
    if (listeners[event]) {
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    }
  }

  function emit(event, data, callback) {
    if (typeof data === 'function') {
      socket.emit(event, data);
    } else if (callback) {
      socket.emit(event, data, callback);
    } else {
      socket.emit(event, data);
    }
  }

  function getId() {
    return socket.id;
  }

  function setRoom(code, name, isHost) {
    _roomCode = code;
    _playerName = name;
    _isHost = isHost;
    _save();
  }

  function clearSession() {
    _roomCode = null;
    _playerName = null;
    _isHost = false;
    _previousId = null;
    _clear();
  }

  function hasSavedSession() {
    return !!_roomCode && !!_playerName;
  }

  return { on, off, emit, getId, setRoom, clearSession, hasSavedSession, socket };
})();
