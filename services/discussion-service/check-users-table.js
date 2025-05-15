// Check the structure of the users table
require('dotenv').config();
const { Pool } = require('pg');

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkUsersTable() {
  const client = await pool.connect();
  
  try {
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    console.log(`Users table exists: ${tableExists}`);
    
    if (tableExists) {
      // Get column information
      const columnInfo = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        ORDER BY ordinal_position;
      `);
      
      console.log('Users table columns:');
      columnInfo.rows.forEach(col => {
        console.log(`- ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not nullable'})`);
      });
    }
  } catch (err) {
    console.error('Error checking users table:', err);
  } finally {
    client.release();
  }
}

// Run the check
checkUsersTable()
  .then(() => {
    console.log('Check completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Check failed:', err);
    process.exit(1);
  });
