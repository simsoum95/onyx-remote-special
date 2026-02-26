/**
 * ONYX REMOTE — Interface Minimale
 * 4 onglets : Cinema / Apps / Remote / Salle
 */

const RECEIVER = 'media_player.receiver';
const PROJECTOR = 'media_player.epson';
const SHIELD = 'remote.shield';
const SHIELD_MP = 'media_player.shield_2';
const SHIELD_ADB = 'media_player.android_tv_192_168_1_80';

const APPS = [
    { name: 'FreeTV', pkg: 'tv.freetv.androidtv', logo: '/img/freetv.png' },
    { name: 'Netflix', pkg: 'com.netflix.ninja', logo: 'https://cdn.simpleicons.org/netflix/E50914' },
    { name: 'Plex', pkg: 'com.plexapp.android', logo: 'https://cdn.simpleicons.org/plex/E5A00D' },
    { name: 'YouTube', pkg: 'com.google.android.youtube.tv', logo: 'https://cdn.simpleicons.org/youtube/FF0000' },
    { name: 'Prime Video', pkg: 'com.amazon.amazonvideo.livingroom', logo: '/img/prime.png' },
    { name: 'Apple TV', pkg: 'com.apple.atve.androidtv.appletv', logo: 'https://cdn.simpleicons.org/appletv/FFFFFF' },
    { name: 'Disney+', pkg: 'com.disney.disneyplus', logo: '/img/disney.png' },
    { name: 'Spotify', pkg: 'com.spotify.tv.android', logo: 'https://cdn.simpleicons.org/spotify/1DB954' },
    { name: 'PS5', pkg: null, input: 'GAME', logo: 'https://cdn.simpleicons.org/playstation/FFFFFF', console: true },
];

const CINEMA = {
    lights: [
        { id: 'light.7b_cinema_basement_smallspot_switch', name: 'ספוטים', emoji: '💡' },
        { id: 'light.7b_cinema_basement_led_switch', name: 'לד ארכיטקט', emoji: '🔵' },
        { id: 'light.8a_cinema_basement_big_spots_switch', name: 'ספוטים גדולים', emoji: '🔆' },
        { id: 'light.9a_cinema_basement_posterwall_switch', name: 'פוסטרים', emoji: '🖼️' },
        { id: 'light.8a_cinema_basement_wall_switch', name: 'קיר', emoji: '🏮' },
    ],
    cover: { id: 'cover.cinema_curtains' },
    speakers: [
        { id: 'media_player.livinig_room', name: 'סלון', emoji: '🔈' },
        { id: 'media_player.balcony', name: 'מרפסת', emoji: '🌙' },
        { id: 'media_player.office', name: 'משרד', emoji: '💼' },
        { id: 'media_player.parents', name: 'הורים', emoji: '🛏️' },
    ],
};

const ALL_IDS = [
    ...CINEMA.lights.map(l => l.id),
    CINEMA.cover.id,
    RECEIVER, PROJECTOR, SHIELD, SHIELD_MP, SHIELD_ADB,
    ...CINEMA.speakers.map(s => s.id),
];

const S = { entities: {}, cinemaOn: false, busy: false, busyTimer: null, poll: null, lastVol: 30, volDragging: false, tab: 'apps' };

function lockBusy() {
    S.busy = true; setBusy(true);
    clearTimeout(S.busyTimer);
    S.busyTimer = setTimeout(() => { S.busy = false; setBusy(false); toast('🔓 נעילה שוחררה', 'info'); }, 45000);
}
function unlockBusy() { S.busy = false; setBusy(false); clearTimeout(S.busyTimer); }

/* ============================================================
   API
   ============================================================ */
async function haGet(path) {
    const r = await fetch(`/api/ha?path=${encodeURIComponent(path)}`);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

async function haPost(path, body) {
    const r = await fetch(`/api/ha?path=${encodeURIComponent(path)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

async function fetchStates() {
    try {
        const all = await haGet('/api/states');
        for (const s of all) {
            if (ALL_IDS.includes(s.entity_id))
                S.entities[s.entity_id] = { state: s.state, attr: s.attributes || {} };
        }
        setOnline(true); renderAll(); return true;
    } catch (e) { console.error('[Onyx]', e); setOnline(false); return false; }
}

async function callSvc(domain, service, data) {
    try { await haPost(`/api/services/${domain}/${service}`, data); return true; }
    catch (e) { console.error('[Onyx]', e); return false; }
}

async function adb(cmd) {
    return callSvc('androidtv', 'adb_command', { entity_id: SHIELD_ADB, command: cmd });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isOn(id) { return ['on', 'playing', 'idle', 'paused'].includes(S.entities[id]?.state); }
function isProjectorOn() { return isOn(PROJECTOR); }
function isReceiverOn() { return isOn(RECEIVER); }

function getShieldApp() {
    const raw = S.entities[SHIELD_ADB]?.attr?.app_id
        || S.entities[SHIELD_MP]?.attr?.app_name
        || S.entities[SHIELD]?.attr?.current_activity || null;
    if (!raw || raw === 'com.google.android.backdrop' || raw === 'com.google.android.tvlauncher') return null;
    return raw;
}

/* ============================================================
   CONTRÔLE ADB
   ============================================================ */
async function adbLaunch(pkg) {
    await adb(`monkey -p ${pkg} -c android.intent.category.LEANBACK_LAUNCHER 1 2>/dev/null || monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
}
async function adbKey(k) { await adb(`input keyevent ${k}`); }

/* ============================================================
   CONTRÔLE RÉSEAU
   ============================================================ */
async function projectorOn() {
    toast('📽️ מדליק מקרן...', 'info');
    await callSvc('media_player', 'turn_on', { entity_id: PROJECTOR });
    for (let i = 0; i < 8; i++) {
        await sleep(3000); await fetchStates();
        if (isProjectorOn()) { toast('✅ מקרן דלוק!', 'success'); return true; }
    }
    toast('⚠️ בדוק מקרן', 'error'); return false;
}

async function projectorOff() {
    await callSvc('media_player', 'turn_off', { entity_id: PROJECTOR });
    toast('🔴 מקרן כבוי', 'success');
    setTimeout(fetchStates, 5000);
}

async function receiverOn() {
    toast('🔊 מדליק מגבר...', 'info');
    await callSvc('media_player', 'turn_on', { entity_id: RECEIVER });
    await sleep(3000); await fetchStates();
    toast(isReceiverOn() ? '✅ מגבר דלוק!' : '⚠️ בדוק מגבר', isReceiverOn() ? 'success' : 'error');
    return isReceiverOn();
}

async function receiverOff() {
    await callSvc('media_player', 'turn_off', { entity_id: RECEIVER });
    toast('🔴 מגבר כבוי', 'success');
    setTimeout(fetchStates, 3000);
}

async function setInput(src) {
    await callSvc('media_player', 'select_source', { entity_id: RECEIVER, source: src });
}

/* ============================================================
   CINEMA — Allumage complet
   ============================================================ */
async function ensureCinema() {
    const need = !isProjectorOn() || !isReceiverOn();
    const tasks = [
        callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id }),
        adbKey('KEYCODE_WAKEUP'),
    ];
    if (!isProjectorOn()) tasks.push(callSvc('media_player', 'turn_on', { entity_id: PROJECTOR }));
    if (!isReceiverOn()) tasks.push(callSvc('media_player', 'turn_on', { entity_id: RECEIVER }));
    await Promise.all(tasks);
    if (need) await sleep(5000);
    else await sleep(500);
    await Promise.all([
        setInput('BD/DVD'),
        callSvc('media_player', 'select_source', { entity_id: PROJECTOR, source: 'HDMI1' }),
    ]);
    await sleep(500);
}

