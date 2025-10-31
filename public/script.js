// Include Chart.js in your HTML head first!
// Add this to your HTML: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

class PowerMonitor {
    constructor() {
        this.baseUrl = window.location.origin;
        this.currentData = null;
        this.updateInterval = 2000;
        this.alarmSettings = {};
        this.activeAlarms = new Set();
        this.isAlarmMuted = false;
        
        // Chart data history
        this.chartData = {
            timestamps: [],
            voltages: { Ua: [], Ub: [], Uc: [] },
            currents: { Ia: [], Ib: [], Ic: [], In: [] },
            powers: { Pa: [], Pb: [], Pc: [], Total: [] },
            reactivePowers: { Qa: [], Qb: [], Qc: [], Total: [] }
        };
        
        this.charts = {};
        this.init();
    }

    init() {
        console.log("Power Monitor initialized");
        this.loadAlarmSettings();
        this.initializeCharts();
        this.setupEventListeners();
        this.loadLatestData();
        
        setInterval(() => this.loadLatestData(), this.updateInterval);
        setInterval(() => this.updateCharts(), 5000);
    }

     setupEventListeners() {
        // Mute alarm button
        document.getElementById('muteAlarm').addEventListener('click', () => {
            this.isAlarmMuted = true;
            this.stopAlarmSound();
            this.updateAlarmBanner();
        });
    }

    loadAlarmSettings() {
        const saved = localStorage.getItem('powerMonitorAlarmSettings');
        if (saved) {
            this.alarmSettings = JSON.parse(saved);
            this.populateSettingsForm();
        } else {
            this.setDefaultAlarmSettings();
        }
    }

    setDefaultAlarmSettings() {
        this.alarmSettings = {
            // Voltage limits
            voltageUa: { min: 200, max: 250 },
            voltageUb: { min: 200, max: 250 },
            voltageUc: { min: 200, max: 250 },
            voltageUab: { min: 350, max: 450 },
            voltageUbc: { min: 350, max: 450 },
            voltageUca: { min: 350, max: 450 },
            
            // Current limits (only max)
            currentIa: { max: 100 },
            currentIb: { max: 100 },
            currentIc: { max: 100 },
            currentIn: { max: 50 },
            
            // Power limits
            activePowerA: { max: 50 },
            activePowerB: { max: 50 },
            activePowerC: { max: 50 },
            activePowerTotal: { max: 150 },
            
            // Power factor limits (only min)
            powerFactorA: { min: 0.8 },
            powerFactorB: { min: 0.8 },
            powerFactorC: { min: 0.8 },
            powerFactorTotal: { min: 0.8 }
        };
        this.saveAlarmSettings();
    }

    saveAlarmSettings() {
        localStorage.setItem('powerMonitorAlarmSettings', JSON.stringify(this.alarmSettings));
    }

    populateSettingsForm() {
        for (const [param, limits] of Object.entries(this.alarmSettings)) {
            if (limits.min !== undefined) {
                const minInput = document.getElementById(`min_${param}`);
                if (minInput) minInput.value = limits.min;
            }
            if (limits.max !== undefined) {
                const maxInput = document.getElementById(`max_${param}`);
                if (maxInput) maxInput.value = limits.max;
            }
        }
    }

    checkAlarms(data) {
        if (!data || !data.powerData) return;

        const pd = data.powerData;
        this.activeAlarms.clear();

        // Check voltage alarms
        this.checkParameterAlarm('voltageUa', pd.voltages.Ua);
        this.checkParameterAlarm('voltageUb', pd.voltages.Ub);
        this.checkParameterAlarm('voltageUc', pd.voltages.Uc);
        this.checkParameterAlarm('voltageUab', pd.voltages.Uab);
        this.checkParameterAlarm('voltageUbc', pd.voltages.Ubc);
        this.checkParameterAlarm('voltageUca', pd.voltages.Uca);

        // Check current alarms
        this.checkParameterAlarm('currentIa', pd.currents.Ia);
        this.checkParameterAlarm('currentIb', pd.currents.Ib);
        this.checkParameterAlarm('currentIc', pd.currents.Ic);
        this.checkParameterAlarm('currentIn', pd.currents.In);

        // Check power alarms
        this.checkParameterAlarm('activePowerA', pd.activePower.Pa);
        this.checkParameterAlarm('activePowerB', pd.activePower.Pb);
        this.checkParameterAlarm('activePowerC', pd.activePower.Pc);
        this.checkParameterAlarm('activePowerTotal', pd.activePower.Total);

        // Check power factor alarms
        this.checkParameterAlarm('powerFactorA', pd.powerFactor.PFa);
        this.checkParameterAlarm('powerFactorB', pd.powerFactor.PFb);
        this.checkParameterAlarm('powerFactorC', pd.powerFactor.PFc);
        this.checkParameterAlarm('powerFactorTotal', pd.powerFactor.Total);

        this.updateAlarmDisplay();
    }

