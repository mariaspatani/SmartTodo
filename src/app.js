const STORAGE_KEY = 'smartTodo:tasks';
const META_KEY = 'smartTodo:meta';

const elements = {
  taskForm: document.getElementById('taskForm'),
  titleInput: document.getElementById('titleInput'),
  categoryInput: document.getElementById('categoryInput'),
  priorityInput: document.getElementById('priorityInput'),
  dueInput: document.getElementById('dueInput'),
  subtaskInput: document.getElementById('subtaskInput'),
  taskList: document.getElementById('taskList'),
  searchInput: document.getElementById('searchInput'),
  categoryFilter: document.getElementById('categoryFilter'),
  priorityFilter: document.getElementById('priorityFilter'),
  viewFilter: document.getElementById('viewFilter'),
  themeToggle: document.getElementById('themeToggle'),
  themeSelect: document.getElementById('themeSelect'),
  voiceBtn: document.getElementById('voiceBtn'),
  xpBar: document.getElementById('xpBar'),
  xpText: document.getElementById('xpText'),
  levelValue: document.getElementById('levelValue'),
  completionBar: document.getElementById('completionBar'),
  completionText: document.getElementById('completionText'),
  motivation: document.getElementById('motivation'),
  toast: document.getElementById('toast'),
};

const messages = [
  'Small steps, big wins.',
  'Focus beats force.',
  'Progress > perfection.',
  'You’re building momentum.',
  'Keep going—future you is grateful.',
];

const state = {
  tasks: [],
  xp: 0,
  level: 1,
  theme: 'light',
  unlockedThemes: ['light', 'dark'],
  orderSeed: 0,
  recognition: null,
  listening: false,
};

function levelThreshold(level) {
  return 100 + (level - 1) * 20;
}

function loadState() {
  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const meta = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    state.tasks = savedTasks;
    state.xp = meta.xp || 0;
    state.level = meta.level || 1;
    state.theme = meta.theme || 'light';
    state.unlockedThemes = meta.unlockedThemes || ['light', 'dark'];
    state.orderSeed = meta.orderSeed || savedTasks.length;
  } catch (e) {
    console.warn('Could not load saved data', e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  localStorage.setItem(
    META_KEY,
    JSON.stringify({
      xp: state.xp,
      level: state.level,
      theme: state.theme,
      unlockedThemes: state.unlockedThemes,
      orderSeed: state.orderSeed,
    }),
  );
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseSubtasks(raw) {
  return raw
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((title) => ({ id: randomId(), title, done: false }));
}

function addTask(evt) {
  evt.preventDefault();
  const title = elements.titleInput.value.trim();
  if (!title) return;

  const category = elements.categoryInput.value.trim() || 'General';
  const priority = elements.priorityInput.value;
  const dueDate = elements.dueInput.value || null;
  const subtasks = parseSubtasks(elements.subtaskInput.value);

  const task = {
    id: randomId(),
    title,
    category,
    priority,
    dueDate,
    subtasks,
    completed: false,
    createdAt: Date.now(),
    order: state.orderSeed++,
  };

  state.tasks.push(task);
  showToast('Task added');
  elements.taskForm.reset();
  saveState();
  render();
}

function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const wasDone = task.completed;
  task.completed = !task.completed;

  if (task.completed && !wasDone) awardXp(task);
  showToast(task.completed ? 'Task completed 🎉' : 'Task reopened');
  saveState();
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  showToast('Task removed');
  saveState();
  render();
}

function editTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const title = prompt('Update task title', task.title);
  if (title === null) return;
  const category = prompt('Category', task.category);
  const dueDate = prompt('Due date (YYYY-MM-DD or empty)', task.dueDate || '');
  const priority = prompt('Priority: high | medium | low', task.priority);

  task.title = title.trim() || task.title;
  if (category !== null) task.category = category.trim() || 'General';
  if (dueDate !== null) task.dueDate = dueDate.trim() || null;
  if (priority && ['high', 'medium', 'low'].includes(priority.trim()))
    task.priority = priority.trim();

  saveState();
  render();
}

function toggleSubtask(taskId, subId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const sub = task.subtasks.find((s) => s.id === subId);
  if (!sub) return;
  sub.done = !sub.done;
  // Auto-complete task when all subtasks are done.
  if (task.subtasks.length && task.subtasks.every((s) => s.done)) {
    if (!task.completed) {
      task.completed = true;
      awardXp(task);
      showToast('Great! Task auto-completed from subtasks.');
    }
  } else {
    task.completed = false;
  }
  saveState();
  render();
}

