'use strict';

/* ---------- storage ---------- */

const STORE_KEY = 'steady.v1';

const DEFAULT_STATE = {
  settings: { focusMin: 25, breakMin: 5, screenGoalMin: 120 },
  days: {},
  apps: [
    { id: 'a1', name: 'Instagram', limitMin: 30 },
    { id: 'a2', name: 'TikTok', limitMin: 20 },
    { id: 'a3', name: 'YouTube', limitMin: 30 },
  ],
  sessions: [],
  timer: null,
  setup: {},
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    toast('Couldn’t save. Storage may be full or blocked.');
  }
}

/* ---------- helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}
function prettyDate(key, opts = { weekday: 'long', month: 'short', day: 'numeric' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function fmtDuration(min) {
  min = Math.round(min);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function day(key = dateKey()) {
  if (!state.days[key]) state.days[key] = { intention: '', blocks: [], tasks: [], review: null };
  return state.days[key];
}
function peekDay(key) {
  return state.days[key] || null;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- navigation ---------- */

const TITLES = { today: 'Today', focus: 'Focus', limits: 'Limits', review: 'Review' };
let currentTab = 'today';
let reviewDate = null;

function go(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));

function render() {
  $('#today-label').textContent = prettyDate(dateKey());
  $('#view-title').textContent = TITLES[currentTab];
  renderNowChip();
  const view = $('#view');
  if (currentTab === 'today') renderToday(view);
  if (currentTab === 'focus') renderFocus(view);
  if (currentTab === 'limits') renderLimits(view);
  if (currentTab === 'review') renderReview(view);
}

function currentBlock() {
  const t = nowMinutes();
  const blocks = peekDay(dateKey())?.blocks || [];
  return blocks.find((b) => toMinutes(b.start) <= t && t < toMinutes(b.end)) || null;
}

function renderNowChip() {
  const chip = $('#now-chip');
  const timer = state.timer;
  if (timer && timer.endsAt) {
    chip.hidden = false;
    chip.textContent = `${timer.mode === 'focus' ? 'Focusing' : 'Break'} · ${fmtClock(timer.endsAt - Date.now())}`;
    return;
  }
  const b = currentBlock();
  chip.hidden = !b;
  if (b) chip.textContent = `Now: ${b.label}`;
}

/* ---------- Today ---------- */

