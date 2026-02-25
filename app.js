/**
 * ONYX REMOTE SPECIAL — PWA Standalone
 * Proxy Vercel + IR Harmony Hub pour contrôle fiable.
 * Clic source/app = allumage auto complet + lancement.
 */

const HARMONY = 'remote.daskal';
const HARMONY_DEVICES = {
    projector: 'Epson Projector',
    receiver: 'Pioneer AV Receiver',
    ps5: 'Sony Game Console',
    appletv: 'Apple TV',
    shield: 'SHIELD',
};
const HARMONY_ACTIVITIES = {
    netflix: 'Netflix',
    freetv: 'FreeTV',
    appletv: 'Watch Apple TV',
    ps5: 'PS5',
    plex: 'Plex',
    startup: 'Startup Show',
};

const CINEMA = {
    lights: [
        { id: 'light.7b_cinema_basement_smallspot_switch', name: 'ספוטים', emoji: '💡' },
        { id: 'light.7b_cinema_basement_led_switch', name: 'לד ארכיטקט', emoji: '🔵' },
        { id: 'light.8a_cinema_basement_big_spots_switch', name: 'ספוטים גדולים', emoji: '🔆' },
        { id: 'light.9a_cinema_basement_posterwall_switch', name: 'פוסטרים', emoji: '🖼️' },
        { id: 'light.8a_cinema_basement_wall_switch', name: 'קיר', emoji: '🏮' },
    ],
    cover: { id: 'cover.cinema_curtains' },
    receiver: { id: 'media_player.pioneer_vsx_lx303_ed2279' },
    projector: { id: 'media_player.epson' },
    players: [
        { id: 'media_player.shield', name: 'Shield', emoji: '🛡️' },
        { id: 'media_player.shield_2', name: 'Shield 2', emoji: '🛡️' },
        { id: 'media_player.qvlnv_byty', name: 'Apple TV', emoji: '🍎' },
    ],
    speakers: [
        { id: 'media_player.livinig_room', name: 'סלון', emoji: '🔈' },
        { id: 'media_player.balcony', name: 'מרפסת', emoji: '🌙' },
        { id: 'media_player.office', name: 'משרד', emoji: '💼' },
        { id: 'media_player.parents', name: 'הורים', emoji: '🛏️' },
    ],
    sources: [
        { name: 'Netflix', activity: 'Netflix', emoji: '🎬' },
        { name: 'Free TV', activity: 'FreeTV', emoji: '📡' },
        { name: 'Apple TV', activity: 'Watch Apple TV', emoji: '📺' },
        { name: 'PS5', activity: 'PS5', emoji: '🎮', extra: { ps5: true } },
        { name: 'Plex', activity: 'Plex', emoji: '🎞️' },
        { name: 'Switch', activity: 'Startup Show', emoji: '🕹️', extra: { inputCmd: 'InputGame' } },
    ],
};

const ALL_IDS = [
    ...CINEMA.lights.map(l => l.id),
    CINEMA.cover.id,
    CINEMA.receiver.id,
    CINEMA.projector.id,
    ...CINEMA.players.map(p => p.id),
    ...CINEMA.speakers.map(s => s.id),
    HARMONY,
];

const S = { entities: {}, cinemaOn: false, busy: false, busyTimer: null, poll: null, lastVol: 30, volDragging: false };

function lockBusy() {
    S.busy = true;
    setBusy(true);
    clearTimeout(S.busyTimer);
    S.busyTimer = setTimeout(() => { S.busy = false; setBusy(false); toast('🔓 נעילה שוחררה', 'info'); }, 45000);
}

function unlockBusy() {
    S.busy = false;
    setBusy(false);
    clearTimeout(S.busyTimer);
}

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

function getCurrentActivity() {
    return S.entities[HARMONY]?.attr?.current_activity || null;
}

function isCinemaActive() {
    const act = getCurrentActivity();
    return !!act && act !== 'PowerOff';
}

function isReceiverOn() {
    return isOn(CINEMA.receiver.id) || isCinemaActive();
}

function isProjectorOn() {
    return isOn(CINEMA.projector.id) || isCinemaActive();
}

