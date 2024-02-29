const path =require("path") 
const fs = require('fs');

const stateFilePath = path.join('state.json');

class Database {
    constructor() {}
    
    saveData(state) {
        fs.writeFileSync(stateFilePath, JSON.stringify({ ...state }, null, 2));
    }

    loadState() {
        if (fs.existsSync(stateFilePath)) {
            const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
            return state;
        } else {
            return { index: 0, remainingModules: 0 };
        }
    }
}

module.exports = Database