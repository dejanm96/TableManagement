const API = '/api';
let CORRECT_PIN = '2013';
let currentWaiter = null;

async function loadPin() {
  const res = await fetch(`${API}/pin`);
  const data = await res.json();
  CORRECT_PIN = data.pin;
}

let tables = [];
let editMode = false;
let activeTableId = null;
let amountValue = '';

// ─── PIN ──────────────────────────────────────────────

let pinValue = '';

async function setupPin() {
  await loadPin();
  startClock();

  const btns = document.querySelectorAll('.pin-btn[data-val]');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (pinValue.length >= 4) return;
      pinValue += btn.dataset.val;
      updatePinDots();
      if (pinValue.length === 4) checkPin();
    });
  });

  document.getElementById('pin-clear').addEventListener('click', () => {
    pinValue = pinValue.slice(0, -1);
    updatePinDots();
  });

  document.getElementById('pin-submit').addEventListener('click', checkPin);
}

function updatePinDots() {
  const dots = document.querySelectorAll('.dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinValue.length);
  });
}

async function checkPin() {
  // Prvo provjeri da li je konobar
  const waiterRes = await fetch(`${API}/waiters/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pinValue })
  });
  const waiterData = await waiterRes.json();

  if (waiterData.ok) {
    currentWaiter = { id: waiterData.id, name: waiterData.name };
    document.getElementById('header-waiter').textContent = `👤 ${waiterData.name}`;
    document.getElementById('pin-screen').style.display = 'none';
    document.querySelector('header').classList.remove('hidden');
    document.querySelector('main').classList.remove('hidden');
    init();
    return;
  }

  // Provjeri admin PIN
  if (pinValue === CORRECT_PIN) {
    currentWaiter = { id: 0, name: 'Admin' };
    document.getElementById('header-waiter').textContent = '👤 Admin';
    document.getElementById('pin-screen').style.display = 'none';
    document.querySelector('header').classList.remove('hidden');
    document.querySelector('main').classList.remove('hidden');
    init();
  } else {
    document.getElementById('pin-error').textContent = 'Pogrešan PIN!';
    pinValue = '';
    updatePinDots();
    setTimeout(() => {
      document.getElementById('pin-error').textContent = '';
    }, 1500);
  }
}

// ─── SAT ──────────────────────────────────────────────

function startClock() {
  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('header-clock').textContent = `${h}:${m}:${s}`;
  }
  update();
  setInterval(update, 1000);
}

// ─── FULLSCREEN ───────────────────────────────────────

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    document.getElementById('btn-fullscreen').textContent = '✕ Izlaz';
  } else {
    document.exitFullscreen();
    document.getElementById('btn-fullscreen').textContent = '⛶ Fullscreen';
  }
}

// ─── INIT ─────────────────────────────────────────────

async function init() {
  await loadTables();
  setupEventListeners();
  startClock();
  startTableTimers();
}

// ─── TIMER ZA STOLOVE ─────────────────────────────────

function startTableTimers() {
  function updateTimers() {
    document.querySelectorAll('.table-time[data-opened]').forEach(el => {
      const opened = new Date(el.dataset.opened + 'Z');
      const now = new Date();
      const diff = Math.floor((now - opened) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (h > 0) {
        el.textContent = `⏱ ${h}h ${String(m).padStart(2, '0')}m`;
      } else {
        el.textContent = `⏱ ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    });
  }
  updateTimers();
  setInterval(updateTimers, 1000);
}

// ─── UČITAJ STOLOVE ───────────────────────────────────

async function loadTables() {
  const res = await fetch(`${API}/tables`);
  const data = await res.json();
  tables = data;

  const area = document.getElementById('table-area');
  const cards = area.querySelectorAll('.table-card');
  cards.forEach(card => card.remove());

  for (const table of data) {
    renderTable(table, table.session);
  }
}

async function fetchSession(tableId) {
  const res = await fetch(`${API}/tables/${tableId}/session`);
  return await res.json();
}

// ─── PRIKAŽI STO ──────────────────────────────────────

