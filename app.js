const DEFAULT_WIDGETS = [];
const DEFAULT_SETTINGS = { dashboardTitle: 'Dashboard', gridSnap: true, gridGap: 8, theme: 'auto', glassOpacity: 40, glassBlur: 25, accentColor: '#8f98a8', textColor: '#ffffff', panelColor: '#000000', widgetRadius: 16, backgroundData: '', backgroundDarkness: 40, backgroundBlur: 0, serverAddress: '', pingTarget: '', wolDevices: [{title:'NAS Server',mac:'00:11:22:33:44:55',broadcast:'255.255.255.255',port:9},{title:'Office PC',mac:'AA:BB:CC:DD:EE:FF',broadcast:'255.255.255.255',port:9}] };

function colorWithAlpha(hex, alpha) {
    const value = hex.replace('#',''), number = parseInt(value, 16);
    return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
}

function contrastColor(hex) {
    const value=parseInt(hex.replace('#',''),16),r=(value>>16)&255,g=(value>>8)&255,b=value&255;
    return (r*299+g*587+b*114)/1000>155?'#111111':'#ffffff';
}

function getFavoriteLogo(config) {
    if (config.logoData) return config.logoData;
    if (config.logoUrl) return config.logoUrl;
    if (config.autoFavicon === false) return '';
    try { new URL(config.url); return '/api/favicon?url=' + encodeURIComponent(config.url); } catch (_) { return ''; }
}

function escapeAttribute(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatTextBlock(value) {
    return String(value||'').split('\n').map(line=>line.trim()==='---'?'<hr>':`<p>${escapeAttribute(line)||'&nbsp;'}</p>`).join('');
}

function showDashboardToast(message, icon='fa-power-off') {
    const container=document.getElementById('toast-container'); if(!container)return;
    const toast=document.createElement('div'); toast.className='dashboard-toast';
    toast.innerHTML=`<i class="fas ${icon}"></i><span>${escapeAttribute(message)}</span>`;
    container.appendChild(toast); requestAnimationFrame(()=>toast.classList.add('show'));
    setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),300);},3200);
}

class WidgetFactory {
    static createContent(widget) {
        let content = '';
        switch (widget.type) {
            case 'favorite':
                const logo = getFavoriteLogo(widget.config);
                const fallback = `<i class="${escapeAttribute(widget.config.icon || 'fas fa-link')}"></i>`;
                content = `<div class="widget-body fav-widget"><div class="favorite-logo">${logo ? `<img src="${escapeAttribute(logo)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">` : ''}<span style="${logo ? 'display:none' : ''}">${fallback}</span></div><span>${widget.config.title}</span></div>`;
                break;
            case 'server':
                const serverList = widget.config.servers.map(s => `<div class="server-item"><span>${s.name}</span><span class="status-dot ${s.status === 'offline' ? 'offline' : ''}">● ${s.status.toUpperCase()}</span></div>`).join('');
                content = `<div class="widget-body">${serverList}</div>`;
                break;
            case 'weather':
                content = `<div class="widget-body apple-weather" data-weather-id="${widget.id}"><div class="weather-top"><div><span class="weather-place">${widget.config.location}</span><strong class="weather-temp">--°</strong></div><span class="weather-symbol">☀️</span></div><div class="weather-bottom"><div><span class="weather-condition">Wetter wird geladen …</span><small class="weather-range">H: --° &nbsp; T: --°</small></div><div class="weather-updated"></div></div></div>`;
                break;
            case 'clock':
                const numbers = Array.from({length: 12}, (_, index) => `<span>${index + 1}</span>`).join('');
                content = `<div class="widget-body clock-widget" data-clock-id="${widget.id}" data-timezone="${widget.config.timezone}"><div class="analog-clock"><div class="clock-ticks"><i></i></div><div class="clock-numbers">${numbers}</div><span class="clock-hand hour-hand"></span><span class="clock-hand minute-hand"></span><span class="clock-hand second-hand"></span><span class="clock-pin"></span></div><small class="clock-zone">${widget.config.timezone.replace('_',' ')}</small></div>`;
                break;
            case 'wol':
                const devices = widget.config.devices || [];
                content = `<div class="widget-body wol-overview">${devices.length ? devices.map((device,index) => `<div class="wol-overview-row"><div class="wol-device-icon">${device.imageData ? `<img src="${escapeAttribute(device.imageData)}" alt="">` : '<i class="fas fa-server"></i>'}<span></span></div><div class="wol-device-info"><strong>${device.title}</strong><small>${device.mac}</small><em id="wol-widget-status-${index}">${device.host?'Wird geprüft …':'Bereit'}</em></div><button class="wol-power-button" data-wol-index="${index}" onclick="wakeWolDevice(event, ${index}, 'wol-widget-status-${index}')" title="${device.title} starten"><i class="fas fa-power-off"></i></button></div>`).join('') : '<div class="wol-empty">Noch keine Geräte konfiguriert.</div>'}</div>`;
                break;
            case 'calendar':
                content = `<div class="widget-body apple-calendar" data-calendar-id="${widget.id}"><div class="calendar-toolbar"><div><small>${widget.config.title||'Kalender'}</small><strong class="calendar-month"></strong></div><div class="calendar-nav"><button onclick="changeCalendarMonth(event,'${widget.id}',-1)" title="Vorheriger Monat"><i class="fas fa-chevron-left"></i></button><button onclick="changeCalendarMonth(event,'${widget.id}',1)" title="Nächster Monat"><i class="fas fa-chevron-right"></i></button></div></div><div class="calendar-weekdays"></div><div class="calendar-days"></div></div>`;
                break;
            case 'moon':
                content = `<div class="widget-body moon-widget" data-moon-id="${widget.id}"><div class="moon-heading"><div><small>${widget.config.title||'Mondphase'}</small><strong class="moon-phase-name">–</strong></div><span class="moon-symbol">🌕</span></div><div class="moon-details"><div><span class="moon-percent">–%</span><small>beleuchtet</small></div><div class="moon-full"><small>Nächster Vollmond</small><strong>–</strong></div></div><div class="moon-progress"><i></i></div></div>`;
                break;
            case 'text':
                content = `<div class="widget-body text-block align-${widget.config.align||'left'} size-${widget.config.fontSize||'medium'}">${widget.config.title?`<h3>${escapeAttribute(widget.config.title)}</h3>`:''}${formatTextBlock(widget.config.text)}</div>`;
                break;
            default:
                content = `<div class="widget-body">Unbekanntes Widget</div>`;
        }
        return `
            <div class="widget-header ${['favorite','wol','text'].includes(widget.type) ? 'favorite-header' : ''}">
                ${['favorite','wol','text'].includes(widget.type) ? '' : `<span class="widget-title">${widget.config.title || widget.type}</span>`}
                <div class="widget-controls">
                    <i class="fas fa-edit" onclick="editWidget(event, '${widget.id}')" title="Bearbeiten"></i>
                    <i class="fas fa-trash-alt" onclick="deleteWidget(event, '${widget.id}')" title="Löschen"></i>
                </div>
            </div>
            ${content}
        `;
    }
}