function awardXp(task) {
  const base = { high: 25, medium: 15, low: 10 }[task.priority] || 10;
  const bonus = Math.min(task.subtasks.length * 2, 10);
  state.xp += base + bonus;
  let threshold = levelThreshold(state.level);
  while (state.xp >= threshold) {
    state.xp -= threshold;
    state.level += 1;
    threshold = levelThreshold(state.level);
    showToast(`Level up! Reached level ${state.level}`);
    if (state.level >= 3 && !state.unlockedThemes.includes('sunset')) {
      state.unlockedThemes.push('sunset');
    }
  }
}

function dueStatus(task) {
  if (!task.dueDate) return 'none';
  const now = new Date();
  const due = new Date(task.dueDate);
  const diff = (due - now) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'overdue';
  if (diff <= 1) return 'soon';
  return 'future';
}

function matchView(task, view) {
  if (view === 'all') return true;
  const now = new Date();
  const due = task.dueDate ? new Date(task.dueDate) : null;
  if (!due) return view === 'overdue' ? false : true;

  const diff = (due - now) / (1000 * 60 * 60 * 24);
  if (view === 'overdue') return diff < 0;
  if (view === 'today') return Math.abs(diff) < 1;
  if (view === 'week') return diff >= 0 && diff <= 7;
  if (view === 'month') return diff >= 0 && diff <= 31;
  return true;
}

function filteredTasks() {
  const search = elements.searchInput.value.toLowerCase();
  const category = elements.categoryFilter.value;
  const priority = elements.priorityFilter.value;
  const view = elements.viewFilter.value;

  return state.tasks
    .filter((t) => t.title.toLowerCase().includes(search) || t.category.toLowerCase().includes(search))
    .filter((t) => (category === 'all' ? true : t.category === category))
    .filter((t) => (priority === 'all' ? true : t.priority === priority))
    .filter((t) => matchView(t, view))
    .sort((a, b) => a.order - b.order);
}

function renderCategories() {
  const current = elements.categoryFilter.value || 'all';
  const opts = new Set(['all']);
  state.tasks.forEach((t) => opts.add(t.category));
  elements.categoryFilter.innerHTML = '';
  opts.forEach((cat) => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat === 'all' ? 'All categories' : cat;
    elements.categoryFilter.appendChild(option);
  });
  elements.categoryFilter.value = opts.has(current) ? current : 'all';
}

function renderTasks() {
  elements.taskList.innerHTML = '';
  const tasks = filteredTasks();
  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'task';
    card.dataset.id = task.id;
    card.draggable = true;

    const left = document.createElement('div');
    const right = document.createElement('div');
    right.className = 'task-actions';

    const header = document.createElement('div');
    header.className = 'task-header';
    const status = document.createElement('div');
    status.className = 'status-dot';
    const dueState = dueStatus(task);
    if (dueState === 'overdue') status.classList.add('overdue');
    if (dueState === 'soon') status.classList.add('soon');
    header.appendChild(status);

    const title = document.createElement('h3');
    title.className = 'task-title';
    title.textContent = task.title;
    if (task.completed) title.style.textDecoration = 'line-through';
    header.appendChild(title);

    const badge = document.createElement('span');
    badge.className = `badge priority-${task.priority}`;
    badge.textContent = task.priority.toUpperCase();
    header.appendChild(badge);

    left.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.innerHTML = `
      <span>📂 ${task.category}</span>
      <span>📅 ${task.dueDate || 'No due date'}</span>
      <span>🧩 ${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} subtasks</span>
    `;
    left.appendChild(meta);

    if (task.subtasks.length) {
      const list = document.createElement('ul');
      list.className = 'subtasks';
      task.subtasks.forEach((sub) => {
        const li = document.createElement('li');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = sub.done;
        box.addEventListener('change', () => toggleSubtask(task.id, sub.id));
        li.appendChild(box);
        const text = document.createElement('span');
        text.textContent = sub.title;
        if (sub.done) text.style.textDecoration = 'line-through';
        li.appendChild(text);
        list.appendChild(li);
      });
      left.appendChild(list);
    }

    const completeBtn = document.createElement('button');
    completeBtn.className = 'ghost';
    completeBtn.textContent = task.completed ? 'Reopen' : 'Done';
    completeBtn.addEventListener('click', () => toggleTask(task.id));

    const editBtn = document.createElement('button');
    editBtn.className = 'ghost';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editTask(task.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    right.append(completeBtn, editBtn, deleteBtn);

    card.append(left, right);
    addDragHandlers(card);
    elements.taskList.appendChild(card);
  });
}