function renderTable(table, session) {
  const area = document.getElementById('table-area');

  const card = document.createElement('div');
  card.className = `table-card ${session ? 'occupied' : 'free'}`;
  card.id = `table-${table.id}`;
  card.style.left = `${table.pos_x}px`;
  card.style.top = `${table.pos_y}px`;

card.innerHTML = `
    <button class="table-delete-btn" data-id="${table.id}">✕</button>
    <button class="table-edit-btn" data-id="${table.id}">✏️</button>
    <div class="table-icon">🪑</div>
    <div class="table-name">${table.name}</div>
    ${session ? `
      <div class="table-guest">${session.guest_name}</div>
      <div class="table-amount">${session.total_amount.toFixed(2)} KM</div>
      <div class="table-time" data-opened="${session.opened_at}">⏱ --:--</div>
    ` : '<div class="table-guest">Slobodan</div>'}
  `;

  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('table-delete-btn')) return;
    if (editMode) return;
    openSessionModal(table, session);
  });

  card.querySelector('.table-delete-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Obriši "${table.name}"?`)) {
      await fetch(`${API}/tables/${table.id}`, { method: 'DELETE' });
      await loadTables();
    }
  });

  card.querySelector('.table-edit-btn').addEventListener('click', async (e) => {
  e.stopPropagation();
  const newName = prompt(`Novo ime za "${table.name}":`, table.name);
  if (!newName || newName.trim() === '') return;
  await fetch(`${API}/tables/${table.id}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName.trim() })
  });
  await loadTables();
});

  makeDraggable(card, table);
  area.appendChild(card);
}

// ─── DRAG & DROP ──────────────────────────────────────

function makeDraggable(card, table) {
  let startX, startY, startLeft, startTop;

  function dragStart(clientX, clientY) {
    if (!editMode) return false;
    startX = clientX;
    startY = clientY;
    startLeft = parseInt(card.style.left) || 0;
    startTop = parseInt(card.style.top) || 0;
    return true;
  }

  async function dragEnd(clientX, clientY) {
    const newX = startLeft + (clientX - startX);
    const newY = startTop + (clientY - startY);
    card.style.left = `${newX}px`;
    card.style.top = `${newY}px`;

    await fetch(`${API}/tables/${table.id}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: newX, pos_y: newY })
    });
  }

  card.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('table-delete-btn')) return;
    if (!dragStart(e.clientX, e.clientY)) return;

    function onMove(e) {
      card.style.left = `${startLeft + (e.clientX - startX)}px`;
      card.style.top = `${startTop + (e.clientY - startY)}px`;
    }

    async function onUp(e) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      await dragEnd(e.clientX, e.clientY);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  card.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('table-delete-btn')) return;
    const touch = e.touches[0];
    if (!dragStart(touch.clientX, touch.clientY)) return;
    e.preventDefault();
  }, { passive: false });

  card.addEventListener('touchmove', (e) => {
    if (!editMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    card.style.left = `${startLeft + (touch.clientX - startX)}px`;
    card.style.top = `${startTop + (touch.clientY - startY)}px`;
  }, { passive: false });

  card.addEventListener('touchend', async (e) => {
    if (!editMode) return;
    const touch = e.changedTouches[0];
    await dragEnd(touch.clientX, touch.clientY);
  });
}

// ─── NUMPAD ZA IZNOS ──────────────────────────────────

function setupNumpad() {
  document.querySelectorAll('.num-btn[data-val]').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      if (amountValue.length >= 8) return;
      if (newBtn.dataset.val === '0' && amountValue === '') return;
      amountValue += newBtn.dataset.val;
      updateAmountDisplay();
    });
  });

  const dotBtn = document.getElementById('num-dot');
  const newDot = dotBtn.cloneNode(true);
  dotBtn.parentNode.replaceChild(newDot, dotBtn);
  newDot.addEventListener('click', () => {
    if (amountValue.includes('.')) return;
    if (amountValue === '') amountValue = '0';
    amountValue += '.';
    updateAmountDisplay();
  });

  const clearBtn = document.getElementById('num-clear');
  const newClear = clearBtn.cloneNode(true);
  clearBtn.parentNode.replaceChild(newClear, clearBtn);
  newClear.addEventListener('click', () => {
    amountValue = amountValue.slice(0, -1);
    updateAmountDisplay();
  });
}

