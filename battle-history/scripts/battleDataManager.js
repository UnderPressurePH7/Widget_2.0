import EventEmitter from './eventEmitter.js';
import { StateManager } from './stateManager.js';
import { GAME_POINTS, STATS } from './constants.js';
import { Utils } from './utils.js';

class BattleDataManager {
 constructor() {
   this.resetLocalState();
   this.filteredBattles = [];
   this.eventsHistory = new EventEmitter();
   this.dataLoadedFromServer = false;
   this.initializeSocket();
 }

 resetLocalState() {
   this.BattleStats = {};
   this.PlayersInfo = {};
 }

 initializeSocket() {
   const accessKey = this.getAccessKey();
   if (!accessKey) {
     console.error('Access key not found, WebSocket not initialized.');
     return;
   }
   
   if (typeof io === 'undefined') {
     console.error('Socket.IO library not found!');
     return;
   }
   
   try {
     this.socket = io(atob(STATS.WEBSOCKET_URL), {
       query: { key: accessKey },
       transports: ['websocket', 'polling'],
       reconnectionAttempts: 5,
       reconnectionDelay: 1000,
       timeout: 20000,
     });

     this.socket.on('connect', () => {
       console.log('Connected to history WebSocket server');
     });

     this.socket.on('statsUpdated', (data) => {
       if (data && data.key === accessKey) {
         this.forceLoadFromServer();
       }
     });

     this.socket.on('statsCleared', (data) => {
       if (data && data.key === accessKey) {
         this.BattleStats = {};
         this.PlayersInfo = {};
         this.clearLocalStorage();
         this.eventsHistory.emit('historyCleared');
       }
     });

     this.socket.on('battleDeleted', (data) => {
       if (data && data.key === accessKey) {
         this.forceLoadFromServer();
       }
     });

     this.socket.on('connect_error', (error) => {
       console.error('History Socket connection error:', error);
     });

   } catch (error) {
     console.error('History WebSocket initialization error:', error);
   }
 }

 async forceLoadFromServer() {
   try {
     console.log('Force loading data from server...');
     
     this.BattleStats = {};
     this.PlayersInfo = {};
     
     await this.loadFromServer();
     
     this.eventsHistory.emit('historyUpdated'); 
     
     console.log('Data loaded from server:', {
       battles: Object.keys(this.BattleStats || {}).length,
       players: Object.keys(this.PlayersInfo || {}).length
     });
     
   } catch (error) {
     console.error('Error in forceLoadFromServer:', error);
     this.initializeState();
   }
 }

 clearLocalStorage() {
   try {
     StateManager.clearState();
   } catch (error) {
     console.error('Error clearing localStorage:', error);
   }
 }

 initializeState() {
   const savedState = StateManager.loadState();
   if (savedState && Object.keys(this.BattleStats || {}).length === 0) {
     this.BattleStats = savedState?.BattleStats || {};
     this.PlayersInfo = savedState?.PlayersInfo || {};
     console.warn('Loading from localStorage as fallback - this should not happen in history view');
   }
 }

 saveState() {
   try {
     if (this.dataLoadedFromServer) {
       StateManager.saveState({
         BattleStats: this.BattleStats,
         PlayersInfo: this.PlayersInfo
       });
     }
   } catch (error) {
     console.error('Error saving state:', error);
   }
 }

 clearState() {
   StateManager.clearState();
   this.BattleStats = {};
   this.PlayersInfo = {};
 }

 getAccessKey() {
   return StateManager.getAccessKey();
 }

 getBattlesArray() {
   return Object.entries(this.BattleStats).map(([arenaId, battle]) => ({
     id: arenaId,
     ...battle
   }));
 }

 calculateBattleData(battle) {
   if (!battle) return { battlePoints: 0, battleDamage: 0, battleKills: 0 };

   let battlePoints = battle.win === 1 ? GAME_POINTS.POINTS_PER_TEAM_WIN : 0;
   let battleDamage = 0;
   let battleKills = 0;

   if (battle.players) {
     Object.values(battle.players).forEach(player => {
       battlePoints += player.points || 0;
       battleDamage += player.damage || 0;
       battleKills += player.kills || 0;
     });
   }

   return { battlePoints, battleDamage, battleKills };
 }

