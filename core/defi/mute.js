const SwapBase = require("./swapBase");
const ethers = require("ethers");
const axios = require("axios");

class MuteSwap extends SwapBase {
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
            this.logger.errorWithTimestamp(`Mute. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))

        const router= this.connector.createContractConnection(this.constants.muteSwapRouterAddress,
            this.constants.muteRouterAbi)

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

        if (isEth === false) {
            this.logger.logWithTimestamp(`Выполняю модуль MuteSwap. USDC -> ETH`)
            let getAmountOut = await router.functions.getAmountsOutExpanded(modifiedNumber.toString(),
                [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress])
            
            let bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
            
            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.muteSwapRouterAddress)

            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.muteSwapRouterAddress,
                    ethers.BigNumber.from(usdcBalance).toNumber(), { maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice})

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
            }
            
            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)
            
            nonce++

            while (retryCount < this.config.retriesCount) {
                const min = 1050000;
                const max = 1100000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                try {
                    response = await signer.callStatic.swapExactTokensForETHSupportingFeeOnTransferTokens
                    (modifiedNumber, Math.floor(bigNumberValue * 0.94),
                        [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress], wallet.address,
                        maxFee.timestamp + 1200, [Math.random() < 0.5, false],
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: isEth ? modifiedNumber.toString() : 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit,
                        },)

                    if (response.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
                        retryCount++
                    } else {
                        response = await signer.swapExactTokensForETHSupportingFeeOnTransferTokens
                        (modifiedNumber, Math.floor(bigNumberValue * 0.94),
                            [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress], wallet.address,
                            maxFee.timestamp + 1200, [Math.random() < 0.5, false],
                            {
                                from: wallet.address,
                                nonce: nonce, 
                                value: isEth ? modifiedNumber.toString() : 0,
                                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                gasLimit: gasLimit,
                            },)

                        this.logger.logWithTimestamp(`Mute swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                        SWAP ${(Math.floor(modifiedNumber) / 1e6)} USDC->ETH\n`)

                        const url = `https://explorer.zksync.io/tx/${response.hash}`
                        this.connector.addMessageToBot(`✅MuteSwap: swap ${(Math.floor(modifiedNumber) / 1e6)} USDC => ETH <a href="${url}">link</a>`)
                        
                        return true
                    }
                } catch (error) {
                    this.logger.errorWithTimestamp(`Произошла ошибка ${error.reason}`)
                    if (error.reason == 'nonce has already been used') {
                        nonce++
                    }
                    await this.transactionChecker.delay(this.config.minRetryDelay, this.config.maxRetryDelay)
                    amountToSwap = getAmountToSwap.call(this) * coef
                    
                    while (Number(usdcBalance) - Number(amountToSwap) <= 0) {
                        amountToSwap = getAmountToSwap.call(this) * coef
                    }

                    value = Math.floor(Number(amountToSwap))
                    numberStr = value.toString()
                    modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                    modifiedNumber = parseInt(modifiedNumberStr)

                    getAmountOut = await router.functions.getAmountsOutExpanded(modifiedNumber.toString(),
                        [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress])

                    bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()

                    retryCount++
                }
            }
            
            return false
        }

        this.logger.logWithTimestamp(`Выполняю модуль MuteSwap. ETH -> USDC`)
        
        let getAmountOut = await this.transactionChecker.getAmountOut(modifiedNumber.toString(),
            this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)
        
        let bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
        
        while (retryCount < this.config.retriesCount) {
            try {
                const min = 750000;
                const max = 770000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                response = await signer.callStatic.swapExactETHForTokensSupportingFeeOnTransferTokens(
                    Math.floor(bigNumberValue * 0.94), [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress], wallet.address,
                    maxFee.timestamp + 1000, [false, false],
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: isEth ? modifiedNumber.toString() : 0,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit,
                    }, )

                if (response.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
                    retryCount++
                } else {
                    response = await signer.swapExactETHForTokensSupportingFeeOnTransferTokens(
                        Math.floor(bigNumberValue * 0.94), [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress], wallet.address,
                        maxFee.timestamp + 1000, [false, false],
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: isEth ? modifiedNumber.toString() : 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit,
                        }, )

                    this.logger.logWithTimestamp(`Mute swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                    SWAP ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ETH->USDC\n`)

                    const url = `https://explorer.zksync.io/tx/${response.hash}`
                    this.connector.addMessageToBot(`✅MuteSwap: swap ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ETH => USDC <a href="${url}">link</a>`)
                    
                    return true
                }
            } catch (error) {
                this.logger.errorWithTimestamp(`Произошла ошибка ${error.reason}`)
                if (error.reason == 'nonce has already been used') {
                    nonce++
                }
                
                await this.transactionChecker.delay(this.config.minRetryDelay, this.config.maxRetryDelay)
                amountToSwap = getAmountToSwap.call(this) * coef
                
                while (Number(ethBalance) - Number(amountToSwap) <= 0) {
                    amountToSwap = getAmountToSwap.call(this) * coef
                }
                
                value = Math.floor(Number(amountToSwap))
                numberStr = value.toString()
                modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                modifiedNumber = parseInt(modifiedNumberStr)

                getAmountOut = await this.transactionChecker.getAmountOut(modifiedNumber.toString(),
                    this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)
                bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()

                retryCount++
            }
        }
        
        return false
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
                (this.config.maxStableLiquidityValue - this.config.minStableLiquidityValue)
                + parseFloat(this.config.minStableLiquidityValue)
        }

        this.logger.logWithTimestamp(`Выполняю модуль MuteSwap. Add Liquidity`)

        let coef = isEth ? 1e18 : 1e6
        let amountToSwap = getAmountToSwap.call(this) * coef

        let ethBalance = await this.connector.provider.getBalance(wallet.address)

        let usdcSigner = await this.connector.usdcContract.connect(wallet)

        let usdcBalance = await usdcSigner.balanceOf(wallet.address)

        let amountSwap= Math.floor((this.config.remainingBalanceEth * 1e18) + (amountToSwap))

        if (isEth ? Number(ethBalance) - Number(amountSwap) <= 0 :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {
            this.logger.errorWithTimestamp(`Mute swap. Add liquidity. Недостаточно баланса для свапа на аккаунте ${wallet.address}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        const router= this.connector.createContractConnection(this.constants.muteSwapRouterAddress,
            this.constants.muteRouterAbi)

        let signer = await router.connect(wallet) 

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString()

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)

        let modifiedNumber = parseInt(modifiedNumberStr)

        const req = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=ethereum%2Cusd&vs_currencies=usd", {
            headers: {
                'User-Agent': this.transactionChecker.userAgent.toString()
            }
        });

        let resp = req.data.ethereum.usd
        let modifiedString = modifiedNumber / 1e6 / resp
        let ethAmount = Math.floor(modifiedString * 1e18)

        let numberStrEth = ethAmount.toString()

        let modifiedNumberStrEth = numberStrEth.slice(0, -8) + "0".repeat(8)

        let modifiedNumberEth = parseInt(modifiedNumberStrEth)
        
        let usdcApprove = await usdcSigner.approve(this.constants.muteSwapRouterAddress,
            ethers.BigNumber.from(usdcBalance).toNumber(), { maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                maxPriorityFeePerGas: feeData.gasPrice})

        this.logger.logWithTimestamp(`Mute swap. Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
        
        nonce++
        
        let getAmountsOut = await signer.functions.getAmountOut(modifiedNumber, this.constants.usdcContractAddress, 
            this.constants.syncSwapWethAddress)
        
        let getUsdcAmount = await signer.functions.getAmountOut(getAmountsOut[0].toString(), 
            this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)
        
        let getUsdcAmountExpanded = await signer.functions.getAmountOut(getAmountsOut[0].toString(),
            this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)

        let getAmountExpanded = await signer.functions.getAmountOut(modifiedNumber,
            this.constants.usdcContractAddress, this.constants.syncSwapWethAddress)
        
        let response
        let retryCount = 0

        await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

        while (retryCount < this.config.retriesCount) {
            try {
                response = await signer.callStatic.addLiquidityETH(this.constants.usdcContractAddress,
                    modifiedNumber, Math.floor(getUsdcAmount[0].toString() * 0.95),
                    Math.floor(ethers.BigNumber.from(getAmountsOut[0]._hex).toNumber()), wallet.address,
                    maxFee.timestamp + 1200, 50, false,
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: modifiedNumberEth,
                        gasLimit: '1200000', 
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                    })
                
                if (response.reason === "MuteSwitch: INSUFFICIENT_B_AMOUNT") {
                    retryCount++
                } else {
                    response = await signer.callStatic.addLiquidityETH(this.constants.usdcContractAddress,
                        modifiedNumber, Math.floor(getUsdcAmount[0].toString() * 0.95),
                        Math.floor(ethers.BigNumber.from(getAmountsOut[0]._hex).toNumber()), wallet.address,
                        maxFee.timestamp + 1200, 50, false,
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: modifiedNumberEth,
                            gasLimit: '1200000',
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        })

                    if (response.response == undefined) {
                        response = await signer.addLiquidityETH(this.constants.usdcContractAddress,
                            modifiedNumber, Math.floor(getUsdcAmount[0].toString() * 0.95),
                            Math.floor(ethers.BigNumber.from(getAmountsOut[0]._hex).toNumber()), wallet.address,
                            maxFee.timestamp + 1200, 50, false,
                            {
                                from: wallet.address,
                                nonce: nonce,
                                value: modifiedNumberEth,
                                gasLimit: '1200000',
                                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            })
                    }

                    if (response.reason == undefined) {
                        this.logger.logWithTimestamp(`Mute swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
        Добавил в пул ликвидности ${(modifiedNumberEth / 1e18).toFixed(18)} ETH + ${(modifiedNumber / 1e6).toFixed(6)} USDC\n`)

                        const url = `https://explorer.zksync.io/tx/${response.hash}`
                        this.connector.addMessageToBot(`✅MuteSwap: add liquidity ${(modifiedNumberEth / 1e18).toFixed(18 - numbersCount)} ETH + ${(modifiedNumber / 1e6).toFixed(6)} USDC <a href="${url}">link</a>`)
                        
                        return true
                    } else {
                        this.logger.errorWithTimestamp(`MuteSwap. Транзакция не прошла`)

                        this.connector.addMessageToBot(`❌MuteSwap: add liquidity failed`)
                        
                        return false
                    }
                }
            } catch (error) {
                this.logger.errorWithTimestamp("MuteSwap. Произошла ошибка.", error.reason)
                if (error.reason == "TransferHelper::transferFrom: transferFrom failed") {
                    let usdcApprove = await usdcSigner.approve(this.constants.muteSwapRouterAddress,
                        ethers.BigNumber.from(usdcBalance).toNumber(), { maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                            maxPriorityFeePerGas: feeData.gasPrice})

                    this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`.trim())

                    await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

                    retryCount++
                }

                if (error.reason == "MuteSwitch: INSUFFICIENT_B_AMOUNT") {
                    retryCount++
                }
                
                await this.transactionChecker.delay(this.config.minRetryDelay, this.config.maxRetryDelay)
                amountToSwap = getAmountToSwap.call(this) * coef

                amountSwap = Math.floor((this.config.remainingBalanceEth * 1e18) + (amountToSwap))

                if (isEth ? Number(ethBalance) - Number(amountSwap) <= 0 :
                    Number(usdcBalance) - Number(amountToSwap) <= 0) {
                    this.logger.errorWithTimestamp(`MuteSwap. Add liquidity try. Недостаточно баланса для свапа на аккаунте ${wallet.address}`)
                    return false
                }

                value = Math.floor(Number(amountToSwap))
                numberStr = value.toString()
                modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                modifiedNumber = parseInt(modifiedNumberStr)
                
                getAmountsOut = await signer.functions.getAmountOut(modifiedNumber, this.constants.usdcContractAddress,
                    this.constants.syncSwapWethAddress)

                getUsdcAmount = await signer.functions.getAmountOut(ethers.BigNumber.from(getAmountsOut[0]._hex).toNumber(),
                    this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)

                getUsdcAmountExpanded = await signer.functions.getAmountOut(getAmountsOut[0].toString(),
                    this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)

                getAmountExpanded = await signer.functions.getAmountOut(modifiedNumber,
                    this.constants.usdcContractAddress, this.constants.syncSwapWethAddress)

                ethAmount = Math.floor(modifiedString * 1e18)

                numberStrEth = ethAmount.toString()

                modifiedNumberStrEth = numberStrEth.slice(0, -8) + "0".repeat(8)

                modifiedNumberEth = parseInt(modifiedNumberStrEth)
                
                retryCount++
            }
        }
    }
}

module.exports = MuteSwap