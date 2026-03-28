/**
 * Multi-Language TODO App — Common Frontend Logic
 *
 * Usage in each todo_<lang>.html:
 *   <script>
 *     const API_BASE = '/api/<lang>';   // e.g. '/api/nodejs'
 *   </script>
 *   <script src="../js/app.js"></script>
 *
 * API contract (all backends must conform):
 *   GET    /api/<lang>/todos            → { todos: Todo[] }
 *   POST   /api/<lang>/todos            → { todo: Todo }
 *   PATCH  /api/<lang>/todos/:id        → { todo: Todo }
 *   DELETE /api/<lang>/todos/:id        → { message: string }
 *
 * Todo shape:
 *   { id: string, title: string, completed: boolean, created_at: string, updated_at: string }
 */

/* ============================================================================
   State
   ============================================================================ */
let todos   = [];
let filter  = 'all'; // 'all' | 'active' | 'completed'

/* ============================================================================
   DOM references (resolved after DOMContentLoaded)
   ============================================================================ */
let $input, $addBtn, $list, $statusBar, $countLabel, $clearBtn;

/* ============================================================================
   API helpers
   ============================================================================ */

/**
 * Centralised fetch wrapper.
 * @param {string} path   - relative to API_BASE
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function api(path, options = {}) {
    const url = `${API_BASE}${path}`;

    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });

    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const body = await res.json();
            msg = body.error || body.message || msg;
        } catch (_) { /* ignore */ }
        throw new Error(msg);
    }

    // 204 No Content
    if (res.status === 204) return null;
    return res.json();
}

const getTodos    = ()           => api('/todos');
const createTodo  = (title)      => api('/todos', { method: 'POST',  body: JSON.stringify({ title }) });
const updateTodo  = (id, patch)  => api(`/todos/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
const deleteTodo  = (id)         => api(`/todos/${id}`, { method: 'DELETE' });

/* ============================================================================
   Status bar
   ============================================================================ */
let statusTimer = null;

/**
 * @param {string} message
 * @param {'loading'|'success'|'error'} type
 * @param {number} [autoDismiss]  ms before hiding; 0 = stay
 */
function showStatus(message, type = 'loading', autoDismiss = 0) {
    clearTimeout(statusTimer);
    $statusBar.className   = `visible ${type}`;
    $statusBar.textContent = message;

    if (autoDismiss > 0) {
        statusTimer = setTimeout(() => {
            $statusBar.className = '';
        }, autoDismiss);
    }
}

function hideStatus() {
    clearTimeout(statusTimer);
    $statusBar.className = '';
}

/* ============================================================================
   Render
   ============================================================================ */
function getVisibleTodos() {
    if (filter === 'active')    return todos.filter(t => !t.completed);
    if (filter === 'completed') return todos.filter(t => t.completed);
    return todos;
}

function renderList() {
    const visible = getVisibleTodos();
    $list.innerHTML = '';

    if (visible.length === 0) {
        $list.innerHTML = `
            <li class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                           M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                <p>${filter === 'all' ? 'まだタスクがありません。追加してみましょう！' :
                     filter === 'active' ? '未完了のタスクはありません。' :
                     '完了済みのタスクはありません。'}</p>
            </li>`;
        return;
    }

    visible.forEach(todo => {
        const li = document.createElement('li');
        li.className = `todo-item${todo.completed ? ' completed' : ''}`;
        li.dataset.id = todo.id;

        li.innerHTML = `
            <input type="checkbox" class="todo-check" ${todo.completed ? 'checked' : ''}
                   aria-label="完了状態を切り替え">
            <span class="todo-title">${escapeHtml(todo.title)}</span>
            <button class="btn btn-danger" aria-label="削除">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                </svg>
            </button>`;

        li.querySelector('.todo-check').addEventListener('change', () => handleToggle(todo.id, !todo.completed));
        li.querySelector('.btn-danger').addEventListener('click', () => handleDelete(todo.id));

        $list.appendChild(li);
    });
}

function renderFooter() {
    const active    = todos.filter(t => !t.completed).length;
    const completed = todos.filter(t => t.completed).length;

    $countLabel.textContent = `${active} 件残り`;
    $clearBtn.style.display = completed > 0 ? '' : 'none';
}

function render() {
    renderList();
    renderFooter();

    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
}

/* ============================================================================
   Event handlers
   ============================================================================ */
async function handleAdd() {
    const title = $input.value.trim();
    if (!title) { $input.focus(); return; }

    $addBtn.disabled = true;
    showStatus('追加中...', 'loading');

    try {
        const data = await createTodo(title);
        todos.unshift(data.todo);
        $input.value = '';
        render();
        showStatus('追加しました', 'success', 2000);
    } catch (err) {
        showStatus(`エラー: ${err.message}`, 'error', 5000);
    } finally {
        $addBtn.disabled = false;
        $input.focus();
    }
}

async function handleToggle(id, completed) {
    const original = todos.find(t => t.id === id);
    // Optimistic update
    original.completed = completed;
    render();

    try {
        const data = await updateTodo(id, { completed });
        Object.assign(original, data.todo);
        render();
        hideStatus();
    } catch (err) {
        // Rollback
        original.completed = !completed;
        render();
        showStatus(`エラー: ${err.message}`, 'error', 5000);
    }
}

async function handleDelete(id) {
    const idx = todos.findIndex(t => t.id === id);
    if (idx === -1) return;

    // Optimistic remove
    const [removed] = todos.splice(idx, 1);
    render();

    try {
        await deleteTodo(id);
        hideStatus();
    } catch (err) {
        // Rollback
        todos.splice(idx, 0, removed);
        render();
        showStatus(`エラー: ${err.message}`, 'error', 5000);
    }
}

async function handleClearCompleted() {
    const completed = todos.filter(t => t.completed);
    if (completed.length === 0) return;

    showStatus('削除中...', 'loading');
    const errors = [];

    await Promise.all(completed.map(async t => {
        try {
            await deleteTodo(t.id);
            todos = todos.filter(x => x.id !== t.id);
        } catch (err) {
            errors.push(err.message);
        }
    }));

    render();
    if (errors.length > 0) {
        showStatus(`一部削除に失敗: ${errors[0]}`, 'error', 5000);
    } else {
        showStatus('完了済みを削除しました', 'success', 2000);
    }
}

/* ============================================================================
   Escape helper
   ============================================================================ */
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ============================================================================
   Init
   ============================================================================ */
async function init() {
    // Resolve DOM
    $input     = document.getElementById('todo-input');
    $addBtn    = document.getElementById('add-btn');
    $list      = document.getElementById('todo-list');
    $statusBar = document.getElementById('status-bar');
    $countLabel = document.getElementById('count-label');
    $clearBtn  = document.getElementById('clear-completed');

    // Add button
    $addBtn.addEventListener('click', handleAdd);
    $input.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdd(); });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filter = btn.dataset.filter;
            render();
        });
    });

    // Clear completed
    $clearBtn.addEventListener('click', handleClearCompleted);

    // Load todos
    showStatus('読み込み中...', 'loading');
    try {
        const data = await getTodos();
        todos = data.todos || [];
        render();
        hideStatus();
    } catch (err) {
        showStatus(`接続エラー: ${err.message}`, 'error');
        render();
    }
}

document.addEventListener('DOMContentLoaded', init);
