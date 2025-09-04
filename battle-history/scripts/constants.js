export const GAME_POINTS = {
    POINTS_PER_DAMAGE: 1,
    POINTS_PER_FRAG: 400,
    POINTS_PER_TEAM_WIN: 2000
};

export const STATS = {
    // https://node-websocket-758468a49fee.herokuapp.com/api/battle-stats/
    BATTLE: "aHR0cHM6Ly9ub2RlLXdlYnNvY2tldC03NTg0NjhhNDlmZWUuaGVyb2t1YXBwLmNvbS9hcGkvYmF0dGxlLXN0YXRzLw==",
    
    // https://node-websocket-758468a49fee.herokuapp.com/api/status
    STATUS: "aHR0cHM6Ly9ub2RlLXdlYnNvY2tldC03NTg0NjhhNDlmZWUuaGVyb2t1YXBwLmNvbS9hcGkvc3RhdHVz",
    
    // https://node-websocket-758468a49fee.herokuapp.com
    WEBSOCKET_URL: "aHR0cHM6Ly9ub2RlLXdlYnNvY2tldC03NTg0NjhhNDlmZWUuaGVyb2t1YXBwLmNvbQ=="
};

export const CONFIG = {
  DEBOUNCE_DELAY: 50,
  THROTTLE_DELAY: 100,
  SERVER_TIMEOUT: 5000,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 500,
  MIN_RANDOM_DELAY: 50,
  MAX_RANDOM_DELAY: 300,
  UI_UPDATE_DELAY: 50,
  HANGAR_DELAY: 750,
  BATTLE_DELAY: 300,
  SERVER_WARMUP_DELAY: 5000
};

export const CACHE_KEYS = {
  GAME_STATE: 'gameState',
  ACCESS_KEY: 'accessKey'
};