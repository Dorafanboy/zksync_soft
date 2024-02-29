let ccxt = require ('ccxt')
const ethers = require("ethers");

class Okx {
    constructor(config, connector, logger) {
        this.config = config
        this.connector = connector
        this.logger = logger
    }
    
    async withdrawAmount(wallet) {
        let ethBalance = await this.connector.provider.getBalance(wallet.address)

        if (ethBalance.toString() > Math.floor(1e18 * 0.01)) {
            this.logger.logWithTimestamp(`Произвожу вывод с OKX в сеть ZkSync Era`)
            let okxOptions = {
                'apiKey': this.config.okxApiKey,
                'secret': this.config.okxApiSecret,
                'password': this.config.okxApiPassword,
                'enableRateLimit': true,
            };

            let exchange = new ccxt.okx(okxOptions);

            const chainName = 'ETH-zkSync Era';
            let randomFixed = Math.random() * (6 - 4) + 4;
            const amount = (Math.random() * parseFloat(this.config.maxOkxWithdrawEth - this.config.minOkxWithdrawEth)
                + parseFloat(this.config.minOkxWithdrawEth)).toFixed(randomFixed);

            try {
                let response = await exchange.withdraw('ETH', amount, wallet.address, {
                    toAddress: wallet.address,
                    chainName: chainName,
                    dest: 4,
                    fee: this.config.okxZkSyncFee,
                    pwd: '-',
                    amt: amount,
                    network: 'zkSync Era'
                });
                
                this.logger.logWithTimestamp(`Withdraw from okx ${amount} ETH to address ${wallet.address}`)

                this.connector.addMessageToBot(`✅OKX:withdraw ${amount} ETH`)
            } catch (error) {
                this.logger.errorWithTimestamp(`OKX error ${error}`);
            }
            
            return true
        }
        
        return false
    }
    
    async returnAmount(wallet, toAddress) {
        let balance = await this.connector.provider.getBalance(wallet.address)
        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let feeData = await this.connector.provider.getFeeData()
        let swapAmount = Math.random() * (this.config.maxEthSwapValue - this.config.minEthSwapValue)
            + parseFloat(this.config.minEthSwapValue)
        let value = Math.floor(swapAmount * 1e18)
        
        const response = await wallet.sendTransaction({
            to: toAddress,
            from: wallet.address,
            value:  value.toString(),
            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
            maxPriorityFeePerGas: feeData.gasPrice.toString(),
            nonce: nonce,
        });
        
        this.logger.logWithTimestamp(`Return to okx ${parseFloat(Math.floor(value) / 1e18).toFixed(8)} ETH from address ${wallet.address}`)

        const url = `https://explorer.zksync.io/tx/${response.hash}`
        this.connector.addMessageToBot(`✅OKX: return ${parseFloat(Math.floor(value) / 1e18).toFixed(8)} ETH <a href="${url}">link</a>`)
    }
}

module.exports = Okx