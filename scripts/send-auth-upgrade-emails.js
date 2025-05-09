// scripts/send-auth-upgrade-emails.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configure email transporter
// Note: Replace these with your actual email service credentials
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.example.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@example.com',
    pass: process.env.EMAIL_PASSWORD || 'your-password',
  },
});

// Read email template
const emailTemplatePath = path.join(__dirname, '..', 'email-templates', 'auth-system-upgrade.html');
const emailTemplate = fs.readFileSync(emailTemplatePath, 'utf8');

// Function to send email to a user
async function sendEmailToUser(user) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"LearnBridge Team" <noreply@learnbridgedu.com>',
      to: user.email,
      subject: 'Important: Action Required for Your LearnBridge Account',
      html: emailTemplate,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${user.email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Error sending email to ${user.email}:`, error);
    return false;
  }
}

// Main function to send emails to all users
async function sendEmailsToAllUsers() {
  try {
    console.log('Starting to send auth upgrade emails to all users...');
    
    // Get all users from Supabase
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, first_name, surname, clerk_id')
      .order('id');
    
    if (error) {
      throw error;
    }
    
    console.log(`Found ${users.length} users to email`);
    
    // Process users in batches to avoid overwhelming the email service
    const batchSize = 10;
    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      details: [],
    };

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} (${batch.length} users)`);

      // Process each user in the batch
      for (const user of batch) {
        // Skip users who don't have a Clerk ID (they haven't been migrated)
        if (!user.clerk_id) {
          console.log(`User ${user.id} (${user.email}) doesn't have a Clerk ID. Skipping.`);
          results.details.push({
            userId: user.id,
            email: user.email,
            status: 'skipped',
            message: 'User does not have a Clerk ID',
          });
          continue;
        }

        // Send email to user
        const emailSent = await sendEmailToUser(user);

        if (emailSent) {
          results.success++;
          results.details.push({
            userId: user.id,
            email: user.email,
            status: 'success',
            message: 'Email sent successfully',
          });
        } else {
          results.failed++;
          results.details.push({
            userId: user.id,
            email: user.email,
            status: 'failed',
            message: 'Failed to send email',
          });
        }
      }

      // Add a small delay between batches to avoid rate limits
      if (i + batchSize < users.length) {
        console.log('Waiting 5 seconds before processing next batch...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log('Email sending completed!');
    console.log(`Total users: ${results.total}`);
    console.log(`Successfully sent: ${results.success}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Skipped: ${results.total - results.success - results.failed}`);

    // Write results to a log file
    fs.writeFileSync(
      `email-results-${new Date().toISOString().replace(/:/g, '-')}.json`,
      JSON.stringify(results, null, 2)
    );

    return results;
  } catch (error) {
    console.error('Error sending emails:', error);
    throw error;
  }
}

// Run the email sending if this script is executed directly
if (require.main === module) {
  sendEmailsToAllUsers()
    .then(() => {
      console.log('Email sending script completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Email sending script failed:', error);
      process.exit(1);
    });
}

module.exports = { sendEmailsToAllUsers };