/* ============================================================
   SMART SOURCE
   ============================================================ */
async function smartSource(app) {
    if (S.busy) return;
    lockBusy();
    toast(`🎬 ${app.name} — מפעיל...`, 'info');
    try {
        await ensureCinema();
        await adbLaunch(app.pkg);
        await sleep(3000); await fetchStates();
        toast(`✅ ${app.name} — מוכן!`, 'success');
    } catch (e) { console.error(e); toast('⚠️ שגיאה', 'error'); }
    unlockBusy();
}

async function smartConsole(app) {
    if (S.busy) return;
    lockBusy();
    toast(`🎮 ${app.name} — מפעיל...`, 'info');
    try {
        const tasks = [
            callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id }),
        ];
        if (!isProjectorOn()) tasks.push(callSvc('media_player', 'turn_on', { entity_id: PROJECTOR }));
        if (!isReceiverOn()) tasks.push(callSvc('media_player', 'turn_on', { entity_id: RECEIVER }));
        await Promise.all(tasks);
        await sleep(5000);
        await Promise.all([
            setInput(app.input),
            callSvc('media_player', 'select_source', { entity_id: PROJECTOR, source: 'HDMI1' }),
        ]);
        await sleep(2000); await fetchStates();
        toast(`✅ ${app.name} — מוכן!`, 'success');
    } catch (e) { console.error(e); toast('⚠️ שגיאה', 'error'); }
    unlockBusy();
}

async function openFreeTV() {
    if (S.busy) return;
    lockBusy();
    toast('📺 FreeTV — מפעיל...', 'info');
    try {
        await ensureCinema();
        await adbLaunch('tv.freetv.androidtv');
        await sleep(4000); await fetchStates();
        toast('✅ FreeTV פתוח!', 'success');
    } catch (e) { console.error(e); toast('⚠️ שגיאה', 'error'); }
    unlockBusy();
}

/* ============================================================
   SCENES
   ============================================================ */
async function runScene(name) {
    if (S.busy) return;
    lockBusy();
    try {
        if (name === 'cinema_on') {
            toast('🎬 מפעיל קולנוע...', 'info');
            await ensureCinema();
            await fetchStates();
            toast('✅ קולנוע מוכן!', 'success');
        } else if (name === 'cinema_off') {
            toast('🔴 מכבה הכל...', 'info');
            await Promise.all([
                callSvc('media_player', 'turn_off', { entity_id: PROJECTOR }),
                callSvc('media_player', 'turn_off', { entity_id: RECEIVER }),
                adbKey('KEYCODE_SLEEP'),
                callSvc('light', 'turn_on', { entity_id: 'light.8a_cinema_basement_big_spots_switch' }),
            ]);
            await sleep(3000); await fetchStates();
            toast('🔴 הקולנוע כבוי', 'success');
        } else if (name === 'film') {
            toast('🎬 מצב סרט...', 'info');
            await Promise.all([
                callSvc('light', 'turn_off', { entity_id: 'light.7b_cinema_basement_smallspot_switch' }),
                callSvc('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_big_spots_switch' }),
                callSvc('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_wall_switch' }),
                callSvc('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' }),
                callSvc('light', 'turn_on', { entity_id: 'light.9a_cinema_basement_posterwall_switch' }),
            ]);
            await fetchStates();
            toast('🎬 מצב סרט פעיל', 'success');
        } else if (name === 'sport') {
            toast('⚽ מצב ספורט...', 'info');
            await Promise.all([
                callSvc('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_led_switch' }),
                callSvc('light', 'turn_on', { entity_id: 'light.7b_cinema_basement_smallspot_switch' }),
                callSvc('light', 'turn_off', { entity_id: 'light.8a_cinema_basement_big_spots_switch' }),
            ]);
            await fetchStates();
            toast('⚽ מצב ספורט פעיל', 'success');
        }
    } catch { toast('שגיאה', 'error'); }
    unlockBusy();
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
    const svc = a === 'open' ? 'open_cover' : 'close_cover';
    await callSvc('cover', svc, { entity_id: CINEMA.cover.id });
    toast(a === 'open' ? '🎭 פותח וילון...' : '🎭 סוגר וילון...', 'info');
    setTimeout(fetchStates, 2000);
}

async function devOn(id) {
    if (id === PROJECTOR) return projectorOn();
    if (id === RECEIVER) return receiverOn();
    await callSvc('media_player', 'turn_on', { entity_id: id });
    toast('⚡ הופעל', 'success');
    setTimeout(fetchStates, 3000);
}

async function devOff(id) {
    if (id === PROJECTOR) return projectorOff();
    if (id === RECEIVER) return receiverOff();
    await callSvc('media_player', 'turn_off', { entity_id: id });
    toast('🔴 כובה', 'success');
    setTimeout(fetchStates, 3000);
}

async function volStep(dir) {
    const svc = dir === 'up' ? 'volume_up' : 'volume_down';
    await callSvc('media_player', svc, { entity_id: RECEIVER });
    S.lastVol = Math.max(0, Math.min(100, (S.lastVol || 30) + (dir === 'up' ? 2 : -2)));
    renderAudio();
    setTimeout(fetchStates, 1000);
}

