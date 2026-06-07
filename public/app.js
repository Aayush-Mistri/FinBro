/* ==========================================================================
   Finsight Frontend SPA JavaScript Application
   ========================================================================== */

const API_BASE = ''; // Same origin

// App State
const state = {
  token: localStorage.getItem('token') || null,
  user: null,
  charts: {
    cashflow: null,
    categories: null
  }
};

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  initAuthToggle();
  initAuthForms();
  initNavigation();
  initUpload();
  initChat();
  initLabelsForm();
  
  if (state.token) {
    parseTokenAndLoadApp();
  }
});

/* ==========================================================================
   Toast Notification System
   ========================================================================== */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';
  if (type === 'warning') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  
  // Remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

/* ==========================================================================
   API Helpers
   ========================================================================== */
async function fetchAPI(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    // Session expired
    if (response.status === 401 && state.token) {
      logout();
      showToast('Session expired. Please login again.', 'error');
    }
    throw new Error(data.error || 'API Request failed');
  }

  return data;
}

/* ==========================================================================
   Authentication Operations
   ========================================================================== */
function initAuthToggle() {
  document.getElementById('to-register').addEventListener('click', () => {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.add('active');
  });

  document.getElementById('to-login').addEventListener('click', () => {
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
  });

  document.getElementById('btn-logout').addEventListener('click', logout);
}

function initAuthForms() {
  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      saveSession(res.token, res.user);
      showToast(`Welcome back, ${res.user.name}!`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
      const res = await fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });

      saveSession(res.token, res.user);
      showToast('Registration successful! Welcome to FinSight.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('app-section').classList.remove('hidden');
  document.getElementById('nav-user-name').textContent = user.name;
  
  switchView('dashboard');
}

function parseTokenAndLoadApp() {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      state.user = JSON.parse(userStr);
      document.getElementById('auth-section').classList.add('hidden');
      document.getElementById('app-section').classList.remove('hidden');
      document.getElementById('nav-user-name').textContent = state.user.name;
      switchView('dashboard');
    } else {
      logout();
    }
  } catch (err) {
    logout();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  // Clear charts
  if (state.charts.cashflow) state.charts.cashflow.destroy();
  if (state.charts.categories) state.charts.categories.destroy();
  state.charts.cashflow = null;
  state.charts.categories = null;

  document.getElementById('app-section').classList.add('hidden');
  document.getElementById('auth-section').classList.remove('hidden');
  
  // Reset fields
  document.getElementById('login-form').reset();
  document.getElementById('register-form').reset();
}

/* ==========================================================================
   Navigation Router
   ========================================================================== */
function initNavigation() {
  const links = document.querySelectorAll('.nav-links li');
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      switchView(link.dataset.view);
    });
  });
}

function switchView(viewId) {
  // Hide all views
  const views = document.querySelectorAll('.content-view');
  views.forEach(v => v.classList.remove('active'));
  views.forEach(v => v.classList.add('hidden'));

  // Show active view
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.remove('hidden');
    targetView.classList.add('active');
  }

  // Load view-specific data
  if (viewId === 'dashboard') {
    loadDashboard();
  } else if (viewId === 'labels') {
    loadLabels();
  }
}

/* ==========================================================================
   3. DASHBOARD METRICS & CHARTS RENDER
   ========================================================================== */