    checkParameterAlarm(parameter, value) {
        const limits = this.alarmSettings[parameter];
        if (!limits) return;

        let isAlarm = false;
        
        if (limits.min !== undefined && value < limits.min) {
            isAlarm = true;
        }
        if (limits.max !== undefined && value > limits.max) {
            isAlarm = true;
        }

        // Update LED
        const led = document.getElementById(`led_${parameter}`);
        if (led) {
            if (isAlarm) {
                led.className = 'led alarm';
                this.activeAlarms.add(parameter);
            } else {
                led.className = 'led normal';
            }
        }
    }

    updateAlarmDisplay() {
        const alarmBanner = document.getElementById('alarmBanner');
        const alarmStatus = document.getElementById('alarmStatus');
        const alarmMessage = document.getElementById('alarmMessage');

        if (this.activeAlarms.size > 0) {
            // Show alarm
            alarmBanner.classList.remove('hidden');
            alarmStatus.className = 'status-alarm';
            alarmStatus.textContent = `${this.activeAlarms.size} Alarm(s)`;
            
            // Create alarm message
            const alarmList = Array.from(this.activeAlarms).slice(0, 3).join(', ');
            alarmMessage.textContent = `Alarms: ${alarmList}${this.activeAlarms.size > 3 ? '...' : ''}`;
            
            // Play alarm sound if not muted
            if (!this.isAlarmMuted) {
                this.playAlarmSound();
            }
        } else {
            // No alarms
            alarmBanner.classList.add('hidden');
            alarmStatus.className = 'status-normal';
            alarmStatus.textContent = 'No Alarms';
            this.stopAlarmSound();
        }
    }

    playAlarmSound() {
        const alarmSound = document.getElementById('alarmSound');
        if (alarmSound) {
            alarmSound.currentTime = 0;
            alarmSound.play().catch(e => console.log('Audio play failed:', e));
        }
    }

    stopAlarmSound() {
        const alarmSound = document.getElementById('alarmSound');
        if (alarmSound) {
            alarmSound.pause();
            alarmSound.currentTime = 0;
        }
    }