async function setVol(v) {
    S.lastVol = v;
    await callSvc('media_player', 'volume_set', { entity_id: RECEIVER, volume_level: v / 100 });
}

async function toggleMute() {
    const m = S.entities[RECEIVER]?.attr?.is_volume_muted || false;
    await callSvc('media_player', 'volume_mute', { entity_id: RECEIVER, is_volume_muted: !m });
    setTimeout(fetchStates, 800);
}

async function sendCmd(cmd) {
    try { await callSvc('remote', 'send_command', { entity_id: SHIELD, command: cmd }); }
    catch { toast('⚠️ שגיאה', 'error'); }
}

async function allLights(svc) {
    await Promise.all(CINEMA.lights.map(l => callSvc('light', svc, { entity_id: l.id })));
    toast(svc === 'turn_on' ? '💡 הכל דלוק' : '🌑 הכל כבוי', 'success');
    setTimeout(fetchStates, 1500);
}

async function toggleDev(id) {
    try { isOn(id) ? await devOff(id) : await devOn(id); }
    catch { toast('⚠️ שגיאה', 'error'); }
}

/* ============================================================
   RENDER
   ============================================================ */
function renderAll() {
    renderStatusBar(); renderPower(); renderAudio();
    renderApps(); renderLights(); renderCurtain(); renderSpeakers();
    renderProjectorPanel();
}

function renderPower() {
    S.cinemaOn = isProjectorOn() && isReceiverOn();
    const app = getShieldApp();
    const appLabel = app ? (APPS.find(a => a.pkg === app)?.name || app.split('.').pop()) : null;

    const btn = document.getElementById('btnPower');
    const state = document.getElementById('powerState');
    const playing = document.getElementById('nowPlaying');

    if (btn) btn.classList.toggle('on', S.cinemaOn);
    if (state) {
        state.textContent = S.cinemaOn ? 'פעיל' : 'כבוי';
        state.classList.toggle('on', S.cinemaOn);
    }
    if (playing) playing.textContent = S.cinemaOn && appLabel ? `🎯 ${appLabel}` : '';
}

function renderAudio() {
    const e = S.entities[RECEIVER]; if (!e) return;
    const hasVol = e.attr.volume_level !== undefined;
    const vol = hasVol ? Math.round(e.attr.volume_level * 100) : S.lastVol ?? 30;
    if (hasVol) S.lastVol = vol;
    const muted = e.attr.is_volume_muted || false;
    const fill = document.getElementById('volFill');
    const knob = document.getElementById('volKnob');
    const range = document.getElementById('volRange');
    const mb = document.getElementById('vMute');
    if (fill) fill.style.width = `${vol}%`;
    if (knob) knob.style.left = `${vol}%`;
    if (range && !S.volDragging) range.value = vol;
    if (mb) mb.classList.toggle('muted', muted);
}

function renderApps() {
    const g = document.getElementById('appsGrid'); if (!g) return;
    const cur = getShieldApp();

    if (!g.dataset.built) {
        g.dataset.built = '1';
        g.innerHTML = APPS.map((a, i) => {
            return `<button class="app-tile" data-idx="${i}" title="${a.name}">
                <img class="app-logo" src="${a.logo}" alt="${a.name}">
            </button>`;
        }).join('');
        g.querySelectorAll('.app-tile').forEach(t => {
            t.addEventListener('click', () => {
                const a = APPS[parseInt(t.dataset.idx)];
                if (a.name === 'Plex') { openPlexBrowser(); return; }
                const svcId = Object.keys(STREAM_SERVICES).find(k => STREAM_SERVICES[k].pkg === a.pkg);
                if (svcId) { openStreamBrowser(svcId); return; }
                if (a.console) smartConsole(a);
                else smartSource(a);
            });
        });
    }

    g.querySelectorAll('.app-tile').forEach(t => {
        const a = APPS[parseInt(t.dataset.idx)];
        const isActive = !a.console && cur === a.pkg;
        t.classList.toggle('active', isActive);
    });
}

function renderLights() {
    const g = document.getElementById('lightsGrid'); if (!g) return;
    g.innerHTML = CINEMA.lights.map(l => {
        const on = S.entities[l.id]?.state === 'on';
        return `<div class="toggle-row ${on ? 'on' : ''}" data-id="${l.id}">
            <span class="toggle-emoji">${l.emoji}</span>
            <span class="toggle-name">${l.name}</span>
            <span class="toggle-dot"></span>
        </div>`;
    }).join('');
    g.querySelectorAll('.toggle-row').forEach(t => t.addEventListener('click', () => toggleLight(t.dataset.id)));
}

function renderCurtain() {
    const st = S.entities[CINEMA.cover.id]?.state || 'unknown';
    const b = document.getElementById('curtainBadge');
    const lab = { open: 'פתוח', closed: 'סגור', opening: 'נפתח...', closing: 'נסגר...' };
    if (b) { b.textContent = lab[st] || st; b.className = 'badge ' + st; }
}

function renderSpeakers() {
    const g = document.getElementById('speakersGrid'); if (!g) return;
    g.innerHTML = CINEMA.speakers.map(s => {
        const e = S.entities[s.id];
        const st = e?.state || 'unavailable';
        const on = ['playing', 'paused', 'idle'].includes(st);
        return `<div class="toggle-row spk ${on ? 'on' : ''}" data-id="${s.id}">
            <span class="toggle-emoji">${s.emoji}</span>
            <span class="toggle-name">${s.name}</span>
            <span class="toggle-dot"></span>
        </div>`;
    }).join('');
    g.querySelectorAll('.toggle-row').forEach(t => t.addEventListener('click', () => toggleDev(t.dataset.id)));
}

function renderStatusBar() {
    const pOn = isProjectorOn(), rOn = isReceiverOn();
    const cState = S.entities[CINEMA.cover.id]?.state || 'unknown';
    const lightsOn = CINEMA.lights.filter(l => S.entities[l.id]?.state === 'on').length;
    const adbState = S.entities[SHIELD_ADB]?.state || 'unavailable';

    setStatItem('statProjector', pOn, pOn ? 'דלוק' : 'כבוי');
    setStatItem('statReceiver', rOn, rOn ? 'דלוק' : 'כבוי');
    const cLabels = { open: 'פתוח', closed: 'סגור', opening: 'נפתח', closing: 'נסגר' };
    setStatItem('statCurtain', cState === 'open', cLabels[cState] || cState);
    setStatItem('statLights', lightsOn > 0, `${lightsOn}/${CINEMA.lights.length}`);
    setStatItem('statAdb', adbState !== 'unavailable', adbState === 'unavailable' ? 'מנותק' : 'ADB');
}