 calculatePlayerData(playerId) {
   let playerPoints = 0;
   let playerDamage = 0;
   let playerKills = 0;

   Object.values(this.BattleStats).forEach(battle => {
     const player = battle.players?.[playerId];
     if (player) {
       playerPoints += player.points || 0;
       playerDamage += player.damage || 0;
       playerKills += player.kills || 0;
     }
   });

   return { playerPoints, playerDamage, playerKills };
 }

 calculateTeamData() {
   let teamPoints = 0;
   let teamDamage = 0;
   let teamKills = 0;
   let wins = 0;
   const battles = Object.keys(this.BattleStats).length;

   Object.values(this.BattleStats).forEach(battle => {
     if (battle.win === 1) {
       teamPoints += GAME_POINTS.POINTS_PER_TEAM_WIN;
       wins++;
     }

     if (battle.players) {
       Object.values(battle.players).forEach(player => {
         teamPoints += player.points || 0;
         teamDamage += player.damage || 0;
         teamKills += player.kills || 0;
       });
     }
   });

   return { teamPoints, teamDamage, teamKills, wins, battles };
 }

 async makeServerRequest(url, options = {}) {
   const response = await fetch(url, {
     headers: {
       'Content-Type': 'application/json',
       ...options.headers
     },
     ...options
   });

   if (!response.ok) {
     throw new Error(`Server error: ${response.status} ${response.statusText}`);
   }

   return response.json();
 }

 async saveToServer() {
   try {
     const accessKey = this.getAccessKey();
     if (!accessKey) {
       throw new Error('Access key not found');
     }

     const data = {
       BattleStats: this.BattleStats,
       PlayerInfo: Object.fromEntries(Object.entries(this.PlayersInfo || {}).map(([pid, nickname]) => [
         pid, 
         { _id: typeof nickname === 'string' ? nickname : (nickname._id || nickname.name || 'Unknown Player') }
       ]))
     };

     if (this.socket && this.socket.connected) {
       return new Promise((resolve, reject) => {
         this.socket.emit('updateStats', { 
           key: accessKey, 
           body: data 
         }, (response) => {
           if (response && response.success) {
             resolve(true);
           } else {
             reject(new Error(response?.message || 'Failed to save data via WebSocket'));
           }
         });
       });
     }

     const response = await this.makeServerRequest(`${atob(STATS.WEBSOCKET_URL)}/api/battle-stats/update-stats`, {
       method: 'POST',
       headers: {
         'X-API-Key': accessKey
       },
       body: JSON.stringify(data)
     });

     if (!response.success) {
       throw new Error(response.message || 'Failed to save data');
     }

     return true;
   } catch (error) {
     console.error('Error saving data to server:', error);
     throw error;
   }
 }

 handleServerData(data) {
   if (data && data.success !== false) {
     console.log('Processing server data...');
     
     this.BattleStats = {};
     this.PlayersInfo = {};
     
     if (data.BattleStats) {
       const normalized = {};
       Object.entries(data.BattleStats).forEach(([arenaId, battleData]) => {
         const battle = battleData;
         
         const players = {};
         const rawPlayers = battle?.players || {};
         Object.entries(rawPlayers).forEach(([pid, playerData]) => {
           const p = playerData;
           
           const kills = typeof p.kills === 'number' ? p.kills : 0;
           const damage = typeof p.damage === 'number' ? p.damage : 0;
           const points = typeof p.points === 'number' ? p.points : (damage + kills * GAME_POINTS.POINTS_PER_FRAG);
           
           players[pid] = {
             name: p.name || this.PlayersInfo?.[pid] || 'Unknown Player',
             damage,
             kills,
             points,
             vehicle: p.vehicle || 'Unknown Vehicle'
           };
         });
         
         normalized[arenaId] = {
           startTime: battle.startTime || Date.now(),
           duration: battle.duration ?? 0,
           win: typeof battle.win === 'number' ? battle.win : -1,
           mapName: battle.mapName || 'Unknown Map',
           players
         };
       });
       this.BattleStats = normalized;
       console.log('Loaded battles:', Object.keys(this.BattleStats).length);
     }
     
     if (data.PlayerInfo) {
       const normalizedPlayerInfo = {};
       Object.entries(data.PlayerInfo).forEach(([playerId, playerName]) => {
         normalizedPlayerInfo[playerId] = playerName;
       });
       this.PlayersInfo = normalizedPlayerInfo;
       console.log('Loaded players:', Object.keys(this.PlayersInfo).length);
     }

     this.dataLoadedFromServer = true;
     this.saveState();
     
     console.log('Data successfully loaded from server');
     console.log('Final BattleStats:', this.BattleStats);
     console.log('Final PlayersInfo:', this.PlayersInfo);
   } else {
     console.warn('No data received from server or data.success === false');
   }

   return true;
 }

