const TMDB_KEY = '13d221ff3a3c8c15a49cc8260d7decc2';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const tmdbPath = req.query.path;
    if (!tmdbPath || !tmdbPath.startsWith('/')) {
        return res.status(400).json({ error: 'path parameter required' });
    }

    try {
        const sep = tmdbPath.includes('?') ? '&' : '?';
        const url = `https://api.themoviedb.org/3${tmdbPath}${sep}api_key=${TMDB_KEY}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
        });
        const data = await response.json();
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(502).json({ error: 'TMDB unreachable', details: err.message });
    }
}