/* ============================================================
   HARMONY — Lancer une activité (allume TOUT automatiquement)
   Le Harmony Hub allume le projecteur + receiver + source en un seul appel
   ============================================================ */
async function startHarmonyActivity(activityName) {
    await callSvc('remote', 'turn_on', {
        entity_id: HARMONY,
        activity: activityName,
    });

    for (let i = 1; i <= 4; i++) {
        await sleep(2500);
        await fetchStates();
        if (getCurrentActivity() === activityName) return true;
        if (i < 4) toast(`⏳ ממתין... (${i}/4)`, 'info');
    }

    toast(`⚠️ ${activityName} — בודק...`, 'error');
    return false;
}

async function stopHarmony() {
    toast('🔴 מכבה הכל...', 'info');
    await callSvc('remote', 'turn_off', { entity_id: HARMONY });

    for (let i = 1; i <= 4; i++) {
        await sleep(3000);
        await fetchStates();
        const current = getCurrentActivity();
        if (!current || current === 'PowerOff') {
            toast('🔴 הקולנוע כבוי', 'success');
            return true;
        }
    }

    toast('⚠️ בדוק אם הכל כבוי', 'error');
    return false;
}

/* ============================================================
   SCENES
   ============================================================ */
async function runScene(name) {
    if (S.busy) return;
    lockBusy();

    try {
        if (name === 'cinema_on') {
            await Promise.all(CINEMA.lights.map(l => callSvc('light', 'turn_off', { entity_id: l.id })));
            await callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id });
            await startHarmonyActivity('Startup Show');
        } else if (name === 'cinema_off') {
            await stopHarmony();
            await callSvc('light', 'turn_on', { entity_id: 'light.8a_cinema_basement_big_spots_switch' });
            await fetchStates();
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
   SOURCE = Harmony Activity (allume TOUT + bascule la source)
   ============================================================ */
async function smartSource(activityName, label, extra) {
    if (S.busy) return;
    lockBusy();
    toast(`🎬 ${label} — מפעיל...`, 'info');

    try {
        await Promise.all([
            ...CINEMA.lights.map(l => callSvc('light', 'turn_off', { entity_id: l.id })),
            callSvc('cover', 'close_cover', { entity_id: CINEMA.cover.id }),
        ]);

        const alreadyActive = getCurrentActivity() === activityName;

        if (alreadyActive) {
            toast(`🔄 ${label} — relance...`, 'info');
            await callSvc('remote', 'turn_on', { entity_id: HARMONY, activity: activityName });
            await sleep(3000);
        } else {
            await startHarmonyActivity(activityName);
        }

        if (extra?.ps5) {
            toast('🎮 מדליק PS5...', 'info');
            await callSvc('remote', 'send_command', {
                entity_id: HARMONY, device: HARMONY_DEVICES.ps5, command: 'PowerOn',
            });
            await sleep(2000);
        }

        if (extra?.inputCmd) {
            await sleep(1000);
            await callSvc('remote', 'send_command', {
                entity_id: HARMONY, device: HARMONY_DEVICES.receiver, command: extra.inputCmd,
            });
        }

        if (!alreadyActive && !isProjectorOn()) {
            await sleep(3000);
            await callSvc('remote', 'send_command', {
                entity_id: HARMONY, device: HARMONY_DEVICES.projector, command: 'PowerOn',
            });
        }

        await fetchStates();
        toast(`✅ ${label} — מוכן!`, 'success');
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
    const svc = a === 'open' ? 'open_cover' : a === 'close' ? 'close_cover' : 'stop_cover';
    await callSvc('cover', svc, { entity_id: CINEMA.cover.id });
    setTimeout(fetchStates, 2000);
}

async function devOn(id) {
    if (id === CINEMA.projector.id) {
        toast('📽️ מדליק מקרן...', 'info');
        await callSvc('remote', 'send_command', {
            entity_id: HARMONY, device: HARMONY_DEVICES.projector, command: 'PowerOn',
        });
        await sleep(5000);
        await fetchStates();
        toast(isOn(id) ? '✅ מקרן דלוק!' : '⚠️ בדוק מקרן', isOn(id) ? 'success' : 'error');
        return;
    }
    if (id === CINEMA.receiver.id) {
        toast('🔊 מדליק מגבר...', 'info');
        await callSvc('remote', 'send_command', {
            entity_id: HARMONY, device: HARMONY_DEVICES.receiver, command: 'PowerOn',
        });
        await sleep(4000);
        await fetchStates();
        toast(isOn(id) ? '✅ מגבר דלוק!' : '⚠️ בדוק מגבר', isOn(id) ? 'success' : 'error');
        return;
    }
    await callSvc('media_player', 'turn_on', { entity_id: id });
    toast('⚡ הופעל', 'success');
    setTimeout(fetchStates, 3000);
}

async function devOff(id) {
    if (id === CINEMA.projector.id) {
        await callSvc('remote', 'send_command', {
            entity_id: HARMONY, device: HARMONY_DEVICES.projector, command: 'PowerOff',
        });
    } else if (id === CINEMA.receiver.id) {
        await callSvc('remote', 'send_command', {
            entity_id: HARMONY, device: HARMONY_DEVICES.receiver, command: 'PowerOff',
        });
    } else {
        await callSvc('media_player', 'turn_off', { entity_id: id });
    }
    toast('🔴 כובה', 'success');
    setTimeout(fetchStates, 4000);
}

async function toggleDev(id) {
    try {
        isOn(id) ? await devOff(id) : await devOn(id);
    } catch { toast('⚠️ שגיאה בהפעלה', 'error'); }
}

async function volStep(dir) {
    const cmd = dir === 'up' ? 'VolumeUp' : 'VolumeDown';
    if (isOn(CINEMA.receiver.id)) {
        await callSvc('media_player', dir === 'up' ? 'volume_up' : 'volume_down', { entity_id: CINEMA.receiver.id });
    } else {
        await callSvc('remote', 'send_command', {
            entity_id: HARMONY, device: HARMONY_DEVICES.receiver, command: cmd,
        });
    }
    S.lastVol = Math.max(0, Math.min(100, (S.lastVol || 30) + (dir === 'up' ? 3 : -3)));
    renderAudio();
    setTimeout(fetchStates, 1500);
}

async function setVol(v) {
    S.lastVol = v;
    if (isOn(CINEMA.receiver.id)) {
        await callSvc('media_player', 'volume_set', { entity_id: CINEMA.receiver.id, volume_level: v / 100 });
    }
}

async function toggleMute() {
    if (isOn(CINEMA.receiver.id)) {
        const m = S.entities[CINEMA.receiver.id]?.attr?.is_volume_muted || false;
        await callSvc('media_player', 'volume_mute', { entity_id: CINEMA.receiver.id, is_volume_muted: !m });
    } else {
        await callSvc('remote', 'send_command', {
            entity_id: HARMONY, device: HARMONY_DEVICES.receiver, command: 'Mute',
        });
    }
    setTimeout(fetchStates, 800);
}

async function sendRemoteCmd(cmd) {
    try {
        await callSvc('remote', 'send_command', {
            entity_id: 'remote.shield',
            command: cmd,
        });
    } catch {
        toast('⚠️ שגיאה בשליחה', 'error');
    }
}

async function sendText(text) {
    if (!text) return;
    try {
        await callSvc('androidtv', 'adb_command', {
            entity_id: 'media_player.shield_2',
            command: `input text "${text}"`,
        });
        toast(`⌨️ "${text}" נשלח`, 'success');
    } catch {
        for (const ch of text) {
            await callSvc('remote', 'send_command', {
                entity_id: 'remote.shield',
                command: ch,
            });
            await sleep(150);
        }
        toast(`⌨️ "${text}" נשלח`, 'success');
    }
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
    renderAudio();
    renderDevices();
    renderSpeakers();
    updateHero();
}

function renderStatusBar() {
    const pOn = isProjectorOn();
    const rOn = isReceiverOn();
    const activity = getCurrentActivity();
    const cState = S.entities[CINEMA.cover.id]?.state || 'unknown';
    const lightsOn = CINEMA.lights.filter(l => S.entities[l.id]?.state === 'on').length;
    const lightsTotal = CINEMA.lights.length;

    setStatItem('statProjector', pOn, pOn ? 'דלוק' : 'כבוי');
    setStatItem('statReceiver', rOn, rOn ? 'דלוק' : 'כבוי');
    const cLabels = { open:'פתוח', closed:'סגור', opening:'נפתח', closing:'נסגר' };
    setStatItem('statCurtain', cState === 'open', cLabels[cState] || cState);
    setStatItem('statLights', lightsOn > 0, `${lightsOn}/${lightsTotal}`);

    const actEl = document.getElementById('currentActivity');
    if (actEl) actEl.textContent = activity && activity !== 'PowerOff' ? activity : '—';

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
    const pOn = isProjectorOn();
    const rOn = isReceiverOn();
    const activity = getCurrentActivity();
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
        </div>
        ${activity && activity !== 'PowerOff' ? `<div class="proj-activity">🎯 פעילות: <strong>${activity}</strong></div>` : ''}`;

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
    const activity = getCurrentActivity();
    const isActive = !!activity && activity !== 'PowerOff';

    g.innerHTML = CINEMA.sources.map((s, i) =>
        `<div class="src ${activity === s.activity ? 'active' : ''}" data-idx="${i}"><div class="src-e">${s.emoji}</div><div class="src-n">${s.name}</div></div>`
    ).join('') + (isActive ? `<div class="src src-off" id="srcOff"><div class="src-e">🔴</div><div class="src-n">כיבוי הכל</div></div>` : '');

    g.querySelectorAll('.src:not(.src-off)').forEach(t => {
        t.addEventListener('click', () => {
            const src = CINEMA.sources[parseInt(t.dataset.idx)];
            smartSource(src.activity, src.name, src.extra);
        });
    });
    document.getElementById('srcOff')?.addEventListener('click', () => runScene('cinema_off'));
}

function renderAudio() {
    const e = S.entities[CINEMA.receiver.id]; if (!e) return;
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

function renderDevices() {
    const g = document.getElementById('devicesGrid'); if (!g) return;
    g.innerHTML = CINEMA.players.map(d => {
        const st = S.entities[d.id]?.state || 'unavailable';
        const on = isOn(d.id);
        return `<div class="dev ${on ? 'on' : 'off'}" data-id="${d.id}"><div class="dev-e">${d.emoji}</div><div class="dev-n">${d.name}</div><div class="dev-s">${on ? 'דלוק' : st === 'unavailable' ? '—' : 'כבוי'}</div></div>`;
    }).join('');
    g.querySelectorAll('.dev').forEach(t => t.addEventListener('click', () => toggleDev(t.dataset.id)));
}

function renderSpeakers() {
    const g = document.getElementById('speakersGrid'); if (!g) return;
    g.innerHTML = CINEMA.speakers.map(s => {
        const e = S.entities[s.id];
        const st = e?.state || 'unavailable';
        const on = ['playing','paused','idle'].includes(st);
        const title = e?.attr?.media_title || '';
        return `<div class="spk ${on ? 'on' : ''}" data-id="${s.id}">
            <div class="spk-e">${s.emoji}</div>
            <div class="spk-n">${s.name}</div>
            <div class="spk-s">${on ? (title || 'פעיל') : 'כבוי'}</div>
        </div>`;
    }).join('');
    g.querySelectorAll('.spk').forEach(t => t.addEventListener('click', () => toggleDev(t.dataset.id)));
}

function updateHero() {
    const activity = getCurrentActivity();
    S.cinemaOn = !!activity && activity !== 'PowerOff';

    const orb = document.getElementById('heroOrbit');
    const sub = document.getElementById('heroSub');
    const btn = document.getElementById('btnPower');
    const lab = document.getElementById('powerLabel');
    if (orb) orb.classList.toggle('on', S.cinemaOn);
    if (sub) {
        sub.textContent = S.cinemaOn ? `🟢 ${activity}` : '⚫ קולנוע כבוי';
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
        if (e.key === 'Enter') { const inp = e.target; sendText(inp.value); inp.value = ''; }
    });

    document.querySelectorAll('.mn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.mn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const map = { hero:'pcHero', lights:'lightsGrid', sources:'sourcesGrid', remote:'remoteCard', audio:'volNum' };
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