function renderToday(view) {
  const key = dateKey();
  const d = day(key);
  const t = nowMinutes();
  const blocks = [...d.blocks].sort((a, b) => a.start.localeCompare(b.start));
  const yesterday = peekDay(addDays(key, -1));
  const canCopy = !d.blocks.length && yesterday?.blocks?.length;
  const openTasks = d.tasks.filter((x) => !x.done).length;

  view.innerHTML = `
    <h2>The one thing</h2>
    <div class="card">
      <input class="intention" id="intention" type="text" maxlength="120"
        placeholder="What would make today a good day?" value="${esc(d.intention)}">
    </div>

    <h2>Plan</h2>
    <div class="card">
      <div id="blocks">
        ${blocks.length ? blocks.map((b) => {
          const s = toMinutes(b.start), e = toMinutes(b.end);
          const cls = t >= e ? 'past' : (t >= s ? 'current' : '');
          return `<div class="block-item ${cls}">
            <span class="block-time">${b.start}–${b.end}</span>
            <span class="block-label">${esc(b.label)}</span>
            <button class="icon-btn" data-del-block="${b.id}" aria-label="Remove ${esc(b.label)}">×</button>
          </div>`;
        }).join('') : `<p class="empty">Block out your day. Time you don’t plan tends to go to your phone.</p>`}
      </div>
      ${canCopy ? `<button class="btn ghost" id="copy-plan">Copy yesterday’s plan</button>` : ''}
      <form id="block-form" style="margin-top:10px">
        <div class="grid-2">
          <label class="field"><span>Start</span><input type="time" name="start" required value="${suggestStart(blocks)}"></label>
          <label class="field"><span>End</span><input type="time" name="end" required></label>
        </div>
        <div class="row" style="margin-top:8px">
          <input class="grow" type="text" name="label" placeholder="e.g. Deep work, gym, admin" maxlength="60" required>
          <button class="btn primary" type="submit">Add</button>
        </div>
      </form>
    </div>

    <h2>Tasks${d.tasks.length ? ` · ${openTasks} left` : ''}</h2>
    <div class="card">
      <div id="tasks">
        ${d.tasks.length ? d.tasks.map((x) => `
          <div class="task ${x.done ? 'done' : ''}">
            <input type="checkbox" data-toggle-task="${x.id}" ${x.done ? 'checked' : ''} aria-label="Done: ${esc(x.text)}">
            <span class="text">${esc(x.text)}</span>
            ${x.done ? '' : `<button class="icon-btn" data-focus-task="${x.id}" aria-label="Focus on ${esc(x.text)}" title="Start a focus session">▶</button>`}
            <button class="icon-btn" data-del-task="${x.id}" aria-label="Remove ${esc(x.text)}">×</button>
          </div>`).join('') : `<p class="empty">Three tasks you’d be glad to finish is plenty.</p>`}
      </div>
      <form id="task-form" class="row" style="margin-top:10px">
        <input class="grow" type="text" name="text" placeholder="Add a task" maxlength="100" required>
        <button class="btn primary" type="submit">Add</button>
      </form>
    </div>
  `;

  $('#intention').addEventListener('change', (e) => { d.intention = e.target.value.trim(); save(); });

  $('#block-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const start = f.get('start'), end = f.get('end'), label = String(f.get('label')).trim();
    if (!label) return;
    if (toMinutes(end) <= toMinutes(start)) { toast('End time needs to be after the start.'); return; }
    d.blocks.push({ id: uid(), start, end, label });
    save(); render();
  });

  $('#copy-plan')?.addEventListener('click', () => {
    d.blocks = yesterday.blocks.map((b) => ({ ...b, id: uid() }));
    save(); render(); toast('Copied yesterday’s plan');
  });

  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = String(new FormData(e.target).get('text')).trim();
    if (!text) return;
    d.tasks.push({ id: uid(), text, done: false });
    save(); render();
    $('#task-form input').focus();
  });

  view.querySelectorAll('[data-del-block]').forEach((b) => b.addEventListener('click', () => {
    d.blocks = d.blocks.filter((x) => x.id !== b.dataset.delBlock); save(); render();
  }));
  view.querySelectorAll('[data-toggle-task]').forEach((b) => b.addEventListener('change', () => {
    const task = d.tasks.find((x) => x.id === b.dataset.toggleTask);
    task.done = b.checked; save(); render();
  }));
  view.querySelectorAll('[data-del-task]').forEach((b) => b.addEventListener('click', () => {
    d.tasks = d.tasks.filter((x) => x.id !== b.dataset.delTask); save(); render();
  }));
  view.querySelectorAll('[data-focus-task]').forEach((b) => b.addEventListener('click', () => {
    const task = d.tasks.find((x) => x.id === b.dataset.focusTask);
    if (!state.timer || !state.timer.endsAt) {
      state.timer = newTimer('focus');
      state.timer.taskText = task.text;
      save();
    }
    go('focus');
  }));
}

