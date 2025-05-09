// scripts/migrate-users-to-clerk.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { Clerk } = require("@clerk/clerk-sdk-node");

// Initialize Clerk client
const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Function to create a user in Clerk
async function createClerkUser(user) {
  try {
    // Check if user already exists in Clerk by email
    const existingUsers = await clerk.users.getUserList({
      emailAddress: user.email,
    });

    if (existingUsers.length > 0) {
      console.log(
        `User with email ${user.email} already exists in Clerk. Skipping creation.`
      );
      return {
        clerkId: existingUsers[0].id,
        success: true,
        message: "User already exists in Clerk",
      };
    }

    // Create a unique username based on email and timestamp
    // Remove any invalid characters (only allow letters, numbers, underscore, and hyphen)
    const usernameBase = user.email
      .split("@")[0]
      .replace(/[^a-zA-Z0-9_-]/g, "");
    const username = usernameBase + Date.now().toString().slice(-6);

    // Create user in Clerk using the Admin API approach
    // This is based on the Clerk documentation
    const clerkUser = await clerk.users.createUser({
      firstName: user.first_name || "",
      lastName: user.surname || "",
      emailAddress: [user.email],
      username: username,
      password: `Temp${Date.now()}Password!${Math.floor(
        Math.random() * 10000
      )}`,
      publicMetadata: {
        role: user.role || "student",
      },
    });

    console.log(`Created user in Clerk: ${clerkUser.id} (${user.email})`);

    return {
      clerkId: clerkUser.id,
      success: true,
      message: "User created in Clerk",
    };
  } catch (error) {
    console.error(`Error creating user in Clerk (${user.email}):`, error);
    if (error.errors && error.errors.length > 0) {
      error.errors.forEach((err) => {
        console.error(`  - ${err.message} (${err.code})`);
      });
    }
    return {
      success: false,
      message: error.message,
      error,
    };
  }
}

// Function to update user in Supabase with Clerk ID
async function updateUserWithClerkId(userId, clerkId) {
  try {
    const { data, error } = await supabase
      .from("users")
      .update({ clerk_id: clerkId })
      .eq("id", userId)
      .select("id");

    if (error) {
      throw error;
    }

    if (data && data.length === 1) {
      console.log(`Updated user ${userId} with Clerk ID ${clerkId}`);
      return true;
    } else {
      console.error(`Failed to update user ${userId} with Clerk ID ${clerkId}`);
      return false;
    }
  } catch (error) {
    console.error(`Error updating user ${userId} with Clerk ID:`, error);
    return false;
  }
}

// Main migration function
async function migrateUsers() {
  console.log("Starting user migration to Clerk...");

  try {
    // Check if clerk_id column exists in users table
    // Note: With Supabase, we'll assume the column exists or has been added via the Supabase dashboard
    // If you need to add it programmatically, you would need to use the Supabase SQL editor or API

    // Get all users from Supabase
    const { data: users, error } = await supabase.from("users").select("*");

    if (error) {
      throw error;
    }

    console.log(`Found ${users.length} users to migrate`);

    // Process users in batches to avoid rate limits
    const batchSize = 10;
    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      console.log(
        `Processing batch ${i / batchSize + 1} (${batch.length} users)`
      );

      // Process each user in the batch
      for (const user of batch) {
        // Skip users who already have a Clerk ID
        if (user.clerk_id) {
          console.log(
            `User ${user.id} (${user.email}) already has Clerk ID: ${user.clerk_id}. Skipping.`
          );
          results.skipped++;
          results.details.push({
            userId: user.id,
            email: user.email,
            status: "skipped",
            message: "User already has Clerk ID",
          });
          continue;
        }

        // Create user in Clerk
        const clerkResult = await createClerkUser(user);

        if (clerkResult.success) {
          // Update user in database with Clerk ID
          const updateResult = await updateUserWithClerkId(
            user.id,
            clerkResult.clerkId
          );

          if (updateResult) {
            results.success++;
            results.details.push({
              userId: user.id,
              email: user.email,
              clerkId: clerkResult.clerkId,
              status: "success",
              message: clerkResult.message,
            });
          } else {
            results.failed++;
            results.details.push({
              userId: user.id,
              email: user.email,
              clerkId: clerkResult.clerkId,
              status: "failed",
              message: "Failed to update user in database with Clerk ID",
            });
          }
        } else {
          results.failed++;
          results.details.push({
            userId: user.id,
            email: user.email,
            status: "failed",
            message: clerkResult.message,
          });
        }
      }

      // Add a small delay between batches to avoid rate limits
      if (i + batchSize < users.length) {
        console.log("Waiting 2 seconds before processing next batch...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log("Migration completed!");
    console.log(`Total users: ${results.total}`);
    console.log(`Successfully migrated: ${results.success}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Skipped (already had Clerk ID): ${results.skipped}`);

    // Write results to a log file
    const fs = require("fs");
    fs.writeFileSync(
      `migration-results-${new Date().toISOString().replace(/:/g, "-")}.json`,
      JSON.stringify(results, null, 2)
    );

    return results;
  } catch (error) {
    console.error("Error during migration:", error);
    throw error;
  } finally {
    // No need to close Supabase connection
    console.log("Migration process completed");
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateUsers()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = { migrateUsers };
