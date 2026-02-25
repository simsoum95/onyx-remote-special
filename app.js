/**
 * ONYX REMOTE SPECIAL — PWA Standalone
 * Toutes les requêtes passent par /api/ha (proxy Vercel) — zéro CORS.
 */

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

const S = { entities: {}, cinemaOn: false, busy: false, poll: null };

/* ============================================================
   API — Toutes les requêtes passent par le proxy Vercel
   ============================================================ */
async function haGet(path) {
    const res = await fetch(`/api/ha?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function haPost(path, body) {
    const res = await fetch(`/api/ha?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function fetchStates() {
    try {
        const all = await haGet('/api/states');
        for (const s of all) {
            if (ALL_IDS.includes(s.entity_id)) {
                S.entities[s.entity_id] = { state: s.state, attr: s.attributes || {} };
            }
        }
        setOnline(true);
        renderAll();
        return true;
    } catch (e) {
        console.error('[Onyx] fetch error:', e);
        setOnline(false);
        return false;
    }
}

async function callSvc(domain, service, data) {
    try {
        await haPost(`/api/services/${domain}/${service}`, data);
        return true;
    } catch (e) {
        console.error('[Onyx] service error:', e);
        return false;
    }
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

    try {
        if (name === 'cinema_on') {
            await Promise.all(CINEMA.lights.map(l => callSvc('light', 'turn_off', { entity_id: l.id })));
            await callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id });
            await callSvc('media_player', 'turn_on', { entity_id: CINEMA.projector.id });
            await callSvc('media_player', 'turn_on', { entity_id: CINEMA.receiver.id });
            await sleep(3000);
            await fetchStates();
            const pOk = ['on','playing','idle'].includes(S.entities[CINEMA.projector.id]?.state);
            if (!pOk) { await callSvc('media_player', 'turn_on', { entity_id: CINEMA.projector.id }); await sleep(2000); }
            const rOk = ['on','playing','idle'].includes(S.entities[CINEMA.receiver.id]?.state);
            if (!rOk) { await callSvc('media_player', 'turn_on', { entity_id: CINEMA.receiver.id }); await sleep(2000); }
        } else if (name === 'cinema_off') {
            await callSvc('media_player', 'turn_off', { entity_id: CINEMA.projector.id });
            await callSvc('media_player', 'turn_off', { entity_id: CINEMA.receiver.id });
            await sleep(1000);
            await callSvc('cover', 'open_cover', { entity_id: CINEMA.cover.id });
            await callSvc('light', 'turn_on', { entity_id: 'light.8a_cinema_basement_big_spots_switch' });
        } else if (name === 'ambient') {
            await Promise.all([
                callSvc('light', 'turn_off', { entity_id: 'light.7b_cinema_basement_smallspot_switch' }),
                callSvc('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_big_spots_switch' }),
                callSvc('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_wall_switch' }),
                callSvc('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' }),
                callSvc('light', 'turn_on', { entity_id: 'light.9a_cinema_basement_posterwall_switch' }),
            ]);
            await callSvc('cover', 'open_cover', { entity_id: CINEMA.cover.id });
        } else if (name === 'pause') {
            await callSvc('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' });
        }
        await fetchStates();
        toast(sceneMsg(name, 'ok'), 'success');
    } catch { toast('שגיאה בהפעלה', 'error'); }

    S.busy = false;
    if (btn) btn.classList.remove('loading');
}

function sceneMsg(s, t) {
    const M = {
        cinema_on:  { go:'🎬 מפעיל קולנוע...', ok:'🎬 קולנוע פעיל!' },
        cinema_off: { go:'🔴 מכבה...', ok:'🔴 הקולנוע כבוי' },
        ambient:    { go:'✨ מצב אווירה...', ok:'✨ אווירה פעילה' },
        pause:      { go:'⏸ הפסקה...', ok:'⏸ תאורת הפסקה' },
    };
    return M[s]?.[t] || s;
}

/* ============================================================
   ACTIONS
   ============================================================ */
async function toggleLight(id) {
    const svc = S.entities[id]?.state === 'on' ? 'turn_off' : 'turn_on';
    await callSvc('light', svc, { entity_id: id });
    setTimeout(fetchStates, 1200);
}

async function coverAction(a) {
    const svc = a === 'open' ? 'open_cover' : a === 'close' ? 'close_cover' : 'stop_cover';
    await callSvc('cover', svc, { entity_id: CINEMA.cover.id });
    setTimeout(fetchStates, 2000);
}