class Dashboard {
    constructor() {
        this.isEditMode = false;
        this.grid = null;
        this.init();
    }
    init() {
        setInterval(() => this.updateClock(), 1000);
        setInterval(() => this.refreshWolStatus(), 15000);
        this.updateClock();
        document.getElementById('btn-edit-mode').addEventListener('click', () => this.toggleEditMode());
        this.grid = GridStack.init({ column: 12, cellHeight: 80, margin: 8, staticGrid: true, float: true });
        this.grid.on('change', () => { if(this.isRendering)return; clearTimeout(this.layoutSaveTimer); this.layoutSaveTimer=setTimeout(()=>this.saveLayout(),300); });
        this.grid.on('resizestop dragstop', () => { if(this.isRendering)return; clearTimeout(this.layoutSaveTimer); this.saveLayout(); });
        window.addEventListener('pagehide', () => { if(!this.isRendering && this.widgets) this.saveLayout(); });
        this.loadWidgets();
    }
    async loadWidgets() {
        let widgets = DEFAULT_WIDGETS;
        try {
            const savedData = await window.dashboardStore.load();
            if (savedData && Array.isArray(savedData.widgets)) widgets = savedData.widgets;
            if(savedData.settings?.accentColor?.toLowerCase()==='#4ade80')savedData.settings.accentColor=DEFAULT_SETTINGS.accentColor;
            this.settings = { ...DEFAULT_SETTINGS, ...(savedData.settings || {}) };
        } catch (error) { console.error('Dashboard konnte nicht geladen werden:', error); }
        this.settings ||= { ...DEFAULT_SETTINGS };
        this.applySettings();
        this.widgets = widgets;
        this.renderWidgets();
    }
    renderWidgets() {
        this.isRendering=true;
        this.grid.removeAll();
        this.widgets.forEach(w => {
            if(w.type==='favorite'&&!w.config.linkGridMigrated){w.w=1;w.h=2;w.config.linkShapeMigrated=true;w.config.linkSmallMigrated=true;w.config.linkMediumMigrated=true;w.config.linkCmMigrated=true;w.config.linkGridMigrated=true;}
            if (w.type === 'wol') w.config={...w.config,title:'Wake on LAN',devices:this.settings.wolDevices,compactMigrated:true};
            const isLink = w.type === 'favorite';
            const wrapperTag = isLink ? 'a' : 'div';
            const linkAttr = isLink ? `href="${w.config.url}" target="_blank"` : '';
            this.grid.addWidget(`<div class="grid-stack-item" gs-id="${w.id}" gs-x="${w.x}" gs-y="${w.y}" gs-w="${w.w}" gs-h="${w.h}"><${wrapperTag} class="grid-stack-item-content ${w.type === 'favorite' ? 'favorite-card' : ''} ${w.type === 'weather' ? 'weather-card' : ''} ${w.type === 'clock' ? 'clock-card' : ''} ${w.type === 'calendar' ? 'calendar-card' : ''} ${w.type === 'moon' ? 'moon-card' : ''} ${w.type==='text'&&w.config.transparent?'transparent-text-card':''}" ${linkAttr}>${WidgetFactory.createContent(w)}</${wrapperTag}></div>`);
        });
        this.refreshWeatherWidgets();
        this.renderWolDevices();
        this.renderCalendars();
        this.renderMoonWidgets();
        this.refreshWolStatus();
        this.isRendering=false;
    }
    async saveLayout() {
        const gridItems = this.grid.engine.nodes;
        let currentWidgets = this.widgets || DEFAULT_WIDGETS;
        const updatedWidgets = currentWidgets.map(widget => {
            const node = gridItems.find(n => n.id === widget.id);
            if (node) { widget.x = node.x; widget.y = node.y; widget.w = node.w; widget.h = node.h; }
            return widget;
        });
        this.widgets = updatedWidgets;
        try { await window.dashboardStore.save(updatedWidgets); }
        catch (error) { console.error('Dashboard konnte nicht gespeichert werden:', error); }
    }
    async addFavorite(data) {
        const existing = data.widget_id ? this.widgets.find(widget => widget.id === data.widget_id) : null;
        if (existing) {
            existing.config.title = data.title; existing.config.url = data.url; existing.config.icon = data.icon;
            existing.config.autoFavicon = data.auto_favicon === 'on'; existing.config.logoData = data.logo_data || '';
            existing.config.logoUrl = '';
        } else {
            this.widgets.push({ id: 'widget-' + Date.now(), type: 'favorite', x: 0, y: 0, w: 1, h: 2, config: { title: data.title, url: data.url, icon: data.icon, autoFavicon: data.auto_favicon === 'on', logoData: data.logo_data || '', linkShapeMigrated:true,linkSmallMigrated:true,linkMediumMigrated:true,linkCmMigrated:true,linkGridMigrated:true } });
        }
        this.renderWidgets();
        await window.dashboardStore.save(this.widgets);
    }
    async deleteWidget(id) {
        this.widgets = this.widgets.filter(widget => widget.id !== id);
        this.renderWidgets();
        await window.dashboardStore.save(this.widgets);
    }
    async addWeather(data) {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(data.location)}&count=1&language=de&format=json`);
        const geo = await response.json();
        if (!geo.results || !geo.results.length) throw new Error('Ort wurde nicht gefunden.');
        const place=geo.results[0],large=data.size==='large',existing=data.widget_id?this.widgets.find(widget=>widget.id===data.widget_id):null,config={title:'Wetter',location:[place.name,place.country].filter(Boolean).join(', '),latitude:place.latitude,longitude:place.longitude};
        if(existing)existing.config=config;else this.widgets.push({id:'weather-'+Date.now(),type:'weather',x:0,y:0,w:large?6:4,h:large?4:3,config});
        this.renderWidgets(); await window.dashboardStore.save(this.widgets);
    }
    async addClock(data) {
        const existing=data.widget_id?this.widgets.find(widget=>widget.id===data.widget_id):null,config={title:data.title,timezone:data.timezone};if(existing)existing.config=config;else this.widgets.push({id:'clock-'+Date.now(),type:'clock',x:0,y:0,w:4,h:4,config});
        this.renderWidgets(); await window.dashboardStore.save(this.widgets);
    }
    async addWolOverview() {
        if (!this.widgets.some(widget => widget.type === 'wol')) this.widgets.push({ id:'wol-'+Date.now(),type:'wol',x:0,y:0,w:4,h:Math.max(2,this.settings.wolDevices.length+1),config:{compactMigrated:true} });
        this.renderWidgets(); await window.dashboardStore.save(this.widgets);
    }
    async addCalendar(data={}) {
        const existing=data.widget_id?this.widgets.find(widget=>widget.id===data.widget_id):null,config={title:data.title||'Kalender',weekStart:data.week_start||'monday',showAdjacent:data.show_adjacent==='on',viewOffset:existing?.config.viewOffset||0};if(existing)existing.config=config;else if(!this.widgets.some(widget=>widget.type==='calendar'))this.widgets.push({id:'calendar-'+Date.now(),type:'calendar',x:0,y:0,w:5,h:4,config});
        this.renderWidgets(); await window.dashboardStore.save(this.widgets);
    }
    async addMoon(data={}) {
        const existing=data.widget_id?this.widgets.find(widget=>widget.id===data.widget_id):null,config={title:data.title||'Mondphase',showFullMoon:data.show_full_moon==='on',compactMigrated:true};if(existing)existing.config=config;else if(!this.widgets.some(widget=>widget.type==='moon'))this.widgets.push({id:'moon-'+Date.now(),type:'moon',x:0,y:0,w:3,h:3,config});
        this.renderWidgets();await window.dashboardStore.save(this.widgets);
    }
    async addText(data) {
        const existing=data.widget_id?this.widgets.find(widget=>widget.id===data.widget_id):null,config={title:data.title,text:data.text,align:data.align,fontSize:data.font_size,transparent:data.transparent==='on'};if(existing)existing.config=config;else this.widgets.push({id:'text-'+Date.now(),type:'text',x:0,y:0,w:4,h:2,config});this.renderWidgets();await window.dashboardStore.save(this.widgets);
    }
    renderMoonWidgets() {
        const synodicDays=29.53058867,epoch=Date.UTC(2000,0,6,18,14),now=new Date(),cycles=(now.getTime()-epoch)/(synodicDays*86400000),phase=((cycles%1)+1)%1,illumination=Math.round((1-Math.cos(phase*2*Math.PI))*50);
        const phases=[['Neumond','🌑'],['Zunehmende Sichel','🌒'],['Erstes Viertel','🌓'],['Zunehmender Mond','🌔'],['Vollmond','🌕'],['Abnehmender Mond','🌖'],['Letztes Viertel','🌗'],['Abnehmende Sichel','🌘']],index=Math.floor((phase+.0625)*8)%8;
        const nextFullCycle=Math.floor(cycles-.5)+1.5,nextFull=new Date(epoch+nextFullCycle*synodicDays*86400000);
        document.querySelectorAll('[data-moon-id]').forEach(element=>{const widget=this.widgets.find(item=>item.id===element.dataset.moonId);element.querySelector('.moon-phase-name').textContent=phases[index][0];element.querySelector('.moon-symbol').textContent=phases[index][1];element.querySelector('.moon-percent').textContent=illumination+'%';element.querySelector('.moon-full strong').textContent=nextFull.toLocaleDateString('de-CH',{day:'2-digit',month:'long',year:'numeric'});element.querySelector('.moon-full').style.display=widget?.config.showFullMoon===false?'none':'';element.querySelector('.moon-progress i').style.width=illumination+'%';});
    }
    renderCalendars() {
        this.widgets.filter(widget=>widget.type==='calendar').forEach(widget=>{
            const element=document.querySelector(`[data-calendar-id="${widget.id}"]`); if(!element)return;
            const today=new Date(),date=new Date(today.getFullYear(),today.getMonth()+(widget.config.viewOffset||0),1),year=date.getFullYear(),month=date.getMonth();
            element.querySelector('.calendar-month').textContent=date.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
            const sunday=widget.config.weekStart==='sunday',first=sunday?date.getDay():(date.getDay()+6)%7,days=new Date(year,month+1,0).getDate(),previousDays=new Date(year,month,0).getDate(); let html='';
            element.querySelector('.calendar-weekdays').innerHTML=(sunday?['S','M','D','M','D','F','S']:['M','D','M','D','F','S','S']).map(day=>`<span>${day}</span>`).join('');
            for(let cell=0;cell<42;cell++){let day,muted=false,cellDate;if(cell<first){day=previousDays-first+cell+1;muted=true;cellDate=new Date(year,month-1,day);}else if(cell>=first+days){day=cell-first-days+1;muted=true;cellDate=new Date(year,month+1,day);}else{day=cell-first+1;cellDate=new Date(year,month,day);}const isToday=cellDate.toDateString()===today.toDateString();html+=`<span class="${muted?'muted-day ':''}${isToday?'today':''}">${day}</span>`;}
            element.querySelector('.calendar-days').innerHTML=widget.config.showAdjacent===false?html.replace(/<span class="muted-day ">\d+<\/span>/g,'<span class="muted-day "></span>'):html;
        });
    }
    async saveWolDevice(data) {
        const device={title:data.title,mac:data.mac.toUpperCase(),host:(data.host||'').trim(),statusPort:data.status_port?Number(data.status_port):null,broadcast:data.broadcast,port:Number(data.port),imageData:data.image_data||''}, index=data.device_index;
        if (index !== '') this.settings.wolDevices[Number(index)] = device; else this.settings.wolDevices.push(device);
        await this.saveSettings(); this.renderWidgets();
    }
    renderWolDevices() {
        const list=document.getElementById('wol-manage-list'); if(!list)return;
        list.innerHTML=this.settings.wolDevices.map((device,index)=>`<div class="wol-item glass-card">${device.imageData?`<img class="wol-header-image" src="${escapeAttribute(device.imageData)}" alt="">`:''}<div class="wol-info"><strong>${device.title}</strong><small>${device.mac}</small></div><div class="wol-header-actions"><button onclick="editWolDevice(event,${index})" title="Konfigurieren"><i class="fas fa-cog"></i></button><button class="start-btn-round" data-wol-index="${index}" onclick="wakeWolDevice(event,${index},'header-wol-status-${index}')" title="Starten"><i class="fas fa-play"></i></button></div><em id="header-wol-status-${index}"></em></div>`).join('');
        this.refreshWolStatus();
    }
    async refreshWolStatus() {
        if(this.wolStatusBusy)return; this.wolStatusBusy=true;
        try {
            await Promise.all(this.settings.wolDevices.map(async (device,index)=>{
                if(!device.host)return;
                let online=false;
                try { const port=device.statusPort?`&port=${device.statusPort}`:''; const response=await fetch(`/api/device-status?host=${encodeURIComponent(device.host)}${port}`,{cache:'no-store'}); const data=await response.json(); online=response.ok&&data.online===true; } catch(_) {}
                this.wolOnlineState ||= {};
                if(this.wolOnlineState[index]===false&&online)showDashboardToast(`${device.title} ist jetzt online`,'fa-check');
                this.wolOnlineState[index]=online;
                document.querySelectorAll(`[data-wol-index="${index}"]`).forEach(button=>button.classList.toggle('online',online));
                const status=document.getElementById(`wol-widget-status-${index}`); if(status)status.textContent=online?'Online':'Offline';
            }));
        } finally { this.wolStatusBusy=false; }
    }
    async refreshWeatherWidgets() {
        for (const widget of this.widgets.filter(item => item.type === 'weather')) {
            const element = document.querySelector(`[data-weather-id="${widget.id}"]`); if (!element) continue;
            try {
                if (widget.config.latitude == null) {
                    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(widget.config.location)}&count=1&language=de&format=json`).then(r => r.json());
                    if (!geo.results?.length) continue; widget.config.latitude = geo.results[0].latitude; widget.config.longitude = geo.results[0].longitude;
                }
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${widget.config.latitude}&longitude=${widget.config.longitude}&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
                const weather = await fetch(url).then(r => r.json()), current = weather.current, daily = weather.daily, info = weatherInfo(current.weather_code, current.is_day);
                element.querySelector('.weather-temp').textContent = Math.round(current.temperature_2m) + '°';
                element.querySelector('.weather-symbol').textContent = info.icon; element.querySelector('.weather-condition').textContent = info.label;
                element.querySelector('.weather-range').textContent = `H: ${Math.round(daily.temperature_2m_max[0])}°  T: ${Math.round(daily.temperature_2m_min[0])}°`;
                element.querySelector('.weather-updated').textContent = `Gefühlt ${Math.round(current.apparent_temperature)}°`;
                element.closest('.weather-card').dataset.weather = info.theme;
            } catch (_) { element.querySelector('.weather-condition').textContent = 'Wetter nicht verfügbar'; }
        }
    }
    applySettings() {
        const s = this.settings;
        const light = s.theme === 'light' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
        const panelColor = light && s.panelColor === '#000000' ? '#ffffff' : s.panelColor;
        const textColor = light && s.textColor === '#ffffff' ? '#20242c' : s.textColor;
        document.documentElement.style.setProperty('--glass-bg', colorWithAlpha(panelColor, light ? Math.min(.82, s.glassOpacity / 100 + .2) : s.glassOpacity / 100));
        document.documentElement.style.setProperty('--glass-blur', `${s.glassBlur}px`);
        document.documentElement.style.setProperty('--accent-color', s.accentColor);
        document.documentElement.style.setProperty('--accent-contrast', contrastColor(s.accentColor));
        document.documentElement.style.setProperty('--text-color', textColor);
        document.documentElement.style.setProperty('--radius', `${s.widgetRadius}px`);
        document.querySelector('.dashboard-overlay').style.background = `rgba(0,0,0,${s.backgroundDarkness / 100})`;
        document.querySelector('.dashboard-bg').style.backgroundImage = s.backgroundData ? `url("${s.backgroundData}")` : '';
        document.querySelector('.dashboard-bg').style.filter = `blur(${s.backgroundBlur}px)`;
        document.querySelector('.dashboard-bg').style.transform = s.backgroundBlur ? 'scale(1.06)' : '';
        document.body.classList.toggle('theme-light', light);
        const dashboardTitle=(s.dashboardTitle||'Dashboard').trim()||'Dashboard';
        document.getElementById('dashboard-title').textContent=dashboardTitle;
        document.title=dashboardTitle;
        if (this.grid) { this.grid.margin(s.gridGap); this.grid.float(Boolean(s.gridSnap)); }
        this.populateSettingsForm();
    }
    populateSettingsForm() {
        const s = this.settings;
        document.getElementById('setting-dashboard-title').value = s.dashboardTitle || 'Dashboard';
        document.getElementById('setting-grid-snap').checked = s.gridSnap;
        document.getElementById('setting-grid-gap').value = s.gridGap;
        document.getElementById('setting-glass-opacity').value = s.glassOpacity;
        document.getElementById('setting-glass-blur').value = s.glassBlur;
        document.getElementById('setting-accent-color').value = s.accentColor;
        document.getElementById('setting-text-color').value = s.textColor;
        document.getElementById('setting-panel-color').value = s.panelColor;
        document.getElementById('setting-widget-radius').value = s.widgetRadius;
        document.getElementById('setting-background-darkness').value = s.backgroundDarkness;
        document.getElementById('setting-background-blur').value = s.backgroundBlur;
        document.getElementById('setting-server-address').value = s.serverAddress;
        document.getElementById('setting-ping-target').value = s.pingTarget;
        document.getElementById('settings-bg-preview').style.backgroundImage = s.backgroundData ? `url("${s.backgroundData}")` : '';
        document.querySelectorAll('[data-theme]').forEach(button => button.classList.toggle('active', button.dataset.theme === s.theme));
    }
    async saveSettings() { this.applySettings(); await window.dashboardStore.saveSettings(this.settings); }
    async resetLayout() { this.widgets = JSON.parse(JSON.stringify(DEFAULT_WIDGETS)); this.renderWidgets(); await window.dashboardStore.save(this.widgets); }
    async resetDashboard() { this.settings = { ...DEFAULT_SETTINGS }; await this.resetLayout(); await this.saveSettings(); }
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        const btn = document.getElementById('btn-edit-mode');
        if (this.isEditMode) {
            document.body.classList.add('edit-mode');
            this.grid.setStatic(false);
            btn.textContent = "Fertig";
            btn.classList.add('btn-edit-active');
        } else {
            document.body.classList.remove('edit-mode');
            this.grid.setStatic(true);
            btn.textContent = "Bearbeiten";
            btn.classList.remove('btn-edit-active');
            clearTimeout(this.layoutSaveTimer); this.saveLayout();
        }
    }
    updateClock() {
        const now = new Date();
        document.getElementById('clock').textContent = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
        document.querySelectorAll('[data-clock-id]').forEach(element => {
            const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: element.dataset.timezone, hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
            element.querySelector('.hour-hand').style.transform = `rotate(${(parts.hour % 12) * 30 + parts.minute * .5}deg)`;
            element.querySelector('.minute-hand').style.transform = `rotate(${parts.minute * 6 + parts.second * .1}deg)`;
            element.querySelector('.second-hand').style.transform = `rotate(${parts.second * 6}deg)`;
        });
    }
}

