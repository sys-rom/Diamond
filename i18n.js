// Diamond Messenger — переключение языка интерфейса (русский / українська / English).
// Работает только на странице: переводит тексты, подсказки и сообщения сервера на лету.
(function () {
  "use strict";

  const LANGS = { uk: "Українська", ru: "Русский", en: "English" };
  const LOCALES = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

  let lang = null;
  try { lang = localStorage.getItem("diamond_lang"); } catch {}
  if (!LANGS[lang]) {
    const nav = (navigator.language || "").toLowerCase();
    lang = nav.startsWith("uk") ? "uk" : nav.startsWith("ru") ? "ru" : "en";
  }
  window.DIAMOND_LANG = lang;
  window.DIAMOND_LOCALE = LOCALES[lang];
  document.documentElement.lang = lang;

  // Словарь: русский текст -> [українська, English]
  const D = {
    // --- вход
    "Вход": ["Вхід", "Sign in"],
    "Регистрация": ["Реєстрація", "Sign up"],
    "Ваше имя (как вас видят)": ["Ваше ім'я (як вас бачать)", "Your name (as others see it)"],
    "Юзернейм": ["Юзернейм", "Username"],
    "Пароль": ["Пароль", "Password"],
    "Войти": ["Увійти", "Sign in"],
    "Создать аккаунт": ["Створити акаунт", "Create account"],
    "Подключение к серверу…": ["Підключення до сервера…", "Connecting to server…"],
    "Подключение…": ["Підключення…", "Connecting…"],

    // --- меню и боковая панель
    "Поиск людей, групп, каналов": ["Пошук людей, груп, каналів", "Search people, groups, channels"],
    "Меню": ["Меню", "Menu"],
    "Открыть профиль": ["Відкрити профіль", "Open profile"],
    "⚙️ Профиль": ["⚙️ Профіль", "⚙️ Profile"],
    "👥 Создать группу": ["👥 Створити групу", "👥 New group"],
    "📢 Создать канал": ["📢 Створити канал", "📢 New channel"],
    "👤 Все пользователи": ["👤 Усі користувачі", "👤 All users"],
    "🔗 Вступить по ссылке": ["🔗 Приєднатися за посиланням", "🔗 Join via link"],
    "🛡️ Админ-панель": ["🛡️ Адмін-панель", "🛡️ Admin panel"],
    "🚪 Выйти": ["🚪 Вийти", "🚪 Log out"],
    "Новый чат": ["Новий чат", "New chat"],
    "Пока нет чатов. Найдите кого-нибудь через поиск или создайте группу.": ["Поки немає чатів. Знайдіть когось через пошук або створіть групу.", "No chats yet. Find someone via search or create a group."],
    "Ваши чаты": ["Ваші чати", "Your chats"],
    "Люди": ["Люди", "People"],
    "Группы и каналы": ["Групи та канали", "Groups and channels"],
    "Ничего не найдено": ["Нічого не знайдено", "Nothing found"],
    "Нет сообщений": ["Немає повідомлень", "No messages"],
    "Вы:": ["Ви:", "You:"],
    "🖼 Фото": ["🖼 Фото", "🖼 Photo"],

    // --- чат
    "Выберите чат или найдите собеседника через поиск": ["Оберіть чат або знайдіть співрозмовника через пошук", "Pick a chat or find someone via search"],
    "Информация": ["Інформація", "Info"],
    "Прикрепить файл": ["Прикріпити файл", "Attach file"],
    "Сообщение…": ["Повідомлення…", "Message…"],
    "Отправить": ["Надіслати", "Send"],
    "Загрузка…": ["Завантаження…", "Loading…"],
    "в сети": ["у мережі", "online"],
    "не в сети": ["не в мережі", "offline"],
    "· в сети": ["· у мережі", "· online"],
    "печатает…": ["друкує…", "typing…"],
    "Сегодня": ["Сьогодні", "Today"],
    "Вчера": ["Вчора", "Yesterday"],
    "Подписаться": ["Підписатися", "Subscribe"],
    "Вступить в группу": ["Приєднатися до групи", "Join group"],
    "Вы подписаны на канал": ["Ви підписані на канал", "You are subscribed"],
    "Вы подписались": ["Ви підписалися", "Subscribed"],
    "Вы вступили в группу": ["Ви приєдналися до групи", "You joined the group"],
    "↑ Прокрутите вверх для старых сообщений": ["↑ Прокрутіть вгору для старих повідомлень", "↑ Scroll up for older messages"],
    "В канале пока нет публикаций": ["У каналі поки немає публікацій", "No posts in this channel yet"],
    "Сообщений пока нет. Напишите первым!": ["Повідомлень поки немає. Напишіть першим!", "No messages yet. Say hi!"],
    "Удалить": ["Видалити", "Delete"],
    "Удалить сообщение для всех?": ["Видалити повідомлення для всіх?", "Delete this message for everyone?"],
    "Скачать": ["Завантажити", "Download"],
    "Файл недоступен": ["Файл недоступний", "File unavailable"],
    "⚠ не удалось загрузить фото": ["⚠ не вдалося завантажити фото", "⚠ couldn't load photo"],
    "Файл больше 20 МБ": ["Файл більший за 20 МБ", "File is larger than 20 MB"],
    "Не удалось загрузить файл": ["Не вдалося завантажити файл", "Upload failed"],
    "Нет связи с сервером": ["Немає зв'язку з сервером", "No connection to server"],
    "Сервер не ответил": ["Сервер не відповів", "Server didn't respond"],
    "Скопировано": ["Скопійовано", "Copied"],
    "Скопируйте:": ["Скопіюйте:", "Copy:"],
    "Канал": ["Канал", "Channel"],
    "Группа": ["Група", "Group"],

    // --- информация о чате
    "Личный чат": ["Особистий чат", "Private chat"],
    "Публичный канал": ["Публічний канал", "Public channel"],
    "Приватный канал": ["Приватний канал", "Private channel"],
    "Публичная группа": ["Публічна група", "Public group"],
    "Приватная группа": ["Приватна група", "Private group"],
    "Описание": ["Опис", "Description"],
    "Публичная ссылка": ["Публічне посилання", "Public link"],
    "Ссылка-приглашение": ["Посилання-запрошення", "Invite link"],
    "Копировать": ["Копіювати", "Copy"],
    "Участники": ["Учасники", "Members"],
    "Подписчики": ["Підписники", "Subscribers"],
    "владелец": ["власник", "owner"],
    "админ": ["адмін", "admin"],
    "Написать": ["Написати", "Message"],
    "Сделать админом": ["Зробити адміном", "Make admin"],
    "Снять админа": ["Зняти адміна", "Remove admin"],
    "Бан": ["Бан", "Ban"],
    "Разбан": ["Розбан", "Unban"],
    "🛡️ Забанить пользователя": ["🛡️ Заблокувати користувача", "🛡️ Ban user"],
    "Отписаться": ["Відписатися", "Unsubscribe"],
    "Выйти из группы": ["Вийти з групи", "Leave group"],
    "Удалить переписку": ["Видалити листування", "Delete chat"],
    "Удалить канал": ["Видалити канал", "Delete channel"],
    "Удалить группу": ["Видалити групу", "Delete group"],
    "Удалено": ["Видалено", "Deleted"],

    // --- окна
    "Отмена": ["Скасувати", "Cancel"],
    "Создать": ["Створити", "Create"],
    "Сохранить": ["Зберегти", "Save"],
    "Новая группа": ["Нова група", "New group"],
    "Новый канал": ["Новий канал", "New channel"],
    "Название группы": ["Назва групи", "Group name"],
    "Название канала": ["Назва каналу", "Channel name"],
    "Описание (необязательно)": ["Опис (необов'язково)", "Description (optional)"],
    "Публичная группа (её можно найти в поиске)": ["Публічна група (її можна знайти в пошуку)", "Public group (can be found in search)"],
    "Публичный канал (его можно найти в поиске)": ["Публічний канал (його можна знайти в пошуку)", "Public channel (can be found in search)"],
    "ссылка (латиница, от 4 символов)": ["посилання (латиниця, від 4 символів)", "link (latin letters, 4+ chars)"],
    "Вступить по ссылке": ["Приєднатися за посиланням", "Join via link"],
    "Вставьте ссылку-приглашение или @ссылку": ["Вставте посилання-запрошення або @посилання", "Paste an invite link or @link"],
    "Вступить": ["Приєднатися", "Join"],
    "Не похоже на ссылку": ["Не схоже на посилання", "That doesn't look like a link"],
    "Админы задаются в файле admins.txt на сервере, баны хранятся в bans.txt.": ["Адміни задаються у файлі admins.txt на сервері, бани зберігаються в bans.txt.", "Admins are set in admins.txt on the server, bans are stored in bans.txt."],
    "Юзернейм пользователя": ["Юзернейм користувача", "User's username"],
    "Причина бана (необязательно)": ["Причина бану (необов'язково)", "Ban reason (optional)"],
    "Причина (необязательно)": ["Причина (необов'язково)", "Reason (optional)"],
    "Забанить": ["Заблокувати", "Ban"],
    "Разбанить": ["Розблокувати", "Unban"],
    "Поиск по имени или @юзернейму": ["Пошук за ім'ям або @юзернеймом", "Search by name or @username"],
    "Никого не найдено": ["Нікого не знайдено", "No one found"],
    "(вы)": ["(ви)", "(you)"],
    "Выйти из аккаунта?": ["Вийти з акаунта?", "Log out?"],
    "без причины": ["без причини", "no reason"],

    // --- профиль
    "📷 Сменить фото": ["📷 Змінити фото", "📷 Change photo"],
    "Убрать фото": ["Прибрати фото", "Remove photo"],
    "Загрузка фото…": ["Завантаження фото…", "Uploading photo…"],
    "Не удалось загрузить фото": ["Не вдалося завантажити фото", "Couldn't upload photo"],
    "Имя (его видят все)": ["Ім'я (його бачать усі)", "Name (visible to everyone)"],
    "Ваше имя": ["Ваше ім'я", "Your name"],
    "Профиль сохранён": ["Профіль збережено", "Profile saved"],
    "🔒 Смена пароля": ["🔒 Зміна пароля", "🔒 Change password"],
    "Текущий пароль": ["Поточний пароль", "Current password"],
    "Новый пароль (от 6 символов)": ["Новий пароль (від 6 символів)", "New password (6+ chars)"],
    "Повторите новый пароль": ["Повторіть новий пароль", "Repeat new password"],
    "Сменить пароль": ["Змінити пароль", "Change password"],
    "Новые пароли не совпадают": ["Нові паролі не збігаються", "New passwords don't match"],
    "🌐 Язык": ["🌐 Мова", "🌐 Language"],

    // --- сообщения сервера
    "Нужно войти": ["Потрібно увійти", "Please sign in"],
    "Юзернейм: 3–20 символов, латиница, цифры и _": ["Юзернейм: 3–20 символів, латиниця, цифри та _", "Username: 3–20 chars, latin letters, digits and _"],
    "Пароль — минимум 6 символов": ["Пароль — мінімум 6 символів", "Password must be at least 6 characters"],
    "Этот юзернейм заблокирован": ["Цей юзернейм заблоковано", "This username is banned"],
    "Этот юзернейм уже занят": ["Цей юзернейм уже зайнятий", "This username is taken"],
    "Неверный юзернейм или пароль": ["Невірний юзернейм або пароль", "Wrong username or password"],
    "Сессия устарела, войдите снова": ["Сесія застаріла, увійдіть знову", "Session expired, please sign in again"],
    "Нет доступа к этому чату": ["Немає доступу до цього чату", "No access to this chat"],
    "Нет доступа": ["Немає доступу", "No access"],
    "В этот чат нельзя писать": ["У цей чат не можна писати", "You can't write in this chat"],
    "Писать в канал могут только его админы": ["Писати в канал можуть лише його адміни", "Only channel admins can post"],
    "Файл не найден": ["Файл не знайдено", "File not found"],
    "Сообщение уже удалено": ["Повідомлення вже видалено", "Message already deleted"],
    "Нельзя удалить чужое сообщение": ["Не можна видалити чуже повідомлення", "You can't delete someone else's message"],
    "Неизвестный тип чата": ["Невідомий тип чату", "Unknown chat type"],
    "Введите название": ["Введіть назву", "Enter a name"],
    "Ссылка: 4–32 символа, латиница, цифры и _": ["Посилання: 4–32 символи, латиниця, цифри та _", "Link: 4–32 chars, latin letters, digits and _"],
    "Эта ссылка уже занята": ["Це посилання вже зайняте", "This link is taken"],
    "Ссылка недействительна": ["Посилання недійсне", "Invalid link"],
    "Владелец не может выйти — можно только удалить чат": ["Власник не може вийти — можна лише видалити чат", "The owner can't leave — only delete the chat"],
    "Удалить чат может только владелец": ["Видалити чат може лише власник", "Only the owner can delete the chat"],
    "Общий чат может удалить только админ": ["Загальний чат може видалити лише адмін", "Only an admin can delete the general chat"],
    "Пользователь не найден": ["Користувача не знайдено", "User not found"],
    "Назначать админов может только владелец": ["Призначати адмінів може лише власник", "Only the owner can assign admins"],
    "Нельзя изменить роль": ["Не можна змінити роль", "Can't change role"],
    "Назначен админом чата": ["Призначено адміном чату", "Made chat admin"],
    "Права админа сняты": ["Права адміна знято", "Admin rights removed"],
    "Только для админов": ["Лише для адмінів", "Admins only"],
    "Нельзя забанить админа": ["Не можна заблокувати адміна", "You can't ban an admin"],
    "Этот пользователь не забанен": ["Цей користувач не заблокований", "This user is not banned"],
    "Неверный запрос": ["Невірний запит", "Bad request"],
    "Ошибка сервера": ["Помилка сервера", "Server error"],
    "Чат не найден": ["Чат не знайдено", "Chat not found"],
    "Имя не может быть пустым": ["Ім'я не може бути порожнім", "Name can't be empty"],
    "Фото не найдено": ["Фото не знайдено", "Photo not found"],
    "Текущий пароль неверный": ["Поточний пароль невірний", "Current password is wrong"],
    "Новый пароль — минимум 6 символов": ["Новий пароль — мінімум 6 символів", "New password must be at least 6 characters"],
    "Пароль изменён. На других устройствах нужно войти заново.": ["Пароль змінено. На інших пристроях потрібно увійти знову.", "Password changed. Other devices will need to sign in again."],
    "Общий чат Diamond Messenger": ["Загальний чат Diamond Messenger", "Diamond Messenger general chat"],
    "Удалённый аккаунт": ["Видалений акаунт", "Deleted account"],
    "Удалён": ["Видалений", "Deleted"],
    "нарушение правил": ["порушення правил", "rule violation"],
  };

  const L = lang === "uk" ? 0 : 1;
  const pick = (uk, en) => (lang === "uk" ? uk : en);

  function plural(n, ukForms, enForms) {
    n = +n;
    if (lang === "en") return n + " " + (n === 1 ? enForms[0] : enForms[1]);
    const m10 = n % 10, m100 = n % 100;
    const i = m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 1 : 2;
    return n + " " + ukForms[i];
  }

  // Шаблоны для текстов с именами и числами
  const P = [
    [/(\d+) (?:участников|участника|участник)/g, (m, n) => plural(n, ["учасник", "учасники", "учасників"], ["member", "members"])],
    [/(\d+) (?:подписчиков|подписчика|подписчик)/g, (m, n) => plural(n, ["підписник", "підписники", "підписників"], ["subscriber", "subscribers"])],
    [/^Канал · /, () => pick("Канал · ", "Channel · ")],
    [/^Группа · /, () => pick("Група · ", "Group · ")],
    [/(\d+(?:\.\d+)?) (Б|КБ|МБ)$/, (m, n, u) => n + " " + (lang === "en" ? { "Б": "B", "КБ": "KB", "МБ": "MB" }[u] : u)],
    [/^Вы вступили в «(.+)»$/, (m, t) => pick(`Ви приєдналися до «${t}»`, `You joined “${t}”`)],
    [/^Забанить @(\w+)$/, (m, u) => pick("Заблокувати @" + u, "Ban @" + u)],
    [/^Ваш аккаунт заблокирован: (.*)$/s, (m, r) => pick("Ваш акаунт заблоковано: ", "Your account is banned: ") + tr(r)],
    [/^Аккаунт заблокирован: (.*)$/s, (m, r) => pick("Акаунт заблоковано: ", "Account banned: ") + tr(r)],
    [/^(.+) печатает…$/, (m, n) => n + pick(" друкує…", " is typing…")],
    [/^(.+) печатают…$/, (m, n) => n + pick(" друкують…", " are typing…")],
    [/^Юзернейм: @(\w+) \(не меняется\)$/, (m, u) => pick(`Юзернейм: @${u} (не змінюється)`, `Username: @${u} (can't be changed)`)],
    [/^Всего: (\d+) · в сети: (\d+)$/, (m, a, b) => pick(`Усього: ${a} · у мережі: ${b}`, `Total: ${a} · online: ${b}`)],
    [/^(@\w+) · с (.+)$/, (m, u, d) => u + pick(" · з ", " · since ") + d],
    [/^· забанен: (.*)$/s, (m, r) => pick("· заблокований: ", "· banned: ") + tr(r)],
    [/^Покинуть «(.+)»\?$/s, (m, t) => pick(`Покинути «${t}»?`, `Leave “${t}”?`)],
    [/^Удалить «(.+)» для всех участников\? Это нельзя отменить\.$/s, (m, t) => pick(`Видалити «${t}» для всіх учасників? Це не можна скасувати.`, `Delete “${t}” for all members? This can't be undone.`)],
    [/^В приватный (канал|чат) можно попасть только по ссылке-приглашению\.$/, (m, k) =>
      pick(`До приватного ${k === "канал" ? "каналу" : "чату"} можна потрапити лише за посиланням-запрошенням.`,
           `A private ${k === "канал" ? "channel" : "chat"} can only be joined via an invite link.`)],
    [/^(Участники|Подписчики) · (\d+)$/, (m, k, n) => (k === "Участники" ? pick("Учасники", "Members") : pick("Підписники", "Subscribers")) + " · " + n],
    [/^· (владелец|админ)$/, (m, r) => "· " + (r === "владелец" ? pick("власник", "owner") : pick("адмін", "admin"))],
    [/^@(\w+) забанен$/,(m, u) => pick(`@${u} заблоковано`, `@${u} banned`)],
    [/^@(\w+) разбанен$/, (m, u) => pick(`@${u} розблоковано`, `@${u} unbanned`)],
  ];

  function tr(s) {
    if (lang === "ru" || typeof s !== "string") return s;
    const k = s.trim();
    if (!k) return s;
    if (D[k]) return s.replace(k, D[k][L]);
    let out = k, hit = false;
    for (const [re, fn] of P) {
      re.lastIndex = 0;
      if (re.test(out)) { re.lastIndex = 0; out = out.replace(re, fn); hit = true; }
    }
    return hit ? s.replace(k, out) : s;
  }

  // Не переводим то, что пишут сами пользователи
  const SKIP = ".mtext, .sender, .item-title, .chat-title, .info-title, .file-name, code, textarea, #meName";

  function translateNode(root) {
    if (lang === "ru" || !root) return;
    if (root.nodeType === 3) {
      const p = root.parentElement;
      if (p && !p.closest(SKIP)) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; }
      return;
    }
    if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
    const els = [root, ...root.querySelectorAll("[placeholder], [title]")];
    for (const el of els) {
      for (const a of ["placeholder", "title"]) {
        const v = el.getAttribute?.(a);
        if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateNode);
  }

  if (lang !== "ru") {
    const start = () => {
      translateNode(document.body);
      new MutationObserver((muts) => {
        for (const m of muts) m.addedNodes.forEach(translateNode);
      }).observe(document.body, { childList: true, subtree: true });
    };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();

    const c = window.confirm.bind(window), a = window.alert.bind(window), p = window.prompt.bind(window);
    window.confirm = (m) => c(tr(m));
    window.alert = (m) => a(tr(m));
    window.prompt = (m, d) => p(tr(m), d);
  }

  // Выпадающий список выбора языка
  function picker() {
    const sel = document.createElement("select");
    sel.className = "lang-select";
    for (const [code, name] of Object.entries(LANGS)) {
      const o = document.createElement("option");
      o.value = code; o.textContent = name; o.selected = code === lang;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => {
      try { localStorage.setItem("diamond_lang", sel.value); } catch {}
      location.reload();
    });
    return sel;
  }

  window.DIAMOND_I18N = { lang, tr, picker, LANGS };
})();