async function toggleDev(id) {
    const on = ['on','playing','idle','paused'].includes(S.entities[id]?.state);
    await callSvc('media_player', on ? 'turn_off' : 'turn_on', { entity_id: id });
    setTimeout(fetchStates, 3000);
}

async function fireSource(id) {
    await callSvc('script', 'turn_on', { entity_id: id });
    toast('🎯 מקור הופעל', 'success');
    setTimeout(fetchStates, 3000);
}

async function volStep(dir) {
    await callSvc('media_player', dir === 'up' ? 'volume_up' : 'volume_down', { entity_id: CINEMA.receiver.id });
    setTimeout(fetchStates, 800);
}

async function setVol(v) {
    await callSvc('media_player', 'volume_set', { entity_id: CINEMA.receiver.id, volume_level: v / 100 });
}

async function toggleMute() {
    const m = S.entities[CINEMA.receiver.id]?.attr?.is_volume_muted || false;
    await callSvc('media_player', 'volume_mute', { entity_id: CINEMA.receiver.id, is_volume_muted: !m });
    setTimeout(fetchStates, 800);
}

async function allLights(svc) {
    await Promise.all(CINEMA.lights.map(l => callSvc('light', svc, { entity_id: l.id })));
    toast(svc === 'turn_on' ? '💡 הכל דלוק' : '🌑 הכל כבוי', 'success');
    setTimeout(fetchStates, 1500);
}

/* ============================================================
   RENDER
   ============================================================ */
function renderAll() {
    renderStatusBar();
    renderLights();
    renderCurtain();
    renderSources();
    renderAudio();
    renderDevices();
    updateHero();
}

function isOn(id) { return ['on','playing','idle','paused'].includes(S.entities[id]?.state); }

function renderStatusBar() {
    const pOn = isOn(CINEMA.projector.id);
    const rOn = isOn(CINEMA.receiver.id);
    const cState = S.entities[CINEMA.cover.id]?.state || 'unknown';
    const lightsOn = CINEMA.lights.filter(l => S.entities[l.id]?.state === 'on').length;
    const lightsTotal = CINEMA.lights.length;

    setStatItem('statProjector', pOn, pOn ? 'דלוק' : 'כבוי');
    setStatItem('statReceiver', rOn, rOn ? 'דלוק' : 'כבוי');
    const cLabels = { open:'פתוח', closed:'סגור', opening:'נפתח', closing:'נסגר' };
    setStatItem('statCurtain', cState === 'open', cLabels[cState] || cState);
    setStatItem('statLights', lightsOn > 0, `${lightsOn}/${lightsTotal}`);

    const countEl = document.getElementById('lightsCount');
    if (countEl) countEl.textContent = lightsOn > 0 ? `(${lightsOn} דלוקות)` : '';
}

function setStatItem(elId, on, text) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.toggle('on', on);
    el.classList.toggle('off', !on);
    const val = el.querySelector('.stat-val');
    if (val) val.textContent = text;
}

function renderLights() {
    const g = document.getElementById('lightsGrid'); if (!g) return;
    g.innerHTML = CINEMA.lights.map(l => {
        const on = S.entities[l.id]?.state === 'on';
        return `<div class="lt ${on ? 'on' : ''}" data-id="${l.id}"><div class="lt-e">${l.emoji}</div><div class="lt-n">${l.name}</div><div class="lt-s">${on ? 'דלוק' : 'כבוי'}</div></div>`;
    }).join('');
    g.querySelectorAll('.lt').forEach(t => t.addEventListener('click', () => toggleLight(t.dataset.id)));
}

function renderCurtain() {
    const st = S.entities[CINEMA.cover.id]?.state || 'unknown';
    const b = document.getElementById('curtainBadge');
    const v = document.getElementById('curVis');
    const lab = { open:'פתוח', closed:'סגור', opening:'נפתח...', closing:'נסגר...' };
    if (b) { b.textContent = lab[st] || st; b.className = 'badge ' + st; }
    if (v) { v.classList.remove('open','closed'); v.classList.add(st === 'open' || st === 'opening' ? 'open' : 'closed'); }
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
    const devs = [{ ...CINEMA.projector, emoji:'📽️' }, { ...CINEMA.receiver, emoji:'🔊' }, ...CINEMA.players];
    g.innerHTML = devs.map(d => {
        const st = S.entities[d.id]?.state || 'unavailable';
        const on = ['on','playing','idle','paused'].includes(st);
        return `<div class="dev ${on ? 'on' : 'off'}" data-id="${d.id}"><div class="dev-e">${d.emoji}</div><div class="dev-n">${d.name}</div><div class="dev-s">${on ? 'דלוק' : st === 'unavailable' ? '—' : 'כבוי'}</div></div>`;
    }).join('');
    g.querySelectorAll('.dev').forEach(t => t.addEventListener('click', () => toggleDev(t.dataset.id)));
}

