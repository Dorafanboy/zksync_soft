const SwapBase = require('./swapBase')
const {pro} = require("ccxt");
const ccxt = require("ccxt");
const ethers = require("ethers");

class Bridge extends SwapBase {
    constructor(transactionChecker, constants, connector, config, logger) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
        this.logger = logger
    }

    async use(privateKey) {
        const rpcUrl = 'https://rpc.ankr.com/eth'
        const ercProvider = new ethers.providers.JsonRpcProvider(rpcUrl)
        const wallet = new ethers.Wallet(privateKey, ercProvider)
        
        let ethBalance = await ercProvider.getBalance(wallet.address)
        let ethBalanceEra = await this.connector.provider.getBalance(wallet.address)
        
        if (Number(ethBalance) == 0 || Number(ethBalanceEra) == 0) {
            this.logger.logWithTimestamp("Использую официальный мост. \n")
        } else {
            this.logger.errorWithTimestamp(`Баланс аккаунта ERC-20 ${wallet.address} больше нуля`)
            return false
        }

        let okxOptions = {
            'apiKey': this.config.okxApiKey,
            'secret': this.config.okxApiSecret,
            'password': this.config.okxApiPassword,
            'enableRateLimit': true,
        };

        let zksyncBridgeContract = new ethers.Contract(this.constants.zksyncBridgeAddress, 
            this.constants.zkSyncBridgeAbi, ercProvider)

        const signer = await zksyncBridgeContract.connect(wallet)

        let exchange = new ccxt.okx(okxOptions);

        const chainName = 'ETH-ERC20';
        let randomFixed = Math.random() * (6 - 4) + 4;
        const amount = (Math.random() * parseFloat(this.config.bridgeEthAmount[1] - this.config.bridgeEthAmount[0])
            + parseFloat(this.config.bridgeEthAmount[0])).toFixed(randomFixed);

        try {
            if (Number(ethBalance) == 0) {
                this.logger.logWithTimestamp(`Произвожу вывод из OKX в сеть ERC-20 по адресу ${wallet.address}`)
                let response = await exchange.withdraw('ETH', amount, wallet.address, {
                    toAddress: wallet.address,
                    chainName: chainName,
                    dest: 4,
                    fee: this.config.okxErc20NetFee,
                    pwd: '-',
                    amt: amount,
                    network: 'ERC20'
                });

                this.logger.logWithTimestamp(`Withdraw from okx ${amount} ETH to address ${wallet.address}`)

                this.connector.addMessageToBot(`✅ OKX:withdraw ${amount} ETH`)
                await this.transactionChecker.delay(this.config.minDelayAfterWithdrawOkx, this.config.maxDelayAfterWithdrawOkx)
            }

            const factor = (Math.random() * (this.config.ramainderEthBalance[1] - this.config.ramainderEthBalance[0])
                + this.config.ramainderEthBalance[0]).toFixed(3);

            let result = Math.round(amount * 1e18 * factor)

            let gwei = await this.transactionChecker.getGwei()

            while (gwei > this.config.maxBridgeGwei) {
                this.logger.logWithTimestamp(`Газ высокий для оф моста: ${gwei} gwei`)
                await this.transactionChecker.delay(0.3, 0.5)

                gwei = await this.transactionChecker.getGwei()
            }

            let nonce = await ercProvider.getTransactionCount(wallet.address)
            let feeData = await ercProvider.getFeeData()
            
            let gasPrice = await ercProvider.getGasPrice()

            const min = 740000;
            const max = 790000;

            const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
            
            let l2GasLimit = await zksyncBridgeContract.functions.l2TransactionBaseCost(gasPrice.toNumber(), gasLimit, 800)
            
            let res = Number(result) + Number(l2GasLimit)
            
            let args = {
                from: wallet.address,
                nonce: nonce,
                value: ethers.BigNumber.from(res.toString()),
                maxFeePerGas: Math.floor(feeData.maxFeePerGas.toString() * 0.7).toString(),
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toString(),
                gasLimit: 149293,
            }

            const estimatedFee = ethers.utils.formatEther(gasPrice.mul(args.gasLimit))

            const feeResult = Math.floor(estimatedFee.toString() * 1e18)
            
            let tx = await signer.requestL2Transaction(wallet.address, ethers.BigNumber.from(result.toString()), '0x', gasLimit, 800, [], wallet.address, args)

            this.logger.logWithTimestamp(`Official bridge. Транзакция отправлена. Хэш транзакции https://etherscan.io/tx/${tx.hash} ${parseFloat(result / 1e18).toFixed(10)} ETH`)

            this.connector.addMessageToBot(`✅OfBridge: bridge ${parseFloat(result / 1e18)} ETH`)

            await this.transactionChecker.delay(this.config.delayAfterBridge[0], this.config.delayAfterBridge[1])
            
            return true
        } catch (error) {
            this.logger.errorWithTimestamp(`OfBridge. Произошла ошибка: ${error}`)
            return false
        }

        return true
    }
}

module.exports = Bridge