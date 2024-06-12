const csv = require("csvtojson");
const fs = require("fs");
const playwright = require("playwright");
const { Solver } = require("2captcha-ts");
const args = require("yargs").argv;
const moment = require("moment");
const config = require("./config");
const solver = new Solver(config.API_KEY);

let firstNames = [];
let lastNames = [];
let proxies = [];
let currentProxy = 0;

const getNextProxy = () => {
    for (var i = 0; i < proxies.length; i++) {
        const prxId = (i + currentProxy) % proxies.length;
        if (proxies[prxId].time && moment().isAfter(proxies[prxId].time)) {
            currentProxy = prxId + 1;
            return prxId;
        }
    }
    return undefined;
};

const refreshProxeis = () => {
    fs.unlinkSync(config.USED_PROXY_DB);
    for (var i = 0; i < proxies.length; i++) {
        if (proxies[i].time)
            fs.appendFileSync(config.USED_PROXY_DB, `${proxies[i].addr}\n`, {
                flush: true,
            });
    }
};

const setProxySuccess = (proxyId) => {
    if (!args.noproxy) {
        proxies[proxyId].blockCount = 0;
        proxies[proxyId].time = moment().add(
            config.PROXY_IDLE_INTERVAL,
            "minute"
        );
    }
};

const setProxyRest = (proxyId) => {
    if (!args.noproxy) {
        proxies[proxyId].blockCount = 0;
        proxies[proxyId].time = moment().add(
            config.PROXY_REST_INTERVAL,
            "minute"
        );
    }
};

const setProxyDeny = (proxyId) => {
    if (!args.noproxy) {
        proxies[proxyId].blockCount += 1;
        if (proxies[proxyId].blockCount >= config.PROXY_MAX_BLOCK_COUNT) {
            blockProxy(proxyId);
        } else {
            proxies[proxyId].time = moment().add(
                config.PROXY_DENY_INTERVAL,
                "minute"
            );
        }
    }
};

const blockProxy = (proxyId) => {
    if (!args.noproxy) {
        proxies[proxyId].time = undefined;
        writeLog(proxyId, `Blocked`);
        fs.appendFileSync(
            config.BLOCKED_PROXY_DB,
            `${proxies[proxyId].addr}, ${new Date()}\n`,
            { flush: true }
        );
        if (config.UPDATE_PROXY_DB) refreshProxeis();
    }
};

const appendUserAccount = (username, password) => {
    fs.appendFileSync(
        `${config.USER_ACCOUNT_DB}`,
        `${username}, ${password}\n`,
        { flush: true }
    );
};

const writeLog = (proxyId, message, e = undefined) => {
    console.log(
        `Proxy ${proxyId}(${proxies[proxyId].addr}) : ${moment().format(
            "YYYY-MM-DD hh:mm:ss"
        )} : ${message}`
    );
    if (config.BOT_LOG) {
        fs.appendFileSync(
            config.BOT_LOG_FILE,
            `Proxy ${proxyId}(${proxies[proxyId].addr}) : ${moment().format(
                "YYYY-MM-DD hh:mm:ss"
            )} : ${message} : ${
                proxies[proxyId].time
                    ? proxies[proxyId].time.format("YYYY-MM-DD hh:mm:ss")
                    : ""
            }, ${proxies[proxyId].blockCount}\n`,
            { flush: true }
        );
        if (e) {
            fs.appendFileSync(
                config.BOT_LOG_FILE,
                `Proxy ${proxyId} : ${e.toString()}\n`,
                { flush: true }
            );
        }
    }
};

const getRandom = (values) => values[Math.floor(Math.random() * values.length)];

const getRandomInt = (min, max) =>
    Math.floor(min + Math.random() * (max - min));

const randomUsername = () =>
    `${getRandom(firstNames)}.${getRandom(lastNames)}.${getRandomInt(
        1950,
        2000
    )}@${config.MAIL_DOMAIN}`;

const randomPassword = () =>
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).toUpperCase().slice(2);

const isFirstPage = (title) =>
    title !== undefined && title.indexOf("Old School RuneScape") !== -1;
const isSignupPage = (title) =>
    title !== undefined && title.indexOf("SIGN UP WITH YOUR EMAIL") !== -1;
const isRobotPage = (title) =>
    title !== undefined && title.indexOf("ARE YOU A ROBOT") !== -1;
const isWelcomePage = (title) =>
    title !== undefined && title.indexOf("WELCOME") !== -1;
const isDeniedPage = (title) =>
    title !== undefined && title.indexOf("ACCESS DENIED") !== -1;
const isTooManyPage = (title) =>
    title !== undefined && title.indexOf("TOO MANY REQUEST") !== -1;
const isBlockedPage = (title) =>
    title !== undefined &&
    (title.indexOf("This page isn") !== -1 ||
        title.indexOf("This site can") !== -1 ||
        title.indexOf("No internet") !== -1);

const closeBrower = async (browser, context) => {
    context && (await context.close());
    browser && (await browser.close());
};

