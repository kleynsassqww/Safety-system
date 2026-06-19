const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize database
const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    position TEXT NOT NULL,
    department_id INTEGER,
    hire_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY(department_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS instructions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL, -- 'вводный', 'первичный', 'повторный', 'внеплановый'
    period_months INTEGER NOT NULL, -- 0 means one-time
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS briefings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    instruction_id INTEGER NOT NULL,
    briefing_date TEXT NOT NULL,
    next_briefing_date TEXT,
    instructor_name TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    FOREIGN KEY(instruction_id) REFERENCES instructions(id)
  );
`);

// Seed data if database is empty
const seedDatabase = () => {
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;
  if (deptCount === 0) {
    // Insert departments
    const insertDept = db.prepare('INSERT INTO departments (name) VALUES (?)');
    const depts = ['Администрация', 'Производственный цех', 'Логистика', 'ИТ-отдел', 'Отдел продаж'];
    depts.forEach(d => insertDept.run(d));

    // Insert instructions
    const insertInst = db.prepare('INSERT INTO instructions (title, type, period_months, description) VALUES (?, ?, ?, ?)');
    insertInst.run('Вводный инструктаж по охране труда', 'вводный', 0, 'Проводится со всеми вновь принимаемыми на работу сотрудниками.');
    insertInst.run('Первичный инструктаж на рабочем месте', 'первичный', 0, 'Проводится до начала самостоятельной работы сотрудника.');
    insertInst.run('Повторный инструктаж по пожарной безопасности', 'повторный', 6, 'Периодический инструктаж для проверки и закрепления знаний правил пожарной безопасности.');
    insertInst.run('Повторный инструктаж по электробезопасности', 'повторный', 12, 'Ежегодный повторный инструктаж для неэлектротехнического персонала.');
    insertInst.run('Внеплановый инструктаж в связи с новым оборудованием', 'внеплановый', 0, 'Инструктаж при изменении технологического процесса или введении нового оборудования.');

    // Insert employees
    const insertEmp = db.prepare('INSERT INTO employees (full_name, position, department_id, hire_date, status) VALUES (?, ?, ?, ?, ?)');
    insertEmp.run('Иванов Петр Сергеевич', 'Директор', 1, '2024-01-15', 'active');
    insertEmp.run('Петров Алексей Владимирович', 'Инженер-технолог', 2, '2024-03-10', 'active');
    insertEmp.run('Сидорова Мария Александровна', 'Специалист по кадрам', 1, '2025-05-02', 'active');
    insertEmp.run('Козлов Дмитрий Николаевич', 'Водитель погрузчика', 3, '2025-02-20', 'active');
    insertEmp.run('Морозов Сергей Петрович', 'Разработчик', 4, '2025-11-01', 'active');
    insertEmp.run('Васильев Олег Игоревич', 'Оператор станка', 2, '2026-01-10', 'active');

    // Insert some briefings
    const insertBriefing = db.prepare('INSERT INTO briefings (employee_id, instruction_id, briefing_date, next_briefing_date, instructor_name, notes) VALUES (?, ?, ?, ?, ?, ?)');
    
    // Ivanop P.S. (Director) - Completed Introductory instruction
    insertBriefing.run(1, 1, '2024-01-15', null, 'Смирнова Е.А.', 'Прошёл успешно');
    
    // Petrov A.V. - Primary, Fire safety, and Electrosafety (some overdue)
    insertBriefing.run(2, 1, '2024-03-10', null, 'Смирнова Е.А.', 'Вводный при приёме');
    insertBriefing.run(2, 2, '2024-03-11', null, 'Иванов П.С.', 'Первичный на рабочем месте');
    // Overdue fire safety: conducted in 2024-03-12, periodic 6 months, next was 2024-09-12 (overdue)
    insertBriefing.run(2, 3, '2024-03-12', '2024-09-12', 'Смирнова Е.А.', 'Просрочен');
    // Active electrosafety: conducted in 2026-01-10, periodic 12 months, next is 2027-01-10
    insertBriefing.run(2, 4, '2026-01-10', '2027-01-10', 'Смирнова Е.А.', 'Действует');

    // Kozlov D.N. (Driver) - Primary, Fire safety (active)
    insertBriefing.run(4, 1, '2025-02-20', null, 'Смирнова Е.А.', '');
    insertBriefing.run(4, 3, '2026-03-01', '2026-09-01', 'Иванов П.С.', 'Повторный'); // active (current date is June 2026)

    // Morozov S.P. - Primary
    insertBriefing.run(5, 1, '2025-11-01', null, 'Смирнова Е.А.', '');
  }
};
seedDatabase();

// --- API ROUTES ---

// 1. Departments
app.get('/api/departments', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM departments ORDER BY name').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/departments', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя отдела обязательно' });
  try {
    const info = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name);
    res.status(201).json({ id: info.lastInsertRowid, name });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Отдел с таким названием уже существует' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 2. Employees
app.get('/api/employees', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT e.*, d.name as department_name,
             (SELECT MAX(briefing_date) FROM briefings b WHERE b.employee_id = e.id) as last_briefing_date
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.status ASC, e.full_name ASC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/employees', (req, res) => {
  const { full_name, position, department_id, hire_date } = req.body;
  if (!full_name || !position || !department_id || !hire_date) {
    return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO employees (full_name, position, department_id, hire_date, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(full_name, position, department_id, hire_date);
    res.status(201).json({ id: info.lastInsertRowid, full_name, position, department_id, hire_date, status: 'active' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  const { full_name, position, department_id, hire_date, status } = req.body;
  try {
    db.prepare(`
      UPDATE employees
      SET full_name = ?, position = ?, department_id = ?, hire_date = ?, status = ?
      WHERE id = ?
    `).run(full_name, position, department_id, hire_date, status || 'active', id);
    res.json({ id, full_name, position, department_id, hire_date, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Instead of deleting, archive the employee
    db.prepare("UPDATE employees SET status = 'archived' WHERE id = ?").run(id);
    res.json({ success: true, message: 'Сотрудник архивирован' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Instructions
app.get('/api/instructions', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM instructions ORDER BY title').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/instructions', (req, res) => {
  const { title, type, period_months, description } = req.body;
  if (!title || !type || period_months === undefined) {
    return res.status(400).json({ error: 'Поля Название, Тип и Периодичность обязательны' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO instructions (title, type, period_months, description)
      VALUES (?, ?, ?, ?)
    `).run(title, type, parseInt(period_months), description || '');
    res.status(201).json({ id: info.lastInsertRowid, title, type, period_months, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Briefings (Journal & Conduct)
app.get('/api/briefings', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT b.*, 
             e.full_name as employee_name, e.position as employee_position,
             d.name as department_name,
             i.title as instruction_title, i.type as instruction_type, i.period_months
      FROM briefings b
      JOIN employees e ON b.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN instructions i ON b.instruction_id = i.id
      ORDER BY b.briefing_date DESC, b.id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/briefings', (req, res) => {
  const { employee_id, instruction_id, briefing_date, instructor_name, notes } = req.body;
  if (!employee_id || !instruction_id || !briefing_date || !instructor_name) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }
  try {
    // Find instruction periodic months to calculate next briefing date
    const instruction = db.prepare('SELECT period_months FROM instructions WHERE id = ?').get(instruction_id);
    if (!instruction) {
      return res.status(404).json({ error: 'Программа инструктажа не найдена' });
    }

    let next_briefing_date = null;
    if (instruction.period_months > 0) {
      const date = new Date(briefing_date);
      date.setMonth(date.getMonth() + instruction.period_months);
      next_briefing_date = date.toISOString().split('T')[0];
    }

    const info = db.prepare(`
      INSERT INTO briefings (employee_id, instruction_id, briefing_date, next_briefing_date, instructor_name, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_id, instruction_id, briefing_date, next_briefing_date, instructor_name, notes || '');

    res.status(201).json({
      id: info.lastInsertRowid,
      employee_id,
      instruction_id,
      briefing_date,
      next_briefing_date,
      instructor_name,
      notes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get overdue briefings list
app.get('/api/briefings/status', (req, res) => {
  try {
    // Current date for comparison
    const currentDate = new Date().toISOString().split('T')[0];

    // For each employee and instruction type, check their last completed briefing
    // If it's a periodic briefing and next_briefing_date is in the past, or if it's a required briefing that has NEVER been conducted.
    // To keep it simple and powerful, let's find:
    // 1. All periodic briefings that are overdue.
    // 2. Or employees who need a repeat briefing but their next date is passed.
    const overdue = db.prepare(`
      SELECT b.*, 
             e.full_name as employee_name, e.position as employee_position,
             d.name as department_name,
             i.title as instruction_title, i.type as instruction_type, i.period_months
      FROM briefings b
      JOIN employees e ON b.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN instructions i ON b.instruction_id = i.id
      WHERE b.next_briefing_date IS NOT NULL 
        AND b.next_briefing_date < ?
        AND e.status = 'active'
        AND b.id = (
          SELECT id FROM briefings b2 
          WHERE b2.employee_id = b.employee_id AND b2.instruction_id = b.instruction_id 
          ORDER BY b2.briefing_date DESC LIMIT 1
        )
      ORDER BY b.next_briefing_date ASC
    `).all(currentDate);

    res.json({ overdue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Dashboard / General Stats
app.get('/api/stats', (req, res) => {
  try {
    const currentDate = new Date().toISOString().split('T')[0];

    // Total active employees
    const employeesCount = db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = 'active'").get().count;

    // Total instructions/programs
    const instructionsCount = db.prepare("SELECT COUNT(*) as count FROM instructions").get().count;

    // Briefings conducted in the current month
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    const currentMonthStartStr = currentMonthStart.toISOString().split('T')[0];
    
    const conductedThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM briefings 
      WHERE briefing_date >= ?
    `).get(currentMonthStartStr).count;

    // Number of overdue periodic briefings
    const overdueCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM briefings b
      JOIN employees e ON b.employee_id = e.id
      WHERE b.next_briefing_date IS NOT NULL 
        AND b.next_briefing_date < ?
        AND e.status = 'active'
        AND b.id = (
          SELECT id FROM briefings b2 
          WHERE b2.employee_id = b.employee_id AND b2.instruction_id = b.instruction_id 
          ORDER BY b2.briefing_date DESC LIMIT 1
        )
    `).get(currentDate).count;

    // Get recent briefings (last 5)
    const recentBriefings = db.prepare(`
      SELECT b.*, e.full_name as employee_name, i.title as instruction_title
      FROM briefings b
      JOIN employees e ON b.employee_id = e.id
      JOIN instructions i ON b.instruction_id = i.id
      ORDER BY b.briefing_date DESC, b.id DESC
      LIMIT 5
    `).all();

    // Get list of upcoming briefings (next 30 days)
    const next30Days = new Date();
    next30Days.setDate(next30Days.getDate() + 30);
    const next30DaysStr = next30Days.toISOString().split('T')[0];

    const upcomingCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM briefings b
      JOIN employees e ON b.employee_id = e.id
      WHERE b.next_briefing_date IS NOT NULL 
        AND b.next_briefing_date >= ? 
        AND b.next_briefing_date <= ?
        AND e.status = 'active'
        AND b.id = (
          SELECT id FROM briefings b2 
          WHERE b2.employee_id = b.employee_id AND b2.instruction_id = b.instruction_id 
          ORDER BY b2.briefing_date DESC LIMIT 1
        )
    `).get(currentDate, next30DaysStr).count;

    res.json({
      employeesCount,
      instructionsCount,
      conductedThisMonth,
      overdueCount,
      upcomingCount,
      recentBriefings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wildcard fallback to index.html for SPA feel or routing (optional, since it's normal multi-page)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
