const Socket = (() => {
  const socket = io();
  const listeners = {};
  let _roomCode = null;
  let _playerName = null;
  let _isHost = false;
  let _previousId = null;

  socket.on('connect', () => {
    // On reconnection, re-associate with the room
    if (_roomCode && _playerName && _previousId) {
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
  }

  return { on, off, emit, getId, setRoom, socket };
})();
