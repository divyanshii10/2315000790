import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const AUTH_ROUTE = 'http://4.224.186.213/evaluation-service/auth';
const LOGGING_ROUTE = 'http://4.224.186.213/evaluation-service/logs';

let activeToken: string | null = null;
let expirationUnix: number | null = null;

async function fetchAuthToken(): Promise<string> {
    const currentTime = Math.floor(Date.now() / 1000);
    if (activeToken && expirationUnix && expirationUnix > currentTime + 60) {
        return activeToken;
    }

    const credentials = {
        email: process.env.AFFORDMED_EMAIL,
        name: process.env.AFFORDMED_NAME,
        rollNo: process.env.AFFORDMED_ROLL_NO,
        accessCode: process.env.AFFORDMED_ACCESS_CODE,
        clientID: process.env.AFFORDMED_CLIENT_ID,
        clientSecret: process.env.AFFORDMED_CLIENT_SECRET
    };

    if (!credentials.email || !credentials.clientID) {
        throw new Error('Config missing from environment variables');
    }

    try {
        const result = await axios.post(AUTH_ROUTE, credentials);
        activeToken = result.data.access_token;
        expirationUnix = result.data.expires_in; 
        
        return activeToken as string;
    } catch (err: any) {
        throw new Error('Failed to secure auth token');
    }
}

export type ValidStack = 'backend' | 'frontend';
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export async function Log(stack: ValidStack, level: LogSeverity, moduleName: string, text: string): Promise<void> {
    try {
        const secureToken = await fetchAuthToken();

        await axios.post(
            LOGGING_ROUTE,
            {
                stack: stack.toLowerCase(),
                level: level.toLowerCase(),
                package: moduleName.toLowerCase(),
                message: text
            },
            {
                headers: {
                    Authorization: `Bearer ${secureToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log(`[${new Date().toISOString()}] [${stack.toUpperCase()}] [${level.toUpperCase()}] [${moduleName}]: ${text}`);

    } catch (e: any) {
        if (e?.response?.status === 401) {
             activeToken = null;
        }
    }
}

export default Log;
