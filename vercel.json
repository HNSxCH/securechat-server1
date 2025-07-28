// File: api/index.js (oder server.js für Vercel)
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ===== MIDDLEWARE =====
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// ===== IN-MEMORY STORAGE =====
// In production, use a proper database (MongoDB, PostgreSQL, etc.)

// Legacy room-based storage
const rooms = new Map(); // roomId -> { hostId, timestamp, e2eeEnabled }
const messages = new Map(); // roomId -> [message objects]
const roomKeys = new Map(); // roomId -> encryptedKey
const receipts = new Map(); // roomId -> [receipt objects]

// E2EE storage
const userPublicKeys = new Map(); // roomId -> { userId -> publicKey }
const roomUsers = new Map(); // roomId -> Set of userIds
const e2eeMessages = new Map(); // roomId -> [e2ee message objects]

// Health tracking
const serverStats = {
    startTime: Date.now(),
    totalRequests: 0,
    totalRooms: 0,
    totalUsers: 0,
    totalMessages: 0,
    totalE2EEMessages: 0
};

// ===== UTILITY FUNCTIONS =====
function logRequest(req, action) {
    serverStats.totalRequests++;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${action}`);
}

function cleanupExpiredMessages() {
    const now = Date.now();
    let cleaned = 0;
    
    // Clean legacy messages
    for (const [roomId, roomMessages] of messages.entries()) {
        const validMessages = roomMessages.filter(msg => 
            !msg.expirationTime || msg.expirationTime > now
        );
        if (validMessages.length !== roomMessages.length) {
            messages.set(roomId, validMessages);
            cleaned += roomMessages.length - validMessages.length;
        }
    }
    
    // Clean E2EE messages
    for (const [roomId, roomMessages] of e2eeMessages.entries()) {
        const validMessages = roomMessages.filter(msg => 
            !msg.expirationTime || msg.expirationTime > now
        );
        if (validMessages.length !== roomMessages.length) {
            e2eeMessages.set(roomId, validMessages);
            cleaned += roomMessages.length - validMessages.length;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} expired messages`);
    }
}

function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeRoomId(roomId) {
    return roomId ? roomId.toString().toUpperCase().trim() : '';
}

// ===== HEALTH & STATUS ENDPOINTS =====
app.get('/health', (req, res) => {
    logRequest(req, 'Health check');
    res.json({ 
        status: 'healthy', 
        timestamp: Date.now(),
        uptime: Date.now() - serverStats.startTime
    });
});

app.get('/status', (req, res) => {
    logRequest(req, 'Status check');
    res.json({ 
        status: 'online', 
        timestamp: Date.now(),
        uptime: Date.now() - serverStats.startTime
    });
});

app.get('/', (req, res) => {
    logRequest(req, 'Root endpoint');
    res.json({ 
        message: 'SecureChat E2EE Server', 
        version: '2.0.0',
        timestamp: Date.now(),
        stats: {
            ...serverStats,
            uptime: Date.now() - serverStats.startTime,
            activeRooms: rooms.size,
            totalUsers: Array.from(roomUsers.values()).reduce((acc, users) => acc + users.size, 0)
        }
    });
});

app.get('/stats', (req, res) => {
    logRequest(req, 'Stats request');
    
    const stats = {
        ...serverStats,
        uptime: Date.now() - serverStats.startTime,
        activeRooms: rooms.size,
        totalUsers: Array.from(roomUsers.values()).reduce((acc, users) => acc + users.size, 0),
        messagesInMemory: Array.from(messages.values()).reduce((acc, msgs) => acc + msgs.length, 0),
        e2eeMessagesInMemory: Array.from(e2eeMessages.values()).reduce((acc, msgs) => acc + msgs.length, 0),
        publicKeysStored: Array.from(userPublicKeys.values()).reduce((acc, keys) => acc + Object.keys(keys).length, 0)
    };
    
    res.json(stats);
});

