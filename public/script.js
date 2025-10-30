// Include Chart.js in your HTML head first!
// Add this to your HTML: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

class PowerMonitor {
    constructor() {
        this.baseUrl = window.location.origin;
        this.currentData = null;
        this.updateInterval = 2000;
        
        // Chart data history (keep last 20 points)
        this.chartData = {
            timestamps: [],
            voltages: { Ua: [], Ub: [], Uc: [] },
            currents: { Ia: [], Ib: [], Ic: [], In: [] },
            powers: { Pa: [], Pb: [], Pc: [], Total: [] }
        };
        
        this.charts = {};
        this.init();
    }

    init() {
        console.log("Power Monitor initialized");
        this.initializeCharts();
        this.loadLatestData();
        
        // Update data every 2 seconds
        setInterval(() => this.loadLatestData(), this.updateInterval);
        
        // Update charts every 5 seconds (smoother)
        setInterval(() => this.updateCharts(), 5000);
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
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PowerMonitor();
});