async function loadDashboard() {
  const insightsBox = document.getElementById('dashboard-insights');
  insightsBox.innerHTML = `<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading metrics & insights...</div>`;

  try {
    const data = await fetchAPI('/dashboard');
    
    // Render Stat Cards
    const savings = data.savings_rate.last_30_days;
    document.getElementById('dashboard-income').textContent = `₹${savings.income.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('dashboard-expense').textContent = `₹${savings.expense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const netSavingsAmt = savings.income - savings.expense;
    const netSavingsEl = document.getElementById('dashboard-savings');
    netSavingsEl.textContent = `₹${netSavingsAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    netSavingsEl.style.color = netSavingsAmt >= 0 ? 'var(--color-success)' : 'var(--color-danger)';

    // Render Savings Rate Badge
    const rateEl = document.getElementById('dashboard-savings-percent');
    rateEl.textContent = `${savings.savings_rate_percent}%`;
    rateEl.style.color = savings.savings_rate_percent >= 0 ? 'var(--accent-secondary)' : 'var(--color-danger)';

    // Render AI insights
    renderAIInsights(data.patterns);

    // Render Charts
    renderCashflowChart(data.weekly_cashflow);
    renderCategoriesChart(data.monthly_spend_by_category);

    // Render Top Merchants list
    renderTopMerchants(data.top_merchants);

  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
    insightsBox.innerHTML = `<div class="empty-state">Failed to load financial pulse. Please ensure you have statements uploaded.</div>`;
  }
}

function renderAIInsights(patterns) {
  const insightsBox = document.getElementById('dashboard-insights');
  if (!patterns || (patterns.recurring_payments?.length === 0 && patterns.top_spending_categories?.length === 0 && patterns.unusual_spikes?.length === 0 && patterns.income_sources?.length === 0)) {
    insightsBox.innerHTML = `<div class="empty-state">No money patterns detected yet. Upload a statement PDF to generate custom AI reports!</div>`;
    return;
  }

  let html = '<div>';
  
  if (patterns.recurring_payments && patterns.recurring_payments.length > 0) {
    html += `<h4><i class="fa-solid fa-rotate"></i> Recurring Transactions</h4><ul>`;
    patterns.recurring_payments.forEach(p => {
      html += `<li><strong>${p.merchant}</strong>: ₹${p.amount} (${p.frequency}) - Confidence: ${Math.round(p.confidence * 100)}%</li>`;
    });
    html += `</ul>`;
  }

  if (patterns.top_spending_categories && patterns.top_spending_categories.length > 0) {
    html += `<h4><i class="fa-solid fa-chart-bar"></i> Top Spending Sectors</h4><ul>`;
    patterns.top_spending_categories.forEach(c => {
      html += `<li><strong>${c.category}</strong>: Total ₹${c.total_amount} (${Math.round(c.percentage_of_expense)}% of expenses)</li>`;
    });
    html += `</ul>`;
  }

  if (patterns.unusual_spikes && patterns.unusual_spikes.length > 0) {
    html += `<h4><i class="fa-solid fa-triangle-exclamation"></i> Unusual Spikes & Large Expenses</h4><ul>`;
    patterns.unusual_spikes.forEach(s => {
      html += `<li><strong>${s.merchant}</strong>: ₹${s.amount} on ${s.date}</li>`;
    });
    html += `</ul>`;
  }

  if (patterns.income_sources && patterns.income_sources.length > 0) {
    html += `<h4><i class="fa-solid fa-arrow-trend-up"></i> Income Sources</h4><ul>`;
    patterns.income_sources.forEach(i => {
      html += `<li><strong>${i.source}</strong>: ₹${i.amount} (${i.frequency})</li>`;
    });
    html += `</ul>`;
  }

  html += '</div>';
  insightsBox.innerHTML = html;
}

function renderCashflowChart(weeklyData) {
  const ctx = document.getElementById('cashflow-chart').getContext('2d');
  
  // Clear existing chart
  if (state.charts.cashflow) {
    state.charts.cashflow.destroy();
  }

  if (!weeklyData || weeklyData.length === 0) {
    ctx.font = '14px Inter';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.fillText('No cashflow data. Upload statements to populate.', 150, 100);
    return;
  }

  const labels = weeklyData.map(w => w.week);
  const creditData = weeklyData.map(w => w.credits);
  const debitData = weeklyData.map(w => w.debits);

  state.charts.cashflow = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Credits (Income)',
          data: creditData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        },
        {
          label: 'Debits (Expense)',
          data: debitData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#f3f4f6', font: { family: 'Inter' } } }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
      }
    }
  });
}

function renderCategoriesChart(categoryData) {
  const ctx = document.getElementById('categories-chart').getContext('2d');
  
  if (state.charts.categories) {
    state.charts.categories.destroy();
  }

  if (!categoryData || categoryData.length === 0) {
    return;
  }

  const labels = categoryData.map(c => c.category);
  const datasetData = categoryData.map(c => c.total_amount);
  
  const colors = [
    '#8b5cf6', '#06b6d4', '#ef4444', '#f59e0b', '#10b981',
    '#ec4899', '#3b82f6', '#14b8a6', '#f43f5e', '#a855f7'
  ];

  state.charts.categories = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: datasetData,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: 'rgba(15, 11, 30, 0.8)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#f3f4f6', font: { family: 'Inter', size: 10 } }
        }
      }
    }
  });
}

function renderTopMerchants(merchants) {
  const list = document.getElementById('dashboard-merchants');
  list.innerHTML = '';

  if (!merchants || merchants.length === 0) {
    list.innerHTML = `<div class="empty-state">No merchant records found.</div>`;
    return;
  }

  merchants.forEach(m => {
    const initials = m.merchant_name.slice(0, 2).toUpperCase();
    const item = document.createElement('li');
    item.className = 'merchant-item';
    item.innerHTML = `
      <div class="merchant-info">
        <div class="merchant-badge">${initials}</div>
        <div>
          <span class="merchant-name">${m.merchant_name}</span>
          <span class="merchant-count">${m.transaction_count} transaction(s)</span>
        </div>
      </div>
      <span class="merchant-spend">₹${m.total_spend.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    `;
    list.appendChild(item);
  });
}

/* ==========================================================================
   4. STATEMENT UPLOAD & PROCESSING
   ========================================================================== */
function initUpload() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('statement-file-input');
  const fileInfo = document.getElementById('file-info');
  const uploadBtn = document.getElementById('btn-upload-file');
  let selectedFile = null;

  // Click triggers file open
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  // Drag Drop events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  function handleFileSelection(file) {
    if (file.type !== 'application/pdf') {
      showToast('Please upload a valid PDF file.', 'error');
      return;
    }
    selectedFile = file;
    fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    uploadBtn.removeAttribute('disabled');
  }

  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    uploadBtn.setAttribute('disabled', 'true');
    uploadBtn.innerHTML = `Ingesting Statement <i class="fa-solid fa-spinner fa-spin"></i>`;
    fileInfo.textContent = 'Processing PDF text & categories... please wait...';

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/transactions/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`
        },
        body: formData
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ingestion failed');

      showToast('Statement processed successfully!');
      renderUploadResults(json.data);
      
      // Reset uploader
      selectedFile = null;
      fileInput.value = '';
      uploadBtn.innerHTML = `Process Statement <i class="fa-solid fa-gears"></i>`;
      fileInfo.textContent = 'No file selected';
    } catch (err) {
      showToast(err.message, 'error');
      uploadBtn.removeAttribute('disabled');
      uploadBtn.innerHTML = `Process Statement <i class="fa-solid fa-gears"></i>`;
      fileInfo.textContent = 'Error processing file. Try again.';
    }
  });
}

