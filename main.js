const fs = require('fs')
const axios = require('axios');
const Constants= require('./core/data/constants')
const Initializer= require('./core/initializer')
const Connector= require('./core/connector')
const Config= require('./core/config')
const Table = require('./core/table/table')
const TransactionChecker = require('./core/transactionChecker')
const Logger = require('./core/data/logger')

const SyncSwap = require('./core/defi/syncswap')
const MuteSwap = require('./core/defi/mute')
const SpaceSwap = require('./core/defi/spacefi')
const ZkSwap = require('./core/defi/zkswap')
const FiwooSwap = require('./core/defi/fiwooswap')
const EzkaliburSwap = require('./core/defi/ezkalibur')
const EraLend = require('./core/defi/eralend')
const Orbiter = require('./core/defi/orbiter')
const Lite = require('./core/lite/lite')
const Velocore = require('./core/defi/velocore')
const Okx = require('./core/okx/okx')
const Pancake = require('./core/defi/pancake')
const Bridge = require('./core/defi/bridge')
const Maverick = require('./core/defi/maverick')
const Merkly = require('./core/defi/merkly')

const readline = require("readline");
const {readFileSync} = require("fs")
const Database = require('./database/database');

let database = new Database()
let constants= new Constants()
let config= new Config()
let logger = new Logger()
let initializer= new Initializer(constants.rpcUrl, config.telegramBotId)
let connector= new Connector(initializer.provider, initializer.telegramBot, config.telegramId)
let table= new Table(constants, connector)
let router= connector.createContractConnection(constants.spaceRouterAddress, constants.spaceRouterAbi)
let okx = new Okx(config, connector, logger)

let transactionChecker = new TransactionChecker(router, logger)
let syncSwap = new SyncSwap(transactionChecker, constants, connector, config, logger)
let muteSwap = new MuteSwap(transactionChecker, constants, connector, config, logger)
let spaceSwap = new SpaceSwap(transactionChecker, constants, connector, config, logger)
let zkSwap = new ZkSwap(transactionChecker, constants, connector, config, logger)
let fiwooSwap = new FiwooSwap(transactionChecker, constants, connector, config, logger)
let ezkaliburSwap = new EzkaliburSwap(transactionChecker, constants, connector, config, logger)
let eraLend = new EraLend(transactionChecker, constants, connector, config, logger)
let orbiter = new Orbiter(transactionChecker, constants, connector, config)
let lite = new Lite(connector)
let velocore = new Velocore(transactionChecker, constants, connector, config, logger)
let pancake = new Pancake(transactionChecker, constants, connector, config, logger)
let bridge = new Bridge(transactionChecker, constants, connector, config, logger)
let maverick = new Maverick(transactionChecker, constants, connector, config, logger)
let merkly = new Merkly(transactionChecker, constants, connector, config, logger)

const privateKeysPath = fs.createReadStream('private_keys.txt');

const functions = [
    async (wallet) => await ezkaliburSwap.makeSwap(wallet, false),
    async (wallet) => await ezkaliburSwap.makeSwap(wallet, true),
    async (wallet) => await fiwooSwap.makeSwap(wallet, true),
    async (wallet) => await fiwooSwap.makeSwap(wallet, false),
    async (wallet) => await zkSwap.makeSwap(wallet, true),
    async (wallet) => await zkSwap.makeSwap(wallet, false),
    async (wallet) => await spaceSwap.makeSwap(wallet, true),
    async (wallet) => await spaceSwap.makeSwap(wallet, false),
    async (wallet) => await muteSwap.makeSwap(wallet, true),
    async (wallet) => await muteSwap.makeSwap(wallet, false),
    async (wallet) => await eraLend.addLiquidity(wallet, true),
    async (wallet) => await syncSwap.makeSwap(wallet, true),
    async (wallet) => await syncSwap.makeSwap(wallet, false),
    async (wallet)  => await pancake.makeSwap(wallet, true),
    async (wallet) => await pancake.makeSwap(wallet, false),
    async (wallet) => await maverick.makeSwap(wallet, true),
    async (wallet) => await maverick.makeSwap(wallet, false),
    async (wallet) => await velocore.makeSwap(wallet, true),
    async (wallet) => await velocore.makeSwap(wallet, false),
    async (wallet, nftCount) => await merkly.mint(wallet, nftCount)
    //async (wallet) => await muteSwap.addLiquidity(wallet, false),
    //async (wallet) => await syncSwap.addLiquidity(wallet, false),
    //async (wallet) => await orbiter.makeBridge(wallet, true),
    //async (wallet) => await lite.mintNFT(wallet.privateKey),
]