class UIManager {
    constructor() {
        this.backdrop = document.getElementById('panel-backdrop');
        this.activePanel = null;
        this.initEvents();
    }
    initEvents() {
        const searchInput = document.getElementById('dashboard-search-input');
        const runSearch = () => {
            const value = searchInput.value.trim();
            if (!value) return searchInput.focus();
            const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
            const looksLikeAddress = !/\s/.test(value) && (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(?:\/.*)?$/i.test(value) || /^(?:www\.)?[a-z\d-]+(?:\.[a-z\d-]+)+(?:\:\d+)?(?:\/.*)?$/i.test(value));
            const target = hasScheme ? value : looksLikeAddress ? `https://${value}` : `https://www.google.com/search?q=${encodeURIComponent(value)}`;
            window.open(target, '_blank', 'noopener,noreferrer');
        };
        searchInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); runSearch(); } });
        document.getElementById('dashboard-search-button').addEventListener('click', runSearch);
        // Fenster öffnen
        document.getElementById('btn-settings').addEventListener('click', () => this.openPanel('modal-settings'));
        document.getElementById('btn-add-widget').addEventListener('click', () => this.openPanel('modal-widgets'));
        document.getElementById('gallery-add-favorite').addEventListener('click', () => {
            const form = document.getElementById('favorite-form'); form.reset(); form.elements.widget_id.value = '';
            form.elements.logo_data.value = ''; updateLogoPreview('');
            document.getElementById('favorite-form-title').textContent = 'Favorit hinzufügen';
            this.openPanel('modal-favorite-form');
        });
        document.getElementById('gallery-add-weather').addEventListener('click', () => {
            const form=document.getElementById('weather-form');form.reset();form.elements.widget_id.value='';document.getElementById('weather-form-title').textContent='Wetter-Widget hinzufügen';document.getElementById('weather-form-error').textContent = ''; this.openPanel('modal-weather-form');
        });
        document.getElementById('gallery-add-clock').addEventListener('click', () => { const form=document.getElementById('clock-form');form.reset();form.elements.widget_id.value='';document.getElementById('clock-form-title').textContent='Analoge Uhr hinzufügen';this.openPanel('modal-clock-form'); });
        document.getElementById('clock-form').addEventListener('submit', async event => { event.preventDefault(); await window.dashboardApp.addClock(Object.fromEntries(new FormData(event.currentTarget))); this.closeAll(); });
        document.getElementById('gallery-add-wol').addEventListener('click', async () => { await window.dashboardApp.addWolOverview(); this.closeAll(); });
        document.getElementById('gallery-add-calendar').addEventListener('click',()=>{const form=document.getElementById('calendar-form');form.reset();form.elements.widget_id.value='';form.elements.show_adjacent.checked=true;this.openPanel('modal-calendar-form');});
        document.getElementById('calendar-form').addEventListener('submit',async event=>{event.preventDefault();await window.dashboardApp.addCalendar(Object.fromEntries(new FormData(event.currentTarget)));this.closeAll();});
        document.getElementById('gallery-add-moon').addEventListener('click',()=>{const form=document.getElementById('moon-form');form.reset();form.elements.widget_id.value='';form.elements.show_full_moon.checked=true;this.openPanel('modal-moon-form');});
        document.getElementById('moon-form').addEventListener('submit',async event=>{event.preventDefault();await window.dashboardApp.addMoon(Object.fromEntries(new FormData(event.currentTarget)));this.closeAll();});
        document.getElementById('gallery-add-text').addEventListener('click',()=>{const form=document.getElementById('text-form');form.reset();form.elements.widget_id.value='';document.getElementById('text-form-title').textContent='Textblock hinzufügen';this.openPanel('modal-text-form');});
        document.getElementById('text-form').addEventListener('submit',async event=>{event.preventDefault();await window.dashboardApp.addText(Object.fromEntries(new FormData(event.currentTarget)));this.closeAll();});
        document.getElementById('btn-new-wol-device').addEventListener('click', event => { event.stopPropagation(); const form=document.getElementById('wol-form'); form.reset(); form.elements.device_index.value=''; form.elements.image_data.value=''; updateWolImagePreview(''); document.getElementById('wol-form-title').textContent='Wake-on-LAN-Gerät hinzufügen'; document.getElementById('wol-form-error').textContent=''; this.openPanel('modal-wol-form'); });
        document.getElementById('wol-form').addEventListener('submit', async event => { event.preventDefault(); const errorBox=document.getElementById('wol-form-error'); try { await window.dashboardApp.saveWolDevice(Object.fromEntries(new FormData(event.currentTarget))); this.closeAll(); } catch(error) { errorBox.textContent=error.message; } });
        document.querySelector('#wol-form [name="device_image_file"]').addEventListener('change', event => {
            const file=event.target.files[0]; if(!file)return; const allowed=['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'];
            if((!allowed.includes(file.type)&&!file.name.toLowerCase().endsWith('.ico'))||file.size>750*1024){alert('Bitte PNG, JPG, WebP oder ICO bis maximal 750 KB auswählen.');event.target.value='';return;}
            const reader=new FileReader(); reader.onload=()=>{document.getElementById('wol-form').elements.image_data.value=reader.result;updateWolImagePreview(reader.result);};reader.readAsDataURL(file);
        });
        document.getElementById('remove-wol-image').addEventListener('click',()=>{const form=document.getElementById('wol-form');form.elements.image_data.value='';form.elements.device_image_file.value='';updateWolImagePreview('');});
        document.getElementById('weather-form').addEventListener('submit', async event => {
            event.preventDefault(); const errorBox = document.getElementById('weather-form-error');
            try { await window.dashboardApp.addWeather(Object.fromEntries(new FormData(event.currentTarget))); this.closeAll(); }
            catch (error) { errorBox.textContent = error.message; }
        });
        const logoInput = document.querySelector('#favorite-form [name="logo_file"]');
        logoInput.addEventListener('change', event => {
            const file = event.target.files[0]; if (!file) return;
            const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
            if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith('.ico')) { alert('Bitte nur PNG, JPG, WebP oder ICO auswählen.'); event.target.value = ''; return; }
            if (file.size > 750 * 1024) { alert('Das Logo darf maximal 750 KB gross sein.'); event.target.value = ''; return; }
            const reader = new FileReader();
            reader.onload = () => { document.getElementById('favorite-form').elements.logo_data.value = reader.result; updateLogoPreview(reader.result); };
            reader.readAsDataURL(file);
        });
        document.getElementById('remove-uploaded-logo').addEventListener('click', () => {
            const form = document.getElementById('favorite-form'); form.elements.logo_data.value = ''; form.elements.logo_file.value = ''; updateLogoPreview('');
        });
        document.getElementById('favorite-form').addEventListener('submit', async event => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget)); delete data.logo_file;
            await window.dashboardApp.addFavorite(data);
            this.closeAll();
        });
        const setting = (id, key, transform = value => value) => document.getElementById(id).addEventListener('change', async event => { window.dashboardApp.settings[key] = transform(event.target.type === 'checkbox' ? event.target.checked : event.target.value); await window.dashboardApp.saveSettings(); });
        setting('setting-grid-snap', 'gridSnap'); setting('setting-grid-gap', 'gridGap', Number);
        setting('setting-dashboard-title','dashboardTitle',value=>value.trim()||'Dashboard');
        setting('setting-glass-opacity', 'glassOpacity', Number); setting('setting-glass-blur', 'glassBlur', Number); setting('setting-background-darkness', 'backgroundDarkness', Number);
        setting('setting-accent-color','accentColor'); setting('setting-text-color','textColor'); setting('setting-panel-color','panelColor'); setting('setting-widget-radius','widgetRadius',Number); setting('setting-background-blur','backgroundBlur',Number);
        ['setting-grid-gap','setting-glass-opacity','setting-glass-blur','setting-background-darkness','setting-widget-radius','setting-background-blur','setting-accent-color','setting-text-color','setting-panel-color'].forEach(id => document.getElementById(id).addEventListener('input', event => { const map = { 'setting-grid-gap':'gridGap','setting-glass-opacity':'glassOpacity','setting-glass-blur':'glassBlur','setting-background-darkness':'backgroundDarkness','setting-widget-radius':'widgetRadius','setting-background-blur':'backgroundBlur','setting-accent-color':'accentColor','setting-text-color':'textColor','setting-panel-color':'panelColor' }; window.dashboardApp.settings[map[id]] = event.target.type === 'color' ? event.target.value : Number(event.target.value); window.dashboardApp.applySettings(); }));
        document.getElementById('setting-dashboard-title').addEventListener('input',event=>{window.dashboardApp.settings.dashboardTitle=event.target.value;const title=event.target.value.trim()||'Dashboard';document.getElementById('dashboard-title').textContent=title;document.title=title;});
        document.getElementById('btn-reset-design').addEventListener('click', async () => { const defaults = DEFAULT_SETTINGS; ['theme','glassOpacity','glassBlur','accentColor','textColor','panelColor','widgetRadius','backgroundBlur'].forEach(key => window.dashboardApp.settings[key] = defaults[key]); await window.dashboardApp.saveSettings(); });
        document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', async () => { window.dashboardApp.settings.theme = button.dataset.theme; await window.dashboardApp.saveSettings(); }));
        document.getElementById('setting-background-file').addEventListener('change', event => {
            const file = event.target.files[0]; if (!file) return;
            if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { alert('Bitte PNG, JPG oder WebP bis maximal 10 MB auswählen.'); event.target.value=''; return; }
            const reader = new FileReader(); reader.onload = async () => { window.dashboardApp.settings.backgroundData = reader.result; await window.dashboardApp.saveSettings(); }; reader.readAsDataURL(file);
        });
        document.getElementById('btn-reset-background').addEventListener('click', async () => { window.dashboardApp.settings.backgroundData = ''; document.getElementById('setting-background-file').value=''; await window.dashboardApp.saveSettings(); });
        document.getElementById('btn-save-network').addEventListener('click', async () => { window.dashboardApp.settings.serverAddress = document.getElementById('setting-server-address').value.trim(); window.dashboardApp.settings.pingTarget = document.getElementById('setting-ping-target').value.trim(); await window.dashboardApp.saveSettings(); alert('Netzwerkeinstellungen gespeichert.'); });
        document.getElementById('btn-reset-layout').addEventListener('click', async () => { if (confirm('Widget-Layout wirklich zurücksetzen?')) await window.dashboardApp.resetLayout(); });
        document.getElementById('btn-reset-dashboard').addEventListener('click', async () => { if (confirm('Dashboard und Einstellungen vollständig zurücksetzen?')) { await window.dashboardApp.resetDashboard(); this.closeAll(); } });
        document.getElementById('btn-export-dashboard').addEventListener('click', () => { const blob = new Blob([JSON.stringify(window.dashboardStore.data, null, 2)], {type:'application/json'}), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'dashboard-backup.json'; link.click(); URL.revokeObjectURL(link.href); });
        document.getElementById('setting-import-file').addEventListener('change', async event => { try { const data = JSON.parse(await event.target.files[0].text()); if (!Array.isArray(data.widgets) || typeof data.settings !== 'object') throw new Error(); window.dashboardApp.widgets = data.widgets; window.dashboardApp.settings = { ...DEFAULT_SETTINGS, ...data.settings }; window.dashboardStore.data = data; window.dashboardApp.applySettings(); window.dashboardApp.renderWidgets(); await window.dashboardStore.save(window.dashboardApp.widgets); await window.dashboardStore.saveSettings(window.dashboardApp.settings); alert('Dashboard erfolgreich importiert.'); } catch (_) { alert('Die Datei ist kein gültiges Dashboard-Backup.'); } event.target.value=''; });
        
        // Fenster schliessen
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.closePanel(e.currentTarget.getAttribute('data-close')));
        });
        this.backdrop.addEventListener('click', () => this.closeAll());
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeAll(); });

        // Tab Navigation Settings
        const menuItems = document.querySelectorAll('#settings-menu li');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                menuItems.forEach(li => li.classList.remove('active'));
                document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
                e.currentTarget.classList.add('active');
                document.getElementById('settings-title').textContent = e.currentTarget.textContent.trim();
                document.getElementById(e.currentTarget.getAttribute('data-target')).classList.add('active');
            });
        });
    }
    openPanel(id) {
        this.closeAll();
        const panel = document.getElementById(id);
        if (panel) { panel.classList.add('open'); this.backdrop.classList.add('active'); this.activePanel = panel; }
    }
    closePanel(id) {
        const panel = document.getElementById(id);
        if (panel) panel.classList.remove('open');
        this.backdrop.classList.remove('active');
        this.activePanel = null;
    }
    closeAll() {
        if (this.activePanel) { this.activePanel.classList.remove('open'); this.activePanel = null; }
        this.backdrop.classList.remove('active');
    }
}