function updateAmountDisplay() {
  const display = document.getElementById('amount-display');
  display.textContent = amountValue ? `${amountValue} KM` : '0.00 KM';
}

// ─── SESSION MODAL ────────────────────────────────────

async function openSessionModal(table, session) {
  activeTableId = table.id;
  amountValue = '';
  updateAmountDisplay();

  const guestInput = document.getElementById('input-guest');
  const sessionInfo = document.getElementById('session-info');
  const closeBtn = document.getElementById('btn-close-session');

  if (session) {
    document.getElementById('modal-title').textContent = `${table.name} — ${session.guest_name}`;
    sessionInfo.classList.remove('hidden');
    document.getElementById('session-guest').textContent = session.guest_name;
    document.getElementById('session-total').textContent = session.total_amount.toFixed(2);
    const opened = new Date(session.opened_at + 'Z');
    const h = opened.getHours().toString().padStart(2, '0');
    const m = opened.getMinutes().toString().padStart(2, '0');
    document.getElementById('session-opened').textContent = `${h}:${m}`;
    guestInput.style.display = 'none';
    closeBtn.classList.remove('hidden');
    const itemsList = document.getElementById('session-items-list');
    itemsList.innerHTML = session.items.map(item => `
      <div class="session-item" id="item-${item.id}">
        <span>${item.amount.toFixed(2)} KM</span>
        <button class="item-delete-btn" onclick="deleteItem(${item.id}, ${session.id})">✕</button>
      </div>
    `).join('');
  } else {
    document.getElementById('modal-title').textContent = table.name;
    sessionInfo.classList.add('hidden');
    guestInput.style.display = 'block';
    guestInput.value = '';
    guestInput.disabled = false;
    closeBtn.classList.add('hidden');
    document.getElementById('session-items-list').innerHTML = '';
  }
  document.getElementById('modal-session').classList.remove('hidden');
}

async function deleteItem(itemId, sessionId) {
  await fetch(`${API}/session-items/${itemId}`, { method: 'DELETE' });
  const session = await fetchSession(activeTableId);
  const table = tables.find(t => t.id === activeTableId);
  openSessionModal(table, session);
  await loadTables();
}

// ─── DODAJ IZNOS ──────────────────────────────────────

async function addAmount() {
  const guestInput = document.getElementById('input-guest');
  const guestName = guestInput.style.display === 'none' 
    ? document.getElementById('session-guest').textContent 
    : guestInput.value.trim();
  const amount = parseFloat(amountValue);

  if (!guestName) return alert('Unesi ime gosta!');
  if (!amount || amount <= 0) return alert('Unesi ispravan iznos!');

  await fetch(`${API}/tables/${activeTableId}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guest_name: guestName, amount, waiter_name: currentWaiter ? currentWaiter.name : 'Konobar 1' })
  });

  closeModal('modal-session');
  await loadTables();
}

// ─── RESETUJ STO ──────────────────────────────────────

async function closeSession() {
const session = await fetchSession(activeTableId);
if (!confirm(`Potvrdi plaćanje od ${session.total_amount.toFixed(2)} KM i resetuj sto?`)) return;

  const res = await fetch(`${API}/tables/${activeTableId}/close`, {
    method: 'POST'
  });
  const data = await res.json();

  if (data.ok) {
    alert(`✅ Plaćeno: ${data.amount.toFixed(2)} KM`);
    closeModal('modal-session');
    await loadTables();
  }
}

// ─── EDIT MODE ────────────────────────────────────────

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('btn-edit-mode');
  const addBtn = document.getElementById('btn-add-table');
  const finishBtn = document.getElementById('btn-finish-edit');
  const area = document.getElementById('table-area');

  if (editMode) {
    btn.textContent = '✏️ Uredi raspored';
    addBtn.classList.remove('hidden');
    finishBtn.classList.remove('hidden');
    area.classList.add('edit-mode');
  } else {
    addBtn.classList.add('hidden');
    finishBtn.classList.add('hidden');
    area.classList.remove('edit-mode');
  }
}

// ─── DODAJ STO ────────────────────────────────────────

async function confirmAddTable() {
  const name = document.getElementById('input-table-name').value.trim();
  if (!name) return alert('Unesi naziv stola!');

  const area = document.getElementById('table-area');
  const rect = area.getBoundingClientRect();

  await fetch(`${API}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      pos_x: Math.random() * (rect.width - 150),
      pos_y: Math.random() * (rect.height - 150)
    })
  });

  closeModal('modal-add-table');
  document.getElementById('input-table-name').value = '';
  await loadTables();
}

