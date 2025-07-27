// /api/pubkeys/[roomId]/[userId].js
export default function handler(req, res) {
  const { roomId, userId } = req.query;
  const key = `pubkey:${roomId}:${userId}`;

  if (req.method === 'POST') {
    // Store the RSA public key
    global[key] = req.body.pubKey;
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const pubKey = global[key];
    return pubKey ? res.status(200).json({ pubKey }) : res.status(404).json({ ok: false });
  }

  res.status(405).end();
}