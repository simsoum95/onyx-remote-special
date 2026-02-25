/**
 * ONYX REMOTE SPECIAL — PWA Standalone
 * Connexion directe à Home Assistant via REST API + Token.
 * Écran de setup au premier lancement, config en localStorage.
 */

/* ============================================================
   CINEMA CONFIG
   ============================================================ */
const CINEMA = {
    lights: [
        { id: 'light.7b_cinema_basement_smallspot_switch', name: 'ספוטים', emoji: '💡' },
        { id: 'light.7b_cinema_basement_led_switch', name: 'לד ארכיטקט', emoji: '🔵' },
        { id: 'light.8a_cinema_basement_big_spots_switch', name: 'ספוטים גדולים', emoji: '🔆' },
        { id: 'light.9a_cinema_basement_posterwall_switch', name: 'פוסטרים', emoji: '🖼️' },
        { id: 'light.8a_cinema_basement_wall_switch', name: 'קיר', emoji: '🏮' },
    ],
    cover: { id: 'cover.cinema_curtains' },
    receiver: { id: 'media_player.pioneer_vsx_lx303_ed2279', name: 'מגבר Pioneer' },
    projector: { id: 'media_player.epson', name: 'מקרן' },
    players: [
        { id: 'media_player.shield', name: 'Shield', emoji: '🛡️' },
        { id: 'media_player.shield_2', name: 'Shield 2', emoji: '🛡️' },
        { id: 'media_player.qvlnv_byty', name: 'Apple TV', emoji: '🍎' },
    ],
    sources: [
        { id: 'script.unknown_8', name: 'Apple TV', emoji: '📺' },
        { id: 'script.unknown_5', name: 'Fox', emoji: '🦊' },
        { id: 'script.unknown_7', name: 'Paramount', emoji: '⭐' },
        { id: 'script.unknown_6', name: 'PlayStation', emoji: '🎮' },
    ],
};

const ALL_IDS = [
    ...CINEMA.lights.map(l => l.id),
    CINEMA.cover.id,
    CINEMA.receiver.id,
    CINEMA.projector.id,
    ...CINEMA.players.map(p => p.id),
];

/* ============================================================
   STATE
   ============================================================ */
const S = {
    entities: {},
    cinemaOn: false,
    busy: false,
    poll: null,
    haUrl: '',
    haToken: '',
};

/* ============================================================
   HA API — Appels directs avec Bearer Token
   ============================================================ */
function haHeaders() {
    return {
        'Authorization': `Bearer ${S.haToken}`,
        'Content-Type': 'application/json',
    };
}

async function haFetch(path, opts = {}) {
    const url = `${S.haUrl}${path}`;
    const res = await fetch(url, { ...opts, headers: { ...haHeaders(), ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`HA ${res.status}`);
    return res.json();
}

async function fetchStates() {
    try {
        const states = await haFetch('/api/states');
        for (const s of states) {
            if (ALL_IDS.includes(s.entity_id)) {
                S.entities[s.entity_id] = { state: s.state, attr: s.attributes || {} };
            }
        }
        setOnline(true);
        renderAll();
        return true;
    } catch (e) {
        console.error('[Onyx] fetch states error:', e);
        setOnline(false);
        return false;
    }
}

async function callService(domain, service, data = {}) {
    try {
        await haFetch(`/api/services/${domain}/${service}`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return true;
    } catch (e) {
        console.error('[Onyx] service error:', e);
        toast('שגיאת תקשורת', 'error');
        return false;
    }
}

async function callWithRetry(domain, service, entityId, extra = {}, retries = 3) {
    const data = { entity_id: entityId, ...extra };
    for (let i = 1; i <= retries; i++) {
        const ok = await callService(domain, service, data);
        if (!ok) continue;
        await sleep(2000);
        await fetchStates();
        const st = S.entities[entityId]?.state;
        if (isExpected(st, service)) return true;
        if (i < retries) await sleep(1500);
    }
    return false;
}

function isExpected(state, service) {
    if (!state) return false;
    if (service.includes('turn_on') || service.includes('open')) return ['on', 'open', 'opening', 'playing', 'idle', 'paused'].includes(state);
    if (service.includes('turn_off') || service.includes('close')) return ['off', 'closed', 'closing', 'standby', 'unavailable'].includes(state);
    return true;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   SCENES
   ============================================================ */
async function runScene(name) {
    if (S.busy) return;
    S.busy = true;
    const btn = document.getElementById('btnPower');
    if (btn) btn.classList.add('loading');
    toast(sceneMsg(name, 'go'), 'info');

    let ok = true;
    try {
        if (name === 'cinema_on') {
            const lightOff = CINEMA.lights.map(l => callService('light', 'turn_off', { entity_id: l.id }));
            await Promise.all(lightOff);
            await callService('cover', 'close_cover', { entity_id: CINEMA.cover.id });
            const pOk = await callWithRetry('media_player', 'turn_on', CINEMA.projector.id);
            const rOk = await callWithRetry('media_player', 'turn_on', CINEMA.receiver.id);
            ok = pOk && rOk;
        } else if (name === 'cinema_off') {
            await callService('media_player', 'turn_off', { entity_id: CINEMA.projector.id });
            await callService('media_player', 'turn_off', { entity_id: CINEMA.receiver.id });
            await sleep(1000);
            await callService('cover', 'open_cover', { entity_id: CINEMA.cover.id });
            await callService('light', 'turn_on', { entity_id: 'light.8a_cinema_basement_big_spots_switch' });
        } else if (name === 'ambient') {
            await Promise.all([
                callService('light', 'turn_off', { entity_id: 'light.7b_cinema_basement_smallspot_switch' }),
                callService('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_big_spots_switch' }),
                callService('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_wall_switch' }),
                callService('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' }),
                callService('light', 'turn_on', { entity_id: 'light.9a_cinema_basement_posterwall_switch' }),
            ]);
            await callService('cover', 'open_cover', { entity_id: CINEMA.cover.id });
        } else if (name === 'pause') {
            await callService('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' });
        }
        await fetchStates();
        toast(sceneMsg(name, ok ? 'ok' : 'fail'), ok ? 'success' : 'error');
    } catch {
        toast('שגיאה בהפעלה', 'error');
    }
    S.busy = false;
    if (btn) btn.classList.remove('loading');
}

