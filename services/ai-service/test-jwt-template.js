// Test script for Clerk JWT template verification
require("dotenv").config();
const { Clerk } = require("@clerk/clerk-sdk-node");
const jwt = require("jsonwebtoken");

// Log the environment variables (without sensitive values)
console.log("Environment check:");
console.log(
  "- CLERK_SECRET_KEY:",
  process.env.CLERK_SECRET_KEY ? "Set" : "Not set"
);
console.log("- JWT_SECRET:", process.env.JWT_SECRET ? "Set" : "Not set");

// Initialize Clerk client
if (!process.env.CLERK_SECRET_KEY) {
  console.error("CLERK_SECRET_KEY is not defined in environment variables");
  process.exit(1);
}

const clerk = new Clerk({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Function to test JWT template verification
async function testJwtTemplateVerification() {
  try {
    console.log("Testing JWT verification with different algorithms");

    // Skip Clerk JWT templates test since the API might not be available
    console.log(
      "Skipping Clerk JWT templates test - focusing on algorithm issue"
    );

    // Test direct token verification with Clerk
    try {
      console.log("\nTesting direct token verification with Clerk:");

      // Create a test JWT token using jsonwebtoken
      const testToken = jwt.sign(
        {
          sub: "test-user-123",
          userId: "test-user-123",
          role: "service",
        },
        "test-secret",
        {
          algorithm: "HS256",
          expiresIn: "1h",
        }
      );

      console.log("Created test JWT token with HS256 algorithm");

      try {
        // This will likely fail since we're not using the correct Clerk secret
        // But it helps us test the error handling
        const verified = await clerk.verifyToken(testToken);
        console.log(
          "Successfully verified test token with Clerk (unexpected):"
        );
        console.log(JSON.stringify(verified, null, 2));
      } catch (verifyError) {
        console.log("Expected error verifying test token with Clerk:");
        console.log(`- Error type: ${verifyError.name}`);
        console.log(`- Error message: ${verifyError.message}`);
        console.log(`- Error reason: ${verifyError.reason || "none"}`);
      }
    } catch (clerkError) {
      console.error("Error in Clerk verification test:", clerkError);
    }

    // Test legacy JWT verification
    if (process.env.JWT_SECRET) {
      console.log("\nTesting legacy JWT verification:");

      // Test with default algorithm (HS256)
      const legacyToken = jwt.sign(
        { userId: "legacy-user-123", role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      console.log("Legacy JWT token created with default algorithm (HS256)");

      try {
        const decoded = jwt.verify(legacyToken, process.env.JWT_SECRET);
        console.log("Successfully verified legacy JWT token:");
        console.log(JSON.stringify(decoded, null, 2));
      } catch (legacyError) {
        console.error("Error verifying legacy JWT token:", legacyError);
      }

      // Test with explicit algorithm (HS256)
      const legacyTokenWithAlg = jwt.sign(
        { userId: "legacy-user-456", role: "admin" },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
          algorithm: "HS256",
        }
      );

      console.log("\nLegacy JWT token created with explicit algorithm (HS256)");

      try {
        const decodedWithAlg = jwt.verify(
          legacyTokenWithAlg,
          process.env.JWT_SECRET
        );
        console.log(
          "Successfully verified legacy JWT token with explicit algorithm:"
        );
        console.log(JSON.stringify(decodedWithAlg, null, 2));
      } catch (legacyAlgError) {
        console.error(
          "Error verifying legacy JWT token with explicit algorithm:",
          legacyAlgError
        );
      }

      // Test with different algorithm (HS512) - this might cause the "invalid algorithm" error
      try {
        console.log(
          "\nTesting with HS512 algorithm (might cause 'invalid algorithm' error):"
        );
        const legacyTokenHS512 = jwt.sign(
          { userId: "legacy-user-789", role: "admin" },
          process.env.JWT_SECRET,
          {
            expiresIn: "1h",
            algorithm: "HS512",
          }
        );

        console.log("Legacy JWT token created with HS512 algorithm");

        try {
          const decodedHS512 = jwt.verify(
            legacyTokenHS512,
            process.env.JWT_SECRET
          );
          console.log("Successfully verified HS512 JWT token:");
          console.log(JSON.stringify(decodedHS512, null, 2));
        } catch (hs512Error) {
          console.error("Error verifying HS512 JWT token:", hs512Error);
        }

        // Try to verify with explicit algorithm (this should work)
        try {
          console.log(
            "\nVerifying HS512 token with explicit algorithm parameter:"
          );
          const decodedHS512WithAlg = jwt.verify(
            legacyTokenHS512,
            process.env.JWT_SECRET,
            { algorithms: ["HS512"] }
          );
          console.log(
            "Successfully verified HS512 JWT token with explicit algorithm parameter:"
          );
          console.log(JSON.stringify(decodedHS512WithAlg, null, 2));
        } catch (hs512AlgError) {
          console.error(
            "Error verifying HS512 JWT token with explicit algorithm parameter:",
            hs512AlgError
          );
        }

        // Try to verify with wrong algorithm (this should fail)
        try {
          console.log(
            "\nVerifying HS512 token with wrong algorithm parameter (HS256):"
          );
          const decodedHS512WithWrongAlg = jwt.verify(
            legacyTokenHS512,
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
          );
          console.log(
            "Successfully verified HS512 JWT token with wrong algorithm parameter (unexpected):"
          );
          console.log(JSON.stringify(decodedHS512WithWrongAlg, null, 2));
        } catch (hs512WrongAlgError) {
          console.error(
            "Error verifying HS512 JWT token with wrong algorithm parameter:",
            hs512WrongAlgError
          );
        }
      } catch (createHS512Error) {
        console.error("Error creating HS512 JWT token:", createHS512Error);
      }
    } else {
      console.log("\nSkipping legacy JWT test: JWT_SECRET not defined");
    }
  } catch (error) {
    console.error("Error testing JWT template verification:", error);
  }
}

// Run the test
testJwtTemplateVerification();