    initializeCharts() {
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'nearest'
            }
        };

        // Voltage Chart
        const voltageCtx = document.getElementById('voltageChart').getContext('2d');
        this.charts.voltage = new Chart(voltageCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Ua (V)',
                        data: [],
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Ub (V)',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Uc (V)',
                        data: [],
                        borderColor: '#2ecc71',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                ...chartOptions,
                plugins: {
                    ...chartOptions.plugins,
                    title: {
                        display: true,
                        text: 'Phase Voltages (V)'
                    }
                }
            }
        });

        // Current Chart
        const currentCtx = document.getElementById('currentChart').getContext('2d');
        this.charts.current = new Chart(currentCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Ia (A)',
                        data: [],
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Ib (A)',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Ic (A)',
                        data: [],
                        borderColor: '#2ecc71',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'In (A)',
                        data: [],
                        borderColor: '#f39c12',
                        backgroundColor: 'rgba(243, 156, 18, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                ...chartOptions,
                plugins: {
                    ...chartOptions.plugins,
                    title: {
                        display: true,
                        text: 'Currents (A)'
                    }
                }
            }
        });

        // Power Chart
        const powerCtx = document.getElementById('powerChart').getContext('2d');
        this.charts.power = new Chart(powerCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Pa (kW)',
                        data: [],
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Pb (kW)',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Pc (kW)',
                        data: [],
                        borderColor: '#2ecc71',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Total (kW)',
                        data: [],
                        borderColor: '#9b59b6',
                        backgroundColor: 'rgba(155, 89, 182, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                ...chartOptions,
                plugins: {
                    ...chartOptions.plugins,
                    title: {
                        display: true,
                        text: 'Active Power (kW)'
                    }
                }
            }
        });
    }

    async loadLatestData() {
        try {
            const response = await fetch(`${this.baseUrl}/api/data/latest`);
            if (!response.ok) throw new Error('Failed to fetch data');
            
            const data = await response.json();
            this.currentData = data;
            this.updateDisplay(data);
            this.updateChartData(data);
            this.updateConnectionStatus(true);
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.updateConnectionStatus(false);
        }
    }

    updateDisplay(data) {
        if (!data || !data.powerData) {
            console.log("No data available");
            return;
        }

        const pd = data.powerData;
        
        // Update summary cards
        this.updateElement('totalPower', `${pd.activePower.Total.toFixed(2)} kW`);
        this.updateElement('frequency', `${pd.frequency.toFixed(2)} Hz`);
        this.updateElement('powerFactor', pd.powerFactor.Total.toFixed(3));
        this.updateElement('energyImport', `${pd.energy.ActiveImport.toFixed(2)} kWh`);

        // Update voltages
        this.updateElement('voltageUa', `${pd.voltages.Ua.toFixed(1)} V`);
        this.updateElement('voltageUb', `${pd.voltages.Ub.toFixed(1)} V`);
        this.updateElement('voltageUc', `${pd.voltages.Uc.toFixed(1)} V`);
        this.updateElement('voltageUab', `${pd.voltages.Uab.toFixed(1)} V`);
        this.updateElement('voltageUbc', `${pd.voltages.Ubc.toFixed(1)} V`);
        this.updateElement('voltageUca', `${pd.voltages.Uca.toFixed(1)} V`);

        // Update phase parameters
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

        // UPDATE: Add power analysis data
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


        // Update timestamp
        const now = new Date();
        this.updateElement('lastUpdate', `Last update: ${now.toLocaleTimeString()}`);
    }

    updateChartData(data) {
        if (!data || !data.powerData) return;

        const pd = data.powerData;
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();

        // Keep only last 20 data points
        if (this.chartData.timestamps.length >= 20) {
            this.chartData.timestamps.shift();
            Object.values(this.chartData.voltages).forEach(arr => arr.shift());
            Object.values(this.chartData.currents).forEach(arr => arr.shift());
            Object.values(this.chartData.powers).forEach(arr => arr.shift());
            // Add this for reactive power charts if needed later
            //Object.values(this.chartData.reactivePowers).forEach(arr => arr.shift());
        }

        // Add new data
        this.chartData.timestamps.push(timeLabel);
        
        // Voltages
        this.chartData.voltages.Ua.push(pd.voltages.Ua);
        this.chartData.voltages.Ub.push(pd.voltages.Ub);
        this.chartData.voltages.Uc.push(pd.voltages.Uc);
        
        // Currents
        this.chartData.currents.Ia.push(pd.currents.Ia);
        this.chartData.currents.Ib.push(pd.currents.Ib);
        this.chartData.currents.Ic.push(pd.currents.Ic);
        this.chartData.currents.In.push(pd.currents.In);
        
        // Powers
        this.chartData.powers.Pa.push(pd.activePower.Pa);
        this.chartData.powers.Pb.push(pd.activePower.Pb);
        this.chartData.powers.Pc.push(pd.activePower.Pc);
        this.chartData.powers.Total.push(pd.activePower.Total);

        // Reactive Powers (for future charts)
        // this.chartData.reactivePowers = this.chartData.reactivePowers || { Qa: [], Qb: [], Qc: [], Total: [] };
        // this.chartData.reactivePowers.Qa.push(pd.reactivePower.Qa);
        // this.chartData.reactivePowers.Qb.push(pd.reactivePower.Qb);
        // this.chartData.reactivePowers.Qc.push(pd.reactivePower.Qc);
        // this.chartData.reactivePowers.Total.push(pd.reactivePower.Total);
    }

    updateCharts() {
        if (this.chartData.timestamps.length === 0) return;

        // Update Voltage Chart
        this.charts.voltage.data.labels = this.chartData.timestamps;
        this.charts.voltage.data.datasets[0].data = this.chartData.voltages.Ua;
        this.charts.voltage.data.datasets[1].data = this.chartData.voltages.Ub;
        this.charts.voltage.data.datasets[2].data = this.chartData.voltages.Uc;
        this.charts.voltage.update('none');

        // Update Current Chart
        this.charts.current.data.labels = this.chartData.timestamps;
        this.charts.current.data.datasets[0].data = this.chartData.currents.Ia;
        this.charts.current.data.datasets[1].data = this.chartData.currents.Ib;
        this.charts.current.data.datasets[2].data = this.chartData.currents.Ic;
        this.charts.current.data.datasets[3].data = this.chartData.currents.In;
        this.charts.current.update('none');

        // Update Power Chart
        this.charts.power.data.labels = this.chartData.timestamps;
        this.charts.power.data.datasets[0].data = this.chartData.powers.Pa;
        this.charts.power.data.datasets[1].data = this.chartData.powers.Pb;
        this.charts.power.data.datasets[2].data = this.chartData.powers.Pc;
        this.charts.power.data.datasets[3].data = this.chartData.powers.Total;
        this.charts.power.update('none');
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element && element.textContent !== value) {
            element.textContent = value;
            element.classList.add('value-updated');
            setTimeout(() => element.classList.remove('value-updated'), 500);
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = connected ? 'Online' : 'Offline';
            statusElement.className = connected ? 'status-online' : 'status-offline';
        }
    }


