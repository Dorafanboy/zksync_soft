const SwapBase = require("./swapBase");
const ethers = require("ethers");

class FiwooSwap extends SwapBase {
    constructor(transactionChecker, constants, connector, config, logger) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
        this.logger = logger
    }

    async makeSwap(wallet, isEth) {
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
        
        let usdcSigner = await this.connector.usdcContract.connect(wallet)

        let usdcBalance = await usdcSigner.balanceOf(wallet.address)
        
        if (isEth ? Number(ethBalance) - Number(amountToSwap) <= Math.floor((this.config.remainingBalanceEth * 1e18)) :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {
            this.logger.errorWithTimestamp(`WoofiSwap. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))

        const router= this.connector.createContractConnection(this.constants.fiwooSwapRouterAddress,
            this.constants.fiwooswapRouterAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString();

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

        let modifiedNumber = parseInt(modifiedNumberStr);
        
        if (isEth === false) {
            this.logger.logWithTimestamp(`Выполняю модуль WoofiSwap. USDC -> ETH`)

            let getAmountOut = await signer.functions.querySwap(this.constants.usdcContractAddress,
                this.constants.syncSwapWethAddress, modifiedNumber.toString())
            
            let bigNumberValue = ethers.BigNumber.from(getAmountOut.toAmount._hex).toNumber()
            
            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.fiwooSwapRouterAddress)
            
            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.fiwooSwapRouterAddress,
                    ethers.BigNumber.from(usdcBalance).toNumber(), { maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice})

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
            }

            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

            let retryCount = 0
            let response

            while (retryCount < this.config.retriesCount) {
                try {
                    const min = 1200000;
                    const max = 1250000;

                    const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                    
                    response = await signer.callStatic.swap
                    (this.constants.usdcContractAddress, this.constants.testAddress, modifiedNumber,
                        Math.floor(bigNumberValue * 0.95), wallet.address, wallet.address,
                        {
                            from: wallet.address,
                            value: isEth ? value.toString() : 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit,
                        },)

                    if (response.reason == ("INSUFFICIENT_OUTPUT_AMOUNT")) {
                        retryCount++
                    } else {
                        response = await signer.swap
                        (this.constants.usdcContractAddress, this.constants.testAddress, modifiedNumber,
                            Math.floor(bigNumberValue * 0.95), wallet.address, wallet.address,
                            {
                                from: wallet.address,
                                value: isEth ? value.toString() : 0,
                                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                gasLimit: gasLimit,
                            },)

                        this.logger.logWithTimestamp(`Woofi swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                        SWAP ${(Math.floor(modifiedNumber) / 1e6)} USDC->ETH\n`)

                        const url = `https://explorer.zksync.io/tx/${response.hash}`
                        this.connector.addMessageToBot(`✅FiwooSwap: swap ${(Math.floor(modifiedNumber) / 1e6)} USDC => ETH <a href="${url}">link</a>`)

                        return true
                    }
                } catch (error) {
                    this.logger.errorWithTimestamp(`Woofi swap. Произошла ошибка ${error.reason}`)
                    await this.transactionChecker.delay(this.config.minRetryDelay, this.config.maxRetryDelay)
                    amountToSwap = getAmountToSwap.call(this) * coef
                    
                    while (Number(usdcBalance) - Number(amountToSwap) <= 0) {
                        amountToSwap = getAmountToSwap.call(this) * coef
                    }

                    value = Math.floor(Number(amountToSwap))
                    numberStr = value.toString()
                    modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                    modifiedNumber = parseInt(modifiedNumberStr)

                    getAmountOut = await this.transactionChecker.getAmountOut(modifiedNumber.toString(),
                        this.constants.usdcContractAddress, this.constants.syncSwapWethAddress)
                    bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()

                    retryCount++
                }
            }
            
            return false
        }
        
        let getAmountOut = await signer.functions.querySwap(this.constants.syncSwapWethAddress, 
            this.constants.usdcContractAddress, modifiedNumber.toString())

        const bigNumberValue = ethers.BigNumber.from(getAmountOut.toAmount._hex).toNumber()

        this.logger.logWithTimestamp(`Выполняю модуль WoofiSwap. ETH -> USDC`)

        try {
            const min = 940000;
            const max = 975000;

            const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
            let response = await signer.swap(
                this.constants.testAddress, this.constants.usdcContractAddress, modifiedNumber,
                Math.floor(bigNumberValue * 0.95), wallet.address, wallet.address,
                {
                    from: wallet.address,
                    nonce: nonce,
                    value: isEth ? modifiedNumber.toString() : 0,
                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                    gasLimit: gasLimit,
                }, )

            this.logger.logWithTimestamp(`Woofi swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
            SWAP ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ETH->USDC\n`)

            const url = `https://explorer.zksync.io/tx/${response.hash}`
            this.connector.addMessageToBot(`✅FiwooSwap: swap ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ETH => USDC <a href="${url}">link</a>`)

            return true
        } catch (error) {
            this.logger.errorWithTimestamp(`WoofiSwap. Произошла ошибка ${error.reason}`)
        }

        return false
    }
}

module.exports = FiwooSwap