 async loadFromServer(page = 1, limit = 0) {
   try {
     const accessKey = this.getAccessKey();
     if (!accessKey) {
       throw new Error('Access key not found');
     }

     console.log('Loading data from server with access key:', accessKey.substring(0, 10) + '...');

     let data;
     
     if (this.socket && this.socket.connected) {
       console.log('Loading via WebSocket...');
       data = await new Promise((resolve, reject) => {
         this.socket.emit('getStats', { 
           key: accessKey,
           page,
           limit
         }, (response) => {
           console.log('Raw WebSocket response:', response);
           console.log('Response structure:', {
             status: response?.status,
             success: response?.success,
             hasBattleStats: !!response?.BattleStats,
             hasPlayerInfo: !!response?.PlayerInfo,
             battleStatsKeys: response?.BattleStats ? Object.keys(response.BattleStats) : [],
             playerInfoKeys: response?.PlayerInfo ? Object.keys(response.PlayerInfo) : []
           });
           
           if (response && response.status === 200) {
             resolve(response);
           } else {
             reject(new Error(response?.message || 'Failed to load data via WebSocket'));
           }
         });
       });
     } else {
       console.log('Loading via REST API...');
       const url = new URL(`${atob(STATS.WEBSOCKET_URL)}/api/battle-stats/stats`);
       if (page) url.searchParams.set('page', page.toString());
       if (limit !== undefined) url.searchParams.set('limit', limit.toString());

       const response = await this.makeServerRequest(url.toString(), {
         method: 'GET',
         headers: {
           'X-API-Key': accessKey
         }
       });
       
       data = response.data || response;
       console.log('REST API response:', data);
     }

     await this.handleServerData(data);
     return true;
   } catch (error) {
     console.error('Error loading data from server:', error);
     throw error;
   }
 }

 async clearServerData() {
   const accessKey = this.getAccessKey();
   if (!accessKey) {
     throw new Error('Access key not found');
   }
   
   try {
     if (this.socket && this.socket.connected) {
       await new Promise((resolve, reject) => {
         this.socket.emit('clearStats', { key: accessKey }, (response) => {
           if (response && response.success) {
             resolve();
           } else {
             reject(new Error(response?.message || 'Failed to clear data via WebSocket'));
           }
         });
       });
     } else {
       await this.makeServerRequest(`${atob(STATS.WEBSOCKET_URL)}/api/battle-stats/clear`, {
         method: 'DELETE',
         headers: {
           'X-API-Key': accessKey
         }
       });
     }

     await this.refreshLocalData();
     this.eventsHistory.emit('historyCleared');
   } catch (error) {
     console.error('Error clearing data on server:', error);
     throw error;
   }
 }

 async deleteBattle(battleId) {
   try {
     const accessKey = this.getAccessKey();
     if (!accessKey) {
       throw new Error('Access key not found');
     }
     
     if (this.socket && this.socket.connected) {
       await new Promise((resolve, reject) => {
         this.socket.emit('deleteBattle', { 
           key: accessKey,
           battleId 
         }, (response) => {
           if (response && response.success) {
             resolve();
           } else {
             reject(new Error(response?.message || 'Failed to delete battle via WebSocket'));
           }
         });
       });
     } else {
       await this.makeServerRequest(`${atob(STATS.WEBSOCKET_URL)}/api/battle-stats/battle/${battleId}`, {
         method: 'DELETE',
         headers: {
           'X-API-Key': accessKey
         }
       });
     }

     await this.refreshLocalData();
     this.eventsHistory.emit('battleDeleted', battleId);
     return true;
   } catch (error) {
     console.error('Error deleting battle:', error);
     return false;
   }
 }

 filterByMap(battles, map) {
   return battles.filter(battle => battle.mapName === map);
 }

