// This file is deprecated - use src/utils/dbConnect.ts instead
// Keeping for backward compatibility
import { connectDB as connectDBUtil, disconnectDB, getDBStatus, checkDBHealth } from '../utils/dbConnect';

export const connectDB = connectDBUtil;
export { disconnectDB, getDBStatus, checkDBHealth }; 