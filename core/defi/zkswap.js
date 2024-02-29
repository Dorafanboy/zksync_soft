const SwapBase = require('./swapBase')
const ethers = require("ethers");
const {logger} = require("ethers");

class Zkswap extends SwapBase {
    constructor(transactionChecker, constants, connector, config, logger) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
        this.logger = logger
        this.values = [
            'ETHUSDC',
            'USDCUSDT',
            'ETHUSDT',
        ]
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

        function getInfoToSwap(values, constants) {
            const randomIndex = Math.floor(Math.random() * values.length)
            const randomTokenKey = values[randomIndex]

            let msg, tokenFrom, tokenTo

            switch (randomTokenKey) {
                case "ETHUSDC":
                    msg = isEth ? "ETH -> USDC" : "USDC -> ETH"
                    tokenFrom = isEth ? constants.syncSwapWethAddress : constants.usdcContractAddress
                    tokenTo = isEth ? constants.usdcContractAddress : constants.syncSwapWethAddress
                    break
                case "ETHUSDT":
                    msg = isEth ? "ETH -> USDT" : "USDT -> ETH"
                    tokenFrom = isEth ? constants.syncSwapWethAddress : constants.usdtContractAddress
                    tokenTo = isEth ? constants.usdtContractAddress : constants.syncSwapWethAddress
                    break
                case "USDCUSDT":
                    if (isEth == false) {
                        const randomValue = Math.floor(Math.random() * 2) + 1;
                        msg = randomValue === 1 ? "USDC -> USDT" : "USDT -> USDC"
                        tokenFrom = randomValue === 1 ? constants.usdcContractAddress : constants.usdtContractAddress
                        tokenTo = randomValue === 1 ? constants.usdtContractAddress : constants.usdcContractAddress
                        break
                    }
            }

            return {msg, tokenFrom, tokenTo}
        }

        let info = getInfoToSwap(this.values, this.constants)

        while (info.msg === undefined) {
            info = getInfoToSwap(this.values, this.constants)
        }

        let coef = isEth ? 1e18 : 1e6
        let amountToSwap = getAmountToSwap.call(this) * coef

        let ethBalance = await this.connector.provider.getBalance(wallet.address)

        let stableSigner, stableBalance

        if (isEth == false) {
            stableSigner = info.tokenFrom == this.constants.usdcContractAddress ?
                await this.connector.usdcContract.connect(wallet) :
                await this.connector.usdtContract.connect(wallet)

            stableBalance = await stableSigner.balanceOf(wallet.address)
        }

