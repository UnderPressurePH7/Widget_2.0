import EventEmitter from './eventEmitter.js';
import { StateManager } from './stateManager.js';
import { GAME_POINTS, STATS } from './constants.js';
import { Utils } from './utils.js';

class BattleDataManager {
  constructor() {
    this.initializeState();
    this.filteredBattles = [];
    this.eventsHistory = new EventEmitter();
    this.initializeSocket();
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
          this.loadFromServer();
        }
      });

      this.socket.on('statsCleared', (data) => {
        if (data && data.key === accessKey) {
          this.BattleStats = {};
          this.PlayersInfo = {};
          this.eventsHistory.emit('historyCleared');
        }
      });

      this.socket.on('battleDeleted', (data) => {
        if (data && data.key === accessKey) {
          this.loadFromServer();
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('History Socket connection error:', error);
      });

    } catch (error) {
      console.error('History WebSocket initialization error:', error);
    }
  }

  initializeState() {
    const savedState = StateManager.loadState();
    this.BattleStats = savedState?.BattleStats || {};
    this.PlayersInfo = savedState?.PlayersInfo || {};
  }

  saveState() {
    StateManager.saveState({
      BattleStats: this.BattleStats,
      PlayersInfo: this.PlayersInfo
    });
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

  async loadFromServer(page = 1, limit = 0) {
    try {
      const accessKey = this.getAccessKey();
      if (!accessKey) {
        throw new Error('Access key not found');
      }

      let data;
      
      if (this.socket && this.socket.connected) {
        data = await new Promise((resolve, reject) => {
          this.socket.emit('getStats', { 
            key: accessKey,
            page,
            limit
          }, (response) => {
            if (response && response.status === 200) {
              resolve(response);
            } else {
              reject(new Error(response?.message || 'Failed to load data via WebSocket'));
            }
          });
        });
      } else {
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
      }

      if (data && data.success !== false) {
        if (data.BattleStats) {
          const normalized = {};
          Object.entries(data.BattleStats).forEach(([arenaId, battleWrapper]) => {
            const battle = (battleWrapper && typeof battleWrapper === 'object' && battleWrapper._id) 
              ? battleWrapper._id 
              : battleWrapper;
            
            const players = {};
            const rawPlayers = battle?.players || {};
            Object.entries(rawPlayers).forEach(([pid, playerWrapper]) => {
              const p = (playerWrapper && typeof playerWrapper === 'object' && playerWrapper._id) 
                ? playerWrapper._id 
                : playerWrapper;
              
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
        }
        
        if (data.PlayerInfo) {
          const normalizedPlayerInfo = {};
          Object.entries(data.PlayerInfo).forEach(([playerId, playerWrapper]) => {
            if (typeof playerWrapper === 'object' && playerWrapper._id) {
              normalizedPlayerInfo[playerId] = playerWrapper._id;
            } else {
              normalizedPlayerInfo[playerId] = playerWrapper;
            }
          });
          this.PlayersInfo = normalizedPlayerInfo;
        }

        this.saveState();
      }

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