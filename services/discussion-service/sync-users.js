// Script to sync users from Clerk to the discussion service
require('dotenv').config();
const axios = require('axios');

// Configuration
const DISCUSSION_SERVICE_URL = process.env.DISCUSSION_SERVICE_URL || 'http://localhost:3007';
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

// Batch size for processing users
const BATCH_SIZE = 50;

async function syncUsers() {
  try {
    console.log('Starting user synchronization from Clerk...');
    
    // Get auth token
    if (!CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY is required for authentication');
    }
    
    // Fetch users from Clerk
    console.log('Fetching users from Clerk...');
    const clerkUsers = await fetchClerkUsers();
    console.log(`Found ${clerkUsers.length} users in Clerk`);
    
    // Process users in batches
    const totalBatches = Math.ceil(clerkUsers.length / BATCH_SIZE);
    console.log(`Processing users in ${totalBatches} batches of ${BATCH_SIZE}...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < totalBatches; i++) {
      const start = i * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, clerkUsers.length);
      const batch = clerkUsers.slice(start, end);
      
      console.log(`Processing batch ${i + 1}/${totalBatches} (${batch.length} users)...`);
      
      try {
        // Transform Clerk users to our format
        const formattedUsers = batch.map(user => {
          const firstName = user.firstName || '';
          const lastName = user.lastName || '';
          
          return {
            id: user.id,
            first_name: firstName,
            last_name: lastName,
            email: user.emailAddresses[0]?.emailAddress || null,
            avatar_url: user.imageUrl || null,
            role: user.publicMetadata?.role || 'student'
          };
        });
        
        // Send users to discussion service
        const response = await axios.post(`${DISCUSSION_SERVICE_URL}/api/users/bulk`, {
          users: formattedUsers
        });
        
        successCount += response.data.count || 0;
        console.log(`Batch ${i + 1} completed: ${response.data.count} users processed`);
      } catch (batchError) {
        console.error(`Error processing batch ${i + 1}:`, batchError.message);
        errorCount += batch.length;
      }
    }
    
    console.log('User synchronization completed:');
    console.log(`- ${successCount} users successfully synchronized`);
    console.log(`- ${errorCount} users failed to synchronize`);
    
  } catch (error) {
    console.error('Error during user synchronization:', error.message);
    process.exit(1);
  }
}

async function fetchClerkUsers() {
  try {
    const { Clerk } = require('@clerk/clerk-sdk-node');
    
    const clerk = new Clerk({ secretKey: CLERK_SECRET_KEY });
    const users = await clerk.users.getUserList();
    
    return users;
  } catch (error) {
    console.error('Error fetching users from Clerk:', error.message);
    throw error;
  }
}

// Run the sync
syncUsers()
  .then(() => {
    console.log('Sync process completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Sync process failed:', err);
    process.exit(1);
  });