        if (isEth ? Number(ethBalance) - Number(amountToSwap) <= Math.floor((this.config.remainingBalanceEth * 1e18)) :
            Number(stableBalance) - Number(amountToSwap) <= 0) {
            this.logger.errorWithTimestamp(`ZkSwap. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }
        
        let value = Math.floor(Number(amountToSwap))

        const router= this.connector.createContractConnection(this.constants.zkSwapRouterAddress,
            this.constants.zkswapRouterAbi)

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
        
        let retryCount = 0
        let response

        this.logger.logWithTimestamp(`Выполняю модуль ZkSwap. ${info.msg}`)

        if (isEth === false) {
            let getAmountOut = await this.transactionChecker.getAmountOut(modifiedNumber.toString(),
                info.tokenFrom, info.tokenTo)

             let bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
             let allowance = await stableSigner.functions.allowance(wallet.address, this.constants.zkSwapRouterAddress)

            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await stableSigner.approve(this.constants.zkSwapRouterAddress, stableBalance)

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно. Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
            }
            
            let getAmountOutMin = Math.floor(bigNumberValue / 100 * 95)

            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)
            
            while (retryCount < this.config.retriesCount) {
                try {
                    const min = 900000;
                    const max = 920000;

                    const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                    if (info.tokenTo == this.constants.syncSwapWethAddress) {
                        response = await signer.callStatic.swapExactTokensForETH
                        (modifiedNumber, getAmountOutMin, [info.tokenFrom, info.tokenTo], wallet.address,
                            maxFee.timestamp + 1500,
                            {
                                from: wallet.address,
                                value: isEth ? modifiedNumber.toString() : 0,
                                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                gasLimit: gasLimit,
                            },)

                        if (response.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
                            retryCount++
                        } else {
                            response = await signer.callStatic.swapExactTokensForETH
                            (modifiedNumber, getAmountOutMin, [info.tokenFrom, info.tokenTo], wallet.address,
                                maxFee.timestamp + 1500,
                                {
                                    from: wallet.address,
                                    value: isEth ? modifiedNumber.toString() : 0,
                                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                    gasLimit: gasLimit,
                                },)

                            if (response.response == undefined) {
                                response = await signer.swapExactTokensForETH
                                (modifiedNumber, getAmountOutMin, [info.tokenFrom, info.tokenTo], wallet.address,
                                    maxFee.timestamp + 1500,
                                    {
                                        from: wallet.address,
                                        value: isEth ? modifiedNumber.toString() : 0,
                                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                        gasLimit: gasLimit,
                                    },)
                                this.logger.logWithTimestamp(`Zkswap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                                SWAP ${parseFloat(modifiedNumber / 1e6).toFixed(6)} ${info.msg}\n`)

                                const url = `https://explorer.zksync.io/tx/${response.hash}`
                                this.connector.addMessageToBot(`✅ZkSwap: swap ${parseFloat(modifiedNumber / 1e6).toFixed(6)} ${info.msg} <a href="${url}">link</a>`)

                                return true
                            } else {
                                this.logger.errorWithTimestamp(`Zkswap. Транзакция не прошла`)
                                this.connector.addMessageToBot(`❌ZkSwap: swap failed`)
                                return false
                            }
                        }
                    } else {
                        response = await signer.callStatic.swapExactTokensForTokens
                        (modifiedNumber, getAmountOutMin, [info.tokenFrom, info.tokenTo], wallet.address,
                            maxFee.timestamp + 1500,
                            {
                                from: wallet.address,
                                value: isEth ? modifiedNumber.toString() : 0,
                                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                gasLimit: gasLimit,
                            },)

                        if (response.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
                            retryCount++
                        } else {
                            response = await signer.callStatic.swapExactTokensForTokens
                            (modifiedNumber, getAmountOutMin, [info.tokenFrom, info.tokenTo], wallet.address,
                                maxFee.timestamp + 1500,
                                {
                                    from: wallet.address,
                                    value: isEth ? modifiedNumber.toString() : 0,
                                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                    gasLimit: gasLimit,
                                },)

                            if (response.response == undefined) {
                                response = await signer.swapExactTokensForTokens
                                (modifiedNumber, getAmountOutMin, [info.tokenFrom, info.tokenTo], wallet.address,
                                    maxFee.timestamp + 1500,
                                    {
                                        from: wallet.address,
                                        value: isEth ? modifiedNumber.toString() : 0,
                                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                        gasLimit: gasLimit,
                                    },)
                                this.logger.logWithTimestamp(`Zkswap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                                SWAP ${parseFloat(modifiedNumber / 1e6).toFixed(6)} ${info.msg}\n`)

                                const url = `https://explorer.zksync.io/tx/${response.hash}`
                                this.connector.addMessageToBot(`✅ZkSwap: swap ${parseFloat(modifiedNumber / 1e6).toFixed(6)} ${info.msg} <a href="${url}">link</a>`)

                                return true
                            } else {
                                this.logger.errorWithTimestamp(`Zkswap. Транзакция не прошла`)
                                this.connector.addMessageToBot(`❌ZkSwap: swap failed`)
                                return false
                            }
                        }
                    }
                } catch (error) {
                    this.logger.errorWithTimestamp(`Zkswap. Произошла ошибка ${error.reason}`)
                    await this.transactionChecker.delay(this.config.minRetryDelay, this.config.maxRetryDelay)
                    amountToSwap = getAmountToSwap.call(this) * coef
                    
                    while (Number(stableBalance) - Number(amountToSwap) <= 0) {
                        amountToSwap = getAmountToSwap.call(this) * coef
                    }

                    value = Math.floor(Number(amountToSwap))
                    numberStr = value.toString()
                    modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                    modifiedNumber = parseInt(modifiedNumberStr)

                    getAmountOut = await this.transactionChecker.getAmountOut(modifiedNumber.toString(),
                        info.tokenFrom, info.tokenTo)
                    bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
                    getAmountOutMin = Math.floor(bigNumberValue / 100 * 95)

                    retryCount++
                }
            }

            return false
        }
        
        let getAmountOut = await this.transactionChecker.getAmountOut(modifiedNumber.toString(),
            this.constants.syncSwapWethAddress, info.tokenTo)
        
        const bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
        
        while (retryCount < this.config.retriesCount) {
            try {
                const min = 750000;
                const max = 775000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                response = await signer.callStatic.swapExactETHForTokens(
                    Math.floor(bigNumberValue * 0.95), [this.constants.syncSwapWethAddress, info.tokenTo], wallet.address,
                    maxFee.timestamp + 1000,
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: isEth ? modifiedNumber.toString() : 0,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit,
                    })

                if (response.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
                    retryCount++;
                } else {
                    response = await signer.swapExactETHForTokens(
                        Math.floor(bigNumberValue * 0.95), [this.constants.syncSwapWethAddress, info.tokenTo], wallet.address,
                        maxFee.timestamp + 1000,
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: isEth ? modifiedNumber.toString() : 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit,
                        })
                    
                    this.logger.logWithTimestamp(`Zkswap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                SWAP ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ${info.msg}\n`)

                    const url = `https://explorer.zksync.io/tx/${response.hash}`
                    this.connector.addMessageToBot(`✅ZkSwap: swap ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ${info.msg} <a href="${url}">link</a>`)
                    return true
                }
            } catch (error) {
                this.logger.errorWithTimestamp(`Zkswap. Произошла ошибка ${error.reason}`)
                await this.transactionChecker.delay(0.05, 0.07)
                amountToSwap = getAmountToSwap.call(this) * coef

                while (Number(stableBalance) - Number(amountToSwap) <= 0) {
                    amountToSwap = getAmountToSwap.call(this) * coef
                }

                value = Math.floor(Number(amountToSwap))
                numberStr = value.toString()
                modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                modifiedNumber = parseInt(modifiedNumberStr)
                
                getAmountOut = await this.transactionChecker.getAmountOut(modifiedNumber.toString(),
                    this.constants.syncSwapWethAddress, info.tokenTo)
                
                retryCount++
            }
        }
        
        return false
    }
}

module.exports = Zkswap