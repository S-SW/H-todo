/**
 * ==========================================================================
 * 极简待办云端驱动引擎 - 纯云端直连数据库版（全局登录保护版）
 * ==========================================================================
 */

const SUPABASE_URL = "https://gtgmqumuqxnuvoacsnxg.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0Z21xdW11cXhudXZvYWNzbnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NTA3NzIsImV4cCI6MjA5NTUyNjc3Mn0.7sI9kmqymPr0LiZJodd4oZj3oF4GJYTewcYknVFxrwA";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// ==========================================================================
// 权限安全验证模块 (SHA-256 哈希加密)
// ==========================================================================
// 预设的访问密码哈希值（当前对应明文密码为：123）
const AUTH_PASSWORD_HASH =
  "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

// 全局登录状态隔离锁
let isLoggedIn = false;

// 使用 Web Crypto API 计算字符串的 SHA-256 哈希值
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 站点入口身份验证
async function requireLogin() {
  const password = prompt(
    "🔐 欢迎访问 NAHKtodo，请输入全局身份验证密码以开启编辑权限:",
  );
  if (password === null) {
    alert("⚠ 您取消了登录，网站将切换为【只读模式】，无法添加和删除数据。");
    return false;
  }

  const hashedInput = await sha256(password.trim());
  if (hashedInput === AUTH_PASSWORD_HASH) {
    alert("✅ 密码验证成功！欢迎回来，NAHK。");
    return true;
  } else {
    alert("❌ 密码错误！网站已进入【只读模式】，添加与删除功能已被完全锁死。");
    return false;
  }
}

// 核心操作守卫：拦截一切未授权的写入/删除行为
function checkAuthGuard() {
  if (!isLoggedIn) {
    alert(
      "🚫 核心权限被拦截：您当前处于【只读模式】，请输入正确的密码重新登录后操作！",
    );
    return false;
  }
  return true;
}

// 纯内存状态跟踪
let todos = [];
let customLists = [];

let currentRoute = { type: "system", id: "today" };
let currentFilter = "all";

// DOM 注册
const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoList = document.getElementById("todo-list");
const currentCategoryTitle = document.getElementById("current-category-title");
const currentDateEl = document.getElementById("current-date");
const themeToggleBtn = document.getElementById("theme-toggle");
const customListsContainer = document.getElementById("custom-lists-container");

// 💡 异步生命周期初始化：必须先走完密码验证，再决定是否开启权限并拉取数据
document.addEventListener("DOMContentLoaded", async () => {
  initClock();
  initTheme();
  setupSystemRoutes();
  setupFilters();

  // 1. 优先执行登录验证
  isLoggedIn = await requireLogin();

  // 2. 无论是否登录成功，均允许拉取并渲染数据（只读模式也可以看，但不能改删）
  fetchAndRenderAll();
});

function initClock() {
  if (!currentDateEl) return;
  const now = new Date();
  const options = { year: "numeric", month: "2-digit", day: "2-digit" };
  currentDateEl.textContent = now
    .toLocaleDateString("zh-CN", options)
    .replace(/\//g, ".");
}

/**
 * ==========================================================================
 * 核心数据库交互（直连云端）
 * ==========================================================================
 */

// 从云端统一拉取分类和待办，并重新渲染
async function fetchAndRenderAll() {
  try {
    const [listRes, todoRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/todo_lists`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/todos`, { headers }),
    ]);

    if (!listRes.ok || !todoRes.ok) throw new Error("从数据库获取数据失败");

    customLists = await listRes.json();
    todos = await todoRes.json();

    renderCustomLists();
    renderApp();
  } catch (error) {
    console.error("数据库连接错误:", error);
  }
}

