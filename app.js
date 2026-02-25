/**
 * ONYX REMOTE SPECIAL — PWA Standalone
 * Contrôle 100% réseau direct — ZERO Harmony Hub / ZERO IR
 * Pioneer receiver via media_player.receiver (TCP réseau)
 * Epson projecteur via media_player.epson (ESC/VP.net)
 * Shield via remote.shield (Android TV Remote Protocol)
 */

const RECEIVER = 'media_player.receiver';
const PROJECTOR = 'media_player.epson';
const SHIELD = 'remote.shield';
const SHIELD_MP = 'media_player.shield_2';
const SHIELD_CAST = 'media_player.shield';

const RECEIVER_INPUTS = {
    shield: 'BD/DVD',
    ps5: 'GAME',
    cblsat: 'CBL/SAT',
    aux: 'AUX',
    net: 'NET',
    cd: 'CD',
    usb: 'USB',
};

const APPS = [
    { name: 'Free TV', pkg: 'tv.freetv.androidtv', emoji: '📡', input: 'BD/DVD' },
    { name: 'Netflix', pkg: 'com.netflix.ninja', emoji: '🎬', input: 'BD/DVD' },
    { name: 'Plex', pkg: 'com.plexapp.android', emoji: '🎞️', input: 'BD/DVD' },
    { name: 'Apple TV', pkg: 'com.apple.atve.androidtv.appletv', emoji: '📺', input: 'BD/DVD' },
    { name: 'YouTube', pkg: 'com.google.android.youtube.tv', emoji: '▶️', input: 'BD/DVD' },
    { name: 'Disney+', pkg: 'com.disney.disneyplus', emoji: '🏰', input: 'BD/DVD' },
];

const TV_CHANNELS = [
    { num: 1, name: 'TF1' }, { num: 2, name: 'France 2' }, { num: 3, name: 'France 3' },
    { num: 4, name: 'Canal+' }, { num: 5, name: 'France 5' }, { num: 6, name: 'M6' },
    { num: 7, name: 'Arte' }, { num: 8, name: 'D8/C8' }, { num: 9, name: 'W9' },
    { num: 10, name: 'TMC' }, { num: 11, name: 'TFX' }, { num: 12, name: 'NRJ 12' },
    { num: 13, name: 'LCP' }, { num: 14, name: 'France 4' }, { num: 15, name: 'BFM TV' },
    { num: 16, name: 'CNews' }, { num: 17, name: 'CStar' }, { num: 18, name: 'Gulli' },
    { num: 19, name: 'France Info' }, { num: 20, name: 'L\'Équipe' },
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
    RECEIVER, PROJECTOR, SHIELD, SHIELD_MP, SHIELD_CAST,
    ...CINEMA.speakers.map(s => s.id),
];

