import BattleDataManager from './battleDataManager.js';
import BattleUIHandler from './battleUIHandler.js';
import { STATS } from './constants.js';

class MainHistory {
    constructor() {
        this.init();
    }

    async init() {
        try {
            const hasAccess = await this.checkAccessKey();
            if (!hasAccess) {
                this.showAccessDenied();
                return;
            }
            this.initializeServices();
        } catch (error) {
            console.error('Error in init:', error);
            this.showAccessDenied();
        }
    }

    initializeServices() {
        try {
            this.dataManager = new BattleDataManager();

            this.uiHandler = new BattleUIHandler(this.dataManager);

            this.initialize();
        } catch (error) {
            console.error('Error initializing services:', error);
            this.showError('Error when initializing services');
        }
    }

    async initialize() {
        try {

            await this.dataManager.loadFromServer();

            this.uiHandler.initializeUI();
        } catch (error) {
            console.error('Error in initialize:', error);
            this.showError('Error loading data');
        }
    }

    async checkAccessKey() {
        try {
          localStorage.removeItem('accessKey');
          const urlKey = window.location.search.substring(1);
          const keyAPI = urlKey || localStorage.getItem('accessKey');
          if (!keyAPI) return false;
    
          const baseUrl = atob(STATS.WEBSOCKET_URL)
          const apiUrl = `${baseUrl}/api/battle-stats/stats`;
          
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'X-API-Key': keyAPI,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Origin': 'https://underpressureph7.github.io'
            },
            mode: 'cors',
            cache: 'no-cache'
          });
        
          if (response.status === 401) {
            return false;
          }
      
          if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
            
            if (response.status === 0 || response.status >= 500) {
              console.error('Server or network error - treating as access denied');
              return false;
            }
            
            throw new Error(`HTTP error! status: ${response.status}`);
          }
      
          let data;
          try {
            data = await response.json();
          } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
            return false;
          }
      
          if (data && data.success !== false) {
            if (urlKey) {
              localStorage.setItem('accessKey', urlKey);
            }
            return true;
          }
          
          return false;
      
        } catch (error) {
          console.error('Error in checkAccessKey:', error);
          
          if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.error('Network error or CORS issue - check server configuration');
          }
          
          if (error.name === 'AbortError') {
            console.error('Request was aborted');
          }
          
          console.error('Detailed error:', error);
          return false;
        }
      }

    showAccessDenied() {
        try {
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
                background-color: var(--wotstat-background,rgba(255, 255, 255, 0));
                z-index: 9999;
            `;

            const message = document.createElement('div');
            message.style.cssText = `
                text-align: center;
                padding: 2em;
                border-radius: 1em;
                background-color: rgba(0, 0, 0, 0.7);
                color: var(--wotstat-primary, #ffffff);
            `;

            message.innerHTML = `
                <h2>Доступ заборонено</h2>
                <p>Невірний ключ доступу</p>
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
    window.mainHistory = new MainHistory();
});

export default MainHistory;