function setStatItem(elId, on, text) {
    const el = document.getElementById(elId); if (!el) return;
    el.classList.toggle('on', on); el.classList.toggle('off', !on);
    const val = el.querySelector('.stat-val');
    if (val) val.textContent = text;
}

function renderProjectorPanel() {
    const el = document.getElementById('projectorPanel'); if (!el) return;
    const pOn = isProjectorOn(), rOn = isReceiverOn();
    const rSrc = S.entities[RECEIVER]?.attr?.source || '—';
    el.innerHTML = `
        <div class="proj-row">
            <div class="proj-device ${pOn ? 'on' : 'off'}">
                <span class="proj-dot"></span><span class="proj-icon">📽️</span>
                <span class="proj-name">מקרן</span><span class="proj-state">${pOn ? 'דלוק' : 'כבוי'}</span>
            </div>
            <div class="proj-btns">
                <button class="pbtn pbtn-on" data-id="${PROJECTOR}" data-act="on">הפעלה</button>
                <button class="pbtn pbtn-off" data-id="${PROJECTOR}" data-act="off">כיבוי</button>
            </div>
        </div>
        <div class="proj-row">
            <div class="proj-device ${rOn ? 'on' : 'off'}">
                <span class="proj-dot"></span><span class="proj-icon">🔊</span>
                <span class="proj-name">מגבר</span><span class="proj-state">${rOn ? `דלוק — ${rSrc}` : 'כבוי'}</span>
            </div>
            <div class="proj-btns">
                <button class="pbtn pbtn-on" data-id="${RECEIVER}" data-act="on">הפעלה</button>
                <button class="pbtn pbtn-off" data-id="${RECEIVER}" data-act="off">כיבוי</button>
            </div>
        </div>`;
    el.querySelectorAll('.pbtn').forEach(b => {
        b.addEventListener('click', e => {
            e.stopPropagation();
            b.dataset.act === 'on' ? devOn(b.dataset.id) : devOff(b.dataset.id);
        });
    });
}

/* ============================================================
   TAB NAVIGATION
   ============================================================ */
function switchTab(tab) {
    S.tab = tab;
    document.querySelectorAll('.tab-section').forEach(s => {
        s.style.display = s.dataset.tab === tab ? '' : 'none';
    });
    document.querySelectorAll('.mn').forEach(b => {
        b.classList.toggle('active', b.dataset.go === tab);
    });
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


    document.getElementById('btnLOn')?.addEventListener('click', () => allLights('turn_on'));
    document.getElementById('btnLOff')?.addEventListener('click', () => allLights('turn_off'));
    document.getElementById('cOpen')?.addEventListener('click', () => coverAction('open'));
    document.getElementById('cClose')?.addEventListener('click', () => coverAction('close'));

    document.getElementById('vDown')?.addEventListener('click', () => volStep('down'));
    document.getElementById('vUp')?.addEventListener('click', () => volStep('up'));
    document.getElementById('vMute')?.addEventListener('click', toggleMute);

    let vt;
    const vr = document.getElementById('volRange');
    if (vr) {
        vr.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            S.lastVol = v;
            const f = document.getElementById('volFill'), k = document.getElementById('volKnob');
            if (f) f.style.width = `${v}%`;
            if (k) k.style.left = `${v}%`;
            clearTimeout(vt); vt = setTimeout(() => setVol(v), 300);
        });
        vr.addEventListener('mousedown', () => S.volDragging = true);
        vr.addEventListener('touchstart', () => S.volDragging = true, { passive: true });
        vr.addEventListener('mouseup', () => S.volDragging = false);
        vr.addEventListener('touchend', () => S.volDragging = false, { passive: true });
    }

    document.getElementById('btnRefresh')?.addEventListener('click', () => { fetchStates(); toast('🔄 מרענן...', 'info'); });


    document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => {
        b.style.transform = 'scale(0.85)';
        setTimeout(() => b.style.transform = '', 200);
        sendCmd(b.dataset.cmd);
    }));

    document.querySelectorAll('.mn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.go)));

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(S.poll);
        else { fetchStates(); startPoll(); }
    });
}

/* ============================================================
   PLEX BROWSER
   ============================================================ */
const PLEX_MACHINE = '7c84d507caa716dcec1ecede058c0a3c854f264e';
const PLEX_RELAY = 'https://172-104-247-122.7f129a0c76254e08912ab40133e94d85.plex.direct:8443';
const PLEX_TK = 'nkK9tSbu5HPYs1yXVukC';

