// Global API URL (relative since frontend is served by the backend)
const API_BASE = '/api';

// State variables to store lists globally for frontend processing
let employeesList = [];
let departmentsList = [];
let instructionsList = [];
let journalList = [];

// Initialize Page Content when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  
  // Load common data first
  loadDepartments().then(() => {
    // Determine which page we are on and initialize accordingly
    if (path.includes('index.html') || path === '/' || path.endsWith('safety-system/') || path.endsWith('safety-system')) {
      initDashboard();
    } else if (path.includes('employees.html')) {
      initEmployeesPage();
    } else if (path.includes('instructions.html')) {
      initInstructionsPage();
    } else if (path.includes('reports.html')) {
      initReportsPage();
    }
  });
});

// --- API FETCH FUNCTIONS ---

async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Произошла ошибка при запросе к серверу');
    }
    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    alert(error.message);
    throw error;
  }
}

async function loadDepartments() {
  try {
    departmentsList = await fetchAPI('/departments');
    
    // Populate any department select dropdowns on the page
    populateDepartmentDropdowns();
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

function populateDepartmentDropdowns() {
  const deptSelects = document.querySelectorAll('#emp-dept, #filter-dept, #rep-dept');
  deptSelects.forEach(select => {
    // Preserve first option (e.g. "Select department" or "All departments")
    const firstOption = select.options[0];
    select.innerHTML = '';
    if (firstOption) select.appendChild(firstOption);
    
    departmentsList.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept.id;
      opt.textContent = dept.name;
      select.appendChild(opt);
    });
  });
}

// --- 1. DASHBOARD PAGE LOGIC ---

async function initDashboard() {
  // Set default date to today for briefing quick conduct form
  const bDate = document.getElementById('b-date');
  if (bDate) {
    bDate.value = new Date().toISOString().split('T')[0];
  }

  // Load stats
  await loadDashboardStats();
  // Load warning list
  await loadOverdueList();
  
  // Load select options for quick briefing modal
  loadBriefingModalDropdowns();

  // Handle briefing form submission
  const briefingForm = document.getElementById('briefingForm');
  if (briefingForm) {
    briefingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        employee_id: parseInt(document.getElementById('b-employee').value),
        instruction_id: parseInt(document.getElementById('b-instruction').value),
        briefing_date: document.getElementById('b-date').value,
        instructor_name: document.getElementById('b-instructor').value,
        notes: document.getElementById('b-notes').value
      };
      
      try {
        await fetchAPI('/briefings', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        closeBriefingModal();
        briefingForm.reset();
        // Refresh dashboard data
        initDashboard();
        alert('Инструктаж успешно зарегистрирован!');
      } catch (err) {
        console.error('Briefing submit error:', err);
      }
    });
  }
}

