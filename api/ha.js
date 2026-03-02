const HA_URL = process.env.HA_URL || 'https://na4kp2cjkejmeprgklgswxssuihm0ngr.ui.nabu.casa';
const HA_TOKEN = process.env.HA_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI5ZWRkMTU5YWQ1Njc0ODQ2ODFiM2FkNTVjNjUzMGFhMCIsImlhdCI6MTc3MjQ0OTI2MywiZXhwIjoyMDg3ODA5MjYzfQ.T4VozSdRacdBWNF30TpCXaCQYmj0gzKhx3FsyGO9dZs';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const haPath = req.query.path;
    if (!haPath || !haPath.startsWith('/api/')) {
        return res.status(400).json({ error: 'path parameter required, must start with /api/' });
    }

    try {
        const isPost = req.method === 'POST';
        const response = await fetch(`${HA_URL}${haPath}`, {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${HA_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: isPost ? JSON.stringify(req.body) : undefined,
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(502).json({ error: 'HA unreachable', details: err.message });
    }
}
