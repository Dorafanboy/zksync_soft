const SwapBase = require('./swapBase')
const ethers = require("ethers");

class Eralend extends SwapBase {
    constructor(transactionChecker, constants, connector, config, logger) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
        this.logger = logger
    }

    async addLiquidity(wallet, isEth) {
        let gwei = await this.transactionChecker.getGwei()

        while (gwei > this.config.gwei) {
            this.logger.logWithTimestamp(`Газ высокий: ${gwei} gwei`)
            await this.transactionChecker.delay(this.config.minWaitGweiUpdate,
                this.config.maxWaitGweiUpdate)

            gwei = await this.transactionChecker.getGwei()
        }

        function getAmountToSwap() {
            return isEth ? Math.random() * (this.config.maxEthSwapValue - this.config.minEthSwapValue)
                + parseFloat(this.config.minEthSwapValue) : Math.random() *
                (this.config.maxStableSwapValue - this.config.minStableSwapValue)
                + parseFloat(this.config.minStableSwapValue)
        }

        let coef = isEth ? 1e18 : 1e6
        let amountToSwap = getAmountToSwap.call(this) * coef

        let ethBalance = await this.connector.provider.getBalance(wallet.address)

        let usdcContract = this.connector.createContractConnection(this.constants.usdcContractAddress,
            this.constants.usdcAbi)

        let usdcSigner = await usdcContract.connect(wallet)

        let usdcBalance = await usdcSigner.balanceOf(wallet.address)
        
        this.logger.logWithTimestamp(`Выполняю модуль EraLend mint`)

        if (isEth ? Number(ethBalance) - Number(amountToSwap) <= Math.floor((this.config.remainingBalanceEth * 1e18)) :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {
            this.logger.errorWithTimestamp(`EraLend. Недостаточно баланса для supply на аккаунте ${wallet.address}`)
            return false
        }

        const value = Math.floor(Number(amountToSwap))

        const router= this.connector.createContractConnection(this.constants.eralendAddress,
            this.constants.eralendAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString()

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)

        let modifiedNumber = parseInt(modifiedNumberStr)

        let response

        const min = 800000;
        const max = 850000;

        const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
        
        try {
            response = await signer.mint(
                {
                    from: wallet.address,
                    nonce: nonce,
                    value: modifiedNumber,
                    gasLimit: gasLimit, 
                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                });

            this.logger.logWithTimestamp(`EraLend. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
            Supply ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ETH\n`)

            const url = `https://explorer.zksync.io/tx/${response.hash}`
            this.connector.addMessageToBot(`✅Eralend: supply ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ETH <a href="${url}">link</a>`)

            await this.transactionChecker.delay(this.config.minModulesDelay, this.config.maxModulesDelay)
            
            await this.removeLiquidity(wallet, true)

            return wallet
        } catch (error) {
            this.logger.errorWithTimestamp(`EraLend. Ошибка при вызове mint ${error}`)
            
            return false
        }
    }

    async removeLiquidity(wallet, isEth) {
        this.logger.logWithTimestamp(`Выполняю модуль EraLend remove liquidity`)

        if (wallet == undefined) {
            this.logger.errorWithTimestamp("Ошибка в supply EraLend.\n")
            return 
        }
        
        let gwei = await this.transactionChecker.getGwei()

        while (gwei > this.config.gwei) {
            this.logger.logWithTimestamp(`Газ высокий: ${gwei} gwei`)
            await this.transactionChecker.delay(this.config.minWaitGweiUpdate,
                this.config.maxWaitGweiUpdate)

            gwei = await this.transactionChecker.getGwei()
        }
        
        const router= this.connector.createContractConnection(this.constants.eralendAddress,
            this.constants.eralendAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)
        
        let balance = await signer.callStatic.balanceOfUnderlying(wallet.address)

        const factor = (Math.random() * (this.config.minRemoveProcent - this.config.maxRemoveProcent) 
            + this.config.minRemoveProcent).toFixed(2);

        let result = Math.round(balance * factor)
        let response
        
        nonce++

        const min = 980000;
        const max = 1000000;

        const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
        
        try {
            response = await signer.redeemUnderlying(result, {
                from: wallet.address,
                nonce: nonce,
                value: 0,
                gasLimit: gasLimit,
                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                maxPriorityFeePerGas: feeData.gasPrice.toString(),
            })

            this.logger.logWithTimestamp(`EraLend. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
            Вытащил ${parseFloat(result / 1e18).toFixed(18)}\n`)

            const url = `https://explorer.zksync.io/tx/${response.hash}`
            this.connector.addMessageToBot(`✅Eralend: withdraw ${parseFloat(result / 1e18).toFixed(8)} ETH <a href="${url}">link</a>`)
            
            return true
        } catch (error) {
            this.logger.errorWithTimestamp(`EraLend. Произошла ошибка при забирании ETH ${error.reason}`)

            // const url = `https://explorer.zksync.io/tx/${response.hash}`
            // this.connector.addMessageToBot(`✅Eralend: withdraw ${parseFloat(result / 1e18).toFixed(8)} ETH <a href="${url}">link</a>`)

            return false
        }
    }
}

module.exports = Eralend