function updateHero() {
    const pOn = isOn(CINEMA.projector.id);
    const rOn = isOn(CINEMA.receiver.id);
    const cCl = S.entities[CINEMA.cover.id]?.state === 'closed';
    const lOff = CINEMA.lights.every(l => { const e = S.entities[l.id]; return !e || e.state === 'off' || e.state === 'unavailable'; });
    S.cinemaOn = pOn && rOn && cCl && lOff;

    const orb = document.getElementById('heroOrbit');
    const sub = document.getElementById('heroSub');
    const btn = document.getElementById('btnPower');
    const lab = document.getElementById('powerLabel');
    if (orb) orb.classList.toggle('on', S.cinemaOn);
    if (sub) { sub.textContent = S.cinemaOn ? '🟢 פעיל' : 'מוכן'; sub.classList.toggle('on', S.cinemaOn); }
    if (btn) btn.classList.toggle('on', S.cinemaOn);
    if (lab) lab.textContent = S.cinemaOn ? 'כיבוי' : 'הפעלה';

    const hlP = document.getElementById('hlProjector');
    const hlR = document.getElementById('hlReceiver');
    const hlC = document.getElementById('hlCurtain');
    const hlL = document.getElementById('hlLights');
    const lightsOn = CINEMA.lights.filter(l => S.entities[l.id]?.state === 'on').length;
    const cState = S.entities[CINEMA.cover.id]?.state;
    const cLabels = { open:'פתוח', closed:'סגור', opening:'נפתח', closing:'נסגר' };

    if (hlP) { hlP.textContent = pOn ? '🟢 דלוק' : '🔴 כבוי'; hlP.className = 'hl-val ' + (pOn ? 'hl-on' : 'hl-off'); }
    if (hlR) { hlR.textContent = rOn ? '🟢 דלוק' : '🔴 כבוי'; hlR.className = 'hl-val ' + (rOn ? 'hl-on' : 'hl-off'); }
    if (hlC) { hlC.textContent = cLabels[cState] || '—'; hlC.className = 'hl-val ' + (cState === 'closed' ? 'hl-on' : 'hl-off'); }
    if (hlL) { hlL.textContent = lightsOn === 0 ? '🟢 הכל כבוי' : `🟡 ${lightsOn} דלוקות`; hlL.className = 'hl-val ' + (lightsOn === 0 ? 'hl-on' : 'hl-warn'); }
}

/* ============================================================
   UI
   ============================================================ */
function toast(msg, type = 'info') {
    const c = document.getElementById('toasts'); if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`; t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3000);
}

function setOnline(on) {
    const d = document.getElementById('hdrDot');
    const l = document.getElementById('hdrLabel');
    if (d) d.classList.toggle('on', on);
    if (l) l.textContent = on ? 'מחובר' : 'מנותק';
}

function showView(id) {
    ['loader', 'app'].forEach(v => document.getElementById(v)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

function startPoll() { if (S.poll) clearInterval(S.poll); S.poll = setInterval(fetchStates, 5000); }

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
        const f = document.getElementById('volFill'), k = document.getElementById('volKnob'), n = document.getElementById('volNum');
        if (f) f.style.width = `${v}%`;
        if (k) k.style.right = `${v}%`;
        if (n) n.textContent = `${v}%`;
        clearTimeout(vt); vt = setTimeout(() => setVol(v), 300);
    });

    document.getElementById('btnRefresh')?.addEventListener('click', () => { fetchStates(); toast('🔄 מרענן...', 'info'); });

    document.querySelectorAll('.mn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.mn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const map = { hero:'pcHero', lights:'lightsGrid', sources:'sourcesGrid', audio:'volNum' };
        const t = map[b.dataset.go];
        if (t) document.getElementById(t)?.closest('.glass-card')?.scrollIntoView({ behavior:'smooth', block:'start' });
    }));

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(S.poll);
        else { fetchStates(); startPoll(); }
    });
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
    showView('loader');
    initEvents();
    const ok = await fetchStates();
    showView('app');
    if (ok) {
        startPoll();
    } else {
        toast('⚠️ שגיאת חיבור — בודק שוב...', 'error');
        setTimeout(async () => { await fetchStates(); startPoll(); }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', init);
