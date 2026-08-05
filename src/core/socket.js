const { setIo } = require('./utils/socket-instance');
const printLock = require('./utils/print-lock');

function initSocket(io) {
  setIo(io);

  io.on('connection', (socket) => {
    console.info(`[Socket.io] Client connected: ${socket.id}`);

    // Kirim snapshot lock yang sedang aktif saat client pertama konek
    // → Flutter langsung tahu lock mana yang sedang aktif tanpa perlu hit REST
    const activeLocks = printLock.getAllLocks();
    socket.emit('initial_locks', activeLocks);

    // Device join room per stockOpnameNo agar hanya menerima event yang relevan
    // dengan SO yang sedang dikerjakan (bukan broadcast ke semua device).
    socket.on('join_stock_opname', (stockOpnameNo) => {
      const no = String(stockOpnameNo || '').trim();
      if (!no) return;
      socket.join(`stock-opname:${no}`);
    });

    socket.on('leave_stock_opname', (stockOpnameNo) => {
      const no = String(stockOpnameNo || '').trim();
      if (!no) return;
      socket.leave(`stock-opname:${no}`);
    });

    socket.on('disconnect', (reason) => {
      console.info(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = initSocket;