async function plexGet(path) {
    const r = await fetch(`/api/plex?path=${encodeURIComponent(path)}`);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

function plexThumb(thumbPath, w = 200, h = 300) {
    if (!thumbPath) return '';
    return `${PLEX_RELAY}/photo/:/transcode?width=${w}&height=${h}&minSize=1&upscale=1&url=${encodeURIComponent(thumbPath)}&X-Plex-Token=${PLEX_TK}`;
}

let plexSearchTimer = null;

function openPlexBrowser() {
    document.getElementById('plexOverlay')?.classList.remove('hidden');
    const si = document.getElementById('plexSearch');
    if (si) si.value = '';
    loadPlexCategory('onDeck');
}

function closePlexBrowser() {
    document.getElementById('plexOverlay')?.classList.add('hidden');
}

function renderPlexItems(items, container) {
    if (!items.length) {
        container.innerHTML = '<div class="plex-loading">אין תוכן</div>';
        return;
    }

    container.innerHTML = `<div class="plex-grid">${items.map(item => {
        const title = item.title || item.grandparentTitle || '';
        const year = item.year || '';
        const thumb = item.thumb || item.parentThumb || item.grandparentThumb || '';
        const progress = item.viewOffset && item.duration
            ? Math.round((item.viewOffset / item.duration) * 100) : 0;
        const rKey = item.ratingKey;
        const isEpisode = item.type === 'episode';
        const isShow = item.type === 'show';
        const displayTitle = isEpisode ? (item.grandparentTitle || title) : title;
        const sub = isEpisode ? `S${item.parentIndex}E${item.index}` : year;

        return `<div class="plex-card" data-rkey="${rKey}" data-type="${item.type}">
            <img src="${plexThumb(thumb)}" alt="${displayTitle}" loading="lazy" onerror="this.style.display='none'">
            <div class="plex-card-info">
                <div class="plex-card-title">${displayTitle}</div>
                <div class="plex-card-year">${sub}</div>
            </div>
            ${progress > 0 ? `<div class="plex-card-progress"><div class="plex-card-progress-fill" style="width:${progress}%"></div></div>` : ''}
        </div>`;
    }).join('')}</div>`;

    container.querySelectorAll('.plex-card').forEach(c => {
        c.addEventListener('click', () => {
            if (c.dataset.type === 'show') {
                loadShowSeasons(c.dataset.rkey);
            } else {
                playPlexItem(c.dataset.rkey, 4);
            }
        });
    });
}

async function loadPlexCategory(cat) {
    const content = document.getElementById('plexContent');
    if (!content) return;
    content.innerHTML = '<div class="plex-loading">טוען...</div>';

    document.querySelectorAll('.plex-tab').forEach(t => t.classList.toggle('active', t.dataset.pcat === cat));

    try {
        let data;
        if (cat === 'onDeck') {
            data = await plexGet('/library/onDeck');
        } else {
            data = await plexGet(`/library/sections/${cat}/all?sort=addedAt:desc`);
        }

        const items = data?.MediaContainer?.Metadata || [];
        renderPlexItems(items, content);
    } catch (e) {
        console.error('[Plex]', e);
        content.innerHTML = '<div class="plex-loading">שגיאה בטעינה</div>';
    }
}

async function loadShowSeasons(showKey) {
    const content = document.getElementById('plexContent');
    if (!content) return;
    content.innerHTML = '<div class="plex-loading">טוען עונות...</div>';

    try {
        const data = await plexGet(`/library/metadata/${showKey}/children`);
        const seasons = data?.MediaContainer?.Metadata || [];
        if (!seasons.length) { content.innerHTML = '<div class="plex-loading">אין עונות</div>'; return; }

        const showTitle = data?.MediaContainer?.parentTitle || '';

        content.innerHTML = `<div class="plex-show-back" id="plexShowBack">← ${showTitle}</div>
        <div class="plex-grid">${seasons.map(s => {
            const thumb = s.thumb || s.parentThumb || '';
            return `<div class="plex-card" data-skey="${s.ratingKey}">
                <img src="${plexThumb(thumb)}" alt="${s.title}" loading="lazy" onerror="this.style.display='none'">
                <div class="plex-card-info"><div class="plex-card-title">${s.title}</div></div>
            </div>`;
        }).join('')}</div>`;

        document.getElementById('plexShowBack')?.addEventListener('click', () => {
            const activeTab = document.querySelector('.plex-tab.active');
            loadPlexCategory(activeTab?.dataset.pcat || 'onDeck');
        });

        content.querySelectorAll('.plex-card').forEach(c => {
            c.addEventListener('click', () => loadSeasonEpisodes(c.dataset.skey));
        });
    } catch (e) {
        console.error('[Plex]', e);
        content.innerHTML = '<div class="plex-loading">שגיאה</div>';
    }
}

async function loadSeasonEpisodes(seasonKey) {
    const content = document.getElementById('plexContent');
    if (!content) return;
    content.innerHTML = '<div class="plex-loading">טוען פרקים...</div>';

    try {
        const data = await plexGet(`/library/metadata/${seasonKey}/children`);
        const episodes = data?.MediaContainer?.Metadata || [];
        if (!episodes.length) { content.innerHTML = '<div class="plex-loading">אין פרקים</div>'; return; }

        const showTitle = episodes[0]?.grandparentTitle || '';
        const seasonTitle = data?.MediaContainer?.parentTitle || episodes[0]?.parentTitle || '';

        content.innerHTML = `<div class="plex-show-back" id="plexEpBack">← ${showTitle} — ${seasonTitle}</div>
        <div class="plex-episodes">${episodes.map(ep => {
            const thumb = ep.thumb || ep.parentThumb || '';
            const progress = ep.viewOffset && ep.duration ? Math.round((ep.viewOffset / ep.duration) * 100) : 0;
            return `<div class="plex-episode" data-rkey="${ep.ratingKey}">
                <img class="plex-ep-thumb" src="${plexThumb(thumb, 300, 170)}" alt="" loading="lazy" onerror="this.style.display='none'">
                <div class="plex-ep-info">
                    <div class="plex-ep-num">פרק ${ep.index}</div>
                    <div class="plex-ep-title">${ep.title}</div>
                </div>
                ${progress > 0 ? `<div class="plex-card-progress"><div class="plex-card-progress-fill" style="width:${progress}%"></div></div>` : ''}
            </div>`;
        }).join('')}</div>`;

        document.getElementById('plexEpBack')?.addEventListener('click', () => {
            const parentKey = episodes[0]?.parentRatingKey;
            if (parentKey) {
                const grandparentKey = episodes[0]?.grandparentRatingKey;
                if (grandparentKey) loadShowSeasons(grandparentKey);
            }
        });

        content.querySelectorAll('.plex-episode').forEach(c => {
            c.addEventListener('click', () => playPlexItem(c.dataset.rkey, 4));
        });
    } catch (e) {
        console.error('[Plex]', e);
        content.innerHTML = '<div class="plex-loading">שגיאה</div>';
    }
}

async function plexSearch(query) {
    const content = document.getElementById('plexContent');
    if (!content) return;
    if (!query || query.length < 2) { loadPlexCategory('onDeck'); return; }

    content.innerHTML = '<div class="plex-loading">מחפש...</div>';
    document.querySelectorAll('.plex-tab').forEach(t => t.classList.remove('active'));

    try {
        const data = await plexGet(`/search?query=${encodeURIComponent(query)}&limit=30`);
        const items = (data?.MediaContainer?.Metadata || []).filter(
            i => i.type === 'movie' || i.type === 'show' || i.type === 'episode'
        );
        renderPlexItems(items, content);
    } catch (e) {
        console.error('[Plex]', e);
        content.innerHTML = '<div class="plex-loading">שגיאה בחיפוש</div>';
    }
}

async function playPlexItem(ratingKey, metadataType = 4) {
    if (S.busy) return;
    lockBusy();
    closePlexBrowser();
    toast('🎞️ Plex — מפעיל...', 'info');
    try {
        await ensureCinema();
        await adbLaunch('com.plexapp.android');
        await sleep(5000);
        const playCmd = `(echo -e "GET /player/playback/playMedia?key=/library/metadata/${ratingKey}\\x26type=${metadataType}\\x26offset=0\\x26machineIdentifier=${PLEX_MACHINE}\\x26address=192.168.1.23\\x26port=32400\\x26protocol=http\\x26token=${PLEX_TK}\\x26commandID=$((RANDOM)) HTTP/1.0\\r\\nHost: 127.0.0.1\\r\\nX-Plex-Client-Identifier: onyx-remote\\r\\n\\r\\n"; sleep 3) | nc 127.0.0.1 32500 2>&1`;
        await adb(playCmd);
        await sleep(3000);
        await fetchStates();
        toast('✅ Plex — lecture!', 'success');
    } catch (e) {
        console.error(e);
        toast('⚠️ שגיאה', 'error');
    }
    unlockBusy();
}

function initPlexEvents() {
    document.getElementById('plexClose')?.addEventListener('click', closePlexBrowser);
    document.querySelectorAll('.plex-tab').forEach(t => {
        t.addEventListener('click', () => {
            document.getElementById('plexSearch').value = '';
            loadPlexCategory(t.dataset.pcat);
        });
    });
    const searchInput = document.getElementById('plexSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(plexSearchTimer);
            plexSearchTimer = setTimeout(() => plexSearch(searchInput.value.trim()), 400);
        });
    }
}