 filterByVehicle(battles, vehicle) {
   return battles.filter(battle => 
     battle.players && Object.values(battle.players).some(player => 
       player.vehicle === vehicle
     )
   );
 }

 filterByResult(battles, result) {
   const resultMap = {
     victory: 1,
     defeat: 0,
     draw: 2,
     inBattle: -1
   };

   return battles.filter(battle => battle.win === resultMap[result]);
 }

 filterByDate(battles, date) {
   const filterDate = new Date(date);
   filterDate.setHours(0, 0, 0, 0);

   return battles.filter(battle => {
     if (!battle.startTime) return false;

     const battleDate = new Date(battle.startTime);
     battleDate.setHours(0, 0, 0, 0);

     return battleDate.getTime() === filterDate.getTime();
   });
 }

 filterByPlayer(battles, player) {
   return battles.filter(battle =>
     battle.players && Object.values(battle.players).some(p => 
       p.name === player
     )
   );
 }

 async applyFilters(filters) {
   let filteredBattles = this.getBattlesArray();

   const filterMethods = {
     map: this.filterByMap,
     vehicle: this.filterByVehicle,
     result: this.filterByResult,
     date: this.filterByDate,
     player: this.filterByPlayer
   };

   Object.entries(filters).forEach(([key, value]) => {
     if (value && filterMethods[key]) {
       filteredBattles = filterMethods[key].call(this, filteredBattles, value);
     }
   });

   this.filteredBattles = filteredBattles;
   this.eventsHistory.emit('filtersApplied', this.filteredBattles);

   return this.filteredBattles;
 }

 async exportData() {
   try {
     return JSON.stringify(this.BattleStats, null, 2);
   } catch (error) {
     console.error("Error exporting data:", error);
     return null;
   }
 }

 async importData(importedData) {
   try {
     if (!this.isValidImportData(importedData)) {
       console.error("Invalid data format for import");
       return false;
     }

     const accessKey = this.getAccessKey();
     if (!accessKey) {
       throw new Error('Access key not found');
     }

     if (this.socket && this.socket.connected) {
       await new Promise((resolve, reject) => {
         this.socket.emit('importStats', { 
           key: accessKey,
           body: importedData
         }, (response) => {
           if (response && response.success) {
             resolve();
           } else {
             reject(new Error(response?.message || 'Failed to import data via WebSocket'));
           }
         });
       });
     } else {
       await this.makeServerRequest(`${atob(STATS.WEBSOCKET_URL)}/api/battle-stats/import`, {
         method: 'POST',
         headers: {
           'X-API-Key': accessKey
         },
         body: JSON.stringify(importedData)
       });
     }

     await this.refreshLocalData();
     this.eventsHistory.emit('dataImported', importedData);

     return true;
   } catch (error) {
     console.error("Error importing data:", error);
     return false;
   }
 }

 isValidImportData(data) {
   return data && typeof data === 'object';
 }

 async refreshLocalData() {
   this.clearState();
   await Utils.sleep(10);
   await this.loadFromServer();
   await Utils.sleep(10);
   this.saveState();
 }

 validateBattleData(battleData) {
   const requiredFields = ['startTime', 'duration', 'win', 'mapName', 'players'];

   if (!requiredFields.every(field => field in battleData)) {
     console.error('Missing required battle fields');
     return false;
   }

   if (typeof battleData.players !== 'object') {
     console.error('Invalid players data structure');
     return false;
   }

   return Object.entries(battleData.players).every(([playerId, playerData]) => {
     if (!this.validatePlayerData(playerData)) {
       console.error(`Invalid player data for ID: ${playerId}`);
       return false;
     }
     return true;
   });
 }

 validatePlayerData(playerData) {
   const requiredFields = ['name', 'damage', 'kills', 'points', 'vehicle'];
   const fieldTypes = {
     name: 'string',
     damage: 'number',
     kills: 'number',
     points: 'number',
     vehicle: 'string'
   };

   return requiredFields.every(field => {
     if (!(field in playerData)) {
       console.error(`Missing required player field: ${field}`);
       return false;
     }

     if (typeof playerData[field] !== fieldTypes[field]) {
       console.error(`Invalid type for player field ${field}`);
       return false;
     }

     return true;
   });
 }
}

export default BattleDataManager;