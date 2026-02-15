class PowerMonitor {
    constructor() {
        this.baseUrl = window.location.origin;
        this.currentData = null;
        this.updateInterval = 3000;
        this.alarmSettings = {};
        this.activeAlarms = new Set();
        this.isAlarmMuted = false;
        this.availableDevices = [];
        this.currentDevice = null;
        this.deviceSelected = false;
        this.isAdmin = false;
        this.treeData = [];
        this.chartData = {
            timestamps: [],
            voltages: { Ua: [], Ub: [], Uc: [] },
            currents: { Ia: [], Ib: [], Ic: [], In: [] },
            powers: { Pa: [], Pb: [], Pc: [], Total: [] }
        };
        this.charts = {};
        this.checkAuth();
    }

    async checkAuth() {
        sessionStorage.removeItem('authCheckInProgress');
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/status`, { credentials: 'include' });
            const data = await response.json();
            if (!data.authenticated) { window.location.href = '/login.html'; return; }
            const userEl = document.getElementById('currentUser');
            if (userEl) userEl.textContent = data.username;
            const roleEl = document.getElementById('userRole');
            if (roleEl && data.role) {
                roleEl.textContent = data.role;
                roleEl.className = 'avatar-role' + (data.role === 'admin' ? ' admin' : '');
            }
            const avatarCircle = document.getElementById('avatarCircle');
            if (avatarCircle) {
                const firstLetter = (data.username || '?').charAt(0).toUpperCase();
                avatarCircle.textContent = firstLetter;
                if (data.role === 'admin') avatarCircle.classList.add('admin');
            }
            if (data.role === 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => { el.classList.remove('hidden'); el.classList.add('visible'); });
                const banner = document.getElementById('adminBanner');
                if (banner) banner.classList.remove('hidden');
                this.isAdmin = true;
            }
            // Hide admin elements for regular users
            if (data.role !== 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
            this.userId = data.userId;
            this.init();
        } catch (error) {
            console.error('Auth check failed:', error);
            sessionStorage.removeItem('authCheckInProgress');
            window.location.href = '/login.html';
        }
    }

    init() {
        this.setupEventListeners();
        this.loadAlarmSettings();
        this.initializeCharts();
        if (this.isAdmin) {
            this.loadTree();
        } else {
            this.loadUserDevices();
        }
        // Don't load data until a device is selected
        this.showSelectDeviceMessage();
        this.refreshInterval = setInterval(() => {
            if (this.deviceSelected) {
                this.loadLatestData();
                this.updateCharts();
            }
        }, this.updateInterval);
    }

    setupEventListeners() {
        const muteBtn = document.getElementById('muteAlarm');
        if (muteBtn) muteBtn.addEventListener('click', () => { this.isAlarmMuted = true; this.stopAlarmSound(); this.updateAlarmBanner(); });
        const deviceSelect = document.getElementById('deviceSelect');
        if (deviceSelect) deviceSelect.addEventListener('change', (e) => {
            if (!e.target.value) return;
            this.currentDevice = e.target.value;
            this.deviceSelected = true;
            this.hideSelectDeviceMessage();
            this.resetChartData();
            this.loadLatestData();
        });
    }

    // ===== USER: Load their devices into sidebar =====
    async loadUserDevices() {
        try {
            const res = await fetch(`${this.baseUrl}/api/my/devices`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed');
            const devices = await res.json();
            const sidebar = document.getElementById('deviceSidebar');
            if (!sidebar) return;
            if (devices.length === 0) {
                sidebar.innerHTML = '<div class="empty-state"><i class="fas fa-microchip"></i><p>No devices assigned</p></div>';
                return;
            }
            sidebar.innerHTML = devices.map(d => `
                <div class="sidebar-device ${d.deviceId === this.currentDevice ? 'active' : ''}" data-device="${d.deviceId}" onclick="window.pm.selectDevice('${d.deviceId}')">
                    <i class="fas fa-microchip"></i>
                    <div class="sidebar-device-info">
                        <div class="sidebar-device-name">${d.name || d.deviceId}</div>
                        <div class="sidebar-device-id">${d.deviceId}</div>
                    </div>
                </div>
            `).join('');
            this.populateDeviceSelector(devices.map(d => d.deviceId));
        } catch (e) { console.error('Error loading user devices:', e); }
    }

    showSelectDeviceMessage() {
        const dashboard = document.querySelector('.dashboard');
        if (!dashboard) return;
        if (!this.deviceSelected) {
            dashboard.style.display = 'none';
            let msg = document.getElementById('selectDeviceMsg');
            if (!msg) {
                msg = document.createElement('div');
                msg.id = 'selectDeviceMsg';
                msg.className = 'empty-state-large';
                msg.innerHTML = '<i class="fas fa-hand-pointer"></i><h2>Select a Device</h2><p>Choose a device from the sidebar to view its data</p>';
                dashboard.parentNode.insertBefore(msg, dashboard);
            }
            msg.style.display = 'flex';
        }
    }

    hideSelectDeviceMessage() {
        const msg = document.getElementById('selectDeviceMsg');
        if (msg) msg.style.display = 'none';
        const dashboard = document.querySelector('.dashboard');
        if (dashboard) dashboard.style.display = 'block';
    }

    selectDevice(deviceId) {
        this.currentDevice = deviceId;
        this.deviceSelected = true;
        this.hideSelectDeviceMessage();
        this.resetChartData();
        this.loadLatestData();
        // Update sidebar active state
        document.querySelectorAll('.sidebar-device').forEach(el => el.classList.remove('active'));
        const active = document.querySelector(`.sidebar-device[data-device="${deviceId}"]`);
        if (active) active.classList.add('active');
        // Update tree active state
        document.querySelectorAll('.tree-device').forEach(el => el.classList.remove('active'));
        const treeActive = document.querySelector(`.tree-device[data-device="${deviceId}"]`);
        if (treeActive) treeActive.classList.add('active');
        // Update select
        const sel = document.getElementById('deviceSelect');
        if (sel) sel.value = deviceId;
        // Show dashboard
        showPage('dashboard');
    }

    populateDeviceSelector(deviceIds) {
        const sel = document.getElementById('deviceSelect');
        if (!sel) return;
        sel.innerHTML = '';
        deviceIds.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id; opt.textContent = id;
            opt.selected = id === this.currentDevice;
            sel.appendChild(opt);
        });
    }

    // ===== ADMIN: Load full tree =====
    async loadTree() {
        try {
            const res = await fetch(`${this.baseUrl}/api/admin/tree`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed');
            this.treeData = await res.json();
            this.renderTree();
            // Also collect all device IDs for the selector
            const allDevices = [];
            this.treeData.forEach(city => city.branches.forEach(branch => branch.clients.forEach(client => client.devices.forEach(dev => allDevices.push(dev.deviceId)))));
            if (allDevices.length > 0) this.populateDeviceSelector(allDevices);
        } catch (e) { console.error('Error loading tree:', e); }
    }

    getExpandedNodes() {
        const expanded = new Set();
        document.querySelectorAll('.tree-children:not(.hidden)').forEach(el => {
            const header = el.previousElementSibling;
            if (header) {
                const label = header.querySelector('.tree-label');
                if (label) expanded.add(label.textContent);
            }
        });
        return expanded;
    }

    restoreExpandedNodes(expanded) {
        document.querySelectorAll('.tree-header').forEach(header => {
            const label = header.querySelector('.tree-label');
            if (label && expanded.has(label.textContent)) {
                const children = header.nextElementSibling;
                const arrow = header.querySelector('.tree-arrow');
                if (children) children.classList.remove('hidden');
                if (arrow) arrow.classList.add('open');
            }
        });
    }

    renderTree() {
        const container = document.getElementById('deviceSidebar');
        if (!container) return;
        const expanded = this.getExpandedNodes();
        if (this.treeData.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-city"></i><p>No data. Add a city to start.</p></div>';
            return;
        }
        container.innerHTML = this.treeData.map(city => `
            <div class="tree-node tree-city">
                <div class="tree-header" onclick="toggleTree(this)">
                    <i class="fas fa-chevron-right tree-arrow"></i>
                    <i class="fas fa-city"></i>
                    <span class="tree-label">${city.name}</span>
                    <span class="tree-count">${city.branches.length}</span>
                    ${this.isAdmin ? `<div class="tree-actions">
                        <button class="tree-btn edit" onclick="event.stopPropagation();openEditCity('${city._id}','${city.name}')"><i class="fas fa-edit"></i></button>
                        <button class="tree-btn delete" onclick="event.stopPropagation();deleteCity('${city._id}','${city.name}')"><i class="fas fa-trash"></i></button>
                    </div>` : ''}
                </div>
                <div class="tree-children hidden">
                    ${city.branches.map(branch => `
                        <div class="tree-node tree-branch">
                            <div class="tree-header" onclick="toggleTree(this)">
                                <i class="fas fa-chevron-right tree-arrow"></i>
                                <i class="fas fa-building"></i>
                                <span class="tree-label">${branch.name}</span>
                                <span class="tree-count">${branch.clients.length}</span>
                                ${this.isAdmin ? `<div class="tree-actions">
                                    <button class="tree-btn edit" onclick="event.stopPropagation();openEditBranch('${branch._id}','${branch.name}','${city._id}')"><i class="fas fa-edit"></i></button>
                                    <button class="tree-btn delete" onclick="event.stopPropagation();deleteBranch('${branch._id}','${branch.name}')"><i class="fas fa-trash"></i></button>
                                </div>` : ''}
                            </div>
                            <div class="tree-children hidden">
                                ${branch.clients.map(client => `
                                    <div class="tree-node tree-client">
                                        <div class="tree-header" onclick="toggleTree(this)">
                                            <i class="fas fa-chevron-right tree-arrow"></i>
                                            <i class="fas fa-user"></i>
                                            <span class="tree-label">${client.name}</span>
                                            <span class="tree-count">${client.devices.length}</span>
                                            ${this.isAdmin ? `<div class="tree-actions">
                                                <button class="tree-btn edit" onclick="event.stopPropagation();openEditClient('${client._id}','${client.name}','${branch._id}')"><i class="fas fa-edit"></i></button>
                                                <button class="tree-btn delete" onclick="event.stopPropagation();deleteClientItem('${client._id}','${client.name}')"><i class="fas fa-trash"></i></button>
                                            </div>` : ''}
                                        </div>
                                        <div class="tree-children hidden">
                                            ${client.devices.map(dev => `
                                                <div class="tree-node tree-device ${dev.deviceId === this.currentDevice ? 'active' : ''}" data-device="${dev.deviceId}" onclick="window.pm.selectDevice('${dev.deviceId}')">
                                                    <div class="tree-header">
                                                        <i class="fas fa-microchip"></i>
                                                        <span class="tree-label">${dev.name || dev.deviceId}</span>
                                                        <span class="tree-id">${dev.deviceId}</span>
                                                        ${this.isAdmin ? `<div class="tree-actions">
                                                            <button class="tree-btn edit" onclick="event.stopPropagation();openEditDevice('${dev._id}','${dev.name||dev.deviceId}','${client._id}')"><i class="fas fa-edit"></i></button>
                                                            <button class="tree-btn delete" onclick="event.stopPropagation();deleteDevice('${dev._id}','${dev.deviceId}')"><i class="fas fa-trash"></i></button>
                                                        </div>` : ''}
                                                    </div>
                                                </div>
                                            `).join('')}
                                            ${this.isAdmin ? `<div class="tree-add" onclick="event.stopPropagation();openAddDevice('${client._id}')"><i class="fas fa-plus"></i> Add Device</div>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                                ${this.isAdmin ? `<div class="tree-add" onclick="event.stopPropagation();openAddClient('${branch._id}')"><i class="fas fa-plus"></i> Add Client</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                    ${this.isAdmin ? `<div class="tree-add" onclick="event.stopPropagation();openAddBranch('${city._id}')"><i class="fas fa-plus"></i> Add Branch</div>` : ''}
                </div>
            </div>
        `).join('');
        this.restoreExpandedNodes(expanded);
    }

    // ===== DATA DISPLAY =====
    async loadLatestData() {
        if (!this.currentDevice || !this.deviceSelected) return;
        try {
            const response = await fetch(`${this.baseUrl}/api/data/latest?device=${encodeURIComponent(this.currentDevice)}`, { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch data');
            const data = await response.json();
            this.currentData = data;
            this.updateDisplay(data);
            this.updateChartData(data);
            this.checkAlarms(data);
            this.updateConnectionStatus(true);
        } catch (error) {
            console.error('Error loading data:', error);
            this.updateConnectionStatus(false);
        }
    }

    updateDisplay(data) {
        if (!data || !data.powerData) return;
        const pd = data.powerData;
        this.updateElement('totalPower', `${pd.activePower.Total.toFixed(2)} kW`);
        this.updateElement('frequency', `${pd.frequency.toFixed(2)} Hz`);
        this.updateElement('powerFactor', pd.powerFactor.Total.toFixed(3));
        this.updateElement('energyImport', `${pd.energy.ActiveImport.toFixed(2)} kWh`);
        this.updateElement('voltageUa', `${pd.voltages.Ua.toFixed(1)} V`);
        this.updateElement('voltageUb', `${pd.voltages.Ub.toFixed(1)} V`);
        this.updateElement('voltageUc', `${pd.voltages.Uc.toFixed(1)} V`);
        this.updateElement('voltageUab', `${pd.voltages.Uab.toFixed(1)} V`);
        this.updateElement('voltageUbc', `${pd.voltages.Ubc.toFixed(1)} V`);
        this.updateElement('voltageUca', `${pd.voltages.Uca.toFixed(1)} V`);
        this.updateElement('voltageA', `${pd.voltages.Ua.toFixed(1)} V`);
        this.updateElement('voltageB', `${pd.voltages.Ub.toFixed(1)} V`);
        this.updateElement('voltageC', `${pd.voltages.Uc.toFixed(1)} V`);
        this.updateElement('currentA', `${pd.currents.Ia.toFixed(2)} A`);
        this.updateElement('currentB', `${pd.currents.Ib.toFixed(2)} A`);
        this.updateElement('currentC', `${pd.currents.Ic.toFixed(2)} A`);
        this.updateElement('powerA', `${pd.activePower.Pa.toFixed(2)} kW`);
        this.updateElement('powerB', `${pd.activePower.Pb.toFixed(2)} kW`);
        this.updateElement('powerC', `${pd.activePower.Pc.toFixed(2)} kW`);
        this.updateElement('pfA', pd.powerFactor.PFa.toFixed(3));
        this.updateElement('pfB', pd.powerFactor.PFb.toFixed(3));
        this.updateElement('pfC', pd.powerFactor.PFc.toFixed(3));
        this.updateElement('activePowerA', pd.activePower.Pa.toFixed(3));
        this.updateElement('activePowerB', pd.activePower.Pb.toFixed(3));
        this.updateElement('activePowerC', pd.activePower.Pc.toFixed(3));
        this.updateElement('activePowerTotal', pd.activePower.Total.toFixed(3));
        this.updateElement('reactivePowerA', pd.reactivePower.Qa.toFixed(3));
        this.updateElement('reactivePowerB', pd.reactivePower.Qb.toFixed(3));
        this.updateElement('reactivePowerC', pd.reactivePower.Qc.toFixed(3));
        this.updateElement('reactivePowerTotal', pd.reactivePower.Total.toFixed(3));
        this.updateElement('apparentPowerA', pd.apparentPower.Sa.toFixed(3));
        this.updateElement('apparentPowerB', pd.apparentPower.Sb.toFixed(3));
        this.updateElement('apparentPowerC', pd.apparentPower.Sc.toFixed(3));
        this.updateElement('apparentPowerTotal', pd.apparentPower.Total.toFixed(3));
        this.updateElement('powerFactorA', pd.powerFactor.PFa.toFixed(3));
        this.updateElement('powerFactorB', pd.powerFactor.PFb.toFixed(3));
        this.updateElement('powerFactorC', pd.powerFactor.PFc.toFixed(3));
        this.updateElement('powerFactorTotal', pd.powerFactor.Total.toFixed(3));
        if (pd.thd) {
            this.updateElement('thdUa', `${pd.thd.Ua?.toFixed(2) || '0.00'} %`);
            this.updateElement('thdUb', `${pd.thd.Ub?.toFixed(2) || '0.00'} %`);
            this.updateElement('thdUc', `${pd.thd.Uc?.toFixed(2) || '0.00'} %`);
            this.updateElement('thdIa', `${pd.thd.Ia?.toFixed(2) || '0.00'} %`);
            this.updateElement('thdIb', `${pd.thd.Ib?.toFixed(2) || '0.00'} %`);
            this.updateElement('thdIc', `${pd.thd.Ic?.toFixed(2) || '0.00'} %`);
        }
        const now = new Date();
        this.updateElement('lastUpdate', `Last update: ${now.toLocaleTimeString()} (${this.currentDevice})`);
    }

    updateChartData(data) {
        if (!data || !data.powerData) return;
        const pd = data.powerData;
        const timeLabel = new Date().toLocaleTimeString();
        if (this.chartData.timestamps.length >= 20) {
            this.chartData.timestamps.shift();
            Object.values(this.chartData.voltages).forEach(a => a.shift());
            Object.values(this.chartData.currents).forEach(a => a.shift());
            Object.values(this.chartData.powers).forEach(a => a.shift());
        }
        this.chartData.timestamps.push(timeLabel);
        this.chartData.voltages.Ua.push(pd.voltages.Ua);
        this.chartData.voltages.Ub.push(pd.voltages.Ub);
        this.chartData.voltages.Uc.push(pd.voltages.Uc);
        this.chartData.currents.Ia.push(pd.currents.Ia);
        this.chartData.currents.Ib.push(pd.currents.Ib);
        this.chartData.currents.Ic.push(pd.currents.Ic);
        this.chartData.currents.In.push(pd.currents.In);
        this.chartData.powers.Pa.push(pd.activePower.Pa);
        this.chartData.powers.Pb.push(pd.activePower.Pb);
        this.chartData.powers.Pc.push(pd.activePower.Pc);
        this.chartData.powers.Total.push(pd.activePower.Total);
    }

    updateCharts() {
        if (this.chartData.timestamps.length === 0) return;
        if (this.charts.voltage) {
            this.charts.voltage.data.labels = this.chartData.timestamps;
            this.charts.voltage.data.datasets[0].data = this.chartData.voltages.Ua;
            this.charts.voltage.data.datasets[1].data = this.chartData.voltages.Ub;
            this.charts.voltage.data.datasets[2].data = this.chartData.voltages.Uc;
            this.charts.voltage.update('none');
        }
        if (this.charts.current) {
            this.charts.current.data.labels = this.chartData.timestamps;
            this.charts.current.data.datasets[0].data = this.chartData.currents.Ia;
            this.charts.current.data.datasets[1].data = this.chartData.currents.Ib;
            this.charts.current.data.datasets[2].data = this.chartData.currents.Ic;
            this.charts.current.data.datasets[3].data = this.chartData.currents.In;
            this.charts.current.update('none');
        }
        if (this.charts.power) {
            this.charts.power.data.labels = this.chartData.timestamps;
            this.charts.power.data.datasets[0].data = this.chartData.powers.Pa;
            this.charts.power.data.datasets[1].data = this.chartData.powers.Pb;
            this.charts.power.data.datasets[2].data = this.chartData.powers.Pc;
            this.charts.power.data.datasets[3].data = this.chartData.powers.Total;
            this.charts.power.update('none');
        }
    }

    resetChartData() {
        this.chartData = { timestamps: [], voltages: { Ua: [], Ub: [], Uc: [] }, currents: { Ia: [], Ib: [], Ic: [], In: [] }, powers: { Pa: [], Pb: [], Pc: [], Total: [] } };
        ['voltage', 'current', 'power'].forEach(k => {
            if (this.charts[k]) { this.charts[k].data.labels = []; this.charts[k].data.datasets.forEach(ds => ds.data = []); this.charts[k].update('none'); }
        });
    }

    // ===== ALARMS =====
    loadAlarmSettings() {
        const saved = localStorage.getItem('powerMonitorAlarmSettings');
        if (saved) { this.alarmSettings = JSON.parse(saved); this.populateSettingsForm(); }
        else this.setDefaultAlarmSettings();
    }

    setDefaultAlarmSettings() {
        this.alarmSettings = {
            voltageUa: { min: 200, max: 250 }, voltageUb: { min: 200, max: 250 }, voltageUc: { min: 200, max: 250 },
            voltageUab: { min: 350, max: 450 }, voltageUbc: { min: 350, max: 450 }, voltageUca: { min: 350, max: 450 },
            currentIa: { max: 100 }, currentIb: { max: 100 }, currentIc: { max: 100 }, currentIn: { max: 50 },
            activePowerA: { max: 50 }, activePowerB: { max: 50 }, activePowerC: { max: 50 }, activePowerTotal: { max: 150 },
            powerFactorA: { min: 0.8 }, powerFactorB: { min: 0.8 }, powerFactorC: { min: 0.8 }, powerFactorTotal: { min: 0.8 }
        };
        this.saveAlarmSettings();
    }

    saveAlarmSettings() { localStorage.setItem('powerMonitorAlarmSettings', JSON.stringify(this.alarmSettings)); }

    populateSettingsForm() {
        for (const [param, limits] of Object.entries(this.alarmSettings)) {
            if (limits.min !== undefined) { const el = document.getElementById(`min_${param}`); if (el) el.value = limits.min; }
            if (limits.max !== undefined) { const el = document.getElementById(`max_${param}`); if (el) el.value = limits.max; }
        }
    }

    checkAlarms(data) {
        if (!data || !data.powerData) return;
        const pd = data.powerData;
        this.activeAlarms.clear();
        this.checkParam('voltageUa', pd.voltages.Ua); this.checkParam('voltageUb', pd.voltages.Ub); this.checkParam('voltageUc', pd.voltages.Uc);
        this.checkParam('voltageUab', pd.voltages.Uab); this.checkParam('voltageUbc', pd.voltages.Ubc); this.checkParam('voltageUca', pd.voltages.Uca);
        this.checkParam('currentIa', pd.currents.Ia); this.checkParam('currentIb', pd.currents.Ib); this.checkParam('currentIc', pd.currents.Ic); this.checkParam('currentIn', pd.currents.In);
        this.checkParam('activePowerA', pd.activePower.Pa); this.checkParam('activePowerB', pd.activePower.Pb); this.checkParam('activePowerC', pd.activePower.Pc); this.checkParam('activePowerTotal', pd.activePower.Total);
        this.checkParam('powerFactorA', pd.powerFactor.PFa); this.checkParam('powerFactorB', pd.powerFactor.PFb); this.checkParam('powerFactorC', pd.powerFactor.PFc); this.checkParam('powerFactorTotal', pd.powerFactor.Total);
        this.updateAlarmBanner();
    }

    checkParam(param, value) {
        const limits = this.alarmSettings[param];
        if (!limits) return;
        let alarm = false;
        if (limits.min !== undefined && value < limits.min) alarm = true;
        if (limits.max !== undefined && value > limits.max) alarm = true;
        const led = document.getElementById(`led_${param}`);
        if (led) { led.className = alarm ? 'led alarm' : 'led normal'; if (alarm) this.activeAlarms.add(param); }
    }

    updateAlarmBanner() {
        const banner = document.getElementById('alarmBanner');
        const status = document.getElementById('alarmStatus');
        const msg = document.getElementById('alarmMessage');
        if (this.activeAlarms.size > 0) {
            if (banner) banner.classList.remove('hidden');
            if (status) { status.className = 'status-alarm'; status.textContent = `${this.activeAlarms.size} Alarm(s)`; }
            if (msg) msg.textContent = `Alarms: ${Array.from(this.activeAlarms).slice(0, 3).join(', ')}${this.activeAlarms.size > 3 ? '...' : ''}`;
            if (!this.isAlarmMuted) this.playAlarmSound();
        } else {
            if (banner) banner.classList.add('hidden');
            if (status) { status.className = 'status-normal'; status.textContent = 'No Alarms'; }
            this.stopAlarmSound();
        }
    }

    playAlarmSound() { const s = document.getElementById('alarmSound'); if (s) { s.currentTime = 0; s.play().catch(() => {}); } }
    stopAlarmSound() { const s = document.getElementById('alarmSound'); if (s) { s.pause(); s.currentTime = 0; } }

    updateElement(id, value) {
        const el = document.getElementById(id);
        if (el && el.textContent !== value) {
            el.textContent = value;
            if (!value.startsWith('0.00') && !value.startsWith('0.0 ')) {
                el.classList.add('value-updated');
                setTimeout(() => el.classList.remove('value-updated'), 500);
            }
        }
    }

    updateConnectionStatus(connected) {
        const el = document.getElementById('connectionStatus');
        if (el) { el.textContent = connected ? 'Online' : 'Offline'; el.className = connected ? 'status-online' : 'status-offline'; }
    }

    initializeCharts() {
        const opts = {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: { x: { display: true, grid: { display: false } }, y: { display: true, grid: { color: 'rgba(0,0,0,0.1)' } } },
            interaction: { intersect: false, mode: 'nearest' }
        };
        const makeDS = (label, color) => ({ label, data: [], borderColor: color, backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'), tension: 0.4, fill: true, borderWidth: 2, pointRadius: 0 });
        const vCtx = document.getElementById('voltageChart');
        if (vCtx) this.charts.voltage = new Chart(vCtx.getContext('2d'), { type: 'line', data: { labels: [], datasets: [makeDS('Ua', 'rgb(231,76,60)'), makeDS('Ub', 'rgb(52,152,219)'), makeDS('Uc', 'rgb(46,204,113)')] }, options: opts });
        const cCtx = document.getElementById('currentChart');
        if (cCtx) this.charts.current = new Chart(cCtx.getContext('2d'), { type: 'line', data: { labels: [], datasets: [makeDS('Ia', 'rgb(231,76,60)'), makeDS('Ib', 'rgb(52,152,219)'), makeDS('Ic', 'rgb(46,204,113)'), makeDS('In', 'rgb(243,156,18)')] }, options: opts });
        const pCtx = document.getElementById('powerChart');
        if (pCtx) this.charts.power = new Chart(pCtx.getContext('2d'), { type: 'line', data: { labels: [], datasets: [makeDS('Pa', 'rgb(231,76,60)'), makeDS('Pb', 'rgb(52,152,219)'), makeDS('Pc', 'rgb(46,204,113)'), makeDS('Total', 'rgb(155,89,182)')] }, options: opts });
    }
}

// ===== GLOBAL HELPERS =====

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function toggleTree(header) {
    const children = header.nextElementSibling;
    const arrow = header.querySelector('.tree-arrow');
    if (children) children.classList.toggle('hidden');
    if (arrow) arrow.classList.toggle('open');
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.getAttribute('onclick')?.includes(pageId));
    if (btn) btn.classList.add('active');
    if (pageId === 'dashboard' && window.pm && window.pm.deviceSelected) window.pm.loadLatestData();
}

function logout() {
    const m = window.pm;
    if (m && m.refreshInterval) clearInterval(m.refreshInterval);
    fetch(`${(m||{}).baseUrl || ''}/api/auth/logout`, { method: 'POST', credentials: 'include' })
        .finally(() => { sessionStorage.removeItem('authCheckInProgress'); window.location.href = '/login.html'; });
}

// ===== ADMIN CRUD =====

// City
function openAddCity() { document.getElementById('modalCityName').value = ''; document.getElementById('modalCityId').value = ''; document.getElementById('modalCityTitle').textContent = 'Add City'; openModal('cityModal'); }
function openEditCity(id, name) { document.getElementById('modalCityName').value = name; document.getElementById('modalCityId').value = id; document.getElementById('modalCityTitle').textContent = 'Edit City'; openModal('cityModal'); }
async function saveCity() {
    const id = document.getElementById('modalCityId').value;
    const name = document.getElementById('modalCityName').value.trim();
    if (!name) return showToast('City name required', 'error');
    try {
        const url = id ? `/api/admin/cities/${id}` : '/api/admin/cities';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        closeModal('cityModal'); showToast(id ? 'City updated' : 'City added');
        window.pm.loadTree();
    } catch (e) { showToast(e.message, 'error'); }
}
async function deleteCity(id, name) {
    if (!confirm(`Delete city "${name}"?`)) return;
    try {
        const res = await fetch(`/api/admin/cities/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('City deleted'); window.pm.loadTree();
    } catch (e) { showToast(e.message, 'error'); }
}

// Branch
function openAddBranch(cityId) { document.getElementById('modalBranchName').value = ''; document.getElementById('modalBranchId').value = ''; document.getElementById('modalBranchCityId').value = cityId; document.getElementById('modalBranchTitle').textContent = 'Add Branch'; openModal('branchModal'); }
function openEditBranch(id, name, cityId) { document.getElementById('modalBranchName').value = name; document.getElementById('modalBranchId').value = id; document.getElementById('modalBranchCityId').value = cityId; document.getElementById('modalBranchTitle').textContent = 'Edit Branch'; openModal('branchModal'); }
async function saveBranch() {
    const id = document.getElementById('modalBranchId').value;
    const name = document.getElementById('modalBranchName').value.trim();
    const cityId = document.getElementById('modalBranchCityId').value;
    if (!name) return showToast('Branch name required', 'error');
    try {
        const url = id ? `/api/admin/branches/${id}` : '/api/admin/branches';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, cityId }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        closeModal('branchModal'); showToast(id ? 'Branch updated' : 'Branch added');
        window.pm.loadTree();
    } catch (e) { showToast(e.message, 'error'); }
}
async function deleteBranch(id, name) {
    if (!confirm(`Delete branch "${name}"?`)) return;
    try {
        const res = await fetch(`/api/admin/branches/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Branch deleted'); window.pm.loadTree();
    } catch (e) { showToast(e.message, 'error'); }
}

// Client
function openAddClient(branchId) { document.getElementById('modalClientName').value = ''; document.getElementById('modalClientId').value = ''; document.getElementById('modalClientBranchId').value = branchId; document.getElementById('modalClientUsername').value = ''; document.getElementById('modalClientPassword').value = ''; document.getElementById('modalClientTitle').textContent = 'Add Client'; document.getElementById('clientCredentials').classList.remove('hidden'); openModal('clientModal'); }
function openEditClient(id, name, branchId) { document.getElementById('modalClientName').value = name; document.getElementById('modalClientId').value = id; document.getElementById('modalClientBranchId').value = branchId; document.getElementById('modalClientTitle').textContent = 'Edit Client'; document.getElementById('clientCredentials').classList.add('hidden'); openModal('clientModal'); }
async function saveClient() {
    const id = document.getElementById('modalClientId').value;
    const name = document.getElementById('modalClientName').value.trim();
    const branchId = document.getElementById('modalClientBranchId').value;
    if (!name) return showToast('Client name required', 'error');
    const body = { name, branchId };
    if (!id) { body.username = document.getElementById('modalClientUsername').value.trim(); body.password = document.getElementById('modalClientPassword').value; }
    try {
        const url = id ? `/api/admin/clients/${id}` : '/api/admin/clients';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        closeModal('clientModal'); showToast(id ? 'Client updated' : 'Client added');
        window.pm.loadTree();
    } catch (e) { showToast(e.message, 'error'); }
}
async function deleteClientItem(id, name) {
    if (!confirm(`Delete client "${name}"?`)) return;
    try {
        const res = await fetch(`/api/admin/clients/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Client deleted'); window.pm.loadTree();
    } catch (e) { showToast(e.message, 'error'); }
}

// Device
async function openAddDevice(clientId) {
    document.getElementById('modalDeviceClientId').value = clientId;
    document.getElementById('modalDeviceId').value = '';
    document.getElementById('modalDeviceName').value = '';
    document.getElementById('modalDeviceTitle').textContent = 'Add Device';
    document.getElementById('deviceIdGroup').classList.remove('hidden');
    // Load unregistered devices
    try {
        const res = await fetch('/api/admin/unregistered-devices', { credentials: 'include' });
        const devices = await res.json();
        const sel = document.getElementById('modalDeviceDeviceId');
        sel.innerHTML = '<option value="">-- Select Device ID --</option>' + devices.map(d => `<option value="${d}">${d}</option>`).join('');
    } catch (e) { console.error(e); }
    openModal('deviceModal');
}
function openEditDevice(id, name, clientId) { document.getElementById('modalDeviceId').value = id; document.getElementById('modalDeviceName').value = name; document.getElementById('modalDeviceClientId').value = clientId; document.getElementById('modalDeviceTitle').textContent = 'Edit Device'; document.getElementById('deviceIdGroup').classList.add('hidden'); openModal('deviceModal'); }
async function saveDevice() {
    const id = document.getElementById('modalDeviceId').value;
    const name = document.getElementById('modalDeviceName').value.trim();
    const clientId = document.getElementById('modalDeviceClientId').value;
    if (!id) {
        const deviceId = document.getElementById('modalDeviceDeviceId').value;
        if (!deviceId) return showToast('Select a device ID', 'error');
        try {
            const res = await fetch('/api/admin/devices', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, clientId, name: name || deviceId }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            closeModal('deviceModal'); showToast('Device added'); window.pm.loadTree();
        } catch (e) { showToast(e.message, 'error'); }
    } else {
        try {
            const res = await fetch(`/api/admin/devices/${id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, clientId }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            closeModal('deviceModal'); showToast('Device updated'); window.pm.loadTree();
        } catch (e) { showToast(e.message, 'error'); }
    }
}
async function deleteDevice(id, deviceId) {
    if (!confirm(`Remove device "${deviceId}" from system?`)) return;
    try {
        const res = await fetch(`/api/admin/devices/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Device removed'); window.pm.loadTree();
    } catch (e) { showToast(e.message, 'error'); }
}

// Settings
function saveSettings() {
    const m = window.pm; if (!m) return;
    const s = {};
    s.voltageUa = { min: parseFloat(document.getElementById('min_voltageUa').value) || 200, max: parseFloat(document.getElementById('max_voltageUa').value) || 250 };
    s.voltageUb = { min: parseFloat(document.getElementById('min_voltageUb').value) || 200, max: parseFloat(document.getElementById('max_voltageUb').value) || 250 };
    s.voltageUc = { min: parseFloat(document.getElementById('min_voltageUc').value) || 200, max: parseFloat(document.getElementById('max_voltageUc').value) || 250 };
    s.voltageUab = { min: parseFloat(document.getElementById('min_voltageUab').value) || 350, max: parseFloat(document.getElementById('max_voltageUab').value) || 450 };
    s.voltageUbc = { min: parseFloat(document.getElementById('min_voltageUbc').value) || 350, max: parseFloat(document.getElementById('max_voltageUbc').value) || 450 };
    s.voltageUca = { min: parseFloat(document.getElementById('min_voltageUca').value) || 350, max: parseFloat(document.getElementById('max_voltageUca').value) || 450 };
    s.currentIa = { max: parseFloat(document.getElementById('max_currentIa').value) || 100 };
    s.currentIb = { max: parseFloat(document.getElementById('max_currentIb').value) || 100 };
    s.currentIc = { max: parseFloat(document.getElementById('max_currentIc').value) || 100 };
    s.currentIn = { max: parseFloat(document.getElementById('max_currentIn').value) || 50 };
    s.activePowerA = { max: parseFloat(document.getElementById('max_activePowerA').value) || 50 };
    s.activePowerB = { max: parseFloat(document.getElementById('max_activePowerB').value) || 50 };
    s.activePowerC = { max: parseFloat(document.getElementById('max_activePowerC').value) || 50 };
    s.activePowerTotal = { max: parseFloat(document.getElementById('max_activePowerTotal').value) || 150 };
    s.powerFactorA = { min: parseFloat(document.getElementById('min_powerFactorA').value) || 0.8 };
    s.powerFactorB = { min: parseFloat(document.getElementById('min_powerFactorB').value) || 0.8 };
    s.powerFactorC = { min: parseFloat(document.getElementById('min_powerFactorC').value) || 0.8 };
    s.powerFactorTotal = { min: parseFloat(document.getElementById('min_powerFactorTotal').value) || 0.8 };
    m.alarmSettings = s; m.saveAlarmSettings();
    showToast('Settings saved'); showPage('dashboard');
}

function resetSettings() {
    if (confirm('Reset all settings to defaults?')) {
        const m = window.pm;
        if (m) { m.setDefaultAlarmSettings(); m.populateSettingsForm(); showToast('Settings reset'); }
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    window.pm = new PowerMonitor();
    window.powerMonitor = window.pm;
    showPage('dashboard');
});
