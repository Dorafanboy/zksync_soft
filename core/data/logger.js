﻿class Logger {
    logWithTimestamp(message) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timestamp = `[${hours}:${minutes}:${seconds}]`;
        console.log(`${timestamp} ${message}`);
    }

    errorWithTimestamp(message) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timestamp = `[${hours}:${minutes}:${seconds}]`;
        console.error(`${timestamp} ERROR: ${message}`);
    }
}

module.exports = Logger