import BattleDataManager from './battleDataManager.js';
import BattleUIHandler from './battleUIHandler.js';
import { STATS } from './constants.js';

class MainHistory {
    constructor() {
        this.init();
    }

    async init() {
        try {
            console.log('Initializing MainHistory...');
            
            const hasAccess = await this.checkAccessKey();
            if (!hasAccess) {
                this.showAccessDenied();
                return;
            }
            
            console.log('Access verified, initializing services...');
            this.initializeServices();
        } catch (error) {
            console.error('Error in init:', error);
            this.showAccessDenied();
        }
    }

    initializeServices() {
        try {
            this.uiHandler = new BattleUIHandler();
            
            console.log('Services initialized successfully');
        } catch (error) {
            console.error('Error initializing services:', error);
            this.showError('Помилка ініціалізації сервісів');
        }
    }

    async checkAccessKey() {
        try {
            const urlKey = window.location.search.substring(1);
            const storedKey = localStorage.getItem('accessKey');
            const keyToTest = urlKey || storedKey;
            
            console.log('Testing access key:', keyToTest ? keyToTest.substring(0, 10) + '...' : 'none');
            
            if (!keyToTest) {
                console.error('No access key found');
                return false;
            }

            const apiUrl = `${atob(STATS.WEBSOCKET_URL)}/api/battle-stats/stats`;
        
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': keyToTest
                },
            });
        
            console.log('Access key check response:', response.status);
        
            if (response.status === 401) {
                console.error('Access denied: Invalid API key');
                return false;
            }
        
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        
            const data = await response.json();
            console.log('Access key check data:', data);
        
            if (data.success) {
                if (urlKey) {
                    localStorage.setItem('accessKey', urlKey);
                    console.log('Access key saved to localStorage');
                }
                return true;
            }
            
            console.error('Access denied: API returned success=false');
            return false;
        
        } catch (error) {
            if (!(error instanceof Response) || error.status !== 401) {
                console.error('Error in checkAccessKey:', error);
            }
            return false;
        }
    }

    showAccessDenied() {
        try {
            console.log('Showing access denied message');
            
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                background-color: rgba(0, 0, 0, 0.8);
                z-index: 9999;
            `;

            const message = document.createElement('div');
            message.style.cssText = `
                text-align: center;
                padding: 2em;
                border-radius: 1em;
                background-color: rgba(20, 20, 20, 0.95);
                color: #ffffff;
                border: 2px solid #ff4444;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            `;

            message.innerHTML = `
                <h2 style="color: #ff4444; margin-bottom: 1em;">Доступ заборонено</h2>
                <p style="margin-bottom: 1em;">Невірний ключ доступу або відсутній доступ до бази даних</p>
                <p style="color: #aaa; font-size: 0.9em;">Перевірте правильність посилання</p>
            `;

            container.appendChild(message);

            document.body.innerHTML = '';
            document.body.appendChild(container);
        } catch (error) {
            console.error('Error in showAccessDenied:', error);
        }
    }

    showError(message) {
        try {
            const errorContainer = document.createElement('div');
            errorContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 25px;
                background-color: #ff4444;
                color: white;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
                z-index: 10000;
            `;

            errorContainer.textContent = message;
            document.body.appendChild(errorContainer);

            setTimeout(() => {
                if (document.body.contains(errorContainer)) {
                    document.body.removeChild(errorContainer);
                }
            }, 5000);
        } catch (error) {
            console.error('Error showing error message:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating MainHistory instance');
    window.mainHistory = new MainHistory();
});

export default MainHistory;