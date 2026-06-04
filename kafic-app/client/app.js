const API = '/api';

let tables = [];
let editMode = false;
let activeTableId = null;

// ─── INIT ─────────────────────────────────────────────

async function init() {
  await loadTables();
  setupEventListeners();
}

// ─── UČITAJ STOLOVE ───────────────────────────────────

async function loadTables() {
  const res = await fetch(`${API}/tables`);
  tables = await res.json();

  const area = document.getElementById('table-area');
  area.innerHTML = '';

  for (const table of tables) {
    const session = await fetchSession(table.id);
    renderTable(table, session);
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
    <div class="table-icon">🪑</div>
    <div class="table-name">${table.name}</div>
    ${session ? `
      <div class="table-guest">${session.guest_name}</div>
      <div class="table-amount">${session.total_amount.toFixed(2)} KM</div>
    ` : '<div class="table-guest">Slobodan</div>'}
  `;

  // Klik na sto — otvori modal
  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('table-delete-btn')) return;
    if (editMode) return;
    openSessionModal(table, session);
  });

  // Brisanje stola
  card.querySelector('.table-delete-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Obriši "${table.name}"?`)) {
      await fetch(`${API}/tables/${table.id}`, { method: 'DELETE' });
      await loadTables();
    }
  });

  // Drag & drop u edit modu
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

  // Mouse
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

  // Touch
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

// ─── SESSION MODAL ────────────────────────────────────

async function openSessionModal(table, session) {
  activeTableId = table.id;

  document.getElementById('modal-title').textContent = table.name;
  document.getElementById('modal-session').classList.remove('hidden');

  const guestInput = document.getElementById('input-guest');
  const amountInput = document.getElementById('input-amount');
  const sessionInfo = document.getElementById('session-info');
  const closeBtn = document.getElementById('btn-close-session');

  if (session) {
    sessionInfo.classList.remove('hidden');
    document.getElementById('session-guest').textContent = session.guest_name;
    document.getElementById('session-total').textContent = session.total_amount.toFixed(2);
    guestInput.value = session.guest_name;
    guestInput.disabled = true;
    amountInput.value = '';
    closeBtn.classList.remove('hidden');

    // Lista iznosa
    const itemsList = document.getElementById('session-items-list');
    itemsList.innerHTML = session.items.map(item => `
      <div class="session-item" id="item-${item.id}">
        <span>${item.amount.toFixed(2)} KM</span>
        <button class="item-delete-btn" onclick="deleteItem(${item.id}, ${session.id})">✕</button>
      </div>
    `).join('');
  } else {
    sessionInfo.classList.add('hidden');
    guestInput.value = '';
    guestInput.disabled = false;
    amountInput.value = '';
    closeBtn.classList.add('hidden');
    document.getElementById('session-items-list').innerHTML = '';
  }
}

async function deleteItem(itemId, sessionId) {
  await fetch(`${API}/session-items/${itemId}`, { method: 'DELETE' });
  
  // Refresh modal
  const session = await fetchSession(activeTableId);
  const table = tables.find(t => t.id === activeTableId);
  openSessionModal(table, session);
  
  // Refresh stolovi u pozadini
  await loadTables();
}

// ─── DODAJ IZNOS ──────────────────────────────────────

async function addAmount() {
  const guestName = document.getElementById('input-guest').value.trim();
  const amount = parseFloat(document.getElementById('input-amount').value);

  if (!guestName) return alert('Unesi ime gosta!');
  if (!amount || amount <= 0) return alert('Unesi ispravan iznos!');

  await fetch(`${API}/tables/${activeTableId}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guest_name: guestName, amount })
  });

  closeModal('modal-session');
  await loadTables();
}

// ─── RESETUJ STO (PLAĆENO) ────────────────────────────

async function closeSession() {
  if (!confirm('Potvrdi plaćanje i resetuj sto?')) return;

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
  const area = document.getElementById('table-area');

  if (editMode) {
    btn.textContent = '✅ Završi uređivanje';
    btn.style.background = '#2d6a4f';
    btn.style.color = 'white';
    addBtn.classList.remove('hidden');
    area.classList.add('edit-mode');
  } else {
    btn.textContent = '✏️ Uredi raspored';
    btn.style.background = '';
    btn.style.color = '';
    addBtn.classList.add('hidden');
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
      ${sessions.map(s => `
        <div class="report-row">
          <span>${s.table_name} — ${s.guest_name}</span>
          <span>${s.total_amount.toFixed(2)} KM</span>
        </div>
      `).join('')}
      <div class="report-total">
        Ukupno: ${todayReport ? todayReport.total_revenue.toFixed(2) : '0.00'} KM
      </div>
    `;
  }

  document.getElementById('modal-report').classList.remove('hidden');
}

// ─── HISTORIJA ────────────────────────────────────────

async function openHistory() {
  const res = await fetch(`${API}/reports`);
  const reports = await res.json();

  const content = document.getElementById('history-content');

  if (reports.length === 0) {
    content.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">Nema historije.</p>';
  } else {
    content.innerHTML = reports.map(r => `
      <div class="history-item">
        <span>${r.date}</span>
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
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(`Izvjestaj: ${date}`, 14, 20);

  doc.setFontSize(11);
  let y = 35;

  sessions.forEach(s => {
    doc.text(`${s.table_name} — ${s.guest_name}`, 14, y);
    doc.text(`${s.total_amount.toFixed(2)} KM`, 170, y, { align: 'right' });
    y += 8;
  });

  doc.setFontSize(13);
  doc.text(`Ukupno: ${total.toFixed(2)} KM`, 170, y + 8, { align: 'right' });

  doc.save(`izvjestaj-${date}.pdf`);
}

// ─── POMOĆNE FUNKCIJE ─────────────────────────────────

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─── EVENT LISTENERS ──────────────────────────────────

function setupEventListeners() {
  document.getElementById('btn-edit-mode').addEventListener('click', toggleEditMode);
  document.getElementById('btn-add-table').addEventListener('click', () => {
    document.getElementById('modal-add-table').classList.remove('hidden');
  });
  document.getElementById('btn-confirm-add-table').addEventListener('click', confirmAddTable);
  document.getElementById('btn-cancel-add-table').addEventListener('click', () => closeModal('modal-add-table'));
  document.getElementById('btn-add-amount').addEventListener('click', addAmount);
  document.getElementById('btn-close-session').addEventListener('click', closeSession);
  document.getElementById('btn-cancel').addEventListener('click', () => closeModal('modal-session'));
  document.getElementById('btn-today-report').addEventListener('click', openTodayReport);
  document.getElementById('btn-history').addEventListener('click', openHistory);
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
}

// ─── START ────────────────────────────────────────────

init();