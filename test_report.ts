import { handler } from './src/cron/report.js';
import 'dotenv/config';

handler().then(() => console.log('Done'));