function suggestStart(blocks) {
  if (blocks.length) return blocks[blocks.length - 1].end;
  const t = Math.ceil((nowMinutes() + 1) / 30) * 30;
  return t >= 24 * 60 ? '09:00' : `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/* ---------- Focus ---------- */

let tickHandle = null;
let wakeLock = null;
let audioCtx = null;

function newTimer(mode) {
  const min = mode === 'focus' ? state.settings.focusMin : state.settings.breakMin;
  return { mode, durationMs: min * 60000, remainingMs: min * 60000, endsAt: null, startedAt: null, taskText: state.timer?.taskText || '' };
}

function focusStats() {
  const today = dateKey();
  const todays = state.sessions.filter((s) => s.date === today);
  const minutesToday = todays.reduce((a, s) => a + s.minutes, 0);
  const daysWith = new Set(state.sessions.map((s) => s.date));
  let streak = 0;
  let k = daysWith.has(today) ? today : addDays(today, -1);
  while (daysWith.has(k)) { streak++; k = addDays(k, -1); }
  return { count: todays.length, minutesToday, streak };
}

function renderFocus(view) {
  if (!state.timer) state.timer = newTimer('focus');
  const timer = state.timer;
  const running = Boolean(timer.endsAt);
  const remaining = running ? timer.endsAt - Date.now() : timer.remainingMs;
  const stats = focusStats();
  const openTasks = (peekDay(dateKey())?.tasks || []).filter((x) => !x.done);
  const recent = state.sessions.slice(-6).reverse();
  const C = 2 * Math.PI * 54;

  view.innerHTML = `
    <div class="segmented" role="group" aria-label="Timer mode" style="margin-top:8px">
      <button data-mode="focus" aria-pressed="${timer.mode === 'focus'}">Focus · ${state.settings.focusMin}m</button>
      <button data-mode="break" aria-pressed="${timer.mode === 'break'}">Break · ${state.settings.breakMin}m</button>
    </div>

    <div class="timer-wrap">
      <div class="timer ${timer.mode}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="track" cx="60" cy="60" r="54" fill="none" stroke-width="8"/>
          <circle class="progress" id="ring" cx="60" cy="60" r="54" fill="none" stroke-width="8"
            stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - remaining / timer.durationMs)}"/>
        </svg>
        <div class="timer-readout">
          <div class="time" id="clock" role="timer">${fmtClock(remaining)}</div>
          <div class="mode">${timer.mode === 'focus' ? 'Focus' : 'Break'}</div>
        </div>
      </div>
    </div>

    ${timer.mode === 'focus' ? `
      <label class="field"><span>Working on</span>
        <input type="text" id="task-text" list="task-list" maxlength="100" placeholder="Name the thing (optional)" value="${esc(timer.taskText)}">
        <datalist id="task-list">${openTasks.map((x) => `<option value="${esc(x.text)}">`).join('')}</datalist>
      </label>` : `<p class="muted small" style="text-align:center">Stand up, drink water, look at something far away. Not your phone.</p>`}

    <div class="grid-2" style="margin-top:14px">
      <button class="btn primary" id="start">${running ? 'Pause' : (remaining < timer.durationMs ? 'Resume' : 'Start')}</button>
      <button class="btn" id="reset">${running || remaining < timer.durationMs ? 'Reset' : 'Skip'}</button>
    </div>

    <h2>Today</h2>
    <div class="stats">
      <div class="stat"><div class="value">${fmtDuration(stats.minutesToday)}</div><div class="label">focused</div></div>
      <div class="stat"><div class="value">${stats.count}</div><div class="label">sessions</div></div>
      <div class="stat"><div class="value">${stats.streak}</div><div class="label">day streak</div></div>
    </div>

    <h2>Recent sessions</h2>
    <div class="card">
      ${recent.length ? recent.map((s) => `
        <div class="session">
          <span>${esc(s.taskText || 'Focus session')}</span>
          <span class="muted">${s.minutes}m · ${s.date === dateKey() ? s.time : prettyDate(s.date, { month: 'short', day: 'numeric' })}</span>
        </div>`).join('') : `<p class="empty">Finished sessions show up here.</p>`}
    </div>

    <h2>Timer lengths</h2>
    <div class="card grid-2">
      <label class="field" style="margin:0"><span>Focus (min)</span><input type="number" id="set-focus" min="5" max="120" inputmode="numeric" value="${state.settings.focusMin}"></label>
      <label class="field" style="margin:0"><span>Break (min)</span><input type="number" id="set-break" min="1" max="60" inputmode="numeric" value="${state.settings.breakMin}"></label>
    </div>
    <p class="muted small">Keep Steady open during a session. iPhone won’t let a web app alert you in the background, so the screen stays on while the timer runs.</p>
  `;

  view.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    if (state.timer.mode === b.dataset.mode) return;
    if (state.timer.endsAt && !confirm('Stop the running timer?')) return;
    state.timer = newTimer(b.dataset.mode);
    releaseWake(); save(); render();
  }));

  $('#task-text')?.addEventListener('input', (e) => { state.timer.taskText = e.target.value; save(); });

  $('#start').addEventListener('click', () => {
    const t = state.timer;
    if (t.endsAt) {
      t.remainingMs = t.endsAt - Date.now();
      t.endsAt = null;
      releaseWake();
    } else {
      t.endsAt = Date.now() + t.remainingMs;
      if (!t.startedAt) t.startedAt = Date.now();
      primeAudio();
      requestWake();
    }
    save(); render();
  });

  $('#reset').addEventListener('click', () => {
    const t = state.timer;
    const fresh = !t.endsAt && t.remainingMs >= t.durationMs;
    state.timer = newTimer(fresh ? (t.mode === 'focus' ? 'break' : 'focus') : t.mode);
    releaseWake(); save(); render();
  });

  const setLen = (id, keyName, lo, hi) => $(id).addEventListener('change', (e) => {
    const v = Math.min(hi, Math.max(lo, Math.round(Number(e.target.value) || 0)));
    state.settings[keyName] = v;
    if (!state.timer.endsAt && state.timer.remainingMs >= state.timer.durationMs) state.timer = newTimer(state.timer.mode);
    save(); render();
  });
  setLen('#set-focus', 'focusMin', 5, 120);
  setLen('#set-break', 'breakMin', 1, 60);
}

function tick() {
  if (state.timer?.endsAt && Date.now() >= state.timer.endsAt) completeTimer();
  const t = state.timer;
  renderNowChip();
  if (currentTab !== 'focus' || !t || !t.endsAt) return;
  const remaining = t.endsAt - Date.now();
  const clock = $('#clock'), ring = $('#ring');
  if (clock) clock.textContent = fmtClock(remaining);
  if (ring) {
    const C = 2 * Math.PI * 54;
    ring.setAttribute('stroke-dashoffset', C * (1 - remaining / t.durationMs));
  }
}

function completeTimer() {
  const t = state.timer;
  if (t.mode === 'focus') {
    const started = new Date(t.startedAt || t.endsAt - t.durationMs);
    state.sessions.push({
      id: uid(),
      date: dateKey(started),
      time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
      minutes: Math.round(t.durationMs / 60000),
      taskText: (t.taskText || '').trim(),
    });
    state.timer = newTimer('break');
    toast('Session done. Take a break.');
  } else {
    state.timer = newTimer('focus');
    toast('Break’s over.');
  }
  chime();
  releaseWake();
  save();
  render();
}

function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* no audio */ }
}
function chime() {
  if (!audioCtx) return;
  try {
    [0, 0.18, 0.36].forEach((offset, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + offset);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + offset + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + offset);
      o.stop(audioCtx.currentTime + offset + 0.55);
    });
  } catch { /* no audio */ }
}
async function requestWake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
}
function releaseWake() {
  try { wakeLock?.release(); } catch { /* already released */ }
  wakeLock = null;
}

/* ---------- Limits ---------- */

const SETUP = [
  { id: 'passcode', title: 'Have someone else set your Screen Time passcode', steps: [
    'Settings → Screen Time → Lock Screen Time Settings.',
    'Hand your phone to a friend or partner and let them pick the code. Don’t watch.',
    'Now “Ignore Limit” needs them, so your limits are real.',
  ] },
  { id: 'applimits', title: 'Set App Limits to match your budgets below', steps: [
    'Settings → Screen Time → App Limits → Add Limit.',
    'Pick the apps from your list below and set the same daily minutes.',
    'Leave “Block at End of Limit” on.',
  ] },
  { id: 'downtime', title: 'Schedule Downtime for the evening', steps: [
    'Settings → Screen Time → Downtime → Scheduled.',
    'Something like 22:30 to 07:00. Only “Always Allowed” apps work during it.',
    'In Always Allowed, keep Phone, Messages, Maps and Steady. Remove the rest.',
  ] },
  { id: 'notifs', title: 'Turn off notifications from the apps you’re limiting', steps: [
    'Settings → Notifications → pick each app → turn off Allow Notifications.',
    'You decide when to check them, rather than the other way round.',
  ] },
  { id: 'homescreen', title: 'Take distracting apps off your home screen', steps: [
    'Long-press each app → Remove App → Remove from Home Screen.',
    'It stays in the App Library, one extra swipe away. That swipe is often enough.',
    'Put Steady where Instagram used to be.',
  ] },
  { id: 'grayscale', title: 'Add a grayscale shortcut', steps: [
    'Settings → Accessibility → Display & Text Size → Color Filters → Grayscale.',
    'Then Accessibility → Accessibility Shortcut → Color Filters.',
    'Triple-click the side button to switch the colour off when you notice yourself scrolling.',
  ] },
  { id: 'focusmode', title: 'Make a Work Focus that hides apps', steps: [
    'Settings → Focus → + → Work.',
    'Under Apps, allow only what you need. Turn on “Hide notification badges”.',
    'Set it to turn on automatically when your work blocks start.',
  ] },
  { id: 'bedroom', title: 'Charge your phone outside the bedroom', steps: [
    'Pick a spot in the kitchen or hallway. Get a $10 alarm clock if you use your phone as one.',
  ] },
];

function renderLimits(view) {
  const done = SETUP.filter((s) => state.setup[s.id]).length;
  const lastReview = findLastReview();

  view.innerHTML = `
    <p class="muted" style="margin:4px 4px 0">Steady can’t block apps on iPhone. Only Apple’s Screen Time can. These steps set it up so you can’t quietly switch it off.</p>

    <h2>Lock it down · ${done}/${SETUP.length}</h2>
    <div class="card">
      ${SETUP.map((s) => `
        <div class="check ${state.setup[s.id] ? 'done' : ''}">
          <input type="checkbox" data-setup="${s.id}" ${state.setup[s.id] ? 'checked' : ''} aria-label="Done: ${esc(s.title)}">
          <details ${state.setup[s.id] ? '' : (s.id === firstUndone() ? 'open' : '')}>
            <summary>${esc(s.title)}</summary>
            <ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
          </details>
        </div>`).join('')}
    </div>

    <h2>Daily budgets</h2>
    <div class="card">
      <label class="field" style="margin-top:0"><span>Total screen time goal (minutes per day)</span>
        <input type="number" id="screen-goal" min="15" max="960" step="15" inputmode="numeric" value="${state.settings.screenGoalMin}">
      </label>
      <p class="muted small" style="margin:6px 0 4px">${fmtDuration(state.settings.screenGoalMin)} a day. The average adult is closer to 4–5h.</p>
    </div>
    <div class="card">
      <h3>Apps to watch</h3>
      <p class="muted small" style="margin:0 0 6px">Minutes per day. Use the same numbers in Screen Time → App Limits.</p>
      ${state.apps.length ? state.apps.map((a) => `
        <div class="app-row">
          <span class="name">${esc(a.name)}</span>
          <input type="number" min="0" max="600" step="5" inputmode="numeric" data-app-limit="${a.id}" value="${a.limitMin}" aria-label="${esc(a.name)} daily minutes">
          <button class="icon-btn" data-del-app="${a.id}" aria-label="Remove ${esc(a.name)}">×</button>
        </div>`).join('') : `<p class="empty">Add the apps that eat your time.</p>`}
      <form id="app-form" class="row" style="margin-top:10px">
        <input class="grow" type="text" name="name" placeholder="App name" maxlength="40" required>
        <button class="btn primary" type="submit">Add</button>
      </form>
    </div>

    ${lastReview ? `
      <h2>Last check-in · ${prettyDate(lastReview.key, { weekday: 'short', month: 'short', day: 'numeric' })}</h2>
      <div class="card">${limitSummary(lastReview.review)}</div>` : ''}
  `;

  view.querySelectorAll('[data-setup]').forEach((b) => b.addEventListener('change', () => {
    state.setup[b.dataset.setup] = b.checked; save(); render();
  }));
  $('#screen-goal').addEventListener('change', (e) => {
    state.settings.screenGoalMin = Math.min(960, Math.max(15, Math.round(Number(e.target.value) || 120)));
    save(); render();
  });
  view.querySelectorAll('[data-app-limit]').forEach((inp) => inp.addEventListener('change', () => {
    const app = state.apps.find((a) => a.id === inp.dataset.appLimit);
    app.limitMin = Math.max(0, Math.round(Number(inp.value) || 0)); save();
  }));
  view.querySelectorAll('[data-del-app]').forEach((b) => b.addEventListener('click', () => {
    state.apps = state.apps.filter((a) => a.id !== b.dataset.delApp); save(); render();
  }));
  $('#app-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name')).trim();
    if (!name) return;
    state.apps.push({ id: uid(), name, limitMin: 30 }); save(); render();
  });
}

function firstUndone() {
  return SETUP.find((s) => !state.setup[s.id])?.id;
}

function findLastReview() {
  const keys = Object.keys(state.days).filter((k) => state.days[k].review).sort();
  const k = keys[keys.length - 1];
  return k ? { key: k, review: state.days[k].review } : null;
}

function limitSummary(r) {
  const goal = state.settings.screenGoalMin;
  const total = r.screenMin;
  const lines = [];
  if (total != null) {
    const over = total > goal;
    lines.push(`<div class="row"><span class="grow">Screen time ${fmtDuration(total)} of ${fmtDuration(goal)}</span>
      ${over ? `<span class="flag">▲ ${fmtDuration(total - goal)} over</span>` : `<span class="flag ok">✓ under goal</span>`}</div>
      <div class="progress-bar ${over ? 'over' : ''}"><div style="width:${Math.min(100, (total / goal) * 100)}%"></div></div>`);
  }
  const overApps = state.apps.filter((a) => (r.apps?.[a.id] ?? 0) > a.limitMin);
  if (overApps.length) {
    lines.push(`<p class="small" style="margin:10px 0 0">Over budget: ${overApps.map((a) => `${esc(a.name)} (${fmtDuration(r.apps[a.id])} / ${fmtDuration(a.limitMin)})`).join(', ')}</p>`);
  } else if (r.apps && Object.keys(r.apps).length) {
    lines.push(`<p class="small" style="margin:10px 0 0; color:var(--good)">Every app stayed inside its budget.</p>`);
  }
  return lines.join('') || `<p class="empty">No numbers logged.</p>`;
}

/* ---------- Review ---------- */

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

function renderReview(view) {
  const today = dateKey();
  if (!reviewDate) reviewDate = today;
  const key = reviewDate;
  const d = day(key);
  const r = d.review || {};
  const sh = r.screenMin != null ? Math.floor(r.screenMin / 60) : '';
  const sm = r.screenMin != null ? r.screenMin % 60 : '';
  const focusMin = state.sessions.filter((s) => s.date === key).reduce((a, s) => a + s.minutes, 0);
  const tasksDone = d.tasks.filter((x) => x.done).length;

  view.innerHTML = `
    <div class="row" style="margin-top:6px">
      <button class="icon-btn" id="prev-day" aria-label="Previous day">‹</button>
      <strong class="grow" style="text-align:center">${key === today ? 'Tonight’s check-in' : prettyDate(key)}</strong>
      <button class="icon-btn" id="next-day" aria-label="Next day" ${key >= today ? 'disabled' : ''}>›</button>
    </div>

    <div class="card">
      <p class="muted small" style="margin:0">Open Settings → Screen Time → See All App &amp; Website Activity, and copy the numbers in. Two minutes, every evening.</p>
      <form id="review-form">
        <div class="grid-2">
          <label class="field"><span>Screen time (h)</span><input type="number" name="sh" min="0" max="24" inputmode="numeric" value="${sh}"></label>
          <label class="field"><span>(min)</span><input type="number" name="sm" min="0" max="59" inputmode="numeric" value="${sm}"></label>
        </div>
        <label class="field"><span>Pickups</span><input type="number" name="pickups" min="0" max="999" inputmode="numeric" value="${r.pickups ?? ''}"></label>
        ${state.apps.map((a) => `
          <label class="field"><span>${esc(a.name)} (min, budget ${a.limitMin})</span>
            <input type="number" name="app-${a.id}" min="0" max="1440" inputmode="numeric" value="${r.apps?.[a.id] ?? ''}">
          </label>`).join('')}

        <label class="field"><span>How did today feel?</span></label>
        <div class="mood" role="group" aria-label="Mood">
          ${MOODS.map((m, i) => `<button type="button" data-mood="${i + 1}" aria-pressed="${r.mood === i + 1}" aria-label="Mood ${i + 1} of 5">${m}</button>`).join('')}
        </div>
        <label class="field"><span>One thing that went well</span><input type="text" name="win" maxlength="140" value="${esc(r.win)}"></label>
        <label class="field"><span>What pulled you off track?</span><textarea name="derail" maxlength="400">${esc(r.derail)}</textarea></label>
        <label class="field"><span>Tomorrow I’ll…</span><input type="text" name="tomorrow" maxlength="140" placeholder="One concrete change" value="${esc(r.tomorrow)}"></label>
        <button class="btn primary block" type="submit" style="margin-top:14px">Save check-in</button>
      </form>
      <p class="muted small" style="margin:10px 0 0">This day: ${fmtDuration(focusMin)} focused · ${tasksDone}/${d.tasks.length} tasks done${d.intention ? ` · aimed for “${esc(d.intention)}”` : ''}</p>
    </div>

    ${d.review ? `<h2>Against your budgets</h2><div class="card">${limitSummary(d.review)}</div>` : ''}

    <h2>Last 7 days</h2>
    ${weekCharts(today)}

    <h2>Your data</h2>
    <div class="card">
      <p class="muted small" style="margin:0 0 10px">Everything stays on this phone. Back it up now and then.</p>
      <div class="grid-2">
        <button class="btn" id="export">Export backup</button>
        <button class="btn" id="import">Import backup</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>
  `;

  let mood = r.mood ?? null;
  view.querySelectorAll('[data-mood]').forEach((b) => b.addEventListener('click', () => {
    mood = Number(b.dataset.mood);
    view.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));

  $('#review-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num = (name) => { const v = f.get(name); return v === '' || v == null ? null : Math.max(0, Math.round(Number(v))); };
    const h = num('sh'), m = num('sm');
    const apps = {};
    state.apps.forEach((a) => { const v = num(`app-${a.id}`); if (v != null) apps[a.id] = v; });
    d.review = {
      screenMin: h == null && m == null ? null : (h || 0) * 60 + (m || 0),
      pickups: num('pickups'),
      apps,
      mood,
      win: String(f.get('win') || '').trim(),
      derail: String(f.get('derail') || '').trim(),
      tomorrow: String(f.get('tomorrow') || '').trim(),
    };
    if (d.review.tomorrow && key === today) {
      const next = day(addDays(today, 1));
      if (!next.intention) next.intention = d.review.tomorrow;
    }
    save(); render(); toast('Check-in saved');
  });

  $('#prev-day').addEventListener('click', () => { reviewDate = addDays(key, -1); render(); });
  $('#next-day').addEventListener('click', () => { if (key < today) { reviewDate = addDays(key, 1); render(); } });

  $('#export').addEventListener('click', exportData);
  $('#import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', importData);

  wireChartTips(view);
}

function weekCharts(today) {
  const keys = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const screen = keys.map((k) => ({ key: k, v: state.days[k]?.review?.screenMin ?? null }));
  const focus = keys.map((k) => ({ key: k, v: state.sessions.filter((s) => s.date === k).reduce((a, s) => a + s.minutes, 0) }));
  const logged = screen.filter((x) => x.v != null);
  const avg = logged.length ? logged.reduce((a, x) => a + x.v, 0) / logged.length : null;
  const focusTotal = focus.reduce((a, x) => a + x.v, 0);

  return `
    <div class="card">
      <div class="row"><h3 class="grow">Screen time</h3>
        <span class="muted small">${avg != null ? `avg ${fmtDuration(avg)} · goal ${fmtDuration(state.settings.screenGoalMin)}` : 'no check-ins yet'}</span></div>
      ${barChart(screen, state.settings.screenGoalMin, 'Screen time')}
      ${chartTable(screen, 'Screen time')}
    </div>
    <div class="card">
      <div class="row"><h3 class="grow">Focused time</h3><span class="muted small">${fmtDuration(focusTotal)} this week</span></div>
      ${barChart(focus, null, 'Focused')}
      ${chartTable(focus, 'Focused')}
    </div>
  `;
}

function barChart(data, goal, label) {
  const W = 320, H = 150, top = 18, bottom = 22, left = 4, right = 4;
  const plotH = H - top - bottom;
  const max = Math.max(goal || 0, ...data.map((d) => d.v || 0), 30);
  const niceMax = Math.ceil(max / 30) * 30;
  const slot = (W - left - right) / data.length;
  const bw = Math.min(24, slot * 0.55);
  const y = (v) => top + plotH - (v / niceMax) * plotH;
  const r = 4;
  const today = dateKey();

  const bars = data.map((d, i) => {
    const cx = left + slot * i + slot / 2;
    const x = cx - bw / 2;
    const day = prettyDate(d.key, { weekday: 'narrow' });
    const tip = `${prettyDate(d.key, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.v == null ? 'not logged' : fmtDuration(d.v)}`;
    let bar = '';
    if (d.v) {
      const h = Math.max(r, (d.v / niceMax) * plotH);
      const yTop = top + plotH - h;
      bar = `<path class="bar ${d.key === today ? '' : 'dim'}" d="M${x},${top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + bw - r} Q${x + bw},${yTop} ${x + bw},${yTop + r} V${top + plotH} Z"/>`;
    }
    const val = d.key === today && d.v ? `<text class="val" x="${cx}" y="${y(d.v) - 5}" text-anchor="middle">${fmtDuration(d.v)}</text>` : '';
    return `${bar}${val}
      <text x="${cx}" y="${H - 6}" text-anchor="middle">${day}</text>
      <rect class="hit" x="${left + slot * i}" y="0" width="${slot}" height="${H}" data-tip="${esc(tip)}" data-x="${cx}" data-y="${d.v ? y(d.v) : top + plotH}"/>`;
  }).join('');

  const goalLine = goal ? `<line class="goal" x1="${left}" x2="${W - right}" y1="${y(goal)}" y2="${y(goal)}"/>
    <text x="${left}" y="${y(goal) - 5}">goal ${fmtDuration(goal)}</text>` : '';

  return `<div class="chart" data-w="${W}" data-h="${H}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} for the last 7 days, bar chart. Table below.">
      <line class="grid" x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}"/>
      ${goalLine}${bars}
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

