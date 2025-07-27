// server.js
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
let pubkeys = {};   // pubkeys[roomId][userId] = "base64..."
let roomkeys = {};  // roomkeys[roomId] = "base64..."

// ---------- ROOT ----------
app.get('/', (req, res) => {
    res.json({
        status: 'SecureChat Server Running',
        rooms: Object.keys(rooms).length,
        totalMessages: Object.values(messages).reduce((sum, msgs) => sum + msgs.length, 0),
        timestamp: new Date().toISOString()
    });
});

// ---------- ROOM ----------
app.post('/create-room', (req, res) => {
    const { roomId, hostId } = req.body;
    if (!roomId || !hostId) return res.status(400).json({ error: 'Missing roomId or hostId' });

    rooms[roomId] = { hostId, members: [hostId], createdAt: Date.now() };
    messages[roomId] = [];
    res.json({ success: true, roomId });
});

app.get('/room/:roomId', (req, res) => {
    const exists = !!rooms[req.params.roomId];
    res.json({ exists, roomId: req.params.roomId });
});

// ---------- MESSAGES ----------
app.post('/send', (req, res) => {
    const { roomId, message, senderId, expirationTime } = req.body;
    if (!roomId || !message || !senderId) return res.status(400).json({ error: 'Missing fields' });

    if (!messages[roomId]) messages[roomId] = [];
    const msgObj = {
        id: Date.now() + Math.random(),
        roomId,
        message,
        senderId,
        timestamp: Date.now(),
        expirationTime
    };
    messages[roomId].push(msgObj);
    res.json({ success: true, messageId: msgObj.id });
});

app.get('/messages/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (!messages[roomId]) return res.json([]);
    const now = Date.now();
    messages[roomId] = messages[roomId].filter(m => m.expirationTime > now);
    res.json(messages[roomId]);
});

// ---------- RECEIPTS ----------
app.post('/receipts', (req, res) => {
    // wir speichern keine Receipts persistent – nur OK senden
    res.json({ ok: true });
});

app.get('/receipts/:roomId', (req, res) => {
    // leer zurückgeben, falls keine Receipt-DB
    res.json([]);
});

// ---------- KEY-EXCHANGE ----------
// POST /api/pubkeys/:roomId/:userId
app.post('/api/pubkeys/:roomId/:userId', (req, res) => {
    const { roomId, userId } = req.params;
    const { pubKey } = req.body;
    if (!pubKey) return res.status(400).json({ error: 'pubKey missing' });

    if (!pubkeys[roomId]) pubkeys[roomId] = {};
    pubkeys[roomId][userId] = pubKey;
    res.json({ ok: true });
});

// GET /api/pubkeys/:roomId/:userId
app.get('/api/pubkeys/:roomId/:userId', (req, res) => {
    const key = pubkeys[req.params.roomId]?.[req.params.userId];
    key ? res.json({ pubKey: key }) : res.status(404).json({ ok: false });
});

// POST /api/roomkeys/:roomId
app.post('/api/roomkeys/:roomId', (req, res) => {
    const { roomId } = req.params;
    const { encryptedKey } = req.body;
    if (!encryptedKey) return res.status(400).json({ error: 'encryptedKey missing' });
    if (roomkeys[roomId]) return res.status(409).json({ error: 'Key already exists' });

    roomkeys[roomId] = encryptedKey;
    res.json({ ok: true });
});

// GET /api/roomkeys/:roomId
app.get('/api/roomkeys/:roomId', (req, res) => {
    const key = roomkeys[req.params.roomId];
    key ? res.json({ encryptedKey: key }) : res.status(404).json({ ok: false });
});

// ---------- CLEANUP ----------
setInterval(() => {
    const now = Date.now();
    Object.keys(messages).forEach(r => {
        messages[r] = messages[r].filter(m => m.expirationTime > now);
    });
}, 60_000);

// ---------- START ----------
app.listen(PORT, () => console.log(`SecureChat Server running on port ${PORT}`));