async function loadDashboardStats() {
  try {
    const stats = await fetchAPI('/stats');
    
    document.getElementById('stat-employees').textContent = stats.employeesCount;
    document.getElementById('stat-instructions').textContent = stats.instructionsCount;
    document.getElementById('stat-month-conducted').textContent = stats.conductedThisMonth;
    document.getElementById('stat-overdue').textContent = stats.overdueCount;

    // Render recent briefings table
    const tbody = document.getElementById('recent-briefings-table');
    tbody.innerHTML = '';
    
    if (stats.recentBriefings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Инструктажи ещё не проводились</td></tr>`;
      return;
    }

    stats.recentBriefings.forEach(b => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHTML(b.employee_name)}</strong></td>
        <td>${escapeHTML(b.instruction_title)}</td>
        <td><span class="badge badge-info">${formatDate(b.briefing_date)}</span></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Stats loading failed:', err);
  }
}

async function loadOverdueList() {
  try {
    const res = await fetchAPI('/briefings/status');
    const list = document.getElementById('overdue-briefings-list');
    list.innerHTML = '';

    if (res.overdue.length === 0) {
      list.innerHTML = `
        <li class="simple-list-item" style="border-color: rgba(16, 185, 129, 0.2); background-color: rgba(16, 185, 129, 0.05); justify-content: center; color: var(--success); font-weight: 500;">
          ✓ Все инструктажи сотрудников актуальны
        </li>
      `;
      return;
    }

    res.overdue.forEach(b => {
      const li = document.createElement('li');
      li.className = 'simple-list-item';
      li.style.borderLeft = '4px solid var(--danger)';
      li.innerHTML = `
        <div class="item-main">
          <span class="item-title">${escapeHTML(b.employee_name)}</span>
          <span class="item-subtitle">${escapeHTML(b.instruction_title)}</span>
        </div>
        <div style="text-align: right;">
          <span class="badge badge-danger">Просрочен: ${formatDate(b.next_briefing_date)}</span>
        </div>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Failed to load warnings:', err);
  }
}

async function loadBriefingModalDropdowns() {
  try {
    const emps = await fetchAPI('/employees');
    const activeEmps = emps.filter(e => e.status === 'active');
    const empSelect = document.getElementById('b-employee');
    
    if (empSelect) {
      empSelect.innerHTML = '<option value="">Выберите сотрудника</option>';
      activeEmps.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.full_name} (${e.position})`;
        empSelect.appendChild(opt);
      });
    }

    const insts = await fetchAPI('/instructions');
    const instSelect = document.getElementById('b-instruction');
    if (instSelect) {
      instSelect.innerHTML = '<option value="">Выберите программу</option>';
      insts.forEach(i => {
        const opt = document.createElement('option');
        opt.value = i.id;
        opt.textContent = `${i.title} [${i.type}]`;
        instSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Failed to fill modal dropdowns:', err);
  }
}

// Modal Toggle Helpers
function openBriefingModal() {
  loadBriefingModalDropdowns();
  document.getElementById('briefingModal').style.display = 'flex';
}

function closeBriefingModal() {
  document.getElementById('briefingModal').style.display = 'none';
}

// --- 2. EMPLOYEES PAGE LOGIC ---

async function initEmployeesPage() {
  await loadEmployees();
  
  // Setup Employee form submission
  const empForm = document.getElementById('employeeForm');
  if (empForm) {
    empForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const id = document.getElementById('emp-id').value;
      const body = {
        full_name: document.getElementById('emp-name').value,
        position: document.getElementById('emp-position').value,
        department_id: parseInt(document.getElementById('emp-dept').value),
        hire_date: document.getElementById('emp-date').value,
        status: document.getElementById('emp-status').value || 'active'
      };

      const url = id ? `/employees/${id}` : '/employees';
      const method = id ? 'PUT' : 'POST';

      try {
        await fetchAPI(url, {
          method,
          body: JSON.stringify(body)
        });
        closeEmployeeModal();
        empForm.reset();
        await loadEmployees();
        alert(id ? 'Данные сотрудника обновлены' : 'Сотрудник добавлен успешно');
      } catch (err) {
        console.error('Employee submit failed:', err);
      }
    });
  }

  // Setup Department form submission
  const deptForm = document.getElementById('deptForm');
  if (deptForm) {
    deptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('dept-name').value;
      try {
        await fetchAPI('/departments', {
          method: 'POST',
          body: JSON.stringify({ name })
        });
        closeDeptModal();
        deptForm.reset();
        await loadDepartments();
        alert('Отдел создан успешно');
      } catch (err) {
        console.error('Department creation failed:', err);
      }
    });
  }
}

async function loadEmployees() {
  try {
    employeesList = await fetchAPI('/employees');
    renderEmployeesTable(employeesList);
  } catch (err) {
    console.error('Employees load failed:', err);
  }
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById('employees-table');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Сотрудники не найдены</td></tr>`;
    return;
  }

  list.forEach(emp => {
    const row = document.createElement('tr');
    
    let statusBadge = `<span class="badge badge-success">Активен</span>`;
    if (emp.status === 'archived') {
      statusBadge = `<span class="badge badge-neutral">В архиве</span>`;
    }

    const lastBriefing = emp.last_briefing_date 
      ? `<span class="badge badge-info">${formatDate(emp.last_briefing_date)}</span>` 
      : `<span style="color: var(--text-muted); font-size: 0.8rem;">Не проходил</span>`;

    row.innerHTML = `
      <td><strong>${escapeHTML(emp.full_name)}</strong></td>
      <td>${escapeHTML(emp.position)}</td>
      <td>${escapeHTML(emp.department_name || 'Не указан')}</td>
      <td>${formatDate(emp.hire_date)}</td>
      <td>${lastBriefing}</td>
      <td>${statusBadge}</td>
      <td style="text-align: right;">
        <div class="action-btn-group" style="justify-content: flex-end;">
          <button class="action-btn edit" onclick="editEmployee(${emp.id})" title="Редактировать">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          ${emp.status === 'active' ? `
            <button class="action-btn delete" onclick="archiveEmployee(${emp.id})" title="Архивировать">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function filterEmployees() {
  const searchVal = document.getElementById('filter-search').value.toLowerCase();
  const deptVal = document.getElementById('filter-dept').value;
  const statusVal = document.getElementById('filter-status').value;

  const filtered = employeesList.filter(emp => {
    const matchesSearch = emp.full_name.toLowerCase().includes(searchVal) || 
                          emp.position.toLowerCase().includes(searchVal);
    
    const matchesDept = !deptVal || emp.department_id === parseInt(deptVal);
    
    let matchesStatus = true;
    if (statusVal === 'active') {
      matchesStatus = emp.status === 'active';
    } else if (statusVal === 'archived') {
      matchesStatus = emp.status === 'archived';
    }

    return matchesSearch && matchesDept && matchesStatus;
  });

  renderEmployeesTable(filtered);
}

// Edit & Archive Triggers
function editEmployee(id) {
  const emp = employeesList.find(e => e.id === id);
  if (!emp) return;

  document.getElementById('employee-modal-title').textContent = 'Редактирование сотрудника';
  document.getElementById('emp-id').value = emp.id;
  document.getElementById('emp-name').value = emp.full_name;
  document.getElementById('emp-position').value = emp.position;
  document.getElementById('emp-dept').value = emp.department_id || '';
  document.getElementById('emp-date').value = emp.hire_date;
  
  // Show status select for edits
  const statusGroup = document.getElementById('emp-status-group');
  if (statusGroup) {
    statusGroup.style.display = 'block';
    document.getElementById('emp-status').value = emp.status;
  }

  document.getElementById('employeeModal').style.display = 'flex';
}

async function archiveEmployee(id) {
  if (!confirm('Вы уверены, что хотите перенести сотрудника в архив?')) return;
  try {
    await fetchAPI(`/employees/${id}`, { method: 'DELETE' });
    await loadEmployees();
    alert('Сотрудник архивирован');
  } catch (err) {
    console.error('Failed to archive employee:', err);
  }
}

// Modals Open/Close
function openEmployeeModal() {
  document.getElementById('employee-modal-title').textContent = 'Добавление сотрудника';
  document.getElementById('employeeForm').reset();
  document.getElementById('emp-id').value = '';
  
  const statusGroup = document.getElementById('emp-status-group');
  if (statusGroup) statusGroup.style.display = 'none';

  document.getElementById('employeeModal').style.display = 'flex';
}

function closeEmployeeModal() {
  document.getElementById('employeeModal').style.display = 'none';
}

function openDeptModal() {
  document.getElementById('deptModal').style.display = 'flex';
}

function closeDeptModal() {
  document.getElementById('deptModal').style.display = 'none';
}

// --- 3. INSTRUCTIONS PAGE LOGIC ---

async function initInstructionsPage() {
  await loadInstructions();

  // Setup instruction form submission
  const instForm = document.getElementById('instructionForm');
  if (instForm) {
    instForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const body = {
        title: document.getElementById('inst-title').value,
        type: document.getElementById('inst-type').value,
        period_months: parseInt(document.getElementById('inst-period').value),
        description: document.getElementById('inst-desc').value
      };

      try {
        await fetchAPI('/instructions', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        closeInstructionModal();
        instForm.reset();
        await loadInstructions();
        alert('Программа инструктажа создана');
      } catch (err) {
        console.error('Failed to submit instruction:', err);
      }
    });
  }
}

async function loadInstructions() {
  try {
    instructionsList = await fetchAPI('/instructions');
    renderInstructionsTable(instructionsList);
  } catch (err) {
    console.error('Failed to load instructions:', err);
  }
}

function renderInstructionsTable(list) {
  const tbody = document.getElementById('instructions-table');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Программы инструктажей отсутствуют</td></tr>`;
    return;
  }

  list.forEach(inst => {
    const row = document.createElement('tr');
    
    let typeBadgeClass = 'badge-neutral';
    if (inst.type === 'вводный') typeBadgeClass = 'badge-success';
    else if (inst.type === 'первичный') typeBadgeClass = 'badge-info';
    else if (inst.type === 'повторный') typeBadgeClass = 'badge-warning';
    else if (inst.type === 'внеплановый') typeBadgeClass = 'badge-danger';

    const periodStr = inst.period_months === 0 
      ? 'Однократно' 
      : `${inst.period_months} мес.`;

    row.innerHTML = `
      <td><strong>${escapeHTML(inst.title)}</strong></td>
      <td><span class="badge ${typeBadgeClass}">${escapeHTML(inst.type)}</span></td>
      <td>${periodStr}</td>
      <td style="color: var(--text-muted); font-size: 0.85rem;">${escapeHTML(inst.description || '—')}</td>
    `;
    tbody.appendChild(row);
  });
}

function openInstructionModal() {
  document.getElementById('instructionModal').style.display = 'flex';
}

function closeInstructionModal() {
  document.getElementById('instructionModal').style.display = 'none';
}

// --- 4. REPORTS / JOURNAL PAGE LOGIC ---

async function initReportsPage() {
  await loadJournal();
}

async function loadJournal() {
  try {
    journalList = await fetchAPI('/briefings');
    renderJournalTable(journalList);
  } catch (err) {
    console.error('Failed to load journal:', err);
  }
}

function renderJournalTable(list) {
  const tbody = document.getElementById('journal-table');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Записи в журнале отсутствуют</td></tr>`;
    return;
  }

  const currentDate = new Date().toISOString().split('T')[0];

  list.forEach(item => {
    const row = document.createElement('tr');
    
    let typeBadgeClass = 'badge-neutral';
    if (item.instruction_type === 'вводный') typeBadgeClass = 'badge-success';
    else if (item.instruction_type === 'первичный') typeBadgeClass = 'badge-info';
    else if (item.instruction_type === 'повторный') typeBadgeClass = 'badge-warning';
    else if (item.instruction_type === 'внеплановый') typeBadgeClass = 'badge-danger';

    let statusText = 'Разовый';
    let statusClass = 'badge-neutral';
    
    if (item.next_briefing_date) {
      if (item.next_briefing_date < currentDate) {
        statusText = 'Просрочен';
        statusClass = 'badge-danger';
      } else {
        statusText = 'Действует';
        statusClass = 'badge-success';
      }
    }

    const nextBriefingStr = item.next_briefing_date 
      ? formatDate(item.next_briefing_date) 
      : 'Не требуется';

    row.innerHTML = `
      <td><strong>${escapeHTML(item.employee_name)}</strong><br><small style="color: var(--text-muted);">${escapeHTML(item.employee_position)}</small></td>
      <td>${escapeHTML(item.department_name || '—')}</td>
      <td>${escapeHTML(item.instruction_title)}</td>
      <td><span class="badge ${typeBadgeClass}">${escapeHTML(item.instruction_type)}</span></td>
      <td>${formatDate(item.briefing_date)}</td>
      <td>${nextBriefingStr}</td>
      <td>${escapeHTML(item.instructor_name)}</td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
      <td style="color: var(--text-muted); font-size: 0.8rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(item.notes || '')}">
        ${escapeHTML(item.notes || '—')}
      </td>
    `;
    tbody.appendChild(row);
  });
}

function filterJournal() {
  const searchVal = document.getElementById('rep-search').value.toLowerCase();
  const deptVal = document.getElementById('rep-dept').value;
  const startDateVal = document.getElementById('rep-start-date').value;
  const endDateVal = document.getElementById('rep-end-date').value;
  const statusVal = document.getElementById('rep-status').value;

  const currentDate = new Date().toISOString().split('T')[0];

  const filtered = journalList.filter(item => {
    // 1. Text Search matches
    const matchesSearch = item.employee_name.toLowerCase().includes(searchVal) ||
                          item.instruction_title.toLowerCase().includes(searchVal) ||
                          item.instructor_name.toLowerCase().includes(searchVal);

    // 2. Department matches
    const matchesDept = !deptVal || item.department_id === parseInt(deptVal);

    // 3. Date range matches
    const matchesStart = !startDateVal || item.briefing_date >= startDateVal;
    const matchesEnd = !endDateVal || item.briefing_date <= endDateVal;

    // 4. Status matches
    let matchesStatus = true;
    if (statusVal === 'active') {
      matchesStatus = !!item.next_briefing_date && item.next_briefing_date >= currentDate;
    } else if (statusVal === 'overdue') {
      matchesStatus = !!item.next_briefing_date && item.next_briefing_date < currentDate;
    } else if (statusVal === 'onetime') {
      matchesStatus = !item.next_briefing_date;
    }

    return matchesSearch && matchesDept && matchesStart && matchesEnd && matchesStatus;
  });

  renderJournalTable(filtered);
}

// Export to CSV Functionality
function exportJournalToCSV() {
  // Get filtered or current journal entries
  // Re-run filter logic to get exact set currently matching filters
  const searchVal = document.getElementById('rep-search').value.toLowerCase();
  const deptVal = document.getElementById('rep-dept').value;
  const startDateVal = document.getElementById('rep-start-date').value;
  const endDateVal = document.getElementById('rep-end-date').value;
  const statusVal = document.getElementById('rep-status').value;
  const currentDate = new Date().toISOString().split('T')[0];

  const filtered = journalList.filter(item => {
    const matchesSearch = item.employee_name.toLowerCase().includes(searchVal) ||
                          item.instruction_title.toLowerCase().includes(searchVal) ||
                          item.instructor_name.toLowerCase().includes(searchVal);
    const matchesDept = !deptVal || item.department_id === parseInt(deptVal);
    const matchesStart = !startDateVal || item.briefing_date >= startDateVal;
    const matchesEnd = !endDateVal || item.briefing_date <= endDateVal;
    
    let matchesStatus = true;
    if (statusVal === 'active') {
      matchesStatus = !!item.next_briefing_date && item.next_briefing_date >= currentDate;
    } else if (statusVal === 'overdue') {
      matchesStatus = !!item.next_briefing_date && item.next_briefing_date < currentDate;
    } else if (statusVal === 'onetime') {
      matchesStatus = !item.next_briefing_date;
    }

    return matchesSearch && matchesDept && matchesStart && matchesEnd && matchesStatus;
  });

  if (filtered.length === 0) {
    alert('Нет записей для экспорта');
    return;
  }

  // Build CSV string (Excel-friendly UTF-8 with BOM)
  let csvContent = '\uFEFF'; // UTF-8 BOM
  
  // Header Row
  csvContent += 'Сотрудник;Должность;Отдел;Инструктаж;Вид;Дата проведения;Дата окончания;Кто провел;Примечания\n';

  filtered.forEach(item => {
    const row = [
      item.employee_name,
      item.employee_position,
      item.department_name || '',
      item.instruction_title,
      item.instruction_type,
      formatDate(item.briefing_date),
      item.next_briefing_date ? formatDate(item.next_briefing_date) : 'Не требуется',
      item.instructor_name,
      item.notes || ''
    ];

    // Escape semicolons and quotes
    const formattedRow = row.map(val => {
      let cell = val === null || val === undefined ? '' : String(val);
      cell = cell.replace(/"/g, '""');
      if (cell.includes(';') || cell.includes('\n') || cell.includes('"')) {
        return `"${cell}"`;
      }
      return cell;
    });

    csvContent += formattedRow.join(';') + '\n';
  });

  // Download Trigger
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `journal_briefings_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- UTILITY FUNCTIONS ---

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`; // DD.MM.YYYY
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
