/**
 * ONYX REMOTE SPECIAL — PWA Standalone
 * Toutes les requêtes passent par /api/ha (proxy Vercel) — zéro CORS.
 * Clic source/app = allumage auto complet + lancement.
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
    projector: { id: 'media_player.epson', name: 'מקרן Epson' },
    players: [
        { id: 'media_player.shield', name: 'Shield', emoji: '🛡️' },
        { id: 'media_player.shield_2', name: 'Shield 2', emoji: '🛡️' },
        { id: 'media_player.qvlnv_byty', name: 'Apple TV', emoji: '🍎' },
    ],
    sources: [
        { id: 'script.unknown_4', name: 'Netflix', emoji: '🎬' },
        { id: 'script.unknown_8', name: 'Apple TV', emoji: '📺' },
        { id: 'script.unknown_5', name: 'Fox', emoji: '🦊' },
        { id: 'script.unknown_7', name: 'Paramount+', emoji: '⭐' },
        { id: 'script.unknown_6', name: 'PlayStation', emoji: '🎮' },
    ],
    apps: [
        { name: 'Free TV', pkg: 'com.freetv.player', emoji: '📡' },
        { name: 'Netflix', pkg: 'com.netflix.ninja', emoji: '🎬' },
        { name: 'YouTube', pkg: 'com.google.android.youtube.tv', emoji: '▶️' },
        { name: 'Plex', pkg: 'com.plexapp.android', emoji: '🎞️' },
        { name: 'Kodi', pkg: 'org.xbmc.kodi', emoji: '🏠' },
        { name: 'Disney+', pkg: 'com.disney.disneyplus', emoji: '🏰' },
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
   API
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
function isOn(id) { return ['on','playing','idle','paused'].includes(S.entities[id]?.state); }

const MAX_RETRIES = 3;
const VERIFY_DELAY = 2000;
const RETRY_DELAY = 2500;

/* ============================================================
   APPEL AVEC RETRY TRIPLE — même logique que Onyx Home
   ============================================================ */
async function callWithRetry(domain, service, entityId, data, expectedStates) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        toast(`⚡ ${entityId.split('.')[1]} — ניסיון ${attempt}/${MAX_RETRIES}...`, 'info');

        await callSvc(domain, service, { entity_id: entityId, ...data });
        await sleep(VERIFY_DELAY);

        await fetchStates();
        const state = S.entities[entityId]?.state;

        if (expectedStates.includes(state)) {
            toast(`✅ ${entityId.split('.')[1]} → ${state}`, 'success');
            return true;
        }

        console.warn(`[Onyx] ${entityId}: ${state} ≠ ${expectedStates} (attempt ${attempt}/${MAX_RETRIES})`);

        if (attempt < MAX_RETRIES) {
            toast(`⚠️ לא הצליח, מנסה שוב...`, 'error');
            await sleep(RETRY_DELAY);
        }
    }

    toast(`❌ ${entityId.split('.')[1]} לא הגיב`, 'error');
    return false;
}

/* ============================================================
   CINEMA ON — Séquence orchestrée avec vérification triple
   ============================================================ */
async function ensureCinemaOn() {
    const pOn = isOn(CINEMA.projector.id);
    const rOn = isOn(CINEMA.receiver.id);
    if (pOn && rOn) return true;

    toast('🎬 מפעיל קולנוע...', 'info');

    await Promise.all(CINEMA.lights.map(l => callSvc('light', 'turn_off', { entity_id: l.id })));
    await callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id });

    if (!pOn) {
        await callWithRetry('media_player', 'turn_on', CINEMA.projector.id, {}, ['on','idle','playing']);
    }
    if (!rOn) {
        await callWithRetry('media_player', 'turn_on', CINEMA.receiver.id, {}, ['on','idle','playing']);
    }

    await fetchStates();
    toast('🎬 קולנוע פעיל!', 'success');
    return true;
}

/* ============================================================
   SCENES
   ============================================================ */