/* ============================================================
   STREAMING BROWSER — Netflix, Disney+, Prime, YouTube, Spotify, Apple TV
   Sources: iTunes RSS (trending) + TVmaze (séries) — aucune clé API nécessaire
   ============================================================ */
const STREAM_SERVICES = {
    netflix:  { name: 'Netflix',      pkg: 'com.netflix.ninja',                 color: '#E50914', tmdbProvider: 8 },
    disney:   { name: 'Disney+',      pkg: 'com.disney.disneyplus',             color: '#0063E5', tmdbProvider: 337 },
    prime:    { name: 'Prime Video',  pkg: 'com.amazon.amazonvideo.livingroom', color: '#00A8E1', tmdbProvider: 119 },
    appletv:  { name: 'Apple TV',     pkg: 'com.apple.atve.androidtv.appletv',  color: '#a1a1a1', tmdbProvider: 350 },
    youtube:  { name: 'YouTube',      pkg: 'com.google.android.youtube.tv',     color: '#FF0000' },
    spotify:  { name: 'Spotify',      pkg: 'com.spotify.tv.android',            color: '#1DB954' },
};

let activeStreamId = null;
let streamSearchTimer = null;
const tmdbCache = {};
let streamPage = { movie: 0, tv: 0, loading: false, done: false };

function openStreamBrowser(id) {
    activeStreamId = id;
    const svc = STREAM_SERVICES[id];
    if (!svc) return;

    const overlay = document.getElementById('streamOverlay');
    overlay.classList.remove('hidden');
    document.getElementById('streamTitle').textContent = svc.name;
    document.getElementById('streamTitle').style.color = svc.color;
    document.getElementById('streamSearch').value = '';
    overlay.style.setProperty('--svc-color', svc.color);

    loadStreamTrending();
    prelaunchApp(svc.pkg);
}

async function prelaunchApp(pkg) {
    try { await adb(`monkey -p ${pkg} 1`); } catch {}
}

function closeStreamBrowser() {
    document.getElementById('streamOverlay')?.classList.add('hidden');
    activeStreamId = null;
}

