(function () {
    const api = async (path, options = {}) => {
        const response = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...options });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Ein Fehler ist aufgetreten.');
        return data;
    };

    window.dashboardStore = {
        data: { widgets: [], settings: {} },
        queue: Promise.resolve(),
        async load() { this.data = await api('/dashboard'); this.data.settings ||= {}; return this.data; },
        persist() { const snapshot=JSON.stringify(this.data); this.queue=this.queue.catch(()=>{}).then(()=>api('/dashboard',{method:'PUT',body:snapshot})); return this.queue; },
        async save(widgets) { this.data.widgets = widgets; return this.persist(); },
        async saveSettings(settings) { this.data.settings = settings; return this.persist(); }
    };

    const loginScreen = document.getElementById('login-screen');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    function openPanel(id) {
        if (window.uiManager) window.uiManager.openPanel(id);
    }
    function closeAll() {
        if (window.uiManager) window.uiManager.closeAll();
    }

    async function showUsers() {
        try {
            const data = await api('/users');
            document.getElementById('user-list').innerHTML = data.users.map(user => `
                <div class="user-row">
                    <div class="account-avatar">${escapeHtml(user.display_name.charAt(0).toUpperCase())}</div>
                    <div class="user-row-main"><strong>${escapeHtml(user.display_name)}</strong><small>@${escapeHtml(user.username)} · ${user.active ? 'Aktiv' : 'Deaktiviert'}</small></div>
                    <span class="role-badge">${user.role === 'admin' ? 'Admin' : 'Nutzer'}</span>
                    ${user.id!==window.currentUser.id?`<button class="delete-user-btn" data-delete-user="${user.id}" data-user-name="${escapeHtml(user.display_name)}" title="Benutzer löschen"><i class="fas fa-trash"></i></button>`:''}
                </div>`).join('');
            document.querySelectorAll('[data-delete-user]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm(`Benutzer „${button.dataset.userName}“ wirklich dauerhaft löschen?\n\nDashboard und gespeicherte Sitzungen werden ebenfalls entfernt.`))return;try{await api('/users/'+button.dataset.deleteUser,{method:'DELETE'});await showUsers();}catch(error){alert(error.message);}}));
            openPanel('modal-users');
        } catch (error) { alert(error.message); }
    }

    function escapeHtml(value) {
        const div = document.createElement('div'); div.textContent = value || ''; return div.innerHTML;
    }

    function showPassword(required = false) {
        const close = document.querySelector('.password-close');
        close.style.display = required ? 'none' : '';
        document.getElementById('password-error').textContent = '';
        openPanel('modal-password');
    }

    function bindAccount(user) {
        const account = document.getElementById('dropdown-account');
        document.getElementById('account-name').textContent = user.display_name;
        document.getElementById('account-avatar').textContent = user.display_name.charAt(0).toUpperCase();
        document.getElementById('account-role').textContent = user.role === 'admin' ? 'Administrator' : 'Normaler Nutzer';
        document.getElementById('btn-users').style.display = user.role === 'admin' ? '' : 'none';
        document.getElementById('btn-account').addEventListener('click', event => { event.stopPropagation(); account.classList.toggle('open'); });
        document.addEventListener('click', event => { if (!account.contains(event.target)) account.classList.remove('open'); });
        document.getElementById('btn-users').addEventListener('click', () => { account.classList.remove('open'); showUsers(); });
        document.getElementById('btn-password').addEventListener('click', () => { account.classList.remove('open'); showPassword(false); });
        document.getElementById('btn-logout').addEventListener('click', async () => { await api('/logout', { method: 'POST', body: '{}' }); location.reload(); });
        document.getElementById('btn-new-user').addEventListener('click', () => openPanel('modal-user-form'));
        document.getElementById('user-form').addEventListener('submit', async event => {
            event.preventDefault(); const formElement=event.currentTarget;
            try {
                await api('/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(formElement))) });
                formElement.reset(); await showUsers();
            } catch (error) { alert(error.message); }
        });
        document.getElementById('password-form').addEventListener('submit', async event => {
            event.preventDefault(); const formElement=event.currentTarget,form = new FormData(formElement),errorBox = document.getElementById('password-error');
            if (form.get('password') !== form.get('repeat')) { errorBox.textContent = 'Die Passwörter stimmen nicht überein.'; return; }
            try {
                await api('/password', { method: 'POST', body: JSON.stringify({ password: form.get('password') }) });
                user.must_change_password = 0; document.querySelector('.password-close').style.display = ''; closeAll(); formElement.reset();
            } catch (error) { errorBox.textContent = error.message; }
        });
        if (user.must_change_password) setTimeout(() => showPassword(true), 0);
    }

    loginForm.addEventListener('submit', async event => {
        event.preventDefault(); loginError.textContent = '';
        const form = new FormData(loginForm);
        try {
            await api('/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password'), remember: form.get('remember') === 'on' }) });
            location.reload();
        } catch (error) { loginError.textContent = error.message; }
    });

    async function bootstrap() {
        try {
            const data = await api('/me');
            if (!data.user) return;
            window.currentUser = data.user;
            document.body.classList.remove('auth-locked');
            loginScreen.classList.add('hidden');
            window.dispatchEvent(new CustomEvent('dashboard-auth-ready'));
            setTimeout(() => bindAccount(data.user), 0);
        } catch (error) { loginError.textContent = 'Das Backend ist nicht erreichbar.'; }
    }
    bootstrap();
})();
