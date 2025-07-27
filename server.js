const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
let rooms = {};
let messages = {};

// Root route
app.get('/', (req, res) => {
    res.json({ 
        status: 'SecureChat Server Running',
        rooms: Object.keys(rooms).length,
        totalMessages: Object.values(messages).reduce((sum, msgs) => sum + msgs.length, 0),
        timestamp: new Date().toISOString()
    });
});

// Create room
app.post('/create-room', (req, res) => {
    const { roomId, hostId, timestamp } = req.body;
    
    if (!roomId || !hostId) {
        return res.status(400).json({ error: 'Missing roomId or hostId' });
    }
    
    rooms[roomId] = {
        hostId,
        createdAt: timestamp,
        members: [hostId]
    };
    
    messages[roomId] = [];
    
    res.json({ success: true, roomId });
});

// Send message
app.post('/send', (req, res) => {
    const { roomId, message, senderId, timestamp, expirationTime } = req.body;
    
    if (!roomId || !message || !senderId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!messages[roomId]) {
        messages[roomId] = [];
    }
    
    const messageObj = {
        id: Date.now() + Math.random(),
        roomId,
        message,
        senderId,
        timestamp,
        expirationTime
    };
    
    messages[roomId].push(messageObj);
    
    // Clean up expired messages
    const now = Date.now();
    messages[roomId] = messages[roomId].filter(msg => msg.expirationTime > now);
    
    res.json({ success: true, messageId: messageObj.id });
});

// Get messages
app.get('/messages/:roomId', (req, res) => {
    const { roomId } = req.params;
    
    if (!messages[roomId]) {
        return res.json([]);
    }
    
    // Filter out expired messages
    const now = Date.now();
    messages[roomId] = messages[roomId].filter(msg => msg.expirationTime > now);
    
    res.json(messages[roomId]);
});

// Check if room exists
app.get('/room/:roomId', (req, res) => {
    const { roomId } = req.params;
    const exists = !!rooms[roomId];
    res.json({ exists, roomId });
});

// Clean up expired messages every minute
setInterval(() => {
    const now = Date.now();
    Object.keys(messages).forEach(roomId => {
        messages[roomId] = messages[roomId].filter(msg => msg.expirationTime > now);
    });
}, 60000);

app.listen(PORT, () => {
    console.log(`SecureChat Server running on port ${PORT}`);
});