function updateBadges() {
  const badgeToday = document.getElementById("badge-today");
  if (badgeToday) {
    badgeToday.textContent =
      todos.filter((t) => !t.is_completed && t.category === "today").length ||
      "0";
  }

  const badgeAllTasks = document.getElementById("badge-all-tasks");
  if (badgeAllTasks) {
    badgeAllTasks.textContent =
      todos.filter((t) => !t.is_completed).length || "0";
  }

  customLists.forEach((list) => {
    const badgeEl = document.getElementById(`badge-custom-${list.id}`);
    if (badgeEl) {
      const count = todos.filter(
        (t) => !t.is_completed && String(t.category) === String(list.id),
      ).length;
      badgeEl.textContent = count || "0";
    }
  });
}

// ==========================================================================
// 视图渲染控制
// ==========================================================================
function renderCustomLists() {
  customListsContainer.innerHTML = "";
  const sortedLists = [...customLists].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  sortedLists.forEach((list) => {
    const div = document.createElement("div");
    div.className = "custom-list-item";
    div.dataset.id = list.id;

    if (
      currentRoute.type === "custom" &&
      String(currentRoute.id) === String(list.id)
    ) {
      div.classList.add("active");
    }

    div.innerHTML = `
            <span class="nav-left">
                <i class="${list.icon || "fa-regular fa-folder"}"></i>
                <span class="list-name-text" id="list-text-${list.id}">${escapeHtml(list.name)}</span>
            </span>
            <div class="list-actions">
                <button class="list-action-btn rename" title="重命名"><i class="fa-regular fa-pen-to-square"></i></button>
                <button class="list-action-btn delete" title="删除列表"><i class="fa-regular fa-trash-can"></i></button>
            </div>
            <span class="badge" id="badge-custom-${list.id}">0</span>
        `;

    div.addEventListener("click", (e) => {
      if (
        e.target.closest(".list-action-btn") ||
        e.target.closest(".list-edit-input")
      )
        return;
      document
        .querySelectorAll(".nav-item, .custom-list-item")
        .forEach((el) => el.classList.remove("active"));
      div.classList.add("active");
      currentRoute = { type: "custom", id: list.id };
      currentCategoryTitle.textContent = list.name;
      renderApp();
    });

    div
      .querySelector(".rename")
      .addEventListener("click", () => startRenameList(list.id));
    div
      .querySelector(".delete")
      .addEventListener("click", () => deleteCustomList(list.id));

    customListsContainer.appendChild(div);
  });
  updateBadges();
}

document
  .getElementById("create-list-btn")
  .addEventListener("click", async () => {
    // 🔐 登录守卫拦截
    if (!checkAuthGuard()) return;

    const name = prompt("请输入新建文件夹/标签列表名称:");
    if (!name || !name.trim()) return;

    const listId = "list_" + Date.now();
    const newList = {
      id: listId,
      name: name.trim(),
      icon: "fa-regular fa-folder",
      created_at: new Date().toISOString(),
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/todo_lists`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(newList),
      });
      if (!res.ok) throw new Error("创建分类失败");

      currentRoute = { type: "custom", id: listId };
      currentCategoryTitle.textContent = newList.name;

      await fetchAndRenderAll();
    } catch (error) {
      alert(error.message);
    }
  });

function startRenameList(id) {
  // 🔐 登录守卫拦截
  if (!checkAuthGuard()) return;

  const textSpan = document.getElementById(`list-text-${id}`);
  const currentName = textSpan.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "list-edit-input";
  input.value = currentName;

  const parent = textSpan.parentElement;
  parent.replaceChild(input, textSpan);
  input.focus();

  const saveRename = async () => {
    const nextName = input.value.trim();
    if (nextName && nextName !== currentName) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/todo_lists?id=eq.${id}`,
          {
            method: "PATCH",
            headers: headers,
            body: JSON.stringify({ name: nextName }),
          },
        );
        if (!res.ok) throw new Error("修改分类名称失败");
        if (currentRoute.type === "custom" && currentRoute.id === id) {
          currentCategoryTitle.textContent = nextName;
        }
      } catch (error) {
        alert(error.message);
      }
    }
    await fetchAndRenderAll();
  };

  input.addEventListener("blur", saveRename);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") saveRename();
  });
}