function chartTable(data, label) {
  return `<details><summary class="muted small" style="cursor:pointer;margin-top:6px">Show as table</summary>
    <table class="chart-table"><thead><tr><th>Day</th><th>${esc(label)}</th></tr></thead><tbody>
    ${data.map((d) => `<tr><td>${prettyDate(d.key, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>${d.v == null ? '—' : fmtDuration(d.v)}</td></tr>`).join('')}
    </tbody></table></details>`;
}

function wireChartTips(root) {
  root.querySelectorAll('.chart').forEach((chart) => {
    const tip = chart.querySelector('.chart-tip');
    const svg = chart.querySelector('svg');
    const W = Number(chart.dataset.w), H = Number(chart.dataset.h);
    const show = (rect) => {
      const box = svg.getBoundingClientRect();
      tip.textContent = rect.dataset.tip;
      tip.hidden = false;
      const px = (Number(rect.dataset.x) / W) * box.width;
      const half = tip.offsetWidth / 2;
      tip.style.left = `${Math.min(box.width - half, Math.max(half, px))}px`;
      tip.style.top = `${(Number(rect.dataset.y) / H) * box.height - 8}px`;
    };
    chart.querySelectorAll('.hit').forEach((rect) => {
      rect.addEventListener('pointerenter', () => show(rect));
      rect.addEventListener('click', () => show(rect));
    });
    chart.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `steady-backup-${dateKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || !data.days || !Array.isArray(data.sessions)) throw new Error('bad file');
      if (!confirm('Replace everything in Steady with this backup?')) return;
      state = { ...structuredClone(DEFAULT_STATE), ...data };
      save(); render(); toast('Backup restored');
    } catch {
      toast('That file isn’t a Steady backup.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ---------- boot ---------- */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  tick();
  if (state.timer?.endsAt) requestWake();
  render();
});

render();
tickHandle = setInterval(tick, 500);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
