module.exports = {
    API_KEY: '43fd4b9f30bf5fb87af2b5ab1e6313d8',
    PROXY_IDLE_INTERVAL: 30, // minutes
    PROXY_REST_INTERVAL: 2 * 60, // minutes
    PROXY_DENY_INTERVAL: 8 * 60, // minutes
    PROXY_MAX_BLOCK_COUNT: 8,
    WORKING_INTERVAL: 5 * 1000, //ms
    MAIL_DOMAIN: 'gmail.com',
    USED_PROXY_DB: './data/Proxy_DB.csv',
    BLOCKED_PROXY_DB: './data/Proxy_Blocked.csv',
    USER_ACCOUNT_DB: './data/User_Account.csv',
    UPDATE_PROXY_DB: false,
    BOT_LOG: true,
    BOT_LOG_FILE: './runescape.log',
    CONTEXT_OPTION: {viewport: {width: 200, height: 100}}
}