function renderStats() {
  const total = state.tasks.length || 1;
  const completed = state.tasks.filter((t) => t.completed).length;
  const percent = Math.round((completed / total) * 100);
  elements.completionBar.style.width = `${percent}%`;
  elements.completionText.textContent = `${percent}%`;

  const threshold = levelThreshold(state.level);
  const progress = Math.min((state.xp / threshold) * 100, 100);
  elements.xpBar.style.width = `${progress}%`;
  elements.xpText.textContent = `${state.xp} / ${threshold}`;
  elements.levelValue.textContent = state.level;

  const reminder = state.tasks.find((t) => dueStatus(t) === 'soon' && !t.completed);
  if (reminder) {
    elements.motivation.textContent = `Reminder: ${reminder.title} is due soon.`;
  } else {
    elements.motivation.textContent = messages[Math.floor(Math.random() * messages.length)];
  }
}

function addDragHandlers(card) {
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (e) => e.preventDefault());
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const targetId = card.dataset.id;
    reorderTasks(draggedId, targetId);
  });
}

function reorderTasks(dragId, dropId) {
  if (dragId === dropId) return;
  const orderMap = new Map(state.tasks.map((t) => [t.id, t.order]));
  const dragOrder = orderMap.get(dragId);
  const dropOrder = orderMap.get(dropId);
  state.tasks.forEach((t) => {
    if (t.id === dragId) t.order = dropOrder;
    else if (dragOrder < dropOrder && t.order > dragOrder && t.order <= dropOrder) t.order -= 1;
    else if (dragOrder > dropOrder && t.order < dragOrder && t.order >= dropOrder) t.order += 1;
  });
  saveState();
  render();
}

function renderThemes() {
  elements.themeSelect.innerHTML = '';
  state.unlockedThemes.forEach((theme) => {
    const opt = document.createElement('option');
    opt.value = theme;
    opt.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
    elements.themeSelect.appendChild(opt);
  });
  elements.themeSelect.value = state.theme;
  applyTheme(state.theme);
}

function applyTheme(theme) {
  state.theme = theme;
  document.body.setAttribute('data-theme', theme);
  saveState();
}

function toggleTheme() {
  const next = state.theme === 'light' ? 'dark' : 'light';
  elements.themeSelect.value = next;
  applyTheme(next);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  requestAnimationFrame(() => elements.toast.classList.add('show'));
  clearTimeout(elements.toast._timer);
  elements.toast._timer = setTimeout(() => {
    elements.toast.classList.remove('show');
    setTimeout(() => elements.toast.classList.add('hidden'), 200);
  }, 1800);
}

function setupVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.voiceBtn.disabled = true;
    elements.voiceBtn.textContent = 'Voice N/A';
    return;
  }
  state.recognition = new Recognition();
  state.recognition.lang = 'en-US';
  state.recognition.interimResults = false;
  state.recognition.continuous = false;

  state.recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    elements.titleInput.value = text;
    showToast('Voice captured');
  };
  state.recognition.onend = () => {
    state.listening = false;
    elements.voiceBtn.textContent = '🎤 Voice';
  };
}

function toggleVoice() {
  if (!state.recognition) return;
  if (state.listening) {
    state.recognition.stop();
    return;
  }
  state.listening = true;
  elements.voiceBtn.textContent = 'Listening...';
  state.recognition.start();
}

function bindEvents() {
  elements.taskForm.addEventListener('submit', addTask);
  elements.searchInput.addEventListener('input', render);
  elements.categoryFilter.addEventListener('change', render);
  elements.priorityFilter.addEventListener('change', render);
  elements.viewFilter.addEventListener('change', render);
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
  elements.voiceBtn.addEventListener('click', toggleVoice);
}

function render() {
  renderThemes();
  renderCategories();
  renderTasks();
  renderStats();
}

function init() {
  loadState();
  setupVoice();
  bindEvents();
  render();
}

document.addEventListener('DOMContentLoaded', init);

