(() => {
  "use strict";

  // ================= Адрес сервера =================
  // На GitHub Pages сервера нет — подключаемся к адресу из config.js,
  // иначе — к тому же серверу, с которого открыт сайт.
  const custom = (window.DIAMOND_SERVER || "").trim();
  const onPages = location.hostname.endsWith("github.io");
  const WS_URL = custom && onPages ? custom
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const HTTP_BASE = WS_URL.replace(/^ws/, "http").replace(/\/ws$/, "");
  const PAGE_URL = location.origin + location.pathname;
  const LOCALE = window.DIAMOND_LOCALE || "ru-RU";

  // ================= Состояние =================
  const S = {
    token: load("diamond_token"),
    me: null, isAdmin: false,
    chats: new Map(),        // id -> chat
    msgs: new Map(),         // chatId -> [msg]
    more: new Map(),         // chatId -> bool
    unread: new Map(),       // chatId -> n
    active: null,            // текущий chatId
    typing: new Map(),       // chatId -> Map(name -> timer)
    attach: null,            // прикреплённый файл (File)
    authMode: "login",
    searching: false,
  };

  // ================= Утилиты =================
  const $ = (id) => document.getElementById(id);
  function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function save(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function colorFor(s) {
    let x = 0;
    for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360;
    return `linear-gradient(135deg, hsl(${x} 65% 55%), hsl(${(x + 40) % 360} 60% 42%))`;
  }
  function avatar(name, opts = {}) {
    const el = h("div", { class: "avatar" + (opts.size ? " " + opts.size : "") + (opts.online ? " online" : "") });
    el.style.background = colorFor(opts.seed || name);
    el.textContent = opts.icon || (String(name || "?").trim()[0] || "?");
    if (opts.img) fileUrl({ id: opts.img }).then((u) => {
      el.style.background = `center / cover no-repeat url("${u}")`;
      el.textContent = "";
    }).catch(() => {});
    return el;
  }
  function userAvatar(u, size, noOnline) {
    return avatar(u.display, { size, seed: u.username, online: !noOnline && u.online, img: u.avatar });
  }
  function chatIcon(c) {
    if (c.type === "dm") return null;
    return c.type === "channel" ? "📢" : null;
  }
  function chatAvatar(c, size) {
    if (c.type === "dm" && c.peer) return userAvatar(c.peer, size);
    return avatar(c.title, { size, seed: "c" + c.id, icon: chatIcon(c) });
  }
  function badgeEl(b) { return b ? h("span", { class: "badge" }, b) : null; }

  function fmtTime(ts) {
    const d = new Date(ts * 1000), now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
  }
  function hm(ts) { return new Date(ts * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }); }
  function dayLabel(ts) {
    const d = new Date(ts * 1000), now = new Date();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Сегодня";
    if (d.toDateString() === y.toDateString()) return "Вчера";
    return d.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }
  function fmtSize(n) {
    if (n < 1024) return n + " Б";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " КБ";
    return (n / 1024 / 1024).toFixed(1) + " МБ";
  }
  function plural(n, a, b, c) {
    const m10 = n % 10, m100 = n % 100;
    return n + " " + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c);
  }
  function linkify(container, text) {
    for (const p of text.split(/(https?:\/\/[^\s]+)/g)) {
      if (/^https?:\/\//.test(p)) container.appendChild(h("a", { href: p, target: "_blank", rel: "noopener noreferrer" }, p));
      else if (p) container.appendChild(document.createTextNode(p));
    }
  }
  function toast(text, err) {
    if (!text) return;
    const t = h("div", { class: "toast" + (err ? " err" : "") }, text);
    $("toasts").appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Скопировано"); }
    catch { prompt("Скопируйте:", text); }
  }
  function preview(m) {
    if (!m) return "";
    if (m.gift) return "🎁 " + m.gift.emoji + " " + m.gift.name;
    const t = m.text || (m.file ? (m.file.mime.startsWith("image/") ? "🖼 Фото" : "📎 " + m.file.name) : "");
    return t.replace(/\s+/g, " ");
  }

  // ================= WebSocket =================
  let ws = null, ridSeq = 0, retry = 0, authed = false;
  const pending = new Map();

  function connect() {
    setConn(false);
    ws = new WebSocket(WS_URL);
    ws.onopen = async () => {
      retry = 0;
      setConn(true);
      if (S.token) {
        try { onAuth(await call("auth", { token: S.token })); }
        catch (e) { save("diamond_token", null); S.token = null; showAuth(); if (authed) toast(e.message, true); }
      } else showAuth();
    };
    ws.onmessage = (e) => {
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.rid && pending.has(d.rid)) {
        const p = pending.get(d.rid); pending.delete(d.rid);
        if (d.type === "error") p.rej(new Error(d.text));
        // пустой «ok» на запрос, который должен вернуть данные = на сервере старый server.py
        else if (d.type === "ok" && !OK_REPLIES.has(p.type)) p.rej(new Error("Сервер устарел: обновите server.py и перезапустите сервер"));
        else p.res(d);
        return;
      }
      onEvent(d);
    };
    ws.onclose = () => {
      setConn(false);
      for (const p of pending.values()) p.rej(new Error("Нет связи с сервером"));
      pending.clear();
      setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000));
    };
  }
  const OK_REPLIES = new Set(["send", "delete_msg", "typing", "logout"]);
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function call(type, data = {}) {
    return new Promise((res, rej) => {
      if (!ws || ws.readyState !== 1) return rej(new Error("Нет связи с сервером"));
      const rid = ++ridSeq;
      pending.set(rid, { res, rej, type });
      ws.send(JSON.stringify({ type, ...data, rid }));
      setTimeout(() => { if (pending.has(rid)) { pending.delete(rid); rej(new Error("Сервер не ответил")); } }, 20000);
    });
  }
  function setConn(ok) {
    $("connBar").classList.toggle("hidden", ok);
    $("authConn").textContent = ok ? "" : "Подключение к серверу…";
  }

  // ================= События сервера =================
  function onEvent(d) {
    switch (d.type) {
      case "msg": onMessage(d.message); break;
      case "msg_deleted": {
        const arr = S.msgs.get(d.chat_id);
        if (arr) S.msgs.set(d.chat_id, arr.filter((m) => m.id !== d.msg_id));
        const c = S.chats.get(d.chat_id);
        if (c && c.last && c.last.id === d.msg_id) { const a = S.msgs.get(d.chat_id); c.last = a && a.length ? a[a.length - 1] : null; }
        if (d.chat_id === S.active) renderMessages(true);
        renderList();
        break;
      }
      case "chat_new": case "chat_update": upsertChat(d.chat); if (d.chat.id === S.active) renderHeader(); break;
      case "chat_removed": removeChat(d.chat_id); break;
      case "typing": onTyping(d); break;
      case "presence": onPresence(d); break;
      case "user_update": onUserUpdate(d.user); break;
      case "balance":
        if (S.me) { S.me.diamonds = d.diamonds; S.me.daily_next = d.daily_next; renderMe(); }
        document.querySelectorAll(".my-balance").forEach((el) => { el.textContent = "💎 " + d.diamonds; });
        break;
      case "banned":
        save("diamond_token", null); S.token = null;
        alert("Ваш аккаунт заблокирован: " + (d.reason || "без причины"));
        location.reload();
        break;
      case "toast": toast(d.text); break;
      case "error": toast(d.text, true); break;
    }
  }

  async function onMessage(m) {
    let c = S.chats.get(m.chat_id);
    if (!c) {
      try { const r = await call("get_chat", { chat_id: m.chat_id }); c = upsertChat(r.chat); } catch { return; }
    }
    c.last = m;
    const arr = S.msgs.get(m.chat_id);
    if (arr && !arr.some((x) => x.id === m.id)) arr.push(m);
    const t = S.typing.get(m.chat_id);
    if (t && t.has(m.user.display)) { clearTimeout(t.get(m.user.display)); t.delete(m.user.display); }
    if (m.chat_id === S.active && !document.hidden) {
      const box = $("messages");
      const near = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
      renderMessages(false);
      if (near || m.user.id === S.me.id) scrollDown();
      renderHeader();
    } else if (m.user.id !== S.me.id) {
      S.unread.set(m.chat_id, (S.unread.get(m.chat_id) || 0) + 1);
      if (m.chat_id === S.active) renderMessages(false);
    }
    renderList();
    updateTitle();
  }

  function onTyping(d) {
    if (!S.typing.has(d.chat_id)) S.typing.set(d.chat_id, new Map());
    const t = S.typing.get(d.chat_id);
    clearTimeout(t.get(d.name));
    t.set(d.name, setTimeout(() => { t.delete(d.name); if (d.chat_id === S.active) renderHeader(); renderList(); }, 3500));
    if (d.chat_id === S.active) renderHeader();
    renderList();
  }

  function onPresence(d) {
    for (const c of S.chats.values()) if (c.peer && c.peer.id === d.user_id) c.peer.online = d.online;
    renderList();
    if (S.active) renderHeader();
  }

  // кто-то сменил имя или фото — обновляем везде
  function onUserUpdate(u) {
    const patch = (x) => x && x.id === u.id ? Object.assign(x, { display: u.display, avatar: u.avatar, badge: u.badge }) : x;
    if (S.me && S.me.id === u.id) { patch(S.me); renderMe(); }
    for (const c of S.chats.values()) {
      if (c.peer && c.peer.id === u.id) { patch(c.peer); c.title = u.display; }
      if (c.last) patch(c.last.user);
    }
    for (const arr of S.msgs.values()) for (const m of arr) patch(m.user);
    renderList();
    if (S.active) { renderHeader(); renderMessages(false); }
  }

  function renderMe() {
    const el = userAvatar(S.me, null, true); el.id = "meAvatar";
    $("meAvatar").replaceWith(el);
    $("meName").replaceChildren(S.me.display, badgeEl(S.me.badge) || "");
    $("meUser").textContent = "@" + S.me.username + (S.me.diamonds != null ? "  ·  💎 " + S.me.diamonds : "");
  }

  function upsertChat(c) {
    const old = S.chats.get(c.id);
    if (old && !c.last && old.last) c.last = old.last;
    S.chats.set(c.id, c);
    renderList();
    return c;
  }
  function removeChat(id) {
    S.chats.delete(id); S.msgs.delete(id); S.unread.delete(id);
    if (S.active === id) closeChat();
    renderList();
  }

  // ================= Вход =================
  function showAuth() {
    authed = false;
    $("app").classList.add("hidden");
    $("auth").classList.remove("hidden");
  }
  function setAuthMode(mode) {
    S.authMode = mode;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === mode));
    $("fDisplay").classList.toggle("hidden", mode !== "register");
    $("authBtn").textContent = mode === "register" ? "Создать аккаунт" : "Войти";
    $("fPass").autocomplete = mode === "register" ? "new-password" : "current-password";
    $("authError").textContent = "";
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setAuthMode(t.dataset.tab)));
  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = { username: $("fUser").value.trim(), password: $("fPass").value };
    if (S.authMode === "register") data.display = $("fDisplay").value.trim();
    $("authBtn").disabled = true;
    try { onAuth(await call(S.authMode, data)); $("fPass").value = ""; }
    catch (err) { $("authError").textContent = err.message; }
    finally { $("authBtn").disabled = false; }
  });

  function onAuth(d) {
    authed = true;
    S.token = d.token; save("diamond_token", d.token);
    S.me = d.me; S.isAdmin = d.is_admin;
    const prevActive = S.active;
    S.chats.clear();
    for (const c of d.chats) S.chats.set(c.id, c);
    $("auth").classList.add("hidden");
    $("app").classList.remove("hidden");
    renderMe();
    $("adminMenuBtn").classList.toggle("hidden", !S.isAdmin);
    renderList();
    if (prevActive && (S.chats.has(prevActive))) openChat(prevActive);
    handleHash();
  }

  function handleHash() {
    const m = location.hash.match(/^#(invite|join)=([\w-]+)$/);
    if (!m) return;
    history.replaceState(null, "", location.pathname);
    call("join", m[1] === "invite" ? { invite: m[2] } : { handle: m[2] })
      .then((r) => { upsertChat(r.chat); openChat(r.chat.id); toast("Вы вступили в «" + r.chat.title + "»"); })
      .catch((e) => toast(e.message, true));
  }
  window.addEventListener("hashchange", () => { if (authed) handleHash(); });

  // ================= Список чатов =================
  function sortedChats() {
    return [...S.chats.values()].filter((c) => !c.preview).sort((a, b) => (b.last ? b.last.ts : b.created) - (a.last ? a.last.ts : a.created));
  }
  function chatItem(c, onclick) {
    const typing = S.typing.get(c.id);
    const typers = typing ? [...typing.keys()] : [];
    let last;
    if (typers.length) last = h("span", { style: "color:var(--accent)" }, "печатает…");
    else if (c.last) {
      const who = c.type === "group" ? (c.last.user.id === S.me.id ? "Вы: " : c.last.user.display + ": ") : (c.type === "dm" && c.last.user.id === S.me.id ? "Вы: " : "");
      last = [who ? h("span", { style: "color:var(--text)" }, who) : null, h("span", { class: "mtext" }, preview(c.last))];
    } else last = c.role ? "Нет сообщений" : (c.type === "channel" ? "Канал" : "Группа") + " · " + plural(c.members, "участник", "участника", "участников");
    const unread = S.unread.get(c.id);
    const icon = c.type === "channel" ? "📢 " : c.type === "group" ? "👥 " : "";
    const title = c.type === "dm" && c.peer ? [c.title, badgeEl(c.peer.badge)] : [icon, c.title];
    return h("div", { class: "item" + (c.id === S.active ? " active" : ""), onclick: onclick || (() => openChat(c.id)) },
      chatAvatar(c),
      h("div", { class: "item-body" },
        h("div", { class: "item-row" }, h("div", { class: "item-title" }, title), h("div", { class: "item-time" }, c.last ? fmtTime(c.last.ts) : "")),
        h("div", { class: "item-row" }, h("div", { class: "item-last" }, last), unread ? h("div", { class: "unread" }, unread > 99 ? "99+" : unread) : null)));
  }
  function renderList() {
    const list = $("chatList");
    const items = sortedChats().map((c) => chatItem(c));
    list.replaceChildren(...(items.length ? items : [h("div", { class: "empty-note" }, "Пока нет чатов. Найдите кого-нибудь через поиск или создайте группу.")]));
  }
  function updateTitle() {
    let n = 0; for (const v of S.unread.values()) n += v;
    document.title = (n ? `(${n}) ` : "") + "Diamond Messenger";
  }

  // ================= Поиск =================
  let searchTimer = null;
  $("search").addEventListener("input", () => {
    const q = $("search").value.trim();
    $("searchClear").classList.toggle("hidden", !q);
    clearTimeout(searchTimer);
    if (!q) return endSearch();
    searchTimer = setTimeout(() => doSearch(q), 250);
  });
  $("search").addEventListener("keydown", (e) => { if (e.key === "Escape") endSearch(); });
  $("searchClear").addEventListener("click", endSearch);
  function endSearch() {
    $("search").value = ""; $("searchClear").classList.add("hidden");
    $("searchResults").classList.add("hidden"); $("chatList").classList.remove("hidden");
  }
  async function doSearch(q) {
    let r; try { r = await call("search", { q }); } catch (e) { return toast(e.message, true); }
    if ($("search").value.trim().replace(/^@/, "").toLowerCase() !== r.q) return;
    const box = $("searchResults");
    const out = [];
    const mine = sortedChats().filter((c) => c.title.toLowerCase().includes(r.q));
    if (mine.length) { out.push(h("div", { class: "section" }, "Ваши чаты")); mine.forEach((c) => out.push(chatItem(c, () => { endSearch(); openChat(c.id); }))); }
    if (r.users.length) {
      out.push(h("div", { class: "section" }, "Люди"));
      for (const u of r.users) out.push(h("div", { class: "item", onclick: () => startDM(u.id) },
        userAvatar(u),
        h("div", { class: "item-body" }, h("div", { class: "item-title" }, u.display, badgeEl(u.badge)), h("div", { class: "item-last" }, "@" + u.username))));
    }
    const pub = r.chats.filter((c) => !mine.some((m) => m.id === c.id));
    if (pub.length) {
      out.push(h("div", { class: "section" }, "Группы и каналы"));
      for (const c of pub) out.push(chatItem({ ...c, last: null }, () => { endSearch(); previewChat(c); }));
    }
    if (!out.length) out.push(h("div", { class: "empty-note" }, "Ничего не найдено"));
    box.replaceChildren(...out);
    box.classList.remove("hidden"); $("chatList").classList.add("hidden");
  }
  async function startDM(userId) {
    try { const r = await call("dm", { user_id: userId }); upsertChat(r.chat); endSearch(); openChat(r.chat.id); }
    catch (e) { toast(e.message, true); }
  }
  function previewChat(c) {
    if (!S.chats.has(c.id)) S.chats.set(c.id, { ...c, preview: true });
    openChat(c.id);
  }

  // ================= Открытие чата =================
  async function openChat(id) {
    const c = S.chats.get(id);
    if (!c) return;
    S.active = id;
    S.unread.delete(id); updateTitle();
    clearAttach();
    $("empty").classList.add("hidden");
    $("chatInner").classList.remove("hidden");
    $("app").classList.add("chat-open");
    $("info").classList.add("hidden");
    renderHeader(); renderList();
    $("messages").replaceChildren(h("div", { class: "load-more" }, "Загрузка…"));
    try {
      const r = await call("open", { chat_id: id });
      if (S.active !== id) return;
      const was = S.chats.get(id);
      const chat = { ...r.chat, preview: !r.chat.role };
      if (!chat.last && was && was.last) chat.last = was.last;
      S.chats.set(id, chat);
      if (chat.preview && !was?.preview) S.chats.set(id, chat);
      S.msgs.set(id, r.messages);
      S.more.set(id, r.more);
      renderHeader(); renderMessages(true); scrollDown();
      if (!chat.preview) renderList();
    } catch (e) { toast(e.message, true); }
    if (matchMedia("(min-width: 761px)").matches) $("msgInput").focus();
  }
  function closeChat() {
    if (S.active) { const c = S.chats.get(S.active); if (c && c.preview) S.chats.delete(S.active); }
    S.active = null;
    $("chatInner").classList.add("hidden");
    $("empty").classList.remove("hidden");
    $("app").classList.remove("chat-open");
    $("info").classList.add("hidden");
    renderList();
  }
  $("backBtn").addEventListener("click", closeChat);

  function renderHeader() {
    const c = S.chats.get(S.active);
    if (!c) return;
    $("chatAvatar").replaceChildren(chatAvatar(c, "sm"));
    $("chatTitle").replaceChildren(c.type === "channel" ? "📢 " : "", c.title, c.type === "dm" && c.peer ? badgeEl(c.peer.badge) || "" : "");
    const t = S.typing.get(c.id);
    const typers = t ? [...t.keys()] : [];
    const sub = $("chatSub");
    sub.classList.toggle("accent", typers.length > 0);
    if (typers.length) sub.textContent = typers.length === 1 ? (c.type === "dm" ? "печатает…" : typers[0] + " печатает…") : typers.join(", ") + " печатают…";
    else if (c.type === "dm") { sub.textContent = c.peer ? (c.peer.online ? "в сети" : "@" + c.peer.username) : ""; sub.classList.toggle("accent", !!(c.peer && c.peer.online)); }
    else sub.textContent = (c.type === "channel" ? plural(c.members, "подписчик", "подписчика", "подписчиков") : plural(c.members, "участник", "участника", "участников")) + (c.handle ? " · @" + c.handle : "");

    // нижняя панель: поле ввода / вступить / только чтение
    const canPost = c.role && (c.type !== "channel" || c.role === "owner" || c.role === "admin");
    $("composer").classList.toggle("hidden", !canPost);
    const bar = $("bottomBar");
    bar.classList.toggle("hidden", !!canPost);
    if (!c.role) bar.replaceChildren(h("button", { class: "btn", onclick: () => joinChat(c) }, c.type === "channel" ? "Подписаться" : "Вступить в группу"));
    else if (!canPost) bar.replaceChildren(h("span", { class: "muted" }, "Вы подписаны на канал"));
    if (!$("info").classList.contains("hidden")) renderInfo();
  }
  async function joinChat(c) {
    try {
      const r = await call("join", { chat_id: c.id });
      S.chats.set(r.chat.id, r.chat);
      toast(c.type === "channel" ? "Вы подписались" : "Вы вступили в группу");
      openChat(r.chat.id);
    } catch (e) { toast(e.message, true); }
  }

  // ================= Сообщения =================
  function scrollDown() { const b = $("messages"); b.scrollTop = b.scrollHeight; }
  function canDelete(c, m) {
    return m.user.id === S.me.id || S.isAdmin || c.role === "owner" || c.role === "admin";
  }
  function renderMessages(full) {
    const c = S.chats.get(S.active);
    const box = $("messages");
    const arr = S.msgs.get(S.active) || [];
    const nodes = [];
    if (S.more.get(S.active)) nodes.push(h("div", { class: "load-more" }, "↑ Прокрутите вверх для старых сообщений"));
    if (!arr.length) nodes.push(h("div", { class: "empty-note" }, c.type === "channel" ? "В канале пока нет публикаций" : "Сообщений пока нет. Напишите первым!"));
    let prev = null, prevDay = null;
    for (const m of arr) {
      const day = new Date(m.ts * 1000).toDateString();
      if (day !== prevDay) { nodes.push(h("div", { class: "day" }, dayLabel(m.ts))); prev = null; prevDay = day; }
      nodes.push(msgEl(c, m, prev));
      prev = m;
    }
    box.replaceChildren(...nodes);
  }
  function msgEl(c, m, prev) {
    const mine = m.user.id === S.me.id;
    const isChannel = c.type === "channel";
    const cont = !isChannel && prev && prev.user.id === m.user.id && m.ts - prev.ts < 300;
    const cls = "msg" + (isChannel ? " channel-post" : mine ? " mine" : "") + (cont ? " cont" : "");
    const bubble = h("div", { class: "bubble" });
    if (isChannel) bubble.appendChild(h("div", { class: "sender", style: "color:var(--accent)" }, c.title));
    else if (c.type === "group" && !mine && !cont)
      bubble.appendChild(h("div", { class: "sender" }, h("span", { style: `background:${colorFor(m.user.username)};-webkit-background-clip:text;background-clip:text;color:transparent` }, m.user.display), badgeEl(m.user.badge)));
    if (m.gift) {
      bubble.classList.add("gift-bubble");
      bubble.appendChild(h("div", { class: "gift-card" },
        h("div", { class: "gift-emoji" }, m.gift.emoji),
        h("div", { class: "gift-label" }, mine ? "Вы подарили" : "Вам подарок"),
        h("div", { class: "gift-name" }, m.gift.name),
        m.gift.note ? h("div", { class: "gift-note mtext" }, "«" + m.gift.note + "»") : null,
        h("div", { class: "gift-price" }, "💎 " + m.gift.price)));
    }
    if (m.file) bubble.appendChild(fileEl(m.file));
    if (m.text) { const t = h("span", { class: "mtext" }); linkify(t, m.text); bubble.appendChild(t); }
    bubble.appendChild(h("span", { class: "btime" }, hm(m.ts)));
    const showAvatar = c.type === "group" && !mine;
    return h("div", { class: cls, "data-id": m.id },
      showAvatar ? userAvatar(m.user, null, true) : null,
      bubble,
      canDelete(c, m) ? h("button", { class: "del-btn", title: "Удалить", onclick: () => deleteMsg(m) }, "🗑") : null);
  }
  async function deleteMsg(m) {
    if (!confirm("Удалить сообщение для всех?")) return;
    try { await call("delete_msg", { msg_id: m.id }); } catch (e) { toast(e.message, true); }
  }

  // подгрузка старых сообщений
  let loadingMore = false;
  $("messages").addEventListener("scroll", async () => {
    const box = $("messages"), id = S.active;
    if (box.scrollTop > 80 || loadingMore || !S.more.get(id)) return;
    const arr = S.msgs.get(id);
    if (!arr || !arr.length) return;
    loadingMore = true;
    try {
      const r = await call("open", { chat_id: id, before: arr[0].id });
      if (S.active !== id) return;
      const oldH = box.scrollHeight;
      S.msgs.set(id, [...r.messages, ...arr]);
      S.more.set(id, r.more);
      renderMessages(true);
      box.scrollTop = box.scrollHeight - oldH;
    } catch {} finally { loadingMore = false; }
  });

  // ================= Файлы =================
  const blobCache = new Map();
  function authHeaders() { return { Authorization: "Bearer " + S.token, "ngrok-skip-browser-warning": "1" }; }
  async function fileUrl(f) {
    if (blobCache.has(f.id)) return blobCache.get(f.id);
    const p = fetch(`${HTTP_BASE}/file/${f.id}`, { headers: authHeaders() })
      .then((r) => { if (!r.ok) throw new Error("Файл недоступен"); return r.blob(); })
      .then((b) => URL.createObjectURL(b));
    blobCache.set(f.id, p);
    p.catch(() => blobCache.delete(f.id));
    return p;
  }
  function fileEl(f) {
    if (f.mime.startsWith("image/")) {
      const img = h("img", { class: "msg-img", alt: f.name });
      fileUrl(f).then((u) => { img.src = u; }).catch(() => { img.alt = "⚠ не удалось загрузить фото"; });
      img.addEventListener("click", () => { if (img.src) openImage(img.src); });
      return img;
    }
    return h("div", { class: "file-card", title: "Скачать", onclick: () => downloadFile(f) },
      h("div", { class: "file-ico" }, "📄"),
      h("div", null, h("div", { class: "file-name" }, f.name), h("div", { class: "small", style: "opacity:.7" }, fmtSize(f.size))));
  }
  async function downloadFile(f) {
    try {
      const u = await fileUrl(f);
      const a = h("a", { href: u, download: f.name }); document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast(e.message, true); }
  }
  function openImage(src) {
    const v = h("div", { class: "img-view", onclick: () => v.remove() }, h("img", { src }));
    document.body.appendChild(v);
  }
  $("fileInput").addEventListener("change", () => {
    const f = $("fileInput").files[0];
    $("fileInput").value = "";
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast("Файл больше 20 МБ", true);
    S.attach = f;
    $("attachPreview").replaceChildren(
      h("span", null, f.type.startsWith("image/") ? "🖼" : "📎"),
      h("span", { class: "name" }, f.name + " · " + fmtSize(f.size)),
      h("button", { class: "icon-btn small", type: "button", onclick: clearAttach }, "✕"));
    $("attachPreview").classList.remove("hidden");
    $("msgInput").focus();
  });
  function clearAttach() { S.attach = null; $("attachPreview").classList.add("hidden"); }
  async function uploadFile(f) {
    const fd = new FormData(); fd.append("file", f, f.name);
    const r = await fetch(`${HTTP_BASE}/upload`, { method: "POST", headers: authHeaders(), body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Не удалось загрузить файл");
    return j;
  }

  // ================= Отправка =================
  let sending = false;
  async function sendMessage() {
    const text = $("msgInput").value.trim();
    const chatId = S.active;
    if ((!text && !S.attach) || !chatId || sending) return;
    sending = true;
    try {
      let file_id = null;
      if (S.attach) {
        $("attachPreview").querySelector(".name").textContent = "Загрузка…";
        file_id = (await uploadFile(S.attach)).id;
        clearAttach();
      }
      send({ type: "send", chat_id: chatId, text, file_id });
      $("msgInput").value = ""; autoresize();
    } catch (e) { toast(e.message, true); if (S.attach) $("attachPreview").querySelector(".name").textContent = S.attach.name; }
    finally { sending = false; }
  }
  $("composer").addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });
  let lastTyping = 0;
  $("msgInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
  });
  $("msgInput").addEventListener("input", () => {
    autoresize();
    if (Date.now() - lastTyping > 2000 && S.active) { lastTyping = Date.now(); send({ type: "typing", chat_id: S.active }); }
  });
  $("msgInput").addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f) { e.preventDefault(); const dt = new DataTransfer(); dt.items.add(f); $("fileInput").files = dt.files; $("fileInput").dispatchEvent(new Event("change")); }
  });
  function autoresize() { const t = $("msgInput"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S.active) { S.unread.delete(S.active); updateTitle(); renderList(); renderMessages(false); }
  });

  // ================= Инфо-панель =================
  $("infoBtn").addEventListener("click", toggleInfo);
  $("chatHeadText").addEventListener("click", toggleInfo);
  function toggleInfo() {
    const info = $("info");
    if (info.classList.contains("hidden")) { info.classList.remove("hidden"); renderInfo(); }
    else info.classList.add("hidden");
  }
  async function renderInfo() {
    const c = S.chats.get(S.active);
    if (!c) return;
    const info = $("info");
    const kind = c.type === "dm" ? "Личный чат" : c.type === "channel" ? (c.is_public ? "Публичный канал" : "Приватный канал") : (c.is_public ? "Публичная группа" : "Приватная группа");
    const blocks = [
      h("div", { class: "info-head" }, h("button", { class: "icon-btn", onclick: () => info.classList.add("hidden") }, "✕"), "Информация"),
      h("div", { class: "info-main" }, chatAvatar(c, "lg"),
        h("div", { class: "info-title" }, c.title, c.type === "dm" && c.peer ? badgeEl(c.peer.badge) : null),
        h("div", { class: "muted small" }, c.type === "dm" && c.peer ? (c.peer.online ? "в сети" : "не в сети") : kind)),
    ];
    let giftsBlock = null;
    if (c.type === "dm" && c.peer) {
      blocks.push(h("div", { class: "info-block" }, h("div", { class: "info-label" }, "Юзернейм"), "@" + c.peer.username));
      giftsBlock = h("div", { class: "info-block" }, h("div", { class: "info-label" }, "🎁 Подарки"), h("div", { class: "muted small" }, "Загрузка…"));
      blocks.push(giftsBlock);
    }
    if (c.description) blocks.push(h("div", { class: "info-block" }, h("div", { class: "info-label" }, "Описание"), c.description));
    if (c.handle) {
      const link = `${PAGE_URL}#join=${c.handle}`;
      blocks.push(h("div", { class: "info-block" }, h("div", { class: "info-label" }, "Публичная ссылка"),
        h("div", { class: "copy-row" }, h("code", null, link), h("button", { class: "mini-btn", onclick: () => copy(link) }, "Копировать"))));
    }
    if (c.invite) {
      const link = `${PAGE_URL}#invite=${c.invite}`;
      blocks.push(h("div", { class: "info-block" }, h("div", { class: "info-label" }, "Ссылка-приглашение"),
        h("div", { class: "copy-row" }, h("code", null, link), h("button", { class: "mini-btn", onclick: () => copy(link) }, "Копировать"))));
    }
    const membersBlock = h("div", { class: "info-block" }, h("div", { class: "info-label" }, c.type === "channel" ? "Подписчики" : "Участники"), h("div", { class: "muted small" }, "Загрузка…"));
    if (c.type !== "dm") blocks.push(membersBlock);

    const actions = h("div", { class: "info-actions" });
    if (c.type === "dm" && c.peer) actions.appendChild(h("button", { class: "btn", onclick: () => giftModal(c.peer) }, "🎁 Подарить подарок"));
    if (c.type === "dm" && c.peer && S.isAdmin && !c.peer.badge) actions.appendChild(h("button", { class: "btn danger", onclick: () => banUser(c.peer.username) }, "🛡️ Забанить пользователя"));
    if (c.role && c.role !== "owner" && c.type !== "dm") actions.appendChild(h("button", { class: "btn ghost", onclick: () => leaveChat(c) }, c.type === "channel" ? "Отписаться" : "Выйти из группы"));
    if (c.role === "owner" || (S.isAdmin && c.type !== "dm") || (c.type === "dm" && c.role))
      actions.appendChild(h("button", { class: "btn danger", onclick: () => deleteChat(c) }, c.type === "dm" ? "Удалить переписку" : c.type === "channel" ? "Удалить канал" : "Удалить группу"));
    if (actions.childNodes.length) blocks.push(actions);
    info.replaceChildren(...blocks);

    if (giftsBlock) { fillGifts(giftsBlock, c.peer.id); return; }
    if (c.type === "dm") return;
    try {
      const r = await call("members", { chat_id: c.id });
      if (r.hidden) { membersBlock.lastChild.textContent = plural(c.members, "подписчик", "подписчика", "подписчиков"); return; }
      const roleName = { owner: "владелец", admin: "админ" };
      membersBlock.replaceChildren(h("div", { class: "info-label" }, (c.type === "channel" ? "Подписчики" : "Участники") + " · " + r.members.length),
        ...r.members.map((u) => {
          const btns = [];
          if (u.id !== S.me.id) {
            btns.push(h("button", { class: "mini-btn", title: "Написать", onclick: () => startDM(u.id) }, "💬"));
            if ((c.role === "owner" || S.isAdmin) && u.role !== "owner")
              btns.push(h("button", { class: "mini-btn", onclick: () => promote(c, u) }, u.role === "admin" ? "Снять админа" : "Сделать админом"));
            if (S.isAdmin && !u.badge) btns.push(h("button", { class: "mini-btn danger", onclick: () => banUser(u.username) }, "Бан"));
          }
          return h("div", { class: "member" }, userAvatar(u, "sm"),
            h("div", { class: "item-body" }, h("div", null, u.display, badgeEl(u.badge)),
              h("div", { class: "muted small" }, "@" + u.username, roleName[u.role] ? h("span", { class: "role" }, " · " + roleName[u.role]) : null)),
            ...btns);
        }));
    } catch (e) { membersBlock.lastChild.textContent = e.message; }
  }
  async function leaveChat(c) {
    if (!confirm(`Покинуть «${c.title}»?`)) return;
    try { const r = await call("leave", { chat_id: c.id }); removeChat(r.chat_id); } catch (e) { toast(e.message, true); }
  }
  async function deleteChat(c) {
    if (!confirm(`Удалить «${c.title}» для всех участников? Это нельзя отменить.`)) return;
    try { const r = await call("delete_chat", { chat_id: c.id }); removeChat(r.chat_id); toast("Удалено"); } catch (e) { toast(e.message, true); }
  }
  async function promote(c, u) {
    try { const r = await call("promote", { chat_id: c.id, user_id: u.id, admin: u.role !== "admin" }); toast(r.text); renderInfo(); }
    catch (e) { toast(e.message, true); }
  }
  function banUser(username) {
    modal("Забанить @" + username, [
      h("input", { id: "mReason", placeholder: "Причина (необязательно)", maxlength: 200 }),
    ], "Забанить", async () => {
      const r = await call("ban", { username, reason: $("mReason").value });
      toast(r.text); if (!$("info").classList.contains("hidden")) renderInfo();
    }, true);
  }

  // ================= Модалки =================
  function modal(title, fields, okText, onOk, danger) {
    const err = h("p", { class: "error" });
    const ok = h("button", { class: "btn" + (danger ? " danger" : ""), type: "submit" }, okText);
    const form = h("form", { style: "display:flex;flex-direction:column;gap:12px" },
      h("h2", null, title), ...fields, err,
      h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", onclick: closeModal }, "Отмена"), ok));
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); ok.disabled = true; err.textContent = "";
      try { await onOk(); closeModal(); } catch (x) { err.textContent = x.message; } finally { ok.disabled = false; }
    });
    $("modal").replaceChildren(form);
    $("modalWrap").classList.remove("hidden");
    const first = form.querySelector("input, textarea"); if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $("modalWrap").classList.add("hidden"); $("modal").classList.remove("wide"); }
  $("modalWrap").addEventListener("mousedown", (e) => { if (e.target === $("modalWrap")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); $("menu").classList.add("hidden"); } });

  function newChatModal(kind) {
    const isCh = kind === "channel";
    const handleRow = h("div", { class: "prefix hidden" }, h("span", null, "@"), h("input", { id: "mHandle", placeholder: "ссылка (латиница, от 4 символов)", maxlength: 32, autocapitalize: "off", spellcheck: "false" }));
    const pubBox = h("input", { type: "checkbox", id: "mPublic", onchange: () => handleRow.classList.toggle("hidden", !$("mPublic").checked) });
    modal(isCh ? "Новый канал" : "Новая группа", [
      h("input", { id: "mTitle", placeholder: isCh ? "Название канала" : "Название группы", maxlength: 60 }),
      h("textarea", { id: "mDesc", placeholder: "Описание (необязательно)", rows: 2, maxlength: 300, style: "resize:none" }),
      h("label", { class: "check" }, pubBox, h("span", null, isCh ? "Публичный канал (его можно найти в поиске)" : "Публичная группа (её можно найти в поиске)")),
      handleRow,
      h("div", { class: "muted small" }, "В приватный " + (isCh ? "канал" : "чат") + " можно попасть только по ссылке-приглашению."),
    ], "Создать", async () => {
      const r = await call("create_chat", { kind, title: $("mTitle").value, description: $("mDesc").value, is_public: $("mPublic").checked, handle: $("mHandle").value });
      upsertChat(r.chat); openChat(r.chat.id);
    });
  }
  function joinLinkModal() {
    modal("Вступить по ссылке", [
      h("input", { id: "mLink", placeholder: "Вставьте ссылку-приглашение или @ссылку" }),
    ], "Вступить", async () => {
      const v = $("mLink").value.trim();
      let m = v.match(/#invite=([\w-]+)/), data;
      if (m) data = { invite: m[1] };
      else if ((m = v.match(/#join=(\w+)/)) || (m = v.match(/^@?(\w{4,32})$/))) data = { handle: m[1] };
      else throw new Error("Не похоже на ссылку");
      const r = await call("join", data);
      upsertChat(r.chat); openChat(r.chat.id);
    });
  }
  function adminModal() {
    modal("🛡️ Админ-панель", [
      h("div", { class: "muted small" }, "Админы задаются в файле admins.txt на сервере, баны хранятся в bans.txt."),
      h("input", { id: "mUser", placeholder: "Юзернейм пользователя", autocapitalize: "off" }),
      h("input", { id: "mReason", placeholder: "Причина бана (необязательно)", maxlength: 200 }),
      h("button", { class: "btn ghost", type: "button", onclick: async () => {
        try { const r = await call("unban", { username: $("mUser").value }); toast(r.text); closeModal(); } catch (e) { toast(e.message, true); }
      } }, "Разбанить"),
      h("div", { class: "info-label", style: "margin-top:8px" }, "💎 Алмазы"),
      h("div", { class: "copy-row" },
        h("input", { id: "mAmount", type: "number", placeholder: "Сколько (можно с минусом)" }),
        h("button", { class: "btn ghost", type: "button", onclick: async () => {
          try { const r = await call("grant", { username: $("mUser").value, amount: parseInt($("mAmount").value, 10) || 0 }); toast(r.text); }
          catch (e) { toast(e.message, true); }
        } }, "Начислить")),
    ], "Забанить", async () => {
      const r = await call("ban", { username: $("mUser").value, reason: $("mReason").value });
      toast(r.text);
    }, true);
  }

  // ================= Все пользователи =================
  async function usersModal() {
    const list = h("div", { class: "users-list" }, h("div", { class: "empty-note" }, "Загрузка…"));
    const stats = h("div", { class: "muted small" });
    const filter = h("input", { placeholder: "Поиск по имени или @юзернейму", autocomplete: "off", spellcheck: "false" });
    const close = h("button", { class: "icon-btn", type: "button", onclick: closeModal }, "✕");
    $("modal").replaceChildren(
      h("div", { class: "users-head" }, h("h2", null, "👤 Все пользователи"), close),
      stats, filter, list);
    $("modal").classList.add("wide");
    $("modalWrap").classList.remove("hidden");

    let data;
    const render = () => {
      const q = filter.value.trim().replace(/^@/, "").toLowerCase();
      const users = data.users.filter((u) => !q || u.username.includes(q) || u.display.toLowerCase().includes(q));
      list.replaceChildren(...(users.length ? users.map((u) => {
        const me = u.id === S.me.id;
        const btns = [];
        if (!me) btns.push(h("button", { class: "mini-btn", title: "Написать", onclick: () => { closeModal(); startDM(u.id); } }, "💬"));
        if (!me) btns.push(h("button", { class: "mini-btn", title: "Подарить подарок", onclick: () => giftModal(u) }, "🎁"));
        if (data.admin && !me && !u.badge) btns.push(u.banned
          ? h("button", { class: "mini-btn", onclick: () => unbanUser(u.username) }, "Разбан")
          : h("button", { class: "mini-btn danger", onclick: () => { closeModal(); banUser(u.username); } }, "Бан"));
        const sub = ["@" + u.username];
        if (data.admin && u.created) sub.push("с " + new Date(u.created * 1000).toLocaleDateString(LOCALE));
        return h("div", { class: "member" + (u.banned ? " banned" : "") },
          userAvatar(u, "sm"),
          h("div", { class: "item-body" },
            h("div", null, u.display, me ? h("span", { class: "muted" }, " (вы)") : null, badgeEl(u.badge)),
            h("div", { class: "muted small" }, sub.join(" · "),
              u.online ? h("span", { style: "color:var(--ok)" }, " · в сети") : null,
              u.banned ? h("span", { style: "color:var(--danger)" }, " · забанен: " + u.banned) : null)),
          ...btns);
      }) : [h("div", { class: "empty-note" }, "Никого не найдено")]));
    };
    const loadUsers = async () => {
      try { data = await call("users"); } catch (e) { list.replaceChildren(h("div", { class: "empty-note" }, e.message)); return; }
      stats.textContent = `Всего: ${data.total} · в сети: ${data.online}`;
      render();
    };
    async function unbanUser(username) {
      try { const r = await call("unban", { username }); toast(r.text); loadUsers(); } catch (e) { toast(e.message, true); }
    }
    filter.addEventListener("input", () => data && render());
    await loadUsers();
    if (matchMedia("(min-width: 761px)").matches) filter.focus();
  }

  // ================= Профиль =================
  // обрезаем фото до квадрата 256×256, чтобы аватарки грузились быстро
  async function squareImage(file, size = 256) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(bmp.width, bmp.height);
    const c = document.createElement("canvas"); c.width = c.height = size;
    c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  }

  function profileModal() {
    let newAvatar = S.me.avatar;          // id файла или null
    const nameIn = h("input", { maxlength: 40, placeholder: "Ваше имя", value: S.me.display });
    const err1 = h("p", { class: "error" });
    const save = h("button", { class: "btn", type: "submit" }, "Сохранить");
    const preview = h("div", { class: "profile-ava" });
    const showPreview = () => preview.replaceChildren(userAvatar({ ...S.me, avatar: newAvatar }, "lg", true));
    showPreview();

    const fileIn = h("input", { type: "file", accept: "image/*", hidden: true });
    const status = h("div", { class: "muted small" });
    const removeBtn = h("button", { class: "mini-btn danger", type: "button", onclick: () => { newAvatar = null; showPreview(); removeBtn.classList.add("hidden"); } }, "Убрать фото");
    if (!newAvatar) removeBtn.classList.add("hidden");
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files[0]; fileIn.value = "";
      if (!f) return;
      status.textContent = "Загрузка фото…";
      save.disabled = true;
      try {
        const up = await uploadFile(await squareImage(f));
        newAvatar = up.id; showPreview(); removeBtn.classList.remove("hidden"); status.textContent = "";
      } catch (e) { status.textContent = ""; toast(e.message || "Не удалось загрузить фото", true); }
      finally { save.disabled = false; }
    });

    const profileForm = h("form", { class: "profile-form" },
      h("div", { class: "profile-top" }, preview,
        h("div", { class: "profile-btns" },
          h("button", { class: "mini-btn", type: "button", onclick: () => fileIn.click() }, "📷 Сменить фото"),
          removeBtn, status, fileIn)),
      h("label", { class: "info-label" }, "Имя (его видят все)"), nameIn,
      h("div", { class: "muted small" }, "Юзернейм: @" + S.me.username + " (не меняется)"),
      err1, save);
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault(); save.disabled = true; err1.textContent = "";
      try { const r = await call("update_profile", { display: nameIn.value, avatar: newAvatar }); onUserUpdate(r.me); toast("Профиль сохранён"); closeModal(); }
      catch (x) { err1.textContent = x.message; } finally { save.disabled = false; }
    });

    const oldIn = h("input", { type: "password", placeholder: "Текущий пароль", autocomplete: "current-password" });
    const newIn = h("input", { type: "password", placeholder: "Новый пароль (от 6 символов)", autocomplete: "new-password" });
    const repIn = h("input", { type: "password", placeholder: "Повторите новый пароль", autocomplete: "new-password" });
    const err2 = h("p", { class: "error" });
    const pwBtn = h("button", { class: "btn ghost", type: "submit" }, "Сменить пароль");
    const pwForm = h("form", { class: "profile-form" }, h("h3", null, "🔒 Смена пароля"), oldIn, newIn, repIn, err2, pwBtn);
    pwForm.addEventListener("submit", async (e) => {
      e.preventDefault(); err2.textContent = "";
      if (newIn.value !== repIn.value) { err2.textContent = "Новые пароли не совпадают"; return; }
      pwBtn.disabled = true;
      try { const r = await call("change_password", { old: oldIn.value, new: newIn.value, token: S.token }); toast(r.text); oldIn.value = newIn.value = repIn.value = ""; }
      catch (x) { err2.textContent = x.message; } finally { pwBtn.disabled = false; }
    });

    $("modal").replaceChildren(
      h("div", { class: "users-head" }, h("h2", null, "⚙️ Профиль"), h("button", { class: "icon-btn", type: "button", onclick: closeModal }, "✕")),
      profileForm, pwForm,
      window.DIAMOND_I18N ? h("div", { class: "profile-form" }, h("h3", null, "🌐 Язык"), window.DIAMOND_I18N.picker()) : null);
    $("modalWrap").classList.remove("hidden");
  }

  // ================= Подарки и алмазы =================
  async function fillGifts(block, userId) {
    let r;
    try { r = await call("user_gifts", { user_id: userId }); }
    catch (e) { block.lastChild.textContent = e.message; return; }
    const label = h("div", { class: "info-label" }, "🎁 Подарки" + (r.gifts.length ? " · " + r.gifts.length : ""));
    if (!r.gifts.length) { block.replaceChildren(label, h("div", { class: "muted small" }, "Подарков пока нет")); return; }
    block.replaceChildren(label, h("div", { class: "gift-shelf" }, ...r.gifts.map((g) => {
      const from = g.from ? g.from.display : "?";
      const tip = `${g.name} · ${from} · ${new Date(g.ts * 1000).toLocaleDateString(LOCALE)}` + (g.note ? `\n«${g.note}»` : "");
      return h("div", { class: "gift-mini", title: tip },
        h("div", { class: "gift-emoji" }, g.emoji),
        g.from ? userAvatar(g.from, "xs", true) : null);
    })));
  }

  async function giftModal(user) {
    let r;
    try { r = await call("gifts"); } catch (e) { return toast(e.message, true); }
    let selected = null;
    const err = h("p", { class: "error" });
    const note = h("input", { maxlength: 120, placeholder: "Подпись к подарку (необязательно)" });
    const sendBtn = h("button", { class: "btn", type: "submit", disabled: true }, "Выберите подарок");
    const grid = h("div", { class: "gift-grid" }, ...r.gifts.map((g) => {
      const tile = h("button", { type: "button", class: "gift-tile" + (g.price > r.me.diamonds ? " poor" : "") },
        h("div", { class: "gift-emoji" }, g.emoji),
        h("div", { class: "gift-tname" }, g.name),
        h("div", { class: "gift-price" }, "💎 " + g.price));
      tile.addEventListener("click", () => {
        selected = g;
        grid.querySelectorAll(".gift-tile").forEach((x) => x.classList.remove("sel"));
        tile.classList.add("sel");
        sendBtn.disabled = false;
        sendBtn.textContent = "Подарить за 💎 " + g.price;
      });
      return tile;
    }));
    const form = h("form", { class: "profile-form" },
      h("div", { class: "users-head" }, h("h2", null, "🎁 Подарить подарок"), h("button", { class: "icon-btn", type: "button", onclick: closeModal }, "✕")),
      h("div", { class: "gift-to" }, userAvatar(user, "sm", true), h("div", { class: "item-body" }, h("div", { class: "bold" }, user.display), h("div", { class: "muted small" }, "@" + user.username)),
        h("div", { class: "my-balance balance-chip" }, "💎 " + r.me.diamonds)),
      grid, note, err, sendBtn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selected) return;
      sendBtn.disabled = true; err.textContent = "";
      try {
        await call("send_gift", { user_id: user.id, gift: selected.id, note: note.value });
        toast("Подарок отправлен 🎁"); closeModal();
        if (!$("info").classList.contains("hidden")) renderInfo();
      } catch (x) { err.textContent = x.message; sendBtn.disabled = false; }
    });
    $("modal").replaceChildren(form);
    $("modal").classList.add("wide");
    $("modalWrap").classList.remove("hidden");
  }

  function walletModal() {
    const dailyBtn = h("button", { class: "btn", type: "button" });
    const updateDaily = () => {
      const left = (S.me.daily_next || 0) - Date.now() / 1000;
      if (left > 0) {
        dailyBtn.disabled = true;
        dailyBtn.textContent = `Следующий бонус через ${Math.floor(left / 3600)} ч ${Math.floor(left % 3600 / 60)} мин`;
      } else { dailyBtn.disabled = false; dailyBtn.textContent = "🎁 Забрать ежедневный бонус"; }
      if (window.DIAMOND_I18N) dailyBtn.textContent = window.DIAMOND_I18N.tr(dailyBtn.textContent);
    };
    updateDaily();
    dailyBtn.addEventListener("click", async () => {
      dailyBtn.disabled = true;
      try { const r = await call("daily"); toast(r.text); } catch (e) { toast(e.message, true); }
      setTimeout(updateDaily, 300);
    });
    const giftsBlock = h("div", { class: "info-block", style: "padding:0" }, h("div", { class: "info-label" }, "🎁 Подарки"), h("div", { class: "muted small" }, "Загрузка…"));
    $("modal").replaceChildren(
      h("div", { class: "users-head" }, h("h2", null, "🎁 Мои подарки и алмазы"), h("button", { class: "icon-btn", type: "button", onclick: closeModal }, "✕")),
      h("div", { class: "wallet" },
        h("div", { class: "muted small" }, "Ваш баланс"),
        h("div", { class: "wallet-bal my-balance" }, "💎 " + (S.me.diamonds ?? 0)),
        dailyBtn,
        h("div", { class: "muted small" }, "Алмазы тратятся на подарки. Каждый день можно забрать бонус.")),
      giftsBlock);
    $("modal").classList.add("wide");
    $("modalWrap").classList.remove("hidden");
    fillGifts(giftsBlock, S.me.id);
  }

  // ================= Меню =================
  $("menuBtn").addEventListener("click", (e) => { e.stopPropagation(); $("menu").classList.toggle("hidden"); });
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").classList.add("hidden"); });
  $("menu").addEventListener("click", async (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (!act) return;
    $("menu").classList.add("hidden");
    if (act === "new-group") newChatModal("group");
    if (act === "new-channel") newChatModal("channel");
    if (act === "join-link") joinLinkModal();
    if (act === "users") usersModal();
    if (act === "profile") profileModal();
    if (act === "wallet") walletModal();
    if (act === "admin") adminModal();
    if (act === "logout") {
      if (!confirm("Выйти из аккаунта?")) return;
      try { await call("logout", { token: S.token }); } catch {}
      save("diamond_token", null); location.reload();
    }
  });
  $("fab").addEventListener("click", (e) => {
    e.stopPropagation();
    const m = $("menu"); m.classList.remove("hidden");
  });

  if (window.DIAMOND_I18N) $("authLang").appendChild(window.DIAMOND_I18N.picker());
  setAuthMode("login");
  connect();
})();
