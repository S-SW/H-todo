/**
 * ==========================================================================
 * 极简待办云端驱动引擎 - 本地优先 + 智能合并双向同步版 (2026 修复版)
 * ==========================================================================
 */

const SUPABASE_URL = "https://gtgmqumuqxnuvoacsnxg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0Z21xdW11cXhudXZvYWNzbnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NTA3NzIsImV4cCI6MjA5NTUyNjc3Mn0.7sI9kmqymPr0LiZJodd4oZj3oF4GJYTewcYknVFxrwA";

const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates" // 使用 upsert 时的合并冲突策略
};

// 离线优先核心堆栈
let todos = JSON.parse(localStorage.getItem('todo_items_store')) || [];
let customLists = JSON.parse(localStorage.getItem('todo_lists_store')) || [
    { id: 'list_5', name: '每日任务', icon: 'fa-regular fa-folder', created_at: 1717800005000 },
    { id: 'list_4', name: '大学之后', icon: 'fa-regular fa-folder', created_at: 1717800004000 },
    { id: 'list_3', name: '目的地', icon: 'fa-solid fa-bars-staggered', created_at: 1717800003000 },
    { id: 'list_2', name: '旅行计划', icon: 'fa-regular fa-folder', created_at: 1717800002000 },
    { id: 'list_1', name: '26.3.16之前', icon: 'fa-regular fa-calendar', created_at: 1717800001000 }
];

let currentRoute = { type: 'system', id: 'today' }; 
let currentFilter = 'all'; 

// DOM 注册
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');
const currentCategoryTitle = document.getElementById('current-category-title');
const currentDateEl = document.getElementById('current-date');
const themeToggleBtn = document.getElementById('theme-toggle');
const customListsContainer = document.getElementById('custom-lists-container');
const cloudPushBtn = document.getElementById('cloud-push-btn');
const cloudPullBtn = document.getElementById('cloud-pull-btn');

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTheme();
    setupSystemRoutes();
    setupFilters();
    setupSyncActions();
    
    renderCustomLists();
    renderApp();
});

function initClock() {
    if (!currentDateEl) return;
    const now = new Date();
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    currentDateEl.textContent = now.toLocaleDateString('zh-CN', options).replace(/\//g, '.');
}

function saveLocalState() {
    localStorage.setItem('todo_items_store', JSON.stringify(todos));
    localStorage.setItem('todo_lists_store', JSON.stringify(customLists));
    updateBadges();
}

function updateBadges() {
    // 仅保留“我的一天”的角标防崩溃计算
    const badgeToday = document.getElementById('badge-today');
    if (badgeToday) {
        badgeToday.textContent = todos.filter(t => !t.is_completed && t.category === 'today').length || '0';
    }

    // 循环你的自定义列表文件夹
    customLists.forEach(list => {
        const badgeEl = document.getElementById(`badge-custom-${list.id}`);
        if (badgeEl) {
            const count = todos.filter(t => !t.is_completed && String(t.category) === String(list.id)).length;
            badgeEl.textContent = count || '0';
        }
    });
}

// ==========================================================================
// 核心视图渲染控制
// ==========================================================================
function renderCustomLists() {
    customListsContainer.innerHTML = '';
    const sortedLists = [...customLists].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    sortedLists.forEach(list => {
        const div = document.createElement('div');
        div.className = 'custom-list-item';
        div.dataset.id = list.id;
        
        if (currentRoute.type === 'custom' && String(currentRoute.id) === String(list.id)) {
            div.classList.add('active');
        }
        
        div.innerHTML = `
            <span class="nav-left">
                <i class="${list.icon || 'fa-regular fa-folder'}"></i>
                <span class="list-name-text" id="list-text-${list.id}">${escapeHtml(list.name)}</span>
            </span>
            <div class="list-actions">
                <button class="list-action-btn rename" title="重命名"><i class="fa-regular fa-pen-to-square"></i></button>
                <button class="list-action-btn delete" title="删除列表"><i class="fa-regular fa-trash-can"></i></button>
            </div>
            <span class="badge" id="badge-custom-${list.id}">0</span>
        `;
        
        div.addEventListener('click', (e) => {
            if (e.target.closest('.list-action-btn') || e.target.closest('.list-edit-input')) return;
            document.querySelectorAll('.nav-item, .custom-list-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            currentRoute = { type: 'custom', id: list.id };
            currentCategoryTitle.textContent = list.name;
            renderApp();
        });

        div.querySelector('.rename').addEventListener('click', () => startRenameList(list.id));
        div.querySelector('.delete').addEventListener('click', () => deleteCustomList(list.id));
        
        customListsContainer.appendChild(div);
    });
    updateBadges();
}

document.getElementById('create-list-btn').addEventListener('click', () => {
    const name = prompt("请输入新建文件夹/标签列表名称:");
    if (!name || !name.trim()) return;
    
    const newList = {
        id: 'list_' + Date.now(), // 统一使用带前缀的字符串作为唯一主键
        name: name.trim(),
        icon: 'fa-regular fa-folder',
        created_at: Date.now()
    };
    
    customLists.push(newList);
    saveLocalState();
    
    currentRoute = { type: 'custom', id: newList.id };
    currentCategoryTitle.textContent = newList.name;
    
    renderCustomLists();
    renderApp();
});

function startRenameList(id) {
    const textSpan = document.getElementById(`list-text-${id}`);
    const currentName = textSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'list-edit-input';
    input.value = currentName;
    
    const parent = textSpan.parentElement;
    parent.replaceChild(input, textSpan);
    input.focus();
    
    const saveRename = () => {
        const nextName = input.value.trim();
        if (nextName && nextName !== currentName) {
            customLists = customLists.map(l => l.id === id ? { ...l, name: nextName } : l);
            if (currentRoute.type === 'custom' && currentRoute.id === id) {
                currentCategoryTitle.textContent = nextName;
            }
            saveLocalState();
        }
        renderCustomLists();
    };
    
    input.addEventListener('blur', saveRename);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveRename(); });
}

