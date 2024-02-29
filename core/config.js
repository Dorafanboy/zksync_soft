class Config {
    constructor() {
        this.okxApiKey = '' // ясно что это 
        this.okxApiSecret = '' // ясно что это
        this.okxApiPassword = ''

        this.isShuffleWallets = false; // перемешивать ли строки в текстовом файле для приватных ключей
        this.isLoadState = true; // загружать ли текущее состояние работы из базы данных
        
        this.isNeedOfficialBridge = false // нужно ли использовать оф мост

        this.bridgeEthAmount = [0.0103, 0.0148] // диапазон бриджа eth через оф мост
        this.maxBridgeGwei = 10 // до какого гвея аккаунты будут использовать оф мост

        this.okxErc20NetFee = '0.00049' // не менять

        this.ramainderEthBalance = [0.8, 0.83] // сколько останется баланса после оф моста (в процентах) в сети ETH

        this.delayAfterBridge = [3.5, 4.5] // задержка после использования оф бриджа (лучше ставить от 3.5 минут)

        this.telegramBotId = '' // айди телеграм бота, которому будут отправляться логи
        this.telegramId = ''
        
        this.minOkxWithdrawEth = '0.0025' // минимальное количество ETH на вывод из OKX
        this.maxOkxWithdrawEth = '0.004' // максимальное количество ETH на вывод из OKX
        
        this.okxZkSyncFee = '0.0003' // не менять
        
        this.isNeedWithdrawToOkx = false // если нужно выводить с кошелька на okx, то true, иначе ставить false
        
        this.isNeedShuffle = false // если нужно перемешать приватники с субакками то true, иначе ставить false
        
        this.gwei = 40 // гвей, при котором скрипт начинает работать
        
        this.minDelay = 20 // минимальная задержка между сменой аккаунтов 1 = 60 секунд
        this.maxDelay = 35 // максимальная задержка между сменой аккаунтов
        
        this.minDelayAfterWithdrawOkx = 1.8 // минимальная задержка после отправки денег с окекса
        this.maxDelayAfterWithdrawOkx = 3.82 // максимальная задержка после отправки денег с окекса

        this.minApproveDelay = 0.5 // минимальная задержка между апрувами
        this.maxApproveDelay = 1.1 // максимальная задержка между апрувами

        this.retriesCount = 8 // сколько раз скрипт будет пробовать вызвать функции в случае неудачи

        this.minModulesDelay = 1 // минимальная задержка между сменой модулей
        this.maxModulesDelay = 2.3 // максимальная задержка между сменой модулей

        this.minRetryDelay = 0.04 // минимальная задержка между отправкой транзакции из-за неудачи
        this.maxRetryDelay = 0.1 // максимальная задержка между отправкой транзакции из-за неудачи

        this.minModulesCount = 2 // минимальное количество модулей для запуска на аккаунте
        this.maxModulesCount = 5 // максимальное количество модулей для запуска на аккаунте

        this.minEthSwapValue = '0.00032' // минимальное значение для свапов eth
        this.maxEthSwapValue = '0.0009' // максимальное значение для свапов eth
        
        this.minStableSwapValue = '0.3' // минимальное значение для свапов стейблов(только usdc пока что) если гонять <0.01 usdc то mute liquidity выдаст ошибку
        this.maxStableSwapValue = '1.5' // максимальное значение для свапов стейблов(только usdc пока что)

        this.minStableLiquidityValue = '0.1' // минимальное значение для добавления ликвы стейблов(только usdc пока что) если гонять <0.01 usdc то mute liquidity выдаст ошибку
        this.maxStableLiquidityValue = '0.15' // максимальное значение для добавления ликвы(только usdc пока что)
        
        this.minRemoveProcent = 1 // минимальный процент, который достанется из EraLend
        this.maxRemoveProcent = 1 // максимальный процент, который достанется из EraLend
        
        this.remainingBalanceEth = 0.0004 // количество ETH, которое останется на кошельке (чтобы хватало на свапы)
        
        this.minWaitGweiUpdate = 1 // минимальное количество минут будет ждать скрипт, чтобы получить новое значение гвея
        this.maxWaitGweiUpdate = 3 // максимальное количество минут будет ждать скрипт, чтобы получить новое значение гвея
        
        this.minSymbolsStableCount = 2 // минимальное количество цифр стейблов после запятой 
        this.maxSymbolsStableCount = 5 // максимальное количество цифр стейблов после запятой

        this.minSymbolsEthCount = 12 // минимальное количество цифр eth после запятой(чтобы не было чисел типо 0.93191491441941, а было 0.9319 условно)
        this.maxSymbolsEthCount = 15 // максимальное количество цифр eth после запятой 

        this.maxMerklyNft = 1 // какой максимум нфт будет заминчено в сети era и забриджено в одну из 7 сетей
    }
}

module.exports = Config