function sceneMsg(s, t) {
    const M = {
        cinema_on:  { go: '🎬 מפעיל מצב קולנוע...', ok: '🎬 קולנוע פעיל!', fail: '⚠️ חלק מהמכשירים לא הגיבו' },
        cinema_off: { go: '🔴 מכבה...', ok: '🔴 הקולנוע כבוי', fail: '⚠️ שגיאה' },
        ambient:    { go: '✨ מצב אווירה...', ok: '✨ אווירה פעילה', fail: '⚠️ שגיאה' },
        pause:      { go: '⏸ הפסקה...', ok: '⏸ תאורת הפסקה', fail: '⚠️ שגיאה' },
    };
    return M[s]?.[t] || s;
}

/* ============================================================
   ACTIONS
   ============================================================ */
async function toggleLight(id) {
    const svc = S.entities[id]?.state === 'on' ? 'turn_off' : 'turn_on';
    await callService('light', svc, { entity_id: id });
    setTimeout(fetchStates, 1200);
}

async function coverAction(a) {
    const svc = a === 'open' ? 'open_cover' : a === 'close' ? 'close_cover' : 'stop_cover';
    await callService('cover', svc, { entity_id: CINEMA.cover.id });
    setTimeout(fetchStates, 2000);
}

async function toggleDev(id) {
    const on = ['on', 'playing', 'idle', 'paused'].includes(S.entities[id]?.state);
    await callService('media_player', on ? 'turn_off' : 'turn_on', { entity_id: id });
    setTimeout(fetchStates, 3000);
}

async function fireSource(id) {
    await callService('script', 'turn_on', { entity_id: id });
    toast('🎯 מקור הופעל', 'success');
    setTimeout(fetchStates, 3000);
}

async function volStep(dir) {
    await callService('media_player', dir === 'up' ? 'volume_up' : 'volume_down', { entity_id: CINEMA.receiver.id });
    setTimeout(fetchStates, 800);
}

async function setVol(v) {
    await callService('media_player', 'volume_set', { entity_id: CINEMA.receiver.id, volume_level: v / 100 });
}

async function toggleMute() {
    const m = S.entities[CINEMA.receiver.id]?.attr?.is_volume_muted || false;
    await callService('media_player', 'volume_mute', { entity_id: CINEMA.receiver.id, is_volume_muted: !m });
    setTimeout(fetchStates, 800);
}

async function allLights(svc) {
    await Promise.all(CINEMA.lights.map(l => callService('light', svc, { entity_id: l.id })));
    toast(svc === 'turn_on' ? '💡 הכל דלוק' : '🌑 הכל כבוי', 'success');
    setTimeout(fetchStates, 1500);
}

/* ============================================================
   RENDER
   ============================================================ */
function renderAll() {
    renderLights();
    renderCurtain();
    renderSources();
    renderAudio();
    renderDevices();
    updateHero();
}

