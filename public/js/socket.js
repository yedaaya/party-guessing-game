const Socket = (() => {
  const socket = io();
  const listeners = {};

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
    socket.emit(event, data, callback);
  }

  function getId() {
    return socket.id;
  }

  return { on, off, emit, getId, socket };
})();