const S = { entities: {}, cinemaOn: false, busy: false, busyTimer: null, poll: null, lastVol: 30, volDragging: false };

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
    const res = await fetch(`/api/ha?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function haPost(path, body) {
    const res = await fetch(`/api/ha?path=${encodeURIComponent(path)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isOn(id) { return ['on', 'playing', 'idle', 'paused'].includes(S.entities[id]?.state); }

function isProjectorOn() { return isOn(PROJECTOR); }
function isReceiverOn() { return isOn(RECEIVER); }

function getShieldApp() {
    return S.entities[SHIELD_MP]?.attr?.app_name || S.entities[SHIELD]?.attr?.current_activity || null;
}

/* ============================================================
   CONTRÔLE RÉSEAU DIRECT — Projecteur + Receiver
   ============================================================ */
async function projectorOn() {
    toast('📽️ מדליק מקרן...', 'info');
    await callSvc('media_player', 'turn_on', { entity_id: PROJECTOR });
    for (let i = 0; i < 8; i++) {
        await sleep(3000);
        await fetchStates();
        if (isProjectorOn()) { toast('✅ מקרן דלוק!', 'success'); return true; }
    }
    toast('⚠️ בדוק מקרן — ייתכן שצריך להפעיל "Standby Mode: Communication On"', 'error');
    return false;
}

async function projectorOff() {
    await callSvc('media_player', 'turn_off', { entity_id: PROJECTOR });
    toast('🔴 מקרן כבוי', 'success');
    setTimeout(fetchStates, 5000);
}

async function receiverOn() {
    toast('🔊 מדליק מגבר...', 'info');
    await callSvc('media_player', 'turn_on', { entity_id: RECEIVER });
    await sleep(3000);
    await fetchStates();
    toast(isReceiverOn() ? '✅ מגבר דלוק!' : '⚠️ בדוק מגבר', isReceiverOn() ? 'success' : 'error');
    return isReceiverOn();
}

async function receiverOff() {
    await callSvc('media_player', 'turn_off', { entity_id: RECEIVER });
    toast('🔴 מגבר כבוי', 'success');
    setTimeout(fetchStates, 3000);
}

async function receiverSetInput(source) {
    await callSvc('media_player', 'select_source', { entity_id: RECEIVER, source });
}

async function launchApp(pkg) {
    await callSvc('media_player', 'play_media', {
        entity_id: SHIELD_CAST,
        media_content_id: pkg,
        media_content_type: 'app',
    });
}

/* ============================================================
   SMART SOURCE — allume tout + lance l'app
   ============================================================ */
async function smartSource(app) {
    if (S.busy) return;
    lockBusy();
    toast(`🎬 ${app.name} — מפעיל...`, 'info');

    try {
        const needPower = !isProjectorOn() || !isReceiverOn();

        const parallel = [
            ...CINEMA.lights.map(l => callSvc('light', 'turn_off', { entity_id: l.id })),
            callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id }),
        ];
        if (!isProjectorOn()) parallel.push(callSvc('media_player', 'turn_on', { entity_id: PROJECTOR }));
        if (!isReceiverOn()) parallel.push(callSvc('media_player', 'turn_on', { entity_id: RECEIVER }));
        await Promise.all(parallel);

        if (needPower) await sleep(4000);

        await Promise.all([
            app.input ? receiverSetInput(app.input) : Promise.resolve(),
            callSvc('media_player', 'select_source', { entity_id: PROJECTOR, source: 'HDMI1' }),
            launchApp(app.pkg),
        ]);

        await sleep(2000);
        await fetchStates();
        toast(`✅ ${app.name} — מוכן!`, 'success');
    } catch (e) {
        console.error('[Onyx] smartSource error:', e);
        toast(`⚠️ שגיאה בהפעלת ${app.name}`, 'error');
    }

    unlockBusy();
}

/* ============================================================
   CHAÎNES TV
   ============================================================ */
async function goToChannel(num) {
    const digits = String(num).split('');
    for (const d of digits) {
        await callSvc('remote', 'send_command', { entity_id: SHIELD, command: `KEYCODE_${d}` });
        await sleep(200);
    }
    toast(`📺 ערוץ ${num}`, 'success');
}

