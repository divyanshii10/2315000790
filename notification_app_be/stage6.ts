import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';
import { Log } from 'logging_middleware';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const AUTH_ENDPOINT = 'http://4.224.186.213/evaluation-service/auth';
const NOTIF_ENDPOINT = 'http://4.224.186.213/evaluation-service/notifications';

interface CampusNotif {
    ID: string;
    Type: 'Placement' | 'Result' | 'Event';
    Message: string;
    Timestamp: string;
}

async function requestBearerToken(): Promise<string> {
    const credentials = {
        email: process.env.AFFORDMED_EMAIL,
        name: process.env.AFFORDMED_NAME,
        rollNo: process.env.AFFORDMED_ROLL_NO,
        accessCode: process.env.AFFORDMED_ACCESS_CODE,
        clientID: process.env.AFFORDMED_CLIENT_ID,
        clientSecret: process.env.AFFORDMED_CLIENT_SECRET
    };

    if (!credentials.email || !credentials.clientID) {
        throw new Error('Environment variables are missing.');
    }

    const res = await axios.post(AUTH_ENDPOINT, credentials);
    return res.data.access_token;
}

async function pullRemoteNotifications(token: string): Promise<CampusNotif[]> {
    const res = await axios.get(NOTIF_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.data.notifications || [];
}

const CATEGORY_SCORES: Record<string, number> = {
    'Placement': 3,
    'Result': 2,
    'Event': 1
};

function extractTopPriority(items: CampusNotif[], limit: number = 10): CampusNotif[] {
    const copiedItems = [...items];
    
    copiedItems.sort((first, second) => {
        const score1 = CATEGORY_SCORES[first.Type] || 0;
        const score2 = CATEGORY_SCORES[second.Type] || 0;

        if (score1 !== score2) {
            return score2 - score1; 
        }

        const date1 = new Date(first.Timestamp).getTime();
        const date2 = new Date(second.Timestamp).getTime();
        
        return date2 - date1;
    });

    return copiedItems.slice(0, limit);
}

async function executeScheduler() {
    try {
        await Log('backend', 'info', 'service', 'Initiating priority notification worker');
        
        const bearer = await requestBearerToken();
        await Log('backend', 'debug', 'auth', 'Acquired valid authentication token');

        const rawData = await pullRemoteNotifications(bearer);
        await Log('backend', 'info', 'api', `Successfully pulled ${rawData.length} records`);

        const refinedList = extractTopPriority(rawData, 10);

        for (let i = 0; i < refinedList.length; i++) {
            const item = refinedList[i];
            console.log(`${i + 1}. [${item.Type}] (Score: ${CATEGORY_SCORES[item.Type]}) -> ${item.Message}`);
            console.log(`   Generated: ${item.Timestamp}`);
            console.log(`   Trace ID: ${item.ID}\n`);
        }

        await Log('backend', 'info', 'service', 'Priority inbox calculation finished');

    } catch (err: any) {
        console.error(err?.response?.data || err.message);
        await Log('backend', 'error', 'service', `Worker encountered an issue`);
    }
}

executeScheduler();
