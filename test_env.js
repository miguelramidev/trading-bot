import 'dotenv/config';

console.log("SECRET LENGTH:", process.env.BINANCE_API_SECRET?.length);
console.log("INCLUDES BACKSLASH N:", process.env.BINANCE_API_SECRET?.includes("\\n"));
