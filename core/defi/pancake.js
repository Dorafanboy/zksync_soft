const SwapBase = require('./swapBase')
const ethers = require("ethers");

class Ezkalibur extends SwapBase {
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

        let usdcContract = this.connector.createContractConnection(this.constants.usdcContractAddress,
            this.constants.usdcAbi)

        let usdcSigner = await usdcContract.connect(wallet)

        let usdcBalance = await usdcSigner.balanceOf(wallet.address)

        if (isEth ? Number(ethBalance) - Number(amountToSwap) <= Math.floor((this.config.remainingBalanceEth * 1e18)) :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {
            this.logger.errorWithTimestamp(`Pancake. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))

        const router = this.connector.createContractConnection(this.constants.pancakeRouterAddress,
            this.constants.pancakeRouterAbi)
        const factory = this.connector.createContractConnection(this.constants.pancakeFactoryAddress,
            this.constants.pancakeFactoryAbi)
        const quoter = this.connector.createContractConnection(this.constants.pancakeQuoterAddress,
            this.constants.pancakeQuoterAbi)
        const walletSigner = wallet.connect(this.connector.provider)

        const signerQuoter = await quoter.connect(wallet)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString();

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

        let modifiedNumber = parseInt(modifiedNumberStr);

        if (isEth === false) {
            this.logger.logWithTimestamp(`Выполняю модуль PancakeSwap. USDC -> ETH`)
            
            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.pancakeRouterAddress)

            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.pancakeRouterAddress,
                    ethers.BigNumber.from(usdcBalance).toNumber(), {
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice
                    })

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`
                    .trim())
            }

            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

            nonce = await this.connector.provider.getTransactionCount(wallet.address)
            
            let getAmountOutMin = await signerQuoter.callStatic.quoteExactInputSingle([this.constants.usdcContractAddress, this.constants.syncSwapWethAddress, modifiedNumber, 500, 0]);
            let amountOutMin = Math.floor(parseInt(getAmountOutMin[0]._hex.toString()) * 0.95)

            let swapData = [router.interface.encodeFunctionData('exactInputSingle', [[
                this.constants.usdcContractAddress, this.constants.syncSwapWethAddress,
                500,
                '0x0000000000000000000000000000000000000002',
                modifiedNumber,
                amountOutMin,
                0
            ]
            ])
            ];

            swapData.push(router.interface.encodeFunctionData('unwrapWETH9', [
                amountOutMin,
                wallet.address
            ]))
            
            let multicallData = router.interface.encodeFunctionData('multicall', [parseInt(maxFee.timestamp + 1200), swapData])

            let retryCount = 0
            while (retryCount < this.config.retriesCount) {
                try {
                    const min = 1200000;
                    const max = 1250000;

                    const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                    let args = {
                        to: this.constants.pancakeRouterAddress,
                        from: wallet.address,
                        nonce: nonce,
                        value: 0,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit,
                        data: multicallData
                    }

                    let tx = await walletSigner.sendTransaction(args)

                    this.logger.logWithTimestamp(`Pancake swap.Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${tx.hash}
                 SWAP ${(Math.floor(modifiedNumber) / 1e6)} USDC->ETH\n`)

                    const url = `https://explorer.zksync.io/tx/${tx.hash}`
                    this.connector.addMessageToBot(`✅Pancake: swap ${Math.floor(modifiedNumber) / 1e6} USDC => ETH <a href="${url}">link</a>`)

                    return true
                } catch (error) {
                    this.logger.errorWithTimestamp(`Pancake. Произошла ошибка ${error}`)
                    await this.transactionChecker.delay(0.05, 0.15)
                    retryCount++

                    amountToSwap = getAmountToSwap.call(this) * coef

                    while (Number(usdcBalance) - Number(amountToSwap) <= 0) {
                        amountToSwap = getAmountToSwap.call(this) * coef
                    }

                    value = Math.floor(Number(amountToSwap))

                    numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
                        + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
                        + this.config.minSymbolsStableCount)

                    numberStr = value.toString();

                    modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

                    modifiedNumber = parseInt(modifiedNumberStr);
                    
                    getAmountOutMin = await signerQuoter.callStatic.quoteExactInputSingle([this.constants.usdcContractAddress, this.constants.syncSwapWethAddress, modifiedNumber, 500, 0]);
                    amountOutMin = Math.floor(parseInt(getAmountOutMin[0]._hex.toString()) * 0.95)

                    swapData = [router.interface.encodeFunctionData('exactInputSingle', [[
                        this.constants.usdcContractAddress, this.constants.syncSwapWethAddress,
                        500,
                        '0x0000000000000000000000000000000000000002',
                        modifiedNumber,
                        amountOutMin,
                        0
                    ]
                    ])
                    ];

                    swapData.push(router.interface.encodeFunctionData('unwrapWETH9', [
                        amountOutMin,
                        wallet.address
                    ]))

                    multicallData = router.interface.encodeFunctionData('multicall', [parseInt(maxFee.timestamp + 1200), swapData])
                }
            }
            