async function runScene(name) {
    if (S.busy) return;
    S.busy = true;
    setBusy(true);

    try {
        if (name === 'cinema_on') {
            await ensureCinemaOn();
        } else if (name === 'cinema_off') {
            toast('🔴 מכבה...', 'info');
            await callWithRetry('media_player', 'turn_off', CINEMA.projector.id, {}, ['off','standby','unavailable']);
            await callWithRetry('media_player', 'turn_off', CINEMA.receiver.id, {}, ['off','standby','unavailable']);
            await callSvc('light', 'turn_on', { entity_id: 'light.8a_cinema_basement_big_spots_switch' });
            await fetchStates();
            toast('🔴 הקולנוע כבוי', 'success');
        } else if (name === 'ambient') {
            toast('✨ מצב אווירה...', 'info');
            await Promise.all([
                callSvc('light', 'turn_off', { entity_id: 'light.7b_cinema_basement_smallspot_switch' }),
                callSvc('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_big_spots_switch' }),
                callSvc('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_wall_switch' }),
                callSvc('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' }),
                callSvc('light', 'turn_on', { entity_id: 'light.9a_cinema_basement_posterwall_switch' }),
            ]);
            await fetchStates();
            toast('✨ אווירה פעילה', 'success');
        } else if (name === 'pause') {
            toast('⏸ הפסקה...', 'info');
            await callSvc('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' });
            await fetchStates();
            toast('⏸ תאורת הפסקה', 'success');
        }
    } catch { toast('שגיאה בהפעלה', 'error'); }

    S.busy = false;
    setBusy(false);
}

/* ============================================================
   SOURCE = allume tout + change source
   ============================================================ */
async function smartSource(scriptId, name) {
    if (S.busy) return;
    S.busy = true;
    setBusy(true);
    toast(`🎯 ${name}...`, 'info');

    try {
        await ensureCinemaOn();
        await callSvc('script', 'turn_on', { entity_id: scriptId });
        await sleep(2000);
        await fetchStates();
        toast(`✅ ${name} פעיל!`, 'success');
    } catch { toast('שגיאה', 'error'); }

    S.busy = false;
    setBusy(false);
}

/* ============================================================
   APP = allume tout + lance l'app sur le Shield
   ============================================================ */
