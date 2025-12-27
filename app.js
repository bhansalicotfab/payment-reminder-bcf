// Payment Reminder App - Main Logic
const DRIVE_FILE_ID = '1Kx_AiOzfwXMLGN-8NgehFecv3dYki0Ma';

let ledgerData = [];
let filteredData = [];
let currentFilter = 'all';
let deferredPrompt;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadFromLocalStorage();
  setupPWA();
});

function setupEventListeners() {
  const syncBtn = document.getElementById('syncBtn');
  const searchInput = document.getElementById('searchInput');

  syncBtn.addEventListener('click', syncFromDrive);
  searchInput.addEventListener('input', (e) => {
    filterData(e.target.value);
  });
}

function setupPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker registered'))
      .catch(err => console.log('SW registration failed:', err));
  }

  // Handle install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPrompt();
  });

  // Handle install button
  document.getElementById('installBtn')?.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('Install outcome:', outcome);
      deferredPrompt = null;
      hideInstallPrompt();
    }
  });

  document.getElementById('dismissBtn')?.addEventListener('click', hideInstallPrompt);
}

function showInstallPrompt() {
  const prompt = document.getElementById('installPrompt');
  if (prompt) prompt.style.display = 'block';
}

function hideInstallPrompt() {
  const prompt = document.getElementById('installPrompt');
  if (prompt) prompt.style.display = 'none';
}

async function syncFromDrive() {
  const syncBtn = document.getElementById('syncBtn');
  const syncStatus = document.getElementById('syncStatus');
  
  syncBtn.disabled = true;
  syncBtn.textContent = '⏳ Syncing...';
  syncStatus.textContent = 'Downloading from Google Drive...';

  try {
    // Use Google Drive direct download
    const driveUrl = `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`;
    const response = await fetch(driveUrl);
    
    if (!response.ok) throw new Error('Failed to fetch CSV');
    
    const csvText = await response.text();
    syncStatus.textContent = 'Parsing ledger data...';
    
    // Parse CSV
    ledgerData = parseCSV(csvText);
    
    // Save to localStorage
    localStorage.setItem('ledgerData', JSON.stringify(ledgerData));
    localStorage.setItem('lastSync', new Date().toISOString());
    
    syncStatus.textContent = `✅ Synced ${ledgerData.length} entries`;
    syncBtn.textContent = '✓ Synced';
    
    // Render data
    renderStats();
    renderFilters();
    filterData('');
    
    setTimeout(() => {
      syncBtn.disabled = false;
      syncBtn.textContent = '🔄 Sync from Drive';
    }, 2000);
    
  } catch (error) {
    console.error('Sync error:', error);
    syncStatus.textContent = '❌ Sync failed - Check connection';
    syncBtn.textContent = '🔄 Retry Sync';
    syncBtn.disabled = false;
    
    const listEl = document.getElementById('ledgerList');
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>Sync Failed</h3>
        <p>Could not load data from Google Drive</p>
        <p style="font-size: 12px; margin-top: 10px;">Make sure the file is publicly accessible</p>
      </div>
    `;
  }
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  const entries = [];
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(',').map(col => col.trim().replace(/"/g, ''));
    
    if (cols.length >= 6) {
      entries.push({
        date: cols[0] || '',
        partyName: cols[1] || 'Unknown',
        voucherType: cols[2] || '',
        voucherNo: cols[3] || '',
        debit: parseFloat(cols[4]) || 0,
        credit: parseFloat(cols[5]) || 0,
        balance: parseFloat(cols[6]) || 0
      });
    }
  }
  
  return entries;
}

function loadFromLocalStorage() {
  const stored = localStorage.getItem('ledgerData');
  const lastSync = localStorage.getItem('lastSync');
  
  if (stored) {
    ledgerData = JSON.parse(stored);
    const syncStatus = document.getElementById('syncStatus');
    
    if (lastSync) {
      const date = new Date(lastSync);
      syncStatus.textContent = `Last synced: ${date.toLocaleString()}`;
    }
    
    renderStats();
    renderFilters();
    filterData('');
  }
}

function renderStats() {
  const statsEl = document.getElementById('stats');
  
  // Calculate stats
  const totalParties = new Set(ledgerData.map(e => e.partyName)).size;
  const totalDebit = ledgerData.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = ledgerData.reduce((sum, e) => sum + e.credit, 0);
  const netBalance = totalDebit - totalCredit;
  
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${totalParties}</div>
      <div class="stat-label">Total Parties</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">₹${(totalDebit / 100000).toFixed(1)}L</div>
      <div class="stat-label">Total Debit</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">₹${(totalCredit / 100000).toFixed(1)}L</div>
      <div class="stat-label">Total Credit</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: ${netBalance >= 0 ? '#4CAF50' : '#f44336'}">
        ₹${(Math.abs(netBalance) / 100000).toFixed(1)}L
      </div>
      <div class="stat-label">Net Balance</div>
    </div>
  `;
}

function renderFilters() {
  const filtersEl = document.getElementById('filterTabs');
  const voucherTypes = ['all', ...new Set(ledgerData.map(e => e.voucherType))];
  
  filtersEl.innerHTML = voucherTypes.map(type => `
    <button class="filter-tab ${type === currentFilter ? 'active' : ''}" 
            onclick="setFilter('${type}')">
      ${type === 'all' ? 'All' : type}
    </button>
  `).join('');
}

function setFilter(filter) {
  currentFilter = filter;
  renderFilters();
  filterData(document.getElementById('searchInput').value);
}

function filterData(searchQuery) {
  filteredData = ledgerData.filter(entry => {
    const matchesSearch = entry.partyName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = currentFilter === 'all' || entry.voucherType === currentFilter;
    return matchesSearch && matchesFilter;
  });
  
  renderLedgerList();
}

function renderLedgerList() {
  const listEl = document.getElementById('ledgerList');
  
  if (filteredData.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>No entries found</h3>
        <p>Try adjusting your search or filter</p>
      </div>
    `;
    return;
  }
  
  // Group by party and show latest balance
  const partyBalances = new Map();
  
  filteredData.forEach(entry => {
    const existing = partyBalances.get(entry.partyName);
    if (!existing || new Date(entry.date) > new Date(existing.date)) {
      partyBalances.set(entry.partyName, entry);
    }
  });
  
  const sortedParties = Array.from(partyBalances.values())
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  
  listEl.innerHTML = sortedParties.map(entry => `
    <div class="ledger-item">
      <div class="party-info">
        <div class="party-name">${entry.partyName}</div>
        <div class="party-details">
          ${entry.voucherType} • ${entry.date}
        </div>
      </div>
      <div class="amount ${entry.balance >= 0 ? 'positive' : 'negative'}">
        ₹${Math.abs(entry.balance).toLocaleString('en-IN')}
      </div>
    </div>
  `).join('');
}