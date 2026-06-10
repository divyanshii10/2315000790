const axios = require('axios');
const fs = require('fs');

async function register(mobileNo) {
    try {
        console.log("Attempting to register with test server...");
        const response = await axios.post('http://4.224.186.213/evaluation-service/register', {
            email: "divyanshi.kulshrestha_cs23@gla.ac.in",
            name: "Divyanshi Kulshrestha",
            mobileNo: mobileNo,
            githubUsername: "divyanshii10",
            rollNo: "2315000790",
            accessCode: "RPsgYt"
        });

        console.log("Registration Successful!");

        const { clientID, clientSecret } = response.data;

        const envContent = `AFFORDMED_EMAIL=divyanshi.kulshrestha_cs23@gla.ac.in
AFFORDMED_NAME=Divyanshi Kulshrestha
AFFORDMED_ROLL_NO=2315000790
AFFORDMED_ACCESS_CODE=RPsgYt
AFFORDMED_CLIENT_ID=${clientID}
AFFORDMED_CLIENT_SECRET=${clientSecret}
`;
        fs.writeFileSync('.env', envContent);
        console.log(".env file created successfully with your Client ID and Client Secret!");

    } catch (error) {
        console.error("Registration failed:", error?.response?.data || error.message);
        if (error?.response?.data?.message?.includes('already')) {
            console.log("\nIf you ALREADY registered before, you cannot retrieve the ID/Secret again easily. Please let me know if this is the case.");
        }
    }
}

const mobileNo = process.argv[2];
if (!mobileNo) {
    console.log("Please provide your mobile number.");
    console.log("Usage: node register.js <your_mobile_number>");
    process.exit(1);
}

register(mobileNo);