async function deleteCustomList(id) {
  // 🔐 1. 登录守卫拦截
  if (!checkAuthGuard()) return;

  // ❓ 2. 确认删除弹窗
  if (
    !confirm(
      "确定要在云端删除该标签文件夹吗？其中关联的任务也会在数据库中同步清除。",
    )
  )
    return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/todos?category=eq.${id}`, {
      method: "DELETE",
      headers: headers,
    });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/todo_lists?id=eq.${id}`, {
      method: "DELETE",
      headers: headers,
    });
    if (!res.ok) throw new Error("删除分类失败");

    currentRoute = { type: "system", id: "today" };
    currentCategoryTitle.textContent = "我的一天";

    await fetchAndRenderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderApp() {
  todoList.innerHTML = "";

  const sortedTodos = [...todos].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime() || 0;
    const timeB = new Date(b.created_at).getTime() || 0;
    return timeB - timeA;
  });

  const todayDateStr = new Date().toLocaleDateString();
  let needToMigrateTasks = [];

  let filteredTodos = sortedTodos.filter((todo) => {
    // 跨天流转：只有已登录状态下才自动执行数据库流转迁移，避免只读状态冲突
    if (todo.category === "today" && !todo.is_completed) {
      const todoTime = new Date(todo.created_at).getTime() || Date.now();
      const taskDateStr = new Date(todoTime).toLocaleDateString();
      if (taskDateStr !== todayDateStr) {
        todo.category = "all_tasks";
        if (isLoggedIn) needToMigrateTasks.push(todo.id);
      }
    }

    if (currentRoute.type === "system") {
      if (currentRoute.id === "today" && todo.category !== "today")
        return false;
      if (currentRoute.id === "all_tasks") return true;
    } else {
      if (String(todo.category) !== String(currentRoute.id)) return false;
    }

    if (currentFilter === "pending") return !todo.is_completed;
    if (currentFilter === "completed") return todo.is_completed;
    return true;
  });

  if (needToMigrateTasks.length > 0 && isLoggedIn) {
    needToMigrateTasks.forEach(async (tid) => {
      await fetch(`${SUPABASE_URL}/rest/v1/todos?id=eq.${tid}`, {
        method: "PATCH",
        headers: headers,
        body: JSON.stringify({ category: "all_tasks" }),
      });
    });
  }

  if (filteredTodos.length === 0) {
    todoList.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:60px 0;">暂无相关事务</div>`;
    updateBadges();
    return;
  }

  filteredTodos.forEach((todo) => {
    const li = document.createElement("li");
    li.className = `todo-item todo-item-card ${todo.is_completed ? "completed" : ""}`;

    li.innerHTML = `
            <div class="item-left">
                <input type="checkbox" class="todo-check" ${todo.is_completed ? "checked" : ""}>
                <div class="todo-content-wrapper">
                    <span class="todo-title todo-text">${escapeHtml(todo.title)}</span>
                    <span class="todo-meta todo-date-tag"><i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${todo.date_tag || "刚刚"}</span>
                </div>
            </div>
            <button class="delete-btn" title="删除任务"><i class="fa-regular fa-trash-can"></i></button>
        `;

    const checkbox = li.querySelector(".todo-check");
    const deleteBtn = li.querySelector(".delete-btn");
    const titleSpan = li.querySelector(".todo-title");

    checkbox.addEventListener("change", async () => {
      // 🔐 登录守卫拦截状态流转切换
      if (!checkAuthGuard()) {
        checkbox.checked = todo.is_completed; // 还原复选框状态
        return;
      }

      const nextStatus = !todo.is_completed;
      if (nextStatus) {
        playSuccessSound();
        triggerParticleEffect(checkbox);
      }

      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/todos?id=eq.${todo.id}`,
          {
            method: "PATCH",
            headers: headers,
            body: JSON.stringify({ is_completed: nextStatus }),
          },
        );
        if (!res.ok) throw new Error("更新任务状态失败");
        setTimeout(fetchAndRenderAll, 220);
      } catch (error) {
        alert(error.message);
      }
    });

    deleteBtn.addEventListener("click", async () => {
      // 🔐 1. 登录守卫拦截
      if (!checkAuthGuard()) return;

      // ❓ 2. 确认删除弹窗
      if (!confirm("确定要删除这条待办任务吗？此操作不可撤销。")) return;

      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/todos?id=eq.${todo.id}`,
          {
            method: "DELETE",
            headers: headers,
          },
        );
        if (!res.ok) throw new Error("数据库删除任务失败");
        await fetchAndRenderAll();
      } catch (err) {
        alert(err.message);
      }
    });

    titleSpan.addEventListener("dblclick", () =>
      startInlineEdit(titleSpan, todo.id),
    );
    todoList.appendChild(li);
  });

  updateBadges();
}

todoForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 🔐 登录守卫拦截
  if (!checkAuthGuard()) return;

  const title = todoInput.value.trim();
  if (!title) return;

  let targetCategory = currentRoute.id;
  if (targetCategory === "all_tasks") {
    targetCategory = "today";
  }

  const timestamp = Date.now();
  const newTodo = {
    id: "task_" + timestamp + "_" + Math.random().toString(36).substr(2, 5),
    title: title,
    is_completed: false,
    category: String(targetCategory),
    created_at: new Date().toISOString(),
    date_tag: getFormatedDateTag(),
  };

  todoInput.value = "";

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/todos`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(newTodo),
    });
    if (!res.ok) throw new Error("向云端添加任务失败");

    await fetchAndRenderAll();
    document.querySelector(".todo-list-scroller").scrollTop = 0;
  } catch (err) {
    alert(err.message);
  }
});

function startInlineEdit(spanElement, id) {
  // 🔐 登录守卫拦截
  if (!checkAuthGuard()) return;

  const currentText = spanElement.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-edit-input";
  input.value = currentText;

  const parent = spanElement.parentElement;
  parent.replaceChild(input, spanElement);
  input.focus();

  const saveEdit = async () => {
    const nextText = input.value.trim();
    if (nextText && nextText !== currentText) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/todos?id=eq.${id}`, {
          method: "PATCH",
          headers: headers,
          body: JSON.stringify({ title: nextText }),
        });
        if (!res.ok) throw new Error("更新任务文本失败");
      } catch (error) {
        alert(error.message);
      }
    }
    await fetchAndRenderAll();
  };
  input.addEventListener("blur", saveEdit);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") saveEdit();
  });
}

// ==========================================================================
// 辅助模块：支撑系统
// ==========================================================================
function setupSystemRoutes() {
  document.querySelectorAll(".nav-menu .nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-item, .custom-list-item")
        .forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
      currentRoute = { type: "system", id: item.dataset.id };
      currentCategoryTitle.textContent = item.textContent.trim();
      renderApp();
    });
  });
}

function setupFilters() {
  document.querySelectorAll(".filter-controls .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".filter-controls .filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderApp();
    });
  });
}

function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeToggleBtn.querySelector("i").className =
    savedTheme === "dark" ? "fa-solid fa-sun" : "fa-regular fa-moon";

  themeToggleBtn.addEventListener("click", () => {
    const curr = document.documentElement.getAttribute("data-theme");
    const next = curr === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    themeToggleBtn.querySelector("i").className =
      next === "dark" ? "fa-solid fa-sun" : "fa-regular fa-moon";
  });
}

function getFormatedDateTag() {
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日`;
}

function playSuccessSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.warn(e);
  }
}

function triggerParticleEffect(element) {
  const rect = element.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? ["#ffffff", "#aaaaaa", "#00b894"]
      : ["#111111", "#aaaaaa", "#2ed573"];

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
      decay: Math.random() * 0.03 + 0.02,
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach((p) => {
      if (p.alpha > 0) {
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (alive) requestAnimationFrame(animate);
    else canvas.remove();
  }
  animate();
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (s) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[s],
  );
}