            return false
        }

        this.logger.logWithTimestamp(`Выполняю модуль PancakeSwap. ETH -> USDC`)

        let getAmountOutMin = await signerQuoter.callStatic.quoteExactInputSingle([this.constants.syncSwapWethAddress, this.constants.usdcContractAddress, modifiedNumber, 500, 0]);
        let amountOutMin = Math.floor(parseInt(getAmountOutMin[0]._hex.toString()) * 0.95)

        let swapData = [router.interface.encodeFunctionData('exactInputSingle', [[
            this.constants.syncSwapWethAddress, this.constants.usdcContractAddress,
            100,
            wallet.address,
            modifiedNumber,
            amountOutMin,
            0
        ]
        ])
        ];
        
        let multicallData = router.interface.encodeFunctionData('multicall', [parseInt(maxFee.timestamp + 1200), swapData])

        let retryCount = 0

        while (retryCount < this.config.retriesCount) {
            try {
                const min = 650000;
                const max = 675000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                
                let args = {
                    to: this.constants.pancakeRouterAddress,
                    from: wallet.address,
                    nonce: nonce, 
                    value: modifiedNumber,
                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                    gasLimit: gasLimit,
                    data: multicallData
                }

                let tx = await walletSigner.sendTransaction(args)

                this.logger.logWithTimestamp(`Pancake swap.Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${tx.hash}
            SWAP ${(Math.floor(modifiedNumber) / 1e18).toFixed(numbersCount)} ETH->USDC\n`)

                const url = `https://explorer.zksync.io/tx/${tx.hash}`
                this.connector.addMessageToBot(`✅Pancake: swap ${(Math.floor(modifiedNumber) / 1e18).toFixed(18 - numbersCount)} ETH => USDC <a href="${url}">link</a>`)
                
                return true
            } catch (error) {
                this.logger.errorWithTimestamp(`Pancake swap. Произошла ошибка ${error}`)
                await this.transactionChecker.delay(0.05, 0.15)
                retryCount++

                amountToSwap = getAmountToSwap.call(this) * coef

                while (Number(ethBalance) - Number(amountToSwap) <= 0) {
                    amountToSwap = getAmountToSwap.call(this) * coef
                }

                value = Math.floor(Number(amountToSwap))

                numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
                    + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
                    + this.config.minSymbolsStableCount)

                numberStr = value.toString();

                modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

                modifiedNumber = parseInt(modifiedNumberStr);
                
                getAmountOutMin = await signerQuoter.callStatic.quoteExactInputSingle([this.constants.syncSwapWethAddress, this.constants.usdcContractAddress, modifiedNumber, 500, 0]);
                amountOutMin = Math.floor(parseInt(getAmountOutMin[0]._hex.toString()) * 0.95)

                swapData = [router.interface.encodeFunctionData('exactInputSingle', [[
                    this.constants.syncSwapWethAddress, this.constants.usdcContractAddress,
                    100,
                    wallet.address,
                    modifiedNumber,
                    amountOutMin,
                    0
                ]
                ])
                ];
                
                multicallData = router.interface.encodeFunctionData('multicall', [parseInt(maxFee.timestamp + 1200), swapData])
            }
        }
        
        return false
    }
}

module.exports = Ezkalibur