const startBrowser = async (proxy_id) => {
    let browser,
        context,
        page,
        title = undefined;
    let username,
        password,
        proxyAccount,
        proxyAddr,
        proxyStr,
        proxyUser,
        proxyPass,
        proxyScheme = "http";
    username = randomUsername();
    password = randomPassword();
    if (proxy_id) {
        if (proxies[proxy_id].addr.indexOf("://") !== -1) {
            [proxyScheme, proxyStr] = proxies[proxy_id].addr.split("://");
        } else {
            proxyStr = proxies[proxy_id].addr;
        }
        [proxyAccount, proxyAddr] = proxyStr.split("@");
        [proxyUser, proxyPass] = proxyAccount.split(":");
    }
    const launchOptions = {
        headless: false,
        proxy: proxy_id
            ? {
                  server: `${proxyScheme}://${proxyAddr}`,
                  username: proxyUser,
                  password: proxyPass,
              }
            : undefined,
    };
    try {
        browser = await playwright["chromium"].launch(launchOptions);
        context = await browser.newContext(config.CONTEXT_OPTION);
        // context = await browser.newContext();
        page = await context.newPage();
        page.on("console", async (msg) => {
            const txt = msg.text();
            if (txt.includes("intercepted-params:")) {
                const params = JSON.parse(
                    txt.replace("intercepted-params:", "")
                );
                try {
                    const res = await solver.cloudflareTurnstile(params);
                    await page.evaluate((token) => {
                        cfCallback(token);
                    }, res.data);
                } catch (e) {
                    writeLog(proxy_id, `Solver Failed`, e);
                }
            }
        });
        await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
        await page.route(/.+api.js\?onload=FAIg1.+/, async (route) => {
            try {
                const response = await route.fetch();
                route.fulfill({
                    response,
                    body: fs.readFileSync("./api.js"),
                    headers: response.headers(),
                });
            } catch (e) {
                // console.error(e);
                setProxySuccess(proxy_id);
                await closeBrower(browser, context);
            }
        });
        await page.goto("https://oldschool.runescape.com/");
        await page.waitForLoadState();
        await page
            .locator("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll")
            .dispatchEvent("click");
        await page.waitForLoadState();
        await page.locator("#signup").dispatchEvent("click");
        // signup page
        await page.waitForLoadState();
        // site second page
        await page.locator("#create-email").dispatchEvent("click");
        await page.locator("#create-email").pressSequentially(username);
        await page.locator("#create-password").dispatchEvent("click");
        await page.locator("#create-password").pressSequentially(password);
        await page.locator('input[name="day"]').dispatchEvent("click");
        await page
            .locator('input[name="day"]')
            .pressSequentially(`${getRandomInt(1, 31)}`);
        await page.locator('input[name="month"]').dispatchEvent("click");
        await page
            .locator('input[name="month"]')
            .pressSequentially(`${getRandomInt(1, 12)}`);
        await page.locator('input[name="year"]').dispatchEvent("click");
        await page
            .locator('input[name="year"]')
            .pressSequentially(`${getRandomInt(1980, 1999)}`);
        await page.locator('input[name="agree_terms"]').dispatchEvent("click");
        await page.locator("#create-submit").dispatchEvent("click");
        // wait Welcome page
        await page.waitForLoadState();
        await page
            .locator("//a[contains(@class, 'uc-download-options__logos')]")
            .waitFor();
        appendUserAccount(username, password);
        setProxySuccess(proxy_id);
        writeLog(proxy_id, `Success`);
        await closeBrower(browser, context);
    } catch (e) {
        try {
            title = await page.locator("h1").first().innerText();
        } catch (e) {}
        if (!title) {
            setProxySuccess(proxy_id);
        } else if (isDeniedPage(title)) {
            setProxyDeny(proxy_id);
            writeLog(proxy_id, `Access Denied`);
        } else if (isTooManyPage(title)) {
            setProxyRest(proxy_id);
            writeLog(proxy_id, `Too Many Requests`);
        } else if (isBlockedPage(title)) {
            setProxyDeny(proxy_id);
            writeLog(proxy_id, `Proxy Failed ${title}`);
        } else {
            setProxySuccess(proxy_id);
            writeLog(proxy_id, `Unknown - ${title}`);
        }
        await closeBrower(browser, context);
    }
};

const readDataFromCsv = async (filepath) => {
    const entries = await csv({
        noheader: true,
        output: "line",
    }).fromFile(filepath);
    return entries;
};

const loadData = async () => {
    firstNames = await readDataFromCsv("./data/First_Name_DB.csv");
    lastNames = await readDataFromCsv("./data/Last_Name_DB.csv");
    const proxieStrs = await readDataFromCsv(config.USED_PROXY_DB);
    proxies = proxieStrs.map((addr) => ({
        addr,
        time: moment(),
        blockCount: 0,
    }));
};

const waitTime = (msecs) => {
    return new Promise((resolve) => setTimeout(() => resolve(), msecs));
};

// main function
const main = async () => {
    let pid = undefined;
    let pid_back = undefined;
    await loadData();
    setInterval(async () => {
        pid_back = pid;
        pid = getNextProxy();
        if (pid) await startBrowser(pid);
        else if (pid_back) console.log("WAIT PROXY!!!");
    }, config.WORKING_INTERVAL);
    // while (1) {
    //     pid_back = pid;
    //     if (args.noproxy) {
    //         await startBrowser();
    //         break;
    //     } else if (args.proxy) {
    //         pid = parseInt(args.proxy);
    //         await startBrowser(pid);
    //         break;
    //     } else {
    //         pid = getNextProxy();
    //         if (pid) await startBrowser(pid);
    //         else if (pid_back) console.log("WAIT PROXY!!!");
    //     }
    //     if (args.thread) {
    //         await waitTime(config.WORKING_INTERVAL / parseInt(args.thread));
    //     } else {
    //         await waitTime(config.WORKING_INTERVAL);
    //     }
    // }
};

main();