async function tmdbGet(path) {
    const r = await fetch(`/api/tmdb?path=${encodeURIComponent(path)}`);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

function tmdbPoster(path, w = 342) {
    if (!path) return '';
    return `https://image.tmdb.org/t/p/w${w}${path}`;
}

const GENRE_MAP = {
    kids:    { movie: '16,10751', tv: '10762,16' },
    action:  { movie: '28', tv: '10759' },
    comedy:  { movie: '35', tv: '35' },
    drama:   { movie: '18', tv: '18' },
    horror:  { movie: '27', tv: '9648' },
};

let activeStreamCat = 'popular';

function streamBaseQuery() {
    const svc = STREAM_SERVICES[activeStreamId];
    if (!svc?.tmdbProvider) return '';
    return `with_watch_providers=${svc.tmdbProvider}&watch_region=IL&sort_by=popularity.desc&language=he-IL`;
}

function streamGenreParam() {
    const g = GENRE_MAP[activeStreamCat];
    if (!g) return { movie: '', tv: '' };
    return { movie: `&with_genres=${g.movie}`, tv: `&with_genres=${g.tv}` };
}

async function loadStreamTrending(cat) {
    if (cat) activeStreamCat = cat;
    else cat = activeStreamCat;

    const content = document.getElementById('streamContent');
    if (!content) return;
    const svc = STREAM_SERVICES[activeStreamId];
    if (!svc) return;

    streamPage = { movie: 1, tv: 1, loading: false, done: false };
    content.innerHTML = '<div class="plex-loading">טוען...</div>';

    try {
        let items = [];
        if (svc.tmdbProvider) {
            const base = streamBaseQuery();
            const genre = streamGenreParam();

            if (cat === 'movies') {
                const [p1, p2] = await Promise.all([
                    tmdbGet(`/discover/movie?${base}${genre.movie}&page=1`),
                    tmdbGet(`/discover/movie?${base}${genre.movie}&page=2`),
                ]);
                items = [...(p1?.results||[]), ...(p2?.results||[])].map(mapMovie);
                streamPage.movie = 2; streamPage.tv = 0;
            } else if (cat === 'tv') {
                const [p1, p2] = await Promise.all([
                    tmdbGet(`/discover/tv?${base}${genre.tv}&page=1`),
                    tmdbGet(`/discover/tv?${base}${genre.tv}&page=2`),
                ]);
                items = [...(p1?.results||[]), ...(p2?.results||[])].map(mapShow);
                streamPage.tv = 2; streamPage.movie = 0;
            } else {
                const [m1, t1] = await Promise.all([
                    tmdbGet(`/discover/movie?${base}${genre.movie}&page=1`),
                    tmdbGet(`/discover/tv?${base}${genre.tv}&page=1`),
                ]);
                items = interleave((m1?.results||[]).map(mapMovie), (t1?.results||[]).map(mapShow));
                streamPage.movie = 1; streamPage.tv = 1;
            }
        } else {
            const data = await tmdbGet('/trending/all/week?language=he-IL');
            items = (data?.results || []).map(r => ({
                title: r.title || r.name || '', origTitle: r.original_title || r.original_name || '',
                image: tmdbPoster(r.poster_path),
                year: (r.release_date || r.first_air_date || '').substring(0, 4),
                category: r.media_type === 'tv' ? 'סדרה' : 'סרט', tmdbId: r.id,
            }));
            streamPage.done = true;
        }
        items = items.filter(i => i.image);
        renderStreamItems(items, content);
    } catch (e) {
        console.error('[TMDB]', e);
        content.innerHTML = '<div class="plex-loading">שגיאה בטעינה</div>';
    }
}

async function loadMoreStream() {
    if (streamPage.loading || streamPage.done) return;
    streamPage.loading = true;

    const svc = STREAM_SERVICES[activeStreamId];
    if (!svc?.tmdbProvider) { streamPage.done = true; streamPage.loading = false; return; }

    const base = streamBaseQuery();
    const genre = streamGenreParam();
    const cat = activeStreamCat;

    try {
        let newItems = [];
        if (cat === 'movies' || cat === 'tv') {
            const type = cat === 'movies' ? 'movie' : 'tv';
            const pageKey = cat === 'movies' ? 'movie' : 'tv';
            const nextPage = streamPage[pageKey] + 1;
            const genreStr = type === 'movie' ? genre.movie : genre.tv;
            const data = await tmdbGet(`/discover/${type}?${base}${genreStr}&page=${nextPage}`);
            const results = data?.results || [];
            if (!results.length) { streamPage.done = true; streamPage.loading = false; return; }
            newItems = results.map(type === 'movie' ? mapMovie : mapShow).filter(i => i.image);
            streamPage[pageKey] = nextPage;
        } else {
            const mp = streamPage.movie + 1;
            const tp = streamPage.tv + 1;
            const [movies, shows] = await Promise.all([
                tmdbGet(`/discover/movie?${base}${genre.movie}&page=${mp}`),
                tmdbGet(`/discover/tv?${base}${genre.tv}&page=${tp}`),
            ]);
            const mr = movies?.results || [];
            const tr = shows?.results || [];
            if (!mr.length && !tr.length) { streamPage.done = true; streamPage.loading = false; return; }
            newItems = interleave(mr.map(mapMovie), tr.map(mapShow)).filter(i => i.image);
            streamPage.movie = mp; streamPage.tv = tp;
        }
        appendStreamItems(newItems);
    } catch (e) { console.error('[TMDB loadMore]', e); }
    streamPage.loading = false;
}

function appendStreamItems(items) {
    const content = document.getElementById('streamContent');
    if (!content) return;
    let grid = content.querySelector('.plex-grid');
    if (!grid) { renderStreamItems(items, content); return; }

    const esc = s => (s || '').replace(/"/g, '&quot;');
    const html = items.map(item => {
        const isShow = item.category === 'סדרה' ? '1' : '0';
        return `<div class="plex-card stream-card" data-title="${esc(item.origTitle || item.title)}" data-tmdb="${item.tmdbId || ''}" data-show="${isShow}">
            ${item.image ? `<img src="${item.image}" alt="${esc(item.title)}" loading="lazy" onerror="this.style.display='none'">` : ''}
            <div class="plex-card-info">
                <div class="plex-card-title">${item.title}</div>
                <div class="plex-card-year">${item.category} ${item.year ? '• ' + item.year : ''}</div>
            </div>
        </div>`;
    }).join('');
    grid.insertAdjacentHTML('beforeend', html);
    grid.querySelectorAll('.stream-card:not([data-bound])').forEach(c => {
        c.dataset.bound = '1';
        c.addEventListener('click', () => playOnStream(c.dataset.title, c.dataset.tmdb, c.dataset.show === '1'));
    });
}

function mapMovie(m) {
    return {
        title: m.title || m.original_title || '',
        origTitle: m.original_title || m.title || '',
        image: tmdbPoster(m.poster_path),
        year: (m.release_date || '').substring(0, 4),
        category: 'סרט',
        tmdbId: m.id,
    };
}

function mapShow(s) {
    return {
        title: s.name || s.original_name || '',
        origTitle: s.original_name || s.name || '',
        image: tmdbPoster(s.poster_path),
        year: (s.first_air_date || '').substring(0, 4),
        category: 'סדרה',
        tmdbId: s.id,
    };
}

function interleave(a, b) {
    const result = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
        if (i < a.length) result.push(a[i]);
        if (i < b.length) result.push(b[i]);
    }
    return result;
}

function renderStreamItems(items, container) {
    if (!items.length) { container.innerHTML = '<div class="plex-loading">אין תוכן</div>'; return; }

    const esc = s => (s || '').replace(/"/g, '&quot;');
    container.innerHTML = `<div class="plex-grid">${items.map(item => {
        const isShow = item.category === 'סדרה' ? '1' : '0';
        return `<div class="plex-card stream-card" data-title="${esc(item.origTitle || item.title)}" data-tmdb="${item.tmdbId || ''}" data-show="${isShow}">
            ${item.image ? `<img src="${item.image}" alt="${esc(item.title)}" loading="lazy" onerror="this.style.display='none'">` : ''}
            <div class="plex-card-info">
                <div class="plex-card-title">${item.title}</div>
                <div class="plex-card-year">${item.category} ${item.year ? '• ' + item.year : ''}</div>
            </div>
        </div>`;
    }).join('')}</div>`;

    container.querySelectorAll('.stream-card').forEach(c => {
        c.addEventListener('click', () => playOnStream(c.dataset.title, c.dataset.tmdb, c.dataset.show === '1'));
    });
}

async function getDeepLink(title, providerId) {
    try {
        const r = await fetch(`/api/justwatch?q=${encodeURIComponent(title)}`);
        if (!r.ok) return null;
        const data = await r.json();
        for (const result of data.results || []) {
            for (const offer of result.offers || []) {
                if (offer.providerId === providerId) {
                    const nfx = offer.url?.match(/netflix\.com\/title\/(\d+)/);
                    if (nfx) return { type: 'netflix', id: nfx[1] };
                    const prime = offer.deeplink?.match(/gti=([^&"#]+)/);
                    if (prime) return { type: 'prime', gti: prime[1] };
                    const intentUrl = offer.deeplink?.match(/intent:\/\/(.+?)#/);
                    if (intentUrl) return { type: 'intent', url: 'https://' + intentUrl[1].replace(/\\u0026/g, '&') };
                    if (offer.url) return { type: 'url', url: offer.url };
                }
            }
        }
    } catch (e) { console.error('[JustWatch]', e); }
    return null;
}

async function playOnStream(title, tmdbId, isShow) {
    if (!activeStreamId || S.busy) return;
    const svc = STREAM_SERVICES[activeStreamId];
    const sid = activeStreamId;
    lockBusy();
    closeStreamBrowser();
    const searchText = title.replace(/[^\x20-\x7E]/g, '').trim() || title;

    try {
        await ensureCinema();
        toast(`🎬 ${svc.name} — "${searchText}"...`, 'info');

        if (sid === 'youtube') {
            await adb(`am start -a android.intent.action.VIEW -d "https://www.youtube.com/results?search_query=${encodeURIComponent(searchText)}" com.google.android.youtube.tv`);
        } else if (sid === 'spotify') {
            await adb(`am start -a android.intent.action.VIEW -d "spotify:search:${encodeURIComponent(searchText)}" com.spotify.tv.android`);
        } else if (svc.tmdbProvider) {
            toast(`🔍 חיפוש קישור ישיר...`, 'info');
            const link = await getDeepLink(searchText, svc.tmdbProvider);

            if (link && link.type === 'netflix') {
                await netflixDeepLink(link.id, isShow);
            } else if (link && link.type === 'prime') {
                await adb(`am start -a android.intent.action.VIEW -d "https://app.primevideo.com/watch?gti=${link.gti}" com.amazon.amazonvideo.livingroom`);
            } else if (link && (link.type === 'intent' || link.type === 'url') && link.url) {
                await adb(`am start -a android.intent.action.VIEW -d "${link.url}" ${svc.pkg}`);
            } else {
                toast(`📺 פותח ${svc.name}...`, 'info');
                await adbLaunch(svc.pkg);
            }
        } else {
            await adbLaunch(svc.pkg);
        }

        await sleep(1000);
        await fetchStates();
        toast(`✅ ${svc.name} — מוכן!`, 'success');
    } catch (e) {
        console.error(e);
        toast('⚠️ שגיאה', 'error');
    }
    unlockBusy();
}

async function netflixDeepLink(netflixId, isShow) {
    const path = isShow ? 'title' : 'watch';
    const deepUrl = `https://www.netflix.com/${path}/${netflixId}`;

    toast(`▶️ הפעלה...`, 'info');
    const resp = await adb(`am start -W -a android.intent.action.VIEW -d "${deepUrl}" --es source 30 com.netflix.ninja`);

    if (resp && resp.includes('delivered to currently running')) {
        await sleep(2000);
        return;
    }

    toast(`👤 בחירת פרופיל...`, 'info');
    await sleep(4000);
    await adb('input keyevent 23');
    await sleep(6000);
    toast(`▶️ מפעיל...`, 'info');
    await adb(`am start -W -a android.intent.action.VIEW -d "${deepUrl}" --es source 30 com.netflix.ninja`);
    await sleep(2000);
}

async function searchStream(query) {
    const content = document.getElementById('streamContent');
    if (!content) return;
    if (!query || query.length < 2) { loadStreamTrending(); return; }

    content.innerHTML = '<div class="plex-loading">מחפש...</div>';
    try {
        const [movies, shows] = await Promise.all([
            tmdbGet(`/search/movie?query=${encodeURIComponent(query)}&language=he-IL&page=1`),
            tmdbGet(`/search/tv?query=${encodeURIComponent(query)}&language=he-IL&page=1`),
        ]);
        const movieItems = (movies?.results || []).map(m => ({
            title: m.title || m.original_title || '',
            image: tmdbPoster(m.poster_path),
            year: (m.release_date || '').substring(0, 4),
            category: 'סרט',
            tmdbId: m.id,
            origTitle: m.original_title || m.title || '',
        }));
        const tvItems = (shows?.results || []).map(s => ({
            title: s.name || s.original_name || '',
            image: tmdbPoster(s.poster_path),
            year: (s.first_air_date || '').substring(0, 4),
            category: 'סדרה',
            tmdbId: s.id,
            origTitle: s.original_name || s.name || '',
        }));
        const combined = interleave(movieItems, tvItems).filter(i => i.image).slice(0, 30);
        renderStreamItems(combined, content);
    } catch (e) {
        console.error('[TMDB search]', e);
        content.innerHTML = '<div class="plex-loading">שגיאה בחיפוש</div>';
    }
}

function initStreamEvents() {
    document.getElementById('streamClose')?.addEventListener('click', closeStreamBrowser);

    document.querySelectorAll('.stream-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stream-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadStreamTrending(tab.dataset.cat);
        });
    });

    const sc = document.getElementById('streamContent');
    if (sc) {
        sc.addEventListener('scroll', () => {
            if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 400) {
                loadMoreStream();
            }
        });
    }

    document.getElementById('streamOpenApp')?.addEventListener('click', async () => {
        if (!activeStreamId || S.busy) return;
        const svc = STREAM_SERVICES[activeStreamId];
        lockBusy();
        closeStreamBrowser();
        toast(`🎬 ${svc.name}...`, 'info');
        try {
            await ensureCinema();
            await adbLaunch(svc.pkg);
            await sleep(3000);
            toast(`✅ ${svc.name} — מוכן!`, 'success');
        } catch { toast('⚠️ שגיאה', 'error'); }
        unlockBusy();
    });

    document.getElementById('streamSearchTV')?.addEventListener('click', () => {
        const query = document.getElementById('streamSearch')?.value?.trim();
        if (!query) { toast('🔍 כתוב שם סרט', 'info'); return; }
        playOnStream(query);
    });

    const si = document.getElementById('streamSearch');
    if (si) {
        si.addEventListener('input', () => {
            clearTimeout(streamSearchTimer);
            streamSearchTimer = setTimeout(() => searchStream(si.value.trim()), 400);
        });
    }
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
    showView('loader');
    initEvents();
    initPlexEvents();
    initStreamEvents();
    switchTab('apps');
    const ok = await fetchStates();
    showView('app');
    if (ok) startPoll();
    else { toast('⚠️ שגיאת חיבור...', 'error'); setTimeout(async () => { await fetchStates(); startPoll(); }, 3000); }
}

document.addEventListener('DOMContentLoaded', init);
