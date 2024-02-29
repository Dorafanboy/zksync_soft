const SwapBase = require("./swapBase");
const ethers= require("ethers");

class Space extends SwapBase {
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
            this.logger.errorWithTimestamp(`SpaceFi. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))

        const router= this.connector.createContractConnection(this.constants.spaceRouterAddress,
            this.constants.spaceRouterAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString()

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)

        let modifiedNumber = parseInt(modifiedNumberStr)

        if (isEth === false) {
            this.logger.logWithTimestamp(`Выполняю модуль SpaceFi. USDC -> ETH`)
            let getAmountOut = await router.functions.getAmountsOut(modifiedNumber.toString(),
                [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress])
            let bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()

            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.spaceRouterAddress)

            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.spaceRouterAddress,
                    ethers.BigNumber.from(usdcBalance).toNumber(), { maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice})

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
            }

            let getAmountOutMin = Math.floor(bigNumberValue / 100 * 95)

            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

            let retryCount = 0
            let response

            while (retryCount < this.config.retriesCount) {
                try {
                    const min = 950000;
                    const max = 975000;

                    const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                    response = await signer.callStatic.swapExactTokensForETH
                    (modifiedNumber, getAmountOutMin,
                        [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress], wallet.address,
                        maxFee.timestamp + 1200,
                        {
                            from: wallet.address,
                            value: isEth ? modifiedNumber.toString() : 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit,
                        },)

                    if (response.reason == ("INSUFFICIENT_OUTPUT_AMOUNT")) {
                        retryCount++
                    } else {
                        response = await signer.swapExactTokensForETH
                        (modifiedNumber, getAmountOutMin, 
                            [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress], wallet.address,
                            maxFee.timestamp + 1200,
                            {
                                from: wallet.address,
                                value: isEth ? modifiedNumber.toString() : 0,
                                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                gasLimit: gasLimit,
                            },)

                        this.logger.logWithTimestamp(`SpaceFi. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                        SWAP ${(Math.floor(modifiedNumber) / 1e6)} USDC->ETH\n`)

                        const url = `https://explorer.zksync.io/tx/${response.hash}`
                        this.connector.addMessageToBot(`✅SpaceFi: swap ${(Math.floor(modifiedNumber) / 1e6)} USDC => ETH <a href="${url}">link</a>`)

                        return true
                    }
                } catch (error) {
                    this.logger.errorWithTimestamp(`SpaceFi. Произошла ошибка ${error.reason}`)
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
                    getAmountOutMin = Math.floor(bigNumberValue / 100 * 95)

                    retryCount++
                }
            }

            return false
        }
        
        let retryCount = 0

        let response
        let getAmountOut = await router.functions.getAmountsOut(modifiedNumber.toString(),
            [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress])

        let bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
        let getAmountOutMin = Math.floor(bigNumberValue / 100 * 95)

        this.logger.logWithTimestamp(`Выполняю модуль SpaceFi. ETH -> USDC`)

        while (retryCount < this.config.retriesCount) {
            try {
                const min = 900000;
                const max = 920000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                response = await signer.callStatic.swapExactETHForTokens(
                    getAmountOutMin, [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress], wallet.address,
                    maxFee.timestamp + 1000,
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: isEth ? modifiedNumber.toString() : 0,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit,
                    }, )

                if (response.reason == ("INSUFFICIENT_OUTPUT_AMOUNT")) {
                    retryCount++
                } else {
                    response = await signer.swapExactETHForTokens(
                        getAmountOutMin, [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress], wallet.address,
                        maxFee.timestamp + 1000,
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: isEth ? modifiedNumber.toString() : 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit,
                        }, )

                    this.logger.logWithTimestamp(`SpaceFi. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                    SWAP ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ETH->USDC\n`)

                    const url = `https://explorer.zksync.io/tx/${response.hash}`
                    this.connector.addMessageToBot(`✅SpaceFi: swap ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ETH => USDC <a href="${url}">link</a>`)

                    return true
                }
            } catch (error) {
                this.logger.errorWithTimestamp(`SpaceFi. Произошла ошибка ${error.reason}`)
                await this.transactionChecker.delay(this.config.minRetryDelay, this.config.maxRetryDelay)

                amountToSwap = getAmountToSwap.call(this) * coef

                while (Number(ethBalance) - Number(amountToSwap) <= 0) {
                    amountToSwap = getAmountToSwap.call(this) * coef
                }

                value = Math.floor(Number(amountToSwap))
                numberStr = value.toString()
                modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                modifiedNumber = parseInt(modifiedNumberStr)

                getAmountOut = await router.functions.getAmountsOut(modifiedNumber.toString(),
                    [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress])

                bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
                getAmountOutMin = Math.floor(bigNumberValue / 100 * 95)

                retryCount++
            }
        }
        
        return false
    }
}

module.exports = Space