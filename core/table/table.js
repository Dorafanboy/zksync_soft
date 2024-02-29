const Excel= require("exceljs")

class Table {
    workbook
    worksheet
    
    constructor(constants, connector) {
        this.constants = constants
        this.connector = connector
        this.isCreated = false
    }

    async updateTable(address){
        let balance= 
            Number(await this.connector.provider.getBalance(address)) / Number(BigInt(1000000000000000000))

        if (this.isCreated === false) {
            this.workbook = new Excel.Workbook()
            this.worksheet = this.workbook.addWorksheet('Кол-во токенов')

            this.worksheet.columns = [
                { header: 'Адреc', key: 'address', width: 45, style: { alignment: { horizontal: 'left' } } },
                { header: 'Баланс ETH', key: 'eth', width: 20, style: { alignment: { horizontal: 'left' } } },
                { header: 'Баланс USDC', key: 'usdc', width: 20, style: { alignment: { horizontal: 'left' } } },
                { header: 'Баланс USDT', key: 'usdt', width: 20, style: { alignment: { horizontal: 'left' } } },
            ]

            this.isCreated = true
        }

        const usdcContract= 
            this.connector.createContractConnection(this.constants.usdcContractAddress, this.constants.usdcAbi)
        const usdtContract= 
            this.connector.createContractConnection(this.constants.usdtContractAddress, this.constants.usdtAbi)

        const balanceUsdc = await usdcContract.balanceOf(address)
        const balanceUsdt = await usdtContract.balanceOf(address)

        this.worksheet.addRow({ address: address, eth: balance, usdc: Number(balanceUsdc) / Number(1000000),
            usdt: Number(balanceUsdt) / Number(1000000) })

        await this.workbook.xlsx.writeFile('Баланс кошельков ZkSync.xlsx')
    }
}

module.exports = Table