async function smartApp(pkg, name) {
    if (S.busy) return;
    S.busy = true;
    setBusy(true);
    toast(`📱 ${name}...`, 'info');

    try {
        await ensureCinemaOn();

        const ok = await callSvc('remote', 'turn_on', {
            entity_id: 'remote.shield',
            activity: pkg,
        });
        if (!ok) {
            await callSvc('androidtv', 'adb_command', {
                entity_id: 'media_player.shield',
                command: `am start -a android.intent.action.VIEW -n ${pkg}`,
            });
        }
        await sleep(2000);
        await fetchStates();
        toast(`✅ ${name} פעיל!`, 'success');
    } catch { toast('שגיאה', 'error'); }

    S.busy = false;
    setBusy(false);
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

async function devOn(id) {
    await callWithRetry('media_player', 'turn_on', id, {}, ['on','idle','playing']);
}

async function devOff(id) {
    await callWithRetry('media_player', 'turn_off', id, {}, ['off','standby','unavailable']);
}

async function toggleDev(id) {
    const on = isOn(id);
    await callSvc('media_player', on ? 'turn_off' : 'turn_on', { entity_id: id });
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
    renderProjectorStatus();
    renderLights();
    renderCurtain();
    renderSources();
    renderApps();
    renderAudio();
    renderDevices();
    updateHero();
}

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

function renderProjectorStatus() {
    const pOn = isOn(CINEMA.projector.id);
    const rOn = isOn(CINEMA.receiver.id);
    const el = document.getElementById('projectorPanel');
    if (!el) return;

    el.innerHTML = `
        <div class="proj-row">
            <div class="proj-device ${pOn ? 'on' : 'off'}">
                <span class="proj-dot"></span>
                <span class="proj-icon">📽️</span>
                <span class="proj-name">מקרן</span>
                <span class="proj-state">${pOn ? 'דלוק' : 'כבוי'}</span>
            </div>
            <div class="proj-btns">
                <button class="pbtn pbtn-on" data-id="${CINEMA.projector.id}" data-act="on">הפעלה</button>
                <button class="pbtn pbtn-off" data-id="${CINEMA.projector.id}" data-act="off">כיבוי</button>
            </div>
        </div>
        <div class="proj-row">
            <div class="proj-device ${rOn ? 'on' : 'off'}">
                <span class="proj-dot"></span>
                <span class="proj-icon">🔊</span>
                <span class="proj-name">מגבר</span>
                <span class="proj-state">${rOn ? 'דלוק' : 'כבוי'}</span>
            </div>
            <div class="proj-btns">
                <button class="pbtn pbtn-on" data-id="${CINEMA.receiver.id}" data-act="on">הפעלה</button>
                <button class="pbtn pbtn-off" data-id="${CINEMA.receiver.id}" data-act="off">כיבוי</button>
            </div>
        </div>`;

    el.querySelectorAll('.pbtn').forEach(b => {
        b.addEventListener('click', e => {
            e.stopPropagation();
            b.dataset.act === 'on' ? devOn(b.dataset.id) : devOff(b.dataset.id);
        });
    });
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
    g.innerHTML = CINEMA.sources.map(s =>
        `<div class="src" data-id="${s.id}" data-name="${s.name}"><div class="src-e">${s.emoji}</div><div class="src-n">${s.name}</div></div>`
    ).join('');
    g.querySelectorAll('.src').forEach(t => t.addEventListener('click', () => {
        g.querySelectorAll('.src').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        smartSource(t.dataset.id, t.dataset.name);
    }));
}

function renderApps() {
    const g = document.getElementById('appsGrid'); if (!g) return;
    g.innerHTML = CINEMA.apps.map(a =>
        `<div class="app-tile" data-pkg="${a.pkg}" data-name="${a.name}"><div class="app-e">${a.emoji}</div><div class="app-n">${a.name}</div></div>`
    ).join('');
    g.querySelectorAll('.app-tile').forEach(t => t.addEventListener('click', () => smartApp(t.dataset.pkg, t.dataset.name)));
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
    g.innerHTML = CINEMA.players.map(d => {
        const st = S.entities[d.id]?.state || 'unavailable';
        const on = isOn(d.id);
        return `<div class="dev ${on ? 'on' : 'off'}" data-id="${d.id}"><div class="dev-e">${d.emoji}</div><div class="dev-n">${d.name}</div><div class="dev-s">${on ? 'דלוק' : st === 'unavailable' ? '—' : 'כבוי'}</div></div>`;
    }).join('');
    g.querySelectorAll('.dev').forEach(t => t.addEventListener('click', () => toggleDev(t.dataset.id)));
}

function updateHero() {
    const pOn = isOn(CINEMA.projector.id);
    const rOn = isOn(CINEMA.receiver.id);
    S.cinemaOn = pOn && rOn;

    const orb = document.getElementById('heroOrbit');
    const sub = document.getElementById('heroSub');
    const btn = document.getElementById('btnPower');
    const lab = document.getElementById('powerLabel');
    if (orb) orb.classList.toggle('on', S.cinemaOn);
    if (sub) { sub.textContent = S.cinemaOn ? '🟢 קולנוע פעיל' : '⚫ קולנוע כבוי'; sub.classList.toggle('on', S.cinemaOn); }
    if (btn) btn.classList.toggle('on', S.cinemaOn);
    if (lab) lab.textContent = S.cinemaOn ? 'כיבוי' : 'הפעלה';
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

function setBusy(on) {
    const btn = document.getElementById('btnPower');
    if (btn) btn.classList.toggle('loading', on);
    document.body.classList.toggle('busy', on);
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