function renderLights() {
    const g = document.getElementById('lightsGrid'); if (!g) return;
    g.innerHTML = CINEMA.lights.map(l => {
        const on = S.entities[l.id]?.state === 'on';
        return `<div class="lt ${on ? 'on' : ''}" data-id="${l.id}"><div class="lt-e">${l.emoji}</div><div class="lt-n">${l.name}</div><div class="lt-s">${on ? 'ON' : 'OFF'}</div></div>`;
    }).join('');
    g.querySelectorAll('.lt').forEach(t => t.addEventListener('click', () => toggleLight(t.dataset.id)));
}

function renderCurtain() {
    const e = S.entities[CINEMA.cover.id];
    const st = e?.state || 'unknown';
    const b = document.getElementById('curtainBadge');
    const v = document.getElementById('curVis');
    const lab = { open: 'פתוח', closed: 'סגור', opening: 'נפתח...', closing: 'נסגר...' };
    if (b) { b.textContent = lab[st] || st; b.className = 'badge ' + st; }
    if (v) { v.classList.remove('open', 'closed'); v.classList.add(st === 'open' || st === 'opening' ? 'open' : 'closed'); }
}

function renderSources() {
    const g = document.getElementById('sourcesGrid'); if (!g) return;
    g.innerHTML = CINEMA.sources.map(s => `<div class="src" data-id="${s.id}"><div class="src-e">${s.emoji}</div><div class="src-n">${s.name}</div></div>`).join('');
    g.querySelectorAll('.src').forEach(t => t.addEventListener('click', () => {
        g.querySelectorAll('.src').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        fireSource(t.dataset.id);
    }));
}

function renderAudio() {
    const e = S.entities[CINEMA.receiver.id]; if (!e) return;
    const vol = Math.round((e.attr.volume_level || 0) * 100);
    const muted = e.attr.is_volume_muted || false;
    const num = document.getElementById('volNum');
    const fill = document.getElementById('volFill');
    const knob = document.getElementById('volKnob');
    const range = document.getElementById('volRange');
    const mb = document.getElementById('vMute');
    if (num) num.textContent = muted ? 'MUTE' : `${vol}%`;
    if (fill) fill.style.width = `${vol}%`;
    if (knob) knob.style.right = `${vol}%`;
    if (range && !range.matches(':active')) range.value = vol;
    if (mb) mb.classList.toggle('muted', muted);
}

function renderDevices() {
    const g = document.getElementById('devicesGrid'); if (!g) return;
    const devs = [{ ...CINEMA.projector, emoji: '📽️' }, { ...CINEMA.receiver, emoji: '🔊' }, ...CINEMA.players];
    g.innerHTML = devs.map(d => {
        const st = S.entities[d.id]?.state || 'unavailable';
        const on = ['on', 'playing', 'idle', 'paused'].includes(st);
        return `<div class="dev ${on ? 'on' : 'off'}" data-id="${d.id}"><div class="dev-e">${d.emoji}</div><div class="dev-n">${d.name}</div><div class="dev-s">${on ? 'ON' : st === 'unavailable' ? '—' : 'OFF'}</div></div>`;
    }).join('');
    g.querySelectorAll('.dev').forEach(t => t.addEventListener('click', () => toggleDev(t.dataset.id)));
}

function updateHero() {
    const pOn = ['on', 'playing', 'idle'].includes(S.entities[CINEMA.projector.id]?.state);
    const rOn = ['on', 'playing', 'idle'].includes(S.entities[CINEMA.receiver.id]?.state);
    const cCl = S.entities[CINEMA.cover.id]?.state === 'closed';
    const lOff = CINEMA.lights.every(l => { const e = S.entities[l.id]; return !e || e.state === 'off' || e.state === 'unavailable'; });
    S.cinemaOn = pOn && rOn && cCl && lOff;

    const orb = document.getElementById('heroOrbit');
    const sub = document.getElementById('heroSub');
    const btn = document.getElementById('btnPower');
    const lab = document.getElementById('powerLabel');
    if (orb) orb.classList.toggle('on', S.cinemaOn);
    if (sub) { sub.textContent = S.cinemaOn ? 'פעיל' : 'מוכן'; sub.classList.toggle('on', S.cinemaOn); }
    if (btn) btn.classList.toggle('on', S.cinemaOn);
    if (lab) lab.textContent = S.cinemaOn ? 'כיבוי' : 'הפעלה';
}

/* ============================================================
   TOASTS
   ============================================================ */
function toast(msg, type = 'info') {
    const c = document.getElementById('toasts'); if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3000);
}

/* ============================================================
   UI UTILS
   ============================================================ */
function setOnline(on) {
    const d = document.getElementById('hdrDot');
    const l = document.getElementById('hdrLabel');
    if (d) d.classList.toggle('on', on);
    if (l) l.textContent = on ? 'מחובר' : 'מנותק';
}

