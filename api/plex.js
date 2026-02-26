const PLEX_RELAY = 'https://172-104-247-122.7f129a0c76254e08912ab40133e94d85.plex.direct:8443';
const PLEX_TOKEN = 'nkK9tSbu5HPYs1yXVukC';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const plexPath = req.query.path;
    if (!plexPath || !plexPath.startsWith('/')) {
        return res.status(400).json({ error: 'path parameter required' });
    }

    try {
        const sep = plexPath.includes('?') ? '&' : '?';
        const url = `${PLEX_RELAY}${plexPath}${sep}X-Plex-Token=${PLEX_TOKEN}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
        });

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('image') || req.query.img === '1') {
            const buffer = await response.arrayBuffer();
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.status(response.status).send(Buffer.from(buffer));
        }

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(502).json({ error: 'Plex unreachable', details: err.message });
    }
}