window.editWidget = function(event, id) {
    event.preventDefault(); event.stopPropagation();
    const widget = window.dashboardApp.widgets.find(item => item.id === id);
    if (!widget) return;
    if (widget.type === 'wol') {
        window.dashboardApp.renderWolDevices(); window.uiManager.openPanel('modal-wol-manage'); return;
    }
    if(widget.type==='weather'){const form=document.getElementById('weather-form');form.reset();form.elements.widget_id.value=widget.id;form.elements.location.value=widget.config.location;form.elements.size.value=widget.w>=6?'large':'medium';document.getElementById('weather-form-title').textContent='Wetter konfigurieren';document.getElementById('weather-form-error').textContent='';window.uiManager.openPanel('modal-weather-form');return;}
    if(widget.type==='clock'){const form=document.getElementById('clock-form');form.reset();form.elements.widget_id.value=widget.id;form.elements.title.value=widget.config.title;form.elements.timezone.value=widget.config.timezone;document.getElementById('clock-form-title').textContent='Analoge Uhr konfigurieren';window.uiManager.openPanel('modal-clock-form');return;}
    if(widget.type==='calendar'){const form=document.getElementById('calendar-form');form.reset();form.elements.widget_id.value=widget.id;form.elements.title.value=widget.config.title||'Kalender';form.elements.week_start.value=widget.config.weekStart||'monday';form.elements.show_adjacent.checked=widget.config.showAdjacent!==false;window.uiManager.openPanel('modal-calendar-form');return;}
    if(widget.type==='moon'){const form=document.getElementById('moon-form');form.reset();form.elements.widget_id.value=widget.id;form.elements.title.value=widget.config.title||'Mondphase';form.elements.show_full_moon.checked=widget.config.showFullMoon!==false;window.uiManager.openPanel('modal-moon-form');return;}
    if(widget.type==='text'){const form=document.getElementById('text-form');form.reset();form.elements.widget_id.value=widget.id;form.elements.title.value=widget.config.title||'';form.elements.text.value=widget.config.text||'';form.elements.align.value=widget.config.align||'left';form.elements.font_size.value=widget.config.fontSize||'medium';form.elements.transparent.checked=Boolean(widget.config.transparent);document.getElementById('text-form-title').textContent='Textblock bearbeiten';window.uiManager.openPanel('modal-text-form');return;}
    if (widget.type !== 'favorite') return alert('Die Konfiguration für diesen Widget-Typ folgt später.');
    const form = document.getElementById('favorite-form');
    form.elements.widget_id.value = widget.id; form.elements.title.value = widget.config.title; form.elements.url.value = widget.config.url; form.elements.icon.value = widget.config.icon;
    form.elements.auto_favicon.checked = widget.config.autoFavicon !== false; form.elements.logo_data.value = widget.config.logoData || '';
    form.elements.logo_file.value = ''; updateLogoPreview(widget.config.logoData || '');
    document.getElementById('favorite-form-title').textContent = 'Favorit bearbeiten';
    window.uiManager.openPanel('modal-favorite-form');
};