function renderUploadResults(summary) {
  const resultsBox = document.getElementById('upload-results');
  resultsBox.classList.remove('hidden');

  document.getElementById('res-total').textContent = summary.total_found;
  document.getElementById('res-inserted').textContent = summary.inserted;
  document.getElementById('res-skipped').textContent = summary.duplicates_skipped;

  const tbody = document.getElementById('upload-sample-tbody');
  tbody.innerHTML = '';

  if (!summary.sample_transactions || summary.sample_transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No new transactions were inserted. All overlapping transactions skipped.</td></tr>`;
    return;
  }

  summary.sample_transactions.forEach(t => {
    const dateStr = t.timestamp ? new Date(t.timestamp).toLocaleDateString('en-IN') : 'N/A';
    const amountVal = `₹${t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${dateStr}</td>
      <td><code>${t.vpa || 'N/A'}</code></td>
      <td><strong>${t.resolved_name || 'Unknown'}</strong></td>
      <td><span class="pill vpa-${t.vpa_type}">${t.vpa_type || 'unknown'}</span></td>
      <td>${t.category || 'N/A'}</td>
      <td><span class="pill ${t.direction}">${t.direction}</span></td>
      <td><strong>${amountVal}</strong></td>
    `;
    tbody.appendChild(row);
  });
}

/* ==========================================================================
   5. CHAT ASSISTANT
   ========================================================================== */
function initChat() {
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-chat-send');
  const typingIndicator = document.getElementById('chat-typing');

  // Submit on enter key
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Suggested prompt click binding
  const prompts = document.querySelectorAll('.prompt-item');
  prompts.forEach(p => {
    p.addEventListener('click', () => {
      // Clean string quotes from innerText
      const promptText = p.textContent.replace(/^"|"$/g, '');
      chatInput.value = promptText;
      sendMessage();
    });
  });

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Render User Bubble
    appendMessage(text, 'user');
    chatInput.value = '';

    // Show typing indicator
    typingIndicator.classList.remove('hidden');
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const res = await fetchAPI('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });

      appendMessage(res.reply, 'assistant');
    } catch (err) {
      appendMessage('Error: ' + err.message, 'assistant');
    } finally {
      typingIndicator.classList.add('hidden');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function appendMessage(text, sender) {
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = `message ${sender}`;
    
    // Simple conversion of newlines to linebreaks and bold tags for premium rendering
    let formattedText = text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    bubbleWrapper.innerHTML = `<div class="bubble">${formattedText}</div>`;
    chatMessages.appendChild(bubbleWrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/* ==========================================================================
   6. CUSTOM VPA LABELS
   ========================================================================== */
async function loadLabels() {
  const tbody = document.getElementById('labels-tbody');
  tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading labels...</td></tr>`;

  try {
    const labelsList = await fetchAPI('/labels');
    tbody.innerHTML = '';

    if (labelsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No custom shortcut labels configured yet.</td></tr>`;
      return;
    }

    labelsList.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><code>${item.vpa}</code></td>
        <td><strong>${item.label}</strong></td>
        <td>${item.category || 'N/A'}</td>
        <td>
          <button class="btn btn-delete" data-vpa="${item.vpa}">
            Delete <i class="fa-regular fa-trash-can"></i>
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Bind deletes
    const deleteBtns = tbody.querySelectorAll('.btn-delete');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const vpa = btn.dataset.vpa;
        try {
          await fetchAPI(`/labels/${encodeURIComponent(vpa)}`, {
            method: 'DELETE'
          });
          showToast('VPA shortcut removed.');
          loadLabels();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    showToast('Failed to load labels: ' + err.message, 'error');
  }
}

function initLabelsForm() {
  const form = document.getElementById('label-form');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vpa = document.getElementById('label-vpa').value.trim();
    const label = document.getElementById('label-name').value.trim();
    const category = document.getElementById('label-category').value;

    try {
      await fetchAPI('/labels', {
        method: 'POST',
        body: JSON.stringify({ vpa, label, category })
      });

      showToast('Shortcut label upserted successfully!');
      form.reset();
      loadLabels();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