async function processFile() {
    const rl = readline.createInterface({
        input: privateKeysPath,
        crlfDelay: Infinity
    });

    let index = 0,
        modulesCount = 0;

    process.on('SIGINT', () => {
        database.saveData({ accountIndex: index, remainingModules: modulesCount });
        logger.logWithTimestamp(
            `Записал состояние в базу данных, номер аккаунта - ${
                index + 1
            }, кол-во оставшихся модулей - ${modulesCount}`,
        );
        process.exit();
    });

    const data = fs.readFileSync('private_keys.txt', 'utf8');
    const count = data.split('\n').length;

    let isLoadState = config.isLoadState;

    for await (let privateKey of rl) {  
        try {
            if (config.isShuffleWallets) {
                logger.logWithTimestamp(`Произвожу перемешивание кошельков.`);
                await shuffleData();
                logger.logWithTimestamp(`Кошельки успешно перемешаны.\n`);
            }
            
            const state = database.loadState();

            if (isLoadState && state.accountIndex != 0) {
                if (index >= state.accountIndex - 1) {
                    isLoadState = false;
                    logger.logWithTimestamp(`Загружаю аккаунт, с которого продолжить работу из базы данных.\n`);
                    index++;
                } else {
                    index++;
                }
            } else {
                let wallet = connector.connectWallet(privateKey)

                logger.logWithTimestamp(`Начал отработку аккаунта ${index + 1} - ${wallet.address}\n`)

                const state = database.loadState();

                modulesCount = Math.floor(Math.random() * (config.maxModulesCount - config.minModulesCount + 1))
                    + config.minModulesCount

                if (config.isLoadState && state.remainingModules != 0) {
                    const remainingModules = state.remainingModules;

                    logger.logWithTimestamp(`Загружаю количество оставшихся модулей на аккаунте из базы данных.`);

                    modulesCount = remainingModules;
                }

                logger.logWithTimestamp(`Буду выполнять ${modulesCount} модулей на аккаунте\n`);

                connector.createUsdcConnection(constants.usdcContractAddress, constants.usdcAbi)
                connector.createUsdtConnection(constants.usdtContractAddress, constants.usdtAbi)

                await transactionChecker.generateUserAgent()

                connector.addMessageToBot(`${index + 1}/${count} ${wallet.address}\n`)
                let merklyNftCount = {value: 0}

                if (config.isNeedOfficialBridge) {
                    await bridge.use(privateKey)
                }

                let withdrawResult = await okx.withdrawAmount(wallet)

                if (withdrawResult == true) {
                    await transactionChecker.delay(config.minDelayAfterWithdrawOkx, config.maxDelayAfterWithdrawOkx)
                }

                for (let i = 0; i < modulesCount; i++) {
                    const randomIndex = Math.floor(Math.random() * functions.length)
                    const currentFunction = functions[randomIndex]

                    let res = await currentFunction(wallet, merklyNftCount)

                    if (res == true) {
                        await transactionChecker.delay(config.minModulesDelay, config.maxModulesDelay)
                    } else {
                        await transactionChecker.delay(0.05, 0.25)
                    }
                }

                if (config.isNeedWithdrawToOkx) {
                    let address = await getAddress(privateKey)

                    if (address == undefined) {
                        logger.errorWithTimestamp(`Не найден суб адрес для этого кошелька: ${wallet.address}`)
                        return
                    }

                    await okx.returnAmount(wallet, address)
                }

                logger.logWithTimestamp(`Отработал аккаунт ${index + 1} - ${wallet.address}`)

                await connector.sendMessage()

                index++

                if (index == count) {
                    logger.logWithTimestamp(`Все аккаунты отработаны`);
                    rl.close();
                    connector.addMessageToBot(`❌Аккаунт ${index + 1} - Прошел с ошибкой Not connected`)
                    await connector.sendMessage()
                    await connector.stopTelegramBot();
                    return;
                }

                await transactionChecker.delay(config.minDelay, config.maxDelay)
            }
        } catch (error) {
            logger.errorWithTimestamp(`Произошла ошибка в софте на аккаунте ${index + 1}: `, error)
            connector.addMessageToBot(`❌Аккаунт ${index + 1} - Прошел с ошибкой`)
            connector.sendMessage()

            if (error.reason == 'could not detect network') {
                logger.errorWithTimestamp("Not detected")

                rl.close();
                await connector.stopTelegramBot();
            }

            index++
            await transactionChecker.delay(config.minDelay, config.maxDelay)
        }
    }
}

async function shuffleData() {
    try {
        const data1 = fs.readFileSync('private_keys.txt', 'utf8');
        const lines1 = data1.split('\n');

        for (let i = lines1.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [lines1[i], lines1[j]] = [lines1[j], lines1[i]];
        }

        await fs.writeFileSync('private_keys.txt', lines1.join('\n'), 'utf8');
    } catch (error) {
        logger.logWithTimestamp(`Произошла ошибка во время перемешивания данных: ${error}`);
    }
}

async function shuffle() {
    let filename1 = 'file1.txt'
    let filename2 = 'file2.txt'
    
    let numbersFile = fs.readFileSync(filename1, 'utf-8')
    let lettersFile = fs.readFileSync(filename2, 'utf-8')

    let numbersArray = numbersFile.split('\n')
    let lettersArray = lettersFile.split('\n')
    
    if (numbersArray.length != lettersArray.length) {
        logger.errorWithTimestamp(`Количество приватных ключей ${numbersArray.length} не равно количеству суб-аккаунтов ${lettersArray.length}`)
        return false
    }

    function shuffleInSameOrder(array1, array2) {
        for (let i = array1.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [array1[i], array1[j]] = [array1[j], array1[i]];
            [array2[i], array2[j]] = [array2[j], array2[i]];
        }

        return {array1, array2}
    }

    let arr = shuffleInSameOrder(numbersArray, lettersArray)
    fs.writeFileSync(filename1, arr.array1.join('\n'), 'utf-8')
    fs.writeFileSync(filename2, arr.array2.join('\n'), 'utf-8')
    
    return true
}

async function getAddress(address) {
    let filename1 = 'file1.txt'
    let filename2 = 'file2.txt'

    let numbersFile = fs.readFileSync(filename1, 'utf-8')
    let lettersFile = fs.readFileSync(filename2, 'utf-8')

    let numbersArray = numbersFile.split('\n')
    let lettersArray = lettersFile.split('\n')

    let index = numbersArray.indexOf(address + '\r')
    
     return lettersArray[index]
}

processFile()