function updateLogoPreview(source) {
    const preview = document.getElementById('logo-upload-preview'), image = preview.querySelector('img');
    image.src = source || ''; preview.classList.toggle('has-image', Boolean(source));
}

function weatherInfo(code, isDay) {
    if (code === 0) return { label: 'Klar', icon: isDay ? '☀️' : '🌙', theme: isDay ? 'clear' : 'night' };
    if ([1,2,3].includes(code)) return { label: code === 3 ? 'Bewölkt' : 'Leicht bewölkt', icon: isDay ? '🌤️' : '☁️', theme: 'cloud' };
    if ([45,48].includes(code)) return { label: 'Nebel', icon: '🌫️', theme: 'cloud' };
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return { label: 'Regen', icon: '🌧️', theme: 'rain' };
    if ([71,73,75,77,85,86].includes(code)) return { label: 'Schnee', icon: '❄️', theme: 'snow' };
    return { label: 'Gewitter', icon: '⛈️', theme: 'storm' };
}
window.deleteWidget = async function(event, id) {
    event.preventDefault(); event.stopPropagation();
    if (confirm('Widget wirklich löschen?')) await window.dashboardApp.deleteWidget(id);
};

window.editWolDevice = function(event, index) {
    event.preventDefault(); event.stopPropagation(); const device=window.dashboardApp.settings.wolDevices[index],form=document.getElementById('wol-form');
    form.reset(); form.elements.device_index.value=index; form.elements.title.value=device.title; form.elements.mac.value=device.mac; form.elements.host.value=device.host||''; form.elements.status_port.value=device.statusPort||''; form.elements.broadcast.value=device.broadcast; form.elements.port.value=device.port; form.elements.image_data.value=device.imageData||''; updateWolImagePreview(device.imageData||'');
    document.getElementById('wol-form-title').textContent='Wake-on-LAN-Gerät bearbeiten'; document.getElementById('wol-form-error').textContent=''; window.uiManager.openPanel('modal-wol-form');
};