// ─── IZVJEŠTAJ ────────────────────────────────────────

async function openTodayReport() {
  const today = new Date().toISOString().split('T')[0];
  const res = await fetch(`${API}/reports/${today}`);
  const sessions = await res.json();

  const reportRes = await fetch(`${API}/reports`);
  const reports = await reportRes.json();
  const todayReport = reports.find(r => r.date === today);

  const content = document.getElementById('report-content');

  if (sessions.length === 0) {
    content.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">Nema zatvorenih stolova danas.</p>';
  } else {
    content.innerHTML = `
      <table class="report-table">
        <thead>
          <tr>
            <th>Sto</th>
            <th>Gost</th>
            <th>Dolazak</th>
            <th>Konobar</th>
            <th>Iznos</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.map(s => `
            <tr>
              <td>${s.table_name}</td>
              <td>${s.guest_name}</td>
              <td>${s.opened_time || '-'}</td>
              <td>${s.waiter_name || 'Konobar 1'}</td>
              <td>${s.total_amount.toFixed(2)} KM</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="report-total">
        Ukupno: ${todayReport ? todayReport.total_revenue.toFixed(2) : '0.00'} KM
      </div>
    `;
  }

  document.getElementById('modal-report').classList.remove('hidden');
}

// ─── ISTORIJA ────────────────────────────────────────

async function openHistory() {
  const res = await fetch(`${API}/reports`);
  const reports = await res.json();

  const content = document.getElementById('history-content');

  if (reports.length === 0) {
    content.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">Nema istorije.</p>';
  } else {
    content.innerHTML = reports.map(r => `
      <div class="history-item">
        <span>${r.date.split('-').reverse().join('.')}</span>
        <span style="color:#f9c74f;font-weight:700;">${r.total_revenue.toFixed(2)} KM</span>
        <button class="btn-secondary" onclick="downloadPDF('${r.date}', ${r.total_revenue})">
          ⬇️ PDF
        </button>
      </div>
    `).join('');
  }

  document.getElementById('modal-history').classList.remove('hidden');
}

// ─── PDF EXPORT ───────────────────────────────────────

async function downloadPDF(date, total) {
  const res = await fetch(`${API}/reports/${date}`);
  const sessions = await res.json();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape');

  doc.setFontSize(16);
  doc.text(`Izvjestaj: ${date.split('-').reverse().join('.')}`, 14, 18);

  doc.setFontSize(10);
  const headers = ['Sto', 'Gost', 'Dolazak', 'Konobar', 'Iznos'];
  const colWidths = [40, 60, 30, 50, 30];
  const startX = 14;
  let y = 30;

  // Header
  doc.setFillColor(15, 52, 96);
  doc.setTextColor(255, 255, 255);
  doc.rect(startX, y - 6, 262, 10, 'F');
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 2, y);
    x += colWidths[i];
  });

  // Rows
  doc.setTextColor(0, 0, 0);
  sessions.forEach((s, idx) => {
    y += 10;
    if (idx % 2 === 0) {
      doc.setFillColor(240, 240, 240);
      doc.rect(startX, y - 6, 262, 10, 'F');
    }
    x = startX;
    const row = [
      s.table_name,
      s.guest_name,
      s.opened_time || '-',
      s.waiter_name || 'Konobar 1',
      `${s.total_amount.toFixed(2)} KM`
    ];
    row.forEach((val, i) => {
      doc.text(String(val), x + 2, y);
      x += colWidths[i];
    });
  });

  // Ukupno
  y += 14;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Ukupno: ${total.toFixed(2)} KM`, 262, y, { align: 'right' });

  doc.save(`izvjestaj-${date}.pdf`);
}