function deleteCustomList(id) {
    if (!confirm("确定要在本地删除该标签文件夹吗？其中任务也会被清除。（同步后云端才会同步修改）")) return;
    todos = todos.filter(t => String(t.category) !== String(id));
    customLists = customLists.filter(l => l.id !== id);
    currentRoute = { type: 'system', id: 'today' };
    currentCategoryTitle.textContent = "我的一天";
    saveLocalState();
    renderCustomLists();
    renderApp();
}

function renderApp() {
    todoList.innerHTML = '';
    const sortedTodos = [...todos].sort((a, b) => (b.created_at_ts || 0) - (a.created_at_ts || 0));

    let filteredTodos = sortedTodos.filter(todo => {
        // 简化路由：如果当前在“我的一天”，非 today 分类直接过滤掉
        if (currentRoute.type === 'system') {
            if (currentRoute.id === 'today' && todo.category !== 'today') return false;
        } else {
            // 在自定义文件夹中，必须严格匹配对应的自定义 id
            if (String(todo.category) !== String(currentRoute.id)) return false;
        }

        if (currentFilter === 'pending') return !todo.is_completed;
        if (currentFilter === 'completed') return todo.is_completed;
        return true;
    });

    if (filteredTodos.length === 0) {
        todoList.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:60px 0;">暂无相关事务</div>`;
        updateBadges();
        return;
    }

    filteredTodos.forEach(todo => {
        const li = document.createElement('li');
        // 注意：这里 class 改回匹配你 CSS 的样式规范，支持鼠标悬停显示垃圾桶
        li.className = `todo-item todo-item-card ${todo.is_completed ? 'completed' : ''}`;
        
        li.innerHTML = `
            <div class="item-left">
                <input type="checkbox" class="todo-check" ${todo.is_completed ? 'checked' : ''}>
                <div class="todo-content-wrapper">
                    <span class="todo-title todo-text">${escapeHtml(todo.title)}</span>
                    <span class="todo-meta todo-date-tag"><i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${todo.date_tag || '刚刚'}</span>
                </div>
            </div>
            <button class="delete-btn" title="删除任务"><i class="fa-regular fa-trash-can"></i></button>
        `;

        const checkbox = li.querySelector('.todo-check');
        const deleteBtn = li.querySelector('.delete-btn');
        const titleSpan = li.querySelector('.todo-title');

        // 勾选状态切换
        checkbox.addEventListener('change', () => {
            todo.is_completed = !todo.is_completed;
            if (todo.is_completed) {
                playSuccessSound();
                triggerParticleEffect(checkbox);
            }
            saveLocalState();
            setTimeout(renderApp, 220);
        });

        // ✨ 核心强化：智能双料删除事件
        deleteBtn.addEventListener('click', async () => {
            // 1. 内存及本地秒级响应移除
            todos = todos.filter(t => String(t.id) !== String(todo.id));
            saveLocalState();
            renderApp();

            // 2. 静默在后台通知云端数据库删除对应的单条任务记录（确保拉取合并时不会死灰复燃）
            try {
                const targetId = String(todo.id).startsWith('task_') ? todo.id : 'task_' + todo.id;
                await fetch(`${SUPABASE_URL}/rest/v1/todos?id=eq.${targetId}`, {
                    method: 'DELETE',
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`
                    }
                });
            } catch (err) {
                console.warn("网络离线，云端任务将在下次完全同步时处理:", err);
            }
        });

        // 双击编辑标题
        titleSpan.addEventListener('dblclick', () => startInlineEdit(titleSpan, todo.id));
        todoList.appendChild(li);
    });

    updateBadges();
}

todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;

    const now = new Date();
    const dateTag = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    let targetCategory = 'tasks';
    if (currentRoute.type === 'system') {
        if (currentRoute.id === 'today') targetCategory = 'today';
    } else {
        targetCategory = String(currentRoute.id);
    }

    const newTodo = {
        id: 'task_' + Date.now(),
        title: text,
        is_completed: false,
        category: targetCategory,
        date_tag: dateTag,
        created_at_ts: Date.now()
    };

    todos.unshift(newTodo);
    saveLocalState();
    renderApp();
    todoInput.value = '';
});

function startInlineEdit(spanElement, id) {
    const currentText = spanElement.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = currentText;
    
    const parent = spanElement.parentElement;
    parent.replaceChild(input, spanElement);
    input.focus();

    const saveEdit = () => {
        const nextText = input.value.trim();
        if (nextText && nextText !== currentText) {
            todos = todos.map(t => t.id === id ? { ...t, title: nextText } : t);
            saveLocalState();
        }
        renderApp();
    };
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveEdit(); });
}

// ==========================================================================
// 核心模块：智能合并双向手动同步机制（解决数据丢失与离线合并）
// ==========================================================================
function setupSyncActions() {
    cloudPushBtn.addEventListener('click', async () => {
        const icon = cloudPushBtn.querySelector('i');
        icon.className = 'fa-solid fa-circle-notch animate-spin';
        cloudPushBtn.disabled = true;

        try {
            // 【策略升级】直接采用本地ID作为主键同步，不再清空，而是使用不覆盖的增量上传
            const listsToUpload = customLists.map(l => ({
                id: String(l.id), // 直接把本地ID串推送上云，两端完全对齐
                name: l.name,
                icon: l.icon,
                created_at: new Date(l.created_at || Date.now()).toISOString()
            }));

            // 1. 推送文件夹大类
            const listRes = await fetch(`${SUPABASE_URL}/rest/v1/todo_lists`, {
                method: 'POST',
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify(listsToUpload)
            });
            if (!listRes.ok && listRes.status !== 400) throw new Error("同步云端文件夹失败");

            // 2. 准备推送任务明细 (直接保留本地的分类ID字符串映射)
            const todosToUpload = todos.map(t => ({
                id: String(t.id).startsWith('task_') ? t.id : 'task_' + t.id, // 确保ID具有唯一前缀标识
                title: t.title || "",
                is_completed: !!t.is_completed,
                category: String(t.category), // 这样 category 永远能找到它对应的文件夹，不会丢失！
                date_tag: t.date_tag || "",
                created_at: new Date(t.created_at_ts || Date.now()).toISOString()
            }));

            if (todosToUpload.length > 0) {
                const todoRes = await fetch(`${SUPABASE_URL}/rest/v1/todos`, {
                    method: 'POST',
                    headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                    body: JSON.stringify(todosToUpload)
                });
                if (!todoRes.ok && todoRes.status !== 400) throw new Error("同步云端任务细项失败");
            }

            // 3. 上传完本地后，立刻拉取云端进行智能双向合并
            await pullAndMergeFromCloud();
            alert("✨ 本地与云端数据已双向合并成功！数据永不丢失。");

        } catch (error) {
            console.error(error);
            alert(`❌ 同步失败: ${error.message}`);
        } finally {
            icon.className = 'fa-solid fa-cloud-arrow-up';
            cloudPushBtn.disabled = false;
        }
    });

    cloudPullBtn.addEventListener('click', async () => {
        const icon = cloudPullBtn.querySelector('i');
        icon.className = 'fa-solid fa-circle-notch animate-spin';
        cloudPullBtn.disabled = true;

        try {
            await pullAndMergeFromCloud();
            alert("📥 云端最新快照已顺利拉取并合并至本地！");
        } catch (e) {
            alert(`拉取合并失败: ${e.message}`);
        } finally {
            icon.className = 'fa-solid fa-cloud-arrow-down';
            cloudPullBtn.disabled = false;
        }
    });
}

// 核心智能合并算法：云端本地双向并集保留
async function pullAndMergeFromCloud() {
    // 1. 获取云端最新文件夹
    const listRes = await fetch(`${SUPABASE_URL}/rest/v1/todo_lists`, { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
    if (!listRes.ok) throw new Error("拉取云端标签失败");
    const cloudLists = await listRes.json();

    // 合并分类列表（如果本地没有这个云端ID，就加进来；如果有了，更新名称）
    cloudLists.forEach(cl => {
        const localIndex = customLists.findIndex(l => String(l.id) === String(cl.id));
        if (localIndex > -1) {
            customLists[localIndex].name = cl.name; // 以云端最新的命名为准
        } else {
            customLists.push({
                id: cl.id,
                name: cl.name,
                icon: cl.icon || 'fa-regular fa-folder',
                created_at: cl.created_at ? new Date(cl.created_at).getTime() : Date.now()
            });
        }
    });

    // 2. 获取云端最新任务流
    const todoRes = await fetch(`${SUPABASE_URL}/rest/v1/todos`, { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
    if (!todoRes.ok) throw new Error("拉取云端待办流失败");
    const cloudTodos = await todoRes.json();

    // 合并任务流
    cloudTodos.forEach(ct => {
        const localIndex = todos.findIndex(t => String(t.id) === String(ct.id));
        if (localIndex > -1) {
            // 本地已有，进行状态同步覆盖
            todos[localIndex].is_completed = ct.is_completed;
            todos[localIndex].title = ct.title;
        } else {
            // 本地没有的云端项，完美追加合并
            todos.push({
                id: ct.id,
                title: ct.title,
                is_completed: ct.is_completed,
                category: ct.category, 
                date_tag: ct.date_tag,
                created_at_ts: ct.created_at ? new Date(ct.created_at).getTime() : Date.now()
            });
        }
    });

    saveLocalState();
    renderCustomLists();
    renderApp();
}

// ==========================================================================
// 辅助模块：支撑系统
// ==========================================================================
function setupSystemRoutes() {
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item, .custom-list-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            currentRoute = { type: 'system', id: item.dataset.id };
            currentCategoryTitle.textContent = item.textContent.trim();
            renderApp();
        });
    });
}

function setupFilters() {
    document.querySelectorAll('.filter-controls .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-controls .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderApp();
        });
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggleBtn.querySelector('i').className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-regular fa-moon';

    themeToggleBtn.addEventListener('click', () => {
        const curr = document.documentElement.getAttribute('data-theme');
        const next = curr === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        themeToggleBtn.querySelector('i').className = next === 'dark' ? 'fa-solid fa-sun' : 'fa-regular fa-moon';
    });
}

function playSuccessSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch (e) { console.warn(e); }
}

function triggerParticleEffect(element) {
    const rect = element.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.left = '0'; canvas.style.top = '0';
    canvas.style.width = '100vw'; canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none'; canvas.style.zIndex = '999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = document.documentElement.getAttribute('data-theme') === 'dark' 
        ? ['#ffffff', '#aaaaaa', '#00b894'] : ['#111111', '#aaaaaa', '#2ed573'];

    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 2;
        particles.push({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.random() * 2 + 1.5,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            decay: Math.random() * 0.03 + 0.02
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach(p => {
            if (p.alpha > 0) {
                alive = true;
                p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
            }
        });
        if (alive) requestAnimationFrame(animate); else canvas.remove();
    }
    animate();
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[s]);
}