function updateWolImagePreview(source){const preview=document.getElementById('wol-image-preview'),image=preview.querySelector('img');image.src=source||'';preview.classList.toggle('has-image',Boolean(source));}

window.wakeWolDevice = async function(event, index, statusId) {
    event.preventDefault(); event.stopPropagation();
    const device=window.dashboardApp.settings.wolDevices[index],status=document.getElementById(statusId),button=event.currentTarget;
    if (!device || button.disabled) return; button.disabled=true; button.classList.add('sending'); if(status)status.textContent='Magic Packet wird gesendet …';
    try {
        const response = await fetch('/api/wol', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(device) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Senden fehlgeschlagen');
        button.classList.remove('sending'); button.classList.add('sent'); if(status)status.textContent='Startsignal gesendet';
        showDashboardToast(`${device.title} wird gestartet …`);
        [5000,10000,20000].forEach(delay=>setTimeout(()=>window.dashboardApp.refreshWolStatus(),delay));
    } catch (error) { button.classList.remove('sending'); button.classList.add('failed'); if(status)status.textContent=error.message; }
    setTimeout(()=>{button.disabled=false;button.classList.remove('sent','failed');if(status)status.textContent=statusId.startsWith('header')?'':'Bereit';},3500);
};

window.changeCalendarMonth = async function(event,id,direction){event.preventDefault();event.stopPropagation();const widget=window.dashboardApp.widgets.find(item=>item.id===id);if(!widget)return;widget.config.viewOffset=(widget.config.viewOffset||0)+direction;window.dashboardApp.renderCalendars();await window.dashboardStore.save(window.dashboardApp.widgets);};

window.addEventListener('dashboard-auth-ready', () => {
    window.dashboardApp = new Dashboard();
    window.uiManager = new UIManager();
});
