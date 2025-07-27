// /api/roomkeys/[roomId].js
export default function handler(req, res) {
  const { roomId } = req.query;
  const key = `roomkey:${roomId}`;

  if (req.method === 'POST') {
    // Only the room creator stores the encrypted AES key
    if (global[key]) return res.status(409).json({ error: "Key already exists" });
    global[key] = req.body.encryptedKey;
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const encryptedKey = global[key];
    return encryptedKey
      ? res.status(200).json({ encryptedKey })
      : res.status(404).json({ ok: false });
  }

  res.status(405).end();
}