// ─── TOUCH SCROLL ─────────────────────────────────────

function setupTouchScroll() {
  const main = document.querySelector('main');
  let startX, startY, scrollLeft, scrollTop;
  let isDragging = false;

  main.addEventListener('touchstart', (e) => {
    if (editMode) return;
    if (e.target.closest('.table-card')) return;
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    scrollLeft = main.scrollLeft;
    scrollTop = main.scrollTop;
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    if (e.target.closest('.table-card')) return;
    const dx = startX - e.touches[0].clientX;
    const dy = startY - e.touches[0].clientY;
    main.scrollLeft = scrollLeft + dx;
    main.scrollTop = scrollTop + dy;
  }, { passive: true });

  main.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// ─── POMOĆNE FUNKCIJE ─────────────────────────────────

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─── EVENT LISTENERS ──────────────────────────────────

function setupEventListeners() {
    if (window._listenersAdded) return;
  window._listenersAdded = true;
  setupNumpad();
  setupTouchScroll();

  // Dropdown
document.getElementById('btn-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    document.getElementById('dropdown-menu').classList.toggle('hidden');
  });

  document.getElementById('dropdown-menu').addEventListener('click', (e) => {
    e.stopPropagation();
  });

  if (!window._dropdownListenerAdded) {
    window._dropdownListenerAdded = true;
    document.addEventListener('click', () => {
      document.getElementById('dropdown-menu').classList.add('hidden');
    });
  }

  // Fullscreen
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

  // Odjava
  document.getElementById('btn-logout').addEventListener('click', () => {
    document.getElementById('dropdown-menu').classList.add('hidden');
    document.getElementById('pin-screen').style.display = 'flex';
    document.querySelector('header').classList.add('hidden');
    document.querySelector('main').classList.add('hidden');
    pinValue = '';
    updatePinDots();
  });

  // Edit mode
  document.getElementById('btn-edit-mode').addEventListener('click', () => {
    document.getElementById('dropdown-menu').classList.add('hidden');
    toggleEditMode();
  });

  // Dodaj sto
  document.getElementById('btn-add-table').addEventListener('click', () => {
    document.getElementById('modal-add-table').classList.remove('hidden');
  });
  document.getElementById('btn-confirm-add-table').addEventListener('click', confirmAddTable);
  document.getElementById('btn-cancel-add-table').addEventListener('click', () => closeModal('modal-add-table'));

  // Session modal
  document.getElementById('btn-add-amount').addEventListener('click', addAmount);
  document.getElementById('btn-close-session').addEventListener('click', closeSession);
  document.getElementById('btn-cancel').addEventListener('click', () => closeModal('modal-session'));

  // Izvještaj
  document.getElementById('btn-today-report').addEventListener('click', () => {
    document.getElementById('dropdown-menu').classList.add('hidden');
    openTodayReport();
  });
  document.getElementById('btn-history').addEventListener('click', () => {
    document.getElementById('dropdown-menu').classList.add('hidden');
    openHistory();
  });
  document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    const today = new Date().toISOString().split('T')[0];
    const reportRes = await fetch(`${API}/reports`);
    const reports = await reportRes.json();
    const todayReport = reports.find(r => r.date === today);
    const total = todayReport ? todayReport.total_revenue : 0;
    downloadPDF(today, total);
  });
  document.getElementById('btn-close-report').addEventListener('click', () => closeModal('modal-report'));
  document.getElementById('btn-close-history').addEventListener('click', () => closeModal('modal-history'));

  // Promjena PIN-a
  document.getElementById('btn-change-pin').addEventListener('click', () => {
    document.getElementById('dropdown-menu').classList.add('hidden');
    openChangePinModal();
  });
  document.getElementById('btn-cancel-change-pin').addEventListener('click', () => closeModal('modal-change-pin'));

  // Konobari
  document.getElementById('btn-manage-waiters').addEventListener('click', () => {
    document.getElementById('dropdown-menu').classList.add('hidden');
    openWaitersModal();
  });
  document.getElementById('btn-close-waiters').addEventListener('click', () => closeModal('modal-waiters'));
  document.getElementById('btn-add-waiter').addEventListener('click', addWaiter);

  document.getElementById('btn-finish-edit').addEventListener('click', () => {
  toggleEditMode();
});
}

