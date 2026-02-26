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
    g.innerHTML = APPS.map((a, i) => {
        const isActive = !a.console && cur === a.pkg;
        return `<button class="app-tile ${isActive ? 'active' : ''}" data-idx="${i}" title="${a.name}">
            <img class="app-logo" src="${a.logo}" alt="${a.name}">
        </button>`;
    }).join('');
    g.querySelectorAll('.app-tile').forEach(t => {
        t.addEventListener('click', () => {
            const a = APPS[parseInt(t.dataset.idx)];
            if (a.name === 'Plex') { openPlexBrowser(); return; }
            if (a.console) smartConsole(a);
            else smartSource(a);
        });
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

async function plexGet(path) {
    const r = await fetch(`/api/plex?path=${encodeURIComponent(path)}`);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

function plexThumb(thumbPath) {
    if (!thumbPath) return '';
    return `/api/plex?path=${encodeURIComponent(thumbPath)}&img=1`;
}

function openPlexBrowser() {
    document.getElementById('plexOverlay')?.classList.remove('hidden');
    loadPlexCategory('onDeck');
}

function closePlexBrowser() {
    document.getElementById('plexOverlay')?.classList.add('hidden');
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
        } else if (cat === 'movies') {
            data = await plexGet('/library/sections/1/recentlyAdded');
        } else if (cat === 'shows') {
            data = await plexGet('/library/sections/8/recentlyAdded');
        } else if (cat === 'kids') {
            data = await plexGet('/library/sections/2/recentlyAdded');
        }

        const items = data?.MediaContainer?.Metadata || [];
        if (items.length === 0) {
            content.innerHTML = '<div class="plex-loading">אין תוכן</div>';
            return;
        }

        content.innerHTML = `<div class="plex-grid">${items.slice(0, 30).map(item => {
            const title = item.title || item.grandparentTitle || '';
            const year = item.year || '';
            const thumb = item.thumb || item.parentThumb || item.grandparentThumb || '';
            const progress = item.viewOffset && item.duration
                ? Math.round((item.viewOffset / item.duration) * 100) : 0;
            const rKey = item.ratingKey;
            const isEpisode = item.type === 'episode';
            const displayTitle = isEpisode ? (item.grandparentTitle || title) : title;
            const sub = isEpisode ? `S${item.parentIndex}E${item.index}` : year;

            return `<div class="plex-card" data-rkey="${rKey}" data-type="${item.type}">
                <img src="${plexThumb(thumb)}" alt="${displayTitle}" loading="lazy">
                <div class="plex-card-info">
                    <div class="plex-card-title">${displayTitle}</div>
                    <div class="plex-card-year">${sub}</div>
                </div>
                ${progress > 0 ? `<div class="plex-card-progress"><div class="plex-card-progress-fill" style="width:${progress}%"></div></div>` : ''}
            </div>`;
        }).join('')}</div>`;

        content.querySelectorAll('.plex-card').forEach(c => {
            c.addEventListener('click', () => playPlexItem(c.dataset.rkey));
        });
    } catch (e) {
        console.error('[Plex]', e);
        content.innerHTML = '<div class="plex-loading">שגיאה בטעינה</div>';
    }
}

async function playPlexItem(ratingKey) {
    if (S.busy) return;
    lockBusy();
    closePlexBrowser();
    toast('🎞️ Plex — מפעיל...', 'info');
    try {
        await ensureCinema();
        const deepLink = `plex://play/?metadataKey=%2Flibrary%2Fmetadata%2F${ratingKey}&metadataType=1&serverID=${PLEX_MACHINE}`;
        await adb(`am start -a android.intent.action.VIEW -d "${deepLink}"`);
        await sleep(4000);
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
        t.addEventListener('click', () => loadPlexCategory(t.dataset.pcat));
    });
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
    showView('loader');
    initEvents();
    initPlexEvents();
    switchTab('apps');
    const ok = await fetchStates();
    showView('app');
    if (ok) startPoll();
    else { toast('⚠️ שגיאת חיבור...', 'error'); setTimeout(async () => { await fetchStates(); startPoll(); }, 3000); }
}

document.addEventListener('DOMContentLoaded', init);