async function sendChannelDigit(d) {
    await callSvc('remote', 'send_command', { entity_id: SHIELD, command: `KEYCODE_${d}` });
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
            await Promise.all([
                ...CINEMA.lights.map(l => callSvc('light', 'turn_off', { entity_id: l.id })),
                callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id }),
                callSvc('media_player', 'turn_on', { entity_id: PROJECTOR }),
                callSvc('media_player', 'turn_on', { entity_id: RECEIVER }),
            ]);
            await sleep(4000);
            await Promise.all([
                receiverSetInput('BD/DVD'),
                callSvc('media_player', 'select_source', { entity_id: PROJECTOR, source: 'HDMI1' }),
            ]);
            await fetchStates();
            toast('✅ קולנוע מוכן!', 'success');
        } else if (name === 'cinema_off') {
            toast('🔴 מכבה הכל...', 'info');
            await Promise.all([
                callSvc('media_player', 'turn_off', { entity_id: PROJECTOR }),
                callSvc('media_player', 'turn_off', { entity_id: RECEIVER }),
                callSvc('light', 'turn_on', { entity_id: 'light.8a_cinema_basement_big_spots_switch' }),
            ]);
            await sleep(3000);
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
    const svc = a === 'open' ? 'open_cover' : a === 'close' ? 'close_cover' : 'stop_cover';
    await callSvc('cover', svc, { entity_id: CINEMA.cover.id });
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

async function toggleDev(id) {
    try { isOn(id) ? await devOff(id) : await devOn(id); }
    catch { toast('⚠️ שגיאה', 'error'); }
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

async function sendRemoteCmd(cmd) {
    try { await callSvc('remote', 'send_command', { entity_id: SHIELD, command: cmd }); }
    catch { toast('⚠️ שגיאה', 'error'); }
}

async function sendText(text) {
    if (!text) return;
    const keyMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const ch of text) {
        const upper = ch.toUpperCase();
        const idx = keyMap.indexOf(upper);
        const cmd = idx >= 0 ? `KEYCODE_${upper}` : ch >= '0' && ch <= '9' ? `KEYCODE_${ch}` : ch === ' ' ? 'KEYCODE_SPACE' : `KEYCODE_${upper}`;
        await callSvc('remote', 'send_command', { entity_id: SHIELD, command: cmd });
        await sleep(120);
    }
    toast(`⌨️ "${text}" נשלח`, 'success');
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
    renderStatusBar(); renderProjectorStatus(); renderLights();
    renderCurtain(); renderSources(); renderAudio();
    renderChannels(); renderSpeakers(); updateHero();
}

function renderStatusBar() {
    const pOn = isProjectorOn(), rOn = isReceiverOn();
    const cState = S.entities[CINEMA.cover.id]?.state || 'unknown';
    const lightsOn = CINEMA.lights.filter(l => S.entities[l.id]?.state === 'on').length;

    setStatItem('statProjector', pOn, pOn ? 'דלוק' : 'כבוי');
    setStatItem('statReceiver', rOn, rOn ? 'דלוק' : 'כבוי');
    const cLabels = { open: 'פתוח', closed: 'סגור', opening: 'נפתח', closing: 'נסגר' };
    setStatItem('statCurtain', cState === 'open', cLabels[cState] || cState);
    setStatItem('statLights', lightsOn > 0, `${lightsOn}/${CINEMA.lights.length}`);

    const actEl = document.getElementById('currentActivity');
    const rawApp = getShieldApp();
    const app = rawApp === 'com.google.android.backdrop' ? null : rawApp;
    const appLabel = app ? (APPS.find(a => a.pkg === app)?.name || app.split('.').pop()) : '—';
    if (actEl) actEl.textContent = appLabel;

    const countEl = document.getElementById('lightsCount');
    if (countEl) countEl.textContent = lightsOn > 0 ? `(${lightsOn} דלוקות)` : '';
}

function setStatItem(elId, on, text) {
    const el = document.getElementById(elId); if (!el) return;
    el.classList.toggle('on', on); el.classList.toggle('off', !on);
    const val = el.querySelector('.stat-val');
    if (val) val.textContent = text;
}

function renderProjectorStatus() {
    const pOn = isProjectorOn(), rOn = isReceiverOn();
    const rSrc = S.entities[RECEIVER]?.attr?.source || '—';
    const rawApp = getShieldApp();
    const app = rawApp === 'com.google.android.backdrop' ? null : rawApp;
    const appLabel = app ? (APPS.find(a => a.pkg === app)?.name || app.split('.').pop()) : '';
    const el = document.getElementById('projectorPanel'); if (!el) return;

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
        </div>
        ${appLabel ? `<div class="proj-activity">🎯 אפליקציה: <strong>${appLabel}</strong></div>` : ''}`;

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
    const lab = { open: 'פתוח', closed: 'סגור', opening: 'נפתח...', closing: 'נסגר...' };
    if (b) { b.textContent = lab[st] || st; b.className = 'badge ' + st; }
    if (v) { v.classList.remove('open', 'closed'); v.classList.add(st === 'open' || st === 'opening' ? 'open' : 'closed'); }
}

function renderSources() {
    const g = document.getElementById('sourcesGrid'); if (!g) return;
    const rawApp = getShieldApp();
    const currentApp = rawApp === 'com.google.android.backdrop' ? null : rawApp;
    const anyOn = isProjectorOn() || isReceiverOn();

    g.innerHTML = APPS.map((a, i) =>
        `<div class="src ${currentApp === a.pkg ? 'active' : ''}" data-idx="${i}"><div class="src-e">${a.emoji}</div><div class="src-n">${a.name}</div></div>`
    ).join('') + `<div class="src src-off" id="srcOff"><div class="src-e">🔴</div><div class="src-n">כיבוי הכל</div></div>`;

    g.querySelectorAll('.src:not(.src-off)').forEach(t => {
        t.addEventListener('click', () => smartSource(APPS[parseInt(t.dataset.idx)]));
    });
    document.getElementById('srcOff')?.addEventListener('click', () => runScene('cinema_off'));
}

function renderChannels() {
    const g = document.getElementById('channelsGrid'); if (!g) return;
    g.innerHTML = TV_CHANNELS.map(c =>
        `<div class="ch-tile" data-ch="${c.num}"><span class="ch-num">${c.num}</span><span class="ch-name">${c.name}</span></div>`
    ).join('');
    g.querySelectorAll('.ch-tile').forEach(t => t.addEventListener('click', () => goToChannel(parseInt(t.dataset.ch))));
}

function renderAudio() {
    const e = S.entities[RECEIVER]; if (!e) return;
    const hasVol = e.attr.volume_level !== undefined;
    const vol = hasVol ? Math.round(e.attr.volume_level * 100) : S.lastVol ?? 30;
    if (hasVol) S.lastVol = vol;
    const muted = e.attr.is_volume_muted || false;
    const rOn = isReceiverOn();
    const num = document.getElementById('volNum');
    const fill = document.getElementById('volFill');
    const knob = document.getElementById('volKnob');
    const range = document.getElementById('volRange');
    const mb = document.getElementById('vMute');
    if (num) num.textContent = !rOn ? 'כבוי' : muted ? 'MUTE' : `${vol}%`;
    if (fill) fill.style.width = `${vol}%`;
    if (knob) knob.style.left = `${vol}%`;
    if (range && !S.volDragging) range.value = vol;
    if (mb) mb.classList.toggle('muted', muted);
}

function renderSpeakers() {
    const g = document.getElementById('speakersGrid'); if (!g) return;
    g.innerHTML = CINEMA.speakers.map(s => {
        const e = S.entities[s.id];
        const st = e?.state || 'unavailable';
        const on = ['playing', 'paused', 'idle'].includes(st);
        const title = e?.attr?.media_title || '';
        return `<div class="spk ${on ? 'on' : ''}" data-id="${s.id}">
            <div class="spk-e">${s.emoji}</div><div class="spk-n">${s.name}</div>
            <div class="spk-s">${on ? (title || 'פעיל') : 'כבוי'}</div></div>`;
    }).join('');
    g.querySelectorAll('.spk').forEach(t => t.addEventListener('click', () => toggleDev(t.dataset.id)));
}

function updateHero() {
    const rawApp = getShieldApp();
    const app = rawApp === 'com.google.android.backdrop' ? null : rawApp;
    S.cinemaOn = isProjectorOn() || isReceiverOn();
    const appLabel = app ? (APPS.find(a => a.pkg === app)?.name || app.split('.').pop()) : null;

    const orb = document.getElementById('heroOrbit');
    const sub = document.getElementById('heroSub');
    const btn = document.getElementById('btnPower');
    const lab = document.getElementById('powerLabel');
    if (orb) orb.classList.toggle('on', S.cinemaOn);
    if (sub) {
        sub.textContent = S.cinemaOn ? `🟢 ${appLabel || 'קולנוע פעיל'}` : '⚫ קולנוע כבוי';
        sub.classList.toggle('on', S.cinemaOn);
    }
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
    const vr = document.getElementById('volRange');
    if (vr) {
        vr.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            S.lastVol = v;
            const f = document.getElementById('volFill'), k = document.getElementById('volKnob'), n = document.getElementById('volNum');
            if (f) f.style.width = `${v}%`;
            if (k) k.style.left = `${v}%`;
            if (n) n.textContent = `${v}%`;
            clearTimeout(vt); vt = setTimeout(() => setVol(v), 300);
        });
        vr.addEventListener('mousedown', () => S.volDragging = true);
        vr.addEventListener('touchstart', () => S.volDragging = true, { passive: true });
        vr.addEventListener('mouseup', () => { S.volDragging = false; });
        vr.addEventListener('touchend', () => { S.volDragging = false; }, { passive: true });
    }

    document.getElementById('btnRefresh')?.addEventListener('click', () => { fetchStates(); toast('🔄 מרענן...', 'info'); });

    document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => {
        b.style.transform = 'scale(0.85)';
        b.style.boxShadow = '0 0 20px rgba(0,255,200,0.6)';
        setTimeout(() => { b.style.transform = ''; b.style.boxShadow = ''; }, 200);
        sendRemoteCmd(b.dataset.cmd);
    }));

    document.getElementById('kbToggle')?.addEventListener('click', () => document.getElementById('kbPanel')?.classList.toggle('hidden'));
    document.getElementById('kbSend')?.addEventListener('click', () => {
        const inp = document.getElementById('kbInput');
        if (inp?.value) { sendText(inp.value); inp.value = ''; }
    });
    document.getElementById('kbInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { sendText(e.target.value); e.target.value = ''; }
    });

    document.querySelectorAll('.numpad-btn').forEach(b => b.addEventListener('click', () => {
        b.style.transform = 'scale(0.85)';
        setTimeout(() => { b.style.transform = ''; }, 150);
        sendChannelDigit(b.dataset.digit);
    }));

    document.querySelectorAll('.mn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.mn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const map = { hero: 'pcHero', lights: 'lightsGrid', sources: 'sourcesGrid', channels: 'channelsSection', remote: 'remoteCard', audio: 'volNum' };
        const t = map[b.dataset.go];
        if (t) document.getElementById(t)?.closest('.glass-card, section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (ok) { startPoll(); }
    else { toast('⚠️ שגיאת חיבור — בודק שוב...', 'error'); setTimeout(async () => { await fetchStates(); startPoll(); }, 3000); }
}

document.addEventListener('DOMContentLoaded', init);