// ─── PROMJENA PIN-a ───────────────────────────────────

let changePinOld = '';
let changePinNew = '';
let changePinStep = 'old'; // 'old' ili 'new'

function openChangePinModal() {
  changePinOld = '';
  changePinNew = '';
  changePinStep = 'old';
  updateChangePinDots();
  document.getElementById('change-pin-error').textContent = '';
  document.getElementById('modal-change-pin').classList.remove('hidden');

  document.querySelectorAll('#change-pin-numpad .pin-btn[data-val]').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      if (changePinStep === 'old' && changePinOld.length < 4) {
        changePinOld += newBtn.dataset.val;
      } else if (changePinStep === 'new' && changePinNew.length < 4) {
        changePinNew += newBtn.dataset.val;
      }
      updateChangePinDots();
      checkChangePinProgress();
    });
  });

  const clearBtn = document.getElementById('change-pin-clear');
  const newClear = clearBtn.cloneNode(true);
  clearBtn.parentNode.replaceChild(newClear, clearBtn);
  newClear.addEventListener('click', () => {
    if (changePinStep === 'old') changePinOld = changePinOld.slice(0, -1);
    else changePinNew = changePinNew.slice(0, -1);
    updateChangePinDots();
  });

  const submitBtn = document.getElementById('change-pin-submit');
  const newSubmit = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
  newSubmit.addEventListener('click', checkChangePinProgress);
}

function updateChangePinDots() {
  document.querySelectorAll('#change-pin-dots-old .dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < changePinOld.length);
  });
  document.querySelectorAll('#change-pin-dots-new .dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < changePinNew.length);
  });
}

async function checkChangePinProgress() {
  if (changePinStep === 'old' && changePinOld.length === 4) {
    if (changePinOld !== CORRECT_PIN) {
      document.getElementById('change-pin-error').textContent = 'Pogrešan trenutni PIN!';
      changePinOld = '';
      updateChangePinDots();
      return;
    }
    changePinStep = 'new';
    document.getElementById('change-pin-error').textContent = '';
  } else if (changePinStep === 'new' && changePinNew.length === 4) {
   await fetch(`${API}/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: changePinNew })
    });
    CORRECT_PIN = changePinNew;
    closeModal('modal-change-pin');
    alert('✅ PIN uspješno promijenjen!');
  }
}

// ─── KONOBARI ─────────────────────────────────────────

async function openWaitersModal() {
  const res = await fetch(`${API}/waiters`);
  const waiters = await res.json();

  const list = document.getElementById('waiters-list');
  if (waiters.length === 0) {
    list.innerHTML = '<p style="color:#aaa;font-size:0.9rem;text-align:center;">Nema konobara.</p>';
  } else {
    list.innerHTML = waiters.map(w => `
      <div class="waiter-item">
        <span>👤 ${w.name}</span>
        <button class="btn-danger" onclick="deleteWaiter(${w.id})">Obriši</button>
      </div>
    `).join('');
  }

  document.getElementById('input-waiter-name').value = '';
  document.getElementById('input-waiter-pin').value = '';
  document.getElementById('modal-waiters').classList.remove('hidden');
}

async function addWaiter() {
  const name = document.getElementById('input-waiter-name').value.trim();
  const pin = document.getElementById('input-waiter-pin').value.trim();

  if (!name) return alert('Unesi ime konobara!');
  if (!pin || pin.length !== 4) return alert('PIN mora biti 4 cifre!');

  const res = await fetch(`${API}/waiters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin })
  });
  const data = await res.json();

  if (!data.ok) return alert(data.message || 'Greška!');
  await openWaitersModal();
}

async function deleteWaiter(id) {
  if (!confirm('Obriši konobara?')) return;
  await fetch(`${API}/waiters/${id}`, { method: 'DELETE' });
  await openWaitersModal();
}
// ─── START ────────────────────────────────────────────
setupPin();