function showView(id) {
    ['setup', 'loader', 'app'].forEach(v => document.getElementById(v)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

function startPoll() { if (S.poll) clearInterval(S.poll); S.poll = setInterval(fetchStates, 4000); }
function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }

/* ============================================================
   SETUP — Premier lancement
   ============================================================ */
function loadConfig() {
    S.haUrl = localStorage.getItem('onyx_ha_url') || 'https://na4kp2cjkejmeprgklgswxssuihm0ngr.ui.nabu.casa';
    S.haToken = localStorage.getItem('onyx_ha_token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjNDUxY2M1NmU0OTc0MTIxOTg5MDE2ZDAxZTQyYjkxYyIsImlhdCI6MTc3MjAxOTIzOCwiZXhwIjoyMDg3Mzc5MjM4fQ.J4p3A3Tj3Nil_n3l9nsD7RMxPa_6sDqlyrhk9HyZyKg';
}

function saveConfig(url, token) {
    S.haUrl = url.replace(/\/+$/, '');
    S.haToken = token;
    localStorage.setItem('onyx_ha_url', S.haUrl);
    localStorage.setItem('onyx_ha_token', S.haToken);
}

async function testConnection() {
    try {
        const res = await fetch(`${S.haUrl}/api/`, { headers: haHeaders() });
        return res.ok;
    } catch { return false; }
}

function initSetup() {
    const btn = document.getElementById('btnSetupConnect');
    const errEl = document.getElementById('setupError');

    btn?.addEventListener('click', async () => {
        const url = document.getElementById('inputUrl')?.value?.trim();
        const token = document.getElementById('inputToken')?.value?.trim();
        if (!url || !token) { errEl.textContent = 'נא למלא את כל השדות'; errEl.classList.remove('hidden'); return; }
        errEl.classList.add('hidden');
        btn.textContent = 'מתחבר...';
        btn.disabled = true;
        saveConfig(url, token);
        const ok = await testConnection();
        if (ok) {
            showView('loader');
            await launchApp();
        } else {
            errEl.textContent = 'שגיאת חיבור — בדוק את הכתובת והטוקן';
            errEl.classList.remove('hidden');
            btn.innerHTML = '<span class="setup-btn-glow"></span><span>התחבר</span>';
            btn.disabled = false;
        }
    });

    document.getElementById('btnSettings')?.addEventListener('click', () => {
        localStorage.removeItem('onyx_ha_url');
        localStorage.removeItem('onyx_ha_token');
        location.reload();
    });
}

/* ============================================================
   EVENTS
   ============================================================ */
function initEvents() {
    document.getElementById('btnPower')?.addEventListener('click', () => runScene(S.cinemaOn ? 'cinema_off' : 'cinema_on'));
    document.querySelectorAll('[data-scene]').forEach(b => b.addEventListener('click', () => { if (b.dataset.scene) runScene(b.dataset.scene); }));
    document.getElementById('btnLOn')?.addEventListener('click', () => allLights('turn_on'));
    document.getElementById('btnLOff')?.addEventListener('click', () => allLights('turn_off'));
    document.getElementById('cOpen')?.addEventListener('click', () => coverAction('open'));
    document.getElementById('cStop')?.addEventListener('click', () => coverAction('stop'));
    document.getElementById('cClose')?.addEventListener('click', () => coverAction('close'));
    document.getElementById('vDown')?.addEventListener('click', () => volStep('down'));
    document.getElementById('vUp')?.addEventListener('click', () => volStep('up'));
    document.getElementById('vMute')?.addEventListener('click', toggleMute);

    let vt;
    document.getElementById('volRange')?.addEventListener('input', e => {
        const v = parseInt(e.target.value);
        const f = document.getElementById('volFill');
        const k = document.getElementById('volKnob');
        const n = document.getElementById('volNum');
        if (f) f.style.width = `${v}%`;
        if (k) k.style.right = `${v}%`;
        if (n) n.textContent = `${v}%`;
        clearTimeout(vt);
        vt = setTimeout(() => setVol(v), 300);
    });

    document.getElementById('btnRefresh')?.addEventListener('click', () => { fetchStates(); toast('🔄 מרענן...', 'info'); });

    document.querySelectorAll('.mn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.mn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const map = { hero: 'pcHero', lights: 'lightsGrid', sources: 'sourcesGrid', audio: 'volNum' };
        const target = map[b.dataset.go];
        if (target) document.getElementById(target)?.closest('.glass-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopPoll();
        else { fetchStates(); startPoll(); }
    });
}

/* ============================================================
   LAUNCH
   ============================================================ */
async function launchApp() {
    initEvents();
    await fetchStates();
    showView('app');
    startPoll();
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
    loadConfig();
    showView('loader');
    saveConfig(S.haUrl, S.haToken);
    await launchApp();
}

document.addEventListener('DOMContentLoaded', init);
