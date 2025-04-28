// services/quiz-service/verify-table.js
require('dotenv').config();
const db = require('./db');

async function verifyTable() {
    try {
        console.log('Verifying usage_limits table exists...');
        const { rows } = await db.query('SELECT * FROM information_schema.tables WHERE table_name = $1', ['usage_limits']);
        console.log('Table exists:', rows.length > 0);
        
        if (rows.length > 0) {
            console.log('Table structure:');
            const { rows: columns } = await db.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1', ['usage_limits']);
            columns.forEach(col => {
                console.log(`- ${col.column_name}: ${col.data_type}`);
            });
        }
    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        process.exit();
    }
}

verifyTable();