async loadLatestData() {
        try {
            const response = await fetch(`${this.baseUrl}/api/data/latest`);
            if (!response.ok) throw new Error('Failed to fetch data');
            
            const data = await response.json();
            this.currentData = data;
            this.updateDisplay(data);
            this.updateChartData(data);
            this.checkAlarms(data); // ADD THIS LINE
            this.updateConnectionStatus(true);
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.updateConnectionStatus(false);
        }
    }

    // ... your existing chart methods remain the same
    initializeCharts() { /* your existing code */ }
    updateDisplay(data) { /* your existing code */ }
    updateChartData(data) { /* your existing code */ }
    updateCharts() { /* your existing code */ }
    updateElement(id, value) { /* your existing code */ }
    updateConnectionStatus(connected) { /* your existing code */ }
}

// Global functions for navigation and settings
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId).classList.add('active');
    
    // Update navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}

function saveSettings() {
    const monitor = window.powerMonitor;
    if (!monitor) return;

    // Collect all settings from the form
    const settings = {};
    
    // Voltage settings
    settings.voltageUa = {
        min: parseFloat(document.getElementById('min_voltageUa').value),
        max: parseFloat(document.getElementById('max_voltageUa').value)
    };
    settings.voltageUb = {
        min: parseFloat(document.getElementById('min_voltageUb').value),
        max: parseFloat(document.getElementById('max_voltageUb').value)
    };
    settings.voltageUc = {
        min: parseFloat(document.getElementById('min_voltageUc').value),
        max: parseFloat(document.getElementById('max_voltageUc').value)
    };
    settings.voltageUab = {
        min: parseFloat(document.getElementById('min_voltageUab').value),
        max: parseFloat(document.getElementById('max_voltageUab').value)
    };
    settings.voltageUbc = {
        min: parseFloat(document.getElementById('min_voltageUbc').value),
        max: parseFloat(document.getElementById('max_voltageUbc').value)
    };
    settings.voltageUca = {
        min: parseFloat(document.getElementById('min_voltageUca').value),
        max: parseFloat(document.getElementById('max_voltageUca').value)
    };

    // Current settings
    settings.currentIa = { max: parseFloat(document.getElementById('max_currentIa').value) };
    settings.currentIb = { max: parseFloat(document.getElementById('max_currentIb').value) };
    settings.currentIc = { max: parseFloat(document.getElementById('max_currentIc').value) };
    settings.currentIn = { max: parseFloat(document.getElementById('max_currentIn').value) };

    // Power settings
    settings.activePowerA = { max: parseFloat(document.getElementById('max_activePowerA').value) };
    settings.activePowerB = { max: parseFloat(document.getElementById('max_activePowerB').value) };
    settings.activePowerC = { max: parseFloat(document.getElementById('max_activePowerC').value) };
    settings.activePowerTotal = { max: parseFloat(document.getElementById('max_activePowerTotal').value) };

    // Power factor settings
    settings.powerFactorA = { min: parseFloat(document.getElementById('min_powerFactorA').value) };
    settings.powerFactorB = { min: parseFloat(document.getElementById('min_powerFactorB').value) };
    settings.powerFactorC = { min: parseFloat(document.getElementById('min_powerFactorC').value) };
    settings.powerFactorTotal = { min: parseFloat(document.getElementById('min_powerFactorTotal').value) };

    // Update and save
    monitor.alarmSettings = settings;
    monitor.saveAlarmSettings();
    
    alert('Settings saved successfully!');
    showPage('dashboard');
}

function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        const monitor = window.powerMonitor;
        if (monitor) {
            monitor.setDefaultAlarmSettings();
            monitor.populateSettingsForm();
            alert('Settings reset to defaults!');
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.powerMonitor = new PowerMonitor();
});