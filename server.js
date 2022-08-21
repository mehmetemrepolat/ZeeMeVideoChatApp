const path = require('path');
const express = require('express');
const app = express();
const socketIO = require('socket.io');

const port = process.env.PORT || 8080;
const env = process.env.NODE_ENV || 'development';

// Redirect to https
app.get('*', (req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && env !== 'development') {
        return res.redirect(['https://', req.get('Host'), req.url].join(''));
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));

const server = require('http').createServer(app);
server.listen(port, () => {
    console.log(`Bu portta yayında: ${port}`);
});

/**
 * Socket.io events
 */
const io = socketIO(server);
io.sockets.on('connection', function (socket) {
    /**
     * Log actions to the client
     */
    function log() {
        const array = ['Server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    /**
     * Handle message from a client
     * If toId is provided message will be sent ONLY to the client with that id
     * If toId is NOT provided and room IS provided message will be broadcast to that room
     * If NONE is provided message will be sent to all clients
     */
    socket.on('message', (message, toId = null, room = null) => {
        log('Client ' + socket.id + ' said: ', message);

        if (toId) {
            console.log('From ', socket.id, ' to ', toId, message.type);

            io.to(toId).emit('message', message, socket.id);
        } else if (room) {
            console.log('From ', socket.id, ' to room: ', room, message.type);

            socket.broadcast.to(room).emit('message', message, socket.id);
        } else {
            console.log('From ', socket.id, ' to everyone ', message.type);

            socket.broadcast.emit('message', message, socket.id);
        }
    });

    let roomAdmin; // save admins socket id (will get overwritten if new room gets created)

    /**
     * When room gets created or someone joins it
     */
    socket.on('oluştur veya katıl', (room) => {
        log('Oda oluştur veya mevcut odaya katıl: ' + room);

        // Get number of clients in the room
        const clientsInRoom = io.sockets.adapter.rooms.get(room);
        let numClients = clientsInRoom ? clientsInRoom.size : 0;

        if (numClients === 0) {
            // Create room
            socket.join(room);
            roomAdmin = socket.id;
            socket.emit('Oluşturuldu', room, socket.id);
        } else {
            log('Kullanıcı:' + socket.id + ' odaya katıldı ' + room);

            // Join room
            io.sockets.in(room).emit('join', room); // Notify users in room
            socket.join(room);
            io.to(socket.id).emit('katildi', room, socket.id); // Notify client that they joined a room
            io.sockets.in(room).emit('hazir', socket.id); // Room is ready for creating connections
        }
    });

    /**
     * Kick participant from a call
     */
    socket.on('ban', (socketId, room) => {
        if (socket.id === roomAdmin) {
            socket.broadcast.emit('ban', socketId);
            io.sockets.sockets.get(socketId).leave(room);
        } else {
            console.log('not an admin');
        }
    });

    // participant leaves room
    socket.on('odadan ayrıl', (room) => {
        socket.leave(room);
        socket.emit('odadan ayril', room);
        socket.broadcast.to(room).emit('message', { type: 'leave' }, socket.id);
    });


    socket.on('disconnecting', () => {
        socket.rooms.forEach((room) => {
            if (room === socket.id) return;
            socket.broadcast
                .to(room)
                .emit('message', { type: 'leave' }, socket.id);
        });
    });
});