// ===== ROOM MANAGEMENT =====
app.post('/create-room', (req, res) => {
    try {
        logRequest(req, 'Create room');
        
        const { roomId, hostId, e2eeEnabled = false } = req.body;
        
        if (!roomId || !hostId) {
            return res.status(400).json({ error: 'Missing roomId or hostId' });
        }
        
        const normalizedRoomId = normalizeRoomId(roomId);
        
        // Create or update room
        rooms.set(normalizedRoomId, {
            hostId,
            timestamp: Date.now(),
            e2eeEnabled: Boolean(e2eeEnabled)
        });
        
        // Initialize room storage
        if (!messages.has(normalizedRoomId)) {
            messages.set(normalizedRoomId, []);
        }
        if (!e2eeMessages.has(normalizedRoomId)) {
            e2eeMessages.set(normalizedRoomId, []);
        }
        if (!receipts.has(normalizedRoomId)) {
            receipts.set(normalizedRoomId, []);
        }
        if (!userPublicKeys.has(normalizedRoomId)) {
            userPublicKeys.set(normalizedRoomId, {});
        }
        if (!roomUsers.has(normalizedRoomId)) {
            roomUsers.set(normalizedRoomId, new Set());
        }
        
        // Add host to room users
        roomUsers.get(normalizedRoomId).add(hostId);
        
        serverStats.totalRooms++;
        
        console.log(`✅ Room created: ${normalizedRoomId} by ${hostId} (E2EE: ${e2eeEnabled})`);
        
        res.json({ 
            success: true, 
            roomId: normalizedRoomId,
            e2eeEnabled: Boolean(e2eeEnabled),
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Create room error:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

app.post('/join-room', (req, res) => {
    try {
        logRequest(req, 'Join room');
        
        const { roomId, userId } = req.body;
        
        if (!roomId || !userId) {
            return res.status(400).json({ error: 'Missing roomId or userId' });
        }
        
        const normalizedRoomId = normalizeRoomId(roomId);
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Add user to room
        if (!roomUsers.has(normalizedRoomId)) {
            roomUsers.set(normalizedRoomId, new Set());
        }
        roomUsers.get(normalizedRoomId).add(userId);
        
        console.log(`👥 User ${userId} joined room ${normalizedRoomId}`);
        
        res.json({ 
            success: true, 
            roomId: normalizedRoomId,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Join room error:', error);
        res.status(500).json({ error: 'Failed to join room' });
    }
});

app.get('/room/:roomId', (req, res) => {
    try {
        logRequest(req, 'Check room');
        
        const normalizedRoomId = normalizeRoomId(req.params.roomId);
        
        if (!normalizedRoomId) {
            return res.status(400).json({ error: 'Invalid roomId' });
        }
        
        const room = rooms.get(normalizedRoomId);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        res.json({ 
            exists: true, 
            roomId: normalizedRoomId,
            e2eeEnabled: room.e2eeEnabled,
            userCount: roomUsers.get(normalizedRoomId)?.size || 0,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Check room error:', error);
        res.status(500).json({ error: 'Failed to check room' });
    }
});

// ===== USER MANAGEMENT (E2EE) =====
app.post('/users/:roomId/:userId/publickey', (req, res) => {
    try {
        logRequest(req, 'Publish public key');
        
        const { roomId, userId } = req.params;
        const { publicKey } = req.body;
        
        if (!roomId || !userId || !publicKey) {
            return res.status(400).json({ error: 'Missing roomId, userId, or publicKey' });
        }
        
        const normalizedRoomId = normalizeRoomId(roomId);
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Store public key
        if (!userPublicKeys.has(normalizedRoomId)) {
            userPublicKeys.set(normalizedRoomId, {});
        }
        
        userPublicKeys.get(normalizedRoomId)[userId] = {
            publicKey,
            timestamp: Date.now()
        };
        
        // Add user to room
        if (!roomUsers.has(normalizedRoomId)) {
            roomUsers.set(normalizedRoomId, new Set());
        }
        roomUsers.get(normalizedRoomId).add(userId);
        
        console.log(`🔑 Public key stored for ${userId} in room ${normalizedRoomId}`);
        
        res.json({ 
            success: true,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Store public key error:', error);
        res.status(500).json({ error: 'Failed to store public key' });
    }
});

app.get('/users/:roomId/:userId/publickey', (req, res) => {
    try {
        logRequest(req, 'Get public key');
        
        const { roomId, userId } = req.params;
        const normalizedRoomId = normalizeRoomId(roomId);
        
        if (!normalizedRoomId || !userId) {
            return res.status(400).json({ error: 'Invalid roomId or userId' });
        }
        
        const roomKeys = userPublicKeys.get(normalizedRoomId);
        if (!roomKeys || !roomKeys[userId]) {
            return res.status(404).json({ error: 'Public key not found' });
        }
        
        res.json({ 
            publicKey: roomKeys[userId].publicKey,
            timestamp: roomKeys[userId].timestamp
        });
        
    } catch (error) {
        console.error('❌ Get public key error:', error);
        res.status(500).json({ error: 'Failed to get public key' });
    }
});

app.get('/rooms/:roomId/users', (req, res) => {
    try {
        logRequest(req, 'Get room users');
        
        const normalizedRoomId = normalizeRoomId(req.params.roomId);
        
        if (!normalizedRoomId) {
            return res.status(400).json({ error: 'Invalid roomId' });
        }
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const users = [];
        const roomUserSet = roomUsers.get(normalizedRoomId) || new Set();
        const roomKeyMap = userPublicKeys.get(normalizedRoomId) || {};
        
        for (const userId of roomUserSet) {
            users.push({
                userId,
                publicKey: roomKeyMap[userId]?.publicKey || '',
                joinedAt: roomKeyMap[userId]?.timestamp || Date.now()
            });
        }
        
        res.json({ 
            users,
            totalUsers: users.length,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Get room users error:', error);
        res.status(500).json({ error: 'Failed to get room users' });
    }
});

// ===== E2EE MESSAGE OPERATIONS =====
app.post('/send-e2ee', (req, res) => {
    try {
        logRequest(req, 'Send E2EE message');
        
        const { roomId, senderId, encryptedMessages, expirationTime } = req.body;
        
        if (!roomId || !senderId || !encryptedMessages) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const normalizedRoomId = normalizeRoomId(roomId);
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const messageId = generateMessageId();
        const timestamp = Date.now();
        const finalExpirationTime = expirationTime || (timestamp + 24 * 60 * 60 * 1000); // 24h default
        
        // Store message for each recipient
        if (!e2eeMessages.has(normalizedRoomId)) {
            e2eeMessages.set(normalizedRoomId, []);
        }
        
        const roomMessageList = e2eeMessages.get(normalizedRoomId);
        let recipientCount = 0;
        
        for (const [recipientId, encryptedData] of Object.entries(encryptedMessages)) {
            roomMessageList.push({
                id: `${messageId}_${recipientId}`,
                messageId,
                senderId,
                recipientId,
                encryptedData,
                timestamp,
                expirationTime: finalExpirationTime
            });
            recipientCount++;
        }
        
        serverStats.totalE2EEMessages += recipientCount;
        
        console.log(`🔐 E2EE message from ${senderId} stored for ${recipientCount} recipients in ${normalizedRoomId}`);
        
        res.json({ 
            success: true,
            messageId,
            recipientCount,
            timestamp
        });
        
    } catch (error) {
        console.error('❌ Send E2EE message error:', error);
        res.status(500).json({ error: 'Failed to send E2EE message' });
    }
});

app.get('/messages-e2ee/:roomId/:userId', (req, res) => {
    try {
        logRequest(req, 'Get E2EE messages');
        
        const { roomId, userId } = req.params;
        const normalizedRoomId = normalizeRoomId(roomId);
        
        if (!normalizedRoomId || !userId) {
            return res.status(400).json({ error: 'Invalid roomId or userId' });
        }
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Clean expired messages first
        cleanupExpiredMessages();
        
        const roomMessageList = e2eeMessages.get(normalizedRoomId) || [];
        const now = Date.now();
        
        // Get messages for this specific user that haven't expired
        const userMessages = roomMessageList
            .filter(msg => 
                msg.recipientId === userId && 
                (!msg.expirationTime || msg.expirationTime > now)
            )
            .sort((a, b) => a.timestamp - b.timestamp);
        
        res.json(userMessages);
        
    } catch (error) {
        console.error('❌ Get E2EE messages error:', error);
        res.status(500).json({ error: 'Failed to get E2EE messages' });
    }
});

// ===== LEGACY MESSAGE OPERATIONS =====
app.post('/send', (req, res) => {
    try {
        logRequest(req, 'Send legacy message');
        
        const { roomId, message, senderId, timestamp, expirationTime } = req.body;
        
        if (!roomId || !message || !senderId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const normalizedRoomId = normalizeRoomId(roomId);
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const messageId = generateMessageId();
        const messageTimestamp = timestamp || Date.now();
        
        if (!messages.has(normalizedRoomId)) {
            messages.set(normalizedRoomId, []);
        }
        
        messages.get(normalizedRoomId).push({
            id: messageId,
            roomId: normalizedRoomId,
            message,
            senderId,
            timestamp: messageTimestamp,
            expirationTime: expirationTime || (messageTimestamp + 24 * 60 * 60 * 1000)
        });
        
        serverStats.totalMessages++;
        
        console.log(`📨 Legacy message from ${senderId} stored in ${normalizedRoomId}`);
        
        res.json({ 
            success: true,
            messageId,
            timestamp: messageTimestamp
        });
        
    } catch (error) {
        console.error('❌ Send legacy message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/messages/:roomId', (req, res) => {
    try {
        logRequest(req, 'Get legacy messages');
        
        const normalizedRoomId = normalizeRoomId(req.params.roomId);
        
        if (!normalizedRoomId) {
            return res.status(400).json({ error: 'Invalid roomId' });
        }
        
        // Clean expired messages first
        cleanupExpiredMessages();
        
        const roomMessages = messages.get(normalizedRoomId) || [];
        const now = Date.now();
        
        // Filter out expired messages
        const validMessages = roomMessages
            .filter(msg => !msg.expirationTime || msg.expirationTime > now)
            .sort((a, b) => a.timestamp - b.timestamp);
        
        res.json(validMessages);
        
    } catch (error) {
        console.error('❌ Get legacy messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// ===== LEGACY ROOM KEY OPERATIONS =====
app.post('/rooms/:roomId/key', (req, res) => {
    try {
        logRequest(req, 'Store room key');
        
        const { encryptedKey } = req.body;
        const normalizedRoomId = normalizeRoomId(req.params.roomId);
        
        if (!normalizedRoomId || !encryptedKey) {
            return res.status(400).json({ error: 'Missing roomId or encryptedKey' });
        }
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        roomKeys.set(normalizedRoomId, {
            encryptedKey,
            timestamp: Date.now()
        });
        
        console.log(`🔑 Room key stored for ${normalizedRoomId}`);
        
        res.json({ 
            success: true,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Store room key error:', error);
        res.status(500).json({ error: 'Failed to store room key' });
    }
});

app.get('/rooms/:roomId/key', (req, res) => {
    try {
        logRequest(req, 'Get room key');
        
        const normalizedRoomId = normalizeRoomId(req.params.roomId);
        
        if (!normalizedRoomId) {
            return res.status(400).json({ error: 'Invalid roomId' });
        }
        
        const keyData = roomKeys.get(normalizedRoomId);
        
        if (!keyData) {
            return res.status(404).json({ error: 'Room key not found' });
        }
        
        res.json({ 
            encryptedKey: keyData.encryptedKey,
            timestamp: keyData.timestamp
        });
        
    } catch (error) {
        console.error('❌ Get room key error:', error);
        res.status(500).json({ error: 'Failed to get room key' });
    }
});

// ===== RECEIPT OPERATIONS =====
app.post('/receipts', (req, res) => {
    try {
        logRequest(req, 'Send receipt');
        
        const { messageId, recipientId, type, roomId } = req.body;
        
        if (!messageId || !recipientId || !type || !roomId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const normalizedRoomId = normalizeRoomId(roomId);
        
        if (!rooms.has(normalizedRoomId)) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        if (!receipts.has(normalizedRoomId)) {
            receipts.set(normalizedRoomId, []);
        }
        
        receipts.get(normalizedRoomId).push({
            messageId,
            recipientId,
            type,
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Send receipt error:', error);
        res.status(500).json({ error: 'Failed to send receipt' });
    }
});

app.get('/receipts/:roomId', (req, res) => {
    try {
        logRequest(req, 'Get receipts');
        
        const normalizedRoomId = normalizeRoomId(req.params.roomId);
        
        if (!normalizedRoomId) {
            return res.status(400).json({ error: 'Invalid roomId' });
        }
        
        const roomReceipts = receipts.get(normalizedRoomId) || [];
        
        // Return receipts from last 24 hours only
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const recentReceipts = roomReceipts
            .filter(receipt => receipt.timestamp > oneDayAgo)
            .sort((a, b) => a.timestamp - b.timestamp);
        
        res.json(recentReceipts);
        
    } catch (error) {
        console.error('❌ Get receipts error:', error);
        res.status(500).json({ error: 'Failed to get receipts' });
    }
});

// ===== CLEANUP OPERATIONS =====
app.post('/cleanup', (req, res) => {
    try {
        logRequest(req, 'Manual cleanup');
        
        cleanupExpiredMessages();
        
        // Clean up old receipts (older than 7 days)
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let cleanedReceipts = 0;
        
        for (const [roomId, roomReceipts] of receipts.entries()) {
            const validReceipts = roomReceipts.filter(receipt => receipt.timestamp > sevenDaysAgo);
            if (validReceipts.length !== roomReceipts.length) {
                receipts.set(roomId, validReceipts);
                cleanedReceipts += roomReceipts.length - validReceipts.length;
            }
        }
        
        console.log(`🧹 Manual cleanup completed. Cleaned ${cleanedReceipts} old receipts`);
        
        res.json({ 
            success: true,
            cleanedReceipts,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        res.status(500).json({ error: 'Failed to perform cleanup' });
    }
});

// ===== ERROR HANDLING =====
app.use((req, res) => {
    logRequest(req, '404 Not Found');
    res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// ===== PERIODIC CLEANUP =====
// Clean up expired messages every 10 minutes
setInterval(() => {
    try {
        cleanupExpiredMessages();
    } catch (error) {
        console.error('❌ Periodic cleanup error:', error);
    }
}, 10 * 60 * 1000);

// ===== SERVER STARTUP =====
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 SecureChat E2EE Server running on port ${PORT}`);
        console.log(`📡 Endpoints available:`);
        console.log(`   GET  /health - Health check`);
        console.log(`   GET  /status - Status check`);
        console.log(`   GET  /stats - Server statistics`);
        console.log(`   POST /create-room - Create/join room`);
        console.log(`   POST /users/:roomId/:userId/publickey - Store public key`);
        console.log(`   GET  /users/:roomId/:userId/publickey - Get public key`);
        console.log(`   GET  /rooms/:roomId/users - Get room users`);
        console.log(`   POST /send-e2ee - Send E2EE message`);
        console.log(`   GET  /messages-e2ee/:roomId/:userId - Get E2EE messages`);
        console.log(`   POST /send - Send legacy message`);
        console.log(`   GET  /messages/:roomId - Get legacy messages`);
        console.log(`   POST /receipts - Send receipt`);
        console.log(`   GET  /receipts/:roomId - Get receipts`);
        console.log(`✅ Server ready for E2EE operations!`);
    });
}

// Export for Vercel
module.exports = app;
