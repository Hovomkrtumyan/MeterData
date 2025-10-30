class PowerMonitor {
    constructor() {
        this.baseUrl = window.location.origin;
        this.currentData = null;
        this.updateInterval = 2000; // 2 seconds - faster updates
        this.init();
    }

    init() {
        console.log("Power Monitor initialized");
        this.loadLatestData();
        // Update every 2 seconds
        setInterval(() => this.loadLatestData(), this.updateInterval);
    }

    async loadLatestData() {
        try {
            const response = await fetch(`${this.baseUrl}/api/data/latest`);
            if (!response.ok) throw new Error('Failed to fetch data');
            
            const data = await response.json();
            this.currentData = data;
            this.updateDisplay(data);
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
        console.log("Updating display with data:", pd);
        
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

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element && element.textContent !== value) {
            element.textContent = value;
            // Add visual feedback for update
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