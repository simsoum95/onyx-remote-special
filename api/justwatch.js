const JW_GRAPHQL = 'https://apis.justwatch.com/graphql';

const QUERY = `query GetSearchTitles($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges {
      node {
        content(country: $country, language: $language) {
          title
          originalReleaseYear
        }
        offers(country: $country, platform: WEB) {
          monetizationType
          standardWebURL
          deeplinkURL(platform: ANDROID_TV)
          package { packageId clearName }
        }
      }
    }
  }
}`;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { q, country = 'IL', language = 'en' } = req.query;
    if (!q) return res.status(400).json({ error: 'q parameter required' });

    try {
        const body = JSON.stringify({
            query: QUERY,
            variables: {
                country,
                language,
                first: 5,
                filter: { searchQuery: q },
            },
        });

        const response = await fetch(JW_GRAPHQL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        const data = await response.json();
        const edges = data?.data?.popularTitles?.edges || [];

        const results = edges.map(e => {
            const node = e.node;
            const content = node.content || {};
            const offers = (node.offers || []).filter(o => o.monetizationType === 'FLATRATE');
            return {
                title: content.title,
                year: content.originalReleaseYear,
                offers: offers.map(o => ({
                    provider: o.package?.clearName,
                    providerId: o.package?.packageId,
                    url: o.standardWebURL,
                    deeplink: o.deeplinkURL,
                })),
            };
        });

        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.status(200).json({ results });
    } catch (err) {
        return res.status(502).json({ error: 'JustWatch unreachable', details: err.message });
    }
}
